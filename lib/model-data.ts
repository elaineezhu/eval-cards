import "server-only"

import { promises as fs } from "fs"
import path from "path"

import type {
  BenchmarkCard,
  BenchmarkEvaluation,
  EvalLibrary,
  EvaluationResult,
  GenerationConfig,
  MetricConfig,
  ModelInfo,
  SampleResult,
  SourceData,
  SourceMetadata,
} from "@/lib/benchmark-schema"
import { inferCategoryFromBenchmark } from "@/lib/benchmark-schema"
import { lookupBenchmarkCard } from "@/lib/benchmark-metadata-utils"
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
import { getCanonicalModelIdentity, getModelFamilyRouteId, normalizeModelInfo } from "@/lib/model-family"
import { getBenchmarkCard, normalizeBenchmarkKey } from "@/lib/benchmark-metadata"

interface RawModelFile {
  model_info: ModelInfo
  evaluations: RawEvaluation[]
}

interface RawEvaluation {
  evaluation_id: string
  retrieved_timestamp: string
  benchmark?: string
  source_metadata: SourceMetadata
  eval_library?: EvalLibrary
  evaluation_results: RawEvaluationResult[]
  detailed_evaluation_results?: SampleResult[] | null
  generation_config?: GenerationConfig | null
  source_data?: string[] | SourceData
}

interface RawEvaluationResult
  extends Omit<EvaluationResult, "evaluation_timestamp"> {
  evaluation_timestamp?: string
}

function getSourceDataSignature(sourceData?: string[] | SourceData) {
  if (!sourceData) {
    return ""
  }

  if (Array.isArray(sourceData)) {
    return sourceData.join("|")
  }

  return [
    sourceData.dataset_name,
    sourceData.source_type,
    sourceData.hf_repo,
    sourceData.external_link,
  ]
    .filter(Boolean)
    .join("|")
}

function getRawEvaluationResultKey(result: RawEvaluationResult) {
  return [result.evaluation_name.trim().toLowerCase(), getSourceDataSignature(result.source_data)].join("::")
}

function mergeRawEvaluationResults(results: RawEvaluationResult[]) {
  const merged = new Map<string, RawEvaluationResult>()

  for (const result of results) {
    merged.set(getRawEvaluationResultKey(result), result)
  }

  return Array.from(merged.values())
}

function getRawEvaluationKey(evaluation: RawEvaluation) {
  return [
    evaluation.evaluation_id,
    evaluation.retrieved_timestamp,
    evaluation.benchmark,
    evaluation.source_metadata.source_name,
    evaluation.source_metadata.source_type,
    evaluation.source_metadata.source_organization_name,
    evaluation.source_metadata.evaluator_relationship,
  ]
    .filter(Boolean)
    .join("::")
}

function dedupeRawEvaluations(evaluations: RawEvaluation[]) {
  const merged = new Map<string, RawEvaluation>()

  for (const evaluation of evaluations) {
    const key = getRawEvaluationKey(evaluation)
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, {
        ...evaluation,
        evaluation_results: mergeRawEvaluationResults(evaluation.evaluation_results),
      })
      continue
    }

    merged.set(key, {
      ...existing,
      ...evaluation,
      source_data: evaluation.source_data ?? existing.source_data,
      eval_library: evaluation.eval_library ?? existing.eval_library,
      detailed_evaluation_results:
        evaluation.detailed_evaluation_results ?? existing.detailed_evaluation_results,
      generation_config: evaluation.generation_config ?? existing.generation_config,
      evaluation_results: mergeRawEvaluationResults([
        ...existing.evaluation_results,
        ...evaluation.evaluation_results,
      ]),
    })
  }

  return Array.from(merged.values())
}

interface IndexedModelSummary {
  id: string
  name: string
  developer?: string
  evaluator_relationship?: string | null
  benchmark_scores?: Record<string, number>
}

interface IndexedBenchmarkEntry {
  benchmark: string
  model_count: number
}

