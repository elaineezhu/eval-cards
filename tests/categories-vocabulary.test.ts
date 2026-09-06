import { describe, expect, it } from "vitest"

import categories from "@/data/benchmarks/categories.json"
import { EVALUATION_TAGS, inferTagsFromBenchmark } from "@/lib/benchmark-schema"

describe("data/benchmarks/categories.json", () => {
  it("uses only the evaluation tag vocabulary", () => {
    const vocab = new Set<string>(EVALUATION_TAGS)
    const bad = Object.entries(categories as Record<string, string[]>)
      .filter(([, tags]) => tags.length === 0 || tags.some((t) => !vocab.has(t)))
      .map(([name]) => name)
    expect(bad).toEqual([])
  })
})

describe("inferTagsFromBenchmark fallback stems", () => {
  it("matches stems inside compound names and keeps word alternatives anchored", () => {
    expect(inferTagsFromBenchmark("WildHallucinations")).toContain("hallucination")
    expect(inferTagsFromBenchmark("MMRobustness")).toContain("robustness")
    expect(inferTagsFromBenchmark("AgentDojo")).toContain("agentic")
    expect(inferTagsFromBenchmark("Anti-Corruption Law QA")).toEqual(["law"])
    expect(inferTagsFromBenchmark("Reagents Chemistry QA")).not.toContain("agentic")
    expect(inferTagsFromBenchmark("T2I-FactualBench")).toEqual(["hallucination"])
    expect(inferTagsFromBenchmark("corrupted_weather_records")).toEqual(["robustness"])
  })

  it("takes the first matching rule, like the producer", () => {
    expect(inferTagsFromBenchmark("SWE-bench-Live")).toEqual(["agentic"])
    expect(inferTagsFromBenchmark("civil_comments")).toEqual(["safety"])
  })
})
