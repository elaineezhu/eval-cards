import type { CorpusAggregates } from "@/lib/backend-artifacts"

/**
 * Compact 4-tile rollup of the four interpretive signals (paper §4.2.1).
 * Designed for the home page: one headline per signal, one caption, one
 * sub-detail line. Drill-down lives on per-record pages.
 */
export function CorpusSignalsStrip({
  aggregates,
}: {
  aggregates: CorpusAggregates
}) {
  const repro = aggregates.reproducibility.overall
  const comp = aggregates.completeness.overall
  const prov = aggregates.provenance.overall
  const cmp = aggregates.comparability.overall

  // Invert the gap rate so the headline reads as "how many are documented",
  // not "how many have gaps". The inverse is more impactful and lower-is-worse,
  // which matches the user's intuition. The gap rate stays in the detail line.
  const reproDocumentedRate =
    repro.reproducibility_gap_rate == null
      ? null
      : Math.max(0, 1 - repro.reproducibility_gap_rate)
  const reproDocumentedRateText = formatPct(reproDocumentedRate)
  const reproGapRateText = formatPct(repro.reproducibility_gap_rate)
  const reproDetail = topMissingFields(repro.per_field_missingness, 2)

  const compMean = formatPct(comp.completeness_score_mean)
  const compMedian = formatPct(comp.completeness_score_median)

  const provMulti = formatPct(prov.multi_source_rate)
  const totalReports = prov.total_triples
  const tpShare = totalReports > 0 ? prov.source_type_distribution.third_party / totalReports : 0
  const fpShare = totalReports > 0 ? prov.source_type_distribution.first_party / totalReports : 0

  const cmpRate = formatPct(cmp.variant_divergence_rate)
  const crossPartyAvailable = cmp.cross_party_eligible_groups > 0

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SignalTile
        label="Reproducibility"
        value={reproDocumentedRateText}
        caption="of reported scores have a complete setup recorded — the rest cannot be independently re-run"
        detail={
          reproDetail
            ? `${reproGapRateText} have at least one undocumented field. Most often missing: ${reproDetail}`
            : `${reproGapRateText} have at least one undocumented field`
        }
      />

      <SignalTile
        label="Reporting completeness"
        value={compMean}
        caption={`mean across ${comp.total_benchmarks.toLocaleString()} benchmarks (median ${compMedian})`}
        detail="Source-provenance fields populate fully; preregistration fields are unmet"
      />

      <SignalTile
        label="Provenance"
        value={provMulti}
        caption="of (model, benchmark) groups have reports from more than one party"
        detail={`${formatPct(tpShare)} third-party, ${formatPct(fpShare)} first-party of ${totalReports.toLocaleString()} results`}
      />

      <SignalTile
        label="Comparability"
        value={cmpRate}
        caption={`of setup-eligible groups diverge across variants (${cmp.variant_divergent_groups.toLocaleString()} of ${cmp.variant_eligible_groups.toLocaleString()})`}
        detail={
          crossPartyAvailable
            ? `Cross-party divergence: ${formatPct(cmp.cross_party_divergence_rate)}`
            : "Cross-party divergence not yet computable — too few multi-org reports"
        }
      />
    </div>
  )
}

function SignalTile({
  label,
  value,
  caption,
  detail,
}: {
  label: string
  value: string
  caption: string
  detail: string
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </span>
      </div>
      <p className="text-sm leading-snug text-muted-foreground">{caption}.</p>
      <p className="mt-auto text-xs leading-snug text-muted-foreground/80">{detail}.</p>
    </div>
  )
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value === 0) return "0%"
  if (value > 0 && value < 0.01) return "<1%"
  return `${Math.round(value * 100)}%`
}

const FIELD_LABELS: Record<string, string> = {
  temperature: "temperature",
  max_tokens: "max tokens",
  top_p: "top-p",
  prompt_template: "prompt template",
  eval_plan: "eval plan",
  eval_limits: "eval limits",
}

/**
 * Returns a short comma-separated list of the top-N missing fields, ranked by
 * missing count. We rank by count rather than rate so cross-denominator fields
 * (agentic-only vs all-triples) don't get artificially boosted.
 */
function topMissingFields(
  perField: Record<
    string,
    { missing_count: number; missing_rate: number | null; denominator: string }
  >,
  n: number,
): string {
  const entries = Object.entries(perField)
    .filter(([, v]) => v.missing_count > 0)
    .sort((a, b) => b[1].missing_count - a[1].missing_count)
    .slice(0, n)

  if (entries.length === 0) return ""

  return entries
    .map(([key, v]) => `${FIELD_LABELS[key] ?? key.replace(/_/g, " ")} (${formatPct(v.missing_rate)})`)
    .join(", ")
}
