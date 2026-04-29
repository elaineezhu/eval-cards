# Slug candidate generation (model + developer file lookup)

Drafted 2026-04-28. Migration item #19 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency. TS-as-is is the canonical spec. The retry logic is **load-bearing** in production (39% of model lookups and 99.9% of developer lookups depend on a non-zero retry position). Don't try to "clean up" the candidate generation — preserve it until pipeline emits canonical-by-construction filenames.

## Rule (as TS implements it today)

Three pure functions in `lib/model-data.ts:150-211` translate model and developer identifiers into ordered lists of candidate filenames to try when looking up the corresponding JSON in the HF cache (`models/<slug>.json`, `developers/<slug>.json`).

### `pipelineSlugify(text)` — base helper

Mirrors the slug rule the upstream pipeline uses:

1. Strip control characters (`\x00-\x1f\x7f`).
2. Replace any character not in `[a-zA-Z0-9._-]` with `_` (preserves dots, dashes, alnum, case).
3. Trim leading/trailing underscores.
4. Return `"unknown"` if the result is empty.

Note: dots and dashes are preserved AS-IS; only "weird" characters become underscores. Slashes are NOT preserved — they become underscores.

### `getModelDetailSlugCandidates(modelId)` — produce up to 6 candidate model slugs

Inserts variants into a `Set` (so duplicates collapse) in this order:

```
withSlash       = modelId.replace(/\//g, "__")    // "openai/gpt-5.2" → "openai__gpt-5.2"
withDots        = withSlash.replace(/\./g, "-")   // "openai__gpt-5.2" → "openai__gpt-5-2"
candidates: pipelineSlugify(withSlash),
            pipelineSlugify(withSlash.toLowerCase()),
            pipelineSlugify(withDots),
            pipelineSlugify(withDots.toLowerCase()),
            pipelineSlugify(modelId),
            pipelineSlugify(modelId.toLowerCase())
return Array.from(set)
```

The `Set` collapses duplicates: e.g., for an already-lowercase input, the `.toLowerCase()` variants are no-ops and drop out, so the actual returned array is shorter.

### `getDeveloperSlugCandidates(developerOrRouteId)` — up to 6 candidate developer slugs

Same Set-based pattern but with different transformations:

```
underscoreSlug          = pipelineSlugify(input)
lowercaseUnderscoreSlug = pipelineSlugify(input.toLowerCase())
hyphenSlug              = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
compactSlug             = input.toLowerCase().replace(/[^a-z0-9]+/g, "")
candidates: underscoreSlug,
            lowercaseUnderscoreSlug,
            underscoreSlug.replace(/_/g, "-"),
            lowercaseUnderscoreSlug.replace(/_/g, "-"),
            hyphenSlug (if non-empty),
            compactSlug (if non-empty)
return Array.from(set)
```

## Classification

- **Lookup transformation (default-only)**. The retry walks candidates and uses the first that resolves to an actual file. Pipeline-side fix: emit a single canonical filename per model/developer that matches `model_route_id`/`developer_route_id` exactly. Then no retry needed.
- **Cleaning → pipeline.** The slug derivation (`pipelineSlugify`) and canonical ID emission are value transforms per record. The retry loop exists only to compensate for the pipeline not yet emitting a stable canonical ID — once it does, both the slug logic and the retry delete together. No aggregation.

## Inputs and expected outputs

### Group A — `pipelineSlugify`

| Input | Output | Rule |
|---|---|---|
| `"openai__gpt-5"` | `"openai__gpt-5"` | passthrough (alnum + dash + underscore allowed) |
| `"openai__gpt-5.2"` | `"openai__gpt-5.2"` | passthrough (dot allowed) |
| `"openai/gpt-5"` | `"openai_gpt-5"` | slash → underscore (slash not in allowed set) |
| `"OpenAI"` | `"OpenAI"` | passthrough (case preserved) |
| `"x0000001"` | `"x0000001"` | passthrough |
| `"foo bar"` | `"foo_bar"` | space → underscore |
| `"foo!@#bar"` | `"foo___bar"` | each special char → `_` |
| `"___foo___"` | `"foo"` | trim leading/trailing underscores |
| `"!!!"` | `"unknown"` | empty after trim → fallback |
| `""` | `"unknown"` | empty → fallback |

### Group B — `getModelDetailSlugCandidates`

