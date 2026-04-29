# TS→pipeline migration plan

Drafted 2026-04-27. Companion to `notes/ts-to-pipeline-migration.md` (the original 20-item catalog) and `notes/testing-strategy.md` (the safety net we're building before doing more deletions).

## What's already shipped

See `notes/ts-to-pipeline-migration.md` "Status" section for full detail. Briefly:

- **#4 source-metadata synthesis fallback** — deleted. Pipeline emits on every row; runtime `assertSourceMetadata` guard added at read sites; 86 183/86 183 production rows now show real first/third-party badges (was the explicit goal).
- **#11 category — partial** — extended `PIPELINE_CATEGORY_MAP` with the 3 missing pipeline keys (all → "General"); removed the regex fallback from `mapHFCategories`. Reverted the more-aggressive call-site changes after subagent audit found 1 500+ Safety rows would have been silently General-ified. Left as TS code path until pipeline-side category accuracy improves (84% of evals currently emit `category: "other"`).

## Framing: TS is the current source of truth

Every TS transformation in `lib/` exists because the pipeline didn't do it (yet) — token canonicalization, variant grouping, source-metadata defaults, category inference, score normalization, etc. The migration is to lift each transformation upstream so the pipeline emits canonical data and every consumer reads instead of re-deriving.

Two failure modes to avoid (per the Phase 3 category regression and the 2026-04-28 v/V finding):

- **Treating a transformation as if it were a default.** TS rules that *normalize* (always overwrite) must be implemented as normalization in pipeline; rules that *fill in defaults* (only when value missing) must be defaults. Misclassifying causes silent data shifts. Each spec calls out which kind it is.
- **Deleting TS before verifying pipeline matches across the full corpus.** `pnpm audit-adapters --diff` is the verification gate. No deletion ships until pipeline-side output is byte-identical (or differences are explicitly accepted in writing).

## Data direction: cleaning upstream, reshape in SQL, presentation stays in TS

Standing principle for this migration and beyond. Every TS transformation belongs in one of three places:

- **Data cleaning / standardization → pipeline** (changes what the data *is*; canonical form every consumer would want). License strings, developer names, identity tokens, timestamp formats, category labels, source-metadata defaults. Pipeline emits canonical values; every consumer reads. The per-item workflow below is built for this class.
- **Reshape / dedup / aggregate / sort / filter → DuckDB SQL** (derived view over universal data; every consumer would compute the same thing). Variant dedup, "freshest among candidates", per-category counts, hierarchy flattening, composite rollups. Two valid landing spots: materialized into the pipeline's parquet output (read by DuckDB without further computation) or expressed as SQL at query time. Favor materialization when the answer is identical for every consumer; favor query-time SQL when consumers slice differently.
- **UI / presentation policy → stays in TS** (app-specific curation choices; different consumers would have different opinions). Card layout, color choices, sort orders for category displays, icon assignments, which fields to surface vs hide. These encode product judgments specific to this app — pipeline-emitting them would inflict this UI's choices on every other consumer of the dataset. Keep in TS, treat as out of scope for the migration.

The test for which category an item belongs in: *would every reasonable consumer want the same answer?* If yes, it's cleaning or reshape (depending on whether it's a value transform or a derived view). If no, it's UI policy and stays.

A trap to watch for: an item can *look* like UI policy because the TS code encodes opinion (e.g. a regex map that ranks things), but actually the curation already lives in the pipeline and the TS code is dead/passthrough. **Always trace which code path actually runs in production before classifying — grep for the function name across `app/`/`components/`/`scripts/`, then chain through caller graphs.** "TS file exists" doesn't mean "TS is doing the work."

The current DuckDB backend is mid-migration scaffolding. The parquet schema (see `pipeline.py write_experimental_parquet_table`) has 11 typed metadata columns (`record_type`, `model_route_id`, `model_family_id`, `eval_summary_id`, `developer_route_id`, `developer`, `category`, `benchmark_family_key`, `models_count`, `total_evaluations`, `last_updated`) plus a `payload_json VARCHAR` column. DuckDB queries today use the metadata columns for routing (`WHERE eval_summary_id = ?`) and always select `payload_json` for the substantive data — variants, model_results, scores, retrieved_timestamps are all nested inside the blob. SQL can route, but it can't reshape what it can't see.

