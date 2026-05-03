"use client"

import type { BenchmarkEvalSummary } from "@/lib/eval-processing"
import type { ModelResultForBenchmark } from "@/lib/eval-processing"

type SignalId = "reproducibility" | "completeness" | "provenance" | "comparability"

const SIGNAL_GLYPHS: Record<SignalId, string> = {
  reproducibility: "R",
  completeness: "C",
  provenance: "P",
  comparability: "X",
}

const SIGNAL_NAMES: Record<SignalId, string> = {
  reproducibility: "Reproducibility",
  completeness: "Completeness",
  provenance: "Provenance",
  comparability: "Comparability",
}

const SIGNAL_ASKS: Record<SignalId, string> = {
  reproducibility: "Could someone re-run this benchmark with what's documented?",
  completeness: "How much of the benchmark card is filled in?",
  provenance: "Who reported these scores and how many parties have replicated?",
  comparability: "Where multiple reports exist, do they agree?",
}

/**
 * Reproducibility — paper §4.2.1, signal spec §3.
 *
 * The spec lists `temperature, top_p, max_tokens, prompt_template` as the
 * base required fields. In the live EEE corpus only `temperature` and
 * `max_tokens` are reliably populated, so we restrict the check to those
 * two for now (per maintainer guidance). Agentic benchmarks additionally
 * require `eval_plan` and `eval_limits` — the spec's classification rule
 * is followed verbatim.
 */
const BASE_REQUIRED_FIELDS = ["temperature", "max_tokens"] as const
const AGENTIC_REQUIRED_FIELDS = ["eval_plan", "eval_limits"] as const

const FIELD_LABELS: Record<string, string> = {
  temperature: "temperature",
  top_p: "top-p",
  max_tokens: "max tokens",
  prompt_template: "prompt template",
  eval_plan: "eval plan",
  eval_limits: "eval limits",
}

/** Setup fields compared to detect variant divergence (spec §6.1.2). */
const COMPARABILITY_COMPARE_FIELDS = [
  "temperature",
  "top_p",
  "top_k",
  "max_tokens",
  "prompt_template",
  "reasoning",
] as const

/**
 * Benchmark-level rollup of the four interpretive signals (paper §4.2.1,
 * spec v1.0 §§3-6). Mirrors `CorpusSignalsStrip` but operates over a
 * single `BenchmarkEvalSummary`.
 *
 * Each tile reports one headline statistic that reads "higher is better,
 * more documentation = better", so the four are visually comparable.
 */
export function BenchmarkSignalsStrip({ summary }: { summary: BenchmarkEvalSummary }) {
  const repro = deriveReproducibility(summary)
  const comp = deriveCompleteness(summary)
  const prov = deriveProvenance(summary)
  const cmp = deriveComparability(summary)

  return (
    <div
      className="grid gap-x-6 gap-y-3"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        border: "1px solid var(--border-soft)",
        background: "var(--bg)",
        padding: "12px 16px",
      }}
    >
      <SignalRow id="reproducibility" {...repro} />
      <SignalRow id="completeness" {...comp} />
      <SignalRow id="provenance" {...prov} />
      <SignalRow id="comparability" {...cmp} />
    </div>
  )
}

interface DerivedSignal {
  statValue: string
  statUnit: string
  headline: string
  detail: string
}

// ──────────────────────────────────────────────────────────────────────────
// Reproducibility (spec §3)
// ──────────────────────────────────────────────────────────────────────────

function isAgenticBenchmark(summary: BenchmarkEvalSummary): boolean {
  const tasks = summary.benchmark_card?.purpose_and_intended_users?.tasks
  if (Array.isArray(tasks)) {
    const set = new Set(tasks.map((t) => String(t).toLowerCase()))
    if (set.has("agentic") || set.has("tool_use") || set.has("multi_step_agent")) return true
  }
  for (const r of summary.model_results ?? []) {
    const args = getGenerationArgs(r)
    if (args && args.agentic_eval_config != null) return true
  }
  return false
}

