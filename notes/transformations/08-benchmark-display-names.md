# Benchmark display names

Drafted 2026-04-28. Migration item #8 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency. TS-as-is is the canonical spec. The transformation has known imperfections (one of the two implementations is a substring-match contains-test that will mangle e.g. "MMLU-Pro" by replacing the entire string with the long-form for "MMLU"; the active map is hand-curated and only covers ~34 known suite/parent keys) but those are deferred product decisions, not bugs to fix in this migration.

## Rule (as TS implements it today)

The repo has **two** functions named `getBenchmarkDisplayName` with different semantics; the active one in production is `lib/model-data.ts` (the `lib/eval-processing.ts` copy is an unused/duplicate — see "Duplicate implementation" below).

### Active implementation — `lib/model-data.ts:146-148`

`getBenchmarkDisplayName(benchmark: string)` applies one of two transformations:

1. **Map hit (normalized lookup):** normalize the input via `normalizeBenchmarkKeyForLookup` (lowercase; replace any run of `-`, `.`, or whitespace with a single `_`; strip leading/trailing `_`), then look up in `BENCHMARK_NAMES`. If present, return the mapped canonical form.
2. **Tokenize fallback (`humanizeToken`, `lib/model-data.ts:90-96`):** split the *original* (un-normalized) input on `[_-]+`, drop empty parts, capitalize the first character of each part, join with a single space. Note: only the first character is uppercased — `mmlu` becomes `Mmlu`, not `MMLU`.

The map (`lib/model-data.ts:109-140`) has 30 entries — all hand-maintained suite/family keys.

| Map key | Canonical |
|---|---|
| `hfopenllm_v2` | HF Open LLM v2 |
| `helm_lite` | HELM Lite |
| `helm_capabilities` | HELM Capabilities |
| `helm_classic` | HELM Classic |
| `helm_instruct` | HELM Instruct |
| `helm_mmlu` | HELM MMLU |
| `reward_bench` | RewardBench |
| `reward_bench_2` | RewardBench 2 |
| `bfcl` | BFCL |
| `global_mmlu_lite` | Global MMLU Lite |
| `swe_bench` | SWE-bench |
| `arc_agi` | ARC-AGI |
| `tau_bench_2` | TAU-Bench 2 |
| `ace` | ACE |
| `apex_agents` | APEX Agents |
| `apex_v1` | APEX v1 |
| `appworld` | AppWorld |
| `browsecompplus` | BrowseComp+ |
| `livecodebenchpro` | LiveCodeBench Pro |
| `sciarena` | SciArena |
| `terminal_bench_2_0` | Terminal Bench 2.0 |
| `la_leaderboard` | LA Leaderboard |
| `theory_of_mind` | Theory of Mind |
| `fibble_arena` | Fibble Arena |
| `fibble1_arena` | Fibble Arena v1 |
| `fibble2_arena` | Fibble Arena v2 |
| `fibble3_arena` | Fibble Arena v3 |
| `fibble4_arena` | Fibble Arena v4 |
| `fibble5_arena` | Fibble Arena v5 |
| `wordle_arena` | Wordle Arena |

The lookup is normalization-insensitive: `"HELM Lite"`, `"helm-lite"`, `"helm.lite"`, `"  helm   lite  "` all normalize to `helm_lite` and hit the map.

### Suite-display-name companion — `components/benchmark-detail.tsx:308-336`

`benchmark-detail.tsx` carries its own `SUITE_DISPLAY_NAMES` table (an exact 30-entry copy of `BENCHMARK_NAMES`) plus two further override tables (`DISPLAY_TOKEN_OVERRIDES`, `DISPLAY_NAME_OVERRIDES`) and a different normalize/tokenize pipeline (`normalizeDisplayLabel`/`normalizeDisplayToken`). The suite-name path:

