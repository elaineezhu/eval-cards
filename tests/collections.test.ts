import { describe, expect, it } from "vitest"

import {
  buildCollectionAttachment,
  buildComputeMarks,
  buildComputeProtocolSeries,
  buildScaffoldContext,
  chooseComputeAxis,
  feedbackConditionOf,
  hasMismatchedConditionBudgets,
  type CollectionContextSidecar,
  type ScaffoldContextEntry,
  type ScaffoldContextSummaryInput,
} from "@/lib/collections"

import contextFixture from "./fixtures/collection_context.json"

const cond = (fields: Record<string, unknown>) => JSON.stringify(fields)

describe("feedbackConditionOf", () => {
  it("classifies the three feedback conditions and keeps unknown unknown", () => {
    expect(feedbackConditionOf(cond({ feedback: "none" }))).toBe("none")
    expect(feedbackConditionOf(cond({ feedback: "answer_feedback" }))).toBe("answer_feedback")
    expect(feedbackConditionOf(cond({ feedback: "unknown" }))).toBe("unknown")
    // Missing/unparseable never promotes to a clean condition.
    expect(feedbackConditionOf(cond({ token_limit: 5 }))).toBe("unknown")
    expect(feedbackConditionOf("not json")).toBe("unknown")
    expect(feedbackConditionOf(null)).toBe("unknown")
  })
})

describe("chooseComputeAxis (R1 axis selection)", () => {
  it("prefers token_limit when it varies within a condition", () => {
    const axis = chooseComputeAxis([
      cond({ feedback: "none", token_limit: 2_000_000, reasoning_tokens: 16000 }),
      cond({ feedback: "none", token_limit: 5_000_000, reasoning_tokens: 32000 }),
    ])
    expect(axis?.key).toBe("token_limit")
    expect(axis?.label).toBe("token budget (limit)")
  })

  it("falls back to reasoning_tokens when token_limit is constant within every condition", () => {
    const axis = chooseComputeAxis([
      cond({ feedback: "none", token_limit: 5_000_000, reasoning_tokens: 16000 }),
      cond({ feedback: "none", token_limit: 5_000_000, reasoning_tokens: 32000 }),
      cond({ feedback: "answer_feedback", token_limit: 5_000_000, reasoning_tokens: 32000 }),
    ])
    expect(axis?.key).toBe("reasoning_tokens")
    expect(axis?.label).toBe("reasoning-token allowance")
  })

  it("ignores cross-condition variation: within-condition cardinality only", () => {
    // token_limit differs BETWEEN conditions but is constant within each —
    // plotting that would assert an unmatched-budget comparison.
    const axis = chooseComputeAxis([
      cond({ feedback: "none", token_limit: 2_000_000 }),
      cond({ feedback: "answer_feedback", token_limit: 5_000_000 }),
    ])
    expect(axis).toBeNull()
  })

  it("returns null when nothing numeric varies within a condition (frontiermath)", () => {
    const axis = chooseComputeAxis([
      cond({ feedback: "none", compaction: false, token_limit: null, reasoning_tokens: null }),
      cond({ feedback: "answer_feedback", compaction: true, token_limit: null, reasoning_tokens: null }),
    ])
    expect(axis).toBeNull()
  })
})

describe("buildComputeMarks (R1 marks)", () => {
  const rows = [
    { score: 0.4, protocol_condition: cond({ feedback: "none", token_limit: 2_000_000 }), model_info: { name: "A" } },
    { score: 0.5, protocol_condition: cond({ feedback: "none", token_limit: 5_000_000 }), model_info: { name: "A" } },
    { score: 0.7, protocol_condition: cond({ feedback: "answer_feedback", token_limit: 5_000_000 }), model_info: { name: "A" } },
    // Protocol row without a numeric value on the axis → omitted + counted.
    { score: 0.3, protocol_condition: cond({ feedback: "none", token_limit: null }), model_info: { name: "B" } },
    // Ordinary row (no protocol) → not part of the scatter, not counted.
    { score: 0.9, protocol_condition: null, model_info: { name: "C" } },
  ]

  it("keeps assisted marks (labeled by condition) and counts null-axis rows as omitted", () => {
    const { marks, omitted } = buildComputeMarks(rows, "token_limit")
    expect(marks).toHaveLength(3)
    expect(omitted).toBe(1)
    expect(marks.map((m) => m.condition)).toEqual(["none", "none", "answer_feedback"])
    expect(marks.every((m) => m.modelName === "A")).toBe(true)
  })

  it("flags mismatched condition budgets only when nominal sets differ", () => {
    const { marks } = buildComputeMarks(rows, "token_limit")
    // no-feedback condition at {2M, 5M}, assisted at {5M} → mismatched.
    expect(hasMismatchedConditionBudgets(marks)).toBe(true)
    const matched = buildComputeMarks(
      rows.filter((r) => r.score !== 0.4),
      "token_limit",
    ).marks
    // Both conditions only at 5M → matched.
    expect(hasMismatchedConditionBudgets(matched)).toBe(false)
  })
})

