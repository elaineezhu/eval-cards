import "server-only"

import { promises as fs } from "fs"
import path from "path"

import type { BackendManifest, ComparisonIndex, EvalHierarchy } from "@/lib/backend-artifacts"
import type {
  BenchmarkCard,
  BenchmarkEvaluation,
  CategoryType,
  EvaluationResult,
  MetricConfig,
  ModelInfo,
  SampleResult,
  SourceData,
  SourceMetadata,
} from "@/lib/benchmark-schema"
import { inferCategoryFromBenchmark } from "@/lib/benchmark-schema"
import { getCanonicalModelIdentity, getModelFamilyRouteId } from "@/lib/model-family"

// ---------------------------------------------------------------------------
// HuggingFace dataset base URL
// ---------------------------------------------------------------------------

const HF_DATASET = "evaleval/card_backend"
const HF_BASE = `https://huggingface.co/datasets/${HF_DATASET}/resolve/main`

// ---------------------------------------------------------------------------
// Local disk cache (populated by scripts/cache-hf-data.mjs during build)
// ---------------------------------------------------------------------------

const LOCAL_CACHE_DIR = path.join(process.cwd(), ".cache", "hf-data")

async function readLocalCache<T>(relativePath: string): Promise<T | null> {
  try {
    const filePath = path.join(LOCAL_CACHE_DIR, relativePath)
    const text = await fs.readFile(filePath, "utf8")
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// In-memory cache (always active to avoid HF rate limits)
// ---------------------------------------------------------------------------

const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL_MS =
  process.env.NODE_ENV === "production"
    ? 10 * 60 * 1000  // 10 min in prod
    : 2 * 60 * 1000   // 2 min in dev

function isCanonicalCacheShape(relativePath: string, data: unknown) {
  if (!data || typeof data !== "object") {
    return false
  }

  const record = data as Record<string, unknown>

  if (relativePath.startsWith("models/")) {
    return record.hierarchy_by_category != null
  }

  if (relativePath.startsWith("evals/")) {
    return Array.isArray(record.metrics)
  }

  if (relativePath === "eval-list.json") {
    const evals = Array.isArray(record.evals) ? (record.evals as Array<Record<string, unknown>>) : []
    return evals.length === 0 || typeof evals[0]?.benchmark_family_key === "string"
  }

  if (relativePath === "comparison-index.json") {
    return record.evals != null && record.by_model != null
  }

  return true
}

async function fetchHFJson<T>(relativePath: string): Promise<T> {
  // 1. In-memory cache (hot)
  const hit = cache.get(relativePath)
  const validHotCache = hit ? isCanonicalCacheShape(relativePath, hit.data) : false
  if (hit && !validHotCache) {
    cache.delete(relativePath)
  }
  if (hit && validHotCache && Date.now() - hit.ts < CACHE_TTL_MS) {
    return hit.data as T
  }

  // 2. Local disk cache (warm — populated at build time)
  const local = await readLocalCache<T>(relativePath)
  if (local !== null && isCanonicalCacheShape(relativePath, local)) {
    cache.set(relativePath, { data: local, ts: Date.now() })
    return local
  }

  // 3. Fetch from HF with retry for 429 rate limits
  const url = `${HF_BASE}/${relativePath}`
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (res.status === 429) {
        lastError = new Error(`HF rate limited (429) for ${url}`)
        continue
      }
      if (!res.ok) {
        throw new Error(`HF fetch failed: ${res.status} ${res.statusText} for ${url}`)
      }
      const data = (await res.json()) as T
      cache.set(relativePath, { data, ts: Date.now() })
      return data
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (!String(err).includes("429")) throw err
    }
  }

  // 4. Fall back to stale in-memory cache if all else fails
  if (hit && validHotCache) {
    console.warn(`[hf-data] Using stale cache for ${relativePath} after rate limit`)
    return hit.data as T
  }

  throw lastError ?? new Error(`HF fetch failed for ${url}`)
}

async function fetchHFJsonSafe<T>(relativePath: string): Promise<T | null> {
  try {
    return await fetchHFJson<T>(relativePath)
  } catch (err) {
    if (!String(err).includes("404")) {
      console.warn(`[hf-data] Failed to fetch ${relativePath}:`, err)
    }
    return null
  }
}

// ---------------------------------------------------------------------------
// HF dataset types (shapes of JSON files in the HF repo)
// ---------------------------------------------------------------------------

