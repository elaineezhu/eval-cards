"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Search } from "lucide-react"

import { type BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { InfiniteScrollSentinel } from "@/components/infinite-scroll"
import { ModelTable } from "@/components/model-table"
import { Navigation } from "@/components/navigation"
import type { BenchmarkCard } from "@/lib/benchmark-schema"
import { lookupBenchmarkCard } from "@/lib/benchmark-metadata-utils"
import { fetchDeveloperSummary, fetchBenchmarkMetadata } from "@/lib/dashboard-data-client"

const PAGE_SIZE = 40

type ModelSort = "date" | "name" | "benchmarks" | "results"

export default function DeveloperDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [developer, setDeveloper] = useState<string>("")
  const [models, setModels] = useState<BenchmarkEvaluationCardData[]>([])
  const [benchmarkCards, setBenchmarkCards] = useState<Record<string, BenchmarkCard>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<ModelSort>("date")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])

  const routeId = params.id as string

  const handleBack = useCallback(() => {
    router.push("/models?view=developers")
  }, [router])

  useEffect(() => {
    Promise.all([
      fetchDeveloperSummary(routeId),
      fetchBenchmarkMetadata(),
    ])
      .then(([summary, cards]) => {
        setDeveloper(summary.developer)
        setModels(summary.models)
        setBenchmarkCards(cards)
      })
      .catch((err) => {
        console.error(err)
        setError("Developer not found")
      })
      .finally(() => setLoading(false))
  }, [routeId])

  const totalBenchmarks = useMemo(() => Object.keys(benchmarkCards).length, [benchmarkCards])

  const totalResults = useMemo(
    () => models.reduce((sum, model) => sum + model.evaluations_count, 0),
    [models]
  )

  // Collect unique domains from benchmarks this developer's models are evaluated on
  const domainCoverage = useMemo(() => {
    const domainMap = new Map<string, Set<string>>()
    for (const model of models) {
      for (const { benchmark } of model.top_scores) {
        const card = lookupBenchmarkCard(benchmarkCards, benchmark)
        for (const domain of card?.benchmark_details?.domains ?? []) {
          const existing = domainMap.get(domain) ?? new Set()
          existing.add(benchmark)
          domainMap.set(domain, existing)
        }
      }
    }
    return Array.from(domainMap.entries())
      .map(([domain, benchmarks]) => ({ domain, count: benchmarks.size }))
      .sort((a, b) => b.count - a.count)
  }, [models, benchmarkCards])

  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = query
      ? models.filter((model) => {
          const haystacks = [
            model.model_name,
            model.canonical_model_name,
            model.developer,
            ...model.top_scores.map((score) => score.benchmark),
          ]
          return haystacks.some((value) => value?.toLowerCase().includes(query))
        })
      : [...models]

    switch (sortBy) {
      case "date":
        filtered.sort(
          (a, b) =>
            new Date(b.latest_timestamp).getTime() -
            new Date(a.latest_timestamp).getTime()
        )
        break
      case "name":
        filtered.sort((a, b) => a.model_name.localeCompare(b.model_name))
        break
      case "benchmarks":
        filtered.sort((a, b) => b.benchmarks_count - a.benchmarks_count)
        break
      case "results":
        filtered.sort((a, b) => b.evaluations_count - a.evaluations_count)
        break
    }

    return filtered
  }, [models, searchQuery, sortBy])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchQuery, sortBy])

  const visibleModels = useMemo(
    () => filteredModels.slice(0, visibleCount),
    [filteredModels, visibleCount]
  )
  const hasMore = visibleCount < filteredModels.length
  const handleLoadMore = useCallback(() => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredModels.length))
  }, [filteredModels.length])

  const toggleModelSelection = useCallback((id: string) => {
    setSelectedModelIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]
    )
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="ec-page">
          <div className="flex h-96 items-center justify-center">
            <div className="kicker">Loading developer…</div>
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="ec-page">
          <div className="flex flex-col items-center justify-center h-96 space-y-4">
            <div className="kicker">{error}</div>
            <button type="button" onClick={handleBack} className="btn-ec outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto w-full max-w-[96rem] px-4 pt-12 pb-24 sm:px-8">
        {/* BREADCRUMB ----------------------------------------------- */}
        <button
          type="button"
          onClick={handleBack}
          className="ec-crumb mb-4 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-3 w-3" />
          Developers
        </button>

        {/* HEADER --------------------------------------------------- */}
        <div className="kicker">Developer</div>
        <h1 className="ec-page-h1">{developer}</h1>
        <p className="ec-page-lede">
          Evaluation coverage across{" "}
          <span className="font-mono text-[13px]">{models.length}</span>{" "}
          {models.length === 1 ? "model" : "models"} from this developer
          {totalBenchmarks > 0 && (
            <>
              {" "}— a slice of the{" "}
              <span className="font-mono text-[13px]">{totalBenchmarks.toLocaleString()}-benchmark</span>{" "}
              registry
            </>
          )}
          .
        </p>

        {/* META + FILTER BAR — single row -------------------------- */}
        <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-[color:var(--border-soft)] py-4">
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.1em] uppercase text-[color:var(--fg-subtle)]">
            <span>
              <span className="text-[color:var(--fg)] tabular-nums font-semibold mr-1">
                {filteredModels.length.toLocaleString()}
              </span>
              {filteredModels.length === 1 ? "model" : "models"}
            </span>
            <span>
              · <span className="text-[color:var(--fg)] tabular-nums font-semibold mr-1">{totalResults.toLocaleString()}</span>
              results
            </span>
            {domainCoverage.length > 0 && (
              <span>
                · <span className="text-[color:var(--fg)] tabular-nums font-semibold mr-1">{domainCoverage.length}</span>
                domains
              </span>
            )}
          </div>

          <span className="hidden h-5 w-px bg-[color:var(--border-soft)] sm:block" />

          <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--fg-subtle)]" />
            <input
              className="ec-input pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search models or benchmarks…"
            />
          </div>

          <select
            className="ec-select ml-auto shrink-0"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as ModelSort)}
          >
            <option value="date">Sort · Latest first</option>
            <option value="benchmarks">Sort · Benchmarks</option>
            <option value="results">Sort · Reported results</option>
            <option value="name">Sort · Name (A–Z)</option>
          </select>
        </div>

        {/* DOMAIN COVERAGE — hairline tag row ---------------------- */}
        {domainCoverage.length > 0 && (
          <div className="mb-8">
            <div className="kicker mb-3">Benchmark domain coverage</div>
            <div className="flex flex-wrap gap-1.5">
              {domainCoverage.map(({ domain, count }) => (
                <span
                  key={domain}
                  className="ec-tag outline"
                  style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)" }}
                >
                  <span className="text-[12px] font-medium text-[color:var(--fg)] capitalize">{domain}</span>
                  <span className="font-mono text-[10px] tabular-nums text-[color:var(--fg-muted)]">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* TABLE ---------------------------------------------------- */}
        {filteredModels.length === 0 ? (
          <div className="border border-dashed border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] py-12 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--fg-subtle)]">
            No models match the current filters
          </div>
        ) : (
          <ModelTable
            rows={visibleModels}
            totalBenchmarks={totalBenchmarks}
            selectedIds={selectedModelIds}
            onToggleSelect={toggleModelSelection}
            maxCompare={4}
          />
        )}

        <InfiniteScrollSentinel
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          loadingLabel="Loading more…"
          endLabel={`Showing ${Math.min(visibleCount, filteredModels.length).toLocaleString()} of ${filteredModels.length.toLocaleString()} models`}
        />
      </main>
    </div>
  )
}
