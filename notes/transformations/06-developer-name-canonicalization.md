# Developer name canonicalization

Drafted 2026-04-28. Migration item #9 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency. TS-as-is is the canonical spec. The transformation has known imperfections (random HF handles get mechanically title-cased; some users' preferred capitalization doesn't survive) but those are deferred product decisions, not bugs to fix in this migration.

## Rule (as TS implements it today)

`normalizeDeveloperName(name)` (`lib/model-data.ts:236-244`) applies one of three transformations in this order:

1. **Map hit (case-insensitive lookup):** lowercase the name, then look up in `KNOWN_DEVELOPER_NAMES`. If present, return the mapped canonical form.
2. **Title-case fallback:** if input is fully lowercase AND starts with `[a-z]`, return `name.charAt(0).toUpperCase() + name.slice(1)`. Only the first character is capitalized.
3. **Passthrough:** return input unchanged.

The map (`lib/model-data.ts:217-234`) has 16 entries:

| Map key | Canonical |
|---|---|
| `openai` | OpenAI |
| `google` | Google |
| `anthropic` | Anthropic |
| `meta` | Meta |
| `microsoft` | Microsoft |
| `mistralai` | Mistral AI |
| `deepseek` | DeepSeek |
| `deepseek-ai` | DeepSeek |
| `cohere` | Cohere |
| `nvidia` | NVIDIA |
| `alibaba` | Alibaba |
| `amazon` | Amazon |
| `apple` | Apple |
| `ibm` | IBM |
| `xai` | xAI |
| `x-ai` | xAI |

Note that some map keys collide with their canonical form (e.g. `google` → `Google` is just case-fixing) while others apply substantive transforms (`mistralai` → `Mistral AI` adds a space; `deepseek-ai` → `DeepSeek` strips the `-ai` suffix; `xai` → `xAI` mid-word capital).

## Classification

- **Unconditional normalization.** The function always runs on whatever `developer` string is present — it does not check for a pre-existing canonical field. Map hits, title-case fallback, and passthrough are all branches of the same unconditional transform. Pipeline-side fix: emit `developer` in canonical form directly; no consumer should re-derive it.
- **Cleaning → pipeline.** Pure value transform on a single field. No aggregation or record merging. Migration target: pipeline emits canonical `developer`; TS `normalizeDeveloperName` and `KNOWN_DEVELOPER_NAMES` delete.

## Inputs and expected outputs

Each row corresponds to a parameterized test case in `tests/transformations/developer-name-canonicalization.test.ts`.

### Group A — Map hits (case-insensitive, substantive transforms)

| Input | Output | Rule |
|---|---|---|
| `openai` | `OpenAI` | map (case fix) |
| `OpenAI` | `OpenAI` | map (case-insensitive lookup → same canonical form) |
| `OPENAI` | `OpenAI` | map |
| `mistralai` | `Mistral AI` | map (space added) |
| `MistralAI` | `Mistral AI` | map (case-insensitive) |
| `deepseek-ai` | `DeepSeek` | map (`-ai` suffix dropped) |
| `DeepSeek-AI` | `DeepSeek` | map (case-insensitive) |
| `xai` | `xAI` | map (mid-word cap) |
| `x-ai` | `xAI` | map (alias) |
| `nvidia` | `NVIDIA` | map (uppercase) |
| `IBM` | `IBM` | map (case-insensitive lookup → uppercase canonical) |

### Group B — Title-case fallback (lowercase input, not in map)

| Input | Output | Why |
|---|---|---|
| `jaspionjader` | `Jaspionjader` | lowercase + starts with [a-z] → title-case first char only |
| `allenai` | `Allenai` | lowercase + not in map → first-char uppercase only |
| `bunnycore` | `Bunnycore` | same |
| `zelk12` | `Zelk12` | same — digits inside don't matter |

### Group C — Passthrough (mixed case, not in map)

| Input | Output | Why |
|---|---|---|
| `JayHyeon` | `JayHyeon` | already has uppercase → not lowercase → passthrough |
| `DreadPoor` | `DreadPoor` | same |
| `Qwen` | `Qwen` | (Qwen is NOT in the map; passes through) |
| `prithivMLmods` | `prithivMLmods` | mixed case, passthrough as-is — no first-char capitalization (input has uppercase, so the lowercase check fails) |
| `Quazim0t0` | `Quazim0t0` | same |
| `01-ai` | `01-ai` | does NOT start with [a-z] (starts with digit) → fallback rule fails → passthrough. Note: 01-ai is NOT in the map. |
| `01_ai` | `01_ai` | same |

### Group D — Edge cases

