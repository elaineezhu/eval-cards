"use client"

import type { CSSProperties } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { useRouter } from "next/navigation"
import {
  Award,
  BadgeCheck,
  BookOpenText,
  ExternalLink,
  Eye,
  FlaskConical,
  LibraryBig,
  MoreHorizontal,
  Scale,
} from "lucide-react"

import type { CategoryType } from "@/lib/benchmark-schema"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"

export type BenchmarkEvaluationCardData = {
  id: string
  route_id: string
  model_name: string
  model_id: string
  canonical_model_name: string
  developer: string
  evaluations_count: number
  benchmarks_count: number
  variant_count: number
  categories: CategoryType[]
  category_stats: Record<CategoryType, number>
  latest_timestamp: string
  evaluator_count: number
  evaluator_names: string[]
  source_type_count: number
  source_types: string[]
  evidence_count: number
  missing_generation_config_count: number
  third_party_eval_count: number
  independent_verification_ratio: number
  reproducibility_status: "complete" | "partial" | "missing"
  eval_libraries: Array<{
    name: string
    version?: string
    fork?: string
  }>
  latest_source_name?: string
  params_billions?: number | null

  top_scores: Array<{
    benchmark: string
    score: number
    metric: string
    unit?: string
  }>

  source_urls: string[]
  detail_urls: string[]
  model_url?: string
  release_date?: string
  input_modalities?: string[]
  output_modalities?: string[]
  architecture?: string
  params?: string
  inference_engine?: string
  inference_platform?: string
}

interface BenchmarkEvaluationCardProps {
  data: BenchmarkEvaluationCardData
  onDelete?: (id: string) => void
  delayMs?: number
}

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

function formatHighlightScore(score: number, unit?: string) {
  if (unit === "accuracy" || unit === "pass@1" || (!unit && score >= 0 && score <= 1)) {
    return `${(score * 100).toFixed(1)}%`
  }
  if (unit === "points") return score.toFixed(1)
  return score.toFixed(2)
}

function scoreToPercent(score: number, unit?: string): number {
  if (score >= 0 && score <= 1) return score * 100
  return Math.min(Math.max(score, 0), 100)
}

function getPolicyBenchmarkLabel(name: string) {
  const value = name.toLowerCase()
  if (value.includes("ifeval")) return "Following instructions"
  if (value.includes("bbh")) return "Reasoning and logic"
  if (value.includes("math")) return "Advanced mathematics"
  if (value.includes("gpqa")) return "Expert knowledge"
  if (value.includes("musr")) return "Narrative reasoning"
  if (value.includes("mmlu")) return "Broad knowledge"
  if (value.includes("tau-bench")) return "Agentic task completion"
  if (value.includes("swe-bench")) return "Software engineering"
  return name
}

function formatParamsBillions(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null
  if (value >= 100) return `${Math.round(value)}B`
  return `${value.toFixed(1)}B`
}

function getReportingSummaryLabel(data: BenchmarkEvaluationCardData) {
  if (data.evaluator_count > 0) {
    return `${data.evaluator_count} reporting org${data.evaluator_count !== 1 ? "s" : ""}`
  }

  if (data.latest_source_name) {
    return data.latest_source_name
  }

  return "Aggregated reporting view"
}

function getReportingMixLabel(data: BenchmarkEvaluationCardData) {
  const thirdPartyShare = Math.round(data.independent_verification_ratio * 100)

  if (thirdPartyShare <= 0) {
    return "Self-reported evidence"
  }

  if (thirdPartyShare >= 100) {
    return "Third-party reported"
  }

  return `${thirdPartyShare}% third-party mix`
}

