/**
 * Processing utilities for benchmark-first evaluation data
 */

import type {
  BenchmarkCard,
  BenchmarkEvaluation,
  EvaluationCardData,
  CategoryType,
  ModelInfo,
  ModelVariantSummary,
  SourceMetadata,
  SourceData,
  ScoreDetails,
  MetricConfig,
  EvaluationResult,
} from './benchmark-schema'
import type { EvalcardsAnnotations, RowAnnotations, SignalSummaries } from './backend-artifacts'
import type { ModelEvaluationSummary } from './benchmark-schema'
import type { ModelSummaryCore } from './benchmark-schema'
import { inferCategoryFromBenchmark } from './benchmark-schema'

export type { BenchmarkCard }
import { getCanonicalModelIdentity, getModelFamilyRouteId } from './model-family'

export type { ModelEvaluationSummary }

const GENERIC_EVALUATION_NAMES = new Set([
  "score",
  "accuracy",
  "mean win rate",
  "exact match",
  "f1",
  "pass@1",
])

const BENCHMARK_PRIORITY_RULES: Array<{ pattern: RegExp; priority: number }> = [
  { pattern: /\b(swe-bench|terminal-bench|tau-bench|agent|browsecomp)\b/, priority: 10 },
  { pattern: /\b(gpqa|mmlu-pro|mmlu|bbh|ifeval|math|aime|gsm8k|minerva)\b/, priority: 9 },
  { pattern: /\b(humaneval|livecodebench|mbpp|codecontests|apps)\b/, priority: 8 },
  { pattern: /\b(mmmu|mmmu-pro|seed-bench|vision|vqa|multimodal)\b/, priority: 7 },
  { pattern: /\b(mt-bench|arena-hard|alpacaeval|reward-bench|truthfulqa)\b/, priority: 6 },
  { pattern: /\b(fairness|bias|safety|toxic|harmful|robust|privacy)\b/, priority: 5 },
]

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function getBenchmarkName(
  evaluation: BenchmarkEvaluation,
  result?: EvaluationResult
): string {
  const resultSource = result?.source_data

  if (resultSource && !Array.isArray(resultSource) && resultSource.dataset_name) {
    return resultSource.dataset_name
  }

  if (evaluation.benchmark) {
    return evaluation.benchmark
  }

  if (!Array.isArray(evaluation.source_data) && evaluation.source_data.dataset_name) {
    return evaluation.source_data.dataset_name
  }

  return result?.evaluation_name ?? evaluation.evaluation_id
}

function getEvaluationDisplayName(
  evaluation: BenchmarkEvaluation,
  result: EvaluationResult
): string {
  const benchmarkName = getBenchmarkName(evaluation, result)
  const metricName = result.evaluation_name.trim()

  if (metricName === benchmarkName) {
    return metricName
  }

  if (GENERIC_EVALUATION_NAMES.has(metricName.toLowerCase())) {
    return `${benchmarkName} - ${metricName}`
  }

  return metricName
}

function getEvaluationSummaryId(
  evaluation: BenchmarkEvaluation,
  result: EvaluationResult
): string {
  const benchmarkKey = evaluation.benchmark || getBenchmarkName(evaluation, result)
  return slugify(`${benchmarkKey}__${result.evaluation_name}`)
}

function getBenchmarkPriority(value: string): number {
  const normalized = value.toLowerCase()

  for (const rule of BENCHMARK_PRIORITY_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.priority
    }
  }

  return 0
}

// ── Eval-centric (per-benchmark) types ────────────────────────────────────────

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
  category: CategoryType
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
  /** Related summary-score sibling ids for this benchmark */
  summary_eval_ids?: string[]
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