| Input | Output | Notes |
|---|---|---|
| `  google  ` | `Google` | trim happens inside `key = name.trim().toLowerCase()` BUT the title-case branch and passthrough use the ORIGINAL `name` (not trimmed). For `  google  `: key = "google" → matches map → "Google" |
| `  jaspionjader  ` | `  jaspionjader  ` | key = "jaspionjader" → no map hit. Title-case check uses original `name` which has spaces — `"  jaspionjader  " === "  jaspionjader  ".toLowerCase()` is true, BUT `/^[a-z]/.test("  jaspionjader  ")` is FALSE (starts with space). → falls to passthrough |
| (empty string) | (empty string) | trim makes key empty → no map hit. Title-case check: `"" === "".toLowerCase()` is true but `/^[a-z]/.test("")` is false → passthrough returns "" |

The edge case shows a TS quirk: leading whitespace prevents the title-case rule from firing, so `"  jaspionjader  "` passes through unchanged. The map-lookup uses the trimmed form and works for known names regardless.

## Current TS implementation

| Concern | Location |
|---|---|
| Map | `lib/model-data.ts:217-234` (`KNOWN_DEVELOPER_NAMES`) |
| Function (exported) | `lib/model-data.ts:236-244` (`normalizeDeveloperName`) |

### Call sites (5 total)

| Location | Context |
|---|---|
| `lib/model-data.ts:387` | `hfModelCardToEvaluationCardData` — set `developer` on output card |
| `lib/model-data.ts:1367` | developer-list build path A |
| `lib/model-data.ts:1401` | `getDeveloperSummaryById` — set `developer` on returned summary |
| `lib/model-data.ts:1434` | developer-list build path B |
| `lib/duckdb-data.ts:306` | DuckDB backend — set `developer` on developer list output |

## Pipeline status — divergences

### Side-by-side comparison table

| Aspect | TS (this spec) | Pipeline today | Result for users |
|---|---|---|---|
| Where canonicalization runs | request time, in 5 call sites | not implemented; raw `developer` string emitted as-is | TS canonicalizes per request |
| Output field | inline transformation of `developer` field | n/a | TS-canonicalized name appears on user-visible UI |

### Concrete worked example with quantified scope

Audited 2026-04-28 against `.cache/hf-data/`:

**`developers.json` (824 entries):**
- Map hits: **15** (1.8%) — names like `Google`, `OpenAI`, `Alibaba` (the map's main job is case-fixing on these inputs since they already arrive Title-cased)
- Title-case fallback: **458** (55.6%) — lowercase HF handles like `jaspionjader`, `allenai`, `bunnycore` get first-char-uppercased
- Passthrough: **351** (42.6%) — mixed-case handles like `JayHyeon`, `prithivMLmods`, `Qwen` survive unchanged

**`model-cards.json` (5,830 cards):**
- Map hits: **695** (11.9%)
- Title-case fallback: **2,824** (48.4%)
- Passthrough: **2,311** (39.6%)

The substantive map transforms (`mistralai` → `Mistral AI`, `deepseek-ai` → `DeepSeek`) DO fire in production — the model-cards.json mapHit count being higher than developers.json (11.9% vs 1.8%) suggests more model entries use the lowercase-suffix forms (e.g., `deepseek-ai` from the HF org slug) than the developers.json which already uses canonical forms.

Verified by `scripts/verify-developer-name.mjs`.

## Notes for pipeline implementer

- Reproduce all 16 map entries exactly (both case-fix entries like `google → Google` and substantive transforms like `mistralai → Mistral AI`).
- Reproduce the title-case fallback exactly: only fire when the entire string equals `name.toLowerCase()` AND starts with `[a-z]`. Don't capitalize anything else (no smart casing of multi-word names, no unicode-aware uppercasing).
- The leading-whitespace quirk (`"  jaspionjader  "` passes through unchanged because the title-case regex fails on the leading space) should be preserved as-is.
- Suggested pipeline emission: add `canonical_developer_name` field to `developers.json` entries and to every model card. Don't overwrite the upstream `developer` field; new field for clarity.

Verification: run `scripts/verify-developer-name.mjs` against pipeline output once it ships. Goal: zero divergence vs TS-as-is across both 824 developers and 5,830 model cards.

## Migration checklist

- [x] Spec written
- [x] Tests cover each rule branch (`tests/transformations/developer-name-canonicalization.test.ts`)
- [ ] Filed with pipeline owner with the spec + tests + audit script as acceptance criterion
- [ ] Pipeline emits `canonical_developer_name` on every developer entry + model card matching this spec
- [ ] TS deleted; replace 5 call sites (4 in lib/model-data.ts + 1 in lib/duckdb-data.ts) with direct field reads. Delete `KNOWN_DEVELOPER_NAMES` table + `normalizeDeveloperName`.

## Future product decision (deferred)

The title-case fallback produces stylistically-questionable output for HF user handles (`jaspionjader → Jaspionjader`). Whether the team wants to (a) expand the map to cover more cases, (b) leave random HF handles as-is, or (c) take a different approach (e.g. fetch the user's preferred display name from HF API) is out of scope for this refactor.
