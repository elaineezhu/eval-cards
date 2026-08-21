import { describe, expect, it } from "vitest"

import {
  availableTrajectoryPanels,
  buildReliabilityBins,
  buildReliabilityHeatmap,
  buildTerminationSummaries,
  buildTokensToSuccess,
  parseFeedbackConditionParam,
  parseTrajectoryPanelParam,
  type EvalTrajectoriesPayload,
  type TrajectoryStopAgg,
  type TrajectoryTaskAgg,
} from "@/lib/collection-trajectories"

const task = (over: Partial<TrajectoryTaskAgg>): TrajectoryTaskAgg => ({
  modelKey: "m1",
  condition: "answer_feedback",
  taskId: "t",
  attempts: 1,
  scoredAttempts: 1,
  correctAttempts: 0,
  minSuccessTokens: null,
  maxObservedTokens: 1000,
  ...over,
})

describe("buildTokensToSuccess (R2a)", () => {
  it("steps only on solve events; correct-but-otherwise-stopped tasks censor", () => {
    const rows: TrajectoryTaskAgg[] = [
      // Solved (completed_on_successful_submit → minSuccessTokens set).
      task({ taskId: "t1", minSuccessTokens: 1_000, correctAttempts: 1 }),
      task({ taskId: "t2", minSuccessTokens: 4_000, correctAttempts: 1 }),
      // Correct but via tool_calls stop — upstream leaves
      // minSuccessTokens null → censored, never a step.
      task({ taskId: "t3", correctAttempts: 1, maxObservedTokens: 9_000 }),
      task({ taskId: "t4", maxObservedTokens: 2_500_000 }),
      task({ taskId: "t5", maxObservedTokens: 1_800_000 }),
    ]
    const panel = buildTokensToSuccess(rows)
    expect(panel).not.toBeNull()
    const curve = panel!.curves[0]
    expect(curve).toMatchObject({
      attemptedTasks: 5,
      solvedTasks: 2,
      censoredTasks: 3,
      // Censoring point = largest OBSERVED consumed tokens, never a
      // nominal budget.
      censorTokens: 2_500_000,
    })
    // Cumulative success rate over ATTEMPTED tasks.
    expect(curve.steps).toEqual([
      { tokens: 1_000, rate: 1 / 5 },
      { tokens: 4_000, rate: 2 / 5 },
    ])
  })

  it("uses only the oracle-feedback condition and enforces the 5-task floor", () => {
    const rows: TrajectoryTaskAgg[] = [
      // No-feedback rows must never contribute (success timing is not
      // observable there).
      ...["a", "b", "c", "d", "e"].map((id) =>
        task({ taskId: id, condition: "none", minSuccessTokens: 100 }),
      ),
      // Assisted model with only 2 attempted tasks → dropped
      // (frontiermath's 2-task curve).
      task({ taskId: "t1", modelKey: "small", minSuccessTokens: 500 }),
      task({ taskId: "t2", modelKey: "small", minSuccessTokens: 700 }),
    ]
    const panel = buildTokensToSuccess(rows)
    expect(panel).toBeNull()

    const withBig = [
      ...rows,
      ...["t1", "t2", "t3", "t4", "t5"].map((id) =>
        task({ taskId: id, modelKey: "big", minSuccessTokens: 1000 }),
      ),
    ]
    const panel2 = buildTokensToSuccess(withBig)
    expect(panel2!.curves.map((c) => c.modelKey)).toEqual(["big"])
    expect(panel2!.droppedModels).toEqual([{ modelKey: "small", attemptedTasks: 2 }])
  })
})

