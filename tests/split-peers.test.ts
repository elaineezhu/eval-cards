import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PeerCaption, buildBenchmarkHistograms } from "@/components/benchmark-detail"
import type {
  ComparisonEvalEntry,
  ComparisonIndex,
  ComparisonMetricEntry,
  ComparisonScoreEntry,
} from "@/lib/backend-artifacts"
import {
  bestPerModel,
  buildBenchmarkEntryIndex,
  collectPeerObservations,
  collectPeerObservationsFrom,
  competitionRank,
  normaliseSplitLabel,
  partitionPeers,
  peerCaption,
} from "@/lib/split-peers"

function score(
  modelRouteId: string,
  value: number,
  split: string | null,
  overrides: Partial<ComparisonScoreEntry> = {},
): ComparisonScoreEntry {
  return {
    model_route_id: modelRouteId,
    model_family_id: modelRouteId,
    model_group_id: "",
    model_family_name: "",
    developer: "acme",
    variant_key: modelRouteId,
    score: value,
    rank: 1,
    total: 1,
    submission_count: 1,
    submission_axis: "default",
    split,
    ...overrides,
  }
}

function metric(
  scores: ComparisonScoreEntry[],
  overrides: Partial<ComparisonMetricEntry> = {},
): ComparisonMetricEntry {
  return {
    metric_summary_id: "accuracy",
    metric_name: "Accuracy",
    metric_id: "accuracy",
    metric_key: "accuracy",
    group: "capability",
    group_order: 0,
    lower_is_better: false,
    unit: null,
    scores,
    ...overrides,
  }
}

function evalEntry(
  evaluationId: string,
  slug: string,
  metrics: ComparisonMetricEntry[],
  overrides: Partial<ComparisonEvalEntry> = {},
): ComparisonEvalEntry {
  return {
    evaluation_id: evaluationId,
    benchmark_id: "mmlu",
    family_id: slug,
    family_display_name: slug,
    composite_slug: slug,
    composite_display_name: slug,
    parent_benchmark_id: null,
    display_name: "MMLU",
    category: "knowledge",
    is_slice: false,
    is_summary_score: false,
    summary_score_for: null,
    metrics,
    ...overrides,
  }
}

function index(
  evals: Record<string, ComparisonEvalEntry>,
  version?: number,
): ComparisonIndex {
  return {
    generated_at: "2026-09-17T00:00:00Z",
    config_version: 2,
    ...(version != null ? { comparison_index_version: version } : {}),
    metric_group_order: ["capability"],
    evals,
  }
}

const CURRENT_KEYS = new Set(["apertus/8b"])

function observationsOf(evals: Record<string, ComparisonEvalEntry>) {
  return collectPeerObservations(index(evals, 2), "mmlu", "accuracy", false, CURRENT_KEYS)
}

describe("normaliseSplitLabel", () => {
  it("normalises the recognised vocabulary and demotes everything else", () => {
    expect(normaliseSplitLabel("train")).toBe("train")
    expect(normaliseSplitLabel("TEST")).toBe("test")
    expect(normaliseSplitLabel("validation")).toBe("validation")
    expect(normaliseSplitLabel("val")).toBe("validation")
    expect(normaliseSplitLabel(" dev ")).toBe("validation")
    expect(normaliseSplitLabel("gpt")).toBeNull()
    expect(normaliseSplitLabel("small")).toBeNull()
    expect(normaliseSplitLabel(null)).toBeNull()
    expect(normaliseSplitLabel(undefined)).toBeNull()
  })
})

