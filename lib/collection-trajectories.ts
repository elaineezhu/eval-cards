/**
 * Trajectory-panel builders for protocol-varied collections. Pure
 * functions over compact
 * per-(model, condition, task) / per-(model, condition, stop_reason)
 * aggregates that the server queries out of `collection_trajectories`;
 * the client receives the pre-shaped panels and never recomputes a
 * score. Client-safe: types + math only.
 */

import type { FeedbackCondition } from "@/lib/collections"

/** Per-(model, feedback condition, task) aggregate (SQL GROUP BY output). */
export interface TrajectoryTaskAgg {
  modelKey: string
  condition: FeedbackCondition
  taskId: string
  attempts: number
  /** Attempts with a non-NULL binary outcome. */
  scoredAttempts: number
  correctAttempts: number
  /** min(total_tokens) over SOLVE EVENTS only — trajectories that ended
   *  `completed_on_successful_submit` (the only stop reason where
   *  end-of-run tokens are tokens-at-success). Null when the task has no
   *  solve event, even if some attempt was correct. */
  minSuccessTokens: number | null
  /** max(total_tokens) observed across the task's attempts — the honest
   *  censoring point (never the nominal budget). */
  maxObservedTokens: number | null
}

/** Per-(model, feedback condition, stop_reason) aggregate. */
export interface TrajectoryStopAgg {
  modelKey: string
  condition: FeedbackCondition
  stopReason: string
  n: number
  /** Runs with is_correct = true (NULL outcomes excluded). */
  correctN: number
  /** Runs with a non-NULL is_correct. */
  scoredN: number
}

export const CONDITION_ORDER: FeedbackCondition[] = ["none", "answer_feedback", "unknown"]

// ---------------------------------------------------------------------------
// R2a — lowest observed tokens to success (the study's Fig-4 quantity).
// ---------------------------------------------------------------------------

export interface TokensToSuccessStep {
  tokens: number
  /** Cumulative success rate over the tasks this model ATTEMPTED under
   *  oracle score feedback. */
  rate: number
}

export interface TokensToSuccessCurve {
  modelKey: string
  attemptedTasks: number
  solvedTasks: number
  /** Attempted-but-unsolved tasks: token-censored at their maximum
   *  observed consumed tokens. */
  censoredTasks: number
  /** Largest observed consumed-token count among censored tasks (curve
   *  extent marker); null when nothing is censored. */
  censorTokens: number | null
  steps: TokensToSuccessStep[]
}

export interface TokensToSuccessPanel {
  curves: TokensToSuccessCurve[]
  /** Models present in the condition but dropped by the attempt floor. */
  droppedModels: Array<{ modelKey: string; attemptedTasks: number }>
}

export const TOKENS_TO_SUCCESS_MIN_ATTEMPTED = 5

/**
 * Oracle-score-feedback condition only — the sole condition where
 * success timing is observable. Solve events are exclusively
 * `completed_on_successful_submit` trajectories (already isolated
 * upstream into `minSuccessTokens`); correct runs with other stop
 * reasons are censored observations and never mix in. Returns null when
 * no model clears the attempt floor.
 */
export function buildTokensToSuccess(
  rows: TrajectoryTaskAgg[],
  minAttempted: number = TOKENS_TO_SUCCESS_MIN_ATTEMPTED,
): TokensToSuccessPanel | null {
  const byModel = new Map<string, TrajectoryTaskAgg[]>()
  for (const row of rows) {
    if (row.condition !== "answer_feedback") continue
    const bucket = byModel.get(row.modelKey) ?? []
    bucket.push(row)
    byModel.set(row.modelKey, bucket)
  }
  if (byModel.size === 0) return null

  const curves: TokensToSuccessCurve[] = []
  const droppedModels: TokensToSuccessPanel["droppedModels"] = []
  for (const [modelKey, tasks] of byModel) {
    const attemptedTasks = tasks.length
    if (attemptedTasks < minAttempted) {
      droppedModels.push({ modelKey, attemptedTasks })
      continue
    }
    const solveTokens = tasks
      .map((t) => t.minSuccessTokens)
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b)
    const censored = tasks.filter((t) => t.minSuccessTokens == null)
    const censorTokens = censored.reduce<number | null>(
      (acc, t) =>
        t.maxObservedTokens != null && Number.isFinite(t.maxObservedTokens)
          ? Math.max(acc ?? 0, t.maxObservedTokens)
          : acc,
      null,
    )
    const steps = solveTokens.map((tokens, i) => ({
      tokens,
      rate: (i + 1) / attemptedTasks,
    }))
    curves.push({
      modelKey,
      attemptedTasks,
      solvedTasks: solveTokens.length,
      censoredTasks: censored.length,
      censorTokens,
      steps,
    })
  }
  if (curves.length === 0) return null
  curves.sort((a, b) => a.modelKey.localeCompare(b.modelKey))
  return { curves, droppedModels }
}

