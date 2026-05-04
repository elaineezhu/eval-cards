import "server-only"

import { promises as fs } from "fs"
import path from "path"

import type {
  BackendManifest,
  BackendManifestStatus,
  ComparisonIndex,
  CorpusAggregates,
  EvalHierarchy,
  EvalcardsAnnotations,
  HierarchyBenchmark,
  HierarchyComposite,
  HierarchyFamily,
  HierarchyMetric,
  HierarchySlice,
  HierarchyTags,
  RowAnnotations,
  SignalSummaries,
} from "@/lib/backend-artifacts"
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
import { getCanonicalModelIdentity, getModelFamilyRouteId } from "@/lib/model-family"

// ---------------------------------------------------------------------------
// HuggingFace dataset base URL
// ---------------------------------------------------------------------------

const HF_DATASET = "evaleval/card_backend"
const HF_BASE = `https://huggingface.co/datasets/${HF_DATASET}/resolve/main`

// ---------------------------------------------------------------------------
// Local disk cache (populated by scripts/cache-hf-data.mjs during build)
// ---------------------------------------------------------------------------

// HF_DATA_LOCAL_DIR overrides the cache location so the JSON read path can be
// pointed at a sibling repo's pipeline output for parity testing against the
// DuckDB backend. Falls back to the cache populated by scripts/cache-hf-data.mjs.
const LOCAL_CACHE_DIR = process.env.HF_DATA_LOCAL_DIR?.trim()
  ? path.resolve(process.env.HF_DATA_LOCAL_DIR.trim())
  : path.join(process.cwd(), ".cache", "hf-data")

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

interface CacheEntry {
  data: unknown
  ts: number
  manifestSignature?: string
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS =
  process.env.HF_DATA_CACHE_TTL_MS != null
    ? Number.parseInt(process.env.HF_DATA_CACHE_TTL_MS, 10)
    : process.env.NODE_ENV === "production"
      ? 60 * 1000
      : 0
const MANIFEST_TTL_MS =
  process.env.HF_MANIFEST_CACHE_TTL_MS != null
    ? Number.parseInt(process.env.HF_MANIFEST_CACHE_TTL_MS, 10)
    : process.env.NODE_ENV === "production"
      ? 30 * 1000
      : 0

let manifestSnapshotCache:
  | {
      remote: BackendManifest | null
      local: BackendManifest | null
      ts: number
    }
  | null = null
let localManifestPromise: Promise<BackendManifest | null> | null = null
let manifestRefreshPromise: Promise<void> | null = null
let refreshTargetManifestSignature: string | null = null
let refreshTargetFailed = false
let activeManifestSignature: string | null = null
let activeManifest: BackendManifest | null = null
const backgroundRefreshes = new Map<string, Promise<void>>()
const observedPaths = new Set<string>()

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

function getManifestSignature(manifest: BackendManifest | null | undefined) {
  if (!manifest) {
    return null
  }

  return JSON.stringify({
    generated_at: manifest.generated_at,
    config_version: manifest.config_version,
    skipped_configs: [...manifest.skipped_configs].sort(),
  })
}

// HF_DATA_OFFLINE disables every network fetch, so the read path is fully
// served by LOCAL_CACHE_DIR. Used by the DuckDB parity setup so two servers
// reading the same on-disk artifacts cannot diverge mid-test via background
// refresh, and useful generally for offline development.
const OFFLINE = process.env.HF_DATA_OFFLINE === "1"
const DATA_BACKEND_VERSION = process.env.DATA_BACKEND?.trim().toLowerCase()

function useViewLayerBackend() {
  return DATA_BACKEND_VERSION === "v2" || DATA_BACKEND_VERSION === "stage-j"
}

async function fetchSnapshotSidecars() {
  return import("@/lib/sidecars")
}

async function fetchRemoteJson<T>(relativePath: string): Promise<T> {
  if (OFFLINE) {
    throw new Error(`HF_DATA_OFFLINE=1: refusing remote fetch for ${relativePath}`)
  }

  const url = `${HF_BASE}/${relativePath}`
  let lastError: Error | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
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

      return (await res.json()) as T
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (!String(err).includes("429")) {
        throw err
      }
    }
  }

  throw lastError ?? new Error(`HF fetch failed for ${url}`)
}

