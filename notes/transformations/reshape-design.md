# Reshape-class operations: parquet schema + SQL plan

Drafted 2026-04-28. Synthesis of 5 per-item operation catalogs in `notes/transformations/reshape/` plus the reshape halves of #2 (setup-alias merging) and #13 (timestamp normalization). Reads against the principle in `notes/migration-plan.md` § "Data direction".

This doc is **a discussion artifact for the pipeline owner**, not a unilateral architecture commitment. It proposes a parquet schema delta, sketches the SQL each reshape becomes, recommends materialize-vs-query-time per item, and orders the dependency graph. Pipeline owner has authority to push back on any of it.

## Inventory

| Item | Operation | Per-item doc | Recommendation |
|---|---|---|---|
| #2 (reshape half) | Variant bucket reduction (`GROUP BY variant_key, MAX(retrieved_timestamp)`) | `02-setup-alias-merging.md` § "Dual class" | Pipeline emits already-deduped rows in `model_results` parquet (materialize-by-emission) |
| #3 | Hierarchy flatten + family summary | `reshape/03-hierarchy-flatten.md` | Materialize Steps 1+2 (flat `model_results`); query-time Step 3 (family rollup, category bucketing) |
| #5 | Composite eval rollup (`/evals/aggregate__<suite>`) | `reshape/05-composite-eval-rollup.md` | Materialize per-(suite, model) rollup table |
| #6 | Matrix leaderboard synthesis (`/evals/matrix__<suite>`) | `reshape/06-matrix-leaderboard.md` | Materialize wide matrix; query-time row filter |
| #13 (reshape half) | Timestamp comparison / dedup | `07-timestamp-normalization.md` § "Classification" | SQL inline (`MAX(retrieved_timestamp)`, `ROW_NUMBER()`); no materialization needed |
| #14 | Score summary stats (per-eval aggregations) | `reshape/14-score-summary-stats.md` | Materialize 9 columns into `eval-list.json` extension |
| #16 | Per-category benchmark counts (`COUNT(DISTINCT benchmark) GROUP BY model, category`) | `reshape/16-per-category-counts.md` | Materialize `category_stats` per model (current TS is *known wrong*) |

## Required parquet schema delta

The current schema (`scripts/pipeline.py:write_experimental_parquet_table`) is 11 typed metadata columns + `payload_json VARCHAR`. SQL can route on metadata columns but cannot see inside the blob. **Every reshape item above is bottlenecked on the same schema delta: promote nested per-result fields to a relational table.**

### Proposed: `model_results.parquet` (one row per metric × model_result, post-#2 dedup)

The unifying schema across #3, #5, #6, #14, #16 needs roughly the same columns. Designing it once unlocks all of them.

```
-- Routing / partition keys
model_family_id           VARCHAR  -- joins to model_summaries.parquet
model_route_id            VARCHAR  -- joins to model_summaries.parquet
developer                 VARCHAR  -- already a metadata column on model_summaries

-- Eval / benchmark identity
eval_summary_id           VARCHAR  -- already a metadata column
benchmark                 VARCHAR
benchmark_family_key      VARCHAR  -- already a metadata column on eval_summaries
benchmark_family_name     VARCHAR
benchmark_parent_key      VARCHAR
benchmark_parent_name     VARCHAR
benchmark_leaf_key        VARCHAR
benchmark_leaf_name       VARCHAR
display_name              VARCHAR  -- post-inheritance from buildFlattenHierarchyContext
canonical_display_name    VARCHAR
benchmark_display_name    VARCHAR  -- post #8 cleaning; the user-facing label
slice_key                 VARCHAR
slice_name                VARCHAR
category_key              VARCHAR  -- raw "agentic"/"reasoning"/etc.; mapped form derived via SQL CASE or pipeline-emit (see open question 7); #11 affects accuracy

-- Metric identity
metric_summary_id         VARCHAR
metric_key                VARCHAR
metric_name               VARCHAR
metric_display_name       VARCHAR  -- post #10 cleaning
metric_canonical_display_name VARCHAR
metric_unit               VARCHAR
min_score                 DOUBLE   -- from metric_config; needed by #5, #14
max_score                 DOUBLE   -- from metric_config; needed by #5, #14
lower_is_better           BOOLEAN  -- from metric_config; needed by #5, #6, #14
evaluation_description    VARCHAR  -- from metric_config; needed by #5

-- Per-result fields
evaluation_id             VARCHAR  -- result-level
raw_model_id              VARCHAR
model_id                  VARCHAR
model_result_route_id     VARCHAR
model_name                VARCHAR
score                     DOUBLE
retrieved_timestamp       VARCHAR  -- ISO 8601 once #13 cleaning ships; today unix-seconds-string
sample_size               BIGINT
has_generation_config     BOOLEAN  -- presence flag for #14
detailed_evaluation_results VARCHAR
instance_level_data       JSON
source_data               JSON     -- inherited; could be promoted further if hot

-- Source metadata (promoted from struct to flat columns; needed by #5, #6, #14)
source_metadata.evaluator_relationship VARCHAR  -- enum: first_party / third_party / other
source_metadata.source_type           VARCHAR
source_metadata.source_name           VARCHAR
source_metadata.source_organization_name VARCHAR

-- Variant identity (depends on #2 cleaning)
variant_key               VARCHAR  -- pre-resolved per #2 setup-alias normalization
variant_label             VARCHAR

-- Cleaning-driven derived columns (depend on cleaning items)
benchmark_card            JSON     -- depends on migration #17 inlining (specced as `notes/transformations/11-benchmark-card-attachment.md`)
```