// ---------------------------------------------------------------------------
// R2b — reliability heatmap (the paper's Fig-2C presentation).
// ---------------------------------------------------------------------------

export interface ReliabilityBin {
  key: string
  /** Hardest bin first. */
  label: string
  taskCount: number
  taskIds: string[]
  /** [min, max] task difficulty in the bin, where difficulty = 1 − the
   *  task's MEDIAN solve rate across models (the study's definition). */
  difficultyRange: [number, number]
}

export interface ReliabilityCell {
  modelKey: string
  binKey: string
  /** Mean solve rate over the model's scored attempts on the bin's
   *  tasks; null = the model attempted no task in the bin ("no data",
   *  never zero). */
  solveRate: number | null
  attemptedTasks: number
  scoredAttempts: number
}

export interface ReliabilityPanel {
  condition: FeedbackCondition
  bins: ReliabilityBin[]
  cells: ReliabilityCell[]
}

export const RELIABILITY_BIN_COUNT = 5

const RELIABILITY_BIN_LABELS = [
  "hardest fifth",
  "2nd fifth",
  "3rd fifth",
  "4th fifth",
  "easiest fifth",
]

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Shared difficulty bins — the study's own definition: task difficulty
 * = 1 − the task's MEDIAN solve rate across models, with each model's
 * per-task rate pooled across BOTH feedback conditions (the paper's
 * Fig-2C heatmap is not condition-specific in its difficulty axis).
 * Computed once and shared by every condition panel, so the bins stay
 * fixed when the reader flips the condition chip and only the cells
 * change. Tasks with no scored attempt anywhere are excluded (difficulty
 * undefined). Returns null when nothing is scored.
 */
export function buildReliabilityBins(rows: TrajectoryTaskAgg[]): ReliabilityBin[] | null {
  // Per (task, model): outcome counts pooled across conditions.
  const perTaskModel = new Map<string, Map<string, { scored: number; correct: number }>>()
  for (const row of rows) {
    const models = perTaskModel.get(row.taskId) ?? new Map()
    const m = models.get(row.modelKey) ?? { scored: 0, correct: 0 }
    m.scored += row.scoredAttempts
    m.correct += row.correctAttempts
    models.set(row.modelKey, m)
    perTaskModel.set(row.taskId, models)
  }
  const tasks: Array<{ taskId: string; difficulty: number }> = []
  for (const [taskId, models] of perTaskModel) {
    const rates = Array.from(models.values())
      .filter((m) => m.scored > 0)
      .map((m) => m.correct / m.scored)
    if (rates.length === 0) continue
    tasks.push({ taskId, difficulty: 1 - median(rates) })
  }
  if (tasks.length === 0) return null

  // Rank-order by difficulty (hardest first), deterministic tiebreak.
  tasks.sort(
    (a, b) => b.difficulty - a.difficulty || a.taskId.localeCompare(b.taskId),
  )
  // Fewer tasks than bins degrades to one-task bins (never an empty
  // hardest bin at the top of the chart).
  const binCount = Math.min(RELIABILITY_BIN_COUNT, tasks.length)
  const bins: ReliabilityBin[] = []
  for (let i = 0; i < binCount; i++) {
    const start = Math.floor((tasks.length * i) / binCount)
    const end = Math.floor((tasks.length * (i + 1)) / binCount)
    const slice = tasks.slice(start, end)
    if (slice.length === 0) continue
    bins.push({
      key: `bin-${i}`,
      label:
        binCount === RELIABILITY_BIN_COUNT
          ? RELIABILITY_BIN_LABELS[i]
          : i === 0
            ? "hardest"
            : i === binCount - 1
              ? "easiest"
              : `group ${i + 1}`,
      taskCount: slice.length,
      taskIds: slice.map((t) => t.taskId).sort(),
      difficultyRange: [
        Math.min(...slice.map((t) => t.difficulty)),
        Math.max(...slice.map((t) => t.difficulty)),
      ],
    })
  }
  return bins
}