describe("reliability heatmap (R2b, the study's difficulty definition)", () => {
  it("bins by 1 − MEDIAN solve rate across models (not the pooled mean)", () => {
    // Task A: per-model rates [0, 1, 1] → median 1 → difficulty 0
    // (a pooled mean would call it 1/3-difficulty ≈ harder than B).
    // Task B: per-model rates [0.8, 0.8, 0.8] → difficulty 0.2.
    const rows: TrajectoryTaskAgg[] = []
    for (const [model, correct] of [["m1", 0], ["m2", 10], ["m3", 10]] as const) {
      rows.push(
        task({ modelKey: model, condition: "none", taskId: "task-a", attempts: 10, scoredAttempts: 10, correctAttempts: correct }),
      )
    }
    for (const model of ["m1", "m2", "m3"]) {
      rows.push(
        task({ modelKey: model, condition: "none", taskId: "task-b", attempts: 10, scoredAttempts: 10, correctAttempts: 8 }),
      )
    }
    const bins = buildReliabilityBins(rows)
    expect(bins).not.toBeNull()
    // Hardest first: B (difficulty 0.2) before A (difficulty 0).
    expect(bins![0].taskIds).toEqual(["task-b"])
    expect(bins![bins!.length - 1].taskIds).toEqual(["task-a"])
  })

  it("pools each model's per-task rate across BOTH conditions for the difficulty axis", () => {
    // m1 on task-c: 0/1 under no feedback + 1/1 under oracle → pooled
    // rate 0.5 → difficulty 0.5; task-d stays at difficulty 0.
    const rows: TrajectoryTaskAgg[] = [
      task({ condition: "none", taskId: "task-c", scoredAttempts: 1, correctAttempts: 0 }),
      task({ condition: "answer_feedback", taskId: "task-c", scoredAttempts: 1, correctAttempts: 1 }),
      task({ condition: "none", taskId: "task-d", scoredAttempts: 1, correctAttempts: 1 }),
    ]
    const bins = buildReliabilityBins(rows)!
    const binOf = (taskId: string) => bins.find((b) => b.taskIds.includes(taskId))!
    expect(binOf("task-c").difficultyRange).toEqual([0.5, 0.5])
    expect(binOf("task-d").difficultyRange).toEqual([0, 0])
    // Hardest first.
    expect(bins[0].taskIds).toEqual(["task-c"])
  })

  it("shares bins across condition panels; cells never pool across conditions", () => {
    const rows: TrajectoryTaskAgg[] = [
      task({ condition: "none", taskId: "t1", scoredAttempts: 1, correctAttempts: 0 }),
      task({ condition: "answer_feedback", taskId: "t1", scoredAttempts: 1, correctAttempts: 1 }),
    ]
    const bins = buildReliabilityBins(rows)!
    const nonePanel = buildReliabilityHeatmap(rows, "none", bins)!
    const oraclePanel = buildReliabilityHeatmap(rows, "answer_feedback", bins)!
    expect(nonePanel.bins).toBe(bins)
    expect(oraclePanel.bins).toBe(bins)
    // Same task, same bin — different per-condition cell values.
    expect(nonePanel.cells[0].solveRate).toBe(0)
    expect(oraclePanel.cells[0].solveRate).toBe(1)
  })

  it("renders no-data cells as null and withholds panels for unscored conditions", () => {
    const rows: TrajectoryTaskAgg[] = [
      task({ condition: "none", modelKey: "m1", taskId: "t1", scoredAttempts: 1, correctAttempts: 1 }),
      task({ condition: "none", modelKey: "m1", taskId: "t2", scoredAttempts: 1, correctAttempts: 0 }),
      // m2 attempted only t2.
      task({ condition: "none", modelKey: "m2", taskId: "t2", scoredAttempts: 1, correctAttempts: 1 }),
      // Oracle condition exists but nothing scored → no panel.
      task({ condition: "answer_feedback", taskId: "t1", scoredAttempts: 0, correctAttempts: 0 }),
    ]
    const bins = buildReliabilityBins(rows)!
    const panel = buildReliabilityHeatmap(rows, "none", bins)!
    const t1Bin = bins.find((b) => b.taskIds.includes("t1"))!
    const m2t1 = panel.cells.find((c) => c.modelKey === "m2" && c.binKey === t1Bin.key)!
    expect(m2t1.solveRate).toBeNull()
    expect(m2t1.attemptedTasks).toBe(0)
    expect(buildReliabilityHeatmap(rows, "answer_feedback", bins)).toBeNull()
    // Nothing scored at all → no bins.
    expect(buildReliabilityBins([task({ scoredAttempts: 0, correctAttempts: 0 })])).toBeNull()
  })
})

const stop = (over: Partial<TrajectoryStopAgg>): TrajectoryStopAgg => ({
  modelKey: "m1",
  condition: "none",
  stopReason: "tool_calls",
  n: 1,
  correctN: 0,
  scoredN: 1,
  ...over,
})