interface IndexedBenchmarkDetail {
  benchmark_cards?: Record<string, BenchmarkCard>
  models: Array<{
    model_id: string
    name: string
    developer?: string
    scores?: Record<string, number>
  }>
}

interface IndexedDeveloperEntry {
  developer: string
  model_count: number
}

interface IndexedDeveloperDetail {
  developer: string
  models: IndexedModelSummary[]
}

interface DeveloperAggregateSummary {
  model_count: number
  benchmark_count: number
  evaluation_count: number
  popular_evals: Array<{
    benchmark: string
    model_count: number
  }>
}

function getDataDirectory() {
  return path.join(process.cwd(), "data")
}

function getModelSubdirectory() {
  return path.join(getDataDirectory(), "models")
}

function getBenchmarkSubdirectory() {
  return path.join(getDataDirectory(), "benchmarks")
}

function getModelsIndexPath() {
  return path.join(getDataDirectory(), "models.json")
}

function getBenchmarksIndexPath() {
  return path.join(getDataDirectory(), "benchmarks.json")
}

function getDeveloperSubdirectory() {
  return path.join(getDataDirectory(), "developers")
}

function getDevelopersIndexPath() {
  return path.join(getDataDirectory(), "developers.json")
}

function shouldCacheModelData() {
  return process.env.NODE_ENV === "production"
}

function shouldCacheIndexes() {
  return process.env.NODE_ENV === "production"
}

async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(directory, entry.name))
  } catch {
    return []
  }
}

async function listModelDataFiles(): Promise<string[]> {
  const [rootFiles, modelFiles] = await Promise.all([
    listJsonFiles(getDataDirectory()),
    listJsonFiles(getModelSubdirectory()),
  ])

  // Prefer the pipeline layout:
  //   data/models/*.json
  // Fall back to the legacy flat layout:
  //   data/*.json
  // Root-level index files such as data/models.json are not raw model detail files.
  const preferredFiles = modelFiles.length > 0 ? modelFiles : rootFiles

  return preferredFiles.sort((a, b) => a.localeCompare(b))
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T
  } catch {
    return null
  }
}

let cachedModelIndexPromise: Promise<IndexedModelSummary[] | null> | null = null

async function readModelsIndex() {
  const load = async () => {
    const parsed = await readJsonFile<IndexedModelSummary[]>(getModelsIndexPath())
    return Array.isArray(parsed) ? parsed : null
  }

  if (!shouldCacheIndexes()) {
    return load()
  }

  if (!cachedModelIndexPromise) {
    cachedModelIndexPromise = load()
  }

  return cachedModelIndexPromise
}

let cachedBenchmarkIndexPromise: Promise<IndexedBenchmarkEntry[] | null> | null = null

async function readBenchmarksIndex() {
  const load = async () => {
    const parsed = await readJsonFile<IndexedBenchmarkEntry[]>(getBenchmarksIndexPath())
    return Array.isArray(parsed) ? parsed : null
  }

  if (!shouldCacheIndexes()) {
    return load()
  }

  if (!cachedBenchmarkIndexPromise) {
    cachedBenchmarkIndexPromise = load()
  }

  return cachedBenchmarkIndexPromise
}

let cachedDeveloperIndexPromise: Promise<IndexedDeveloperEntry[] | null> | null = null

async function readDevelopersIndex() {
  const load = async () => {
    const parsed = await readJsonFile<IndexedDeveloperEntry[]>(getDevelopersIndexPath())
    return Array.isArray(parsed) ? parsed : null
  }

  if (!shouldCacheIndexes()) {
    return load()
  }

  if (!cachedDeveloperIndexPromise) {
    cachedDeveloperIndexPromise = load()
  }

  return cachedDeveloperIndexPromise
}