/**
 * One condition's cells over the SHARED difficulty bins. Cells never
 * pool across conditions — only the difficulty axis does (per the
 * paper). Returns null when the condition has no scored tasks.
 */
export function buildReliabilityHeatmap(
  rows: TrajectoryTaskAgg[],
  condition: FeedbackCondition,
  bins: ReliabilityBin[],
): ReliabilityPanel | null {
  const conditionRows = rows.filter((r) => r.condition === condition)
  if (!conditionRows.some((r) => r.scoredAttempts > 0)) return null

  const binOfTask = new Map<string, string>()
  for (const bin of bins) {
    for (const taskId of bin.taskIds) binOfTask.set(taskId, bin.key)
  }

  const models = Array.from(new Set(conditionRows.map((r) => r.modelKey)))
  const cells: ReliabilityCell[] = []
  for (const modelKey of models) {
    for (const bin of bins) {
      let attemptedTasks = 0
      let scored = 0
      let correct = 0
      for (const row of conditionRows) {
        if (row.modelKey !== modelKey) continue
        if (binOfTask.get(row.taskId) !== bin.key) continue
        attemptedTasks += 1
        scored += row.scoredAttempts
        correct += row.correctAttempts
      }
      cells.push({
        modelKey,
        binKey: bin.key,
        solveRate: scored > 0 ? correct / scored : null,
        attemptedTasks,
        scoredAttempts: scored,
      })
    }
  }
  return { condition, bins, cells }
}

// ---------------------------------------------------------------------------
// R2c — how runs ended, in the paper's Table-6 grain: a PARTITION of
// runs by termination cause. "Ended on a correct submission" is a
// termination cause only under oracle score feedback (the oracle stops
// the run); it can never occur under no feedback, mirroring the paper's
// "—" cells. Stops the study's taxonomy doesn't cover (chiefly
// trajectory records ending on a tool call — an artifact of the
// extract's stitching) are surfaced as an explicit "other" bucket, never
// silently folded into a study category. Outcome-correctness is reported
// SEPARATELY (owner decision (c), 2026-08-21) because under no feedback
// a run's success is invisible in its termination cause.
// ---------------------------------------------------------------------------

export interface TerminationProportion {
  n: number
  /** Denominator the proportion is over. The partition rows use total
   *  runs; the separate outcome line uses SCORED runs only, so NULL
   *  outcomes never count as incorrect. */
  denominator: number
}

export interface TerminationModelBreakdown {
  modelKey: string
  total: number
  /** Raw stop_reason partition — DOES sum to `total`. */
  reasons: Record<string, number>
}

export interface TerminationSummary {
  condition: FeedbackCondition
  runCount: number
  /** Table-6 partition by termination cause; the four counts sum to
   *  runCount. `endedOnCorrectSubmission` is null (not zero) outside the
   *  oracle condition — the category cannot occur there. */
  endedOnCorrectSubmission: TerminationProportion | null
  repetitionGuard: TerminationProportion
  budgetExhausted: TerminationProportion
  otherEndings: TerminationProportion
  /** Separate OUTCOME line, not a termination category: runs whose
   *  outcome was correct regardless of how they ended. Null for graded
   *  benchmarks (not computable). */
  reachedCorrectAnswer: TerminationProportion | null
  byModel: TerminationModelBreakdown[]
}

/**
 * Table-6-grain termination summaries per feedback condition, pooled
 * across models. Never pooled across conditions —
 * `completed_on_successful_submit` exists only under oracle feedback.
 */
