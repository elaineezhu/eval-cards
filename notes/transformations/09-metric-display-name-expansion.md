# Metric display name expansion

Drafted 2026-04-28. Migration item #10 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency. TS-as-is is the canonical spec. Originally both functions in this spec were claimed to be "defensive scaffolding firing 0 times against current data." That claim was **partially wrong** and is corrected below (verified 2026-04-28).

This spec covers two related functions with the same product intent (expand a non-informative metric name by prefixing the benchmark), but they have very different statuses in the current codebase:

1. **`getEvaluationDisplayName`** (`lib/eval-processing.ts:70-86`) — **DEAD CODE via orphaned caller chain.** Its callers (`createEvaluationCard` line 537, `groupEvaluationsByBenchmark` line 893) are exported from `lib/eval-processing.ts` but never invoked from `app/`, `components/`, or any other `lib/` file. The function never runs in production. (The earlier audit's "0 fires" was correct in result but incorrect in reasoning — it audited `evaluations_by_category` from cache files, which is pipeline-pre-flattened. The function actually consumes the *post-`flattenModelEvaluations`* shape, where bare-generic names ARE present.)
2. **`prefersBenchmarkName`** (`lib/model-data.ts:462-470`) — **active code path that fires 0 times against current data.** It runs inside `hfEvalEntryToListItem`, which is called from `lib/model-data.ts:1261, 1301` and `lib/duckdb-data.ts:171` — all live read paths. None of the 4 heuristic patterns match any of the 587 eval-list entries in production.

This split matters because the migration recommendations are different for each. See "Recommended migration path" below.

## Rule (as TS implements it today)

### Rule 1 — `getEvaluationDisplayName(evaluation, result)`

Computes the display string for one `evaluation_result` row.

```
benchmarkName = getBenchmarkName(evaluation, result)
metricName    = result.evaluation_name.trim()

if metricName === benchmarkName:           return metricName       // already redundant; show once
if GENERIC_EVALUATION_NAMES.has(metricName.toLowerCase()):
                                            return `${benchmarkName} - ${metricName}`
otherwise:                                  return metricName
```

`GENERIC_EVALUATION_NAMES` is a 6-entry lowercase-keyed set (`lib/eval-processing.ts:27-34`):

| Key |
|---|
| `score` |
| `accuracy` |
| `mean win rate` |
| `exact match` |
| `f1` |
| `pass@1` |

`getBenchmarkName` (`lib/eval-processing.ts:49-68`) resolves the benchmark string with this precedence:

1. `result.source_data.dataset_name` (when source_data is an object, not an array)
2. `evaluation.benchmark`
3. `evaluation.source_data.dataset_name` (when source_data is an object)
4. `result.evaluation_name`
5. `evaluation.evaluation_id`

### Rule 2 — `prefersBenchmarkName` (inline, `lib/model-data.ts:459-470`)

Decides whether to substitute the benchmark display name for an eval-list entry's display string.

```
benchmarkDisplayName = getBenchmarkDisplayName(entry.benchmark_parent_name || entry.benchmark || "")
rawDisplayName       = entry.evaluation_name || entry.display_name || entry.benchmark_leaf_name || entry.eval_summary_id
normalized           = rawDisplayName.trim().toLowerCase()

prefersBenchmarkName = Boolean(benchmarkDisplayName) && (
  normalized.startsWith("accuracy on ") ||
  normalized.startsWith("score on ")    ||
  normalized.includes("for scorer")     ||
  normalized.includes("model_graded")
)

evaluation_name on output = prefersBenchmarkName ? benchmarkDisplayName : rawDisplayName
```

Note the asymmetry: the first two checks are `startsWith`, the second two are `includes`. This is faithful to the TS code (not "fixed" here).

## Classification

- **Unconditional normalization.** Both rules always run on whatever metric/eval string is present; neither defers to a pre-existing canonical field. Pipeline-side fix: emit the final `display_name` already in expanded form (or leave it as-is for the cases where neither rule fires — i.e. all 86,183 production rows today). No consumer should re-derive.
- **Cleaning → pipeline.** Pure value transform on a single field per record. No aggregation, no joining, no record merging. Migration target: pipeline emits `display_name` already in the form TS would produce; TS deletes both helpers and inlines a direct field read.

## Inputs and expected outputs

Each row corresponds to a parameterized test case in `tests/transformations/metric-display-name-expansion.test.ts`.

### Group A — `getEvaluationDisplayName`: generic name expansion

Input: `(evaluation, result)` synthesized so `getBenchmarkName` resolves to the value in the "benchmark" column.

| benchmark | result.evaluation_name | Output | Why |
|---|---|---|---|
| `MMLU` | `Accuracy` | `MMLU - Accuracy` | metric `accuracy` is generic → prefix benchmark |
| `GSM8K` | `accuracy` | `GSM8K - accuracy` | lowercased generic still triggers; output keeps original casing of metric |
| `MATH` | `EXACT MATCH` | `MATH - EXACT MATCH` | uppercase generic still triggers (set check is `.toLowerCase()`) |
| `RewardBench` | `Mean Win Rate` | `RewardBench - Mean Win Rate` | "mean win rate" is in the set |
| `HumanEval` | `pass@1` | `HumanEval - pass@1` | symbol-bearing generic still in the set |
| `SuperGLUE` | `f1` | `SuperGLUE - f1` | shortest generic |
| `OpenBookQA` | `Score` | `OpenBookQA - Score` | "score" is generic |

### Group B — `getEvaluationDisplayName`: passthrough (non-generic)

| benchmark | result.evaluation_name | Output | Why |
|---|---|---|---|
| `MMLU` | `MMLU` | `MMLU` | metricName === benchmarkName → return as-is (early return; expansion never considered) |
| `MMLU` | `BLEU` | `BLEU` | not in generic set → passthrough |
| `RewardBench` | `Chat Hard` | `Chat Hard` | not generic, distinct from benchmark → passthrough |
| `MMLU` | `accuracy_strict` | `accuracy_strict` | substring of "accuracy" but not equal → not in set → passthrough |
| `MMLU` | `Accuracy ` (trailing space) | `MMLU - Accuracy` | `.trim()` on metricName before set lookup → matches |
| `MMLU` | `   accuracy   ` | `MMLU - accuracy` | trim happens to metricName |

### Group C — `getEvaluationDisplayName`: `getBenchmarkName` precedence

These exercise the resolution chain that feeds the rule.

| Setup | Resolved benchmark | Why |
|---|---|---|
| `result.source_data = { dataset_name: "RewardBench" }`, `evaluation.benchmark = "reward-bench"` | `RewardBench` | result.source_data.dataset_name wins (precedence #1) |
| `result.source_data = ["url1", "url2"]` (array), `evaluation.benchmark = "reward-bench"` | `reward-bench` | array source_data is skipped → falls to `evaluation.benchmark` |
| `result.source_data = undefined`, `evaluation.benchmark = "reward-bench"` | `reward-bench` | evaluation.benchmark (precedence #2) |
| `result.source_data = undefined`, `evaluation.benchmark = ""`, `evaluation.source_data = { dataset_name: "MMLU" }` | `MMLU` | evaluation.source_data.dataset_name (precedence #3) — note empty string is falsy |
| All sources empty, `result.evaluation_name = "Foo"` | `Foo` | precedence #4 |
| All empty, `evaluation.evaluation_id = "id-123"` | `id-123` | precedence #5 (final fallback) |

### Group D — `prefersBenchmarkName`: heuristic matches

For each, the eval-list entry has `benchmark_parent_name = "MMLU"` (so `benchmarkDisplayName` resolves to a non-empty string).

| `evaluation_name` (input) | Output `evaluation_name` | Why |
|---|---|---|
| `accuracy on subset_humanities` | `MMLU` | `startsWith("accuracy on ")` |
| `Accuracy On SubsetHumanities` | `MMLU` | normalized to lowercase before startsWith |
| `score on test_set` | `MMLU` | `startsWith("score on ")` |
| `xyz for scorer judge_v2` | `MMLU` | `includes("for scorer")` (anywhere in string) |
| `for scorer xyz at start` | `MMLU` | `includes("for scorer")` matches at start too |
| `something model_graded thing` | `MMLU` | `includes("model_graded")` (underscore, not space) |
| `model_graded` | `MMLU` | substring match works on the whole string |

### Group E — `prefersBenchmarkName`: passthrough

| `evaluation_name` | Output | Why |
|---|---|---|
| `MMLU - Accuracy` | `MMLU - Accuracy` | does not start with "accuracy on " (has prefix); no other token matches |
| `Accuracy` | `Accuracy` | bare "accuracy" doesn't satisfy `startsWith("accuracy on ")` (no " on ") |
| `accuracy onset` | `accuracy onset` | "accuracy on" with no trailing space; the rule literal is `"accuracy on "` (note trailing space) — but "accuracy onset".startsWith("accuracy on ") is **false** because position 11 is "s" not " ". Good — no match. |
| `score onyx` | `score onyx` | `startsWith("score on ")` requires literal trailing space — "onyx" fails |
| `Model Graded Eval` | `Model Graded Eval` | `model_graded` (underscore) does not match "Model Graded" (space) after lowercasing → "model graded eval" does not contain "model_graded" |
| `accuracy_for_scorer` | `accuracy_for_scorer` | `for scorer` (with space) does not match `for_scorer` after lowercasing — "accuracy_for_scorer" does not contain "for scorer" |
| `Scorer based eval` | `Scorer based eval` | "scorer based eval" does not contain "for scorer" |
| `BBH` | `BBH` | none of the four conditions match |

### Group F — `prefersBenchmarkName`: `benchmarkDisplayName` empty short-circuits

| Setup | Output | Why |
|---|---|---|
| `benchmark_parent_name = ""`, `benchmark = ""`, `evaluation_name = "accuracy on x"` | `accuracy on x` (raw) | `Boolean(benchmarkDisplayName)` is false → `prefersBenchmarkName = false` → falls back to raw |

### Group G — `prefersBenchmarkName`: `rawDisplayName` precedence

Order: `entry.evaluation_name` → `entry.display_name` → `entry.benchmark_leaf_name` → `entry.eval_summary_id`.

| Setup | rawDisplayName | Why |
|---|---|---|
| `evaluation_name = "score on x"` | `score on x` | first non-falsy field |
| `evaluation_name = ""`, `display_name = "MMLU"` | `MMLU` | empty string is falsy → falls through |
| All empty except `eval_summary_id = "id_xyz"` | `id_xyz` | final fallback |

## Current TS implementation

| Concern | Location |
|---|---|
| Generic-names set | `lib/eval-processing.ts:27-34` (`GENERIC_EVALUATION_NAMES`) |
| Benchmark-name resolver | `lib/eval-processing.ts:49-68` (`getBenchmarkName`) |
| Per-result expansion | `lib/eval-processing.ts:70-86` (`getEvaluationDisplayName`) |
| Eval-list-entry heuristic | `lib/model-data.ts:459-470` (`prefersBenchmarkName`, inline; assigns to `evaluation_name` field) |
| Benchmark display name (used by Rule 2) | `lib/model-data.ts:146-148` (`getBenchmarkDisplayName`) |

### Call sites

`getEvaluationDisplayName` (2 call sites, both internal to `lib/eval-processing.ts`):

| Location | Context |
|---|---|
| `lib/eval-processing.ts:631` | `processModelEvaluations` — populates `allScores[].benchmark` for per-model score aggregation |
| `lib/eval-processing.ts:900` | `groupEvaluationsByBenchmark` — populates `BenchmarkEvalSummary.evaluation_name` keyed by `eval_summary_id` |

`prefersBenchmarkName` (1 call site, declared inline):

| Location | Context |
|---|---|
| `lib/model-data.ts:462-470` | `hfEvalEntryToListItem` — sets `evaluation_name` on `BenchmarkEvalListItem` for the browse-evals list page |

`GENERIC_EVALUATION_NAMES`: only consumed by `getEvaluationDisplayName` itself.

## Pipeline status — divergences

### Side-by-side comparison table

| Aspect | TS (this spec) | Pipeline today | Result for users |
|---|---|---|---|
| Where expansion runs | request time, in 3 call sites total | not implemented as a transform; pipeline emits `display_name` / `evaluation_name` already in their final form | TS expansion logic exists but never fires against current pipeline output |
| Generic-name detection | runtime check against 6-entry set | n/a — no metric in production has a bare-generic `evaluation_name` | no observable difference today |
| Heuristic prefix detection | runtime regex/substring on 4 patterns | n/a — no eval-list entry has the patterns today | no observable difference today |

### Concrete worked example with quantified scope

Audited 2026-04-28 against `.cache/hf-data/`:

**`getEvaluationDisplayName` against the 5,830 model files (86,183 total `(evaluation, result)` pairs):**
- `metric === benchmark` early-return: **30,968 (35.9%)** — most rows hit this; `evaluation_name` is already identical to the resolved benchmark name, so the function just returns it
- Generic-name expansion fires: **0 (0.0%)** — zero rows have a metric whose lowercased name is in `GENERIC_EVALUATION_NAMES`
- Passthrough (non-generic, distinct from benchmark): **55,215 (64.1%)**

Distribution of generic names hit in production: **empty.** The 6-entry set is dead code against current data.

**`prefersBenchmarkName` against the 587 eval-list entries:**
- `accuracy on …` matches: **0**
- `score on …` matches: **0**
- `for scorer` matches: **0**
- `model_graded` matches: **0**
- Total entries where heuristic fires: **0 (0.0%)**

Both transformations are **defensive scaffolding** — preserved for shapes the pipeline used to or could produce, but the current corpus produces neither generic bare-metric names nor heuristic-matching display strings.

Verified by `scripts/verify-metric-display-name.mjs`.

## Verified state (2026-04-28)

**For `getEvaluationDisplayName`:**
- Caller chain trace: called from `createEvaluationCard` (`lib/eval-processing.ts:631`) and `groupEvaluationsByBenchmark` (`lib/eval-processing.ts:900`). Both functions are exported from `lib/eval-processing.ts` but **not called from any file in `app/`, `components/`, `scripts/`, or other `lib/`** — verified by `grep -r`. The full chain `processEvaluationsToCards → createEvaluationCard → getEvaluationDisplayName` and `processEvaluationsToBenchmarkSummaries → groupEvaluationsByBenchmark → getEvaluationDisplayName` runs only inside the module's exports; no consumer triggers it.
- Data check: pipeline DOES emit bare-generic `metric_name` in 38,140 of 82,781 metrics in `hierarchy_by_category` (~46%). `flattenModelEvaluations` in `lib/hf-data.ts:1275` propagates this to `evaluation_name` on flattened result rows. So *if* the function were called, the expansion path WOULD fire — on 39,831 of 86,183 result rows. But nothing calls it.
- The earlier audit script (`scripts/verify-metric-display-name.mjs`) walked `models/<id>.json`'s `evaluations_by_category` (pipeline-pre-flattened, specific names) — that path doesn't go through `flattenModelEvaluations`, so it correctly reported "0 fires" for that traversal, but it didn't capture that the function would fire on the `hierarchy_by_category` traversal that `flattenModelEvaluations` actually performs.

**For `prefersBenchmarkName`:**
- Caller chain trace: lives inline at `lib/model-data.ts:462-470` inside `hfEvalEntryToListItem`. That function IS actively called: `lib/model-data.ts:1261, 1301` and `lib/duckdb-data.ts:171`. Live read path on browse-evals pages.
- Data check: across all 587 eval-list entries in `.cache/hf-data/eval-list.json`, **none of the 4 heuristic patterns match** — verified directly with a one-liner script (count = 0). The active path runs on every request but never finds a match.

## Recommended migration path

Two separate decisions, one per function:

### `getEvaluationDisplayName` (and the orphaned subsystem) — delete locally, no pipeline involvement

The function and its caller chain are dead code. Safe to delete without any pipeline coordination:

- `getEvaluationDisplayName` (`lib/eval-processing.ts:70-86`)
- `GENERIC_EVALUATION_NAMES` (`lib/eval-processing.ts:27-34`)
- `getEvaluationSummaryId` (`lib/eval-processing.ts:88-94`) — calls `getBenchmarkName`, only used by orphaned chain
- `createEvaluationCard` (`lib/eval-processing.ts:537+`)
- `processEvaluationsToCards` (`lib/eval-processing.ts:815`)
- `processEvaluationsToBenchmarkSummaries` (`lib/eval-processing.ts:1000`)
- `groupEvaluationsByBenchmark` (`lib/eval-processing.ts:893`)
- `loadEvaluations` (`lib/eval-processing.ts:788`) — only called by the two `processEvaluations*` orphans
- `getCategoryStats` (`lib/eval-processing.ts:747`) — verify via grep before deleting; may also be orphaned

Plus the imports of `createEvaluationCard` and `groupEvaluationsByBenchmark` in `lib/model-data.ts:18, 20` (unused imports).

**No contract test about bare-generic metric names** — pipeline emits them today, the contract would fail. The function was never preventing user-visible bugs because nothing called it. The active UI rendering path uses `metric.display_name` (which IS pipeline-pre-expanded as `"ACE / Score"`, `"RewardBench / Accuracy"`, etc.) — that's the field consumers actually read.

**Verify-script update:** `scripts/verify-metric-display-name.mjs` is no longer meaningful for this function once it's deleted. Either delete the script or rewrite it to audit the `hierarchy_by_category` traversal (so the spec stays honest about what the function would do if revived).

`getBenchmarkName` (`lib/eval-processing.ts:49-68`) has separate consumers and stays.

### `prefersBenchmarkName` — delete locally + add contract test

This one IS in an active path, fires 0 times, and matches the "implicit safety net → explicit contract test" pattern cleanly:

- Delete the inline 9-line block at `lib/model-data.ts:462-470` (replace with direct read of the resolved display string).
- Add a Tier A contract test in `tests/pipeline-contract.test.ts`:
  - Assertion: no eval-list entry's display string (`evaluation_name || display_name || benchmark_leaf_name || eval_summary_id`) starts with `"accuracy on "` or `"score on "` (case-insensitive).
  - Assertion: no eval-list entry's display string contains `"for scorer"` or `"model_graded"`.
- If pipeline ever regresses, the contract test fails loudly with the specific eval_summary_id.

Pipeline owner is told: "this 4-pattern absence is currently true; if you ever start emitting display strings in those shapes, please coordinate so the contract test is updated alongside the data change."

## Migration checklist

- [x] Spec written (corrected 2026-04-28)
- [x] Tests cover each rule branch (`tests/transformations/metric-display-name-expansion.test.ts`) — note these test the function in isolation; they do not assert that the function is reached from any user-visible path.
- [ ] Verify-script disposition decided (delete `scripts/verify-metric-display-name.mjs` or rewrite to audit the `hierarchy_by_category` traversal that reflects what the function would do if called)
- [ ] Delete the orphaned subsystem from `lib/eval-processing.ts`: `getEvaluationDisplayName`, `GENERIC_EVALUATION_NAMES`, `getEvaluationSummaryId` (verify orphan status), `createEvaluationCard`, `processEvaluationsToCards`, `processEvaluationsToBenchmarkSummaries`, `groupEvaluationsByBenchmark`, `loadEvaluations`, `getCategoryStats` (verify orphan status). Plus unused imports of `createEvaluationCard` and `groupEvaluationsByBenchmark` in `lib/model-data.ts:18, 20`. Keep `getBenchmarkName` — separate consumers.
- [ ] Delete `prefersBenchmarkName` block at `lib/model-data.ts:462-470` and replace with direct read of resolved display string.
- [ ] Add Tier A contract test in `tests/pipeline-contract.test.ts`: no eval-list display string matches the 4 heuristic patterns (`startsWith("accuracy on ")`, `startsWith("score on ")`, `includes("for scorer")`, `includes("model_graded")`).
- [ ] Notify pipeline owner: 4-pattern absence is currently true; coordinate before changing eval-list display string emission.

## Future product decision (deferred)

The defensive scaffolding only ever mattered for upstream data shapes that the pipeline no longer produces. If product wants to expand the generic-name set (e.g., add `"recall"`, `"precision"`, `"bleu"`) or the heuristic patterns (e.g., add `"judged by"`, `"with prompt"`), that's a separate decision; this spec just locks in TS-as-is.