### Sidecar tables

```
-- composite_membership.parquet — one row per (suite_key, sub_eval_summary_id), drives #5
suite_key            VARCHAR
eval_summary_id      VARCHAR
suite_display_name   VARCHAR  -- from eval-hierarchy.json family display_name; #8 affects this
```

### What stays in `payload_json`

After this delta, `payload_json` still carries the nested original shape for debugging / migration parity. Once parity is verified per item, fields consumed only via the relational columns can be dropped from the blob.

### Pipeline-side family-membership filter

Important: pipeline should apply the `belongsToModelFamily` filter at emission time so every row in `model_results.parquet` is already correctly assigned to its `model_family_id`. SQL then runs `WHERE model_family_id = ?` and the TS family-membership logic disappears. (Currently the filter happens in TS — `lib/hf-data.ts:1110-1131`. Lifting it upstream eliminates the ~6-line filter from the SQL replacement and avoids the "raw_model_ids set ∪ variant.raw_model_ids ∪ model_info.id ∪ model_family_id" CTE.)

## Per-item SQL sketches

Each operation's full SQL is in its catalog file. This section gives one-paragraph summaries to read alongside the inventory.

### #3 hierarchy flatten — Steps 1+2 materialized, Step 3 query-time
Tree walk → flat list with variant bucket reduction = **what `model_results.parquet` IS**. Pipeline does it once at build. Consumer Step 3 (family summary, category bucketing) becomes a ~10-line SQL query against `model_results` per request. Removes `flattenHierarchyNode` (~150 lines), `createModelFamilySummary` (~80 lines), `createModelSummary` (~65 lines), `getAggregatedVariantDescriptor`, `sortVariants`, `buildVariantLookup`, `resolveVariantMeta`, `belongsToModelFamily`, `buildModelInfoForVariant`. See `reshape/03-hierarchy-flatten.md` for the full SQL.

### #5 composite eval rollup — fully materialize
Pipeline pre-computes per-(suite, model) rows + suite-level summary into `composite_eval_rollup.parquet`. Eliminates the 2-21 (outlier 471) `fetchHFEvalDetail` calls per page view. Removes `aggregateBenchmarkSummaries` (168 lines) and the fan-out loop in `getEvalSummaryById`. The rollup SQL itself (per-eval normalize → per-model average → suite stats) is in `reshape/05-composite-eval-rollup.md`.

### #6 matrix leaderboard — materialize wide matrix, query-time row filter
Pipeline pre-computes per-(suite, model_id) → values map + reconciled metadata using DuckDB `PIVOT` semantics. Eliminates the per-cell walk (median 6, max 471 sub-evals × ~91 models = ~10⁴ tuples per request for `llm_stats`). Row-filter knobs (developer, source_type, top-K) stay query-time SQL — emerging UI need. Removes `buildSingleMetricSuiteMatrixSummary` (~165 lines).

### #13 timestamp comparison — SQL inline, no separate materialization
Once cleaning #13 lands ISO 8601 timestamps, the comparisons embedded in #3, #5, #6, #14 collapse to `MAX(retrieved_timestamp)` and `ROW_NUMBER() OVER (... ORDER BY retrieved_timestamp DESC)`. The 3 TS normalizers + 8 callers all delete as a unit. No separate parquet artifact.

### #14 score summary stats — materialize 9 columns into eval-list extension
Pipeline emits all 9 aggregated columns (`models_count`, `avg_score`, `avg_score_norm`, `best_model`, `worst_model`, `evaluator_names`, `source_types`, `latest_source_name`, `third_party_ratio`, `missing_generation_config_count`) per eval. Pattern matches today's existing `eval-list.json` materialization of `models_count` + `top_score`. SQL is textbook `GROUP BY eval_summary_id` + arithmetic + set aggregations. Removes the finalisation loop in `groupEvaluationsByBenchmark` (~45 lines) and the aggregation block in `hfEvalDetailToSummary` (~45 lines).

