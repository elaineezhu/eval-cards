# Dataset URL synthesis

Drafted 2026-04-28. Migration item #20 in `notes/migration-plan.md`.

## Framing reminder

We are refactoring for UI efficiency, not fixing data. TS-as-is is the canonical spec. The fallback chain is functionally complete; pipeline just needs to do the resolution once and emit the result.

## Rule (as TS implements it today)

`components/eval-card.tsx:83-86` resolves `datasetUrl` from `summary.source_data` via a 3-branch nullish-coalescing chain (NOT truthiness). The literal expression:

```ts
const datasetUrl =
  sourceData?.dataset_url ??
  (Array.isArray(sourceData?.url) ? sourceData?.url?.[0] : sourceData?.url) ??
  (sourceData?.hf_repo ? `https://huggingface.co/datasets/${sourceData.hf_repo}` : undefined)
```

Reading order:

1. `source_data.dataset_url` — used if not `null`/`undefined`. Empty string `""` is RETURNED (not nullish).
2. `source_data.url` — if array, take `url[0]` (no truthiness check on the element); if string, use directly. Falls through only if the resolved value is `null`/`undefined`.
3. `https://huggingface.co/datasets/${source_data.hf_repo}` — only if `hf_repo` is truthy (this branch uses a ternary, not `??`, so `""` falls through to `undefined`).
4. Else → `undefined`.

The constructed HF URL uses the literal template — no encoding, no slash normalization, no validation. Whatever the upstream `hf_repo` value is, it gets concatenated as-is.

## Classification

- **Default-only.** The rule fills in a value only when `dataset_url` isn't already present. Pipeline-side fix: emit `dataset_url` directly so the fallback chain becomes unnecessary; preserve any existing `dataset_url` value rather than overwriting.
- **Cleaning → pipeline.** Derives a URL value from other fields on the same record. No aggregation or record merging. Migration target: pipeline emits `dataset_url`; TS fallback chain deletes.

## Inputs and expected outputs

Each row corresponds to a parameterized test case in `tests/transformations/dataset-url-synthesis.test.ts`. Pipeline must produce identical outputs for every case.

### Group A — Branch firing order (first non-nullish wins)

| Input `source_data` | Output | Branch |
|---|---|---|
| `{dataset_url: "https://example.com/x"}` | `"https://example.com/x"` | 1 |
| `{dataset_url: "x", url: ["y"]}` | `"x"` | 1 (dataset_url short-circuits when set) |
| `{url: ["https://a.com", "https://b.com"]}` | `"https://a.com"` | 2 (first element of array) |
| `{url: ["only"]}` | `"only"` | 2 |
| `{url: "https://a.com"}` | `"https://a.com"` | 2 (string form) |
| `{hf_repo: "Mercor/ACE"}` | `"https://huggingface.co/datasets/Mercor/ACE"` | 3 (HF template) |
| `{hf_repo: "mercor/apex-agents"}` | `"https://huggingface.co/datasets/mercor/apex-agents"` | 3 (preserves case) |
| `{dataset_name: "x"}` | `undefined` | 4 (none of the above match) |
| `{}` | `undefined` | 4 |
| `null` | `undefined` | 4 (caller passes nullable; defensive) |
| `undefined` | `undefined` | 4 |

### Group B — Edge cases (`??` nullish semantics, NOT truthiness)

The original expression uses `??` (nullish coalescing), so `""`, `0`, and `false` do NOT trigger fallback — only `null` and `undefined` do. The hf_repo branch internally uses `sourceData.hf_repo ? template : undefined` (a truthiness check), so empty hf_repo IS falsy.

| Input `source_data` | Output | Why |
|---|---|---|
| `{dataset_url: "", url: ["fallback"]}` | `""` | `""` is not nullish, `??` short-circuits to it |
| `{url: [], hf_repo: "x/y"}` | `"https://huggingface.co/datasets/x/y"` | `url[0]` is `undefined`, `??` falls through to hf_repo |
| `{url: [""], hf_repo: "x/y"}` | `""` | `url[0]` is `""` (not nullish), `??` short-circuits to it |
| `{url: [null], hf_repo: "x/y"}` | `"https://huggingface.co/datasets/x/y"` | `url[0]` is `null` (nullish), `??` falls through to hf_repo |
| `{url: ["a"], hf_repo: "x/y"}` | `"a"` | url[0] truthy, short-circuits hf_repo |
| `{hf_repo: ""}` | `undefined` | inline `hf_repo ? template : undefined` uses truthiness — `""` falls through to `undefined` |
| `{hf_repo: "/leading-slash"}` | `"https://huggingface.co/datasets//leading-slash"` | no normalization — double slash preserved |

## Current TS implementation

The fallback chain exists in TWO sites, with **slightly different semantics** between them. A third related pattern (just the bare HF link) exists in a third site.

### Site A — eval-card list (`??` nullish, default `undefined`)

`components/eval-card.tsx:83-86`:

```ts
const datasetUrl =
  sourceData?.dataset_url ??
  (Array.isArray(sourceData?.url) ? sourceData?.url?.[0] : sourceData?.url) ??
  (sourceData?.hf_repo ? `https://huggingface.co/datasets/${sourceData.hf_repo}` : undefined)
