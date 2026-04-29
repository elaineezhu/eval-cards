# Score summary stats (per-eval aggregations)

Drafted 2026-04-28. Migration item #14 in `notes/migration-plan.md`. Reshape-class.

## Framing reminder

Refactoring for UI efficiency, not fixing data correctness. TS-as-is is the canonical spec — its quirks (in particular, *re-deriving* `models_count` and effectively-`top_score` even though pipeline already emits them per eval; ignoring the metric primary-vs-leaderboard distinction; using `metric_config.{min,max}_score` defaults of 0/1 to "normalize" already-0-to-1 scores into themselves) must be reproduced when the operation moves to SQL or be explicitly accepted as divergences.

This is a textbook reshape: a `GROUP BY eval_summary_id` over the underlying `model_results` rows with arithmetic + set aggregations. It depends on item #2 (variant bucket reduction) being landed first — the per-eval rows the GROUP BY runs over are *already-deduped* model_result rows, not raw submissions.

## Operation in SQL terms

Input: one row per `(eval_summary_id, model_result)` from the post-#2-dedup `metric.model_results[]` array (one row per `(model_id × variant_key × evaluation_metric)` after the variant bucket reduction). Each row carries `score`, `evaluation_timestamp` / `retrieved_timestamp`, `source_metadata.{source_type, source_organization_name, evaluator_relationship, source_name}`, `generation_config` presence flag.

Output: one row per `eval_summary_id` with the following aggregated columns:

| Column | Aggregation | Notes |
|---|---|---|
| `models_count` | `COUNT(*)` | over the deduped model_results, NOT distinct model_id |
| `avg_score` | `AVG(score)` | raw score, no min/max scaling |
| `avg_score_norm` | `(AVG(score) - min_score) / (max_score - min_score)` | from per-eval `metric_config`; default `min=0`, `max=1`, → `range=1` so score already-in-[0,1] is unchanged |
| `best_model` | `(model_name, score)` of `MIN(score)` if `lower_is_better` else `MAX(score)` | tie-break: input order (TS uses stable sort) |
| `worst_model` | mirror of best_model | |
| `evaluator_names` | `array_agg(DISTINCT source_organization_name)` | TS preserves *insertion order* (no sort); see TS-as-spec quirks |
| `source_types` | `array_agg(DISTINCT source_type ORDER BY source_type)` | locale-compare sort |
| `latest_source_name` | `arg_max(source_name, comparable_timestamp)` over result rows | with `>=` tiebreak (not `>`) → last-wins on ties; see #13 timestamp normalization caveat |
| `third_party_ratio` | `COUNT(*) FILTER (WHERE evaluator_relationship = 'third_party') / COUNT(*)` | denominator is `models_count` |
| `missing_generation_config_count` | `COUNT(*) FILTER (WHERE generation_config IS NULL)` | absent/null/empty all count as missing in TS |

The grouping happens **per `eval_summary_id`** (which corresponds to one `(benchmark_leaf_key, primary_metric)` slice). Composite-benchmark rollups across multiple eval_summary_ids are item **#5** (`aggregateBenchmarkSummaries`), out of scope here.

## Current TS implementation