function humanizeToken(token: string) {
  return token
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getBenchmarkDisplayName(benchmark: string) {
  if (benchmark === "hfopenllm_v2") return "HF Open LLM v2"
  return humanizeToken(benchmark)
}

function getBenchmarkMetricDisplayName(benchmark: string, metric: string) {
  const normalized = metric.trim()
  const genericMetrics = new Set([
    "score",
    "accuracy",
    "mean win rate",
    "exact match",
    "f1",
    "pass@1",
  ])

  if (genericMetrics.has(normalized.toLowerCase())) {
    return `${getBenchmarkDisplayName(benchmark)} - ${normalized}`
  }

  return normalized
}

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

async function attachBenchmarkCardToSummary(summary: BenchmarkEvalSummary): Promise<BenchmarkEvalSummary> {
  if (summary.benchmark_card) {
    return summary
  }

  const cardCandidates = [
    summary.evaluation_name,
    summary.composite_benchmark_name,
    summary.composite_benchmark_key,
  ]

  for (const candidate of cardCandidates) {
    const card = await getBenchmarkCard(candidate)
    if (card) {
      return { ...summary, benchmark_card: card }
    }
  }

  return summary
}

function aggregateBenchmarkSummaries(
  summaries: BenchmarkEvalSummary[],
  aggregationKey: string
): BenchmarkEvalSummary | null {
  if (summaries.length === 0) {
    return null
  }

  const first = summaries[0]
  const card = first.benchmark_card
  const aggregateSources = Array.from(
    new Map(
      summaries.map((summary) => [
        summary.evaluation_id,
        {
          evaluation_id: summary.evaluation_id,
          composite_benchmark_key: summary.composite_benchmark_key,
          composite_benchmark_name: summary.composite_benchmark_name,
          models_count: summary.models_count,
          avg_score_norm: summary.avg_score_norm,
        },
      ])
    ).values()
  ).sort((a, b) => a.composite_benchmark_name.localeCompare(b.composite_benchmark_name))

  const modelBuckets = new Map<
    string,
    {
      model_info: ModelResultForBenchmark["model_info"]
      components: Array<{
        summary: BenchmarkEvalSummary
        modelResult: ModelResultForBenchmark
      }>
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
        ? `Average normalized score across ${aggregateSources
            .map((source) => source.composite_benchmark_name)
            .join(", ")}`
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
        normalizedScores.reduce((sum, score) => sum + score, 0) / normalizedScores.length

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
          sample_size: components.reduce(
            (sum, { modelResult }) => sum + (modelResult.score_details.sample_size ?? 0),
            0
          ) || undefined,
        },
        evaluation_timestamp: latestComponent.modelResult.evaluation_timestamp,
        source_metadata: latestComponent.modelResult.source_metadata,
        source_data: latestComponent.modelResult.source_data,
        result: {
          ...latestComponent.modelResult.result,
          evaluation_name: card?.benchmark_details?.name ?? first.evaluation_name,
          metric_config: aggregateMetricConfig,
          score_details: {
            score: avgNormalizedScore,
          },
        },
        aggregate_components: aggregateComponents,
      }
    }
  )

  const lowerIsBetter = first.metric_config.lower_is_better
  aggregatedModelResults.sort((a, b) => (lowerIsBetter ? a.score - b.score : b.score - a.score))

  const avgScore =
    aggregatedModelResults.reduce((sum, modelResult) => sum + modelResult.score, 0) /
    aggregatedModelResults.length

  const evaluatorNames = Array.from(
    new Set(summaries.flatMap((summary) => summary.evaluator_names))
  ).sort((a, b) => a.localeCompare(b))

  const sourceTypes = Array.from(
    new Set(summaries.flatMap((summary) => summary.source_types))
  ).sort((a, b) => a.localeCompare(b))

  const totalUnderlyingResults = summaries.reduce((sum, summary) => sum + summary.model_results.length, 0)
  const totalThirdPartyResults = summaries.reduce(
    (sum, summary) => sum + summary.model_results.filter((result) => result.source_metadata.evaluator_relationship === "third_party").length,
    0
  )

  return {
    evaluation_name: card?.benchmark_details?.name ?? first.evaluation_name,
    evaluation_id: getAggregateEvalId(aggregationKey),
    composite_benchmark_key:
      aggregateSources.length === 1 ? aggregateSources[0].composite_benchmark_key : "multiple",
    composite_benchmark_name:
      aggregateSources.length === 1
        ? aggregateSources[0].composite_benchmark_name
        : `${aggregateSources.length} composite benchmarks`,
    category: first.category,
    metric_config: aggregateMetricConfig,
    factsheet: first.factsheet,
    model_results: aggregatedModelResults,
    models_count: aggregatedModelResults.length,
    evaluator_names: evaluatorNames,
    source_types: sourceTypes,
    latest_source_name:
      aggregateSources.length === 1 ? aggregateSources[0].composite_benchmark_name : "Multiple sources",
    third_party_ratio: totalUnderlyingResults > 0 ? totalThirdPartyResults / totalUnderlyingResults : 0,
    missing_generation_config_count: summaries.reduce(
      (sum, summary) => sum + summary.missing_generation_config_count,
      0
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

function inferMetricConfig(scores: number[], benchmark: string, metric: string): MetricConfig {
  const finiteScores = scores.filter((score) => Number.isFinite(score))
  const maxScore = finiteScores.length > 0 ? Math.max(...finiteScores) : 1
  const minScore = finiteScores.length > 0 ? Math.min(...finiteScores) : 0
  const appearsNormalized = minScore >= 0 && maxScore <= 1.05

  return {
    evaluation_description: `${metric} on ${getBenchmarkDisplayName(benchmark)}`,
    lower_is_better: false,
    score_type: "continuous",
    min_score: appearsNormalized ? 0 : Math.min(0, minScore),
    max_score: appearsNormalized ? 1 : Math.max(100, maxScore),
    unit: appearsNormalized ? "accuracy" : undefined,
  }
}

async function buildEvalListDataFromBenchmarkIndexes(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
} | null> {
  const [benchmarkIndex, modelIndex] = await Promise.all([
    readBenchmarksIndex(),
    readModelsIndex(),
  ])

  if (!benchmarkIndex?.length) {
    return null
  }

  const benchmarkDetails = await Promise.all(
    benchmarkIndex.map(async ({ benchmark }) => ({
      benchmark,
      detail: await readJsonFile<IndexedBenchmarkDetail>(
        path.join(getBenchmarkSubdirectory(), `${benchmark}.json`)
      ),
    }))
  )

  const evals: BenchmarkEvalListItem[] = []

  for (const { benchmark, detail } of benchmarkDetails) {
    if (!detail?.models?.length) {
      continue
    }

    const metricScores = new Map<string, number[]>()

    for (const model of detail.models) {
      for (const [metric, score] of Object.entries(model.scores ?? {})) {
        if (!Number.isFinite(score)) {
          continue
        }

        const bucket = metricScores.get(metric) ?? []
        bucket.push(score)
        metricScores.set(metric, bucket)
      }
    }

    for (const [metric, scores] of metricScores) {
      if (scores.length === 0) {
        continue
      }

      const displayName = getBenchmarkMetricDisplayName(benchmark, metric)
      const metricConfig = inferMetricConfig(scores, benchmark, metric)
      const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length
      const maxScore = metricConfig.max_score ?? 1
      const minScore = metricConfig.min_score ?? 0
      const range = maxScore - minScore

      evals.push({
        evaluation_name: displayName,
        evaluation_id: slugifyEvalId(`${benchmark}__${metric}`),
        composite_benchmark_key: benchmark,
        composite_benchmark_name: getBenchmarkDisplayName(benchmark),
        category: inferCategoryFromBenchmark(displayName),
        metric_config: metricConfig,
        factsheet: undefined,
        models_count: scores.length,
        evaluator_names: [],
        source_types: [],
        latest_source_name: getBenchmarkDisplayName(benchmark),
        third_party_ratio: 0,
        missing_generation_config_count: 0,
        best_model: null,
        worst_model: null,
        avg_score: avgScore,
        avg_score_norm: range > 0 ? (avgScore - minScore) / range : 0,
        benchmark_card: lookupBenchmarkCard(detail.benchmark_cards ?? {}, metric),
      })
    }
  }

  return {
    evals: evals.sort((a, b) => a.evaluation_name.localeCompare(b.evaluation_name)),
    totalModels: modelIndex?.length ?? 0,
  }
}

function createIndexedModelInfo(summary: IndexedModelSummary): ModelInfo {
  return {
    id: summary.id,
    name: summary.name || summary.id,
    developer: summary.developer,
  }
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

function getDeveloperSlugCandidates(developerOrRouteId: string) {
  const normalized = developerOrRouteId.trim()
  const lowercased = normalized.toLowerCase()
  const candidates = new Set([
    pipelineSlugify(normalized),
    pipelineSlugify(lowercased),
  ])

  return Array.from(candidates)
}

async function readDeveloperDetailFile(developerOrRouteId: string) {
  for (const slug of getDeveloperSlugCandidates(developerOrRouteId)) {
    const detail = await readJsonFile<IndexedDeveloperDetail>(
      path.join(getDeveloperSubdirectory(), `${slug}.json`)
    )

    if (detail?.developer && Array.isArray(detail.models)) {
      return detail
    }
  }

  return null
}

function getModelDetailSlugCandidates(modelId: string) {
  const normalized = modelId.trim()
  const lowercased = normalized.toLowerCase()
  const candidates = new Set([
    pipelineSlugify(normalized),
    pipelineSlugify(lowercased),
  ])

  return Array.from(candidates)
}

async function loadEvaluationsForModelId(modelId: string) {
  for (const slug of getModelDetailSlugCandidates(modelId)) {
    const raw = await readJsonFile<RawModelFile>(
      path.join(getModelSubdirectory(), `${slug}.json`)
    )

    if (!raw?.model_info || !Array.isArray(raw.evaluations)) {
      continue
    }

    return dedupeRawEvaluations(raw.evaluations).map((evaluation) =>
      normalizeEvaluation(raw.model_info, evaluation)
    )
  }

  return []
}

async function loadEvaluationsForModelIds(modelIds: string[]) {
  const loaded = await Promise.all(modelIds.map((modelId) => loadEvaluationsForModelId(modelId)))
  return loaded.flat()
}

function buildModelCardsFromEvaluations(evaluations: BenchmarkEvaluation[]) {
  const groupedByModel = groupEvaluationsByModelFamily(evaluations)

  return Object.values(groupedByModel)
    .map((modelEvaluations) =>
      createEvaluationCard(createModelFamilySummary(modelEvaluations))
    )
    .sort(
      (a, b) =>
        new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime()
    )
}

function buildDeveloperListFromModelsIndex(models: IndexedModelSummary[]) {
  const counts = new Map<string, number>()

  for (const model of models) {
    const developer = model.developer?.trim() || "unknown"
    counts.set(developer, (counts.get(developer) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([developer, model_count]) => ({
      developer,
      route_id: getDeveloperRouteId(developer),
      model_count,
    }))
    .sort((a, b) => a.developer.localeCompare(b.developer))
}

function summarizeDeveloperModels(models: IndexedModelSummary[]): DeveloperAggregateSummary {
  const benchmarkCounts = new Map<string, number>()
  let evaluationCount = 0

  for (const model of models) {
    const seenBenchmarks = new Set<string>()

    for (const key of Object.keys(model.benchmark_scores ?? {})) {
      evaluationCount += 1

      const [benchmark] = key.split("/", 1)
      if (!benchmark || seenBenchmarks.has(benchmark)) {
        continue
      }

      seenBenchmarks.add(benchmark)
      benchmarkCounts.set(benchmark, (benchmarkCounts.get(benchmark) ?? 0) + 1)
    }
  }

  const popularEvals = Array.from(benchmarkCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1]
      }

      return a[0].localeCompare(b[0])
    })
    .slice(0, 3)
    .map(([benchmark, model_count]) => ({
      benchmark: getBenchmarkDisplayName(benchmark),
      model_count,
    }))

  return {
    model_count: models.length,
    benchmark_count: benchmarkCounts.size,
    evaluation_count: evaluationCount,
    popular_evals: popularEvals,
  }
}

async function readDeveloperDetail(routeId: string) {
  const direct = await readDeveloperDetailFile(routeId)

  if (direct?.developer && Array.isArray(direct.models)) {
    return direct
  }

  const developersIndex = await readDevelopersIndex()
  const matchedDeveloper = developersIndex?.find(
    (entry) =>
      entry.developer === routeId || getDeveloperRouteId(entry.developer) === routeId
  )

  if (!matchedDeveloper) {
    return null
  }

  const resolved = await readDeveloperDetailFile(matchedDeveloper.developer)

  if (resolved?.developer && Array.isArray(resolved.models)) {
    return resolved
  }

  return null
}

function getFallbackSourceData(
  evaluation: RawEvaluation,
  result?: RawEvaluationResult
): string[] | SourceData {
  if (result?.source_data) {
    return result.source_data
  }

  if (evaluation.source_data) {
    return evaluation.source_data
  }

  if (evaluation.benchmark) {
    return {
      dataset_name: evaluation.benchmark,
    }
  }

  return {
    dataset_name: result?.evaluation_name ?? "Unknown Dataset",
  }
}

function normalizeEvaluation(
  modelInfo: ModelInfo,
  evaluation: RawEvaluation
): BenchmarkEvaluation {
  const normalizedModelInfo = normalizeModelInfo(modelInfo)

  return {
    schema_version: "model-data-v1",
    evaluation_id: evaluation.evaluation_id,
    retrieved_timestamp: evaluation.retrieved_timestamp,
    benchmark: evaluation.benchmark,
    source_data: getFallbackSourceData(evaluation, evaluation.evaluation_results[0]),
    source_metadata: evaluation.source_metadata,
    eval_library: evaluation.eval_library,
    model_info: normalizedModelInfo,
    evaluation_results: evaluation.evaluation_results.map((result) => ({
      ...result,
      evaluation_timestamp: result.evaluation_timestamp ?? evaluation.retrieved_timestamp,
      source_data: getFallbackSourceData(evaluation, result),
      generation_config: result.generation_config ?? evaluation.generation_config ?? undefined,
    })),
    detailed_evaluation_results_per_samples:
      evaluation.detailed_evaluation_results ?? undefined,
  }
}

async function readAllEvaluationsFromDataDirectory(): Promise<BenchmarkEvaluation[]> {
  const filePaths = await listModelDataFiles()
  const evaluations = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as RawModelFile

        if (!raw?.model_info || !Array.isArray(raw.evaluations)) {
          return []
        }

        return dedupeRawEvaluations(raw.evaluations).map((evaluation) =>
          normalizeEvaluation(raw.model_info, evaluation)
        )
      } catch (error) {
        console.warn(`Failed to load model data from ${filePath}:`, error)
        return []
      }
    })
  )

  return evaluations.flat()
}