function getGenerationArgs(result: ModelResultForBenchmark): Record<string, unknown> | null {
  const gc = (result.result as { generation_config?: { generation_args?: Record<string, unknown> } } | undefined)
    ?.generation_config
  if (!gc) return null
  const args = gc.generation_args
  return args && typeof args === "object" ? args : null
}

function deriveReproducibility(summary: BenchmarkEvalSummary): DerivedSignal {
  const triples = summary.model_results ?? []
  const agentic = isAgenticBenchmark(summary)
  const required: string[] = agentic
    ? [...BASE_REQUIRED_FIELDS, ...AGENTIC_REQUIRED_FIELDS]
    : [...BASE_REQUIRED_FIELDS]

  if (triples.length === 0) {
    return {
      statValue: "—",
      statUnit: "",
      headline: "Reproducibility doesn't apply — no reported scores.",
      detail: "",
    }
  }

  const fieldMissing = new Map<string, number>(required.map((f) => [f, 0]))
  let triplesWithoutGap = 0

  for (const triple of triples) {
    const args = getGenerationArgs(triple) ?? {}
    let allPresent = true
    for (const f of required) {
      if (!isPopulated(args[f])) {
        fieldMissing.set(f, (fieldMissing.get(f) ?? 0) + 1)
        allPresent = false
      }
    }
    if (allPresent) triplesWithoutGap++
  }

  const total = triples.length
  const score = triplesWithoutGap / total

  const topMissing = Array.from(fieldMissing.entries())
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([f, n]) => `${FIELD_LABELS[f] ?? f} (${formatPct(n / total)})`)
    .join(", ")

  const headline =
    score === 1
      ? "Every reported score has a complete generation config."
      : score === 0
      ? "No reported score has all required setup fields."
      : `${triplesWithoutGap} of ${total} triples document the full setup.`

  const detail = topMissing
    ? `Most often missing: ${topMissing}.`
    : `Required: ${required.map((f) => FIELD_LABELS[f] ?? f).join(", ")}.`

  return { statValue: pctNum(score), statUnit: "%", headline, detail }
}

// ──────────────────────────────────────────────────────────────────────────
// Completeness (spec §4)
// ──────────────────────────────────────────────────────────────────────────

interface CompletenessField {
  path: string
  label: string
  coverage: "full" | "partial" | "reserved"
  /** For partial: list of sub-item names whose presence is checked. */
  subitems?: readonly string[]
}

const COMPLETENESS_FIELD_SET: readonly CompletenessField[] = [
  { path: "benchmark_details.overview", label: "overview", coverage: "full" },
  { path: "benchmark_details.data_type", label: "data type", coverage: "full" },
  {
    path: "benchmark_details",
    label: "domains / languages / resources",
    coverage: "partial",
    subitems: ["domains", "languages", "resources"],
  },
  {
    path: "purpose_and_intended_users",
    label: "purpose",
    coverage: "partial",
    subitems: ["goal", "audience", "tasks", "limitations"],
  },
  {
    path: "data",
    label: "data",
    coverage: "partial",
    subitems: ["source", "size", "format", "annotation"],
  },
  {
    path: "methodology",
    label: "methodology",
    coverage: "partial",
    subitems: ["methods", "metrics", "calculation", "interpretation", "baseline_results", "validation"],
  },
  {
    path: "ethical_and_legal_considerations",
    label: "ethical & legal",
    coverage: "partial",
    subitems: ["privacy_and_anonymity", "data_licensing", "consent_procedures", "compliance_with_regulations"],
  },
  // Reserved — counted in the denominator even when unset (spec §4.2).
  { path: "evalcards.lifecycle_status", label: "lifecycle status", coverage: "reserved" },
] as const