| Concern | Location | Notes |
|---|---|---|
| Multi-source-of-truth groupby finalisation | `lib/eval-processing.ts:946-991` (`groupEvaluationsByBenchmark`) | runs over `BenchmarkEvaluation[]` loaded from caches; legacy path. Builds the GROUP BY by accumulating into an object, then iterates and computes the aggregations in a separate `for` loop. |
| HF-detail-derived single-eval finalisation | `lib/model-data.ts:751-853` (`hfEvalDetailToSummary`) | runs over a single `HFEvalDetail` (one `eval_summary_id`); reads `metric.model_results` of the `primaryMetric` (= `allMetrics[0]`). This is the *active* path used by `app/evals/[id]/page.tsx` via `getEvalSummaryById` (line 1601, 1562). |
| HF-detail empty-metric short-circuit | `lib/model-data.ts:772-804` | when no primary metric, returns a zero-stats summary with `models_count=0`, `avg_score=0`, `best/worst_model=null`, `latest_source_name = getBenchmarkDisplayName(benchmarkKey)` — note this is the **benchmark display name**, not a real source name. TS-as-spec quirk #1. |
| Score normalization helper | `lib/model-data.ts:83-88` (`normalizeSummaryScore`) | `min=0`, `max=1`, `range=1` defaults — so `avg_score_norm = avg_score` for the 0-1 score case. |
| Per-row timestamp normalization (inline) | `lib/model-data.ts:76-81` (`normalizeEvalTimestamp`) and inline duplicate at `lib/eval-processing.ts:961-967` | Variant A from `notes/transformations/07-timestamp-normalization.md`; latest-wins comparison uses `>=` (last-wins on tie). |
| Per-row score timestamp source field | `lib/eval-processing.ts:933` uses `result.evaluation_timestamp`; `lib/model-data.ts:717` uses `mr.retrieved_timestamp ?? ""` then sets `evaluation_timestamp` from it | The two paths read different upstream fields under the hood; pipeline must ensure both resolve to the same canonical timestamp. |

Confirmed line numbers (verified 2026-04-28):
- `groupEvaluationsByBenchmark` body: `lib/eval-processing.ts:893-994`
- Finalisation loop: `lib/eval-processing.ts:946-991`
- `hfEvalDetailToSummary` body: `lib/model-data.ts:751-854`
- `normalizeEvalTimestamp`: `lib/model-data.ts:76-81`
- `normalizeSummaryScore`: `lib/model-data.ts:83-88`

## Required parquet columns