let cachedEvaluationsPromise: Promise<BenchmarkEvaluation[]> | null = null

export async function loadAllEvaluationsFromDataDirectory(): Promise<BenchmarkEvaluation[]> {
  if (!shouldCacheModelData()) {
    return readAllEvaluationsFromDataDirectory()
  }

  if (!cachedEvaluationsPromise) {
    cachedEvaluationsPromise = readAllEvaluationsFromDataDirectory()
  }

  return cachedEvaluationsPromise
}

export async function getDashboardData() {
  const [models, evals] = await Promise.all([getModelCards(), getEvalList()])
  return { models, evals }
}

export async function getModelCards() {
  const evaluations = await loadAllEvaluationsFromDataDirectory()
  return buildModelCardsFromEvaluations(evaluations)
}

export async function getEvalListData() {
  const indexed = await buildEvalListDataFromBenchmarkIndexes()

  if (indexed) {
    return indexed
  }

  const evaluations = await loadAllEvaluationsFromDataDirectory()
  const summaries = Object.values(groupEvaluationsByBenchmark(evaluations))
  const totalModels = Object.keys(groupEvaluationsByModelFamily(evaluations)).length

  // Attach benchmark_card to each summary
  const evalsWithCards = await Promise.all(
    summaries.map(async (summary) => {
      const card = await getBenchmarkCard(summary.composite_benchmark_key)
      const listItem = toBenchmarkEvalListItem(summary)
      return card ? { ...listItem, benchmark_card: card } : listItem
    })
  )

  return { evals: evalsWithCards, totalModels }
}