/**
 * Fill in derived fields the upstream pipeline sometimes leaves blank.
 *
 * Currently: `instance_data`. The pipeline that emits eval-summary parquets
 * occasionally ships rows where `instance_data` is null even though every
 * `model_results[].result.detailed_evaluation_results_url` is populated
 * (Wordle Arena is one example — 42 models, every one with a per-model
 * JSONL URL on `evaleval/card_backend`, but `instance_data` was null).
 *
 * Rather than patching this at one render site we derive it once here so
 * every consumer of the summary — eval detail page, modal previews,
 * cross-referenced model summaries, etc. — sees the same picture.
 */
export function normalizeEvalSummary<T extends BenchmarkEvalSummary>(summary: T): T {
  if (summary.instance_data?.available && summary.instance_data.url_count > 0) {
    return summary
  }

  const distinctUrls = new Set<string>()
  const modelsWithUrl = new Set<string>()
  for (const result of summary.model_results ?? []) {
    const url = result?.result?.detailed_evaluation_results_url
    if (typeof url === "string" && url.length > 0) {
      distinctUrls.add(url)
      const modelId = result.model_info?.id
      if (modelId) modelsWithUrl.add(modelId)
    }
  }

  if (distinctUrls.size === 0) {
    // Nothing to derive — preserve whatever the upstream said (typically
    // `available: false` or absent).
    return summary
  }

  // Take a small sample so callers can show example URLs without paying
  // for the full set, mirroring the upstream pipeline's contract.
  const sampleUrls = Array.from(distinctUrls).slice(0, 8)

  return {
    ...summary,
    instance_data: {
      available: true,
      url_count: distinctUrls.size,
      sample_urls: sampleUrls,
      models_with_loaded_instances: modelsWithUrl.size,
    },
  }
}

/**
 * Group multiple evaluations by model
 */
export function groupEvaluationsByModel(
  evaluations: BenchmarkEvaluation[]
): Record<string, BenchmarkEvaluation[]> {
  const grouped: Record<string, BenchmarkEvaluation[]> = {}
  
  for (const eval_ of evaluations) {
    const modelId = eval_.model_info.id
    if (!grouped[modelId]) {
      grouped[modelId] = []
    }
    grouped[modelId].push(eval_)
  }
  
  return grouped
}

export function groupEvaluationsByModelFamily(
  evaluations: BenchmarkEvaluation[]
): Record<string, BenchmarkEvaluation[]> {
  const grouped: Record<string, BenchmarkEvaluation[]> = {}

  for (const eval_ of evaluations) {
    const familyId = getCanonicalModelIdentity(eval_.model_info).familyId
    if (!grouped[familyId]) {
      grouped[familyId] = []
    }
    grouped[familyId].push(eval_)
  }

  return grouped
}

/**
 * Create a model evaluation summary from grouped evaluations
 */
export function createModelSummary(
  evaluations: BenchmarkEvaluation[]
): ModelSummaryCore {
  if (evaluations.length === 0) {
    throw new Error('No evaluations provided')
  }
  
  const modelInfo = evaluations[0].model_info
  const evaluationsByCategory: Record<string, BenchmarkEvaluation[]> = {}
  const categoriesSet = new Set<CategoryType>()
  
  // Group by category - track which categories each evaluation belongs to
  for (const eval_ of evaluations) {
    const evalCategories = new Set<CategoryType>()

    if (eval_.category) {
      evalCategories.add(eval_.category)
      categoriesSet.add(eval_.category)
    } else {
      for (const result of eval_.evaluation_results) {
        let category: CategoryType = inferCategoryFromBenchmark(result.evaluation_name)

        // Fallback to dataset name if source_data is an object
        if (category === 'General' && !Array.isArray(eval_.source_data)) {
          category = inferCategoryFromBenchmark(eval_.source_data.dataset_name)
        }

        evalCategories.add(category)
        categoriesSet.add(category)
      }
    }
    
    // Add evaluation to each unique category it belongs to (once per category)
    for (const category of evalCategories) {
      if (!evaluationsByCategory[category]) {
        evaluationsByCategory[category] = []
      }
      evaluationsByCategory[category].push(eval_)
    }
  }
  
  // Find latest timestamp
  const timestamps = evaluations.map(e => {
    const ts = e.retrieved_timestamp
    // Check if it's a number (unix timestamp in seconds)
    if (!isNaN(Number(ts)) && !ts.includes('-')) {
      return parseFloat(ts) * 1000
    }
    // Assume ISO string or date string
    return new Date(ts).getTime()
  })
  
  const latestTimestamp = new Date(Math.max(...timestamps)).toISOString()
  
  // Calculate total benchmark results
  const totalResults = evaluations.reduce((sum, eval_) => sum + eval_.evaluation_results.length, 0)

  return {
    model_info: modelInfo,
    evaluations_by_category: evaluationsByCategory as Record<CategoryType, BenchmarkEvaluation[]>,
    total_evaluations: totalResults,
    last_updated: latestTimestamp,
    categories_covered: Array.from(categoriesSet),
  }
}

