import "server-only"

import { promises as fs } from "fs"
import path from "path"

import { DuckDBConnection, type DuckDBValue } from "@duckdb/node-api"

import type { BenchmarkEvalListItem, BenchmarkEvalSummary } from "@/lib/eval-processing"
import type { EvaluationCardData, ModelEvaluationSummary } from "@/lib/benchmark-schema"
import { getBenchmarkCard } from "@/lib/benchmark-metadata"
import type { HFEvalDetail, HFModelCardEntry, HFModelDetail } from "@/lib/hf-data"
import {
  attachBenchmarkCardToSummary,
  getBenchmarkDisplayName,
  getDeveloperBenchmarkStats,
  getDeveloperRouteId,
  hfDeveloperDetailToSummary,
  hfEvalDetailToSummary,
  hfEvalEntryToListItem,
  hfModelCardToEvaluationCardData,
  normalizeDeveloperName,
} from "@/lib/model-data"
import { createModelFamilySummary } from "@/lib/eval-processing"
import { flattenModelEvaluations } from "@/lib/hf-data"

const PARQUET_DIR = path.join("experimental", "parquet")
const PARQUET_FILES = {
  modelCards: "model_cards.parquet",
  modelCardsLite: "model_cards_lite.parquet",
  evalList: "eval_list.parquet",
  evalListLite: "eval_list_lite.parquet",
  evalSummaries: "eval_summaries.parquet",
  modelSummaries: "model_summaries.parquet",
  developerSummaries: "developer_summaries.parquet",
} as const

type ParquetFileKey = keyof typeof PARQUET_FILES

let connectionPromise: Promise<DuckDBConnection> | null = null

function getPipelineOutputDir() {
  const configured = process.env.LOCAL_PIPELINE_OUTPUT?.trim()
  if (!configured) {
    throw new Error(
      "DATA_BACKEND=duckdb requires LOCAL_PIPELINE_OUTPUT to point at a local eval_cards_backend_pipeline/output directory"
    )
  }

  return configured
}

async function getParquetPath(key: ParquetFileKey) {
  const filePath = path.join(getPipelineOutputDir(), PARQUET_DIR, PARQUET_FILES[key])

  try {
    await fs.access(filePath)
  } catch {
    throw new Error(
      `DuckDB backend expected ${filePath}. Run the backend pipeline with EXPORT_EXPERIMENTAL_PARQUET=1 first.`
    )
  }

  return filePath
}

async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = DuckDBConnection.create()
  }

  return connectionPromise
}

function parsePayload<T>(row: Record<string, unknown>): T {
  const raw = row.payload_json
  if (typeof raw !== "string") {
    throw new Error("DuckDB payload row did not include a string payload_json field")
  }

  return JSON.parse(raw) as T
}

async function readPayloads<T>(key: ParquetFileKey, orderBy?: string): Promise<T[]> {
  const connection = await getConnection()
  const filePath = await getParquetPath(key)
  const sql = `SELECT payload_json FROM read_parquet(?)${orderBy ? ` ${orderBy}` : ""}`
  const reader = await connection.runAndReadAll(sql, [filePath])
  return reader.getRowObjects().map((row) => parsePayload<T>(row))
}

async function readPayloadById<T>(
  key: ParquetFileKey,
  whereSql: string,
  params: DuckDBValue[]
): Promise<T | null> {
  const connection = await getConnection()
  const filePath = await getParquetPath(key)
  const reader = await connection.runAndReadAll(
    `SELECT payload_json FROM read_parquet(?) WHERE ${whereSql} LIMIT 1`,
    [filePath, ...params]
  )
  const rows = reader.getRowObjects()
  return rows.length > 0 ? parsePayload<T>(rows[0]) : null
}

async function countRows(key: ParquetFileKey) {
  const connection = await getConnection()
  const filePath = await getParquetPath(key)
  const reader = await connection.runAndReadAll(
    "SELECT count(*) AS row_count FROM read_parquet(?)",
    [filePath]
  )
  const value = reader.getRowObjects()[0]?.row_count
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0)
}

function modelCardSort(a: EvaluationCardData, b: EvaluationCardData) {
  return new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime()
}

function modelCardLiteSort(a: EvaluationCardData, b: EvaluationCardData) {
  return (
    b.benchmarks_count - a.benchmarks_count ||
    b.evaluations_count - a.evaluations_count ||
    a.model_name.localeCompare(b.model_name)
  )
}

function evalListSort(a: BenchmarkEvalListItem, b: BenchmarkEvalListItem) {
  return (a.evaluation_name ?? "").localeCompare(b.evaluation_name ?? "")
}

async function attachBenchmarkCardsToEvalListItems(items: BenchmarkEvalListItem[]) {
  return Promise.all(
    items.map(async (item) => {
      if (item.benchmark_card) {
        return item
      }

      const candidates = [
        item.evaluation_name,
        item.composite_benchmark_key,
        item.composite_benchmark_name,
      ].filter(Boolean)

      for (const name of candidates) {
        const card = await getBenchmarkCard(name)
        if (card) {
          return { ...item, benchmark_card: card }
        }
      }

      return item
    })
  )
}

