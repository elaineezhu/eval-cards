/**
 * Protocol-varied collections (notes/collection-benchmark-page-spec.md).
 *
 * Pure helpers shared by the server payload builder (lib/view-data) and
 * the client surfaces (eval-detail / score-distribution): protocol-
 * condition parsing, the R1 compute-axis selection rule, and the
 * compute-view mark builder. Client-safe: no server imports.
 *
 * Vocabulary follows the study's own: runs belong to a FEEDBACK
 * CONDITION ("no feedback" / "oracle score feedback"), never an "arm".
 */

export type FeedbackCondition = "none" | "answer_feedback" | "unknown"

export interface CollectionProtocolAxis {
  key: string
  type: string
  unit?: string | null
  values?: Array<string | null> | null
}

/** One entry of the snapshot's `collections.json` sidecar, keyed by
 *  `eval_results_view.collection_id` (NOT the composite slug). */
export interface CollectionsSidecarEntry {
  curated: boolean
  display_name: string
  kind?: string
  url?: string
  has_trajectories?: boolean
  /** Keyed by the study's own per-benchmark raw names (`benchmark_raw`),
   *  which need not match canonical benchmark ids. */
  outcome_type?: Record<string, string>
  protocol_axes?: CollectionProtocolAxis[]
  merge_raw_keys?: string[]
}

export interface CollectionComputeAxis {
  key: string
  /** Names the NOMINAL quantity ("token budget (limit)") — never tokens
   *  consumed; consumed-token curves are the trajectory panels' surface. */
  label: string
  unit?: string
}

/**
 * The eval-summary payload's optional `collection` attachment. Built
 * server-side for per-source pages whose rows belong to a CURATED
 * collection; the merged adapter never sets it, which is what keeps the
 * Compute chip off merged pages and embeds.
 */
export interface CollectionAttachment {
  collection_id: string
  display_name: string
  url?: string
  curated: boolean
  kind?: string
  has_trajectories?: boolean
  /** This page's benchmark outcome type when resolvable from the sidecar
   *  map; absent when the map key doesn't match the canonical id. */
  outcome_type?: string
  protocol_axes?: CollectionProtocolAxis[]
  /** Server-computed R1 x-axis choice; null = no Compute view for this
   *  page by design (nothing numeric varies within a condition). */
  compute_axis: CollectionComputeAxis | null
}