async function getLocalManifest() {
  if (!localManifestPromise) {
    localManifestPromise = readLocalCache<BackendManifest>("manifest.json")
  }

  const local = await localManifestPromise

  if (!manifestSnapshotCache) {
    manifestSnapshotCache = {
      remote: null,
      local,
      ts: 0,
    }
  } else if (manifestSnapshotCache.local == null && local != null) {
    manifestSnapshotCache.local = local
  }

  if (!activeManifestSignature) {
    activeManifestSignature = getManifestSignature(local)
    activeManifest = local
  }

  return local
}

function queueArtifactRefresh(
  relativePath: string,
  manifestSignature: string,
  remoteManifest: BackendManifest | null
) {
  if (backgroundRefreshes.has(relativePath)) {
    return
  }

  if (backgroundRefreshes.size === 0 || refreshTargetManifestSignature !== manifestSignature) {
    refreshTargetManifestSignature = manifestSignature
    refreshTargetFailed = false
  }

  const refreshPromise = (async () => {
    try {
      const data = await fetchRemoteJson<unknown>(relativePath)
      if (isCanonicalCacheShape(relativePath, data)) {
        cache.set(relativePath, {
          data,
          ts: Date.now(),
          manifestSignature,
        })
      }
    } catch (err) {
      refreshTargetFailed = true
      console.warn(`[hf-data] Background refresh failed for ${relativePath}:`, err)
    } finally {
      backgroundRefreshes.delete(relativePath)

      if (
        backgroundRefreshes.size === 0 &&
        !refreshTargetFailed &&
        refreshTargetManifestSignature === manifestSignature
      ) {
        activeManifestSignature = manifestSignature
        activeManifest = remoteManifest
      }
    }
  })()

  backgroundRefreshes.set(relativePath, refreshPromise)
}

function queueObservedPathRefreshes(snapshot: {
  remote: BackendManifest | null
  local: BackendManifest | null
}) {
  const remoteManifestSignature = getManifestSignature(snapshot.remote)
  if (!remoteManifestSignature || remoteManifestSignature === activeManifestSignature) {
    return
  }

  for (const relativePath of observedPaths) {
    if (relativePath !== "manifest.json") {
      queueArtifactRefresh(relativePath, remoteManifestSignature, snapshot.remote)
    }
  }
}

function queueManifestSnapshotRefresh() {
  if (manifestRefreshPromise) {
    return manifestRefreshPromise
  }

  manifestRefreshPromise = (async () => {
    const local = await getLocalManifest()
    const remote = await fetchRemoteJson<BackendManifest>("manifest.json").catch((err) => {
      console.warn("[hf-data] Failed to fetch remote manifest:", err)
      return null
    })

    manifestSnapshotCache = {
      remote,
      local,
      ts: Date.now(),
    }

    const remoteManifestSignature = getManifestSignature(remote)
    if (!activeManifestSignature && remoteManifestSignature) {
      activeManifestSignature = remoteManifestSignature
      activeManifest = remote
    }

    queueObservedPathRefreshes(manifestSnapshotCache)
  })().finally(() => {
    manifestRefreshPromise = null
  })

  return manifestRefreshPromise
}

async function getManifestSnapshot() {
  const local = await getLocalManifest()

  if (!manifestSnapshotCache) {
    manifestSnapshotCache = {
      remote: null,
      local,
      ts: 0,
    }
  }

  if (
    MANIFEST_TTL_MS === 0 ||
    Date.now() - manifestSnapshotCache.ts >= MANIFEST_TTL_MS
  ) {
    void queueManifestSnapshotRefresh()
  }

  return manifestSnapshotCache
}