describe("partitionPeers", () => {
  it("(a) treats every unlabelled peer as included when the current model states a split", () => {
    const observations = observationsOf({
      s1: evalEntry("s1", "s1", [metric([score("p1", 0.9, null), score("p2", 0.4, null)])]),
    })
    const parts = partitionPeers("validation", observations)
    expect(parts.compared).toHaveLength(0)
    expect(parts.unknown).toHaveLength(2)
    expect(parts.excluded).toHaveLength(0)

    const eligible = bestPerModel([...parts.compared, ...parts.unknown], false)
    const rank = competitionRank(0.5, eligible, false)
    expect(rank).toEqual({ position: 2, total: 3 })
    expect(
      peerCaption({
        ...rank,
        sourceCount: 2,
        currentLabel: "validation",
        unknownCount: eligible.filter((o) => o.label == null).length,
        anyPeerLabelled: false,
        excludedByLabel: parts.excludedByLabel,
      }).text,
    ).toBe("Rank 2 of 3 across 2 sources · 2 with no reported split")
  })

  it("(b) splits a test/null/train mix into compared, unknown and excluded", () => {
    const observations = observationsOf({
      s1: evalEntry("s1", "s1", [metric([score("p1", 0.9, "test")])]),
      s2: evalEntry("s2", "s2", [
        metric([score("p2", 0.8, null), score("p3", 0.95, "train"), score("p4", 0.7, "train")]),
      ]),
    })
    const parts = partitionPeers("test", observations)
    expect(parts.compared.map((o) => o.modelRouteId)).toEqual(["p1"])
    expect(parts.unknown.map((o) => o.modelRouteId)).toEqual(["p2"])
    expect(parts.excluded.map((o) => o.modelRouteId)).toEqual(["p3", "p4"])
    expect(parts.excludedByLabel).toEqual({ train: 2 })

    const eligible = bestPerModel([...parts.compared, ...parts.unknown], false)
    const rank = competitionRank(0.6, eligible, false)
    expect(rank).toEqual({ position: 3, total: 3 })
    expect(
      peerCaption({
        ...rank,
        sourceCount: 3,
        currentLabel: "test",
        unknownCount: eligible.filter((o) => o.label == null).length,
        anyPeerLabelled: true,
        excludedByLabel: parts.excludedByLabel,
      }).text,
    ).toBe(
      "Rank 3 of 3 across 3 sources · 1 with no reported split · 2 on train excluded (reported label differs)",
    )
  })

  it("(c) includes every peer when the current model reports no split", () => {
    const observations = observationsOf({
      s1: evalEntry("s1", "s1", [metric([score("p1", 0.9, "test"), score("p3", 0.4, null)])]),
      s2: evalEntry("s2", "s2", [metric([score("p2", 0.8, "train")])]),
    })
    const parts = partitionPeers(null, observations)
    expect(parts.compared).toHaveLength(0)
    expect(parts.unknown).toHaveLength(3)
    expect(parts.excludedByLabel).toEqual({})

    const eligible = bestPerModel(parts.unknown, false)
    const rank = competitionRank(0.5, eligible, false)
    expect(rank).toEqual({ position: 3, total: 4 })
    expect(
      peerCaption({
        ...rank,
        sourceCount: 3,
        currentLabel: null,
        unknownCount: eligible.length,
        anyPeerLabelled: true,
        excludedByLabel: parts.excludedByLabel,
      }).text,
    ).toBe("Rank 3 of 4 across 3 sources · compared as split unknown")
  })

  it("(f) keeps the best eligible observation per model and counts a duplicate once", () => {
    const observations = observationsOf({
      s1: evalEntry("s1", "s1", [metric([score("p1", 0.6, "test"), score("p2", 0.5, "train")])]),
      s2: evalEntry("s2", "s2", [metric([score("p1", 0.8, null), score("p2", 0.9, "train")])]),
    })
    const parts = partitionPeers("test", observations)
    expect(parts.excludedByLabel).toEqual({ train: 1 })

    const eligible = bestPerModel([...parts.compared, ...parts.unknown], false)
    expect(eligible.map((o) => [o.modelRouteId, o.sourceSlug, o.score])).toEqual([
      ["p1", "s2", 0.8],
    ])
  })
})

