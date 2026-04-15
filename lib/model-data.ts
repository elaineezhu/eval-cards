import "server-only"

import type {
  BenchmarkCard,
  BenchmarkEvaluation,
  CategoryType,
  EvaluationCardData,
  EvaluationResult,
  ModelInfo,
  SourceData,
  SourceMetadata,
} from "@/lib/benchmark-schema"
import type { BackendManifest, EvalHierarchy } from "@/lib/backend-artifacts"
import { inferCategoryFromBenchmark } from "@/lib/benchmark-schema"
import {
  type BenchmarkEvalListItem,
  type BenchmarkEvalSummary,
  type ModelResultForBenchmark,
  createEvaluationCard,
  createModelFamilySummary,
  groupEvaluationsByBenchmark,
  groupEvaluationsByModelFamily,
  groupEvaluationsByModel,
  toBenchmarkEvalListItem,
} from "@/lib/eval-processing"
import { getCanonicalModelIdentity, getModelFamilyRouteId } from "@/lib/model-family"
import { getBenchmarkCard, normalizeBenchmarkKey } from "@/lib/benchmark-metadata"
import {
  type HFEvalDetail,
  type HFEvalModelResult,
  type HFModelCardEntry,
  type HFModelDetail,
  fetchBackendManifest,
  fetchEvalHierarchy,
  fetchModelCardsList,
  fetchModelCardsListLite,
  fetchEvalList as fetchHFEvalList,
  fetchEvalListLite as fetchHFEvalListLite,
  fetchDevelopersList,
  fetchDeveloperDetail as fetchHFDeveloperDetail,
  fetchModelDetail as fetchHFModelDetail,
  fetchEvalDetail as fetchHFEvalDetail,
  flattenModelEvaluations,
  mapHFCategories,
} from "@/lib/hf-data"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugifyEvalId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function getAggregateEvalId(value: string) {
  return `aggregate__${slugifyEvalId(value)}`
}

function normalizeEvalTimestamp(value: string) {
  const numericTimestamp = Number(value)
  return !Number.isNaN(numericTimestamp) && !value.includes("-")
    ? numericTimestamp * 1000
    : new Date(value).getTime()
}

function normalizeSummaryScore(summary: BenchmarkEvalSummary, score: number) {
  const maxScore = summary.metric_config.max_score ?? 1
  const minScore = summary.metric_config.min_score ?? 0
  const range = maxScore - minScore
  return range > 0 ? (score - minScore) / range : score
}

