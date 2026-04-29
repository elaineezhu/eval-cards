# Matrix leaderboard synthesis

Drafted 2026-04-28. Migration item #6 in `notes/migration-plan.md`. **Reshape-class** — per `notes/migration-plan.md` § "Data direction", the destination is DuckDB SQL (either materialized into parquet or computed at query time), not a pipeline value-emit.

## Framing reminder

We are **refactoring for UI efficiency**, not fixing correctness. TS-as-is is the canonical spec — including its filters and tie-breakers. The deliverable here is an **operation catalog** (GROUP BY keys, aggregations, joins, PIVOT shape) rather than a rule-by-rule replication, so the pipeline-schema / SQL conversation can happen against a precise target.

## Migration item

- **Item:** #6 matrix leaderboard synthesis
- **TS location:** `lib/model-data.ts:1046-1210` (`buildSingleMetricSuiteMatrixSummary`, ~165 lines), called from `lib/model-data.ts:1570-1596` inside `getEvalSummaryById`
- **Trigger:** request to `/evals/matrix__<suite_key>` (URL-side prefix `matrix__` is matched at line 1570; `suite_key` is the `benchmark_parent_key` / `benchmark_family_key` / `benchmark` of a group of sub-evals)
- **Output:** a synthetic `BenchmarkEvalSummary` whose `leaderboard_metrics` are columns (subtasks) and `leaderboard_rows` are rows (models × score per subtask)

## Classification

- **Reshape / dedup / aggregate / pivot.** Not a value cleanup — it's a long→wide pivot over many sub-eval `model_results` rows.
- **Both materialize and query-time are viable, with a split** (see "Materialize vs query-time" below).

## Operation in SQL terms

Conceptually the operation is: **for each suite, PIVOT every (sub-eval, model) score into a model × subtask matrix, taking the most-recent submission per cell.**

In one sentence: `PIVOT scores ON subtask USING max(score) FILTER (most-recent submission per (model, subtask)) GROUP BY model`.

Pre-pivot input shape (one row per submission of a model on a sub-eval / metric):

```
suite_key, subtask_key, subtask_name, metric_summary_id, metric_key, metric_name,
model_id, model_name, developer, model_route_id,
score, retrieved_timestamp, source_metadata, source_data
```

The TS implementation is a manual pivot built from JSON: it walks each sub-eval detail, takes its sole metric's `model_results[]`, and folds each row into `rowStates: Map<modelId, {values: {[columnKey]: score}, ...}>` keyed by `model_id`. Dedup-on-`(model_id, columnKey)` happens implicitly because each later assignment overwrites the previous; the per-row "winning timestamp" is the **highest seen** across all column writes (see TS-as-spec quirk #2 below).

### Filtering rules applied before the pivot

1. **Eligibility filter on sub-evals (column gate):** keep `detail` only if `detail.metrics.length === 1` AND `extractDetailSubtasks(detail).length === 0`. In SQL: keep sub-evals that have exactly one root metric and zero subtasks of their own. Suites that contain a multi-metric or multi-subtask sub-eval **silently drop that sub-eval as a column** (no diagnostic).
2. **Suite-eligibility floor:** if fewer than 2 sub-evals survive the filter, return null (no matrix). Same floor on `matchingEvals` at the call site (line 1585: `if (matchingEvals.length < 2) return null`).
3. **Metrics-count floor:** after the loop, `if (leaderboardMetrics.length < 2) return null` (line 1158).
4. **Summary-score exclusion:** at the call site (line 1575), `entry.is_summary_score === true` rows are excluded from the candidate set entirely.

### Column derivation

```
column_key = "subtask:" || subtask_key || ":" || metric_token
```
where `subtask_key = detail.benchmark_leaf_key || slugify(detail.eval_summary_id)` and `metric_token = metric.metric_summary_id || metric.metric_key || slugify(metric.display_name)`. Column order is **alphabetical by `benchmark_leaf_name || eval_summary_id`** (line 1059-1061), not by the column_key itself.

