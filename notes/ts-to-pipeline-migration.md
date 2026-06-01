# Move TypeScript data processing into the dataset pipeline

Working notes — drafted 2026-04-26, updated 2026-04-27. Cleaning/reshape annotations added 2026-04-28.

> **Framing update (2026-04-28).** This doc was written assuming every item moves to pipeline emission. The Data direction principle (see `notes/migration-plan.md` § "Data direction: cleaning upstream, reshape in SQL") refines that: **cleaning** items (value transforms on a single record) belong in pipeline emission and follow the per-item workflow in `notes/migration-plan.md`. **Reshape** items (dedup, aggregation, groupby, sort+select, hierarchy flatten) belong in DuckDB SQL — either materialized into pipeline parquet or computed at query time. Each item below is now annotated. For the active per-item migration view, see `notes/transformations/` and `notes/migration-plan.md`.

## Status

- ✅ **#4 source-metadata synthesis fallback** — deleted 2026-04-27. Pipeline (commit 9090cc5) now carries `source_metadata` on every hierarchy `model_result` row; verified 86 183/86 183 production rows + 43 859/43 859 eval-detail rows. Removed `getCanonicalSourceMetadata` (lib/hf-data.ts), `buildSourceMetadataIndex` (lib/hf-data.ts), and three duplicate inline fallbacks in lib/model-data.ts (`buildBenchmarkLeaderboardMatrix`, `toModelResultsForMetric`, `buildSingleMetricSuiteMatrixSummary`). Added a runtime `assertSourceMetadata(result, context)` guard at each read site so a future pipeline regression fails loud (with model + eval IDs) instead of silently emitting `undefined` into the UI which dereferences `.evaluator_relationship` unguarded. The 1st/3rd-party badge collapse bug is now structurally impossible.
  - **Intended behaviour change:** every model_result on eval pages now shows the real first/third-party badge instead of the previously-hardcoded "Other". 86 183/86 183 rows reclassified (3 119 first_party, 83 056 third_party, 8 still other). This was the explicit goal of item #4 ("known correctness gap").
- ⚠️ **#11 category-inference fallback (mostly reverted)** — narrowed 2026-04-27. Pipeline emits `category` on every eval-detail and every hierarchy node, BUT 84% of eval-details (496/587) carry `category: "other"` — the pipeline currently does NOT replicate the regex's classification work. Replacing the regex fallback would silently General-ify ~6 700 model rows including 4 known Safety evals (`helm_safety`, `helm_safety_simplesafetytests`, `helm_classic_truthfulqa`, `llm_stats_truthfulqa`) and 12+ hierarchy `(catKey, displayName)` pairs covering 1 500+ Safety-classified model rows (RewardBench safety, AIRBench subtasks, etc.).
  - **Done safely:** added `coding`, `instruction_following`, `language_understanding` to `PIPELINE_CATEGORY_MAP` (all → "General", matching prior `inferCategoryFromBenchmark` returns). Removed `?? inferCategoryFromBenchmark(c)` fallback in `mapHFCategories`, replaced with `?? "General"` — provably equivalent for all 9 currently-emitted pipeline keys.
  - **Reverted (left for follow-up):** the `inferCategoryFromBenchmark` calls in `hfEvalDetailToSummary` (lib/model-data.ts:760, :803), `groupEvaluationsByBenchmark` (lib/eval-processing.ts:906), and `buildSingleMetricSuiteMatrixSummary` (lib/model-data.ts:1170) — keeping the regex inference until the pipeline emits accurate `category` for currently-`other` benchmarks.
  - **Pre-existing inconsistency, not addressed:** `hfEvalEntryToListItem` (lib/model-data.ts:436) reads pipeline category, while `hfEvalDetailToSummary` reads regex. Same eval can show different categories in eval-list vs eval-detail. Was already in HEAD; dropping it requires the pipeline-side fix above first.

### Open follow-ups for the pipeline side

1. **Reclassify `category: "other"` evals.** 84% of eval-details get the catch-all. Either (a) train a classifier on the regex's intent, (b) tighten the pipeline's mapping rules, or (c) emit two fields (raw + ui_category). Until this lands, the regex inference must stay.
2. **Mark known Safety benchmarks correctly.** TruthfulQA, SimpleSafetyTests, the 6 AIRBench 2024 subtasks, RewardBench safety, etc., all currently emit non-Safety categories.
3. **Consider warn-once logging in `mapHFCategories`** when a new pipeline key arrives that isn't in the map. Today they silently default to "General".

