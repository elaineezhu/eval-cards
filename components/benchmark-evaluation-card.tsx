"use client"

import type { CSSProperties } from "react"
import { useMemo } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { useRouter } from "next/navigation"
import {
  Award,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  Eye,
  FlaskConical,
  LibraryBig,
  MoreHorizontal,
  ShieldCheck,
  TriangleAlert,
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

function getReportingSummaryLabel(data: BenchmarkEvaluationCardData) {
  if (data.evaluator_count > 0) {
    return `${data.evaluator_count} reporting org${data.evaluator_count !== 1 ? "s" : ""}`
  }

  if (data.latest_source_name) {
    return data.latest_source_name
  }

  return "Aggregated reporting view"
}

function getReproducibilitySummary(data: BenchmarkEvaluationCardData) {
  switch (data.reproducibility_status) {
    case "complete":
      return {
        label: "Full config coverage",
        tone: "secondary" as const,
        icon: CheckCircle2,
      }
    case "partial":
      return {
        label: "Partial config coverage",
        tone: "outline" as const,
        icon: FlaskConical,
      }
    default:
      return {
        label: "Config mostly missing",
        tone: "destructive" as const,
        icon: TriangleAlert,
      }
  }
}

function getIndependentSummary(data: BenchmarkEvaluationCardData) {
  const percent = Math.round(data.independent_verification_ratio * 100)

  if (data.independent_verification_ratio >= 0.75) {
    return `${percent}% independent`
  }

  if (data.independent_verification_ratio > 0) {
    return `${percent}% independent`
  }

  return "Self-reported only"
}

const CATEGORY_PLOT_COLORS: Record<string, string> = {
  "Core Performance": "#2563eb",
  "Core Quality Dimensions": "#7c3aed",
  "Robustness": "#0f766e",
  "Calibration": "#0891b2",
  "Adversarial": "#dc2626",
  "Memorization": "#9333ea",
  "Fairness": "#ea580c",
  "Safety": "#16a34a",
  "Leakage/Contamination": "#be123c",
  "Privacy": "#0d9488",
  "Interpretability": "#6366f1",
  "Efficiency": "#ca8a04",
  "Retrainability": "#1d4ed8",
  "Meta-Learning": "#9333ea",
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
  const library = data.eval_libraries[0]
  const paramsBillions = formatParamsBillions(data.params_billions)
  const reportingSummaryLabel = getReportingSummaryLabel(data)
  const reproducibility = getReproducibilitySummary(data)
  const independentSummary = getIndependentSummary(data)

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
              <Badge variant={reproducibility.tone}>
                <reproducibility.icon className="h-3.5 w-3.5" />
                {reproducibility.label}
              </Badge>
              <Badge variant={data.independent_verification_ratio > 0 ? "secondary" : "outline"}>
                <ShieldCheck className="h-3.5 w-3.5" />
                {independentSummary}
              </Badge>
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
              <div className="text-lg font-semibold tabular-nums text-foreground">{data.evaluator_count}</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">reporting orgs</div>
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
                  {isResearchView ? "Methodology & provenance details" : "Reporting & accountability details"}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent onClick={(event) => event.stopPropagation()} className="border-t border-border/60 px-4 py-4">
            <div className="space-y-0 text-sm">
              {isResearchView ? (
                <>
                  <KeyValueRow label="Reporting sources" value={reportingSummaryLabel} />
                  {library && (
                    <KeyValueRow label="Library" value={`${library.name}${library.version ? ` ${library.version}` : ""}`} />
                  )}
                  {data.latest_source_name && (
                    <KeyValueRow label="Latest report" value={data.latest_source_name} />
                  )}
                  <KeyValueRow label="Updated" value={formatDate(data.latest_timestamp)} />
                  <KeyValueRow label="Reproducibility" value={reproducibility.label} />
                  <KeyValueRow label="Independence" value={independentSummary} />
                  {data.source_types.length > 0 && (
                    <KeyValueRow label="Source types" value={data.source_types.map((s) => s.replace(/_/g, " ")).join(", ")} />
                  )}
                  {data.architecture && <KeyValueRow label="Architecture" value={data.architecture} />}
                  {data.missing_generation_config_count > 0 && (
                    <KeyValueRow label="Missing config" value={`${data.missing_generation_config_count} result${data.missing_generation_config_count !== 1 ? "s" : ""}`} />
                  )}
                  {library?.fork && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                      <LibraryBig className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
                      <span>Non-standard eval library fork</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <KeyValueRow label="Who reported" value={reportingSummaryLabel} />
                  <KeyValueRow label="Independence" value={independentSummary} />
                  <KeyValueRow label="Reproducibility" value={reproducibility.label} />
                  {data.latest_source_name && (
                    <KeyValueRow label="Latest source" value={data.latest_source_name} />
                  )}
                  <KeyValueRow label="Updated" value={formatDate(data.latest_timestamp)} />
                  {data.source_types.length > 0 && (
                    <KeyValueRow label="Evidence types" value={data.source_types.map((s) => s.replace(/_/g, " ")).join(", ")} />
                  )}
                  {data.missing_generation_config_count > 0 && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                      <LibraryBig className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
                      <span>{data.missing_generation_config_count} result{data.missing_generation_config_count !== 1 ? "s" : ""} lack documented generation settings — comparisons should be read with care.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
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
