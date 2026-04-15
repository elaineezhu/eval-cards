"use client"

import type { CSSProperties } from "react"
import { useMemo } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { useRouter } from "next/navigation"
import {
  Award,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  MoreHorizontal,
} from "lucide-react"

import type { CategoryType } from "@/lib/benchmark-schema"
import { getCategoryColor } from "@/lib/benchmark-schema"
import type { BenchmarkCard } from "@/lib/benchmark-schema"
import { lookupBenchmarkCard } from "@/lib/benchmark-metadata-utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

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
  benchmark_names?: string[]
  score_summary?: {
    count: number
    min: number
    max: number
    average: number | null
  }

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
  benchmarkCards?: Record<string, BenchmarkCard>
  onDelete?: (id: string) => void
  delayMs?: number
  selectedForCompare?: boolean
  onToggleCompare?: (id: string) => void
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

function formatParamsBillions(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null
  if (value >= 100) return `${Math.round(value)}B`
  return `${value.toFixed(1)}B`
}

function formatScoreValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  if (value >= 0 && value <= 1) {
    return `${(value * 100).toFixed(1)}%`
  }

  if (Math.abs(value) >= 100) {
    return value.toFixed(0)
  }

  return value.toFixed(2)
}

function getCoverageSummaryLabel(data: BenchmarkEvaluationCardData) {
  if (data.benchmarks_count > 0) {
    return `${data.benchmarks_count} benchmark suite${data.benchmarks_count === 1 ? "" : "s"} surfaced`
  }

  if (data.latest_source_name) {
    return data.latest_source_name
  }

  return "Coverage summary"
}

function getTopBenchmarks(data: BenchmarkEvaluationCardData) {
  const surfaced = Array.from(new Set(data.top_scores.map((score) => score.benchmark)))
  if (surfaced.length > 0) {
    return surfaced
  }

  if (data.benchmark_names?.length) {
    return Array.from(new Set(data.benchmark_names))
  }

  return []
}

const CATEGORY_PLOT_COLORS: Record<string, string> = {
  "General": "#2563eb",
  "Reasoning": "#7c3aed",
  "Agentic": "#ea580c",
  "Safety": "#16a34a",
  "Knowledge": "#0f766e",
}

function getCategoryPlotColor(category: string) {
  return CATEGORY_PLOT_COLORS[category] ?? "#64748b"
}

function CategoryCoveragePlot({
  coverage,
}: {
  coverage: Array<{ category: CategoryType; count: number }>
}) {
  if (coverage.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">
        No category coverage recorded.
      </div>
    )
  }

  const totalCount = coverage.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="space-y-2">
      <div
        className="flex h-3 w-full items-stretch gap-1 rounded-full bg-muted/70"
        aria-label="Category coverage distribution"
        role="img"
      >
        {coverage.map((item) => (
          <div
            key={item.category}
            className="min-w-2 rounded-full"
            style={{
              width: `${(item.count / totalCount) * 100}%`,
              backgroundColor: getCategoryPlotColor(item.category),
            }}
            title={`${item.category}: ${item.count} benchmark${item.count !== 1 ? "s" : ""}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {coverage.slice(0, 4).map((item) => (
          <span
            key={item.category}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getCategoryColor(item.category)}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: getCategoryPlotColor(item.category) }}
            />
            {item.category}
            <span className="opacity-70">{item.count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function BenchmarkEvaluationCard({
  data,
  benchmarkCards,
  onDelete,
  delayMs = 0,
  selectedForCompare = false,
  onToggleCompare,
}: BenchmarkEvaluationCardProps) {
  const router = useRouter()
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"

  // Collect unique domains from this model's benchmarks using metadata cards
  const modelDomains = useMemo(() => {
    if (!benchmarkCards) return []
    const domainCounts = new Map<string, number>()
    for (const { benchmark } of data.top_scores) {
      const card = lookupBenchmarkCard(benchmarkCards, benchmark)
      for (const domain of card?.benchmark_details?.domains ?? []) {
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)
      }
    }
    return Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([domain]) => domain)
  }, [benchmarkCards, data.top_scores])
  const categoryCoverage = useMemo(
    () =>
      Object.entries(data.category_stats)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([category, count]) => ({
          category: category as CategoryType,
          count,
        })),
    [data.category_stats]
  )
  const paramsBillions = formatParamsBillions(data.params_billions)
  const coverageSummaryLabel = getCoverageSummaryLabel(data)
  const topBenchmarks = getTopBenchmarks(data)
  const scoreRange = [formatScoreValue(data.score_summary?.min), formatScoreValue(data.score_summary?.max)]
    .filter((value): value is string => Boolean(value))
    .join(" to ")

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
            <span className="max-w-[13rem] truncate">{coverageSummaryLabel}</span>
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
              <Badge variant="outline">{data.benchmarks_count} benchmark suites</Badge>
              <Badge variant="outline">{data.evaluations_count} reported results</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onToggleCompare ? (
              <Button
                variant={selectedForCompare ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleCompare(data.id)
                }}
              >
                {selectedForCompare ? "Selected" : "Compare"}
              </Button>
            ) : null}

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
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Category coverage
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {categoryCoverage.length} {categoryCoverage.length === 1 ? "category" : "categories"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums text-foreground">{data.evaluations_count}</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">reported results</div>
            </div>
          </div>

          <div className="mt-3">
            <CategoryCoveragePlot coverage={categoryCoverage} />
          </div>
        </div>

        {modelDomains.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Top domain coverage
            </div>
            <div className="flex flex-wrap gap-1.5">
            {modelDomains.slice(0, 5).map((domain) => (
              <span
                key={domain}
                className="inline-flex items-center rounded-full border border-border/50 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground"
              >
                {domain}
              </span>
            ))}
            {modelDomains.length > 5 && (
              <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                +{modelDomains.length - 5} more
              </span>
            )}
            </div>
          </div>
        )}

        {topBenchmarks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Covered benchmarks
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topBenchmarks.slice(0, 6).map((benchmark) => (
                <span
                  key={benchmark}
                  className="inline-flex items-center rounded-full border border-border/50 bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground/85"
                >
                  {benchmark}
                </span>
              ))}
              {topBenchmarks.length > 6 && (
                <span className="inline-flex items-center rounded-full border border-dashed border-border/50 bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  See the full list in details
                </span>
              )}
            </div>
          </div>
        )}

        <Collapsible className="rounded-2xl border border-border/70 bg-background">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Dive Deeper
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {isResearchView ? "Coverage and score summary" : "Coverage and benchmark context"}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent onClick={(event) => event.stopPropagation()} className="border-t border-border/60 px-4 py-4">
            <div className="space-y-0 text-sm">
              <KeyValueRow label={isResearchView ? "Coverage" : "Benchmark coverage"} value={coverageSummaryLabel} />
              {topBenchmarks.length > 0 && (
                <KeyValueRow label="Benchmarks" value={topBenchmarks.slice(0, 6).join(", ")} />
              )}
              {scoreRange && <KeyValueRow label="Score span" value={scoreRange} />}
              <KeyValueRow label="Updated" value={formatDate(data.latest_timestamp)} />
              {data.architecture && <KeyValueRow label="Architecture" value={data.architecture} />}
              {data.source_types.length > 0 && (
                <KeyValueRow label="Artifact type" value={data.source_types.map((s) => s.replace(/_/g, " ")).join(", ")} />
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Full record
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Open for the full benchmark list, provenance, and comparison detail.
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={(event) => {
              event.stopPropagation()
              router.push(`/models/${data.route_id}`)
            }}
          >
            Open card
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
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
