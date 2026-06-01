# Identity canonicalization

Drafted 2026-04-28. Migration item #1 in `notes/migration-plan.md`.

## Rule

Given a `ModelInfo` (`{id, name, developer?}`) emitted by some upstream source, derive a **canonical identity tuple** the rest of the app uses for routing, display, and grouping:

```
{
  namespace,           // "anthropic" — owner segment, lowercase
  rawHandle,           // "claude-opus-4.5" — model segment as received
  normalizedHandle,    // "claude-opus-4.5" — separators collapsed to "-", lowercased
  familySlug,          // "claude-opus-4.5" — handle minus version-date suffix
  familyId,            // "anthropic/claude-opus-4.5"
  familyName,          // "Claude Opus 4.5" — title-cased, with v/V rule
  variantKey,          // "base" if no date pattern, else "<YYYYMMDD>" or "<YYYYMMDD>-<qualifier>"
  variantLabel,        // "Current" if base, else "<YYYY-MM-DD>" or "<YYYY-MM-DD> · <Qualifier>"
  variantDisplayName,  // familyName if base, else "<familyName> (<variantLabel>)"
  versionDate?,        // "YYYY-MM-DD" if a date pattern was detected
  versionQualifier?,   // humanized qualifier suffix, if present
}
```

## Classification

- **Unconditional normalization** for casing rules (token case map, v/V handling) — when the upstream `name` is present, the canonicalizer ignores it for `familyName` and re-derives from the `id`. Pipeline-side fix: pipeline applies these rules once at emission time; no consumer should re-derive.
- **Default-only** does not apply to this transformation. Every output field is computed unconditionally.
- **Cleaning → pipeline.** Both outputs (`model_family_id`, `model_family_name`) are value transforms on a single record. No record merging or aggregation. Migration target: pipeline emits canonical values; TS logic deletes.

## Inputs and expected outputs

The full table below is the executable spec. Every row corresponds to a parameterized test case in `tests/transformations/identity-canonicalization.test.ts`.

### Group A — Token case map

The TS implementation maintains a hand-curated `TOKEN_CASE_MAP` for tokens that deviate from naive title-casing. Pipeline must produce identical outputs for every token below — no improvements or additions without first updating this spec, the unit tests, and the verification script (in that order). "TS is the spec" — see `notes/transformations/README.md`.

| Token (lower) | Canonical |
|---|---|
| ai | AI |
| coder | Coder |
| command | Command |
| chat | Chat |
| claude | Claude |
| gemini | Gemini |
| gemma | Gemma |
| gpt | GPT |
| haiku | Haiku |
| instruct | Instruct |
| instant | Instant |
| llama | Llama |
| max | Max |
| mini | Mini |
| mistral | Mistral |
| opus | Opus |
| phi | Phi |
| plus | Plus |
| preview | Preview |
| pro | Pro |
| qwen | Qwen |
| reasoning | Reasoning |
| sonnet | Sonnet |
| thinking | Thinking |
| turbo | Turbo |
| yi | Yi |

**Detected divergence (2026-04-28):** pipeline emits "Minicpm3 4B FC", "Xlam 2 1B FC R", "Xlam 2 32B FC R" (3 distinct slugs, 7 cards total) which the TS map does NOT have an entry for ("fc"). TS title-cases to "Fc". Either the TS map needs an `fc → FC` entry, OR pipeline already does the right thing here and TS has a gap. **Decision needed: do we want `fc → FC` added?** If yes, both sides update; spec adds the row.

### Group B — v/V version-token rule

For any token matching `/^v\d/i` (e.g. `v3`, `v3.1`, `V0`), the `v` is lowercased.

| Token in handle | Token in name |
|---|---|
| v3 | v3 |
| V3 | v3 |
| v0.1 | v0.1 |
| V1.0 | v1.0 |

**Detected divergence (2026-04-28):** pipeline emits 1,253 cards with capital `V` (e.g. "Deepseek V3", "Mistral 7B Instruct V0.3", "Mixtral 8x22b Instruct V0.1", "Nova Lite V1.0"). TS rule lowercases. Pipeline must apply this rule before emitting `model_family_name`.

