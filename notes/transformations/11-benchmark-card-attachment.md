# Benchmark-card attachment (per-eval lookup join)

Drafted 2026-04-28. Migration item #17 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency. TS-as-is is the canonical spec. The retry-loop iteration over candidate names is **load-bearing** in production: 85% of evals (499/587) reach this code path because the pipeline does not inline `benchmark_card` for them. Don't try to "fix" the candidate-name derivation or the dedup-on-first-name-collision behavior in `getMap()` — preserve them until pipeline always inlines `benchmark_card` upstream.

## Rule (as TS implements it today)

For each `BenchmarkEvalSummary` (detail page) or `BenchmarkEvalListItem` (list page), if `benchmark_card` is not already populated on the record, derive an ordered list of candidate names from the eval and try each one against a deduped `Map<string, BenchmarkCard>`. The first match wins; first hit attaches the card via spread (`{ ...summary, benchmark_card: card }`); no match leaves the record unchanged (passthrough).

The lookup is composed from three pieces:

1. **Map build** (`lib/benchmark-metadata.ts:11-28`, `readPipelineBenchmarkCards`)
   - Source: `benchmark-metadata.json` (Record<string, BenchmarkCard>) — currently 85 cards in production.
   - For each card with `card.benchmark_details.name`, generate `candidateBenchmarkKeys(name)` and insert each key into a `Map`.
   - **First-write-wins** dedup: `if (!map.has(key)) map.set(key, card)`. If two cards normalize to the same key, the first one inserted (i.e. the first one returned by `Object.values()`) takes the slot.
   - Cached for the lifetime of the process via `cachedMapPromise`.

2. **Per-name candidate generation** (`lib/benchmark-metadata-utils.ts:23-33`, `candidateBenchmarkKeys`)
   - Input: a free-text benchmark name.
   - Produces an array of up to 4 lookup keys via a `Set` (so duplicates collapse), in this order:
     1. `base = normalizeBenchmarkKey(name)` — the canonical form (see below).
     2. `base.replace(/-/g, " ")` — dashes → spaces.
     3. `base.replace(/ /g, "-")` — spaces → dashes.
     4. `base.replace(/[^a-z0-9]/g, "")` — strip everything to alnum.

3. **`normalizeBenchmarkKey`** (`lib/benchmark-metadata-utils.ts:10-18`) — the base normalizer:
   - Returns `""` for falsy input (does NOT fall through to `"unknown"` like `pipelineSlugify` does).
   - Strip a leading `<alnum_underscore_token>` followed by optional space and a `/` (e.g. `"hfopenllm_v2/mmlu"` → `"mmlu"`).
   - `.toLowerCase()`.
   - Collapse runs of `_` or `-` to a single space.
   - Collapse whitespace to single space.
   - `.trim()`.

4. **The retry loop over per-record candidate names** (`lib/model-data.ts:863-872`, `attachBenchmarkCardToSummary`)
   - Builds a list of three candidate names from the summary (in this exact order):
     1. `summary.evaluation_name`
     2. `summary.composite_benchmark_name`
     3. `summary.composite_benchmark_key`
   - For each, calls `getBenchmarkCard(candidate)` (which itself runs `candidateBenchmarkKeys` on the name and tries each key against the map).
   - First hit wins. No `.filter(Boolean)` here, so empty-string candidates still hit `getBenchmarkCard` (which then returns `null` because `normalizeBenchmarkKey("")` returns `""`).

   The list-item variant (`lib/duckdb-data.ts:133-156`, `attachBenchmarkCardsToEvalListItems` and `lib/model-data.ts:1264-1282` inline in `getEvalListData`) is identical except:
   - Order is `[evaluation_name, composite_benchmark_key, composite_benchmark_name]` (key BEFORE name — the inverse of the summary version).
   - Both wrap with `.filter(Boolean)` to drop empty/undefined candidates before the loop.

   This three-vs-three asymmetry between the summary path and list path is **TS-as-spec**: do not "harmonize" it. Same record can resolve to different cards via the two paths if the second and third candidates point at different benchmarks (in production this difference is benign — see "Divergences detected").

## Classification

