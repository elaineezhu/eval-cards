"use client"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { Fragment, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Database,
  ExternalLink,
  Globe,
  Medal,
} from "lucide-react"
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

  const maxScore = summary.metric_config.max_score ?? 1
  const minScore = summary.metric_config.min_score ?? 0
  const range = maxScore - minScore

  const normalizeScore = (raw: number) => (range > 0 ? (raw - minScore) / range : raw)
  const formatPercent = (normalized: number) => `${(normalized * 100).toFixed(1)}%`

  const sortedResults = useMemo(
    () =>
      [...summary.model_results].sort((a, b) =>
        summary.metric_config.lower_is_better ? a.score - b.score : b.score - a.score
      ),
    [summary.model_results, summary.metric_config.lower_is_better]
  )

  const leaderboardRows = useMemo<LeaderboardRow[]>(() => {
    let currentRank = 0
    let previousScore: number | null = null

    return sortedResults.map((modelResult, index) => {
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
  }, [sortedResults])

  const avgNorm = formatPercent(summary.avg_score_norm)
  const scoreDirectionLabel = summary.metric_config.lower_is_better ? "Lower scores rank higher" : "Higher scores rank higher"
  const leaderboardTitle = isResearchView ? "Leaderboard" : "Reporting Comparison"
  const leaderboardDescription = isResearchView
    ? "Models ranked by normalized score for this evaluation."
    : "Model results with stronger emphasis on reporting context and evaluator provenance."

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
                  Eval Metadata
                </Badge>
                <Badge variant="secondary" className="font-normal capitalize">
                  {summary.metric_config.score_type}
                </Badge>
                <Badge variant="secondary" className="font-normal">
                  {summary.metric_config.lower_is_better ? "Lower is better" : "Higher is better"}
                </Badge>
                <Badge variant="secondary" className="font-normal">
                  {(summary.factsheet?.input_modality ?? "text")}/{(summary.factsheet?.output_modality ?? "text")}
                </Badge>
              </div>

              <div className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight sm:text-[1.9rem]">{summary.evaluation_name}</div>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {summary.metric_config.evaluation_description}
                </p>
              </div>

              {!isResearchView && (
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {`${summary.factsheet?.purpose ?? "This benchmark provides a public-facing capability signal."} Scores should be read alongside reporting context and evaluator independence.`}
                </p>
              )}
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[460px] xl:grid-cols-4">
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-950/20">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">Models</div>
                <div className="mt-1 text-2xl font-semibold text-sky-950 dark:text-sky-50">{summary.models_count}</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isResearchView ? "Avg norm" : "Reporting orgs"}
                </div>
                <div className="mt-1 text-2xl font-semibold">{isResearchView ? avgNorm : summary.evaluator_names.length}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                  {isResearchView ? "Top model" : "Score rule"}
                </div>
                <div className="mt-1 min-w-0 truncate text-sm font-semibold text-emerald-950 dark:text-emerald-50">
                  {isResearchView && summary.best_model ? summary.best_model.name : scoreDirectionLabel}
                </div>
                {isResearchView && summary.best_model && (
                  <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
                    {formatPercent(normalizeScore(summary.best_model.score))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                  {isResearchView ? "Bottom model" : "Purpose"}
                </div>
                <div className="mt-1 min-w-0 truncate text-sm font-semibold text-amber-950 dark:text-amber-50">
                  {isResearchView && summary.worst_model
                    ? summary.worst_model.name
                    : summary.factsheet?.purpose ?? "General evaluation reporting"}
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
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {isResearchView ? "Benchmark ID" : "What this covers"}
                </dt>
                <dd className="mt-1 break-words font-medium">
                  {isResearchView ? summary.evaluation_id : summary.metric_config.evaluation_description}
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
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Modalities</dt>
                <dd className="mt-1 font-medium">
                  {(summary.factsheet?.input_modality ?? "text")}/{(summary.factsheet?.output_modality ?? "text")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {summary.factsheet?.design ? "Documentation" : isResearchView ? "Reporting orgs" : "Evidence sources"}
                </dt>
                <dd className="mt-1 font-medium">
                  {summary.factsheet?.design ? (
                    <a
                      className="inline-flex max-w-full items-center gap-1 break-all text-primary underline decoration-dotted underline-offset-4 hover:text-primary/80"
                      href={summary.factsheet.design}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {summary.factsheet.design.replace(/^https?:\/\//, "")}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : (
                    `${summary.evaluator_names.length} reporting org${summary.evaluator_names.length === 1 ? "" : "s"}`
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

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
              <Badge variant="secondary">{summary.models_count} models</Badge>
              <Badge variant="outline">{scoreDirectionLabel}</Badge>
              {isResearchView && (
                <Badge variant="outline">
                  Scale {summary.metric_config.min_score ?? 0} - {summary.metric_config.max_score ?? 1}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
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
              {leaderboardRows.map(({ key, rank, modelResult, normalizedScore }) => {
                const isExpanded = expandedRows[key] ?? false
                const subtasks = modelResult.score_details.details
                  ? Object.entries(modelResult.score_details.details).filter(([, value]) => typeof value === "number")
                  : []

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
                          <div className="font-semibold leading-tight">{modelResult.model_info.name}</div>
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
                            {modelResult.source_metadata.evaluator_relationship.replace(/_/g, " ")}
                          </div>
                        </TableCell>
                      )}

                      <TableCell className="hidden whitespace-normal xl:table-cell">
                        <div className="space-y-1">
                          <div className="font-medium">{modelResult.source_metadata.source_organization_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {modelResult.source_metadata.evaluator_relationship.replace(/_/g, " ")}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="hidden lg:table-cell">
                        <div className="text-sm text-muted-foreground">{formatDate(modelResult.evaluation_timestamp)}</div>
                      </TableCell>

                      <TableCell className="px-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={isExpanded ? "Collapse details" : "Expand details"}
                          onClick={() => toggleRow(key)}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
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
                                <MetaRow label="Normalized Score" value={formatPercent(normalizedScore)} />
                                <MetaRow
                                  label="Raw Score"
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

                            {subtasks.length > 0 && (
                              <div className="space-y-3">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Subtask Distribution
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    Detailed sub-metric scores for this model run.
                                  </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  {subtasks.map(([subtaskName, value]) => {
                                    const numericValue = value as number
                                    const normalizedSubtaskScore = range > 0 ? (numericValue - minScore) / range : numericValue

                                    return (
                                      <div key={subtaskName} className="rounded-xl border bg-background/70 p-4">
                                        <div className="mb-3 flex items-start justify-between gap-4">
                                          <div className="min-w-0">
                                            <div className="text-sm font-medium capitalize">
                                              {subtaskName.replace(/_/g, " ")}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {formatRawScore(numericValue, summary.metric_config.unit)}
                                            </div>
                                          </div>
                                          <div className="text-sm font-semibold tabular-nums">
                                            {formatPercent(normalizedSubtaskScore)}
                                          </div>
                                        </div>
                                        <Progress value={normalizedSubtaskScore * 100} className="h-2" />
                                      </div>
                                    )
                                  })}
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
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
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
