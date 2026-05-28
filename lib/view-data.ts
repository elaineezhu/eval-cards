import "server-only"

import fs from "node:fs"
import path from "node:path"
import { getConnection } from "@/lib/duckdb"
import { fetchHeadline } from "@/lib/sidecars"
import {
  EVALUATION_CATEGORIES,
  type BenchmarkCard,
  type BenchmarkEvaluation,
  type CategoryType,
  type EvaluationCardData,
  type EvaluationResult,
  type GenerationConfig,
  type MetricConfig,
  type ModelInfo,
  type ModelEvaluationSummary,
  type ModelVariantSummary,
  type ScoreDetails,
  type SourceData,
  type SourceMetadata,
} from "@/lib/benchmark-schema"
import type { DeveloperListEntry } from "@/lib/backend-artifacts"
import type {
  BenchmarkEvalListItem,
  BenchmarkEvalSummary,
  ModelResultForBenchmark,
} from "@/lib/eval-processing"
import { dedupeLeaderboardRowsByModelIdentity } from "@/lib/eval-processing"

type Row = Record<string, any>

const MODEL_CARD_COLUMNS = `
  id, model_key, route_id, model_name, model_id, canonical_model_name, developer,
  evaluations_count, benchmarks_count, variant_count,
  categories, category_stats, latest_timestamp,
  evaluator_count, evaluator_names, source_type_count, source_types,
  evidence_count, missing_generation_config_count,
  third_party_eval_count, independent_verification_ratio,
  reproducibility_status, eval_libraries, latest_source_name,
  params_billions, benchmark_names, score_summary,
  reproducibility_summary, provenance_summary, comparability_summary,
  top_scores, source_urls, detail_urls,
  model_url, release_date,
  architecture, params, inference_engine, inference_platform
`

// The composite/family/slice taxonomy refactor (eval_card_backend
// notes/09-) replaced the legacy `composite_benchmark_key` /
// `composite_benchmark_name` columns with `composite_slug` /
// `composite_display_name`. The `family_id` / `family_display_name` /
// `is_slice` columns are the canonical identity surface; we still
// alias the composite_* legacy names for backward compat with
// consumers that haven't migrated yet. Mapping:
//   composite_benchmark_key/name → composite_slug/display_name
//     (the leaderboard, e.g. "wasp"/"WASP" — what the eval-detail
//     "Composite" label shows)
const EVAL_LIST_COLUMNS = `
  evaluation_id, evaluation_name, canonical_display_name,
  benchmark_id,
  composite_slug, composite_display_name,
  family_id, family_display_name, is_slice,
  parent_benchmark_id,
  composite_slug AS composite_benchmark_key,
  composite_display_name AS composite_benchmark_name,
  family_display_name AS benchmark_family_name,
  category,
  metric_config, models_count, evaluator_names, source_types,
  latest_source_name, third_party_ratio,
  missing_generation_config_count, best_model, worst_model,
  avg_score, avg_score_norm, has_card, benchmark_card,
  is_aggregated, aggregate_sources, tags,
  metrics_count, metric_names, instance_data, top_score,
  subtasks_count, is_summary_score, summary_eval_ids,
  root_metrics, subtasks, leaderboard_metrics,
  reproducibility_summary, provenance_summary, comparability_summary,
  source_data
`

const CELL_JOIN_COLUMNS = `
  r.*,
  e.evaluation_name AS eval_evaluation_name,
  e.canonical_display_name AS eval_canonical_display_name,
  e.benchmark_id AS eval_benchmark_id,
  e.composite_slug AS eval_composite_slug,
  e.composite_display_name AS eval_composite_display_name,
  e.family_id AS eval_family_id,
  e.family_display_name AS eval_family_display_name,
  e.is_slice AS eval_is_slice,
  e.parent_benchmark_id AS eval_parent_benchmark_id,
  e.composite_slug AS eval_composite_benchmark_key,
  e.composite_display_name AS eval_composite_benchmark_name,
  e.family_display_name AS eval_benchmark_family_name,
  e.category AS eval_category,
  e.metric_config AS eval_metric_config,
  e.source_data AS eval_source_data,
  e.benchmark_card AS eval_benchmark_card,
  e.tags AS eval_tags,
  e.is_summary_score AS eval_is_summary_score,
  e.summary_eval_ids AS eval_summary_eval_ids
`

function normalizeDuckDBValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return Number(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, mapValue]) => [String(key), normalizeDuckDBValue(mapValue)])
    )
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDuckDBValue)
  }

  if (value && typeof value === "object") {
    const duckValue = value as {
      constructor?: { name?: string }
      entries?: unknown
      items?: unknown
      scale?: unknown
      value?: unknown
      toString?: () => string
    }
    const constructorName = duckValue.constructor?.name ?? ""

    if (constructorName === "DuckDBStructValue" && duckValue.entries && typeof duckValue.entries === "object") {
      return normalizeDuckDBValue(duckValue.entries)
    }

    if (
      (constructorName === "DuckDBListValue" || constructorName === "DuckDBArrayValue") &&
      Array.isArray(duckValue.items)
    ) {
      return duckValue.items.map(normalizeDuckDBValue)
    }

    if (constructorName === "DuckDBMapValue" && Array.isArray(duckValue.entries)) {
      return Object.fromEntries(
        duckValue.entries.map((entry) => {
          const pair = entry as { key: unknown; value: unknown }
          return [String(pair.key), normalizeDuckDBValue(pair.value)]
        })
      )
    }

    if (constructorName === "DuckDBDecimalValue" && typeof duckValue.toString === "function") {
      return Number(duckValue.toString())
    }

    if (constructorName.startsWith("DuckDB") && typeof duckValue.toString === "function") {
      return duckValue.toString()
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, objectValue]) => [key, normalizeDuckDBValue(objectValue)])
    )
  }

  return value
}

