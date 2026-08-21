import { describe, expect, it } from "vitest"

import {
  buildCollectionAttachment,
  buildComputeMarks,
  buildComputeProtocolSeries,
  chooseComputeAxis,
  feedbackConditionOf,
  hasMismatchedConditionBudgets,
} from "@/lib/collections"

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
