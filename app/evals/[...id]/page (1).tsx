"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, BarChart3, Grid3X3, Search } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { EvalDetail } from "@/components/eval-detail"
import type { BenchmarkEvalSummary } from "@/lib/eval-processing"
import { fetchEvalSummary } from "@/lib/dashboard-data-client"
import { getCategoryColor } from "@/lib/benchmark-schema"

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
  if (bound === "min" && step <= 0) return "< 1B"
  if (bound === "max" && step >= maxStepIndex) return "> 500B"
  const value = PARAM_RANGE_VALUES[step]
  return value != null ? `${value}B` : "Not reported"
}

function normalizeMetadataList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (typeof value !== "string") return []

  const normalized = value.trim()
  if (!normalized) return []

  const looksDelimited = /[,;|]/.test(normalized)
  if (looksDelimited) {
    return normalized
      .split(/[,;|]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  // Treat long prose values as invalid list data rather than rendering oversized chips.
  if (normalized.length > 40 || /\s/.test(normalized)) return []

  return [normalized]
}

export default function EvalDetailPage() {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [summary, setSummary] = useState<BenchmarkEvalSummary | null>(null)
  const [subSummaries, setSubSummaries] = useState<BenchmarkEvalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [matrixSearch, setMatrixSearch] = useState("")
  const returnTo = searchParams.get("from")
  const currentDetailHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("from")
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }, [pathname, searchParams])

  const handleBack = useCallback(() => {
    if (returnTo?.startsWith("/")) {
      router.push(returnTo)
      return
    }

    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }

    router.push("/evals")
  }, [returnTo, router])

  useEffect(() => {
    const load = async () => {
      try {
        const evalId = decodeURIComponent(params.id as string)
        const found = await fetchEvalSummary(evalId)
        setSummary(found)
        document.title = `${found.evaluation_name} | Benchmark`

        // If aggregated, fetch each sub-eval for the matrix view
        if (found.is_aggregated && found.aggregate_sources?.length) {
          const subs = await Promise.all(
            found.aggregate_sources.map(async (source) => {
              try {
                return await fetchEvalSummary(source.evaluation_id)
              } catch {
                return null
              }
            })
          )
          setSubSummaries(subs.filter((s): s is BenchmarkEvalSummary => s !== null))
        }
      } catch (err) {
        console.error(err)
        setError("Evaluation not found")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [params.id])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="text-lg text-muted-foreground">Loading evaluation details...</div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center h-96 space-y-4">
            <div className="text-lg text-muted-foreground">{error ?? "Evaluation not found"}</div>
            <Button onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Evaluations
            </Button>
          </div>
        </main>
      </div>
    )
  }

  const isComposite = summary.is_aggregated && (summary.aggregate_sources?.length ?? 0) > 1

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4">
            <Button variant="ghost" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="text-center">
              <h2 className="text-xl font-medium tracking-tight text-foreground/90 md:text-2xl">
                {isComposite ? "Suite" : "Single benchmark details"}
              </h2>
            </div>
            <div />
          </div>
          <div className="flex items-center gap-3 sm:hidden">
            <Button variant="ghost" size="sm" onClick={handleBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 text-center">
              <h2 className="text-base font-medium tracking-tight text-foreground/90">
                {isComposite ? "Suite" : "Single benchmark details"}
              </h2>
            </div>
          </div>
        </div>
      </div>
      <main className="container mx-auto px-4 py-8">
        {isComposite ? (
          <CompositeEvalView
            summary={summary}
            subSummaries={subSummaries}
            matrixSearch={matrixSearch}
            onMatrixSearchChange={setMatrixSearch}
            currentDetailHref={currentDetailHref}
          />
        ) : (
          <EvalDetail summary={summary} />
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Suite view (paper §3.2 — composite reporting unit)
// ---------------------------------------------------------------------------

function CompositeEvalView({
  summary,
  subSummaries,
  matrixSearch,
  onMatrixSearchChange,
  currentDetailHref,
}: {
  summary: BenchmarkEvalSummary
  subSummaries: BenchmarkEvalSummary[]
  matrixSearch: string
  onMatrixSearchChange: (v: string) => void
  currentDetailHref: string
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px] uppercase tracking-[0.18em]">
              Suite
            </Badge>
            <Badge variant="secondary">
              {summary.aggregate_sources?.length ?? 0} metrics
            </Badge>
            <Badge variant="secondary">{summary.models_count.toLocaleString()} models</Badge>
            <Badge className={getCategoryColor(summary.category)}>
              {summary.category}
            </Badge>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {summary.evaluation_name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {summary.benchmark_card?.purpose_and_intended_users?.goal
                ?? `Suite aggregating ${summary.aggregate_sources?.length ?? 0} metrics across ${summary.models_count.toLocaleString()} models.`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Sub-Benchmarks
          </TabsTrigger>
          <TabsTrigger value="matrix" className="gap-2">
            <Grid3X3 className="h-4 w-4" />
            Score breakdown
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="mt-6">
          <SubBenchmarkCards
            sources={summary.aggregate_sources ?? []}
            subSummaries={subSummaries}
            currentDetailHref={currentDetailHref}
          />
        </TabsContent>

        <TabsContent value="matrix" className="mt-6">
          <MatrixLeaderboard
            summary={summary}
            subSummaries={subSummaries}
            search={matrixSearch}
            onSearchChange={onMatrixSearchChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-benchmark cards
// ---------------------------------------------------------------------------

function SubBenchmarkCards({
  sources,
  subSummaries,
  currentDetailHref,
}: {
  sources: NonNullable<BenchmarkEvalSummary["aggregate_sources"]>
  subSummaries: BenchmarkEvalSummary[]
  currentDetailHref: string
}) {
  const subMap = useMemo(
    () => new Map(subSummaries.map((s) => [s.evaluation_id, s])),
    [subSummaries]
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sources.map((source) => {
        const sub = subMap.get(source.evaluation_id)
        const card = sub?.benchmark_card
        const overview = card?.benchmark_details?.overview ?? sub?.metric_config?.evaluation_description
        const domains = normalizeMetadataList(card?.benchmark_details?.domains)
        const goal = card?.purpose_and_intended_users?.goal

        return (
          <Link
            key={source.evaluation_id}
            href={`/evals/${source.evaluation_id}?from=${encodeURIComponent(currentDetailHref)}`}
            className="group"
          >
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-semibold transition-colors group-hover:text-primary">
                    {card?.benchmark_details?.name ?? source.composite_benchmark_name}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {source.models_count} models
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {overview && (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {overview}
                  </p>
                )}

                {sub?.best_model && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Top: </span>
                    <span className="font-medium">{sub.best_model.name}</span>
                    <span className="ml-1 text-muted-foreground">
                      ({(sub.best_model.score * 100).toFixed(1)}%)
                    </span>
                  </div>
                )}

                {domains.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {domains.slice(0, 3).map((domain) => (
                      <span
                        key={domain}
                        className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground"
                      >
                        {domain}
                      </span>
                    ))}
                    {domains.length > 3 && (
                      <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                        +{domains.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  {sub?.category && (
                    <Badge className={`${getCategoryColor(sub.category)} text-[10px]`}>
                      {sub.category}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Matrix leaderboard (models × metrics)
// ---------------------------------------------------------------------------

function MatrixLeaderboard({
  summary,
  subSummaries,
  search,
  onSearchChange,
}: {
  summary: BenchmarkEvalSummary
  subSummaries: BenchmarkEvalSummary[]
  search: string
  onSearchChange: (v: string) => void
}) {
  const [sortCol, setSortCol] = useState<string>("avg")
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())
  const [minParamStep, setMinParamStep] = useState(0)
  const [maxParamStep, setMaxParamStep] = useState(PARAM_RANGE_VALUES.length - 1)
  const PAGE_SIZE = 50

  const metricDirection = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const sub of subSummaries) {
      map.set(sub.evaluation_name, sub.metric_config.lower_is_better)
    }
    return map
  }, [subSummaries])

  const { models, metrics } = useMemo(() => {
    const metricNames = subSummaries.map((s) => s.evaluation_name)
    const modelScores = new Map<string, { name: string; developer: string; scores: Map<string, number | null> }>()

    for (const sub of subSummaries) {
      for (const result of sub.model_results) {
        const id = result.model_info.id
        const existing = modelScores.get(id) ?? {
          name: result.model_info.name,
          developer: result.model_info.developer ?? "",
          scores: new Map<string, number | null>(),
        }
        existing.scores.set(sub.evaluation_name, result.score)
        modelScores.set(id, existing)
      }
    }

    const modelList = Array.from(modelScores.entries())
      .map(([id, data]) => {
        const validScores = Array.from(data.scores.values()).filter(
          (s): s is number => s != null && Number.isFinite(s) && s > -99
        )
        const avg = validScores.length > 0
          ? validScores.reduce((a, b) => a + b, 0) / validScores.length
          : 0
        // Parse model size from name (e.g., "70B", "8b", "1.5B", "405b")
        let sizeB: number | null = null
        const sizeMatch = (data.name + " " + id).match(/\b(\d+(?:\.\d+)?)\s*[bB]\b/)
        if (sizeMatch) sizeB = parseFloat(sizeMatch[1])

        return { id, name: data.name, developer: data.developer, avg, scores: data.scores, sizeB }
      })

    return { models: modelList, metrics: metricNames }
  }, [subSummaries])

  const visibleMetrics = useMemo(
    () => metrics.filter((m) => !hiddenCols.has(m)),
    [metrics, hiddenCols]
  )

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      if (sortCol === "name") {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      }
      const aVal = sortCol === "avg" ? a.avg : (a.scores.get(sortCol) ?? -Infinity)
      const bVal = sortCol === "avg" ? b.avg : (b.scores.get(sortCol) ?? -Infinity)
      return sortAsc ? aVal - bVal : bVal - aVal
    })
  }, [models, sortCol, sortAsc])

  const maxStepIndex = PARAM_RANGE_VALUES.length - 1
  const numericMinParams = minParamStep <= 0 ? null : (PARAM_RANGE_VALUES[minParamStep] ?? null)
  const numericMaxParams = maxParamStep >= maxStepIndex ? null : (PARAM_RANGE_VALUES[maxParamStep] ?? null)

  const query = search.trim().toLowerCase()
  const filteredModels = sortedModels.filter((m) => {
    if (query && !(
      m.name.toLowerCase().includes(query) ||
      m.developer.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query)
    )) return false
    if (numericMinParams != null && (m.sizeB == null || m.sizeB < numericMinParams)) return false
    if (numericMaxParams != null && (m.sizeB == null || m.sizeB > numericMaxParams)) return false
    return true
  })

  const pagedModels = filteredModels.slice(0, page * PAGE_SIZE)
  const hasMore = pagedModels.length < filteredModels.length

  // Color coding per column
  const metricRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>()
    for (const metric of visibleMetrics) {
      const scores = models.map((m) => m.scores.get(metric)).filter(
        (s): s is number => s != null && Number.isFinite(s) && s > -99
      )
      if (scores.length > 0) {
        ranges.set(metric, { min: Math.min(...scores), max: Math.max(...scores) })
      }
    }
    return ranges
  }, [models, visibleMetrics])

  function isValidScore(score: number | null | undefined): score is number {
    return score != null && Number.isFinite(score) && score > -99
  }

  function scoreColor(metric: string, score: number): string {
    const range = metricRanges.get(metric)
    if (!range || range.max === range.min) return ""
    const lower = metricDirection.get(metric) ?? false
    const pct = lower
      ? (range.max - score) / (range.max - range.min)
      : (score - range.min) / (range.max - range.min)
    if (pct >= 0.8) return "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200"
    if (pct >= 0.6) return "bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200"
    if (pct <= 0.2) return "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
    return ""
  }

  function formatScore(score: number): string {
    if (Math.abs(score) >= 100) return score.toFixed(1)
    if (Math.abs(score) >= 10) return score.toFixed(2)
    return score.toFixed(3).replace(/0+$/g, "").replace(/\.$/, "")
  }

  function handleSort(col: string) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(false) }
  }

  const sortIndicator = (col: string) =>
    sortCol === col ? (sortAsc ? " ▲" : " ▼") : ""

  function toggleCol(metric: string) {
    setHiddenCols((prev) => {
      const next = new Set(prev)
      if (next.has(metric)) next.delete(metric)
      else next.add(metric)
      return next
    })
  }

  if (subSummaries.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Loading sub-benchmark data for the matrix view...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search models..."
            className="pl-9"
          />
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-sm font-medium text-foreground">Parameters</span>

            <div className="min-w-0 flex-1 w-[min(92vw,300px)]">
              <div className="relative mb-1 h-4 text-[11px] text-muted-foreground">
                {PARAM_RANGE_MARKERS.map((marker) => (
                  <span
                    key={marker.label}
                    className="absolute top-0 whitespace-nowrap"
                    style={{
                      left: `${(marker.step / maxStepIndex) * 100}%`,
                      transform:
                        marker.step === 0 ? "translateX(0)"
                          : marker.step === maxStepIndex ? "translateX(-100%)"
                          : "translateX(-50%)",
                    }}
                  >
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
                      left: `${(minParamStep / maxStepIndex) * 100}%`,
                      right: `${Math.max(100 - (maxParamStep / maxStepIndex) * 100, 0)}%`,
                    }}
                  />
                </div>

                <div className="absolute inset-x-1.5 top-1/2 -translate-y-1/2">
                  {PARAM_RANGE_VALUES.map((_, stepIndex) => (
                    <span
                      key={`param-tick-${stepIndex}`}
                      className="absolute top-0 h-2 w-px -translate-x-1/2 rounded-full bg-border"
                      style={{ left: `${(stepIndex / maxStepIndex) * 100}%` }}
                      aria-hidden="true"
                    />
                  ))}
                </div>

                <input
                  type="range"
                  min={0}
                  max={maxStepIndex}
                  step={1}
                  value={minParamStep}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setMinParamStep(Math.min(v, maxParamStep))
                  }}
                  className="param-range-input"
                  aria-label="Minimum parameter filter"
                />
                <input
                  type="range"
                  min={0}
                  max={maxStepIndex}
                  step={1}
                  value={maxParamStep}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setMaxParamStep(Math.max(v, minParamStep))
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
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {filteredModels.length} models × {visibleMetrics.length} metrics
        </div>
      </div>

      {/* Column toggles */}
      <div className="flex flex-wrap gap-1.5">
        {metrics.map((metric) => (
          <button
            key={metric}
            type="button"
            onClick={() => toggleCol(metric)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              hiddenCols.has(metric)
                ? "border-border/40 bg-muted/20 text-muted-foreground/50 line-through"
                : "border-border/70 bg-background text-foreground hover:border-primary/50"
            }`}
          >
            {metric}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 48 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 90 }} />
            {visibleMetrics.map((m) => (
              <col key={m} style={{ width: 110 }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-left font-semibold">#</th>
              <th
                className="sticky left-[48px] z-10 bg-muted/30 px-3 py-2 text-left font-semibold cursor-pointer select-none hover:text-primary"
                onClick={() => handleSort("name")}
              >
                Model{sortIndicator("name")}
              </th>
              <th
                className="px-3 py-2 text-right font-semibold cursor-pointer select-none hover:text-primary"
                onClick={() => handleSort("avg")}
              >
                Avg{sortIndicator("avg")}
              </th>
              {visibleMetrics.map((metric) => (
                <th
                  key={metric}
                  className="px-3 py-2 text-right font-semibold cursor-pointer select-none hover:text-primary truncate"
                  onClick={() => handleSort(metric)}
                  title={metric}
                >
                  {metric}{sortIndicator(metric)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedModels.map((model, idx) => (
              <tr key={model.id} className="border-b hover:bg-muted/20 transition-colors">
                <td className="sticky left-0 z-10 bg-background px-3 py-2 text-muted-foreground tabular-nums">
                  {idx + 1}
                </td>
                <td className="sticky left-[48px] z-10 bg-background px-3 py-2">
                  <div className="font-medium truncate">{model.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{model.developer}</div>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatScore(model.avg)}
                </td>
                {visibleMetrics.map((metric) => {
                  const score = model.scores.get(metric)
                  const valid = isValidScore(score)
                  return (
                    <td
                      key={metric}
                      className={`px-3 py-2 text-right tabular-nums ${valid ? scoreColor(metric, score) : "text-muted-foreground"}`}
                    >
                      {valid ? formatScore(score) : "—"}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
            Load more ({filteredModels.length - pagedModels.length} remaining)
          </Button>
        </div>
      )}
    </div>
  )
}
