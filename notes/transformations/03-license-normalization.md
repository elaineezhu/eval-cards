# License normalization

Drafted 2026-04-28. Migration item #18 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency, not fixing data. TS-as-is is the canonical spec. If the truncation behaviour or rule coverage looks suboptimal, that's a deferred product decision (see end of doc). Do not "improve" the rule when porting upstream.

## Rule (as TS implements it today)

`shortenLicense` (`components/eval-card.tsx:38-48`) takes a free-text license string from `benchmark_card.ethical_and_legal_considerations.data_licensing` and returns a short display label. Algorithm:

1. If empty or `"Not specified"` → return `""`.
2. If lowercased license includes `"creative commons attribution 4"` → `"CC BY 4.0"`.
3. Else if includes `"creative commons zero"` → `"CC0"`.
4. Else if includes `"apache license 2"` OR `"apache 2"` → `"Apache 2.0"`.
5. Else if includes `"mit license"` → `"MIT"`.
6. Else if includes `"cc-by-sa"` → `"CC BY-SA"`.
7. Else if length > 24 → return `${license.slice(0, 22)}…` (truncate to 22 chars + ellipsis).
8. Else → return the input unchanged.

Rules are applied in this order (first match wins). The truncation target (`length > 24`, slice to 22) is asymmetric on purpose — one character of headroom to avoid truncating 24-char strings.

The companion function `licenseBadgeClass` in the same file is **purely presentational** (CSS color mapping) and stays in the component. NOT in scope for this migration.

## Classification

- **Unconditional normalization.** Always overwrite whatever upstream emitted.
- The output field on the spec side could be named `license_short` and live alongside `data_licensing` in the benchmark card. The original `data_licensing` (free text) stays available for tooltips/details views.
- **Cleaning → pipeline.** Pure value transform on a single field. No aggregation or record merging. Migration target: pipeline emits `license_short`; TS `shortenLicense` deletes.

## Inputs and expected outputs

Each row corresponds to a parameterized test case in `tests/transformations/license-normalization.test.ts`. Pipeline must produce identical outputs for every case below.

### Group A — Rule firing order (which rule wins)

