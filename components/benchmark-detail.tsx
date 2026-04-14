"use client"

// Force recompile
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ExternalLink, TrendingUp, Info, Database, Settings, FileCode, Building, Calendar, User, Server,
  ChevronDown, ChevronUp, BarChart3, Award, AlertTriangle,
  Cpu, Tag, Globe, Network, Activity, MessageSquare, Clock, Hash, Layers, Search, FlaskConical, Scale, BookOpenText, Plus, X
} from "lucide-react"
import type { BenchmarkCard, BenchmarkEvaluation, CategoryType, EvaluationResult } from "@/lib/benchmark-schema"
import { getCategoryColor as getCategoryTone, inferCategoryFromBenchmark } from "@/lib/benchmark-schema"
import type { BenchmarkEvalSummary } from "@/lib/eval-processing"
import type { ModelSummaryCore } from "@/lib/benchmark-schema"
import { lookupBenchmarkCard } from "@/lib/benchmark-metadata-utils"
import type { BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import type {
  ComparisonEvalEntry,
  ComparisonIndex,
  ComparisonMetricEntry,
  ComparisonScoreEntry,
  EvalHierarchy,
  SubmissionAxis,
} from "@/lib/backend-artifacts"
import { type CSSProperties, Fragment, useState, useEffect, useMemo } from "react"

interface BenchmarkDetailProps {
  summary: ModelSummaryCore
  benchmarkCards?: Record<string, BenchmarkCard>
  modelCards?: BenchmarkEvaluationCardData[]
  evalHierarchy?: EvalHierarchy | null
  comparisonIndex?: ComparisonIndex | null
}

interface BenchmarkVariant {
  evaluation: BenchmarkEvaluation
  result: EvaluationResult
  label: string
  variantType: "setup" | "subtask" | "setup+subtask" | "default"
  metricLabel: string
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
  canonicalTitle: string
  evalDetailHref: string
  category: CategoryType
  description: string
  scoreType: EvaluationResult["metric_config"]["score_type"] | "mixed"
  avgRawScore: number
  avgNormalizedScore: number
  avgDisplayScore: string
  bestRankPosition: number | null
  bestRankTotal: number | null
  bestRankRatio: number | null
  domains: string[]
  benchmarkCard?: BenchmarkCard
  variants: BenchmarkVariant[]
}

interface SuiteGroup {
  suiteKey: string
  suiteName: string
  benchmarks: BenchmarkGroup[]
  avgRawScore: number
  avgNormalizedScore: number
  avgDisplayScore: string
  bestRank: { position: number; total: number } | null
}

const INSTANCE_PREVIEW_LIMIT = 5

const SUITE_DISPLAY_NAMES: Record<string, string> = {
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

const DISPLAY_TOKEN_OVERRIDES: Record<string, string> = {
  ace: "ACE",
  apex: "APEX",
  api: "API",
  ai: "AI",
  ai2: "AI2",
  bbh: "BBH",
  diy: "DIY",
  gpt: "GPT",
  gpqa: "GPQA",
  helm: "HELM",
  hf: "HF",
  ibm: "IBM",
  ifeval: "IFEval",
  la: "LA",
  llm: "LLM",
  math: "MATH",
  md: "MD",
  mmlu: "MMLU",
  musr: "MUSR",
  oecd: "OECD",
  nist: "NIST",
  openai: "OpenAI",
  swe: "SWE",
  tau: "TAU",
  ui: "UI",
  ux: "UX",
  xai: "xAI",
}

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  ...SUITE_DISPLAY_NAMES,
  apex: "APEX",
  apex_agents: "APEX Agents",
  apex_v1: "APEX v1",
  openai: "OpenAI",
  xai: "xAI",
  nvidia: "NVIDIA",
  ibm: "IBM",
}

const AMBIGUOUS_GROUP_LABELS = new Set(["overall", "score", "accuracy"])

function normalizeDisplayKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function normalizeDisplayToken(token: string) {
  const prefixMatch = token.match(/^[^a-z0-9]*/i)
  const suffixMatch = token.match(/[^a-z0-9]*$/i)
  const prefix = prefixMatch?.[0] ?? ""
  const suffix = suffixMatch?.[0] ?? ""
  const core = token.slice(prefix.length, token.length - suffix.length)

  if (!core) {
    return token
  }

  const override = DISPLAY_TOKEN_OVERRIDES[normalizeDisplayKey(core)]
  if (override) {
    return `${prefix}${override}${suffix}`
  }

  if (/[A-Z]/.test(core.slice(1))) {
    return `${prefix}${core}${suffix}`
  }

  if (/^\d/.test(core)) {
    return `${prefix}${core}${suffix}`
  }

  return `${prefix}${core.charAt(0).toUpperCase()}${core.slice(1).toLowerCase()}${suffix}`
}

function normalizeDisplayLabel(value: string | null | undefined): string {
  if (!value) {
    return ""
  }

  const normalizedKey = normalizeDisplayKey(value)
  const override = DISPLAY_NAME_OVERRIDES[normalizedKey]
  if (override) {
    return override
  }

  return value
    .split("/")
    .map((segment) => {
      const cleaned = segment.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
      if (!cleaned) {
        return ""
      }

      const cleanedOverride = DISPLAY_NAME_OVERRIDES[normalizeDisplayKey(cleaned)]
      if (cleanedOverride) {
        return cleanedOverride
      }

      return cleaned.split(" ").map(normalizeDisplayToken).join(" ")
    })
    .filter(Boolean)
    .join(" / ")
}

function formatRawScoreValue(score: number, unit?: string) {
  if (!Number.isFinite(score)) {
    return "N/A"
  }

  const precision = Math.abs(score) >= 100 ? 1 : Math.abs(score) >= 10 ? 2 : 3
  const value = score.toFixed(precision).replace(/0+$/g, "").replace(/\.$/, "")
  const normalizedUnit = normalizeDisplayLabel(unit)

  if (!normalizedUnit || normalizedUnit === "Accuracy" || normalizedUnit === "Pass@1" || normalizedUnit === "Score") {
    return value
  }

  return `${value} ${normalizedUnit}`
}

function getModelDisplayName(value: string | null | undefined) {
  return normalizeDisplayLabel(value) || "Unknown Model"
}

function getOrganizationDisplayName(value: string | null | undefined) {
  return normalizeDisplayLabel(value) || "Unknown Organization"
}

function getRelationshipDisplayName(value: string | null | undefined) {
  return normalizeDisplayLabel(value?.replace(/_/g, " ")) || "Unknown"
}

function getSourceTypeDisplayName(value: string | null | undefined) {
  return normalizeDisplayLabel(value?.replace(/_/g, " ")) || "Unknown"
}

function normalizeSuiteKey(key: string): string {
  const k = key.toLowerCase().replace(/[-.\s]+/g, "_").replace(/^_+|_+$/g, "")
  if (/^fibble\d*_arena$/.test(k)) return "fibble_arena"
  if (/^arc_agi_v\d+/.test(k)) return "arc_agi"
  return k
}

function doesLabelMatchSuiteKey(label: string | null | undefined, suiteKey: string) {
  if (!label) {
    return false
  }

  return normalizeSuiteKey(normalizeDisplayKey(label)) === normalizeSuiteKey(suiteKey)
}

function getSuiteKey(group: BenchmarkGroup): string {
  const evaluation = group.variants[0]?.evaluation
  const backendSuiteKey =
    evaluation?.benchmark_parent_key ||
    evaluation?.benchmark_family_key ||
    evaluation?.benchmark

  return normalizeSuiteKey(backendSuiteKey ?? group.key)
}

function getSuiteDisplayName(key: string): string {
  const normalizedKey = normalizeSuiteKey(key)
  return SUITE_DISPLAY_NAMES[normalizedKey] ?? normalizeDisplayLabel(key)
}

function getSuiteName(group: BenchmarkGroup, suiteKey: string): string {
  const evaluation = group.variants[0]?.evaluation
  const benchmarkCardName = group.benchmarkCard?.benchmark_details?.name
  const backendParentName = evaluation?.benchmark_parent_name
  const backendFamilyName = evaluation?.benchmark_family_name

  if (doesLabelMatchSuiteKey(backendParentName, suiteKey)) {
    return normalizeDisplayLabel(backendParentName)
  }

  if (doesLabelMatchSuiteKey(backendFamilyName, suiteKey)) {
    return normalizeDisplayLabel(backendFamilyName)
  }

  if (doesLabelMatchSuiteKey(benchmarkCardName, suiteKey)) {
    return normalizeDisplayLabel(benchmarkCardName)
  }

  return getSuiteDisplayName(suiteKey)
}

function groupBySuite(
  groups: BenchmarkGroup[],
  modelIds: string[],
  peerRanks: PeerRanksMap
): SuiteGroup[] {
  const suites = new Map<string, BenchmarkGroup[]>()
  for (const group of groups) {
    const key = getSuiteKey(group)
    const existing = suites.get(key) ?? []
    existing.push(group)
    suites.set(key, existing)
  }

  return Array.from(suites.entries()).map(([suiteKey, benchmarks]) => {
    const scores = benchmarks.map(b => b.avgNormalizedScore).filter(Number.isFinite)
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    const rawScores = benchmarks.map((benchmark) => benchmark.avgRawScore).filter(Number.isFinite)
    const avgRawScore = rawScores.length > 0 ? rawScores.reduce((a, b) => a + b, 0) / rawScores.length : 0

    // Find best rank across all benchmarks in suite
    let bestRank: { position: number; total: number } | null = null
    for (const b of benchmarks) {
      const rank = getGroupPeerRank(b, modelIds, peerRanks)
      if (!rank) continue
      if (!bestRank || (rank.position / rank.total) < (bestRank.position / bestRank.total)) {
        bestRank = rank
      }
    }

    return {
      suiteKey,
      suiteName: benchmarks[0] ? getSuiteName(benchmarks[0], suiteKey) : getSuiteDisplayName(suiteKey),
      benchmarks,
      avgRawScore,
      avgNormalizedScore: avgScore,
      avgDisplayScore: formatRawScoreValue(avgRawScore),
      bestRank,
    }
  }).sort((a, b) => {
    // Sort by best peer rank ratio (lower = better); unranked suites go to the bottom
    const aRatio = a.bestRank ? a.bestRank.position / (a.bestRank.total || a.bestRank.position) : Infinity
    const bRatio = b.bestRank ? b.bestRank.position / (b.bestRank.total || b.bestRank.position) : Infinity
    if (aRatio !== bRatio) return aRatio - bRatio
    return b.avgNormalizedScore - a.avgNormalizedScore
  })
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
  if (evaluation.display_name) {
    return evaluation.display_name
  }

  if (evaluation.slice_name) {
    return evaluation.slice_name
  }

  if (evaluation.benchmark_leaf_name) {
    return evaluation.benchmark_leaf_name
  }

  if (evaluation.benchmark_parent_name) {
    return evaluation.benchmark_parent_name
  }

  if (evaluation.benchmark) {
    return evaluation.benchmark
  }

  if (result.display_name) {
    return result.display_name
  }

  return result.evaluation_name
}

function getResultDisplayName(
  evaluation: BenchmarkEvaluation,
  result: EvaluationResult
) {
  if (result.canonical_display_name) {
    return result.canonical_display_name
  }

  if (evaluation.canonical_display_name) {
    return evaluation.canonical_display_name
  }

  const benchmarkName = evaluation.benchmark_parent_name || evaluation.benchmark || getResultBenchmarkName(evaluation, result)
  const metricName = result.display_name || result.evaluation_name

  if (GENERIC_RESULT_NAMES.has(metricName.toLowerCase())) {
    return `${benchmarkName} - ${metricName}`
  }

  return metricName
}

function getMetricDisplayLabel(result: EvaluationResult) {
  const rawLabel =
    result.display_name ||
    result.canonical_display_name ||
    result.evaluation_name

  if (!rawLabel) {
    return "Metric"
  }

  const segments = rawLabel
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
  const leaf = segments[segments.length - 1] ?? rawLabel
  return normalizeDisplayLabel(leaf)
}

function getVariantDescriptor(
  evaluation: BenchmarkEvaluation,
  result: EvaluationResult
): Pick<BenchmarkVariant, "label" | "variantType" | "metricLabel" | "setupLabel" | "subtaskLabel"> {
  const evaluationVariantRaw = getEvaluationVariantLabel(evaluation)
  const evaluationVariant = evaluationVariantRaw ? formatSetupDisplayLabel(evaluationVariantRaw) : null
  const metricLabel = getMetricDisplayLabel(result)
  const metricKey = normalizeDisplayKey(metricLabel)
  const metricIsAmbiguous = AMBIGUOUS_GROUP_LABELS.has(metricKey)
  const subtaskLabel = evaluation.slice_name ? normalizeDisplayLabel(evaluation.slice_name) : null
  const setupLabel = evaluationVariant ? formatSetupDisplayLabel(evaluationVariant) : null
  const baseLabel = subtaskLabel
    ? (metricIsAmbiguous ? subtaskLabel : `${subtaskLabel} · ${metricLabel}`)
    : metricLabel

  if (setupLabel && subtaskLabel) {
    return {
      label: `${setupLabel} · ${baseLabel}`,
      variantType: "setup+subtask",
      metricLabel,
      setupLabel,
      subtaskLabel,
    }
  }

  if (setupLabel) {
    return {
      label: metricIsAmbiguous ? `Setup: ${setupLabel}` : `${setupLabel} · ${metricLabel}`,
      variantType: "setup",
      metricLabel,
      setupLabel,
      subtaskLabel: null,
    }
  }

  if (subtaskLabel || !metricIsAmbiguous) {
    return {
      label: baseLabel,
      variantType: subtaskLabel ? "subtask" : "default",
      metricLabel,
      setupLabel: null,
      subtaskLabel: subtaskLabel ?? null,
    }
  }

  return {
    label: metricLabel,
    variantType: "default",
    metricLabel,
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

function unquoteJsonString(value: string): string {
  // Values like "\"true\"" or "\"2048\"" are JSON-encoded strings — unwrap them
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === "string") return parsed
    } catch { /* fall through */ }
  }
  return value
}

