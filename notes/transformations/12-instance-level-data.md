# Per-instance JSONL normalization

Drafted 2026-04-28. Migration item #7 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency. TS-as-is is the canonical spec for behaviour. This spec covers a per-record value transform that extracts UI-friendly strings (input/response/correctness/etc.) from rich per-sample objects emitted by the pipeline. Audited 2026-04-28 against the full corpus, the parser's many fallback branches mostly do not fire — pipeline emits a single canonical shape — but the parser preserves them as defensive scaffolding for older or different harness output formats.

**Architecture choice (cleaning-only, no SQL involvement):** the inline `instance_examples` preview (≤5 samples per result) gets normalized in pipeline; the per-result `source_url` pointing to a full JSONL dump (typically 50 samples) stays as an on-demand UI fetch, NOT pre-ingested into a parquet table. This avoids speculative pipeline ingestion work and matches the actual product need (lazy-load all samples on user click, not cross-corpus sample querying). The orphaned `fetchInstanceLevelData` (`lib/hf-data.ts:890-917`) gets re-wired to a future "show all samples" UI feature rather than deleted.

## Rule (as TS implements it today)

### `parseInstanceLevelData` (`lib/hf-data.ts:933-1043`)

Pure function: takes a JSON object, walks `instance_examples[]`, returns `SampleResult[]`.

Top-level guard:
- If `data` is null/non-object → return `[]`
- If `data.instance_examples` is array → use it
- Else if `data` itself is array → use it
- Else → `[]`

Per-example field extraction (each is a fallback chain):

**`input` (string)** — first non-empty wins:
1. `raw.input` is string → use as-is
2. `raw.input.raw` is set → `String(raw.input.raw)`
3. `raw.prompt` → use as-is
4. `raw.question` → use as-is
5. `raw.doc.question` → use as-is
6. `raw.doc` exists → `JSON.stringify(raw.doc).slice(0, 500)`
7. (none) → empty string

**`ground_truth` (string | undefined)** — first non-null wins:
1. `raw.input.reference` is array → `array.join(", ")`; else → `String(...)`
2. `raw.ground_truth` → `String(...)`
3. `raw.target` → `String(...)`
4. `raw.gold` → `String(...)`
5. `raw.doc.answer` → `String(...)`
6. (none) → `undefined`

**`response` (string)** — first non-empty wins:
1. `raw.output` is set → string-as-is or `JSON.stringify(...)`
2. `raw.response` → use as-is
3. `raw.model_output` → use as-is
4. `raw.answer_attribution` is non-empty array → take last element's `extracted_value` (or empty string)
5. `raw.messages` is non-empty array → reverse + find last assistant message → string content or stringified
6. `raw.filtered_resps[0][0]` → use
7. `raw.resps[0][0]` → use
8. (none) → empty string

**`is_correct` (boolean | undefined)** — first defined wins:
1. `raw.evaluation.is_correct` (boolean)
2. `raw.is_correct` (boolean)
3. `raw.metrics.exact_match === 1` → true; `=== 0` → false; else undefined
4. (none) → `undefined`

**`metadata` (object | undefined)** — merged from (in order):
- `raw.evaluation` (if object)
- `raw.performance` (if object)
- `raw.metadata` (if object)
- `raw.metrics` (if object)
- If merged object is empty → `undefined`

**`sample_id` (string)** — first non-null wins:
1. `raw.sample_id` → as-is
2. `raw.doc_id` → as-is
3. `raw.id` → as-is
4. (none) → `String(arrayIndex)` (positional fallback)

**`choices` (any | undefined)** — first non-null wins:
1. `raw.choices`
2. `raw.doc.choices`
3. (none) → `undefined`

If a row's first-pass map returns `null` (i.e. `raw` was null or non-object), it's filtered out via `.filter(s => s !== null)`.

### `fetchInstanceLevelData` (`lib/hf-data.ts:890-917`) — currently orphaned

Takes a `(url, limit?)`. Fetches the URL via `fetch()`. Splits text on newlines (filters empty lines). For each line up to `limit` (or all if no limit), tries `JSON.parse`; skips malformed lines. Wraps the parsed array as `{ instance_examples: parsed }` and passes to `parseInstanceLevelData`. Returns `SampleResult[]` or `[]` on any error.