1. `normalizeSuiteKey(key)` collapses `[-.\s]+` → `_`, strips edge `_`, then applies two regex special-cases: `/^fibble\d*_arena$/` collapses to `fibble_arena`, `/^arc_agi_v\d+/` collapses to `arc_agi`.
2. `getSuiteDisplayName(key)` returns `SUITE_DISPLAY_NAMES[normalizedKey] ?? normalizeDisplayLabel(key)`.
3. The fallback (`normalizeDisplayLabel`) is more sophisticated than `humanizeToken`: it splits on `/`, then on whitespace, then per-token applies `DISPLAY_TOKEN_OVERRIDES` (a 26-entry table that knows acronyms like `mmlu → MMLU`, `helm → HELM`, `gpt → GPT`).

The benchmark-detail suite-name path is **not** the same function as `getBenchmarkDisplayName` — it is consumed only inside `benchmark-detail.tsx` for rendering suite headers. The model-detail path (`lib/model-data.ts → getBenchmarkDisplayName`) is the one consumed across the rest of the app (model cards, comparison index, eval rollups, DuckDB backend).

### Duplicate implementation — `lib/eval-processing.ts:861-885`

A second function with the same name `getBenchmarkDisplayName` lives in `lib/eval-processing.ts`. It uses a completely different rule:

```
const mapping = { 'MMLU': 'Massive Multitask Language Understanding', 'MMLU-Pro': 'MMLU Professional', ... }
for (const [key, value] of Object.entries(mapping)) {
  if (name.toUpperCase().includes(key.toUpperCase())) return value
}
return name
```

It does case-insensitive substring matching against a 10-entry mapping of long-form descriptive names. **It disagrees with the `lib/model-data.ts` version on every map hit** (e.g. for input `"MMLU"`, model-data returns `"Mmlu"` via fallback, eval-processing returns `"Massive Multitask Language Understanding"`). Reachability:

- `lib/eval-processing.ts:903` — `getBenchmarkDisplayName(compositeBenchmarkKey)` inside `groupEvaluationsByBenchmark`. `groupEvaluationsByBenchmark` is exported but is **not imported anywhere else in the repo** (verified by `rg "groupEvaluationsByBenchmark"` — only its own declaration appears). Functionally dead.

The substring-include rule has a known soft-bug: input `"MMLU-Pro"` would return the mapping for `"MMLU"` (`"Massive Multitask Language Understanding"`) because the loop iterates in insertion order and `MMLU` comes first; the `MMLU-Pro` entry never wins. Documented as TS-as-is; do not "fix" this in the migration.

## Classification

- **Unconditional normalization.** The function always runs on whatever benchmark key/name is present — it does not check for a pre-existing canonical field. Map hits and tokenize fallback are both branches of the same unconditional transform. Pipeline-side fix: emit a canonical `display_name` field per benchmark; no consumer should re-derive it.
- **Cleaning → pipeline.** Pure value transform on a single string field. No aggregation or record merging. Migration target: pipeline emits canonical display name on every benchmark/eval entry; TS map + `getBenchmarkDisplayName` + the duplicate in `eval-processing.ts` + the parallel `SUITE_DISPLAY_NAMES` table in `benchmark-detail.tsx` all delete.

## Inputs and expected outputs

Each row corresponds to a parameterized test case in `tests/transformations/benchmark-display-names.test.ts`.

### Group A — Map hits (normalized-key lookup against `BENCHMARK_NAMES`)