function humanizeToken(token: string) {
  return token
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getCanonicalInstanceResultsUrl(value: unknown) {
  if (typeof value !== "string") {
    return undefined
  }

  return value.includes("/datasets/evaleval/card_backend/") && value.includes("/instances/")
    ? value
    : undefined
}

// Canonical display names — keyed by normalized form (lowercase, hyphens→underscores)
const BENCHMARK_NAMES: Record<string, string> = {
  hfopenllm_v2: "HF Open LLM v2",
  helm_lite: "HELM Lite",
  helm_capabilities: "HELM Capabilities",
  helm_classic: "HELM Classic",
  helm_instruct: "HELM Instruct",
  helm_mmlu: "HELM MMLU",
  reward_bench: "RewardBench",
  reward_bench_2: "RewardBench 2",
  bfcl: "BFCL",
  global_mmlu_lite: "Global MMLU Lite",
  swe_bench: "SWE-bench",
  arc_agi: "ARC-AGI",
  tau_bench_2: "TAU-Bench 2",
  ace: "ACE",
  apex_agents: "APEX Agents",
  apex_v1: "APEX v1",
  appworld: "AppWorld",
  browsecompplus: "BrowseComp+",
  livecodebenchpro: "LiveCodeBench Pro",
  sciarena: "SciArena",
  terminal_bench_2_0: "Terminal Bench 2.0",
  la_leaderboard: "LA Leaderboard",
  theory_of_mind: "Theory of Mind",
  fibble_arena: "Fibble Arena",
  fibble1_arena: "Fibble Arena v1",
  fibble2_arena: "Fibble Arena v2",
  fibble3_arena: "Fibble Arena v3",
  fibble4_arena: "Fibble Arena v4",
  fibble5_arena: "Fibble Arena v5",
  wordle_arena: "Wordle Arena",
}

function normalizeBenchmarkKeyForLookup(key: string) {
  return key.toLowerCase().replace(/[-.\s]+/g, "_").replace(/^_+|_+$/g, "")
}

function getBenchmarkDisplayName(benchmark: string) {
  return BENCHMARK_NAMES[normalizeBenchmarkKeyForLookup(benchmark)] ?? humanizeToken(benchmark)
}

function pipelineSlugify(text: string) {
  return (
    text
      .replace(/[\x00-\x1f\x7f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  )
}

function getDeveloperRouteId(developer: string) {
  return pipelineSlugify(developer.trim().toLowerCase())
}

// ---------------------------------------------------------------------------
// Model detail slug candidates (for HF file lookup)
// ---------------------------------------------------------------------------

function getModelDetailSlugCandidates(modelId: string): string[] {
  const normalized = modelId.trim()
  // The HF dataset uses "__" to separate namespace/model in filenames
  // e.g., "openai/gpt-4o" → "openai__gpt-4o"
  // It also replaces dots with hyphens: "gpt-3.5" → "gpt-3-5"
  const candidates = new Set<string>()

  const withSlash = normalized.replace(/\//g, "__")
  const withDots = withSlash.replace(/\./g, "-")

  candidates.add(pipelineSlugify(withSlash))
  candidates.add(pipelineSlugify(withSlash.toLowerCase()))
  candidates.add(pipelineSlugify(withDots))
  candidates.add(pipelineSlugify(withDots.toLowerCase()))
  candidates.add(pipelineSlugify(normalized))
  candidates.add(pipelineSlugify(normalized.toLowerCase()))

  return Array.from(candidates)
}

function getDeveloperSlugCandidates(developerOrRouteId: string): string[] {
  const normalized = developerOrRouteId.trim()
  const candidates = new Set<string>()
  const lowercase = normalized.toLowerCase()
  const underscoreSlug = pipelineSlugify(normalized)
  const lowercaseUnderscoreSlug = pipelineSlugify(lowercase)
  const hyphenSlug = lowercase
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const compactSlug = lowercase.replace(/[^a-z0-9]+/g, "")

  candidates.add(underscoreSlug)
  candidates.add(lowercaseUnderscoreSlug)
  candidates.add(underscoreSlug.replace(/_/g, "-"))
  candidates.add(lowercaseUnderscoreSlug.replace(/_/g, "-"))
  if (hyphenSlug) {
    candidates.add(hyphenSlug)
  }
  if (compactSlug) {
    candidates.add(compactSlug)
  }

  return Array.from(candidates)
}

// ---------------------------------------------------------------------------
// Developer name normalization
// ---------------------------------------------------------------------------

const KNOWN_DEVELOPER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  google: "Google",
  anthropic: "Anthropic",
  meta: "Meta",
  microsoft: "Microsoft",
  mistralai: "Mistral AI",
  deepseek: "DeepSeek",
  "deepseek-ai": "DeepSeek",
  cohere: "Cohere",
  nvidia: "NVIDIA",
  alibaba: "Alibaba",
  amazon: "Amazon",
  apple: "Apple",
  ibm: "IBM",
  xai: "xAI",
  "x-ai": "xAI",
}

function normalizeDeveloperName(name: string): string {
  const key = name.trim().toLowerCase()
  if (KNOWN_DEVELOPER_NAMES[key]) return KNOWN_DEVELOPER_NAMES[key]
  // Title-case if the name is all-lowercase and not a compound like "01-ai"
  if (name === name.toLowerCase() && /^[a-z]/.test(name)) {
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  return name
}

function getModelCardAverageScore(entry: HFModelCardEntry) {
  if (typeof entry.score_summary?.average === "number") {
    return entry.score_summary.average
  }

  if (typeof entry.score_summary?.avg === "number") {
    return entry.score_summary.avg
  }

  return null
}

function getModelCardLatestTimestamp(entry: HFModelCardEntry) {
  const candidateTimestamps = [entry.last_updated, ...entry.variants.map((variant) => variant.last_updated)]
    .filter((value): value is string => Boolean(value))

  if (candidateTimestamps.length === 0) {
    return entry.last_updated
  }

  return candidateTimestamps.sort((a, b) => normalizeEvalTimestamp(b) - normalizeEvalTimestamp(a))[0]
}

function getModelCardTopScores(entry: HFModelCardEntry): EvaluationCardData["top_scores"] {
  if (Array.isArray(entry.top_benchmark_scores) && entry.top_benchmark_scores.length > 0) {
    return entry.top_benchmark_scores
      .filter((score) => Number.isFinite(score.score))
      .map((score) => ({
        benchmark: getBenchmarkDisplayName(score.benchmark),
        benchmarkKey: score.benchmarkKey,
        score: score.score,
        metric: score.evaluation_name || score.metric,
      }))
  }

  const averageScore = getModelCardAverageScore(entry)
  if (averageScore == null || entry.score_summary.count <= 0) {
    return []
  }

  return [
    {
      benchmark: "Average",
      score: averageScore,
      metric: "Cross-benchmark average",
    },
  ]
}

function getDeveloperBenchmarkStats(models: HFModelCardEntry[]) {
  const benchmarkCounts = new Map<string, number>()

  for (const model of models) {
    const benchmarkNames = (model.benchmark_names ?? []).filter(Boolean)
    const uniqueBenchmarks = new Set(
      benchmarkNames.length > 0 ? benchmarkNames : model.top_benchmark_scores?.map((score) => score.benchmark).filter(Boolean)
    )

    for (const benchmark of uniqueBenchmarks) {
      benchmarkCounts.set(benchmark, (benchmarkCounts.get(benchmark) ?? 0) + 1)
    }
  }

  return benchmarkCounts
}

function parseParamsBillions(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null
  }

  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  const compact = normalized.replace(/,/g, "")
  const tokenMatch = compact.match(/(\d+(?:\.\d+)?)\s*(trillion|tn|t|billion|bn|b|million|mn|m|thousand|k)\b/)
  if (tokenMatch) {
    const amount = Number.parseFloat(tokenMatch[1])
    if (!Number.isFinite(amount) || amount <= 0) {
      return null
    }

    const unit = tokenMatch[2]
    if (unit === "trillion" || unit === "tn" || unit === "t") {
      return amount * 1000
    }

    if (unit === "billion" || unit === "bn" || unit === "b") {
      return amount
    }

    if (unit === "million" || unit === "mn" || unit === "m") {
      return amount / 1000
    }

    if (unit === "thousand" || unit === "k") {
      return amount / 1_000_000
    }
  }

  const numeric = Number.parseFloat(compact)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

// ---------------------------------------------------------------------------
// HF model-cards.json → EvaluationCardData
// ---------------------------------------------------------------------------

function hfModelCardToEvaluationCardData(entry: HFModelCardEntry): EvaluationCardData {
  const canonicalIdentity = getCanonicalModelIdentity({
    id: entry.model_family_id,
    name: entry.model_family_name,
  })
  const categories = mapHFCategories(entry.categories_covered) as CategoryType[]
  const averageScore = getModelCardAverageScore(entry)
  const topScores = getModelCardTopScores(entry)

  // Distribute total evaluations across categories proportionally
  const categoryStats: Record<string, number> = {}
  const perCat = categories.length > 0
    ? Math.max(1, Math.floor(entry.total_evaluations / categories.length))
    : 0
  let remaining = entry.total_evaluations
  for (let i = 0; i < categories.length; i++) {
    const count = i === categories.length - 1 ? remaining : Math.min(perCat, remaining)
    categoryStats[categories[i]] = count
    remaining -= count
  }

  return {
    id: canonicalIdentity.familyId,
    route_id: getModelFamilyRouteId(canonicalIdentity.familyId),
    model_name: canonicalIdentity.familyName,
    model_id: canonicalIdentity.familyId,
    canonical_model_name: canonicalIdentity.familyName,
    developer: normalizeDeveloperName(entry.developer),
    evaluations_count: entry.total_evaluations,
    benchmarks_count: entry.benchmark_family_count || entry.benchmark_count,
    variant_count: entry.variants.length,
    categories,
    category_stats: categoryStats as Record<CategoryType, number>,
    latest_timestamp: getModelCardLatestTimestamp(entry),
    // These fields aren't available in the summary — use values that
    // avoid misleading "missing" / "self-reported only" badges.
    evaluator_count: 0,
    evaluator_names: [],
    source_type_count: 1,
    source_types: ["documentation"],
    evidence_count: entry.total_evaluations,
    missing_generation_config_count: 0,
    third_party_eval_count: 0,
    independent_verification_ratio: 0,
    reproducibility_status: "partial",
    eval_libraries: [],
    latest_source_name: entry.benchmark_names?.length
      ? `${entry.benchmark_names.length} benchmark${entry.benchmark_names.length === 1 ? "" : "s"}`
      : undefined,
    params_billions: parseParamsBillions(entry.params_billions),
    benchmark_names: (entry.benchmark_names ?? []).map((name) => getBenchmarkDisplayName(name)),
    score_summary: {
      count: entry.score_summary.count,
      min: entry.score_summary.min,
      max: entry.score_summary.max,
      average: averageScore,
    },
    top_scores: topScores,
    source_urls: [],
    detail_urls: [],
  }
}

// ---------------------------------------------------------------------------
// HF eval-list.json → BenchmarkEvalListItem
// ---------------------------------------------------------------------------

function hfEvalEntryToListItem(entry: {
  eval_summary_id: string
  benchmark: string
  benchmark_family_key: string
  benchmark_family_name: string
  benchmark_parent_name?: string
  benchmark_leaf_key: string
  benchmark_leaf_name: string
  evaluation_name?: string
  display_name: string
  is_summary_score?: boolean
  summary_eval_ids?: string[]
  category: string
  tags: { domains: string[]; languages: string[]; tasks: string[] }
  models_count: number
  metrics_count: number
  subtasks_count?: number
  metric_names: string[]
  primary_metric_name: string
  benchmark_card: BenchmarkCard | null
  source_data?: SourceData
  top_score: number
  instance_data: { available: boolean; url_count: number; sample_urls: string[]; models_with_loaded_instances: number }
  metrics: Array<{ metric_summary_id: string; metric_name: string; lower_is_better: boolean; models_count: number; top_score: number }>
}): BenchmarkEvalListItem {
  // Use the pipeline's category directly, mapped to our CategoryType
  const category = mapHFCategories([entry.category])[0] ?? "General" as CategoryType

  // Build a metric_config from the primary metric
  const metrics = entry.metrics ?? []
  const primaryMetric = metrics.find((m) => m.metric_name === entry.primary_metric_name) ?? metrics[0]

  const benchmarkDisplayName = getBenchmarkDisplayName(entry.benchmark_parent_name || entry.benchmark || "")
  const rawDisplayName = entry.evaluation_name || entry.display_name || entry.benchmark_leaf_name || entry.eval_summary_id
  const normalizedDisplayName = rawDisplayName.trim().toLowerCase()
  const prefersBenchmarkName =
    Boolean(benchmarkDisplayName) &&
    (normalizedDisplayName.startsWith("accuracy on ") ||
      normalizedDisplayName.startsWith("score on ") ||
      normalizedDisplayName.includes("for scorer") ||
      normalizedDisplayName.includes("model_graded"))

  return {
    evaluation_name: prefersBenchmarkName ? benchmarkDisplayName : rawDisplayName,
    evaluation_id: entry.eval_summary_id,
    composite_benchmark_key: entry.benchmark ?? "",
    composite_benchmark_name: benchmarkDisplayName,
    category,
    metric_config: {
      evaluation_description: entry.primary_metric_name,
      lower_is_better: primaryMetric?.lower_is_better ?? false,
      score_type: "continuous",
      min_score: 0,
      max_score: 1,
    },
    models_count: entry.models_count,
    evaluator_names: [],
    source_types: [],
    latest_source_name: getBenchmarkDisplayName(entry.benchmark),
    third_party_ratio: 0,
    missing_generation_config_count: 0,
    best_model: entry.top_score != null ? { name: "", score: entry.top_score } : null,
    worst_model: null,
    avg_score: 0,
    avg_score_norm: 0,
    benchmark_card: entry.benchmark_card ?? undefined,
    // New fields from the pipeline
    tags: entry.tags,
    metrics_count: entry.metrics_count,
    metric_names: entry.metric_names,
    instance_data: entry.instance_data,
    benchmark_family_key: entry.benchmark_family_key,
    benchmark_leaf_key: entry.benchmark_leaf_key,
    source_data: entry.source_data,
    top_score: entry.top_score,
    subtasks_count: entry.subtasks_count ?? 0,
    is_summary_score: entry.is_summary_score ?? false,
    summary_eval_ids: entry.summary_eval_ids ?? [],
  }
}

// ---------------------------------------------------------------------------
// HF eval detail → BenchmarkEvalSummary
// ---------------------------------------------------------------------------

function toSummaryMetricConfig(
  metric: HFEvalDetail["metrics"][number]
): BenchmarkEvalSummary["metric_config"] {
  const rawConfig = (metric.metric_config ?? {}) as Record<string, unknown>
  const description =
    (typeof rawConfig.evaluation_description === "string" && rawConfig.evaluation_description) ||
    (typeof rawConfig.metric_name === "string" && rawConfig.metric_name) ||
    metric.metric_name ||
    metric.display_name ||
    metric.evaluation_name ||
    ""
  const unit =
    typeof rawConfig.unit === "string"
      ? rawConfig.unit
      : typeof rawConfig.metric_unit === "string"
        ? rawConfig.metric_unit
        : undefined

  return {
    evaluation_description: description,
    lower_is_better: metric.lower_is_better ?? false,
    score_type:
      rawConfig.score_type === "binary" || rawConfig.score_type === "discrete"
        ? rawConfig.score_type
        : "continuous",
    min_score: typeof rawConfig.min_score === "number" ? rawConfig.min_score : 0,
    max_score: typeof rawConfig.max_score === "number" ? rawConfig.max_score : 1,
    unit,
  }
}

function toBenchmarkSummaryMetric(metric: HFEvalDetail["metrics"][number]) {
  const metricConfig = toSummaryMetricConfig(metric)
  const scores = (metric.model_results ?? []).map((result) => result.score).filter(Number.isFinite)
  const metricName = metric.metric_name || metric.evaluation_name || metric.display_name || "Metric"
  const displayName = metric.display_name || metric.metric_name || metric.evaluation_name || metricName

  return {
    metric_summary_id: metric.metric_summary_id,
    metric_name: metricName,
    display_name: displayName,
    canonical_display_name: metric.canonical_display_name,
    metric_key: metric.metric_key,
    lower_is_better: metric.lower_is_better ?? false,
    models_count: metric.model_results?.length ?? 0,
    top_score: scores.length > 0
      ? (metric.lower_is_better ? Math.min(...scores) : Math.max(...scores))
      : undefined,
    unit: metricConfig.unit,
  }
}

function extractDetailSubtasks(detail: HFEvalDetail) {
  return (Array.isArray(detail.subtasks) ? detail.subtasks : [])
    .flatMap((subtask) => {
      if (!subtask || typeof subtask !== "object") {
        return []
      }

      const subtaskRecord = subtask as Record<string, unknown>
      const metrics = Array.isArray(subtaskRecord.metrics)
        ? (subtaskRecord.metrics as HFEvalDetail["metrics"])
        : []

      return [{
        subtask_key:
          (typeof subtaskRecord.subtask_key === "string" && subtaskRecord.subtask_key) ||
          (typeof subtaskRecord.display_name === "string" && slugifyEvalId(subtaskRecord.display_name)) ||
          "subtask",
        subtask_name:
          (typeof subtaskRecord.subtask_name === "string" && subtaskRecord.subtask_name) ||
          (typeof subtaskRecord.display_name === "string" && subtaskRecord.display_name) ||
          "Subtask",
        display_name:
          (typeof subtaskRecord.display_name === "string" && subtaskRecord.display_name) ||
          (typeof subtaskRecord.subtask_name === "string" && subtaskRecord.subtask_name) ||
          "Subtask",
        canonical_display_name:
          typeof subtaskRecord.canonical_display_name === "string"
            ? subtaskRecord.canonical_display_name
            : undefined,
        metrics,
      }]
    })
}

function extractBenchmarkSubtasks(detail: HFEvalDetail): NonNullable<BenchmarkEvalSummary["subtasks"]> {
  return extractDetailSubtasks(detail).map((subtask) => ({
    subtask_key: subtask.subtask_key,
    subtask_name: subtask.subtask_name,
    display_name: subtask.display_name,
    canonical_display_name: subtask.canonical_display_name,
    metrics: subtask.metrics.map(toBenchmarkSummaryMetric),
  }))
}

function buildBenchmarkLeaderboardMatrix(detail: HFEvalDetail) {
  const benchmarkKey = detail.benchmark ?? ""
  const sourceName = detail.source_data?.dataset_name || benchmarkKey
  const sourceOrganization = detail.source_data?.hf_repo || sourceName
  const sourceMetadata: SourceMetadata = {
    source_type: "documentation",
    source_name: sourceName,
    source_organization_name: sourceOrganization,
    evaluator_relationship: "other",
  }
  const sourceData = detail.source_data ?? { dataset_name: benchmarkKey }

  const leaderboardMetrics: NonNullable<BenchmarkEvalSummary["leaderboard_metrics"]> = []
  const rowStates = new Map<
    string,
    NonNullable<BenchmarkEvalSummary["leaderboard_rows"]>[number] & { _timestampValue: number }
  >()

  const registerMetric = (
    metric: HFEvalDetail["metrics"][number],
    scope: "root" | "subtask",
    subtask?: {
      subtask_key: string
      subtask_name: string
    }
  ) => {
    const summaryMetric = toBenchmarkSummaryMetric(metric)
    const metricToken = summaryMetric.metric_summary_id || summaryMetric.metric_key || slugifyEvalId(summaryMetric.display_name)
    const columnKey = [scope, subtask?.subtask_key, metricToken].filter(Boolean).join(":")

    leaderboardMetrics.push({
      column_key: columnKey,
      metric_summary_id: summaryMetric.metric_summary_id,
      metric_name: summaryMetric.metric_name,
      display_name: summaryMetric.display_name,
      canonical_display_name: summaryMetric.canonical_display_name,
      lower_is_better: summaryMetric.lower_is_better,
      unit: summaryMetric.unit,
      scope,
      subtask_key: subtask?.subtask_key,
      subtask_name: subtask?.subtask_name,
    })

    for (const modelResult of metric.model_results ?? []) {
      const modelId = modelResult.model_id || modelResult.model_name
      if (!modelId) {
        continue
      }

      const nextTimestamp = normalizeEvalTimestamp(modelResult.retrieved_timestamp ?? "")
      const existing = rowStates.get(modelId)
      if (!existing) {
        rowStates.set(modelId, {
          model_info: {
            name: modelResult.model_name ?? "",
            id: modelId,
            developer: modelResult.developer ?? "",
          },
          model_route_id: modelResult.model_route_id,
          evaluation_timestamp: modelResult.retrieved_timestamp ?? "",
          source_metadata: sourceMetadata,
          source_data: sourceData,
          values: { [columnKey]: modelResult.score ?? null },
          metrics_present: 0,
          _timestampValue: nextTimestamp,
        })
        continue
      }

      existing.values[columnKey] = modelResult.score ?? null
      if (!existing.model_route_id && modelResult.model_route_id) {
        existing.model_route_id = modelResult.model_route_id
      }
      if (nextTimestamp >= existing._timestampValue) {
        existing.evaluation_timestamp = modelResult.retrieved_timestamp ?? existing.evaluation_timestamp
        existing._timestampValue = nextTimestamp
      }
    }
  }

  for (const metric of detail.metrics ?? []) {
    registerMetric(metric, "root")
  }

  for (const subtask of extractDetailSubtasks(detail)) {
    for (const metric of subtask.metrics) {
      registerMetric(metric, "subtask", {
        subtask_key: subtask.subtask_key,
        subtask_name: subtask.display_name || subtask.subtask_name,
      })
    }
  }

  const leaderboardRows = Array.from(rowStates.values()).map(({ _timestampValue, ...row }) => ({
    ...row,
    metrics_present: leaderboardMetrics.reduce(
      (count, metric) => count + (typeof row.values[metric.column_key] === "number" ? 1 : 0),
      0
    ),
  }))

  return {
    leaderboard_metrics: leaderboardMetrics,
    leaderboard_rows: leaderboardRows,
  }
}

function toModelResultsForMetric(
  detail: HFEvalDetail,
  metric: HFEvalDetail["metrics"][number]
): ModelResultForBenchmark[] {
  const benchmarkKey = detail.benchmark ?? ""
  const sourceName = detail.source_data?.dataset_name || benchmarkKey
  const sourceOrganization = detail.source_data?.hf_repo || sourceName
  const metricConfig = toSummaryMetricConfig(metric)

  return (metric.model_results ?? []).map((mr) => {
    const evaluationTimestamp = mr.retrieved_timestamp ?? ""
    const modelInfo: ModelInfo = {
      name: mr.model_name ?? "",
      id: mr.model_id ?? "",
      developer: mr.developer ?? "",
    }

    const evaluationResult: EvaluationResult = {
      evaluation_name: metric.metric_name || metric.evaluation_name || metric.display_name || "",
      display_name: metric.display_name || metric.metric_name || metric.evaluation_name,
      canonical_display_name: metric.canonical_display_name,
      metric_summary_id: metric.metric_summary_id,
      metric_key: metric.metric_key,
      evaluation_timestamp: evaluationTimestamp,
      metric_config: metricConfig,
      score_details: { score: mr.score ?? 0 },
      detailed_evaluation_results_url: getCanonicalInstanceResultsUrl(
        mr.detailed_evaluation_results
      ),
    }

    return {
      model_info: modelInfo,
      model_route_id: mr.model_route_id,
      score: mr.score ?? 0,
      score_details: { score: mr.score ?? 0 },
      evaluation_timestamp: evaluationTimestamp,
      source_metadata: {
        source_type: "documentation" as const,
        source_name: sourceName,
        source_organization_name: sourceOrganization,
        evaluator_relationship: "other" as const,
      },
      source_data: detail.source_data ?? { dataset_name: benchmarkKey },
      result: evaluationResult,
    }
  })
}

function hfEvalDetailToSummary(detail: HFEvalDetail): BenchmarkEvalSummary {
  const evalName = detail.benchmark_leaf_name || detail.eval_summary_id || "Unknown"
  const benchmarkKey = detail.benchmark ?? ""
  const allMetrics = detail.metrics ?? []
  const rootMetrics = allMetrics.map(toBenchmarkSummaryMetric)
  const subtasks = extractBenchmarkSubtasks(detail)
  const leaderboardMatrix = buildBenchmarkLeaderboardMatrix(detail)
  const primaryMetric =
    allMetrics[0] ??
    (Array.isArray(detail.subtasks) ? detail.subtasks : [])
      .flatMap((subtask) => {
        if (!subtask || typeof subtask !== "object") {
          return []
        }

        const metrics = Array.isArray((subtask as Record<string, unknown>).metrics)
          ? ((subtask as Record<string, unknown>).metrics as HFEvalDetail["metrics"])
          : []
        return metrics
      })[0]

  if (!primaryMetric) {
    return {
      evaluation_name: evalName,
      evaluation_id: detail.eval_summary_id,
      canonical_display_name: detail.canonical_display_name,
      composite_benchmark_key: benchmarkKey,
      composite_benchmark_name: getBenchmarkDisplayName(benchmarkKey),
      category: inferCategoryFromBenchmark(evalName),
      metric_config: { evaluation_description: "", lower_is_better: false, score_type: "continuous" },
      model_results: [],
      models_count: 0,
      evaluator_names: [],
      source_types: [],
      latest_source_name: getBenchmarkDisplayName(benchmarkKey),
      third_party_ratio: 0,
      missing_generation_config_count: 0,
      best_model: null,
      worst_model: null,
      avg_score: 0,
      avg_score_norm: 0,
      benchmark_card: detail.benchmark_card ?? undefined,
      metrics_count: leaderboardMatrix.leaderboard_metrics.length,
      metric_names: leaderboardMatrix.leaderboard_metrics.map((metric) =>
        metric.scope === "subtask" && metric.subtask_name
          ? `${metric.subtask_name} / ${metric.metric_name}`
          : metric.metric_name
      ),
      root_metrics: rootMetrics,
      subtasks,
      leaderboard_metrics: leaderboardMatrix.leaderboard_metrics,
      leaderboard_rows: leaderboardMatrix.leaderboard_rows,
    }
  }

  const modelResults = toModelResultsForMetric(detail, primaryMetric)

  // Sort by score
  const metricConfig = toSummaryMetricConfig(primaryMetric)
  const lowerIsBetter = metricConfig.lower_is_better
  modelResults.sort((a, b) => (lowerIsBetter ? a.score - b.score : b.score - a.score))

  const scores = modelResults.map((r) => r.score).filter(Number.isFinite)
  const avgScore = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0

  return {
    evaluation_name: evalName,
    evaluation_id: detail.eval_summary_id,
    canonical_display_name: detail.canonical_display_name,
    composite_benchmark_key: benchmarkKey,
    composite_benchmark_name: getBenchmarkDisplayName(benchmarkKey),
    category: inferCategoryFromBenchmark(evalName),
    metric_config: metricConfig,
    model_results: modelResults,
    models_count: modelResults.length,
    evaluator_names: [],
    source_types: [],
    latest_source_name: getBenchmarkDisplayName(benchmarkKey),
    third_party_ratio: 0,
    missing_generation_config_count: 0,
    best_model: modelResults.length > 0
      ? { name: modelResults[0].model_info.name, score: modelResults[0].score }
      : null,
    worst_model: modelResults.length > 0
      ? { name: modelResults[modelResults.length - 1].model_info.name, score: modelResults[modelResults.length - 1].score }
      : null,
    avg_score: avgScore,
    avg_score_norm: avgScore, // scores are already 0-1 from the pipeline
    benchmark_card: detail.benchmark_card ?? undefined,
    metric_names:
      leaderboardMatrix.leaderboard_metrics
        .map((metric) =>
          metric.scope === "subtask" && metric.subtask_name
            ? `${metric.subtask_name} / ${metric.metric_name}`
            : metric.metric_name
        )
        .filter((metricName): metricName is string => Boolean(metricName)),
    metrics_count: leaderboardMatrix.leaderboard_metrics.length,
    root_metrics: rootMetrics,
    subtasks,
    leaderboard_metrics: leaderboardMatrix.leaderboard_metrics,
    leaderboard_rows: leaderboardMatrix.leaderboard_rows,
  }
}

// ---------------------------------------------------------------------------
// Aggregation (for aggregate eval summaries)
// ---------------------------------------------------------------------------

async function attachBenchmarkCardToSummary(summary: BenchmarkEvalSummary): Promise<BenchmarkEvalSummary> {
  if (summary.benchmark_card) return summary

  const candidates = [
    summary.evaluation_name,
    summary.composite_benchmark_name,
    summary.composite_benchmark_key,
  ]

  for (const candidate of candidates) {
    const card = await getBenchmarkCard(candidate)
    if (card) return { ...summary, benchmark_card: card }
  }

  return summary
}

function aggregateBenchmarkSummaries(
  summaries: BenchmarkEvalSummary[],
  aggregationKey: string
): BenchmarkEvalSummary | null {
  if (summaries.length === 0) return null

  const first = summaries[0]
  const card = first.benchmark_card

  // Use each sub-eval's own name (not the suite name) so sub-cards show distinct titles
  const aggregateSources = Array.from(
    new Map(
      summaries.map((summary) => [
        summary.evaluation_id,
        {
          evaluation_id: summary.evaluation_id,
          composite_benchmark_key: summary.composite_benchmark_key,
          composite_benchmark_name: summary.evaluation_name,
          models_count: summary.models_count,
          avg_score_norm: summary.avg_score_norm,
        },
      ])
    ).values()
  ).sort((a, b) => a.composite_benchmark_name.localeCompare(b.composite_benchmark_name))

  // The display name for the aggregate should be the suite name, not a sub-eval name
  const suiteDisplayName = getBenchmarkDisplayName(aggregationKey)

  const modelBuckets = new Map<
    string,
    {
      model_info: ModelResultForBenchmark["model_info"]
      components: Array<{ summary: BenchmarkEvalSummary; modelResult: ModelResultForBenchmark }>
    }
  >()

  for (const summary of summaries) {
    for (const modelResult of summary.model_results) {
      const existing = modelBuckets.get(modelResult.model_info.id) ?? {
        model_info: modelResult.model_info,
        components: [],
      }
      existing.components.push({ summary, modelResult })
      modelBuckets.set(modelResult.model_info.id, existing)
    }
  }

  const aggregateMetricConfig = {
    ...first.metric_config,
    evaluation_description:
      aggregateSources.length > 1
        ? `Average normalized score across ${aggregateSources.map((s) => s.composite_benchmark_name).join(", ")}`
        : first.metric_config.evaluation_description,
    min_score: 0,
    max_score: 1,
    unit: "normalized average",
  } as const

  const aggregatedModelResults: ModelResultForBenchmark[] = Array.from(modelBuckets.values()).map(
    ({ model_info, components }) => {
      const normalizedScores = components.map(({ summary, modelResult }) =>
        normalizeSummaryScore(summary, modelResult.score)
      )
      const avgNormalizedScore =
        normalizedScores.reduce((sum, s) => sum + s, 0) / normalizedScores.length

      const latestComponent = [...components].sort(
        (a, b) =>
          normalizeEvalTimestamp(b.modelResult.evaluation_timestamp) -
          normalizeEvalTimestamp(a.modelResult.evaluation_timestamp)
      )[0]

      const aggregateComponents = components
        .map(({ summary, modelResult }) => ({
          evaluation_id: summary.evaluation_id,
          composite_benchmark_key: summary.composite_benchmark_key,
          composite_benchmark_name: summary.composite_benchmark_name,
          score: modelResult.score,
          normalized_score: normalizeSummaryScore(summary, modelResult.score),
          evaluation_timestamp: modelResult.evaluation_timestamp,
          source_name: modelResult.source_metadata.source_name,
          source_type: modelResult.source_metadata.source_type,
          source_organization_name: modelResult.source_metadata.source_organization_name,
          evaluator_relationship: modelResult.source_metadata.evaluator_relationship,
        }))
        .sort((a, b) => a.composite_benchmark_name.localeCompare(b.composite_benchmark_name))

      return {
        model_info,
        score: avgNormalizedScore,
        score_details: {
          score: avgNormalizedScore,
          sample_size:
            components.reduce((sum, { modelResult }) => sum + (modelResult.score_details.sample_size ?? 0), 0) ||
            undefined,
        },
        evaluation_timestamp: latestComponent.modelResult.evaluation_timestamp,
        source_metadata: latestComponent.modelResult.source_metadata,
        source_data: latestComponent.modelResult.source_data,
        result: {
          ...latestComponent.modelResult.result,
          evaluation_name: card?.benchmark_details?.name ?? first.evaluation_name,
          metric_config: aggregateMetricConfig,
          score_details: { score: avgNormalizedScore },
        },
        aggregate_components: aggregateComponents,
      }
    }
  )

  const lowerIsBetter = first.metric_config.lower_is_better
  aggregatedModelResults.sort((a, b) => (lowerIsBetter ? a.score - b.score : b.score - a.score))

  const avgScore =
    aggregatedModelResults.reduce((sum, r) => sum + r.score, 0) / aggregatedModelResults.length

  const evaluatorNames = Array.from(
    new Set(summaries.flatMap((s) => s.evaluator_names))
  ).sort()

  const sourceTypes = Array.from(
    new Set(summaries.flatMap((s) => s.source_types))
  ).sort()

  const totalUnderlying = summaries.reduce((sum, s) => sum + s.model_results.length, 0)
  const totalThirdParty = summaries.reduce(
    (sum, s) =>
      sum + s.model_results.filter((r) => r.source_metadata.evaluator_relationship === "third_party").length,
    0
  )

  return {
    // Use the suite display name for the aggregate, never a sub-metric name
    evaluation_name: suiteDisplayName,
    evaluation_id: getAggregateEvalId(aggregationKey),
    composite_benchmark_key:
      aggregateSources.length === 1 ? aggregateSources[0].composite_benchmark_key : aggregationKey,
    composite_benchmark_name: suiteDisplayName,
    category: first.category,
    metric_config: aggregateMetricConfig,
    model_results: aggregatedModelResults,
    models_count: aggregatedModelResults.length,
    evaluator_names: evaluatorNames,
    source_types: sourceTypes,
    latest_source_name:
      aggregateSources.length === 1 ? aggregateSources[0].composite_benchmark_name : "Multiple sources",
    third_party_ratio: totalUnderlying > 0 ? totalThirdParty / totalUnderlying : 0,
    missing_generation_config_count: summaries.reduce(
      (sum, s) => sum + s.missing_generation_config_count, 0
    ),
    best_model:
      aggregatedModelResults.length > 0
        ? { name: aggregatedModelResults[0].model_info.name, score: aggregatedModelResults[0].score }
        : null,
    worst_model:
      aggregatedModelResults.length > 0
        ? {
            name: aggregatedModelResults[aggregatedModelResults.length - 1].model_info.name,
            score: aggregatedModelResults[aggregatedModelResults.length - 1].score,
          }
        : null,
    avg_score: avgScore,
    avg_score_norm: avgScore,
    benchmark_card: card,
    is_aggregated: true,
    aggregate_sources: aggregateSources,
  }
}

const SYNTHETIC_MATRIX_EVAL_PREFIX = "matrix__"

function buildSingleMetricSuiteMatrixSummary(
  details: HFEvalDetail[],
  suiteKey: string
): BenchmarkEvalSummary | null {
  if (details.length < 2) {
    return null
  }

  const suiteDisplayName = getBenchmarkDisplayName(suiteKey)
  const validDetails = [...details]
    .filter((detail) => (detail.metrics?.length ?? 0) === 1 && extractDetailSubtasks(detail).length === 0)
    .sort((left, right) =>
      (left.benchmark_leaf_name || left.eval_summary_id).localeCompare(right.benchmark_leaf_name || right.eval_summary_id)
    )

  if (validDetails.length < 2) {
    return null
  }

  const leaderboardMetrics: NonNullable<BenchmarkEvalSummary["leaderboard_metrics"]> = []
  const rowStates = new Map<
    string,
    NonNullable<BenchmarkEvalSummary["leaderboard_rows"]>[number] & { _timestampValue: number }
  >()

  let metricConfig: BenchmarkEvalSummary["metric_config"] | null = null
  let benchmarkCard: BenchmarkCard | undefined
  const metricNames = new Set<string>()

  for (const detail of validDetails) {
    const metric = detail.metrics?.[0]
    if (!metric) {
      continue
    }

    if (!metricConfig) {
      metricConfig = toSummaryMetricConfig(metric)
    }

    if (!benchmarkCard && detail.benchmark_card) {
      benchmarkCard = detail.benchmark_card
    }

    const summaryMetric = toBenchmarkSummaryMetric(metric)
    metricNames.add(summaryMetric.metric_name)
    const subtaskKey = detail.benchmark_leaf_key || slugifyEvalId(detail.eval_summary_id)
    const subtaskName = detail.benchmark_leaf_name || detail.canonical_display_name || detail.eval_summary_id || subtaskKey
    const metricToken =
      summaryMetric.metric_summary_id ||
      summaryMetric.metric_key ||
      slugifyEvalId(summaryMetric.display_name)
    const columnKey = ["subtask", subtaskKey, metricToken].join(":")

    leaderboardMetrics.push({
      column_key: columnKey,
      metric_summary_id: summaryMetric.metric_summary_id,
      metric_name: summaryMetric.metric_name,
      display_name: summaryMetric.display_name,
      canonical_display_name: summaryMetric.canonical_display_name,
      lower_is_better: summaryMetric.lower_is_better,
      unit: summaryMetric.unit,
      scope: "subtask",
      subtask_key: subtaskKey,
      subtask_name: subtaskName,
    })

    const benchmarkKey = detail.benchmark ?? suiteKey
    const sourceName = detail.source_data?.dataset_name || benchmarkKey
    const sourceOrganization = detail.source_data?.hf_repo || sourceName
    const sourceMetadata: SourceMetadata = {
      source_type: "documentation",
      source_name: sourceName,
      source_organization_name: sourceOrganization,
      evaluator_relationship: "other",
    }
    const sourceData = detail.source_data ?? { dataset_name: benchmarkKey }

    for (const modelResult of metric.model_results ?? []) {
      const modelId = modelResult.model_id || modelResult.model_name
      if (!modelId) {
        continue
      }

      const nextTimestamp = normalizeEvalTimestamp(modelResult.retrieved_timestamp ?? "")
      const existing = rowStates.get(modelId)

      if (!existing) {
        rowStates.set(modelId, {
          model_info: {
            name: modelResult.model_name ?? "",
            id: modelId,
            developer: modelResult.developer ?? "",
          },
          model_route_id: modelResult.model_route_id,
          evaluation_timestamp: modelResult.retrieved_timestamp ?? "",
          source_metadata: sourceMetadata,
          source_data: sourceData,
          values: { [columnKey]: modelResult.score ?? null },
          metrics_present: 0,
          _timestampValue: nextTimestamp,
        })
        continue
      }

      existing.values[columnKey] = modelResult.score ?? null
      if (!existing.model_route_id && modelResult.model_route_id) {
        existing.model_route_id = modelResult.model_route_id
      }
      if (nextTimestamp >= existing._timestampValue) {
        existing.evaluation_timestamp = modelResult.retrieved_timestamp ?? existing.evaluation_timestamp
        existing.source_metadata = sourceMetadata
        existing.source_data = sourceData
        existing._timestampValue = nextTimestamp
      }
    }
  }

  if (leaderboardMetrics.length < 2) {
    return null
  }

  const sharedMetricName = metricNames.size === 1 ? Array.from(metricNames)[0] : undefined
  const suiteMetricConfig = metricConfig
    ? {
        ...metricConfig,
        evaluation_description: sharedMetricName ?? metricConfig.evaluation_description,
      }
    : {
        evaluation_description: sharedMetricName ?? "",
        lower_is_better: false,
        score_type: "continuous" as const,
        min_score: 0,
        max_score: 1,
      }

  const leaderboardRows = Array.from(rowStates.values()).map(({ _timestampValue, ...row }) => ({
    ...row,
    metrics_present: leaderboardMetrics.reduce(
      (count, metric) => count + (typeof row.values[metric.column_key] === "number" ? 1 : 0),
      0
    ),
  }))

  return {
    evaluation_name: suiteDisplayName,
    evaluation_id: `${SYNTHETIC_MATRIX_EVAL_PREFIX}${suiteKey}`,
    canonical_display_name: suiteDisplayName,
    composite_benchmark_key: suiteKey,
    composite_benchmark_name: suiteDisplayName,
    category: inferCategoryFromBenchmark(suiteDisplayName),
    metric_config: suiteMetricConfig,
    model_results: [],
    models_count: leaderboardRows.length,
    evaluator_names: [],
    source_types: [],
    latest_source_name: suiteDisplayName,
    third_party_ratio: 0,
    missing_generation_config_count: 0,
    best_model: null,
    worst_model: null,
    avg_score: 0,
    avg_score_norm: 0,
    benchmark_card: benchmarkCard,
    metrics_count: leaderboardMetrics.length,
    metric_names: leaderboardMetrics.map((metric) => `${metric.subtask_name} / ${metric.metric_name}`),
    source_data: { dataset_name: suiteDisplayName },
    leaderboard_metrics: leaderboardMetrics,
    leaderboard_rows: leaderboardRows,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getDashboardData() {
  const [models, evals] = await Promise.all([getModelCards(), getEvalList()])
  return { models, evals }
}

export async function getBackendManifestData(): Promise<BackendManifest> {
  return fetchBackendManifest()
}

export async function getEvalHierarchyData(): Promise<EvalHierarchy> {
  return fetchEvalHierarchy()
}

export async function getModelCards(): Promise<EvaluationCardData[]> {
  const entries = await fetchModelCardsList()
  return entries.map(hfModelCardToEvaluationCardData).sort(
    (a, b) => new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime()
  )
}

export async function getModelCardsLite(): Promise<EvaluationCardData[]> {
  const entries = await fetchModelCardsListLite()
  return entries.map(hfModelCardToEvaluationCardData).sort(
    (a, b) =>
      b.benchmarks_count - a.benchmarks_count ||
      b.evaluations_count - a.evaluations_count ||
      a.model_name.localeCompare(b.model_name)
  )
}

export async function getEvalListData(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
}> {
  const [evalData, modelCards] = await Promise.all([
    fetchHFEvalList(),
    fetchModelCardsList(),
  ])

  const evals = evalData.evals
    .filter((entry) => !(typeof entry.source_data?.hf_repo === "string" && entry.source_data.hf_repo.startsWith("example://")))
    .map(hfEvalEntryToListItem)

  // Attach benchmark cards where available
  const evalsWithCards = await Promise.all(
    evals.map(async (item) => {
      let updated = item

      // Attach benchmark card if not already provided by the pipeline
      if (!updated.benchmark_card) {
        const candidates = [item.evaluation_name, item.composite_benchmark_key, item.composite_benchmark_name].filter(Boolean)
        for (const name of candidates) {
          const card = await getBenchmarkCard(name)
          if (card) {
            updated = { ...updated, benchmark_card: card }
            break
          }
        }
      }

      return updated
    })
  )

  return {
    evals: evalsWithCards.sort((a, b) => (a.evaluation_name ?? "").localeCompare(b.evaluation_name ?? "")),
    totalModels: modelCards.length,
  }
}

export async function getEvalListLiteData(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
}> {
  const [evalData, modelCards] = await Promise.all([
    fetchHFEvalListLite(),
    fetchModelCardsListLite(),
  ])

  const evals = evalData.evals
    .filter((entry) => !(typeof entry.source_data?.hf_repo === "string" && entry.source_data.hf_repo.startsWith("example://")))
    .map(hfEvalEntryToListItem)

  return {
    evals: evals.sort((a, b) => (a.evaluation_name ?? "").localeCompare(b.evaluation_name ?? "")),
    totalModels: modelCards.length,
  }
}

export async function getEvalList() {
  const { evals } = await getEvalListData()
  return evals
}

export async function getDeveloperList() {
  const developerIndex = await fetchDevelopersList()

  // Deduplicate by route_id (handles case variations like "google" vs "Google")
  const deduped = new Map<string, { developer: string; model_count: number }>()
  for (const entry of developerIndex) {
    const routeId = getDeveloperRouteId(entry.developer)
    const existing = deduped.get(routeId)
    if (!existing || entry.model_count > existing.model_count) {
      // Keep the variant with the most models (likely the canonical name)
      deduped.set(routeId, {
        developer: existing && existing.model_count > entry.model_count
          ? existing.developer
          : entry.developer,
        model_count: (existing?.model_count ?? 0) + entry.model_count,
      })
    } else {
      // Accumulate model count
      deduped.set(routeId, {
        developer: existing.developer,
        model_count: existing.model_count + entry.model_count,
      })
    }
  }

  // Enrich with detail files for aggregate stats
  const details = await Promise.all(
    Array.from(deduped.values()).map(async (entry) => {
      let detail = null
      for (const slug of getDeveloperSlugCandidates(entry.developer)) {
        detail = await fetchHFDeveloperDetail(slug)
        if (detail?.developer && Array.isArray(detail.models)) {
          break
        }
      }

      const models = detail?.models ?? []
      const benchmarkCounts = getDeveloperBenchmarkStats(models)
      let evaluationCount = 0

      for (const model of models) {
        evaluationCount += model.total_evaluations
      }

      const popularEvals = Array.from(benchmarkCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([benchmark, model_count]) => ({
          benchmark: getBenchmarkDisplayName(benchmark),
          model_count,
        }))

      return {
        developer: normalizeDeveloperName(detail?.developer ?? entry.developer),
        route_id: getDeveloperRouteId(entry.developer),
        // Use accumulated count from developers.json (handles case variants)
        // rather than detail file which may be incomplete due to slug collisions
        model_count: entry.model_count,
        benchmark_count: benchmarkCounts.size,
        evaluation_count: evaluationCount,
        popular_evals: popularEvals,
      }
    })
  )

  return details.sort((a, b) => a.developer.localeCompare(b.developer))
}

export async function getDeveloperSummaryById(routeId: string) {
  // Try direct slug lookup
  for (const slug of getDeveloperSlugCandidates(routeId)) {
    const detail = await fetchHFDeveloperDetail(slug)
    if (detail?.developer && Array.isArray(detail.models)) {
      const modelCards = detail.models.map(hfModelCardToEvaluationCardData)

      // Calculate aggregate stats
      let evaluationCount = 0
      const benchmarkCounts = getDeveloperBenchmarkStats(detail.models)
      for (const m of detail.models) {
        evaluationCount += m.total_evaluations
      }

      const popularEvals = Array.from(benchmarkCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([benchmark, model_count]) => ({
          benchmark: getBenchmarkDisplayName(benchmark),
          model_count,
        }))

      return {
        developer: normalizeDeveloperName(detail.developer),
        route_id: getDeveloperRouteId(detail.developer),
        model_count: detail.models.length,
        benchmark_count: benchmarkCounts.size,
        evaluation_count: evaluationCount,
        popular_evals: popularEvals,
        models: modelCards,
      }
    }
  }

  // Try looking up through the developer index
  const developerIndex = await fetchDevelopersList()
  const matchedDev = developerIndex.find(
    (e) => e.developer === routeId || getDeveloperRouteId(e.developer) === routeId
  )

  if (matchedDev) {
    for (const slug of getDeveloperSlugCandidates(matchedDev.developer)) {
      const detail = await fetchHFDeveloperDetail(slug)
      if (detail?.developer && Array.isArray(detail.models)) {
        const modelCards = detail.models.map(hfModelCardToEvaluationCardData)

        let evaluationCount = 0
        const benchmarkCounts = new Map<string, number>()
        for (const m of detail.models) {
          evaluationCount += m.total_evaluations
          for (const cat of m.categories_covered) {
            benchmarkCounts.set(cat, (benchmarkCounts.get(cat) ?? 0) + 1)
          }
        }

        const popularEvals = Array.from(benchmarkCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([benchmark, model_count]) => ({
            benchmark: getBenchmarkDisplayName(benchmark),
            model_count,
          }))

        return {
          developer: detail.developer,
          route_id: getDeveloperRouteId(detail.developer),
          model_count: detail.models.length,
          benchmark_count: benchmarkCounts.size,
          evaluation_count: evaluationCount,
          popular_evals: popularEvals,
          models: modelCards,
        }
      }
    }
  }

  return null
}

export async function getModelSummaryById(modelId: string) {
  // Try fetching from HF model detail files
  for (const slug of getModelDetailSlugCandidates(modelId)) {
    const detail = await fetchHFModelDetail(slug)
    if (detail) {
      const evaluations = flattenModelEvaluations(detail)
      if (evaluations.length > 0) {
        return createModelFamilySummary(evaluations)
      }
    }
  }

  // Try model-cards.json to find the right slug
  const modelCards = await fetchModelCardsList()
  const matchedCard = modelCards.find(
    (card) =>
      card.model_family_id === modelId ||
      card.model_route_id === modelId ||
      getModelFamilyRouteId(card.model_family_id) === modelId
  )

  if (matchedCard) {
    // Try fetching by the model_route_id (which uses __ separator)
    const detail = await fetchHFModelDetail(matchedCard.model_route_id)
    if (detail) {
      const evaluations = flattenModelEvaluations(detail)
      if (evaluations.length > 0) {
        return createModelFamilySummary(evaluations)
      }
    }

    // Try all raw model IDs from all variants
    for (const variant of matchedCard.variants) {
      for (const rawId of variant.raw_model_ids) {
        for (const slug of getModelDetailSlugCandidates(rawId)) {
          const variantDetail = await fetchHFModelDetail(slug)
          if (variantDetail) {
            const evaluations = flattenModelEvaluations(variantDetail)
            if (evaluations.length > 0) {
              return createModelFamilySummary(evaluations)
            }
          }
        }
      }
    }
  }

  return null
}

export async function getEvalSummaryById(evalId: string) {
  // Handle aggregate eval IDs (grouped by composite_benchmark_key)
  if (evalId.startsWith("aggregate__")) {
    const aggregateKey = evalId.replace(/^aggregate__/, "")

    // Find all evals in this benchmark suite by matching composite_benchmark_key
    const { evals } = await fetchHFEvalList()
    const matchingEvals = evals.filter((e) => {
      const normalizedBenchmark = e.benchmark.toLowerCase().replace(/[-.\s]+/g, "_").replace(/^_+|_+$/g, "")
      return normalizedBenchmark === aggregateKey || e.benchmark === aggregateKey
    })

    if (matchingEvals.length === 0) return null

    // Fetch full eval details for each sub-eval
    const detailSummaries = await Promise.all(
      matchingEvals.map(async (e) => {
        const detail = await fetchHFEvalDetail(e.eval_summary_id)
        if (!detail) return null
        return await attachBenchmarkCardToSummary(hfEvalDetailToSummary(detail))
      })
    )

    const validSummaries = detailSummaries.filter((s): s is BenchmarkEvalSummary => s !== null)
    return aggregateBenchmarkSummaries(validSummaries, aggregateKey)
  }

  if (evalId.startsWith(SYNTHETIC_MATRIX_EVAL_PREFIX)) {
    const suiteKey = evalId.replace(new RegExp(`^${SYNTHETIC_MATRIX_EVAL_PREFIX}`), "")
    const normalizedSuiteKey = normalizeBenchmarkKeyForLookup(suiteKey)
    const { evals } = await fetchHFEvalListLite()
    const matchingEvals = evals.filter((entry) => {
      if (entry.is_summary_score) {
        return false
      }

      const parentKey = normalizeBenchmarkKeyForLookup(
        entry.benchmark_parent_key || entry.benchmark_family_key || entry.benchmark
      )
      return parentKey === normalizedSuiteKey
    })

    if (matchingEvals.length < 2) {
      return null
    }

    const details = await Promise.all(
      matchingEvals.map(async (entry) => fetchHFEvalDetail(entry.eval_summary_id))
    )

    const validDetails = details.filter((detail): detail is HFEvalDetail => detail !== null)
    const syntheticSummary = buildSingleMetricSuiteMatrixSummary(validDetails, suiteKey)
    return syntheticSummary ? attachBenchmarkCardToSummary(syntheticSummary) : null
  }

  // Direct eval lookup
  const detail = await fetchHFEvalDetail(evalId)
  if (detail) {
    const summary = hfEvalDetailToSummary(detail)
    return attachBenchmarkCardToSummary(summary)
  }

  return null
}

// Keep this export for compatibility — but it now fetches from HF model-cards
// and returns evaluation card data (not raw BenchmarkEvaluation[])
export async function loadAllEvaluationsFromDataDirectory(): Promise<BenchmarkEvaluation[]> {
  // This function is kept for backward compatibility but should be avoided.
  // It returns an empty array since we no longer load all raw evaluations at once.
  console.warn("[model-data] loadAllEvaluationsFromDataDirectory() is deprecated with HF backend")
  return []
}