function pickRepresentativeModelInfo(evaluations: BenchmarkEvaluation[]): ModelInfo {
  const sorted = [...evaluations].sort((a, b) => {
    const aTimestamp = new Date(a.retrieved_timestamp).getTime() || Number(a.retrieved_timestamp) * 1000 || 0
    const bTimestamp = new Date(b.retrieved_timestamp).getTime() || Number(b.retrieved_timestamp) * 1000 || 0
    if (bTimestamp !== aTimestamp) {
      return bTimestamp - aTimestamp
    }

    return b.evaluation_results.length - a.evaluation_results.length
  })

  return sorted[0].model_info
}

type AggregatedVariantDescriptor = {
  variantKey: string
  variantLabel: string
  variantDisplayName: string
  familyId: string
  familyName: string
  versionDate?: string
  versionQualifier?: string
  mergedSetupAlias: boolean
}

function getSetupAliasMode(modelInfo: ModelInfo) {
  const rawMode = modelInfo.additional_details?.mode
  if (typeof rawMode !== 'string') {
    return null
  }

  const normalizedMode = rawMode.trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (!normalizedMode) {
    return null
  }

  if (
    normalizedMode === 'prompt' ||
    normalizedMode === 'fc' ||
    normalizedMode === 'function calling' ||
    normalizedMode.startsWith('thinking')
  ) {
    return rawMode.trim()
  }

  return null
}

function getAggregatedVariantDescriptor(modelInfo: ModelInfo): AggregatedVariantDescriptor {
  const identity = getCanonicalModelIdentity(modelInfo)
  const setupAliasMode = getSetupAliasMode(modelInfo)

  if (!setupAliasMode) {
    return {
      variantKey: identity.variantKey,
      variantLabel: identity.variantLabel,
      variantDisplayName: identity.variantDisplayName,
      familyId: identity.familyId,
      familyName: identity.familyName,
      versionDate: identity.versionDate,
      versionQualifier: identity.versionQualifier,
      mergedSetupAlias: false,
    }
  }

  if (identity.versionDate) {
    return {
      variantKey: identity.versionDate,
      variantLabel: identity.versionDate,
      variantDisplayName: `${identity.familyName} (${identity.versionDate})`,
      familyId: identity.familyId,
      familyName: identity.familyName,
      versionDate: identity.versionDate,
      versionQualifier: undefined,
      mergedSetupAlias: true,
    }
  }

  return {
    variantKey: 'base',
    variantLabel: 'Current',
    variantDisplayName: identity.familyName,
    familyId: identity.familyId,
    familyName: identity.familyName,
    versionDate: undefined,
    versionQualifier: undefined,
    mergedSetupAlias: true,
  }
}

