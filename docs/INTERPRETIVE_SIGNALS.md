# EvalCards interpretive signals — frontend implementation spec

**Status:** implemented reference. Backend producer lives in `eval_card_backend`; field shapes below are stable and covered by that backend's test suite.

**Companion docs:**
- Spec source of truth: *EvalCards Interpretive Signals v1.0* (Anka Reuel, Stanford). Section refs (§3, §4, …) below point at that doc.
- Backend implementation reference: `eval_card_backend`.

---

## 0. What this PR does at a glance

The backend now annotates evaluation records with four interpretive signals:

1. **Reproducibility gap** — *per row.* Was the evaluation documented well enough to be re-run? Surfaced as a missing-fields list (e.g. "missing `max_tokens`").
2. **Reporting completeness** — *per benchmark.* What fraction of EvalCards-required documentation fields are populated? Surfaced as a `[0, 1]` score with a missing-field breakdown.
3. **Provenance** — *per row.* Who reported this score (first-party / third-party / collaborative / unspecified), and is it the only source for this `(model, benchmark, metric)` group?
4. **Comparability** — *per `(model, benchmark, metric)` group.* Two flavors: **variant divergence** (same model, same benchmark, different setups → diverging scores) and **cross-party divergence** (different orgs reporting → diverging scores).

Plus a corpus-level rollup file (`corpus-aggregates.json`) for a stratified analytics page.

The frontend's job: surface these signals **in three places** — row-level badges, per-eval / per-model summary panels, and a corpus dashboard view.

---

## 1. Where the new data lives

All fields are new additions to existing artifacts. No artifact is removed or reshaped.

| Artifact | New fields |
|---|---|
| `evals/{id}.json` (`HFEvalDetail`) | Per-row `evalcards.annotations` block on every `metrics[].model_results[]` and `subtasks[…].metrics[].model_results[]`. Plus eval-root `evalcards.annotations.reporting_completeness`, `evalcards.annotations.benchmark_comparability`, and three top-level summaries: `reproducibility_summary`, `provenance_summary`, `comparability_summary`. |
| `models/{id}.json` (`HFModelDetail`) | Per-row `evalcards.annotations` block on every `hierarchy_by_category[*][*].metrics[].model_results[]`. Plus three top-level summaries scoped to that model. |
| `eval-list.json` / `eval-list-lite.json` (`HFEvalListEntry`) | Three summaries per entry. |
| `model-cards.json` / `model-cards-lite.json` (`HFModelCardEntry`) | Three summaries per entry. |
| `hierarchy.json` (`EvalHierarchy`) | Composite and benchmark entries carry the three summaries; the frontend adapter synthesizes family rows for listing from the backend's top-level `composites[]` plus flat `families[]` lookup. |
| **`corpus-aggregates.json` (NEW FILE)** | Stratified rollups for paper / dashboard use. |
| `manifest.json` | New entry in `summary_artifacts`: `corpus_aggregates: "corpus-aggregates.json"`. |

`signal_version` (currently `"1.0"`) is present on every annotation. Treat it as opaque; surface only in admin/debug.

---

## 2. TypeScript types to add

Add to `lib/backend-artifacts.ts` (preferred — these are pipeline contract types):

