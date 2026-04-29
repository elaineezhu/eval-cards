# Transformations registry

Canonical specs for data transformations the Next.js app currently performs that should ultimately live in the upstream pipeline (`eval_cards_backend_pipeline`).

## Framing

The TS code in `lib/` does meaningful data transformation work — token canonicalization, variant grouping, source-metadata defaults, category inference, score normalization, etc. — most of which the Python pipeline does not yet do (or does differently). For this migration:

- **TS is the current source of truth** for what these transformations should produce. The TS rules have been refined over time against real evaluation data; they encode product decisions.
- **Each transformation is a candidate to move upstream.** The pipeline owns data shape and content; doing the transformation there means every downstream consumer (not just this Next.js app) gets the canonical form.
- **The migration path** for each item: write a spec here → write executable tests sourced from the spec → hand the spec + tests to the pipeline owner → verify pipeline output matches across the full corpus → delete the TS implementation.
- **Pre-processing in this repo (e.g. a one-shot Python script run at data-ingestion time) is allowed but not required.** Default is "transformation stays in TS until pipeline catches up." Front-load only when the TS implementation is so brittle or expensive that on-the-fly is intolerable.

## One thing to watch: defaults vs unconditional normalization

For each rule, classify in the spec how it interacts with pre-existing data:

- **Default-only (don't overwrite when pipeline already emits a value)**: e.g. "if `source_metadata.evaluator_relationship` is missing, default to `other`". Pipeline-side fix is to emit the default upstream rather than letting consumers fill in.
- **Unconditional normalization (always overwrite)**: e.g. "lowercase the `v` in version tokens regardless of upstream input". Pipeline-side fix is to apply the rule before emitting; downstream consumers should not need to re-derive.

Mis-classifying these is the failure mode that bit us in Phase 3 (treating a normalization rule as if it were a default, ending up overwriting category data). Each spec must call out which kind it is.

## Where it belongs: cleaning vs reshape

A second classification each spec should call out — *what kind of work* is this transformation?

- **Cleaning / standardization** (changes a value): license shorthand, developer name canonicalization, identity tokens, timestamp format, category labels. These belong in the pipeline; the per-item workflow above is built for them. Default-vs-normalization (the section above) is the sub-question.
- **Reshape / dedup / aggregate** (computes a derived view): variant dedup with "freshest wins", per-category counts, top-scores ranking, hierarchy flattening. These belong in **DuckDB SQL** — either materialized into pipeline parquet (the answer is the same for every consumer; emit it pre-computed) or expressed as a query at request time (consumers slice differently; let SQL do the work). The TS implementation here is scaffolding.

For the reshape class the migration target shape is itself a design choice — capture the *operation* (e.g. "max `retrieved_timestamp` wins per variant key, take its `source_metadata` along") and flag it for the parquet-schema / SQL conversation rather than mechanically translating the TS code line-by-line. See `notes/migration-plan.md` § "Data direction" for the full framing.

## Index

| # | Transformation | Spec | Tests | Pipeline status | Migration item |
|---|---|---|---|---|---|
| 01 | Model identity canonicalization | [01-identity-canonicalization.md](01-identity-canonicalization.md) | [tests/transformations/identity-canonicalization.test.ts](../../tests/transformations/identity-canonicalization.test.ts) | partial (model_family_id ✅, model_family_name ❌ on 1,260 cards) | #1 |
| 02 | Setup-alias variant merging | [02-setup-alias-merging.md](02-setup-alias-merging.md) | [tests/transformations/setup-alias-merging.test.ts](../../tests/transformations/setup-alias-merging.test.ts) | not started (cache file shows pre-merge state; runtime normalizer is what merges) | #2 |
| 03 | License string normalization | [03-license-normalization.md](03-license-normalization.md) | [tests/transformations/license-normalization.test.ts](../../tests/transformations/license-normalization.test.ts) | not implemented; pipeline emits free-text `data_licensing` only | #18 |
| 04 | Dataset URL synthesis | [04-dataset-url-synthesis.md](04-dataset-url-synthesis.md) | [tests/transformations/dataset-url-synthesis.test.ts](../../tests/transformations/dataset-url-synthesis.test.ts) | not implemented; `dataset_url` field never populated in prod (564/587 use `url[0]`, 22/587 use `hf_repo` template) | #20 |
| 05 | Slug candidate generation (file lookup) | [05-slug-candidates.md](05-slug-candidates.md) | [tests/transformations/slug-candidates.test.ts](../../tests/transformations/slug-candidates.test.ts) | not implemented; 39% of model lookups + 43% of developer lookups need a non-zero retry position in production | #19 |
| 06 | Developer name canonicalization | [06-developer-name-canonicalization.md](06-developer-name-canonicalization.md) | [tests/transformations/developer-name-canonicalization.test.ts](../../tests/transformations/developer-name-canonicalization.test.ts) | not implemented; pipeline emits raw `developer` string. TS map covers 1.8% of devs / 11.9% of cards; title-case fallback fires on 55.6% of devs / 48.4% of cards | #9 |
| 07 | Timestamp normalization | [07-timestamp-normalization.md](07-timestamp-normalization.md) | [tests/transformations/timestamp-normalization.test.ts](../../tests/transformations/timestamp-normalization.test.ts) | not implemented; production is 99.99% unix-seconds-strings (86,178/86,183) + 5 ISO datetime. Three different TS variants exist with subtly different semantics — pipeline canonicalization to ISO 8601 collapses them | #13 |
| 08 | Benchmark display names | [08-benchmark-display-names.md](08-benchmark-display-names.md) | [tests/transformations/benchmark-display-names.test.ts](../../tests/transformations/benchmark-display-names.test.ts) | not implemented; 30-entry hand-curated map covers ~74% of distinct suite keys but only ~3% of distinct `benchmark` values; ~97% fall through to a `humanizeToken` fallback that mangles acronyms (`MMLU-PRO` → `MMLU PRO`, `helm_air_bench` → `Helm Air Bench`). A second functionally-dead duplicate exists in `lib/eval-processing.ts` with substring-match semantics that disagree with the active path. | #8 |
| 09 | Metric display name expansion | [09-metric-display-name-expansion.md](09-metric-display-name-expansion.md) | [tests/transformations/metric-display-name-expansion.test.ts](../../tests/transformations/metric-display-name-expansion.test.ts) | defensive scaffolding; both rules fire 0 times against current corpus (0/86,183 result rows for generic-name expansion; 0/587 eval-list entries for prefersBenchmarkName heuristic) | #10 |
| 10 | Params billions parsing | [10-params-parsing.md](10-params-parsing.md) | [tests/transformations/params-parsing.test.ts](../../tests/transformations/params-parsing.test.ts) | partial; `model-cards.json.params_billions` is clean number for 87% of cards (5072/5830); per-row `additional_details.params_billions` is string for 31.7% of rows (27,361/86,183), 47.2% (40,648) have no resolved value at all. Five different TS parsers diverge on edge cases — Variant C's "context-window beats param count" quirk fires on 472 rows (0.55%, names like `Yi-1.5-34B-32K`) | #12 |
| 11 | Benchmark-card attachment (per-eval lookup join) | [11-benchmark-card-attachment.md](11-benchmark-card-attachment.md) | [tests/transformations/benchmark-card-attachment.test.ts](../../tests/transformations/benchmark-card-attachment.test.ts) | partial; pipeline inlines `benchmark_card` on 88/587 evals (15%), other 499 fall through to runtime retry. Of those, 10 hit at position 0 and 489 miss entirely (most lack any matching card in `benchmark-metadata.json`). Map-build first-write-wins silently drops the `helm_instruct` card (different content from kept `helm_capabilities`, both named "HELM"); 29/83 cards orphaned | #17 |
| 12 | Per-instance JSONL normalization | [12-instance-level-data.md](12-instance-level-data.md) | [tests/transformations/instance-level-data.test.ts](../../tests/transformations/instance-level-data.test.ts) | pipeline emits canonical shape; parser's defensive fallback branches mostly dead (input/ground_truth/is_correct/sample_id all 100% via the canonical path; response splits 97.31% answer_attribution / 2.49% messages / 0.20% output). 712/86,183 result rows (0.83%) have inline samples; full sets (~35k samples) sit behind `source_url` and are accessible only via the orphaned `fetchInstanceLevelData` (no current UI consumer). | #7 |

(More entries land as we work each migration item. See `notes/migration-plan.md` for the full backlog.)

## File format

Each spec follows the same structure so pipeline owner can read them uniformly. Template:

```markdown
# <Transformation name>

## Rule
[Plain-English description of what the transformation does]

## Classification
- [ ] Default-only (do not overwrite when value present)
- [ ] Unconditional normalization (always apply)
[explanation]

- [ ] Cleaning / standardization → pipeline (changes a value's content; use per-item workflow)
- [ ] Reshape / dedup / aggregate → DuckDB SQL (computes a derived view; capture operation, flag for parquet-schema/SQL conversation)
[explanation — if both halves apply, explain the split]

## Inputs and expected outputs
[Table: input | expected output | notes / which rule branch this hits]

## Current TS implementation
- [file:line references]
- [key helpers/constants]

## Pipeline status
[Per-rule status against full live cache: matches / disagrees / not implemented]

## Divergences detected
[Concrete examples of pipeline-vs-TS disagreement, with row counts]

## Migration checklist
- [ ] Spec written
- [ ] Tests cover each rule branch
- [ ] Filed with pipeline owner (link)
- [ ] Pipeline emits matching values across full corpus
- [ ] TS code deleted; callers read pipeline fields directly
```
