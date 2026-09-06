import { describe, expect, it } from "vitest"

import { reviveNonFiniteBounds } from "@/lib/hf-data"
import { mergeRegistryBounds, registryBoundsIsPercent } from "@/lib/score-scale"

describe("reviveNonFiniteBounds", () => {
  it("restores the registry stamp as an infinite number and nulls per-fact ranges", () => {
    const text = JSON.stringify({
      canonical_min_score: 1, canonical_max_score: "Infinity",
      metric_config: { min_score: "-Infinity", max_score: "Infinity" },
      min_score: "-Infinity", max_score: 100,
      display_name: "Infinity", nested: [{ max_score: "Infinity" }],
    })
    const parsed = JSON.parse(text, reviveNonFiniteBounds)
    expect(parsed.canonical_min_score).toBe(1)
    expect(parsed.canonical_max_score).toBe(Number.POSITIVE_INFINITY)
    expect(parsed.metric_config).toEqual({ min_score: null, max_score: null })
    expect(parsed.min_score).toBeNull()
    expect(parsed.max_score).toBe(100)
    expect(parsed.nested[0].max_score).toBeNull()
    expect(parsed.display_name).toBe("Infinity")
  })

  it("leaves finite and non-string bound values alone", () => {
    expect(reviveNonFiniteBounds("max_score", 1)).toBe(1)
    expect(reviveNonFiniteBounds("max_score", null)).toBeNull()
    expect(reviveNonFiniteBounds("max_score", "100")).toBe("100")
    expect(reviveNonFiniteBounds("label", "Infinity")).toBe("Infinity")
  })
})

describe("registryBoundsIsPercent with an open side", () => {
  it("reads an open-ended range as neither fraction nor percent", () => {
    expect(registryBoundsIsPercent({ min: 0, max: Number.POSITIVE_INFINITY })).toBeNull()
    expect(registryBoundsIsPercent({ min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY })).toBeNull()
    // A finite upper bound still settles the scale whatever the lower side.
    expect(registryBoundsIsPercent({ min: Number.NEGATIVE_INFINITY, max: 1 })).toBe(false)
  })
})

describe("mergeRegistryBounds with infinite bounds", () => {
  it("treats an infinite bound as no bound on that side", () => {
    const merged = mergeRegistryBounds([{ min: 1, max: Number.POSITIVE_INFINITY }])
    expect(merged).toEqual({ min: 1, max: null })
    expect(registryBoundsIsPercent(merged)).toBeNull()
  })
})

describe("wire form round trip through the app's own JSON hops", () => {
  it("keeps the registry stamp across stringify and parse, and nulls per-fact ranges", async () => {
    const { parseJsonWithBounds, stringifyJsonWithBounds } = await import("@/lib/json-bounds")
    const revived = parseJsonWithBounds<{
      canonical_max_score: number | null
      metric_config: { max_score: number | null }
    }>(JSON.stringify({ canonical_max_score: "Infinity", metric_config: { max_score: "Infinity" } }))
    expect(revived.canonical_max_score).toBe(Number.POSITIVE_INFINITY)
    expect(revived.metric_config.max_score).toBeNull()
    // Re-serving (API routes, the clean-hierarchy disk cache) must not turn
    // the infinity into null the way a bare JSON.stringify does.
    const text = stringifyJsonWithBounds(revived)
    expect(text).toContain('"canonical_max_score":"Infinity"')
    expect(JSON.stringify(revived)).toContain('"canonical_max_score":null')
    expect(parseJsonWithBounds<typeof revived>(text).canonical_max_score).toBe(Number.POSITIVE_INFINITY)
  })
})

describe("fetchComparisonIndex (v2 sidecar) applies the reviver", () => {
  it("delivers the registry stamp as a number, not the wire string", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises")
    const os = await import("node:os")
    const path = await import("node:path")
    const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "eval-card-inf-"))
    const previousBackend = process.env.DATA_BACKEND
    const previousSnapshotUrl = process.env.SNAPSHOT_URL
    const fixture = {
      generated_at: "2026-09-06T00:00:00Z",
      config_version: 2,
      metric_group_order: ["capability", "other"],
      evals: {
        "lm-eval%2Fwikitext": {
          evaluation_id: "lm-eval%2Fwikitext",
          benchmark_id: "wikitext",
          family_id: null,
          family_display_name: null,
          composite_slug: "lm-eval",
          composite_display_name: "lm-eval",
          parent_benchmark_id: null,
          display_name: "WikiText",
          category: "Language",
          is_slice: false,
          is_summary_score: false,
          summary_score_for: null,
          metrics: [
            {
              metric_summary_id: "wikitext::perplexity",
              metric_name: "Perplexity",
              metric_id: "perplexity",
              metric_key: "perplexity",
              group: "other",
              group_order: 1,
              lower_is_better: true,
              unit: null,
              canonical_min_score: 1,
              canonical_max_score: "Infinity",
              scores: [],
            },
          ],
        },
      },
      by_model: {},
    }
    try {
      await writeFile(path.join(snapshotDir, "comparison-index.json"), JSON.stringify(fixture))
      process.env.DATA_BACKEND = "v2"
      process.env.SNAPSHOT_URL = `file://${snapshotDir}`
      const sidecars = await import("../lib/sidecars")
      sidecars.resetSidecarCacheForTests()
      const index = await sidecars.fetchComparisonIndex()
      const metric = index.evals["lm-eval%2Fwikitext"].metrics[0]
      expect(metric.canonical_min_score).toBe(1)
      expect(metric.canonical_max_score).toBe(Number.POSITIVE_INFINITY)
      expect(typeof metric.canonical_max_score).toBe("number")
      expect(registryBoundsIsPercent({ min: metric.canonical_min_score, max: metric.canonical_max_score })).toBeNull()
    } finally {
      const sidecars = await import("../lib/sidecars")
      sidecars.resetSidecarCacheForTests()
      if (previousBackend == null) delete process.env.DATA_BACKEND
      else process.env.DATA_BACKEND = previousBackend
      if (previousSnapshotUrl == null) delete process.env.SNAPSHOT_URL
      else process.env.SNAPSHOT_URL = previousSnapshotUrl
      await rm(snapshotDir, { recursive: true, force: true })
    }
  })
})