describe("buildCollectionAttachment (R1.2)", () => {
  const entry = {
    curated: true,
    display_name: "How Inference Compute Shapes Frontier LLM Evaluation",
    url: "https://example.test/paper",
    has_trajectories: true,
    outcome_type: { swebenchpro: "binary", terminalbench: "binary", healthbench: "graded" },
  }
  const conditions = [
    cond({ feedback: "none", token_limit: 2_000_000 }),
    cond({ feedback: "none", token_limit: 5_000_000 }),
  ]

  it("attaches curated entries with the chosen axis", () => {
    const attachment = buildCollectionAttachment("uk-x", entry, "swe-bench-pro", conditions)
    expect(attachment).toMatchObject({
      collection_id: "uk-x",
      curated: true,
      has_trajectories: true,
      compute_axis: { key: "token_limit" },
      // Separator-stripped match: swe-bench-pro → swebenchpro.
      outcome_type: "binary",
    })
  })

  it("never attaches uncurated or missing entries", () => {
    expect(buildCollectionAttachment("c", { curated: false, display_name: "X" }, "b", [])).toBeNull()
    expect(buildCollectionAttachment("c", undefined, "b", [])).toBeNull()
  })

  it("leaves outcome_type absent rather than guessing a near-miss key", () => {
    // terminal-bench-2 normalizes to terminalbench2, which is NOT the
    // sidecar's terminalbench key — declared absence, not a guess.
    const attachment = buildCollectionAttachment("uk-x", entry, "terminal-bench-2", conditions)
    expect(attachment?.outcome_type).toBeUndefined()
  })
})

describe("buildComputeProtocolSeries (shared page/embed compute feed)", () => {
  const attachment = {
    collection_id: "uk-aisi-inference-scaling",
    display_name: "Study",
    curated: true as const,
    compute_axis: { key: "reasoning_tokens", label: "reasoning-token allowance", unit: "tokens" },
  }
  const row = (score: number, fields: Record<string, unknown> | null, name = "m") => ({
    score,
    protocol_condition: fields ? cond(fields) : null,
    model_info: { name },
  })

  it("builds marks, omitted count, and the mismatched-budget flag from the attachment's axis", () => {
    const series = buildComputeProtocolSeries(
      [
        row(0.4, { feedback: "none", reasoning_tokens: 16000 }),
        row(0.5, { feedback: "none", reasoning_tokens: 64000 }),
        row(0.6, { feedback: "answer_feedback", reasoning_tokens: 32000 }),
        // Null on the chosen axis: omitted from the plot, counted in the caption.
        row(0.7, { feedback: "answer_feedback", reasoning_tokens: null }),
        // No protocol at all: skipped silently, exactly like the marks builder.
        row(0.8, null),
      ],
      attachment,
      true,
    )
    expect(series).not.toBeNull()
    expect(series!.axisLabel).toBe("reasoning-token allowance")
    expect(series!.marks).toHaveLength(3)
    expect(series!.omitted).toBe(1)
    expect(series!.mismatchedConditionBudgets).toBe(true)
    expect(series!.researcherMode).toBe(true)
  })

  it("returns null without the attachment even when rows carry protocol fields (merged-shaped summary)", () => {
    const rows = [
      row(0.4, { feedback: "none", reasoning_tokens: 16000 }),
      row(0.5, { feedback: "none", reasoning_tokens: 64000 }),
    ]
    expect(buildComputeProtocolSeries(rows, undefined, false)).toBeNull()
    expect(buildComputeProtocolSeries(rows, null, false)).toBeNull()
  })

  it("returns null when the server chose no axis (frontiermath) or the entry is uncurated", () => {
    const rows = [row(0.4, { feedback: "none", reasoning_tokens: 16000 })]
    expect(
      buildComputeProtocolSeries(rows, { ...attachment, compute_axis: null }, false),
    ).toBeNull()
    expect(
      buildComputeProtocolSeries(rows, { ...attachment, curated: false as never }, false),
    ).toBeNull()
  })

  it("returns null when no row yields a mark, so callers render absence rather than an empty plot", () => {
    const series = buildComputeProtocolSeries(
      [row(0.4, { feedback: "none", reasoning_tokens: null }), row(0.5, null)],
      attachment,
      false,
    )
    expect(series).toBeNull()
  })
})