export interface HFModelCardEntry {
  model_family_id: string
  model_route_id: string
  model_family_name: string
  developer: string
  params_billions?: number | string | null
  total_evaluations: number
  benchmark_count: number
  benchmark_family_count: number
  categories_covered: string[]
  last_updated: string
  variants: Array<{
    variant_key: string
    variant_label: string
    evaluation_count: number
    raw_model_ids: string[]
    last_updated?: string
  }>
  score_summary: {
    count: number
    min: number
    max: number
    avg?: number
    average?: number
  }
  benchmark_names?: string[]
  top_benchmark_scores?: Array<{
    benchmark: string
    benchmarkKey?: string
    evaluation_name?: string
    score: number
    metric: string
    lower_is_better?: boolean
  }>
}

export interface HFEvalListEntry {
  eval_summary_id: string
  benchmark: string
  canonical_display_name?: string
  benchmark_family_key: string
  benchmark_family_name: string
  benchmark_parent_key: string
  benchmark_parent_name?: string
  benchmark_leaf_key: string
  benchmark_leaf_name: string
  benchmark_component_key?: string | null
  benchmark_component_name?: string | null
  evaluation_name?: string
  display_name: string
  is_summary_score?: boolean
  summary_score_for?: string | null
  summary_score_for_name?: string | null
  summary_eval_ids?: string[]
  category: string
  tags: {
    domains: string[]
    languages: string[]
    tasks: string[]
  }
  models_count: number
  metrics_count: number
  subtasks_count?: number
  metric_names: string[]
  primary_metric_name: string
  benchmark_card: BenchmarkCard | null
  source_data?: SourceData
  top_score: number
  instance_data: {
    available: boolean
    url_count: number
    sample_urls: string[]
    models_with_loaded_instances: number
  }
  metrics: Array<{
    metric_summary_id: string
    metric_name: string
    lower_is_better: boolean
    models_count: number
    top_score: number
  }>
}

export interface HFEvalModelResult {
  model_id: string
  model_route_id: string
  model_name: string
  developer: string
  raw_model_id?: string
  score: number
  evaluation_id?: string
  retrieved_timestamp?: string
  source_record_url?: string
  detailed_evaluation_results?: string | null
  detailed_evaluation_results_meta?: unknown
  instance_level_data?: unknown
  passthrough_top_level_fields?: unknown
}

export interface HFEvalMetric {
  metric_summary_id: string
  legacy_eval_summary_id?: string
  evaluation_name?: string
  metric_name: string
  metric_key: string
  display_name?: string
  canonical_display_name?: string
  metric_config?: MetricConfig | Record<string, unknown>
  lower_is_better: boolean
  model_results: HFEvalModelResult[]
}

export interface HFEvalDetail {
  eval_summary_id: string
  benchmark: string
  canonical_display_name?: string
  benchmark_family_key: string
  benchmark_leaf_key: string
  benchmark_leaf_name: string
  benchmark_parent_key?: string
  benchmark_parent_name?: string
  source_data: SourceData
  benchmark_card: BenchmarkCard | null
  metrics: HFEvalMetric[]
  subtasks: unknown[]
}

export interface HFModelDetail {
  model_info: ModelInfo & {
    family_id?: string
    family_slug?: string
    variant_key?: string
    variant_label?: string
    model_route_id?: string
  }
  model_family_id: string
  model_route_id: string
  model_family_name?: string
  raw_model_ids?: string[]
  last_updated?: string
  hierarchy_by_category: Record<string, HFModelHierarchyNode[]>
  evaluations_by_category?: Record<string, HFModelEvaluation[]>
  total_evaluations: number
  categories_covered: string[]
  variants: Array<{
    variant_key: string
    variant_label: string
    evaluation_count: number
    raw_model_ids: string[]
  }>
}

/** Evaluation entry inside an HF model detail file */
export interface HFModelEvaluation {
  schema_version?: string
  evaluation_id: string
  retrieved_timestamp: string
  benchmark?: string
  source_data?: SourceData | string[]
  source_metadata?: SourceMetadata
  eval_library?: { name: string; version?: string; additional_details?: Record<string, unknown> }
  model_info?: ModelInfo
  generation_config?: BenchmarkEvaluation["generation_config"]
  evaluation_results: EvaluationResult[]
  source_record_url?: string
  detailed_evaluation_results?: string | null
  detailed_evaluation_results_meta?: unknown
  instance_level_data?: unknown
  benchmark_card?: BenchmarkCard | null
  passthrough_top_level_fields?: unknown
}

export interface HFModelHierarchyMetric {
  metric_summary_id: string
  legacy_eval_summary_id?: string
  evaluation_name: string
  display_name: string
  canonical_display_name?: string
  benchmark_leaf_key: string
  benchmark_leaf_name: string
  slice_key?: string | null
  slice_name?: string | null
  lower_is_better: boolean
  metric_name: string
  metric_id: string
  metric_key: string
  metric_source?: string
  metric_config: MetricConfig
  models_count: number
  top_score?: number
  model_results: HFEvalModelResult[]
}