function deriveCompleteness(summary: BenchmarkEvalSummary): DerivedSignal {
  const card = summary.benchmark_card

  const fieldScores: { path: string; label: string; coverage: CompletenessField["coverage"]; score: number }[] = []

  for (const field of COMPLETENESS_FIELD_SET) {
    let score = 0
    if (field.coverage === "reserved") {
      // The eval-summary payload doesn't currently carry an
      // evalcards.lifecycle_status section, so this scores 0 for now.
      // It still occupies a denominator slot per spec.
      score = 0
    } else if (field.coverage === "full") {
      const value = card ? readCardPath(card, field.path) : undefined
      score = isPopulated(value) ? 1 : 0
    } else {
      // partial
      const parent = card ? (readCardPath(card, field.path) as Record<string, unknown> | undefined) : undefined
      const subs = field.subitems ?? []
      if (!parent || subs.length === 0) {
        score = 0
      } else {
        let populated = 0
        for (const key of subs) if (isPopulated(parent[key])) populated++
        score = populated / subs.length
      }
    }
    fieldScores.push({ path: field.path, label: field.label, coverage: field.coverage, score })
  }

  const total = fieldScores.length
  const sumScore = fieldScores.reduce((acc, f) => acc + f.score, 0)
  const completeness = total > 0 ? sumScore / total : null

  const populatedCount = fieldScores.reduce((acc, f) => acc + (f.score === 1 ? 1 : 0), 0)
  const partialCount = fieldScores.filter((f) => f.score > 0 && f.score < 1).length
  const missingCount = fieldScores.filter((f) => f.score === 0).length

  const topMissing = fieldScores
    .filter((f) => f.score === 0 && f.coverage !== "reserved")
    .slice(0, 2)
    .map((f) => f.label)
    .join(", ")

  const headline = !card
    ? "No benchmark card has been authored yet."
    : completeness === 1
    ? "Every documented field is populated."
    : completeness != null && completeness >= 0.6
    ? "Most documented fields are populated."
    : "Several documented fields are still empty."

  const detail = !card
    ? "Reading context will lean on whatever the leaderboard JSON provides."
    : `${populatedCount} full · ${partialCount} partial · ${missingCount} missing of ${total}${
        topMissing ? ` · gaps: ${topMissing}` : ""
      }`

  return { statValue: pctNum(completeness), statUnit: "%", headline, detail }
}

function readCardPath(card: unknown, path: string): unknown {
  if (!card || typeof card !== "object") return undefined
  let cur: unknown = card
  for (const segment of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[segment]
  }
  return cur
}

// ──────────────────────────────────────────────────────────────────────────
// Provenance (spec §5)
// ──────────────────────────────────────────────────────────────────────────

type ProvenanceSourceType = "first_party" | "third_party" | "collaborative" | "unspecified"

function readSourceType(result: ModelResultForBenchmark): ProvenanceSourceType {
  const sm = result.source_metadata as { evaluator_relationship?: string } | undefined
  const rel = sm?.evaluator_relationship
  if (rel === "first_party" || rel === "third_party" || rel === "collaborative") return rel
  return "unspecified"
}

function readSourceOrg(result: ModelResultForBenchmark): string | null {
  const sm = result.source_metadata as { source_organization_name?: string } | undefined
  const org = sm?.source_organization_name
  if (typeof org === "string" && org.trim().length > 0) return org.trim()
  return null
}

function metricKeyForResult(result: ModelResultForBenchmark): string {
  const r = result.result as { metric_summary_id?: string; metric_key?: string; evaluation_name?: string } | undefined
  return r?.metric_summary_id ?? r?.metric_key ?? r?.evaluation_name ?? ""
}

function modelKeyForResult(result: ModelResultForBenchmark): string {
  return result.model_info?.id ?? result.model_info?.name ?? ""
}

