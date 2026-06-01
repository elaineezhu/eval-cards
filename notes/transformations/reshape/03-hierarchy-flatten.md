# Hierarchy flatten + family summary — reshape operation

Drafted 2026-04-28. Migration item #3 in `notes/migration-plan.md`. First entry in the reshape catalog (companion to nothing in `notes/transformations/` today — those are cleaning specs and follow a different shape). Will be referenced from the synthesis at `notes/transformations/reshape-design.md` when it lands.

## Framing reminder

This is a **reshape**, not a cleaning item. The migration target is *not* "pipeline emits these exact `BenchmarkEvaluation[]` objects." It's "pipeline emits relational rows that DuckDB can flatten + group + dedup with a query." The TS implementation is the operational spec; the SQL replacement preserves behavior, not implementation.

Per `notes/migration-plan.md` § "Data direction": cleaning belongs in pipeline emission, reshape belongs in DuckDB SQL. This item is the reference reshape. It is also the canonical example for the schema-relationality conversation — the existing parquet schema (one `payload_json VARCHAR` blob per record) cannot do this work; pipeline must promote the nested fields to typed columns first.

## Operation (in SQL terms)

### Inputs
- **Source rows:** model-summary records in `model_summaries.parquet` (one per `model_family_id`). Today: each row is `(record_type, model_route_id, model_family_id, …, payload_json)` and `payload_json` carries the entire `HFModelDetail` blob — `hierarchy_by_category`, `variants[]`, `raw_model_ids`, `model_info`.
- **Nested fields the operation reads (currently inside `payload_json`):**
  - `hierarchy_by_category: Record<categoryKey, HFModelHierarchyNode[]>` — the tree. Walk recursively via `subtasks`.
  - For each leaf `metric` on each node: `metric.model_results[]` — submission rows with `score`, `retrieved_timestamp`, `source_metadata`, `raw_model_id`, `model_id`, `model_route_id`, `model_name`, `developer`, `evaluation_id`.
  - Tree context fields propagated down: `eval_summary_id`, `benchmark`, `benchmark_family_key/name`, `benchmark_parent_key/name`, `benchmark_leaf_key/name`, `display_name`, `canonical_display_name`, `category` (the category key from `hierarchy_by_category` map, mapped via `PIPELINE_CATEGORY_MAP`).
  - Metric-level fields: `metric_summary_id`, `metric_key`, `metric_name`, `display_name`, `canonical_display_name`, `metric_config`, `slice_key`, `slice_name`.
  - For variant identity: `detail.variants[]` (`variant_key`, `variant_label`, `raw_model_ids[]`).
  - For ownership filtering: `detail.raw_model_ids[]` ∪ `variant.raw_model_ids[]` ∪ `model_info.id` ∪ `model_family_id`.

### Step 1 — flatten the tree (one row per metric × model_result)
Recursively walk `hierarchy_by_category` (root nodes per category, then `node.subtasks[]`), inheriting context (eval_summary_id, benchmark, family/parent/leaf names, source_data) down through subtask levels. For each leaf-metric-with-results, emit one row per `model_result` filtered to those that belong to this model family (see Step 1a).

Conceptual emitted shape per row:
```
(model_family_id, eval_summary_id, category_key,
 benchmark, benchmark_family_key, benchmark_parent_key, benchmark_leaf_key,
 benchmark_family_name, benchmark_parent_name, benchmark_leaf_name,
 display_name, canonical_display_name,
 slice_key, slice_name, source_data,
 metric_summary_id, metric_key, metric_name, metric_config,
 evaluation_id, raw_model_id, model_id, model_route_id, model_name, developer,
 score, retrieved_timestamp, source_metadata,
 detailed_evaluation_results, instance_level_data,
 variant_key  /* resolved per Step 1b */)
```

#### Step 1a — `belongsToModelFamily` filter
A `model_result` belongs to this model family iff any of:
- `normalize(result.model_route_id) == normalize(detail.model_route_id)`, OR
- `normalize(result.raw_model_id) ∈ rawModelIds`, OR
- `normalize(result.model_id) ∈ rawModelIds`

where `rawModelIds = detail.raw_model_ids ∪ flat(variants[].raw_model_ids) ∪ detail.model_info.id ∪ detail.model_family_id`, all lowercased + trimmed. (See `lib/hf-data.ts:1110-1131` and `:1386-1395`.)

