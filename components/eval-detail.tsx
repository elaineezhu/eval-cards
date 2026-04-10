"use client"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { Fragment, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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

function getParamsBillions(modelResult: ModelResultForBenchmark) {
  const additionalDetails = modelResult.model_info.additional_details
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

  if (typeof modelResult.model_info.parameter_count === "string") {
    const parsed = parseParamsBillionsFromText(modelResult.model_info.parameter_count)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return parseParamsBillionsFromModelName(modelResult.model_info.name)
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
  const numeric = Number(ts)
  const parsedDate = !Number.isNaN(numeric) && !ts.includes("-") ? new Date(numeric * 1000) : new Date(ts)

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

  const avgNorm = formatPercent(summary.avg_score_norm)
  const scoreDirectionLabel = summary.metric_config.lower_is_better ? "Lower scores rank higher" : "Higher scores rank higher"
  const leaderboardTitle = isResearchView ? "Leaderboard" : "Reporting Comparison"
  const sourceDatasetLabel = summary.source_data?.hf_repo ?? summary.source_data?.dataset_name ?? "Backend summary"
  const instanceDataLabel = summary.instance_data?.available
    ? `${summary.instance_data.url_count.toLocaleString()} linked URL${summary.instance_data.url_count === 1 ? "" : "s"}`
    : "Not linked"
  const leaderboardDescription = isResearchView
    ? summary.is_aggregated
      ? "Models ranked by average normalized score across the contributing composite benchmarks."
      : "Models ranked by normalized score for this benchmark."
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
                  {isResearchView ? "Avg norm" : "Metrics"}
                </div>
                <div className="mt-1 text-2xl font-semibold">{isResearchView ? avgNorm : summary.metrics_count ?? 1}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                  {isResearchView ? "Top model" : "Source dataset"}
                </div>
                <div className="mt-1 text-sm font-semibold text-emerald-950 dark:text-emerald-50">
                  {isResearchView && summary.best_model ? summary.best_model.name : sourceDatasetLabel}
                </div>
                {isResearchView && summary.best_model && (
                  <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
                    {formatPercent(normalizeScore(summary.best_model.score))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                  {isResearchView ? "Bottom model" : "Instance data"}
                </div>
                <div className="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-50">
                  {isResearchView && summary.worst_model
                    ? summary.worst_model.name
                    : instanceDataLabel}
                </div>
                {isResearchView && summary.worst_model && (
                  <div className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">
                    {formatPercent(normalizeScore(summary.worst_model.score))}
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
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Domains</dt>
                  <dd className="mt-1 font-medium capitalize">
                    {summary.tags.domains.slice(0, 4).join(", ")}
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

      {/* Policy: benchmark context BEFORE the leaderboard (context first, numbers second) */}
      {!isResearchView && summary.benchmark_card && (
        <BenchmarkCardPanel card={summary.benchmark_card} isResearchView={false} defaultRisksOpen />
      )}

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
                        <div className="space-y-1">
                          <div className="text-xl font-semibold tabular-nums">{formatPercent(normalizedScore)}</div>
                          <div className="text-xs text-muted-foreground">
                            Raw {formatRawScore(modelResult.score, summary.metric_config.unit)}
                          </div>
                        </div>
                      </TableCell>

                      {isResearchView ? (
                        <TableCell className="hidden md:table-cell">
                          <div className="flex min-w-[220px] items-center gap-3">
                            <Progress value={normalizedScore * 100} className="h-2 flex-1" />
                            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                              {formatPercent(normalizedScore)}
                            </span>
                          </div>
                        </TableCell>
                      ) : (
                        <TableCell className="hidden md:table-cell">
                          <div className="text-sm text-muted-foreground capitalize">
                            {modelResult.aggregate_components && modelResult.aggregate_components.length > 1
                              ? `average of ${modelResult.aggregate_components.length} composite scores`
                              : datasetName ?? "Backend detail artifact"}
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
                                ? "Backend detail artifact"
                                : modelResult.source_data.hf_repo ?? modelResult.source_data.source_type ?? "Backend detail artifact"}
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
                                    : "Normalized performance plus uncertainty and sample details."
                                }
                              >
                                <MetaRow
                                  label={modelResult.aggregate_components ? "Average Score" : "Normalized Score"}
                                  value={formatPercent(normalizedScore)}
                                />
                                <MetaRow
                                  label={modelResult.aggregate_components ? "Average Raw Value" : "Raw Score"}
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
                                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Score</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {modelResult.aggregate_components.map((component, i) => (
                                        <tr key={`${component.evaluation_id}-${i}`} className="border-b last:border-0 hover:bg-muted/10">
                                          <td className="px-3 py-2 font-medium">{component.composite_benchmark_name}</td>
                                          <td className="px-3 py-2 text-muted-foreground">{component.source_organization_name}</td>
                                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRawScore(component.score)}</td>
                                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatPercent(component.normalized_score)}</td>
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
                                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Score</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {subtasks.map(([subtaskName, value]) => {
                                        const numericValue = value as number
                                        const normalizedSubtaskScore = range > 0 ? (numericValue - minScore) / range : numericValue
                                        return (
                                          <tr key={subtaskName} className="border-b last:border-0 hover:bg-muted/10">
                                            <td className="px-3 py-2 font-medium capitalize">{subtaskName.replace(/_/g, " ")}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRawScore(numericValue, summary.metric_config.unit)}</td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatPercent(normalizedSubtaskScore)}</td>
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

          {/* Load more */}
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

      {/* Research: benchmark card details AFTER the leaderboard, collapsed by default */}
      {isResearchView && summary.benchmark_card && (
        <ResearchBenchmarkCardCollapsible card={summary.benchmark_card} />
      )}
    </div>
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

function toStringArray(value: string[] | string | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  if (value === "Not specified") return []
  return [value]
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

  const domains = details.domains ?? []
  const languages = details.languages ?? []
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