### #16 per-category counts — materialize `category_stats` per model
Smallest, clearest reshape. Pipeline emits `category_stats: Record<Category, number>` per model via `COUNT(DISTINCT benchmark_family_key) GROUP BY model_route_id, category`. Replaces the fake `Math.floor(total / categories.length)` distribution in `lib/model-data.ts:369-379` AND the real-but-different distinct-count in `lib/eval-processing.ts:653-666`. Same model gets the same answer everywhere after the migration. **Blocked on #11 category accuracy** — without it, 84% of evals collapse into one `other` bucket.

## Materialize vs query-time — rationale per item

| Item | Recommendation | Why |
|---|---|---|
| #2 reshape | Materialize via #3's `model_results` | Bucket reduction is invariant; every consumer needs the same dedup |
| #3 Steps 1+2 | Materialize | Tree walk is expensive and invariant; every model-detail page needs it |
| #3 Step 3 | Query-time | Consumer-shape varies (per-variant for detail, per-benchmark for eval-detail); SQL lets each consumer slice without paying for others |
| #5 | Materialize | Identical answer per consumer; only 13 multi-eval families today; eliminates 2-471 detail fetches per page view |
| #6 wide matrix | Materialize | Column shape + per-cell winners are deterministic |
| #6 row filter | Query-time | Forthcoming UI: developer / source-type / top-K filters are consumer-driven |
| #13 reshape | SQL inline | No artifact needed; comparisons embed in #3/#5/#6/#14 queries |
| #14 | Materialize | 9 columns × ~587 evals; per-eval scope; no consumer slices these per-category |
| #16 | Materialize | Trivial size (≤9 categories × ~5,830 models); identical for every consumer |

The pattern: **default to materialize for invariant work**; reserve query-time SQL for consumer-driven slicing (row filters, top-N where N varies, custom faceting).

## Dependency order

```
Cleaning items (must land FIRST — they emit canonical values that reshape SQL reads)
  #2  setup-alias merging cleaning half  → variant_key column
  #13 timestamp normalization cleaning   → ISO 8601 retrieved_timestamp
  #11 category accuracy improvement      → meaningful category column (84% currently "other")
  #8  benchmark display names            → benchmark_display_name column
  #10 metric display name expansion      → metric_display_name column

Schema delta (pipeline-owner conversation; ~one PR in pipeline repo)
  Promote nested fields to relational `model_results.parquet`
  Add sidecar `composite_membership.parquet`
  Apply pipeline-side family-membership filter at emission time

Reshape items (in roughly ascending complexity; all unblocked once schema lands)
  #16 per-category counts        — smallest; gated on #11 (category accuracy)
  #14 score summary stats        — gated on #2, #13; #4 already shipped
  #3  hierarchy flatten          — gated on #2, #13
  #5  composite eval rollup      — gated on #13, #8, #17 (benchmark-card); benefits from #14 landing first
  #6  matrix leaderboard         — gated on #13, #8, #17 (benchmark-card), #1 (identity canonicalization); benefits from #3 landing first
```

The schema delta is the load-bearing pipeline-owner conversation. Once `model_results.parquet` exists in the right shape, **the 6 reshape items can be implemented in parallel**, each as a single SQL query in `lib/duckdb-data.ts` replacing the current `JSON.parse(payload_json) → TS adapter` chain.

## Cross-cutting TS-as-spec quirks for pipeline-owner attention

These are decisions the pipeline owner will face when implementing the schema + emission. Not "fix these" — "these are choices to make".

1. **`>=` vs `>` tie-break in bucket reduction.** TS uses `>=` (last-iteration-order wins on timestamp tie) in #3, #6, #14. SQL `ROW_NUMBER() OVER (... ORDER BY retrieved_timestamp DESC)` is implementation-defined on ties unless an explicit secondary key is added. Recommendation: tie-break on `evaluation_id DESC` for stability. Document the divergence; tie-collisions are rare in production (timestamps are floats with microsecond precision).

2. **Variant identity computed twice in #3.** `lib/hf-data.ts resolveVariantMeta` (Step 1b) and `lib/eval-processing.ts getAggregatedVariantDescriptor` (Step 3) re-derive variant identity from different inputs. They can disagree (e.g. `"20240620-thinking"` vs `"2024-06-20"`). Should reconcile to a single canonical `variant_key` once #2 cleaning lands. Likely produces subtle off-by-one variant counts today.