export function BenchmarkEvaluationCard({ data, onDelete, delayMs = 0 }: BenchmarkEvaluationCardProps) {
  const router = useRouter()
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const highlights = data.top_scores.slice(0, 3)
  const library = data.eval_libraries[0]
  const paramsBillions = formatParamsBillions(data.params_billions)
  const reportingSummaryLabel = getReportingSummaryLabel(data)

  return (
    <Card
      className="motion-academic-enter motion-academic-surface motion-academic-hover group cursor-pointer overflow-hidden border-border/70 bg-card hover:shadow-xl"
      style={{ "--enter-delay": `${delayMs}ms` } as CSSProperties}
      onClick={() => router.push(`/models/${data.route_id}`)}
    >
      <CardHeader className="space-y-4 border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          <span>Model Summary</span>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground/90">
            <span className="max-w-[13rem] truncate">{reportingSummaryLabel}</span>
            <span className="text-border">/</span>
            <span>{formatDate(data.latest_timestamp)}</span>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <CardTitle className="truncate text-lg font-bold transition-colors group-hover:text-primary sm:text-xl">
                {data.model_name}
              </CardTitle>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {data.developer || "Unknown developer"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.variant_count > 1 && (
                <Badge variant="secondary">{data.variant_count} versions</Badge>
              )}
              {paramsBillions && <Badge variant="secondary">{paramsBillions} parameters</Badge>}
              {data.architecture && <Badge variant="outline">{data.architecture}</Badge>}
              {data.input_modalities && data.input_modalities.length > 1 && (
                <Badge variant="secondary">Multimodal</Badge>
              )}
              {data.evaluator_count > 0 ? (
                <Badge variant="secondary">{reportingSummaryLabel}</Badge>
              ) : null}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="motion-academic-button opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/models/${data.route_id}`)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              {data.source_urls.length > 0 && (
                <DropdownMenuItem onClick={() => window.open(data.source_urls[0], "_blank")}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Source
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={() => onDelete(data.id)} className="text-destructive">
                  <Award className="mr-2 h-4 w-4" />
                  Remove
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-3 gap-2">
          <CompactStat
            label={isResearchView ? "Benchmarks" : "Coverage"}
            value={data.benchmarks_count.toString()}
            tone="bg-sky-50 text-sky-900 ring-1 ring-sky-200/70 dark:bg-sky-950/25 dark:text-sky-100 dark:ring-sky-900/50"
          />
          <CompactStat
            label={isResearchView ? "Results" : "Reported"}
            value={data.evaluations_count.toString()}
            tone="bg-stone-100 text-stone-900 ring-1 ring-stone-200/80 dark:bg-stone-900/40 dark:text-stone-100 dark:ring-stone-800/70"
          />
          <CompactStat
            label="Reporting Mix"
            value={getReportingMixLabel(data)}
            tone="bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/70 dark:bg-emerald-950/25 dark:text-emerald-100 dark:ring-emerald-900/50"
          />
        </div>

        {isResearchView ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.92fr)_minmax(0,1.08fr)]">
            <section className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Method + Provenance</div>
              <div className="rounded-2xl border border-border/70 bg-muted/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-none">
                <div className="space-y-0 text-sm">
                  <KeyValueRow label="Reporting sources" value={reportingSummaryLabel} />
                  {library && (
                    <KeyValueRow label="Library" value={`${library.name}${library.version ? ` ${library.version}` : ""}`} />
                  )}
                  {data.latest_source_name && (
                    <KeyValueRow label="Latest report" value={data.latest_source_name} />
                  )}
                  <KeyValueRow label="Updated" value={formatDate(data.latest_timestamp)} />
                  {data.source_types.length > 0 && (
                    <KeyValueRow label="Source types" value={data.source_types.map(s => s.replace(/_/g, " ")).join(", ")} />
                  )}
                  {data.missing_generation_config_count > 0 && (
                    <KeyValueRow label="Missing config" value={`${data.missing_generation_config_count} result${data.missing_generation_config_count !== 1 ? "s" : ""}`} />
                  )}
                  {library?.fork && (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                      <LibraryBig className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
                      <span>Non-standard eval library fork</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {highlights.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <FlaskConical className="h-3.5 w-3.5" />
                  Benchmark Signals
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  {highlights.map((item, index) => (
                    <SignalRow
                      key={item.benchmark}
                      rank={index + 1}
                      label={item.benchmark}
                      rawLabel={item.metric !== item.benchmark ? item.metric : undefined}
                      scoreLabel={formatHighlightScore(item.score, item.unit)}
                      scorePercent={scoreToPercent(item.score, item.unit)}
                      isLast={index === highlights.length - 1}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[0.92fr_1.08fr]">
            <section className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reporting Context</div>
              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/15">
                <div className="flex items-start gap-2">
                  <Scale className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Reporting summary</div>
                    <div className="text-sm text-muted-foreground">
                      This model has reported results from {reportingSummaryLabel.toLowerCase()} across {data.benchmarks_count} benchmark{data.benchmarks_count !== 1 ? "s" : ""}.
                      {data.independent_verification_ratio > 0 && data.independent_verification_ratio < 1
                        ? ` The current record mixes self-reported and third-party benchmark results, with ${Math.round(data.independent_verification_ratio * 100)}% coming from third-party reporting.`
                        : data.independent_verification_ratio >= 1
                          ? " The current record is fully backed by third-party reporting."
                          : " The current record is self-reported."}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {data.evaluator_names.slice(0, 2).map((evaluator) => (
                        <Badge key={evaluator} variant="secondary" className="font-normal">
                          <BadgeCheck className="mr-1 h-3 w-3" />
                          {evaluator}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {highlights.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <BookOpenText className="h-3.5 w-3.5" />
                  What Was Tested
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  {highlights.map((item, index) => (
                    <SignalRow
                      key={item.benchmark}
                      rank={index + 1}
                      label={getPolicyBenchmarkLabel(item.benchmark)}
                      rawLabel={item.benchmark}
                      scoreLabel={formatHighlightScore(item.score, item.unit)}
                      scorePercent={scoreToPercent(item.score, item.unit)}
                      isLast={index === highlights.length - 1}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CompactStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: string
}) {
  return (
    <div className={`rounded-2xl px-3 py-2.5 ${tone}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">{label}</div>
      <div className="mt-1 text-base font-bold tabular-nums">{value}</div>
    </div>
  )
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-3 border-b border-border/40 py-2 last:border-b-0 last:pb-0 first:pt-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 max-w-full justify-self-end text-right font-medium leading-tight text-foreground break-words">
        {value}
      </span>
    </div>
  )
}

function SignalRow({
  rank,
  label,
  rawLabel,
  scoreLabel,
  scorePercent,
  isLast,
}: {
  rank: number
  label: string
  rawLabel?: string
  scoreLabel: string
  scorePercent: number
  isLast?: boolean
}) {
  return (
    <div className={`px-3 py-3 ${isLast ? "" : "border-b border-border/60"}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{label}</div>
              {rawLabel && <div className="truncate text-xs text-muted-foreground">{rawLabel}</div>}
            </div>
            <div className="shrink-0 text-sm font-semibold tabular-nums">{scoreLabel}</div>
          </div>
          <Progress value={scorePercent} className="mt-2 h-1.5" />
        </div>
      </div>
    </div>
  )
}