```ts
// Spec §3
export interface ReproducibilityGap {
  has_reproducibility_gap: boolean
  missing_fields: string[]              // e.g. ["max_tokens"]
  required_field_count: number          // 2 base + 2 if agentic on current runtime
  populated_field_count: number
  signal_version: string
}

// Spec §5
export type ProvenanceSourceType =
  | "first_party"
  | "third_party"
  | "collaborative"
  | "unspecified"

export interface Provenance {
  source_type: ProvenanceSourceType
  is_multi_source: boolean
  first_party_only: boolean             // see §6.1 below for caveat
  distinct_reporting_organizations: number
  signal_version: string
}

// Spec §6.1
export interface VariantDivergence {
  has_variant_divergence: boolean
  group_id: string                      // "{model_route_id}__{metric_summary_id}"
  divergence_magnitude: number
  threshold_used: number
  threshold_basis:
    | "proportion_or_continuous_normalized"
    | "percent"
    | "range_5pct"
    | "fallback_default"
  differing_setup_fields: Array<{ field: string; values: unknown[] }>
  scores_in_group: number[]
  this_triple_score: number | null      // this row's score within the group
  triple_count_in_group: number
  score_scale_anomaly: boolean
  group_variant_breakdown: Array<{ variant_key: string; row_count: number }>
  signal_version: string
}

// Spec §6.2
export interface CrossPartyDivergence {
  has_cross_party_divergence: boolean
  group_id: string
  divergence_magnitude: number
  threshold_used: number
  threshold_basis: VariantDivergence["threshold_basis"]
  scores_by_organization: Record<string, number>   // display org name → score
  differing_setup_fields: Array<{ field: string; values: unknown[] }>
  organization_count: number
  group_variant_breakdown: Array<{ variant_key: string; row_count: number }>
  signal_version: string
}

// Per-row annotation block (carried on every model_result row)
export interface RowAnnotations {
  reproducibility_gap: ReproducibilityGap | null
  provenance: Provenance | null
  variant_divergence: VariantDivergence | null
  cross_party_divergence: CrossPartyDivergence | null
}

// Spec §4
export interface ReportingCompleteness {
  completeness_score: number            // [0, 1]
  total_fields_evaluated: number
  missing_required_fields: string[]     // dotted paths
  partial_fields: Array<{
    field_path: string
    score: number                       // (0, 1) — strictly between
    populated_subitems: number
    total_subitems: number
  }>
  field_scores: Array<{
    field_path: string
    coverage_type: "full" | "partial" | "reserved"
    score: number                       // [0, 1]
  }>
  signal_version: string
}

export interface BenchmarkComparability {
  variant_divergence_groups: Array<{
    group_id: string
    model_route_id: string
    divergence_magnitude: number
    threshold_used: number
    threshold_basis: VariantDivergence["threshold_basis"]
    differing_setup_fields: VariantDivergence["differing_setup_fields"]
  }>
  cross_party_divergence_groups: Array<{
    group_id: string
    model_route_id: string
    divergence_magnitude: number
    threshold_used: number
    threshold_basis: VariantDivergence["threshold_basis"]
    scores_by_organization: Record<string, number>
    differing_setup_fields: VariantDivergence["differing_setup_fields"]
  }>
}

// Eval-root or model-root annotation block
export interface EvalcardsAnnotations {
  reporting_completeness?: ReportingCompleteness
  benchmark_comparability?: BenchmarkComparability
}

// Top-level summary blocks (present on eval-list / model-cards / eval / model / hierarchy nodes)
export interface ReproducibilitySummary {
  results_total: number
  has_reproducibility_gap_count: number
  populated_ratio_avg: number | null    // null when results_total == 0
}

export interface ProvenanceSummary {
  total_results: number
  total_groups: number
  multi_source_groups: number
  first_party_only_groups: number
  source_type_distribution: Record<ProvenanceSourceType, number>
}

export interface ComparabilitySummary {
  total_groups: number
  groups_with_variant_check: number     // eligible groups (>=2 rows, differing setups, >=2 scored)
  groups_with_cross_party_check: number // eligible groups (>=2 named orgs)
  variant_divergent_count: number
  cross_party_divergent_count: number
}

export interface SignalSummaries {
  reproducibility_summary?: ReproducibilitySummary
  provenance_summary?: ProvenanceSummary
  comparability_summary?: ComparabilitySummary
}

// corpus-aggregates.json
export interface CorpusAggregates {
  generated_at: string
  signal_version: string
  stratification_dimensions: ["category"]
  reproducibility: Stratified<ReproducibilityCorpusBlock>
  completeness:   Stratified<CompletenessCorpusBlock>
  provenance:     Stratified<ProvenanceCorpusBlock>
  comparability:  Stratified<ComparabilityCorpusBlock>
}

export interface Stratified<T> {
  overall: T
  by_category: Record<string, T>        // categories: agentic | general | knowledge | reasoning | safety | other
}

export interface ReproducibilityCorpusBlock {
  total_triples: number
  triples_with_reproducibility_gap: number
  reproducibility_gap_rate: number | null
  agentic_triples: number
  per_field_missingness: Record<string, {
    missing_count: number
    missing_rate: number | null
    denominator: "all_triples" | "agentic_only"
    denominator_count: number
  }>
}

export interface CompletenessCorpusBlock {
  total_benchmarks: number
  completeness_score_mean: number | null
  completeness_score_median: number | null
  per_field_population: Record<string, {
    mean_score: number
    populated_rate: number
    fully_populated_rate: number
    benchmark_count: number
  }>
}

export interface ProvenanceCorpusBlock {
  total_triples: number
  total_groups: number
  multi_source_groups: number
  multi_source_rate: number | null
  first_party_only_groups: number
  first_party_only_rate: number | null
  source_type_distribution: Record<ProvenanceSourceType, number>
}

export interface ComparabilityCorpusBlock {
  total_groups: number
  variant_eligible_groups: number
  variant_divergent_groups: number
  variant_divergence_rate: number | null
  cross_party_eligible_groups: number
  cross_party_divergent_groups: number
  cross_party_divergence_rate: number | null   // commonly null on current corpus
}
```