| Input | Candidates returned | Why these are distinct |
|---|---|---|
| `"openai/gpt-5"` | `["openai__gpt-5", "openai_gpt-5"]` | already-lowercase + no dots → only slash and slash-stripped variants survive Set dedup |
| `"openai/gpt-5.2"` | `["openai__gpt-5.2", "openai__gpt-5-2", "openai_gpt-5.2"]` | dotted form gets the with-dots variant (position 1) |
| `"OpenAI/GPT-5"` | `["OpenAI__GPT-5", "openai__gpt-5", "OpenAI_GPT-5", "openai_gpt-5"]` | case-mixed input → both case variants survive |
| `"anthropic/claude-3.7-sonnet"` | `["anthropic__claude-3.7-sonnet", "anthropic__claude-3-7-sonnet", "anthropic_claude-3.7-sonnet"]` | dotted version |
| `"unknown/foo"` | `["unknown__foo", "unknown_foo"]` | already-lowercase + no dots |

### Group C — `getDeveloperSlugCandidates`

| Input | Candidates returned (in order, deduped) |
|---|---|
| `"openai"` | `["openai"]` (all variants collapse to same form) |
| `"OpenAI"` | `["OpenAI", "openai"]` (case variants distinct) |
| `"01-ai"` | `["01-ai", "01ai"]` (compactSlug strips the dash) |
| `"Mistral AI"` | `["Mistral_AI", "mistral_ai", "Mistral-AI", "mistral-ai", "mistralai"]` (space → underscore + hyphen + compact variants) |
| `"01_ai"` | `["01_ai", "01-ai", "01ai"]` (underscore-slug, dash variant, compact) |

## Current TS implementation

The four functions are tightly coupled — `pipelineSlugify` is the base; the others build on it.

| Concern | Location | Used by |
|---|---|---|
| Base slugifier | `lib/model-data.ts:150-157` (`pipelineSlugify`) | the other three slug functions |
| Developer route_id derivation (exported) | `lib/model-data.ts:159-161` (`getDeveloperRouteId`) | sets `route_id` on output objects in 7 places (see below) |
| Model candidates | `lib/model-data.ts:167-185` (`getModelDetailSlugCandidates`) | model lookup retry |
| Developer candidates (exported) | `lib/model-data.ts:187-211` (`getDeveloperSlugCandidates`) | developer lookup retry |

### Call sites — model lookups (`getModelDetailSlugCandidates` retry)

| Location | Context |
|---|---|
| `lib/model-data.ts:1492` | `getModelSummaryById` — first attempt: try candidates of the URL-passed modelId |
| `lib/model-data.ts:1527` | `getModelSummaryById` fallback — for each variant's raw_model_ids, try candidates |

So the model lookup is THREE-stage in `getModelSummaryById`:
1. Direct candidates from the input `modelId` (line 1492)
2. If a card matches in `model-cards.json`, try its `model_route_id` directly (line 1516)
3. Iterate every variant's `raw_model_ids` and try candidates of each (line 1527)

### Call sites — developer lookups (`getDeveloperSlugCandidates` retry)

| Location | Context |
|---|---|
| `lib/model-data.ts:1343` | inside developer-list build; iterate candidates of `entry.developer` |
| `lib/model-data.ts:1413` | `getDeveloperSummaryById` — try candidates of the URL-passed routeId |
| `lib/model-data.ts:1452` | `getDeveloperSummaryById` fallback — try candidates of the matched developer's name |

### Call sites — `getDeveloperRouteId` (output-side route_id derivation)

| Location | Context |
|---|---|
| `lib/model-data.ts:1320` | `getDeveloperList` — set `route_id` on each developer summary |
| `lib/model-data.ts:1368` | (build path A) |
| `lib/model-data.ts:1402` | `getDeveloperSummaryById` — set `route_id` on returned summary |
| `lib/model-data.ts:1435` | (build path B) |
| `lib/model-data.ts:1448` | comparison: `e.developer === routeId \|\| getDeveloperRouteId(e.developer) === routeId` |
| `lib/model-data.ts:1476` | (build path C) |
| `lib/duckdb-data.ts:307` | DuckDB backend — set `route_id` on developer list output |

`getDeveloperRouteId` is the function that DERIVES `route_id` from `developer` — it's what makes the comparison at line 1448 work, and it's how the API output gets a stable `route_id` field for routing. Deleting `getDeveloperRouteId` without addressing these callers would break developer-page navigation.