function sortVariants(variants: ModelVariantSummary[]) {
  return [...variants].sort((a, b) => {
    const aDate = a.version_date ? new Date(a.version_date).getTime() : Number.NEGATIVE_INFINITY
    const bDate = b.version_date ? new Date(b.version_date).getTime() : Number.NEGATIVE_INFINITY

    if (aDate !== bDate) {
      return bDate - aDate
    }

    if (b.total_evaluations !== a.total_evaluations) {
      return b.total_evaluations - a.total_evaluations
    }

    return a.variant_label.localeCompare(b.variant_label)
  })
}

export function createModelFamilySummary(
  evaluations: BenchmarkEvaluation[]
): ModelEvaluationSummary {
  if (evaluations.length === 0) {
    throw new Error("No evaluations provided")
  }

  const familyIdentity = getCanonicalModelIdentity(evaluations[0].model_info)
  const variantGroups = new Map<string, {
    descriptor: AggregatedVariantDescriptor
    evaluations: BenchmarkEvaluation[]
  }>()

  for (const evaluation of evaluations) {
    const descriptor = getAggregatedVariantDescriptor(evaluation.model_info)
    const existing = variantGroups.get(descriptor.variantKey)

    if (existing) {
      existing.evaluations.push(evaluation)
      continue
    }

    variantGroups.set(descriptor.variantKey, {
      descriptor,
      evaluations: [evaluation],
    })
  }

  const variants = sortVariants(
    Array.from(variantGroups.values()).map(({ descriptor, evaluations: variantEvaluations }) => {
      const summary = createModelSummary(variantEvaluations)
      const modelInfo = descriptor.mergedSetupAlias
        ? {
            ...summary.model_info,
            id: descriptor.variantKey === 'base'
              ? descriptor.familyId
              : `${descriptor.familyId}::${descriptor.variantKey}`,
            name: descriptor.variantDisplayName,
            model_version: descriptor.variantKey === 'base' ? undefined : descriptor.variantLabel,
          }
        : summary.model_info

      return {
        ...summary,
        model_info: modelInfo,
        variant_id: `${descriptor.familyId}::${descriptor.variantKey}`,
        variant_key: descriptor.variantKey,
        variant_label: descriptor.variantLabel,
        variant_display_name: descriptor.variantDisplayName,
        raw_model_ids: Array.from(new Set(variantEvaluations.map((item) => item.model_info.id))).sort((a, b) =>
          a.localeCompare(b)
        ),
        family_id: descriptor.familyId,
        family_name: descriptor.familyName,
        version_date: descriptor.versionDate,
        version_qualifier: descriptor.versionQualifier,
      }
    })
  )

  const familySummary = createModelSummary(evaluations)
  const representativeVariant = variants[0] ?? familySummary

  return {
    ...familySummary,
    model_info: {
      ...representativeVariant.model_info,
      id: familyIdentity.familyId,
      name: familyIdentity.familyName,
      model_version: undefined,
    },
    model_family_id: familyIdentity.familyId,
    model_route_id: getModelFamilyRouteId(familyIdentity.familyId),
    model_family_name: familyIdentity.familyName,
    raw_model_ids: Array.from(new Set(evaluations.map((item) => item.model_info.id))).sort((a, b) =>
      a.localeCompare(b)
    ),
    variants,
  }
}

/**
 * Convert model summary to card display format
 */
