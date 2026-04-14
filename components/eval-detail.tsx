"use client"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { Fragment, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getModelFamilyRouteId } from "@/lib/model-family"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Database,
  ExternalLink,
  FileText,
  Globe,
  Medal,
  Scale,
  Shield,
  SlidersHorizontal,
  Tag,
} from "lucide-react"
import type { BenchmarkCard } from "@/lib/benchmark-schema"
import type { BenchmarkEvalSummary, ModelResultForBenchmark } from "@/lib/eval-processing"

interface EvalDetailProps {
  summary: BenchmarkEvalSummary
}

interface LeaderboardRow {
  key: string
  rank: number
  modelResult: ModelResultForBenchmark
  normalizedScore: number
}

type LeaderboardMetric = NonNullable<BenchmarkEvalSummary["leaderboard_metrics"]>[number]
type LeaderboardMatrixRow = NonNullable<BenchmarkEvalSummary["leaderboard_rows"]>[number]

const PARAM_RANGE_VALUES = [1, 2, 3, 4, 6, 8, 10, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 500] as const
const PARAM_RANGE_MARKERS = [
  { label: "< 1B", step: 0 },
  { label: "6B", step: PARAM_RANGE_VALUES.indexOf(6) },
  { label: "12B", step: PARAM_RANGE_VALUES.indexOf(12) },
  { label: "32B", step: PARAM_RANGE_VALUES.indexOf(32) },
  { label: "128B", step: PARAM_RANGE_VALUES.indexOf(128) },
  { label: "> 500B", step: PARAM_RANGE_VALUES.length - 1 },
] as const

function formatParamBoundLabel(step: number, bound: "min" | "max") {
  const maxStepIndex = PARAM_RANGE_VALUES.length - 1

  if (bound === "min" && step <= 0) {
    return "< 1B"
  }

  if (bound === "max" && step >= maxStepIndex) {
    return "> 500B"
  }

  const value = PARAM_RANGE_VALUES[step]
  return value != null ? `${value}B` : "Not reported"
}

function parseParamsBillionsFromText(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  const compact = normalized.replace(/,/g, "")
  const tokenMatch = compact.match(/(\d+(?:\.\d+)?)\s*(trillion|tn|t|billion|bn|b|million|mn|m|thousand|k)\b/)
  if (tokenMatch) {
    const amount = Number.parseFloat(tokenMatch[1])
    if (!Number.isFinite(amount)) {
      return null
    }

    const unit = tokenMatch[2]
    if (unit === "trillion" || unit === "tn" || unit === "t") {
      return amount * 1000
    }

    if (unit === "billion" || unit === "bn" || unit === "b") {
      return amount
    }

    if (unit === "million" || unit === "mn" || unit === "m") {
      return amount / 1000
    }

    if (unit === "thousand" || unit === "k") {
      return amount / 1_000_000
    }
  }

  const numeric = Number.parseFloat(compact)
  return Number.isFinite(numeric) ? numeric : null
}

function parseParamsBillionsFromModelName(modelName: string | null | undefined) {
  if (!modelName) {
    return null
  }

  const sizeTokens = Array.from(modelName.matchAll(/\b(\d+(?:\.\d+)?)\s*([tmbk])\b/gi))
  if (sizeTokens.length === 0) {
    return null
  }

  const lastToken = sizeTokens[sizeTokens.length - 1]
  const numericValue = Number.parseFloat(lastToken[1])
  if (!Number.isFinite(numericValue)) {
    return null
  }

  const unit = lastToken[2].toLowerCase()
  if (unit === "t") {
    return numericValue * 1000
  }

  if (unit === "b") {
    return numericValue
  }

  if (unit === "m") {
    return numericValue / 1000
  }

  if (unit === "k") {
    return numericValue / 1_000_000
  }

  return null
}