```

This is the spec described above (Group A/B in the table). Empty string `""` is RETURNED (not nullish); only `null`/`undefined` fall through.

### Site B — benchmark detail page (`||` truthy, default `null`)

`components/benchmark-detail.tsx:5043-5047`:

```ts
const datasetHref =
  sourceData?.dataset_url ||
  (Array.isArray(sourceData?.url) ? sourceData?.url?.[0] : sourceData?.url) ||
  (sourceData?.hf_repo ? `https://huggingface.co/datasets/${sourceData.hf_repo}` : null) ||
  null
```

**Differs from Site A on edge cases:** uses `||` (truthiness) so empty strings DO fall through; uses `null` instead of `undefined` as the final default. For `{dataset_url: ""}`, Site A returns `""` and Site B returns the next non-empty branch's value (or `null`).

### Site C — direct HF link (no fallback chain)

`components/benchmark-detail.tsx:5416-5420`:

```ts
{sourceData?.hf_repo && (
  <InlineMeta label="HF Repo" value={
    <a href={`https://huggingface.co/datasets/${sourceData.hf_repo}`} ...>
      {sourceData.hf_repo}
    </a>
  } />
)}
```

This is just the hf_repo template applied directly when `hf_repo` is truthy. It does NOT consult `dataset_url` or `url` — so even if `dataset_url` is set, this site shows the HF link separately. Different intent: this is the "HF Repo" inline-meta link, not the primary dataset link.

### Summary table

| Site | Path | Semantics | Default fallback | Status for migration |
|---|---|---|---|---|
| A | `components/eval-card.tsx:83-86` | `??` nullish | `undefined` | spec target |
| B | `components/benchmark-detail.tsx:5043-5047` | `||` truthy | `null` | divergent from A on edge cases — pipeline-emitted `dataset_url` resolves both |
| C | `components/benchmark-detail.tsx:5416-5420` | n/a — bare hf_repo template | n/a | UI element with different intent; out of scope |

Pipeline-emitted `dataset_url` (resolved per the spec rule) serves both Sites A and B. Once it's populated, both sites just read it directly and the `??` vs `||` divergence becomes moot.

## Pipeline status — divergences

### Side-by-side comparison table

| Aspect | TS (this spec) | Pipeline today | Result for users |
|---|---|---|---|
| Where the resolution lives | `components/eval-card.tsx` (inline, runs at every render) | not implemented | TS resolves at request time |
| Pipeline-emitted `dataset_url` | consumed if present (branch 1) | **never populated** (verified 2026-04-28: 0/587 eval-details emit `dataset_url`) | branch 1 is currently dead — pipeline could populate to retire the fallback chain |
| Other source_data fields | `url` (array or string), `hf_repo` consumed | both emitted | TS does the resolution work each render |

### Concrete worked example with quantified scope

Audited 2026-04-28 against `.cache/hf-data/evals/` (587 production eval-detail files):

- Branch 1 (`dataset_url`): **0** files (the field is never emitted — branch is dead code today)
- Branch 2 (`url[0]`): **564** files (96.1%)
- Branch 3 (`url` as string): **0** files (always emitted as array)
- Branch 4 (`hf_repo` template): **22** files (3.7%)
- Branch 5 (`undefined`): **1** file (`cocoabench` has neither `url` nor `hf_repo`)

Examples:
- `appworld`: `{url: ["https://github.com/Exgentic/exgentic"]}` → `"https://github.com/Exgentic/exgentic"`
- `ace`: `{hf_repo: "Mercor/ACE"}` → `"https://huggingface.co/datasets/Mercor/ACE"`
- `cocoabench`: `{dataset_name: "CocoaBench v1.0", source_type: "other", additional_details: {…}}` → `undefined`

Verified by `scripts/verify-dataset-url.mjs`.

## Notes for pipeline implementer

- Reproduce the 4-step fallback exactly. Don't reorder; first match wins.
- Truthy semantics for branches 1, 4: empty string and `null`/`undefined` are falsy → fall through to next branch.
- `url[0]` is taken **without checking truthiness**: if `url` is an array of any length, the first element is returned even if it's `null`, `""`, `0`, etc. This means an array `[null]` produces `null`, NOT `undefined`. Don't "improve" this.
- `url` as a string short-circuits to that string — no further fallback. Even an empty string would short-circuit (passes `typeof === "string"`).
- The HF template is `https://huggingface.co/datasets/${hf_repo}` with NO encoding, validation, or slash normalization. Whatever `hf_repo` is, it gets appended verbatim.
- Suggested pipeline emission: add `dataset_url` field to every `source_data` object with the resolved URL. TS-side fallback chain becomes dead code (branch 1 always wins).

Verification: run `scripts/verify-dataset-url.mjs` against pipeline-emitted `dataset_url` once it ships. Goal: zero divergence vs TS-as-is across 587 production eval-details.

## Migration checklist

- [x] Spec written
- [x] Tests cover each rule branch + edge cases (`tests/transformations/dataset-url-synthesis.test.ts`)
- [ ] Filed with pipeline owner with the spec + tests + audit script as acceptance criterion
- [ ] Pipeline emits resolved `dataset_url` on every `source_data` matching this spec
- [ ] TS deleted; BOTH Site A (`components/eval-card.tsx:83-86`) AND Site B (`components/benchmark-detail.tsx:5043-5047`) read `sourceData?.dataset_url` directly. Site C (the bare `hf_repo` template in `components/benchmark-detail.tsx:5416-5420`) is a different UI element and stays.

## Future product decision (deferred)

The 1 `undefined` case (`cocoabench`) means the dataset link button will be missing/disabled for that eval. Whether pipeline should synthesize a fallback (e.g. from `additional_details.benchmark_reference_urls_json`) is a product question outside this refactor's scope.
