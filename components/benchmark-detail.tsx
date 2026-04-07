"use client"

// Force recompile
import Link from "next/link"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  ExternalLink, TrendingUp, Info, Database, Settings, FileCode, Building, Calendar, User, Server, 
  ChevronDown, ChevronUp, BarChart3, Award, AlertTriangle,
  Cpu, Tag, Globe, Network, Activity, MessageSquare, Clock, Hash, Layers, Search, FlaskConical, Scale, BookOpenText
} from "lucide-react"
import type { BenchmarkCard, BenchmarkEvaluation, CategoryType, EvaluationResult } from "@/lib/benchmark-schema"
import { getCategoryColor as getCategoryTone, inferCategoryFromBenchmark } from "@/lib/benchmark-schema"
import { formatScore, getBenchmarkDisplayName, type BenchmarkEvalSummary } from "@/lib/eval-processing"
import type { ModelSummaryCore } from "@/lib/benchmark-schema"
import { lookupBenchmarkCard } from "@/lib/benchmark-metadata-utils"
import { Fragment, useState, useEffect, useMemo, type CSSProperties } from "react"

interface BenchmarkDetailProps {
  summary: ModelSummaryCore
  benchmarkCards?: Record<string, BenchmarkCard>
}

interface BenchmarkVariant {
  evaluation: BenchmarkEvaluation
  result: EvaluationResult
  label: string
  variantType: "setup" | "subtask" | "setup+subtask" | "default"
  setupLabel: string | null
  subtaskLabel: string | null
  displayScore: string
  normalizedScore: number
  rankPosition: number | null
  rankTotal: number | null
  rankRatio: number | null
}

interface BenchmarkGroup {
  key: string
  title: string
  evalDetailHref: string
  category: CategoryType
  description: string
  scoreType: EvaluationResult["metric_config"]["score_type"] | "mixed"
  avgNormalizedScore: number
  avgDisplayScore: string
  bestRankPosition: number | null
  bestRankTotal: number | null
  bestRankRatio: number | null
  domains: string[]
  benchmarkCard?: BenchmarkCard
  variants: BenchmarkVariant[]
}

interface VariantRowData {
  rowKey: string
  variant: BenchmarkVariant
  configMap: Record<string, string>
  configEntries: Array<[string, string]>
  sampleCount: number | null
}

const GENERIC_RESULT_NAMES = new Set([
  "score",
  "accuracy",
  "mean win rate",
  "exact match",
  "f1",
  "pass@1",
])

function getResultBenchmarkName(
  evaluation: BenchmarkEvaluation,
  result: EvaluationResult
) {
  if (result.source_data && !Array.isArray(result.source_data) && result.source_data.dataset_name) {
    return result.source_data.dataset_name
  }

  if (evaluation.benchmark) {
    return evaluation.benchmark
  }

  if (!Array.isArray(evaluation.source_data) && evaluation.source_data.dataset_name) {
    return evaluation.source_data.dataset_name
  }

  return result.evaluation_name
}

function getResultDisplayName(
  evaluation: BenchmarkEvaluation,
  result: EvaluationResult
) {
  const benchmarkName = getBenchmarkDisplayName(getResultBenchmarkName(evaluation, result))
  const metricName = result.evaluation_name

  if (GENERIC_RESULT_NAMES.has(metricName.toLowerCase())) {
    return `${benchmarkName} - ${metricName}`
  }

  return metricName
}

function getVariantDescriptor(
  evaluation: BenchmarkEvaluation,
  result: EvaluationResult
): Pick<BenchmarkVariant, "label" | "variantType" | "setupLabel" | "subtaskLabel"> {
  const evaluationVariant = getEvaluationVariantLabel(evaluation)
  const metricName = result.evaluation_name
  const isGenericMetric = GENERIC_RESULT_NAMES.has(metricName.toLowerCase())
  const subtaskLabel = isGenericMetric ? null : metricName
  const setupLabel = evaluationVariant

  if (setupLabel && subtaskLabel) {
    return {
      label: `${setupLabel} · ${subtaskLabel}`,
      variantType: "setup+subtask",
      setupLabel,
      subtaskLabel,
    }
  }

  if (setupLabel) {
    return {
      label: `Setup: ${setupLabel}`,
      variantType: "setup",
      setupLabel,
      subtaskLabel: null,
    }
  }

  if (subtaskLabel) {
    return {
      label: subtaskLabel,
      variantType: "subtask",
      setupLabel: null,
      subtaskLabel,
    }
  }

  return {
    label: "Default run",
    variantType: "default",
    setupLabel: null,
    subtaskLabel: null,
  }
}

