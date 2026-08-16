import { describe, expect, it } from "vitest"

import { mergedSummaryToEvalSummary } from "@/lib/merged-adapter"
import type {
  MergedBenchmarkSummary,
  MergedObservationRow,
} from "@/lib/eval-processing"
import type { SourceMetadata } from "@/lib/benchmark-schema"

// The merged page mounts the full EvalDetail component on the adapted
// payload, so these assertions pin the parts EvalDetail actually renders:
// pooled observation rows (echoes intact), per-row source attribution,
// the single-column leaderboard matrix, and inferred canonical-scale
// bounds for score-bar normalisation.

function sourceMeta(name: string): SourceMetadata {
  return {
    source_name: name,
    source_type: "leaderboard",
    source_organization_name: name,
    evaluator_relationship: "third_party",
  }
}

function row(overrides: Partial<MergedObservationRow>): MergedObservationRow {
  return {
    model_info: { name: "Model A", id: "org/model-a" },
    model_route_id: "org%2Fmodel-a",
    evaluation_id: "src-a%2Fbench",
    composite_slug: "src-a",
    composite_display_name: "Source A",
    score: 50,
    score_canonical: 50,
    scale_conversion: "none",
    evaluation_timestamp: "2026-01-01T00:00:00Z",
    source_metadata: sourceMeta("Source A"),
    ...overrides,
  }
}

function mergedPayload(results: MergedObservationRow[]): MergedBenchmarkSummary {
  return {
    merged: true,
    evaluation_id: "bench",
    benchmark_id: "bench",
    display_name: "Bench",
    grain: "benchmark",
    preferred_metric_id: "accuracy",
    preferred_metric_display_name: "Accuracy",
    preferred_from_registry: true,
    lower_is_better: false,
    sources_count: 2,
    all_sources_count: 2,
    results_count: results.length,
    models_count: 2,
    best_result: null,
    aggregate_sources: [
      {
        evaluation_id: "src-a%2Fbench",
        composite_slug: "src-a",
        composite_display_name: "Source A",
        models_count: 2,
        results_count: 2,
        reports_preferred: true,
        slice_only: false,
      },
      {
        evaluation_id: "src-b%2Fbench",
        composite_slug: "src-b",
        composite_display_name: "Source B",
        models_count: 1,
        results_count: 1,
        reports_preferred: true,
        slice_only: false,
      },
    ],
    metrics: [
      {
        metric_id: "accuracy",
        display_name: "Accuracy",
        results_count: results.length,
        models_count: 2,
        sources_count: 2,
        lower_is_better: false,
      },
    ],
    slices: null,
    selected_metric_id: "accuracy",
    selected_lower_is_better: false,
    selected_slice_id: null,
    results,
  }
}

describe("mergedSummaryToEvalSummary — EvalDetail surface", () => {
  it("pools all sources' rows, keeps echo republications, and attributes each row to its own source", () => {
    const results = [
      row({ score: 91.2, score_canonical: 91.2 }),
      // Echo of the same model republished by another source — must stay.
      row({
        evaluation_id: "src-b%2Fbench",
        composite_slug: "src-b",
        composite_display_name: "Source B",
        score: 91.2,
        score_canonical: 91.2,
        source_metadata: sourceMeta("Source B"),
      }),
      row({
        model_info: { name: "Model B", id: "org/model-b" },
        model_route_id: "org%2Fmodel-b",
        score: 55.5,
        score_canonical: 55.5,
      }),
    ]
    const adapted = mergedSummaryToEvalSummary(mergedPayload(results))

    expect(adapted.evaluation_name).toBe("Bench")
    expect(adapted.model_results).toHaveLength(3)
    // Per-row attribution: each observation carries ITS source, not a
    // single global one.
    expect(adapted.model_results.map((r) => r.source_metadata.source_name)).toEqual([
      "Source A",
      "Source B",
      "Source A",
    ])
    // ?source= pre-highlight hook.
    expect(adapted.model_results.map((r) => r.merged_source_slug)).toEqual([
      "src-a",
      "src-b",
      "src-a",
    ])
    // Single-column leaderboard matrix keyed by the selected metric.
    expect(adapted.leaderboard_metrics).toHaveLength(1)
    expect(adapted.leaderboard_metrics?.[0].column_key).toBe("accuracy")
    expect(adapted.leaderboard_rows?.map((r) => r.values.accuracy)).toEqual([91.2, 91.2, 55.5])
    expect(adapted.evaluator_names).toEqual(["Source A", "Source B"])
  })

  it("uses score_canonical, falling back to raw score for flagged rows", () => {
    const results = [
      row({ score: 0.8, score_canonical: 0.8 }),
      row({ score: 7.5, score_canonical: null, scale_conversion: "flagged" }),
    ]
    const adapted = mergedSummaryToEvalSummary(mergedPayload(results))
    expect(adapted.model_results.map((r) => r.score)).toEqual([0.8, 7.5])
  })

  it("infers 0–1 bounds when every pooled score fits the unit scale", () => {
    const adapted = mergedSummaryToEvalSummary(
      mergedPayload([
        row({ score: 0.12, score_canonical: 0.12 }),
        row({ score: 0.9, score_canonical: 0.9 }),
      ]),
    )
    expect(adapted.metric_config.min_score).toBe(0)
    expect(adapted.metric_config.max_score).toBe(1)
  })

  it("infers 0–100 bounds for percent-scale scores", () => {
    const adapted = mergedSummaryToEvalSummary(
      mergedPayload([
        row({ score: 12.5, score_canonical: 12.5 }),
        row({ score: 91.4, score_canonical: 91.4 }),
      ]),
    )
    expect(adapted.metric_config.min_score).toBe(0)
    expect(adapted.metric_config.max_score).toBe(100)
  })

  it("falls back to the data range for unbounded scales (e.g. Elo)", () => {
    const adapted = mergedSummaryToEvalSummary(
      mergedPayload([
        row({ score: 1024, score_canonical: 1024 }),
        row({ score: 1310, score_canonical: 1310 }),
      ]),
    )
    expect(adapted.metric_config.min_score).toBe(0)
    expect(adapted.metric_config.max_score).toBe(1310)
  })
})