export interface HFModelHierarchyNode {
  eval_summary_id: string
  benchmark: string
  canonical_display_name?: string
  benchmark_family_key: string
  benchmark_family_name: string
  benchmark_parent_key: string
  benchmark_parent_name: string
  benchmark_leaf_key: string
  benchmark_leaf_name: string
  benchmark_component_key?: string | null
  benchmark_component_name?: string | null
  evaluation_name: string
  display_name: string
  is_summary_score: boolean
  category: string
  source_data: SourceData
  benchmark_card: BenchmarkCard | null
  tags: {
    domains: string[]
    languages: string[]
    tasks: string[]
  }
  subtasks_count: number
  metrics_count: number
  metric_names: string[]
  primary_metric_name: string
  metrics: HFModelHierarchyMetric[]
  subtasks: HFModelHierarchyNode[]
  top_score?: number
  summary_eval_ids?: string[]
  instance_data?: {
    available: boolean
    url_count: number
    sample_urls: string[]
    models_with_loaded_instances: number
  }
}

type HFModelHierarchySubtask = Partial<Omit<HFModelHierarchyNode, "subtasks">> & {
  subtask_key?: string
  subtask_name?: string
  canonical_display_name?: string
  metrics?: HFModelHierarchyMetric[]
  subtasks?: HFModelHierarchySubtask[]
}

export interface HFDeveloperEntry {
  developer: string
  model_count: number
}

export interface HFDeveloperDetail {
  developer: string
  models: HFModelCardEntry[]
}

function normalizeSetupAliasQualifier(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[_\s]+/g, "-") ?? ""
}

function isSetupAliasQualifier(value: string | null | undefined) {
  const normalized = normalizeSetupAliasQualifier(value)
  return (
    normalized === "prompt" ||
    normalized === "fc" ||
    normalized === "function-calling" ||
    normalized.startsWith("thinking")
  )
}

function getLatestTimestamp(a?: string, b?: string) {
  if (!a) return b
  if (!b) return a

  const aTime = new Date(a).getTime()
  const bTime = new Date(b).getTime()

  if (!Number.isFinite(aTime)) return b
  if (!Number.isFinite(bTime)) return a
  return bTime > aTime ? b : a
}

function sortNormalizedModelCardVariants(a: HFModelCardEntry["variants"][number], b: HFModelCardEntry["variants"][number]) {
  const aIsDefault = a.variant_key === "default"
  const bIsDefault = b.variant_key === "default"
  if (aIsDefault !== bIsDefault) {
    return aIsDefault ? -1 : 1
  }

  const aTime = a.last_updated ? new Date(a.last_updated).getTime() : Number.NEGATIVE_INFINITY
  const bTime = b.last_updated ? new Date(b.last_updated).getTime() : Number.NEGATIVE_INFINITY
  if (aTime !== bTime) {
    return bTime - aTime
  }

  return a.variant_label.localeCompare(b.variant_label)
}

function normalizeSingleModelCardEntry(entry: HFModelCardEntry): HFModelCardEntry {
  const familyIdentity = getCanonicalModelIdentity({
    id: entry.model_family_id,
    name: entry.model_family_name,
  })

  const variantsByKey = new Map<string, HFModelCardEntry["variants"][number]>()

  for (const variant of entry.variants ?? []) {
    let normalizedVariantKey = variant.variant_key
    let normalizedVariantLabel = variant.variant_label

    if (variant.variant_key === "base") {
      normalizedVariantKey = "default"
      normalizedVariantLabel = "Default"
    } else if (variant.variant_key !== "default") {
      const syntheticIdentity = getCanonicalModelIdentity({
        id: `${familyIdentity.familyId}-${variant.variant_key}`,
        name: `${familyIdentity.familyId}-${variant.variant_key}`,
      })

      if (syntheticIdentity.versionDate && isSetupAliasQualifier(syntheticIdentity.versionQualifier)) {
        normalizedVariantKey = syntheticIdentity.versionDate
        normalizedVariantLabel = syntheticIdentity.versionDate
      } else {
        normalizedVariantKey = syntheticIdentity.variantKey
        normalizedVariantLabel = syntheticIdentity.variantLabel
      }
    }

    const existing = variantsByKey.get(normalizedVariantKey)
    if (existing) {
      existing.evaluation_count += variant.evaluation_count
      existing.last_updated = getLatestTimestamp(existing.last_updated, variant.last_updated)
      existing.raw_model_ids = Array.from(
        new Set([...(existing.raw_model_ids ?? []), ...(variant.raw_model_ids ?? [])])
      ).sort((a, b) => a.localeCompare(b))
      continue
    }

    variantsByKey.set(normalizedVariantKey, {
      ...variant,
      variant_key: normalizedVariantKey,
      variant_label: normalizedVariantLabel,
      raw_model_ids: [...(variant.raw_model_ids ?? [])].sort((a, b) => a.localeCompare(b)),
    })
  }

  const normalizedVariants = Array.from(variantsByKey.values()).sort(sortNormalizedModelCardVariants)
  const normalizedTotalEvaluations =
    normalizedVariants.length > 0
      ? normalizedVariants.reduce((sum, variant) => sum + variant.evaluation_count, 0)
      : entry.total_evaluations

  return {
    ...entry,
    model_family_id: familyIdentity.familyId,
    model_route_id: getModelFamilyRouteId(familyIdentity.familyId),
    model_family_name: familyIdentity.familyName,
    total_evaluations: normalizedTotalEvaluations,
    variants: normalizedVariants,
  }
}

