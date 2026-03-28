"use client"

// Force recompile
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
import type { BenchmarkEvaluation, CategoryType, EvaluationResult } from "@/lib/benchmark-schema"
import { inferCategoryFromBenchmark } from "@/lib/benchmark-schema"
import { formatScore, getBenchmarkDisplayName } from "@/lib/eval-processing"
import type { ModelSummaryCore } from "@/lib/benchmark-schema"
import { Fragment, useState, useEffect, useMemo, type CSSProperties } from "react"

interface BenchmarkDetailProps {
  summary: ModelSummaryCore
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
}

interface BenchmarkGroup {
  key: string
  title: string
  description: string
  scoreType: EvaluationResult["metric_config"]["score_type"] | "mixed"
  avgNormalizedScore: number
  avgDisplayScore: string
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

  const generationArgs = variant.result.generation_config?.generation_args

  if (generationArgs) {
    for (const [key, value] of collectConfigEntries(generationArgs)) {
      configMap[key] = value
    }
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
  entries: Array<{ evaluation: BenchmarkEvaluation; result: EvaluationResult }>
): BenchmarkGroup[] {
  const groups = new Map<string, BenchmarkGroup>()

  for (const entry of entries) {
    const title = getBenchmarkDisplayName(getResultBenchmarkName(entry.evaluation, entry.result))
    const normalizedScore = normalizeScoreForDisplay(entry.result)
    const displayScore = formatResultDisplayScore(entry.result)
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
    }

    const existing = groups.get(title)

    if (!existing) {
      groups.set(title, {
        key: title,
        title,
        description: entry.result.metric_config.evaluation_description,
        scoreType: entry.result.metric_config.score_type,
        avgNormalizedScore: normalizedScore,
        avgDisplayScore: `${(normalizedScore * 100).toFixed(1)}%`,
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

export function BenchmarkDetail({ summary }: BenchmarkDetailProps) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const [benchmarkSearch, setBenchmarkSearch] = useState("")
  const [benchmarkSort, setBenchmarkSort] = useState<"score" | "name" | "variants" | "spread">("score")
  const [expandedBenchmarkKey, setExpandedBenchmarkKey] = useState<string | null>(null)
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

            return resultCategory === category ? [{ evaluation, result }] : []
          })
        )
      ),
    [summary.evaluations_by_category]
  )

  const policyHighlights = useMemo(() => {
    const groups = buildBenchmarkGroups(allCategoryResults)
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
  }, [allCategoryResults])

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

  const benchmarkGroups = useMemo(() => buildBenchmarkGroups(allCategoryResults), [allCategoryResults])

  const bestBenchmark = benchmarkGroups[0]
  const weakestBenchmark = benchmarkGroups[benchmarkGroups.length - 1]
  const widestBenchmark = [...benchmarkGroups].sort((a, b) => getBenchmarkSpread(b) - getBenchmarkSpread(a))[0]
  const repeatedBenchmarkCount = benchmarkGroups.filter((group) => group.variants.length > 1).length
  const setupDrivenBenchmarkCount = benchmarkGroups.filter((group) =>
    group.variants.some((variant) => variant.variantType === "setup" || variant.variantType === "setup+subtask")
  ).length
  const subtaskDrivenBenchmarkCount = benchmarkGroups.filter((group) =>
    group.variants.some((variant) => variant.variantType === "subtask" || variant.variantType === "setup+subtask")
  ).length

  const filteredBenchmarkGroups = useMemo(() => {
    const query = benchmarkSearch.trim().toLowerCase()
    const filtered = benchmarkGroups.filter((group) => {
      if (!query) {
        return true
      }

      return (
        group.title.toLowerCase().includes(query) ||
        group.description.toLowerCase().includes(query) ||
        group.variants.some((variant) => variant.label.toLowerCase().includes(query))
      )
    })

    const sorted = [...filtered]
    switch (benchmarkSort) {
      case "name":
        sorted.sort((a, b) => a.title.localeCompare(b.title))
        break
      case "variants":
        sorted.sort((a, b) => b.variants.length - a.variants.length || b.avgNormalizedScore - a.avgNormalizedScore)
        break
      case "spread":
        sorted.sort((a, b) => getBenchmarkSpread(b) - getBenchmarkSpread(a) || b.avgNormalizedScore - a.avgNormalizedScore)
        break
      case "score":
      default:
        sorted.sort((a, b) => b.avgNormalizedScore - a.avgNormalizedScore)
        break
    }

    return sorted
  }, [benchmarkGroups, benchmarkSearch, benchmarkSort])

  useEffect(() => {
    if (!expandedBenchmarkKey) {
      return
    }

    const stillVisible = filteredBenchmarkGroups.some((group) => group.key === expandedBenchmarkKey)
    if (!stillVisible) {
      setExpandedBenchmarkKey(null)
    }
  }, [expandedBenchmarkKey, filteredBenchmarkGroups])

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
  
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
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

            <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[560px] xl:grid-cols-4">
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-sky-900/40 dark:bg-sky-950/20 dark:shadow-none">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-sky-700 dark:text-sky-200 whitespace-nowrap">Benchmarks</div>
                <div className="mt-1 text-[1.8rem] font-semibold leading-none text-sky-950 dark:text-sky-50">{benchmarkGroups.length}</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] dark:shadow-none">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground whitespace-nowrap">Results</div>
                <div className="mt-1 text-[1.8rem] font-semibold leading-none">{summary.total_evaluations}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:shadow-none">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-emerald-700 dark:text-emerald-200 whitespace-nowrap">
                  Reporting orgs
                </div>
                <div className="mt-1 text-[1.8rem] font-semibold leading-none text-emerald-950 dark:text-emerald-50">
                  {reportingStats.organizationCount}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-amber-900/40 dark:bg-amber-950/20 dark:shadow-none">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-amber-700 dark:text-amber-200 whitespace-nowrap">
                  Source types
                </div>
                <div className="mt-1 text-[1.8rem] font-semibold leading-none text-amber-950 dark:text-amber-50">
                  {reportingStats.sourceTypeCount}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)]">
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
              <div className="rounded-[1.5rem] border bg-gradient-to-br from-amber-50/80 via-background to-rose-50/60 p-4 dark:from-amber-950/20 dark:via-background dark:to-rose-950/20">
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

      <section className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={benchmarkSearch}
                onChange={(event) => setBenchmarkSearch(event.target.value)}
                placeholder="Search benchmarks or setups"
                className="pl-9"
              />
            </div>

            <Select value={benchmarkSort} onValueChange={(value) => setBenchmarkSort(value as typeof benchmarkSort)}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Sort benchmarks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Highest score first</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
                <SelectItem value="variants">Most comparison slices</SelectItem>
                <SelectItem value="spread">Largest setup swing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className={`grid gap-4 ${isResearchView ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}>
          {bestBenchmark && (
            <div className="rounded-[1.5rem] border bg-emerald-50/70 p-4 dark:bg-emerald-950/20">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/90 dark:text-emerald-300">
                Strongest Reported Benchmark
              </div>
              <div className="mt-2 text-base font-semibold tracking-tight">{bestBenchmark.title}</div>
              <div className="mt-1 text-[13px] leading-5 text-muted-foreground">{bestBenchmark.description}</div>
              <div className="mt-3 text-[1.75rem] font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{bestBenchmark.avgDisplayScore}</div>
            </div>
          )}

          {widestBenchmark && (
            <div className="rounded-[1.5rem] border bg-amber-50/70 p-4 dark:bg-amber-950/20">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700/90 dark:text-amber-300">
                Widest score gap
              </div>
              <div className="mt-2 text-base font-semibold tracking-tight">{widestBenchmark.title}</div>
              <div className="mt-1 text-[13px] leading-5 text-muted-foreground">
                {widestBenchmark.variants.length} reported slice{widestBenchmark.variants.length === 1 ? "" : "s"} with the biggest spread between highest and lowest scores
              </div>
              <div className="mt-3 text-[1.75rem] font-semibold tracking-tight text-amber-700 dark:text-amber-300">
                {(getBenchmarkSpread(widestBenchmark) * 100).toFixed(1)} pts
              </div>
            </div>
          )}

              <div className="rounded-[1.5rem] border bg-sky-50/70 p-4 dark:bg-sky-950/20">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700/90 dark:text-sky-300">
              Coverage Snapshot
            </div>
            <div className="mt-2 text-base font-semibold tracking-tight">{benchmarkGroups.length} benchmarks</div>
                <div className="mt-1 text-[13px] leading-5 text-muted-foreground">
              {repeatedBenchmarkCount} benchmark{repeatedBenchmarkCount === 1 ? "" : "s"} include multiple comparison slices.
                </div>
            <div className="mt-3 text-[13px] font-medium text-sky-700 dark:text-sky-300">
              {filteredBenchmarkGroups.length} shown after filters
            </div>
          </div>
        </div>

        {filteredBenchmarkGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No benchmarks match the current search.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredBenchmarkGroups.map((group, index) => (
              <AggregatedBenchmarkCard
                key={group.key}
                group={group}
                isOpen={expandedBenchmarkKey === group.key}
                motionIndex={index}
                onOpenChange={(open) =>
                  setExpandedBenchmarkKey((current) => {
                    if (open) {
                      return group.key
                    }

                    return current === group.key ? null : current
                  })
                }
              />
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
  isOpen,
  onOpenChange,
  motionIndex = 0,
}: {
  group: BenchmarkGroup
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

  const toggleRow = (rowKey: string) => {
    setExpandedRows((current) => ({
      ...current,
      [rowKey]: !current[rowKey],
    }))
  }

  return (
    <div
      className={`motion-academic-enter ${isOpen ? "xl:col-span-2" : ""}`}
      style={{ "--enter-delay": `${Math.min(motionIndex * 55, 260)}ms` } as CSSProperties}
    >
      <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <Card className="motion-academic-surface overflow-hidden border border-border/70 bg-card shadow-[0_1px_0_rgba(255,255,255,0.3),0_12px_30px_rgba(15,23,42,0.04)] dark:shadow-[0_1px_0_rgba(255,255,255,0.02)]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-border/60 bg-background/70 text-[11px] font-medium text-foreground/85 shadow-none">
                  Benchmark summary
                </Badge>
                <Badge variant="outline" className="border-border/60 bg-background/70 text-[11px] font-normal text-muted-foreground">
                  {group.scoreType}
                </Badge>
                <Badge variant="secondary" className="bg-muted/60 text-[11px] font-normal text-muted-foreground">
                  {group.variants.length > 1
                    ? `${group.variants.length} comparison slices`
                    : "1 reported result"}
                </Badge>
                {sourceOrganizations.size > 1 && (
                  <Badge variant="outline" className="border-border/60 bg-background/70 text-[11px] font-normal text-muted-foreground">
                    {sourceOrganizations.size} reporting orgs
                  </Badge>
                )}
              </div>

              <div>
                <h3 className="text-[1.35rem] font-semibold tracking-tight text-foreground/95 sm:text-[1.45rem]">{group.title}</h3>
                <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted-foreground">{group.description}</p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/[0.22] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:bg-muted/10 dark:shadow-none">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(140px,.8fr)_minmax(140px,.85fr)]">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {group.variants.length > 1
                        ? isResearchView
                          ? "Top comparison slice"
                          : "Top reported slice"
                        : "Reported result"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate text-[13px] font-medium text-foreground/90">
                        {group.variants[0]?.label ?? "Default run"}
                      </span>
                      {group.variants[0] && (
                        <Badge className={`${getVariantTypeTone(group.variants[0].variantType)} shadow-none`}>
                          {getVariantTypeLabel(group.variants[0].variantType)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="md:border-l md:border-border/50 md:pl-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {group.variants.length > 1
                        ? isResearchView
                          ? "Cross-slice spread"
                          : "Score spread"
                        : "Comparison status"}
                    </div>
                    <div className="mt-1 text-[13px] font-medium text-foreground/90">
                      {group.variants.length > 1 ? `${(spread * 100).toFixed(1)} pts` : "No comparison set"}
                    </div>
                  </div>
                  <div className="md:border-l md:border-border/50 md:pl-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Latest report
                    </div>
                    <div className="mt-1 text-[13px] font-medium text-foreground/90">{latestReportedLabel}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 lg:min-w-[210px] lg:justify-end lg:pl-4">
              <div className="min-w-[152px] text-right">
                <div className="text-[2rem] font-semibold tracking-tight text-foreground/95">{group.avgDisplayScore}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {isResearchView ? "Average normalized score" : "Average reported score"}
                </div>
                <div className="mt-3 flex justify-end">
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/90 transition-[width] duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, group.avgNormalizedScore * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="motion-academic-button h-9 w-9 rounded-full border border-border/60 bg-background/80 p-0 shadow-sm">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="sr-only">Toggle benchmark details</span>
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </div>

        <CollapsibleContent>
          <Separator />
          <CardContent className="p-6 bg-muted/5">
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Comparison Slices
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {isResearchView
                    ? "Setup changes and benchmark subtasks are shown separately so you can tell methodological differences from benchmark decomposition."
                    : "Different setups and benchmark subtasks are visually separated so policy review does not confuse reporting choices with task slices."}
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
                        <div className="p-4">
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

                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 shrink-0 p-0"
                                onClick={() => toggleRow(rowKey)}
                              >
                                {isRowOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                <span className="sr-only">Toggle variant details</span>
                              </Button>
                            </div>

                            <div className="grid gap-2 border-t border-border/50 pt-3 md:grid-cols-4">
                              <SummaryRailItem
                                label={isResearchView ? "Config" : "Setup"}
                                tone="bg-sky-50/80 border-sky-200/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-sky-950/20 dark:border-sky-900/40"
                              >
                                <Badge
                                  variant="outline"
                                  className="max-w-full truncate border-sky-200/70 bg-background/90 px-2 py-0.5 font-normal dark:border-sky-900/40 dark:bg-background/70"
                                  title={getTableConfigLabel(row)}
                                >
                                  {getConfigDisplayValue(getTableConfigLabel(row))}
                                </Badge>
                              </SummaryRailItem>

                              <SummaryRailItem
                                label={isResearchView ? "Gap" : "Relationship"}
                                tone="bg-stone-100/80 border-stone-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-stone-900/35 dark:border-stone-800/70"
                              >
                                {isResearchView ? (
                                  <div className="flex items-center gap-2">
                                    <div className="min-w-0 text-sm font-semibold">
                                      {index === 0 ? "Leader" : `-${(gapToLeader * 100).toFixed(1)} pts`}
                                    </div>
                                    <Progress
                                      value={leaderNormalizedScore > 0 ? (variant.normalizedScore / leaderNormalizedScore) * 100 : 100}
                                      className="h-2 w-14 shrink-0"
                                    />
                                  </div>
                                ) : (
                                  <div className="text-sm capitalize text-muted-foreground">
                                    {variant.evaluation.source_metadata.evaluator_relationship.replace(/_/g, " ")}
                                  </div>
                                )}
                              </SummaryRailItem>

                              <SummaryRailItem
                                label="Score"
                                tone="bg-amber-50/85 border-amber-200/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-amber-950/20 dark:border-amber-900/40"
                              >
                                <span className="text-base font-semibold">{variant.displayScore}</span>
                              </SummaryRailItem>

                              <SummaryRailItem
                                label={isResearchView ? "Source" : "Evidence"}
                                tone="bg-emerald-50/80 border-emerald-200/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-emerald-950/20 dark:border-emerald-900/40"
                              >
                                <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
                                  <span className="min-w-0 max-w-[6.25rem] truncate">
                                    {variant.evaluation.source_metadata.source_organization_name}
                                  </span>
                                  <span className="text-border">/</span>
                                  <span className="shrink-0">
                                    {evidenceStatus}
                                  </span>
                                </div>
                              </SummaryRailItem>
                            </div>
                          </div>
                        </div>

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
                      No comparison slices match the current filters.
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
          {sampleCount != null && <Badge variant="outline">{sampleCount.toLocaleString()} samples</Badge>}
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
            <InlineMeta label="Slice Type" value={getVariantTypeLabel(variant.variantType)} />
            <InlineMeta
              label={isResearchView ? "Dataset" : "Benchmark"}
              value={Array.isArray(variant.evaluation.source_data) ? group.title : variant.evaluation.source_data.dataset_name}
            />
            {variant.subtaskLabel && <InlineMeta label="Subtask" value={variant.subtaskLabel} />}
            {variant.setupLabel && <InlineMeta label="Setup" value={variant.setupLabel} />}
            <InlineMeta label="Relationship" value={variant.evaluation.source_metadata.evaluator_relationship.replace(/_/g, " ")} />
            <InlineMeta label="Reported" value={formatCompactDate(variant.evaluation.retrieved_timestamp)} />
            <InlineMeta label="Score" value={variant.displayScore} />
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

          {!isResearchView && (purpose || principles) && (
            <div className="mt-4 space-y-2 rounded-lg border bg-background/70 p-3">
              {purpose && <InlineMeta label="Purpose" value={purpose} />}
              {principles && <InlineMeta label="Principles" value={principles} />}
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

function SummaryRailItem({
  label,
  tone,
  children,
}: {
  label: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <div className={`min-w-0 rounded-2xl border px-3 py-2.5 ${tone}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 min-w-0 overflow-hidden">{children}</div>
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