Then in `lib/hf-data.ts`:

- Extend `HFEvalModelResult` (line ~522) with `evalcards?: { annotations?: RowAnnotations }`.
- Extend `HFEvalDetail` (line ~556) with `evalcards?: { annotations?: EvalcardsAnnotations }` plus the three summary fields from `SignalSummaries`.
- Extend `HFEvalListEntry` (line ~475) with `SignalSummaries` fields.
- Extend `HFModelCardEntry` (line ~439) with `SignalSummaries` fields.
- Extend `HFModelDetail` (line ~571) with `SignalSummaries` fields.
- Extend `HFModelHierarchyMetric` (line ~616) — `model_results` already typed as `HFEvalModelResult`, so the per-row annotations propagate automatically.

In `EvalHierarchy` types (`lib/backend-artifacts.ts` line ~54), add `SignalSummaries` to both `HierarchyFamily` and `HierarchyBenchmark`.

All fields are **optional** at the type level — older cached snapshots won't have them, and the frontend should render gracefully when they're absent.

---

## 3. Data plumbing

### 3.1 New fetcher + API route for corpus aggregates

In `lib/hf-data.ts`, add after the existing fetchers (~line 866):

```ts
export async function fetchCorpusAggregates(): Promise<CorpusAggregates | null> {
  return fetchHFJsonSafe<CorpusAggregates>("corpus-aggregates.json")
}
```

Add to `scripts/cache-hf-data.mjs` `CACHE_ROOT_FILES` array: `"corpus-aggregates.json"`. (Mark it optional in `OPTIONAL_CACHE_ROOT_FILES` if shipping while the HF dataset upload is still rolling — once the backend pipeline next runs against the dataset, the file will appear.)

Create `app/api/corpus-aggregates/route.ts`:

```ts
import { NextResponse } from "next/server"
import { fetchCorpusAggregates } from "@/lib/hf-data"

export async function GET() {
  const aggregates = await fetchCorpusAggregates()
  if (!aggregates) {
    return NextResponse.json({ error: "Corpus aggregates not available" }, { status: 404 })
  }
  return NextResponse.json(aggregates)
}
```

### 3.2 Rest of plumbing is automatic

Existing fetchers (`fetchEvalDetail`, `fetchModelDetail`, `fetchEvalList`, `fetchModelCardsList`, `fetchEvalHierarchy`) just pull the raw JSON, so the new fields propagate without code changes once the types above are widened.