Two open design questions for the reshape class, both legitimate, neither decided:

- **How relational does parquet need to go?** Promoting nested fields to columns (e.g. one row per `(eval_summary_id, variant_key, retrieved_timestamp, source_metadata)` for the variant dedup case) lets SQL do the work directly: `SELECT … QUALIFY ROW_NUMBER() OVER (PARTITION BY variant_key ORDER BY retrieved_timestamp DESC) = 1`. But it's a substantial schema change negotiated with the pipeline owner.
- **Materialize the answer upstream vs. compute at query time?** Materialize when the answer is identical for every consumer (variant dedup, per-category counts). Compute at query time when consumers slice differently (filtered top-N, user-selected category aggregates). The split is per-case judgment.

What the principle rules out: keeping reshape work in TS adapters after data cleaning moves upstream. "Spec done, pipeline matches, TS deleted" is only complete if the work that's left is presentation, not computation. When specing each item, classify it: cleaning (per-item workflow) or reshape (queue for the parquet-schema / SQL design conversation).

## Per-item workflow

For each remaining item, the work is the same shape:

1. **Spec the transformation** — write `notes/transformations/NN-<name>.md` per the template in `notes/transformations/README.md`. Capture every rule branch. Two required classifications: (a) default-vs-normalization (see Framing section above), (b) cleaning-vs-reshape (see Data direction section above). If it's reshape, capture the *operation* and flag for the SQL design conversation rather than writing a line-by-line TS translation. Document detected divergences against pipeline.
2. **Test the transformation** — write `tests/transformations/<name>.test.ts` with parameterized tests sourced from the spec table. These double as the executable acceptance criterion for pipeline.
3. **Hand to pipeline** — file the spec + tests with the pipeline owner (an issue/PR in `eval_cards_backend_pipeline`). Reference the unit tests as the contract.
4. **Verify cross-corpus match** — once pipeline ships, run the verification script (`scripts/verify-identity.mjs` for #1, similar scripts per item) against the full live cache. Zero divergences before proceeding.
5. **Pre-process in this repo (optional, if needed)** — only when the gap between TS and pipeline is intolerable to wait through. Not the default. A one-shot Python pre-processor at data ingestion time is acceptable; on-the-fly TS computation is what we're trying to leave behind.
6. **Delete TS** — remove the implementation; update callers to read pipeline fields directly. This is its own task in the tasklist (e.g. #5b for #1), gated on step 4.

## The 18 remaining items

| Item | Transformation (TS location) | Status | Spec |
|---|---|---|---|
| #1 | Identity canonicalization (`lib/model-family.ts`) | spec written 2026-04-28; awaiting pipeline | [01-identity-canonicalization.md](transformations/01-identity-canonicalization.md) |
| #2 | Setup-alias merging (`lib/eval-processing.ts:371-434`) | not yet specced | — |
| #3 | Hierarchy flatten + family summary (`lib/hf-data.ts flattenModelEvaluations`, `lib/eval-processing.ts createModelFamilySummary`) | not yet specced; structural decision pending (consumer rewrite vs pipeline-emit-flat-list) | — |
| #5 | Composite eval rollup (`lib/model-data.ts:874-1041 aggregateBenchmarkSummaries`, ~170 lines) | not yet specced | — |
| #6 | Matrix leaderboard synthesis (`lib/model-data.ts:1043-1214`, ~170 lines) | not yet specced | — |
| #7 | Per-instance JSONL normalization (`lib/hf-data.ts:919-1029`, ~110 lines of heuristics) | not yet specced; biggest brittleness | — |
| #8 | Benchmark display names (`BENCHMARK_NAMES` in `lib/model-data.ts:92`, `SUITE_DISPLAY_NAMES`, etc.) | not yet specced | — |
| #9 | Developer name canonicalization (`KNOWN_DEVELOPER_NAMES` in `lib/model-data.ts:201-228`) | not yet specced | — |
| #10 | Metric display-name expansion (`GENERIC_EVALUATION_NAMES` + `prefersBenchmarkName` heuristic) | not yet specced | — |
| #11 | Category inference (`inferCategoryFromBenchmark` regex in `lib/benchmark-schema.ts:182-206`) | partially handled; pipeline category is too noisy ("other" 84% of evals) — TS regex is the more accurate spec until pipeline improves | — |
| #12 | Params parsing (`parseParamsBillions` in `lib/model-data.ts:296-338` + dups) | not yet specced | — |
| #13 | Timestamp normalization (`toComparableTimestamp` + ~5 dups) | not yet specced; small | — |
| #14 | Score summary stats (`groupEvaluationsByBenchmark` finalisation) | not yet specced | — |
| #16 | Per-category benchmark counts (`hfModelCardToEvaluationCardData` proportional split) | not yet specced; today TS uses `Math.floor(total / categories.length)` as a fake distribution | — |
| #17 | Benchmark-card attachment (`attachBenchmarkCardToSummary` + 3-candidate retry) | not yet specced | — |
| #18 | License canonicalization (`LICENSE_COLORS`/`shortenLicense` in `components/eval-card.tsx:22-48`) | not yet specced | — |
| #19 | Slug candidate generation (`getModelDetailSlugCandidates`/`getDeveloperSlugCandidates`) | not yet specced; the 6-spelling retry in `getModelSummaryById` is the symptom | — |
| #20 | Dataset URL synthesis (`components/eval-card.tsx:81-89`) | not yet specced; tiny | — |

The pipeline lives at `/Users/jchim/projects/eval_cards_backend_pipeline`. See its `AGENTS.md` for Python conventions, run instructions, and the `EXPORT_EXPERIMENTAL_PARQUET=1` flag. Pipeline changes are full-rebuild — `output/` is wiped and rewritten each run.

## Recommended order

1. **Testing harness** — done 2026-04-27 (Tier A/B/C + fixtures + audit script).
2. **#1 identity canonicalization** — spec written 2026-04-28, awaiting pipeline implementation.
3. **#2 setup-alias merging** — same shape as #1; spec next.
4. **Small wins #16, #18, #19, #20** — each is a contained transformation. Spec, hand off, batch them on the pipeline side.
5. **#3 hierarchy flatten** — structural decision needed first (consumer-rewrite vs pipeline-emit-flat-list). Bigger work.
6. **#5, #6, #14** — composites + matrix + summary stats. Bigger pipeline work.
7. **#11 category** — pipeline must improve `category` accuracy (84% currently emit `other`); until then TS regex is the spec.
8. **#7 per-instance JSONL** — biggest brittleness, biggest payoff. Defer until others are done.

Items #8, #9, #10, #12, #13, #17 fold into the natural sweep around #3 or #14 — they share consumers.

## What can be parallelized right now

If multiple agents/sessions run in parallel:

- **Agent 1 (this repo):** build `tests/fixtures/` + `tests/pipeline-contract.test.ts` (Tier A from testing-strategy.md)
- **Agent 2 (this repo):** build `scripts/audit-adapters.mjs` (Tier C from testing-strategy.md)
- **Agent 3 (pipeline repo):** sweep through #16, #18, #19, #20 — small Python emissions

Tier B (snapshot tests) needs the fixture set first, so it serializes after Agent 1.

After tests are in: TS deletions #1 and #2 can each be a parallel agent.

## Cross-repo coordination

When pipeline-side work happens, it changes the contract our TS depends on. Sequence:

1. Pipeline emits new field, runs `EXPORT_EXPERIMENTAL_PARQUET=1` locally to materialize.
2. Pipeline ships; user re-publishes to HF.
3. Our repo: `pnpm cache-hf-data` to refresh local cache.
4. Our repo: `pnpm refresh-fixtures` to pin new shape.
5. Our repo: `pnpm test` to confirm contracts pass.
6. Our repo: do the TS deletion.
7. Our repo: `pnpm test` again — snapshots will diff if behavior changes.

For the local development loop, both repos can be exercised against `eval_cards_backend_pipeline/output/` directly using the `HF_DATA_LOCAL_DIR` + `HF_DATA_OFFLINE` env vars from `notes/ts-to-pipeline-migration.md`. No HF round-trip needed for testing.

For the full picture of how upstream changes propagate (drift detection, scenario matrix, cross-repo workflow), see `notes/testing-strategy.md` § "How upstream changes propagate" and § "Workflows".