## Parity setup

`scripts/compare-data-backends.mjs` is the regression net for this migration. Run:

```bash
# JSON-backed dev server, reading the pipeline output directly (offline)
HF_DATA_LOCAL_DIR=/Users/jchim/projects/eval_cards_backend_pipeline/output \
  HF_DATA_OFFLINE=1 PORT=3001 pnpm dev

# DuckDB-backed dev server, same data source
DATA_BACKEND=duckdb \
  LOCAL_PIPELINE_OUTPUT=/Users/jchim/projects/eval_cards_backend_pipeline/output \
  HF_DATA_LOCAL_DIR=/Users/jchim/projects/eval_cards_backend_pipeline/output \
  HF_DATA_OFFLINE=1 PORT=3002 pnpm dev

# Compare (PARITY_FAIL_FAST=0 prints every divergence path)
PARITY_FAIL_FAST=0 node scripts/compare-data-backends.mjs \
  --json-base http://localhost:3001 --duckdb-base http://localhost:3002
```

`HF_DATA_LOCAL_DIR` overrides `lib/hf-data.ts`'s default cache path to the sibling pipeline `output/`; `HF_DATA_OFFLINE=1` blocks remote fetches so background refreshes can't poison parity. Both env vars added 2026-04-27 specifically to enable this loop.

The harness covers 8 endpoints × 1 ID each, and only what's in the local pipeline output (3 evals, 28 models). It is *not* exhaustive — production has 587 evals / 5830 models — but it has already caught the model-summary pass-through bug (lib/duckdb-data.ts `toModelSummary` was returning the raw pipeline payload with lowercase category keys). When working on a new migration item, run parity before AND after the change.



The Eval Cards Next.js app does not own its data: a Python pipeline publishes JSON
artifacts to `evaleval/card_backend` on Hugging Face, `scripts/cache-hf-data.mjs`
clones them at build time, and the `lib/` server modules adapt them at request
time. A meaningful chunk of "shape‑fixing" still happens in TypeScript on every
request or build. This note inventories those places and proposes which should
move into the pipeline (dataset creation step) so the frontend becomes a pure
read of canonical JSON.

## Architecture recap

- `scripts/cache-hf-data.mjs` — clones `evaleval/card_backend` and writes
  `.cache/hf-data/{manifest, model-cards, eval-list, developers, benchmark-metadata,
  eval-hierarchy, comparison-index}.json` plus per-detail directories
  `models/`, `evals/`, `developers/`. Also re-normalizes some files in JS after
  download.
- `lib/hf-data.ts` — read layer over the cache + remote, plus converters that
  flatten the pipeline's hierarchy back into `BenchmarkEvaluation[]`.
- `lib/model-data.ts` — adapts raw HF artifacts into the app's domain types
  (`BenchmarkEvalSummary`, `EvaluationCardData`, `ModelEvaluationSummary`).
- `lib/eval-processing.ts` — re-aggregates per-model evaluations into family /
  variant summaries.
- `app/api/*` — thin route wrappers around the getters above.

The pipeline already produces hierarchy, leaderboards, composite groupings, and
benchmark cards. The items below are what the frontend still has to do that
the pipeline could just emit instead.

## Concrete migration candidates

### 1. Family / variant identity parsing — *cleaning*
- Where: `lib/model-family.ts` (`getCanonicalModelIdentity`), duplicated in
  `scripts/cache-hf-data.mjs:141-303` (`normalizeHandle`,
  `getCanonicalFamilyInfo`, `getNormalizedVariantMeta`,
  `normalizeCachedModelCardFile`).
- What it does: parses `model_info.id` (e.g. `anthropic/claude-3-5-sonnet-20240620`)
  to derive `familyId`, `familySlug`, `versionDate`, `versionQualifier`,
  `variantKey`, `variantLabel`. The cache script *rewrites* `model-cards.json`
  in place after download so the runtime sees a canonicalized version.
- Move: pipeline should emit canonical `family_id`, `family_slug`,
  `version_date`, `variant_key`, `variant_label` directly so neither the build
  script nor `lib/model-family.ts` has to re‑derive them.

### 2. Setup-alias merging ("prompt" / "fc" / "thinking" variants) — *dual: cleaning + reshape*
- Where: `lib/eval-processing.ts:371-434`
  (`getSetupAliasMode`, `getAggregatedVariantDescriptor`); duplicated in
  `scripts/cache-hf-data.mjs:199-246` (`getNormalizedVariantMeta`,
  `isSetupAliasQualifier`).
