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
 * Compute view off merged summaries everywhere. Per-source embeds carry
 * the attachment and render the study surfaces deliberately.
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
  /** Scaffold-context strips for this (collection, benchmark), built from
   *  the `collection_context.json` sidecar. Null when the sidecar carries
   *  no entry for this pair — the Context view is then absent by design. */
  context?: ScaffoldContextPayload | null
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
 * Protocol points for the plotbox Compute view. A SEPARATE series from
 * the distribution/frontier feeds: those code paths never read it, so
 * the assisted-row exclusion on those views cannot regress. Marks
 * include assisted rows — this is the one view where condition labeling
 * is explicit.
 */
export interface ProtocolSeries {
  /** Names the NOMINAL quantity ("token budget (limit)") — never reads
   *  as tokens consumed. */
  axisLabel: string
  marks: ComputeMark[]
  /** Protocol rows without a numeric value on the axis (caption count). */
  omitted: number
  /** Marks from different feedback conditions sit at different nominal
   *  budgets → the caption carries the study's matched-budget caveat. */
  mismatchedConditionBudgets: boolean
  /** Researcher mode appends full protocol fields to the hover; policy
   *  mode appends the plain-language condition sentence. */
  researcherMode?: boolean
}

/**
 * Build the Compute-view series for one page. Shared by the eval page
 * and the compute embed so the two surfaces can never disagree on the
 * marks. Gated on the per-source-only curated attachment plus the
 * server-chosen axis — never derives an axis from the rows themselves,
 * because merged adapted summaries also carry per-row protocol fields
 * and must never light up a compute view. Null means the view is
 * absent by design.
 */