#### Step 1b — `resolveVariantMeta` lookup
Given a `model_result`, derive its `variant_key`:
1. Build a lookup `variantLookup: Map<normalized_raw_model_id, variant_key>` from `detail.variants[*].raw_model_ids`.
2. Try `result.raw_model_id` then `result.model_id` against the lookup.
3. If no match AND `detail.variants.length === 1` → use that single variant's key/label.
4. Else fallback to first non-empty candidate id, or `detail.model_info.variant_key`, or literal `"default"`.

This is the same `variant_key` produced by item #2 (setup-alias merging) with normalization already applied — so post-#2 the result of this lookup should equal the canonicalized `setup_alias_key` the pipeline emits.

### Step 2 — group by `(eval_summary_id, metric_summary_id, variant_key)` within each model

Each leaf-metric × variant-bucket becomes ONE `BenchmarkEvaluation`. Inside a bucket multiple `model_results` are merged:
- `evaluation_results[]` ← append every result's score record (concatenate, no dedup).
- `latestTimestamp` ← `MAX(retrieved_timestamp)` across the bucket.
- `source_metadata` ← the `source_metadata` of the row whose `retrieved_timestamp == latestTimestamp` (first one wins on ties because `>=`, see TS-quirk #1 below).
- `inlineSamples` ← first non-empty `parseInstanceLevelData(result.instance_level_data)` encountered; subsequent rows do not overwrite if `existing.inlineSamples` already has values.

The output `evaluation_id` for the merged record is `${metric.metric_summary_id}__${variantKey}`.

### Step 3 — group by `family-id` and reshape into `ModelEvaluationSummary`

Take the flat `BenchmarkEvaluation[]` and:
1. **Re-bucket by variant** (in `createModelFamilySummary`, `lib/eval-processing.ts:453-532`) using `getAggregatedVariantDescriptor(eval.model_info)`. Note: this is a SECOND variant resolution that re-derives variant identity from `model_info` rather than using the `variant_key` set in Step 1b. The two should agree post-#2; today they can disagree (see TS-quirk #2).
2. **Per variant:** call `createModelSummary` (`lib/eval-processing.ts:280-344`) which:
   - Buckets evaluations by `category` (the `BenchmarkEvaluation.category` field set in Step 1, falling back to `inferCategoryFromBenchmark(result.evaluation_name)` when missing).
   - Computes `total_evaluations = SUM(evaluations[i].evaluation_results.length)`.
   - Computes `last_updated = MAX(retrieved_timestamp)` rendered as ISO string.
   - Lists `categories_covered = DISTINCT(category)`.
3. **Sort variants** by `version_date DESC, total_evaluations DESC, variant_label ASC` (`sortVariants`, `lib/eval-processing.ts:436-451`).
4. **Family-level rollup:** call `createModelSummary(allEvaluations)` — same shape but at the family level — then overlay `model_family_id`, `model_route_id`, `model_family_name` from `getCanonicalModelIdentity(evaluations[0].model_info)`, and `raw_model_ids = SORTED DISTINCT(eval.model_info.id)`.

### Output
- Intermediate: `BenchmarkEvaluation[]` (the flat-list output of `flattenModelEvaluations`).
- Final: `ModelEvaluationSummary` (the family-rollup output of `createModelFamilySummary`).

Both are presentation shapes consumed by `lib/model-data.ts` getters and the model-detail pages.

## Current TS implementation

| Concern | Location | Notes |
|---|---|---|
| Tree walk + per-metric flatten + variant bucket reduction | `lib/hf-data.ts:1228-1378` (`flattenHierarchyNode`) | Recursive; inherits context via `buildFlattenHierarchyContext` |
| Public entry (per-model) | `lib/hf-data.ts:1384-1414` (`flattenModelEvaluations`) | Iterates `hierarchy_by_category` keys; maps category via `PIPELINE_CATEGORY_MAP` (`lib/hf-data.ts:1425-1435`) |
| Variant lookup builder | `lib/hf-data.ts:1063-1079` (`buildVariantLookup`) | |
| Per-result variant resolver | `lib/hf-data.ts:1081-1108` (`resolveVariantMeta`) | 4-tier fallback |
| Family-membership filter | `lib/hf-data.ts:1110-1131` (`belongsToModelFamily`) | |
| Per-variant model_info synthesizer | `lib/hf-data.ts:1133-1155` (`buildModelInfoForVariant`) | |
| Inline-samples parser | `lib/hf-data.ts:933` (`parseInstanceLevelData`) | Tolerant JSON/array parser |
| Hierarchy context builder | `lib/hf-data.ts:1175-1226` (`FlattenHierarchyContext` + `buildFlattenHierarchyContext`) | Inheritance-with-defaults for tree context |
| Bucket-merge timestamp comparator | `lib/hf-data.ts:1049-1061` (`toComparableTimestamp`) | Variant B from spec #07 — has the `parseFloat` quirk |
| Family rollup | `lib/eval-processing.ts:453-532` (`createModelFamilySummary`) | |
| Per-summary aggregation | `lib/eval-processing.ts:280-344` (`createModelSummary`) | Buckets by category, sums totals, max-timestamp |
| Variant descriptor (re-derived) | `lib/eval-processing.ts:360-434` (`getAggregatedVariantDescriptor`) | Re-runs setup-alias logic, this time from `model_info` |
| Variant sort | `lib/eval-processing.ts:436-451` (`sortVariants`) | |

### Caller sites
- `lib/model-data.ts:1495, 1497, 1518, 1520, 1530, 1532` — `getModelSummaryById` and slug-retry siblings.
- `lib/duckdb-data.ts:189-194` (`toModelSummary`) — DuckDB read path currently re-runs both adapters against the `payload_json` blob to match JSON-path output exactly. **This is the call site the SQL replacement targets.**
- `lib/eval-processing.ts:825` — batch path in `processEvaluationsToCards` (developer-aggregate flow).

## Required parquet columns

The current parquet schema (per `notes/migration-plan.md` § "Data direction"): 11 typed metadata columns + `payload_json VARCHAR`. SQL can route on the metadata columns but cannot see inside the blob. To do this operation in SQL, pipeline needs to promote the nested fields to a separate relational table.

### Proposed: `model_results.parquet` (one row per metric × model_result, post-flatten)

```
model_family_id            VARCHAR  -- routing key (matches model_summaries.parquet)
model_route_id             VARCHAR  -- routing key (matches model_summaries.parquet)
eval_summary_id            VARCHAR  -- from hierarchy node
category_key               VARCHAR  -- raw pipeline key ("agentic", "reasoning", ...) — TS maps via PIPELINE_CATEGORY_MAP at read time
benchmark                  VARCHAR
benchmark_family_key       VARCHAR
benchmark_family_name      VARCHAR
benchmark_parent_key       VARCHAR
benchmark_parent_name      VARCHAR
benchmark_leaf_key         VARCHAR
benchmark_leaf_name        VARCHAR
display_name               VARCHAR  -- post-inheritance from buildFlattenHierarchyContext
canonical_display_name     VARCHAR  -- post-inheritance
slice_key                  VARCHAR
slice_name                 VARCHAR
source_data                JSON     -- inherited; either struct or string[]
metric_summary_id          VARCHAR
metric_key                 VARCHAR
metric_name                VARCHAR
metric_display_name        VARCHAR
metric_canonical_display_name VARCHAR
metric_config              JSON
evaluation_id              VARCHAR  -- result-level
raw_model_id               VARCHAR
model_id                   VARCHAR
model_result_route_id      VARCHAR
model_name                 VARCHAR
developer                  VARCHAR
score                      DOUBLE
retrieved_timestamp        VARCHAR  -- ISO 8601 once #13 ships; today unix-seconds-string
source_metadata            JSON
detailed_evaluation_results VARCHAR
instance_level_data        JSON
variant_key                VARCHAR  -- pre-resolved per Step 1b (depends on #2 emitting it)
```

### Cross-item dependencies for the schema
- **#2 setup-alias merging** — `variant_key` must be the *normalized* key (post-`isSetupAliasQualifier` rules). Without this, Step 1b stays in TS or in a CTE that re-derives.
- **#13 timestamp normalization** — `retrieved_timestamp` must be a single canonical format (recommended: ISO 8601 string, lexicographic sort = chronological sort). Until then SQL needs `epoch_ms(CAST(retrieved_timestamp AS DOUBLE) * 1000)` plus a fallback for ISO strings — workable but the TS quirks (Variant B's `parseFloat` bug per spec #07) become unobservable only once the format is unified.
- **#4 source-metadata** (DONE) — pipeline already emits `source_metadata` on every row; the typed `source_metadata JSON` column is straightforward.
- **Category map** — TS currently maps the raw `category_key` ("agentic" → "Agentic", "coding" → "General", etc.) via `PIPELINE_CATEGORY_MAP` at read time. For this reshape we recommend leaving the raw key in parquet and applying the case mapping in SQL via a small CASE expression (or keeping it client-side until #11 lands).
- **Family-membership filter** — Step 1a needs `raw_model_ids` set per family. Easiest path: pipeline filters at emission time so every row in `model_results.parquet` is already guaranteed to belong to its `model_family_id`. Then SQL just `WHERE model_family_id = ?` and the TS `belongsToModelFamily` logic disappears.

### Independent of schema decisions
- **The variant bucket reduction itself** is pure SQL once timestamps are comparable; doesn't need any new schema beyond the row-per-result table.
- **`createModelSummary`'s category bucketing + totals** is also pure SQL once a row-per-result table exists.

## Sketch SQL query

Assumes the proposed `model_results.parquet` schema, ISO-8601 timestamps, and pipeline-side family-membership filtering.

### Step 1+2 — flat list, with variant-bucket dedup applied (one row per `(eval_summary_id, metric_summary_id, variant_key)`)

```sql
WITH
results AS (
  SELECT *
  FROM read_parquet('model_results.parquet')
  WHERE model_family_id = ?  -- single-model query
),
-- Within a (eval_summary_id, metric_summary_id, variant_key) bucket, pick the
-- row whose retrieved_timestamp is freshest. Aggregate the rest as arrays.
freshest AS (
  SELECT *
  FROM results
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY eval_summary_id, metric_summary_id, variant_key
    ORDER BY retrieved_timestamp DESC, evaluation_id DESC  -- tie-break stable
  ) = 1
),
bucket_results AS (
  SELECT
    eval_summary_id,
    metric_summary_id,
    variant_key,
    list({
      evaluation_name: metric_name,
      display_name: metric_display_name,
      canonical_display_name: metric_canonical_display_name,
      metric_summary_id: metric_summary_id,
      metric_key: metric_key,
      evaluation_timestamp: retrieved_timestamp,
      source_data: source_data,
      metric_config: metric_config,
      score_details: { score: score },
      detailed_evaluation_results_url: detailed_evaluation_results
    } ORDER BY retrieved_timestamp) AS evaluation_results,
    -- first non-empty inline-samples in insertion order
    list_filter(list(instance_level_data ORDER BY retrieved_timestamp), x -> x IS NOT NULL)[1]
      AS inline_samples
  FROM results
  GROUP BY eval_summary_id, metric_summary_id, variant_key
)
SELECT
  '0.2.2' AS schema_version,
  f.eval_summary_id,
  f.metric_summary_id || '__' || f.variant_key AS evaluation_id,
  f.retrieved_timestamp,
  f.benchmark,
  f.display_name,
  f.canonical_display_name,
  f.category_key AS category,  -- map to CategoryType in app layer or via CASE here
  f.benchmark_family_key, f.benchmark_family_name,
  f.benchmark_parent_key, f.benchmark_parent_name,
  f.benchmark_leaf_key,   f.benchmark_leaf_name,
  f.slice_key, f.slice_name,
  f.source_data,
  f.source_metadata,
  -- model_info synthesized per buildModelInfoForVariant
  struct_pack(
    id := COALESCE(f.raw_model_id, f.model_id),
    name := f.model_name,
    developer := f.developer,
    model_version := CASE WHEN f.variant_key <> 'default' THEN f.variant_key ELSE NULL END
  ) AS model_info,
  br.evaluation_results,
  br.inline_samples AS detailed_evaluation_results_per_samples
FROM freshest f
JOIN bucket_results br USING (eval_summary_id, metric_summary_id, variant_key);
```

### Step 3 — family summary (rolling up the flat list)

```sql
WITH flat AS ( /* the query above */ ),
per_variant AS (
  SELECT
    variant_key,
    MAX(retrieved_timestamp) AS last_updated,
    SUM(len(evaluation_results)) AS total_evaluations,
    array_agg(DISTINCT category) AS categories_covered,
    -- evaluations grouped by category as a struct of arrays
    map_from_entries(
      array_agg(struct_pack(category := category, eval := flat))
        OVER (PARTITION BY variant_key)  -- pseudocode; real shape uses GROUP BY + LIST_AGG
    ) AS evaluations_by_category
  FROM flat
  GROUP BY variant_key
),
family AS (
  SELECT
    MAX(retrieved_timestamp) AS last_updated,
    SUM(len(evaluation_results)) AS total_evaluations
  FROM flat
)
SELECT * FROM per_variant, family;
```

(The `evaluations_by_category` map is awkward in SQL — most consumers will end up assembling it client-side from the flat-list query. That's fine; the operationally important reshape is Steps 1+2.)

## Materialize vs query-time

- **Materialize upstream if:** the answer is identical for every consumer. The flat `model_results` table absolutely should be materialized — every consumer of model-detail pages needs it, and re-walking the tree on every request is exactly what we're trying to leave behind.
- **Query-time SQL if:** consumers slice differently. Step 3 (family summary) is consumer-shape — different pages want different slices (per-category, per-variant, per-benchmark). Run it as a query.

**Recommendation: materialize Steps 1+2 (the flat post-bucket-reduction table) into `model_results.parquet`; compute Step 3 (family summary, category bucketing) at query time.**

Rationale: the tree-walk + variant-bucket reduction is invariant work that every model-detail page needs identically — pre-computing it removes the recursive walk from the request hot path. The category bucketing and variant rollup, by contrast, are presentation-shape transforms that vary per page (model-detail wants per-variant, eval-detail wants per-benchmark, etc.) — keeping them in SQL lets each consumer slice without paying for the others' shapes.

A nice property: this split also lets `eval_summaries.parquet` and `developer_summaries.parquet` reuse the same `model_results.parquet` rows — they're currently re-walking the same tree from their own angles.

## TS-as-spec quirks

The reshape SQL must preserve these or explicitly defer them as product decisions. Don't unilaterally fix.

1. **`>=` not `>` in the bucket-merge timestamp comparison.** `lib/hf-data.ts:1310-1313`: when a later result ties an earlier result's timestamp exactly, the LATER one wins (overwrites `latestTimestamp` and `sourceMetadata`). With `ROW_NUMBER() … ORDER BY retrieved_timestamp DESC` SQL gets implementation-defined tie-breaking unless you add an explicit secondary sort. Recommendation: tie-break on `evaluation_id DESC` (or another stable secondary key) and document that it differs from TS's "later in iteration order wins" for cross-bucket ties. Quantify on actual data before shipping; if collisions are rare, the divergence is acceptable.

2. **Variant identity is computed twice with potentially different rules.** Step 1b (`resolveVariantMeta` in `lib/hf-data.ts`) uses `variants[].raw_model_ids` lookup — strict id match. Step 3 (`getAggregatedVariantDescriptor` in `lib/eval-processing.ts:394-434`) re-derives from `model_info.additional_details.mode` + `getCanonicalModelIdentity`. These can disagree: e.g. a result whose Step-1b `variant_key` is `"20240620-thinking"` becomes Step-3 `variant_key: "2024-06-20"` (setup-alias merging collapses the qualifier). The SQL replacement should produce a single canonical `variant_key` per result post-#2 and not re-bucket later. Today's TS double-bucketing is a likely source of subtle off-by-one variant counts; capture it as observed behavior and decide the desired single-pass semantics with the pipeline owner before reshaping.

3. **Inline-samples merge is "first non-empty wins, no overwrite"**, NOT "freshest wins." If the first result emitted into a bucket has no `instance_level_data` and a later result does, that later one's samples are kept. If both have samples, the FIRST one's are kept regardless of timestamp. This is a separate code path from the timestamp-keyed metadata merge. SQL replacement preserves this with `list_filter(list(instance_level_data ORDER BY <iteration order>), x -> x IS NOT NULL)[1]` — but iteration order in TS is `metric.model_results[]` array order from the parquet, which SQL needs an explicit sort to mimic. This is fragile; flag for synthesis.

4. **Category in Step 1 is the per-node `category_key` from `hierarchy_by_category` keys, not from each `model_result`.** Two results landing in different category branches but for the same `(metric_summary_id, variant_key)` pair would produce two separate `BenchmarkEvaluation` entries, not one merged. This is structural to how the tree walk works; SQL needs to include `category_key` (or `eval_summary_id`, which is per-leaf) in the GROUP BY.

5. **`PIPELINE_CATEGORY_MAP` lossy collapses.** `coding`, `instruction_following`, `language_understanding` all map to `"General"`. This is intentional (per the comment at `lib/hf-data.ts:1419-1424`) until #11 (category accuracy) ships. The SQL should preserve the same mapping at read time, or push the map into a typed column emitted by pipeline.

## Cross-item dependencies

### Cleaning items that must land first
- **#2 setup-alias merging** — provides the canonical `variant_key` Step 1b currently re-derives. Without it, the SQL needs a CTE that re-runs the alias-qualifier rules in DuckDB (workable but ugly).
- **#13 timestamp normalization** — provides comparable `retrieved_timestamp` so `MAX()` / `ROW_NUMBER() ORDER BY` are correct. Today's mixed-format strings sort lexicographically wrong (`"1774096306"` < `"2024-..."`).
- **#4 source-metadata** — DONE. Step 2's "freshest source_metadata wins" needs every row to carry it; this is already true.

### Reshape items this feeds
- **#5 composite eval rollup** (`aggregateBenchmarkSummaries`) — also walks model evaluations per benchmark; would consume the flat `model_results` table directly rather than re-walking trees.
- **#6 matrix leaderboard synthesis** — same.
- **#14 score summary stats** — finalizes the per-benchmark grouping; consumes the flat table.

### Pipeline-side prerequisites
- Pipeline must emit a relational `model_results.parquet` (or equivalent table) with the columns above. This is the schema-relationality conversation flagged in `notes/migration-plan.md`.
- Pipeline-side family-membership filter (so the SQL doesn't have to replicate `belongsToModelFamily`).
- Decide where `PIPELINE_CATEGORY_MAP` lives (pipeline emits mapped string vs SQL CASE vs TS-side map).

## Migration checklist

- [x] Operation cataloged
- [ ] Schema delta proposed (in synthesis doc `notes/transformations/reshape-design.md`)
- [ ] SQL query reviewed by pipeline owner
- [ ] Pipeline emits `model_results.parquet` with the relational columns
- [ ] DuckDB query implemented in `lib/duckdb-data.ts` (replaces `toModelSummary`'s `flattenModelEvaluations(payload) → createModelFamilySummary(...)` chain at line 189-194)
- [ ] Parity test (TS vs SQL output) passes — see `notes/testing-strategy.md` § "Reshape-class items: testing addendum" for the snapshot-as-parity-gate pattern. Snapshot lives at `tests/adapters/flatten-model-evaluations.test.ts` (per the deferred plan in testing-strategy.md § "Test-additions deferred to specific migration items") and `tests/adapters/create-model-family-summary.test.ts`.
- [ ] TS code deleted: `flattenHierarchyNode`, `flattenModelEvaluations`, `buildFlattenHierarchyContext`, `buildVariantLookup`, `resolveVariantMeta`, `belongsToModelFamily`, `buildModelInfoForVariant` in `lib/hf-data.ts`; `createModelFamilySummary`, `createModelSummary`, `getAggregatedVariantDescriptor`, `sortVariants` in `lib/eval-processing.ts`. Callers in `lib/model-data.ts:1495-1532` and `lib/eval-processing.ts:825` switch to the SQL-backed reader.

## Future product decisions (deferred)

- Whether the double-pass variant resolution (Step 1b vs Step 3) should be reconciled to a single `variant_key`. Likely yes once #2 lands; flag for the synthesis.
- Whether `>=` (TS today) or `>` (more conventional "first wins ties") is the desired bucket-merge tie-break. Current TS quirk is observable but rare in production.
- Whether `evaluations_by_category` should be re-shaped client-side from a flat-list query or carried as a nested column. The latter is awkward in SQL/Parquet; recommendation is the former.