function getConfigDisplayValue(value: string) {
  const unquoted = unquoteJsonString(value)
  return unquoted.length > 40 ? `${unquoted.slice(0, 37)}…` : unquoted
}

/** Parse a HELM-style nested detail entry like '{"tab":"Efficiency","score":"106.9"}' */
function parseHelmDetailEntry(value: unknown): { tab?: string; score?: string; description?: string } | null {
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === "object" && ("score" in parsed || "tab" in parsed)) {
      return parsed as { tab?: string; score?: string; description?: string }
    }
  } catch { /* not JSON */ }
  return null
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
  return new Set(group.variants.map((variant) => getOrganizationDisplayName(variant.evaluation.source_metadata.source_organization_name))).size
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

function formatSetupDisplayLabel(setupLabel: string | null) {
  if (!setupLabel) {
    return "Default setup"
  }

  const normalized = setupLabel.trim()
  if (!normalized || normalized.toLowerCase() === "default" || normalized.endsWith("__default")) {
    return "Default setup"
  }

  const cleaned = normalized
    .replace(/^setup[:=]\s*/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned) {
    return "Default setup"
  }

  return normalizeDisplayLabel(cleaned)
}

function getVariantPrimaryLabel(variant: BenchmarkVariant, groupTitle: string) {
  if (variant.subtaskLabel) {
    return variant.subtaskLabel
  }

  if (variant.metricLabel) {
    const normalizedMetricKey = normalizeDisplayKey(variant.metricLabel)
    if (!AMBIGUOUS_GROUP_LABELS.has(normalizedMetricKey)) {
      return variant.metricLabel
    }
  }

  if (variant.variantType === "default" || variant.variantType === "setup") {
    return groupTitle
  }

  return variant.label
}

function getGroupSubtaskLabels(group: BenchmarkGroup) {
  return Array.from(
    new Set(
      group.variants
        .map((variant) => variant.subtaskLabel?.trim())
        .filter((label): label is string => Boolean(label))
    )
  )
}

function getGroupSubtaskCount(group: BenchmarkGroup) {
  return getGroupSubtaskLabels(group).length
}

function getBenchmarkGroupHeading(group: BenchmarkGroup) {
  return group.canonicalTitle
}

function getSuiteBadgeMeta(suite: SuiteGroup) {
  if (suite.benchmarks.length > 1) {
    return {
      count: suite.benchmarks.length,
      label: `sub-benchmark${suite.benchmarks.length === 1 ? "" : "s"}`,
      className:
        "border-sky-200/80 bg-sky-50/70 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300",
    }
  }

  const singleGroup = suite.benchmarks[0]
  if (!singleGroup) {
    return null
  }

  const suiteMatchesBenchmark = normalizeSuiteKey(suite.suiteName) === normalizeSuiteKey(singleGroup.title)
  if (!suiteMatchesBenchmark) {
    return {
      count: 1,
      label: "sub-benchmark",
      className:
        "border-sky-200/80 bg-sky-50/70 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300",
    }
  }

  const subtaskCount = getGroupSubtaskCount(singleGroup)
  if (subtaskCount > 0) {
    return {
      count: subtaskCount,
      label: `subtask${subtaskCount === 1 ? "" : "s"}`,
      className:
        "border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
    }
  }

  return null
}

interface ScoreRange {
  min: number
  max: number
}

const DEFAULT_SCORE_RANGE: ScoreRange = { min: 0, max: 1 }

function getScoreRange(values: number[]): ScoreRange {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  if (finiteValues.length === 0) {
    return DEFAULT_SCORE_RANGE
  }

  return {
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues),
  }
}

function normalizeWithinRange(value: number, range: ScoreRange): number {
  if (!Number.isFinite(value)) {
    return 0.5
  }

  const span = range.max - range.min
  if (span <= 0) {
    return 0.5
  }

  return Math.max(0, Math.min(1, (value - range.min) / span))
}

function formatNormalizedPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "N/A"
  }

  return `${(value * 100).toFixed(1)}%`
}

function isRangeEdge(value: number, range: ScoreRange, edge: "min" | "max") {
  const span = range.max - range.min
  if (!Number.isFinite(value) || span <= 0) {
    return false
  }

  const target = edge === "max" ? range.max : range.min
  const tolerance = Math.max(1e-4, span * 0.005)
  return Math.abs(value - target) <= tolerance
}

function getRangeLabels<T>(
  items: T[],
  getValue: (item: T) => number,
  getLabel: (item: T) => string
) {
  const finiteItems = items.filter((item) => Number.isFinite(getValue(item)))

  if (finiteItems.length === 0) {
    return { minLabel: "N/A", maxLabel: "N/A" }
  }

  const minItem = [...finiteItems].sort((a, b) => getValue(a) - getValue(b))[0]
  const maxItem = [...finiteItems].sort((a, b) => getValue(b) - getValue(a))[0]

  return {
    minLabel: getLabel(minItem),
    maxLabel: getLabel(maxItem),
  }
}

