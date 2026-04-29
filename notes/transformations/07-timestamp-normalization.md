# Timestamp normalization

Drafted 2026-04-28. Migration item #13 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency. TS-as-is is the canonical spec. Three different timestamp normalizers exist in production, with subtly different semantics. They produce different numeric values for the same input but happen to converge on production data (99.99% is unix-seconds-strings; the divergence only fires when comparing across formats, which production rarely does). The migration target: emit a single canonical timestamp format upstream so all three normalizers can be deleted.

## Rule (as TS implements it today — three variants)

Three independent functions parse string timestamps into comparable numbers:

### Variant A — `lib/model-data.ts:76-81` (`normalizeEvalTimestamp`)

```ts
function normalizeEvalTimestamp(value: string) {
  const numericTimestamp = Number(value)
  return !Number.isNaN(numericTimestamp) && !value.includes("-")
    ? numericTimestamp * 1000
    : new Date(value).getTime()
}
```

- Uses `Number()` (strict — entire string must be numeric or returns `NaN`)
- If numeric AND no `-` in input → multiply by 1000 (treats as **unix seconds**, output in ms)
- Else → `new Date(value).getTime()` (ISO date parsing, output in ms)
- Returns `NaN` if neither path produces a finite number (no defensive fallback)

### Variant B — `lib/hf-data.ts:1049-1061` (`toComparableTimestamp`)

```ts
function toComparableTimestamp(timestamp: string | undefined) {
  if (!timestamp) return Number.NEGATIVE_INFINITY
  const numericTimestamp = Number.parseFloat(timestamp)
  if (Number.isFinite(numericTimestamp)) return numericTimestamp
  const parsedTimestamp = new Date(timestamp).getTime()
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Number.NEGATIVE_INFINITY
}
```

- Uses `Number.parseFloat()` (lenient — parses leading numeric prefix; e.g. `"2026-04-13"` → `2026`)
- If parseFloat returns finite → return AS-IS (NO `* 1000` multiplier)
- Else → fallback to `Date.getTime()` or `NEGATIVE_INFINITY`
- Defensive: undefined → `NEGATIVE_INFINITY`

### Variant C — `components/benchmark-detail.tsx:1418-1426` (`toComparableTimestamp`)

Same as Variant B but parameter is `string` (not `string | undefined`) and there's no leading `if (!timestamp)` check. Otherwise functionally identical.

## Classification

This item has two halves that land in different places:

- **Cleaning (value format canonicalization) → pipeline.** The pipeline currently emits `retrieved_timestamp` as a unix-seconds-string. Converting to ISO 8601 is a value-change that belongs upstream; once done, all consumers read a consistently-formatted string with no parsing quirks.
- **Reshape (variant dedup / sort-key derivation) → DuckDB SQL.** The 3 normalizers + 8 call sites exist solely to compare timestamps in order to pick the freshest variant or sort models by recency. That's a `MAX(retrieved_timestamp)` or `ORDER BY retrieved_timestamp DESC` operation — reshape work that has no business running at request time in TS. Once timestamps are ISO 8601, SQL comparison is lexicographic and correct. With a relational parquet schema, variant dedup becomes `QUALIFY ROW_NUMBER() OVER (PARTITION BY variant_key ORDER BY retrieved_timestamp DESC) = 1` instead of three TS normalizers.

The two halves delete together: pipeline emits ISO 8601 (cleaning done) → SQL replaces the comparison call sites (reshape done) → all three TS functions deleted.

## Inputs and expected outputs

Each table below describes ONE variant. Pipeline must produce identical outputs per variant when canonical timestamps still roundtrip through these functions; the deletion target is to remove all three.

### Group A — Variant A (`normalizeEvalTimestamp`)

| Input | Output | Path |
|---|---|---|
| `"1774096306"` | `1774096306000` | numeric, no dash → `* 1000` (unix seconds → ms) |
| `"1774096306.427425"` | `1774096306427.4248` | numeric, no dash → `* 1000` |
| `"2026-04-13T12:34:56Z"` | `1776083696000` | not numeric → `Date.getTime()` |
| `"2025-01-01"` | `1735689600000` | not numeric → `Date.getTime()` |
| `"-1774096306"` | (a Date in 1969) | numeric BUT includes `-` → falls to `Date.getTime()` of negative-number-string → unexpected |
| `"not a date"` | `NaN` | not numeric AND `Date(...)` is invalid → returns NaN |
| `""` | `NaN` | Number("") = 0, no dash, → 0 * 1000 = 0... actually wait, Number("") is 0, !isNaN(0) is true, includes("-") false, → 0 * 1000 = 0. So empty returns 0, not NaN. |
| `"20240620"` | `20240620000` | numeric, no dash → `* 1000`. Treated as unix seconds (year 1970) — NOT as YYYYMMDD date |

### Group B — Variant B (`toComparableTimestamp` in lib/hf-data.ts)

| Input | Output | Path |
|---|---|---|
| `"1774096306"` | `1774096306` | parseFloat finite → return as-is (NO multiplier) |
| `"1774096306.427425"` | `1774096306.427425` | parseFloat finite → return as-is |
| `"2026-04-13T12:34:56Z"` | `2026` | parseFloat parses leading "2026" → finite → returns `2026` (TS quirk: ISO datetimes look like the year-as-number, NOT compared as ms-of-epoch) |
| `"2025-01-01"` | `2025` | parseFloat → 2025 (TS quirk again) |
| `"not a date"` | `NEGATIVE_INFINITY` | parseFloat NaN → Date NaN → fallback |
| `""` | `NEGATIVE_INFINITY` | falsy → defensive fallback |
| `undefined` | `NEGATIVE_INFINITY` | falsy → defensive fallback |
| `"20240620"` | `20240620` | parseFloat finite → return as-is |