function toEvaluationCard(entry: HFModelCardEntry | EvaluationCardData): EvaluationCardData {
  if ("evaluations_count" in entry && "benchmarks_count" in entry) {
    return entry as EvaluationCardData
  }

  return hfModelCardToEvaluationCardData(entry as HFModelCardEntry)
}

function toEvalListItem(entry: unknown): BenchmarkEvalListItem {
  if (entry && typeof entry === "object" && "evaluation_id" in entry && "composite_benchmark_key" in entry) {
    return entry as BenchmarkEvalListItem
  }

  return hfEvalEntryToListItem(entry as Parameters<typeof hfEvalEntryToListItem>[0])
}

async function toEvalSummary(payload: unknown): Promise<BenchmarkEvalSummary> {
  if (payload && typeof payload === "object" && "model_results" in payload && "evaluation_id" in payload) {
    return payload as BenchmarkEvalSummary
  }

  return attachBenchmarkCardToSummary(hfEvalDetailToSummary(payload as HFEvalDetail))
}

function toModelSummary(payload: unknown): ModelEvaluationSummary {
  // The pipeline payload carries `evaluations_by_category` already, but with
  // lowercase category keys, raw timestamps, and per-eval benchmark_card
  // duplicates. The JSON path always re-aggregates via flattenModelEvaluations
  // + createModelFamilySummary; mirror that here so parity is exact. Pushing
  // the post-adapter shape into the pipeline is migration item #3 (`hierarchy
  // → flat BenchmarkEvaluation[] rebuild`).
  const evaluations = flattenModelEvaluations(payload as HFModelDetail)
  if (evaluations.length === 0) {
    throw new Error("DuckDB model summary payload did not contain any model evaluations")
  }

  return createModelFamilySummary(evaluations)
}

export async function getModelCardsFromDuckDB(): Promise<EvaluationCardData[]> {
  const entries = await readPayloads<HFModelCardEntry | EvaluationCardData>("modelCards")
  return entries.map(toEvaluationCard).sort(modelCardSort)
}

export async function getModelCardsLiteFromDuckDB(): Promise<EvaluationCardData[]> {
  const entries = await readPayloads<HFModelCardEntry | EvaluationCardData>("modelCardsLite")
  return entries.map(toEvaluationCard).sort(modelCardLiteSort)
}

export async function getEvalListDataFromDuckDB(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
}> {
  const [entries, totalModels] = await Promise.all([
    readPayloads<unknown>("evalList"),
    countRows("modelCards"),
  ])
  const evals = entries
    .map(toEvalListItem)
    .filter((entry) => !(typeof entry.source_data?.hf_repo === "string" && entry.source_data.hf_repo.startsWith("example://")))
  const evalsWithCards = await attachBenchmarkCardsToEvalListItems(evals)

  return {
    evals: evalsWithCards.sort(evalListSort),
    totalModels,
  }
}

export async function getEvalListLiteDataFromDuckDB(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
}> {
  const [entries, totalModels] = await Promise.all([
    readPayloads<unknown>("evalListLite"),
    countRows("modelCardsLite"),
  ])

  return {
    evals: entries
      .map(toEvalListItem)
      .filter((entry) => !(typeof entry.source_data?.hf_repo === "string" && entry.source_data.hf_repo.startsWith("example://")))
      .sort(evalListSort),
    totalModels,
  }
}

export async function getEvalListFromDuckDB() {
  const { evals } = await getEvalListDataFromDuckDB()
  return evals
}

export async function getDashboardDataFromDuckDB() {
  const [models, evals] = await Promise.all([
    getModelCardsFromDuckDB(),
    getEvalListFromDuckDB(),
  ])
  return { models, evals }
}

export async function getEvalSummaryByIdFromDuckDB(evalId: string) {
  const payload = await readPayloadById<unknown>(
    "evalSummaries",
    "eval_summary_id = ?",
    [evalId]
  )

  return payload ? toEvalSummary(payload) : null
}

export async function getModelSummaryByIdFromDuckDB(modelId: string) {
  const payload = await readPayloadById<unknown>(
    "modelSummaries",
    "model_route_id = ? OR model_family_id = ?",
    [modelId, modelId]
  )

  return payload ? toModelSummary(payload) : null
}

export async function getDeveloperSummaryByIdFromDuckDB(routeId: string) {
  const payload = await readPayloadById<{ developer: string; models: HFModelCardEntry[] }>(
    "developerSummaries",
    "developer_route_id = ?",
    [routeId]
  )

  return payload ? hfDeveloperDetailToSummary(payload) : null
}

export async function getDeveloperListFromDuckDB() {
  const summaries = await readPayloads<{ developer: string; models: HFModelCardEntry[] }>("developerSummaries")

  return summaries
    .map((detail) => {
      const benchmarkCounts = getDeveloperBenchmarkStats(detail.models)
      const evaluationCount = detail.models.reduce(
        (sum, model) => sum + model.total_evaluations,
        0
      )
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
      }
    })
    .sort((a, b) => a.developer.localeCompare(b.developer))
}