export function createEvaluationCard(
  summary: ModelEvaluationSummary
): EvaluationCardData {
  // Get all unique benchmarks
  const benchmarksSet = new Set<string>()
  const allScores: Array<{
    benchmark: string
    benchmarkKey: string
    score: number
    metric: string
    unit?: string
  }> = []
  const sourceUrls = new Set<string>()
  const detailUrls = new Set<string>()
  const evaluatorNames = new Set<string>()
  const sourceTypes = new Set<SourceMetadata["source_type"]>()
  const evalLibraries = new Map<string, { name: string; version?: string; fork?: string }>()
  let missingGenerationConfigCount = 0
  let thirdPartyEvalCount = 0
  let latestSourceName: string | undefined
  let latestTimestamp = Number.NEGATIVE_INFINITY
  
  // Collect all evaluations
  for (const evals of Object.values(summary.evaluations_by_category)) {
    for (const eval_ of evals) {
      if (eval_.source_metadata.source_organization_name) {
        evaluatorNames.add(eval_.source_metadata.source_organization_name)
      }

      sourceTypes.add(eval_.source_metadata.source_type)

      if (eval_.source_metadata.evaluator_relationship === "third_party") {
        thirdPartyEvalCount += 1
      }

      const numericTimestamp = Number(eval_.retrieved_timestamp)
      const timestamp =
        !Number.isNaN(numericTimestamp) && !eval_.retrieved_timestamp.includes("-")
          ? numericTimestamp * 1000
          : new Date(eval_.retrieved_timestamp).getTime()
      if (Number.isFinite(timestamp) && timestamp >= latestTimestamp) {
        latestTimestamp = timestamp
        latestSourceName = eval_.source_metadata.source_name
      }

      if (eval_.eval_library?.name) {
        const libraryKey = `${eval_.eval_library.name}@${eval_.eval_library.version ?? ""}`
        evalLibraries.set(libraryKey, {
          name: eval_.eval_library.name,
          version: eval_.eval_library.version,
          fork:
            typeof eval_.eval_library.additional_details?.fork === "string"
              ? eval_.eval_library.additional_details.fork
              : undefined,
        })
      }

      // Handle source_data as either string[] or SourceData object
      if (Array.isArray(eval_.source_data)) {
        // source_data is string[] (URLs), extract benchmark names from evaluation_results
        for (const result of eval_.evaluation_results) {
          benchmarksSet.add(getBenchmarkName(eval_, result))
        }
      } else {
        // Even if source_data is an object, we should try to extract individual benchmarks
        // from evaluation_results if available, as dataset_name might be a suite name.
        if (eval_.evaluation_results && eval_.evaluation_results.length > 0) {
           for (const result of eval_.evaluation_results) {
             benchmarksSet.add(getBenchmarkName(eval_, result))
           }
        } else {
           benchmarksSet.add(eval_.source_data.dataset_name)
        }
      }
      
      if (eval_.source_metadata.source_url) {
        sourceUrls.add(eval_.source_metadata.source_url)
      }
      
      // Add source_data URLs if it's a string array
      if (Array.isArray(eval_.source_data)) {
        eval_.source_data.forEach(url => sourceUrls.add(url))
      }
      
      for (const result of eval_.evaluation_results) {
        if (!result.generation_config) {
          missingGenerationConfigCount += 1
        }

        if (result.detailed_evaluation_results_url) {
          detailUrls.add(result.detailed_evaluation_results_url)
        }
        
        allScores.push({
          benchmark: getEvaluationDisplayName(eval_, result),
          benchmarkKey: getBenchmarkName(eval_, result),
          score: result.score_details.score,
          metric: result.metric_config.evaluation_description || result.evaluation_name,
          unit: result.metric_config.unit
        })
      }
    }
  }
  
  // Deduplicate by benchmark name, keeping highest score for each
  const scoresByBenchmark = new Map<
    string,
    { benchmark: string; benchmarkKey: string; score: number; metric: string; unit?: string }
  >()
  for (const scoreData of allScores) {
    const existing = scoresByBenchmark.get(scoreData.benchmark)
    if (!existing || scoreData.score > existing.score) {
      scoresByBenchmark.set(scoreData.benchmark, scoreData)
    }
  }
  
  // Calculate category stats (count of unique benchmarks per category)
  const categoryStats: Record<CategoryType, number> = {} as any
  
  for (const category of summary.categories_covered) {
    const evals = summary.evaluations_by_category[category] || []
    const categoryBenchmarks = new Set<string>()
    
    for (const eval_ of evals) {
      for (const result of eval_.evaluation_results) {
        categoryBenchmarks.add(getBenchmarkName(eval_, result))
      }
    }
    categoryStats[category] = categoryBenchmarks.size
  }

  // Get top 5 unique benchmarks by score
  const topScores = Array.from(scoresByBenchmark.values())
    .sort((a, b) => {
      const priorityDiff = getBenchmarkPriority(b.benchmarkKey) - getBenchmarkPriority(a.benchmarkKey)
      if (priorityDiff !== 0) {
        return priorityDiff
      }

      if (b.score !== a.score) {
        return b.score - a.score
      }

      return a.benchmark.localeCompare(b.benchmark)
    })
    .slice(0, 5)
    .map(({ benchmark, score, metric, unit }) => ({
      benchmark,
      score,
      metric,
      unit,
    }))

  const paramsBillionsRaw = summary.model_info.additional_details?.params_billions
  const paramsBillions =
    typeof paramsBillionsRaw === "number"
      ? paramsBillionsRaw
      : typeof paramsBillionsRaw === "string"
        ? Number.parseFloat(paramsBillionsRaw)
        : null
  const reproducibilityStatus =
    missingGenerationConfigCount === 0
      ? "complete"
      : missingGenerationConfigCount === summary.total_evaluations
        ? "missing"
        : "partial"

  return {
    id: summary.model_family_id,
    route_id: summary.model_route_id,
    model_name: summary.model_family_name,
    model_id: summary.model_info.id,
    canonical_model_name: summary.model_family_name,
    developer: summary.model_info.developer ?? "",
    evaluations_count: summary.total_evaluations,
    benchmarks_count: benchmarksSet.size,
    variant_count: summary.variants.length,
    categories: summary.categories_covered,
    category_stats: categoryStats,
    latest_timestamp: summary.last_updated,
    evaluator_count: evaluatorNames.size,
    evaluator_names: Array.from(evaluatorNames).sort((a, b) => a.localeCompare(b)),
    source_type_count: sourceTypes.size,
    source_types: Array.from(sourceTypes).sort((a, b) => a.localeCompare(b)),
    evidence_count: sourceUrls.size + detailUrls.size,
    missing_generation_config_count: missingGenerationConfigCount,
    third_party_eval_count: thirdPartyEvalCount,
    independent_verification_ratio:
      summary.total_evaluations > 0 ? thirdPartyEvalCount / summary.total_evaluations : 0,
    reproducibility_status: reproducibilityStatus,
    eval_libraries: Array.from(evalLibraries.values()).sort((a, b) => a.name.localeCompare(b.name)),
    latest_source_name: latestSourceName,
    params_billions: Number.isFinite(paramsBillions ?? NaN) ? paramsBillions : null,
    reproducibility_summary: summary.reproducibility_summary,
    provenance_summary: summary.provenance_summary,
    comparability_summary: summary.comparability_summary,
    top_scores: topScores,
    source_urls: Array.from(sourceUrls),
    detail_urls: Array.from(detailUrls),
    architecture: summary.model_info.architecture,
    params: summary.model_info.parameter_count,
    inference_engine: summary.model_info.inference_engine,
    inference_platform: summary.model_info.inference_platform,
    input_modalities: summary.model_info.modalities?.input,
    output_modalities: summary.model_info.modalities?.output,
    release_date: summary.model_info.release_date,
    model_url: summary.model_info.model_url,
  }
}

