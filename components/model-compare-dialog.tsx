"use client"

import { Fragment, useMemo } from "react"
import Link from "next/link"
import {
  ChevronDown,
  ExternalLink,
  FlaskConical,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import type { BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function formatDate(isoString: string) {
  const numeric = Number(isoString)
  const parsedDate =
    !Number.isNaN(numeric) && !isoString.includes("-")
      ? new Date(numeric * 1000)
      : new Date(isoString)

  try {
    return parsedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return isoString
  }
}

function parseParamsBillionsFromModelName(modelName: string | null | undefined) {
  if (!modelName) return null

  // Parse explicit size tokens like 7B, 40B, or 560M from model names.
  const sizeTokens = Array.from(modelName.matchAll(/\b(\d+(?:\.\d+)?)\s*([bm])\b/gi))
  if (sizeTokens.length === 0) return null

  const lastToken = sizeTokens[sizeTokens.length - 1]
  const numericValue = Number(lastToken[1])
  if (!Number.isFinite(numericValue)) return null

  const unit = lastToken[2].toLowerCase()
  if (unit === "b") return numericValue
  if (unit === "m") return numericValue / 1000

  return null
}

function formatParamsBillions(value: number | null | undefined, modelName?: string) {
  const resolvedValue =
    value == null || Number.isNaN(value) ? parseParamsBillionsFromModelName(modelName) : value

  if (resolvedValue == null || Number.isNaN(resolvedValue)) return "Not reported"
  if (resolvedValue >= 100) return `${Math.round(resolvedValue)}B`
  return `${resolvedValue.toFixed(1)}B`
}

function formatBenchmarkScore(score: number, unit?: string) {
  if (unit === "accuracy" || unit === "pass@1" || (!unit && score >= 0 && score <= 1)) {
    return `${(score * 100).toFixed(1)}`
  }

  if (unit === "points") {
    return score.toFixed(1)
  }

  return score.toFixed(2)
}

function getReproducibilityLabel(status: BenchmarkEvaluationCardData["reproducibility_status"]) {
  switch (status) {
    case "complete":
      return "Full config coverage"
    case "partial":
      return "Partial config coverage"
    default:
      return "Config mostly missing"
  }
}

function getIndependentLabel(model: BenchmarkEvaluationCardData) {
  if (model.independent_verification_ratio >= 0.75) return "Mostly third-party"
  if (model.independent_verification_ratio > 0) return "Mixed reporting"
  return "Self-reported only"
}

function getIndependentValue(model: BenchmarkEvaluationCardData) {
  return `${Math.round(model.independent_verification_ratio * 100)}% independent`
}

function getBenchmarkSection(name: string) {
  const value = name.toLowerCase()

  if (
    value.includes("tau") ||
    value.includes("swe-bench") ||
    value.includes("browsecomp") ||
    value.includes("agent")
  ) {
    return "Agentic"
  }

  if (
    value.includes("aime") ||
    value.includes("gpqa") ||
    value.includes("hmmt") ||
    value.includes("beyond aime") ||
    value.includes("reason")
  ) {
    return "Reasoning"
  }

  if (
    value.includes("math") ||
    value.includes("mmlu") ||
    value.includes("ifeval") ||
    value.includes("arena") ||
    value.includes("live code") ||
    value.includes("humaneval") ||
    value.includes("mbpp") ||
    value.includes("code")
  ) {
    return "General"
  }

  return "Other"
}

const SECTION_ORDER = ["General", "Reasoning", "Agentic", "Other"]

const CONTEXT_ROWS = [
  { key: "developer", label: "Developer" },
  { key: "params", label: "Parameter range" },
  { key: "benchmarks", label: "Benchmark coverage" },
  { key: "reporting", label: "Reporting orgs" },
  { key: "independence", label: "Reporting posture" },
  { key: "reproducibility", label: "Reproducibility" },
  { key: "latest", label: "Latest report" },
  { key: "updated", label: "Updated" },
] as const

interface ModelCompareDialogProps {
  models: BenchmarkEvaluationCardData[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelCompareDialog({
  models,
  open,
  onOpenChange,
}: ModelCompareDialogProps) {
  const benchmarkRows = useMemo(() => {
    const rows = new Map<
      string,
      {
        benchmark: string
        metric: string
        section: string
        values: Record<string, { score: number; unit?: string }>
        order: number
      }
    >()

    let order = 0

    for (const model of models) {
      for (const score of model.top_scores) {
        const existing = rows.get(score.benchmark)
        if (!existing) {
          rows.set(score.benchmark, {
            benchmark: score.benchmark,
            metric: score.metric,
            section: getBenchmarkSection(score.benchmark),
            values: {
              [model.id]: {
                score: score.score,
                unit: score.unit,
              },
            },
            order,
          })
          order += 1
          continue
        }

        existing.values[model.id] = {
          score: score.score,
          unit: score.unit,
        }
      }
    }

    return Array.from(rows.values()).sort((a, b) => {
      const sectionDiff = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
      if (sectionDiff !== 0) {
        return sectionDiff
      }

      return a.order - b.order
    })
  }, [models])

  const benchmarkSections = useMemo(() => {
    return SECTION_ORDER.map((section) => ({
      section,
      rows: benchmarkRows.filter((row) => row.section === section),
    })).filter((group) => group.rows.length > 0)
  }, [benchmarkRows])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85dvh] max-h-[85dvh] max-w-[min(96vw,1220px)] overflow-hidden p-0 sm:max-w-[min(96vw,1220px)]">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b border-border/70 px-6 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Side-By-Side Comparison
            </div>
            <DialogTitle>Compare Selected Models</DialogTitle>
            <DialogDescription>
              Start with the benchmark table. Use the context table only when you need reporting, reproducibility, or provenance detail.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
            <div className="min-w-[920px] space-y-6">
              <div className="rounded-[1.5rem] border border-border/70 bg-background">
                <div className="border-b border-border/60 px-5 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Benchmark Comparison
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Rows are drawn from the most relevant surfaced benchmarks across the selected models, closer to how release posts present comparison tables.
                  </div>
                </div>

                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[260px]">Benchmark</TableHead>
                        {models.map((model) => (
                          <TableHead key={model.id} className="min-w-[170px] align-top">
                            <div className="space-y-2">
                              <div>
                                <div className="font-semibold text-foreground">{model.model_name}</div>
                                <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                  {model.developer || "Unknown developer"}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">
                                  {formatParamsBillions(model.params_billions, model.model_name)}
                                </Badge>
                                <Button asChild variant="ghost" size="sm">
                                  <Link href={`/models/${model.route_id}`}>View</Link>
                                </Button>
                              </div>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {benchmarkSections.map((group) => (
                        <Fragment key={group.section}>
                          <TableRow key={`${group.section}-heading`}>
                            <TableCell
                              colSpan={models.length + 1}
                              className="bg-muted/25 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
                            >
                              {group.section}
                            </TableCell>
                          </TableRow>
                          {group.rows.map((row) => {
                            const rowValues = Object.values(row.values).map((value) => value.score)
                            const maxScore = rowValues.length > 0 ? Math.max(...rowValues) : null

                            return (
                              <TableRow key={row.benchmark}>
                                <TableCell className="whitespace-normal">
                                  <div className="font-medium">{row.benchmark}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">{row.metric}</div>
                                </TableCell>
                                {models.map((model) => {
                                  const value = row.values[model.id]
                                  const isBest = value && maxScore != null && value.score === maxScore

                                  return (
                                    <TableCell
                                      key={`${row.benchmark}-${model.id}`}
                                      className={isBest ? "bg-emerald-50/70 dark:bg-emerald-950/20" : ""}
                                    >
                                      {value ? (
                                        <div className="text-base font-semibold tabular-nums">
                                          {formatBenchmarkScore(value.score, value.unit)}
                                        </div>
                                      ) : (
                                        <div className="text-muted-foreground">--</div>
                                      )}
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            )
                          })}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Collapsible className="rounded-[1.5rem] border border-border/70 bg-muted/10">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                  >
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Dive Deeper
                      </div>
                      <div className="mt-1 font-semibold text-foreground">
                        Show reporting and reproducibility context
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-border/60 px-5 py-5">
                  <div className="overflow-auto rounded-[1.25rem] border border-border/70 bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[220px]">Signal</TableHead>
                          {models.map((model) => (
                            <TableHead key={`${model.id}-context`} className="min-w-[220px]">
                              <div className="font-semibold">{model.model_name}</div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {CONTEXT_ROWS.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-medium text-muted-foreground">{row.label}</TableCell>
                            {models.map((model) => (
                              <TableCell key={`${model.id}-${row.key}`} className="align-top whitespace-normal">
                                {row.key === "developer" ? model.developer || "Unknown developer" : null}
                                {row.key === "params"
                                  ? formatParamsBillions(model.params_billions, model.model_name)
                                  : null}
                                {row.key === "benchmarks" ? (
                                  <div className="space-y-1">
                                    <div className="font-medium">{model.benchmarks_count} covered benchmarks</div>
                                    <div className="text-sm text-muted-foreground">
                                      {model.evaluations_count} reported result{model.evaluations_count !== 1 ? "s" : ""}
                                    </div>
                                  </div>
                                ) : null}
                                {row.key === "reporting" ? (
                                  <div className="space-y-1">
                                    <div className="font-medium">
                                      {model.evaluator_count} reporting org{model.evaluator_count !== 1 ? "s" : ""}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {model.evaluator_names.slice(0, 3).join(", ") || "Not named"}
                                    </div>
                                  </div>
                                ) : null}
                                {row.key === "independence" ? (
                                  <div className="space-y-2">
                                    <Badge
                                      variant={model.independent_verification_ratio > 0 ? "secondary" : "outline"}
                                      className="font-medium"
                                    >
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                      {getIndependentLabel(model)}
                                    </Badge>
                                    <div className="text-sm text-muted-foreground">
                                      {getIndependentValue(model)}
                                    </div>
                                  </div>
                                ) : null}
                                {row.key === "reproducibility" ? (
                                  <div className="space-y-2">
                                    <Badge
                                      variant={
                                        model.reproducibility_status === "complete"
                                          ? "secondary"
                                          : model.reproducibility_status === "partial"
                                            ? "outline"
                                            : "destructive"
                                      }
                                      className="font-medium"
                                    >
                                      {model.reproducibility_status === "missing" ? (
                                        <TriangleAlert className="h-3.5 w-3.5" />
                                      ) : (
                                        <FlaskConical className="h-3.5 w-3.5" />
                                      )}
                                      {getReproducibilityLabel(model.reproducibility_status)}
                                    </Badge>
                                    <div className="text-sm text-muted-foreground">
                                      {model.missing_generation_config_count > 0
                                        ? `${model.missing_generation_config_count} result${model.missing_generation_config_count !== 1 ? "s" : ""} without generation config`
                                        : "No missing generation config in current corpus"}
                                    </div>
                                  </div>
                                ) : null}
                                {row.key === "latest" ? (
                                  <div className="flex items-center gap-2">
                                    <span>{model.latest_source_name || "No named source"}</span>
                                    {model.source_urls[0] ? (
                                      <a
                                        href={model.source_urls[0]}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-muted-foreground hover:text-foreground"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    ) : null}
                                  </div>
                                ) : null}
                                {row.key === "updated" ? formatDate(model.latest_timestamp) : null}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
