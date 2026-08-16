/**
 * Adapters for the merged-benchmark payload (`{ merged: true, ... }` from
 * /api/eval-summary for single-segment ids — merged-benchmark-view spec F1).
 *
 * `fetchEvalSummary` runs every payload through
 * `mergedSummaryToEvalSummary`, so legacy consumers — the embed
 * leaderboard / distribution / frontier pages in particular — render
 * merged ids without their own wiring. The merged page itself uses
 * `fetchMergedBenchmarkSummary` and consumes the raw payload.
 *
 * Client-safe: types only, no server imports.
 */

import type {
  BenchmarkEvalSummary,
  MergedBenchmarkSummary,
  MergedObservationRow,
} from "@/lib/eval-processing"
import type { MetricConfig, SourceData } from "@/lib/benchmark-schema"

export function isMergedBenchmarkSummary(payload: unknown): payload is MergedBenchmarkSummary {
  return (
    payload != null &&
    typeof payload === "object" &&
    (payload as { merged?: unknown }).merged === true
  )
}

/** Display score: canonical scale when available, raw for flagged/absent. */
function displayScore(row: MergedObservationRow): number {
  return row.score_canonical ?? row.score
}

/**
 * Reshape a merged payload into the BenchmarkEvalSummary surface legacy
 * consumers read: `model_results` at observation grain plus a
 * single-column `leaderboard_metrics`/`leaderboard_rows` matrix keyed by
 * the selected metric id. Observation rows are NOT deduped by model
 * identity — echoes stay visible (spec design pt 3).
 */
export function mergedSummaryToEvalSummary(merged: MergedBenchmarkSummary): BenchmarkEvalSummary {
  const columnKey = merged.selected_metric_id || merged.preferred_metric_id || "score"
  const selectedMetric = merged.metrics.find((m) => m.metric_id === columnKey)
  const metricDisplayName =
    selectedMetric?.display_name ??
    (columnKey === merged.preferred_metric_id ? merged.preferred_metric_display_name : columnKey)

  const metricConfig: MetricConfig = {
    evaluation_description: `${metricDisplayName} — merged across ${
      selectedMetric?.sources_count ?? merged.sources_count
    } sources`,
    lower_is_better: merged.selected_lower_is_better,
    score_type: "continuous",
  }

  const sourceData: SourceData = { dataset_name: merged.display_name }

  const model_results = merged.results.map((row) => {
    const score = displayScore(row)
    return {
      model_info: row.model_info,
      model_route_id: row.model_route_id,
      score,
      score_details: { score },
      evaluation_timestamp: row.evaluation_timestamp,
      source_metadata: row.source_metadata,
      source_data: sourceData,
      is_verified_evaluator: row.is_verified_evaluator,
      result: {
        evaluation_name: metricDisplayName,
        display_name: metricDisplayName,
        metric_key: columnKey,
        evaluation_timestamp: row.evaluation_timestamp,
        source_data: sourceData,
        metric_config: metricConfig,
        score_details: { score },
        generation_config: row.generation_config,
        is_verified_evaluator: row.is_verified_evaluator,
      },
    }
  })

  const leaderboard_rows = merged.results.map((row) => ({
    model_info: row.model_info,
    model_route_id: row.model_route_id,
    evaluation_timestamp: row.evaluation_timestamp,
    source_metadata: row.source_metadata,
    source_data: sourceData,
    values: { [columnKey]: displayScore(row) },
    verified: row.is_verified_evaluator ? { [columnKey]: true } : undefined,
    metrics_present: 1,
  }))

  const scores = model_results
    .map((r) => r.score)
    .filter((s): s is number => Number.isFinite(s))
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

  const best = merged.best_result
  const bestModel =
    best && best.model_name != null && (best.score_canonical ?? best.score) != null
      ? { name: best.model_name, score: (best.score_canonical ?? best.score)! }
      : null

  return {
    evaluation_id: merged.evaluation_id,
    evaluation_name: merged.display_name,
    canonical_display_name: merged.display_name,
    benchmark_id: merged.benchmark_id,
    composite_benchmark_key: merged.benchmark_id,
    composite_benchmark_name: merged.display_name,
    family_id: merged.family_id ?? undefined,
    family_display_name: merged.family_display_name ?? undefined,
    benchmark_family_name: merged.family_display_name ?? undefined,
    derived_tags: [],
    metric_config: metricConfig,
    model_results,
    models_count: selectedMetric?.models_count ?? merged.models_count,
    evaluator_names: Array.from(
      new Set(merged.aggregate_sources.map((s) => s.composite_display_name).filter(Boolean)),
    ),
    source_types: [],
    third_party_ratio: 0,
    missing_generation_config_count: 0,
    best_model: bestModel,
    worst_model: null,
    avg_score: avgScore,
    avg_score_norm: 0,
    metrics_count: merged.metrics.length,
    metric_names: merged.metrics.map((m) => m.display_name),
    leaderboard_metrics: [
      {
        column_key: columnKey,
        metric_summary_id: columnKey,
        metric_name: columnKey,
        display_name: metricDisplayName,
        canonical_display_name: metricDisplayName,
        lower_is_better: merged.selected_lower_is_better,
        scope: "root",
      },
    ],
    leaderboard_rows,
  }
}