function getParamsBillionsFromModelInfo(modelInfo: ModelResultForBenchmark["model_info"]) {
  const additionalDetails = modelInfo.additional_details
  const rawParamsBillions =
    additionalDetails?.params_billions ??
    additionalDetails?.parameter_count ??
    additionalDetails?.num_parameters ??
    additionalDetails?.params

  if (typeof rawParamsBillions === "number") {
    return rawParamsBillions
  }

  if (typeof rawParamsBillions === "string") {
    const parsed = parseParamsBillionsFromText(rawParamsBillions)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  if (typeof modelInfo.parameter_count === "string") {
    const parsed = parseParamsBillionsFromText(modelInfo.parameter_count)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return parseParamsBillionsFromModelName(modelInfo.name)
}

function getParamsBillions(modelResult: ModelResultForBenchmark) {
  return getParamsBillionsFromModelInfo(modelResult.model_info)
}

function formatMetadataValue(value: unknown): string {
  if (value == null) {
    return "N/A"
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : String(value)
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatMetadataValue(item)).join(", ")
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatDate(ts: string) {
  if (!ts || !ts.trim()) {
    return "Unknown"
  }

  const numeric = Number(ts)
  const parsedDate = !Number.isNaN(numeric) && !ts.includes("-") ? new Date(numeric * 1000) : new Date(ts)

  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown"
  }

  try {
    return parsedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return ts
  }
}

function formatRawScore(score: number, unit?: string) {
  const suffix = unit ? ` ${unit}` : ""
  return `${score.toFixed(2)}${suffix}`
}

function isNumericScore(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function metricLabelReadsAsPercentage(metricLabel: string, unit?: string) {
  const normalized = `${metricLabel} ${unit ?? ""}`.toLowerCase()
  return unit === "%" || /percent|percentage|accuracy|exact match|win rate|pass@|precision|recall|f1/.test(normalized)
}

function describeLeaderboardMetric(metric: LeaderboardMetric) {
  const metricLabel = getCompactMetricLabel(metric.display_name)
  const metricPhrase = metricLabelReadsAsPercentage(metricLabel, metric.unit)
    ? `${metricLabel} percentage`
    : metricLabel

  if (metric.scope === "subtask" && metric.subtask_name) {
    return `${metricPhrase} for ${metric.subtask_name}`
  }

  return metric.canonical_display_name || metric.display_name
}

function getCompactMetricLabel(value: string | undefined) {
  if (!value) {
    return "Metric"
  }

  const parts = value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)

  return parts[parts.length - 1] ?? value
}

function getRankBadgeClass(rank: number) {
  if (rank === 1) {
    return "border-amber-300 bg-amber-100 text-amber-800"
  }

  if (rank === 2) {
    return "border-slate-300 bg-slate-100 text-slate-700"
  }

  if (rank === 3) {
    return "border-orange-300 bg-orange-100 text-orange-800"
  }

  return "border-border bg-background text-foreground"
}

export function EvalDetail({ summary }: EvalDetailProps) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const hasMultiMetricLeaderboard =
    (summary.leaderboard_metrics?.length ?? 0) > 1 &&
    (summary.leaderboard_rows?.length ?? 0) > 0
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [leaderboardPage, setLeaderboardPage] = useState(1)
  const [minParamStep, setMinParamStep] = useState(0)
  const [maxParamStep, setMaxParamStep] = useState(PARAM_RANGE_VALUES.length - 1)

  const maxScore = summary.metric_config.max_score ?? 1
  const minScore = summary.metric_config.min_score ?? 0
  const range = maxScore - minScore

  const normalizeScore = (raw: number) => (range > 0 ? (raw - minScore) / range : raw)
  const formatPercent = (normalized: number) => `${(normalized * 100).toFixed(1)}%`
  const maxParamStepIndex = PARAM_RANGE_VALUES.length - 1
  const minHandlePercent = (minParamStep / maxParamStepIndex) * 100
  const maxHandlePercent = (maxParamStep / maxParamStepIndex) * 100

  const numericMinParams = useMemo(() => {
    if (minParamStep <= 0) {
      return null
    }

    return PARAM_RANGE_VALUES[minParamStep] ?? null
  }, [minParamStep])

  const numericMaxParams = useMemo(() => {
    if (maxParamStep >= PARAM_RANGE_VALUES.length - 1) {
      return null
    }

    return PARAM_RANGE_VALUES[maxParamStep] ?? null
  }, [maxParamStep])

  const sortedResults = useMemo(
    () =>
      [...summary.model_results].sort((a, b) =>
        summary.metric_config.lower_is_better ? a.score - b.score : b.score - a.score
      ),
    [summary.model_results, summary.metric_config.lower_is_better]
  )

  const hasParameterData = useMemo(
    () => sortedResults.some((result) => getParamsBillions(result) != null),
    [sortedResults]
  )

  const filteredResults = useMemo(() => {
    return sortedResults.filter((modelResult) => {
      const paramsBillions = getParamsBillions(modelResult)

      if (numericMinParams != null && (paramsBillions == null || paramsBillions < numericMinParams)) {
        return false
      }

      if (numericMaxParams != null && (paramsBillions == null || paramsBillions > numericMaxParams)) {
        return false
      }

      return true
    })
  }, [numericMaxParams, numericMinParams, sortedResults])

  const leaderboardRows = useMemo<LeaderboardRow[]>(() => {
    let currentRank = 0
    let previousScore: number | null = null

    return filteredResults.map((modelResult, index) => {
      if (previousScore === null || Math.abs(modelResult.score - previousScore) > 1e-9) {
        currentRank = index + 1
        previousScore = modelResult.score
      }

      return {
        key: `${modelResult.model_info.id}-${index}`,
        rank: currentRank,
        modelResult,
        normalizedScore: normalizeScore(modelResult.score),
      }
    })
  }, [filteredResults])

  const LEADERBOARD_PAGE_SIZE = 50
  const pagedLeaderboardRows = useMemo(
    () => leaderboardRows.slice(0, leaderboardPage * LEADERBOARD_PAGE_SIZE),
    [leaderboardRows, leaderboardPage]
  )

  const avgScoreLabel = formatRawScore(summary.avg_score, summary.metric_config.unit)
  const scoreDirectionLabel = summary.metric_config.lower_is_better ? "Lower scores rank higher" : "Higher scores rank higher"
  const leaderboardTitle = isResearchView ? "Leaderboard" : "Reporting Comparison"
  const sourceDatasetLabel = summary.source_data?.hf_repo ?? summary.source_data?.dataset_name ?? "Summary source"
  const instanceDataLabel = summary.instance_data?.available
    ? `${summary.instance_data.url_count.toLocaleString()} linked URL${summary.instance_data.url_count === 1 ? "" : "s"}`
    : "Not linked"
  const leaderboardDescription = isResearchView
    ? summary.is_aggregated
      ? "Models ranked by average raw score across the contributing composite benchmarks."
      : "Models ranked by raw score for this benchmark."
    : summary.is_aggregated
      ? "Averaged model results across the contributing composite benchmarks, with drill-down to each component score."
      : "Model results with benchmark context, source dataset detail, and optional instance-data links."

  const toggleRow = (key: string) =>
    setExpandedRows((current) => ({
      ...current,
      [key]: !current[key],
    }))

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-border/60 bg-background/80 text-[11px] uppercase tracking-[0.18em]">
                  {summary.is_aggregated ? "Merged Benchmark" : "Single Benchmark"}
                </Badge>
                {summary.is_aggregated ? (
                  <Badge variant="secondary" className="font-normal">
                    {summary.aggregate_sources?.length ?? 0} composite benchmarks
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="font-normal">
                    Composite: {summary.composite_benchmark_name}
                  </Badge>
                )}
                <Badge variant="secondary" className="font-normal capitalize">
                  {summary.metric_config.score_type}
                </Badge>
                <Badge variant="secondary" className="font-normal">
                  {summary.metric_config.lower_is_better ? "Lower is better" : "Higher is better"}
                </Badge>
                {summary.tags?.languages && summary.tags.languages.length > 0 && (
                  <Badge variant="secondary" className="font-normal">
                    {summary.tags.languages.join(", ")}
                  </Badge>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight sm:text-[1.9rem]">{summary.evaluation_name}</div>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {summary.metric_config.evaluation_description}
                </p>
              </div>

              {!isResearchView && (
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {`${summary.benchmark_card?.purpose_and_intended_users?.goal ?? "This benchmark provides a public-facing capability signal."} Scores should be read alongside benchmark scope, metric definitions, and the source dataset context.`}
                </p>
              )}
            </div>

            <div className="grid w-full gap-3 grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-950/20">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">Models</div>
                <div className="mt-1 text-2xl font-semibold text-sky-950 dark:text-sky-50">{summary.models_count}</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {hasMultiMetricLeaderboard ? "Metrics" : isResearchView ? "Avg score" : "Metrics"}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {hasMultiMetricLeaderboard ? summary.metrics_count ?? summary.leaderboard_metrics?.length ?? 1 : isResearchView ? avgScoreLabel : summary.metrics_count ?? 1}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                  {hasMultiMetricLeaderboard || !isResearchView ? "Source dataset" : "Top model"}
                </div>
                <div className="mt-1 text-sm font-semibold text-emerald-950 dark:text-emerald-50">
                  {hasMultiMetricLeaderboard || !isResearchView
                    ? sourceDatasetLabel
                    : summary.best_model?.name ?? "Unknown"}
                </div>
                {!hasMultiMetricLeaderboard && isResearchView && summary.best_model && (
                  <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
                    {formatRawScore(summary.best_model.score, summary.metric_config.unit)}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                  {hasMultiMetricLeaderboard || !isResearchView ? "Instance data" : "Bottom model"}
                </div>
                <div className="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-50">
                  {hasMultiMetricLeaderboard || !isResearchView
                    ? instanceDataLabel
                    : summary.worst_model?.name ?? "Unknown"}
                </div>
                {!hasMultiMetricLeaderboard && isResearchView && summary.worst_model && (
                  <div className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">
                    {formatRawScore(summary.worst_model.score, summary.metric_config.unit)}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border bg-muted/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {isResearchView ? "Metric specification" : "Reading context"}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Composite benchmark
                </dt>
                <dd className="mt-1 break-words font-medium">
                  {summary.is_aggregated
                    ? summary.aggregate_sources?.map((source) => source.composite_benchmark_name).join(", ") || "Multiple composite benchmarks"
                    : summary.composite_benchmark_name}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {isResearchView ? "Single benchmark ID" : "What this covers"}
                </dt>
                <dd className="mt-1 break-words font-medium">
                  {isResearchView
                    ? summary.evaluation_id
                    : summary.is_aggregated
                      ? summary.metric_config.evaluation_description
                      : summary.metric_config.evaluation_description}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {isResearchView ? "Score scale" : "How to read scores"}
                </dt>
                <dd className="mt-1 font-medium">
                  {isResearchView
                    ? `${summary.metric_config.min_score ?? 0} - ${summary.metric_config.max_score ?? 1}`
                    : scoreDirectionLabel}
                </dd>
              </div>
              {summary.tags?.domains && summary.tags.domains.length > 0 && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Domain coverage</dt>
                  <dd className="mt-1 font-medium capitalize">
                    {summary.tags.domains.slice(0, 2).join(", ")}
                    {summary.tags.domains.length > 2 ? ` +${summary.tags.domains.length - 2} more` : ""}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {isResearchView ? "Source dataset" : "Instance data"}
                </dt>
                <dd className="mt-1 font-medium">
                  {isResearchView ? sourceDatasetLabel : instanceDataLabel}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      {!hasMultiMetricLeaderboard && (summary.root_metrics?.length || summary.subtasks?.length) ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-xl">Benchmark structure</CardTitle>
            <CardDescription>
              Benchmark-level summary metrics and benchmark breakdowns are shown as separate sections.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-5 sm:p-6">
            {summary.root_metrics && summary.root_metrics.length > 0 && (
              <section className="space-y-3">
                <div>
                  <div className="text-sm font-semibold">Benchmark-level metrics</div>
                  <div className="text-xs text-muted-foreground">
                    Benchmark summary metrics used in this evaluation view.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {summary.root_metrics.map((metric) => (
                    <span
                      key={metric.metric_summary_id}
                      className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium"
                      title={metric.canonical_display_name || metric.display_name}
                    >
                      {getCompactMetricLabel(metric.display_name)}
                      {typeof metric.top_score === "number" ? ` · ${formatRawScore(metric.top_score, metric.unit)}` : ""}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {summary.subtasks && summary.subtasks.length > 0 && (
              <section className="space-y-3">
                <div>
                  <div className="text-sm font-semibold">Subtask breakdown</div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {summary.subtasks.map((subtask) => (
                    <div key={subtask.subtask_key} className="rounded-2xl border bg-background p-4">
                      <div className="font-semibold">{subtask.display_name || subtask.subtask_name}</div>
                      <div className="mt-1 text-xs text-muted-foreground" title={subtask.canonical_display_name || subtask.display_name}>
                        {subtask.canonical_display_name || subtask.display_name}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {subtask.metrics.map((metric) => (
                          <span
                            key={metric.metric_summary_id}
                            className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-[11px] font-medium"
                            title={metric.canonical_display_name || metric.display_name}
                          >
                            {getCompactMetricLabel(metric.display_name)}
                            {typeof metric.top_score === "number" ? ` · ${formatRawScore(metric.top_score, metric.unit)}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Policy: benchmark context BEFORE the leaderboard (context first, numbers second) */}
      {!isResearchView && summary.benchmark_card && (
        <BenchmarkCardPanel card={summary.benchmark_card} isResearchView={false} defaultRisksOpen />
      )}

      {hasMultiMetricLeaderboard ? (
        <MultiMetricLeaderboard summary={summary} isResearchView={isResearchView} />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Medal className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">{leaderboardTitle}</CardTitle>
                </div>
                <CardDescription>{leaderboardDescription}</CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">
                  {leaderboardRows.length === summary.models_count
                    ? `${summary.models_count} models`
                    : `${leaderboardRows.length} of ${summary.models_count} models`}
                </Badge>
                <Badge variant="outline">{scoreDirectionLabel}</Badge>
                {hasParameterData && (numericMinParams != null || numericMaxParams != null) && (
                  <Badge variant="outline">
                    Params {formatParamBoundLabel(minParamStep, "min")} to {formatParamBoundLabel(maxParamStep, "max")}
                  </Badge>
                )}
                {isResearchView && (
                  <Badge variant="outline">
                    Scale {summary.metric_config.min_score ?? 0} - {summary.metric_config.max_score ?? 1}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {hasParameterData && (
              <div className="border-b bg-background px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Parameter range
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Narrow the leaderboard to comparable model sizes.
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-4 lg:max-w-[40rem]">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {PARAM_RANGE_MARKERS.map((marker) => (
                          <span key={marker.label} className="text-center">
                            {marker.label}
                          </span>
                        ))}
                      </div>

                      <div className="relative h-4">
                        <div className="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-border/80" />
                        <div className="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2">
                          <div
                            className="absolute inset-y-0 rounded-full bg-foreground transition-[left,right] duration-300 ease-[var(--ease-out-quint)]"
                            style={{
                              left: `${minHandlePercent}%`,
                              right: `${Math.max(100 - maxHandlePercent, 0)}%`,
                            }}
                          />
                        </div>

                        <div className="absolute inset-x-1.5 top-1/2 -translate-y-1/2">
                          {PARAM_RANGE_VALUES.map((_, stepIndex) => (
                            <span
                              key={`param-tick-${stepIndex}`}
                              className="absolute top-0 h-2 w-px -translate-x-1/2 rounded-full bg-border"
                              style={{ left: `${(stepIndex / maxParamStepIndex) * 100}%` }}
                              aria-hidden="true"
                            />
                          ))}
                        </div>

                        <input
                          type="range"
                          min={0}
                          max={maxParamStepIndex}
                          step={1}
                          value={minParamStep}
                          onChange={(event) => {
                            const nextMin = Number(event.target.value)
                            setMinParamStep(Math.min(nextMin, maxParamStep))
                          }}
                          className="param-range-input"
                          aria-label="Minimum parameter filter"
                        />

                        <input
                          type="range"
                          min={0}
                          max={maxParamStepIndex}
                          step={1}
                          value={maxParamStep}
                          onChange={(event) => {
                            const nextMax = Number(event.target.value)
                            setMaxParamStep(Math.max(nextMax, minParamStep))
                          }}
                          className="param-range-input"
                          aria-label="Maximum parameter filter"
                        />
                      </div>
                    </div>

                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatParamBoundLabel(minParamStep, "min")} to {formatParamBoundLabel(maxParamStep, "max")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-20 px-4">Rank</TableHead>
                  <TableHead className="min-w-[260px]">Model</TableHead>
                  <TableHead className="hidden min-w-[180px] lg:table-cell">
                    {isResearchView ? "Developer" : "Provider"}
                  </TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  {isResearchView ? (
                    <TableHead className="hidden min-w-[220px] md:table-cell">Performance</TableHead>
                  ) : (
                    <TableHead className="hidden min-w-[220px] md:table-cell">Source type</TableHead>
                  )}
                  <TableHead className="hidden min-w-[180px] xl:table-cell">
                    {isResearchView ? "Evaluator" : "Reporting Org"}
                  </TableHead>
                  <TableHead className="hidden min-w-[120px] lg:table-cell">Updated</TableHead>
                  <TableHead className="w-16 px-4 text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedLeaderboardRows.map(({ key, rank, modelResult, normalizedScore }) => {
                  const isExpanded = expandedRows[key] ?? false
                  const subtasks = modelResult.score_details.details
                    ? Object.entries(modelResult.score_details.details).filter(([, value]) => typeof value === "number")
                    : []
                  const hasExpandableDetails =
                    (modelResult.aggregate_components && modelResult.aggregate_components.length > 1) ||
                    subtasks.length > 1

                  const datasetName = Array.isArray(modelResult.source_data)
                    ? undefined
                    : modelResult.source_data.dataset_name

                  const samples = Array.isArray(modelResult.source_data)
                    ? undefined
                    : modelResult.source_data.samples_number

                  return (
                    <Fragment key={key}>
                      <TableRow className={cn("group", isExpanded && "bg-muted/15")}>
                        <TableCell className="px-4">
                          <div
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                              getRankBadgeClass(rank)
                            )}
                          >
                            {rank}
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-normal">
                          <div className="space-y-1">
                            <div className="font-semibold leading-tight">
                              <Link
                                href={`/models/${getModelFamilyRouteId(modelResult.model_info)}`}
                                className="underline decoration-dotted underline-offset-4 hover:text-primary"
                              >
                                {modelResult.model_info.name}
                              </Link>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {modelResult.model_info.parameter_count && (
                                <Badge variant="secondary" className="font-normal">
                                  {modelResult.model_info.parameter_count}
                                </Badge>
                              )}
                              {modelResult.model_info.architecture && (
                                <Badge variant="outline" className="font-normal">
                                  {modelResult.model_info.architecture}
                                </Badge>
                              )}
                              <span className="lg:hidden">
                                {modelResult.model_info.developer ?? "Unknown developer"}
                              </span>
                              {modelResult.aggregate_components && modelResult.aggregate_components.length > 1 && (
                                <Badge variant="outline" className="font-normal">
                                  Avg of {modelResult.aggregate_components.length}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="hidden whitespace-normal lg:table-cell">
                          <div className="max-w-[180px] truncate text-sm text-muted-foreground">
                            {modelResult.model_info.developer ?? "Unknown developer"}
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="text-xl font-semibold tabular-nums">{formatRawScore(modelResult.score, summary.metric_config.unit)}</div>
                        </TableCell>

                        {isResearchView ? (
                          <TableCell className="hidden md:table-cell">
                            <div className="min-w-[220px]">
                              <Progress value={normalizedScore * 100} className="h-2" />
                            </div>
                          </TableCell>
                        ) : (
                          <TableCell className="hidden md:table-cell">
                            <div className="text-sm text-muted-foreground capitalize">
                              {modelResult.aggregate_components && modelResult.aggregate_components.length > 1
                                ? `average of ${modelResult.aggregate_components.length} composite scores`
                                : datasetName ?? "Detailed result source"}
                            </div>
                          </TableCell>
                        )}

                        <TableCell className="hidden whitespace-normal xl:table-cell">
                          {modelResult.aggregate_components && modelResult.aggregate_components.length > 1 ? (
                            <div className="space-y-1">
                              <div className="font-medium">
                                {Array.from(new Set(modelResult.aggregate_components.map((component) => component.source_organization_name))).join(", ")}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {modelResult.aggregate_components
                                  .map((component) => component.composite_benchmark_name)
                                  .join(", ")}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="font-medium">{datasetName ?? sourceDatasetLabel}</div>
                              <div className="text-xs text-muted-foreground">
                                {Array.isArray(modelResult.source_data)
                                  ? "Detailed result source"
                                  : modelResult.source_data.hf_repo ?? modelResult.source_data.source_type ?? "Detailed result source"}
                              </div>
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="hidden lg:table-cell">
                          <div className="text-sm text-muted-foreground">{formatDate(modelResult.evaluation_timestamp)}</div>
                        </TableCell>

                        <TableCell className="px-4 text-right">
                          {hasExpandableDetails && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={isExpanded ? "Collapse details" : "Expand details"}
                              onClick={() => toggleRow(key)}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={8} className="bg-muted/10 px-0 py-0">
                            <div className="space-y-5 px-4 py-5 sm:px-6">
                              <div className="grid gap-4 xl:grid-cols-3">
                                <DetailPanel
                                  title={isResearchView ? "Model Profile" : "System Overview"}
                                  subtitle={
                                    isResearchView
                                      ? "Model metadata for the ranked entry."
                                      : "Basic system information for this reported result."
                                  }
                                >
                                  {isResearchView && <MetaRow label="Model ID" value={modelResult.model_info.id} />}
                                  <MetaRow label="Developer" value={modelResult.model_info.developer ?? "Unknown"} />
                                  <MetaRow label="Release Date" value={modelResult.model_info.release_date ?? "Unknown"} />
                                  <MetaRow label="Architecture" value={modelResult.model_info.architecture ?? "Unknown"} />
                                  <MetaRow label="Parameter Count" value={modelResult.model_info.parameter_count ?? "Unknown"} />
                                  <MetaRow label="Inference Engine" value={modelResult.model_info.inference_engine ?? "Unknown"} />
                                </DetailPanel>

                                <DetailPanel
                                  title={isResearchView ? "Evaluation Provenance" : "Source & Accountability"}
                                  subtitle={
                                    isResearchView
                                      ? "Who ran the evaluation and what dataset was used."
                                      : "Reporting organization, relationship, and dataset context."
                                  }
                                >
                                  <MetaRow
                                    label="Organization"
                                    value={modelResult.source_metadata.source_organization_name}
                                  />
                                  <MetaRow
                                    label="Relationship"
                                    value={modelResult.source_metadata.evaluator_relationship.replace(/_/g, " ")}
                                  />
                                  <MetaRow label="Source Type" value={modelResult.source_metadata.source_type} />
                                  <MetaRow label="Dataset" value={datasetName ?? "Not specified"} />
                                  <MetaRow
                                    label="Samples"
                                    value={samples != null ? samples.toLocaleString() : "Unknown"}
                                  />
                                  <MetaRow
                                    label="Published"
                                    value={
                                      modelResult.source_metadata.publication_date
                                        ? formatDate(modelResult.source_metadata.publication_date)
                                        : formatDate(modelResult.evaluation_timestamp)
                                    }
                                  />
                                  {modelResult.source_metadata.source_url && (
                                    <MetaRow
                                      label="Source URL"
                                      value={
                                        <a
                                          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                                          href={modelResult.source_metadata.source_url}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          View source
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      }
                                    />
                                  )}
                                </DetailPanel>

                                <DetailPanel
                                  title={isResearchView ? "Score Breakdown" : "Metric Summary"}
                                  subtitle={
                                    isResearchView
                                      ? "Raw metric values and uncertainty details."
                                      : "Raw performance plus uncertainty and sample details."
                                  }
                                >
                                  <MetaRow
                                    label={modelResult.aggregate_components ? "Average Raw Score" : "Raw Score"}
                                    value={formatRawScore(modelResult.score, summary.metric_config.unit)}
                                  />
                                  <MetaRow label="Score Type" value={modelResult.result.metric_config.score_type} />
                                  <MetaRow label="Range" value={`${minScore} - ${maxScore}`} />
                                  <MetaRow
                                    label="Sample Size"
                                    value={modelResult.score_details.sample_size ?? "Unknown"}
                                  />
                                  <MetaRow
                                    label="Standard Error"
                                    value={modelResult.score_details.standard_error ?? "Unknown"}
                                  />
                                  {modelResult.score_details.confidence_interval && (
                                    <MetaRow
                                      label="Confidence Interval"
                                      value={`${modelResult.score_details.confidence_interval.lower} - ${modelResult.score_details.confidence_interval.upper} (${modelResult.score_details.confidence_interval.confidence_level}%)`}
                                    />
                                  )}
                                </DetailPanel>
                              </div>

                              {modelResult.aggregate_components && modelResult.aggregate_components.length > 1 && (
                                <div className="space-y-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Composite Score Breakdown
                                  </div>
                                  <div className="overflow-hidden rounded-xl border">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b bg-muted/30">
                                          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Benchmark</th>
                                          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source</th>
                                          <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Raw</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {modelResult.aggregate_components.map((component, i) => (
                                          <tr key={`${component.evaluation_id}-${i}`} className="border-b last:border-0 hover:bg-muted/10">
                                            <td className="px-3 py-2 font-medium">{component.composite_benchmark_name}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{component.source_organization_name}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRawScore(component.score)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {subtasks.length > 1 && (
                                <div className="space-y-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Subtask Breakdown
                                  </div>
                                  <div className="overflow-hidden rounded-xl border">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b bg-muted/30">
                                          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Subtask</th>
                                          <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Raw</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {subtasks.map(([subtaskName, value]) => {
                                          const numericValue = value as number
                                          return (
                                            <tr key={subtaskName} className="border-b last:border-0 hover:bg-muted/10">
                                              <td className="px-3 py-2 font-medium capitalize">{subtaskName.replace(/_/g, " ")}</td>
                                              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRawScore(numericValue, summary.metric_config.unit)}</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {modelResult.result.generation_config && (
                                <div className="space-y-3">
                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                      Generation Config
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Evaluation-time generation parameters.
                                    </div>
                                  </div>

                                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {modelResult.result.generation_config.generation_args &&
                                      Object.entries(modelResult.result.generation_config.generation_args).map(([key, value]) => (
                                        <div key={key} className="rounded-xl border bg-background/70 p-4">
                                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                            {key.replace(/_/g, " ")}
                                          </div>
                                          <div className="mt-2 text-sm font-medium">
                                            {formatMetadataValue(value)}
                                          </div>
                                        </div>
                                      ))}

                                    {modelResult.result.generation_config.additional_details && (
                                      <div className="rounded-xl border bg-background/70 p-4 md:col-span-2 xl:col-span-3">
                                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                          Additional Details
                                        </div>
                                        <div className="mt-2 text-sm font-medium whitespace-pre-wrap">
                                          {formatMetadataValue(modelResult.result.generation_config.additional_details)}
                                        </div>
                                      </div>
                                    )}

                                    {modelResult.result.generation_config.prompt_template && (
                                      <div className="rounded-xl border bg-background/70 p-4 md:col-span-2 xl:col-span-3">
                                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                          Prompt Template
                                        </div>
                                        <div className="mt-2 text-sm font-medium whitespace-pre-wrap">
                                          {formatMetadataValue(modelResult.result.generation_config.prompt_template)}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
                {leaderboardRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="px-6 py-12 text-center text-sm text-muted-foreground">
                      No leaderboard entries match the selected parameter range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {pagedLeaderboardRows.length < leaderboardRows.length && (
              <div className="border-t px-6 py-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => setLeaderboardPage((p) => p + 1)}
                >
                  Load more ({leaderboardRows.length - pagedLeaderboardRows.length} remaining)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Research: benchmark card details AFTER the leaderboard, collapsed by default */}
      {isResearchView && summary.benchmark_card && (
        <ResearchBenchmarkCardCollapsible card={summary.benchmark_card} />
      )}
    </div>
  )
}

function MultiMetricLeaderboard({
  summary,
  isResearchView,
}: {
  summary: BenchmarkEvalSummary
  isResearchView: boolean
}) {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string>("coverage")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [activeSubtaskTab, setActiveSubtaskTab] = useState<string>("all")
  const [minParamStep, setMinParamStep] = useState(0)
  const [maxParamStep, setMaxParamStep] = useState(PARAM_RANGE_VALUES.length - 1)
  const leaderboardMetrics = summary.leaderboard_metrics ?? []
  const leaderboardRows = summary.leaderboard_rows ?? []
  const allMetricKeys = useMemo(() => leaderboardMetrics.map((metric) => metric.column_key), [leaderboardMetrics])
  const [visibleMetricKeys, setVisibleMetricKeys] = useState<string[]>(() => leaderboardMetrics.map((metric) => metric.column_key))
  const maxParamStepIndex = PARAM_RANGE_VALUES.length - 1
  const leaderboardMetricMap = useMemo(
    () => new Map(leaderboardMetrics.map((metric) => [metric.column_key, metric])),
    [leaderboardMetrics]
  )
  const visibleMetricKeySet = useMemo(() => new Set(visibleMetricKeys), [visibleMetricKeys])
  const subtaskMetricCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const metric of leaderboardMetrics) {
      if (metric.scope === "subtask" && metric.subtask_key) {
        counts.set(metric.subtask_key, (counts.get(metric.subtask_key) ?? 0) + 1)
      }
    }
    return counts
  }, [leaderboardMetrics])

  const singleMetricSubtaskTabs = useMemo(() => {
    return leaderboardMetrics
      .filter((metric) => metric.scope === "subtask" && metric.subtask_key && subtaskMetricCounts.get(metric.subtask_key) === 1)
      .map((metric) => ({
        key: metric.subtask_key as string,
        label: metric.subtask_name ?? getCompactMetricLabel(metric.display_name),
      }))
  }, [leaderboardMetrics, subtaskMetricCounts])

  const hasSubtaskTabs = singleMetricSubtaskTabs.length > 1

  const visibleMetrics = useMemo(
    () =>
      leaderboardMetrics.filter((metric) => {
        if (!visibleMetricKeySet.has(metric.column_key)) {
          return false
        }

        if (!hasSubtaskTabs || activeSubtaskTab === "all") {
          return true
        }

        return metric.scope === "subtask" && metric.subtask_key === activeSubtaskTab
      }),
    [activeSubtaskTab, hasSubtaskTabs, leaderboardMetrics, visibleMetricKeySet]
  )
  const visibleMetricColumnKeySet = useMemo(
    () => new Set(visibleMetrics.map((metric) => metric.column_key)),
    [visibleMetrics]
  )

  const numericMinParams = useMemo(() => {
    if (minParamStep <= 0) {
      return null
    }

    return PARAM_RANGE_VALUES[minParamStep] ?? null
  }, [minParamStep])

  const numericMaxParams = useMemo(() => {
    if (maxParamStep >= PARAM_RANGE_VALUES.length - 1) {
      return null
    }

    return PARAM_RANGE_VALUES[maxParamStep] ?? null
  }, [maxParamStep])

  const filteredRows = useMemo(() => {
    return leaderboardRows
      .filter((row) => {
        const paramsBillions = getParamsBillionsFromModelInfo(row.model_info)

        if (numericMinParams != null && (paramsBillions == null || paramsBillions < numericMinParams)) {
          return false
        }

        if (numericMaxParams != null && (paramsBillions == null || paramsBillions > numericMaxParams)) {
          return false
        }

        return true
      })
  }, [leaderboardRows, numericMaxParams, numericMinParams])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]

    const compareNames = (left: LeaderboardMatrixRow, right: LeaderboardMatrixRow) =>
      left.model_info.name.localeCompare(right.model_info.name) ||
      (left.model_info.developer ?? "").localeCompare(right.model_info.developer ?? "")

    const compareTimestamps = (left: string, right: string) => {
      const leftNumeric = Number(left)
      const rightNumeric = Number(right)
      const leftTimestamp = !Number.isNaN(leftNumeric) && !left.includes("-")
        ? leftNumeric * 1000
        : new Date(left).getTime()
      const rightTimestamp = !Number.isNaN(rightNumeric) && !right.includes("-")
        ? rightNumeric * 1000
        : new Date(right).getTime()
      return leftTimestamp - rightTimestamp
    }

    rows.sort((left, right) => {
      if (sortKey === "model") {
        const comparison = compareNames(left, right)
        return sortDirection === "asc" ? comparison : -comparison
      }

      if (sortKey === "developer") {
        const comparison =
          (left.model_info.developer ?? "").localeCompare(right.model_info.developer ?? "") || compareNames(left, right)
        return sortDirection === "asc" ? comparison : -comparison
      }

      if (sortKey === "coverage") {
        const comparison = left.metrics_present - right.metrics_present || compareNames(left, right)
        return sortDirection === "asc" ? comparison : -comparison
      }

      if (sortKey === "updated") {
        const comparison = compareTimestamps(left.evaluation_timestamp, right.evaluation_timestamp) || compareNames(left, right)
        return sortDirection === "asc" ? comparison : -comparison
      }

      const metric = leaderboardMetricMap.get(sortKey)
      if (metric) {
        const leftValue = left.values[sortKey]
        const rightValue = right.values[sortKey]
        const leftHasValue = isNumericScore(leftValue)
        const rightHasValue = isNumericScore(rightValue)

        if (leftHasValue && rightHasValue) {
          const comparison = leftValue - rightValue || compareNames(left, right)
          return sortDirection === "asc" ? comparison : -comparison
        }

        if (leftHasValue !== rightHasValue) {
          return leftHasValue ? -1 : 1
        }
      }

      return compareNames(left, right)
    })

    return rows
  }, [filteredRows, leaderboardMetricMap, sortDirection, sortKey])

  useEffect(() => {
    setPage(1)
  }, [maxParamStep, minParamStep, sortDirection, sortKey])

  useEffect(() => {
    setVisibleMetricKeys(allMetricKeys)
  }, [allMetricKeys, summary.evaluation_id])

  useEffect(() => {
    setActiveSubtaskTab("all")
  }, [summary.evaluation_id])

  useEffect(() => {
    if (leaderboardMetricMap.has(sortKey) && !visibleMetricColumnKeySet.has(sortKey)) {
      setSortKey("coverage")
      setSortDirection("desc")
    }
  }, [leaderboardMetricMap, sortKey, visibleMetricColumnKeySet])

  useEffect(() => {
    if (!hasSubtaskTabs) {
      if (activeSubtaskTab !== "all") {
        setActiveSubtaskTab("all")
      }
      return
    }

    if (activeSubtaskTab === "all") {
      return
    }

    if (!singleMetricSubtaskTabs.some((tab) => tab.key === activeSubtaskTab)) {
      setActiveSubtaskTab("all")
    }
  }, [activeSubtaskTab, hasSubtaskTabs, singleMetricSubtaskTabs])

  const hasParameterData = useMemo(
    () => leaderboardRows.some((row) => getParamsBillionsFromModelInfo(row.model_info) != null),
    [leaderboardRows]
  )

  const metricRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>()

    for (const metric of leaderboardMetrics) {
      const scores = filteredRows
        .map((row) => row.values[metric.column_key])
        .filter(isNumericScore)

      if (scores.length > 0) {
        ranges.set(metric.column_key, {
          min: Math.min(...scores),
          max: Math.max(...scores),
        })
      }
    }

    return ranges
  }, [filteredRows, leaderboardMetrics])

  const pagedRows = useMemo(
    () => sortedRows.slice(0, page * 50),
    [page, sortedRows]
  )

  const rankByModelId = useMemo(
    () => new Map(sortedRows.map((row, index) => [row.model_info.id, index + 1])),
    [sortedRows]
  )

  const setMetricVisibility = (metricKey: string, nextVisible: boolean) => {
    setVisibleMetricKeys((current) => {
      if (nextVisible) {
        return allMetricKeys.filter((key) => key === metricKey || current.includes(key))
      }

      return current.filter((key) => key !== metricKey)
    })
  }

  const getVisibleMetricCount = (row: LeaderboardMatrixRow) =>
    visibleMetrics.reduce(
      (count, metric) => count + (isNumericScore(row.values[metric.column_key]) ? 1 : 0),
      0
    )

  const getDefaultSortDirection = (key: string): "asc" | "desc" => {
    if (key === "model" || key === "developer") {
      return "asc"
    }

    if (key === "updated" || key === "coverage") {
      return "desc"
    }

    return leaderboardMetricMap.get(key)?.lower_is_better ? "asc" : "desc"
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection(getDefaultSortDirection(key))
  }

  const getSortIndicator = (key: string) => {
    if (sortKey !== key) {
      return ""
    }

    return sortDirection === "asc" ? " ▲" : " ▼"
  }


  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">{isResearchView ? "Leaderboard" : "Reporting Comparison"}</CardTitle>
            </div>
            <CardDescription>
              {isResearchView
                ? "Each column is a reported benchmark metric. Distinct measures stay separate instead of collapsing into a single raw score."
                : "Each column is a separately reported metric or subtask metric so the benchmark can be read without flattening unlike measures into one number."}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">
              {filteredRows.length === leaderboardRows.length
                ? `${leaderboardRows.length} models`
                : `${filteredRows.length} of ${leaderboardRows.length} models`}
            </Badge>
            <Badge variant="outline">
              {visibleMetrics.length === leaderboardMetrics.length
                ? `${leaderboardMetrics.length} metrics`
                : `${visibleMetrics.length} of ${leaderboardMetrics.length} metrics`}
            </Badge>
            {hasParameterData && (numericMinParams != null || numericMaxParams != null) && (
              <Badge variant="outline">
                Params {formatParamBoundLabel(minParamStep, "min")} to {formatParamBoundLabel(maxParamStep, "max")}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Visible metric columns</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setVisibleMetricKeys(allMetricKeys)}>
                  Show all
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {leaderboardMetrics.map((metric) => {
                  const isVisible = visibleMetricKeySet.has(metric.column_key)
                  const isLastVisible = isVisible && visibleMetrics.length === 1
                  const visibleLabel = metric.scope === "subtask" && metric.subtask_key && subtaskMetricCounts.get(metric.subtask_key) === 1 && metric.subtask_name
                    ? metric.subtask_name
                    : getCompactMetricLabel(metric.display_name)

                  return (
                    <DropdownMenuCheckboxItem
                      key={metric.column_key}
                      checked={isVisible}
                      disabled={isLastVisible}
                      onCheckedChange={(checked) => setMetricVisibility(metric.column_key, checked === true)}
                      className="items-start"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium leading-tight text-foreground">{visibleLabel}</span>
                        <span className="text-xs leading-tight text-muted-foreground">{describeLeaderboardMetric(metric)}</span>
                      </div>
                    </DropdownMenuCheckboxItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {hasSubtaskTabs && (
          <div className="border-b bg-background px-5 py-3 sm:px-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Benchmark slices
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={activeSubtaskTab === "all" ? "default" : "outline"}
                onClick={() => setActiveSubtaskTab("all")}
              >
                All slices
              </Button>
              {singleMetricSubtaskTabs.map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  size="sm"
                  variant={activeSubtaskTab === tab.key ? "default" : "outline"}
                  onClick={() => setActiveSubtaskTab(tab.key)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {hasParameterData && (
          <div className="border-b bg-background px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Parameter range
                </div>
                <div className="text-sm text-muted-foreground">
                  Narrow the matrix to comparable model sizes.
                </div>
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-4 lg:max-w-[40rem]">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {PARAM_RANGE_MARKERS.map((marker) => (
                      <span key={marker.label} className="text-center">
                        {marker.label}
                      </span>
                    ))}
                  </div>

                  <div className="relative h-4">
                    <div className="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-border/80" />
                    <div className="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2">
                      <div
                        className="absolute inset-y-0 rounded-full bg-foreground transition-[left,right] duration-300 ease-[var(--ease-out-quint)]"
                        style={{
                          left: `${(minParamStep / maxParamStepIndex) * 100}%`,
                          right: `${Math.max(100 - (maxParamStep / maxParamStepIndex) * 100, 0)}%`,
                        }}
                      />
                    </div>

                    <div className="absolute inset-x-1.5 top-1/2 -translate-y-1/2">
                      {PARAM_RANGE_VALUES.map((_, stepIndex) => (
                        <span
                          key={`param-matrix-tick-${stepIndex}`}
                          className="absolute top-0 h-2 w-px -translate-x-1/2 rounded-full bg-border"
                          style={{ left: `${(stepIndex / maxParamStepIndex) * 100}%` }}
                          aria-hidden="true"
                        />
                      ))}
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={maxParamStepIndex}
                      step={1}
                      value={minParamStep}
                      onChange={(event) => {
                        const nextMin = Number(event.target.value)
                        setMinParamStep(Math.min(nextMin, maxParamStep))
                      }}
                      className="param-range-input"
                      aria-label="Minimum parameter filter"
                    />

                    <input
                      type="range"
                      min={0}
                      max={maxParamStepIndex}
                      step={1}
                      value={maxParamStep}
                      onChange={(event) => {
                        const nextMax = Number(event.target.value)
                        setMaxParamStep(Math.max(nextMax, minParamStep))
                      }}
                      className="param-range-input"
                      aria-label="Maximum parameter filter"
                    />
                  </div>
                </div>

                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatParamBoundLabel(minParamStep, "min")} to {formatParamBoundLabel(maxParamStep, "max")}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-20 px-4">Rank</TableHead>
                <TableHead className="min-w-[260px] px-4">
                  <button
                    type="button"
                    onClick={() => handleSort("model")}
                    className="w-full text-left font-semibold transition-colors hover:text-primary"
                  >
                    Model{getSortIndicator("model")}
                  </button>
                </TableHead>
                <TableHead className="hidden min-w-[180px] lg:table-cell">
                  <button
                    type="button"
                    onClick={() => handleSort("developer")}
                    className="w-full text-left font-semibold transition-colors hover:text-primary"
                  >
                    {isResearchView ? "Developer" : "Provider"}
                    {getSortIndicator("developer")}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("coverage")}
                    className="w-full text-right font-semibold transition-colors hover:text-primary"
                  >
                    Coverage{getSortIndicator("coverage")}
                  </button>
                </TableHead>
                {visibleMetrics.map((metric) => (
                  <TableHead key={metric.column_key} className="min-w-[150px] text-right">
                    <button
                      type="button"
                      onClick={() => handleSort(metric.column_key)}
                      aria-label={describeLeaderboardMetric(metric)}
                      className="group relative flex w-full flex-col items-end leading-tight transition-colors hover:text-primary focus-visible:text-primary"
                    >
                      {!hasSubtaskTabs && !(metric.scope === "subtask" && metric.subtask_key && subtaskMetricCounts.get(metric.subtask_key) === 1) && metric.scope === "subtask" && metric.subtask_name && (
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {metric.subtask_name}
                        </span>
                      )}
                      <span>
                        {metric.scope === "subtask" && metric.subtask_key && subtaskMetricCounts.get(metric.subtask_key) === 1 && metric.subtask_name
                          ? metric.subtask_name
                          : getCompactMetricLabel(metric.display_name)}
                        {getSortIndicator(metric.column_key)}
                      </span>
                      <span className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-56 rounded-md border border-border/70 bg-background px-2.5 py-2 text-left text-[11px] font-normal normal-case tracking-normal text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                        {describeLeaderboardMetric(metric)}
                      </span>
                    </button>
                  </TableHead>
                ))}
                <TableHead className="hidden min-w-[120px] xl:table-cell">
                  <button
                    type="button"
                    onClick={() => handleSort("updated")}
                    className="w-full text-left font-semibold transition-colors hover:text-primary"
                  >
                    Updated{getSortIndicator("updated")}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => {
                const rank = rankByModelId.get(row.model_info.id) ?? 0

                return (
                <TableRow key={row.model_info.id} className="hover:bg-muted/10">
                  <TableCell className="px-4">
                    <div
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                        getRankBadgeClass(rank)
                      )}
                    >
                      {rank}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 whitespace-normal">
                    <div className="space-y-1">
                      <div className="font-semibold leading-tight">
                        <Link
                          href={`/models/${getModelFamilyRouteId(row.model_info)}`}
                          className="underline decoration-dotted underline-offset-4 hover:text-primary"
                        >
                          {row.model_info.name}
                        </Link>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {row.model_info.parameter_count && (
                          <Badge variant="secondary" className="font-normal">
                            {row.model_info.parameter_count}
                          </Badge>
                        )}
                        {row.model_info.architecture && (
                          <Badge variant="outline" className="font-normal">
                            {row.model_info.architecture}
                          </Badge>
                        )}
                        <span className="lg:hidden">{row.model_info.developer ?? "Unknown developer"}</span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden lg:table-cell">
                    <div className="max-w-[180px] truncate text-sm text-muted-foreground">
                      {row.model_info.developer ?? "Unknown developer"}
                    </div>
                  </TableCell>

                  <TableCell className="text-right tabular-nums text-sm font-semibold">
                    {getVisibleMetricCount(row)}/{visibleMetrics.length}
                  </TableCell>

                  {visibleMetrics.map((metric) => {
                    const score = row.values[metric.column_key]
                    return (
                      <TableCell
                        key={metric.column_key}
                        className={cn(
                          "text-right tabular-nums",
                          !isNumericScore(score) && "text-muted-foreground"
                        )}
                      >
                        {isNumericScore(score) ? formatRawScore(score, metric.unit) : "—"}
                      </TableCell>
                    )
                  })}

                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                    {formatDate(row.evaluation_timestamp)}
                  </TableCell>
                </TableRow>
              )})}

              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={visibleMetrics.length + 5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No models match the selected parameter range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {pagedRows.length < filteredRows.length && (
          <div className="border-t px-6 py-4 text-center">
            <Button variant="outline" onClick={() => setPage((current) => current + 1)}>
              Load more ({filteredRows.length - pagedRows.length} remaining)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ResearchBenchmarkCardCollapsible({ card }: { card: BenchmarkCard }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-[1.5rem] border border-border/70 bg-muted/10 px-5 py-4 text-left transition-colors hover:bg-muted/20"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Benchmark card details</span>
            <span className="text-xs text-muted-foreground">
              — dataset, methodology, risks, resources
            </span>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <BenchmarkCardPanel card={card} isResearchView defaultRisksOpen={false} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function DetailPanel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border bg-background/70 p-4">
      <div className="mb-4">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{subtitle}</div>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function MetaRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words font-medium">{value}</span>
    </div>
  )
}

function toStringArray(value: unknown): string[] {
  const result = new Set<string>()

  const visit = (candidate: unknown) => {
    if (!candidate) {
      return
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item)
      }
      return
    }

    if (typeof candidate === "object") {
      for (const item of Object.values(candidate)) {
        visit(item)
      }
      return
    }

    if (typeof candidate !== "string") {
      return
    }

    const normalized = candidate.trim()
    if (!normalized || normalized === "Not specified") {
      return
    }

    for (const part of normalized.split(/[,;|]/)) {
      const token = part.trim()
      if (token && token !== "Not specified") {
        result.add(token)
      }
    }
  }

  visit(value)
  return Array.from(result)
}

function BenchmarkCardPanel({
  card,
  isResearchView,
  defaultRisksOpen = false,
}: {
  card: BenchmarkCard
  isResearchView: boolean
  defaultRisksOpen?: boolean
}) {
  const [risksOpen, setRisksOpen] = useState(defaultRisksOpen)
  const details = card.benchmark_details
  const purpose = card.purpose_and_intended_users
  const methodology = card.methodology
  const data = card.data
  const ethical = card.ethical_and_legal_considerations
  const risks = card.possible_risks ?? []
  const flaggedFields = Object.entries(card.flagged_fields ?? {})
  const missingFields = card.missing_fields ?? []

  const domains = toStringArray(details.domains)
  const languages = toStringArray(details.languages)
  const resources = (details.resources ?? []).filter(Boolean)
  const tasks = toStringArray(purpose.tasks)
  const audience = toStringArray(purpose.audience)

  const license = ethical.data_licensing ?? ""
  const shortLicense = license && license !== "Not specified" ? license : null

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/10">
        <div className="flex flex-wrap items-center gap-3">
          <BookOpen className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">Benchmark Card</CardTitle>
          {shortLicense && (
            <Badge variant="outline" className="font-normal">
              {shortLicense}
            </Badge>
          )}
          {(flaggedFields.length > 0 || missingFields.length > 0) && (
            <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-500">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {flaggedFields.length} flagged · {missingFields.length} missing
            </Badge>
          )}
        </div>
        <CardDescription>
          Structured metadata about this benchmark — what it measures, how it was built, and known limitations.
          {card.card_info?.llm && (
            <span className="ml-1 text-muted-foreground/70">
              Card generated by {card.card_info.llm}.
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 p-5 sm:p-6">
        {/* Overview + domains */}
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">{details.overview}</p>

          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-medium capitalize"
              >
                <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
                {d}
              </span>
            ))}
            {languages.map((l) => (
              <span
                key={l}
                className="inline-flex items-center gap-1 rounded-full border border-sky-200/70 bg-sky-50/60 px-2.5 py-1 text-xs font-medium dark:border-sky-900/40 dark:bg-sky-950/20"
              >
                <Globe className="h-3 w-3 shrink-0 text-sky-600" />
                {l}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Goal */}
          <div className="rounded-[1.25rem] border border-border/70 bg-muted/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Scale className="h-3.5 w-3.5" /> Goal
            </div>
            <p className="text-sm leading-5 text-foreground">{purpose.goal}</p>
          </div>

          {/* Metric interpretation */}
          <div className="rounded-[1.25rem] border border-border/70 bg-muted/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" /> Score interpretation
            </div>
            <p className="text-sm leading-5 text-foreground">{methodology.interpretation}</p>
          </div>

          {/* Limitations */}
          <div className="rounded-[1.25rem] border border-amber-200/60 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/15">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Limitations
            </div>
            <p className="text-sm leading-5 text-amber-900/90 dark:text-amber-100/90">{purpose.limitations}</p>
          </div>
        </div>

        {/* Research-only: methodology + dataset details */}
        {isResearchView && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-border/70 bg-muted/10 p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Dataset
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">Size</dt>
                  <dd className="font-medium">{data.size}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">Format</dt>
                  <dd className="font-medium capitalize">{data.format}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">Source</dt>
                  <dd className="font-medium">{data.source}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-[1.25rem] border border-border/70 bg-muted/10 p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Methodology
              </div>
              <dl className="space-y-2 text-sm">
                {methodology.metrics.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">Metrics</dt>
                    <dd className="font-medium">{methodology.metrics.join(", ")}</dd>
                  </div>
                )}
                {tasks.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">Tasks</dt>
                    <dd className="font-medium">{tasks.join(", ")}</dd>
                  </div>
                )}
                {audience.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">Audience</dt>
                    <dd className="font-medium">{audience.join("; ")}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}

        {/* Risks (collapsible) */}
        {risks.length > 0 && (
          <Collapsible open={risksOpen} onOpenChange={setRisksOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-[1.25rem] border border-border/70 bg-muted/10 p-4 text-left transition-colors hover:bg-muted/20"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">
                    Risk considerations ({risks.length})
                  </span>
                </div>
                {risksOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {risks.map((risk, i) => (
                  <div
                    key={i}
                    className="rounded-[1.25rem] border border-border/60 bg-background p-4"
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold">{risk.category}</span>
                      {risk.url && (
                        <a
                          href={risk.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {risk.description?.[0] && (
                      <p className="text-xs leading-5 text-muted-foreground line-clamp-3">
                        {risk.description[0]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Compliance / ethical notes (policy view emphasis) */}
        {!isResearchView && (
          <div className="rounded-[1.25rem] border border-border/70 bg-muted/10 p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Ethical &amp; legal
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {shortLicense && (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">License</dt>
                  <dd className="font-medium">{license}</dd>
                </div>
              )}
              {ethical.compliance_with_regulations && ethical.compliance_with_regulations !== "Not specified" && (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">Compliance</dt>
                  <dd className="font-medium">{ethical.compliance_with_regulations}</dd>
                </div>
              )}
              {ethical.privacy_and_anonymity && ethical.privacy_and_anonymity !== "Not specified" && (
                <div className="col-span-full flex gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">Privacy</dt>
                  <dd className="font-medium">{ethical.privacy_and_anonymity}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Flagged / missing fields warning */}
        {(flaggedFields.length > 0 || missingFields.length > 0) && isResearchView && (
          <div className="rounded-[1.25rem] border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/15">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
              Card quality notes
            </div>
            {flaggedFields.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-900/80 dark:text-amber-100/80">
                {flaggedFields.map(([field, note]) => (
                  <li key={field}>
                    <span className="font-semibold">{field}:</span> {note}
                  </li>
                ))}
              </ul>
            )}
            {missingFields.length > 0 && (
              <p className="mt-1 text-xs text-amber-900/70 dark:text-amber-100/70">
                Missing: {missingFields.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* External resources */}
        {resources.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Resources
            </div>
            <div className="flex flex-wrap gap-2">
              {resources.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  {url.replace(/^https?:\/\//, "").replace(/\/.+/, "")}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