export function buildTerminationSummaries(
  rows: TrajectoryStopAgg[],
  outcomeIsBinary: boolean,
): TerminationSummary[] {
  const byCondition = new Map<FeedbackCondition, TrajectoryStopAgg[]>()
  for (const row of rows) {
    const bucket = byCondition.get(row.condition) ?? []
    bucket.push(row)
    byCondition.set(row.condition, bucket)
  }

  const summaries: TerminationSummary[] = []
  for (const condition of CONDITION_ORDER) {
    const conditionRows = byCondition.get(condition)
    if (!conditionRows || conditionRows.length === 0) continue
    const runCount = conditionRows.reduce((acc, r) => acc + r.n, 0)
    const scoredN = conditionRows.reduce((acc, r) => acc + r.scoredN, 0)
    const correctN = conditionRows.reduce((acc, r) => acc + r.correctN, 0)
    const reasonCount = (reason: string) =>
      conditionRows.filter((r) => r.stopReason === reason).reduce((acc, r) => acc + r.n, 0)

    const correctSubmit = reasonCount("completed_on_successful_submit")
    const guard = reasonCount("repetition_guard")
    const budget = reasonCount("token_limit")
    const other = runCount - correctSubmit - guard - budget

    const byModelMap = new Map<string, TerminationModelBreakdown>()
    for (const row of conditionRows) {
      const entry = byModelMap.get(row.modelKey) ?? {
        modelKey: row.modelKey,
        total: 0,
        reasons: {},
      }
      entry.total += row.n
      entry.reasons[row.stopReason] = (entry.reasons[row.stopReason] ?? 0) + row.n
      byModelMap.set(row.modelKey, entry)
    }

    summaries.push({
      condition,
      runCount,
      endedOnCorrectSubmission:
        condition === "answer_feedback" ? { n: correctSubmit, denominator: runCount } : null,
      repetitionGuard: { n: guard, denominator: runCount },
      budgetExhausted: { n: budget, denominator: runCount },
      // Outside oracle feedback correctSubmit is structurally 0, so
      // `other` still completes the partition when the correct-submit
      // row renders as "—".
      otherEndings: { n: other + (condition === "answer_feedback" ? 0 : correctSubmit), denominator: runCount },
      reachedCorrectAnswer:
        outcomeIsBinary && scoredN > 0 ? { n: correctN, denominator: scoredN } : null,
      byModel: Array.from(byModelMap.values()).sort((a, b) =>
        a.modelKey.localeCompare(b.modelKey),
      ),
    })
  }
  return summaries
}

// ---------------------------------------------------------------------------
// Route payload (app/api/eval-trajectories).
// ---------------------------------------------------------------------------

export interface TrajectoryModelEntry {
  /** Canonical page model_key when the raw id resolved, else the raw id. */
  key: string
  label: string
  releaseDate: string | null
  /** True when the trajectory id matched no snapshot model — rendered
   *  under its raw name labeled "(unmatched id)", never guessed. */
  unmatched: boolean
}

export interface EvalTrajectoriesPayload {
  evaluation_id: string
  benchmark_id: string
  collection_id: string
  /** From the collection sidecar via the study's own benchmark_raw key. */
  outcome_type: string | null
  /** Total benchmark tasks observed in the trajectory extract. */
  task_count: number
  /** Models in release order (release date ascending, unmatched last). */
  models: TrajectoryModelEntry[]
  conditions: FeedbackCondition[]
  tokens_to_success: TokensToSuccessPanel | null
  reliability: ReliabilityPanel[]
  termination: TerminationSummary[]
}

// ---------------------------------------------------------------------------
// Panel selection, shared by the on-page section and the trajectories
// embed so an embed asking for a panel this eval doesn't carry gets a
// declared absence rather than an empty card.
// ---------------------------------------------------------------------------

export type TrajectoryPanelKey = "tokens" | "reliability" | "termination"

export const TRAJECTORY_PANEL_LABELS: Record<TrajectoryPanelKey, string> = {
  tokens: "Lowest observed tokens to success",
  reliability: "Reliability by task difficulty",
  termination: "How runs ended",
}

/** Panels the served payload can actually render, in display order.
 *  Graded-outcome pages (e.g. HealthBench) serve only termination. */
export function availableTrajectoryPanels(
  payload: EvalTrajectoriesPayload | null | undefined,
): TrajectoryPanelKey[] {
  if (!payload) return []
  const panels: TrajectoryPanelKey[] = []
  if ((payload.tokens_to_success?.curves.length ?? 0) > 0) panels.push("tokens")
  if (payload.reliability.length > 0) panels.push("reliability")
  if (payload.termination.length > 0) panels.push("termination")
  return panels
}

/** Normalize a `?panel=` value; anything unrecognized means "all". */
export function parseTrajectoryPanelParam(
  raw: string | null | undefined,
): TrajectoryPanelKey | null {
  const value = raw?.trim().toLowerCase()
  return value === "tokens" || value === "reliability" || value === "termination"
    ? value
    : null
}

/** Normalize a `?condition=` value; anything unrecognized falls back to
 *  the panels' own default. */
export function parseFeedbackConditionParam(
  raw: string | null | undefined,
): FeedbackCondition | null {
  const value = raw?.trim().toLowerCase()
  return value === "none" || value === "answer_feedback" || value === "unknown"
    ? value
    : null
}
