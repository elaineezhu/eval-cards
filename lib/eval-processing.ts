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
  GenerationConfig,
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
  /**
   * model-resolution-rework: server-provided group canonical id. Used as
   * the routing fallback when `model_route_id` is absent — replaces the
   * old client-side family-route computation (since removed).
   */
  model_group_id?: string
  score: number
  score_details: ScoreDetails
  evaluation_timestamp: string
  source_metadata: SourceMetadata
  source_data: BenchmarkEvaluation['source_data']
  /** Per-result verification flag; mirrors `result.is_verified_evaluator`. */
  is_verified_evaluator?: boolean
  result: EvaluationResult
  /** URL to the underlying record JSON in the upstream HF dataset, when known. */
  source_record_url?: string
  /** Deep-link to the raw EEE_datastore source record this score came from, when known. */
  eee_record_url?: string
  /** Merged-page rows only (set by lib/merged-adapter): the observation's
   *  source composite slug, used for the ?source= row pre-highlight. */
  merged_source_slug?: string
  /** Collections (see the backend's collections spec, warehouse-outputs section): submission-channel id of
   *  the row's representative fact row — key into the snapshot's
   *  `collections.json` sidecar. */
  collection_id?: string
  /** Protocol point for protocol-varied collections: canonical sorted-key
   *  JSON typed by the collection's declared `protocol_axes`; absent/null
   *  for ordinary rows. The view ships one row per protocol point; rows
   *  whose reserved `feedback` key is `answer_feedback` are
   *  shown-but-not-ranked (backend already emits NULL position for them). */
  protocol_condition?: string | null
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
  /** True when this summary was adapted from a merged all-sources payload
   *  (lib/merged-adapter) — lets shared UI phrase observation-grain rows
   *  correctly ("N results · M models", not "N of M"). */
  merged_view?: true
  canonical_display_name?: string
  composite_benchmark_key: string
  composite_benchmark_name: string
  derived_tags?: EvalTag[]
  metric_config: MetricConfig
  model_results: ModelResultForBenchmark[]
  models_count: number
  /** Unique evaluator organisation names */
  evaluator_names: string[]
  /** Subset of `evaluator_names` that are validated submitters (badge). */
  verified_evaluator_names?: string[]
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
  /** model-resolution-rework: server group id, routing fallback. */
  model_group_id?: string
  evaluation_timestamp: string
  source_metadata: SourceMetadata
  source_data: BenchmarkEvaluation["source_data"]
  values: Record<string, number | null>
  /** Per-column verified-evaluator flag, keyed identically to `values`. */
  verified?: Record<string, boolean>
  annotations_by_metric?: Record<string, RowAnnotations | null | undefined>
  metrics_present: number
}

export type BenchmarkEvalListItem = Omit<BenchmarkEvalSummary, "model_results">

// ---------------------------------------------------------------------------
// Merged benchmark view (merged-benchmark-view spec F1) — one page per
// resolved canonical benchmark, merging every publishing source at
// observation grain. Backed by `merged_evals_view.parquet` plus a live
// query over `eval_results_view`.
// ---------------------------------------------------------------------------

/** 'flagged' rows have no canonical-scale score (never guessed); 'no_bounds'
 *  rows pass the raw score through unconverted; 'curated' rows were
 *  multiplied by a registry-declared factor (e.g. raw 1-10 onto 0-1). */
export type MergedScaleConversion = "none" | "div100" | "mul100" | "curated" | "flagged" | "no_bounds"

export interface MergedAggregateSource {
  /** Per-source eval page id; null for slice-only sources (no top-level page target). */
  evaluation_id: string | null
  composite_slug: string
  composite_display_name: string
  models_count: number
  results_count: number
  /** False = excluded from the default view (source reports only other metrics). */
  reports_preferred: boolean
  /** True = source reports slice-level results only (disclosure note). */
  slice_only: boolean
}

export interface MergedMetricOption {
  metric_id: string
  display_name: string
  results_count: number
  models_count: number
  sources_count: number
  lower_is_better: boolean | null
}

export interface MergedSliceOption {
  slice_id: string
  display_name: string
}

export interface MergedBestResult {
  model_name: string | null
  model_key: string | null
  score: number | null
  score_canonical: number | null
  composite_slug: string | null
  evaluation_id: string | null
}

/** One (model, source) observation row. Echo republications stay visible —
 *  the merged accessor never dedupes by model identity (spec design pt 3). */
export interface MergedObservationRow {
  model_info: ModelInfo
  model_route_id?: string
  model_key?: string
  /** The observation's per-source evaluation_id (two-segment) — Source link target. */
  evaluation_id: string
  composite_slug: string
  composite_display_name?: string
  score: number
  /** Score on the metric's registry canonical scale; null for flagged rows. */
  score_canonical: number | null
  scale_conversion: MergedScaleConversion | null
  evaluation_timestamp: string
  source_metadata: SourceMetadata
  generation_config?: GenerationConfig
  is_verified_evaluator?: boolean
}

