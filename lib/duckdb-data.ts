import "server-only"

import { promises as fs } from "fs"
import path from "path"

import { DuckDBConnection, type DuckDBValue } from "@duckdb/node-api"

import type { BenchmarkEvalListItem, BenchmarkEvalSummary } from "@/lib/eval-processing"
import type { EvaluationCardData, ModelEvaluationSummary } from "@/lib/benchmark-schema"

// Parity parquet emitted by `eval_cards_backend_pipeline/scripts/parity_outputs.py`.
// Each table (except model_results, which is long-form relational) carries
// scalar routing columns plus a `payload_json` column whose value is already
// in the post-TS-adapter shape. This module is a strict pass-through: if a
// payload is missing fields the consumer needs, we throw with the file +
// payload key path so the backend gap is visible. We DO NOT re-run TS
// adapters or fill defaults here — that policy belongs upstream.
const PARQUET_DIR = path.join("duckdb", "v1")
const PARQUET_FILES = {
  modelCards: "model_cards.parquet",
  modelCardsLite: "model_cards_lite.parquet",
  evalList: "eval_list.parquet",
  evalListLite: "eval_list_lite.parquet",
  evalSummaries: "eval_summaries.parquet",
  aggregateEvalSummaries: "aggregate_eval_summaries.parquet",
  matrixEvalSummaries: "matrix_eval_summaries.parquet",
  modelSummaries: "model_summaries.parquet",
  developers: "developers.parquet",
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
      `DuckDB backend expected ${filePath}. Re-run the backend pipeline (parity parquet is emitted on every run; no env var required).`
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

function parsePayload<T>(row: Record<string, unknown>, file: ParquetFileKey): T {
  const raw = row.payload_json
  if (typeof raw !== "string") {
    throw new Error(
      `[duckdb-data] ${PARQUET_FILES[file]} row had no payload_json string. Backend parity emitter must populate this column.`
    )
  }

  return JSON.parse(raw) as T
}

async function readPayloads<T>(key: ParquetFileKey, orderBy?: string): Promise<T[]> {
  const connection = await getConnection()
  const filePath = await getParquetPath(key)
  const sql = `SELECT payload_json FROM read_parquet(?)${orderBy ? ` ${orderBy}` : ""}`
  const reader = await connection.runAndReadAll(sql, [filePath])
  return reader.getRowObjects().map((row) => parsePayload<T>(row, key))
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
  return rows.length > 0 ? parsePayload<T>(rows[0], key) : null
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

export async function getModelCardsFromDuckDB(): Promise<EvaluationCardData[]> {
  const entries = await readPayloads<EvaluationCardData>("modelCards")
  return entries.sort(modelCardSort)
}

export async function getModelCardsLiteFromDuckDB(): Promise<EvaluationCardData[]> {
  const entries = await readPayloads<EvaluationCardData>("modelCardsLite")
  return entries.sort(modelCardLiteSort)
}

export async function getEvalListDataFromDuckDB(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
}> {
  const [evals, totalModels] = await Promise.all([
    readPayloads<BenchmarkEvalListItem>("evalList"),
    countRows("modelCards"),
  ])

  return {
    evals: evals.sort(evalListSort),
    totalModels,
  }
}

export async function getEvalListLiteDataFromDuckDB(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
}> {
  const [evals, totalModels] = await Promise.all([
    readPayloads<BenchmarkEvalListItem>("evalListLite"),
    countRows("modelCardsLite"),
  ])

  return {
    evals: evals.sort(evalListSort),
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

// Resolve `evalId` across the three eval-summary tables. The pipeline emits
// direct evals into `eval_summaries`, `aggregate__<suite>` rows into
// `aggregate_eval_summaries`, and `matrix__<suite>` rows into
// `matrix_eval_summaries`. The TS-side `getEvalSummaryById` (lib/model-data.ts)
// dispatches by id prefix; the DuckDB path mirrors that without re-running
// any aggregation TS — the parity payloads already carry the post-TS shape.
export async function getEvalSummaryByIdFromDuckDB(evalId: string) {
  if (evalId.startsWith("aggregate__")) {
    return readPayloadById<BenchmarkEvalSummary>(
      "aggregateEvalSummaries",
      "eval_summary_id = ?",
      [evalId]
    )
  }

  if (evalId.startsWith("matrix__")) {
    return readPayloadById<BenchmarkEvalSummary>(
      "matrixEvalSummaries",
      "eval_summary_id = ?",
      [evalId]
    )
  }

  return readPayloadById<BenchmarkEvalSummary>(
    "evalSummaries",
    "eval_summary_id = ?",
    [evalId]
  )
}

export async function getModelSummaryByIdFromDuckDB(modelId: string) {
  return readPayloadById<ModelEvaluationSummary>(
    "modelSummaries",
    "model_route_id = ? OR model_family_id = ?",
    [modelId, modelId]
  )
}

// Shape contract for `developers.parquet` and `developer_summaries.parquet`
// payloads. The summary table additionally carries a `models[]` array of
// post-`hfModelCardToEvaluationCardData` rows (matching the JSON-path
// `hfDeveloperDetailToSummary` output). If the backend has not yet run the
// adapter, the parity verifier will flag the divergence.
interface DeveloperListEntry {
  developer: string
  route_id: string
  model_count: number
  benchmark_count: number
  evaluation_count: number
  popular_evals: Array<{ benchmark: string; model_count: number }>
}

interface DeveloperSummaryPayload extends DeveloperListEntry {
  models: EvaluationCardData[]
}

function assertDeveloperListShape(payload: unknown, source: string): asserts payload is DeveloperListEntry {
  if (!payload || typeof payload !== "object") {
    throw new Error(`[duckdb-data] ${source}: payload was not an object.`)
  }
  const required = ["developer", "route_id", "model_count", "benchmark_count", "evaluation_count", "popular_evals"]
  for (const key of required) {
    if (!(key in payload)) {
      throw new Error(
        `[duckdb-data] ${source}: payload missing field \`${key}\`. Backend parity emitter must run hf_developer_detail_to_summary before writing parquet.`
      )
    }
  }
}

export async function getDeveloperSummaryByIdFromDuckDB(routeId: string) {
  const payload = await readPayloadById<unknown>(
    "developerSummaries",
    "developer_route_id = ?",
    [routeId]
  )
  if (!payload) return null
  assertDeveloperListShape(payload, `developer_summaries.parquet (route_id=${routeId})`)
  if (!Array.isArray((payload as DeveloperSummaryPayload).models)) {
    throw new Error(
      `[duckdb-data] developer_summaries.parquet (route_id=${routeId}): payload missing \`models\` array.`
    )
  }
  return payload as DeveloperSummaryPayload
}

export async function getDeveloperListFromDuckDB() {
  const summaries = await readPayloads<unknown>("developers")
  for (const payload of summaries) {
    assertDeveloperListShape(payload, "developers.parquet")
  }
  return (summaries as DeveloperListEntry[])
    .slice()
    .sort((a, b) => a.developer.localeCompare(b.developer))
}