describe("competitionRank", () => {
  it("(e) uses competition rank with exact equality", () => {
    const observations = observationsOf({
      s1: evalEntry("s1", "s1", [metric([score("p1", 0.9, null), score("p2", 0.9, null)])]),
    })
    const eligible = bestPerModel(observations, false)
    expect(competitionRank(0.8, eligible, false)).toEqual({ position: 3, total: 3 })
    expect(competitionRank(0.9, eligible, false)).toEqual({ position: 1, total: 3 })
    expect(competitionRank(0.9000000001, eligible, false)).toEqual({ position: 1, total: 3 })
    expect(competitionRank(0.8999999999, eligible, false)).toEqual({ position: 3, total: 3 })
  })

  it("(e) honours lower-is-better", () => {
    const observations = collectPeerObservations(
      index(
        {
          s1: evalEntry("s1", "s1", [
            metric([score("p1", 0.1, null), score("p2", 0.4, null)], { lower_is_better: true }),
          ]),
        },
        2,
      ),
      "mmlu",
      "accuracy",
      true,
      CURRENT_KEYS,
    )
    const eligible = bestPerModel(observations, true)
    expect(eligible.map((o) => o.modelRouteId)).toEqual(["p1", "p2"])
    expect(competitionRank(0.3, eligible, true)).toEqual({ position: 2, total: 3 })
  })

  it("prefers the canonical score when the producer emitted one", () => {
    const observations = observationsOf({
      s1: evalEntry("s1", "s1", [
        metric([score("p1", 91, null, { score_canonical: 0.91, scale_conversion: "div100" })]),
      ]),
    })
    expect(observations.map((o) => o.score)).toEqual([0.91])
  })
})

describe("collectPeerObservations", () => {
  it("(g) drops buckets whose metric id or direction differs, and never reads merged entries", () => {
    const observations = observationsOf({
      same: evalEntry("same", "same", [metric([score("p1", 0.9, null)])]),
      otherMetric: evalEntry("otherMetric", "otherMetric", [
        metric([score("p2", 0.9, null)], {
          metric_summary_id: "exact-match",
          metric_id: "exact-match",
        }),
      ]),
      otherDirection: evalEntry("otherDirection", "otherDirection", [
        metric([score("p3", 0.9, null)], { lower_is_better: true }),
      ]),
      otherBenchmark: evalEntry("otherBenchmark", "otherBenchmark", [
        metric([score("p4", 0.9, null)]),
      ], { benchmark_id: "gpqa" }),
      merged: evalEntry("merged", "merged", [metric([score("p5", 0.9, null)])], {
        is_merged: true,
      }),
    })
    expect(observations.map((o) => o.modelRouteId)).toEqual(["p1"])
  })

  it("returns the same observations with and without a prebuilt benchmark index", () => {
    const source = builderIndex(2)
    expect(
      collectPeerObservationsFrom(
        buildBenchmarkEntryIndex(source),
        "mmlu",
        "accuracy",
        false,
        CURRENT_KEYS,
      ),
    ).toEqual(collectPeerObservations(source, "mmlu", "accuracy", false, CURRENT_KEYS))
  })

  it("excludes the current model under either identity key", () => {
    const observations = observationsOf({
      s1: evalEntry("s1", "s1", [
        metric([
          score("apertus/8b", 0.6, "test"),
          score("apertus%2F8b", 0.6, "test", { model_family_id: "apertus/8b" }),
          score("p1", 0.9, null),
        ]),
      ]),
    })
    expect(observations.map((o) => o.modelRouteId)).toEqual(["p1"])
  })
})

// --- builder fixture ---------------------------------------------------

const SOURCE_EVAL_ID = "apertus%2Fmmlu"

function builderIndex(version?: number): ComparisonIndex {
  return index(
    {
      [SOURCE_EVAL_ID]: evalEntry(SOURCE_EVAL_ID, "apertus-suite", [
        metric([
          score("apertus/8b", 0.6, "test", { rank: 2, total: 2 }),
          score("apertus/70b", 0.7, "test", { rank: 1, total: 2 }),
        ]),
      ], { composite_display_name: "Apertus 1.5 evaluation suite" }),
      "openeval%2Fmmlu": evalEntry("openeval%2Fmmlu", "openeval", [
        metric([
          score("peer-x", 0.8, null),
          score("peer-y", 0.9, "train"),
          score("peer-z", 0.5, null),
        ]),
      ]),
      "other%2Fmmlu": evalEntry("other%2Fmmlu", "other", [
        metric([score("peer-w", 0.99, null)], {
          metric_summary_id: "exact-match",
          metric_id: "exact-match",
        }),
      ]),
      mmlu: evalEntry("mmlu", "merged", [metric([score("peer-m", 0.95, null)])], {
        is_merged: true,
      }),
    },
    version,
  )
}