3. **`evaluator_names` always `[]` on the active path.** `hfEvalDetailToSummary` initializes to `[]` and never populates. The eval-card UI's "Evaluators" pill shows 0 for every eval today — latent bug. Pipeline can fix-by-canonicalization (emit the sorted DISTINCT set) and accept that the pill will start showing real numbers. Flag as deferred product decision.

4. **`models_count` divergence.** TS recomputes it post-#2-dedup; pipeline emits it pre-#2-dedup. Disagrees for any model with merged variants (notably anything with `additional_details.mode` ∈ {prompt/fc/thinking}). Resolves naturally when #2 lands and pipeline's emitted value matches TS's recomputed.

5. **Sort direction in #5 from FIRST sub-eval's `lower_is_better`.** Fragile when a suite mixes higher-is-better and lower-is-better metrics. Order of `summaries[0]` is whatever `eval-hierarchy.json family.eval_summary_ids` lists first. Pipeline must preserve order or replicate the choice. Recommend: pick `lower_is_better=false` if any sub-eval is higher-is-better.

6. **Two implementations of `category_stats` produce different answers** (#16). Path A (grid) is fake distribution; Path B (detail page) is real `COUNT(DISTINCT benchmark)`. Same model, two pages, two answers. Materialization eliminates both implementations.

7. **Cell tie-break in #6 is "last in iteration order".** Whether SQL `ROW_NUMBER() ORDER BY retrieved_timestamp DESC` matches TS depends on whether pipeline emits `metric.model_results[]` in retrieved_timestamp-DESC order. **Verify this assumption before flipping the SQL on.** If pipeline order is non-deterministic, the SQL is a "freshest wins" *upgrade* over TS's "iteration order wins" — likely fine, but call out in the migration commit.

8. **Score normalization in #5 happens BEFORE averaging.** `normalize(score)` per sub-eval (using each sub-eval's own min/max), then arithmetic mean across sub-evals. The "obvious" alternative (average raw scores then normalize) produces different numbers when sub-evals have different score ranges. SQL must do `AVG(per_eval.normalized_score)`, not `AVG(suite_components.normalized_score)`.

9. **Suite-level `avg_score` in #5 is avg-of-per-model-avgs, not avg-of-all-component-scores.** Diverges when sub-eval coverage is unbalanced. SQL `AVG(per_model.avg_normalized_score)`, not `AVG(suite_components.normalized_score)`.

10. **Empty-metric short-circuit in #14 puts a benchmark display name into `latest_source_name`.** `lib/model-data.ts:785` sets `latest_source_name = getBenchmarkDisplayName(benchmarkKey)` when an eval has zero metrics — a *display name* string in a *source name* field. Almost certainly a placeholder bug. Pipeline can fix-by-canonicalization (emit `null` and chase down any consumer that breaks); flag as deferred product decision.

11. **Two GROUP BY entry points in #14 with different score-source semantics.** `groupEvaluationsByBenchmark` iterates `eval_.evaluation_results` (multi-metric possible); `hfEvalDetailToSummary` iterates `metric.model_results` of *only* the first metric. Active read path for eval-detail pages is `hfEvalDetailToSummary` — pipeline emission should match its single-primary-metric semantics, since that's what users see today.

## Open questions for pipeline owner

1. **How relational should parquet go?** Promote nested fields to typed columns (this doc's recommendation) or stay closer to current `payload_json` blob and rely on DuckDB's JSON functions? Going relational unlocks ~10× more SQL work but is a bigger schema change.
2. **Where does `composite_membership` live?** Sidecar parquet table (this doc's recommendation) or stays nested in `eval-hierarchy.json`?
3. **Score-normalization ownership.** Pipeline pre-normalizes `score_norm` as a column, OR DuckDB does at query time using `min_score`/`max_score`/`lower_is_better` columns? This doc assumes the latter (per-row columns); pre-normalizing is also viable.
4. **Pipeline emission order of `metric.model_results[]`.** Is it deterministic? Sorted by anything? Affects whether SQL's `ROW_NUMBER() ORDER BY retrieved_timestamp DESC` matches TS's "last-wins-iteration" semantics for #6 cell tie-breaks.
5. **Pipeline-side family-membership filter.** This doc recommends pipeline filters at emission time (so SQL just `WHERE model_family_id = ?`). Alternative: SQL replicates the `belongsToModelFamily` set logic. Pipeline-side is much cleaner.
6. **Variant identity reconciliation (#3 quirk #2).** Double-pass should collapse to single canonical `variant_key` once #2 cleaning lands. Pipeline owner picks the canonical rule.
7. **`category_stats` vs `category` column for #16.** Pipeline emits `category_stats: Record<Category, number>` directly on each model card (consumer-shape), OR pipeline emits per-row `category` and DuckDB pivots at query time? Consumer-shape is simpler; query-time gives flexibility for free.

## Migration sequencing

### Phase 1 — cleaning items land (in pipeline)
Pipeline emits canonical values per the existing per-item workflow (`notes/migration-plan.md` § "Per-item workflow"). Status as of 2026-04-28:

- **Specced + ready for handoff:** #2 (variant_key), #13 (ISO 8601), #8 (benchmark_display_name), #10 (metric_display_name). Plus #17 benchmark-card inlining (specced as `11-benchmark-card-attachment.md`) and #1 identity canonicalization. See per-item specs in `notes/transformations/`.
- **Blocked, not part of Phase 1:** #11 category accuracy is gated on pipeline-side classification work — pipeline currently emits `category: "other"` on 84% of evals. #16 reshape is gated on #11; if #11 doesn't land in time, #16 ships against the current "84% other" data and shows the limitation, OR ports `inferCategoryFromBenchmark` upstream as a workaround.

**No reshape SQL touches yet** in this phase.

### Phase 2 — schema delta lands (in pipeline)
Pipeline emits `model_results.parquet` (the unifying relational table) alongside the existing `payload_json` blob. Both columns live in parquet during the parity window — TS continues to read `payload_json`, the new SQL reads relational columns. This is a **single PR in `eval_cards_backend_pipeline`** for the schema, plus the family-membership filter.

### Phase 3 — DuckDB queries replace TS reshape, one item at a time
Per item (in any order, since they're independent once schema lands):
1. Write SQL query in `lib/duckdb-data.ts` (alongside existing `JSON.parse(payload_json) → TS adapter` path).
2. Reshape-class snapshot test becomes the **TS-vs-SQL parity gate** (per `notes/testing-strategy.md` § "Reshape-class items: testing addendum"). Snapshot is committed; SQL output is computed at test time; equality is the gate.
3. Once parity holds across the full corpus (verified via `pnpm audit-adapters --diff`), delete the TS implementation. Callers switch to read the SQL/materialized output.

Recommended order within Phase 3 (smallest unblocked first to build confidence):
1. **#14 score summary stats** — clean Phase-1 dependencies (#2, #13). Fixes the 0-evaluators latent bug, materializes 9 columns. Best first item.
2. **#16 per-category counts** — smallest reshape mechanically. *Caveat:* gated on #11 category accuracy (currently blocked on pipeline-side classification work — pipeline emits `category: "other"` on 84% of evals). Either ship against the "84% other" data and show the limitation, OR port `inferCategoryFromBenchmark` upstream as part of Phase 1.
3. **#3 hierarchy flatten** — the foundational reshape; Steps 1+2 are the unifying `model_results` use, Step 3 is the consumer surface. Clean Phase-1 dependencies.
4. **#5 composite eval rollup** — eliminates the 2-471 detail-fetch fan-out. Best after #14 ships (so per-eval stats are materialized first).
5. **#6 matrix leaderboard** — biggest behavior change (PIVOT); benefits from #3 + #5 patterns being in place.

### Phase 4 — cleanup
Once all reshape items are SQL/materialized: drop unused fields from `payload_json` blobs (or leave for debugging). Delete the runtime `flattenModelEvaluations` → `createModelFamilySummary` chain in `lib/duckdb-data.ts toModelSummary`. Update `notes/transformations/README.md` index to reflect completed items.

## Cross-references

- `notes/migration-plan.md` § "Data direction" — the cleaning vs reshape principle this doc operates under
- `notes/transformations/README.md` § "Where it belongs" — per-spec classification framework
- `notes/testing-strategy.md` § "Reshape-class items: testing addendum" — how reshape items get tested (TS-vs-SQL parity)
- `notes/transformations/02-setup-alias-merging.md` — reshape half of #2 (cited above)
- `notes/transformations/07-timestamp-normalization.md` — reshape half of #13 (cited above)
- `notes/transformations/reshape/{03,05,06,14,15,16}-*.md` — full per-item operation catalogs

## Open items for follow-up

1. **`PIPELINE_CATEGORY_MAP` location decision.** TS-side map vs pipeline-emit-mapped vs SQL `CASE`. Coupled to #11.
2. **Audit script for TS-vs-SQL parity per reshape item** — pattern to be established with #14 (the first reshape to ship), then templated for #16, #3, #5, #6.
3. **Pipeline-owner review.** This doc is a proposal; nothing is committed until pipeline owner has weighed in on the schema delta and the open questions above.