## Pipeline status — divergences

### Side-by-side comparison table

| Aspect | TS (this spec) | Pipeline today | Result for users |
|---|---|---|---|
| File naming (models/) | n/a (consumer side) | filenames written by pipeline; some use `route_id`, others use a dot-stripped variant | TS retries up to 6 candidates per request to find the right file |
| File naming (developers/) | n/a (consumer side) | filenames are slug-cased developer names; `developers.json` does NOT carry `route_id` | TS derives candidates from the developer name itself |
| Lookup overhead | up to 6 HF fetch attempts per missing-direct lookup | none (it's just emitting files) | wasted requests on cold-cache; redirected by retry logic |

### Concrete worked example with quantified scope

Audited 2026-04-28 against `.cache/hf-data/`:

**Model lookups (5,830 cards):**
- Candidate position 0 hits: **3,529** (60.5%) — `route_id` matches the file directly
- Candidate position 1 hits: **2,297** (39.4%) — needed the dot→dash conversion (e.g. `gpt-5.2` → file `gpt-5-2`)
- Misses (none of 6 candidates worked): **4** (0.07%)

**Developer lookups (824 developers):**
- Candidate position 0 hits: **468** (56.8%) — slugified raw input matches
- Candidate position 1 hits: **351** (42.6%) — needed `.toLowerCase()` (developers with mixed-case names)
- Candidate position 3 hits: **4** (0.5%) — needed underscore→dash on the lowercased slug
- Misses: **1** (`x0000001` — no developer file under that name)

The retry is doing real work: 39% of models and 43% of developers would 404 on direct lookup.

Verified by `scripts/verify-slug-candidates.mjs`.

## Notes for pipeline implementer

The cleanest pipeline-side fix: **always emit `models/<route_id>.json` and `developers/<route_id>.json` directly**, where `route_id` is the canonical form already on each card. Then TS does a single direct lookup; the retry chain becomes dead code.

If pipeline can't easily change file naming, the second-best option is to emit a **slug→file map** in `manifest.json` so TS does an O(1) lookup with no fallback.

Concrete requirements for the simpler "canonical filenames" path:

1. For every card in `model-cards.json`: write `models/<card.model_route_id>.json` with the contents.
   - For dotted family_ids like `openai/gpt-5.2`, the `model_route_id` is `openai__gpt-5.2` (with dot preserved). The current cache files for these use dashes (`openai__gpt-5-2.json`). Pick one form and stick with it.
2. For every entry in `developers.json`: ensure `route_id` is populated (currently absent) and write `developers/<route_id>.json`.
3. The 4 model misses + 1 developer miss currently in production should be investigated separately — they represent missing files, not naming-convention issues.

Don't try to reproduce the 6-candidate generation logic upstream. The point of the migration is to make it unnecessary.

Verification: once pipeline ships canonical naming, every card in `model-cards.json` should resolve via `fs.existsSync('models/' + card.model_route_id + '.json')` directly. Run `scripts/verify-slug-candidates.mjs` and confirm `position 0 hits === total cards`.

## Migration checklist

- [x] Spec written
- [x] Tests cover each rule branch (`tests/transformations/slug-candidates.test.ts`)
- [ ] Filed with pipeline owner with the spec + tests + audit script as acceptance criterion
- [ ] Pipeline emits `models/<route_id>.json` matching `model_route_id` exactly for all 5,830 cards
- [ ] Pipeline emits `developers/<route_id>.json` matching `developer_route_id` for all 824 developers
- [ ] Pipeline adds `route_id` field to every entry in `developers.json` (currently absent — TS derives via `getDeveloperRouteId(developer)`)
- [ ] Pipeline-emitted `developer_route_id` matches `pipelineSlugify(developer.trim().toLowerCase())` for every developer (so the 7 `getDeveloperRouteId` call sites can read pipeline values directly without re-deriving)
- [ ] TS deleted; callers do single direct lookup. Deletion includes ALL FOUR functions (`pipelineSlugify`, `getDeveloperRouteId`, `getModelDetailSlugCandidates`, `getDeveloperSlugCandidates`) plus the 12 call sites enumerated above.

## Future product decision (deferred)

The 4 model misses and 1 developer miss represent files that don't exist. Whether those are "should exist but pipeline forgot" or "intentionally absent" is a product question. Surface to pipeline owner separately during the cleanup pass.