function buildFixture(version?: number) {
  return buildBenchmarkHistograms({
    comparisonIndex: builderIndex(version),
    wantedEvalIds: new Set([SOURCE_EVAL_ID]),
    currentModelIdentityKeys: CURRENT_KEYS,
    currentModelRouteId: "apertus/8b",
    currentModelName: "Apertus 8B",
    extraModelsByBenchmark: {},
  })
}

function serialise(histograms: ReturnType<typeof buildFixture>) {
  return JSON.stringify(
    [...histograms.entries()],
    (_key, value) => (value instanceof Set ? [...value] : value),
    2,
  )
}

describe("buildBenchmarkHistograms", () => {
  it("renders a split-aware caption and cross-source peers once the gate is on", () => {
    const hist = buildFixture(2).get("apertus%2Fmmlu::accuracy")
    expect(hist?.caption?.text).toBe(
      "Rank 3 of 4 across 2 sources · 2 with no reported split · 1 on train excluded (reported label differs)",
    )
    expect(hist?.excludedByLabel).toEqual({ train: 1 })
    expect(hist?.currentModelRank).toEqual({ position: 3, total: 4 })
    expect(hist?.sourceRank).toEqual({
      position: 2,
      total: 2,
      sourceDisplayName: "Apertus 1.5 evaluation suite",
    })
    expect(hist?.bars.map((b) => b.modelId)).toEqual([
      "peer-x",
      "apertus/70b",
      "apertus/8b",
      "peer-z",
    ])
  })

  it("keeps the source-only path when no other source has a matching bucket", () => {
    const histograms = buildBenchmarkHistograms({
      comparisonIndex: index(
        {
          [SOURCE_EVAL_ID]: evalEntry(SOURCE_EVAL_ID, "apertus-suite", [
            metric([
              score("apertus/8b", 0.6, "test", { rank: 2, total: 2 }),
              score("apertus/70b", 0.7, "test", { rank: 1, total: 2 }),
            ]),
          ]),
        },
        2,
      ),
      wantedEvalIds: new Set([SOURCE_EVAL_ID]),
      currentModelIdentityKeys: CURRENT_KEYS,
      currentModelRouteId: "apertus/8b",
      currentModelName: "Apertus 8B",
      extraModelsByBenchmark: {},
    })
    const hist = histograms.get("apertus%2Fmmlu::accuracy")
    expect(hist?.caption).toBeUndefined()
    expect(hist?.currentModelRank).toEqual({ position: 2, total: 2 })
  })

  it("finds the current source row by model_family_id when the route id differs", () => {
    const histograms = buildBenchmarkHistograms({
      comparisonIndex: index(
        {
          [SOURCE_EVAL_ID]: evalEntry(SOURCE_EVAL_ID, "apertus-suite", [
            metric([
              score("apertus%2F8b%3Abf16", 0.6, "test", {
                model_family_id: "apertus/8b",
                rank: 2,
                total: 2,
              }),
              score("apertus/70b", 0.7, "test", { rank: 1, total: 2 }),
            ]),
          ]),
          "openeval%2Fmmlu": evalEntry("openeval%2Fmmlu", "openeval", [
            metric([score("peer-x", 0.8, null)]),
          ]),
        },
        2,
      ),
      wantedEvalIds: new Set([SOURCE_EVAL_ID]),
      currentModelIdentityKeys: CURRENT_KEYS,
      currentModelRouteId: "apertus/8b",
      currentModelName: "Apertus 8B",
      extraModelsByBenchmark: {},
    })
    const hist = histograms.get("apertus%2Fmmlu::accuracy")
    expect(hist?.caption?.text).toBe("Rank 3 of 3 across 2 sources · 1 with no reported split")
    expect(hist?.bars.filter((b) => b.isCurrent)).toHaveLength(1)
    expect(hist?.bars.map((b) => b.modelId)).not.toContain("apertus%2F8b%3Abf16")
  })

  it("treats an unrecognised but stated peer label as a stated label", () => {
    const histograms = buildBenchmarkHistograms({
      comparisonIndex: index(
        {
          [SOURCE_EVAL_ID]: evalEntry(SOURCE_EVAL_ID, "apertus-suite", [
            metric([score("apertus/8b", 0.6, null, { rank: 1, total: 1 })]),
          ]),
          "judgebench%2Fmmlu": evalEntry("judgebench%2Fmmlu", "judgebench", [
            metric([score("peer-x", 0.8, "gpt"), score("peer-y", 0.4, "small")]),
          ]),
        },
        2,
      ),
      wantedEvalIds: new Set([SOURCE_EVAL_ID]),
      currentModelIdentityKeys: CURRENT_KEYS,
      currentModelRouteId: "apertus/8b",
      currentModelName: "Apertus 8B",
      extraModelsByBenchmark: {},
    })
    const hist = histograms.get("apertus%2Fmmlu::accuracy")
    expect(hist?.caption?.text).toBe("Rank 2 of 3 across 2 sources · compared as split unknown")
    expect(hist?.caption?.excluded).toEqual([])
    expect(hist?.sourceRank).toBeUndefined()
  })

  it("(h) leaves the source-only output untouched when the capability gate is off", () => {
    expect(serialise(buildFixture())).toMatchInlineSnapshot(`
      "[
        [
          "apertus%2Fmmlu::accuracy",
          {
            "histKey": "apertus%2Fmmlu::accuracy",
            "evalSummaryId": "apertus%2Fmmlu",
            "metricSummaryId": "accuracy",
            "metricName": "Accuracy",
            "metricGroup": "capability",
            "lowerIsBetter": false,
            "unit": null,
            "bars": [
              {
                "modelId": "apertus/70b",
                "modelName": "Apertus / 70b",
                "score": 0.7,
                "isCurrent": false,
                "isDefault": true,
                "submissionCount": 1,
                "submissionAxis": "default",
                "variantKey": "apertus/70b"
              },
              {
                "modelId": "apertus/8b",
                "modelName": "Apertus 8B",
                "score": 0.6,
                "isCurrent": true,
                "isDefault": true,
                "submissionCount": 1,
                "submissionAxis": "default",
                "variantKey": "apertus/8b"
              }
            ],
            "availableModels": [],
            "defaultIds": [
              "apertus/70b"
            ],
            "currentModelRank": {
              "position": 2,
              "total": 2
            },
            "resolvedIsPercent": null
          }
        ]
      ]"
    `)
  })
})