### Group C — Date and qualifier extraction

`splitVersionParts` operates on a handle that has already been through `normalizeHandle` (Group D). For a normalized handle matching `/^(.*?)-((?:19|20)\d{6})(?:-(.+))?$/`:

| normalizedHandle (input to splitVersionParts) | familySlug | versionDate | versionQualifier | variantKey | variantLabel |
|---|---|---|---|---|---|
| claude-3.5-sonnet | claude-3.5-sonnet | _none_ | _none_ | base | Current |
| claude-3.5-sonnet-20240620 | claude-3.5-sonnet | 2024-06-20 | _none_ | 20240620 | 2024-06-20 |
| claude-3.5-sonnet-20240620-thinking | claude-3.5-sonnet | 2024-06-20 | Thinking | 20240620-thinking | 2024-06-20 · Thinking |
| claude-3.5-sonnet-20240620-thinking-high | claude-3.5-sonnet | 2024-06-20 | Thinking High | 20240620-thinking-high | 2024-06-20 · Thinking High |

Note the **dotted** `3.5` not dashed — the upstream call to `normalizeHandle` collapses `(\d)-(?=\d(?:-|$))` to `(\d).` (so `3-5-sonnet` → `3.5-sonnet`). Pipeline-side implementations must apply that collapse before invoking `splitVersionParts`-equivalent logic, otherwise the regex match for the date will be off.

The qualifier is humanized via the same token-case + v/V rules used for `familyName`.

**Important date-pattern caveat:** the date regex requires 8 contiguous digits (`(?:19|20)\d{6}`). A dashed form like `2025-12-11` (which appears in some pipeline IDs like `openai/gpt-5-2025-12-11-thinking-high`) does NOT match — those ten-character dashed dates pass through `normalizeHandle` unchanged (no internal-digit-dash-digit pattern triggers the collapse) and `splitVersionParts` returns `base`/`Current`. This is preserved as-is; do not "fix" the regex to accept dashed dates without checking what relies on the current behaviour.

### Group D — Handle normalization

Raw handles arrive from `getRawHandle()` (Group E) — they do NOT contain the namespace. `normalizeHandle` then applies the rules below in order:

| rawHandle | normalizedHandle | Rule fired |
|---|---|---|
| Claude_Opus_4.5 | claude-opus-4.5 | lowercase + underscore→dash |
| claude opus 4.5 | claude-opus-4.5 | space→dash |
| --claude--opus-- | claude-opus | leading/trailing/repeated dash collapse |
| claude-3-5 | claude-3.5 | digit-dash-digit collapses (5 is at end → matches lookahead) |
| claude-3-5-sonnet | claude-3.5-sonnet | same: 5 followed by `-` → matches |
| gpt-5 | gpt-5 | no digit-dash-digit pattern |
| claude-3-5-sonnet-20240620 | claude-3.5-sonnet-20240620 | "3-5" collapses; "20240620" is one token (no internal dashes) so no collapse there |
| openai/foo (called via pipeline → never happens) | not applicable | namespace is always split off in Group E before normalize is called |

The digit-dash-digit rule is the subtle one: `/(\d)-(?=\d(?:-|$))/g → "$1."` matches a digit-dash-digit pattern only when the right-hand digit is at end-of-string OR followed by another dash. So `3-5-x` becomes `3.5-x`, `3-5` (at end) becomes `3.5`, but `3-5x` (followed by a non-dash) is left alone. Inside `20240620` there are no dashes, so the regex doesn't fire on the date itself.

### Group E — Namespace and rawHandle extraction

The `id` field's first slash splits namespace from handle. If no slash, `developer` field is used as namespace (slug-cased: spaces → dashes, lowercased).