describe("buildTerminationSummaries (R2c)", () => {
  it("partitions runs by termination cause, summing to the run count", () => {
    const rows: TrajectoryStopAgg[] = [
      stop({ stopReason: "repetition_guard", n: 45, correctN: 40, scoredN: 45 }),
      stop({ stopReason: "tool_calls", n: 50, correctN: 35, scoredN: 50 }),
      stop({ stopReason: "token_limit", n: 5, correctN: 1, scoredN: 5 }),
    ]
    const [summary] = buildTerminationSummaries(rows, true)
    expect(summary).toMatchObject({
      condition: "none",
      runCount: 100,
      // Correct-submission termination cannot occur without the oracle —
      // withheld ("—"), mirroring the study's table.
      endedOnCorrectSubmission: null,
      repetitionGuard: { n: 45, denominator: 100 },
      budgetExhausted: { n: 5, denominator: 100 },
      otherEndings: { n: 50, denominator: 100 },
    })
    expect(
      summary.repetitionGuard.n + summary.budgetExhausted.n + summary.otherEndings.n,
    ).toBe(summary.runCount)
  })

  it("counts correct-submission terminations under oracle feedback only", () => {
    const rows: TrajectoryStopAgg[] = [
      stop({
        condition: "answer_feedback",
        stopReason: "completed_on_successful_submit",
        n: 23,
        correctN: 23,
        scoredN: 23,
      }),
      stop({ condition: "answer_feedback", stopReason: "tool_calls", n: 68, correctN: 60, scoredN: 68 }),
      stop({ condition: "answer_feedback", stopReason: "repetition_guard", n: 4, correctN: 1, scoredN: 4 }),
      stop({ condition: "answer_feedback", stopReason: "token_limit", n: 5, correctN: 0, scoredN: 5 }),
    ]
    const [summary] = buildTerminationSummaries(rows, true)
    expect(summary).toMatchObject({
      condition: "answer_feedback",
      runCount: 100,
      endedOnCorrectSubmission: { n: 23, denominator: 100 },
      repetitionGuard: { n: 4, denominator: 100 },
      budgetExhausted: { n: 5, denominator: 100 },
      otherEndings: { n: 68, denominator: 100 },
      // Outcome line is a different quantity from the termination
      // partition: most correct runs here did NOT end on the oracle.
      reachedCorrectAnswer: { n: 84, denominator: 100 },
    })
  })

  it("never counts NULL outcomes as incorrect on the outcome line", () => {
    // 10 runs, only 4 scored, 3 of those correct → 75%, not 30%.
    const rows = [stop({ n: 10, correctN: 3, scoredN: 4 })]
    const [summary] = buildTerminationSummaries(rows, true)
    expect(summary.reachedCorrectAnswer).toEqual({ n: 3, denominator: 4 })
  })

  it("withholds the outcome line for graded benchmarks", () => {
    const rows = [stop({ n: 10, correctN: 0, scoredN: 0 })]
    const [summary] = buildTerminationSummaries(rows, false)
    expect(summary.reachedCorrectAnswer).toBeNull()
  })

  it("keeps conditions separate and the per-model reason breakdown a partition", () => {
    const rows: TrajectoryStopAgg[] = [
      stop({ condition: "none", stopReason: "tool_calls", n: 7 }),
      stop({ condition: "none", stopReason: "repetition_guard", n: 3 }),
      stop({
        condition: "answer_feedback",
        stopReason: "completed_on_successful_submit",
        n: 4,
        correctN: 4,
        scoredN: 4,
      }),
    ]
    const summaries = buildTerminationSummaries(rows, true)
    expect(summaries.map((s) => s.condition)).toEqual(["none", "answer_feedback"])
    const none = summaries[0]
    const model = none.byModel[0]
    // Researcher-mode raw breakdown IS a partition: sums to the total.
    expect(Object.values(model.reasons).reduce((a, b) => a + b, 0)).toBe(model.total)
    expect(model.total).toBe(10)
    // completed_on_successful_submit never leaks into the no-feedback
    // condition.
    expect(none.byModel.every((m) => m.reasons.completed_on_successful_submit == null)).toBe(true)
  })
})

describe("availableTrajectoryPanels (embed/page panel gate)", () => {
  const payload = (over: Partial<EvalTrajectoriesPayload>): EvalTrajectoriesPayload => ({
    evaluation_id: "e",
    benchmark_id: "b",
    collection_id: "c",
    outcome_type: "binary",
    task_count: 10,
    models: [],
    conditions: ["none"],
    tokens_to_success: null,
    reliability: [],
    termination: [],
    ...over,
  })

  it("lists panels in display order for a full payload", () => {
    const full = payload({
      tokens_to_success: { curves: [{} as never], droppedModels: [] },
      reliability: [{} as never],
      termination: [{} as never],
    })
    expect(availableTrajectoryPanels(full)).toEqual(["tokens", "reliability", "termination"])
  })

  it("serves only termination for a graded-outcome page (healthbench shape)", () => {
    const graded = payload({ outcome_type: "graded", termination: [{} as never] })
    expect(availableTrajectoryPanels(graded)).toEqual(["termination"])
  })

  it("treats a tokens panel with zero curves as absent", () => {
    const empty = payload({ tokens_to_success: { curves: [], droppedModels: [] } })
    expect(availableTrajectoryPanels(empty)).toEqual([])
  })

  it("returns nothing for a missing payload", () => {
    expect(availableTrajectoryPanels(null)).toEqual([])
    expect(availableTrajectoryPanels(undefined)).toEqual([])
  })
})

describe("embed query-param normalization", () => {
  it("accepts exactly the three panel keys and defaults everything else to all-panels", () => {
    expect(parseTrajectoryPanelParam("tokens")).toBe("tokens")
    expect(parseTrajectoryPanelParam(" Reliability ")).toBe("reliability")
    expect(parseTrajectoryPanelParam("TERMINATION")).toBe("termination")
    expect(parseTrajectoryPanelParam("histogram")).toBeNull()
    expect(parseTrajectoryPanelParam("")).toBeNull()
    expect(parseTrajectoryPanelParam(null)).toBeNull()
  })

  it("accepts exactly the three feedback conditions and defaults everything else", () => {
    expect(parseFeedbackConditionParam("none")).toBe("none")
    expect(parseFeedbackConditionParam("Answer_Feedback")).toBe("answer_feedback")
    expect(parseFeedbackConditionParam("unknown")).toBe("unknown")
    expect(parseFeedbackConditionParam("oracle")).toBeNull()
    expect(parseFeedbackConditionParam(null)).toBeNull()
  })
})
