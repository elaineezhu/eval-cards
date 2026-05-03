"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"

import { FamilyTable } from "@/components/family-table"
import { InfiniteScrollSentinel } from "@/components/infinite-scroll"
import { Navigation } from "@/components/navigation"
import type { EvalHierarchy, HierarchyFamily } from "@/lib/backend-artifacts"
import { fetchEvalHierarchy, fetchEvalList } from "@/lib/dashboard-data-client"

const PAGE_SIZE = 60

type FamilySort = "results" | "benchmarks" | "name" | "category"

function familyEvalsCount(fam: HierarchyFamily): number {
  if (fam.evals_count != null) return fam.evals_count

  const composites = fam.composites ?? []
  const standalone = fam.standalone_benchmarks ?? []
  const benchmarks = fam.benchmarks ?? []
  const leaves = fam.leaves ?? []

  const allBenchmarks = [
    ...standalone,
    ...benchmarks,
    ...composites.flatMap((c) => c.benchmarks ?? []),
  ]

  return (
    (fam.metrics?.length ?? 0) +
    allBenchmarks.reduce(
      (sum, b) => sum + ((b as { metrics?: unknown[] }).metrics?.length ?? 0),
      0,
    ) +
    leaves.reduce((sum, l) => sum + (l.evals_count ?? 0), 0)
  )
}

function familyBenchmarkCount(fam: HierarchyFamily): number {
  const composites = fam.composites ?? []
  const standalone = fam.standalone_benchmarks ?? []
  const benchmarks = fam.benchmarks ?? []
  const leaves = fam.leaves ?? []

  const all = [
    ...standalone,
    ...benchmarks,
    ...composites.flatMap((c) => c.benchmarks ?? []),
  ]
  return all.length > 0 ? all.length : leaves.length
}

export default function EvalsPage() {
  const [hierarchy, setHierarchy] = useState<EvalHierarchy | null>(null)
  const [totalModels, setTotalModels] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<FamilySort>("results")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const deferredSearchQuery = useDeferredValue(searchQuery)

  useEffect(() => {
    Promise.all([fetchEvalHierarchy(), fetchEvalList()])
      .then(([h, list]) => {
        setHierarchy(h)
        setTotalModels(list.totalModels)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const families = hierarchy?.families ?? []

  const filteredFamilies = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()
    let list = families

    if (query) {
      list = list.filter(
        (fam) =>
          fam.display_name.toLowerCase().includes(query) ||
          fam.key.toLowerCase().includes(query) ||
          fam.category?.toLowerCase().includes(query),
      )
    }

    return list.slice().sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.display_name.localeCompare(b.display_name)
        case "category":
          return (a.category ?? "").localeCompare(b.category ?? "")
        case "benchmarks":
          return familyBenchmarkCount(b) - familyBenchmarkCount(a)
        case "results":
        default:
          return familyEvalsCount(b) - familyEvalsCount(a)
      }
    })
  }, [families, deferredSearchQuery, sortBy])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [deferredSearchQuery, sortBy])

  const visibleFamilies = useMemo(
    () => filteredFamilies.slice(0, visibleCount),
    [filteredFamilies, visibleCount],
  )
  const hasMore = visibleCount < filteredFamilies.length
  const handleLoadMore = useCallback(() => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredFamilies.length))
  }, [filteredFamilies.length])

  const stats = hierarchy?.stats

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto w-full max-w-[96rem] px-4 pt-12 pb-24 sm:px-8">
        {/* HEADER --------------------------------------------------- */}
        <div className="kicker">Index</div>
        <h1 className="ec-page-h1">Evaluations</h1>
        <p className="ec-page-lede">
          Evaluations are grouped into <strong>families</strong>. A family holds one or more
          benchmarks; each benchmark has one or more slices; each slice reports one or more
          metrics. Metrics are not commensurable across rows — compare within a cell, not
          across cells.
        </p>

        {/* META ROW ------------------------------------------------- */}
        {stats && (
          <div className="ec-page-meta mb-8">
            <div className="ec-page-meta-item">
              <span className="ec-page-meta-item-l">Families</span>
              <span className="ec-page-meta-item-v">
                {stats.family_count.toLocaleString()}
              </span>
            </div>
            <div className="ec-page-meta-item">
              <span className="ec-page-meta-item-l">Suites</span>
              <span className="ec-page-meta-item-v">
                {stats.composite_count.toLocaleString()}
              </span>
            </div>
            <div className="ec-page-meta-item">
              <span className="ec-page-meta-item-l">Single benchmarks</span>
              <span className="ec-page-meta-item-v">
                {(stats.single_benchmark_count + stats.standalone_benchmark_count).toLocaleString()}
              </span>
            </div>
            <div className="ec-page-meta-item">
              <span className="ec-page-meta-item-l">Slices</span>
              <span className="ec-page-meta-item-v">
                {stats.slice_count.toLocaleString()}
              </span>
            </div>
            <div className="ec-page-meta-item">
              <span className="ec-page-meta-item-l">Metrics</span>
              <span className="ec-page-meta-item-v">
                {stats.metric_count.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* FILTER BAR ----------------------------------------------- */}
        <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-[color:var(--border-soft)] pb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--fg-subtle)]" />
            <input
              className="ec-input pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search family, category…"
            />
          </div>

          <div className="grow" />

          <select
            className="ec-select"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as FamilySort)}
          >
            <option value="results">Sort · Reported results</option>
            <option value="benchmarks">Sort · Benchmarks</option>
            <option value="name">Sort · Name</option>
            <option value="category">Sort · Category</option>
          </select>
        </div>

        {/* TABLE ---------------------------------------------------- */}
        {loading ? (
          <div className="py-24 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--fg-subtle)]">
            Loading…
          </div>
        ) : filteredFamilies.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-[color:var(--border-soft)] bg-[color:var(--bg-warm)]">
            <p className="mb-4 text-base text-[color:var(--fg-muted)]">
              No families found matching your filters.
            </p>
            <button
              type="button"
              className="btn-ec outline"
              onClick={() => {
                setSearchQuery("")
                setSortBy("results")
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <FamilyTable families={visibleFamilies} totalModels={totalModels} />
        )}

        <InfiniteScrollSentinel
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          loadingLabel="Loading more…"
          endLabel={`Showing ${Math.min(visibleCount, filteredFamilies.length).toLocaleString()} of ${filteredFamilies.length.toLocaleString()} families`}
        />
      </main>
    </div>
  )
}
