import { describe, expect, it } from "vitest"

import { familyRowLabel } from "@/components/family-table"

type Leaf = Parameters<typeof familyRowLabel>[1][number]

function leaf(leafKey: string, leafName: string): Leaf {
  return {
    id: leafKey, evalIds: [leafKey], benchmarkId: leafKey, leafKey, leafName,
    evalsCount: 1, sliceCount: 0, domains: [], tags: [],
  }
}

describe("familyRowLabel", () => {
  it("keeps a curated name that merely slugifies to the key", () => {
    // Before: slugify("aiXamine") === "aixamine" tripped the raw-slug rule and
    // the row rendered "Aixamine". Same for HELM, MMMU, LiveBench, CapArena.
    expect(familyRowLabel({ key: "aixamine", display_name: "aiXamine" }, [])).toBe("aiXamine")
    expect(familyRowLabel({ key: "helm", display_name: "HELM" }, [])).toBe("HELM")
    expect(familyRowLabel({ key: "livebench", display_name: "LiveBench" }, [])).toBe("LiveBench")
    expect(familyRowLabel({ key: "caparena", display_name: "CapArena" }, [])).toBe("CapArena")
  })

  it("still humanizes a raw slug that was never given a display name", () => {
    expect(familyRowLabel({ key: "commonsense-qa", display_name: "commonsense_qa" }, [])).toBe("Commonsense-QA")
    expect(familyRowLabel({ key: "gsm8k", display_name: "gsm8k" }, [])).toBe("Gsm8k")
    expect(familyRowLabel({ key: "big-bench-hard", display_name: "big-bench-hard" }, [])).toBe("Big-Bench-Hard")
  })

  it("still humanizes a family named after one of its leaves", () => {
    // An MMLU-Pro family whose display was copy-pasted from the MMLU leaf must
    // not render as "MMLU": that is a different, well-known benchmark.
    const leaves = [leaf("mmlu", "MMLU"), leaf("mmlu-pro-cot", "MMLU-Pro (CoT)")]
    expect(familyRowLabel({ key: "mmlu-pro", display_name: "MMLU" }, leaves)).toBe("Mmlu-Pro")
  })

  it("humanizes a display name copy-pasted from an unrelated leaf", () => {
    const leaves = [leaf("gsm-mc", "wasp (Writer's Assessor)"), leaf("wasp", "wasp (Writer's Assessor)")]
    expect(familyRowLabel({ key: "gsm-mc", display_name: "wasp (Writer's Assessor)" }, leaves)).toBe("Gsm-Mc")
  })
})