**Active call sites: zero.** Verified by grep across `app/`, `components/`, `scripts/`, other `lib/` files. Only mention is its own declaration. Git log shows one commit ("Refresh eval cards UI and backend data flow") in its history.

The function is intended for "load more / show all samples" UI feature — pipeline ships a `source_url` per row pointing to the full JSONL (typically 50 samples), but the inline `instance_examples` preview only carries 5. The fetcher would let UI request the full set on user demand. **This UI feature has never shipped.**

## Classification

- **Unconditional normalization.** The function always runs on whatever shape is provided; never gates on a pre-existing canonical field. Pipeline-side fix: emit a canonical per-sample shape so the multi-field fallback chains become unnecessary.
- **Cleaning → pipeline.** Pure value transform per sample. No aggregation, no reshape, no cross-record operations. Migration target: pipeline emits canonical per-sample shape on both the inline preview AND the URL JSONL files; TS parser shrinks to direct field reads or deletes entirely.
- **NOT reshape.** Per the architecture choice in the framing note above, samples stay as on-demand fetches via `source_url`; no parquet `instance_samples` table, no SQL queries over samples. (If a future product feature wants cross-model sample search/filter/comparison, that's a separate reshape spec.)

## Inputs and expected outputs

### Group A — Pipeline-canonical shape (the only shape that fires in production today)

Input shape (from cache `result.instance_level_data.instance_examples[i]`):

```jsonc
{
  "schema_version": "...",
  "evaluation_id": "...",
  "model_id": "...",
  "evaluation_name": "...",
  "sample_id": "...",
  "sample_hash": "...",            // sometimes present
  "interaction_type": "multi_turn",
  "input": { "raw": "..." },        // ALWAYS object with .raw in production
  "output": "..." | { ... },        // sometimes
  "messages": [{ role: "...", content: "..." }, ...],  // typically present
  "answer_attribution": [..., { "extracted_value": "..." }],  // typically present
  "evaluation": { "is_correct": true|false, ... },  // ALWAYS present
  "performance": { ... },
  "metadata": { ... },
  "token_usage": { ... },
  "error": null | "...",
  "hierarchy": [...]
}
```

Expected output (`SampleResult`):

| Output field | Source path that fires | Notes |
|---|---|---|
| `sample_id` | `raw.sample_id` (100% of production) | always present |
| `input` | `raw.input.raw` (100%) | branch #2 in the chain |
| `ground_truth` | `raw.input.reference` (100%) | branch #1 |
| `response` | `raw.answer_attribution` (97.31%) OR `raw.messages` (2.49%) OR `raw.output` (0.20%) | branches #4, #5, #1 |
| `is_correct` | `raw.evaluation.is_correct` (100%) | branch #1 |
| `choices` | `undefined` (100%) | no branch fires; field is unset in production |
| `metadata` | merged from `raw.evaluation`, `raw.performance`, `raw.metadata`, `raw.metrics` (always at least 2 of 4 present) | merged object |

### Group B — Defensive fallback branches (zero firing rate in current production)

| Branch | Output field | Production hits | Origin (presumed) |
|---|---|---|---|
| `raw.input` (string) | input | 0 | older harness shapes |
| `raw.prompt` | input | 0 | lm-eval-harness |
| `raw.question` | input | 0 | other harnesses |
| `raw.doc.question` | input | 0 | HELM-style |
| `raw.doc` (JSON.stringify) | input | 0 | last-resort |
| `raw.ground_truth` | ground_truth | 0 | older shapes |
| `raw.target` | ground_truth | 0 | classification benchmarks |
| `raw.gold` | ground_truth | 0 | older lm-eval |
| `raw.doc.answer` | ground_truth | 0 | HELM-style |
| `raw.response` | response | 0 | older shapes |
| `raw.model_output` | response | 0 | older shapes |
| `raw.filtered_resps[0][0]` | response | 0 | lm-eval-harness format |
| `raw.resps[0][0]` | response | 0 | lm-eval-harness format |
| `raw.is_correct` | is_correct | 0 | flat shape |
| `raw.metrics.exact_match` | is_correct | 0 | metric-based correctness |
| `raw.doc_id` | sample_id | 0 | HELM-style |
| `raw.id` | sample_id | 0 | generic |
| index fallback | sample_id | 0 | last-resort |
| `raw.choices` | choices | 0 | multiple-choice |
| `raw.doc.choices` | choices | 0 | HELM multiple-choice |

These branches exist for shapes the pipeline currently does not emit. **Preserve verbatim** until pipeline-side guarantees the canonical shape across all data sources.

### Group C — `fetchInstanceLevelData` JSONL parsing edge cases

| Input | Behavior |
|---|---|
| URL returns `!res.ok` (404, 500, etc.) | returns `[]` (no throw) |
| URL throws (network error) | logs warning to console, returns `[]` |
| Empty body | splits to `[]`, returns `[]` |
| Body with empty lines | `.filter(line => line.trim())` strips them |
| Body with malformed JSON line | swallowed in inner try-catch; line skipped, processing continues |
| `limit=0` or `limit=undefined` | parses ALL lines |
| `limit > lines.length` | parses all lines (capped via `Math.min`) |

## Current TS implementation

| Concern | Location | Notes |
|---|---|---|
| `parseInstanceLevelData` | `lib/hf-data.ts:933-1043` | The parser; ~110 lines |
| `fetchInstanceLevelData` | `lib/hf-data.ts:890-917` | URL fetcher; orphaned (zero callers) |
| Active call site | `lib/hf-data.ts:1273` (inside `flattenHierarchyNode`) | `parseInstanceLevelData(result.instance_level_data)` → `inlineSamples` |
| Internal call site | `lib/hf-data.ts:912` | inside `fetchInstanceLevelData` itself, recursive call to the parser |
| `SampleResult` type | `lib/benchmark-schema.ts:135` | Output shape definition |
| Output field | `BenchmarkEvaluation.detailed_evaluation_results_per_samples` | `lib/benchmark-schema.ts:33` |

### Caller chain for `parseInstanceLevelData`

`getModelSummaryById` (lib/model-data.ts:1490+) → `flattenModelEvaluations` → `flattenHierarchyNode` (lib/hf-data.ts:1273) → `parseInstanceLevelData(result.instance_level_data)` → set as `inlineSamples` on each variant bucket → propagated to `BenchmarkEvaluation.detailed_evaluation_results_per_samples`.

UI consumers (read `data.detailed_evaluation_results_per_samples`):
- `components/benchmark-detail.tsx:3869` — random sample for preview block
- `components/benchmark-detail.tsx:4174-4216` — sample preview UI in benchmark detail
- `components/benchmark-detail.tsx:4982` — variant-level sample availability check
- `components/benchmark-detail.tsx:5284-5286` — variant sample picker
- `components/benchmark-detail.tsx:5569-5608` — sample preview list with INSTANCE_PREVIEW_LIMIT and "see all" expansion

### Caller chain for `fetchInstanceLevelData`

None. Function is exported and unreached. Preserved with the intent that a future "show all samples" UI consumer wires up to it.

## Pipeline status

### Side-by-side comparison

| Aspect | TS (this spec) | Pipeline today | Result for users |
|---|---|---|---|
| Inline preview shape | parser handles many variants | emits ONE canonical shape (`input.raw`, `evaluation.is_correct`, etc.) | parser's fallback branches almost all dead |
| URL JSONL shape | same parser handles | emits IDENTICAL canonical shape (verified by sampling one URL on 2026-04-28) | parser would work the same on URL data |
| Inline preview size | parser doesn't care | always exactly 5 samples per `instance_examples` array | UI capped at 5 today |
| Total samples per row | n/a | typically 50 (per `instance_count` field), one outlier 18 | only 10% accessible to UI today |
| URL-fetch use case | `fetchInstanceLevelData` exists | `source_url` always emitted | dead code on TS side; no UI consumer |

### Concrete worked example with quantified scope

Audited 2026-04-28 against `.cache/hf-data/`. Verified by `scripts/verify-instance-level-data.mjs`.

**Prevalence:**
- Total model files: 5,830
- Files with any `instance_level_data`: **55 (0.94%)**
- Total `(metric × model_result)` rows: 86,183
- Result rows with `instance_level_data`: **712 (0.83%)**
- Total inline preview examples (sum of `instance_examples.length`): **3,532** (always ≤5 per row)
- Total full samples (sum of `instance_count`): **66,057** (full set available via `source_url`, not loaded today; ~19× larger than what UI currently shows)

**ild-level shape uniformity (712/712 rows):**
- Top-level keys are always exactly `{interaction_type, instance_count, source_url, instance_examples}`
- `interaction_type` is always `"multi_turn"` (no single_turn samples in cache)

**Per-example branch firing rates (3,532 examples):**
- `input`: `input.raw` 100%
- `ground_truth`: `input.reference` 100%
- `response`: `answer_attribution` 97.31%, `messages` 2.49%, `output` 0.20%
- `is_correct`: `evaluation.is_correct` 100%
- `sample_id`: `sample_id` 100%
- `choices`: nothing (always undefined)

The 7-branch input chain, 5-branch ground_truth chain, 4-branch is_correct chain, 4-branch sample_id chain, 2-branch choices chain are **defensive scaffolding** for shapes the pipeline does not currently emit. The 7-branch response chain has 3 active sub-branches.

**URL JSONL shape verification:** sampled one source_url (`anthropic__anthropic-claude-3-7-sonnet/swe_bench_verified_mini_...`); first line had identical 18 keys to the inline `instance_examples[0]`, with `input.raw` and `evaluation.is_correct` in expected paths. Pipeline emits the same canonical shape on both inline and URL paths.

## Notes for pipeline implementer

- The pipeline already emits a canonical per-sample shape consistently. **No structural change needed to current emission.** The migration is to make this shape an explicit guarantee, not to change what's being emitted.
- Suggested guarantee: every `instance_examples[i]` (inline AND in JSONL at `source_url`) has at minimum `{sample_id, input.raw, input.reference?, evaluation.is_correct, answer_attribution? || messages?, metadata?}`.
- Once that guarantee is documented and verified, the TS parser shrinks dramatically: extract `raw.input.raw`, `raw.input.reference`, `raw.evaluation.is_correct`, `raw.sample_id` as direct field reads. The response field still needs the 3-branch fallback (answer_attribution → messages → output) until pipeline emits a single normalized `response` field.
- **Do NOT pre-ingest the URL JSONL into pipeline parquet** (per the architecture choice). The runtime UI fetches `source_url` on demand; this is the orphaned `fetchInstanceLevelData`'s intended use. The benefit of pre-ingestion (cross-corpus SQL queries over samples) is speculative; defer until a product feature demands it.
- The "shape uniformity" finding (712/712 rows have identical ild-level keys; all are `multi_turn`) suggests the pipeline already enforces the canonical shape. Worth documenting in the pipeline contract test (`tests/pipeline-contract.test.ts`).

## Migration checklist

- [x] Spec written
- [x] Tests cover each rule branch (`tests/transformations/instance-level-data.test.ts`)
- [x] Audit script (`scripts/verify-instance-level-data.mjs`)
- [ ] Filed with pipeline owner with the spec + tests + audit script as acceptance criterion
- [ ] Pipeline contract: explicit guarantee of canonical per-sample shape (Tier A test asserting `every instance_example has input.raw, sample_id, evaluation.is_correct`)
- [ ] TS deleted: `parseInstanceLevelData` shrinks to direct field reads (~10 lines instead of 110), or fully deleted if pipeline emits already-flat normalized records. `fetchInstanceLevelData` stays orphaned-but-preserved for the future "show all samples" UI feature, OR is wired up if that feature ships.

## Future product decisions (deferred)

- **"Show all samples" UI feature** — would un-orphan `fetchInstanceLevelData` and let users see the full 50-sample set instead of just the 5-sample preview. Lazy fetch on user click. This is the concrete capability the URL-fetch architecture supports; the spec assumes it's a product roadmap item, not committed scope.
- **Cross-model sample querying / search / filter** — would require `instance_samples.parquet` and SQL queries (the alternative architecture I initially proposed). Out of scope for this spec; revisit if/when product asks.
- **Single-turn samples** — pipeline currently only emits `interaction_type: multi_turn`. If pipeline starts emitting single_turn shapes that exercise dormant parser branches (e.g. flat `input` strings, `prompt`/`question` fields), the spec's "100% canonical shape" claim breaks and the parser fallbacks become live again.