export function buildComputeProtocolSeries(
  rows: Array<{
    score: number
    protocol_condition?: string | null
    model_info: { name: string }
  }>,
  collection: CollectionAttachment | null | undefined,
  researcherMode: boolean,
): ProtocolSeries | null {
  const axis = collection?.compute_axis
  if (!axis || !collection?.curated) return null
  const { marks, omitted } = buildComputeMarks(rows, axis.key)
  if (marks.length === 0) return null
  return {
    axisLabel: axis.label,
    marks,
    omitted,
    mismatchedConditionBudgets: hasMismatchedConditionBudgets(marks),
    researcherMode,
  }
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

// ---------------------------------------------------------------------------
// Scaffold context (finding I1): the collection's own published score for a
// model, placed inside the community's per-scaffold score distribution for
// the same model on the same benchmark.
//
// The producer pre-joins EVERYTHING into `collection_context.json` — the
// external points are already matched to the collection's models on
// `model_aggregation_key`, already scale-converted, already restricted to
// the source's latest harvest, and the "no official entries" list is
// producer-computed. Nothing here joins across artifacts; a client-side
// join would mislabel a failed match as an absence.
// ---------------------------------------------------------------------------

/** One external leaderboard entry: a (scaffold, model) pair run under the
 *  scaffold's own budget, which the leaderboard does not record. */
export interface ScaffoldContextExternalEntry {
  scaffold: string
  score: number
  score_se?: number | null
  run_date?: string | null
}

/** A curated context source: the leaderboard the external points come
 *  from. The producer resolves the display name, so the frontend never
 *  has to prettify an id. */
export interface ScaffoldContextSource {
  id: string
  display_name: string
}

/** One model's entry in the sidecar, keyed by `model_aggregation_key`. */
export interface ScaffoldContextSidecarModel {
  display_name: string
  score: number
  n_tasks: number
  /** Recorded attempts per task behind the band, from the trajectory pool. */
  attempts_min: number
  attempts_max: number
  /** Copied VERBATIM from the fact rows by the producer — caption 3
   *  depends on byte equality with the page's own condition strings. */
  protocol_condition: string
  band_lo: number
  band_hi: number
  band_runs: number
  band_method?: string
  band_seed?: number
  external: ScaffoldContextExternalEntry[]
}

/** One (collection, benchmark) entry of `collection_context.json`. */
export interface ScaffoldContextEntry {
  harvested_at: string
  official_task_count: number
  context_sources: ScaffoldContextSource[]
  /** Producer-joined display names, in `context_sources` order — what
   *  caption 1 names as the origin of the external points. */
  context_source_display: string
  models_without_context: string[]
  models: Record<string, ScaffoldContextSidecarModel>
}

/** `collection_context.json`: collection_id → benchmark_key → entry. */
export type CollectionContextSidecar = Record<string, Record<string, ScaffoldContextEntry>>

export interface ScaffoldContextPoint {
  scaffold: string
  score: number
  scoreSe?: number | null
  runDate?: string | null
}

/** One horizontal strip: the model's published score (diamond), its
 *  re-run band, and the external per-scaffold points (circles). */
export interface ScaffoldContextModel {
  /** `model_aggregation_key` — the dated↔undated bridge the producer
   *  joined on. Display-only here. */
  key: string
  displayName: string
  /** Published score of the fullest no-feedback condition. */
  score: number
  nTasks: number
  bandLo: number
  bandHi: number
  bandRuns: number
  /** Recorded attempts per task the band was simulated from. */
  attemptsMin: number
  attemptsMax: number
  points: ScaffoldContextPoint[]
  /** External points dropped by the >30 rule (0 in every shipped case). */
  hiddenCount: number
  /** Caption 3: this model is shown at its fullest-coverage condition,
   *  which is NOT the best-scoring no-feedback condition the ranked list
   *  above shows. Per-model — a global caption would be wrong for the
   *  single-condition models. */
  conditionDiffersFromBestScoring: boolean
}

export interface ScaffoldContextPayload {
  /** Snapshot id of the harvest the external points come from. */
  harvestedAt: string
  officialTaskCount: number
  /** Curated context sources, verbatim from the sidecar. */
  contextSources: ScaffoldContextSource[]
  /** Producer-resolved display string for those sources (caption 1). */
  contextSourceDisplay: string
  /** Producer-computed: collection models with no external entry. */
  modelsWithoutContext: string[]
  /** Benchmark display name for the captions. */
  benchmarkLabel: string
  /** Collection display name for the captions. */
  collectionLabel: string
  models: ScaffoldContextModel[]
  /** Sum of `hiddenCount` — drives the "+N not shown" caption. */
  hiddenTotal: number
}

/** The summary fields the builder reads. Structural so this module stays
 *  client-safe and free of a payload-type import cycle. */
export interface ScaffoldContextSummaryInput {
  evaluation_name?: string
  canonical_display_name?: string
  collection?: { display_name?: string } | null
  model_results: Array<{
    score: number
    protocol_condition?: string | null
    model_route_id?: string
    model_group_id?: string
    model_info: { name?: string; id?: string }
  }>
}

/** Never truncate below this many external points per model (today's max
 *  is 10; the live board has 11). */
const CONTEXT_POINT_CAP = 30

/**
 * Rank-quantile thinning that ALWAYS keeps both extremes. Top-N-by-score
 * truncation would narrow the visible spread — the exact quantity the
 * finding is about. Returns the kept points in the producer's original
 * order plus the number dropped.
 */
export function thinContextPoints(
  points: ScaffoldContextPoint[],
): { points: ScaffoldContextPoint[]; hiddenCount: number } {
  if (points.length <= CONTEXT_POINT_CAP) return { points, hiddenCount: 0 }

  // Rank order (ties broken by original position) so the quantile spacing
  // is over ranks, not over the producer's emit order.
  const byRank = points
    .map((point, index) => ({ point, index }))
    .sort((a, b) => a.point.score - b.point.score || a.index - b.index)

  const last = byRank.length - 1
  const keptRanks = new Set<number>([0, last])
  // Interior slots: quantile positions across the rank axis, rounded and
  // deduped, then topped up from the unused ranks so the cap is always met.
  const interior = CONTEXT_POINT_CAP - 2
  for (let i = 1; i <= interior; i += 1) {
    keptRanks.add(Math.round((i / (interior + 1)) * last))
  }
  for (let rank = 0; rank <= last && keptRanks.size < CONTEXT_POINT_CAP; rank += 1) {
    keptRanks.add(rank)
  }

  const keptIndices = new Set(
    Array.from(keptRanks, (rank) => byRank[rank].index),
  )
  return {
    points: points.filter((_, index) => keptIndices.has(index)),
    hiddenCount: points.length - keptIndices.size,
  }
}

/** Identity candidates a page row can be addressed by. The sidecar keys on
 *  `model_aggregation_key`, which equals the page's `model_key` for the
 *  collection's own rows; the display name is the last resort. */
function rowIdentities(row: ScaffoldContextSummaryInput["model_results"][number]): string[] {
  const ids: string[] = []
  if (row.model_info?.id) ids.push(row.model_info.id)
  if (row.model_group_id) ids.push(row.model_group_id)
  if (row.model_route_id) {
    try {
      ids.push(decodeURIComponent(row.model_route_id))
    } catch {
      ids.push(row.model_route_id)
    }
  }
  return ids
}

/**
 * The model's highest-scoring `feedback == "none"` row — the row the ranked
 * list above the plot shows. Caption 3 fires when the sidecar's condition
 * (fullest coverage) is a DIFFERENT string from this one.
 */
function bestScoringNoFeedbackCondition(
  summary: ScaffoldContextSummaryInput,
  key: string,
  displayName: string,
): string | null {
  const normalizedName = displayName.trim().toLowerCase()
  let best: { score: number; condition: string } | null = null
  for (const row of summary.model_results ?? []) {
    if (!Number.isFinite(row.score)) continue
    const condition = row.protocol_condition
    if (!condition) continue
    if (feedbackConditionOf(condition) !== "none") continue
    const matches =
      rowIdentities(row).includes(key) ||
      (row.model_info?.name ?? "").trim().toLowerCase() === normalizedName
    if (!matches) continue
    if (!best || row.score > best.score) best = { score: row.score, condition }
  }
  return best?.condition ?? null
}

/**
 * Build the Context view payload from one sidecar entry. Pure. Returns null
 * when the sidecar carries no entry for this (collection, benchmark) or the
 * entry has no models — the view is then absent by design, never an empty
 * plot.
 */
export function buildScaffoldContext(
  entry: ScaffoldContextEntry | null | undefined,
  summary: ScaffoldContextSummaryInput,
): ScaffoldContextPayload | null {
  if (!entry) return null
  const sidecarModels = Object.entries(entry.models ?? {})
  if (sidecarModels.length === 0) return null

  const models: ScaffoldContextModel[] = []
  for (const [key, model] of sidecarModels) {
    if (!model) continue
    if (!Number.isFinite(model.score)) continue
    const displayName = model.display_name?.trim() || key
    const external = (model.external ?? [])
      .filter((point) => Number.isFinite(point?.score))
      .map((point) => ({
        scaffold: point.scaffold,
        score: point.score,
        scoreSe: point.score_se ?? null,
        runDate: point.run_date ?? null,
      }))
    const { points, hiddenCount } = thinContextPoints(external)
    const bestCondition = bestScoringNoFeedbackCondition(summary, key, displayName)
    models.push({
      key,
      displayName,
      score: model.score,
      nTasks: model.n_tasks,
      bandLo: model.band_lo,
      bandHi: model.band_hi,
      bandRuns: model.band_runs,
      attemptsMin: model.attempts_min,
      attemptsMax: model.attempts_max,
      points,
      hiddenCount,
      // String equality on the verbatim producer-copied condition. A
      // missing page row can never fire the caption — we would be
      // asserting a difference we cannot see.
      conditionDiffersFromBestScoring:
        bestCondition != null && bestCondition !== model.protocol_condition,
    })
  }
  if (models.length === 0) return null

  return {
    harvestedAt: entry.harvested_at,
    officialTaskCount: entry.official_task_count,
    contextSources: entry.context_sources ?? [],
    contextSourceDisplay: entry.context_source_display,
    modelsWithoutContext: entry.models_without_context ?? [],
    benchmarkLabel:
      summary.canonical_display_name?.trim() || summary.evaluation_name?.trim() || "this benchmark",
    collectionLabel: summary.collection?.display_name?.trim() || "This study",
    models,
    hiddenTotal: models.reduce((acc, model) => acc + model.hiddenCount, 0),
  }
}