| input.id | input.developer | namespace | rawHandle |
|---|---|---|---|
| anthropic/claude-opus-4-5 | (any) | anthropic | claude-opus-4-5 |
| openai/gpt-5 | (any) | openai | gpt-5 |
| Claude Opus 4.5 | Anthropic | anthropic | Claude Opus 4.5 (then normalized) |
| gpt-5 | OpenAI | openai | gpt-5 |
| (empty) | OpenAI | openai | (empty → falls back to name) |

When `id` lacks a slash, `rawHandle` falls back to `stripNamespace(name, namespace)` then to `name.trim()`.

### Group F — `familyId` and `model_route_id`

```
familyId      = `${namespace}/${familySlug}`
model_route_id = familyId.replace(/\//g, "__")
```

**Pipeline status (2026-04-28):** `model_family_id` matches TS-computed `familyId` for **5,830 / 5,830** cards. `model_route_id` matches `model_family_id.replace(/\//g, "__")` for **5,830 / 5,830** cards. ✅

This is the part that's already safe to delete on the TS side; the rest is not.

## Current TS implementation

The transformation lives in TWO places:

### Primary — `lib/model-family.ts` (consumed at request time)

| Concern | Location |
|---|---|
| Top-level entry point | `lib/model-family.ts:165-190` (`getCanonicalModelIdentity`) |
| Token case map | `lib/model-family.ts:17-44` (`TOKEN_CASE_MAP`) |
| Token case helper | `lib/model-family.ts:100-123` (`titleCaseToken`) |
| v/V rule | `lib/model-family.ts:118-120` (inside `titleCaseToken`) |
| Handle normalization | `lib/model-family.ts:82-90` (`normalizeHandle`) |
| Date format helper | `lib/model-family.ts:92-98` (`formatVersionDate`) |
| Date + qualifier extraction | `lib/model-family.ts:139-163` (`splitVersionParts`) |
| Family name humanization | `lib/model-family.ts:125-137` (`humanizeHandle`) |
| Namespace extraction | `lib/model-family.ts:62-69` (`getNamespace`) |
| Raw handle extraction | `lib/model-family.ts:71-80` (`getRawHandle`) |
| `route_id` derivation | `lib/model-family.ts:220-225` (`getModelFamilyRouteId`) |

Total: ~200 lines. Two exported entry points consumed at six call sites in `lib/model-data.ts`, `lib/hf-data.ts`, `components/eval-detail.tsx`. (A third export, `normalizeModelInfo`, was deleted during the 2026-04-28 orphan sweep — zero callers.)

### Secondary — `scripts/cache-hf-data.mjs` (cache-build-time duplicate)

The cache-build script independently re-implements five of the helpers above (presumably to avoid importing TS into the build script). When `pnpm cache-hf-data` runs, it post-processes downloaded model-cards to apply the same canonicalization that the runtime would. Duplicated helpers:

| Concern | Cache-script location | Equivalent in `lib/model-family.ts` |
|---|---|---|
| Handle normalization | `scripts/cache-hf-data.mjs:141-149` (`normalizeHandle`) | identical to lib version |
| Date format helper | `scripts/cache-hf-data.mjs:151-157` (`formatVersionDate`) | identical |
| Token case helper | `scripts/cache-hf-data.mjs:159-177` (`titleCaseToken`) | identical |
| Family name humanization | `scripts/cache-hf-data.mjs:179-185` (`humanizeHandle`) | identical |
| Family info extractor (smaller version) | `scripts/cache-hf-data.mjs:187-197` (`getCanonicalFamilyInfo`) | subset of `getCanonicalModelIdentity` (returns only familyId + familyName) |

These five functions in `scripts/cache-hf-data.mjs` ALSO need to be deleted in the same migration cleanup, since pipeline-emitted canonical fields obviate both the runtime AND build-time canonicalization paths.

## Pipeline status

Verified against full `.cache/hf-data/model-cards.json` (5,830 entries) on 2026-04-28:

| Field | Pipeline match | Notes |
|---|---|---|
| `model_family_id` | 5830 / 5830 ✅ | Matches `${namespace}/${familySlug}` exactly. |
| `model_route_id` | 5830 / 5830 ✅ | Matches `model_family_id.replace(/\//g, "__")`. |
| `model_family_name` | 4,570 / 5,830 ❌ | 1,260 disagreements — see "Divergences detected" below. |
| `family_slug` | not emitted | Pipeline doesn't surface this field. |
| `version_date` | not emitted | |
| `version_qualifier` | not emitted | |
| `variant_key` | partial | Emitted on per-variant entries inside `model_card.variants[]`; not on top-level card. Match status not yet audited. |
| `variant_label` | partial | Same as `variant_key`. |
| `variant_display_name` | not emitted | |

## Divergences detected

Sourced from `scripts/verify-identity.mjs` against the full live cache (run 2026-04-28).

### Bucket 1: v/V capitalization (1,253 cards)

Pipeline does not lowercase the `v` in version tokens. Examples:

| Pipeline `model_family_name` | TS-computed `familyName` |
|---|---|
| Deepseek V3 | Deepseek v3 |
| Deepseek V3.1 | Deepseek v3.1 |
| Mistral 7B Instruct V0.3 | Mistral 7B Instruct v0.3 |
| Mixtral 8x7b Instruct V0.1 | Mixtral 8x7b Instruct v0.1 |
| Mixtral 8x22b Instruct V0.1 | Mixtral 8x22b Instruct v0.1 |
| Nova Lite V1.0 | Nova Lite v1.0 |
| Nova Micro V1.0 | Nova Micro v1.0 |
| Nova Pro V1.0 | Nova Pro v1.0 |

### Bucket 2: missing TOKEN_CASE_MAP entries (7 cards, 3 distinct slugs)

Pipeline emits known acronyms in upper-case that TS doesn't know about. Examples:

| Pipeline `model_family_name` | TS-computed `familyName` | Token at issue |
|---|---|---|
| Minicpm3 4B FC | Minicpm3 4B Fc | `fc` (function-calling) |
| Xlam 2 1B FC R | Xlam 2 1B Fc R | `fc` |
| Xlam 2 32B FC R | Xlam 2 32B Fc R | `fc` |

**Open product question:** TS map is missing `fc → FC`. Either it's an oversight in TS (we should add `fc`) or pipeline is right and TS is wrong. Resolve with product owner before pipeline-side change. Likely the right fix is to add `fc` to the canonical map and have pipeline emit it.

### Other (0 cards)

`date_format`, `qualifier_humanize`, `other` buckets all came back empty. Date/qualifier handling matches pipeline, which is reassuring.

## Migration checklist

- [x] Spec written
- [x] Tests cover each rule branch (`tests/transformations/identity-canonicalization.test.ts`)
- [ ] `fc → FC` token map decision (product owner)
- [ ] Filed with pipeline owner (link to issue/PR in `eval_cards_backend_pipeline`)
- [ ] Pipeline emits `model_family_name` matching this spec across full corpus
- [ ] Pipeline emits `family_slug`, `version_date`, `version_qualifier`, `variant_key`, `variant_label`, `variant_display_name` on top-level card (or we accept they live only on per-variant entries)
- [ ] TS deleted; callers read pipeline fields directly. Includes both `lib/model-family.ts:1-225` (full file) AND the 5 duplicated helpers in `scripts/cache-hf-data.mjs:141-197`.

## Notes for pipeline implementer

- The `getCanonicalModelIdentity` function is pure (no I/O, no globals beyond `TOKEN_CASE_MAP`); a Python port should be a direct line-by-line translation.
- The unit tests in `tests/transformations/identity-canonicalization.test.ts` are the acceptance criteria. A Python equivalent (with the same input/output examples) is the simplest verification path.
- The audit script `scripts/verify-identity.mjs` already runs TS-vs-pipeline diff across the full cache; once pipeline ships, run it to confirm zero mismatches before deleting TS.
- The `fc → FC` question above is the only ruleset gap; everything else is "pipeline doesn't apply the rule yet." Resolve `fc` first if possible.