### Row derivation

Rows are keyed by `model_id = modelResult.model_id || modelResult.model_name`. Models with neither id nor name are dropped silently (line 1118-1120).

### Cell value

`row.values[columnKey] = modelResult.score ?? null`. Last write wins per `(model_id, columnKey)` pair — but in TS the loop visits each `(detail, model_result)` tuple exactly once, and `columnKey` is unique per `detail`, so "last write" only fires when a single sub-eval contains multiple `model_results` rows for the same `model_id` (i.e. multiple submissions of the same model to the same sub-eval). When that happens, **the last one in iteration order wins**, with no explicit tie-break — see TS-as-spec quirk #1.

### Per-row timestamp & source-metadata reconciliation

For each row, three fields (`evaluation_timestamp`, `source_metadata`, `source_data`) are reconciled across all the cells written to that row. The rule: whichever cell write had the **highest `normalizeEvalTimestamp`** wins these fields (line 1149-1154). If timestamps tie, the first-seen cell keeps them (the comparison is `>=`, but the first write happens in the no-existing branch on line 1127-1142 which initializes them; later writes only overwrite if strictly greater than or equal).

## Required parquet columns (input to the SQL pivot)

The pivot needs one row per `(eval_summary_id, model_id, retrieved_timestamp)` with these fields exposed as typed columns (today they're nested in `payload_json`):

| Column | Source in TS | Used for |
|---|---|---|
| `eval_summary_id` | `detail.eval_summary_id` | filter to suite, also slug fallback |
| `benchmark_parent_key` | `entry.benchmark_parent_key` | suite routing (matched against `suite_key` from URL) |
| `benchmark_family_key` | `entry.benchmark_family_key` | suite routing fallback |
| `benchmark` | `entry.benchmark` | suite routing fallback |
| `is_summary_score` | `entry.is_summary_score` | exclude rollup rows |
| `benchmark_leaf_key` | `detail.benchmark_leaf_key` | column key |
| `benchmark_leaf_name` | `detail.benchmark_leaf_name` | column display + sort key |
| `metric_count_in_detail` | derived: `len(metrics)` | column-eligibility filter |
| `subtask_count_in_detail` | derived: `len(extractDetailSubtasks(detail))` | column-eligibility filter |
| `metric_summary_id` | `metric.metric_summary_id` | column key + metric_config |
| `metric_key` | `metric.metric_key` | column key fallback |
| `metric_name` | `metric.metric_name` | display |
| `metric_display_name` | `metric.display_name` | column key fallback (slugified) |
| `lower_is_better` | `metric.lower_is_better` | column metadata |
| `unit` | `metric.unit` | column metadata |
| `evaluation_description` | `metric.evaluation_description` | suite metric_config |
| `min_score`, `max_score`, `score_type` | `metric.metric_config.*` | suite metric_config |
| `model_id` | `result.model_id` | row key |
| `model_name` | `result.model_name` | row display + row key fallback |
| `model_route_id` | `result.model_route_id` | model linkout |
| `developer` | `result.developer` | row display |
| `score` | `result.score` | cell value |
| `retrieved_timestamp` | `result.retrieved_timestamp` | per-row reconciliation tie-breaker |
| `source_metadata` (struct) | `result.source_metadata` | per-row reconciliation winner |
| `source_data` (struct) | `detail.source_data` | per-row reconciliation winner |
| `benchmark_card` (struct) | `detail.benchmark_card` | first-seen → suite-level field |

The `(detail, metric, model_result)` triple is what TS already iterates — promoting these to flat parquet rows is the schema change.

## Sketch SQL query

DuckDB syntax. Three CTEs: (1) filter to eligible sub-evals, (2) pick winning submission per `(model, subtask)`, (3) PIVOT.

```sql
WITH suite_rows AS (
  -- Pre-pivot: one row per (sub-eval, model, submission)
  -- Suite-eligibility + column-eligibility filters live here
  SELECT
    eval_summary_id,
    benchmark_leaf_key,
    benchmark_leaf_name,
    metric_summary_id,
    metric_key,
    metric_name,
    metric_display_name,
    lower_is_better,
    unit,
    model_id,
    model_name,
    developer,
    model_route_id,
    score,
    retrieved_timestamp,
    source_metadata,
    source_data,
    -- Synthetic column key matching TS's "subtask:<subtask_key>:<metric_token>"
    'subtask:' ||
      coalesce(benchmark_leaf_key, slugify(eval_summary_id)) || ':' ||
      coalesce(metric_summary_id, metric_key, slugify(metric_display_name))
      AS column_key
  FROM eval_results_flat
  WHERE
    -- Suite routing — matches TS's normalizeBenchmarkKeyForLookup
    normalize_bench_key(coalesce(benchmark_parent_key, benchmark_family_key, benchmark)) = ?
    AND NOT is_summary_score
    -- Column eligibility: single root metric, no subtasks (TS line 1058)
    AND metric_count_in_detail = 1
    AND subtask_count_in_detail = 0
),
ranked AS (
  -- Pick the winning submission per (model, subtask) cell.
  -- TS uses "last write wins" because each (detail × model) pair is visited once
  -- in iteration order; multiple submissions to the same sub-eval by the same model
  -- collapse to whichever appears last in model_results[]. We approximate that with
  -- ROW_NUMBER ordered by retrieved_timestamp DESC; see TS-as-spec quirk #1.
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY model_id, column_key
      ORDER BY retrieved_timestamp DESC
    ) AS rn
  FROM suite_rows
  WHERE model_id IS NOT NULL OR model_name IS NOT NULL
),
winners AS (
  SELECT * FROM ranked WHERE rn = 1
)
-- The pivot. DuckDB PIVOT syntax:
PIVOT winners
  ON column_key
  USING max(score)
  GROUP BY model_id, model_name, developer, model_route_id;
```

Then a second pass over `winners` derives the per-row reconciled `evaluation_timestamp / source_metadata / source_data` (highest-timestamp cell wins) and the `metrics_present` count (count of non-null cells per row).

For the suite-level fields (`leaderboard_metrics` array, `metric_config`, `benchmark_card`, `evaluation_name`), a separate aggregation over `winners` collects the distinct columns (`SELECT DISTINCT column_key, benchmark_leaf_name, metric_name, …`) sorted by `benchmark_leaf_name`, plus a `MIN()` or first-row pick for `benchmark_card` and `metric_config`.

The "single row per model with a values map" output shape is still ergonomic to assemble TS-side from the PIVOT result; the heavy lifting (filter, dedup, pivot) is in SQL.

## Materialize vs query-time

Two natural splits, both can ship:

- **Materialize the column shape and per-cell winners.** A suite's column set is fixed by its sub-eval inventory; the per-cell winner across submissions is deterministic given the data. Both can be written into parquet at pipeline build time as a derived `matrix_<suite_key>` table (or one wide `eval_matrix` table partitioned by suite). This eliminates request-time work for the dominant case.
- **Compute the row filter at query time.** Today TS doesn't filter rows at all (every model with a `model_id` shows up). Forthcoming UI work may want consumer-driven row filters: "only show models with `models_count > N` evaluations", "only third-party submissions", "filter by developer", "top-K by mean score". Those are query-time concerns and want SQL — `WHERE` / `LIMIT` against the materialized matrix.

**Recommendation:** materialize the wide-form `(suite_key, model_id) → values map + reconciled metadata` table; expose row-filter / sort knobs as query-time SQL parameters. Recompute the materialized table on every pipeline build (cheap relative to the rest of the build); recompute on demand if a single benchmark family is added.

The column-eligibility filter (`metric_count = 1 AND subtask_count = 0`) is a build-time concern — it never varies per request. The row-filter is the only thing that should remain query-time.

## TS-as-spec quirks

These are deliberate behaviours of the current TS that the SQL replacement must preserve until a separate product call says otherwise.

1. **Cell tie-break on multiple submissions of the same model to the same sub-eval is "last in iteration order wins", with no explicit ordering of `model_results[]`.** TS line 1117 iterates `metric.model_results ?? []` directly; the order is whatever the pipeline emitted. There is no `MAX(score)` or "freshest wins" sort applied — the loop just overwrites `row.values[columnKey]` on each pass. In SQL this maps cleanly to `ROW_NUMBER() OVER (PARTITION BY model_id, column_key ORDER BY retrieved_timestamp DESC) = 1` only if the pipeline already emits `model_results[]` in retrieved_timestamp-DESC order. **Verify this assumption against the pipeline's actual emission order before flipping the SQL on.** If pipeline order is non-deterministic, the SQL will produce different cell values than TS for cells with multiple submissions — the migration must either (a) accept the divergence as a "freshest wins" upgrade, or (b) reproduce pipeline's exact array order, which is hostile.

2. **Per-row timestamp reconciliation uses `>=` not `>`.** Line 1149: `if (nextTimestamp >= existing._timestampValue)`. Combined with quirk #1, this means for a model with multiple cells at identical timestamps, the **last-written cell's** source_metadata / source_data win. The SQL replacement should pick the source_metadata of the row with the highest `MAX(retrieved_timestamp)` across all of the model's cells; ties resolve to whatever DuckDB picks (non-deterministic, but identical-timestamp ties are rare in practice).

3. **Silent column drops.** Sub-evals failing the `metric_count === 1 && subtask_count === 0` filter are excluded with no diagnostic. In production this means HELM Lite (10 sub-evals) might silently surface fewer columns than expected if any sub-eval has nested metrics. The pipeline owner should know this is "by design" until the product team weighs in.

4. **`column_key` collisions on multi-metric same-subtask are impossible by construction.** Because the eligibility filter forces `metric_count === 1` per sub-eval, each `(subtask_key, metric_token)` column is unique. If the filter is loosened later, the column_key derivation (`subtask:K:M`) is collision-safe.

5. **No row filtering applied.** Every model id encountered is rendered as a row (subject to having a `model_id` or `model_name`). Row-count for popular suites: `helm_lite` → 91 distinct models in the dominant sub-eval alone. This is fine for now; capture as a known query-time-extension point.

6. **Score of 0 vs null distinction.** `modelResult.score ?? null` — only `undefined` becomes null; numeric 0 is preserved. SQL `MAX(score)` over a single row preserves the 0; over multiple rows with one being NULL, it returns the non-null. Equivalent in this case because the dedup happens before the pivot.

7. **Timestamp normalization uses Variant A (`normalizeEvalTimestamp` from `lib/model-data.ts:76-81`),** which has its own quirks documented in `notes/transformations/07-timestamp-normalization.md` (negative-string fallback, empty-string returns 0, etc.). This is shared with the composite rollup (#5) and other model-data call sites — once #13 ships pipeline-emitted ISO 8601 timestamps, the timestamp comparison in this query becomes a plain `MAX(retrieved_timestamp)` (lexicographic on ISO strings).

8. **Suite-level metric_config takes the first eligible sub-eval's config** (line 1083-1085: `if (!metricConfig) metricConfig = ...`). If sub-evals disagree on `min_score / max_score / lower_is_better`, **the alphabetically-first sub-eval's values are used for the whole suite**. Document this; SQL's equivalent is `FIRST(metric_config ORDER BY benchmark_leaf_name)`.

9. **`benchmark_card` takes the first sub-eval that has one** (line 1087-1089: `if (!benchmarkCard && detail.benchmark_card) benchmarkCard = ...`). Same pattern as #8.

10. **Cross-row `sharedMetricName`** is set only if every sub-eval reports the same `metric_name` (line 1162). When metrics differ across sub-evals, the suite-level `evaluation_description` falls back to the first sub-eval's metric description, but the suite is still rendered. SQL: `MIN(metric_name) FILTER (WHERE metric_name IS NOT NULL)` only when `COUNT(DISTINCT metric_name) = 1`, else null.

## Cross-item dependencies

- **#13 timestamp normalization** — the `MAX(retrieved_timestamp)` per `(model, subtask)` only works correctly once timestamps are in a comparable canonical form. Until pipeline emits ISO 8601, this query depends on Variant A's seconds-vs-ms quirks. Ship #13 first.
- **#5 composite rollup** — sibling reshape that walks the same `details[]` set. The two should share the parquet schema (a flat `eval_results_flat` row table). Spec'd separately but coordinate.
- **#11 benchmark-card attachment** — the matrix synthesis result is wrapped in `attachBenchmarkCardToSummary()` after build (line 1595). That join is a separate item; the matrix spec assumes it runs as-is.
- **#1 identity canonicalization** — the matrix uses `model_id` as the row key. If pipeline-side identity canonicalization changes any model ids, matrix rows that previously merged will split (or vice versa). Migration order: ship #1 first, then re-run snapshot.
- **#8 benchmark display names** — the suite-level `evaluation_name = getBenchmarkDisplayName(suiteKey)` depends on the BENCHMARK_NAMES map. Once #8 ships pipeline-emitted display names, replace inline.

## Scope (informs "happens on every page view" framing)

Audited 2026-04-28 against `.cache/hf-data/eval-list-lite.json`:

- **587** total eval-list rows; **34** distinct parent buckets (`benchmark_parent_key || benchmark_family_key || benchmark`).
- **13** matrix-eligible buckets (≥2 sub-evals after `is_summary_score` exclusion). Each one fires `buildSingleMetricSuiteMatrixSummary` exactly once per `/evals/matrix__<suite_key>` request.
- Sub-eval count per matrix request:
  - **median 6**, **mean 43.5**, **max 471** (`llm_stats`), **min 2** (`reward_bench`).
  - Other notable suites: `artificial_analysis_llms` (21), `helm_classic` (15), `helm_lite` (10), `swe_polybench` (8), `helm_instruct` (7), `hfopenllm_v2` / `helm_safety` / `helm_capabilities` / `multi_swe_bench` (6).
- Each sub-eval detail file carries one metric with up to ~91 `model_results` (sampled `helm_lite_*`).

**Per-request work today:** for `helm_lite`, one matrix render fetches 10 detail files (up to ~10 KB each from cache) and walks ~10 × ~91 = ~910 (detail, model_result) tuples in TS. For `llm_stats`, that's 471 detail fetches and tens of thousands of tuples — every page view. SQL materialization eliminates this entirely; query-time SQL with row filters bounds it.

## Migration checklist

- [x] Spec written (TS-as-is, including quirks)
- [ ] Snapshot test for `buildSingleMetricSuiteMatrixSummary` against curated detail set (Tier B; gate for SQL replacement — see `notes/testing-strategy.md` § "Reshape-class items: testing addendum")
- [ ] Pipeline-schema decision: promote `(eval_summary_id, model_id, metric, retrieved_timestamp)` to typed parquet columns for the matrix input set
- [ ] SQL implementation in `lib/duckdb-data.ts` (or pipeline-side materialized view) reproducing the pivot
- [ ] Parity gate: TS-vs-SQL diff zero across all 13 matrix-eligible suites
- [ ] TS deleted: `buildSingleMetricSuiteMatrixSummary` (lines 1046-1210), call site collapsed to `getEvalSummaryById` reading the materialized matrix or invoking the SQL

## Future product decision (deferred)

- Whether silent column drops (TS-as-spec quirk #3) should surface a UI affordance ("3 sub-evals omitted because they have nested metrics").
- Whether row filtering should be exposed as a UI knob (developer / source_type / models_count threshold) — quirk #5.
- Whether suite-level `metric_config` should be a hard error when sub-evals disagree, rather than alphabetically-first-wins (quirk #8).
- Whether to replace "last-write-wins on duplicate submissions" with explicit "freshest-timestamp wins" (quirk #1) — likely a no-op in production but a real semantic upgrade.
