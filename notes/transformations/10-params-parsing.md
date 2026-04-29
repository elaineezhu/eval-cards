# Params billions parsing

Drafted 2026-04-28. Migration item #12 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency. TS-as-is is the canonical spec. Five separate parameter-count parsers exist across the app, with subtly different unit grammars, fallback chains, and anchoring. They produce the same answer for the most common production inputs (clean `"7B"` / `"34.389"` style strings) but diverge sharply on edge cases. The migration target: emit a single canonical `params_billions` (numeric, billions) upstream so all five parsers can be deleted.

## Rule (as TS implements it today — five variants)

Five independent code paths convert a free-form parameter-count token into a billions-of-parameters number.

### Variant A — `lib/model-data.ts:312-354` (`parseParamsBillions`)

```ts
function parseParamsBillions(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null
  }
  if (typeof value !== "string") return null

  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const compact = normalized.replace(/,/g, "")
  const tokenMatch = compact.match(/(\d+(?:\.\d+)?)\s*(trillion|tn|t|billion|bn|b|million|mn|m|thousand|k)\b/)
  if (tokenMatch) {
    const amount = Number.parseFloat(tokenMatch[1])
    if (!Number.isFinite(amount) || amount <= 0) return null
    const unit = tokenMatch[2]
    if (unit === "trillion" || unit === "tn" || unit === "t") return amount * 1000
    if (unit === "billion" || unit === "bn" || unit === "b") return amount
    if (unit === "million" || unit === "mn" || unit === "m") return amount / 1000
    if (unit === "thousand" || unit === "k") return amount / 1_000_000
  }

  const numeric = Number.parseFloat(compact)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}
```

- Polymorphic input (`unknown`); accepts `number` directly (positive only).
- For strings: lowercases, strips commas, then scans for `<number><unit>` where unit ∈ {trillion, tn, t, billion, bn, b, million, mn, m, thousand, k}.
- Unit table converts to billions; `t` → ×1000, `b` → as-is, `m` → ÷1000, `k` → ÷1_000_000.
- Falls back to `parseFloat` of the whole string (assumed to be billions). **Positive-only**: rejects 0 and negatives at both branches.

Used by: `lib/model-data.ts:409` (`parseParamsBillions(entry.params_billions)` in `hfModelCardToEvaluationCardData`). Sole caller. Input is `entry.params_billions` from `model-cards.json`, which in production is always `number | null` (see audit) — so only the `typeof value === "number"` branch ever fires.

### Variant B — `components/eval-detail.tsx:81-119` (`parseParamsBillionsFromText`)

```ts
function parseParamsBillionsFromText(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const compact = normalized.replace(/,/g, "")
  const tokenMatch = compact.match(/(\d+(?:\.\d+)?)\s*(trillion|tn|t|billion|bn|b|million|mn|m|thousand|k)\b/)
  if (tokenMatch) {
    const amount = Number.parseFloat(tokenMatch[1])
    if (!Number.isFinite(amount)) return null   // ← NO `<= 0` check (differs from A)
    /* same unit table as Variant A */
  }
  const numeric = Number.parseFloat(compact)
  return Number.isFinite(numeric) ? numeric : null   // ← NO `> 0` check (differs from A)
}
```

