/**
 * Benchmark-first evaluation types, shared between the v2 view-layer reader
 * (lib/view-data.ts) and its UI consumers. The data-shaping functions that
 * used to live here were part of the legacy v1 (HF-JSON / duckdb) backend and
 * were removed once the producer pipeline took over aggregation.
 */

import type {
  BenchmarkCard,
  BenchmarkEvaluation,
  EvalTag,
  ModelInfo,
  SourceMetadata,
  SourceData,
  ScoreDetails,
  MetricConfig,
  EvaluationResult,
  ModelEvaluationSummary,
} from './benchmark-schema'
import type { EvalcardsAnnotations, RowAnnotations, SignalSummaries } from './backend-artifacts'

export type { BenchmarkCard }
export type { ModelEvaluationSummary }

export interface ModelResultForBenchmark {
  model_info: ModelInfo
  model_route_id?: string
  score: number
  score_details: ScoreDetails
  evaluation_timestamp: string
  source_metadata: SourceMetadata
  source_data: BenchmarkEvaluation['source_data']
  result: EvaluationResult
  /** URL to the underlying record JSON in the upstream HF dataset, when known. */
  source_record_url?: string
  aggregate_components?: Array<{
    evaluation_id: string
    composite_benchmark_key: string
    composite_benchmark_name: string
    score: number
    normalized_score: number
    evaluation_timestamp: string
    source_name?: string
    source_type: SourceMetadata["source_type"]
    source_organization_name: string
    evaluator_relationship: SourceMetadata["evaluator_relationship"]
  }>
}

export interface BenchmarkEvalSummary extends SignalSummaries {
  evaluation_name: string
  /** URL-safe slug derived from evaluation_name */
  evaluation_id: string
  canonical_display_name?: string
  composite_benchmark_key: string
  composite_benchmark_name: string
  derived_tags?: EvalTag[]
  metric_config: MetricConfig
  model_results: ModelResultForBenchmark[]
  models_count: number
  /** Unique evaluator organisation names */
  evaluator_names: string[]
  source_types: SourceMetadata["source_type"][]
  latest_source_name?: string
  third_party_ratio: number
  missing_generation_config_count: number
  best_model: { name: string; score: number } | null
  worst_model: { name: string; score: number } | null
  avg_score: number
  /** avg_score normalised to 0-1 using metric_config.min/max_score */
  avg_score_norm: number
  /** Rich benchmark card from the metadata/ folder, when available */
  benchmark_card?: BenchmarkCard
  is_aggregated?: boolean
  aggregate_sources?: Array<{
    evaluation_id: string
    composite_benchmark_key: string
    composite_benchmark_name: string
    models_count: number
    avg_score_norm: number
  }>
  /** Tags from the pipeline (domains, languages, tasks) */
  tags?: { domains: string[]; languages: string[]; tasks: string[] }
  /** Number of distinct metrics for this benchmark */
  metrics_count?: number
  /** Names of all metrics */
  metric_names?: string[]
  /** Instance-level data availability */
  instance_data?: { available: boolean; url_count: number; sample_urls: string[]; models_with_loaded_instances: number }
  /** Canonical benchmark id (the registry-resolved benchmark). Drives
   *  benchmark-card lookups regardless of slice/composite axis. */
  benchmark_id?: string
  /** Family display name. */
  benchmark_family_name?: string
  /** Composite (leaderboard) slug — e.g. "wasp", "helm-classic". */
  composite_slug?: string
  /** Composite display name — e.g. "WASP", "HELM Classic". */
  composite_display_name?: string
  /** Curated multi-benchmark family slug (e.g. "mmlu"), defaults to
   *  benchmark id for singletons. */
  family_id?: string
  /** Family display, post-cutover canonical name. */
  family_display_name?: string
  /** Parent benchmark id — populated when this row is a slice of a
   *  root benchmark; null for non-slice rows. */
  parent_benchmark_id?: string
  /** True when this row is a within-benchmark slice cut. */
  is_slice?: boolean
  /** Source dataset metadata from the pipeline */
  source_data?: SourceData
  /** Best raw score reported in the eval summary list */
  top_score?: number
  /** Count of nested subtasks reported for the benchmark */
  subtasks_count?: number
  /** Whether this row is a summary/rollup score for a composite */
  is_summary_score?: boolean
  /** Evaluation_ids this benchmark summary is composed of. */
  constituent_evaluation_ids?: string[]
  /** Canonical benchmark-level metrics from root metrics[] */
  root_metrics?: BenchmarkSummaryMetric[]
  /** Canonical benchmark subdivisions from subtasks[] */
  subtasks?: BenchmarkSummarySubtask[]
  /** Matrix columns for multi-metric benchmark leaderboards */
  leaderboard_metrics?: BenchmarkLeaderboardMetric[]
  /** Matrix rows for multi-metric benchmark leaderboards */
  leaderboard_rows?: BenchmarkLeaderboardRow[]
  evalcards?: { annotations?: EvalcardsAnnotations }
}

export interface BenchmarkSummaryMetric {
  metric_summary_id: string
  metric_name: string
  display_name: string
  canonical_display_name?: string
  metric_key?: string
  lower_is_better: boolean
  models_count: number
  top_score?: number
  unit?: string
}

export interface BenchmarkSummarySubtask {
  subtask_key: string
  subtask_name: string
  display_name: string
  canonical_display_name?: string
  metrics: BenchmarkSummaryMetric[]
}

export interface BenchmarkLeaderboardMetric {
  column_key: string
  metric_summary_id: string
  metric_name: string
  display_name: string
  canonical_display_name?: string
  lower_is_better: boolean
  unit?: string
  scope: "root" | "subtask"
  subtask_key?: string
  subtask_name?: string
}

export interface BenchmarkLeaderboardRow {
  model_info: ModelInfo
  model_route_id?: string
  evaluation_timestamp: string
  source_metadata: SourceMetadata
  source_data: BenchmarkEvaluation["source_data"]
  values: Record<string, number | null>
  annotations_by_metric?: Record<string, RowAnnotations | null | undefined>
  metrics_present: number
}

export type BenchmarkEvalListItem = Omit<BenchmarkEvalSummary, "model_results">