export interface MergedBenchmarkSummary {
  /** Discriminator vs the per-source BenchmarkEvalSummary payload. */
  merged: true
  /** Single-segment percent-encoded benchmark id (never contains %2F). */
  evaluation_id: string
  benchmark_id: string
  display_name: string
  family_id?: string | null
  family_display_name?: string | null
  /** 'slice' = benchmark has no top-level data; page shows a slice selector. */
  grain: "benchmark" | "slice"
  preferred_metric_id: string
  preferred_metric_display_name: string
  preferred_from_registry: boolean
  lower_is_better: boolean
  /** Counts at default-metric grain (spec P5). */
  sources_count: number
  all_sources_count: number
  results_count: number
  models_count: number
  best_result: MergedBestResult | null
  aggregate_sources: MergedAggregateSource[]
  metrics: MergedMetricOption[]
  /** Non-null only for grain='slice'. */
  slices: MergedSliceOption[] | null
  /** Metric actually queried for `results` (defaults to preferred). */
  selected_metric_id: string
  selected_lower_is_better: boolean
  /** For grain='slice': the slice actually queried (defaults to the first). */
  selected_slice_id: string | null
  results: MergedObservationRow[]
  /** The benchmark's card, sourced from a per-source instantiation that
   *  authored one (preferring a source that reports the preferred metric). */
  benchmark_card?: BenchmarkCard | null
}

/**
 * Collapse leaderboard rows that describe the same model under two
 * source attributions (typical: one record with `developer: "OpenAI"`,
 * another with `developer: "unknown"` from a source that didn't carry
 * the developer field, both pointing at the same physical model). We
 * only merge when every shared score column is byte-equal across the
 * duplicates — that guarantees we never mask a legitimate second run
 * that happens to share a name. When merging, we keep the attribution
 * that actually identifies a developer.
 */
function devAttributionScore(developer: string | undefined | null): number {
  if (!developer) return 0
  const lower = developer.trim().toLowerCase()
  if (!lower || lower === "unknown") return 0
  return 1
}

function routeAttributionScore(routeId: string | undefined | null): number {
  if (!routeId) return 0
  const lower = routeId.toLowerCase()
  return lower.startsWith("unknown%2f") || lower.startsWith("unknown/") ? 0 : 1
}

export function dedupeLeaderboardRowsByModelIdentity(
  rows: BenchmarkLeaderboardRow[],
): BenchmarkLeaderboardRow[] {
  if (rows.length < 2) return rows
  const groups = new Map<string, BenchmarkLeaderboardRow[]>()
  for (const row of rows) {
    const name = (row.model_info?.name ?? "").trim().toLowerCase()
    if (!name) continue
    const bucket = groups.get(name)
    if (bucket) bucket.push(row)
    else groups.set(name, [row])
  }

  const result: BenchmarkLeaderboardRow[] = []
  const consumed = new WeakSet<BenchmarkLeaderboardRow>()
  for (const row of rows) {
    if (consumed.has(row)) continue
    const name = (row.model_info?.name ?? "").trim().toLowerCase()
    const bucket = name ? groups.get(name) : null
    if (!bucket || bucket.length < 2) {
      result.push(row)
      continue
    }

    // Verify per-column score agreement before merging. Any conflict
    // (two different numbers for the same column key) means the rows
    // are distinct runs that happen to share a model name — leave them.
    let conflict = false
    const valuesByKey: Record<string, number> = {}
    outer: for (const candidate of bucket) {
      for (const [key, raw] of Object.entries(candidate.values ?? {})) {
        if (typeof raw !== "number" || !Number.isFinite(raw)) continue
        if (key in valuesByKey) {
          if (valuesByKey[key] !== raw) {
            conflict = true
            break outer
          }
        } else {
          valuesByKey[key] = raw
        }
      }
    }
    if (conflict) {
      result.push(row)
      continue
    }

    // Pick the canonical row: best developer attribution, then best
    // route id, then most populated values map as a tiebreaker.
    const canonical = [...bucket].sort((a, b) => {
      const devDelta = devAttributionScore(b.model_info?.developer) - devAttributionScore(a.model_info?.developer)
      if (devDelta !== 0) return devDelta
      const routeDelta = routeAttributionScore(b.model_route_id) - routeAttributionScore(a.model_route_id)
      if (routeDelta !== 0) return routeDelta
      return Object.keys(b.values ?? {}).length - Object.keys(a.values ?? {}).length
    })[0]

    const mergedValues: Record<string, number | null> = { ...(canonical.values ?? {}) }
    const mergedAnnotations: Record<string, unknown> = { ...(canonical.annotations_by_metric ?? {}) }
    for (const candidate of bucket) {
      if (candidate === canonical) continue
      for (const [key, raw] of Object.entries(candidate.values ?? {})) {
        if (mergedValues[key] == null && raw != null) mergedValues[key] = raw
      }
      for (const [key, ann] of Object.entries(candidate.annotations_by_metric ?? {})) {
        if (mergedAnnotations[key] == null && ann != null) mergedAnnotations[key] = ann
      }
      consumed.add(candidate)
    }

    result.push({
      ...canonical,
      values: mergedValues,
      annotations_by_metric: mergedAnnotations as typeof canonical.annotations_by_metric,
    })
    consumed.add(canonical)
  }
  return result
}