For SQL to do this work directly without pulling `payload_json`, parquet needs (per deduped model_result row, post-#2):

- `eval_summary_id` (already a metadata column)
- `model_id` / `model_route_id` / `model_name` (currently nested in `metrics[].model_results[].*` inside payload)
- `score` (currently nested)
- `retrieved_timestamp` (currently nested; ISO-canonicalized after item #13)
- `source_metadata.source_type` (currently nested)
- `source_metadata.source_organization_name` (currently nested)
- `source_metadata.evaluator_relationship` (currently nested)
- `source_metadata.source_name` (currently nested)
- `generation_config` presence boolean — `has_generation_config` (currently nested under `model_results[].generation_config`)

Per-eval scalars (already available somewhere, but need to be on the result row or joinable):

- `metric_config.min_score` / `max_score` / `lower_is_better` (per `(eval_summary_id, primary_metric)` — pipeline currently inlines under `metrics[]` in `eval-detail.json`)

Today's parquet schema has `eval_summary_id`, `models_count`, plus `payload_json`. Doing this in SQL would require a relational promotion of `metric.model_results[]` (one row per result, joined to per-eval `metric_config`). That's the open design question flagged in `notes/migration-plan.md` § "Data direction".

## Sketch SQL query

```sql
-- Per-eval summary stats over deduped model_results.
-- Assumes a relational table `eval_results` with one row per
-- (eval_summary_id, model_result) post-item-#2 variant dedup,
-- and per-eval metric_config columns inlined (or joined from a sibling table).
SELECT
  eval_summary_id,
  COUNT(*)                                              AS models_count,
  AVG(score)                                            AS avg_score,
  CASE WHEN (max_score - min_score) > 0
       THEN (AVG(score) - min_score) / (max_score - min_score)
       ELSE 0
  END                                                   AS avg_score_norm,
  -- best / worst: argmax/argmin over score (direction depends on lower_is_better)
  CASE WHEN lower_is_better
       THEN STRUCT_PACK(name := arg_min(model_name, score), score := MIN(score))
       ELSE STRUCT_PACK(name := arg_max(model_name, score), score := MAX(score))
  END                                                   AS best_model,
  CASE WHEN lower_is_better
       THEN STRUCT_PACK(name := arg_max(model_name, score), score := MAX(score))
       ELSE STRUCT_PACK(name := arg_min(model_name, score), score := MIN(score))
  END                                                   AS worst_model,
  -- evaluator names: TS preserves insertion order, NOT sorted (quirk)
  list(DISTINCT source_organization_name)               AS evaluator_names,
  -- source_types: TS sorts by localeCompare
  list_sort(list(DISTINCT source_type))                 AS source_types,
  -- latest source_name: arg_max with >= tie-break (last-wins)
  arg_max(source_name, retrieved_timestamp)             AS latest_source_name,
  -- third_party_ratio: filtered count over total
  COUNT(*) FILTER (WHERE evaluator_relationship = 'third_party')::DOUBLE
    / NULLIF(COUNT(*), 0)                               AS third_party_ratio,
  COUNT(*) FILTER (WHERE generation_config IS NULL)     AS missing_generation_config_count
FROM eval_results
GROUP BY eval_summary_id, min_score, max_score, lower_is_better;
```

Notes on the sketch:
- `arg_max(source_name, retrieved_timestamp)` is DuckDB-native; the `>=` tie-break in TS would need an explicit `ORDER BY retrieved_timestamp DESC, row_order DESC LIMIT 1` if exact byte-parity is required (see TS-as-spec quirks).
- `list(DISTINCT …)` in DuckDB returns insertion order of distinct values in the partition — should match TS `Array.from(new Set([...]))` for `evaluator_names`.
- The `STRUCT_PACK` for best/worst is illustrative; in practice we'd materialize `best_model_name` and `best_model_score` as separate columns.
- `score` and `min_score`/`max_score` are read from the same row group; if `metric_config` is sibling-joined, `GROUP BY` keys must include those columns (or use a window).

## Materialize vs query-time

**Recommendation: materialize per-eval at pipeline emission time.** Pipeline already emits `eval-list.json` with `models_count` and `top_score` per eval, which proves materialization is the established pattern. Extending that to the full set above (`avg_score`, `avg_score_norm`, `evaluator_names`, `source_types`, `latest_source_name`, `third_party_ratio`, `missing_generation_config_count`, `best_model`, `worst_model`) is the same operation, just more outputs.

Why materialize:

- **No consumer slices these by category, by model-developer, or by anything else within an eval.** Audit (2026-04-28) of `lib/`, `app/`, `components/`: every read is per-eval scalar (`summary.avg_score`, `summary.third_party_ratio`, `summary.evaluator_names.length`, etc.). The sole "category breakdown" use (`benchmark-detail.tsx:5727`) is over models within a benchmark, computed independently — not over these summary stats.
- **The aggregation is deterministic and consumer-invariant** — every consumer would compute the same numbers, which is exactly the materialize-when-the-answer-is-the-same heuristic from `notes/migration-plan.md` § "Data direction".
- **Per-eval scope is small** (one row per eval, ~587 evals in production today); blob size is trivial.
- **It removes the "TS recomputes what pipeline already provides" divergence** flagged below — instead of expanding the divergence by adding 7 more recomputed fields, we collapse the existing one by lifting all 9 to pipeline.

When query-time SQL would be the call instead: if a future consumer wants e.g. "third_party_ratio for this eval *restricted to a developer subset*", that's a query-time aggregation. Today no such consumer exists. Re-evaluate when one shows up.

The composite-benchmark rollup (item #5 `aggregateBenchmarkSummaries`) and matrix synthesis (item #6) are query-time-shaped because they slice across eval_summary_ids in different ways per request. Item #14 is the pre-aggregate that those build on.

## TS-as-spec quirks

These are TS behaviors the spec preserves. Pipeline must reproduce or each is an explicitly-accepted divergence.

### 1. TS recomputes `models_count` and an effective `top_score` even though pipeline already provides them per eval

Pipeline's `eval-list.json` emits per-eval `models_count` (e.g. 4492) and `top_score` (e.g. 0.8269), verified 2026-04-28 against `.cache/hf-data/eval-list.json`. TS ignores both:

- `models_count` is recomputed at `lib/eval-processing.ts:948` as `summary.model_results.length`, and at `lib/model-data.ts:825` as `modelResults.length`.
- `top_score` is not stored, but `best_model.score` is computed at `lib/eval-processing.ts:984-989` and `lib/model-data.ts:831-836` from the sorted-by-score model_results — which should be the same value as `top_score` *for the primary metric* assuming neither side filters differently.

**Do they disagree today?** Almost certainly yes for some rows. Pipeline's `models_count` counts pre-#2-dedup rows (raw model_result entries on the eval); TS's recomputed value counts post-#2-dedup rows (after `normalizeSingleModelCardEntry` collapses thinking-budget variants etc.). For evals with thinking-budget submissions (e.g. `openai/gpt-5.2`), pipeline's count will be higher than TS's. This is the same root cause as the #2 spec's "pipeline emits 7 variants, TS shows 2". Surface as a known divergence; **do not fix in this spec — it is properly resolved by landing #2 first**, after which pipeline's emitted `models_count` will match what TS recomputes (and the recomputation can be dropped).

For `top_score` vs TS-derived `best_model.score`: similar story. Pipeline's `top_score` is `MAX(score)` over pre-#2-dedup rows; TS's is over post-dedup rows. Different denominators, potentially different maxima (though MAX is more robust to dedup than COUNT or AVG).

### 2. The empty-metric short-circuit returns a zero-stats summary with `latest_source_name = getBenchmarkDisplayName(benchmarkKey)`

`lib/model-data.ts:785` sets `latest_source_name` to a *benchmark display name string* (e.g. "MMLU Professional") — not a source name — when there are no metrics. Downstream UI then renders this as if it were a source label. This is almost certainly a placeholder bug, but it's TS behavior today and any consumer that special-cases `latest_source_name` matching a benchmark name is reading this. Pipeline should reproduce by emitting `null`-or-display-name in the same condition, OR by accepting this as a fix-by-canonicalization (recommended: emit `null` and chase down any consumer that breaks, since this only fires when the eval has zero metrics — a degenerate case).

### 3. Two GROUP BY entry points, different score-source semantics

`groupEvaluationsByBenchmark` (eval-processing.ts:893) iterates `eval_.evaluation_results`; `hfEvalDetailToSummary` (model-data.ts:751) iterates `metric.model_results` of the *first* metric (`allMetrics[0]`). These are different shapes feeding the same aggregation, and they apply different filters: the eval-processing path takes *every* `evaluation_result` (potentially multi-metric); the model-data path takes only one metric's results. The active read path for eval-detail pages is `hfEvalDetailToSummary`. Pipeline emission should match `hfEvalDetailToSummary`'s semantics (single primary metric per eval_summary_id) — that's what users actually see today.

### 4. `evaluator_names` is insertion-ordered, not sorted

`lib/eval-processing.ts:940-942` pushes into a deduped array as it iterates; `hfEvalDetailToSummary` initializes to `[]` (line 826) and never populates it at all. Two contradicting behaviors in the same codebase — for the active path (`hfEvalDetailToSummary`), `evaluator_names` is **always empty**. The eval-card UI (`components/eval-card.tsx:162`) reads `summary.evaluator_names.length`, so eval-detail pages today always render "0 evaluators". This is a latent bug, but it's TS behavior. Pipeline should decide whether to (a) reproduce the empty-array behavior to preserve UI byte-parity, or (b) fix-by-canonicalization and emit the sorted DISTINCT set, accepting that the "Evaluators" pill will start showing real numbers. Recommended: (b), and call it out in the migration commit.

### 5. Latest-source uses `>=` tie-break (last-wins)

`lib/eval-processing.ts:968` uses `timestamp >= latestTimestamp`, so on a timestamp tie the *later iteration order* wins. SQL `arg_max` is implementation-defined on ties. If exact byte-parity matters across the migration, the SQL needs an explicit secondary sort. Otherwise accept as a divergence on the rare tied-timestamp case.

### 6. `avg_score_norm` defaults make it a no-op for 0-1 scores

When `metric_config.min_score` and `max_score` are absent (the common case), defaults are `0` and `1` → `range = 1` → `avg_score_norm = avg_score`. The "normalization" only does work when the metric explicitly carries non-default min/max. Reproducing in SQL is the `CASE WHEN range > 0` branch in the sketch above; matches TS's `range > 0 ? … : 0` (note: TS returns 0 not score when range == 0; minor edge-case divergence with `normalizeSummaryScore` which returns `score`).

## Cross-item dependencies

**Hard dependencies (this item cannot land cleanly without them):**

- **#2 setup-alias variant merging (reshape half).** The aggregations are over deduped variants. If pipeline emits stats over raw rows, TS-recomputed stats over deduped rows will continue to diverge for any model with merged variants. Land #2's reshape half first; then the per-eval row set that #14's GROUP BY runs over is the same set TS uses today.
- **#13 timestamp normalization.** `latest_source_name` requires a comparable timestamp. Today TS uses `normalizeEvalTimestamp` (Variant A from #13's spec) inline; once pipeline emits ISO 8601, SQL `arg_max(source_name, retrieved_timestamp)` works lexicographically with no parsing.

**Already-shipped dependencies:**

- **#4 source-metadata synthesis fallback.** Done. Pipeline now emits `source_metadata.{source_type, source_organization_name, evaluator_relationship, source_name}` on every model_result row, so the `evaluator_names`, `source_types`, `third_party_ratio`, and `latest_source_name` aggregations have non-null inputs to read. Without #4 these aggregations would silently drop rows.

**Soft dependencies (independent but adjacent):**

- **#5 composite eval rollup.** Builds on per-eval summaries. Once #14 lands as materialized per-eval stats, #5's `aggregateBenchmarkSummaries` becomes a query-time roll-up over already-aggregated rows (cheaper) instead of a re-aggregation from raw model_results.
- **#6 matrix leaderboard synthesis.** Same pattern — reads per-eval summaries when slicing across a multi-metric suite.

## Migration checklist

- [x] Spec written (TS-as-is, including quirks)
- [ ] Pipeline-side schema decision: relational promotion of `metric.model_results[]` to parquet rows, OR materialize the 9 aggregated columns into `eval-list.json` directly. Recommended: materialize (per "Materialize vs query-time" section).
- [ ] Pipeline emits the 9 columns per eval_summary_id matching this spec across the full corpus
- [ ] Verify against `.cache/hf-data/eval-list.json` extended shape; today only `models_count` and `top_score` are present
- [ ] Audit script (none yet — could mirror `scripts/verify-timestamp.mjs` against the recomputed-vs-emitted values for the 9 columns)
- [ ] TS deleted: `lib/eval-processing.ts:946-991` finalisation loop; `lib/model-data.ts:806-853` aggregation block; `lib/model-data.ts:83-88` (`normalizeSummaryScore`). Callers read pipeline-emitted fields directly.
- [ ] Snapshot test (`tests/transformations/score-summary-stats.test.ts` — currently absent; reshape-class snapshots double as TS-vs-SQL parity gates per `notes/testing-strategy.md` § "Reshape-class items: testing addendum")

## Future product decisions (deferred)

- Whether the empty-metric `latest_source_name = display_name` placeholder (TS quirk #2) should be `null` or kept as a backstop string.
- Whether `evaluator_names` should be empty (TS active-path behavior) or populated with the sorted DISTINCT set (TS legacy-path behavior).
- Whether `models_count` should mean "distinct model_id count" or "deduped result count" — TS today uses the latter; users may expect the former. Resolves naturally once #2 lands.
