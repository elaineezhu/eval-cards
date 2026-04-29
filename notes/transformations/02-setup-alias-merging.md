# Setup-alias variant merging

Drafted 2026-04-28. Migration item #2 in `notes/migration-plan.md`.

## Framing reminder

We are **refactoring for UI efficiency**, not fixing data correctness. Original TS behaviour is the canonical spec — including its quirks — because that's what users see today. Pipeline must reproduce TS output exactly when this transformation moves upstream. If anyone wants to change *what* gets merged (vs the current TS rules), that's a separate product decision deferred until later.

## Rule (as TS implements it today)

A model card's `variants[]` list contains entries keyed by `variant_key`. The runtime normalizer (`lib/hf-data.ts:normalizeSingleModelCardEntry`, line 750) walks each variant and may transform `variant_key`/`variant_label` based on whether the variant looks like a setup-alias of an underlying date-based variant.

Algorithm (verbatim from current code):

1. If `variant_key === "base"` → rename to `"default"` / `"Default"`.
2. If `variant_key === "default"` → keep as-is.
3. Otherwise, build a synthetic identity by feeding `${familyId}-${variant_key}` through `getCanonicalModelIdentity` (the same canonicalizer as migration item #1).
4. Inspect `syntheticIdentity.versionDate` and `syntheticIdentity.versionQualifier`:
   - If `versionDate` is set AND `isSetupAliasQualifier(versionQualifier)` returns true → rewrite to `versionDate` (ISO `YYYY-MM-DD` format) for both key and label.
   - Otherwise → use `syntheticIdentity.variantKey` and `syntheticIdentity.variantLabel`.
5. After all variants are processed, deduplicate by normalized `variant_key`. Duplicates merge: `evaluation_count` summed, `raw_model_ids` unioned + sorted, `last_updated` taken as the latest timestamp.

`isSetupAliasQualifier` (`lib/hf-data.ts:712`) returns true when the normalized qualifier (lowercased, separators → `-`) matches:

- exactly `prompt`
- exactly `fc`
- exactly `function-calling`
- starts with `thinking` (so `thinking`, `thinking-1k`, `thinking-medium`, `thinking-32k`, etc. all match)

The "starts with thinking" prefix-match is intentionally broad and aggregates all thinking-budget variants (`thinking-1k`, `thinking-medium`, `thinking-32k`, etc.) into a single date-only entry — a deliberate UI-side aggregation choice that prioritizes cross-model comparison readability over per-condition granularity.

## Classification

- **Unconditional normalization.** When inputs match the rule, TS overwrites whatever upstream emitted. Pipeline-side implementation must apply the same overwrite.
- **Dual class — cleaning and reshape:**
  - **Cleaning → pipeline** (key derivation): the alias qualifier rules (`isSetupAliasQualifier`) that determine *which bucket* a raw result lands in are value transforms on a single record. Pipeline-side fix: emit a canonical `setup_alias_key` field per result row.
  - **Reshape → DuckDB SQL** (bucket reduction): collapsing multiple result rows with the same `setup_alias_key` into a single variant entry (taking the latest timestamp, merging evaluation results) is a `GROUP BY setup_alias_key` aggregation. Migration target once the key is emitted upstream: SQL `SELECT … MAX(retrieved_timestamp) … GROUP BY setup_alias_key` rather than TS reduce logic.

## Inputs and expected outputs

These are the rules as TS executes them today. Pipeline must produce identical outputs.

### Group A — `isSetupAliasQualifier` truth table

| Input qualifier | Normalized | Returns |
|---|---|---|
| `prompt` | `prompt` | `true` |
| `Prompt` | `prompt` | `true` (case-insensitive) |
| `fc` | `fc` | `true` |
| `function-calling` | `function-calling` | `true` |
| `function calling` | `function-calling` | `true` (whitespace → dash) |
| `function_calling` | `function-calling` | `true` (underscore → dash) |
| `thinking` | `thinking` | `true` |
| `thinking-1k` | `thinking-1k` | `true` (prefix match) |
| `thinking-medium` | `thinking-medium` | `true` (prefix match) |
| `thinking_xhigh` | `thinking-xhigh` | `true` (prefix match after normalization) |
| `Thinking 1K` | `thinking-1k` | `true` |
| `high` | `high` | `false` |
| `medium` | `medium` | `false` |
| `low` | `low` | `false` |
| `minimal` | `minimal` | `false` |
| `8k` | `8k` | `false` |
| (empty / null / undefined) | `""` | `false` |

### Group B — End-to-end variant normalization

`getCanonicalModelIdentity`'s date regex requires 8 contiguous digits (`(?:19|20)\d{6}`). Dashed-date variant_keys do NOT match — they fall through to the `versionDate = undefined` branch, which sends them to `syntheticIdentity.variantKey === "base"`. **This is part of TS's current behaviour and must be preserved.**

| Input variant_key | TS-observed output `variant_key` | TS-observed output `variant_label` | Notes |
|---|---|---|---|
| `default` | `default` | (unchanged) | passthrough |
| `base` | `default` | `Default` | rename |
| `20251101` | `20251101` | `2025-11-01` | YYYYMMDD date-only — preserved as raw token, ISO label |
| `2025-11-01` | `base` | `Current` | dashed date-only — falls through to base because regex doesn't match (NB: by TS quirk, a future product call may decide to align this) |
| `20240620-thinking` | `2024-06-20` | `2024-06-20` | YYYYMMDD + thinking → merge to ISO date |
| `20240620-thinking-1k` | `2024-06-20` | `2024-06-20` | YYYYMMDD + thinking-1k → merge (startsWith match) |
| `20240620-thinking-medium` | `2024-06-20` | `2024-06-20` | merge (startsWith match) — all thinking-N variants for this date collapse together |
| `20240620-fc` | `2024-06-20` | `2024-06-20` | merge |
| `20240620-prompt` | `2024-06-20` | `2024-06-20` | merge |
| `20240620-high` | `20240620-high` | `2024-06-20 · High` | non-alias qualifier preserved |
| `2025-12-11-thinking-medium` | `base` | `Current` | dashed date — regex doesn't match, falls through |
| `2025-12-11-thinking-1k` | `base` | `Current` | same — dashed date passes through to base |
| `2025-12-11-fc` | `base` | `Current` | same |
| `2025-12-11-high` | `base` | `Current` | same |
| `2025-08-07-low` | `base` | `Current` | same |
| `gpt-foo-bar` | `base` | `Current` | no date detected anywhere |

### Group C — Multi-variant deduplication after normalization

When multiple input variants normalize to the same `variant_key`, they merge:
- `raw_model_ids`: union, deduped, sorted
- `evaluation_count`: sum
- `last_updated`: maximum (latest)

This is what produces, for example, the user-visible behaviour for `openai/gpt-5.2`: the cache file has 7 distinct variants, but TS normalization collapses 6 of the 7 (everything except `default`) into a single `base` bucket — because all 6 use dashed dates and fall through to `base`.

## Current TS implementation

| Concern | Location |
|---|---|
| Runtime normalizer (active) | `lib/hf-data.ts:750-812` (`normalizeSingleModelCardEntry`) |
| Setup-alias qualifier check (runtime) | `lib/hf-data.ts:712-720` (`isSetupAliasQualifier`) |
| Qualifier normalizer (runtime) | `lib/hf-data.ts:708-710` (`normalizeSetupAliasQualifier`) |
| Cache-time normalizer | `scripts/cache-hf-data.mjs:213-246` (`getNormalizedVariantMeta`) |
| Setup-alias qualifier check (cache) | `scripts/cache-hf-data.mjs:203-211` |
| Qualifier normalizer (cache) | `scripts/cache-hf-data.mjs:199-201` |
| Mode-based path (dead, ignore) | `lib/eval-processing.ts:371-434` |

The mode-based path reads `model_info.additional_details.mode` which is empty on every production model_result row (verified 2026-04-28: 0 of 86,183). It runs but never fires for any input. Pipeline-side implementation should NOT reproduce it; it's load-bearing only against test fixtures that may carry the field.

## Pipeline status — known divergences

Pipeline (`eval_cards_backend_pipeline/scripts/pipeline.py`) implements its own variant aggregation in `aggregated_display_identity` (line 1724). It uses a **different qualifier set and a different input field** than TS:

| Aspect | TS (this spec) | Pipeline today | Result |
|---|---|---|---|
| Input field | `variant_key` from variant entry | `model_info.additional_details.mode` from raw eval | Pipeline merges submissions early; TS re-merges at variant level |
| Qualifier set | `prompt`, `fc`, `function-calling`, plus *any* `thinking*` (prefix) | exact set: `{prompt, fc, function-calling, thinking, prompt-thinking, fc-thinking, function-calling-thinking}` | TS aggregates more aggressively for `thinking-N` variants; pipeline keeps each thinking budget separate |
| Date-format handling | Only YYYYMMDD recognized; dashed dates fall through to `base` | N/A — pipeline operates on `mode` field, not `variant_key` |  |

**Concrete example:** for `openai/gpt-5.2` with submissions across 7 setups (default + base 2025-12-11 + 5 thinking budgets):
- Pipeline emits 7 distinct variants (it merges fc/prompt into the date-only base via `mode`-field check, but keeps thinking-{none,low,medium,high,xhigh} separate because those exact strings aren't in pipeline's set)
- TS normalizes pipeline's 7 variants → 2 (`default` + `base`, all dashed-date variants collapsed)

**The user-visible state today** is whatever TS produces (TS runs on every API request). So users see the post-TS-normalization view: 2 variants for that card, not 7.

When the migration moves this transformation upstream, pipeline must produce TS's 2-variant view, not pipeline's current 7-variant view. Pipeline-side options:

1. Add a second-pass normalization to pipeline output that mirrors TS's rules (prefix-match `thinking*`, only YYYYMMDD dates trigger merge).
2. Drop pipeline's existing `aggregated_display_identity` mode-based check and replace it entirely with the variant_key-based rule.

Option 2 is cleaner if pipeline owners agree.

## Notes for pipeline implementer

- **Reproduce the prefix-match `thinking*` exactly.** This is the largest TS-vs-pipeline divergence. Don't tighten it to an exact set without a product call.
- **Reproduce the dashed-date fall-through behaviour.** `2025-12-11-thinking-medium` produces `variant_key: base` in TS today. Whether that's "right" or "wrong" is not for this migration to decide.
- **Ignore the `mode` field.** It's empty in production. Pipeline's current `aggregated_display_identity` reads it; the replacement should not.
- **Re-run `scripts/verify-setup-alias.mjs`** against pipeline output once the change ships. Goal: zero divergence between TS-as-is output and pipeline-emitted output for the full corpus.

## Migration checklist

- [x] Spec written (TS-as-is, including quirks)
- [x] Tests cover each rule branch (`tests/transformations/setup-alias-merging.test.ts`)
- [ ] Filed with pipeline owner with the spec + tests + audit script as acceptance criterion
- [ ] Pipeline emits variants matching this spec across the full corpus (verified by `scripts/verify-setup-alias.mjs`)
- [ ] TS deleted; callers read pipeline-emitted variants directly. Files to delete:
  - `lib/hf-data.ts:750-812` (`normalizeSingleModelCardEntry`)
  - `lib/hf-data.ts:708-720` (`normalizeSetupAliasQualifier`, `isSetupAliasQualifier`)
  - `scripts/cache-hf-data.mjs:199-246` (cache-time mirror)
  - `lib/eval-processing.ts:371-434` (the dead mode-based path)

## Future product decision (deferred)

Whether the current TS aggregation is the *right* product behaviour is open. The dashed-date fall-through and the prefix-match `thinking*` together produce a heavily-aggregated view (2 variants for `openai/gpt-5.2` instead of 7). If the team later decides users would benefit from per-thinking-budget granularity, the transformation can be redesigned in pipeline (where it's cheaper to change than in TS at runtime). That's explicitly out of scope for this refactor.