describe("PeerCaption", () => {
  const fragments = peerCaption({
    position: 46,
    total: 136,
    sourceCount: 4,
    currentLabel: "test",
    unknownCount: 134,
    anyPeerLabelled: true,
    excludedByLabel: { train: 194 },
  })

  it("puts the caveat hover on the excluded fragment only", () => {
    const html = renderToStaticMarkup(
      createElement(PeerCaption, { caption: fragments, currentLabel: "test" }),
    )
    expect(html).toMatchInlineSnapshot(`"<span>Rank 46 of 136 across 4 sources</span> · <span>134 with no reported split</span> · <span title="Excluded because their reported split label differs from this model&#x27;s (\`test\`). Labels are as submitted and may be recording errors.">194 on train excluded (reported label differs)</span>"`)
    expect(html.match(/title="/g)).toHaveLength(1)
    expect(html).toContain(
      `<span title="Excluded because their reported split label differs from this model&#x27;s (\`test\`). Labels are as submitted and may be recording errors.">194 on train excluded (reported label differs)</span>`,
    )
    expect(html).toContain("<span>Rank 46 of 136 across 4 sources</span>")
    expect(html).toContain("<span>134 with no reported split</span>")
  })

  it("names no split in the hover when the current model reports none", () => {
    const html = renderToStaticMarkup(
      createElement(PeerCaption, {
        caption: peerCaption({
          position: 1,
          total: 2,
          sourceCount: 1,
          currentLabel: null,
          unknownCount: 1,
          anyPeerLabelled: true,
          excludedByLabel: { train: 3 },
        }),
        currentLabel: null,
      }),
    )
    expect(html).toContain("(`none`)")
  })
})
