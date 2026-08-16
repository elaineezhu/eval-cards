/**
 * Adapters for the merged-benchmark payload (`{ merged: true, ... }` from
 * /api/eval-summary for single-segment ids — merged-benchmark-view spec F1).
 *
 * `fetchEvalSummary` runs every payload through
 * `mergedSummaryToEvalSummary`, so legacy consumers — the embed
 * leaderboard / distribution / frontier pages in particular — render
 * merged ids without their own wiring. The merged page
 * (components/merged-benchmark-view) fetches the raw payload via
 * `fetchMergedBenchmarkSummary` (for the source/metric/slice controls and
 * disclosure notes) and adapts it through here to mount the full
 * EvalDetail experience at merged grain.
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

/**
 * Rows eligible for the merged pool: only observations with a score on
 * the metric's registry canonical scale. Flagged rows (score_canonical
 * null — the producer could not safely convert the raw score) are
 * EXCLUDED from the leaderboard, the distribution pool, the average and
 * the bounds inference: pooling raw unconverted numbers with canonical
 * ones would rank apples against oranges (e.g. a raw 1.42 outranking a
 * true 0.85 best). The merged page discloses the excluded count.
 */
function convertedRows(merged: MergedBenchmarkSummary): MergedObservationRow[] {
  return merged.results.filter(
    (row) => row.score_canonical != null && Number.isFinite(row.score_canonical),
  )
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

  const rows = convertedRows(merged)

  // Infer canonical-scale bounds from the pooled canonical scores so
  // score bars / normalisation in EvalDetail behave: prefer the
  // conventional 0–1 and 0–100 scales when every score fits, else fall
  // back to the data range (rounded to whole numbers for display —
  // "0 – 1620", not "0 – 1619.7821…"). The merged payload doesn't carry
  // declared bounds; scores are already on the registry canonical scale.
  const canonicalScores = rows.map((row) => row.score_canonical as number)
  let bounds: Pick<MetricConfig, "min_score" | "max_score"> = {}
  if (canonicalScores.length > 0) {
    const lo = Math.min(...canonicalScores)
    const hi = Math.max(...canonicalScores)
    if (lo >= 0 && hi <= 1) bounds = { min_score: 0, max_score: 1 }
    else if (lo >= 0 && hi <= 100) bounds = { min_score: 0, max_score: 100 }
    else bounds = { min_score: Math.min(0, Math.floor(lo)), max_score: Math.ceil(hi) }
  }

  const metricConfig: MetricConfig = {
    evaluation_description: `${metricDisplayName} — merged across ${
      selectedMetric?.sources_count ?? merged.sources_count
    } sources`,
    lower_is_better: merged.selected_lower_is_better,
    score_type: "continuous",
    ...bounds,
  }

  const sourceData: SourceData = { dataset_name: merged.display_name }

  const model_results = rows.map((row) => {
    const score = row.score_canonical as number
    return {
      model_info: row.model_info,
      model_route_id: row.model_route_id,
      score,
      score_details: { score },
      evaluation_timestamp: row.evaluation_timestamp,
      source_metadata: row.source_metadata,
      source_data: sourceData,
      merged_source_slug: row.composite_slug,
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

  const leaderboard_rows = rows.map((row) => ({
    model_info: row.model_info,
    model_route_id: row.model_route_id,
    evaluation_timestamp: row.evaluation_timestamp,
    source_metadata: row.source_metadata,
    source_data: sourceData,
    values: { [columnKey]: row.score_canonical as number },
    verified: row.is_verified_evaluator ? { [columnKey]: true } : undefined,
    metrics_present: 1,
  }))

  const scores = model_results
    .map((r) => r.score)
    .filter((s): s is number => Number.isFinite(s))
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

  // Best model on the CANONICAL scale only. The backend best_result can
  // itself be a flagged raw score, so prefer its canonical value and fall
  // back to the top converted row (rows arrive pre-sorted best-first in
  // the metric's direction, spec Q6).
  const best = merged.best_result
  const bestModel =
    best && best.model_name != null && best.score_canonical != null
      ? { name: best.model_name, score: best.score_canonical }
      : rows.length > 0
        ? { name: rows[0].model_info.name, score: rows[0].score_canonical as number }
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
    merged_view: true,
    benchmark_card: merged.benchmark_card ?? undefined,
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