describe("buildScaffoldContext (Context view payload, finding I1)", () => {
  const sidecar = contextFixture as unknown as CollectionContextSidecar
  const entry = sidecar["uk-aisi-inference-scaling"]["terminal-bench-2"]

  // The terminal-bench-2 conditions the page's ranked list actually shows,
  // verbatim from eval_results_view.
  const AISI = {
    opus45Fullest:
      '{"compaction":false,"feedback":"none","reasoning_effort":"xhigh","reasoning_tokens":64000,"scaffold":"S-adaptive","token_limit":10000000}',
    opus46Fullest:
      '{"compaction":false,"feedback":"none","reasoning_effort":null,"reasoning_tokens":null,"scaffold":"S-adaptive","token_limit":10000000}',
    opus46Best:
      '{"compaction":false,"feedback":"none","reasoning_effort":"high","reasoning_tokens":32000,"scaffold":"S-adaptive","token_limit":10000000}',
    gpt5Fullest:
      '{"compaction":false,"feedback":"none","reasoning_effort":"high","reasoning_tokens":64000,"scaffold":"S-adaptive","token_limit":10000000}',
    gpt52Best:
      '{"compaction":false,"feedback":"none","reasoning_effort":"high","reasoning_tokens":32000,"scaffold":"S-adaptive","token_limit":10000000}',
    gpt52Fullest:
      '{"compaction":false,"feedback":"none","reasoning_effort":"high","reasoning_tokens":null,"scaffold":"S-adaptive","token_limit":10000000}',
    assisted:
      '{"compaction":true,"feedback":"answer_feedback","reasoning_effort":"high","reasoning_tokens":16000,"scaffold":"S-adaptive","token_limit":10000000}',
  }

  const modelRow = (
    id: string,
    name: string,
    score: number,
    condition: string,
  ): ScaffoldContextSummaryInput["model_results"][number] => ({
    score,
    protocol_condition: condition,
    model_route_id: id.replace("/", "%2F"),
    model_group_id: id,
    model_info: { name, id },
  })

  // The page as it really is: opus-4.5 and gpt-5 have exactly one
  // no-feedback row (the one the sidecar shows), opus-4.6 and gpt-5.2
  // have a higher-scoring one at a different condition.
  const summary: ScaffoldContextSummaryInput = {
    evaluation_name: "Terminal-Bench 2.0",
    canonical_display_name: "Terminal-Bench 2.0",
    collection: { display_name: "UK AISI inference scaling" },
    model_results: [
      modelRow("anthropic/claude-opus-4.5", "Claude Opus 4.5", 0.563258, AISI.opus45Fullest),
      modelRow("anthropic/claude-opus-4.6", "Claude Opus 4.6", 0.9286, AISI.opus46Best),
      modelRow("anthropic/claude-opus-4.6", "Claude Opus 4.6", 0.666667, AISI.opus46Fullest),
      modelRow("openai/gpt-5", "GPT-5", 0.496717, AISI.gpt5Fullest),
      modelRow("openai/gpt-5.2", "GPT-5.2", 0.6875, AISI.gpt52Best),
      modelRow("openai/gpt-5.2", "GPT-5.2", 0.604457, AISI.gpt52Fullest),
      // An assisted row scoring higher than every clean row must never
      // become the caption-3 comparison target.
      modelRow("anthropic/claude-opus-4.5", "Claude Opus 4.5", 0.98, AISI.assisted),
    ],
  }

  it("fires caption 3 only for models whose fullest condition is not their best-scoring one", () => {
    const payload = buildScaffoldContext(entry, summary)
    expect(payload).not.toBeNull()
    const fires = Object.fromEntries(
      payload!.models.map((m) => [m.key, m.conditionDiffersFromBestScoring]),
    )
    expect(fires).toEqual({
      // Single no-feedback condition: the sidecar string IS the best row.
      "anthropic/claude-opus-4.5": false,
      "openai/gpt-5": false,
      // Fullest-coverage condition scores below the best-scoring one.
      "anthropic/claude-opus-4.6": true,
      "openai/gpt-5.2": true,
    })
  })

  it("never fires caption 3 from a row the page does not carry", () => {
    // No matching model row at all — we cannot see a difference, so we
    // must not assert one.
    const payload = buildScaffoldContext(entry, { ...summary, model_results: [] })
    expect(payload!.models.every((m) => m.conditionDiffersFromBestScoring)).toBe(false)
  })

  it("resolves display names from the sidecar and carries the caption inputs", () => {
    const payload = buildScaffoldContext(entry, summary)!
    expect(payload.models.map((m) => m.displayName)).toEqual([
      "Claude Opus 4.5",
      "Claude Opus 4.6",
      "GPT-5",
      "GPT-5.2",
    ])
    expect(payload).toMatchObject({
      harvestedAt: "2026-08-23T00:00:00Z",
      officialTaskCount: 89,
      // Caption 1 names the producer-resolved display string, never an id.
      contextSourceDisplay: "Terminal-Bench 2.0",
      contextSources: [{ id: "terminal-bench-2-0", display_name: "Terminal-Bench 2.0" }],
      // Producer-computed, never derived from a client-side join.
      modelsWithoutContext: ["Claude Opus 4", "GPT-5.4"],
      benchmarkLabel: "Terminal-Bench 2.0",
      collectionLabel: "UK AISI inference scaling",
      hiddenTotal: 0,
    })
    const opus46 = payload.models.find((m) => m.key === "anthropic/claude-opus-4.6")!
    expect(opus46).toMatchObject({
      score: 0.666667,
      nTasks: 86,
      bandRuns: 5,
      attemptsMin: 1,
      attemptsMax: 4,
      hiddenCount: 0,
    })
    expect(opus46.points).toHaveLength(10)
    expect(opus46.points[0]).toEqual({
      scaffold: "Meta-Harness",
      score: 0.764,
      scoreSe: 0.024,
      runDate: "2026-05-14",
    })
    // The published score is NOT the band midpoint — a thin-attempt model
    // sits at its upper edge, which is why the band must never be drawn
    // as if it were centred on the diamond.
    expect(opus46.score).toBeGreaterThan((opus46.bandLo + opus46.bandHi) / 2)
    // Caption 2's attempts range spans the strips: 1 (opus-4.6, gpt-5.2)
    // through 10 (opus-4.5, gpt-5).
    expect(Math.min(...payload.models.map((m) => m.attemptsMin))).toBe(1)
    expect(Math.max(...payload.models.map((m) => m.attemptsMax))).toBe(10)
  })

  it("falls back to the aggregation key when the sidecar carries no display name", () => {
    const nameless: ScaffoldContextEntry = {
      ...entry,
      models: {
        "openai/gpt-5": { ...entry.models["openai/gpt-5"], display_name: "  " },
      },
    }
    expect(buildScaffoldContext(nameless, summary)!.models[0].displayName).toBe("openai/gpt-5")
  })

  it("keeps both extremes when the >30 rule fires and reports the hidden count", () => {
    // 41 points; the min and the max are the two the finding is about.
    const external = Array.from({ length: 41 }, (_, i) => ({
      scaffold: `scaffold-${String(i).padStart(2, "0")}`,
      score: 0.30 + i * 0.01,
      score_se: null,
      run_date: "2026-01-01",
    }))
    const wide: ScaffoldContextEntry = {
      ...entry,
      models: {
        "openai/gpt-5": { ...entry.models["openai/gpt-5"], external: external.slice().reverse() },
      },
    }
    const model = buildScaffoldContext(wide, summary)!.models[0]
    expect(model.points).toHaveLength(30)
    expect(model.hiddenCount).toBe(11)
    const scores = model.points.map((p) => p.score)
    expect(Math.min(...scores)).toBeCloseTo(0.3, 10)
    expect(Math.max(...scores)).toBeCloseTo(0.7, 10)
    // Producer emit order (score desc) is preserved among the survivors.
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it("returns null when the sidecar has no entry or the entry has no models", () => {
    expect(buildScaffoldContext(undefined, summary)).toBeNull()
    expect(buildScaffoldContext(null, summary)).toBeNull()
    expect(buildScaffoldContext({ ...entry, models: {} }, summary)).toBeNull()
  })
})