- What it does: looks at `model_info.additional_details.mode` to decide whether
  two model rows are the same release with different prompting setups
  ("prompt" / "fc" / "function calling" / "thinking…") and merges them under
  one variant key.
- Move:
  - **Cleaning half** — pipeline emits a canonical `variant_key` (or `setup_alias_key`) per submission row.
  - **Reshape half** — once the key is upstream, the bucket reduction (multiple rows with the same `variant_key` → single variant entry, `MAX(retrieved_timestamp)`, merged evaluation results) becomes SQL `GROUP BY variant_key` rather than a TS reduce loop.

### 3. Hierarchy → flat `BenchmarkEvaluation[]` rebuild — *reshape*
- Where: `lib/hf-data.ts:1236-1436`
  (`flattenModelEvaluations`, `flattenHierarchyNode`,
  `buildSourceMetadataIndex`).
- What it does: walks the pipeline's `hierarchy_by_category` tree, attaches
  `source_metadata` from a separate `evaluations_by_category` index (because
  hierarchy rows don't carry it — see comment at `hf-data.ts:1410-1416`),
  reconciles timestamps across variants, attaches inline samples, and re‑emits
  a flat array so `createModelFamilySummary()` can group it again.
- Move:
  - Denormalize `source_metadata` onto every hierarchy leaf so the side index
    isn't needed (this half is cleaning, already done as part of #4).
  - The flatten + variant-bucket reduction itself is reshape: emit a relational parquet schema (one row per `(eval_summary_id, variant_key, retrieved_timestamp, source_metadata, …)`) so the DuckDB backend can `SELECT … QUALIFY ROW_NUMBER() OVER (PARTITION BY variant_key ORDER BY retrieved_timestamp DESC) = 1` instead of TS walking the hierarchy and reducing variants. Decision pending: relational parquet vs pre-flattened JSON payload.

### 4. Source-metadata synthesis fallback — *cleaning (DONE)*
- Where: `lib/hf-data.ts:1049-1064` (`getCanonicalSourceMetadata`); copies in
  `lib/model-data.ts:736-741` (`toModelResultsForMetric`),
  `lib/model-data.ts:1114-1119` (`buildSingleMetricSuiteMatrixSummary`).
- What it does: when the artifact omits source metadata, hardcodes
  `source_type: "documentation"`, `evaluator_relationship: "other"`. The
  result: any code path that goes through these silently collapses 1st / 3rd-party
  badges to "Other".
- Move: source metadata should always be present on the artifact — the
  fallback is a known correctness gap.

### 5. Composite / aggregate eval construction — *reshape*
- Where: `lib/model-data.ts:874-1041` (`aggregateBenchmarkSummaries`).
- What it does: for any URL of the form `/evals/aggregate__<suite_key>`,
  fetches every sub-eval detail individually, normalizes scores, computes
  per-model averages, sorts, builds aggregate components, etc. ~170 lines.
- Move: per-model averaging across sub-evals + sort + composite assembly is reshape (groupby + aggregate). Two valid landing spots: (a) materialize as a first-class eval-detail file at pipeline emission time (`eval-hierarchy.json` already knows the composites), or (b) compute at query time in DuckDB SQL once eval rows are relational. Materialization is simpler if every consumer wants the same composite shape; query-time SQL gives consumer-driven slicing for free.

### 6. Synthetic single-metric matrix leaderboard — *reshape*
- Where: `lib/model-data.ts:1043-1214`
  (`buildSingleMetricSuiteMatrixSummary`).
- What it does: for `/evals/matrix__<suite_key>`, fetches every sub-eval,
  builds a model × subtask matrix, picks columns / rows, deduplicates, and
  reconciles per-row timestamps. ~170 lines.
- Move: pivot from long-form rows to wide model × subtask matrix is a SQL `PIVOT` (or grouped `MAX(score) FILTER (WHERE subtask = …)`) once eval rows are relational. Same materialize-vs-query-time choice as #5; lean toward materialization since the matrix shape is identical for every consumer.

### 7. Instance-level JSONL parsing — *cleaning*
- Where: `lib/hf-data.ts:919-1029` (`parseInstanceLevelData`,
  `fetchInstanceLevelData`).
- What it does: ~110 lines of heuristics probing for `input.raw`, `prompt`,
  `question`, `doc.question`, `doc`, `output`, `model_output`,
  `messages[].content`, `filtered_resps[0][0]`, `resps[0][0]`,
  `answer_attribution`, `evaluation.is_correct`, `metrics.exact_match`, etc.
- Why: shape detection across lm-eval-harness, HELM, Inspect, and other
  harness outputs.
- Move: pipeline should normalize each instance example to one canonical
  `{sample_id, input, ground_truth, response, is_correct, metadata}` shape so
  the frontend just renders.

### 8. Display-name lookup tables — *cleaning*
- Where:
  - `lib/model-data.ts:93-124` (`BENCHMARK_NAMES`, `getBenchmarkDisplayName`)
  - `components/benchmark-detail.tsx:101-173` (`SUITE_DISPLAY_NAMES`,
    `DISPLAY_TOKEN_OVERRIDES`, `DISPLAY_NAME_OVERRIDES`)
  - `lib/eval-processing.ts:861-885` (`getBenchmarkDisplayName`)
- What it does: hand-maintained maps that translate keys like `helm_lite` →
  "HELM Lite", `arc_agi` → "ARC-AGI", etc.
- Move: schema already has `canonical_display_name`; pipeline should populate
  it once and the frontend should drop the maps.

### 9. Developer name canonicalization — *cleaning*
- Where: `lib/model-data.ts:201-228` (`KNOWN_DEVELOPER_NAMES`,
  `normalizeDeveloperName`).
- What it does: `openai` → "OpenAI", `mistralai` → "Mistral AI",
  `deepseek-ai` → "DeepSeek", etc.
- Move: belongs in the pipeline's developer table.

### 10. Generic metric-name expansion — *cleaning*
- Where: `lib/eval-processing.ts:27-34, 70-86` (`GENERIC_EVALUATION_NAMES`,
  `getEvaluationDisplayName`); mirrored heuristically in
  `lib/model-data.ts:444-454` (`prefersBenchmarkName` detection of
  "accuracy on…", "score on…", "for scorer…", "model_graded").
- What it does: expands "Accuracy" → "MMLU - Accuracy" when the metric name
  is generic.
- Move: pipeline should emit a `display_name` that's already the right
  thing.

### 11. Category inference fallback — *cleaning (partial)*
- Where: `lib/benchmark-schema.ts:182-206` (`inferCategoryFromBenchmark`),
  used in `lib/eval-processing.ts:300-307`,
  `lib/model-data.ts:776, 819, 1194`. Plus `PIPELINE_CATEGORY_MAP` /
  `mapHFCategories` in `lib/hf-data.ts:1453-1469`.
- What it does: regex fallback when the pipeline omits `category`.
- Move: pipeline should emit `category` for every row so neither fallback nor
  `mapHFCategories` is necessary.

### 12. Parameter-count parsing from free text and model names — *cleaning*
- Where:
  - `lib/model-data.ts:296-338` (`parseParamsBillions`)
  - `components/eval-detail.tsx:81-184`
    (`parseParamsBillionsFromText`, `parseParamsBillionsFromModelName`,
    `getParamsBillionsFromModelInfo`)
  - `app/evals/[id]/page.tsx:434-437` (regex `\b(\d+(?:\.\d+)?)\s*[bB]\b`
    against `name + " " + id`)
- What it does: parses "70B", "1.5B", "405b", "7 billion", "1.2T" etc. The
  matrix leaderboard even regex-extracts size from the model display name.
- Move: pipeline should emit a normalized numeric `params_billions` so the
  frontend doesn't need parsers in three places.

### 13. Timestamp normalization — *dual: cleaning + reshape*
- Where: `lib/eval-processing.ts:322-330, 572-577, 962-968`,
  `lib/model-data.ts:60-65`, `components/eval-detail.tsx:218-238`,
  `lib/hf-data.ts:1035-1047` (`toComparableTimestamp`).
- What it does: timestamps arrive as either unix-seconds-as-string
  (`"1774096306.427425"`) or ISO strings, and the same `Number(ts)` /
  `new Date(ts)` branching is reimplemented at every read site.
- Move:
  - **Cleaning** — pipeline emits ISO-8601 strings everywhere (currently 99.99% unix-seconds-strings + 5 ISO).
  - **Reshape** — the comparison call sites (8 of them across `lib/model-data.ts`, `lib/hf-data.ts`, `components/benchmark-detail.tsx`) all exist to pick the freshest variant or sort by recency. Once timestamps are ISO 8601, `MAX(retrieved_timestamp)` and `ORDER BY retrieved_timestamp DESC` work as SQL — three TS normalizers + 8 callers delete together. See `notes/transformations/07-timestamp-normalization.md`.

### 14. Score normalization and summary stats — *reshape*
- Where: `lib/eval-processing.ts:946-991` (`groupEvaluationsByBenchmark`
  finalisation), `lib/model-data.ts:67-72, 803-851` (`hfEvalDetailToSummary`).
- What it does: recomputes `models_count`, `avg_score`, `avg_score_norm`,
  `best_model`, `worst_model`, `evaluator_names`, `source_types`,
  `latest_source_name`, `third_party_ratio`,
  `missing_generation_config_count` even though `eval-list.json` already
  carries `top_score` / `models_count`.
- Move: aggregation over `model_results` (count, avg, min/max, distinct counts, ratios) is reshape — pure SQL groupby. Materialize at pipeline emission OR compute at query time once `model_results` are relational rows in parquet. Either way the TS finalisation deletes.

### 16. Per-category benchmark counts on model cards — *reshape*
- Where: `lib/model-data.ts:354-363` (proportional distribution in
  `hfModelCardToEvaluationCardData`).
- What it does: because `model-cards.json` doesn't carry `category_stats`, TS
  does `Math.floor(total / categories.length)` to *fake* a per-category split.
- Move: per-(model, category) benchmark count is `SELECT model, category, COUNT(DISTINCT benchmark) GROUP BY model, category` — pure SQL groupby. Materialize as `category_stats` on the model card OR compute at query time. The TS `Math.floor(total / categories.length)` placeholder ships incorrect numbers; the SQL version is the actual answer.

### 17. Benchmark-card attachment at request time — *cleaning*
- Where: `lib/benchmark-metadata.ts:38-49` (`getBenchmarkCard`,
  `getMap`), `lib/model-data.ts:857-872` (`attachBenchmarkCardToSummary`).
- What it does: iterates 3 candidate names per eval and looks each up in a
  deduped `Map<string, BenchmarkCard>`.
- Move: eval-detail files already sometimes carry `benchmark_card` inline —
  the pipeline should always inline it (or always reference by stable key) so
  the runtime lookup table can be deleted.

### 18. License canonicalization — *cleaning*
- Where: `components/eval-card.tsx:22-48` (`LICENSE_COLORS`,
  `licenseBadgeClass`, `shortenLicense`).
- What it does: "Creative Commons Attribution 4.0" → "CC BY 4.0",
  "Apache License 2.0" → "Apache 2.0", "Creative Commons Zero" → "CC0", etc.
- Move: pipeline should expose a normalized SPDX-style license identifier
  alongside the long string.

### 19. Slug candidate generation for HF lookups — *cleaning*
- Where: `lib/model-data.ts:151-194` (`getModelDetailSlugCandidates`,
  `getDeveloperSlugCandidates`); used by `lib/model-data.ts:1467-1509`
  (`getModelSummaryById`).
- What it does: produces up to 6 spelling variants of a slug (`gpt-3.5` ↔
  `gpt-3-5`, `__` vs `/`, `_` vs `-`) and `getModelSummaryById` retries each
  candidate against the dataset.
- Move: the manifest could explicitly map every `model_family_id` /
  `route_id` → file path so retry loops disappear.

### 20. Dataset URL synthesis — *cleaning*
- Where: `components/eval-card.tsx:81-89`.
- What it does: computes
  `dataset_url ?? url[0] ?? https://huggingface.co/datasets/${hf_repo}` to
  derive a clickable link.
- Move: pipeline already has `hf_repo` and could just emit the resolved URL
  once.

## Suggested priorities

If triaging by payoff:

1. **#3 + #4 — hierarchy flatten + source-metadata index.** Eliminates the
   largest in-process function in the codebase and a known correctness bug
   ("Other" badge collapse).
2. **#5 + #6 — composites & matrix synthesis.** Replaces ~340 lines of
   request-time TS reconstruction with pre-built artifacts.
3. **#7 — instance JSONL parser.** Biggest brittleness surface; one
   normalization step in the pipeline removes a heuristic.
4. **#1 + #2 — identity parsing & setup-alias merging.** Removes
   triple-maintained logic across `lib/model-family.ts`,
   `lib/eval-processing.ts`, and `scripts/cache-hf-data.mjs`.
5. **#8–#13 — display names, developer names, params parsing, timestamps,
   category fallback.** Small individually, but together they are scattered
   "polish" code that should live next to the data.