/**
 * Get category stats for a model
 */
export function getCategoryStats(
  summary: ModelSummaryCore
): {
  categories: { category: CategoryType; count: number; avg_score: number; total_results: number }[]
} {
  const categories: { category: CategoryType; count: number; avg_score: number; total_results: number }[] = []
  
  for (const category of summary.categories_covered) {
    const evals = summary.evaluations_by_category[category] || []
    const allScores: number[] = []

    // Collect all scores from all results in this category
    for (const eval_ of evals) {
      for (const result of eval_.evaluation_results) {
        allScores.push(result.score_details.score)
      }
    }
    
    const avgScore = allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0
    
    const stat = {
      category,
      count: evals.length, // Number of evaluation files
      total_results: allScores.length, // Number of actual benchmark results
      avg_score: avgScore,
    }
    
    categories.push(stat)
  }
  
  // Sort categories by name or some other metric if needed
  categories.sort((a, b) => a.category.localeCompare(b.category))
  
  return { categories }
}

/**
 * Load and process evaluations from file paths
 */
export async function loadEvaluations(
  filePaths: string[]
): Promise<BenchmarkEvaluation[]> {
  const evaluations: BenchmarkEvaluation[] = []
  
  for (const path of filePaths) {
    try {
      const response = await fetch(path)
      if (!response.ok) continue
      
      const data = await response.json()
      
      // Validate it matches our schema
      if (data.schema_version && data.evaluation_id && data.model_info) {
        evaluations.push(data as BenchmarkEvaluation)
      }
    } catch (error) {
      console.warn(`Failed to load evaluation from ${path}:`, error)
    }
  }
  
  return evaluations
}