function deriveProvenance(summary: BenchmarkEvalSummary): DerivedSignal {
  const triples = summary.model_results ?? []
  if (triples.length === 0) {
    return {
      statValue: "—",
      statUnit: "",
      headline: "No reported scores yet.",
      detail: "",
    }
  }

  const counts: Record<ProvenanceSourceType, number> = {
    first_party: 0,
    third_party: 0,
    collaborative: 0,
    unspecified: 0,
  }
  const distinctOrgs = new Set<string>()
  const orgsByGroup = new Map<string, Set<string>>()

  for (const t of triples) {
    counts[readSourceType(t)]++
    const org = readSourceOrg(t)
    if (org) distinctOrgs.add(org)
    const groupKey = `${modelKeyForResult(t)}::${metricKeyForResult(t)}`
    if (org) {
      const existing = orgsByGroup.get(groupKey)
      if (existing) existing.add(org)
      else orgsByGroup.set(groupKey, new Set([org]))
    }
  }

  const total = triples.length
  const attributed = total - counts.unspecified
  const score = attributed / total

  const multiSourceGroups = Array.from(orgsByGroup.values()).filter((s) => s.size > 1).length
  const eligibleGroups = orgsByGroup.size
  const multiRate = eligibleGroups > 0 ? multiSourceGroups / eligibleGroups : null

  const headline =
    counts.unspecified === total
      ? "No triple carries an attribution."
      : multiSourceGroups > 0
      ? `${multiSourceGroups} of ${eligibleGroups} (model, metric) groups have reports from more than one party.`
      : `Single-source benchmark: ${distinctOrgs.size} reporting org${distinctOrgs.size === 1 ? "" : "s"}.`

  const dist: string[] = []
  if (counts.first_party > 0) dist.push(`${formatPct(counts.first_party / total)} first-party`)
  if (counts.third_party > 0) dist.push(`${formatPct(counts.third_party / total)} third-party`)
  if (counts.collaborative > 0) dist.push(`${formatPct(counts.collaborative / total)} collaborative`)
  if (counts.unspecified > 0) dist.push(`${formatPct(counts.unspecified / total)} unspecified`)

  const detailBits = [dist.join(" · ")]
  if (multiRate != null) detailBits.push(`${formatPct(multiRate)} multi-source`)

  return { statValue: pctNum(score), statUnit: "%", headline, detail: detailBits.join(" · ") }
}

// ──────────────────────────────────────────────────────────────────────────
// Comparability (spec §6)
// ──────────────────────────────────────────────────────────────────────────