- Same regex + unit table as A.
- **Differs from A** on two checks: A rejects `amount <= 0` and `numeric <= 0`; B accepts `0`, negatives, and any finite number. So `"0B"` → `0` here, `null` in Variant A. The `"-5"` parseFloat fallback returns `-5` in B but `null` in A. (For `"-5B"` both return `5`, since the regex's `\d+` matches the `5` substring and the leading minus is silently dropped.)
- Used by `getParamsBillionsFromModelInfo` (Variant D) for `additional_details.params_billions` (string in production, see audit) and `model_info.parameter_count` strings.

### Variant C — `components/eval-detail.tsx:121-155` (`parseParamsBillionsFromText`'s sibling, `parseParamsBillionsFromModelName`)

```ts
function parseParamsBillionsFromModelName(modelName: string | null | undefined) {
  if (!modelName) return null
  const sizeTokens = Array.from(modelName.matchAll(/\b(\d+(?:\.\d+)?)\s*([tmbk])\b/gi))
  if (sizeTokens.length === 0) return null

  const lastToken = sizeTokens[sizeTokens.length - 1]
  const numericValue = Number.parseFloat(lastToken[1])
  if (!Number.isFinite(numericValue)) return null

  const unit = lastToken[2].toLowerCase()
  if (unit === "t") return numericValue * 1000
  if (unit === "b") return numericValue
  if (unit === "m") return numericValue / 1000
  if (unit === "k") return numericValue / 1_000_000
  return null
}
```

- Word-boundary match (`\b...\b`) on **single-letter unit only** (`t|m|b|k`, case-insensitive).
- Picks the **last** matching token in the string (e.g. `"Llama-3-70B-Instruct-8K"` → matches `70B` and `8K` → returns last (`8K` = 0.000008B)). This is **a known TS quirk**: model names containing context-window suffixes (`8K`, `32K`, `128K`) cause the parser to return the context-window size instead of the parameter count.
- Used by `getParamsBillionsFromModelInfo` (Variant D) as final fallback when `additional_details.params_billions` and `parameter_count` are both absent/unparseable.

### Variant D — `components/eval-detail.tsx:157-184` (`getParamsBillionsFromModelInfo`)

Composite orchestrator (not a parser itself). Order:

1. `additional_details.params_billions` ?? `additional_details.parameter_count` ?? `additional_details.num_parameters` ?? `additional_details.params`
   - if `number` → return as-is (no validity check; could be negative or non-finite)
   - if `string` → `parseParamsBillionsFromText` (Variant B)
2. else if `modelInfo.parameter_count` is `string` → `parseParamsBillionsFromText` (Variant B)
3. else → `parseParamsBillionsFromModelName(modelInfo.name)` (Variant C)

Used at: `components/eval-detail.tsx:350, 1253, 1368` (paramsBillions cell in eval-detail tables, leaderboard sort filtering, "any model has params" header check).

### Variant E — `components/model-compare-dialog.tsx:44-60` (`parseParamsBillionsFromModelName`)

```ts
function parseParamsBillionsFromModelName(modelName: string | null | undefined) {
  if (!modelName) return null
  const sizeTokens = Array.from(modelName.matchAll(/\b(\d+(?:\.\d+)?)\s*([bm])\b/gi))
  if (sizeTokens.length === 0) return null

  const lastToken = sizeTokens[sizeTokens.length - 1]
  const numericValue = Number(lastToken[1])
  if (!Number.isFinite(numericValue)) return null

  const unit = lastToken[2].toLowerCase()
  if (unit === "b") return numericValue
  if (unit === "m") return numericValue / 1000
  return null
}
```

- Same shape as Variant C, but unit set is **only `b|m`** (no `t`, no `k`) and uses `Number()` instead of `parseFloat`.
- Used by `formatParamsBillions(value, modelName)` only when the explicit numeric `value` is null/NaN — so it's the fallback parser for the compare-dialog header label.

### Variant F — `app/evals/[id]/page.tsx:434-437` (inline regex)

```ts
const sizeMatch = (data.name + " " + id).match(/\b(\d+(?:\.\d+)?)\s*[bB]\b/)
if (sizeMatch) sizeB = parseFloat(sizeMatch[1])
```

- One-shot regex against the **concatenation of `name + " " + id`** (not just name).
- Unit set: **only `b|B`**. No multi-unit support, no fallback.
- `match()` (not `matchAll()`) → returns **first** match (Variants C and E pick the **last**). For a name like `"Llama-3-8B-70B-Instruct"` Variant F returns `8`, Variant C returns `70`.
- Used at the matrix-leaderboard sizeB filter (`m.sizeB`, lines 472-473) for the params-range slider.

## Classification

- **Cleaning / standardization → pipeline.** Pure value transform on a single field per row. The product decision being encoded — "express parameter count in billions" — is a per-record canonicalization that belongs upstream. Pipeline-side fix: emit a single numeric `params_billions` (in billions) on every model record; consumers stop parsing.
- **Unconditional normalization.** Each variant runs unconditionally over its source fields; none defer to a pre-existing canonical numeric (because none exists at the per-result level today). Pipeline-side fix is to emit the canonical value before consumers see the row, not to gate normalization on its absence.

(One nuance: Variant D's *fallback chain* — try `additional_details.params_billions`, then `parameter_count`, then `name` — is itself a small bit of reshape logic. After pipeline emits a canonical numeric, the chain collapses to a single field read.)

## Inputs and expected outputs

Each table below describes ONE variant.

### Group A — Variant A (`parseParamsBillions`, lib/model-data.ts)

| Input | Output | Path |
|---|---|---|
| `7` (number) | `7` | number, finite, > 0 → return as-is |
| `0` (number) | `null` | number, > 0 fails → null |
| `-3` (number) | `null` | number, > 0 fails → null |
| `NaN` | `null` | number, finite fails → null |
| `null` / `undefined` / `[]` | `null` | not number, not string → null |
| `"7B"` | `7` | regex matches → unit `b` → 7 |
| `"7b"` | `7` | lowercased; same |
| `"70B params"` | `70` | regex matches at start, `b` → 70 |
| `"1.5B"` | `1.5` | float supported |
| `"405b"` | `405` | lowercased |
| `"7 billion"` | `7` | full word `billion` → 7 |
| `"7bn"` | `7` | `bn` alias |
| `"1.2T"` | `1200` | `t` → ×1000 |
| `"2 trillion"` | `2000` | `trillion` → ×1000 |
| `"2T params"` | `2000` | regex stops at `t\b`; trailing text ignored |
| `"560M"` | `0.56` | `m` → ÷1000 |
| `"560 million"` | `0.56` | `million` → ÷1000 |
| `"1000K"` | `0.001` | `k` → ÷1_000_000 |
| `"1,500B"` | `1500` | comma stripped |
| `"34.389"` | `34.389` | no unit token → parseFloat fallback |
| `"7  B"` (double space) | `7` | regex `\s*` matches |
| `"abc"` | `null` | no match, parseFloat NaN → null |
| `""` | `null` | trim → "" → early return |
| `"   "` | `null` | trim → "" → early return |
| `"0B"` | `null` | regex matches, amount=0, `<= 0` reject → null |
| `"3.5tn"` | `3500` | `tn` alias |
| `"7Banana"` | `7` | regex `b\b` fails (no boundary after `b`); falls to `parseFloat("7banana")` = `7` → returns 7. **TS quirk: trailing junk allowed in parseFloat fallback** |
| `"-5B"` | `5` | regex `\d+` doesn't include `-`, but matches the `5b` substring → amount=5; `>0` passes → returns `5`. **TS quirk: leading minus is silently dropped** |

### Group B — Variant B (`parseParamsBillionsFromText`, eval-detail.tsx)

Same as A except:

| Input | A | B | Why |
|---|---|---|---|
| `"0B"` | `null` | `0` | B has no `<= 0` reject |
| `"-5"` (string) | `null` | `-5` | B has no `> 0` reject on parseFloat fallback |
| `"-5B"` (string) | `5` | `5` | both: regex matches the `5b` substring → amount=5 (TS quirk: leading minus dropped silently) |
| `"NaN"` (string) | `null` | `null` | parseFloat("nan") = NaN, `isFinite` false → null in both |
| number input | passes-through (with `>0` check) | n/a (B rejects non-strings) | A is polymorphic; B is string-only |

All other rows in Group A apply to B identically (string-input rows only).

### Group C — Variant C (`parseParamsBillionsFromModelName`, eval-detail.tsx)

| Input | Output | Path |
|---|---|---|
| `"Llama-3-70B-Instruct"` | `70` | matchAll finds `70B`, last token, `b` → 70 |
| `"Llama-3-8B-Instruct-8K"` | `0.000008` | matchAll finds `8B` and `8K`; **last** token is `8K` → ÷1_000_000 → 0.000008. **TS quirk** |
| `"Llama-3-70B-Instruct-32K"` | `0.000032` | last token is `32K` → 0.000032. **TS quirk: context-window beats param count** |
| `"Mixtral-8x7B"` | `null` | regex needs `\b` before the `\d`; `8x7b` has no boundary between `x` and `7`, so no token matches. **TS quirk: MoE-style names parse to null** |
| `"Phi-3.5-mini-3.8B"` | `3.8` | matches `3.8B` |
| `"560M"` | `0.56` | `m` token → ÷1000 |
| `"GPT-4"` | `null` | no `\b\d+[tmbk]\b` token |
| `"Yi-1.5-34B-32K"` | `0.000032` | last token `32K` (context window!) → 0.000032 |
| `"Qwen2-7B-Instruct"` | `7` | last token `7B` |
| `"7 billion"` | `null` | regex requires single-letter unit; `billion` has no `\bb\b` since it's word-internal |
| `"1.2T"` | `1200` | `t` → ×1000 |
| `""` / `null` / `undefined` | `null` | early return |

### Group D (1) — Variant D (`getParamsBillionsFromModelInfo`, orchestrator)

Behavior depends on which field is populated:

| modelInfo state | Result |
|---|---|
| `additional_details.params_billions` is `number` 7 | `7` (returned as-is, no validation) |
| `additional_details.params_billions` is `number` -3 | `-3` (no validity check; passed through) |
| `additional_details.params_billions` is `string "7.242"` | `7.242` (Variant B parseFloat fallback) |
| `additional_details.params_billions` is `string "7B"` | `7` (Variant B regex) |
| `additional_details.params_billions` absent, `additional_details.parameter_count` is `"34.389"` | `34.389` (Variant B) |
| `additional_details` absent, `modelInfo.parameter_count` is `"7B"` | `7` (Variant B) |
| All `additional_details.*` and `parameter_count` absent, `modelInfo.name` is `"Llama-3-70B-Instruct"` | `70` (Variant C) |
| All absent, `modelInfo.name` is `"Llama-3-8B-Instruct-8K"` | `0.000008` (Variant C TS quirk) |

### Group E — Variant E (`parseParamsBillionsFromModelName`, model-compare-dialog.tsx)

Same as Variant C but rejects `t` and `k`:

| Input | C | E | Why |
|---|---|---|---|
| `"Llama-3-70B-Instruct"` | `70` | `70` | both — `b` token |
| `"Llama-3-8B-8K"` | `0.000008` | `8` | E ignores `K` → last `b|m` token is `8B` |
| `"Yi-1.5-34B-32K"` | `0.000032` | `34` | E correctly returns 34 (TS quirk: E is *more correct* on names with context-window suffixes!) |
| `"1.2T"` | `1200` | `null` | E doesn't accept `t` |
| `"Mixtral-8x7B"` | `null` | `null` | both — `8x7b` has no `\b` before the digit |
| `"560M"` | `0.56` | `0.56` | both |
| `"7Banana"` | `null` | `null` | both — regex requires `\b` boundary |

### Group F — Variant F (`(name + " " + id).match(/\b(\d+(?:\.\d+)?)\s*[bB]\b/)`, app/evals/[id]/page.tsx)

| Input (`name + " " + id`) | Output | Path |
|---|---|---|
| `"Llama-3-70B meta/llama-3-70b"` | `70` | first `70B` matches |
| `"Llama-3-70B-Instruct-8K meta/llama-3-70b-instruct"` | `70` | first match wins; `8K` not a `b\|B` so ignored entirely |
| `"Yi-1.5-34B-32K 01-ai/yi-1-5-34b-32k"` | `34` | first match `34B` |
| `"GPT-4 openai/gpt-4"` | `null` | no `b\|B` token |
| `"Mixtral-8x7B mistralai/mixtral-8x7b"` | `null` | `8x` blocks word-boundary; no `\b\d` anchor; no match |
| `"560M openai/foo-560m"` | `null` | F only accepts `b\|B` |
| `"1.5B-instruct meta/foo-1-5b"` | `1.5` | first `1.5B` |
| `"" + " " + ""` | `null` | empty → no match |

**Cross-variant ordering quirk:** Variants C and E pick the *last* size-token; Variant F picks the *first*. For ambiguous names the answer can differ; in practice production names tend to have one numeric+unit token so this rarely matters.

### Group G — Cross-variant divergence

For the same input, the variants produce different outputs. In production, format consistency keeps disagreement narrow but real:

For inputs that aren't model names (free-text params strings), A and B are the relevant variants:

| Input | A | B |
|---|---|---|
| `"7B"` | `7` | `7` |
| `"7"` (string) | `7` (parseFloat fallback) | `7` |
| `7` (number) | `7` | n/a (B rejects non-strings) |
| `0` (number) | `null` (>0 reject) | n/a |
| `NaN` (number) | `null` | n/a |
| `"0B"` | `null` (rejects amount ≤0) | `0` |
| `"-5"` (string) | `null` (>0 reject on parseFloat fallback) | `-5` |
| `"-5B"` (string) | `5` | `5` (regex matches `5b`; minus dropped — both variants) |
| `"7Banana"` | `7` | `7` (parseFloat lenient — both variants) |

For inputs that ARE model names (the C/E/F input domain), all five variants can be applied:

| Input | A | B | C | E | F (`name + " " + id`) |
|---|---|---|---|---|---|
| `"Llama-3-70B-Instruct"` | `70` (first regex match) | `70` | `70` (last token = `70B`) | `70` | `70` (first match) |
| `"Llama-3-70B-Instruct-8K"` | `70` (`match()` returns first; first `(\d+)(unit)` is `70b`) | `70` (same regex as A) | `0.000008` (C's `matchAll` → last token = `8K`, ÷1_000_000 → 0.000008) | `8` (E ignores `K`; last `b\|m` token = `8B`) | `70` (F is `[bB]` only; first match = `70B`) |
| `"Yi-1.5-34B-32K"` | `34` | `34` | `0.000032` (last token `32K`) | `34` | `34` |
| `"Mixtral-8x7B"` | `7` (A's regex has no leading `\b` — `\d+` can match anywhere, including right after `x` → matches `7b` → 7) | `7` (same as A) | `null` (C's regex starts with `\b\d` — no `\b` between `x` and `7` → no match) | `null` | `null` |
| `"560M"` | `0.56` | `0.56` | `0.56` | `0.56` | `null` (F is B-only) |
| `"1.2T"` | `1200` | `1200` | `1200` | `null` (E is `b\|m`-only) | `null` (F is B-only) |
| `"7 billion"` | `7` | `7` | `null` (C requires single-letter unit only; `billion` doesn't match the `[tmbk]` class) | `null` | `null` |

**This is not a bug to fix in the migration.** It's evidence that the parsers were written with subtly different assumptions about input shape (model-name vs free-text vs trusted-numeric). The pipeline-canonical fix collapses all five into a single field read.

## Current TS implementation

| Variant | Function | Location | Callers | Source field |
|---|---|---|---|---|
| A | `parseParamsBillions` | `lib/model-data.ts:312-354` | 1 site: `lib/model-data.ts:409` | `entry.params_billions` from `model-cards.json` (number\|null in prod) |
| B | `parseParamsBillionsFromText` | `components/eval-detail.tsx:81-119` | 2 sites inside Variant D: `eval-detail.tsx:170, 177` | strings from `additional_details.params_billions / parameter_count / num_parameters / params` and `modelInfo.parameter_count` |
| C | `parseParamsBillionsFromModelName` | `components/eval-detail.tsx:121-155` | 1 site inside Variant D: `eval-detail.tsx:183` | `modelInfo.name` |
| D | `getParamsBillionsFromModelInfo` (orchestrator) | `components/eval-detail.tsx:157-184` | 3 sites: `eval-detail.tsx:350, 1253, 1368` | `ModelResultForBenchmark["model_info"]` (built per-result by `lib/hf-data.ts:1133` `buildModelInfoForVariant`) |
| E | `parseParamsBillionsFromModelName` (compare-dialog) | `components/model-compare-dialog.tsx:44-60` | 1 site: `model-compare-dialog.tsx:64` (`formatParamsBillions` fallback) | model display name in compare dialog |
| F | inline regex | `app/evals/[id]/page.tsx:434-437` | 1 site (inline use): lines 472-473 (sizeB filter for slider) | `data.name + " " + id` from per-row matrix-leaderboard model entries |

Total: 5 distinct parsers + 1 orchestrator + 8 caller sites across 4 files.

## Pipeline status — divergences

### Side-by-side comparison table

| Aspect | TS (this spec) | Pipeline today | Result for users |
|---|---|---|---|
| Where canonicalization runs | request time, in 5 functions | `model-cards.json.params_billions` is already a clean number for 87% of cards (5072/5830); per-result `additional_details.params_billions` is a *string* in ~58% of model files | TS parses on every render |
| Output format | varies per variant: number-of-billions; some return 0/negative, some null on edge | model-card level: clean float in billions; per-result: string requiring downstream parse | mostly converges in production but the per-result string parsing is unnecessary work |
| Coverage | Variants C/E/F regex-fallback fires when no `additional_details` data exists | model-cards: 13% (758/5830) have `params_billions=null` (no data, irrespective of parser) | "Not reported" appears for 13% of cards regardless of parser correctness |

### Concrete worked example with quantified scope

Audited 2026-04-28 against `.cache/hf-data/` (5,830 model-cards, 5,830 model files, **86,183 model_result rows**):

- **`model-cards.json` (top-level, drives Variant A)**: 5,830 entries.
  - `params_billions` is `number`: 5,072 (87.0%) — Variant A returns positive value
  - `params_billions` is `null`: 758 (13.0%) — Variant A returns null
  - `params_billions` is string: **0** → Variant A's string-parsing branches are entirely dead code in production
- **Per-row `model_info.additional_details.params_billions` (drives Variants B → D fallback)**:
  - undefined: 58,822 (68.3%) — D falls through to model-name fallback
  - string: 27,361 (31.7%) — virtually all `cleanDecimal` shape (e.g. `"7.242"`, `"34.389"`); 18 rows are `"-1.0"` (negative sentinel — Variant B accepts it as `-1`, A would reject)
  - number: 0
- **Variant D resolution path counts** (out of 86,183 rows):
  - `addPbString` (additional_details.params_billions string → B): 27,361 (31.7%)
  - `modelNameFallback` (Variant C from name): 18,174 (21.1%)
  - **`noResolution`** (D returns null): 40,648 (47.2%) — these rows display "Not reported"
- **Model name format distribution** (drives Variants C/E/F):
  - `hasBOnly` (single B-token, no context-window): 36,286 (42.1%) — happy path; all parsers converge
  - `hasBAndContextWindow` (e.g. `Yi-1.5-34B-32K`): **526 (0.61%)** — these hit Variant C's TS quirk
  - `hasMOnly` (e.g. `d-SmolLM2-360M`): 417 (0.48%)
  - `hasMoEPattern` (e.g. `WizardLM-2-8x22B`): 1,173 (1.36%) — A/B parse via no-leading-`\b` regex; C/E/F return null
  - `noUnitToken` (e.g. `Yi Large Preview`, `GPT-4`): 47,781 (55.4%) — no parser matches
  - `hasBAndT`: 0
- **Cross-variant agreement on names** (A/B/C/E/F applied to the model name string):
  - All five converge: 81,442 (94.50%)
  - **Variant C TS-quirk hit (context-window beats param count)**: **472 rows (0.55%)** — only C is wrong; A/B/E/F all return correct param count
  - F-only-missing (F returns null because no B-token but others find m/k/t): 3,001 (3.48%)
  - Other disagreement: 1,268 (1.47%)

**Top quirk in production**: Variant C returns the context-window size (`32K → 0.000032B`, `16K → 0.000016B`, `8K → 0.000008B`) instead of the parameter count for **472 model_result rows** with names like `Yi-1.5-34B-32K`, `Yi-1.5-34B-Chat-16K`. Variant D's fallback chain only reaches Variant C (the model-name parser) when `additional_details.params_billions` is missing, so the user-visible impact is bounded — but those 472 rows render with a `~0B` parameter count on the eval-detail leaderboard, well below the params-range filter floor.

Verified by `scripts/verify-params-parsing.mjs`.

## Notes for pipeline implementer

- **Recommended canonical field: `params_billions: float | null`** at the *per-result* level (pipeline emits it on every `model_result.model_info`, not just at the top-level model card).
- Eliminate the multi-field fallback chain in Variant D by emitting the resolved value in one canonical place. Existing fields (`additional_details.params_billions`, `additional_details.parameter_count`, `additional_details.num_parameters`, `additional_details.params`, `modelInfo.parameter_count`) can stay for compatibility but consumers stop reading them.
- The model-name regex fallback (Variants C/E/F) is the *only* path that fires when `additional_details` is missing. Pipeline should attempt to parse from name **once** upstream (with whatever quirks it chooses; default to the Variant E semantics — `b|m` only — to avoid the context-window false-positive) and emit the result. Document the upstream parser's choice clearly so this spec can be retired.
- The "params_billions in millions vs billions" unit is implicit; recommend keeping the field name `params_billions` to avoid breaking changes, and storing the value in **billions** as today.
- Once pipeline emits per-result `params_billions`:
  - Variant D collapses to a single field read.
  - Variants A/B/C/E/F all become deletable.
  - Variant F's `name + " " + id` regex disappears with the rest.

Verification: once pipeline ships per-result `params_billions`, run `scripts/verify-params-parsing.mjs` and confirm the regex-fallback ("name-derived") row count drops to 0.

## Migration checklist

- [x] Spec written
- [x] Tests cover each variant's semantics + cross-variant divergence (`tests/transformations/params-parsing.test.ts`)
- [ ] Filed with pipeline owner with the spec + tests + audit script as acceptance criterion
- [ ] Pipeline emits per-result `params_billions` numeric (in billions) across the full corpus
- [ ] TS deleted; replace 5 functions + orchestrator + 8 callers with a single field read. Files: `lib/model-data.ts`, `components/eval-detail.tsx`, `components/model-compare-dialog.tsx`, `app/evals/[id]/page.tsx`.

## Future product decision (deferred)

The Variant C "context-window suffix beats parameter count" quirk (`"Llama-3-8B-8K"` → 0.000008B) is a real bug. We're choosing to fix-by-canonicalization-upstream rather than fix-in-place. Whether the pipeline parser should match Variant C, Variant E (which avoids the quirk by ignoring `K`/`T`), or implement a smarter "prefer the larger token" heuristic is a separate design decision for the pipeline owner.

The Variant A `<= 0` rejection (treats `"0B"` as missing data) versus Variant B passthrough (`"0B"` → `0`) is another deferred decision. Production never emits `0`-valued params, so this also doesn't manifest today.