function formatMetadataValue(value: unknown) {
  if (value == null) {
    return null
  }

  if (typeof value === "string") {
    return value
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value)
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function collectConfigEntries(
  source: Record<string, unknown>,
  prefix = "",
  depth = 0
): Array<[string, string]> {
  const entries: Array<[string, string]> = []

  for (const [key, value] of Object.entries(source)) {
    const nextKey = prefix ? `${prefix}.${key}` : key

    if (isPlainObject(value) && depth < 1) {
      entries.push(...collectConfigEntries(value, nextKey, depth + 1))
      continue
    }

    const formattedValue = formatMetadataValue(value)
    if (formattedValue) {
      entries.push([nextKey, formattedValue])
    }
  }

  return entries
}

function getConfigDisplayValue(value: string) {
  return value.length > 36 ? `${value.slice(0, 33)}...` : value
}

function getTableConfigLabel(row: VariantRowData) {
  if (row.variant.setupLabel) {
    return row.variant.setupLabel
  }

  if (row.variant.variantType === "subtask") {
    return "Default setup"
  }

  return "Default config"
}

function formatCompactDate(timestamp: string) {
  try {
    const ts = parseFloat(timestamp)
    const date = Number.isFinite(ts)
      ? new Date(ts > 10000000000 ? ts : ts * 1000)
      : new Date(timestamp)

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return timestamp
  }
}

function formatParamsBillions(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN

  if (!Number.isFinite(numericValue)) {
    return null
  }

  if (numericValue >= 100) {
    return `${Math.round(numericValue)}B`
  }

  if (numericValue >= 10) {
    return `${numericValue.toFixed(1)}B`
  }

  return `${numericValue.toFixed(1)}B`
}

function getModelScaleDescription(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN

  if (!Number.isFinite(numericValue)) {
    return null
  }

  const rounded = numericValue >= 100 ? Math.round(numericValue) : Number.parseFloat(numericValue.toFixed(1))
  const scaleLabel =
    numericValue < 10 ? "Small model" : numericValue < 70 ? "Mid-size model" : "Large model"

  return `${scaleLabel} (${rounded} billion parameters)`
}

function getPolicyBenchmarkNarrative(name: string) {
  const value = name.toLowerCase()

  if (value.includes("ifeval")) {
    return {
      label: "Following instructions",
      description: "Can the model follow detailed formatting and content rules?",
    }
  }

  if (value.includes("bbh")) {
    return {
      label: "Reasoning and logic",
      description: "Multi-step reasoning across diverse tasks.",
    }
  }

  if (value.includes("math")) {
    return {
      label: "Advanced math",
      description: "Hard competition-level mathematics.",
    }
  }

  if (value.includes("gpqa")) {
    return {
      label: "Expert knowledge",
      description: "Graduate-level science questions across biology, physics, and chemistry.",
    }
  }

  if (value.includes("musr")) {
    return {
      label: "Complex narrative reasoning",
      description: "Reasoning over stories and real-world scenarios.",
    }
  }

  if (value.includes("mmlu")) {
    return {
      label: "Broad knowledge",
      description: "Professional and academic knowledge across many subject areas.",
    }
  }

  if (value.includes("tau-bench")) {
    return {
      label: "Agentic task completion",
      description: "Multi-step task execution in realistic workflow settings.",
    }
  }

  if (value.includes("swe-bench")) {
    return {
      label: "Software engineering",
      description: "Issue resolution and code-change performance on real repositories.",
    }
  }

  if (value.includes("rewardbench")) {
    return {
      label: "Preference alignment",
      description: "How well the model matches preference-style judgments.",
    }
  }

  return {
    label: name,
    description: "Reported benchmark evidence for this model.",
  }
}

function getPolicySignalLevel(score: number) {
  if (score >= 0.7) {
    return {
      label: "Good",
      tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    }
  }

  if (score >= 0.4) {
    return {
      label: "Moderate",
      tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    }
  }

  return {
    label: "Low",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  }
}

function getBenchmarkSpread(group: BenchmarkGroup) {
  if (group.variants.length <= 1) {
    return 0
  }

  return group.variants[0].normalizedScore - group.variants[group.variants.length - 1].normalizedScore
}

function getBenchmarkSourceCount(group: BenchmarkGroup) {
  return new Set(group.variants.map((variant) => variant.evaluation.source_metadata.source_organization_name)).size
}

function getVariantTypeTone(variantType: BenchmarkVariant["variantType"]) {
  switch (variantType) {
    case "setup":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
    case "subtask":
      return "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
    case "setup+subtask":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function getVariantTypeLabel(variantType: BenchmarkVariant["variantType"]) {
  switch (variantType) {
    case "setup":
      return "Setup change"
    case "subtask":
      return "Benchmark subtask"
    case "setup+subtask":
      return "Setup + subtask"
    default:
      return "Single run"
  }
}

function parseNumericRank(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function parseRankFraction(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const match = value.match(/(\d+)\s*\/\s*(\d+)/)
  if (!match) {
    return null
  }

  const position = Number.parseInt(match[1], 10)
  const total = Number.parseInt(match[2], 10)
  if (!Number.isFinite(position) || !Number.isFinite(total) || total <= 0) {
    return null
  }

  return { position, total }
}

function findRankFromObject(value: unknown, depth = 0): { position: number; total: number | null } | null {
  if (depth > 4 || value == null) {
    return null
  }

  const fraction = parseRankFraction(value)
  if (fraction) {
    return fraction
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const lowered = Object.fromEntries(keys.map((key) => [key.toLowerCase(), record[key]]))

  const positionCandidates = ["rank", "position", "place", "standing"]
  const totalCandidates = ["total", "out_of", "num_models", "model_count", "total_models", "population"]

  let position: number | null = null
  let total: number | null = null

  for (const key of positionCandidates) {
    if (key in lowered) {
      position = parseNumericRank(lowered[key])
      if (position != null) {
        break
      }
    }
  }

  for (const key of totalCandidates) {
    if (key in lowered) {
      total = parseNumericRank(lowered[key])
      if (total != null) {
        break
      }
    }
  }

  if (position != null) {
    return { position, total }
  }

  for (const nestedValue of Object.values(record)) {
    const nested = findRankFromObject(nestedValue, depth + 1)
    if (nested) {
      return nested
    }
  }

  return null
}

function getVariantPeerRank(result: EvaluationResult) {
  const fromDetails = findRankFromObject(result.score_details.details)
  if (fromDetails?.position != null) {
    return fromDetails
  }

  const fromSource = findRankFromObject(result.source_data)
  if (fromSource?.position != null) {
    return fromSource
  }

  if (result.evaluation_name.toLowerCase().includes("rank")) {
    const scoreRank = parseNumericRank(result.score_details.score)
    if (scoreRank != null) {
      return { position: scoreRank, total: null }
    }
  }

  return null
}

function getDeepDiveAnchorId(groupKey: string) {
  return `deep-dive-${groupKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
}

function buildVariantStructuredSections(variant: BenchmarkVariant) {
  const detailEntries = variant.result.score_details.details
    ? Object.entries(variant.result.score_details.details)
    : []

  return {
    numericBreakdown: detailEntries.filter(([, value]) => typeof value === "number"),
    structuredBreakdown: detailEntries.filter(([, value]) => typeof value !== "number"),
  }
}

function formatConfigLabel(key: string) {
  return key
    .split(".")
    .slice(-2)
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getVariantConfigMap(variant: BenchmarkVariant) {
  const configMap: Record<string, string> = {}
  const setup = getEvaluationVariantLabel(variant.evaluation)

  if (setup) {
    configMap.setup = setup
  }

  // Prefer result-level generation config, fall back to eval-level
  const genConfig = variant.result.generation_config ?? variant.evaluation.generation_config

  if (genConfig?.generation_args) {
    for (const [key, value] of collectConfigEntries(genConfig.generation_args)) {
      configMap[key] = value
    }
  }

  if (genConfig?.additional_details) {
    const ad = genConfig.additional_details
    if (typeof ad === "string") {
      configMap.additional_details = ad
    } else if (typeof ad === "object") {
      for (const [key, value] of collectConfigEntries(ad)) {
        configMap[key] = value
      }
    }
  }

  if (genConfig?.prompt_template) {
    configMap.prompt_template = genConfig.prompt_template
  }

  return configMap
}

function normalizeScoreForDisplay(result: EvaluationResult) {
  const minScore = result.metric_config.min_score ?? 0
  const maxScore = result.metric_config.max_score ?? 1
  const range = maxScore - minScore

  if (range <= 0) {
    return 0
  }

  const rawNormalized = (result.score_details.score - minScore) / range
  const normalized = result.metric_config.lower_is_better ? 1 - rawNormalized : rawNormalized
  return Math.max(0, Math.min(1, normalized))
}

function slugifyEvalSummaryId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function getEvalDetailHref(evaluation: BenchmarkEvaluation, result: EvaluationResult) {
  const benchmarkKey = evaluation.benchmark || getResultBenchmarkName(evaluation, result)
  const evalSummaryId = slugifyEvalSummaryId(`${benchmarkKey}__${result.evaluation_name}`)
  return `/evals/${evalSummaryId}`
}

function getEvalSummaryIdFromHref(href: string) {
  const [, id = ""] = href.split("/evals/")
  return id
}

function getGroupPeerRank(
  group: BenchmarkGroup,
  modelId: string,
  peerRanks: PeerRanksMap
): { position: number; total: number } | null {
  let best: { position: number; total: number } | null = null

  for (const variant of group.variants) {
    const evalSummaryId = getEvalSummaryIdFromHref(
      getEvalDetailHref(variant.evaluation, variant.result)
    )
    const rank = peerRanks[evalSummaryId]?.[modelId]
    if (rank == null) continue

    if (best == null) {
      best = rank
      continue
    }

    const rankRatio = rank.total > 0 ? rank.position / rank.total : rank.position
    const bestRatio = best.total > 0 ? best.position / best.total : best.position
    if (rankRatio < bestRatio) {
      best = rank
    }
  }

  return best ?? (group.bestRankPosition != null ? { position: group.bestRankPosition, total: group.bestRankTotal ?? 0 } : null)
}

type PeerRanksMap = Record<string, Record<string, { position: number; total: number }>>

let peerRanksPromise: Promise<PeerRanksMap> | null = null

function loadPeerRanks(): Promise<PeerRanksMap> {
  if (!peerRanksPromise) {
    peerRanksPromise = fetch("/peer-ranks.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
  }
  return peerRanksPromise
}

async function fetchPeerRankForModel(evalSummaryId: string, modelId: string) {
  const ranks = await loadPeerRanks()
  return ranks[evalSummaryId]?.[modelId] ?? null
}

function formatResultDisplayScore(result: EvaluationResult) {
  return formatScore(
    result.score_details.score,
    result.metric_config.score_type,
    result.metric_config.max_score
  )
}

function toComparableTimestamp(timestamp: string) {
  const numericTimestamp = Number.parseFloat(timestamp)
  if (Number.isFinite(numericTimestamp)) {
    return numericTimestamp
  }

  const parsedTimestamp = new Date(timestamp).getTime()
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Number.NEGATIVE_INFINITY
}

function getVariantDedupKey(variant: BenchmarkVariant) {
  const configEntries = Object.entries(getVariantConfigMap(variant)).sort(([a], [b]) => a.localeCompare(b))
  const sourceDataName =
    !Array.isArray(variant.result.source_data) && variant.result.source_data?.dataset_name
      ? variant.result.source_data.dataset_name
      : !Array.isArray(variant.evaluation.source_data) && variant.evaluation.source_data?.dataset_name
        ? variant.evaluation.source_data.dataset_name
        : ""

  return JSON.stringify({
    label: variant.label,
    variantType: variant.variantType,
    setupLabel: variant.setupLabel,
    subtaskLabel: variant.subtaskLabel,
    displayScore: variant.displayScore,
    sourceOrganization: variant.evaluation.source_metadata.source_organization_name,
    sourceName: variant.evaluation.source_metadata.source_name ?? "",
    sourceType: variant.evaluation.source_metadata.source_type,
    sourceDataName,
    configEntries,
  })
}

function buildBenchmarkGroups(
  entries: Array<{ evaluation: BenchmarkEvaluation; result: EvaluationResult; category: CategoryType }>,
  benchmarkCards?: Record<string, BenchmarkCard>
): BenchmarkGroup[] {
  const groups = new Map<string, BenchmarkGroup>()

  for (const entry of entries) {
    const title = getBenchmarkDisplayName(getResultBenchmarkName(entry.evaluation, entry.result))
    const card = benchmarkCards
      ? lookupBenchmarkCard(benchmarkCards, getResultBenchmarkName(entry.evaluation, entry.result))
      : undefined
    const normalizedScore = normalizeScoreForDisplay(entry.result)
    const displayScore = formatResultDisplayScore(entry.result)
    const rankInfo = getVariantPeerRank(entry.result)
    const rankPosition = rankInfo?.position ?? null
    const rankTotal = rankInfo?.total ?? null
    const rankRatio =
      rankPosition != null && rankTotal != null && rankTotal > 0
        ? rankPosition / rankTotal
        : rankPosition != null
          ? rankPosition
          : null
    const descriptor = getVariantDescriptor(entry.evaluation, entry.result)
    const variant: BenchmarkVariant = {
      evaluation: entry.evaluation,
      result: entry.result,
      label: descriptor.label,
      variantType: descriptor.variantType,
      setupLabel: descriptor.setupLabel,
      subtaskLabel: descriptor.subtaskLabel,
      displayScore,
      normalizedScore,
      rankPosition,
      rankTotal,
      rankRatio,
    }

    const existing = groups.get(title)

    if (!existing) {
      groups.set(title, {
        key: title,
        title,
        evalDetailHref: getEvalDetailHref(entry.evaluation, entry.result),
        category: entry.category,
        description: entry.result.metric_config.evaluation_description,
        scoreType: entry.result.metric_config.score_type,
        avgNormalizedScore: normalizedScore,
        avgDisplayScore: `${(normalizedScore * 100).toFixed(1)}%`,
        bestRankPosition: rankPosition,
        bestRankTotal: rankTotal,
        bestRankRatio: rankRatio,
        domains: card?.benchmark_details?.domains ?? [],
        benchmarkCard: card,
        variants: [variant],
      })
      continue
    }

    existing.variants.push(variant)
    if (existing.description.length < entry.result.metric_config.evaluation_description.length) {
      existing.description = entry.result.metric_config.evaluation_description
    }
    if (existing.scoreType !== entry.result.metric_config.score_type) {
      existing.scoreType = "mixed"
    }
  }

  return Array.from(groups.values())
    .map((group) => {
      const dedupedVariants = new Map<string, BenchmarkVariant>()

      for (const variant of group.variants) {
        const variantKey = getVariantDedupKey(variant)
        const existingVariant = dedupedVariants.get(variantKey)

        if (!existingVariant) {
          dedupedVariants.set(variantKey, variant)
          continue
        }

        if (
          toComparableTimestamp(variant.evaluation.retrieved_timestamp) >=
          toComparableTimestamp(existingVariant.evaluation.retrieved_timestamp)
        ) {
          dedupedVariants.set(variantKey, variant)
        }
      }

      group.variants = Array.from(dedupedVariants.values())
      group.variants.sort((a, b) => b.normalizedScore - a.normalizedScore)
      group.avgNormalizedScore =
        group.variants.reduce((sum, variant) => sum + variant.normalizedScore, 0) / group.variants.length
      group.avgDisplayScore = `${(group.avgNormalizedScore * 100).toFixed(1)}%`

      const rankedVariants = group.variants
        .filter((variant) => variant.rankRatio != null)
        .sort((a, b) => (a.rankRatio ?? Number.POSITIVE_INFINITY) - (b.rankRatio ?? Number.POSITIVE_INFINITY))

      group.bestRankPosition = rankedVariants[0]?.rankPosition ?? null
      group.bestRankTotal = rankedVariants[0]?.rankTotal ?? null
      group.bestRankRatio = rankedVariants[0]?.rankRatio ?? null
      return group
    })
    .sort((a, b) => b.avgNormalizedScore - a.avgNormalizedScore)
}

function getEvaluationVariantLabel(evaluation: BenchmarkEvaluation) {
  const evaluationIdWithoutTimestamp = evaluation.evaluation_id.replace(/\/[^/]+$/, "")
  const modelSlug = evaluation.model_info.id.replace(/\//g, "_")

  let evaluationPrefix = evaluationIdWithoutTimestamp

  if (evaluationPrefix.endsWith(`__${modelSlug}`)) {
    evaluationPrefix = evaluationPrefix.slice(0, -(`__${modelSlug}`.length))
  } else if (evaluationPrefix.endsWith(`/${modelSlug}`)) {
    evaluationPrefix = evaluationPrefix.slice(0, -(`/${modelSlug}`.length))
  }

  const benchmarkName = evaluation.benchmark

  if (benchmarkName && evaluationPrefix.startsWith(`${benchmarkName}/`)) {
    const variant = evaluationPrefix.slice(benchmarkName.length + 1)
    return variant.split("/").filter(Boolean).pop() || null
  }

  if (benchmarkName && evaluationPrefix === benchmarkName) {
    return null
  }

  return evaluationPrefix.split("/").filter(Boolean).pop() || null
}

export function BenchmarkDetail({ summary, benchmarkCards }: BenchmarkDetailProps) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const [benchmarkSearch, setBenchmarkSearch] = useState("")
  const [benchmarkSort, setBenchmarkSort] = useState<"rank" | "score" | "name" | "variants" | "spread">("rank")
  const [selectedCategories, setSelectedCategories] = useState<CategoryType[]>([])
  const [showWithoutMetadata, setShowWithoutMetadata] = useState(false)
  const modelId = summary.model_info.id

  const [peerRanks, setPeerRanks] = useState<PeerRanksMap>({})

  // Load peer-ranks.json once and store in state so the table can use them
  useEffect(() => {
    loadPeerRanks().then(setPeerRanks)
  }, [])

  const allEvaluations = useMemo(
    () => Object.values(summary.evaluations_by_category).flat(),
    [summary.evaluations_by_category]
  )
  
  const reportingStats = useMemo(() => {
    const organizations = new Set<string>()
    const sourceTypes = new Set<string>()
    const libraries = new Set<string>()
    let missingGenerationConfigs = 0
    let thirdPartyEvaluations = 0

    allEvaluations.forEach((evaluation) => {
      organizations.add(evaluation.source_metadata.source_organization_name)
      sourceTypes.add(evaluation.source_metadata.source_type)
      if (evaluation.eval_library?.name) {
        libraries.add(`${evaluation.eval_library.name}${evaluation.eval_library.version ? ` ${evaluation.eval_library.version}` : ""}`)
      }
      if (evaluation.source_metadata.evaluator_relationship === "third_party") {
        thirdPartyEvaluations += 1
      }
      missingGenerationConfigs += evaluation.evaluation_results.filter((result) => !result.generation_config).length
    })

    return {
      organizationNames: Array.from(organizations).sort((a, b) => a.localeCompare(b)),
      organizationCount: organizations.size,
      sourceTypeCount: sourceTypes.size,
      libraryCount: libraries.size,
      libraryList: Array.from(libraries).sort((a, b) => a.localeCompare(b)),
      missingGenerationConfigs,
      thirdPartyEvaluations,
    }
  }, [allEvaluations])

  const allCategoryResults = useMemo(
    () =>
      Object.entries(summary.evaluations_by_category).flatMap(([category, evals]) =>
        evals.flatMap((evaluation) =>
          evaluation.evaluation_results.flatMap((result) => {
            let resultCategory: CategoryType | undefined

            if (result.factsheet?.functional_props) {
              const props = result.factsheet.functional_props.split(";").map((prop) => prop.trim())
              if (props.includes(category)) {
                resultCategory = category as CategoryType
              }
            }

            if (!resultCategory) {
              const inferred = inferCategoryFromBenchmark(result.evaluation_name)
              if (inferred === category) {
                resultCategory = inferred
              }
            }

            return resultCategory === category
              ? [{ evaluation, result, category: category as CategoryType }]
              : []
          })
        )
      ),
    [summary.evaluations_by_category]
  )

  const policyHighlights = useMemo(() => {
    const groups = buildBenchmarkGroups(allCategoryResults, benchmarkCards)
    const seenLabels = new Set<string>()

    return groups
      .filter((group) => {
        const narrative = getPolicyBenchmarkNarrative(group.title)

        if (seenLabels.has(narrative.label)) {
          return false
        }

        seenLabels.add(narrative.label)
        return true
      })
      .slice(0, 6)
      .map((group) => {
      const narrative = getPolicyBenchmarkNarrative(group.title)
      const level = getPolicySignalLevel(group.avgNormalizedScore)

      return {
        key: group.key,
        title: group.title,
        label: narrative.label,
        description: narrative.description,
        scoreText: `${(group.avgNormalizedScore * 100).toFixed(0)}%`,
        level,
      }
    })
  }, [allCategoryResults, benchmarkCards])

  const policySummary = useMemo(() => {
    const benchmarkCount = new Set(
      allCategoryResults.map((entry) => getBenchmarkDisplayName(getResultBenchmarkName(entry.evaluation, entry.result)))
    ).size
    const allThirdParty =
      allEvaluations.length > 0 && reportingStats.thirdPartyEvaluations === allEvaluations.length
    const leadOrganization = reportingStats.organizationNames[0]
    const modelScaleDescription = getModelScaleDescription(summary.model_info.additional_details?.params_billions)
    const compactParamCount = formatParamsBillions(summary.model_info.additional_details?.params_billions)
    const compactModelName = compactParamCount ? `${summary.model_info.name} · ${compactParamCount}` : summary.model_info.name

    let testedByCopy = `Reported across ${benchmarkCount} standardized benchmark${benchmarkCount === 1 ? "" : "s"}.`
    if (leadOrganization && reportingStats.organizationCount === 1) {
      testedByCopy = allThirdParty
        ? `Tested by ${leadOrganization} — an independent third party, not the model's developer — using ${benchmarkCount} standardized benchmark${benchmarkCount === 1 ? "" : "s"}.`
        : `Reported by ${leadOrganization} using ${benchmarkCount} standardized benchmark${benchmarkCount === 1 ? "" : "s"}.`
    } else if (leadOrganization) {
      testedByCopy = allThirdParty
        ? `Tested by ${leadOrganization} and ${reportingStats.organizationCount - 1} other reporting organization${reportingStats.organizationCount - 1 === 1 ? "" : "s"} using ${benchmarkCount} standardized benchmark${benchmarkCount === 1 ? "" : "s"}.`
        : `Reported by ${reportingStats.organizationCount} organizations using ${benchmarkCount} benchmark views.`
    }

    const reproducibilityCopy =
      reportingStats.missingGenerationConfigs === 0
        ? null
        : reportingStats.missingGenerationConfigs === summary.total_evaluations
          ? "How this model was prompted during testing is not documented. Scores cannot be independently confirmed."
          : "How this model was prompted during testing is missing for some reported results. Score differences may not be fully attributable to model capability alone."

    const comparabilityCopy =
      reportingStats.missingGenerationConfigs > 0
        ? `${benchmarkCount > 0 ? `These results cover ${benchmarkCount} benchmark${benchmarkCount === 1 ? "" : "s"},` : "These results"} but missing prompting details mean apparent score gaps may partly reflect setup differences, not just capability.`
        : "Shared benchmark coverage helps, but evaluator choices, benchmark mix, and model size can still limit direct apples-to-apples comparison."

    const sizeCaveat =
      modelScaleDescription
        ? `${modelScaleDescription}. Comparisons against much smaller or larger systems should be interpreted with care.`
        : null

    return {
      compactModelName,
      modelScaleDescription,
      testedByCopy,
      reproducibilityCopy,
      comparabilityCopy,
      sizeCaveat,
      independentlyVerified: allThirdParty || reportingStats.thirdPartyEvaluations > 0,
      benchmarkCount,
    }
  }, [
    allCategoryResults,
    allEvaluations.length,
    reportingStats,
    summary.model_info.additional_details?.params_billions,
    summary.model_info.name,
    summary.total_evaluations,
  ])

  const benchmarkGroups = useMemo(
    () => buildBenchmarkGroups(allCategoryResults, benchmarkCards),
    [allCategoryResults, benchmarkCards]
  )
  const availableCategories = useMemo(() => {
    const presentCategories = new Set(benchmarkGroups.map((group) => group.category))
    return summary.categories_covered.filter((category) => presentCategories.has(category))
  }, [benchmarkGroups, summary.categories_covered])

  const filteredBenchmarkGroups = useMemo(() => {
    const query = benchmarkSearch.trim().toLowerCase()
    const filtered = benchmarkGroups.filter((group) => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(group.category)) {
        return false
      }

      if (!query) {
        return true
      }

      return (
        group.title.toLowerCase().includes(query) ||
        group.description.toLowerCase().includes(query) ||
        group.variants.some((variant) => variant.label.toLowerCase().includes(query))
      )
    })

    // Metadata-first: always put groups with a benchmarkCard at the top
    const withCard = filtered.filter((g) => !!g.benchmarkCard)
    const withoutCard = filtered.filter((g) => !g.benchmarkCard)

    const sortFn = (a: BenchmarkGroup, b: BenchmarkGroup) => {
      switch (benchmarkSort) {
        case "rank": {
          const aRank = getGroupPeerRank(a, modelId, peerRanks)
          const bRank = getGroupPeerRank(b, modelId, peerRanks)
          // Unranked groups go to the bottom
          if (aRank == null && bRank == null) return b.avgNormalizedScore - a.avgNormalizedScore
          if (aRank == null) return 1
          if (bRank == null) return -1
          const aRatio = aRank.total > 0 ? aRank.position / aRank.total : aRank.position
          const bRatio = bRank.total > 0 ? bRank.position / bRank.total : bRank.position
          return aRatio - bRatio || b.avgNormalizedScore - a.avgNormalizedScore
        }
        case "name": return a.title.localeCompare(b.title)
        case "variants": return b.variants.length - a.variants.length || b.avgNormalizedScore - a.avgNormalizedScore
        case "spread": return getBenchmarkSpread(b) - getBenchmarkSpread(a) || b.avgNormalizedScore - a.avgNormalizedScore
        default: return b.avgNormalizedScore - a.avgNormalizedScore
      }
    }

    withCard.sort(sortFn)
    withoutCard.sort(sortFn)

    return showWithoutMetadata ? [...withCard, ...withoutCard] : withCard
  }, [benchmarkGroups, benchmarkSearch, benchmarkSort, selectedCategories, showWithoutMetadata, modelId, peerRanks])

  const groupedFilteredBenchmarkGroups = useMemo(() => {
    const order = new Map(summary.categories_covered.map((category, index) => [category, index]))
    const groups = new Map<CategoryType, BenchmarkGroup[]>()

    for (const benchmarkGroup of filteredBenchmarkGroups) {
      const bucket = groups.get(benchmarkGroup.category) ?? []
      bucket.push(benchmarkGroup)
      groups.set(benchmarkGroup.category, bucket)
    }

    return Array.from(groups.entries())
      .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999))
      .map(([category, groups]) => ({ category, groups }))
  }, [filteredBenchmarkGroups, summary.categories_covered])


  const overviewBenchmarkGroups =
    selectedCategories.length > 0 || benchmarkSearch.trim()
      ? filteredBenchmarkGroups
      : benchmarkGroups

  const rankedBenchmarkGroups = useMemo(
    () => overviewBenchmarkGroups.filter((group) => getGroupPeerRank(group, modelId, peerRanks) != null),
    [overviewBenchmarkGroups, modelId, peerRanks]
  )
  const strongRankedBenchmarks = useMemo(
    () =>
      [...rankedBenchmarkGroups]
        .sort((a, b) => {
          const aRank = getGroupPeerRank(a, modelId, peerRanks)
          const bRank = getGroupPeerRank(b, modelId, peerRanks)
          const aRatio = aRank ? aRank.position / (aRank.total || aRank.position) : Number.POSITIVE_INFINITY
          const bRatio = bRank ? bRank.position / (bRank.total || bRank.position) : Number.POSITIVE_INFINITY
          return aRatio - bRatio
        })
        .slice(0, 3),
    [rankedBenchmarkGroups, modelId, peerRanks]
  )
  const weakRankedBenchmarks = useMemo(
    () =>
      [...rankedBenchmarkGroups]
        .sort((a, b) => {
          const aRank = getGroupPeerRank(a, modelId, peerRanks)
          const bRank = getGroupPeerRank(b, modelId, peerRanks)
          const aRatio = aRank ? aRank.position / (aRank.total || aRank.position) : Number.NEGATIVE_INFINITY
          const bRatio = bRank ? bRank.position / (bRank.total || bRank.position) : Number.NEGATIVE_INFINITY
          return bRatio - aRatio
        })
        .slice(0, 3),
    [rankedBenchmarkGroups, modelId, peerRanks]
  )
  const repeatedBenchmarkCount = overviewBenchmarkGroups.filter((group) => group.variants.length > 1).length
  const setupDrivenBenchmarkCount = overviewBenchmarkGroups.filter((group) =>
    group.variants.some((variant) => variant.variantType === "setup" || variant.variantType === "setup+subtask")
  ).length
  const subtaskDrivenBenchmarkCount = overviewBenchmarkGroups.filter((group) =>
    group.variants.some((variant) => variant.variantType === "subtask" || variant.variantType === "setup+subtask")
  ).length

  useEffect(() => {
    setSelectedCategories((current) =>
      current.filter((category) => availableCategories.includes(category))
    )
  }, [availableCategories])

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return isoString
    }
  }

  const jumpToDeepDive = (groupKey: string) => {
    const anchorId = getDeepDiveAnchorId(groupKey)
    requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }
  
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-border/60 bg-background/80 text-[11px] uppercase tracking-[0.18em]">
                  Model Metadata
                </Badge>
                {formatParamsBillions(summary.model_info.additional_details?.params_billions) && (
                  <Badge variant="secondary" className="font-normal">
                    {formatParamsBillions(summary.model_info.additional_details?.params_billions)}
                  </Badge>
                )}
                <Badge variant="secondary" className="font-normal">
                  {summary.model_info.architecture || summary.model_info.inference_engine || "Model"}
                </Badge>
              </div>

              <div className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight sm:text-[1.9rem]">{summary.model_info.name}</div>
                <div className="text-sm text-muted-foreground">
                  {summary.model_info.developer}
                  {policySummary.modelScaleDescription ? ` · ${policySummary.modelScaleDescription}` : ""}
                </div>
              </div>

              {!isResearchView && (
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {policySummary.testedByCopy}
                </p>
              )}
            </div>

            <div className="grid w-full gap-2.5 sm:grid-cols-2 xl:w-[620px] xl:grid-cols-4">
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/80 px-3.5 py-2.5 dark:border-sky-900/40 dark:bg-sky-950/20 dark:shadow-none">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-sky-700 dark:text-sky-200 whitespace-nowrap">Benchmarks</div>
                <div className="mt-1 text-[1.8rem] font-semibold leading-none text-sky-950 dark:text-sky-50">{benchmarkGroups.length}</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 px-3.5 py-2.5 dark:shadow-none">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground whitespace-nowrap">Results</div>
                <div className="mt-1 text-[1.8rem] font-semibold leading-none">{summary.total_evaluations}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-3.5 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:shadow-none">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-emerald-700 dark:text-emerald-200 whitespace-nowrap">
                  Reporting orgs
                </div>
                <div className="mt-1 text-[1.8rem] font-semibold leading-none text-emerald-950 dark:text-emerald-50">
                  {reportingStats.organizationCount}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3.5 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20 dark:shadow-none">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-amber-700 dark:text-amber-200 whitespace-nowrap">
                  Source types
                </div>
                <div className="mt-1 text-[1.8rem] font-semibold leading-none text-amber-950 dark:text-amber-50">
                  {reportingStats.sourceTypeCount}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)]">
            <div className="rounded-[1.5rem] border bg-muted/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                System and evidence context
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">System ID</dt>
                  <dd className="mt-1 break-words font-mono text-[13px]">{summary.model_info.id}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Version</dt>
                  <dd className="mt-1 font-medium">{summary.model_info.model_version || "N/A"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Deployment</dt>
                  <dd className="mt-1 font-medium">
                    {summary.model_info.additional_details?.deployment_context || "General Purpose"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Release</dt>
                  <dd className="mt-1 font-medium">
                    {summary.model_info.release_date ? formatDate(summary.model_info.release_date).split(",")[0] : "Unknown"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Modalities</dt>
                  <dd className="mt-1 font-medium">
                    {(summary.model_info.modalities?.input?.join(", ") || "Text")}/{(summary.model_info.modalities?.output?.join(", ") || "Text")}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Updated</dt>
                  <dd className="mt-1 font-medium">{formatDate(summary.last_updated).split(",")[0]}</dd>
                </div>
                {summary.model_info.model_url && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Reference</dt>
                    <dd className="mt-1">
                      <a
                        href={summary.model_info.model_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 break-all text-sm font-medium text-primary underline decoration-dotted underline-offset-4 hover:text-primary/80"
                      >
                        {summary.model_info.model_url.replace(/^https?:\/\//, "")}
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {isResearchView ? (
              <div className="rounded-[1.5rem] border bg-background p-4">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-primary" />
                  <div className="text-sm font-semibold">Research lens</div>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {reportingStats.missingGenerationConfigs > 0
                    ? `${reportingStats.missingGenerationConfigs} result entries are missing generation configuration, so some score differences may reflect setup choices rather than model capability alone.`
                    : "Generation configuration is present across the current result set, which makes cross-slice comparison more trustworthy."}
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-3">
                    <span className="text-muted-foreground">Eval libraries</span>
                    <span className="max-w-[60%] text-right font-medium">
                      {reportingStats.libraryList.length > 0 ? reportingStats.libraryList.join(", ") : "Not recorded"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-3">
                    <span className="text-muted-foreground">Evidence sources</span>
                    <span className="max-w-[60%] text-right font-medium">
                      {reportingStats.organizationCount} orgs / {reportingStats.sourceTypeCount} types
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-3">
                    <span className="text-muted-foreground">Reported decomposition</span>
                    <span className="max-w-[60%] text-right font-medium">
                      {setupDrivenBenchmarkCount} setup-aware · {subtaskDrivenBenchmarkCount} subtask-aware
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border bg-amber-50/60 p-4 dark:bg-amber-950/20">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-primary" />
                  <div className="text-sm font-semibold">Public reading</div>
                </div>
                {policySummary.reproducibilityCopy && (
                  <div className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                    <span className="font-semibold">Reproducibility gap.</span> {policySummary.reproducibilityCopy}
                  </div>
                )}
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <p>{policySummary.comparabilityCopy}</p>
                  {policySummary.sizeCaveat && <p>{policySummary.sizeCaveat}</p>}
                </div>
                {policyHighlights.length > 0 && (
                  <div className="mt-4 border-t border-border/60 pt-3">
                    <div className="mb-2 flex items-center gap-2">
                      <BookOpenText className="h-4 w-4 text-rose-600" />
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">What was tested</div>
                    </div>
                    <div className="space-y-2">
                      {policyHighlights.slice(0, 3).map((item) => (
                        <div key={item.key} className="flex items-start justify-between gap-3 rounded-2xl bg-background/70 px-3 py-2.5">
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{item.label}</div>
                            <div className="text-xs text-muted-foreground">{item.description}</div>
                          </div>
                          <Badge className={item.level.tone}>{item.scoreText}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold">
              {isResearchView ? "Benchmark Explorer" : "Reported Benchmark Signals"}
            </h3>
            <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">
              {isResearchView
                ? "A benchmark-first view of this model's reported results, with setup spread and subtask-vs-setup differences surfaced up front."
                : "A benchmark-first view of the public evidence behind this model, with the strongest and most variable signals grouped in one place."}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-end">
            <div className="relative w-full sm:w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={benchmarkSearch}
                onChange={(event) => setBenchmarkSearch(event.target.value)}
                placeholder="Search benchmarks or setups"
                className="pl-9"
              />
            </div>

            <Select value={benchmarkSort} onValueChange={(value) => setBenchmarkSort(value as typeof benchmarkSort)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Sort benchmarks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rank">Best rank first</SelectItem>
                <SelectItem value="score">Highest score first</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
                <SelectItem value="variants">Most subtasks</SelectItem>
                <SelectItem value="spread">Largest setup swing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {availableCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Category
            </span>
            <button
              type="button"
              onClick={() => setSelectedCategories([])}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                selectedCategories.length === 0
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {availableCategories.map((category) => {
              const isSelected = selectedCategories.includes(category)

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() =>
                    setSelectedCategories((current) =>
                      current.includes(category)
                        ? current.filter((item) => item !== category)
                        : [...current, category]
                    )
                  }
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    isSelected
                      ? getCategoryTone(category)
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {category}
                </button>
              )
            })}
          </div>
        )}

        {/* Metadata toggle */}
        {benchmarkGroups.some((g) => !g.benchmarkCard) && (
          <div className="flex items-center gap-2 text-sm">
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={showWithoutMetadata}
                onChange={(e) => setShowWithoutMetadata(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-muted-foreground">
                Show {benchmarkGroups.filter((g) => !g.benchmarkCard).length} benchmarks without rich metadata
              </span>
            </label>
            <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {benchmarkGroups.filter((g) => !!g.benchmarkCard).length} with metadata
            </span>
          </div>
        )}

        <div className={`grid gap-3 ${isResearchView ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}>
          <div className="rounded-2xl border bg-emerald-50/70 p-3.5 dark:bg-emerald-950/20">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/90 dark:text-emerald-300">
              Strong scores
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {strongRankedBenchmarks.length > 0 ? (
                strongRankedBenchmarks.map((group) => {
                  const rank = getGroupPeerRank(group, modelId, peerRanks)
                  return (
                    <button
                      key={`strong-${group.key}`}
                      type="button"
                      onClick={() => jumpToDeepDive(group.key)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-background px-2.5 py-1 text-xs font-medium text-emerald-900 hover:border-emerald-300 dark:border-emerald-900/60 dark:text-emerald-100"
                    >
                      <span className="truncate max-w-[14rem]">{group.title}</span>
                      {rank && (
                        <span className="tabular-nums text-emerald-700/80 dark:text-emerald-300/80">
                          #{rank.position}{rank.total ? `/${rank.total}` : ""}
                        </span>
                      )}
                    </button>
                  )
                })
              ) : (
                <div className="text-xs text-muted-foreground">No ranked benchmarks available for this model yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-rose-50/70 p-3.5 dark:bg-rose-950/20">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700/90 dark:text-rose-300">
              Weak scores
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {weakRankedBenchmarks.length > 0 ? (
                weakRankedBenchmarks.map((group) => {
                  const rank = getGroupPeerRank(group, modelId, peerRanks)
                  return (
                    <button
                      key={`weak-${group.key}`}
                      type="button"
                      onClick={() => jumpToDeepDive(group.key)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-background px-2.5 py-1 text-xs font-medium text-rose-900 hover:border-rose-300 dark:border-rose-900/60 dark:text-rose-100"
                    >
                      <span className="truncate max-w-[14rem]">{group.title}</span>
                      {rank && (
                        <span className="tabular-nums text-rose-700/80 dark:text-rose-300/80">
                          #{rank.position}{rank.total ? `/${rank.total}` : ""}
                        </span>
                      )}
                    </button>
                  )
                })
              ) : (
                <div className="text-xs text-muted-foreground">No ranked benchmarks available for this model yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-sky-50/70 p-3.5 dark:bg-sky-950/20">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700/90 dark:text-sky-300">
              Coverage Snapshot
            </div>
            <div className="mt-1.5 text-sm font-semibold tracking-tight">{benchmarkGroups.length} benchmarks</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {repeatedBenchmarkCount} benchmark{repeatedBenchmarkCount === 1 ? "" : "s"} include multiple subtasks.
                </div>
            <div className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-300">
              {filteredBenchmarkGroups.length} shown after filters
            </div>
          </div>
        </div>

        {filteredBenchmarkGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No benchmarks match the current search or category filters.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(180px,1fr)_84px] items-center border-b bg-muted/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <div>Benchmark</div>
                <div className="text-right">Accuracy</div>
                <div className="text-right">Rank</div>
              </div>

              <div className="divide-y">
                {groupedFilteredBenchmarkGroups.map(({ category, groups }) => (
                  <div key={`matrix-cat-${category}`}>
                    <div className="bg-muted/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {category}
                    </div>
                    {groups.map((group) => {
                      const scorePercent = Math.max(4, Math.min(100, group.avgNormalizedScore * 100))
                      const rank = getGroupPeerRank(group, modelId, peerRanks)

                      return (
                        <div key={`compact-${group.key}`} className="grid grid-cols-[minmax(0,1.55fr)_minmax(180px,1fr)_84px] items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => jumpToDeepDive(group.key)}
                              className="truncate text-left text-sm font-semibold underline decoration-dotted underline-offset-4 hover:text-primary"
                            >
                              {group.title}
                            </button>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2.5">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-foreground/80" style={{ width: `${scorePercent}%` }} />
                              </div>
                              <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
                                {group.avgDisplayScore}
                              </span>
                            </div>
                          </div>

                          <div className="text-right text-xs tabular-nums text-muted-foreground">
                            {rank != null
                              ? `#${rank.position}${rank.total ? `/${rank.total}` : ""}`
                              : Object.keys(peerRanks).length === 0 ? "…" : "—"}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Deep dive by category
              </div>
              <div className="text-xs text-muted-foreground">
                Open details to inspect setup, provenance, and sample-level evidence
              </div>
            </div>

            {groupedFilteredBenchmarkGroups.map(({ category, groups }, sectionIndex) => (
              <section key={category} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getCategoryTone(category)}`}>
                    {category}
                  </span>
                  <div className="text-sm text-muted-foreground">
                    {groups.length} benchmark{groups.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {groups.map((group, index) => (
                    <BenchmarkDeepDiveCardModal
                      key={`${category}-${group.key}`}
                      group={group}
                      anchorId={getDeepDiveAnchorId(group.key)}
                      motionIndex={sectionIndex * 6 + index}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SampleDataDialog({ 
  samples, 
  evaluationName 
}: { 
  samples: any[], 
  evaluationName: string 
}) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const filteredSamples = samples.filter(sample => 
    sample.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sample.response.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sample.ground_truth.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalPages = Math.ceil(filteredSamples.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const currentSamples = filteredSamples.slice(startIndex, startIndex + itemsPerPage)

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Database className="h-4 w-4" />
          View All {samples.length} Samples
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Sample Level Data</DialogTitle>
          <DialogDescription>
            Detailed results for {samples.length} samples from {evaluationName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center py-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search samples..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredSamples.length)} of {filteredSamples.length}
          </div>
        </div>

        <div className="flex-1 border rounded-md overflow-hidden">
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead className="min-w-[300px]">Input</TableHead>
                  <TableHead className="min-w-[300px]">Model Response</TableHead>
                  <TableHead className="min-w-[300px]">Ground Truth</TableHead>
                  <TableHead className="w-[100px] text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentSamples.length > 0 ? (
                  currentSamples.map((sample, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs align-top">
                        {sample.sample_id || idx}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="whitespace-pre-wrap text-xs font-mono max-h-[200px] overflow-y-auto">
                          {sample.input}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="whitespace-pre-wrap text-xs text-blue-600 dark:text-blue-400 max-h-[200px] overflow-y-auto">
                          {sample.response}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="whitespace-pre-wrap text-xs text-green-600 dark:text-green-400 max-h-[200px] overflow-y-auto">
                          {sample.ground_truth}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <div className="font-semibold text-sm">
                          {typeof sample.score === 'number' ? (sample.score * 100).toFixed(1) + '%' : sample.score || 'N/A'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No results found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <div className="text-sm font-medium">
            Page {currentPage} of {totalPages || 1}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
          >
            Next
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BenchmarkResultCard({ 
  evaluation, 
  result,
  titleOverride,
  showSetupBadge = true,
}: { 
  evaluation: BenchmarkEvaluation, 
  result: EvaluationResult 
  titleOverride?: string
  showSetupBadge?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)

  const randomSample = useMemo(() => {
    const samples = evaluation.detailed_evaluation_results_per_samples;
    if (!samples || samples.length === 0) return null;
    // Use a simple hash of the evaluation ID to pick a consistent "random" sample for this session
    // or just Math.random() if we don't mind it changing on refresh
    const randomIndex = Math.floor(Math.random() * samples.length);
    return samples[randomIndex];
  }, [evaluation.detailed_evaluation_results_per_samples]);

  const formatDate = (timestamp: string) => {
    try {
      // Handle unix timestamp (seconds or milliseconds)
      const ts = parseFloat(timestamp)
      const date = new Date(ts > 10000000000 ? ts : ts * 1000)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return timestamp
    }
  }

  const { score } = result.score_details
  const { min_score = 0, max_score = 1, unit, lower_is_better } = result.metric_config
  const detailEntries = result.score_details.details
    ? Object.entries(result.score_details.details)
    : []
  const numericBreakdown = detailEntries.filter(([, value]) => typeof value === "number")
  const structuredBreakdown = detailEntries.filter(([, value]) => typeof value !== "number")
  
  // Normalize to 0-1 for color coding
  let normalized = (score - min_score) / (max_score - min_score)
  if (lower_is_better) normalized = 1 - normalized
  
  const isHigh = normalized >= 0.8
  const isMedium = normalized >= 0.6
  
  let displayScore = score.toFixed(2)
  let displayUnit = unit || "Accuracy"
  const evaluationVariant = getEvaluationVariantLabel(evaluation)
  
  if (unit === 'accuracy' || !unit) {
      displayScore = (score * 100).toFixed(1) + "%"
      displayUnit = "Accuracy"
  } else if (unit === 'points') {
      displayScore = score.toFixed(1)
      displayUnit = "/ 10"
  } else if (unit === 'pass@1') {
      displayScore = (score * 100).toFixed(1) + "%"
      displayUnit = "Pass@1"
  } else {
      displayUnit = unit.charAt(0).toUpperCase() + unit.slice(1)
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden border-l-4 border-l-primary">
        <div className="bg-card p-4 flex justify-between items-center">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{titleOverride || getResultDisplayName(evaluation, result)}</h3>
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                {result.metric_config.score_type}
              </Badge>
              {showSetupBadge && evaluationVariant && (
                <Badge variant="secondary" className="text-xs font-normal">
                  Setup: {evaluationVariant}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-1 line-clamp-1">{result.metric_config.evaluation_description}</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-2xl font-bold">{displayScore}</div>
              <div className="text-xs text-muted-foreground">{displayUnit}</div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-9 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="sr-only">Toggle details</span>
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <Separator />
          <CardContent className="p-6 space-y-6 bg-muted/5">
            {/* Source Provenance */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-4 w-4 text-primary" />
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source Provenance</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/10 p-4 rounded-lg border">
                {/* Source Metadata */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-primary/80">Evaluator Metadata</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Organization:</span>
                      <span className="font-medium">{evaluation.source_metadata.source_organization_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Relationship:</span>
                      <Badge variant="outline" className="text-xs">{evaluation.source_metadata.evaluator_relationship}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Source Type:</span>
                      <span className="capitalize">{evaluation.source_metadata.source_type.replace(/_/g, ' ')}</span>
                    </div>
                    {evaluationVariant && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Evaluation Setup:</span>
                        <span>{evaluationVariant}</span>
                      </div>
                    )}
                    {evaluation.source_metadata.source_url && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">URL:</span>
                        <a href={evaluation.source_metadata.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                          Link <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date:</span>
                      <span>{formatDate(evaluation.retrieved_timestamp)}</span>
                    </div>
                  </div>
                </div>

                {/* Source Data */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-primary/80">Dataset Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-medium">
                        {Array.isArray(evaluation.source_data) ? 'Multiple Sources' : evaluation.source_data.dataset_name}
                      </span>
                    </div>
                    {!Array.isArray(evaluation.source_data) && (
                      <>
                        {evaluation.source_data.hf_repo && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">HuggingFace:</span>
                            <a href={`https://huggingface.co/${evaluation.source_data.hf_repo}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                              {evaluation.source_data.hf_repo.split('/')[1] || evaluation.source_data.hf_repo} <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {evaluation.source_data.hf_split && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Split:</span>
                            <code className="bg-muted px-1 rounded text-xs">{evaluation.source_data.hf_split}</code>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Samples:</span>
                          <span>{evaluation.source_data.samples_number?.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Evaluation Results */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Evaluation Results</div>
              
              <div className="bg-background rounded-lg p-4 border">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <div className="font-medium text-lg">Overall Score</div>
                    <div className="text-xs text-muted-foreground">
                      {result.metric_config.score_type} • {result.metric_config.min_score}-{result.metric_config.max_score} • {result.metric_config.lower_is_better ? 'Lower is better' : 'Higher is better'}
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-primary">{displayScore}</div>
                </div>
                <Progress value={normalized * 100} className="h-2 mb-4" />
                
                {detailEntries.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="mb-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detailed Breakdown</div>
                      <div className="text-xs text-muted-foreground mt-1">Scores and structured metadata for individual subtasks or metrics</div>
                    </div>

                    {numericBreakdown.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {numericBreakdown.map(([key, value]) => {
                        let valDisplay = typeof value === 'number' ? value.toFixed(2) : value;
                        let normalized_subtask = 0;
                        
                        if (typeof value === 'number') {
                            if (unit === 'accuracy' || !unit || unit === 'pass@1') {
                                valDisplay = (value * 100).toFixed(1) + "%";
                                normalized_subtask = value;
                            } else {
                                valDisplay = value.toFixed(2);
                                normalized_subtask = (value - min_score) / (max_score - min_score);
                            }
                        }
                        
                        // Format the key nicely
                        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        
                        return (
                        <div key={key} className="bg-muted/30 p-3 rounded border min-w-0">
                          <div className="text-xs text-muted-foreground mb-1 truncate" title={formattedKey}>{formattedKey}</div>
                          <div className="font-semibold text-lg">
                            {valDisplay}
                          </div>
                          {typeof value === 'number' && (
                            <Progress value={normalized_subtask * 100} className="h-1 mt-2" />
                          )}
                        </div>
                      )})}
                      </div>
                    )}

                    {structuredBreakdown.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Structured Detail Fields
                        </div>
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[240px]">Field</TableHead>
                                <TableHead>Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {structuredBreakdown.map(([key, value]) => {
                                const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                const formattedValue = formatMetadataValue(value) ?? "N/A"

                                return (
                                  <TableRow key={key}>
                                    <TableCell className="align-top whitespace-normal text-sm font-medium">
                                      {formattedKey}
                                    </TableCell>
                                    <TableCell className="align-top whitespace-normal">
                                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 text-xs leading-5">
                                        {formattedValue}
                                      </pre>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Factsheet Information */}
            {result.factsheet && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileCode className="h-4 w-4 text-primary" />
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Benchmark Factsheet</div>
                </div>
                
                <div className="grid grid-cols-1 gap-6 bg-background p-6 rounded-lg border">
                  {/* General Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {result.factsheet.purpose && (
                      <div className="col-span-full">
                        <span className="font-semibold text-sm block mb-1">Purpose</span>
                        <p className="text-sm text-muted-foreground">{result.factsheet.purpose}</p>
                      </div>
                    )}
                    {result.factsheet.principles_tested && (
                      <div className="col-span-full">
                        <span className="font-semibold text-sm block mb-1">Principles Tested</span>
                        <p className="text-sm text-muted-foreground">{result.factsheet.principles_tested}</p>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Methodology */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3 text-primary/80">Methodology</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      {result.factsheet.judge && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Judge</span>
                          <span>{result.factsheet.judge}</span>
                        </div>
                      )}
                      {result.factsheet.protocol && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Protocol</span>
                          <span>{result.factsheet.protocol}</span>
                        </div>
                      )}
                      {result.factsheet.model_access && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Model Access</span>
                          <span>{result.factsheet.model_access}</span>
                        </div>
                      )}
                      {result.factsheet.input_modality && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Input Modality</span>
                          <span>{result.factsheet.input_modality}</span>
                        </div>
                      )}
                      {result.factsheet.output_modality && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Output Modality</span>
                          <span>{result.factsheet.output_modality}</span>
                        </div>
                      )}
                      {result.factsheet.design && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Design</span>
                          <span>{result.factsheet.design}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Data & Validation */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3 text-primary/80">Data & Validation</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {result.factsheet.size && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Size</span>
                          <span>{result.factsheet.size}</span>
                        </div>
                      )}
                      {result.factsheet.splits && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Splits</span>
                          <span>{result.factsheet.splits}</span>
                        </div>
                      )}
                      {result.factsheet.has_heldout !== undefined && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Held-out Set</span>
                          <Badge variant={result.factsheet.has_heldout ? "default" : "secondary"}>
                            {result.factsheet.has_heldout ? "Yes" : "No"}
                          </Badge>
                        </div>
                      )}
                      {result.factsheet.is_valid !== undefined && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Valid</span>
                          <Badge variant={result.factsheet.is_valid ? "outline" : "destructive"}>
                            {result.factsheet.is_valid ? "Yes" : "No"}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Limitations */}
                  {result.factsheet.known_limitations && (
                    <>
                      <Separator />
                      <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded border border-red-100 dark:border-red-900/20">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="font-semibold text-sm">Known Limitations</span>
                        </div>
                        <p className="text-sm text-red-600/90 dark:text-red-400/90">{result.factsheet.known_limitations}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Generation Configuration */}
            {result.generation_config && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="h-4 w-4 text-primary" />
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generation Configuration</div>
                </div>
                
                <div className="bg-slate-950 text-slate-200 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  {result.generation_config.additional_details && (
                    <div className="mb-4 pb-4 border-b border-slate-800">
                      <div className="text-slate-500 text-xs uppercase mb-1">Description</div>
                      <div className="whitespace-pre-wrap">
                        {formatMetadataValue(result.generation_config.additional_details)}
                      </div>
                    </div>
                  )}
                  
                  {result.generation_config.generation_args && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(result.generation_config.generation_args).map(([key, value]) => (
                        <div key={key}>
                          <div className="text-slate-500 text-xs">{key}</div>
                          <div className="text-emerald-400 whitespace-pre-wrap break-words">
                            {formatMetadataValue(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sample Level Data */}
            {evaluation.detailed_evaluation_results_per_samples && evaluation.detailed_evaluation_results_per_samples.length > 0 && randomSample && (
              <div>
                <Separator className="my-6" />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-primary" />
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sample Level Data (Random Sample)</div>
                  </div>
                  <Badge variant="outline">{evaluation.detailed_evaluation_results_per_samples.length} Samples</Badge>
                </div>

                <div className="space-y-4">
                  <div className="bg-muted/10 border rounded-lg p-4 text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="secondary" className="font-mono text-xs">ID: {randomSample.sample_id}</Badge>
                    </div>
                    
                    <div className="grid gap-4">
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Input</div>
                        <div className="bg-muted/30 p-3 rounded whitespace-pre-wrap font-mono text-xs">{randomSample.input}</div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Model Response</div>
                          <div className="bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                            {randomSample.response}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Ground Truth</div>
                          <div className="bg-green-50/50 dark:bg-green-900/10 p-3 rounded whitespace-pre-wrap text-green-900 dark:text-green-100">
                            {randomSample.ground_truth}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center pt-2">
                    <SampleDataDialog 
                      samples={evaluation.detailed_evaluation_results_per_samples}
                      evaluationName={result.evaluation_name}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Footer Links */}
            <div className="flex gap-3 pt-2">
              {result.detailed_evaluation_results_url && (
                <a 
                  href={result.detailed_evaluation_results_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Database className="h-4 w-4" />
                  View detailed per-sample results <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function AggregatedBenchmarkCard({
  group,
  anchorId,
  isOpen,
  onOpenChange,
  motionIndex = 0,
}: {
  group: BenchmarkGroup
  anchorId: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  motionIndex?: number
}) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({})

  const variantRows = useMemo<VariantRowData[]>(
    () =>
      group.variants.map((variant, index) => {
        const configMap = getVariantConfigMap(variant)

        return {
          rowKey: `${variant.evaluation.evaluation_id}-${index}`,
          variant,
          configMap,
          configEntries: Object.entries(configMap),
          sampleCount: Array.isArray(variant.evaluation.source_data)
            ? null
            : variant.evaluation.source_data.samples_number ?? null,
        }
      }),
    [group.variants]
  )

  const filterDefinitions = useMemo(() => {
    const valuesByKey = new Map<string, Set<string>>()

    for (const row of variantRows) {
      for (const [key, value] of row.configEntries) {
        if (!valuesByKey.has(key)) {
          valuesByKey.set(key, new Set())
        }
        valuesByKey.get(key)?.add(value)
      }
    }

    return Array.from(valuesByKey.entries())
      .filter(([, values]) => values.size > 1)
      .sort(([a], [b]) => {
        if (a === "setup") return -1
        if (b === "setup") return 1
        return a.localeCompare(b)
      })
      .map(([key, values]) => ({
        key,
        label: key === "setup" ? "Setup" : formatConfigLabel(key),
        values: Array.from(values).sort((a, b) => a.localeCompare(b)),
      }))
  }, [variantRows])

  const filteredRows = useMemo(
    () =>
      variantRows.filter((row) =>
        filterDefinitions.every((definition) => {
          const selectedValue = selectedFilters[definition.key]
          if (!selectedValue || selectedValue === "all") {
            return true
          }

          return row.configMap[definition.key] === selectedValue
        })
      ),
    [filterDefinitions, selectedFilters, variantRows]
  )

  const activeFilterCount = Object.values(selectedFilters).filter((value) => value && value !== "all").length
  const leaderNormalizedScore = filteredRows[0]?.variant.normalizedScore ?? 0
  const spread = getBenchmarkSpread(group)
  const sourceOrganizations = new Set(group.variants.map((variant) => variant.evaluation.source_metadata.source_organization_name))
  const latestTimestamp = group.variants.reduce((latest, variant) => {
    const value = Number.parseFloat(variant.evaluation.retrieved_timestamp)
    return Number.isFinite(value) ? Math.max(latest, value) : latest
  }, Number.NEGATIVE_INFINITY)
  const latestReportedLabel =
    Number.isFinite(latestTimestamp) ? formatCompactDate(String(latestTimestamp)) : formatCompactDate(group.variants[0]?.evaluation.retrieved_timestamp ?? "")
  const compactDomains = group.domains.slice(0, 2)
  const progressWidth = Math.max(4, Math.min(100, group.avgNormalizedScore * 100))

  const toggleRow = (rowKey: string) => {
    setExpandedRows((current) => ({
      ...current,
      [rowKey]: !current[rowKey],
    }))
  }

  return (
    <div
      id={anchorId}
      className="motion-academic-enter"
      style={{ "--enter-delay": `${Math.min(motionIndex * 55, 260)}ms` } as CSSProperties}
    >
      <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <Card className="motion-academic-surface overflow-hidden border border-border/70 bg-card shadow-[0_1px_0_rgba(255,255,255,0.3),0_8px_24px_rgba(15,23,42,0.04)] dark:shadow-[0_1px_0_rgba(255,255,255,0.02)]">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpenChange(!isOpen)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              onOpenChange(!isOpen)
            }
          }}
          className="block w-full cursor-pointer px-3.5 py-2.5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            {/* Compact single-row layout */}
            <div className="flex items-center gap-3">
              {/* Category dot */}
              <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getCategoryTone(group.category)}`}>
                {group.category}
              </span>

              {/* Name + domains */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={group.evalDetailHref}
                    onClick={(event) => event.stopPropagation()}
                    className="text-sm font-semibold tracking-tight text-foreground/95 underline decoration-dotted underline-offset-4 hover:text-primary"
                  >
                    {group.title}
                  </Link>
                  {group.benchmarkCard && (
                    <span className="shrink-0 rounded-full border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      card
                    </span>
                  )}
                  {compactDomains.map((domain) => (
                    <span
                      key={`${group.key}-${domain}`}
                      className="hidden sm:inline-flex items-center rounded-full border border-border/50 bg-background/60 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground"
                    >
                      {domain}
                    </span>
                  ))}
                  {group.domains.length > compactDomains.length && (
                    <span className="hidden sm:inline text-[10px] text-muted-foreground/70">+{group.domains.length - compactDomains.length}</span>
                  )}
                </div>
              </div>

              <div className="hidden sm:flex shrink-0 items-center gap-2 text-xs">
                <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-medium text-muted-foreground">
                  {group.avgDisplayScore}
                </span>
                {group.bestRankPosition != null && (
                  <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 font-medium text-muted-foreground">
                    {`#${group.bestRankPosition}${group.bestRankTotal ? `/${group.bestRankTotal}` : ""}`}
                  </span>
                )}
              </div>

              {/* Subtask count */}
              <span className="shrink-0 text-[11px] text-muted-foreground w-16 text-right hidden sm:block">
                {group.variants.length} {group.variants.length === 1 ? "subtask" : "subtasks"}
              </span>

              {/* Expand toggle */}
              <div className="shrink-0 text-muted-foreground">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
          </div>
        </div>

        <CollapsibleContent>
          <Separator />
          <CardContent className="bg-muted/5 p-4 sm:p-5">
            <div className="space-y-2.5">
              <div className="flex items-center justify-end">
                <Link href={group.evalDetailHref}>
                  <Button size="sm" variant="outline" className="h-8">
                    View full leaderboard
                  </Button>
                </Link>
              </div>

              {group.benchmarkCard && (
                <div className="rounded-2xl border border-border/70 bg-background/90 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Benchmark context
                      </div>
                      <div className="text-base font-semibold">
                        {group.benchmarkCard.benchmark_details.name}
                      </div>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        {group.benchmarkCard.benchmark_details.overview}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="font-normal">
                        {group.benchmarkCard.benchmark_details.data_type}
                      </Badge>
                      {group.benchmarkCard.methodology.metrics.slice(0, 2).map((metric) => (
                        <Badge key={`${group.key}-${metric}`} variant="secondary" className="font-normal">
                          {metric}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-xl border bg-muted/10 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Goal
                      </div>
                      <div className="mt-1 text-sm text-foreground/90">
                        {group.benchmarkCard.purpose_and_intended_users.goal}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-muted/10 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Methods
                      </div>
                      <div className="mt-1 text-sm text-foreground/90">
                        {group.benchmarkCard.methodology.methods.slice(0, 2).join(", ") || "Not specified"}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-muted/10 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Caveat
                      </div>
                      <div className="mt-1 text-sm text-foreground/90">
                        {group.benchmarkCard.purpose_and_intended_users.limitations}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Subtasks
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {isResearchView
                    ? "Setup changes and benchmark subtasks are shown separately so you can tell methodological differences from benchmark decomposition."
                    : "Different setups and benchmark subtasks are visually separated so policy review does not confuse reporting choices with benchmark decomposition."}
                </div>
              </div>

              {filterDefinitions.length > 0 && (
                <div className="rounded-lg border bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-medium">Comparison Filters</div>
                      <div className="text-xs text-muted-foreground">
                        {isResearchView
                          ? "Narrow to matching setup or generation config values for apples-to-apples comparison"
                          : "Narrow to matching setup and reporting conditions for more comparable policy review"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">
                        {filteredRows.length} of {variantRows.length} shown
                      </Badge>
                      {activeFilterCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => setSelectedFilters({})}
                        >
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                    {filterDefinitions.map((definition) => (
                      <div key={definition.key} className="grid min-w-0 content-start gap-2 rounded-xl border bg-muted/10 p-3">
                        <div className="min-h-10 text-xs font-medium leading-5 text-muted-foreground">
                          {definition.label}
                        </div>
                        <Select
                          value={selectedFilters[definition.key] ?? "all"}
                          onValueChange={(value) =>
                            setSelectedFilters((current) => ({
                              ...current,
                              [definition.key]: value,
                            }))
                          }
                        >
                          <SelectTrigger className="min-w-0 w-full bg-background/90">
                            <SelectValue placeholder={`All ${definition.label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All {definition.label}</SelectItem>
                            {definition.values.map((value) => (
                              <SelectItem key={value} value={value}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {variantRows.length === 1 ? (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Reported Details
                  </div>
                  <VariantExpandedDetail
                    row={variantRows[0]}
                    group={group}
                    mode={mode}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRows.map((row, index) => {
                    const { rowKey, variant } = row
                    const isRowOpen = expandedRows[rowKey] ?? false
                    const hasSourceLink = Boolean(variant.evaluation.source_metadata.source_url)
                    const gapToLeader = Math.max(0, leaderNormalizedScore - variant.normalizedScore)
                    const evidenceStatus = hasSourceLink ? "Linked" : "Inline"

                    return (
                      <div
                        key={rowKey}
                        className="motion-academic-enter-soft overflow-hidden rounded-xl border bg-background"
                        style={{ "--enter-delay": `${Math.min(index * 40, 180)}ms` } as CSSProperties}
                      >
                        <button
                          type="button"
                          className="block w-full p-4 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => toggleRow(rowKey)}
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                                  {index + 1}
                                </div>
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="min-w-0 break-words font-medium">{variant.label}</div>
                                    <Badge className={getVariantTypeTone(variant.variantType)}>
                                      {getVariantTypeLabel(variant.variantType)}
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {variant.setupLabel && <span>Setup: {variant.setupLabel}</span>}
                                    {variant.setupLabel && variant.subtaskLabel && <span> • </span>}
                                    {variant.subtaskLabel && <span>Subtask: {variant.subtaskLabel}</span>}
                                    {!variant.setupLabel && !variant.subtaskLabel && <span>{group.title}</span>}
                                  </div>
                                </div>
                              </div>

                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80">
                                {isRowOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                <span className="sr-only">Toggle variant details</span>
                              </span>
                            </div>

                            <div className="grid gap-3 border-t border-border/50 pt-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(180px,1fr)_110px_150px]">
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                  {isResearchView ? "Config" : "Setup"}
                                </div>
                                <div className="mt-1 text-sm font-medium text-foreground/90" title={getTableConfigLabel(row)}>
                                  {getConfigDisplayValue(getTableConfigLabel(row))}
                                </div>
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                  <span>{isResearchView ? "Relative score" : "Evidence context"}</span>
                                  <span>{index === 0 ? "Leader" : `-${(gapToLeader * 100).toFixed(1)} pts`}</span>
                                </div>
                                {isResearchView ? (
                                  <>
                                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                                      <div
                                        className="h-full rounded-full bg-foreground/70"
                                        style={{
                                          width: `${leaderNormalizedScore > 0 ? Math.max(4, (variant.normalizedScore / leaderNormalizedScore) * 100) : 100}%`,
                                        }}
                                      />
                                    </div>
                                    <div className="mt-1 text-[12px] text-muted-foreground">
                                      {variant.evaluation.source_metadata.evaluator_relationship.replace(/_/g, " ")}
                                    </div>
                                  </>
                                ) : (
                                  <div className="mt-1 text-sm capitalize text-muted-foreground">
                                    {variant.evaluation.source_metadata.evaluator_relationship.replace(/_/g, " ")}
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                  Score
                                </div>
                                <div className="mt-1 text-lg font-semibold tracking-tight">{variant.displayScore}</div>
                              </div>

                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                  {isResearchView ? "Source" : "Evidence"}
                                </div>
                                <div className="mt-1 truncate text-sm font-medium text-foreground/90">
                                  {variant.evaluation.source_metadata.source_organization_name}
                                </div>
                                <div className="text-[12px] text-muted-foreground">
                                  {evidenceStatus}
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>

                        {isRowOpen && (
                          <div className="border-t bg-muted/10 p-4">
                            <VariantExpandedDetail
                              row={row}
                              group={group}
                              mode={mode}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {filteredRows.length === 0 && (
                    <div className="rounded-xl border bg-background p-6 text-center text-sm text-muted-foreground">
                      No subtasks match the current filters.
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>
    </div>
  )
}

function BenchmarkDeepDiveCardModal({
  group,
  anchorId,
  motionIndex = 0,
}: {
  group: BenchmarkGroup
  anchorId: string
  motionIndex?: number
}) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const [open, setOpen] = useState(false)
  const [resolvedRanks, setResolvedRanks] = useState<Record<string, { position: number; total: number | null }>>({})
  const [isResolvingRanks, setIsResolvingRanks] = useState(false)
  const compactDomains = group.domains.slice(0, 2)
  const sourceOrganizations = useMemo(
    () => new Set(group.variants.map((variant) => variant.evaluation.source_metadata.source_organization_name)),
    [group.variants]
  )
  const rankedVariants = useMemo(
    () =>
      [...group.variants].sort((a, b) => {
        const aRank = a.rankRatio ?? Number.POSITIVE_INFINITY
        const bRank = b.rankRatio ?? Number.POSITIVE_INFINITY

        if (aRank !== bRank) {
          return aRank - bRank
        }

        return b.normalizedScore - a.normalizedScore
      }),
    [group.variants]
  )

  const variantRows = useMemo(
    () =>
      rankedVariants.map((variant, index) => {
        const rowKey = `${variant.evaluation.evaluation_id}-${index}`
        const evalHref = getEvalDetailHref(variant.evaluation, variant.result)
        const evalSummaryId = getEvalSummaryIdFromHref(evalHref)
        const configMap = getVariantConfigMap(variant)

        return {
          rowKey,
          variant,
          evalSummaryId,
          configEntries: Object.entries(configMap),
        }
      }),
    [rankedVariants]
  )

  const bestResolvedRank = useMemo(() => {
    const candidates = variantRows
      .map((row) => {
        const resolved = resolvedRanks[row.rowKey]
        if (resolved) return resolved
        if (row.variant.rankPosition != null) {
          return { position: row.variant.rankPosition, total: row.variant.rankTotal }
        }
        return null
      })
      .filter((r): r is { position: number; total: number | null } => r != null)
      .sort((a, b) => {
        const aRatio = a.total != null && a.total > 0 ? a.position / a.total : a.position
        const bRatio = b.total != null && b.total > 0 ? b.position / b.total : b.position
        return aRatio - bRatio
      })
    return candidates[0] ?? null
  }, [resolvedRanks, variantRows])

  useEffect(() => {
    if (!open) {
      return
    }

    const pendingRows = variantRows.filter(
      (row) => row.variant.rankPosition == null && !resolvedRanks[row.rowKey] && row.evalSummaryId
    )

    if (pendingRows.length === 0) {
      return
    }

    let isCancelled = false

    const resolveRanks = async () => {
      setIsResolvingRanks(true)

      const nextResolvedEntries = await Promise.all(
        pendingRows.map(async (row) => {
          const rank = await fetchPeerRankForModel(row.evalSummaryId, row.variant.evaluation.model_info.id)
          return rank ? ([row.rowKey, rank] as const) : null
        })
      )

      if (isCancelled) {
        return
      }

      setResolvedRanks((current) => {
        const patch: Record<string, { position: number; total: number | null }> = {}

        for (const entry of nextResolvedEntries) {
          if (!entry) {
            continue
          }

          patch[entry[0]] = entry[1]
        }

        return Object.keys(patch).length > 0 ? { ...current, ...patch } : current
      })

      setIsResolvingRanks(false)
    }

    resolveRanks()

    return () => {
      isCancelled = true
    }
  }, [open, resolvedRanks, variantRows])

  return (
    <div
      id={anchorId}
      className="motion-academic-enter"
      style={{ "--enter-delay": `${Math.min(motionIndex * 55, 260)}ms` } as CSSProperties}
    >
      <Card className="h-full overflow-hidden border border-border/70 bg-card transition-colors hover:border-border">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getCategoryTone(group.category)}`}>
                  {group.category}
                </span>
                {group.benchmarkCard && (
                  <span className="rounded-full border border-border/50 bg-muted/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Card
                  </span>
                )}
              </div>
              <h4 className="mt-2 line-clamp-2 text-sm font-semibold leading-5">{group.title}</h4>
            </div>

            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">{group.avgDisplayScore}</div>
              {group.bestRankPosition != null && (
                <div className="text-[11px] tabular-nums text-muted-foreground">
                  {`#${group.bestRankPosition}${group.bestRankTotal ? `/${group.bestRankTotal}` : ""}`}
                </div>
              )}
            </div>
          </div>

          {compactDomains.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {compactDomains.map((domain) => (
                <span
                  key={`${group.key}-${domain}`}
                  className="inline-flex items-center rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground"
                >
                  {domain}
                </span>
              ))}
              {group.domains.length > compactDomains.length && (
                <span className="inline-flex items-center rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  +{group.domains.length - compactDomains.length}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{group.variants.length} {group.variants.length === 1 ? "subtask" : "subtasks"}</span>
            <span>{sourceOrganizations.size} source{sourceOrganizations.size === 1 ? "" : "s"}</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8">Open details</Button>
              </DialogTrigger>
              <DialogContent className="h-[80vh] max-w-[92vw] overflow-hidden sm:max-w-5xl">
                <DialogHeader>
                  <DialogTitle>{group.title}</DialogTitle>
                  <DialogDescription>
                    {isResearchView
                      ? "Inspect setup subtasks, score details, and source provenance in one focused view."
                      : "Inspect reporting setup and evidence details before interpreting benchmark position."}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid h-[calc(80vh-7rem)] gap-4 overflow-hidden">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border bg-muted/10 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Avg score</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums">{group.avgDisplayScore}</div>
                    </div>
                    <div className="rounded-xl border bg-muted/10 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Best rank</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums">
                        {bestResolvedRank != null
                          ? `#${bestResolvedRank.position}${bestResolvedRank.total ? `/${bestResolvedRank.total}` : ""}`
                          : isResolvingRanks
                            ? "…"
                            : "N/A"}
                      </div>
                      {isResolvingRanks && (
                        <div className="mt-1 text-[11px] text-muted-foreground">Resolving peer rank…</div>
                      )}
                    </div>
                    <div className="rounded-xl border bg-muted/10 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sources</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums">{sourceOrganizations.size}</div>
                    </div>
                  </div>

                  {group.benchmarkCard && (
                    <div className="rounded-xl border bg-background p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Benchmark context</div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{group.benchmarkCard.benchmark_details.overview}</p>
                    </div>
                  )}

                  <div className="min-h-0 overflow-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Subtask</TableHead>
                          <TableHead>Setup</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                          <TableHead className="text-right">Rank</TableHead>
                          <TableHead>Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variantRows.map((row) => {
                          const { rowKey, variant, configEntries } = row
                          const resolvedRank = resolvedRanks[rowKey]

                          return (
                          <TableRow key={rowKey}>
                            <TableCell className="whitespace-normal">
                              <div className="font-medium">{variant.label}</div>
                              <div className="text-xs text-muted-foreground">{variant.variantType === "default" ? "Single run" : getVariantTypeLabel(variant.variantType)}</div>
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <div className="text-sm font-medium">{variant.setupLabel ?? "Default setup"}</div>
                              {configEntries.length > 0 && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {configEntries
                                    .slice(0, 2)
                                    .map(([key, value]) => `${formatConfigLabel(key)}=${getConfigDisplayValue(value)}`)
                                    .join(" · ")}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{variant.displayScore}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {(variant.rankPosition != null || resolvedRank)
                                ? `#${resolvedRank?.position ?? variant.rankPosition}${(resolvedRank?.total ?? variant.rankTotal) ? `/${resolvedRank?.total ?? variant.rankTotal}` : ""}`
                                : "N/A"}
                            </TableCell>
                            <TableCell className="whitespace-normal text-muted-foreground">
                              {variant.evaluation.source_metadata.source_organization_name}
                            </TableCell>
                          </TableRow>
                        )})}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-end">
                    <Link href={group.evalDetailHref}>
                      <Button variant="outline">View full leaderboard</Button>
                    </Link>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Link href={group.evalDetailHref} className="text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-primary">
              Full leaderboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function VariantExpandedDetail({
  row,
  group,
  mode,
}: {
  row: VariantRowData
  group: BenchmarkGroup
  mode: "research" | "policy"
}) {
  const isResearchView = mode === "research"
  const { variant, configEntries, sampleCount } = row
  const { numericBreakdown, structuredBreakdown } = buildVariantStructuredSections(variant)
  const purpose = variant.result.factsheet?.purpose
  const principles = variant.result.factsheet?.principles_tested
  const sourceTypeLabel = variant.evaluation.source_metadata.source_type.replace(/_/g, " ")
  const sourceData = !Array.isArray(variant.result.source_data ?? variant.evaluation.source_data)
    ? (variant.result.source_data ?? variant.evaluation.source_data) as import("@/lib/benchmark-schema").SourceData
    : null
  const evalLibrary = variant.evaluation.eval_library
  const confidenceInterval = variant.result.score_details.confidence_interval
  const sampleSize = variant.result.score_details.sample_size ?? sourceData?.samples_number ?? sampleCount
  const factsheet = variant.result.factsheet
  const allFactsheetFields: Array<[string, string]> = factsheet
    ? (Object.entries(factsheet).filter(([, v]) => v != null && v !== "" && typeof v !== "boolean") as Array<[string, string]>)
    : []

  return (
    <div className="space-y-4 rounded-xl border bg-background/80 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold">{variant.label}</div>
            <Badge className={getVariantTypeTone(variant.variantType)}>
              {getVariantTypeLabel(variant.variantType)}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {group.title}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              {variant.displayScore}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">{variant.result.metric_config.evaluation_description}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatCompactDate(variant.evaluation.retrieved_timestamp)}</Badge>
          <Badge variant="outline" className="capitalize">
            {variant.evaluation.source_metadata.evaluator_relationship.replace(/_/g, " ")}
          </Badge>
          {sampleSize != null && <Badge variant="outline">{Number(sampleSize).toLocaleString()} samples</Badge>}
          {evalLibrary && (
            <Badge variant="outline">
              {evalLibrary.name}{evalLibrary.version ? ` ${evalLibrary.version}` : ""}
            </Badge>
          )}
        </div>
      </div>

      <div className={`grid gap-4 ${isResearchView ? "2xl:grid-cols-[1.1fr_0.9fr]" : "2xl:grid-cols-[0.95fr_1.05fr]"}`}>
        <div className="rounded-xl border bg-muted/10 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {isResearchView ? "Provenance & Dataset" : "Reporting Context"}
          </div>
          <div className="grid gap-3 md:grid-cols-2 text-sm">
            <InlineMeta label="Organization" value={variant.evaluation.source_metadata.source_organization_name} />
            <InlineMeta label="Source Type" value={sourceTypeLabel} />
            <InlineMeta label="Subtask Type" value={getVariantTypeLabel(variant.variantType)} />
            <InlineMeta
              label={isResearchView ? "Dataset" : "Benchmark"}
              value={sourceData?.dataset_name ?? group.title}
            />
            {sourceData?.dataset_version && <InlineMeta label="Version" value={sourceData.dataset_version} />}
            {sourceData?.hf_repo && <InlineMeta label="HF Repo" value={sourceData.hf_repo} />}
            {sourceData?.hf_split && <InlineMeta label="Split" value={sourceData.hf_split} />}
            {variant.subtaskLabel && <InlineMeta label="Subtask" value={variant.subtaskLabel} />}
            {variant.setupLabel && <InlineMeta label="Setup" value={variant.setupLabel} />}
            {variant.evaluation.source_metadata.source_name && (
              <InlineMeta label="Source Name" value={variant.evaluation.source_metadata.source_name} />
            )}
            <InlineMeta label="Relationship" value={variant.evaluation.source_metadata.evaluator_relationship.replace(/_/g, " ")} />
            <InlineMeta label="Reported" value={formatCompactDate(variant.evaluation.retrieved_timestamp)} />
            <InlineMeta label="Score" value={variant.displayScore} />
            {confidenceInterval && (
              <InlineMeta
                label="Confidence Interval"
                value={`[${confidenceInterval.lower.toFixed(3)}, ${confidenceInterval.upper.toFixed(3)}] @ ${(confidenceInterval.confidence_level * 100).toFixed(0)}%`}
              />
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-muted/10 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {isResearchView ? "Config Snapshot" : "Evaluation Setup"}
          </div>
          <div className="flex flex-wrap gap-2">
            {configEntries.length > 0 ? (
              configEntries.map(([key, value]) => (
                <Badge
                  key={`${row.rowKey}-${key}`}
                  variant="outline"
                  className="max-w-[260px] font-normal"
                  title={`${formatConfigLabel(key)}: ${value}`}
                >
                  {formatConfigLabel(key)}: {getConfigDisplayValue(value)}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No explicit config recorded</span>
            )}
          </div>

          {(purpose || principles || allFactsheetFields.length > 0) && (
            <div className="mt-4 space-y-2 rounded-lg border bg-background/70 p-3">
              {purpose && <InlineMeta label="Purpose" value={purpose} />}
              {principles && <InlineMeta label="Principles Tested" value={principles} />}
              {allFactsheetFields
                .filter(([k]) => k !== "purpose" && k !== "principles_tested" && k !== "functional_props")
                .map(([key, value]) => (
                  <InlineMeta key={key} label={formatConfigLabel(key)} value={String(value)} />
                ))}
            </div>
          )}
        </div>
      </div>

      {numericBreakdown.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {isResearchView ? "Subtask Scores" : "Reported Metrics"}
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {numericBreakdown.map(([key, value]) => {
              const numericValue = value as number
              const minScore = variant.result.metric_config.min_score ?? 0
              const maxScore = variant.result.metric_config.max_score ?? 1
              const range = maxScore - minScore
              const normalizedValue = range > 0 ? ((numericValue - minScore) / range) * 100 : numericValue * 100

              return (
                <div key={key} className="rounded-xl border bg-background p-3">
                  <div className="mb-2 text-xs text-muted-foreground">{formatConfigLabel(key)}</div>
                  <div className="mb-2 text-lg font-semibold">{formatMetadataValue(numericValue)}</div>
                  <Progress value={Math.max(0, Math.min(100, normalizedValue))} className="h-1.5" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {structuredBreakdown.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {isResearchView ? "Structured Detail Fields" : "Supporting Detail"}
          </div>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[220px]">Field</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {structuredBreakdown.map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell className="align-top whitespace-normal text-sm font-medium">
                      {formatConfigLabel(key)}
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 text-xs leading-5">
                        {formatMetadataValue(value)}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {variant.evaluation.source_metadata.source_url && (
        <div className="pt-1">
          <a
            href={variant.evaluation.source_metadata.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            View source
          </a>
        </div>
      )}
    </div>
  )
}

function InlineMeta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium break-words">{value}</div>
    </div>
  )
}

function AllEvaluationsView({ evaluations }: { evaluations: BenchmarkEvaluation[] }) {
  return (
    <div className="space-y-6">
      {evaluations.map((eval_, idx) => (
        <div key={idx} className="space-y-6">
          {eval_.evaluation_results.map((result, ridx) => (
            <BenchmarkResultCard 
              key={`${eval_.evaluation_id}-${ridx}`}
              evaluation={eval_}
              result={result}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function CategoryStatsView({ 
  stats, 
  summary
}: { 
  stats: { category: CategoryType; count: number; avg_score: number }[]
  summary: ModelSummaryCore
}) {
  const getCategoryColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600'
    if (score >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }
  
  const getCategoryLabel = (category: CategoryType): string => {
    return category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {stats.map((stat) => {
        const evals = summary.evaluations_by_category[stat.category] || []
        
        return (
          <Card key={stat.category} className="overflow-hidden">
            <CardHeader className="bg-muted/30 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{getCategoryLabel(stat.category)}</CardTitle>
                <div className={`text-2xl font-bold ${getCategoryColor(stat.avg_score)}`}>
                  {(stat.avg_score * 100).toFixed(1)}%
                </div>
              </div>
              <CardDescription>{stat.count} evaluation{stat.count !== 1 ? 's' : ''}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {evals.map((eval_: BenchmarkEvaluation, idx: number) => {
                  // Filter results to only show those that match this category
                  const relevantResults = eval_.evaluation_results.filter((result: any) => {
                    const resultCategory = inferCategoryFromBenchmark(result.evaluation_name)
                    return resultCategory === stat.category
                  })
                  
                  if (relevantResults.length === 0) return null
                  
                  return relevantResults.map((result: any, ridx: number) => (
                    <div key={`${idx}-${ridx}`} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{getResultDisplayName(eval_, result)}</div>
                        <div className="text-xs text-muted-foreground">
                          {(getEvaluationVariantLabel(eval_) ? `Setup: ${getEvaluationVariantLabel(eval_)}` : null) || (Array.isArray(eval_.source_data)
                            ? (eval_.source_metadata.source_name || 'Unknown')
                            : eval_.source_data.dataset_name)}
                        </div>
                      </div>
                      <div className="font-mono font-semibold">
                        {formatScore(
                          result.score_details.score,
                          result.metric_config.score_type,
                          result.metric_config.max_score
                        )}
                      </div>
                    </div>
                  ))
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
