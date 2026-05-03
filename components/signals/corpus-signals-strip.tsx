import type { CorpusAggregates } from "@/lib/backend-artifacts"

type SignalId =
  | "reproducibility"
  | "completeness"
  | "provenance"
  | "comparability"

const SIGNAL_GLYPHS: Record<SignalId, string> = {
  reproducibility: "R",
  completeness: "C",
  provenance: "P",
  comparability: "X",
}

/**
 * Corpus-level rollup of the four interpretive signals (paper §4.2.1).
 * Renders as a 4-up grid of "signal tiles" matching the EvalEval design system:
 * monochrome typography, mono numerals, glyphs that double as colour anchors.
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

  // Invert the gap rate to read as "documented", which matches reader intuition.
  const reproDocumented =
    repro.reproducibility_gap_rate == null
      ? null
      : Math.max(0, 1 - repro.reproducibility_gap_rate)
  const reproDetail = topMissingFields(repro.per_field_missingness, 2)

  const totalReports = prov.total_triples
  const tpShare = totalReports > 0 ? prov.source_type_distribution.third_party / totalReports : 0
  const fpShare = totalReports > 0 ? prov.source_type_distribution.first_party / totalReports : 0

  const multiSourceRate = rate(prov.multi_source_triples, prov.total_triples)
  const cmpRate = rate(cmp.variant_divergent_count, cmp.groups_with_variant_check)
  const crossPartyRate = rate(
    cmp.cross_party_divergent_count,
    cmp.groups_with_cross_party_check
  )
  const crossPartyAvailable = cmp.groups_with_cross_party_check > 0

  return (
    <div className="signals-grid">
      <SignalTile
        id="reproducibility"
        statValue={pctNum(reproDocumented)}
        statUnit="%"
        headline="of reported scores have a complete setup recorded — the rest cannot be independently re-run."
        detail={
          reproDetail
            ? `${formatPct(repro.reproducibility_gap_rate)} have at least one undocumented field. Most often missing: ${reproDetail}.`
            : `${formatPct(repro.reproducibility_gap_rate)} have at least one undocumented field.`
        }
        asks="Can someone else run this evaluation and get the same number?"
      />
      <SignalTile
        id="completeness"
        statValue={pctNum(comp.completeness_avg)}
        statUnit="%"
        headline={`mean across ${comp.total_triples.toLocaleString()} reported score triples.`}
        detail={`Observed range: ${formatPct(comp.completeness_min)} to ${formatPct(comp.completeness_max)}.`}
        asks="Is the benchmark itself documented well enough to interpret a score on it?"
      />
      <SignalTile
        id="provenance"
        statValue={pctNum(multiSourceRate)}
        statUnit="%"
        headline="of reported score triples have reports from more than one party."
        detail={`${formatPct(tpShare)} third-party, ${formatPct(fpShare)} first-party of ${totalReports.toLocaleString()} triples.`}
        asks="Who reported this score, and have others reproduced it?"
      />
      <SignalTile
        id="comparability"
        statValue={pctNum(cmpRate)}
        statUnit="%"
        headline={`of setup-eligible groups diverge across variants (${cmp.variant_divergent_count.toLocaleString()} of ${cmp.groups_with_variant_check.toLocaleString()}).`}
        detail={
          crossPartyAvailable
            ? `Cross-party divergence: ${formatPct(crossPartyRate)}.`
            : "Cross-party divergence not yet computable: too few multi-org reports."
        }
        asks="Are scores on the same benchmark actually measuring the same thing?"
      />
    </div>
  )
}

function SignalTile({
  id,
  statValue,
  statUnit,
  headline,
  detail,
  asks,
}: {
  id: SignalId
  statValue: string
  statUnit: string
  headline: string
  detail: string
  asks: string
}) {
  const name =
    id === "reproducibility"
      ? "Reproducibility"
      : id === "completeness"
      ? "Completeness"
      : id === "provenance"
      ? "Provenance"
      : "Comparability"

  return (
    <div className="sig-tile">
      <div className="sig-tile-head">
        <span
          className={`sig-glyph sig-${id}`}
          style={{ width: 32, height: 32, fontSize: "0.825rem" }}
        >
          <span>{SIGNAL_GLYPHS[id]}</span>
        </span>
        <span className="sig-tile-name">{name}</span>
      </div>

      <div className="sig-tile-stat">
        <span className="sig-tile-num">{statValue}</span>
        <span className="sig-tile-unit">{statUnit}</span>
      </div>

      <p className="sig-tile-headline">{headline}</p>
      <p className="sig-tile-detail">{detail}</p>

      <div className="sig-tile-asks">
        <span className="kicker">Asks</span>
        <span className="sig-tile-asks-text">{asks}</span>
      </div>
    </div>
  )
}

function pctNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value === 0) return "0"
  if (value > 0 && value < 0.01) return "<1"
  return `${Math.round(value * 100)}`
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value === 0) return "0%"
  if (value > 0 && value < 0.01) return "<1%"
  return `${Math.round(value * 100)}%`
}

function rate(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (numerator == null || denominator == null || denominator <= 0) return null
  return numerator / denominator
}

const FIELD_LABELS: Record<string, string> = {
  temperature: "temperature",
  max_tokens: "max tokens",
  top_p: "top-p",
  prompt_template: "prompt template",
  eval_plan: "eval plan",
  eval_limits: "eval limits",
}

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
