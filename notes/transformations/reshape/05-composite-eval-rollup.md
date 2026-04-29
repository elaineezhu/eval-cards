# Composite eval rollup

Drafted 2026-04-28. Migration item #5 in `notes/migration-plan.md`. Reshape-class operation catalog (not a rule-table replication). See `notes/transformations/README.md` § "Where it belongs: cleaning vs reshape" and `notes/migration-plan.md` § "Data direction" for the framing this spec follows.

## Framing reminder

This is a **reshape** item, not a cleaning item. The output captures the *operation* (group-by keys, aggregation, ordering) so the parquet-schema + SQL conversation can happen. We are not line-by-line porting `aggregateBenchmarkSummaries` into Python; we're describing what the SQL needs to compute. TS-as-is is the spec for behaviour — including the score-normalization-then-average choice — but the implementation target is SQL or pre-materialized parquet, not a TS-shaped Python function.

## Migration item

- **Item:** #5 — composite eval rollup (`/evals/aggregate__<suite_key>` route).
- **TS implementation:** `lib/model-data.ts:877-1044` (`aggregateBenchmarkSummaries`, ~168 lines).
- **Trigger / call site:** `lib/model-data.ts:1543-1568` (`getEvalSummaryById`, the `evalId.startsWith("aggregate__")` branch). Fired by the route handler at `app/evals/[id]/page.tsx` whenever the URL is `/evals/aggregate__<suite_key>`.
- **Per-request cost (today):** for an aggregate URL, TS calls `fetchHFEvalDetail(eval_summary_id)` once per sub-eval (lines 1558-1563 do `Promise.all(matchingEvals.map(...))`). Typical composite is **2-21 sub-evals** (per `eval-hierarchy.json`: `reward_bench` 2, `livecodebenchpro` 3, `fibble_arena` 5, `helm_capabilities` 6, `helm_safety` 6, `multi_swe_bench` 6, `helm_lite` 10, `helm_classic` 15, `artificial_analysis_llms` 21). One outlier family `llm_stats` has 471 sub-evals. Each sub-eval detail file is the fully-expanded per-model results blob. This happens at request time, on every page view, with no caching beyond the underlying `fetchHFEvalDetail` LRU.
- **Aggregate URL → suite_key:** strip the `aggregate__` prefix; the remainder is matched against `eval-hierarchy.json` family keys via `e.benchmark.toLowerCase().replace(/[-.\s]+/g, "_").replace(/^_+|_+$/g, "")` to find sub-evals (`lib/model-data.ts:1550-1552`).

## Operation in SQL terms

For a given `suite_key` (composite), produce one row per `(suite_key, model_id)` containing:

1. The per-model average of normalized sub-eval scores (`AVG(normalize(score, min_score, max_score))` across the suite's sub-evals).
2. Latest evaluation timestamp + source metadata across that model's components (winner of `MAX(retrieved_timestamp)` is "latest component"; its `source_metadata`, `source_data`, `result.*` are inherited).
3. A pre-rolled `aggregate_components[]` list of the per-sub-eval contributions (raw score, normalized score, source attribution) used by `eval-detail.tsx` to render the per-row drill-down.

Then, suite-level rollups on top of those per-model rows:

4. `models_count = COUNT(DISTINCT model_id)`.
5. `avg_score = AVG(per_model_avg_normalized_score)` (avg-of-avgs; see TS quirk #2 below).
6. `best_model` / `worst_model` = first / last after sorting by `avg_score_normalized` (DESC if `lower_is_better=false`, ASC if true). The sort key is the lower-cased single-metric direction taken from the **first sub-eval's** `metric_config.lower_is_better` (TS quirk #4).
7. `evaluator_names = sorted DISTINCT UNION` of every sub-eval's `evaluator_names`.
8. `source_types = sorted DISTINCT UNION` of every sub-eval's `source_types`.
9. `third_party_ratio = SUM(third_party result rows) / SUM(all underlying result rows)` across all sub-evals' `model_results` arrays (computed pre-rollup, over raw rows — not over the rolled-up models).
10. `missing_generation_config_count = SUM(...)` across sub-evals.
11. `latest_source_name`: when there's exactly one sub-eval, copy its name; when there are multiple, the literal string `"Multiple sources"` (TS quirk #5).
12. A `metric_config` synthesized from the first sub-eval's metric_config but with `min_score=0`, `max_score=1`, `unit="normalized average"`, and `evaluation_description = "Average normalized score across <list of sub-eval names sorted A-Z>"` when more than one source.

Steps 4-12 are scalar/vector reductions over the result of steps 1-3.

## Required parquet columns

To do this in SQL, the pipeline needs (a) a relational result table and (b) a relational composite-membership table:

### Table A: `result_rows` (one row per (eval_summary_id, model_id, variant, retrieved_timestamp))

Existing logical fields, promoted from `payload_json`:

| Column | Type | Source |
|---|---|---|
| `eval_summary_id` | VARCHAR | already in metadata column |
| `model_id` | VARCHAR | currently nested in `model_results[].model_info.id` |
| `score` | DOUBLE | currently nested in `model_results[].score` |
| `retrieved_timestamp` | TIMESTAMP (ISO) | nested; see reshape spec #07 for canonicalization |
| `evaluator_relationship` | VARCHAR | nested in `model_results[].source_metadata` |
| `source_name` | VARCHAR | nested in `model_results[].source_metadata` |
| `source_type` | VARCHAR | nested in `model_results[].source_metadata` |
| `source_organization_name` | VARCHAR | nested in `model_results[].source_metadata` |
| `sample_size` | BIGINT | nested in `model_results[].score_details.sample_size` |
| `missing_generation_config` | BOOLEAN | implied — currently surfaced as a count field on the eval summary |

### Table B: `eval_metric_config` (one row per eval_summary_id)

| Column | Type | Source |
|---|---|---|
| `eval_summary_id` | VARCHAR | key |
| `metric_min_score` | DOUBLE | currently nested in `metric_config.min_score` |
| `metric_max_score` | DOUBLE | currently nested in `metric_config.max_score` |
| `lower_is_better` | BOOLEAN | currently nested in `metric_config.lower_is_better` |
| `evaluation_name` | VARCHAR | already on summary; needed for the sort and join |
| `category` | VARCHAR | already in metadata column |

### Table C: `composite_membership` (one row per (suite_key, sub_eval_summary_id))

| Column | Type | Source |
|---|---|---|
| `suite_key` | VARCHAR | family `key` from `eval-hierarchy.json` (e.g. `helm_lite`) |
| `eval_summary_id` | VARCHAR | each entry of family.eval_summary_ids |
| `suite_display_name` | VARCHAR | family `display_name` (currently TS overrides via `getBenchmarkDisplayName(suite_key)` lookup; see TS quirk #6) |

This table is the new structural artifact the pipeline owes us. Today the pipeline has the data in `eval-hierarchy.json` but it's nested JSON; promoting to a relational table is what unlocks the `GROUP BY` below.

## Sketch SQL query

Two scenarios as the prompt asked: (a) sub-eval rows live relationally, (b) composite membership lives relationally. Both apply here.

```sql
-- Per-model component-level rows for the requested composite
WITH suite_components AS (
  SELECT
    cm.suite_key,
    cm.suite_display_name,
    r.eval_summary_id,
    emc.evaluation_name AS sub_eval_name,
    r.model_id,
    r.score,
    r.retrieved_timestamp,
    r.source_name,
    r.source_type,
    r.source_organization_name,
    r.evaluator_relationship,
    r.sample_size,
    -- TS quirk #1: normalize FIRST, average LATER
    CASE
      WHEN (emc.metric_max_score - emc.metric_min_score) > 0
      THEN (r.score - emc.metric_min_score) / (emc.metric_max_score - emc.metric_min_score)
      ELSE r.score
    END AS normalized_score,
    emc.lower_is_better
  FROM composite_membership cm
  JOIN result_rows r USING (eval_summary_id)
  JOIN eval_metric_config emc USING (eval_summary_id)
  WHERE cm.suite_key = ?  -- the param from /evals/aggregate__<suite_key>
),

-- Per-(suite, model) rollup
per_model AS (
  SELECT
    suite_key,
    model_id,
    AVG(normalized_score) AS avg_normalized_score,
    SUM(COALESCE(sample_size, 0)) AS total_sample_size,
    -- "Latest component" wins for source_metadata + result fields
    arg_max(STRUCT_PACK(
      source_name, source_type, source_organization_name,
      evaluator_relationship
    ), retrieved_timestamp) AS latest_source_metadata,
    MAX(retrieved_timestamp) AS evaluation_timestamp,
    -- aggregate_components[] for drill-down rendering
    list(STRUCT_PACK(
      eval_summary_id,
      composite_benchmark_name := sub_eval_name,
      score, normalized_score, retrieved_timestamp,
      source_name, source_type, source_organization_name, evaluator_relationship
    ) ORDER BY sub_eval_name) AS aggregate_components
  FROM suite_components
  GROUP BY suite_key, model_id
),

-- Suite-level rollup on top
suite_summary AS (
  SELECT
    suite_key,
    COUNT(DISTINCT model_id) AS models_count,
    AVG(avg_normalized_score) AS avg_score,  -- TS quirk #2: avg-of-avgs
    SUM(third_party_count) AS total_third_party,
    SUM(underlying_count) AS total_underlying
  FROM (
    SELECT
      suite_key, model_id, avg_normalized_score,
      COUNT(*) FILTER (WHERE evaluator_relationship = 'third_party') AS third_party_count,
      COUNT(*) AS underlying_count
    FROM suite_components
    GROUP BY suite_key, model_id, avg_normalized_score
  )
  GROUP BY suite_key
)

-- Final shape: per-model rows ordered by score (direction depends on lower_is_better
-- of the FIRST sub-eval, see TS quirk #4)
SELECT
  pm.*,
  ss.models_count,
  ss.avg_score,
  ss.total_third_party::DOUBLE / NULLIF(ss.total_underlying, 0) AS third_party_ratio
FROM per_model pm
JOIN suite_summary ss USING (suite_key)
ORDER BY pm.avg_normalized_score DESC;  -- flip to ASC if first sub-eval is lower_is_better
```

The `evaluator_names` and `source_types` unions, the `aggregate_sources[]` list, and the `missing_generation_config_count` are scalar reductions on top — straightforward and omitted from the sketch.

## Materialize vs query-time

**Recommendation: materialize.** Pipeline emits one row per `(suite_key, model_id)` into a new parquet table (`composite_eval_rollup` or equivalent) plus the suite-level rollup as a sibling table. Runtime DuckDB just does `SELECT * WHERE suite_key = ?` — no JOIN, no AVG, no normalization at request time.

Rationale:

- **The answer is identical for every consumer.** No user-driven slicing on top of the composite (no per-category filtering, no per-developer cut). The aggregate page renders the same table to everyone who hits the same suite URL.
- **Composite count is small.** ~13 multi-eval families today, growing slowly; cheap to recompute on every pipeline run.
- **Sub-eval fan-out is the single biggest per-request cost on this route.** Today's TS path issues 2-21 (occasionally 471) `fetchHFEvalDetail` calls per page view. Materialization eliminates them entirely.
- **Score-normalization choice is a product decision.** Baking it into the parquet means the choice is committed once at pipeline build time. Anyone consuming the column gets the canonical answer; no consumer needs to remember "normalize before averaging."

Honest tradeoff:

- **Pipeline-side recompute on every run.** Pipeline already does a full rebuild (see `migration-plan.md` "Cross-repo coordination"), so this is "another job in the existing batch," not "a new orchestration burden."
- **Schema growth.** Adds two new tables (per-model rollup + suite-level rollup) plus a new `aggregate_components[]` STRUCT column. Worth it given the alternative is JSON-blob extraction at every request.
- **Query-time would be viable** if we wanted to support arbitrary user-specified composites (e.g. "build me an aggregate of `mmlu_pro` + `gpqa` + `humaneval`"). We don't have that product feature today and there are no signals we will. If we add it, then `suite_components` CTE above runs query-time over the relational `result_rows`/`eval_metric_config` tables; that's still cheaper than the current TS fan-out.

## TS-as-spec quirks

These are TS choices the pipeline must reproduce. Don't "fix" them — capture, ship, talk later.

1. **Score normalization happens BEFORE averaging.** `lib/model-data.ts:937-941`: `components.map(... normalizeSummaryScore(summary, modelResult.score)) ... reduce(...) / length`. This is min-max normalization per sub-eval (using each sub-eval's own `metric_config.min_score` and `metric_config.max_score`), then arithmetic mean across sub-evals. The "obvious" alternative — average raw scores then normalize once — would produce different numbers when sub-evals have different score ranges (which is the whole point of normalizing). TS's order is correct for cross-metric aggregation; the SQL must do the same. Captured in the sketch CTE: `normalize` lives in `suite_components`, `AVG` lives in `per_model`.

2. **Suite-level `avg_score` is avg-of-per-model-avgs, not avg-of-all-component-scores.** `lib/model-data.ts:990-991`: `aggregatedModelResults.reduce((sum, r) => sum + r.score, 0) / aggregatedModelResults.length`. With unbalanced sub-eval coverage (some models present in only some sub-evals), the two formulations diverge. TS picks the per-model-mean grouping; SQL must do `AVG(per_model.avg_normalized_score)`, NOT `AVG(suite_components.normalized_score)`.

3. **"Latest component wins" for the per-model `evaluation_timestamp` and `source_metadata`.** `lib/model-data.ts:943-947`: sort components DESC by `normalizeEvalTimestamp(evaluation_timestamp)`, take the first. The aggregate row's `result.*`, `source_metadata`, `source_data` all inherit from that single latest sub-eval. So a model that has 6 sub-evals rolled up shows the source metadata of whichever sub-eval was most recent, not a synthesized view. (Note the dependency on reshape spec #07 for timestamp normalization — see "Cross-item dependencies".)

4. **Sort direction comes from the FIRST sub-eval's `lower_is_better`.** `lib/model-data.ts:987-988`: `const lowerIsBetter = first.metric_config.lower_is_better`. If the suite mixes higher-is-better and lower-is-better metrics (rare today but possible — pipeline doesn't enforce homogeneity), TS picks whichever direction `summaries[0]` happens to use. The order of `summaries` is whatever `getEvalSummaryById` produces from `Promise.all(matchingEvals.map(...))`, which is the order of `eval-hierarchy.json` family.eval_summary_ids. Pipeline must preserve that order or replicate the choice (e.g. "pick `lower_is_better=false` if any sub-eval is higher-is-better").

5. **`latest_source_name` is the literal string `"Multiple sources"` when len > 1.** `lib/model-data.ts:1021-1022`. Single-sub-eval composites get the real name; multi-sub-eval composites get a fixed sentinel. Don't try to be smart and concatenate names — the consumer (`eval-detail.tsx:540-541`) already does that separately from the `aggregate_sources[]` array.

6. **Suite display name comes from the `BENCHMARK_NAMES` lookup, NOT from `eval-hierarchy.json`'s `display_name`.** `lib/model-data.ts:903`: `getBenchmarkDisplayName(aggregationKey)` falls through to the `humanizeToken` fallback if not in the hand-curated map. This is migration item #8 (benchmark display names) — capture as a dependency, but in the rollup itself the display name is derived from the `suite_key` not joined from the hierarchy.

7. **Within-composite sub-eval ordering is alphabetical by `composite_benchmark_name`.** Both `aggregateSources` (line 900) and per-model `aggregate_components` (line 962) are `.sort((a, b) => a.composite_benchmark_name.localeCompare(b.composite_benchmark_name))`. Stable English-locale sort. SQL `ORDER BY sub_eval_name` reproduces this.

8. **`composite_benchmark_name` for each component uses the SUB-EVAL's own `evaluation_name`, not the parent suite name.** `lib/model-data.ts:894`: `composite_benchmark_name: summary.evaluation_name`. The field name is misleading; in the per-component context it means "the sub-eval's own display name" (this is what the drill-down UI in `eval-detail.tsx:1046+` renders).

9. **`metric_config` for the aggregate is synthesized.** `lib/model-data.ts:924-933`: takes `first.metric_config` (i.e. first sub-eval's), then forces `min_score=0`, `max_score=1`, `unit="normalized average"`, and rewrites `evaluation_description` to `"Average normalized score across <comma-separated sorted sub-eval names>"` when more than one source. The `lower_is_better` and `score_type` are inherited from the first sub-eval verbatim — so if the composite mixes `binary` and `continuous` sub-evals, the aggregate is reported as whatever the first one is.

## Cross-item dependencies

- **#7 timestamp normalization** — the "latest component wins" logic (TS quirk #3) calls `normalizeEvalTimestamp` (Variant A from the timestamp spec). Once timestamps are ISO 8601 upstream and the reshape half lives in SQL, `MAX(retrieved_timestamp)` and `arg_max(..., retrieved_timestamp)` replace the TS sort. Order of operations: timestamp canonicalization should land first (or co-land), so the SQL's lexicographic `MAX` is correct.
- **#8 benchmark display names** — `getBenchmarkDisplayName(suite_key)` provides the suite's user-facing label (TS quirk #6). When #8 ships and the pipeline emits canonical display names, the rollup table can drop `suite_display_name` and join against the canonical table.
- **#3 hierarchy flatten** — the family→sub-eval mapping (`composite_membership` table above) is what `eval-hierarchy.json` already encodes as nested JSON. #3 will likely promote the hierarchy to a relational table; this rollup spec depends on that promotion (or a sidecar table built specifically for composites).
- **#11 benchmark-card attachment** — TS calls `attachBenchmarkCardToSummary(hfEvalDetailToSummary(detail))` per sub-eval before passing to `aggregateBenchmarkSummaries` (line 1562). The `benchmark_card` of `summaries[0]` becomes the aggregate's `benchmark_card`. Once benchmark cards are inlined upstream by #11, this attachment step disappears.
- **Composite of all four**: only when 7+8+3 (and ideally 11) are landed can the whole rollup move to materialized parquet cleanly. Without 7 the latest-component logic is brittle; without 3 there's no clean way to drive the rollup loop on the pipeline side; without 8 the suite display name has to be a TS lookup post-hoc.

## Migration checklist

- [x] Spec written (operation captured in SQL terms; TS quirks documented)
- [ ] Pipeline-schema conversation: decide whether to (a) promote `result_rows`/`eval_metric_config` to relational columns and `composite_membership` to a sidecar table, then materialize the rollup, or (b) ship a single pre-computed `composite_eval_rollup` parquet that bakes in TS's choices as columns. Recommendation: (b) for the rollup itself, with (a) as a parallel deliverable so other reshape items (matrix, top-scores, summary stats) can share the relational base.
- [ ] Pipeline emits the materialized rollup; verify per-model `avg_normalized_score`, suite `avg_score`, `latest_source_metadata`, sort order, `aggregate_components[]` for at least the 13 multi-eval families.
- [ ] Update `getEvalSummaryById` to read the rollup directly when `evalId.startsWith("aggregate__")` instead of fanning out `fetchHFEvalDetail` calls.
- [ ] Delete `aggregateBenchmarkSummaries` (`lib/model-data.ts:877-1044`) and the `Promise.all` fan-out in `getEvalSummaryById` (`lib/model-data.ts:1543-1568`).

## Future product decisions (deferred)

- Whether to support **user-defined composites** (build an aggregate from arbitrary sub-evals at request time). Today the answer is no; if it becomes yes, the relational `result_rows`/`eval_metric_config` path becomes the load-bearing one and the materialized rollup becomes the cached fast-path for the curated 13.
- Whether to expose **non-normalized averages** alongside the normalized one. TS hides the raw average; consumers asking "what's the actual MMLU score?" have to look at individual sub-evals. A pre-materialized rollup makes both columns equally cheap to surface.
- Whether the **`avg_score = avg-of-per-model-avgs`** choice (TS quirk #2) is the right one when sub-eval coverage is unbalanced. Don't fix in this migration.