function ScoreRail({
  meanValue,
  meanLabel,
  range,
  minLabel,
  maxLabel,
}: {
  meanValue: number
  meanLabel: string
  range: ScoreRange
  minLabel: string
  maxLabel: string
}) {
  const meanPercent = normalizeWithinRange(meanValue, range) * 100
  const globalMinTitle = `Min: ${minLabel}`
  const globalMaxTitle = `Max: ${maxLabel}`

  return (
    <div className="relative h-1.5 flex-1 overflow-visible rounded-full bg-muted">
      <div className="h-full rounded-full bg-foreground/25" style={{ width: `${Math.max(meanPercent, 2)}%` }} />

      <span
        className="absolute top-1/2 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500"
        style={{ left: "0%" }}
        title={globalMinTitle}
        aria-hidden="true"
      />
      <span
        className="absolute top-1/2 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500"
        style={{ left: "100%" }}
        title={globalMaxTitle}
        aria-hidden="true"
      />

      <span
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-foreground shadow-sm"
        style={{ left: `${meanPercent}%` }}
        title={meanLabel}
        aria-hidden="true"
      />
    </div>
  )
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

function buildVariantStructuredSections(variant: BenchmarkVariant) {
  const detailEntries = variant.result.score_details.details
    ? Object.entries(variant.result.score_details.details)
    : []

  const numericBreakdown: Array<[string, unknown]> = []
  const helmMetrics: Array<{ label: string; tab: string; score: string }> = []
  const structuredBreakdown: Array<[string, unknown]> = []

  for (const [key, value] of detailEntries) {
    if (typeof value === "number") {
      numericBreakdown.push([key, value])
      continue
    }
    const parsed = parseHelmDetailEntry(value)
    if (parsed?.score != null && parsed.score !== "") {
      helmMetrics.push({ label: key, tab: parsed.tab ?? "", score: parsed.score })
      continue
    }
    // Skip internal HELM meta-fields that add no user value
    if (key === "description" || key === "tab") continue
    structuredBreakdown.push([key, value])
  }

  return { numericBreakdown, helmMetrics, structuredBreakdown }
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

function getEvalDetailHref(
  evaluation: BenchmarkEvaluation,
  result: EvaluationResult,
  returnTo?: string
) {
  const baseHref = evaluation.eval_summary_id
    ? `/evals/${evaluation.eval_summary_id}`
    : `/evals/${slugifyEvalSummaryId(`${evaluation.benchmark || getResultBenchmarkName(evaluation, result)}__${result.evaluation_name}`)}`

  if (!returnTo) {
    return baseHref
  }

  const params = new URLSearchParams({ from: returnTo })
  return `${baseHref}?${params.toString()}`
}

function getEvalSummaryIdFromHref(href: string) {
  const [, id = ""] = href.split("/evals/")
  return id.split("?")[0]?.split("#")[0] ?? ""
}

function getGroupPeerRank(
  group: BenchmarkGroup,
  modelIds: string[],
  peerRanks: PeerRanksMap
): { position: number; total: number } | null {
  let best: { position: number; total: number } | null = null

  for (const variant of group.variants) {
    const evalSummaryId =
      variant.evaluation.eval_summary_id ??
      getEvalSummaryIdFromHref(getEvalDetailHref(variant.evaluation, variant.result))
    const evalRanks = peerRanks[evalSummaryId]
    if (!evalRanks) continue

    // Try all known model IDs for this model family
    for (const mid of modelIds) {
      const rank = evalRanks[mid]
      if (rank == null) continue

      if (best == null) {
        best = rank
      } else {
        const rankRatio = rank.total > 0 ? rank.position / rank.total : rank.position
        const bestRatio = best.total > 0 ? best.position / best.total : best.position
        if (rankRatio < bestRatio) {
          best = rank
        }
      }
    }
  }

  return best ?? (group.bestRankPosition != null ? { position: group.bestRankPosition, total: group.bestRankTotal ?? 0 } : null)
}

type PeerRanksMap = Record<string, Record<string, { position: number; total: number }>>

let peerRanksPromise: Promise<PeerRanksMap> | null = null

const DATASET_PEER_RANKS_URL =
  "https://huggingface.co/datasets/evaleval/card_backend/resolve/main/peer-ranks.json"

function loadPeerRanks(): Promise<PeerRanksMap> {
  if (!peerRanksPromise) {
    peerRanksPromise = fetch(DATASET_PEER_RANKS_URL)
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
  return formatRawScoreValue(result.score_details.score, result.metric_config.unit)
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
    metricSummaryId: variant.result.metric_summary_id,
    metricKey: variant.result.metric_key,
    metricLabel: variant.metricLabel,
    variantType: variant.variantType,
    setupLabel: variant.setupLabel,
    subtaskLabel: variant.subtaskLabel,
    displayScore: variant.displayScore,
    sourceOrganization: getOrganizationDisplayName(variant.evaluation.source_metadata.source_organization_name),
    sourceName: normalizeDisplayLabel(variant.evaluation.source_metadata.source_name ?? ""),
    sourceType: variant.evaluation.source_metadata.source_type,
    sourceDataName,
    configEntries,
  })
}

function buildBenchmarkGroups(
  entries: Array<{ evaluation: BenchmarkEvaluation; result: EvaluationResult; category: CategoryType }>,
  benchmarkCards: Record<string, BenchmarkCard> | undefined,
  returnTo?: string
): BenchmarkGroup[] {
  const groups = new Map<string, BenchmarkGroup>()

  for (const entry of entries) {
    const rawBenchmarkName = entry.evaluation.benchmark || entry.evaluation.benchmark_parent_name || getResultBenchmarkName(entry.evaluation, entry.result)
    const title = entry.evaluation.display_name || entry.evaluation.slice_name || entry.evaluation.benchmark_leaf_name || entry.evaluation.benchmark_parent_name || entry.evaluation.benchmark || getResultBenchmarkName(entry.evaluation, entry.result)
    const canonicalTitle =
      entry.evaluation.canonical_display_name ||
      (entry.evaluation.slice_name && (entry.evaluation.benchmark_parent_name || entry.evaluation.benchmark)
        ? `${entry.evaluation.benchmark_parent_name || entry.evaluation.benchmark} / ${entry.evaluation.slice_name}`
        : title)
    const groupKey =
      entry.evaluation.eval_summary_id ??
      entry.evaluation.benchmark_parent_key ??
      entry.evaluation.benchmark_leaf_key ??
      entry.evaluation.benchmark ??
      "benchmark"
    const card = benchmarkCards
      ? lookupBenchmarkCard(benchmarkCards, rawBenchmarkName)
      : undefined
    const normalizedScore = normalizeScoreForDisplay(entry.result)
    const displayScore = formatResultDisplayScore(entry.result)
    const rawScore = entry.result.score_details.score
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
      metricLabel: descriptor.metricLabel,
      setupLabel: descriptor.setupLabel,
      subtaskLabel: descriptor.subtaskLabel,
      displayScore,
      normalizedScore,
      rankPosition,
      rankTotal,
      rankRatio,
    }

    const existing = groups.get(groupKey)

    if (!existing) {
      groups.set(groupKey, {
        key: groupKey,
        title,
        canonicalTitle,
        evalDetailHref: getEvalDetailHref(entry.evaluation, entry.result, returnTo),
        category: entry.category,
        description: entry.result.metric_config.evaluation_description ?? "",
        scoreType: entry.result.metric_config.score_type ?? "continuous",
        avgRawScore: rawScore,
        avgNormalizedScore: normalizedScore,
        avgDisplayScore: formatRawScoreValue(rawScore, entry.result.metric_config.unit),
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
    const newDesc = entry.result.metric_config.evaluation_description ?? ""
    if ((existing.description ?? "").length < newDesc.length) {
      existing.description = newDesc
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
      group.variants.sort((a, b) => {
        const aIsSubtask = Boolean(a.evaluation.slice_key)
        const bIsSubtask = Boolean(b.evaluation.slice_key)
        if (aIsSubtask !== bIsSubtask) {
          return aIsSubtask ? 1 : -1
        }

        const aPrimaryLabel = getVariantPrimaryLabel(a, group.title)
        const bPrimaryLabel = getVariantPrimaryLabel(b, group.title)
        if (aPrimaryLabel !== bPrimaryLabel) {
          return aPrimaryLabel.localeCompare(bPrimaryLabel)
        }

        return b.normalizedScore - a.normalizedScore
      })
      group.avgRawScore =
        group.variants.reduce((sum, variant) => sum + variant.result.score_details.score, 0) / group.variants.length
      group.avgNormalizedScore =
        group.variants.reduce((sum, variant) => sum + variant.normalizedScore, 0) / group.variants.length
      group.avgDisplayScore = formatRawScoreValue(group.avgRawScore)

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

export function BenchmarkDetail({
  summary,
  benchmarkCards,
  modelCards,
  evalHierarchy,
  comparisonIndex,
}: BenchmarkDetailProps) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [benchmarkSearch, setBenchmarkSearch] = useState("")
  const [benchmarkSort, setBenchmarkSort] = useState<"relevance" | "rank" | "score" | "name" | "variants" | "spread">("relevance")
  const [selectedCategories, setSelectedCategories] = useState<CategoryType[]>([])
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set())
  const [activeBenchmarkGroupKey, setActiveBenchmarkGroupKey] = useState<string | null>(null)

  const currentDetailHref = useMemo(() => {
    const query = searchParams.toString()
    return query ? `${pathname}?${query}` : pathname
  }, [pathname, searchParams])
  const modelId = summary.model_info.id
  // Collect all known model IDs for peer rank lookup (family ID + raw variant IDs)
  const modelIds = useMemo(() => {
    const ids = new Set<string>([modelId])
    if ('raw_model_ids' in summary) {
      for (const id of (summary as any).raw_model_ids ?? []) {
        ids.add(id)
      }
    }
    // Also add IDs from individual evaluations, including pipeline-computed family_id
    for (const evals of Object.values(summary.evaluations_by_category)) {
      for (const e of evals) {
        if (e.model_info?.id) ids.add(e.model_info.id)
        const familyId = (e.model_info as any)?.family_id
        if (familyId) ids.add(familyId)
      }
    }
    return Array.from(ids)
  }, [modelId, summary])

  const [peerRanks, setPeerRanks] = useState<PeerRanksMap>({})

  // Load peer-ranks.json once and store in state so the table can use them
  useEffect(() => {
    loadPeerRanks().then(setPeerRanks)
  }, [])

  // Composite relevance score for benchmark ordering
  // relevance = population × 0.4 + rank_extremity × 0.3 + has_metadata × 0.2 + recency × 0.1
  const getRelevanceScore = useMemo(() => {
    // Find max population across all peer-ranked benchmarks
    let maxPop = 1
    for (const evalRanks of Object.values(peerRanks)) {
      const pop = Object.keys(evalRanks).length
      if (pop > maxPop) maxPop = pop
    }

    // Find latest timestamp across all evaluations for recency normalization
    const allTimestamps: number[] = []
    for (const evals of Object.values(summary.evaluations_by_category)) {
      for (const e of evals) {
        const ts = parseFloat(e.retrieved_timestamp)
        if (Number.isFinite(ts)) allTimestamps.push(ts)
      }
    }
    const maxTs = allTimestamps.length > 0 ? Math.max(...allTimestamps) : 0
    const minTs = allTimestamps.length > 0 ? Math.min(...allTimestamps) : 0
    const tsRange = maxTs - minTs || 1

    return (group: BenchmarkGroup): number => {
      const rank = getGroupPeerRank(group, modelIds, peerRanks)

      // Population: how many models were compared (0-1)
      const population = rank ? Math.min(rank.total / maxPop, 1) : 0

      // Rank extremity: how far from median — |0.5 - percentile| × 2 (0-1)
      const percentile = rank ? rank.position / rank.total : 0.5
      const rankExtremity = Math.abs(0.5 - percentile) * 2

      // Rich metadata: has benchmark card (0 or 1)
      const hasMetadata = group.benchmarkCard ? 1 : 0

      // Recency: how recent is the latest evaluation (0-1)
      let latestTs = 0
      for (const v of group.variants) {
        const ts = parseFloat(v.evaluation.retrieved_timestamp)
        if (Number.isFinite(ts) && ts > latestTs) latestTs = ts
      }
      const recency = maxTs > minTs ? (latestTs - minTs) / tsRange : 0.5

      return population * 0.4 + rankExtremity * 0.3 + hasMetadata * 0.2 + recency * 0.1
    }
  }, [peerRanks, modelIds, summary.evaluations_by_category])

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
      organizations.add(getOrganizationDisplayName(evaluation.source_metadata.source_organization_name))
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
          evaluation.evaluation_results.map((result) => ({
            evaluation,
            result,
            category: category as CategoryType,
          }))
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
        title: group.canonicalTitle,
        label: narrative.label,
        description: narrative.description,
        scoreText: group.avgDisplayScore,
        level,
      }
    })
  }, [allCategoryResults, benchmarkCards])

  const policySummary = useMemo(() => {
    const benchmarkCount = new Set(
      allCategoryResults.map((entry) => entry.evaluation.benchmark || entry.evaluation.benchmark_parent_name || entry.evaluation.eval_summary_id || getResultBenchmarkName(entry.evaluation, entry.result))
    ).size
    const allThirdParty =
      allEvaluations.length > 0 && reportingStats.thirdPartyEvaluations === allEvaluations.length
    const leadOrganization = reportingStats.organizationNames[0]
    const modelScaleDescription = getModelScaleDescription(summary.model_info.additional_details?.params_billions)
    const compactParamCount = formatParamsBillions(summary.model_info.additional_details?.params_billions)
    const normalizedModelName = getModelDisplayName(summary.model_info.name)
    const compactModelName = compactParamCount ? `${normalizedModelName} · ${compactParamCount}` : normalizedModelName

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
    () => buildBenchmarkGroups(allCategoryResults, benchmarkCards, currentDetailHref),
    [allCategoryResults, benchmarkCards, currentDetailHref]
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
        group.canonicalTitle.toLowerCase().includes(query) ||
        group.description.toLowerCase().includes(query) ||
        group.variants.some((variant) => variant.label.toLowerCase().includes(query))
      )
    })

    const sortFn = (a: BenchmarkGroup, b: BenchmarkGroup) => {
      switch (benchmarkSort) {
        case "relevance":
          return getRelevanceScore(b) - getRelevanceScore(a)
        case "rank": {
          const aRank = getGroupPeerRank(a, modelIds, peerRanks)
          const bRank = getGroupPeerRank(b, modelIds, peerRanks)
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

    filtered.sort(sortFn)

    return filtered
  }, [benchmarkGroups, benchmarkSearch, benchmarkSort, selectedCategories, modelId, peerRanks])

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

  const suiteGroups = useMemo(() => {
    const groups = groupBySuite(filteredBenchmarkGroups, modelIds, peerRanks)
    // Re-sort suites by max relevance of their benchmarks
    return groups.sort((a, b) => {
      const aMax = Math.max(...a.benchmarks.map(getRelevanceScore))
      const bMax = Math.max(...b.benchmarks.map(getRelevanceScore))
      return bMax - aMax
    })
  }, [filteredBenchmarkGroups, modelIds, peerRanks, getRelevanceScore])

  const categorySuiteSections = useMemo(
    () =>
      groupedFilteredBenchmarkGroups
        .map(({ category, groups }) => ({
          category,
          suites: groupBySuite(groups, modelIds, peerRanks).sort((a, b) => {
            const aMax = Math.max(...a.benchmarks.map(getRelevanceScore))
            const bMax = Math.max(...b.benchmarks.map(getRelevanceScore))
            return bMax - aMax
          }),
        }))
        .filter((section) => section.suites.length > 0),
    [groupedFilteredBenchmarkGroups, modelIds, peerRanks, getRelevanceScore]
  )

  const categoryScoreRanges = useMemo(() => {
    const ranges = new Map<CategoryType, ScoreRange>()

    for (const section of categorySuiteSections) {
      ranges.set(
        section.category,
        getScoreRange(section.suites.map((suite) => suite.avgNormalizedScore))
      )
    }

    return ranges
  }, [categorySuiteSections])

  const suiteBenchmarkScoreRanges = useMemo(() => {
    const ranges = new Map<string, ScoreRange>()

    for (const section of categorySuiteSections) {
      for (const suite of section.suites) {
        ranges.set(
          suite.suiteKey,
          getScoreRange(suite.benchmarks.map((group) => group.avgNormalizedScore))
        )
      }
    }

    return ranges
  }, [categorySuiteSections])

  const benchmarkGroupLookup = useMemo(
    () => new Map(benchmarkGroups.map((group) => [group.key, group] as const)),
    [benchmarkGroups]
  )
  const activeBenchmarkGroup = activeBenchmarkGroupKey
    ? benchmarkGroupLookup.get(activeBenchmarkGroupKey) ?? null
    : null

  const toggleSuite = (suiteKey: string) => {
    setExpandedSuites((prev) => {
      const next = new Set(prev)
      if (next.has(suiteKey)) next.delete(suiteKey)
      else next.add(suiteKey)
      return next
    })
  }

  const overviewBenchmarkGroups =
    selectedCategories.length > 0 || benchmarkSearch.trim()
      ? filteredBenchmarkGroups
      : benchmarkGroups

  const rankedBenchmarkGroups = useMemo(
    () => overviewBenchmarkGroups.filter((group) => getGroupPeerRank(group, modelIds, peerRanks) != null),
    [overviewBenchmarkGroups, modelId, peerRanks]
  )
  const strongRankedBenchmarks = useMemo(
    () =>
      [...rankedBenchmarkGroups]
        .sort((a, b) => {
          const aRank = getGroupPeerRank(a, modelIds, peerRanks)
          const bRank = getGroupPeerRank(b, modelIds, peerRanks)
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
          const aRank = getGroupPeerRank(a, modelIds, peerRanks)
          const bRank = getGroupPeerRank(b, modelIds, peerRanks)
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
    if (benchmarkGroupLookup.has(groupKey)) {
      setActiveBenchmarkGroupKey(groupKey)
    }
  }

  // Model comparison logic
  const comparisonModels = useMemo(() => {
    if (!modelCards || modelCards.length === 0) return []
    // Exclude the current model
    return modelCards.filter(m => m.id !== modelId)
  }, [modelCards, modelId])

  // Per-benchmark extras added via the "+" button on each histogram.
  const [extraModelsByBenchmark, setExtraModelsByBenchmark] = useState<Record<string, string[]>>({})
  // Whether a plotbox's subtasks drawer is expanded.
  const [expandedPlotboxes, setExpandedPlotboxes] = useState<Set<string>>(new Set())
  // All histogram data now comes from `comparisonIndex` (comparison-index.json),
  // the backend-authoritative per-(eval, metric) leaderboard artifact. The old
  // `top_scores`-on-model-cards and per-eval-detail fan-out paths are retired.

  type HistogramBar = {
    modelId: string
    modelName: string
    score: number
    isCurrent: boolean
    isDefault: boolean
    submissionCount: number
    submissionAxis: SubmissionAxis
    headlineRunLabel?: string
    submissions?: ComparisonScoreEntry["submissions"]
    variantKey?: string
  }

  type BenchmarkHistogram = {
    histKey: string
    evalSummaryId: string
    metricSummaryId: string
    metricName: string
    metricGroup: ComparisonMetricEntry["group"]
    lowerIsBetter: boolean
    unit: string | null
    bars: HistogramBar[]
    availableModels: Array<{
      id: string
      name: string
      score: number
      submissionCount: number
      submissionAxis: SubmissionAxis
    }>
    defaultIds: Set<string>
    currentModelRank: { position: number; total: number } | null
  }

  const histKeyFor = (evalSummaryId: string, metricSummaryId: string) =>
    `${evalSummaryId}::${metricSummaryId}`

  // Every identifier the current model may appear under in comparison-index.
  // Used to (a) pull our own score out of `by_model` and (b) drop ourselves
  // out of the peer score list.
  const currentModelIdentityKeys = useMemo(() => {
    const keys = new Set<string>(
      [
        summary.model_info.id,
        (summary as any).model_family_id,
        (summary.model_info as any).family_id,
        (summary.model_info as any).model_route_id,
        ...((summary as any).raw_model_ids ?? []),
      ].filter(Boolean) as string[]
    )
    return keys
  }, [summary])

  // The primary model_route_id that keys into comparison-index.by_model for
  // this page. Prefer an explicit route id; otherwise derive one.
  const currentModelRouteId = useMemo(() => {
    const explicit =
      (summary.model_info as any).model_route_id ||
      (summary as any).model_route_id
    if (typeof explicit === "string" && explicit.length > 0) return explicit
    const id = summary.model_info.id || ""
    return id.replace(/[/]/g, "__")
  }, [summary])

  // Per-(eval, metric) leaderboards sourced from comparison-index.json.
  const benchmarkHistograms = useMemo<Map<string, BenchmarkHistogram>>(() => {
    const result = new Map<string, BenchmarkHistogram>()
    if (!comparisonIndex) return result

    const currentModelName = getModelDisplayName(summary.model_info.name)

    // Resolve every eval_summary_id we care about from the current model's
    // benchmarkGroups — this is the intersection of "what this model reports"
    // and "what comparison-index covers".
    const wantedEvalIds = new Set<string>()
    for (const group of benchmarkGroups) {
      for (const variant of group.variants) {
        if (variant.evaluation.eval_summary_id) {
          wantedEvalIds.add(variant.evaluation.eval_summary_id)
        }
      }
    }

    const byModelForCurrent =
      comparisonIndex.by_model[currentModelRouteId] ?? {}

    for (const evalId of wantedEvalIds) {
      const evalEntry = comparisonIndex.evals[evalId]
      if (!evalEntry) continue

      for (const metric of evalEntry.metrics) {
        const histKey = histKeyFor(evalId, metric.metric_summary_id)
        const lowerIsBetter = Boolean(metric.lower_is_better)

        // The current model's own row (if present) lives both in scores[] and
        // in by_model. We look it up by any of the known identity keys and
        // pull out its score/rank/submission info.
        let currentRow: ComparisonScoreEntry | undefined
        for (const s of metric.scores) {
          if (
            currentModelIdentityKeys.has(s.model_route_id) ||
            currentModelIdentityKeys.has(s.model_family_id)
          ) {
            currentRow = s
            break
          }
        }
        const byModelRow =
          byModelForCurrent[evalId]?.[metric.metric_summary_id]

        const currentScore = currentRow?.score ?? byModelRow?.score
        if (currentScore == null || !Number.isFinite(currentScore)) {
          // We don't have a score on this (eval, metric) — skip the histogram.
          // The tab will just not render.
          continue
        }
        const currentModelRank =
          currentRow != null
            ? { position: currentRow.rank, total: currentRow.total }
            : byModelRow != null
              ? { position: byModelRow.rank, total: byModelRow.total }
              : null

        // Peer rows = everything in scores[] that isn't us. Backend already
        // sorts best-first in the metric's own direction; we preserve that.
        const peerRows = metric.scores.filter(
          (s) =>
            !currentModelIdentityKeys.has(s.model_route_id) &&
            !currentModelIdentityKeys.has(s.model_family_id)
        )

        const defaults = new Set<string>()
        if (peerRows.length > 0) {
          // Best and worst come straight off the pre-sorted list.
          defaults.add(peerRows[0].model_route_id)
          defaults.add(peerRows[peerRows.length - 1].model_route_id)
          // Two peers closest to the current score.
          const closest = [...peerRows]
            .sort(
              (a, b) =>
                Math.abs(a.score - currentScore) -
                Math.abs(b.score - currentScore)
            )
            .filter((p) => !defaults.has(p.model_route_id))
            .slice(0, 2)
          for (const p of closest) defaults.add(p.model_route_id)
        }

        const extras = extraModelsByBenchmark[histKey] ?? []
        const selectedIds = new Set<string>([...defaults, ...extras])

        const peerBars: HistogramBar[] = peerRows
          .filter((p) => selectedIds.has(p.model_route_id))
          .map((p) => ({
            modelId: p.model_route_id,
            modelName: getModelDisplayName(p.model_family_name),
            score: p.score,
            isCurrent: false,
            isDefault: defaults.has(p.model_route_id),
            submissionCount: p.submission_count,
            submissionAxis: p.submission_axis,
            headlineRunLabel: p.headline_run_label,
            submissions: p.submissions,
            variantKey: p.variant_key,
          }))

        const currentBar: HistogramBar = {
          modelId: currentModelRouteId,
          modelName: currentModelName,
          score: currentScore,
          isCurrent: true,
          isDefault: true,
          submissionCount: currentRow?.submission_count ?? byModelRow?.submission_count ?? 1,
          submissionAxis:
            currentRow?.submission_axis ?? byModelRow?.submission_axis ?? "default",
          headlineRunLabel: currentRow?.headline_run_label,
          submissions: currentRow?.submissions,
          variantKey: currentRow?.variant_key,
        }

        const bars = [currentBar, ...peerBars].sort((a, b) =>
          lowerIsBetter ? a.score - b.score : b.score - a.score
        )

        const availableModels = peerRows
          .filter((p) => !selectedIds.has(p.model_route_id))
          .map((p) => ({
            id: p.model_route_id,
            name: p.model_family_name,
            score: p.score,
            submissionCount: p.submission_count,
            submissionAxis: p.submission_axis,
          }))

        result.set(histKey, {
          histKey,
          evalSummaryId: evalId,
          metricSummaryId: metric.metric_summary_id,
          metricName: metric.metric_name,
          metricGroup: metric.group,
          lowerIsBetter,
          unit: metric.unit,
          bars,
          availableModels,
          defaultIds: defaults,
          currentModelRank,
        })
      }
    }

    return result
  }, [
    benchmarkGroups,
    comparisonIndex,
    currentModelIdentityKeys,
    currentModelRouteId,
    extraModelsByBenchmark,
    summary.model_info.name,
  ])

  const togglePlotboxExpanded = (key: string) => {
    setExpandedPlotboxes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // A plotbox is either one eval's metrics as tabs (SciArena: Elo/Cost/Rank)
  // or one family's evals as tabs (RewardBench 2: rollup + 6 components).
  // Every plotbox renders the same way — single-tab boxes just hide the tab
  // bar. Plotbox grouping is driven entirely by comparison-index's own
  // benchmark_family_key so it stays in sync with the backend.
  type PlotboxTab = {
    tabKey: string
    label: string
    histKey: string
    evalSummaryId: string
    metricSummaryId: string
    evalDisplayName: string
    evalEntry: ComparisonEvalEntry
    metricEntry: ComparisonMetricEntry
    isRollup: boolean
    group: BenchmarkGroup
    variant: BenchmarkVariant
  }

  type PlotboxUnit = {
    unitKey: string
    familyKey: string
    familyName: string
    category: CategoryType
    kind: "single-eval" | "multi-eval"
    childKindLabel: "metric" | "benchmark" | "component" | "subtask" | null
    tabs: PlotboxTab[]
    primaryGroup: BenchmarkGroup
  }

  // Strip the family name from a child's display so tabs read "Korean" rather
  // than "Global MMLU Lite Korean" and "Math" rather than "Reward Bench 2 Math".
  const stripFamilyPrefix = (label: string, familyName: string): string => {
    if (!familyName) return label
    const trimmed = label.trim()
    const fam = familyName.trim()
    if (trimmed.toLowerCase() === fam.toLowerCase()) return "Overall"
    if (trimmed.toLowerCase().startsWith(fam.toLowerCase() + " ")) {
      return trimmed.slice(fam.length).trim()
    }
    return trimmed
  }

  const plotboxUnits = useMemo<PlotboxUnit[]>(() => {
    if (!comparisonIndex) return []

    type ResolvedGroup = {
      group: BenchmarkGroup
      evalEntry: ComparisonEvalEntry
    }
    const familyBuckets = new Map<
      string,
      { familyName: string; category: CategoryType; resolved: ResolvedGroup[] }
    >()

    for (const group of filteredBenchmarkGroups) {
      const evalId = group.variants.find((v) => v.evaluation.eval_summary_id)
        ?.evaluation.eval_summary_id
      if (!evalId) continue
      const evalEntry = comparisonIndex.evals[evalId]
      if (!evalEntry) continue

      const famKey = evalEntry.benchmark_family_key ?? evalId
      const famName =
        evalEntry.benchmark_family_name || evalEntry.display_name || famKey
      const bucket = familyBuckets.get(famKey) ?? {
        familyName: famName,
        category: group.category,
        resolved: [] as ResolvedGroup[],
      }
      bucket.resolved.push({ group, evalEntry })
      familyBuckets.set(famKey, bucket)
    }

    const variantFor = (
      group: BenchmarkGroup,
      metricSummaryId: string
    ): BenchmarkVariant => {
      return (
        group.variants.find(
          (v) => v.result.metric_summary_id === metricSummaryId
        ) ?? group.variants[0]
      )
    }

    const units: PlotboxUnit[] = []
    for (const [famKey, bucket] of familyBuckets.entries()) {
      const { familyName, category, resolved } = bucket

      if (resolved.length === 1) {
        // One eval in scope — tabs are the eval's metrics.
        const { group, evalEntry } = resolved[0]
        const evalDisplay =
          evalEntry.display_name || evalEntry.benchmark_leaf_name || group.title
        const tabs: PlotboxTab[] = evalEntry.metrics.map((metric) => ({
          tabKey: `${evalEntry.eval_summary_id}::${metric.metric_summary_id}`,
          label: metric.metric_name || "Score",
          histKey: histKeyFor(evalEntry.eval_summary_id, metric.metric_summary_id),
          evalSummaryId: evalEntry.eval_summary_id,
          metricSummaryId: metric.metric_summary_id,
          evalDisplayName: evalDisplay,
          evalEntry,
          metricEntry: metric,
          isRollup: false,
          group,
          variant: variantFor(group, metric.metric_summary_id),
        }))
        if (tabs.length === 0) continue
        units.push({
          unitKey: `eval:${evalEntry.eval_summary_id}`,
          familyKey: famKey,
          familyName: evalDisplay,
          category,
          kind: "single-eval",
          childKindLabel: tabs.length > 1 ? "metric" : null,
          tabs,
          primaryGroup: group,
        })
        continue
      }

      // Multi-eval family — tabs are evals. Each tab uses its eval's primary
      // metric (metrics[0]), which the backend sorted by group_order +
      // alphabetical. Secondary metrics show up in the accordion.
      const rollup =
        resolved.find(
          (r) =>
            r.evalEntry.benchmark_leaf_key != null &&
            r.evalEntry.benchmark_leaf_key === r.evalEntry.benchmark_family_key
        ) ?? null
      const children = rollup ? resolved.filter((r) => r !== rollup) : resolved
      const ordered: ResolvedGroup[] = rollup ? [rollup, ...children] : children

      const tabs: PlotboxTab[] = []
      for (const r of ordered) {
        const metric = r.evalEntry.metrics[0]
        if (!metric) continue
        const rawLabel =
          r.evalEntry.benchmark_leaf_name ||
          r.evalEntry.display_name ||
          r.group.title
        const label =
          r === rollup ? "Overall" : stripFamilyPrefix(rawLabel, familyName)
        tabs.push({
          tabKey: `${r.evalEntry.eval_summary_id}::${metric.metric_summary_id}`,
          label: label || rawLabel,
          histKey: histKeyFor(r.evalEntry.eval_summary_id, metric.metric_summary_id),
          evalSummaryId: r.evalEntry.eval_summary_id,
          metricSummaryId: metric.metric_summary_id,
          evalDisplayName: rawLabel,
          evalEntry: r.evalEntry,
          metricEntry: metric,
          isRollup: r === rollup,
          group: r.group,
          variant: variantFor(r.group, metric.metric_summary_id),
        })
      }
      if (tabs.length === 0) continue

      let hasComponent = false
      let hasSubtask = false
      let hasDistinctLeaves = false
      for (const r of children) {
        const leafKey = r.evalEntry.benchmark_leaf_key
        if (leafKey && leafKey !== r.evalEntry.benchmark_family_key) {
          hasDistinctLeaves = true
        }
        if (r.group.variants[0]?.evaluation.benchmark_component_key ?? null) {
          hasComponent = true
        } else {
          hasSubtask = true
        }
      }
      const childKindLabel: PlotboxUnit["childKindLabel"] =
        hasComponent && hasSubtask
          ? "component"
          : hasComponent
            ? "metric"
            : hasDistinctLeaves
              ? "benchmark"
              : "subtask"

      units.push({
        unitKey: `family:${famKey}`,
        familyKey: famKey,
        familyName,
        category,
        kind: "multi-eval",
        childKindLabel,
        tabs,
        primaryGroup: (rollup ?? children[0] ?? resolved[0]).group,
      })
    }

    return units
  }, [comparisonIndex, filteredBenchmarkGroups])

  // Per-plotbox active tab (tab key → unitKey).
  const [activeTabByUnit, setActiveTabByUnit] = useState<Record<string, string>>({})

  const getActiveTab = (unit: PlotboxUnit): PlotboxTab => {
    const explicit = activeTabByUnit[unit.unitKey]
    if (explicit) {
      const match = unit.tabs.find((t) => t.tabKey === explicit)
      if (match) return match
    }
    return unit.tabs[0]
  }

  const submissionChipCopy = (
    axis: SubmissionAxis,
    count: number,
    headlineLabel?: string
  ): { short: string; long: string } | null => {
    if (count <= 1 || axis === "default") return null
    const others = count - 1
    const variantNoun = (n: number) => (n === 1 ? "variant" : "variants")
    switch (axis) {
      case "harness":
        return {
          short: `+${others} harness${others === 1 ? "" : "es"}`,
          long: headlineLabel
            ? `${headlineLabel} · +${others} harness${others === 1 ? "" : "es"}`
            : `+${others} harness${others === 1 ? "" : "es"}`,
        }
      case "variant":
        return {
          short: `+${others} ${variantNoun(others)}`,
          long: headlineLabel
            ? `${headlineLabel} · +${others} ${variantNoun(others)}`
            : `+${others} ${variantNoun(others)}`,
        }
      case "rerun":
        return {
          short: `+${others} re-run${others === 1 ? "" : "s"}`,
          long: headlineLabel
            ? `${headlineLabel} · +${others} re-run${others === 1 ? "" : "s"}`
            : `+${others} re-run${others === 1 ? "" : "s"}`,
        }
      case "mixed":
        return {
          short: `+${others} submissions`,
          long: `+${others} submissions`,
        }
    }
  }

  const renderPlotbox = (unit: PlotboxUnit) => {
    const activeTab = getActiveTab(unit)
    if (!activeTab) return null

    const hist = benchmarkHistograms.get(activeTab.histKey)

    // Fallback: no comparison rows loaded yet, or the metric has zero peers.
    // Still draw the current model's own bar from BenchmarkGroup data.
    const activeHist: BenchmarkHistogram = hist ?? {
      histKey: activeTab.histKey,
      evalSummaryId: activeTab.evalSummaryId,
      metricSummaryId: activeTab.metricSummaryId,
      metricName: activeTab.metricEntry.metric_name,
      metricGroup: activeTab.metricEntry.group,
      lowerIsBetter: Boolean(activeTab.metricEntry.lower_is_better),
      unit: activeTab.metricEntry.unit,
      bars: [
        {
          modelId: currentModelRouteId,
          modelName: getModelDisplayName(summary.model_info.name),
          score: activeTab.variant.result.score_details.score,
          isCurrent: true,
          isDefault: true,
          submissionCount: 1,
          submissionAxis: "default",
        },
      ],
      availableModels: [],
      defaultIds: new Set<string>(),
      currentModelRank: null,
    }

    const scores = activeHist.bars.map((b) => b.score)
    const rawMax = Math.max(...scores)
    const rawMin = Math.min(...scores)
    const hasSpread = rawMax !== rawMin
    const domainMin = hasSpread ? rawMin - (rawMax - rawMin) * 0.15 : Math.min(0, rawMin)
    const domainMax = hasSpread
      ? rawMax + (rawMax - rawMin) * 0.15
      : rawMax === 0
        ? 1
        : rawMax * 1.2
    const range = domainMax - domainMin || 1

    const bestScore = activeHist.lowerIsBetter ? rawMin : rawMax
    const worstScore = activeHist.lowerIsBetter ? rawMax : rawMin
    let bestBarId: string | null = null
    let worstBarId: string | null = null
    if (hasSpread) {
      for (const b of activeHist.bars) {
        if (!bestBarId && b.score === bestScore) bestBarId = b.modelId
        if (!worstBarId && b.score === worstScore) worstBarId = b.modelId
      }
    }

    const rank = activeHist.currentModelRank
    const plotboxKey = unit.unitKey
    const hasTabBar = unit.tabs.length > 1
    const childKindCount = unit.tabs.length - (unit.tabs.some((t) => t.isRollup) ? 1 : 0)
    const showChildKindBadge =
      hasTabBar && unit.childKindLabel != null && childKindCount > 0
    const childKindPlural =
      unit.childKindLabel === "metric"
        ? childKindCount === 1 ? "metric" : "metrics"
        : unit.childKindLabel === "subtask"
          ? childKindCount === 1 ? "subtask" : "subtasks"
          : unit.childKindLabel === "benchmark"
            ? childKindCount === 1 ? "benchmark" : "benchmarks"
            : childKindCount === 1 ? "component" : "components"

    // Accordion data depends on the unit kind:
    // - single-eval: per-variant (language / subtask / setup) splits of this
    //   eval on the active metric, pulled from the current model's variants.
    // - multi-eval: secondary metrics for the active child eval (the metrics
    //   that aren't headline/tab material).
    type AccordionRow = { label: string; score: string }
    const accordion: { title: string; rows: AccordionRow[] } | null = (() => {
      if (unit.kind === "single-eval") {
        const metricMatchedVariants = activeTab.group.variants.filter(
          (v) =>
            (v.result.metric_summary_id ?? "") === activeTab.metricSummaryId
        )

        // Some benchmark families (for example Global MMLU Lite) publish each
        // slice as its own metric ID. If we only keep metric-matched variants,
        // the accordion collapses to a single row and subtasks disappear.
        const candidateVariants =
          metricMatchedVariants.length > 1
            ? metricMatchedVariants
            : activeTab.group.variants

        const dedupedRows = new Map<string, AccordionRow>()
        for (const variant of candidateVariants) {
          const label = variant.subtaskLabel || variant.setupLabel || variant.label
          if (!label || dedupedRows.has(label)) {
            continue
          }

          dedupedRows.set(label, {
            label,
            score: variant.displayScore,
          })
        }

        const rows = Array.from(dedupedRows.values())
        if (rows.length <= 1) return null

        return {
          title: `${rows.length} splits`,
          rows,
        }
      }
      // multi-eval
      const secondaryMetrics = activeTab.evalEntry.metrics.filter(
        (m) => m.metric_summary_id !== activeTab.metricSummaryId
      )
      if (secondaryMetrics.length === 0) return null
      const rows: AccordionRow[] = secondaryMetrics
        .map((m) => {
          // Current model's score on this secondary metric.
          const byModelRow =
            comparisonIndex?.by_model?.[currentModelRouteId]?.[
              activeTab.evalSummaryId
            ]?.[m.metric_summary_id]
          const scoreVal =
            byModelRow?.score ??
            activeTab.group.variants.find(
              (v) => v.result.metric_summary_id === m.metric_summary_id
            )?.result.score_details.score
          if (scoreVal == null || !Number.isFinite(scoreVal)) return null
          return {
            label: m.metric_name,
            score: formatRawScoreValue(scoreVal, m.unit ?? undefined),
          }
        })
        .filter((r): r is AccordionRow => r != null)
      if (rows.length === 0) return null
      return {
        title: `${rows.length} other metric${rows.length === 1 ? "" : "s"}`,
        rows,
      }
    })()

    return (
      <div
        key={plotboxKey}
        className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getCategoryTone(unit.category)}`}
              >
                {unit.category}
              </span>
              {showChildKindBadge && (
                <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {childKindCount} {childKindPlural}
                </span>
              )}
              {rank && (
                <span className="inline-flex items-center rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  #{rank.position}
                  {rank.total ? `/${rank.total}` : ""}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => jumpToDeepDive(activeTab.group.key)}
              className="mt-2 block w-full truncate text-left text-sm font-semibold underline decoration-dotted underline-offset-4 hover:text-primary"
              title={unit.familyName}
            >
              {unit.familyName}
            </button>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {activeHist.lowerIsBetter ? "Lower is better" : "Higher is better"}
            </div>
          </div>
          {activeHist.availableModels.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 shrink-0 rounded-full p-0"
                  aria-label="Add a model to this histogram"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-72 w-64 overflow-y-auto"
              >
                <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Add model
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {activeHist.availableModels.slice(0, 80).map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    onSelect={() => {
                      setExtraModelsByBenchmark((prev) => {
                        const current = prev[activeHist.histKey] ?? []
                        if (current.includes(m.id)) return prev
                        return { ...prev, [activeHist.histKey]: [...current, m.id] }
                      })
                    }}
                    className="flex items-center justify-between gap-4 text-xs"
                  >
                    <span className="truncate">{getModelDisplayName(m.name)}</span>
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {formatRawScoreValue(m.score)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Tab row (shown only when there are multiple tabs) */}
        {hasTabBar && (
          <div className="mt-3 -mx-1 flex flex-wrap gap-1">
            {unit.tabs.map((tab) => {
              const isActive = tab.tabKey === activeTab.tabKey
              return (
                <button
                  key={tab.tabKey}
                  type="button"
                  onClick={() =>
                    setActiveTabByUnit((prev) => ({
                      ...prev,
                      [unit.unitKey]: tab.tabKey,
                    }))
                  }
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    isActive
                      ? "border-foreground/50 bg-foreground text-background"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={isActive}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Spacer pushes the chart to the bottom of the card so bar baselines
            align across plotboxes regardless of whether a tab row is present. */}
        <div className="flex-1" />

        {/* Chart */}
        <div
          className="relative mt-4 grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${activeHist.bars.length}, minmax(0, 1fr))`,
          }}
        >
          {activeHist.bars.map((bar) => {
            const normalized = (bar.score - domainMin) / range
            const clampedNorm = Math.max(Math.min(normalized, 1), 0)
            const heightPct = Math.max(clampedNorm * 100, 4)
            const isExtra = !activeHist.defaultIds.has(bar.modelId) && !bar.isCurrent
            const isBest = bar.modelId === bestBarId && !bar.isCurrent
            const isWorst =
              bar.modelId === worstBarId && !bar.isCurrent && bestBarId !== worstBarId

            return (
              <div
                key={bar.modelId}
                className="group flex min-w-0 flex-col items-center"
              >
                <div className="relative flex h-44 w-full items-end">
                  <div
                    className={`w-full rounded-t-sm transition-all duration-300 ${
                      bar.isCurrent
                        ? "shadow-[0_1px_0_rgba(90,170,209,0.18)]"
                        : isExtra
                          ? "bg-amber-300/70 dark:bg-amber-400/60"
                          : isBest
                            ? "bg-muted-foreground/60"
                            : isWorst
                              ? "bg-muted-foreground/15"
                              : "bg-muted-foreground/30"
                    }`}
                    style={{
                      height: `${heightPct}%`,
                      ...(bar.isCurrent
                        ? {
                            background:
                              "linear-gradient(to top, #5aaad1, #9bcbe3)",
                          }
                        : {}),
                    }}
                  />
                  <div
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-foreground/80"
                    style={{ bottom: `calc(${heightPct}% + 2px)` }}
                  >
                    {formatRawScoreValue(bar.score, activeHist.unit ?? undefined)}
                  </div>
                  {isExtra && (
                    <button
                      type="button"
                      aria-label={`Remove ${bar.modelName}`}
                      onClick={() => {
                        setExtraModelsByBenchmark((prev) => {
                          const next = (prev[activeHist.histKey] ?? []).filter(
                            (id) => id !== bar.modelId
                          )
                          const copy = { ...prev }
                          if (next.length === 0) delete copy[activeHist.histKey]
                          else copy[activeHist.histKey] = next
                          return copy
                        })
                      }}
                      className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground shadow-sm transition hover:text-destructive group-hover:flex"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                <div
                  className={`mt-1.5 w-full truncate text-center text-[10px] leading-tight ${
                    bar.isCurrent
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }`}
                  title={bar.modelName}
                >
                  {bar.modelName}
                </div>
                {(() => {
                  const chip = submissionChipCopy(
                    bar.submissionAxis,
                    bar.submissionCount,
                    bar.headlineRunLabel
                  )
                  if (!chip) return null
                  const submissions = bar.submissions ?? []
                  const trigger = (
                    <button
                      type="button"
                      className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border/60 bg-muted/20 px-1.5 py-[1px] text-[9px] font-medium text-muted-foreground hover:text-foreground"
                      title={chip.long}
                    >
                      {chip.short}
                    </button>
                  )
                  if (submissions.length === 0) return trigger
                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="max-h-72 w-72 overflow-y-auto">
                        <DropdownMenuLabel className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          <span>{bar.modelName}</span>
                          <span className="font-mono tabular-nums">{chip.short}</span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {submissions.map((s, i) => (
                          <DropdownMenuItem
                            key={`${s.run_kind}::${s.run_label}::${i}`}
                            className="flex items-center justify-between gap-3 text-xs"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              <span className="mr-1 rounded bg-muted px-1 py-[1px] text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                {s.run_kind}
                              </span>
                              {s.run_label}
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatRawScoreValue(s.score, activeHist.unit ?? undefined)}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                })()}
              </div>
            )
          })}
        </div>

        {hasSpread && domainMin > 0.0001 && (
          <div className="mt-1 flex items-center justify-center gap-1.5 text-[9px] text-muted-foreground/80">
            <svg
              aria-hidden
              width="14"
              height="8"
              viewBox="0 0 14 8"
              className="shrink-0"
            >
              <path
                d="M0 4 L3 4 L5 1 L7 7 L9 1 L11 7 L14 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
            <span className="font-mono tabular-nums">
              axis zoomed: {formatRawScoreValue(domainMin, activeHist.unit ?? undefined)} –{" "}
              {formatRawScoreValue(domainMax, activeHist.unit ?? undefined)}
            </span>
          </div>
        )}

        {accordion && (
          <div className="mt-3 border-t border-border/40 pt-3">
            <button
              type="button"
              onClick={() => togglePlotboxExpanded(plotboxKey)}
              aria-expanded={expandedPlotboxes.has(plotboxKey)}
              className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
            >
              <span>{accordion.title}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  expandedPlotboxes.has(plotboxKey) ? "rotate-180" : ""
                }`}
              />
            </button>
            {expandedPlotboxes.has(plotboxKey) && (
              <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto pr-1">
                {accordion.rows.map((row, i) => (
                  <li
                    key={`${row.label}::${i}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-2 py-1 text-[11px]"
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-muted-foreground"
                      title={row.label}
                    >
                      {row.label}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-foreground/80">
                      {row.score}
                    </span>
                  </li>
                ))}
                <li className="pt-1.5">
                  <button
                    type="button"
                    onClick={() => jumpToDeepDive(activeTab.group.key)}
                    className="text-[11px] font-medium text-primary underline decoration-dotted underline-offset-4 hover:text-primary/80"
                  >
                    View deep dive →
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}

        {!hist && (
          <div className="mt-2 text-[10px] text-muted-foreground/70">
            {comparisonIndex ? "No peer scores for this metric." : "Loading comparison data…"}
          </div>
        )}
      </div>
    )
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
                <div className="text-2xl font-semibold tracking-tight sm:text-[1.9rem]">{getModelDisplayName(summary.model_info.name)}</div>
                <div className="text-sm text-muted-foreground">
                  {getOrganizationDisplayName(summary.model_info.developer)}
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
                <SelectItem value="relevance">Most relevant</SelectItem>
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

        <div className={`grid gap-3 ${isResearchView ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}>
          <div className="rounded-2xl border bg-emerald-50/70 p-3.5 dark:bg-emerald-950/20">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/90 dark:text-emerald-300">
              Strong scores
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {strongRankedBenchmarks.length > 0 ? (
                strongRankedBenchmarks.map((group) => {
                  const rank = getGroupPeerRank(group, modelIds, peerRanks)
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
                  const rank = getGroupPeerRank(group, modelIds, peerRanks)
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

        {filteredBenchmarkGroups.length === 0 || plotboxUnits.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No benchmarks match the current search or category filters.
          </div>
        ) : (
          (() => {
            // Group plotbox units by category, preserving the order in
            // summary.categories_covered. Within each category, standalone
            // families render as a visually grouped block (e.g. Fibble), while
            // composite benchmarks and single leaves share one responsive grid.
            const categoryOrder = new Map(
              summary.categories_covered.map((cat, i) => [cat, i])
            )
            const byCategory = new Map<CategoryType, PlotboxUnit[]>()
            for (const unit of plotboxUnits) {
              const list = byCategory.get(unit.category) ?? []
              list.push(unit)
              byCategory.set(unit.category, list)
            }
            const orderedCategories = Array.from(byCategory.keys()).sort(
              (a, b) =>
                (categoryOrder.get(a) ?? 999) - (categoryOrder.get(b) ?? 999)
            )

            return (
              <div className="space-y-6">
                {orderedCategories.map((category) => {
                  const units = byCategory.get(category) ?? []
                  const familyCount = units.filter(
                    (u) => u.kind === "multi-eval"
                  ).length
                  // Each tab represents one (eval, metric) comparison; a unit
                  // with N tabs contributes N cells to the total.
                  const totalBenchmarks = units.reduce(
                    (sum, u) => sum + u.tabs.length,
                    0
                  )

                  return (
                    <section
                      key={`category-section-${category}`}
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getCategoryTone(category)}`}
                        >
                          {category}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {totalBenchmarks} benchmark{totalBenchmarks === 1 ? "" : "s"}
                          {familyCount > 0 && (
                            <>
                              {" "}· {familyCount}{" "}
                              {familyCount === 1 ? "family" : "families"}
                            </>
                          )}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {units.map((unit) => renderPlotbox(unit))}
                      </div>
                    </section>
                  )
                })}
              </div>
            )
          })()
        )}
      </section>

      <Dialog
        open={activeBenchmarkGroup != null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveBenchmarkGroupKey(null)
          }
        }}
      >
        <DialogContent className="max-h-[88dvh] max-w-[94vw] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-5xl">
          {activeBenchmarkGroup && <BenchmarkDeepDiveDialogPanel group={activeBenchmarkGroup} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SampleDataDialog({
  samples: initialSamples,
  evaluationName,
  fullDataUrl,
}: {
  samples: any[],
  evaluationName: string
  fullDataUrl?: string
}) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [allSamples, setAllSamples] = useState<any[]>(initialSamples)
  const [isLoadingAll, setIsLoadingAll] = useState(false)
  const [hasLoadedAll, setHasLoadedAll] = useState(false)
  const itemsPerPage = 10

  const filteredSamples = allSamples.filter(sample => {
    const term = searchTerm.toLowerCase()
    return (
      (sample.input ?? "").toLowerCase().includes(term) ||
      (sample.response ?? "").toLowerCase().includes(term) ||
      (sample.ground_truth ?? "").toLowerCase().includes(term)
    )
  })

  const totalPages = Math.ceil(filteredSamples.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const currentSamples = filteredSamples.slice(startIndex, startIndex + itemsPerPage)

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const [loadError, setLoadError] = useState<string | null>(null)

  const handleLoadAll = async () => {
    if (!fullDataUrl) {
      setLoadError("No data URL available for this benchmark")
      return
    }
    if (hasLoadedAll) return
    setIsLoadingAll(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/instance-data?url=${encodeURIComponent(fullDataUrl)}`)
      const data = await res.json()
      if (data.error) {
        setLoadError(data.error)
      } else if (data.samples && data.samples.length > 0) {
        setAllSamples(data.samples)
        setHasLoadedAll(true)
      } else {
        setLoadError("No samples found in the full dataset")
      }
    } catch (err) {
      setLoadError(`Failed to load: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setIsLoadingAll(false)
    }
  }

  const handleOpenToggle = () => {
    const nextOpen = !open
    setOpen(nextOpen)

    if (nextOpen && fullDataUrl && !hasLoadedAll && !isLoadingAll) {
      void handleLoadAll()
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={handleOpenToggle}>
        <Database className="h-4 w-4" />
        {open ? "Hide instances" : "View all instances"}
      </Button>
      {open && (
      <div className="rounded-xl border bg-background p-4 space-y-3">
        <div>
          <div className="font-semibold">Sample Level Data</div>
          <div className="text-sm text-muted-foreground">
            {hasLoadedAll
              ? `All ${allSamples.length} samples from ${evaluationName}`
              : `Showing ${allSamples.length} preview samples from ${evaluationName}`}
          </div>
        </div>

        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search samples..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          {isLoadingAll && (
            <div className="text-xs text-muted-foreground">Loading all instances…</div>
          )}
          {loadError && (
            <div className="text-xs text-destructive">{loadError}</div>
          )}
          <div className="text-sm text-muted-foreground whitespace-nowrap sm:ml-auto">
            Showing {filteredSamples.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, filteredSamples.length)} of {filteredSamples.length}
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
                          {typeof sample.score === 'number' ? formatRawScoreValue(sample.score) : sample.score || 'N/A'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
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
      </div>
      )}
    </>
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
  // Inline samples from the dataset are shown immediately
  const inlineSamples = evaluation.detailed_evaluation_results_per_samples
  const detailedUrl = result.detailed_evaluation_results_url

  const randomSample = useMemo(() => {
    if (!inlineSamples || inlineSamples.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * inlineSamples.length);
    return inlineSamples[randomIndex];
  }, [inlineSamples]);

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
  
    let displayScore = formatRawScoreValue(score)
    let displayUnit = normalizeDisplayLabel(unit) || "Score"
  const evaluationVariant = getEvaluationVariantLabel(evaluation)
  
    if (unit === 'points') {
      displayScore = score.toFixed(1)
      displayUnit = "/ 10"
    } else if (unit === 'accuracy' || unit === 'pass@1' || !unit) {
      displayUnit = normalizeDisplayLabel(unit) || "Accuracy"
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
                      <span className="font-medium">{getOrganizationDisplayName(evaluation.source_metadata.source_organization_name)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Relationship:</span>
                      <Badge variant="outline" className="text-xs">{getRelationshipDisplayName(evaluation.source_metadata.evaluator_relationship)}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Source Type:</span>
                      <span>{getSourceTypeDisplayName(evaluation.source_metadata.source_type)}</span>
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
                                valDisplay = formatRawScoreValue(value);
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

            {/* Sample Level Data — inline samples from the dataset show immediately */}
            {inlineSamples && inlineSamples.length > 0 && randomSample && (
              <div>
                <Separator className="my-6" />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-primary" />
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sample Level Data (Random Sample)</div>
                  </div>
                  <Badge variant="outline">{inlineSamples.length} Samples</Badge>
                </div>

                <div className="space-y-4">
                  <div className="bg-muted/10 border rounded-lg p-4 text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="secondary" className="font-mono text-xs">ID: {randomSample.sample_id}</Badge>
                    </div>

                    <div className="grid gap-4">
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Input</div>
                        <div className="bg-muted/30 p-3 rounded whitespace-pre-wrap font-mono text-xs max-h-60 overflow-y-auto">{randomSample.input}</div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Model Response</div>
                          <div className="bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded whitespace-pre-wrap text-blue-900 dark:text-blue-100 max-h-60 overflow-y-auto">
                            {randomSample.response}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Ground Truth</div>
                          <div className="bg-green-50/50 dark:bg-green-900/10 p-3 rounded whitespace-pre-wrap text-green-900 dark:text-green-100 max-h-60 overflow-y-auto">
                            {randomSample.ground_truth}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center pt-2">
                    <SampleDataDialog
                      samples={inlineSamples}
                      evaluationName={result.evaluation_name}
                      fullDataUrl={detailedUrl}
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
  const sourceOrganizations = new Set(group.variants.map((variant) => getOrganizationDisplayName(variant.evaluation.source_metadata.source_organization_name)))
  const latestTimestamp = group.variants.reduce((latest, variant) => {
    const value = Number.parseFloat(variant.evaluation.retrieved_timestamp)
    return Number.isFinite(value) ? Math.max(latest, value) : latest
  }, Number.NEGATIVE_INFINITY)
  const latestReportedLabel =
    Number.isFinite(latestTimestamp) ? formatCompactDate(String(latestTimestamp)) : formatCompactDate(group.variants[0]?.evaluation.retrieved_timestamp ?? "")
  const compactDomains = group.domains.slice(0, 2)
  const progressWidth = Math.max(4, Math.min(100, group.avgNormalizedScore * 100))
  const subtaskCount = getGroupSubtaskCount(group)

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
                  {subtaskCount > 0 && (
                    <span className="shrink-0 rounded-full border border-emerald-200/70 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                      {subtaskCount} subtask{subtaskCount === 1 ? "" : "s"}
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
                {group.variants.length} {group.variants.length === 1 ? "row" : "rows"}
              </span>

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
                  Metrics & Breakdown
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {isResearchView
                    ? "Benchmark-level metrics and benchmark breakdowns are shown separately from setup changes."
                    : "Root benchmark metrics and real benchmark breakdowns are shown without inventing extra hierarchy in the UI."}
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
                    const leaderRawScore = filteredRows[0]?.variant.result.score_details.score ?? variant.result.score_details.score
                    const gapToLeader = Math.max(0, leaderRawScore - variant.result.score_details.score)
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
                                  <span>{index === 0 ? "Leader" : `-${formatRawScoreValue(gapToLeader)}`}</span>
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
                                      {getRelationshipDisplayName(variant.evaluation.source_metadata.evaluator_relationship)}
                                    </div>
                                  </>
                                ) : (
                                  <div className="mt-1 text-sm capitalize text-muted-foreground">
                                    {getRelationshipDisplayName(variant.evaluation.source_metadata.evaluator_relationship)}
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
                                  {getOrganizationDisplayName(variant.evaluation.source_metadata.source_organization_name)}
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
                      No rows match the current filters.
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

function BenchmarkDeepDiveDialogPanel({
  group,
}: {
  group: BenchmarkGroup
}) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const [resolvedRanks, setResolvedRanks] = useState<Record<string, { position: number; total: number | null }>>({})
  const [isResolvingRanks, setIsResolvingRanks] = useState(false)
  const compactDomains = group.domains.slice(0, 2)
  const subtaskCount = getGroupSubtaskCount(group)
  const hasSubtaskMatrix = subtaskCount > 0
  const sourceOrganizations = useMemo(
    () => new Set(group.variants.map((variant) => getOrganizationDisplayName(variant.evaluation.source_metadata.source_organization_name))),
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
        const evalSummaryId = variant.evaluation.eval_summary_id ?? getEvalSummaryIdFromHref(evalHref)
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

  const subtaskMatrix = useMemo(() => {
    if (!hasSubtaskMatrix) {
      return null
    }

    const rowOrder: string[] = []
    const setupOrder: string[] = []
    const cells = new Map<string, typeof variantRows>()

    for (const row of variantRows) {
      const primaryLabel = getVariantPrimaryLabel(row.variant, group.title)
      const setupDisplayLabel = formatSetupDisplayLabel(row.variant.setupLabel)

      if (!rowOrder.includes(primaryLabel)) {
        rowOrder.push(primaryLabel)
      }

      if (!setupOrder.includes(setupDisplayLabel)) {
        setupOrder.push(setupDisplayLabel)
      }

      const cellKey = `${primaryLabel}::${setupDisplayLabel}`
      const existing = cells.get(cellKey) ?? []
      existing.push(row)
      cells.set(cellKey, existing)
    }

    return {
      rowOrder,
      setupOrder,
      cells,
    }
  }, [group.title, hasSubtaskMatrix, variantRows])

  const useSingleSetupOverview = Boolean(subtaskMatrix && subtaskMatrix.setupOrder.length === 1)
  const singleSetupDisplayLabel = useSingleSetupOverview ? subtaskMatrix?.setupOrder[0] ?? null : null

  useEffect(() => {
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
  }, [resolvedRanks, variantRows])

  return (
    <>
      <DialogHeader className="gap-3 border-b border-border/60 px-5 py-4 text-left sm:px-6">
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getCategoryTone(group.category)}`}>
                {group.category}
              </span>
              {group.benchmarkCard && (
                <span className="rounded-full border border-border/50 bg-muted/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Card
                </span>
              )}
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
            <DialogTitle className="mt-2 pr-4">{getBenchmarkGroupHeading(group)}</DialogTitle>
            <DialogDescription>
              {isResearchView
                ? "Inspect setup subtasks, score details, and source provenance in one focused view."
                : "Inspect reporting setup and evidence details before interpreting benchmark position."}
            </DialogDescription>
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

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>{group.variants.length} {group.variants.length === 1 ? "reported row" : "reported rows"}</span>
          <span className="flex flex-wrap items-center gap-2">
            {hasSubtaskMatrix && (
              <span className="rounded-full border border-emerald-200/80 bg-emerald-50/70 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                {subtaskCount} benchmark subtask{subtaskCount === 1 ? "" : "s"}
              </span>
            )}
            {group.variants.some(v => v.evaluation.detailed_evaluation_results_per_samples && v.evaluation.detailed_evaluation_results_per_samples.length > 0) && (
              <span className="rounded-full border border-sky-200/80 bg-sky-50/60 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
                Has samples
              </span>
            )}
            <span>{sourceOrganizations.size} source{sourceOrganizations.size === 1 ? "" : "s"}</span>
          </span>
        </div>
      </DialogHeader>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
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

        {useSingleSetupOverview ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">Subtask overview</h4>
                <p className="text-xs text-muted-foreground">
                  {isResearchView
                    ? "This benchmark reports one setup, so subtasks, scores, and provenance are merged into one comparison view."
                    : "This benchmark only reports one setup, so the subtask evidence is consolidated into a single reader-friendly view."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {singleSetupDisplayLabel && (
                  <span className="rounded-full border border-sky-200/80 bg-sky-50/70 px-2 py-1 text-[10px] font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
                    {singleSetupDisplayLabel}
                  </span>
                )}
                <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                  {variantRows.length} row{variantRows.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="min-h-0 overflow-auto rounded-xl border border-border/70 bg-background">
              <Table className="table-fixed">
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[36%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Subtask</TableHead>
                    <TableHead className="w-[36%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Evidence</TableHead>
                    <TableHead className="w-[14%] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Score</TableHead>
                    <TableHead className="w-[14%] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Rank</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variantRows.map((row) => {
                    const { rowKey, variant, configEntries } = row
                    const resolvedRank = resolvedRanks[rowKey]
                    const primaryLabel = getVariantPrimaryLabel(variant, group.title)
                    const filteredConfigEntries = configEntries.filter(([key]) => key.toLowerCase() !== "setup")

                    return (
                      <TableRow key={rowKey} className="align-top hover:bg-muted/10">
                        <TableCell className="px-4 py-3 align-top whitespace-normal">
                          <div className="space-y-1.5">
                            <div className="font-medium leading-5">{primaryLabel}</div>
                            <div className="flex flex-wrap items-center gap-2">
                              {!variant.evaluation.slice_key && (
                                <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Benchmark-level metric
                                </span>
                              )}
                              {variant.variantType !== "default" && (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getVariantTypeTone(variant.variantType)}`}>
                                  {getVariantTypeLabel(variant.variantType)}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 align-top whitespace-normal">
                          <div className="space-y-1.5 text-sm">
                            <div className="font-medium leading-5">{getOrganizationDisplayName(variant.evaluation.source_metadata.source_organization_name)}</div>
                            <div className="text-xs text-muted-foreground">{singleSetupDisplayLabel}</div>
                            {filteredConfigEntries.length > 0 && (
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {filteredConfigEntries
                                  .slice(0, 2)
                                  .map(([key, value]) => `${formatConfigLabel(key)}=${getConfigDisplayValue(value)}`)
                                  .join(" · ")}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right align-top font-semibold tabular-nums">{variant.displayScore}</TableCell>
                        <TableCell className="px-4 py-3 text-right align-top tabular-nums text-muted-foreground">
                          {(variant.rankPosition != null || resolvedRank)
                            ? `#${resolvedRank?.position ?? variant.rankPosition}${(resolvedRank?.total ?? variant.rankTotal) ? `/${resolvedRank?.total ?? variant.rankTotal}` : ""}`
                            : "N/A"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : subtaskMatrix ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">Benchmark matrix</h4>
                <p className="text-xs text-muted-foreground">
                  {isResearchView
                    ? "Rows reflect benchmark rows. Columns separate reporting setups. Cells show the strongest reported result for each combination."
                    : "Rows follow the benchmark breakdown directly. Columns show the setup used to report them so readers can compare like with like."}
                </p>
              </div>
              <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                {subtaskMatrix.rowOrder.length} row{subtaskMatrix.rowOrder.length === 1 ? "" : "s"} x {subtaskMatrix.setupOrder.length} setup{subtaskMatrix.setupOrder.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="min-h-0 overflow-auto rounded-xl border border-border/70 bg-background">
              <Table className="min-w-[44rem] table-fixed">
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[24%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Row
                    </TableHead>
                    {subtaskMatrix.setupOrder.map((setupDisplayLabel) => (
                      <TableHead
                        key={`${group.key}-${setupDisplayLabel}`}
                        className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                      >
                        {setupDisplayLabel}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subtaskMatrix.rowOrder.map((primaryLabel) => (
                    <TableRow key={`${group.key}-${primaryLabel}`} className="align-top hover:bg-muted/10">
                      <TableCell className="px-4 py-3 align-top whitespace-normal">
                        <div className="space-y-1">
                          <div className="font-medium leading-5">{primaryLabel}</div>
                          {!((subtaskMatrix.cells.get(`${primaryLabel}::${subtaskMatrix.setupOrder[0]}`) ?? [])[0]?.variant.evaluation.slice_key) && (
                            <div className="text-[11px] text-muted-foreground">
                              Benchmark-level metric
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {subtaskMatrix.setupOrder.map((setupDisplayLabel) => {
                        const matrixRows = subtaskMatrix.cells.get(`${primaryLabel}::${setupDisplayLabel}`) ?? []
                        const leadRow = matrixRows[0]

                        if (!leadRow) {
                          return (
                            <TableCell
                              key={`${group.key}-${primaryLabel}-${setupDisplayLabel}`}
                              className="px-4 py-3 align-top text-sm text-muted-foreground"
                            >
                              <span className="inline-flex rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[11px]">
                                Not reported
                              </span>
                            </TableCell>
                          )
                        }

                        const resolvedRank = resolvedRanks[leadRow.rowKey]
                        const rankLabel = (leadRow.variant.rankPosition != null || resolvedRank)
                          ? `#${resolvedRank?.position ?? leadRow.variant.rankPosition}${(resolvedRank?.total ?? leadRow.variant.rankTotal) ? `/${resolvedRank?.total ?? leadRow.variant.rankTotal}` : ""}`
                          : "Unranked"
                        const rawVariantLabel = leadRow.variant.label !== primaryLabel ? leadRow.variant.label : null

                        return (
                          <TableCell
                            key={`${group.key}-${primaryLabel}-${setupDisplayLabel}`}
                            className="px-4 py-3 align-top whitespace-normal"
                          >
                            <div className="space-y-1.5">
                              <div className="text-sm font-semibold tabular-nums">{leadRow.variant.displayScore}</div>
                              <div className="text-[11px] tabular-nums text-muted-foreground">{rankLabel}</div>
                              <div className="text-[11px] text-muted-foreground line-clamp-2">
                                {getOrganizationDisplayName(leadRow.variant.evaluation.source_metadata.source_organization_name)}
                              </div>
                              {rawVariantLabel && (
                                <div className="text-[11px] text-muted-foreground line-clamp-2">{rawVariantLabel}</div>
                              )}
                              {matrixRows.length > 1 && (
                                <div className="text-[11px] font-medium text-muted-foreground">
                                  {matrixRows.length} reports in this cell
                                </div>
                              )}
                            </div>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : null}

        {!useSingleSetupOverview && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">{subtaskMatrix ? "Reported rows" : "Benchmark breakdown"}</h4>
              <p className="text-xs text-muted-foreground">
                {subtaskMatrix
                  ? "Use the matrix above for the quick cross-setup comparison. This table keeps every reported row with its setup, source, and config detail."
                  : "Primary row labels show the benchmark slice or subtask. Setup and source details sit alongside each row."}
              </p>
            </div>
          </div>

          <div className="min-h-0 overflow-auto rounded-xl border border-border/70 bg-background">
          <Table className="table-fixed">
            <TableHeader className="bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[34%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Subtask</TableHead>
                <TableHead className="w-[42%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Reporting setup</TableHead>
                <TableHead className="w-[12%] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Score</TableHead>
                <TableHead className="w-[12%] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Rank</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variantRows.map((row) => {
                const { rowKey, variant, configEntries } = row
                const resolvedRank = resolvedRanks[rowKey]
                const primaryLabel = getVariantPrimaryLabel(variant, group.title)
                const setupDisplayLabel = formatSetupDisplayLabel(variant.setupLabel)
                const rawVariantLabel = variant.label !== primaryLabel ? variant.label : null

                return (
                  <TableRow key={rowKey} className="align-top hover:bg-muted/20">
                    <TableCell className="px-4 py-3 align-top whitespace-normal">
                      <div className="space-y-1">
                        <div className="font-medium leading-5">{primaryLabel}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getVariantTypeTone(variant.variantType)}`}>
                            {getVariantTypeLabel(variant.variantType)}
                          </span>
                          {rawVariantLabel && <span className="line-clamp-1">{rawVariantLabel}</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top whitespace-normal">
                      <div className="space-y-1">
                        <div className="text-sm font-medium leading-5">{setupDisplayLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {getOrganizationDisplayName(variant.evaluation.source_metadata.source_organization_name)}
                        </div>
                        {configEntries.length > 0 && (
                          <div className="text-xs text-muted-foreground line-clamp-2">
                          {configEntries
                            .slice(0, 3)
                            .map(([key, value]) => `${formatConfigLabel(key)}=${getConfigDisplayValue(value)}`)
                            .join(" · ")}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right align-top font-semibold tabular-nums">{variant.displayScore}</TableCell>
                    <TableCell className="px-4 py-3 text-right align-top tabular-nums text-muted-foreground">
                      {(variant.rankPosition != null || resolvedRank)
                        ? `#${resolvedRank?.position ?? variant.rankPosition}${(resolvedRank?.total ?? variant.rankTotal) ? `/${resolvedRank?.total ?? variant.rankTotal}` : ""}`
                        : "N/A"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </div>
        </section>
        )}

        {(() => {
          const variantWithSamples = group.variants.find(v => v.evaluation.detailed_evaluation_results_per_samples && v.evaluation.detailed_evaluation_results_per_samples.length > 0)
          if (!variantWithSamples) return null
          const samples = variantWithSamples.evaluation.detailed_evaluation_results_per_samples!
          const fullDataUrl = variantWithSamples.result.detailed_evaluation_results_url
            ?? variantWithSamples.evaluation.evaluation_results.find(r => r.detailed_evaluation_results_url)?.detailed_evaluation_results_url
          return (
            <div className="space-y-2 rounded-xl border border-sky-200/60 bg-sky-50/30 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                Sample data preview ({samples.length} examples)
              </div>
              <div className="space-y-2">
                {samples.slice(0, INSTANCE_PREVIEW_LIMIT).map((sample, idx) => (
                  <div key={idx} className="rounded-lg border bg-background/80 p-3 text-sm">
                    {sample.input && (
                      <div className="mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Input</span>
                        <div className="mt-0.5 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs">{sample.input.slice(0, 400)}{sample.input.length > 400 ? "..." : ""}</div>
                      </div>
                    )}
                    {sample.response && (
                      <div className="mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Response</span>
                        <div className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs">{sample.response.slice(0, 300)}{sample.response.length > 300 ? "..." : ""}</div>
                      </div>
                    )}
                    {sample.ground_truth && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-green-700 dark:text-green-400">Ground truth</span>
                        <div className="mt-0.5 whitespace-pre-wrap text-xs text-green-900 dark:text-green-100">{sample.ground_truth.slice(0, 200)}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {(samples.length > INSTANCE_PREVIEW_LIMIT || fullDataUrl) && (
                <SampleDataDialog
                  samples={samples}
                  evaluationName={variantWithSamples.result.evaluation_name}
                  fullDataUrl={fullDataUrl}
                />
              )}
            </div>
          )
        })()}

        <div className="flex justify-end">
          <Link href={group.evalDetailHref}>
            <Button variant="outline">View full leaderboard</Button>
          </Link>
        </div>
      </div>
    </>
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
  const { numericBreakdown, helmMetrics, structuredBreakdown } = buildVariantStructuredSections(variant)
  const sourceTypeLabel = getSourceTypeDisplayName(variant.evaluation.source_metadata.source_type)
  const sourceData = !Array.isArray(variant.result.source_data ?? variant.evaluation.source_data)
    ? (variant.result.source_data ?? variant.evaluation.source_data) as import("@/lib/benchmark-schema").SourceData
    : null
  const evalLibrary = variant.evaluation.eval_library
  const uncertainty = (variant.result.score_details as any).uncertainty as { standard_error?: { value: number }; num_samples?: number } | undefined
  const confidenceInterval = variant.result.score_details.confidence_interval
  const numSamples = uncertainty?.num_samples ?? variant.result.score_details.sample_size ?? sourceData?.samples_number ?? sampleCount
  const stdError = uncertainty?.standard_error?.value
  const inferencePlatform = variant.evaluation.model_info.inference_platform
  // Source URLs for linking
  const sourceUrls: string[] = Array.isArray(sourceData?.url)
    ? (sourceData.url as string[])
    : sourceData?.url
      ? [sourceData.url as string]
      : sourceData?.dataset_url
        ? [sourceData.dataset_url]
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
            {getRelationshipDisplayName(variant.evaluation.source_metadata.evaluator_relationship)}
          </Badge>
          {numSamples != null && <Badge variant="outline">{Number(numSamples).toLocaleString()} samples</Badge>}
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
            <InlineMeta label="Organization" value={getOrganizationDisplayName(variant.evaluation.source_metadata.source_organization_name)} />
            <InlineMeta label="Source Type" value={sourceTypeLabel} />
            <InlineMeta label="Relationship" value={getRelationshipDisplayName(variant.evaluation.source_metadata.evaluator_relationship)} />
            <InlineMeta
              label={isResearchView ? "Dataset" : "Benchmark"}
              value={normalizeDisplayLabel(sourceData?.dataset_name ?? group.title)}
            />
            {sourceData?.hf_repo && (
              <InlineMeta label="HF Repo" value={
                <a href={`https://huggingface.co/datasets/${sourceData.hf_repo}`} target="_blank" rel="noopener noreferrer"
                   className="text-primary hover:underline">{sourceData.hf_repo}</a>
              } />
            )}
            {sourceData?.dataset_version && <InlineMeta label="Dataset Version" value={sourceData.dataset_version} />}
            {sourceData?.hf_split && <InlineMeta label="Split" value={sourceData.hf_split} />}
            {variant.subtaskLabel && <InlineMeta label="Subtask" value={normalizeDisplayLabel(variant.subtaskLabel)} />}
            {variant.setupLabel && <InlineMeta label="Setup" value={formatSetupDisplayLabel(variant.setupLabel)} />}
            {inferencePlatform && <InlineMeta label="Inference Platform" value={inferencePlatform} />}
            {variant.evaluation.source_metadata.source_name && (
              <InlineMeta label="Source Name" value={normalizeDisplayLabel(variant.evaluation.source_metadata.source_name)} />
            )}
            <InlineMeta label="Reported" value={formatCompactDate(variant.evaluation.retrieved_timestamp)} />
            <InlineMeta label="Score" value={variant.displayScore} />
            {numSamples != null && <InlineMeta label="Sample Count" value={Number(numSamples).toLocaleString()} />}
            {stdError != null && <InlineMeta label="Std Error" value={`±${stdError}`} />}
            {confidenceInterval && (
              <InlineMeta
                label="Confidence Interval"
                value={`[${confidenceInterval.lower.toFixed(3)}, ${confidenceInterval.upper.toFixed(3)}] @ ${(confidenceInterval.confidence_level * 100).toFixed(0)}%`}
              />
            )}
            {sourceUrls.length > 0 && (
              <InlineMeta label="Source URL" value={
                <div className="flex flex-col gap-0.5">
                  {sourceUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                       className="truncate text-primary hover:underline text-xs"
                       title={url}>{url.replace(/^https?:\/\//, "").slice(0, 50)}{url.length > 57 ? "…" : ""}</a>
                  ))}
                </div>
              } />
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
                  <div className="mb-2 text-lg font-semibold">{formatRawScoreValue(numericValue, variant.result.metric_config.unit)}</div>
                  <Progress value={Math.max(0, Math.min(100, normalizedValue))} className="h-1.5" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {helmMetrics.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Additional Metrics
          </div>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Metric</TableHead>
                  <TableHead className="w-[100px]">Category</TableHead>
                  <TableHead className="text-right w-[100px]">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {helmMetrics.map(({ label, tab, score }) => {
                  const numericScore = Number.parseFloat(score)
                  return (
                    <TableRow key={label}>
                      <TableCell className="whitespace-normal text-sm">{label}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{tab}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-sm">
                        {Number.isFinite(numericScore) ? numericScore.toFixed(3) : score}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {structuredBreakdown.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Supporting Detail
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

      {/* Instance-level sample data */}
      {variant.evaluation.detailed_evaluation_results_per_samples &&
        variant.evaluation.detailed_evaluation_results_per_samples.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Sample data ({variant.evaluation.detailed_evaluation_results_per_samples.length} examples)
          </div>
          <div className="space-y-2">
            {variant.evaluation.detailed_evaluation_results_per_samples.slice(0, INSTANCE_PREVIEW_LIMIT).map((sample, idx) => (
              <div key={idx} className="rounded-lg border bg-muted/10 p-3 text-sm">
                {sample.input && (
                  <div className="mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Input</span>
                    <div className="mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs">{sample.input.slice(0, 500)}</div>
                  </div>
                )}
                {sample.response && (
                  <div className="mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Response</span>
                    <div className="mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs">{sample.response.slice(0, 500)}</div>
                  </div>
                )}
                {sample.ground_truth && (
                  <div className="mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-green-700 dark:text-green-400">Ground truth</span>
                    <div className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-green-900 dark:text-green-100">{sample.ground_truth.slice(0, 300)}</div>
                  </div>
                )}
                {sample.is_correct != null && (
                  <div className="mt-1 text-[10px] font-medium text-muted-foreground">
                    {sample.is_correct ? "Correct" : "Incorrect"}
                  </div>
                )}
              </div>
            ))}
          </div>
          {(variant.evaluation.detailed_evaluation_results_per_samples.length > INSTANCE_PREVIEW_LIMIT ||
            variant.result.detailed_evaluation_results_url ||
            variant.evaluation.evaluation_results.find(r => r.detailed_evaluation_results_url)?.detailed_evaluation_results_url) && (
            <SampleDataDialog
              samples={variant.evaluation.detailed_evaluation_results_per_samples}
              evaluationName={variant.result.evaluation_name}
              fullDataUrl={variant.result.detailed_evaluation_results_url ?? variant.evaluation.evaluation_results.find(r => r.detailed_evaluation_results_url)?.detailed_evaluation_results_url}
            />
          )}
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
                  {formatRawScoreValue(stat.avg_score)}
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
                          {((getEvaluationVariantLabel(eval_) ? `Setup: ${formatSetupDisplayLabel(getEvaluationVariantLabel(eval_))}` : null)) || (Array.isArray(eval_.source_data)
                            ? (normalizeDisplayLabel(eval_.source_metadata.source_name) || 'Unknown')
                            : normalizeDisplayLabel(eval_.source_data.dataset_name))}
                        </div>
                      </div>
                      <div className="font-mono font-semibold">
                        {formatRawScoreValue(result.score_details.score, result.metric_config.unit)}
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