- **Default-only** (do NOT overwrite when value present). Both attach functions guard with `if (summary.benchmark_card) return summary` / `if (item.benchmark_card) return item`. Pipeline-side fix: emit `benchmark_card` inline for every eval, then this branch is dead.
- **Cleaning → pipeline.** This is a per-record lookup join (eval × benchmark_card). The map build, candidate-name generation, and three-attempt retry exist only to reconcile the eval's free-text name against the benchmark-metadata file. Once the pipeline writes `benchmark_card: <BenchmarkCard>` directly into every `eval-list.json` / `eval-detail.json` record, all four pieces (map build, candidateBenchmarkKeys, normalizeBenchmarkKey, the two attach functions) delete together. No aggregation; no derived view.

## Inputs and expected outputs

### Group A — `normalizeBenchmarkKey`

| Input | Output | Rule branch |
|---|---|---|
| `"MMLU"` | `"mmlu"` | lowercase only |
| `"BIG-Bench Hard (BBH)"` | `"big bench hard (bbh)"` | dash → space |
| `"hfopenllm_v2/mmlu"` | `"mmlu"` | composite prefix stripped |
| `"hfopenllm_v2 / mmlu"` | `"mmlu"` | composite prefix stripped (with space before `/`) |
| `"GPQA / Diamond"` | `"diamond"` | composite prefix stripped — regex `/^[a-z0-9_]+ ?\//i` allows one optional space between the leading token and the `/` |
| `""` | `""` | falsy short-circuit (does NOT fall back to "unknown") |
| `"  MMLU  "` | `"mmlu"` | trim |
| `"foo___bar"` | `"foo bar"` | underscore run collapsed to single space |
| `"foo - - bar"` | `"foo bar"` | dash + space runs collapse |

### Group B — `candidateBenchmarkKeys`

| Input | Candidates returned (deduped, in order) | Why |
|---|---|---|
| `"MMLU"` | `["mmlu"]` | base only — no dashes, no spaces, alnum-only |
| `"BIG-Bench Hard (BBH)"` | `["big bench hard (bbh)", "big-bench-hard-(bbh)", "bigbenchhardbbh"]` | base; spaces→dashes; alnum-only. Dashes→spaces collides with base. |
| `"GSM-8K"` | `["gsm 8k", "gsm-8k", "gsm8k"]` | base; spaces→dashes; alnum-only |
| `"gsm 8k"` | `["gsm 8k", "gsm-8k", "gsm8k"]` | identical result; base/dashes-form collision |
| `"hfopenllm_v2/mmlu"` | `["mmlu"]` | composite prefix stripped first → no dashes/spaces |
| `""` | `[""]` | base is `""`; the four variants all collapse to `""` |

### Group C — `getBenchmarkCard` (per-name lookup against the deduped map)

Given a map built from cards `{ "mmlu": cardA, "big bench hard (bbh)": cardB, "gsm 8k": cardC }`:

| Input | Resolution | Notes |
|---|---|---|
| `"MMLU"` | cardA | base candidate `"mmlu"` hits |
| `"mmlu_categories/mmlu_pro"` | cardA only if `"mmlu pro"` not in map; otherwise `null`/no hit unless the prefix-stripped form `"mmlu_pro"` (after `^[a-z0-9_]+ ?\//` strips `mmlu_categories/`) → `"mmlu pro"` was indexed. Demonstrates: composite prefix stripping can either help (find a generic card for the leaf) or miss (if the leaf has its own card the map didn't index under that exact spelling). |
| `"BBH"` | `null` if cardB indexed under full title only | Reverse-lookup limitation — see "Divergences detected" |
| `""` | `null` | `normalizeBenchmarkKey("")` short-circuits to `""`; all four candidates are `""`; `map.get("")` → undefined |

### Group D — `attachBenchmarkCardToSummary` retry order

For a summary with `evaluation_name="bbh/category_x"`, `composite_benchmark_name="BIG-Bench Hard (BBH)"`, `composite_benchmark_key="bbh"`:

| Position | Candidate name | Lookup behaviour |
|---|---|---|
| 0 | `"bbh/category_x"` | `normalizeBenchmarkKey` strips `bbh/` → `"category_x"` → `"category x"` — likely no match |
| 1 | `"BIG-Bench Hard (BBH)"` | `candidateBenchmarkKeys` produces `"big bench hard (bbh)"` → likely match |
| 2 | `"bbh"` | base `"bbh"` → only matches if cards indexed the abbreviation |

If position 1 hits, the loop short-circuits and the spread happens. If all three miss, `summary` returned unchanged.

### Group E — pre-attached benchmark_card (default-only guard)

| Input | Output |
|---|---|
| `summary.benchmark_card = <existing card>` | returned as-is, no map lookup |
| `summary.benchmark_card = null` | falsy → falls through to retry loop |
| `summary.benchmark_card = undefined` | falsy → falls through to retry loop |

## Current TS implementation

| Concern | Location |
|---|---|
| Map build + caching | `lib/benchmark-metadata.ts:11-36` (`readPipelineBenchmarkCards`, `getMap`, `cachedMapPromise`) |
| Per-name lookup | `lib/benchmark-metadata.ts:38-49` (`getBenchmarkCard`) |
| Reverse map flatten (used by `/api/benchmark-metadata` route) | `lib/benchmark-metadata.ts:51-66` (`getAllBenchmarkCards`) |
| Candidate-key generation | `lib/benchmark-metadata-utils.ts:23-33` (`candidateBenchmarkKeys`) |
| Base normalizer | `lib/benchmark-metadata-utils.ts:10-18` (`normalizeBenchmarkKey`) |
| Summary attach (3-candidate retry) | `lib/model-data.ts:860-875` (`attachBenchmarkCardToSummary`) |
| List-item attach (3-candidate retry, key before name) | `lib/duckdb-data.ts:133-156` (`attachBenchmarkCardsToEvalListItems`) |
| List-item attach (inline, key before name, JSON backend) | `lib/model-data.ts:1264-1282` (inside `getEvalListData`) |

### Call sites

| Location | What it does |
|---|---|
| `lib/model-data.ts:870` | `attachBenchmarkCardToSummary` core (3-candidate retry over [evaluation_name, composite_benchmark_name, composite_benchmark_key]) |
| `lib/model-data.ts:1272` | `getEvalListData` inline 3-candidate retry over [evaluation_name, composite_benchmark_key, composite_benchmark_name] (note the swapped 2nd/3rd) |
| `lib/model-data.ts:1562` | aggregate eval path — calls `attachBenchmarkCardToSummary` per sub-eval before passing into `aggregateBenchmarkSummaries` |
| `lib/model-data.ts:1595` | synthetic-matrix eval path — single attach call |
| `lib/model-data.ts:1602` | direct eval lookup — single attach call |
| `lib/duckdb-data.ts:147` | DuckDB list-item retry (in `attachBenchmarkCardsToEvalListItems`) |
| `lib/duckdb-data.ts:179` | DuckDB single-eval path — calls `attachBenchmarkCardToSummary` |
| `lib/duckdb-data.ts:218` | DuckDB list path — calls `attachBenchmarkCardsToEvalListItems` |
| `app/api/benchmark-metadata/route.ts:5` | `/api/benchmark-metadata` route — exposes `getAllBenchmarkCards()` (the reverse flatten); not part of the per-eval attach but lives in the same module |

Total: 7 attach call sites across 2 files (3 in `model-data.ts` + 1 inline + 3 in `duckdb-data.ts` + the inline list loop). All would delete together once pipeline always inlines.

## Pipeline status — divergences

Audited 2026-04-28 against `.cache/hf-data/` (587 evals, 85 benchmark cards in `benchmark-metadata.json`).

### Coverage of inline `benchmark_card` (audited 2026-04-28)

- **88 / 587 evals (15.0%)** already have `benchmark_card` populated inline by the pipeline (in both `eval-list.json` and the per-eval JSONs under `evals/`).
- **499 / 587 evals (85.0%)** fall through to the runtime retry loop.
- **`eval-list.json` and per-eval `evals/*.json` agree** on which records carry inline cards (88 each — same set). The pipeline inlines symmetrically across both files.

### Retry-loop position distribution (of the 499 lookups)

| Position | Summary path (name, name, key) | List path (name, key, name) |
|---|---|---|
| 0 (1st candidate hits) | 10 (2.0%) | 10 (2.0%) |
| 1 (2nd candidate hits) | 0 | 0 |
| 2 (3rd candidate hits) | 0 | 0 |
| -1 (no candidate hits) | 489 (98.0%) | 489 (98.0%) |

**The retry tail is dead code in production today.** Of the 499 lookups, the 1st candidate either hits (10) or no candidate ever hits (489). The 2nd and 3rd candidate retries never resolve anything. This is consistent with the data: the 489 misses are evaluations like `"artificial_analysis.median_output_tokens_per_second"` where no card exists in `benchmark-metadata.json` at all — not a lookup failure, just absence.

That said: the retry IS the only thing that adds the 88 inline + 10 retry-position-0 = 98 cards to the runtime view. The retry positions 1 and 2 are kept TS-as-spec — they may be load-bearing in past or future data, and don't cost anything to preserve until pipeline always inlines.

### Asymmetric retry order between summary and list paths

### Asymmetric retry order between summary and list paths

| Path | Order | Source |
|---|---|---|
| Summary attach | `[evaluation_name, composite_benchmark_name, composite_benchmark_key]` | `lib/model-data.ts:863-867` |
| List-item attach (both backends) | `[evaluation_name, composite_benchmark_key, composite_benchmark_name]` | `lib/duckdb-data.ts:140-144`, `lib/model-data.ts:1270` |

User-visible effect: an eval where `composite_benchmark_key` resolves to a different card than `composite_benchmark_name` would attach the wrong (or different) card depending on whether you reached it through the list page or the detail page. **In production today: 0 disagreements** (audited 2026-04-28). The asymmetry is theoretically observable but has no current impact — usually because the 1st candidate (`evaluation_name`) hits before either path reaches its swapped 2nd/3rd positions.

Reproduce-don't-improve: the pipeline-side fix is to inline `benchmark_card` so both call sites resolve to the same value. Do NOT pick one of the two retry orders and propagate it.

### Map-build first-write-wins collisions

`readPipelineBenchmarkCards` indexes each card under `candidateBenchmarkKeys(card.benchmark_details.name)` and uses `if (!map.has(key)) map.set(key, card)`. If two cards have names that normalize to the same key, the **second** card is silently dropped from the map under that key (it may still be reachable via another candidate key it generates uniquely, but the colliding key permanently points at the first card encountered).

Order is `Object.values(cards)` — i.e. the JSON insertion order from `benchmark-metadata.json`. **Production count: 4 collisions** (audited 2026-04-28) involving 2 distinct duplicated names:

- `"Holistic Evaluation of Language Models (HELM)"` — `helm_capabilities` keeps the slot; `helm_instruct` is silently dropped under all colliding keys. The two cards have **different content** (overview lengths 466 vs 514). Anyone looking up "HELM" by name gets `helm_capabilities`; the `helm_instruct` card is unreachable via the runtime lookup unless the eval references the key `helm_instruct` directly (which would route through `composite_benchmark_key`, then `normalizeBenchmarkKey("helm_instruct")` → `"helm instruct"` → no match in the map either).
- `"LiveCodeBench"` — `livecodebenchpro` keeps the slot; `livecodebench_pro` is dropped. The two cards have **identical content** (same `overview` string). Benign.

The HELM case is a real data-correctness divergence: TS silently picks one of two distinct cards under the same name. Reproduce-don't-improve: the pipeline-side fix is to disambiguate the names in `benchmark-metadata.json` (or have evals reference cards by stable id rather than name), then inline the chosen card on each eval. Don't add disambiguation logic in TS.

Reproduce-don't-improve: pipeline should emit per-eval `benchmark_card` directly so this map-build path becomes dead code. No need to teach pipeline to detect collisions.

### Reverse-lookup limitation

A card's `benchmark_details.name` is the only string indexed. If an eval references a benchmark by a different name (abbreviation, alternate casing, missing parens), the lookup misses unless one of the four `candidateBenchmarkKeys` variants happens to collide with a variant of the card's name.

Example: a card named `"BIG-Bench Hard (BBH)"` is indexed under `"big bench hard (bbh)"`, `"big-bench-hard-(bbh)"`, `"bigbenchhardbbh"`. An eval named `"BBH"` produces candidates `["bbh"]` only — miss. The audit script counts how many evals fall into this category.

Reproduce-don't-improve: this is the entire reason for migration item #17. Pipeline knows the card-to-eval mapping at build time; it shouldn't push a fuzzy-match problem to the runtime.

**Orphaned cards (audited 2026-04-28): 29 / 83 distinct cards** in `benchmark-metadata.json` are not reached by any eval through any lookup path — examples include `"arc_agi_v1_public_eval"`, `"arc_agi_v2_semi_private"`, the `bfcl_*` family of 7 cards, `"IMDB"`, `"NarrativeQA"`, `"NaturalQuestions (open-book)"`, `"RAFT"`. These cards are either (a) for benchmarks not yet evaluated in the corpus, or (b) cards whose `benchmark_details.name` doesn't normalize to anything any eval looks up. Pipeline owner should triage. (Not a TS bug — TS faithfully looks up; the cards are never asked for.)

## Notes for pipeline implementer

The cleanest fix: **emit `benchmark_card: <BenchmarkCard>` inline on every eval** — both `eval-list.json` entries and every `evals/<id>.json` detail file. The pipeline already does this for 15% of evals; extend coverage to 100%.

Acceptance criteria:

1. Every record in `eval-list.json` has `benchmark_card` populated when a card exists for that benchmark; `null` only when no card exists in `benchmark-metadata.json` for the benchmark.
2. Every `evals/<id>.json` file has matching `benchmark_card` for the same eval (same value as the list entry — they should not disagree).
3. The DuckDB-emitted parquet (consumed via `lib/duckdb-data.ts`) carries `benchmark_card` in the same column for every row.

Once pipeline meets criteria, all of the following delete:

- `lib/benchmark-metadata.ts` entirely (after migrating `/api/benchmark-metadata` to read from `benchmark-metadata.json` directly or from a pipeline-emitted reverse map).
- `lib/benchmark-metadata-utils.ts:candidateBenchmarkKeys`, `normalizeBenchmarkKey` — but the file may need to stay for the `/api/benchmark-metadata` route's `lookupBenchmarkCard` if any client component depends on it. Audit before deleting.
- `lib/model-data.ts:attachBenchmarkCardToSummary` (function + 3 call sites).
- `lib/model-data.ts` inline retry inside `getEvalListData` (lines 1264-1282).
- `lib/duckdb-data.ts:attachBenchmarkCardsToEvalListItems` (function + 1 call site) + `attachBenchmarkCardToSummary` import + the wrapping call in `toEvalSummary`.

Don't try to reproduce the 4-candidate `candidateBenchmarkKeys` derivation upstream. The point of the migration is to make it unnecessary.

## Migration checklist

- [x] Spec written
- [x] Tests cover each rule branch (`tests/transformations/benchmark-card-attachment.test.ts`)
- [x] Audit script produced (`scripts/verify-benchmark-card-attachment.mjs`)
- [ ] Filed with pipeline owner (link)
- [ ] Pipeline emits `benchmark_card` inline on 100% of `eval-list.json` entries (currently 15%)
- [ ] Pipeline emits `benchmark_card` inline on 100% of `evals/*.json` files (currently 15%)
- [ ] DuckDB parquet carries `benchmark_card` column in `evalList` and `evalDetails` outputs
- [ ] TS code deleted; callers read pipeline field directly (7 call sites + 1 module)

## Future product decision (deferred)

The `getAllBenchmarkCards()` reverse-flatten (used by `/api/benchmark-metadata` route) consumes the same map but produces a `Record<normalizedKey, card>` with `seen.has(card)` dedup, keyed by `normalizeBenchmarkKey(card.benchmark_details.name)` (which may not match what the map keys point at if there were collisions). Whether the route should keep using the map-derived form or read from `benchmark-metadata.json` directly is a separate decision for the cleanup pass — surface to pipeline owner.
