import { describe, expect, it } from "vitest"

import { isMergedEvalId, routeIdFromSegments, routeIdToPath } from "@/lib/utils"

// F7 — routeIdFromSegments must invert Next's percent-decoding of catch-all
// params back to the producer's stored id form, which is Python
// `urllib.parse.quote(value, safe="")` (everything except [A-Za-z0-9_.~-]
// encoded, uppercase hex). Expected strings below were generated with:
//   python3 -c "from urllib.parse import quote; print(quote(<value>, safe=''))"

describe("routeIdFromSegments", () => {
  it("joins a plain two-segment id with %2F", () => {
    expect(routeIdFromSegments(["llm-stats", "drop"])).toBe("llm-stats%2Fdrop")
  })

  it("re-encodes spaces and @ in raw-key segments (Python quote semantics)", () => {
    expect(
      routeIdFromSegments(["llm-stats", "OpenAI MRCR v2 8-needle @ 128K-256K"]),
    ).toBe("llm-stats%2FOpenAI%20MRCR%20v2%208-needle%20%40%20128K-256K")
  })

  it("encodes apostrophes and parens that encodeURIComponent leaves bare", () => {
    expect(routeIdFromSegments(["hle", "Humanity's Last Exam (accuracy)"])).toBe(
      "hle%2FHumanity%27s%20Last%20Exam%20%28accuracy%29",
    )
  })

  it("splits a pre-joined string on / before encoding", () => {
    expect(routeIdFromSegments("llm-stats/drop")).toBe("llm-stats%2Fdrop")
  })

  it("returns empty string for undefined and empty inputs", () => {
    expect(routeIdFromSegments(undefined)).toBe("")
    expect(routeIdFromSegments([])).toBe("")
    expect(routeIdFromSegments("")).toBe("")
  })

  it("is idempotent for segments that arrive still-encoded", () => {
    // Next has been inconsistent about decoding server params vs useParams();
    // an already-encoded segment must converge to the same canonical form.
    expect(routeIdFromSegments(["Mistral%20AI"])).toBe("Mistral%20AI")
    expect(routeIdFromSegments(["Mistral AI"])).toBe("Mistral%20AI")
    // A fully %2F-joined stored route id passed through as a plain string.
    expect(routeIdFromSegments("llm-stats%2Fdrop")).toBe("llm-stats%2Fdrop")
  })

  it("handles a literal % that survives decoding (malformed encoding)", () => {
    // decodeURIComponent("%") throws; the loose decoder keeps the raw value,
    // which then encodes to %25 — matching quote("%", safe="") in Python.
    expect(routeIdFromSegments(["100% accuracy"])).toBe("100%25%20accuracy")
  })

  it("round-trips through routeIdToPath", () => {
    const id = "llm-stats%2FOpenAI%20MRCR%20v2%208-needle%20%40%20128K-256K"
    expect(routeIdFromSegments(routeIdToPath(id))).toBe(id)

    const plain = "llm-stats%2Fdrop"
    expect(routeIdFromSegments(routeIdToPath(plain))).toBe(plain)
  })
})

// F2 — merged benchmark routing discriminator: single-segment ids (no %2F
// after normalization) are merged pages; per-source evaluation_ids always
// carry %2F.
describe("isMergedEvalId", () => {
  it("classifies single-segment ids as merged", () => {
    expect(isMergedEvalId("mmlu-pro")).toBe(true)
    expect(isMergedEvalId(["mmlu-pro"])).toBe(true)
    // Raw-key merged ids with encoded characters are still one segment.
    expect(isMergedEvalId(["Humanity's Last Exam (accuracy)"])).toBe(true)
  })

  it("classifies per-source two-segment ids as NOT merged", () => {
    expect(isMergedEvalId("llm-stats%2Fdrop")).toBe(false)
    expect(isMergedEvalId(["llm-stats", "drop"])).toBe(false)
    expect(isMergedEvalId("llm-stats/drop")).toBe(false)
  })

  it("treats empty input as not merged", () => {
    expect(isMergedEvalId(undefined)).toBe(false)
    expect(isMergedEvalId("")).toBe(false)
    expect(isMergedEvalId([])).toBe(false)
  })
})