| Input | Output | Rule |
|---|---|---|
| `helm_lite` | `HELM Lite` | exact normalized match |
| `HELM Lite` | `HELM Lite` | normalize: lower + space→`_` → `helm_lite` |
| `helm-lite` | `HELM Lite` | normalize: dash→`_` |
| `helm.lite` | `HELM Lite` | normalize: dot→`_` |
| `  helm   lite  ` | `HELM Lite` | normalize: whitespace runs → `_`, trim edges |
| `arc_agi` | `ARC-AGI` | substantive transform: returns dashed form |
| `swe_bench` | `SWE-bench` | substantive (lowercase `bench`) |
| `reward_bench` | `RewardBench` | substantive (concatenated, no separator) |
| `reward_bench_2` | `RewardBench 2` | substantive |
| `terminal_bench_2_0` | `Terminal Bench 2.0` | substantive (literal `_0` becomes `.0` in output) |
| `mistralai` (n/a — not a benchmark) | — | not in benchmark map |
| `hfopenllm_v2` | `HF Open LLM v2` | substantive (3-token split) |
| `bfcl` | `BFCL` | uppercase |
| `ace` | `ACE` | uppercase |
| `apex_agents` | `APEX Agents` | partial uppercase |
| `apex_v1` | `APEX v1` | partial uppercase + lowercase v |
| `appworld` | `AppWorld` | mixed-case substantive |
| `browsecompplus` | `BrowseComp+` | adds `+` |
| `livecodebenchpro` | `LiveCodeBench Pro` | substantive |
| `sciarena` | `SciArena` | substantive |
| `la_leaderboard` | `LA Leaderboard` | partial uppercase |
| `theory_of_mind` | `Theory of Mind` | substantive (lowercase `of`) |
| `fibble_arena` | `Fibble Arena` | base entry |
| `fibble1_arena` | `Fibble Arena v1` | substantive |
| `fibble2_arena` | `Fibble Arena v2` | substantive |
| `fibble3_arena` | `Fibble Arena v3` | substantive |
| `fibble4_arena` | `Fibble Arena v4` | substantive |
| `fibble5_arena` | `Fibble Arena v5` | substantive |
| `wordle_arena` | `Wordle Arena` | substantive |
| `global_mmlu_lite` | `Global MMLU Lite` | partial uppercase |
| `helm_capabilities` | `HELM Capabilities` | partial uppercase |
| `helm_classic` | `HELM Classic` | partial uppercase |
| `helm_instruct` | `HELM Instruct` | partial uppercase |
| `helm_mmlu` | `HELM MMLU` | full uppercase |
| `tau_bench_2` | `TAU-Bench 2` | substantive (`TAU-Bench`, dashed) |

### Group B — Tokenize fallback (`humanizeToken`)

Inputs that miss the map go through `humanizeToken(originalInput)`: split on `[_-]+`, drop empty parts, uppercase the first char of each part, join with `" "`.