function computeThreshold(metricConfig: BenchmarkEvalSummary["metric_config"]): number {
  if (!metricConfig) return 0.05
  const unit = (metricConfig as { unit?: string; metric_unit?: string }).unit
    ?? (metricConfig as { metric_unit?: string }).metric_unit
  const scoreType = (metricConfig as { score_type?: string }).score_type
  if (unit === "proportion" || scoreType === "continuous_normalized") return 0.05
  if (unit === "percent") return 5.0
  const min = metricConfig.min_score
  const max = metricConfig.max_score
  if (typeof min === "number" && typeof max === "number" && max > min) return 0.05 * (max - min)
  return 0.05
}

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function deriveComparability(summary: BenchmarkEvalSummary): DerivedSignal {
  const triples = summary.model_results ?? []
  if (triples.length === 0) {
    return { statValue: "—", statUnit: "", headline: "No reported scores yet.", detail: "" }
  }

  const threshold = computeThreshold(summary.metric_config)

  // Group triples by (model_id, metric_path).
  const groups = new Map<
    string,
    Array<{ score: number; args: Record<string, unknown>; org: string | null }>
  >()
  for (const t of triples) {
    const score = t.score_details?.score
    if (typeof score !== "number" || !Number.isFinite(score)) continue
    const key = `${modelKeyForResult(t)}::${metricKeyForResult(t)}`
    const args = getGenerationArgs(t) ?? {}
    const entry = { score, args, org: readSourceOrg(t) }
    const list = groups.get(key)
    if (list) list.push(entry)
    else groups.set(key, [entry])
  }

  let variantEligible = 0
  let variantDivergent = 0
  let crossPartyEligible = 0
  let crossPartyDivergent = 0

  for (const list of groups.values()) {
    if (list.length < 2) continue

    // Variant divergence — same group, different setups (spec §6.1).
    const setupValueSets = new Map<string, Set<string>>()
    for (const entry of list) {
      for (const f of COMPARABILITY_COMPARE_FIELDS) {
        const valKey = JSON.stringify(entry.args[f] ?? null)
        let set = setupValueSets.get(f)
        if (!set) {
          set = new Set()
          setupValueSets.set(f, set)
        }
        set.add(valKey)
      }
    }
    const setupsDiffer = Array.from(setupValueSets.values()).some((s) => s.size > 1)
    if (setupsDiffer) {
      variantEligible++
      const scores = list.map((e) => e.score)
      const divergence = Math.max(...scores) - Math.min(...scores)
      if (divergence > threshold) variantDivergent++
    }

    // Cross-party divergence — same group, different orgs (spec §6.2).
    const byOrg = new Map<string, number[]>()
    for (const entry of list) {
      if (!entry.org) continue
      const arr = byOrg.get(entry.org)
      if (arr) arr.push(entry.score)
      else byOrg.set(entry.org, [entry.score])
    }
    if (byOrg.size >= 2) {
      crossPartyEligible++
      const orgScores = Array.from(byOrg.values()).map((s) => median(s))
      const divergence = Math.max(...orgScores) - Math.min(...orgScores)
      if (divergence > threshold) crossPartyDivergent++
    }
  }

  const totalEligible = variantEligible + crossPartyEligible
  if (totalEligible === 0) {
    return {
      statValue: "—",
      statUnit: "",
      headline: "Not enough overlapping reports to compare.",
      detail: `${groups.size} (model, metric) groups · 0 multi-report`,
    }
  }

  const totalDivergent = variantDivergent + crossPartyDivergent
  const agreementRate = (totalEligible - totalDivergent) / totalEligible

  const detailBits: string[] = []
  if (variantEligible > 0) {
    detailBits.push(
      `variant ${variantEligible - variantDivergent}/${variantEligible} agree`,
    )
  }
  if (crossPartyEligible > 0) {
    detailBits.push(
      `cross-party ${crossPartyEligible - crossPartyDivergent}/${crossPartyEligible} agree`,
    )
  }
  detailBits.push(`threshold ±${formatNumber(threshold)}`)

  const headline =
    totalDivergent === 0
      ? "Reports that are directly comparable agree within threshold."
      : totalDivergent === totalEligible
      ? "Every comparable report disagrees beyond threshold."
      : `${totalEligible - totalDivergent} of ${totalEligible} comparable reports agree.`

  return {
    statValue: pctNum(agreementRate),
    statUnit: "%",
    headline,
    detail: detailBits.join(" · "),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function isPopulated(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0
  return Boolean(value)
}

function pctNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value <= 0) return "0"
  if (value < 0.01) return "<1"
  return `${Math.round(value * 100)}`
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value === 0) return "0%"
  if (value < 0.01) return "<1%"
  return `${Math.round(value * 100)}%`
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—"
  if (value >= 100) return value.toFixed(0)
  if (value >= 1) return value.toFixed(2)
  return value.toFixed(3).replace(/0+$/g, "").replace(/\.$/, "")
}

/**
 * Compact one-row layout per signal — meant to drop in alongside the Card
 * Quality Notes box, not dominate the page like the corpus dashboard's
 * full tile grid. Glyph + name + percent live on one line; one short
 * sentence summarising the score lives below. The "Asks" prompt is moved
 * to the title attribute so it stays discoverable on hover but doesn't
 * eat vertical space.
 */
function SignalRow({
  id,
  statValue,
  statUnit,
  headline,
  detail,
}: {
  id: SignalId
} & DerivedSignal) {
  return (
    <div className="min-w-0" title={SIGNAL_ASKS[id]}>
      <div className="flex items-center gap-2">
        <span
          className={`sig-glyph sig-${id}`}
          style={{ width: 22, height: 22, fontSize: "0.7rem", flexShrink: 0 }}
        >
          <span>{SIGNAL_GLYPHS[id]}</span>
        </span>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--fg-muted)",
            flexShrink: 0,
          }}
        >
          {SIGNAL_NAMES[id]}
        </span>
        <span
          className="ml-auto font-mono tabular-nums"
          style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}
        >
          {statValue}
          {statUnit && (
            <span style={{ fontSize: 10, color: "var(--fg-subtle)", marginLeft: 2 }}>
              {statUnit}
            </span>
          )}
        </span>
      </div>
      <div
        className="mt-1"
        style={{
          fontSize: 11,
          lineHeight: 1.4,
          color: "var(--fg-muted)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {headline}
        {detail && (
          <span style={{ color: "var(--fg-subtle)" }}>
            {" · "}
            {detail}
          </span>
        )}
      </div>
    </div>
  )
}
