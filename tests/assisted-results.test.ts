import { describe, expect, it } from "vitest"

import { isAssistedResult } from "@/lib/eval-processing"

// Assisted (oracle answer-feedback) classification drives shown-but-unranked
// leaderboard handling; misclassification either ranks an assisted run or
// strips a rank from a clean one.
describe("isAssistedResult", () => {
  it("classifies the answer_feedback arm", () => {
    expect(
      isAssistedResult(
        '{"compaction":false,"feedback":"answer_feedback","scaffold":"S-adaptive","token_limit":5000000}',
      ),
    ).toBe(true)
  })

  it("keeps clean and unknown arms unassisted", () => {
    expect(isAssistedResult('{"feedback":"none"}')).toBe(false)
    expect(isAssistedResult('{"feedback":"unknown"}')).toBe(false)
    expect(isAssistedResult('{"token_limit":5000000}')).toBe(false)
  })

  it("treats absent/invalid protocol data as unassisted", () => {
    expect(isAssistedResult(undefined)).toBe(false)
    expect(isAssistedResult(null)).toBe(false)
    expect(isAssistedResult("")).toBe(false)
    expect(isAssistedResult("not json")).toBe(false)
    expect(isAssistedResult('"answer_feedback"')).toBe(false)
  })
})
