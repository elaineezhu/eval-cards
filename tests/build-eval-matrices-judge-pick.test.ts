import { describe, expect, it } from "vitest"

import { judgeRank, winsJudgePick } from "../scripts/build-eval-matrices.mjs"

// The prebaked matrix has ONE cell per (model, column). When the snapshot
// marks no headline on fact_results, a cell can be offered several judge
// arms; the builder has to pick one deterministically rather than average
// them into a number no source ever published.

describe("build-eval-matrices judge arm pick", () => {
  it("counts the panel behind a condition, tolerating junk", () => {
    expect(judgeRank(null)).toBe(0)
    expect(judgeRank("")).toBe(0)
    expect(judgeRank("not json")).toBe(0)
    expect(judgeRank('{"label":"score"}')).toBe(0)
    expect(judgeRank('{"judges":["a"],"label":"gpt_score"}')).toBe(1)
    expect(judgeRank('{"judges":["a","b","c"],"label":"score"}')).toBe(3)
  })

  it("prefers the widest panel, then the canonical condition ascending", () => {
    const panel = '{"judges":["a","b","c"],"label":"score"}'
    const single = '{"judges":["a"],"label":"gpt_score"}'
    const otherSingle = '{"judges":["b"],"label":"llama_score"}'

    // Nothing planted yet: anything wins.
    expect(winsJudgePick(undefined, null)).toBe(true)
    expect(winsJudgePick(undefined, single)).toBe(true)

    // A three-judge mean is the reading the source presents as its own.
    expect(winsJudgePick(single, panel)).toBe(true)
    expect(winsJudgePick(panel, single)).toBe(false)

    // Equal cardinality: the canonical JSON decides, so two runs of the
    // build agree.
    expect(winsJudgePick(otherSingle, single)).toBe(true)
    expect(winsJudgePick(single, otherSingle)).toBe(false)

    // An undisclosed judge loses to a disclosed panel and never displaces
    // an already-planted cell on a tie.
    expect(winsJudgePick(null, single)).toBe(true)
    expect(winsJudgePick(single, null)).toBe(false)
    expect(winsJudgePick(null, null)).toBe(false)
  })
})