export async function getEvalList() {
  const { evals } = await getEvalListData()
  return evals
}

export async function getDeveloperList() {
  const [developersIndex, modelsIndex] = await Promise.all([
    readDevelopersIndex(),
    readModelsIndex(),
  ])

  if (developersIndex?.length) {
    const details = await Promise.all(
      developersIndex.map(async (entry) => ({
        developer: entry.developer,
        detail: await readDeveloperDetailFile(entry.developer),
      }))
    )

    return details
      .map(({ developer, detail }) => {
        const aggregate = summarizeDeveloperModels(detail?.models ?? [])

        return {
          developer,
          route_id: getDeveloperRouteId(developer),
          model_count: detail?.models?.length ?? aggregate.model_count ?? 0,
          benchmark_count: aggregate.benchmark_count,
          evaluation_count: aggregate.evaluation_count,
          popular_evals: aggregate.popular_evals,
        }
      })
      .sort((a, b) => a.developer.localeCompare(b.developer))
  }

  if (modelsIndex?.length) {
    return buildDeveloperListFromModelsIndex(modelsIndex).map((entry) => {
      const developerModels = modelsIndex.filter(
        (model) => (model.developer?.trim() || "unknown") === entry.developer
      )
      const aggregate = summarizeDeveloperModels(developerModels)

      return {
        ...entry,
        benchmark_count: aggregate.benchmark_count,
        evaluation_count: aggregate.evaluation_count,
        popular_evals: aggregate.popular_evals,
      }
    })
  }

  const evaluations = await loadAllEvaluationsFromDataDirectory()
  const groupedByModel = groupEvaluationsByModel(evaluations)
  const counts = new Map<string, number>()

  for (const modelEvaluations of Object.values(groupedByModel)) {
    const developer = modelEvaluations[0]?.model_info.developer?.trim() || "unknown"
    counts.set(developer, (counts.get(developer) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([developer, model_count]) => ({
      developer,
      route_id: getDeveloperRouteId(developer),
      model_count,
      benchmark_count: 0,
      evaluation_count: 0,
      popular_evals: [],
    }))
    .sort((a, b) => a.developer.localeCompare(b.developer))
}

export async function getDeveloperSummaryById(routeId: string) {
  const detail = await readDeveloperDetail(routeId)

  if (detail) {
    const evaluations = await loadEvaluationsForModelIds(
      detail.models.map((model) => model.id)
    )
    const aggregate = summarizeDeveloperModels(detail.models)

    return {
      developer: detail.developer,
      route_id: getDeveloperRouteId(detail.developer),
      model_count: aggregate.model_count,
      benchmark_count: aggregate.benchmark_count,
      evaluation_count: aggregate.evaluation_count,
      popular_evals: aggregate.popular_evals,
      models: buildModelCardsFromEvaluations(evaluations),
    }
  }

  const evaluations = await loadAllEvaluationsFromDataDirectory()
  const groupedByModel = groupEvaluationsByModel(evaluations)
  const matchedEvaluations = Object.values(groupedByModel)
    .filter((modelEvaluations) => {
      const developer = modelEvaluations[0]?.model_info.developer?.trim() || "unknown"
      return developer === routeId || getDeveloperRouteId(developer) === routeId
    })
    .flat()

  if (matchedEvaluations.length === 0) {
    return null
  }

  const developer = matchedEvaluations[0]?.model_info.developer?.trim() || "unknown"
  const groupedModels = groupEvaluationsByModel(matchedEvaluations)
  const fallbackModels: IndexedModelSummary[] = Object.values(groupedModels).map((items) => ({
    id: items[0]?.model_info.id ?? "unknown",
    name: items[0]?.model_info.name ?? items[0]?.model_info.id ?? "unknown",
    developer,
    benchmark_scores: Object.fromEntries(
      items.flatMap((evaluation) =>
        evaluation.evaluation_results
          .flatMap((result) => {
            const score = result.score_details?.score
            if (!Number.isFinite(score)) {
              return []
            }

            const benchmarkName =
              !Array.isArray(result.source_data) && result.source_data?.dataset_name
                ? result.source_data.dataset_name
                : evaluation.benchmark ?? result.evaluation_name

            return [[`${benchmarkName}/${result.evaluation_name}`, score] as const]
          })
      ),
    ),
  }))
  const aggregate = summarizeDeveloperModels(fallbackModels)

  return {
    developer,
    route_id: getDeveloperRouteId(developer),
    model_count: aggregate.model_count,
    benchmark_count: aggregate.benchmark_count,
    evaluation_count: aggregate.evaluation_count,
    popular_evals: aggregate.popular_evals,
    models: buildModelCardsFromEvaluations(matchedEvaluations),
  }
}

export async function getModelSummaryById(modelId: string) {
  const indexedModels = await readModelsIndex()

  if (indexedModels?.length) {
    const matchingModelIds = indexedModels
      .filter((summary) => {
        const familyId = getCanonicalModelIdentity(createIndexedModelInfo(summary)).familyId
        return familyId === modelId || getModelFamilyRouteId(familyId) === modelId || summary.id === modelId
      })
      .map((summary) => summary.id)

    if (matchingModelIds.length > 0) {
      const evaluations = await loadEvaluationsForModelIds(matchingModelIds)
      if (evaluations.length > 0) {
        return createModelFamilySummary(evaluations)
      }
    }
  }

  const evaluations = await loadAllEvaluationsFromDataDirectory()
  const groupedByFamily = groupEvaluationsByModelFamily(evaluations)
  const directFamilyMatch = groupedByFamily[modelId]

  if (directFamilyMatch?.length) {
    return createModelFamilySummary(directFamilyMatch)
  }

  const routeMatchedFamilyId = Object.keys(groupedByFamily).find(
    (familyId) => getModelFamilyRouteId(familyId) === modelId
  )

  if (routeMatchedFamilyId) {
    return createModelFamilySummary(groupedByFamily[routeMatchedFamilyId])
  }

  const rawGrouped = groupEvaluationsByModel(evaluations)
  const rawModelEvaluations = rawGrouped[modelId]

  if (!rawModelEvaluations?.length) {
    return null
  }

  const familyId = getCanonicalModelIdentity(rawModelEvaluations[0].model_info).familyId
  const familyEvaluations = groupedByFamily[familyId] ?? rawModelEvaluations

  return createModelFamilySummary(familyEvaluations)
}

export async function getEvalSummaryById(evalId: string) {
  const evaluations = await loadAllEvaluationsFromDataDirectory()
  const grouped = groupEvaluationsByBenchmark(evaluations)
  const summariesWithCards = await Promise.all(
    Object.values(grouped).map((summary) => attachBenchmarkCardToSummary(summary))
  )

  if (evalId.startsWith("aggregate__")) {
    const aggregateKey = evalId.replace(/^aggregate__/, "")
    const aggregateMembers = summariesWithCards.filter((summary) => {
      const cardName = summary.benchmark_card?.benchmark_details?.name
      return cardName ? slugifyEvalId(normalizeBenchmarkKey(cardName)) === aggregateKey : false
    })

    return aggregateBenchmarkSummaries(aggregateMembers, aggregateKey)
  }

  const summary = summariesWithCards.find((item) => item.evaluation_id === evalId) ?? null

  if (!summary) return null

  return summary
}
