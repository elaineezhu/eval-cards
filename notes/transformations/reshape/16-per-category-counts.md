# Per-category benchmark counts

Drafted 2026-04-28. Migration item **#16** in `notes/migration-plan.md`. **Reshape class** — the operation lives in DuckDB SQL (materialized into the parquet artifact). Use this spec as the canonical "obvious SQL" example: it is the smallest, clearest reshape item in the migration.

## Framing reminder

We are refactoring for UI efficiency, not data correctness. TS-as-is is the canonical spec for *behavior preservation* — except this is the rare reshape item where the current TS is **demonstrably wrong** (it ships a fake distribution; see TS-as-spec quirks below). The migration replaces wrong-with-correct, so the snapshot delta on switch-over is *expected* and the snapshot itself cannot be the gate. The gate is: "real per-category counts populate the same `category_stats: Record<Category, number>` shape; UI renders without divergence." See `notes/testing-strategy.md` § "Reshape-class items: testing addendum".

## Migration item

| Field | Value |
|---|---|
| Item | #16 |
| Class | Reshape |
| Operation | per-(model, category) DISTINCT-benchmark count |
| Materialize? | Yes — small fixed shape, identical for every consumer |
| Target column | `category_stats: Record<CategoryType, number>` on the model card payload (already the consumer-facing field) |
| TS files affected | `lib/model-data.ts:369-379` (the wrong fake), `lib/eval-processing.ts:653-666` (the correct heavy-data path) |
| Pipeline file expected | `scripts/pipeline.py` model-card writer; populate `category_stats` in `model-cards.json` summary entries |

## Operation in SQL terms

Group every model_result row by `(model_route_id, category)` and count distinct `benchmark_family_key`. The result is the per-model, per-category benchmark-coverage count consumed by the model card UI.

This is one statement. It has no edge cases beyond null/empty handling and the choice of grouping key (route-id vs family-id) — both already settled by the existing parquet schema.

## Current TS implementation

There are **two implementations** of `category_stats` in TS today, depending on which data path supplies the model card:

### Path A — `lib/model-data.ts:360-380` (`hfModelCardToEvaluationCardData`)

Input: `HFModelCardEntry` (the lightweight `model-cards.json` summary; `entry.categories_covered: string[]`, `entry.total_evaluations: number`, no per-category breakdown).

Logic at lines 369-379 (verbatim):

```ts
// Distribute total evaluations across categories proportionally
const categoryStats: Record<string, number> = {}
const perCat = categories.length > 0
  ? Math.max(1, Math.floor(entry.total_evaluations / categories.length))
  : 0
let remaining = entry.total_evaluations
for (let i = 0; i < categories.length; i++) {
  const count = i === categories.length - 1 ? remaining : Math.min(perCat, remaining)
  categoryStats[categories[i]] = count
  remaining -= count
}
```

This is the **fake distribution**. It does not look at any per-category data because the input doesn't carry any. It just slices `total_evaluations` evenly across `categories.length`, with the last category taking the rounding remainder.

Callers of `hfModelCardToEvaluationCardData` (the listing/grid pages where this fake fires):
- `lib/model-data.ts:1235, 1242` — model index sorting
- `lib/model-data.ts:1386, 1416, 1455` — developer detail pages, comparison pages
- `lib/duckdb-data.ts:163` — DuckDB shadow read parity path

### Path B — `lib/eval-processing.ts:653-666` (`createModelFamilySummary` → `categoryStats`)

Input: full `BenchmarkEvaluation[]` (per-eval-detail data, with `evaluations_by_category` populated).

Logic at lines 653-666 (verbatim):

```ts
// Calculate category stats (count of unique benchmarks per category)
const categoryStats: Record<CategoryType, number> = {} as any

for (const category of summary.categories_covered) {
  const evals = summary.evaluations_by_category[category] || []
  const categoryBenchmarks = new Set<string>()

  for (const eval_ of evals) {
    for (const result of eval_.evaluation_results) {
      categoryBenchmarks.add(getBenchmarkName(eval_, result))
    }
  }
  categoryStats[category] = categoryBenchmarks.size
}
```

This is the **real distribution**: COUNT(DISTINCT benchmark) per category, computed from the heavy nested data. Used on model-detail pages where the full payload is loaded.

Callers of `createModelFamilySummary`:
- `lib/model-data.ts:1497, 1520, 1532` — model-detail pages
- `lib/duckdb-data.ts:194` — DuckDB shadow read for model detail

The two paths produce **different `category_stats` for the same model** today. The grid/index UI sees the fake distribution; the detail page sees the real one. No code reconciles them.

## Required parquet columns

The pipeline already emits the columns needed (per the schema documented in `notes/migration-plan.md` § "Data direction" — `record_type`, `model_route_id`, `model_family_id`, `eval_summary_id`, `developer_route_id`, `developer`, `category`, `benchmark_family_key`, `models_count`, `total_evaluations`, `last_updated`, `payload_json`). For this aggregation:

- `model_route_id` — group key (per-model)
- `category` — group key (per-category)
- `benchmark_family_key` — distinct-count target

No schema change needed for the SQL to run. Confirm against `scripts/pipeline.py:write_experimental_parquet_table` in the pipeline repo when handing off — the column list above is from documentation, not direct inspection.

## Sketch SQL query

```sql
SELECT
  model_route_id,
  category,
  COUNT(DISTINCT benchmark_family_key) AS benchmark_count
FROM model_results
WHERE record_type = 'model_result'  -- if needed; depends on whether row is pre-filtered
  AND benchmark_family_key IS NOT NULL
GROUP BY model_route_id, category
```

To materialize as the `category_stats: Record<CategoryType, number>` shape that the consumer expects, pivot per model:

```sql
SELECT
  model_route_id,
  MAP_FROM_ENTRIES(
    LIST({k: category, v: COUNT(DISTINCT benchmark_family_key)})
  ) AS category_stats
FROM model_results
WHERE benchmark_family_key IS NOT NULL
GROUP BY model_route_id
```

(DuckDB syntax for assembling a `MAP(category VARCHAR, count BIGINT)`. The pipeline writer can also assemble the dict in Python after running the basic GROUP BY — equivalent.)

Verification: against the live cache, `total_evaluations` for a given model should approximately equal `SUM(benchmark_count)` across its categories — *approximately* because today's TS fake guarantees the sum, but the real count is "distinct benchmarks per category" which can sum to less (a benchmark in two categories gets counted once per category) or more than `total_evaluations` (which is row-count, not distinct-benchmark-count). This sum-divergence is the load-bearing finding for "the fake was always wrong, not just imprecise."

## Materialize vs query-time

**Materialize.** This is the unambiguous case for materialization:

- The aggregation is small (one row per model × number-of-categories ≤ 9, so ≤ ~50k cells across the full corpus of 5,830 models).
- The answer is identical for every consumer — no slicing, no filtering. Both the grid and the detail page want the same `Record<Category, number>`.
- The consumer shape is already known and stable: `category_stats: Record<CategoryType, number>` on the model card.
- Materializing into `model-cards.json` (summary path) eliminates Path A's fake entirely; the detail path can keep its own computation initially, but eventually both reads from the materialized field.

Recommended landing: pipeline emits `category_stats` as a dict on each model card summary entry. Both TS Path A and Path B then read the field directly; both implementations get deleted.

## TS-as-spec quirks (Path A — the fake)

These are the precise behaviors today. Document them — even though they're wrong — because they may have shaped UI design:

1. **Always-equal counts.** With `Math.floor(total / categories.length)`, every category gets an identical `perCat` value (modulo rounding). For a model with `total_evaluations = 12` and `categories = ["Reasoning", "Coding", "Math", "Knowledge"]`, every category gets `3`. Real data would not look like this.

2. **`Math.max(1, …)` floor.** When `total_evaluations < categories.length`, `Math.floor` would yield `0`, but `Math.max(1, …)` forces at least `1`. So a model with `total_evaluations = 2` and `categories.length = 4` ends up with the first 2 categories at `1` each and the remainder distributed via `Math.min(perCat, remaining)` — practically: category 0 → 1, category 1 → 1, category 2 → 0 (because remaining = 0 and `Math.min(1, 0) = 0`), category 3 → 0 (last category takes `remaining = 0`). So you get `{ cat0: 1, cat1: 1, cat2: 0, cat3: 0 }` for total=2, categories=4. **Not always-equal** in this branch — a quirk worth flagging.

3. **Last-category-takes-remainder.** The terminal category collects `remaining` instead of `perCat`, so it can be larger than the others when `total % categories.length != 0`. For `total = 13, categories.length = 4`, you get `{ 3, 3, 3, 4 }`. The last category in the array (alphabetical or insertion order from `mapHFCategories`) silently looks more covered than the others.

4. **Zero-categories edge.** `categories.length === 0` → `perCat = 0`, loop never runs, `categoryStats = {}`. The consumer gets an empty record. UI must handle. (`benchmark-evaluation-card.tsx:248-257` filters `count > 0` before rendering, so empty is safe; verified.)

5. **Zero-total-evaluations edge.** `total_evaluations = 0`, `categories.length > 0` → `perCat = Math.max(1, 0) = 1`. Then `remaining = 0`, loop iterates: `i = 0`, `count = Math.min(1, 0) = 0`, `categoryStats[cat0] = 0`, `remaining = 0`. Subsequent iterations same. Last iteration: `count = remaining = 0`. Final: `{ cat0: 0, cat1: 0, … }`. The `Math.max(1, …)` doesn't bite here because `Math.min(perCat, remaining=0) = 0`. UI sees all-zeros, filters them out via `count > 0` check. Safe.