/**
 * Process all evaluations into card data
 */
export async function processEvaluationsToCards(
  filePaths: string[]
): Promise<EvaluationCardData[]> {
  const evaluations = await loadEvaluations(filePaths)
  const grouped = groupEvaluationsByModelFamily(evaluations)
  
  const cards: EvaluationCardData[] = []
  
  for (const modelId in grouped) {
    const modelEvals = grouped[modelId]
    const summary = createModelFamilySummary(modelEvals)
    const card = createEvaluationCard(summary)
    cards.push(card)
  }
  
  return cards
}

/**
 * Format score with proper precision
 */
export function formatScore(
  score: number,
  scoreType: 'continuous' | 'discrete' | 'binary',
  maxScore?: number
): string {
  if (scoreType === 'binary') {
    return score > 0.5 ? 'Pass' : 'Fail'
  }
  
  if (maxScore && maxScore === 1.0) {
    // It's a percentage/ratio
    return `${(score * 100).toFixed(1)}%`
  }
  
  if (maxScore && maxScore === 100) {
    return `${score.toFixed(1)}`
  }
  
  // Default formatting
  return score.toFixed(3)
}

/**
 * Get benchmark display name
 */
export function getBenchmarkDisplayName(name: string | undefined | null): string {
  if (!name) return 'Unknown Benchmark'
  
  // Map common benchmarks to friendly names
  const mapping: Record<string, string> = {
    'MMLU': 'Massive Multitask Language Understanding',
    'MMLU-Pro': 'MMLU Professional',
    'GSM8K': 'Grade School Math 8K',
    'HumanEval': 'Human Eval (Code)',
    'MBPP': 'Mostly Basic Python Problems',
    'HellaSwag': 'HellaSwag (Commonsense)',
    'ARC': 'AI2 Reasoning Challenge',
    'TruthfulQA': 'TruthfulQA',
    'BBH': 'Big-Bench Hard',
    'MATH': 'MATH Dataset',
  }
  
  for (const [key, value] of Object.entries(mapping)) {
    if (name.toUpperCase().includes(key.toUpperCase())) {
      return value
    }
  }
  
  return name
}

// ── Eval-centric grouping ─────────────────────────────────────────────────────

/**
 * Group individual benchmark results across all model files, keyed by
 * evaluation_name.  Each entry describes one benchmark and which models ran it.
 */
