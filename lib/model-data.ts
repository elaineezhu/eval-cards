import "server-only"

import { promises as fs } from "fs"
import path from "path"

import type {
  BenchmarkEvaluation,
  EvalLibrary,
  EvaluationResult,
  GenerationConfig,
  ModelInfo,
  SampleResult,
  ScoreDetails,
  SourceData,
  SourceMetadata,
} from "@/lib/benchmark-schema"
import {
  createEvaluationCard,
  createModelFamilySummary,
  groupEvaluationsByBenchmark,
  groupEvaluationsByModelFamily,
  groupEvaluationsByModel,
  toBenchmarkEvalListItem,
} from "@/lib/eval-processing"
import { getCanonicalModelIdentity, getModelFamilyRouteId, normalizeModelInfo } from "@/lib/model-family"

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

function getDataDirectory() {
  return path.join(process.cwd(), "data")
}

function shouldCacheModelData() {
  return process.env.NODE_ENV === "production"
}

async function listModelDataFiles(): Promise<string[]> {
  const entries = await fs.readdir(getDataDirectory(), { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(getDataDirectory(), entry.name))
    .sort((a, b) => a.localeCompare(b))
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

        return raw.evaluations.map((evaluation) =>
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
  const groupedByModel = groupEvaluationsByModelFamily(evaluations)

  return Object.values(groupedByModel).map((modelEvaluations) =>
    createEvaluationCard(createModelFamilySummary(modelEvaluations))
  )
}

export async function getEvalListData() {
  const evaluations = await loadAllEvaluationsFromDataDirectory()
  const summaries = Object.values(groupEvaluationsByBenchmark(evaluations))
  const totalModels = Object.keys(groupEvaluationsByModelFamily(evaluations)).length

  return {
    evals: summaries.map(toBenchmarkEvalListItem),
    totalModels,
  }
}

export async function getEvalList() {
  const { evals } = await getEvalListData()
  return evals
}

export async function getModelSummaryById(modelId: string) {
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

  return Object.values(grouped).find((summary) => summary.evaluation_id === evalId) ?? null
}