| Input | Output | Rule fired |
|---|---|---|
| `"Apache License 2.0"` | `"Apache 2.0"` | rule 4 (matches "apache license 2") |
| `"Apache 2.0"` | `"Apache 2.0"` | rule 4 (matches "apache 2") |
| `"MIT License"` | `"MIT"` | rule 5 |
| `"Creative Commons Attribution 4.0"` | `"CC BY 4.0"` | rule 2 |
| `"Creative Commons Zero v1.0 Universal"` | `"CC0"` | rule 3 |
| `"cc-by-sa-3.0"` | `"CC BY-SA"` | rule 6 |
| `"Open Data Commons Attribution License"` | `"Open Data Commons Attr…"` | rule 7 (truncate, length > 24) |
| `"The dataset is made available under a CC BY license."` | `"The dataset is made av…"` | rule 7 (truncate; the prose form bypasses rule 2 because it doesn't contain "creative commons attribution 4") |
| `"apache-2.0"` | `"apache-2.0"` | rule 8 (passthrough; SPDX-style hyphen-lowercase doesn't match "apache license 2" or "apache 2") |
| `"other"` | `"other"` | rule 8 (passthrough, length ≤ 24) |
| `"unknown"` | `"unknown"` | rule 8 (passthrough, length ≤ 24) |
| `"Not specified"` | `""` | rule 1 |
| `""` | `""` | rule 1 |
| `null` / `undefined` | `""` | rule 1 (falsy short-circuit) |

### Group B — Edge cases of the truncation rule

| Input | Output | Notes |
|---|---|---|
| 24-char string (no other rule matches) | (input unchanged) | length ≤ 24 → passthrough |
| 25-char string | first-22-chars + `…` | length > 24 → truncate |
| String beginning `"MIT-like license that is custom"` | `"MIT"` | rule 5 fires before truncation (substring match) |
| String beginning `"some apache 2 thing"` | `"Apache 2.0"` | rule 4 fires (substring match) |

### Group C — Case sensitivity

All match-rules call `.toLowerCase()` before substring testing. Inputs:

| Input | Output | Notes |
|---|---|---|
| `"APACHE LICENSE 2.0"` | `"Apache 2.0"` | case-insensitive match |
| `"creative commons attribution 4.0"` | `"CC BY 4.0"` | already lowercase |
| `"CREATIVE COMMONS ZERO v1.0"` | `"CC0"` | uppercase still matches |
| `"Mit License"` | `"MIT"` | mixed case |

## Current TS implementation

The same `shortenLicense` function is duplicated in TWO files:

| Concern | Location |
|---|---|
| Function (eval-card list render path) | `components/eval-card.tsx:38-48` (`shortenLicense`) |
| Caller | `components/eval-card.tsx:63` |
| Function (eval-list page render path — duplicate copy) | `app/evals/page.tsx:24-41` (`shortenLicense`) |
| Caller | `app/evals/page.tsx:1720` |
| CSS class mapping (NOT in scope, stays in UI) | `components/eval-card.tsx:22-36` (`LICENSE_COLORS`, `licenseBadgeClass`) AND `app/evals/page.tsx:43-?` (duplicate) |

The two function bodies are **functionally identical** (same output for every input) but textually slightly different — `app/evals/page.tsx` uses template literal `` `${license.slice(0, 22)}…` ``, `components/eval-card.tsx` uses concatenation `license.slice(0, 22) + "…"`. Both run at request time on every render. Pipeline-side emission of `license_short` would eliminate both per-render calls; the deletion task must update BOTH files.

## Pipeline status — divergences

### Side-by-side comparison table

| Aspect | TS (this spec) | Pipeline today | Result for users |
|---|---|---|---|
| Where the transformation lives | `components/eval-card.tsx:shortenLicense` (runs at every render) | not implemented | TS runs at request time; pipeline ships free-text `data_licensing` only |
| Field consumed | `benchmark_card.ethical_and_legal_considerations.data_licensing` | (same — unchanged) | — |
| Output field | local variable `shortLicense` (passed to badge as label text) | none | UI shows TS's output; pipeline doesn't expose a short form anywhere |
| Rule coverage | 5 explicit aliases + truncate fallback | n/a | n/a |

### Concrete worked example with quantified scope

Audited 2026-04-28 against `.cache/hf-data/benchmark-metadata.json` (production cache):

- 85 of 85 benchmark cards have a `data_licensing` field
- 11 distinct license strings appear across the corpus
- `shortenLicense` produces the following distribution:
  - 33 → `""` (cards with `"Not specified"`)
  - 16 → `"Apache 2.0"`
  - 9 → `"MIT"`
  - 8 → `"Open Data Commons Attr…"` (truncated)
  - 6 → `"CC BY 4.0"`
  - 3 → `"CC BY-SA"`
  - 3 → `"other"` (passthrough)
  - 3 → `"unknown"` (passthrough)
  - 2 → `"CC0"`
  - 1 → `"apache-2.0"` (passthrough — SPDX-style misses the `apache 2.0` rule)
  - 1 → `"The dataset is made av…"` (truncated; prose form bypasses CC BY rule)

Verified by `scripts/verify-license.mjs`.

## Notes for pipeline implementer

- Reproduce all 8 rules in order (first match wins). Do not reorder.
- The `apache-2.0` SPDX-style-lowercase form intentionally falls through to passthrough — the existing rule only matches prose forms (`"apache license 2"` or `"apache 2"` with a space). Don't broaden the rule.
- The truncation produces `${license.slice(0, 22)}…`. That's 22 chars plus a single Unicode ellipsis (`…`, U+2026). Don't substitute three dots (`...`).
- Truncation triggers at `length > 24`, not `length > 22`. A 24-char string passes through; a 25-char string truncates. Preserve this asymmetry.
- The empty + `"Not specified"` → `""` short-circuit uses falsy semantics in JS (handles `null`/`undefined`/`""` together). Pipeline-side equivalent should treat all three input shapes as the same.
- Field name suggestion: `benchmark_card.ethical_and_legal_considerations.license_short` — keeps the existing free-text `data_licensing` available for detail views.

Verification: run `scripts/verify-license.mjs` against pipeline-emitted `license_short` once it ships. Goal: zero divergence across the 85 production benchmark cards.

## Migration checklist

- [x] Spec written
- [x] Tests cover each rule branch (`tests/transformations/license-normalization.test.ts`)
- [ ] Filed with pipeline owner with the spec + tests + audit script as acceptance criterion
- [ ] Pipeline emits `license_short` matching this spec across all benchmark cards
- [ ] TS deleted; `components/eval-card.tsx:38-48` AND `app/evals/page.tsx:24-41` both read `card?.ethical_and_legal_considerations?.license_short` directly. `licenseBadgeClass` stays in both files (UI presentation).

## Future product decision (deferred)

The current rule set has known coverage gaps that produce ugly truncation:
- Free-form CC BY descriptions (e.g. "The dataset is made available under a CC BY license.") aren't recognized as CC BY → truncate to "The dataset is made av…"
- "Open Data Commons Attribution License" (ODC-By) isn't recognized → truncate to "Open Data Commons Attr…"
- SPDX-style lowercase identifiers (`apache-2.0`, `mit`, `cc-by-4.0`) aren't recognized as their canonical short forms

If the team later decides users would benefit from broader recognition (e.g. SPDX identifier mapping, looser CC matching), the rule can be expanded in pipeline. That's explicitly out of scope for this refactor.