export function groupEvaluationsByBenchmark(
  evaluations: BenchmarkEvaluation[]
): Record<string, BenchmarkEvalSummary> {
  const summaries: Record<string, BenchmarkEvalSummary> = {}

  for (const eval_ of evaluations) {
    for (const result of eval_.evaluation_results) {
      const displayName = getEvaluationDisplayName(eval_, result)
      const evalId = getEvaluationSummaryId(eval_, result)
      const compositeBenchmarkKey = eval_.benchmark || getBenchmarkName(eval_, result)
      const compositeBenchmarkName = getBenchmarkDisplayName(compositeBenchmarkKey)

      if (!summaries[evalId]) {
        const category = inferCategoryFromBenchmark(displayName)

        summaries[evalId] = {
          evaluation_name: displayName,
          evaluation_id: evalId,
          composite_benchmark_key: compositeBenchmarkKey,
          composite_benchmark_name: compositeBenchmarkName,
          category,
          metric_config: result.metric_config,
          model_results: [],
          models_count: 0,
          evaluator_names: [],
          source_types: [],
          latest_source_name: undefined,
          third_party_ratio: 0,
          missing_generation_config_count: 0,
          best_model: null,
          worst_model: null,
          avg_score: 0,
          avg_score_norm: 0,
        }
      }

      summaries[evalId].model_results.push({
        model_info: eval_.model_info,
        score: result.score_details.score,
        score_details: result.score_details,
        evaluation_timestamp: result.evaluation_timestamp,
        source_metadata: eval_.source_metadata,
        source_data: result.source_data ?? eval_.source_data,
        result,
      })

      const orgName = eval_.source_metadata.source_organization_name
      if (!summaries[evalId].evaluator_names.includes(orgName)) {
        summaries[evalId].evaluator_names.push(orgName)
      }
    }
  }

  // Finalise each summary
  for (const summary of Object.values(summaries)) {
    summary.models_count = summary.model_results.length
    const scores = summary.model_results.map(m => m.score)
    summary.avg_score = scores.reduce((a, b) => a + b, 0) / scores.length
    summary.source_types = Array.from(
      new Set(summary.model_results.map((result) => result.source_metadata.source_type))
    ).sort((a, b) => a.localeCompare(b))
    summary.third_party_ratio =
      summary.model_results.filter((result) => result.source_metadata.evaluator_relationship === "third_party").length /
      summary.model_results.length
    summary.missing_generation_config_count = summary.model_results.filter(
      (result) => !result.result.generation_config
    ).length

    let latestTimestamp = Number.NEGATIVE_INFINITY
    for (const result of summary.model_results) {
      const numericTimestamp = Number(result.evaluation_timestamp)
      const timestamp =
        !Number.isNaN(numericTimestamp) && !result.evaluation_timestamp.includes("-")
          ? numericTimestamp * 1000
          : new Date(result.evaluation_timestamp).getTime()
      if (Number.isFinite(timestamp) && timestamp >= latestTimestamp) {
        latestTimestamp = timestamp
        summary.latest_source_name = result.source_metadata.source_name
      }
    }

    const maxScore = summary.metric_config.max_score ?? 1
    const minScore = summary.metric_config.min_score ?? 0
    const range = maxScore - minScore
    summary.avg_score_norm = range > 0 ? (summary.avg_score - minScore) / range : 0

    const lowerIsBetter = summary.metric_config.lower_is_better
    const sorted = [...summary.model_results].sort((a, b) =>
      lowerIsBetter ? a.score - b.score : b.score - a.score
    )

    if (sorted.length > 0) {
      summary.best_model = { name: sorted[0].model_info.name, score: sorted[0].score }
      summary.worst_model = {
        name: sorted[sorted.length - 1].model_info.name,
        score: sorted[sorted.length - 1].score,
      }
    }
  }

  return summaries
}

/**
 * Load files and return a flat array of BenchmarkEvalSummary objects,
 * one per unique evaluation name across all models.
 */
export async function processEvaluationsToBenchmarkSummaries(
  filePaths: string[]
): Promise<BenchmarkEvalSummary[]> {
  const evaluations = await loadEvaluations(filePaths)
  const grouped = groupEvaluationsByBenchmark(evaluations)
  return Object.values(grouped)
}

export function toBenchmarkEvalListItem(
  summary: BenchmarkEvalSummary
): BenchmarkEvalListItem {
  const { model_results: _modelResults, ...listItem } = summary
  return listItem
}