function getCurrentManifestFromSnapshot(snapshot: {
  remote: BackendManifest | null
  local: BackendManifest | null
}) {
  const remoteSignature = getManifestSignature(snapshot.remote)

  if (remoteSignature && remoteSignature === activeManifestSignature) {
    return snapshot.remote
  }

  return activeManifest ?? snapshot.local ?? snapshot.remote
}

async function fetchHFJson<T>(relativePath: string): Promise<T> {
  if (relativePath === "manifest.json") {
    const snapshot = await getManifestSnapshot()

    if (snapshot.remote) {
      return snapshot.remote as T
    }

    if (snapshot.local) {
      return snapshot.local as T
    }

    throw new Error("HF manifest fetch failed and no local manifest cache is available")
  }

  const manifestSnapshot = await getManifestSnapshot()
  const remoteManifestSignature = getManifestSignature(manifestSnapshot.remote)
  const localManifestSignature = getManifestSignature(manifestSnapshot.local)
  observedPaths.add(relativePath)

  // 1. In-memory cache (hot)
  const hit = cache.get(relativePath)
  const validHotCache = hit ? isCanonicalCacheShape(relativePath, hit.data) : false
  if (hit && !validHotCache) {
    cache.delete(relativePath)
  }
  if (
    hit &&
    validHotCache &&
    CACHE_TTL_MS > 0 &&
    Date.now() - hit.ts < CACHE_TTL_MS &&
    (!remoteManifestSignature || hit.manifestSignature === remoteManifestSignature)
  ) {
    return hit.data as T
  }

  if (hit && validHotCache) {
    if (remoteManifestSignature && hit.manifestSignature !== remoteManifestSignature) {
      queueArtifactRefresh(relativePath, remoteManifestSignature, manifestSnapshot.remote)
    }
    return hit.data as T
  }

  const local = await readLocalCache<T>(relativePath)
  const validLocalCache = local !== null && isCanonicalCacheShape(relativePath, local)

  // 2. If the local cache was built from the same manifest, keep using it.
  if (
    validLocalCache &&
    remoteManifestSignature &&
    localManifestSignature &&
    remoteManifestSignature === localManifestSignature
  ) {
    cache.set(relativePath, {
      data: local,
      ts: Date.now(),
      manifestSignature: remoteManifestSignature,
    })
    return local
  }

  // 3. Serve the local cache immediately and refresh in the background when the
  // manifest indicates newer data exists.
  if (validLocalCache) {
    cache.set(relativePath, {
      data: local,
      ts: Date.now(),
      manifestSignature: localManifestSignature ?? undefined,
    })

    if (remoteManifestSignature && remoteManifestSignature !== localManifestSignature) {
      queueArtifactRefresh(relativePath, remoteManifestSignature, manifestSnapshot.remote)
    }

    return local
  }

  // 4. Fall back to a live fetch only when there is no usable stale cache.
  try {
    const data = await fetchRemoteJson<T>(relativePath)
    cache.set(relativePath, {
      data,
      ts: Date.now(),
      manifestSignature: remoteManifestSignature ?? undefined,
    })
    return data
  } catch (err) {
    if (hit && validHotCache) {
      console.warn(`[hf-data] Using stale cache for ${relativePath} after live fetch failed`)
      return hit.data as T
    }

    throw err
  }
}