function normalizeModelCardEntries(entries: HFModelCardEntry[]) {
  return entries.map(normalizeSingleModelCardEntry)
}

// ---------------------------------------------------------------------------
// Public data fetchers
// ---------------------------------------------------------------------------

export async function fetchModelCardsList(): Promise<HFModelCardEntry[]> {
  const data = await fetchHFJson<HFModelCardEntry[]>("model-cards.json")
  return Array.isArray(data) ? normalizeModelCardEntries(data) : []
}

export async function fetchModelCardsListLite(): Promise<HFModelCardEntry[]> {
  const data = await fetchHFJsonSafe<HFModelCardEntry[]>("model-cards-lite.json")
  if (Array.isArray(data)) {
    return normalizeModelCardEntries(data)
  }

  return fetchModelCardsList()
}

export async function fetchEvalList(): Promise<{ evals: HFEvalListEntry[] }> {
  return fetchHFJson<{ evals: HFEvalListEntry[] }>("eval-list.json")
}

export async function fetchEvalListLite(): Promise<{ evals: HFEvalListEntry[] }> {
  const data = await fetchHFJsonSafe<{ evals: HFEvalListEntry[] }>("eval-list-lite.json")
  if (data && Array.isArray(data.evals)) {
    return data
  }

  return fetchEvalList()
}

export async function fetchDevelopersList(): Promise<HFDeveloperEntry[]> {
  const data = await fetchHFJson<HFDeveloperEntry[]>("developers.json")
  return Array.isArray(data) ? data : []
}

export async function fetchBenchmarkMetadataMap(): Promise<Record<string, BenchmarkCard>> {
  return fetchHFJson<Record<string, BenchmarkCard>>("benchmark-metadata.json")
}

export async function fetchBackendManifest(): Promise<BackendManifest> {
  return fetchHFJson<BackendManifest>("manifest.json")
}

export async function fetchEvalHierarchy(): Promise<EvalHierarchy> {
  return fetchHFJson<EvalHierarchy>("eval-hierarchy.json")
}

export async function fetchComparisonIndex(): Promise<ComparisonIndex> {
  return fetchHFJson<ComparisonIndex>("comparison-index.json")
}

export async function fetchModelDetail(slug: string): Promise<HFModelDetail | null> {
  return fetchHFJsonSafe<HFModelDetail>(`models/${slug}.json`)
}

export async function fetchEvalDetail(slug: string): Promise<HFEvalDetail | null> {
  return fetchHFJsonSafe<HFEvalDetail>(`evals/${slug}.json`)
}

export async function fetchDeveloperDetail(slug: string): Promise<HFDeveloperDetail | null> {
  return fetchHFJsonSafe<HFDeveloperDetail>(`developers/${slug}.json`)
}

// ---------------------------------------------------------------------------
// Instance-level data fetching
// ---------------------------------------------------------------------------

/**
 * Fetches instance-level sample data from a JSONL URL.
 * Returns up to `limit` samples. If limit is 0 or undefined, returns all.
 */