6. **No relation to actual benchmark distribution.** A model could have all 50 of its evaluations in `Knowledge` and 0 in `Reasoning`, but if the categories list is `["Knowledge", "Reasoning"]` (because some other model in the same category exposure was tagged that way, or because the upstream `categories_covered` was a union), the fake shows `25` and `25`. There is no signal in the input that lets the fake do better.

7. **Path A vs Path B disagreement.** Same model, two pages, two answers. Today's grid shows fake; today's detail shows real. The pipeline materialization eliminates this.

### TS-as-spec quirks (Path B — the real one)

Path B is essentially correct (COUNT(DISTINCT benchmark) per category) but uses `getBenchmarkName(eval_, result)` as the distinct key rather than `benchmark_family_key`. Two divergences:

- The display-name path (#8 in the migration catalog) is messy — different evals can map to the same display name even with different family keys. The SQL `COUNT(DISTINCT benchmark_family_key)` is the right key going forward; expect small count differences vs Path B today on models where a benchmark family has multiple display-named members. Document as expected when running parity.
- Path B counts at the (eval, result) level — one eval can carry multiple results, each with its own `benchmark`. The SQL on `model_results` rows is at the same granularity (one row per result), so the COUNT(DISTINCT benchmark_family_key) GROUP BY (model_route_id, category) will line up.

## UI components to audit when going from fake-equal to real-uneven counts

1. **`components/benchmark-evaluation-card.tsx:248-257`** — `categoryCoverage` derived value. Filters `count > 0` (safe under both fake and real), sorts by `count desc, category asc`. Today the sort is effectively a tie-break on category name because counts are always equal under fake; once counts are real, the sort starts ordering by actual coverage. **Visual change: bar/chip ordering shifts.** Worth a screenshot diff.

2. **`components/benchmark-evaluation-card.tsx:240-247`** — `topDomains` (above the category coverage block). Independent of `category_stats`, but the visual proximity means if categoryCoverage starts looking lopsided, design might want to revisit ordering of the two adjacent blocks.

3. **Card grid alignment.** If grid cells display category counts as side-by-side bars (need to grep templates), today every model's bars are equal width within itself; under real counts they'll be uneven. CSS that assumes "always-equal" widths might overflow or look awkward.

4. **Filter UI / faceted browse (if any).** Searching by "models with > N benchmarks in Reasoning" today returns weird answers (e.g. a 12-eval model with 4 categories registers as 3 in Reasoning even if it has 0 actual reasoning benchmarks). After the migration, this becomes meaningful — and any test fixtures that assumed "all models register in all their listed categories" need updating.

No widespread breakage is expected; the consumer shape is unchanged. The risk is cosmetic (sort order, bar widths) and statistical (filters that were lying now tell truth).

## Cross-item dependencies

- **#11 category inference.** The SQL groups by the pipeline's `category` column. Today 84% of evals emit `category: "other"` (per `notes/migration-plan.md`), which would collapse most distinct-benchmark counts into one giant `other` bucket — defeating the point of the per-category breakdown. **#16 is blocked on #11 producing useful category labels.** Or alternatively: the pipeline-side aggregation must run after applying TS's regex category inference, by porting `inferCategoryFromBenchmark` upstream first.
- **#8 benchmark display names.** Affects the *labels* shown next to the count, not the count itself. Independent.
- **#3 hierarchy flatten.** The SQL groups by `model_route_id`, which is the post-flatten family identity. If hierarchy flattening changes the route-id assignment, recompute. Should be stable for now.

## Migration checklist

- [x] Spec written
- [ ] Tests cover the materialized-output shape (`Record<CategoryType, number>` with non-negative integers, sum vs total_evaluations divergence accepted)
- [ ] Confirm parquet schema columns (`model_route_id`, `category`, `benchmark_family_key`) against `scripts/pipeline.py:write_experimental_parquet_table` in pipeline repo
- [ ] Filed with pipeline owner — recommend materializing `category_stats` into `model-cards.json` summary entries (smallest, clearest reshape) and **flag dependency on #11 category accuracy**
- [ ] Pipeline emits `category_stats` populated for all 5,830 model card entries
- [ ] Adapter snapshot regenerated; review the diff (it WILL be large because the fake is replaced) — the snapshot is *not* the gate, the materialized-shape contract is
- [ ] TS deleted: remove the fake at `lib/model-data.ts:369-379`, remove the categoryStats block at `lib/eval-processing.ts:653-666`, both paths read `entry.category_stats` from the pipeline field
- [ ] UI screenshot diff on `components/benchmark-evaluation-card.tsx` to confirm the now-uneven bars render acceptably; design tweak if not