export async function fetchBackendManifestStatus(): Promise<BackendManifestStatus> {
  if (useViewLayerBackend()) {
    const manifest = await (await fetchSnapshotSidecars()).fetchManifest()
    return {
      currentManifest: manifest,
      latestManifest: manifest,
      currentManifestSignature: manifest.generated_at,
      latestManifestSignature: manifest.generated_at,
      updateAvailable: false,
      refreshing: false,
      pendingRefreshCount: 0,
    }
  }

  const snapshot = await getManifestSnapshot()
  const currentManifest = getCurrentManifestFromSnapshot(snapshot)
  const currentManifestSignature = getManifestSignature(currentManifest)
  const latestManifest = snapshot.remote ?? snapshot.local
  const latestManifestSignature = getManifestSignature(latestManifest)

  return {
    currentManifest,
    latestManifest,
    currentManifestSignature,
    latestManifestSignature,
    updateAvailable: Boolean(
      currentManifestSignature &&
      latestManifestSignature &&
      currentManifestSignature !== latestManifestSignature
    ),
    refreshing: manifestRefreshPromise != null || backgroundRefreshes.size > 0,
    pendingRefreshCount: backgroundRefreshes.size,
  }
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

export interface HFModelCardEntry extends SignalSummaries {
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

export interface HFEvalListEntry extends SignalSummaries {
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
  evalcards?: { annotations?: EvalcardsAnnotations }
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
  // The pipeline copies the parent record's provenance onto every hierarchy
  // model_result row (commit 9090cc5, 2026-04-26). Required.
  source_metadata: SourceMetadata
  source_data?: SourceData | string[]
  detailed_evaluation_results?: string | null
  detailed_evaluation_results_meta?: unknown
  instance_level_data?: unknown
  passthrough_top_level_fields?: unknown
  evalcards?: { annotations?: RowAnnotations }
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

export interface HFEvalDetail extends SignalSummaries {
  eval_summary_id: string
  benchmark: string
  canonical_display_name?: string
  benchmark_family_key: string
  benchmark_leaf_key: string
  benchmark_leaf_name: string
  benchmark_parent_key?: string
  benchmark_parent_name?: string
  category: string
  source_data: SourceData
  benchmark_card: BenchmarkCard | null
  metrics: HFEvalMetric[]
  subtasks: unknown[]
  evalcards?: { annotations?: EvalcardsAnnotations }
}

export interface HFModelDetail extends SignalSummaries {
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

export type HFModelHierarchySubtask = Partial<Omit<HFModelHierarchyNode, "subtasks">> & {
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
  if (useViewLayerBackend()) {
    return (await import("@/lib/view-data")).getBenchmarkMetadataMap()
  }

  return fetchHFJson<Record<string, BenchmarkCard>>("benchmark-metadata.json")
}

export async function fetchBackendManifest(): Promise<BackendManifest> {
  if (useViewLayerBackend()) {
    return (await fetchSnapshotSidecars()).fetchManifest()
  }

  return fetchHFJson<BackendManifest>("manifest.json")
}

export async function fetchEvalHierarchy(): Promise<EvalHierarchy> {
  if (useViewLayerBackend()) {
    return adaptEvalHierarchy(await (await fetchSnapshotSidecars()).fetchHierarchy())
  }

  const raw = await fetchHFJson<EvalHierarchy>("eval-hierarchy.json")
  return adaptEvalHierarchy(raw)
}

/**
 * The upstream pipeline emits multiple shapes over its lifetime; this
 * adapter promotes whichever form arrives into the legacy
 * `families[].composites[]` / `families[].standalone_benchmarks[]`
 * tree the existing UI walks, plus a complete `stats` block.
 *
 * Three shapes handled:
 *   1. Legacy nested (`families[].composites[]`/`standalone_benchmarks[]`) —
 *      passed through.
 *   2. Mid-life flat 2-level (`families[].leaves[]`) — leaves promoted to
 *      `standalone_benchmarks[]`.
 *   3. New composite/family/slice taxonomy (top-level `composites[]` +
 *      flat `families[]` index) — composites' benchmarks are bucketed
 *      back under per-family records, with the composite slug as the
 *      family key when no curated multi-benchmark family applies.
 */
export function adaptEvalHierarchy(raw: EvalHierarchy): EvalHierarchy {
  const newShape = Array.isArray(raw.composites) && raw.composites.length > 0
  if (newShape) {
    return adaptCompositeShape(raw)
  }

  const families = (raw.families ?? []).map((family) => {
    const hasLegacyTree =
      (family.composites && family.composites.length > 0) ||
      (family.standalone_benchmarks && family.standalone_benchmarks.length > 0) ||
      (family.benchmarks && family.benchmarks.length > 0)

    if (hasLegacyTree) {
      return family
    }

    const leaves = family.leaves ?? []
    if (leaves.length === 0) {
      return family
    }

    const standalone = leaves.map((leaf) => ({
      key: leaf.key,
      display_name: leaf.display_name,
      has_card: leaf.has_card ?? false,
      tags: {
        domains: leaf.tags?.domains ?? [],
        languages: leaf.tags?.languages ?? [],
        tasks: leaf.tags?.tasks ?? [],
      },
      slices: [],
      metrics: [],
      reproducibility_summary: leaf.reproducibility_summary,
      provenance_summary: leaf.provenance_summary,
      comparability_summary: leaf.comparability_summary,
      summary_eval_ids: leaf.eval_summary_ids,
    }))

    return {
      ...family,
      tags: {
        domains: family.tags?.domains ?? [],
        languages: family.tags?.languages ?? [],
        tasks: family.tags?.tasks ?? [],
      },
      standalone_benchmarks: standalone,
    }
  })

  if (raw.stats) {
    return { ...raw, families }
  }

  let composite_count = 0
  let standalone_benchmark_count = 0
  let single_benchmark_count = 0
  let slice_count = 0
  let metric_count = 0

  for (const family of families) {
    composite_count += family.composites?.length ?? 0
    const standalone = family.standalone_benchmarks ?? []
    standalone_benchmark_count += standalone.length
    if ((family.composites?.length ?? 0) === 0 && standalone.length === 1) {
      single_benchmark_count += 1
    }
    for (const composite of family.composites ?? []) {
      for (const benchmark of composite.benchmarks ?? []) {
        slice_count += benchmark.slices?.length ?? 0
        metric_count += benchmark.metrics?.length ?? 0
      }
    }
    for (const benchmark of standalone) {
      slice_count += benchmark.slices?.length ?? 0
      metric_count += benchmark.metrics?.length ?? 0
    }
  }

  return {
    ...raw,
    families,
    stats: {
      family_count: families.length,
      composite_count,
      standalone_benchmark_count,
      single_benchmark_count,
      slice_count,
      metric_count,
      metric_rows_scanned: 0,
    },
  }
}

/**
 * Translate the new composite/family/slice taxonomy shape (top-level
 * `composites[]` + flat `families[]` lookup index) into the legacy
 * `families[].composites[]` / `families[].standalone_benchmarks[]`
 * tree.
 *
 * Bucketing rule: every benchmark in `composites[].benchmarks[]` is
 * grouped by `family_id` (curated multi-benchmark family slug,
 * defaulting to benchmark.key for singletons). A family with ≥2
 * member benchmarks lands under a synthetic legacy `composites[]`
 * entry keyed on the family slug; a singleton family lands under
 * `standalone_benchmarks[]`. Slice rows on the new
 * benchmark.slices[] carry through unchanged.
 *
 * Stats are taken straight from raw.stats (which has the new
 * shape's `benchmark_count`) plus synthesised
 * `standalone_benchmark_count` / `single_benchmark_count` for
 * back-compat consumers.
 */
function adaptCompositeShape(raw: EvalHierarchy): EvalHierarchy {
  const familyIndex = new Map<string, { display_name: string; member_keys: string[] }>()
  for (const fam of raw.families ?? []) {
    if (!fam || typeof fam !== "object") continue
    const f = fam as unknown as { key?: string; display_name?: string; member_benchmark_keys?: string[] }
    if (!f.key) continue
    familyIndex.set(f.key, {
      display_name: f.display_name ?? f.key,
      member_keys: f.member_benchmark_keys ?? [],
    })
  }

  type LegacyBenchmark = HierarchyBenchmark & { _composite_slug?: string }

  // Set of benchmark keys claimed by curated multi-benchmark families
  // (families.yaml), so we don't redundantly bucket them under their
  // composite below. Crucially this only counts MULTI-member families
  // (≥2 benchmarks) — every benchmark also gets a synthetic singleton
  // family from the backend's `_synthesise_singleton_families` pass,
  // and treating those as curated would short-circuit the
  // composite-implicit grouping (Pass B) and scatter every leaderboard
  // benchmark into its own row.
  const curatedMembers = new Set<string>()
  for (const fam of familyIndex.values()) {
    if (fam.member_keys.length < 2) continue
    for (const k of fam.member_keys) curatedMembers.add(k)
  }

  // Two grouping passes, in priority order:
  //
  // (1) Curated families from families.yaml — bucketed by `family_id`.
  //     Drives the MMLU family, BFCL family, JudgeBench family rows.
  //
  // (2) Composite-implicit groupings — for benchmarks NOT in any
  //     curated family, group by their composite_slug if the
  //     composite has ≥2 such benchmarks. This restores the legacy
  //     "HELM Classic / HELM Lite / HELM Safety" family rows that
  //     would otherwise scatter across one singleton family per
  //     leaf benchmark, hiding the leaderboard structure.
  //
  // (3) Anything still ungrouped lands as a singleton standalone.
  type Bucket = {
    key: string
    display: string
    benches: LegacyBenchmark[]
    /** Curated family vs synthesised-from-composite vs singleton. Drives
     *  whether the legacy `composites[]` slot or `standalone_benchmarks[]`
     *  is populated. */
    kind: "curated" | "composite" | "singleton"
  }
  const buckets = new Map<string, Bucket>()

  const toLegacyBenchmark = (
    bench: HierarchyComposite["benchmarks"][number],
    composite: HierarchyComposite,
  ): LegacyBenchmark => ({
    key: bench.key,
    display_name: bench.display_name,
    has_card: bench.has_card ?? false,
    tags: {
      domains: bench.tags?.domains ?? [],
      languages: bench.tags?.languages ?? [],
      tasks: bench.tags?.tasks ?? [],
    },
    slices: bench.slices ?? [],
    metrics: bench.metrics ?? [],
    summary_eval_ids: bench.summary_eval_ids,
    reproducibility_summary: bench.reproducibility_summary,
    provenance_summary: bench.provenance_summary,
    comparability_summary: bench.comparability_summary,
    family_id: bench.family_id ?? bench.key,
    is_slice: bench.is_slice ?? false,
    _composite_slug: composite.key,
  })

  // Pass A: curated families.
  for (const composite of raw.composites ?? []) {
    for (const bench of composite.benchmarks ?? []) {
      const familyId = bench.family_id ?? bench.key
      if (!curatedMembers.has(bench.key)) continue
      const entry = familyIndex.get(familyId)
      if (!entry) continue
      const bucketKey = `family:${familyId}`
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          key: familyId,
          display: entry.display_name,
          benches: [],
          kind: "curated",
        })
      }
      buckets.get(bucketKey)!.benches.push(toLegacyBenchmark(bench, composite))
    }
  }

  // Pass B: composite-implicit groupings. Per composite, count
  // distinct non-curated benchmark keys; if ≥2, group them under the
  // composite slug; otherwise fall through to the singleton pass.
  for (const composite of raw.composites ?? []) {
    const eligibleBenches = (composite.benchmarks ?? [])
      .filter((b) => !curatedMembers.has(b.key))
    const distinctKeys = new Set(eligibleBenches.map((b) => b.key))
    if (distinctKeys.size < 2) continue
    const bucketKey = `composite:${composite.key}`
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        key: composite.key,
        display: composite.display_name,
        benches: [],
        kind: "composite",
      })
    }
    for (const bench of eligibleBenches) {
      buckets.get(bucketKey)!.benches.push(toLegacyBenchmark(bench, composite))
    }
  }

  // Pass C: singletons (benchmarks not in a curated family and whose
  // composite carries only this benchmark). Bucketed by benchmark key.
  for (const composite of raw.composites ?? []) {
    const eligibleBenches = (composite.benchmarks ?? [])
      .filter((b) => !curatedMembers.has(b.key))
    const distinctKeys = new Set(eligibleBenches.map((b) => b.key))
    if (distinctKeys.size >= 2) continue
    for (const bench of eligibleBenches) {
      const bucketKey = `bench:${bench.key}`
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          key: bench.key,
          display: bench.display_name,
          benches: [],
          kind: "singleton",
        })
      }
      buckets.get(bucketKey)!.benches.push(toLegacyBenchmark(bench, composite))
    }
  }

  // Synthesise legacy family records.
  const families: HierarchyFamily[] = []
  let standalone_benchmark_count = 0
  let single_benchmark_count = 0
  let synthesised_composite_count = 0

  // Sort by display name for stable rendering. Curated families first,
  // then composite-implicit groupings, then singletons.
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => {
    const kindOrder = { curated: 0, composite: 1, singleton: 2 } as const
    if (kindOrder[a.kind] !== kindOrder[b.kind]) {
      return kindOrder[a.kind] - kindOrder[b.kind]
    }
    return a.key.localeCompare(b.key)
  })

  for (const bucket of sortedBuckets) {
    const benches = bucket.benches
    if (benches.length === 0) continue
    const display = bucket.display ?? bucket.key
    const distinctBenchmarkKeys = new Set(benches.map((b) => b.key))

    const tagDomains = new Set<string>()
    const tagLanguages = new Set<string>()
    const tagTasks = new Set<string>()
    for (const b of benches) {
      b.tags.domains.forEach((d) => tagDomains.add(d))
      b.tags.languages.forEach((l) => tagLanguages.add(l))
      b.tags.tasks.forEach((t) => tagTasks.add(t))
    }
    const tags: HierarchyTags = {
      domains: Array.from(tagDomains).sort(),
      languages: Array.from(tagLanguages).sort(),
      tasks: Array.from(tagTasks).sort(),
    }

    const family: HierarchyFamily = {
      key: bucket.key,
      display_name: display,
      category: "General",
      tags,
      has_card: benches.some((b) => b.has_card),
      eval_summary_ids: Array.from(
        new Set(benches.flatMap((b) => b.summary_eval_ids ?? [])),
      ),
      composites: [],
      standalone_benchmarks: [],
    }

    if (bucket.kind === "singleton") {
      // Singleton family — flatten the (potentially N) per-composite
      // copies of this benchmark into one standalone row by merging
      // their slice/metric arrays.
      const merged: HierarchyBenchmark = mergeSingletonBenchmarks(benches)
      family.standalone_benchmarks!.push(merged)
      standalone_benchmark_count += 1
      single_benchmark_count += 1
    } else {
      // Multi-benchmark grouping (curated family or composite-implicit).
      // Emit one legacy composite under the family. De-dup benchmarks
      // that appear in multiple upstream composites.
      const seen = new Set<string>()
      const dedupedBenches: LegacyBenchmark[] = []
      for (const b of benches) {
        if (seen.has(b.key)) continue
        seen.add(b.key)
        dedupedBenches.push(b)
      }
      family.composites!.push({
        key: bucket.key,
        display_name: display,
        has_card: family.has_card,
        category: family.category,
        tags,
        benchmarks: dedupedBenches,
      })
      synthesised_composite_count += 1
    }

    void distinctBenchmarkKeys
    families.push(family)
  }

  const stats = raw.stats
    ? {
        ...raw.stats,
        standalone_benchmark_count:
          raw.stats.standalone_benchmark_count ?? standalone_benchmark_count,
        single_benchmark_count:
          raw.stats.single_benchmark_count ?? single_benchmark_count,
      }
    : {
        family_count: families.length,
        composite_count: raw.composites?.length ?? synthesised_composite_count,
        benchmark_count: 0,
        standalone_benchmark_count,
        single_benchmark_count,
        slice_count: 0,
        metric_count: 0,
        metric_rows_scanned: 0,
      }

  return {
    ...raw,
    families,
    stats,
  }
}