async function readRows<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const connection = await getConnection()
  const reader = params.length > 0
    ? await connection.runAndReadAll(sql, params as any[])
    : await connection.runAndReadAll(sql)
  return reader.getRowObjects().map((row) => normalizeDuckDBValue(row) as T)
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function optionalNumber(value: unknown) {
  if (value == null) return undefined
  const parsed = asNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : undefined
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function normalizeCategory(value: unknown): CategoryType {
  return EVALUATION_CATEGORIES.includes(value as CategoryType)
    ? value as CategoryType
    : "General"
}

function emptyEvaluationsByCategory(): Record<CategoryType, BenchmarkEvaluation[]> {
  return EVALUATION_CATEGORIES.reduce((acc, category) => {
    acc[category] = []
    return acc
  }, {} as Record<CategoryType, BenchmarkEvaluation[]>)
}

function sourceMetadataFromRow(row: Row): SourceMetadata {
  if (row.source_metadata && typeof row.source_metadata === "object") {
    return row.source_metadata as SourceMetadata
  }

  return {
    source_type: "documentation",
    source_organization_name: asString(row.latest_source_name, "Unknown"),
    evaluator_relationship: "other",
  }
}

function sourceDataFromRow(row: Row): BenchmarkEvaluation["source_data"] {
  const sourceData = row.source_data ?? row.eval_source_data
  if (sourceData) {
    return sourceData as BenchmarkEvaluation["source_data"]
  }

  return {
    dataset_name: asString(row.eval_evaluation_name ?? row.evaluation_name ?? row.benchmark_id, "Unknown dataset"),
  } satisfies SourceData
}

function scoreDetailsFromRow(row: Row): ScoreDetails {
  const details = row.score_details && typeof row.score_details === "object"
    ? row.score_details as Partial<ScoreDetails>
    : {}
  const score = asNumber(details.score ?? row.score)

  return {
    ...details,
    score,
  } as ScoreDetails
}

function metricConfigFromRow(row: Row): MetricConfig {
  const config = (row.metric_config ?? row.eval_metric_config ?? {}) as Partial<MetricConfig>
  const scoreType = config.score_type === "binary" || config.score_type === "discrete"
    ? config.score_type
    : "continuous"

  return {
    evaluation_description: asString(
      config.evaluation_description ??
        row.metric_description ??
        row.metric_display_name ??
        row.eval_evaluation_name ??
        row.evaluation_name,
      ""
    ),
    lower_is_better: Boolean(row.lower_is_better ?? config.lower_is_better ?? false),
    score_type: scoreType,
    min_score: optionalNumber(config.min_score ?? row.min_score),
    max_score: optionalNumber(config.max_score ?? row.max_score),
    unit: optionalString(row.metric_unit ?? config.unit),
  }
}

function modelInfoFromModelRow(row: Row): ModelInfo {
  return {
    name: asString(row.model_name ?? row.model_family_name ?? row.model_id ?? row.model_key, "Unknown model"),
    id: asString(row.model_key ?? row.model_id ?? row.id ?? row.route_id, "unknown-model"),
    developer: optionalString(row.developer),
    inference_platform: optionalString(row.inference_platform),
    inference_engine: optionalString(row.inference_engine),
    architecture: optionalString(row.architecture),
    parameter_count: optionalString(row.params),
    release_date: optionalString(row.release_date),
    model_url: optionalString(row.model_url),
    additional_details: {
      params_billions: row.params_billions,
    },
    modalities: {
      input: asArray<string>(row.input_modalities),
      output: asArray<string>(row.output_modalities),
    },
  }
}

function resultFromCell(row: Row): EvaluationResult {
  const scoreDetails = scoreDetailsFromRow(row)
  const generationConfig = row.generation_config as GenerationConfig | undefined
  const annotations = row.evalcards_annotations

  return {
    evaluation_name: asString(row.metric_display_name ?? row.eval_evaluation_name ?? row.metric_id, "Score"),
    display_name: optionalString(row.metric_display_name),
    canonical_display_name: optionalString(row.metric_display_name),
    metric_summary_id: optionalString(row.metric_summary_id),
    metric_key: optionalString(row.metric_id),
    evaluation_timestamp: asString(row.evaluation_timestamp, ""),
    source_data: sourceDataFromRow(row),
    metric_config: metricConfigFromRow(row),
    score_details: scoreDetails,
    generation_config: generationConfig,
    detailed_evaluation_results_url: optionalString(row.instance_file_path),
    evalcards: annotations ? { annotations } : undefined,
  }
}

function reshapeCellToModelResult(row: Row): ModelResultForBenchmark {
  const scoreDetails = scoreDetailsFromRow(row)

  return {
    model_info: (row.model_info ?? modelInfoFromModelRow(row)) as ModelInfo,
    model_route_id: optionalString(row.model_route_id),
    score: scoreDetails.score,
    score_details: scoreDetails,
    evaluation_timestamp: asString(row.evaluation_timestamp, ""),
    source_metadata: sourceMetadataFromRow(row),
    source_data: sourceDataFromRow(row),
    source_record_url: optionalString(row.source_record_url),
    aggregate_components: asArray<NonNullable<ModelResultForBenchmark["aggregate_components"]>[number]>(
      row.aggregate_components
    ),
    result: resultFromCell(row),
  }
}

function reshapeCellToBenchmarkEvaluation(row: Row): BenchmarkEvaluation {
  const result = resultFromCell(row)
  const modelInfo = (row.model_info ?? modelInfoFromModelRow(row)) as ModelInfo

  return {
    schema_version: "1.0",
    eval_summary_id: optionalString(row.evaluation_id),
    evaluation_id: asString(row.evaluation_id ?? row.benchmark_id, "unknown-evaluation"),
    retrieved_timestamp: asString(row.evaluation_timestamp, ""),
    benchmark: optionalString(row.eval_evaluation_name ?? row.benchmark_id),
    display_name: optionalString(row.eval_evaluation_name),
    canonical_display_name: optionalString(row.eval_canonical_display_name),
    category: normalizeCategory(row.eval_category ?? row.category),
    family_id: optionalString(row.eval_family_id),
    benchmark_family_name: optionalString(row.eval_family_display_name),
    parent_benchmark_id: optionalString(row.eval_parent_benchmark_id),
    benchmark_parent_name: optionalString(row.eval_composite_benchmark_name),
    benchmark_leaf_name: optionalString(row.eval_evaluation_name),
    is_slice: Boolean(row.eval_is_slice),
    is_summary_score: Boolean(row.eval_is_summary_score ?? row.is_summary_score),
    source_data: sourceDataFromRow(row),
    source_metadata: sourceMetadataFromRow(row),
    eval_library: row.eval_library,
    model_info: modelInfo,
    generation_config: row.generation_config,
    evaluation_results: [result],
  }
}

function modelSummaryFromRows(modelRow: Row, cellRows: Row[]): ModelEvaluationSummary {
  const evaluationsByCategory = emptyEvaluationsByCategory()
  for (const cellRow of cellRows) {
    const evaluation = reshapeCellToBenchmarkEvaluation(cellRow)
    const category = normalizeCategory(evaluation.category)
    evaluationsByCategory[category].push(evaluation)
  }

  const categoriesCovered = asArray<CategoryType>(modelRow.categories).filter((category) =>
    EVALUATION_CATEGORIES.includes(category)
  )
  const modelInfo = (modelRow.model_info ?? modelInfoFromModelRow(modelRow)) as ModelInfo
  const totalEvaluations = asNumber(modelRow.total_evaluations ?? modelRow.evaluations_count)
  const lastUpdated = asString(modelRow.last_updated ?? modelRow.latest_timestamp, "")
  const rawModelIds = asArray<string>(modelRow.raw_model_ids)

  const core = {
    model_info: modelInfo,
    evaluations_by_category: evaluationsByCategory,
    total_evaluations: totalEvaluations,
    last_updated: lastUpdated,
    categories_covered: categoriesCovered.length > 0
      ? categoriesCovered
      : EVALUATION_CATEGORIES.filter((category) => evaluationsByCategory[category].length > 0),
    reproducibility_summary: modelRow.reproducibility_summary,
    provenance_summary: modelRow.provenance_summary,
    comparability_summary: modelRow.comparability_summary,
  }

  const variants = asArray<Row>(modelRow.variants).map((variant, index) => ({
    ...core,
    ...variant,
    variant_id: asString(variant.variant_id ?? variant.variant_key, `variant-${index}`),
    variant_key: asString(variant.variant_key, `variant-${index}`),
    variant_label: asString(variant.variant_label ?? variant.variant_display_name, "Default"),
    variant_display_name: asString(variant.variant_display_name ?? variant.variant_label ?? modelRow.model_name, modelRow.model_name),
    raw_model_ids: asArray<string>(variant.raw_model_ids),
    family_id: asString(variant.family_id ?? modelRow.model_family_id, modelRow.model_family_id),
    family_name: asString(variant.family_name ?? modelRow.model_family_name, modelRow.model_family_name),
    total_evaluations: asNumber(variant.total_evaluations ?? totalEvaluations),
    last_updated: asString(variant.last_updated ?? lastUpdated, lastUpdated),
    categories_covered: asArray<CategoryType>(variant.categories_covered).length > 0
      ? asArray<CategoryType>(variant.categories_covered)
      : core.categories_covered,
    model_info: {
      ...modelInfo,
      name: asString(variant.variant_display_name ?? variant.variant_label ?? modelInfo.name, modelInfo.name),
    },
  })) as ModelVariantSummary[]

  return {
    ...core,
    model_family_id: asString(modelRow.model_family_id ?? modelRow.model_key ?? modelRow.model_id, modelRow.model_key ?? modelRow.model_id),
    model_route_id: asString(modelRow.model_route_id ?? modelRow.route_id, modelRow.route_id),
    model_family_name: asString(modelRow.model_family_name ?? modelRow.model_name, modelRow.model_name),
    raw_model_ids: rawModelIds.length > 0 ? rawModelIds : [asString(modelRow.model_key ?? modelRow.model_id, "")].filter(Boolean),
    variants,
  }
}

async function getModelEvaluationRows(modelKey: string): Promise<Row[]> {
  // model_key is the producer's addressable identifier — non-null for both
  // resolved and unresolved models (the latter fall back to the raw source
  // name). Querying by model_id alone would silently miss unresolved models.
  return readRows<Row>(
    `SELECT ${CELL_JOIN_COLUMNS}
     FROM eval_results_view r
     LEFT JOIN evals_view e ON r.evaluation_id = e.evaluation_id
     WHERE r.model_key = ?
       AND r.score IS NOT NULL
     ORDER BY r.category, r.percentile DESC NULLS LAST`,
    [modelKey]
  )
}

export async function getModelCards(): Promise<EvaluationCardData[]> {
  return readRows<EvaluationCardData>(
    `SELECT ${MODEL_CARD_COLUMNS}
     FROM models_view
     ORDER BY latest_timestamp DESC NULLS LAST`
  )
}

export async function getModelCardsLite(): Promise<EvaluationCardData[]> {
  return readRows<EvaluationCardData>(
    `SELECT ${MODEL_CARD_COLUMNS}
     FROM models_view
     ORDER BY benchmarks_count DESC NULLS LAST, evaluations_count DESC NULLS LAST, model_name ASC`
  )
}

export async function getEvalListData(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
}> {
  const [evals, countRows] = await Promise.all([
    readRows<BenchmarkEvalListItem>(
      `SELECT ${EVAL_LIST_COLUMNS}
       FROM evals_view
       ORDER BY evaluation_name ASC`
    ),
    readRows<{ n: number }>("SELECT COUNT(*) AS n FROM models_view"),
  ])

  return {
    evals,
    totalModels: asNumber(countRows[0]?.n),
  }
}

export async function getEvalListLiteData(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
}> {
  return getEvalListData()
}

export async function getEvalList() {
  const { evals } = await getEvalListData()
  return evals
}

export async function getDashboardData() {
  const [models, evals] = await Promise.all([
    getModelCards(),
    getEvalList(),
  ])
  return { models, evals }
}

export async function getModelSummaryById(routeId: string): Promise<ModelEvaluationSummary | null> {
  // Lookups use the addressable identifier (`model_key`/`route_id`/
  // `model_route_id`/`model_family_id`) so unresolved models — whose
  // `model_id` is NULL — are still findable. `model_id` is kept in the
  // OR chain as a back-compat fallback for old links.
  //
  // Three slug shapes flow into this route handler:
  //   - URL-encoded form (canonical, e.g. `google%2Fgemini-3-pro`) —
  //     Next.js already decodes path params before they reach here, so
  //     `routeId` lands as `google/gemini-3-pro`.
  //   - Plain canonical id with `/` (same shape after Next.js decode).
  //   - Legacy `__`-separated form (e.g. `google__gemini-3-pro`) — old
  //     `getModelFamilyRouteId` emitted this; bookmarks may still use
  //     it. Convert `__` → `/` for lookup.
  const dunder = routeId.includes("__") ? routeId.replace(/__/g, "/") : routeId
  const rows = await readRows<Row>(
    `SELECT *
     FROM models_view
     WHERE model_key = ? OR route_id = ? OR model_route_id = ? OR model_family_id = ? OR model_id = ?
        OR model_key = ? OR model_id = ?
     LIMIT 1`,
    [routeId, routeId, routeId, routeId, routeId, dunder, dunder]
  )
  const modelRow = rows[0]
  if (!modelRow) return null

  const cellRows = await getModelEvaluationRows(asString(modelRow.model_key ?? modelRow.model_id, routeId))
  return modelSummaryFromRows(modelRow, cellRows)
}

// Build-time precomputed multi-metric / per-slice matrix produced by
// `scripts/build-eval-matrices.mjs`. Read once on first request and
// cached in module scope — the file is image-baked so this is a single
// disk read per server start. When the file is missing (local dev where
// nobody ran `pnpm build-eval-matrices` yet), we fall through and the
// summary degrades to single-metric exactly like before.
type MatrixEntry = {
  leaderboard_rows: Array<{ model_route_id: string; values: Record<string, number | null> }>
  subtask_metrics: Array<Record<string, unknown>>
}

let evalMatrixCache: Record<string, MatrixEntry> | null | undefined
function loadEvalMatrices(): Record<string, MatrixEntry> | null {
  if (evalMatrixCache !== undefined) return evalMatrixCache
  try {
    const matrixPath = path.join(process.cwd(), "data", "eval-matrices.json")
    const text = fs.readFileSync(matrixPath, "utf8")
    const parsed = JSON.parse(text) as { evals?: Record<string, MatrixEntry> }
    evalMatrixCache = parsed.evals ?? {}
  } catch {
    evalMatrixCache = null
  }
  return evalMatrixCache
}

export async function getEvalSummaryById(evalId: string): Promise<BenchmarkEvalSummary | null> {
  // Use the same aliased projection as EVAL_LIST_COLUMNS so the legacy
  // `composite_benchmark_*` / `benchmark_family_*` consumer fields are
  // populated. A bare `SELECT *` returns the raw v2 column names which
  // leaves the legacy fields NULL on the deserialised summary.
  const evalRows = await readRows<Row>(
    `SELECT ${EVAL_LIST_COLUMNS}
     FROM evals_view
     WHERE evaluation_id = ?
     LIMIT 1`,
    [evalId]
  )
  const evalRow = evalRows[0]
  if (!evalRow) return null

  let cellRows = await readRows<Row>(
    `SELECT ${CELL_JOIN_COLUMNS}
     FROM eval_results_view r
     LEFT JOIN evals_view e ON r.evaluation_id = e.evaluation_id
     WHERE r.evaluation_id = ?
       AND r.metric_id = (SELECT primary_metric_id FROM evals_view WHERE evaluation_id = ?)
       AND r.score IS NOT NULL
     ORDER BY r.position ASC NULLS LAST`,
    [evalId, evalId]
  )

  if (cellRows.length === 0) {
    cellRows = await readRows<Row>(
      `SELECT ${CELL_JOIN_COLUMNS}
       FROM eval_results_view r
       LEFT JOIN evals_view e ON r.evaluation_id = e.evaluation_id
       WHERE r.evaluation_id = ?
         AND r.score IS NOT NULL
       ORDER BY r.position ASC NULLS LAST`,
      [evalId]
    )
  }

  const summary = {
    ...evalRow,
    model_results: cellRows.map(reshapeCellToModelResult),
  } as BenchmarkEvalSummary

  // Splice in precomputed multi-metric leaderboard_rows and subtask
  // leaderboard_metrics from data/eval-matrices.json. Models in the matrix
  // but not in cellRows (zero-coverage primary metric) are also surfaced
  // so a user can still see per-slice or non-primary scores. The base row
  // shape comes from any matching cellRow when one exists.
  const matrices = loadEvalMatrices()
  const matrix = matrices?.[evalId]
  if (matrix) {
    const baseRowByRoute = new Map<string, ModelResultForBenchmark>()
    for (const result of summary.model_results) {
      if (result.model_route_id) {
        baseRowByRoute.set(result.model_route_id, result)
      }
    }

    const leaderboardRows = matrix.leaderboard_rows
      .map((row) => {
        const base = baseRowByRoute.get(row.model_route_id)
        if (!base) return null
        return {
          model_info: base.model_info,
          model_route_id: row.model_route_id,
          evaluation_timestamp: base.evaluation_timestamp,
          source_metadata: base.source_metadata,
          source_data: base.source_data,
          values: row.values,
          metrics_present: Object.values(row.values).filter(
            (v): v is number => typeof v === "number" && Number.isFinite(v),
          ).length,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    if (leaderboardRows.length > 0) {
      summary.leaderboard_rows = dedupeLeaderboardRowsByModelIdentity(leaderboardRows)
    }
    if (matrix.subtask_metrics.length > 0) {
      const existing = (summary.leaderboard_metrics ?? []) as Array<{ column_key: string }>
      const seen = new Set(existing.map((m) => m.column_key))
      const merged = [
        ...existing,
        ...matrix.subtask_metrics.filter(
          (m): m is typeof m & { column_key: string } =>
            typeof m.column_key === "string" && !seen.has(m.column_key),
        ),
      ]
      summary.leaderboard_metrics =
        merged as unknown as BenchmarkEvalSummary["leaderboard_metrics"]
    }
  }

  // Fallback for single-metric leaderboards with no precomputed matrix
  // entry (e.g. big-bench-hard): the matrix block above only populates
  // `leaderboard_rows` when a matrix exists, but consumers like the
  // embed leaderboard read exclusively from that field. Synthesize one
  // row per `model_results` entry using the primary metric's column_key
  // as the values key, so the data is present regardless of whether
  // build-time precomputation ran for this eval.
  const hasRows = (summary.leaderboard_rows?.length ?? 0) > 0
  if (!hasRows && (summary.model_results?.length ?? 0) > 0) {
    const primaryMetric = (summary.leaderboard_metrics ?? []).find(
      (m): m is typeof m & { column_key: string } =>
        typeof (m as { column_key?: unknown }).column_key === "string"
        && (m as { scope?: string }).scope !== "subtask",
    )
    const columnKey = primaryMetric?.column_key
      ?? (summary.leaderboard_metrics ?? [])[0]?.column_key
      ?? "score"
    summary.leaderboard_rows = summary.model_results
      .filter((mr) => Number.isFinite(mr.score) && mr.model_route_id)
      .map((mr) => ({
        model_info: mr.model_info,
        model_route_id: mr.model_route_id,
        evaluation_timestamp: mr.evaluation_timestamp,
        source_metadata: mr.source_metadata,
        source_data: mr.source_data,
        values: { [columnKey]: mr.score as number },
        metrics_present: 1,
      })) as BenchmarkEvalSummary["leaderboard_rows"]
  }

  // Belt-and-suspenders: when leaderboard_rows arrived from the parquet
  // pre-baked (no matrix) the same two-source duplication can appear, so
  // dedup whatever is set on the summary before returning.
  if (summary.leaderboard_rows && summary.leaderboard_rows.length > 1) {
    summary.leaderboard_rows = dedupeLeaderboardRowsByModelIdentity(summary.leaderboard_rows)
  }

  return summary
}

export async function getDeveloperList(): Promise<DeveloperListEntry[]> {
  const headline = await fetchHeadline()
  return [...(headline.developers ?? [])].sort((a, b) => a.developer.localeCompare(b.developer))
}

export async function getDeveloperSummaryById(routeId: string) {
  const developers = await getDeveloperList()
  const developer = developers.find((entry) => entry.route_id === routeId)
  if (!developer) return null

  const models = await readRows<EvaluationCardData>(
    `SELECT ${MODEL_CARD_COLUMNS}
     FROM models_view
     WHERE developer = ?
     ORDER BY benchmarks_count DESC NULLS LAST, evaluations_count DESC NULLS LAST, model_name ASC`,
    [developer.developer]
  )

  return {
    ...developer,
    models,
  }
}

export async function getBenchmarkMetadataMap(): Promise<Record<string, BenchmarkCard>> {
  const rows = await readRows<Row>(
    `SELECT evaluation_id, evaluation_name,
            family_id AS composite_benchmark_key,
            benchmark_id,
            benchmark_card
     FROM evals_view
     WHERE benchmark_card IS NOT NULL`
  )
  const result: Record<string, BenchmarkCard> = {}

  for (const row of rows) {
    const card = row.benchmark_card as BenchmarkCard | null | undefined
    if (!card) continue

    const keys = [
      row.evaluation_id,
      row.evaluation_name,
      row.composite_benchmark_key,
      row.benchmark_id,
      card.benchmark_details?.name,
    ].filter((key): key is string => typeof key === "string" && key.length > 0)

    for (const key of keys) {
      result[key] = card
    }
  }

  return result
}