export function parseProtocolCondition(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** The comparability-bearing condition family. Unknown stays unknown —
 *  unparseable or missing feedback never gets promoted to a clean
 *  condition. */
export function feedbackConditionOf(raw: string | null | undefined): FeedbackCondition {
  const fields = parseProtocolCondition(raw)
  const feedback = fields?.feedback
  if (feedback === "none") return "none"
  if (feedback === "answer_feedback") return "answer_feedback"
  return "unknown"
}

/** Plain-language feedback-condition description (policy-mode hover),
 *  using the study's own condition names. The no-feedback condition must
 *  never be described as "single attempt" — both conditions allow
 *  resubmission. */
export function feedbackConditionDescription(condition: FeedbackCondition): string {
  switch (condition) {
    case "answer_feedback":
      return "Oracle score feedback (assisted): the model was told when its submission was correct."
    case "none":
      return "No feedback: no correctness signal during the run; the model could still revise and resubmit."
    default:
      return "Feedback condition unknown."
  }
}

// Preference order is the study's own: token_limit is the headline
// budget axis; reasoning_tokens is the fallback for pages where the
// budget never varies within a condition.
const COMPUTE_AXIS_CANDIDATES: CollectionComputeAxis[] = [
  { key: "token_limit", label: "token budget (limit)", unit: "tokens" },
  { key: "reasoning_tokens", label: "reasoning-token allowance", unit: "tokens" },
]

function axisValue(fields: Record<string, unknown>, key: string): number | null {
  const value = fields[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * R1 per-page x-axis selection: the first candidate axis with >= 2
 * distinct numeric values WITHIN at least one feedback condition.
 * Cross-condition variation alone never qualifies — that would plot a
 * comparison the study says must be made at matched budgets. Returns
 * null when nothing numeric varies within a condition (the chip is then
 * absent by design).
 */
export function chooseComputeAxis(
  protocolConditions: Array<string | null | undefined>,
): CollectionComputeAxis | null {
  for (const candidate of COMPUTE_AXIS_CANDIDATES) {
    const valuesByCondition = new Map<FeedbackCondition, Set<number>>()
    for (const raw of protocolConditions) {
      const fields = parseProtocolCondition(raw)
      if (!fields) continue
      const value = axisValue(fields, candidate.key)
      if (value == null) continue
      const condition = feedbackConditionOf(raw)
      const values = valuesByCondition.get(condition) ?? new Set<number>()
      values.add(value)
      valuesByCondition.set(condition, values)
    }
    for (const values of valuesByCondition.values()) {
      if (values.size >= 2) return candidate
    }
  }
  return null
}

export interface ComputeMark {
  x: number
  score: number
  condition: FeedbackCondition
  modelName: string
  /** Full parsed protocol fields (researcher-mode hover). */
  protocolFields: Record<string, unknown>
}

export interface ComputeMarksResult {
  marks: ComputeMark[]
  /** Protocol rows whose condition lacks a numeric value on the chosen
   *  axis — omitted from the plot and counted in the caption. */
  omitted: number
}

/**
 * Build the compute-view marks from the page's model_results. Only rows
 * carrying a protocol_condition participate; assisted rows are included
 * (this is the one view where the condition labeling is explicit) and
 * the condition is carried on every mark so the renderer can encode and
 * highlight per (model, condition) — never across conditions.
 */
export function buildComputeMarks(
  rows: Array<{
    score: number
    protocol_condition?: string | null
    model_info: { name: string }
  }>,
  axisKey: string,
): ComputeMarksResult {
  const marks: ComputeMark[] = []
  let omitted = 0
  for (const row of rows) {
    const fields = parseProtocolCondition(row.protocol_condition)
    if (!fields) continue
    if (!Number.isFinite(row.score)) continue
    const value = axisValue(fields, axisKey)
    if (value == null || value <= 0) {
      omitted += 1
      continue
    }
    marks.push({
      x: value,
      score: row.score,
      condition: feedbackConditionOf(row.protocol_condition),
      modelName: row.model_info.name,
      protocolFields: fields,
    })
  }
  return { marks, omitted }
}

/**
 * True when marks from different feedback conditions sit at different
 * nominal budgets — the caption must then carry the study's
 * matched-budget caveat.
 */
export function hasMismatchedConditionBudgets(marks: ComputeMark[]): boolean {
  const xsByCondition = new Map<FeedbackCondition, Set<number>>()
  for (const mark of marks) {
    const xs = xsByCondition.get(mark.condition) ?? new Set<number>()
    xs.add(mark.x)
    xsByCondition.set(mark.condition, xs)
  }
  if (xsByCondition.size < 2) return false
  const signatures = new Set(
    Array.from(xsByCondition.values(), (xs) => Array.from(xs).sort((a, b) => a - b).join("|")),
  )
  return signatures.size > 1
}

/**
 * The Compute chip's availability gate: the payload carries the
 * per-source-only collection attachment AND the server chose an axis.
 * Merged-page adapted summaries never carry the attachment, so the chip
 * can never leak there.
 */
export function computeChipAvailable(summary: {
  collection?: CollectionAttachment | null
}): boolean {
  return summary.collection?.compute_axis != null
}

/**
 * Build the payload attachment from the sidecar entry. Curated entries
 * only — every ordinary leaderboard row also carries a collection_id,
 * and attaching those would light up study chrome on ordinary pages.
 * Returns null for uncurated or missing entries.
 */
export function buildCollectionAttachment(
  collectionId: string,
  entry: CollectionsSidecarEntry | undefined,
  benchmarkId: string | undefined,
  protocolConditions: Array<string | null | undefined>,
): CollectionAttachment | null {
  if (!entry?.curated) return null
  // outcome_type is keyed by the study's raw benchmark names; attach only
  // on a defensible match (exact, or exact after stripping separators) —
  // never guessed. The trajectory route re-resolves this precisely via
  // benchmark_raw.
  let outcomeType: string | undefined
  if (benchmarkId && entry.outcome_type) {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")
    outcomeType =
      entry.outcome_type[benchmarkId] ??
      Object.entries(entry.outcome_type).find(
        ([key]) => normalize(key) === normalize(benchmarkId),
      )?.[1]
  }
  return {
    collection_id: collectionId,
    display_name: entry.display_name,
    url: entry.url,
    curated: true,
    kind: entry.kind,
    has_trajectories: entry.has_trajectories,
    outcome_type: outcomeType,
    protocol_axes: entry.protocol_axes,
    compute_axis: chooseComputeAxis(protocolConditions),
  }
}