---

## 4. UX components to build

Build a small set of reusable signal components in `components/signals/`. Each takes one of the typed shapes above and renders a badge / panel. This keeps signal rendering consistent across `eval-detail.tsx`, `benchmark-detail.tsx`, `model-compare-dialog.tsx`, and the new corpus dashboard.

```
components/signals/
├── reproducibility-badge.tsx
├── provenance-badge.tsx          // already partially exists in benchmark-detail.tsx — see §4.2
├── variant-divergence-badge.tsx
├── cross-party-divergence-badge.tsx
├── reproducibility-panel.tsx      // detail view — full missing-fields list
├── completeness-panel.tsx         // detail view — score bar + missing-field list
├── comparability-panel.tsx        // detail view — divergent groups list
├── signals-row-badges.tsx         // composite: renders all four row-level badges with proper spacing
└── signal-tooltip.tsx             // shared tooltip primitive
```

All badges should follow the existing tone conventions used by `getRelationshipBadgeTone` ([components/benchmark-detail.tsx:289](../components/benchmark-detail.tsx#L289)) and the `Badge` primitive in [components/ui/badge.tsx](../components/ui/badge.tsx).

### 4.1 Row-level badges — placement

Insert `<SignalsRowBadges annotations={modelResult.evalcards?.annotations} />` next to the score cell in:

- **Eval detail leaderboard table** — [components/eval-detail.tsx:869-871](../components/eval-detail.tsx#L869-L871) (the `<TableCell className="text-right">` containing the score). Render badges below the score on a new line for desktop, hidden on mobile.
- **Benchmark detail rows** — `components/benchmark-detail.tsx` renders score rows in several places (search for `formatRawScoreValue`); insert the same component.
- **Model compare dialog** — [components/model-compare-dialog.tsx](../components/model-compare-dialog.tsx) score columns.

**Display rules — only badge for actionable states.** Silence is meaningful here.

| Signal | Show badge when | Hide when |
|---|---|---|
| Reproducibility | `has_reproducibility_gap === true` | gap=false, or annotation absent |
| Provenance | `source_type` ∈ {`first_party`, `third_party`, `collaborative`} | `source_type === "unspecified"` |
| Variant divergence | `variant_divergence !== null && has_variant_divergence === true` | null (not applicable) or false (checked, fine) |
| Cross-party divergence | `cross_party_divergence !== null && has_cross_party_divergence === true` | null (almost always on current corpus) or false |

`has_*: false` means "we checked and it's fine" — silent success. `null` means "not applicable / not enough data" — also silent. **Only divergent / gap-positive states warrant pixels.**

**Dedup rule.** `variant_divergence` and `cross_party_divergence` are duplicated onto every row in the same group. If you render three rows from the same `group_id`, render the divergence badge on each row but the *expanded panel* (§4.4) only once at the group header.

### 4.2 Provenance badge — reuse what's there

[components/benchmark-detail.tsx:262-302](../components/benchmark-detail.tsx#L262-L302) already has `getRelationshipShortLabel` and `getRelationshipBadgeTone`. Extract these into `components/signals/provenance-badge.tsx` and import back into `benchmark-detail.tsx`. The new badge should **also** consume the new `Provenance` annotation when present (it carries `is_multi_source` and `first_party_only`, which the current implementation derives row-by-row from `source_metadata` alone).

When `provenance.first_party_only === true`, show a small ⚠ subtle indicator on the first-party badge ("first-party only — no independent replication"). This is the headline use of the signal for policy-mode readers.

### 4.3 Reproducibility badge — content rules

Tooltip content depends on audience mode (`useAudienceMode()` from [components/audience-mode-provider.tsx:40](../components/audience-mode-provider.tsx#L40)):

- Research mode: "Setup not fully documented. Missing: `max_tokens`, `eval_plan`."
- Policy mode: "This score's setup isn't fully documented, so it can't be re-run as-is."

Always include the count "{populated_field_count} of {required_field_count} setup fields recorded." Don't hardcode "4 fields" — the active runtime checks 2 base fields (`temperature`, `max_tokens`) plus 2 agentic fields (`eval_plan`, `eval_limits`) when the benchmark is agentic. Read counts off the annotation.

### 4.4 Detail panels — placement

#### Reproducibility panel
The existing "Evaluation Provenance" panel in [components/eval-detail.tsx:952-998](../components/eval-detail.tsx#L952-L998) (rendered when a row is expanded) is the right place for the **per-row** reproducibility breakdown. Add a new `DetailPanel` adjacent to it:

```tsx
{rowAnnotations?.reproducibility_gap && (
  <DetailPanel
    title={isResearchView ? "Reproducibility" : "Re-runnability"}
    subtitle={
      isResearchView
        ? "Whether the setup is documented well enough for someone else to re-run."
        : "Whether someone could re-run this evaluation with the information available."
    }
  >
    <MetaRow
      label="Setup fields recorded"
      value={`${rowAnnotations.reproducibility_gap.populated_field_count} of ${rowAnnotations.reproducibility_gap.required_field_count}`}
    />
    {rowAnnotations.reproducibility_gap.missing_fields.length > 0 && (
      <MetaRow
        label="Missing"
        value={rowAnnotations.reproducibility_gap.missing_fields.join(", ")}
      />
    )}
  </DetailPanel>
)}
```

#### Completeness panel
Render at the **eval-detail header level** (above the leaderboard, below the metric specification card). New `<CompletenessPanel completeness={detail.evalcards?.annotations?.reporting_completeness} />`. UI: progress bar showing `completeness_score`, label "{N} of {M} fields populated" where N = sum of `field_scores[].score` rounded, M = `total_fields_evaluated`. Below: collapsible accordions:

- **Missing required fields** (count badge) — list of `missing_required_fields` with friendly labels (see §6.4 for label mapping).
- **Partially populated** (count badge) — `partial_fields` rendered as "{field}: {populated_subitems}/{total_subitems}".

In policy mode, don't show the dotted-path field names — show friendly labels only. In research mode, show both.

#### Comparability panel
Also at eval-detail header level. Sourced from `detail.evalcards?.annotations?.benchmark_comparability`. Render as two collapsibles — "Variant divergence ({count})" and "Cross-party divergence ({count})". Each item should link to the relevant model row (use `model_route_id` from each group entry as anchor — add `id={"row-" + model_route_id}` on the leaderboard row).

When both arrays are empty, hide the panel entirely. When `comparability_summary.groups_with_cross_party_check === 0` (the common state), surface a small note: "No third-party reports available for cross-party comparison."

### 4.5 Per-eval header chips
On the eval-detail page header (next to existing "Measures" / "Source dataset" chips around [components/eval-detail.tsx:486-525](../components/eval-detail.tsx#L486-L525)), add a fourth chip when `evalcards.annotations.reporting_completeness` is present:

> **Documentation**
> {round(completeness_score * 100)}%

Tooltip: "{N} of {M} EvalCards documentation fields populated for this benchmark."

### 4.6 Per-model card chips
On `components/eval-card.tsx` and the model card pages, add three chips driven by the model-level summaries. Replace the hand-written hint at [components/eval-card.tsx:250](../components/eval-card.tsx#L250) ("Some results lack generation settings; compare scores with care.") with a data-driven version:

> {has_reproducibility_gap_count} of {results_total} reported scores aren't fully documented.

Show only when `has_reproducibility_gap_count > 0`. The hand-written hint was a placeholder for exactly this signal — wire it up.

---

## 5. New page: corpus dashboard

Add `app/corpus/page.tsx` (linked from main navigation [components/navigation.tsx](../components/navigation.tsx)). Server component that calls `fetchCorpusAggregates()` and renders four sections:

### 5.1 Reproducibility section
- Headline number: `reproducibility_gap_rate` rendered as percentage. Sub-label: "{triples_with_reproducibility_gap} of {total_triples} reported scores."
- Per-field horizontal bar chart from `per_field_missingness`. **Bar denominator depends on `denominator` field**: agentic-only fields use `agentic_triples`, others use `total_triples`. Label each bar with the denominator type so users understand.
- Toggle: `overall` ↔ `by_category` (rendered as a small-multiple grid, one panel per category).

### 5.2 Completeness section
- Headline: `completeness_score_mean` (and median) across `total_benchmarks`.
- Histogram of per-benchmark scores (pull individual benchmark scores from `eval-list.json` `reporting_completeness.completeness_score`, since corpus-aggregates only carries mean/median).
- Per-field bar chart from `per_field_population` — three bars per field: `mean_score`, `populated_rate`, `fully_populated_rate`. (See §6.7 for which one to highlight per coverage type.)

### 5.3 Provenance section
- Stacked bar of `source_type_distribution` (across all triples).
- Two ratios: `multi_source_rate`, `first_party_only_rate`. Label both: "% of (model, benchmark, metric) groups."

### 5.4 Comparability section
- Two side-by-side panels: Variant divergence (eligible-aware rate) and Cross-party divergence (often null).
- **When `cross_party_divergence_rate === null`:** show a "Not enough multi-org coverage to compute" empty state, not "0%". Same for `variant_divergence_rate === null`. This is critical — see §6.5.

All sections support a category toggle (research mode shows category breakdowns by default; policy mode shows overall by default).

---

## 6. Caveats and edge cases (read these before implementing)

### 6.1 `first_party_only` semantics
A row can be `first_party_only: true` even when `is_multi_source: false`. The spec literal: a group with one *named* org reporting first-party gets the badge. **Don't read it as "exclusive coverage"** — read it as "no independent replication." The label suggestion is "First-party only" rather than "Sole source."

If `distinct_reporting_organizations === 0` (all rows have null org), `first_party_only` is `false` even when `source_type === "first_party"`. Render the row's source as "First-party (org unspecified)" in research mode; suppress the first-party-only badge.

### 6.2 Active reproducibility field set is reduced
The spec describes four base fields (`temperature`, `top_p`, `max_tokens`, `prompt_template`); the active backend currently checks **only `temperature` and `max_tokens`** plus `eval_plan` / `eval_limits` for agentic benchmarks. **Don't hardcode "4 fields" anywhere.** Always read `required_field_count` off the annotation. This is a deliberate spec-author choice and may revert; the field count is the only stable interface.

### 6.3 Missing-field path strings
`missing_fields` for reproducibility uses bare names (e.g. `"max_tokens"`). `missing_required_fields` for completeness uses dotted paths (e.g. `"autobenchmarkcard.methodology.baseline_results"`). Different conventions, intentional. Build a small label map for completeness paths — paths come from `eval_card_backend/src/eval_card_backend/registry/completeness_fields.json`. Suggested label rules:

- Drop the `autobenchmarkcard.` / `eee_eval.` / `evalcards.` prefix.
- Replace dots with " / ", underscore with space, title-case.
- Example: `autobenchmarkcard.methodology.baseline_results` → "Methodology / Baseline results".

### 6.4 `differing_setup_fields[].values` may contain null and mixed types
Per spec §6.1.4, `null` is a *distinct* value from any explicit setting (comparing "explicit 2048" to "unspecified" is meaningful). Render `null` as "(unspecified)" rather than the string "null". Numeric, string, boolean, and object values can all appear in the same array; render with `JSON.stringify` for objects, plain text otherwise.

### 6.5 `null` rates in comparability are *not* zero
Eligibility-aware denominators mean `variant_divergence_rate` and `cross_party_divergence_rate` are `null` when no groups were eligible. **Render as "N/A — not enough data" or an empty-state card, never as "0%".** On the current corpus, `cross_party_divergence_rate` will commonly be null (third-party reports are sparse). Treat this as a normal state, not a data-loading error.

### 6.6 Score-scale anomaly flag
`variant_divergence.score_scale_anomaly === true` indicates the metric was declared `proportion` but scores fell outside [0, 1] — usually a metric-normalization bug upstream. Surface as a small "data quality warning" annotation alongside the divergence number; the divergence is still computed but the threshold may not be apples-to-apples.

### 6.7 `mean_score` vs `populated_rate` for completeness
Per-field aggregates expose three numbers. Pick which to display based on `coverage_type`:

- **`full` and `reserved` fields** — `mean_score` and `populated_rate` are equal. Show one number labeled "% of benchmarks populating this field."
- **`partial` fields** — they diverge. `populated_rate` = % of benchmarks with *any* sub-item; `mean_score` = average sub-item population fraction. Show both: "{populated_rate}% have any data, {mean_score}% on average across sub-items."

### 6.8 No `computed_at` on per-record annotations
Only `signal_version` is on each annotation. For "last computed" UI text, use `manifest.json → generated_at` from the existing `BackendManifest`.

### 6.9 Stratification categories
`by_category` keys are: `agentic`, `general`, `knowledge`, `reasoning`, `safety`, `other`. Same set as the existing `category` field on evals — reuse whatever color scheme is currently keyed off `inferCategoryFromBenchmark` ([lib/benchmark-schema.ts](../lib/benchmark-schema.ts)).

### 6.10 Annotation block can be `null` or absent
`evalcards.annotations.{reproducibility_gap,provenance,variant_divergence,cross_party_divergence}` can each be `null` independently, and the entire `evalcards` block may be absent on older cached snapshots. Use optional chaining everywhere; never assume presence. The `RowAnnotations` type intentionally types each subfield as `T | null` (not `T | undefined`) because the backend writes explicit `null`.

---

## 7. Suggested implementation order

1. **Types + plumbing** (1–2 hours): types in `backend-artifacts.ts` + `hf-data.ts`, the `fetchCorpusAggregates` fetcher, the API route, and adding `corpus-aggregates.json` to the cache script. No UI yet.
2. **Row-level badges** (½ day): build `signals/` directory with the four badge components, the dedup-aware `signals-row-badges.tsx`, and wire into eval-detail and benchmark-detail. This is the most visible win.
3. **Per-eval completeness panel + comparability panel** (½ day): single benchmark, easy to design around. New `CompletenessPanel` is the headline new UX in this set.
4. **Per-row reproducibility detail panel** (1–2 hours): drops into the existing expanded row layout.
5. **Per-eval / per-model header chips + replace the hand-written gap hint** (1–2 hours): wires the summary fields into existing card surfaces.
6. **Corpus dashboard page** (1–2 days): new route, new components, biggest scope. Defer until 1–5 are live and reviewed.

Each step is independently shippable. Steps 1–5 can land before the corpus dashboard is designed.

---

## 8. Out of scope (don't do these yet)

- **Filter / sort the eval list by signal state** ("show only benchmarks with completeness > 0.5"). Wait for the dashboard view to land first; users will tell us which filters they actually want.
- **Side-by-side score comparison with divergence overlay.** The data supports it (`scores_in_group`, `scores_by_organization`) but the design space is large. Hold off until we see the row-level badges in use.
- **Recompute / verification UI for missing reproducibility fields.** Backend-side; out of scope here.
- **Per-instance sample-level badges.** Signals operate at row / benchmark level; sample-level instance data is unaffected.

---

## 9. Reference: minimal real-shape examples

Per-row `evalcards.annotations` with all four signals populated:

```jsonc
{
  "reproducibility_gap": {
    "has_reproducibility_gap": true,
    "missing_fields": ["max_tokens"],
    "required_field_count": 2,
    "populated_field_count": 1,
    "signal_version": "1.0"
  },
  "provenance": {
    "source_type": "first_party",
    "is_multi_source": false,
    "first_party_only": true,
    "distinct_reporting_organizations": 1,
    "signal_version": "1.0"
  },
  "variant_divergence": null,
  "cross_party_divergence": null
}
```

Per-eval `evalcards.annotations` with completeness + comparability:

```jsonc
{
  "reporting_completeness": {
    "completeness_score": 0.62,
    "total_fields_evaluated": 28,
    "missing_required_fields": [
      "autobenchmarkcard.methodology.baseline_results",
      "autobenchmarkcard.methodology.validation",
      "evalcards.preregistration_url"
    ],
    "partial_fields": [
      { "field_path": "autobenchmarkcard.data", "score": 0.5, "populated_subitems": 2, "total_subitems": 4 }
    ],
    "field_scores": [/* 28 entries */],
    "signal_version": "1.0"
  },
  "benchmark_comparability": {
    "variant_divergence_groups": [
      {
        "group_id": "openai__gpt-5__hfopenllm_v2_bbh_accuracy",
        "model_route_id": "openai__gpt-5",
        "divergence_magnitude": 0.12,
        "threshold_used": 0.05,
        "threshold_basis": "proportion_or_continuous_normalized",
        "differing_setup_fields": [
          { "field": "max_tokens", "values": [2048, 4096, 8192] }
        ]
      }
    ],
    "cross_party_divergence_groups": []
  }
}
```

Top-level `provenance_summary` example:

```jsonc
{
  "total_results": 142,
  "total_groups": 47,
  "multi_source_groups": 3,
  "first_party_only_groups": 30,
  "source_type_distribution": {
    "first_party": 120,
    "third_party": 18,
    "collaborative": 0,
    "unspecified": 4
  }
}
```

`corpus-aggregates.json` structure (top of file):

```jsonc
{
  "generated_at": "2026-04-27T...",
  "signal_version": "1.0",
  "stratification_dimensions": ["category"],
  "reproducibility": { "overall": {/* ReproducibilityCorpusBlock */}, "by_category": { "agentic": {...}, "general": {...}, ... } },
  "completeness":   { "overall": {/* CompletenessCorpusBlock */},   "by_category": {...} },
  "provenance":     { "overall": {/* ProvenanceCorpusBlock */},     "by_category": {...} },
  "comparability":  { "overall": {/* ComparabilityCorpusBlock */},  "by_category": {...} }
}
```

---

## 10. Audience-mode wording cheatsheet

| Element | Research mode | Policy mode |
|---|---|---|
| Reproducibility gap badge | "Reproducibility gap" | "Setup not documented" |
| Reproducibility tooltip | "Setup not fully documented. Missing: {fields}." | "This score's setup isn't documented, so it can't be re-run as-is." |
| Reproducibility panel title | "Reproducibility" | "Re-runnability" |
| Completeness chip label | "Documentation" | "Documentation" |
| Completeness panel title | "Reporting completeness" | "How well is this benchmark documented?" |
| Provenance: first-party | "1st party" | "Reported by model developer" |
| Provenance: first-party only | "1st party only — no replication" | "Only the model developer reported this score" |
| Provenance: third-party | "3rd party" | "Independently reported" |
| Provenance: collaborative | "Collaborative" | "Joint report" |
| Variant divergence badge | "Variant divergence" | "Score depends on setup" |
| Variant divergence tooltip | "Scores diverge by {magnitude} across different setups: {fields}." | "Different runs of this evaluation produced different scores — the setup matters." |
| Cross-party divergence badge | "Cross-party divergence" | "Sources disagree" |
| Cross-party divergence tooltip | "Reports diverge by {magnitude} across organizations." | "Different organizations reported different scores for this same model on this same benchmark." |

Adjust tone but keep the underlying numbers identical across modes — the data is the same, only the framing changes.

---

*Last updated 2026-05-04. Maintainer: backend (`eval_card_backend`), frontend (`general-eval-card`). Questions on UX → discuss with @anka-evals + frontend team.*