export async function fetchInstanceLevelData(
  url: string,
  limit?: number
): Promise<SampleResult[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []

    const text = await res.text()
    const lines = text.split("\n").filter((line) => line.trim())
    const maxLines = limit && limit > 0 ? Math.min(limit, lines.length) : lines.length
    const parsed: unknown[] = []

    for (let i = 0; i < maxLines; i++) {
      try {
        parsed.push(JSON.parse(lines[i]))
      } catch {
        // skip malformed line
      }
    }

    // Reuse the same parser that handles the rich instance_examples format
    return parseInstanceLevelData({ instance_examples: parsed })
  } catch (err) {
    console.warn("[hf-data] Failed to fetch instance-level data:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Converters: HF shapes → app domain types
// ---------------------------------------------------------------------------

/**
 * Parse instance_level_data from HF into SampleResult[].
 *
 * HF shape is an object:
 *   { interaction_type, instance_count, source_url, instance_examples: [...] }
 *
 * Each instance_example has: sample_id, input ({raw, reference}), output,
 * messages (multi-turn), evaluation ({score, is_correct}), metadata, etc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInstanceLevelData(data: unknown): SampleResult[] {
  if (!data || typeof data !== "object") return []

  // Extract the examples array — it lives under instance_examples
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = data as Record<string, any>
  const examples: unknown[] = Array.isArray(obj.instance_examples)
    ? obj.instance_examples
    : Array.isArray(data)
      ? data
      : []

  if (examples.length === 0) return []

  return examples
    .map((raw: any, i: number) => {
      if (!raw || typeof raw !== "object") return null

      // Build a readable input string from the instance data
      let input = ""
      if (typeof raw.input === "string") {
        input = raw.input
      } else if (raw.input?.raw) {
        input = String(raw.input.raw)
      } else if (raw.prompt) {
        input = raw.prompt
      } else if (raw.question) {
        input = raw.question
      } else if (raw.doc?.question) {
        input = raw.doc.question
      } else if (raw.doc) {
        input = JSON.stringify(raw.doc).slice(0, 500)
      }

      // Build a ground truth string
      let groundTruth: string | undefined
      if (raw.input?.reference) {
        groundTruth = Array.isArray(raw.input.reference)
          ? raw.input.reference.join(", ")
          : String(raw.input.reference)
      } else if (raw.ground_truth != null) {
        groundTruth = String(raw.ground_truth)
      } else if (raw.target != null) {
        groundTruth = String(raw.target)
      } else if (raw.gold != null) {
        groundTruth = String(raw.gold)
      } else if (raw.doc?.answer != null) {
        groundTruth = String(raw.doc.answer)
      }

      // Build a response string from output, messages, or answer_attribution
      let response = ""
      if (raw.output != null) {
        response = typeof raw.output === "string" ? raw.output : JSON.stringify(raw.output)
      } else if (raw.response) {
        response = raw.response
      } else if (raw.model_output) {
        response = raw.model_output
      } else if (Array.isArray(raw.answer_attribution) && raw.answer_attribution.length > 0) {
        const attr = raw.answer_attribution[raw.answer_attribution.length - 1]
        response = attr.extracted_value ?? ""
      } else if (Array.isArray(raw.messages) && raw.messages.length > 0) {
        // Use the last assistant message as the response
        const lastAssistant = [...raw.messages]
          .reverse()
          .find((m: any) => m.role === "assistant")
        if (lastAssistant) {
          response = typeof lastAssistant.content === "string"
            ? lastAssistant.content
            : JSON.stringify(lastAssistant.content)
        }
      } else if (raw.filtered_resps?.[0]?.[0]) {
        response = raw.filtered_resps[0][0]
      } else if (raw.resps?.[0]?.[0]) {
        response = raw.resps[0][0]
      }

      // Determine correctness
      const isCorrect =
        raw.evaluation?.is_correct ??
        raw.is_correct ??
        (raw.metrics?.exact_match === 1 ? true :
         raw.metrics?.exact_match === 0 ? false : undefined)

      // Build metadata combining evaluation results and any extra metadata
      const metadata: Record<string, any> = {}
      if (raw.evaluation && typeof raw.evaluation === "object") {
        Object.assign(metadata, raw.evaluation)
      }
      if (raw.performance && typeof raw.performance === "object") {
        Object.assign(metadata, raw.performance)
      }
      if (raw.metadata && typeof raw.metadata === "object") {
        Object.assign(metadata, raw.metadata)
      }
      if (raw.metrics && typeof raw.metrics === "object") {
        Object.assign(metadata, raw.metrics)
      }

      return {
        sample_id: raw.sample_id ?? raw.doc_id ?? raw.id ?? String(i),
        input,
        ground_truth: groundTruth,
        response,
        choices: raw.choices ?? raw.doc?.choices ?? undefined,
        is_correct: isCorrect,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      } as SampleResult
    })
    .filter((s): s is SampleResult => s !== null)
}

function normalizeModelIdForLookup(value: string | undefined | null) {
  return value?.trim().toLowerCase() ?? ""
}

function toComparableTimestamp(timestamp: string | undefined) {
  if (!timestamp) {
    return Number.NEGATIVE_INFINITY
  }

  const numericTimestamp = Number.parseFloat(timestamp)
  if (Number.isFinite(numericTimestamp)) {
    return numericTimestamp
  }

  const parsedTimestamp = new Date(timestamp).getTime()
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Number.NEGATIVE_INFINITY
}

function getCanonicalSourceMetadata(
  sourceData: SourceData | undefined,
  fallback: { displayName?: string; benchmarkFamilyName?: string }
): SourceMetadata {
  const sourceName = sourceData?.hf_repo ?? sourceData?.dataset_name ?? fallback.displayName
  const sourceOrganizationName =
    sourceData?.hf_repo?.split("/")[0] ?? sourceData?.dataset_name ?? fallback.benchmarkFamilyName

  return {
    source_name: sourceName,
    source_type: sourceData?.source_type === "url" ? "leaderboard" : "evaluation_run",
    source_organization_name: sourceOrganizationName ?? "Unknown",
    source_organization_url: sourceData?.url?.[0],
    evaluator_relationship: "other",
  }
}

function buildVariantLookup(detail: HFModelDetail) {
  const variantLookup = new Map<string, { variantKey: string; variantLabel: string }>()

  for (const variant of detail.variants ?? []) {
    for (const rawModelId of variant.raw_model_ids ?? []) {
      const normalized = normalizeModelIdForLookup(rawModelId)
      if (normalized) {
        variantLookup.set(normalized, {
          variantKey: variant.variant_key,
          variantLabel: variant.variant_label,
        })
      }
    }
  }

  return variantLookup
}

function resolveVariantMeta(
  detail: HFModelDetail,
  variantLookup: Map<string, { variantKey: string; variantLabel: string }>,
  result: HFEvalModelResult
) {
  const candidates = [result.raw_model_id, result.model_id]
    .map((value) => normalizeModelIdForLookup(value))
    .filter(Boolean)

  for (const candidate of candidates) {
    const matched = variantLookup.get(candidate)
    if (matched) {
      return matched
    }
  }

  if ((detail.variants?.length ?? 0) === 1) {
    return {
      variantKey: detail.variants[0].variant_key,
      variantLabel: detail.variants[0].variant_label,
    }
  }

  return {
    variantKey: candidates[0] || detail.model_info.variant_key || "default",
    variantLabel: detail.model_info.variant_label || "Default",
  }
}

function belongsToModelFamily(
  detail: HFModelDetail,
  result: HFEvalModelResult,
  rawModelIds: Set<string>
) {
  const routeId = normalizeModelIdForLookup(result.model_route_id)
  if (routeId && routeId === normalizeModelIdForLookup(detail.model_route_id)) {
    return true
  }

  const rawModelId = normalizeModelIdForLookup(result.raw_model_id)
  if (rawModelId && rawModelIds.has(rawModelId)) {
    return true
  }

  const modelId = normalizeModelIdForLookup(result.model_id)
  if (modelId && rawModelIds.has(modelId)) {
    return true
  }

  return false
}

function buildModelInfoForVariant(
  detail: HFModelDetail,
  result: HFEvalModelResult,
  variantMeta: { variantKey: string; variantLabel: string }
): ModelInfo {
  const modelId = result.raw_model_id ?? result.model_id ?? detail.model_info.id
  const modelName = result.model_name || detail.model_family_name || detail.model_info.name
  const variantLabel = variantMeta.variantLabel && variantMeta.variantLabel !== "Default"
    ? variantMeta.variantLabel
    : undefined

  return {
    ...detail.model_info,
    id: modelId,
    name: modelName,
    developer: result.developer || detail.model_info.developer,
    model_version: variantLabel,
    additional_details: {
      ...detail.model_info.additional_details,
      raw_model_id: result.raw_model_id ?? result.model_id,
    },
  }
}

function getCanonicalInstanceResultsUrl(value: unknown) {
  if (typeof value !== "string") {
    return undefined
  }

  return value.includes("/datasets/evaleval/card_backend/") && value.includes("/instances/")
    ? value
    : undefined
}

function getNodeSubtaskKey(node: HFModelHierarchyNode | HFModelHierarchySubtask) {
  return "subtask_key" in node ? node.subtask_key : undefined
}

function getNodeSubtaskName(node: HFModelHierarchyNode | HFModelHierarchySubtask) {
  return "subtask_name" in node ? node.subtask_name : undefined
}

interface FlattenHierarchyContext {
  eval_summary_id?: string
  benchmark?: string
  display_name?: string
  canonical_display_name?: string
  sourceData: SourceData
  sourceMetadata: SourceMetadata
  benchmark_family_key?: string
  benchmark_family_name?: string
  benchmark_parent_key?: string
  benchmark_parent_name?: string
  benchmark_leaf_key?: string
  benchmark_leaf_name?: string
}

function buildFlattenHierarchyContext(
  node: HFModelHierarchyNode | HFModelHierarchySubtask,
  inheritedContext?: FlattenHierarchyContext
): FlattenHierarchyContext {
  const benchmark = node.benchmark ?? inheritedContext?.benchmark
  const benchmarkFamilyName = node.benchmark_family_name ?? inheritedContext?.benchmark_family_name
  const displayName =
    node.display_name ??
    getNodeSubtaskName(node) ??
    node.benchmark_leaf_name ??
    inheritedContext?.benchmark_leaf_name ??
    benchmarkFamilyName ??
    benchmark ??
    "Unknown Benchmark"
  const canonicalDisplayName =
    node.canonical_display_name ??
    inheritedContext?.canonical_display_name ??
    displayName
  const sourceData =
    node.source_data ??
    inheritedContext?.sourceData ?? {
      dataset_name: benchmark ?? displayName,
    }

  return {
    eval_summary_id: node.eval_summary_id ?? inheritedContext?.eval_summary_id,
    benchmark,
    display_name: displayName,
    canonical_display_name: canonicalDisplayName,
    sourceData,
    sourceMetadata: getCanonicalSourceMetadata(sourceData, {
      displayName,
      benchmarkFamilyName,
    }),
    benchmark_family_key: node.benchmark_family_key ?? inheritedContext?.benchmark_family_key,
    benchmark_family_name: benchmarkFamilyName,
    benchmark_parent_key: node.benchmark_parent_key ?? inheritedContext?.benchmark_parent_key,
    benchmark_parent_name: node.benchmark_parent_name ?? inheritedContext?.benchmark_parent_name,
    benchmark_leaf_key: node.benchmark_leaf_key ?? inheritedContext?.benchmark_leaf_key,
    benchmark_leaf_name: node.benchmark_leaf_name ?? inheritedContext?.benchmark_leaf_name,
  }
}

function flattenHierarchyNode(
  detail: HFModelDetail,
  node: HFModelHierarchyNode | HFModelHierarchySubtask,
  category: CategoryType,
  rawModelIds: Set<string>,
  variantLookup: Map<string, { variantKey: string; variantLabel: string }>,
  inheritedContext?: FlattenHierarchyContext
): BenchmarkEvaluation[] {
  const evaluations: BenchmarkEvaluation[] = []
  const context = buildFlattenHierarchyContext(node, inheritedContext)
  const sourceData = context.sourceData
  const sourceMetadata = context.sourceMetadata

  for (const metric of node.metrics ?? []) {
    const relevantResults = (metric.model_results ?? []).filter((result) =>
      belongsToModelFamily(detail, result, rawModelIds)
    )

    if (relevantResults.length === 0) {
      continue
    }

    const resultsByVariant = new Map<
      string,
      {
        modelInfo: ModelInfo
        evaluationResults: EvaluationResult[]
        inlineSamples?: SampleResult[]
        latestTimestamp: string
      }
    >()

    for (const result of relevantResults) {
      const variantMeta = resolveVariantMeta(detail, variantLookup, result)
      const variantKey = variantMeta.variantKey || "default"
      const modelInfo = buildModelInfoForVariant(detail, result, variantMeta)
      const inlineSamples = parseInstanceLevelData(result.instance_level_data)
      const evaluationResult: EvaluationResult = {
        evaluation_name: metric.metric_name || metric.evaluation_name || metric.display_name,
        display_name: metric.display_name || metric.metric_name || metric.evaluation_name,
        canonical_display_name:
          metric.canonical_display_name ||
          metric.display_name ||
          `${context.benchmark ?? context.display_name ?? "Benchmark"} / ${metric.metric_name}`,
        metric_summary_id: metric.metric_summary_id,
        metric_key: metric.metric_key,
        evaluation_timestamp: result.retrieved_timestamp ?? detail.last_updated ?? "",
        source_data: sourceData,
        metric_config: metric.metric_config,
        score_details: {
          score: result.score,
        },
        detailed_evaluation_results_url: getCanonicalInstanceResultsUrl(
          result.detailed_evaluation_results
        ),
      }

      const existing = resultsByVariant.get(variantKey)
      if (!existing) {
        resultsByVariant.set(variantKey, {
          modelInfo,
          evaluationResults: [evaluationResult],
          inlineSamples: inlineSamples.length > 0 ? inlineSamples : undefined,
          latestTimestamp: result.retrieved_timestamp ?? detail.last_updated ?? "",
        })
        continue
      }

      existing.evaluationResults.push(evaluationResult)
      if ((!existing.inlineSamples || existing.inlineSamples.length === 0) && inlineSamples.length > 0) {
        existing.inlineSamples = inlineSamples
      }
      if (
        toComparableTimestamp(result.retrieved_timestamp) >=
        toComparableTimestamp(existing.latestTimestamp)
      ) {
        existing.latestTimestamp = result.retrieved_timestamp ?? existing.latestTimestamp
      }
    }

    for (const [variantKey, variantGroup] of resultsByVariant.entries()) {
      const sliceKey = metric.slice_key ?? getNodeSubtaskKey(node) ?? undefined
      const sliceName = metric.slice_name ?? getNodeSubtaskName(node) ?? undefined

      evaluations.push({
        schema_version: "0.2.2",
        eval_summary_id: context.eval_summary_id,
        evaluation_id: `${metric.metric_summary_id}__${variantKey}`,
        retrieved_timestamp: variantGroup.latestTimestamp,
        benchmark: context.benchmark,
        display_name:
          node.display_name ??
          getNodeSubtaskName(node) ??
          metric.slice_name ??
          context.display_name ??
          context.benchmark_leaf_name ??
          context.benchmark,
        canonical_display_name:
          node.canonical_display_name ??
          (metric.slice_name && (context.benchmark_parent_name ?? context.benchmark)
            ? `${context.benchmark_parent_name ?? context.benchmark} / ${metric.slice_name}`
            : context.canonical_display_name ?? context.benchmark),
        category,
        benchmark_family_key: context.benchmark_family_key,
        benchmark_family_name: context.benchmark_family_name,
        benchmark_parent_key: context.benchmark_parent_key,
        benchmark_parent_name: context.benchmark_parent_name,
        benchmark_leaf_key: metric.benchmark_leaf_key ?? context.benchmark_leaf_key,
        benchmark_leaf_name: metric.benchmark_leaf_name ?? context.benchmark_leaf_name,
        slice_key: sliceKey,
        slice_name: sliceName,
        source_data: sourceData,
        source_metadata: sourceMetadata,
        model_info: variantGroup.modelInfo,
        evaluation_results: variantGroup.evaluationResults,
        detailed_evaluation_results_per_samples:
          variantGroup.inlineSamples && variantGroup.inlineSamples.length > 0
            ? variantGroup.inlineSamples
            : undefined,
      })
    }
  }

  for (const subtask of node.subtasks ?? []) {
    evaluations.push(
      ...flattenHierarchyNode(detail, subtask, category, rawModelIds, variantLookup, context)
    )
  }

  return evaluations
}

/**
 * Flatten hierarchy_by_category from an HF model detail file into BenchmarkEvaluation[]
 * while preserving backend-declared categories, grouping keys, and variant boundaries.
 */
export function flattenModelEvaluations(detail: HFModelDetail): BenchmarkEvaluation[] {
  const evaluations: BenchmarkEvaluation[] = []
  const rawModelIds = new Set(
    [
      ...(detail.raw_model_ids ?? []),
      ...((detail.variants ?? []).flatMap((variant) => variant.raw_model_ids ?? [])),
      detail.model_info.id,
      detail.model_family_id,
    ]
      .map((value) => normalizeModelIdForLookup(value))
      .filter(Boolean)
  )
  const variantLookup = buildVariantLookup(detail)

  for (const [categoryKey, nodes] of Object.entries(detail.hierarchy_by_category ?? {})) {
    const mappedCategory = mapHFCategories([categoryKey])[0]
    for (const node of nodes) {
      evaluations.push(...flattenHierarchyNode(detail, node, mappedCategory, rawModelIds, variantLookup))
    }
  }

  return evaluations
}

/**
 * Map pipeline category labels to frontend CategoryType.
 */
const PIPELINE_CATEGORY_MAP: Record<string, CategoryType> = {
  agentic: "Agentic",
  reasoning: "Reasoning",
  general: "General",
  safety: "Safety",
  knowledge: "Knowledge",
  other: "General",
}

export function mapHFCategories(categories: string[]): CategoryType[] {
  const mapped: CategoryType[] = []
  for (const c of categories) {
    if (!c) continue
    const cat = PIPELINE_CATEGORY_MAP[c.toLowerCase()] ?? inferCategoryFromBenchmark(c)
    if (!mapped.includes(cat)) mapped.push(cat)
  }
  return mapped.length > 0 ? mapped : ["General"]
}