### Group C — Variant C (`toComparableTimestamp` in components/benchmark-detail.tsx)

Same as Variant B except `""` and `undefined` paths:

| Input | Output | Path |
|---|---|---|
| `""` | `NEGATIVE_INFINITY` | parseFloat("") = NaN, Date("").getTime() = NaN → fallback |
| `undefined` | (TypeError at call site, since signature is `string` not `string \| undefined`) | undefined isn't allowed; parseFloat(undefined) = NaN, but TS would flag the call |

In practice the `string` signature means callers always pass strings, so the `if (!timestamp)` check is unnecessary.

### Group D — Cross-variant divergence (TS quirk)

For the same input, the three variants produce DIFFERENT numbers. Comparing values from different variants is unsafe — but in production each variant is used in a self-contained scope, so this divergence doesn't usually fire.

| Input | Variant A | Variant B | Variant C |
|---|---|---|---|
| `"1774096306.427425"` | `1774096306427.4248` (ms) | `1774096306.427425` (seconds, no multiplier) | `1774096306.427425` |
| `"2026-04-13T12:34:56Z"` | `1776083696000` (ms-of-epoch from Date) | `2026` (parseFloat extracts the year!) | `2026` |
| Comparing the two above (a vs b) | a < b (correct: 2026 is more recent) | a > b (**incorrect**: parseFloat treats ISO as the number 2026) | a > b (**incorrect**) |

**This is a real bug in Variants B and C** for cross-format comparisons. It doesn't manifest in production because 99.99% of timestamps in `.cache/hf-data/models/*.json` are unix-seconds-strings. Do NOT fix in this migration; document and let pipeline canonicalize the format upstream so the bug becomes structurally impossible.

## Current TS implementation

| Concern | Location | Callers |
|---|---|---|
| Variant A — `normalizeEvalTimestamp` | `lib/model-data.ts:76-81` | 4 sites: `lib/model-data.ts:266, 650, 945-946, 1124` (all sort/compare timestamps when picking latest or sorting model_results) |
| Variant B — `toComparableTimestamp` | `lib/hf-data.ts:1049-1061` | 2 sites: `lib/hf-data.ts:1311-1312` (compare in flattenHierarchyNode variant-bucket reduction) |
| Variant C — `toComparableTimestamp` | `components/benchmark-detail.tsx:1418-1426` | 2 sites: `components/benchmark-detail.tsx:1600-1601` (variant deduplication) |

Total: 3 functions + 8 caller sites across 3 files.

## Pipeline status — divergences

### Side-by-side comparison table

| Aspect | TS (this spec) | Pipeline today | Result for users |
|---|---|---|---|
| Where canonicalization runs | request time, in 3 functions | not implemented; raw `retrieved_timestamp` strings emitted | TS parses on every comparison |
| Output format | varies per variant (ms vs seconds) | `retrieved_timestamp` is unix-seconds-string in 99.99% of rows; ISO datetime in 0.006% | mixed; TS handles each variant differently but production format consistency means it usually works |

### Concrete worked example with quantified scope

Audited 2026-04-28 against `.cache/hf-data/models/*.json`:

- Total `retrieved_timestamp` values: **86,183**
- Unix-seconds-string format (`"1774096306.427425"`): **86,178** (99.994%)
- ISO datetime format (`"2024-10-27T00:00:00Z"`): **5** (0.006%)
- Empty / null: **0**
- Other: **0**

Verified by `scripts/verify-timestamp.mjs`.

## Notes for pipeline implementer

- **Recommended canonical format: ISO 8601** (`"2026-04-13T12:34:56Z"`). Lexicographic sort works as chronological sort; `Date(...)` parsing is unambiguous; matches what AGENTS.md uses elsewhere.
- Once pipeline emits all timestamps as ISO 8601:
  - Variant A's `* 1000` multiplier path becomes dead (no numeric input → all paths use `Date.getTime()`)
  - Variants B and C's `parseFloat` quirk becomes irrelevant (ISO inputs → parseFloat NaN → fall to `Date.getTime()`)
- All three variants then become equivalent and can be replaced with a single `Date(ts).getTime()` inline (or a shared one-line helper).
- Don't try to migrate to a different format mid-flight (e.g. ms-of-epoch as bigint); ISO matches what the rest of the system expects.
- The 5 existing ISO-format rows in production are evidence this format already works for the cache; the rest just need to be converted upstream.

Verification: once pipeline ships ISO timestamps for all 86,183 rows, run `scripts/verify-timestamp.mjs` and confirm the unixSecondsString count drops to 0.

## Migration checklist

- [x] Spec written
- [x] Tests cover each variant's semantics + the cross-variant divergence (`tests/transformations/timestamp-normalization.test.ts`)
- [ ] Filed with pipeline owner with the spec + tests + audit script as acceptance criterion
- [ ] Pipeline emits all `retrieved_timestamp` values as ISO 8601 across all 86,183 rows
- [ ] TS deleted; replace 3 functions + 8 callers with a single shared `Date(ts).getTime()` (or inline). Files: `lib/model-data.ts`, `lib/hf-data.ts`, `components/benchmark-detail.tsx`.

## Future product decision (deferred)

The `parseFloat` bug in Variants B and C produces incorrect ordering for cross-format comparisons. We're choosing to fix-by-canonicalization-upstream rather than fix-in-place. Whether the bug should be patched in TS as a defensive measure (in case a non-ISO timestamp slips through after migration) is a separate decision.