| Input | Output | Why |
|---|---|---|
| `bbh` | `Bbh` | single token, only first char uppercased — NOT `BBH` |
| `gpqa` | `Gpqa` | only first char uppercased — NOT `GPQA` |
| `mmlu` | `Mmlu` | NOT `MMLU` (this is what's served when only the model-data path runs) |
| `gsm8k` | `Gsm8k` | digits inside don't capitalize differently |
| `MATH` | `MATH` | already uppercase, untouched (only first-char of each token is *set* — but `M` is already upper) |
| `MMLU-PRO` | `MMLU PRO` | split on dash; each token already starts upper; rest of token preserved as-is |
| `MMLU` | `MMLU` | passthrough — already starts uppercase, fallback's `charAt(0).toUpperCase()` is a no-op on `M`, slice preserves `MLU` |
| `helm air bench` | `HELM Lite` (NO!) — wait | normalizes to `helm_air_bench`, not in map → tokenize fallback uses ORIGINAL `helm air bench` → split on `[_-]+` is single token `helm air bench` → `Helm air bench` |
| `Helm air bench` | `Helm air bench` | NOT in map (only `helm_air_bench` would be — and isn't); fallback splits on `[_-]+` only, so the spaces survive and only the first char gets uppercased |
| `humaneval` | `Humaneval` | not in map |
| `truthfulqa` | `Truthfulqa` | not in map |
| `BBQ` | `BBQ` | not in map; split on `[_-]+` is single `BBQ`; first char already upper, rest preserved |
| `swe-bench-verified` | `Swe Bench Verified` | not in map; split on `-` → 3 tokens, each first-cap |
| `swe_bench_verified_mini` | `Swe Bench Verified Mini` | split on `_` → 4 tokens |
| `multi_swe_bench` | `Multi Swe Bench` | split on `_` → 3 tokens |
| `helm_air_bench` | `Helm Air Bench` | not in map (only the *suite* keys above are); split on `_` → 3 tokens |
| `helm_safety` | `Helm Safety` | not in map |
| `swe_bench_verified` | `Swe Bench Verified` | not in map (only `swe_bench` is) |
| `cocoabench` | `Cocoabench` | single token |
| `llm_stats` | `Llm Stats` | not in map |
| `artificial_analysis_llms` | `Artificial Analysis Llms` | not in map |

The **systematic quirk**: `humanizeToken` only uppercases the first character of each token. It does NOT consult the same acronym table that the map encodes (so `mmlu → Mmlu`, `bbh → Bbh`, `gpqa → Gpqa`). This is why suites like `helm_lite` need an explicit map entry — without one, fallback would produce `Helm Lite` (already pretty close), but for `mmlu` the fallback produces the visibly-wrong `Mmlu`. The companion table in `benchmark-detail.tsx` (`DISPLAY_TOKEN_OVERRIDES`) DOES know the acronyms — but that table is consumed by a different code path.

### Group C — Edge cases

| Input | Output | Notes |
|---|---|---|
| `""` (empty) | `""` | normalize → `""`, no map hit; humanizeToken splits empty → empty array → `[].join(" ")` → `""` |
| `"_"` | `""` | normalize → `""` (edge `_` stripped), no map hit; humanizeToken splits `_` → `[""]` → filter empty → `[].join(" ")` → `""` |
| `"___helm___lite___"` | `HELM Lite` | normalize collapses runs of `_` and trims → `helm_lite` → map hit |
| `"HELM-LITE"` | `HELM Lite` | normalize → `helm_lite` → map hit |
| `"helm  lite"` (2 spaces) | `HELM Lite` | normalize collapses whitespace runs → `helm_lite` |
| `"a"` | `A` | not in map; humanizeToken → `["a"]` → `["A"]` → `"A"` |
| `"a-b"` | `A B` | split → `["a","b"]` → `["A","B"]` → `"A B"` |

### Group D — Duplicate `getBenchmarkDisplayName` in `lib/eval-processing.ts` (functionally dead, document for completeness)

The substring-include rule (10-entry mapping). Documented inputs:

| Input | Output | Rule branch |
|---|---|---|
| `null` | `Unknown Benchmark` | guard at top of function |
| `undefined` | `Unknown Benchmark` | guard |
| `""` | `Unknown Benchmark` | guard (`!name`) |
| `MMLU` | `Massive Multitask Language Understanding` | substring match on `MMLU` |
| `mmlu` | `Massive Multitask Language Understanding` | case-insensitive substring |
| `MMLU-Pro` | `Massive Multitask Language Understanding` | iteration order: `MMLU` matches first; `MMLU-Pro` never reached |
| `GSM8K` | `Grade School Math 8K` | match |
| `HumanEval` | `Human Eval (Code)` | match |
| `MBPP` | `Mostly Basic Python Problems` | match |
| `HellaSwag` | `HellaSwag (Commonsense)` | match |
| `ARC` | `AI2 Reasoning Challenge` | match |
| `TruthfulQA` | `TruthfulQA` | match (key === value) |
| `BBH` | `Big-Bench Hard` | match |
| `MATH` | `MATH Dataset` | match |
| `helm_lite` | `helm_lite` | no match → passthrough |
| `MMLU Lite something` | `Massive Multitask Language Understanding` | substring match still fires anywhere in the name |

Note that this function is **not the active path** in production; it lives inside `groupEvaluationsByBenchmark` which is unreferenced. Tests cover it for completeness so a pipeline implementer porting both functions sees the divergence in behaviour explicitly.

## Current TS implementation

| Concern | Location |
|---|---|
| Active map (`BENCHMARK_NAMES`, 30 entries) | `lib/model-data.ts:109-140` |
| Active key-normalizer (`normalizeBenchmarkKeyForLookup`) | `lib/model-data.ts:142-144` |
| Active tokenize fallback (`humanizeToken`) | `lib/model-data.ts:90-96` |
| Active function (`getBenchmarkDisplayName`, exported) | `lib/model-data.ts:146-148` |
| Suite-name companion map (`SUITE_DISPLAY_NAMES`, 30 entries; copy of `BENCHMARK_NAMES`) | `components/benchmark-detail.tsx:101-132` |
| Suite-name token overrides (`DISPLAY_TOKEN_OVERRIDES`, 26 entries) | `components/benchmark-detail.tsx:134-162` |
| Suite-name overrides (`DISPLAY_NAME_OVERRIDES`) | `components/benchmark-detail.tsx:164-173` |
| Suite key normalizer (with fibble/arc-agi regex special-cases) | `components/benchmark-detail.tsx:308-313` |
| Suite display-name lookup | `components/benchmark-detail.tsx:333-336` |
| **Duplicate** function (functionally dead) | `lib/eval-processing.ts:861-885` |

### Call sites of the active `getBenchmarkDisplayName` (15 total)

| Location | Context |
|---|---|
| `lib/model-data.ts:274` | `top_scores` rollup — set `benchmark` display name on score entry |
| `lib/model-data.ts:410` | `benchmark_names` array on developer summary |
| `lib/model-data.ts:459` | `benchmarkDisplayName` for hierarchy entries |
| `lib/model-data.ts:485` | `latest_source_name` on category aggregation |
| `lib/model-data.ts:778` | `composite_benchmark_name` on category-mode aggregation |
| `lib/model-data.ts:785` | `latest_source_name` (same record) |
| `lib/model-data.ts:821` | `composite_benchmark_name` on benchmark-mode aggregation |
| `lib/model-data.ts:828` | `latest_source_name` (same record) |
| `lib/model-data.ts:903` | `suiteDisplayName` for suite aggregation |
| `lib/model-data.ts:1056` | `suiteDisplayName` (second aggregator) |
| `lib/model-data.ts:1362` | model-card rollup A |
| `lib/model-data.ts:1396` | model-card rollup B |
| `lib/model-data.ts:1429` | model-card rollup C |
| `lib/model-data.ts:1470` | model-card rollup D |
| `lib/duckdb-data.ts:301` | DuckDB backend — set `benchmark` on per-model rollup |

`normalizeBenchmarkKeyForLookup` itself is also called separately at `lib/model-data.ts:1572` and `:1579` to derive suite-key matches (independent of display-name derivation).

### Call sites of `SUITE_DISPLAY_NAMES`/`normalizeDisplayLabel` (renderer-only)

`components/benchmark-detail.tsx` consumes `normalizeDisplayLabel` at ~30 sites for in-render labels (model name, organization, dataset name, source name, run label, subtask label, etc.). The suite-display-name path (`getSuiteDisplayName`) is only called inside this file. None of these are used outside the benchmark detail page; they are presentation-layer helpers that operate on already-emitted strings.

## Pipeline status — divergences

### Side-by-side comparison table

| Aspect | TS (this spec) | Pipeline today | Result for users |
|---|---|---|---|
| Where display name is derived | request time, in 15+ call sites | pipeline emits `benchmark_parent_name`, `benchmark_family_name`, `display_name`, `canonical_display_name` on each eval entry; raw `benchmark` is also present | TS re-derives display name from the key field, ignoring the pipeline's already-canonical `*_name` fields |
| Key field consumed | `benchmark_parent_key` / `benchmark_family_key` / `benchmark` (mostly key-shaped strings like `helm_lite`) | n/a — pipeline emits both keys and names | TS map hit yields canonical name; non-mapped keys fall through to mechanical title-case |
| Acronym handling | `BENCHMARK_NAMES` map: 30 hand-curated entries; everything else gets `humanizeToken` (only first char per token uppercased) | `display_name` / `canonical_display_name` already encode the canonical capitalization (e.g. `BBH`, `GPQA`, `MMLU`) | TS produces user-visible `Mmlu` / `Bbh` / `Gpqa` for unmapped acronym keys; pipeline's `display_name` would have correct casing |
| Suite/family rollup labels | `getSuiteDisplayName` in `benchmark-detail.tsx` does its own thing (DISPLAY_TOKEN_OVERRIDES knows acronyms); active `getBenchmarkDisplayName` in `model-data.ts` does NOT consult those overrides | n/a | The two TS paths can produce *different* display names for the same key — e.g. for `mmlu`, `getBenchmarkDisplayName` returns `Mmlu` but the suite path returns `MMLU` |

### Concrete worked examples (audit numbers)

Audited 2026-04-28 against `.cache/hf-data/eval-list.json` (587 evals) and `.cache/hf-data/model-cards-lite.json` (5,830 cards) by `scripts/verify-benchmark-display-names.mjs`.

**Distinct benchmark-key strings in production (eval-list.json):**

| Field | Distinct values | mapHit (distinct) | fallback (distinct) | mapHit calls / 587 | fallback calls / 587 |
|---|---|---|---|---|---|
| `benchmark` | 544 | 15 (2.8%) | 529 (97.2%) | 20 | 567 |
| `benchmark_parent_key` | 34 | 25 (73.5%) | 9 (26.5%) | 71 | 516 |
| `benchmark_family_key` | 34 | 24 (70.6%) | 10 (29.4%) | 65 | 522 |
| `benchmark_parent_name` | 544 | 15 (2.8%) | 529 (97.2%) | 20 | 567 |

**Distinct benchmark fields on model-cards-lite.json (5,830 cards):**

| Field | Distinct | mapHit | fallback |
|---|---|---|---|
| `card.benchmark_names[]` | 377 | 14 (3.7%) | 363 (96.3%) |
| `card.top_benchmark_scores[].benchmarkKey` | 339 | 17 (5.0%) | 322 (95.0%) |
| `card.top_benchmark_scores[].benchmark` | 301 | 13 (4.3%) | 288 (95.7%) |

**Notable fallback outputs (visibly-wrong style produced by `humanizeToken`):**

| Input | TS-computed |
|---|---|
| `BBH` | `BBH` (no-op — already first-cap) |
| `MMLU-PRO` | `MMLU PRO` (loses the dash) |
| `artificial_analysis_llms` | `Artificial Analysis Llms` (`LLMs` → `Llms`) |
| `helm_air_bench` | `Helm Air Bench` (`HELM` → `Helm`) |
| `helm_safety` | `Helm Safety` |
| `swe_bench_verified` | `Swe Bench Verified` (`SWE` → `Swe`) |
| `swe_bench_verified_mini` | `Swe Bench Verified Mini` |
| `multi_swe_bench` | `Multi Swe Bench` |
| `llm_stats` | `Llm Stats` |
| `hfopenllm` (family key) | `Hfopenllm` |
| `ARC-AGI v2` (from `benchmark_names[]`) | `ARC AGI v2` (loses the dash) |
| `BrowseComp-Plus` | `BrowseComp Plus` (loses the dash) |

**TS vs pipeline-emitted display fields (587 evals):**

| Comparison | Agree | Disagree | Notes |
|---|---|---|---|
| TS(`benchmark_parent_key`) == pipeline `benchmark_parent_name` | 9 | 578 | Pipeline's `*_name` is the per-eval display name (e.g. `BBH`), not the suite roll-up name. They aren't meant to match — TS path produces the suite name (`HF Open LLM v2`), pipeline produces the leaf eval name (`BBH`). |
| TS(`benchmark_family_key`) == pipeline `benchmark_family_name` | 8 | 579 | Same dynamic. |
| TS(`benchmark`) == pipeline `display_name` | 86 | 501 | Disagreements include `MMLU-PRO` → `MMLU PRO` and the "key vs leaf-eval display" mismatch as above (e.g. `Artificial Analysis LLM API` vs `artificial_analysis.median_output_tokens_per_second`). |
| TS(`benchmark`) == pipeline `canonical_display_name` | 86 | 501 | Same as `display_name`. |

**Divergence summary:**
- Only ~3% of distinct `benchmark` strings hit the map; ~74% of distinct suite keys (`benchmark_parent_key`) do.
- For the ~97% of `benchmark` strings that miss, the active TS function passes them through `humanizeToken` which mangles acronyms (`MMLU-PRO` → `MMLU PRO`). For inputs that are already nicely cased (most pipeline-emitted `benchmark` strings are), the fallback can be a strict regression vs the input.
- The pipeline's `display_name` and `canonical_display_name` already provide leaf-eval display names; the TS function is doing suite-key → suite-display-name work that pipeline does NOT yet emit (no `parent_display_name` field). The `benchmark_parent_name` field exists but holds the *leaf eval name* picked from one child, not the suite display name.
- The duplicate `getBenchmarkDisplayName` in `eval-processing.ts` is unreachable — `groupEvaluationsByBenchmark` has zero importers (verified by ripgrep).

Run `scripts/verify-benchmark-display-names.mjs` for the live numbers.

## Notes for pipeline implementer

- **Prefer to expose pre-computed `display_name` / `canonical_display_name` on every benchmark/eval entry rather than asking consumers to map keys → names.** Pipeline already does this for ~all entries (verify field coverage with the audit script). The TS layer is essentially defending against the historical case where consumers received only a snake_case key.
- If the pipeline keeps emitting both keys and names, the migration target is: TS callers read `entry.display_name` (or `benchmark_parent_name`, etc.) directly; the `BENCHMARK_NAMES` map + `getBenchmarkDisplayName` + `humanizeToken` (active) + `SUITE_DISPLAY_NAMES`/`normalizeSuiteKey`/`getSuiteDisplayName` (companion) all delete.
- The 30 entries in `BENCHMARK_NAMES` (and the parallel 30 in `SUITE_DISPLAY_NAMES`) encode product decisions about how to render the suite-level rollups. If the pipeline does not yet emit a *suite-level* display name (separate from per-eval `display_name`), it should — exactly the 30 entries above are the acceptance set.
- The two regex special-cases in `benchmark-detail.tsx` (`/^fibble\d*_arena$/ → fibble_arena`, `/^arc_agi_v\d+/ → arc_agi`) are normalization-layer rules — pipeline should fold versioned variants of these suites into the same canonical key OR the consumer must continue to apply the collapse. Document the chosen approach.
- The duplicate `getBenchmarkDisplayName` in `lib/eval-processing.ts` should be deleted along with `groupEvaluationsByBenchmark`. It has no live callers.
- The `benchmark-detail.tsx` file's many `normalizeDisplayLabel` call sites (model name, org name, dataset name, run label, etc.) are a separate concern — they are presentation-only normalization on already-emitted strings, not a key→name lookup. Whether to migrate them upstream is a separate item.

Verification: run `scripts/verify-benchmark-display-names.mjs` against pipeline output once it ships. Goal: zero divergence vs TS-as-is across every distinct `benchmark` / `benchmark_parent_key` / `benchmark_family_key` value in the 587-eval cache.

## Migration checklist

- [x] Spec written
- [x] Tests cover each rule branch (`tests/transformations/benchmark-display-names.test.ts`)
- [ ] Filed with pipeline owner with the spec + tests + audit script as acceptance criterion
- [ ] Pipeline emits `display_name` / `canonical_display_name` (already does on per-eval) PLUS suite-level display name covering the 30 `BENCHMARK_NAMES` entries on every benchmark/eval entry
- [ ] TS deleted; replace 15 active call sites + 30+ `normalizeDisplayLabel` sites in `benchmark-detail.tsx` with direct field reads. Delete `BENCHMARK_NAMES`, `getBenchmarkDisplayName` (model-data.ts), `humanizeToken`, `normalizeBenchmarkKeyForLookup`, `SUITE_DISPLAY_NAMES`, `DISPLAY_TOKEN_OVERRIDES`, `DISPLAY_NAME_OVERRIDES`, `normalizeSuiteKey`, `getSuiteDisplayName`, `normalizeDisplayLabel`, `normalizeDisplayToken`, plus the duplicate `getBenchmarkDisplayName` + `groupEvaluationsByBenchmark` in `eval-processing.ts`.

## Future product decision (deferred)

`BENCHMARK_NAMES` is hand-curated and only covers 30 suite/parent keys; many leaf benchmarks fall through to a fallback that mangles acronyms (`mmlu → Mmlu`, `bbh → Bbh`). Whether to (a) expand the map to cover the long tail, (b) ship pipeline-emitted `display_name` everywhere and delete the map entirely, or (c) take a different approach (HTML-style override file, attribute on the source eval, etc.) is out of scope for this refactor. Document-don't-improve.