function mergeSingletonBenchmarks(benches: HierarchyBenchmark[]): HierarchyBenchmark {
  if (benches.length === 1) return benches[0]
  const first = benches[0]
  const sliceMap = new Map<string, HierarchySlice>()
  const metricMap = new Map<string, HierarchyMetric>()
  const summaryIds = new Set<string>()
  for (const b of benches) {
    for (const s of b.slices ?? []) {
      if (!sliceMap.has(s.key)) sliceMap.set(s.key, s)
    }
    for (const m of b.metrics ?? []) {
      if (!metricMap.has(m.key)) metricMap.set(m.key, m)
    }
    for (const id of b.summary_eval_ids ?? []) summaryIds.add(id)
  }
  return {
    ...first,
    slices: Array.from(sliceMap.values()),
    metrics: Array.from(metricMap.values()),
    summary_eval_ids: Array.from(summaryIds),
  }
}

export async function fetchComparisonIndex(): Promise<ComparisonIndex> {
  if (useViewLayerBackend()) {
    return (await fetchSnapshotSidecars()).fetchComparisonIndex()
  }

  return fetchHFJson<ComparisonIndex>("comparison-index.json")
}

export async function fetchCorpusAggregates(): Promise<CorpusAggregates | null> {
  if (useViewLayerBackend()) {
    return (await fetchSnapshotSidecars()).fetchHeadline()
  }

  return fetchHFJsonSafe<CorpusAggregates>("corpus-aggregates.json")
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
        sourceMetadata: SourceMetadata
      }
    >()

    for (const result of relevantResults) {
      // Pipeline contract (commit 9090cc5): every model_result row carries
      // source_metadata. Fail loud if a stale dataset breaks the contract —
      // the UI dereferences source_metadata.* unguarded.
      if (!result.source_metadata) {
        throw new Error(
          `Pipeline contract broken: missing source_metadata on model_result ` +
          `(model_family=${detail.model_family_id} metric=${metric.metric_summary_id} eval=${result.evaluation_id})`
        )
      }
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
        evalcards: result.evalcards,
      }

      const existing = resultsByVariant.get(variantKey)
      if (!existing) {
        resultsByVariant.set(variantKey, {
          modelInfo,
          evaluationResults: [evaluationResult],
          inlineSamples: inlineSamples.length > 0 ? inlineSamples : undefined,
          latestTimestamp: result.retrieved_timestamp ?? detail.last_updated ?? "",
          sourceMetadata: result.source_metadata,
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
        // When multiple submissions land in the same variant bucket, prefer
        // provenance from the freshest one.
        existing.latestTimestamp = result.retrieved_timestamp ?? existing.latestTimestamp
        existing.sourceMetadata = result.source_metadata
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
        source_metadata: variantGroup.sourceMetadata,
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
      ...flattenHierarchyNode(
        detail,
        subtask,
        category,
        rawModelIds,
        variantLookup,
        context
      )
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
      evaluations.push(
        ...flattenHierarchyNode(
          detail,
          node,
          mappedCategory,
          rawModelIds,
          variantLookup
        )
      )
    }
  }

  return evaluations
}

/**
 * Map pipeline category labels to frontend CategoryType.
 */
// Every category key emitted by the pipeline (verified against production
// dataset 2026-04-27, 9 distinct keys total). Values for the 3 added keys
// (coding, instruction_following, language_understanding) match what the
// previous regex fallback returned for them, preserving prior labelling.
// Note: `coding` maps to General because "coding" does not contain the
// substring "code" — see lib/benchmark-schema.ts inferCategoryFromBenchmark.
const PIPELINE_CATEGORY_MAP: Record<string, CategoryType> = {
  agentic: "Agentic",
  reasoning: "Reasoning",
  general: "General",
  safety: "Safety",
  knowledge: "Knowledge",
  other: "General",
  coding: "General",
  instruction_following: "General",
  language_understanding: "General",
}

export function mapHFCategories(categories: string[]): CategoryType[] {
  const mapped: CategoryType[] = []
  for (const c of categories) {
    if (!c) continue
    const cat = PIPELINE_CATEGORY_MAP[c.toLowerCase()] ?? "General"
    if (!mapped.includes(cat)) mapped.push(cat)
  }
  return mapped.length > 0 ? mapped : ["General"]
}
