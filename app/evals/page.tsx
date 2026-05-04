"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Search, Tag } from "lucide-react"

import { FamilyTable } from "@/components/family-table"
import { InfiniteScrollSentinel } from "@/components/infinite-scroll"
import { Navigation } from "@/components/navigation"
import type { EvalHierarchy, HierarchyFamily } from "@/lib/backend-artifacts"
import { fetchBenchmarkMetadata, fetchEvalHierarchy, fetchEvalList } from "@/lib/dashboard-data-client"
import type { BenchmarkEvalListItem } from "@/lib/eval-processing"
import type { BenchmarkCard } from "@/lib/benchmark-schema"

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
  const [evalItems, setEvalItems] = useState<Map<string, BenchmarkEvalListItem>>(new Map())
  const [benchmarkCards, setBenchmarkCards] = useState<Record<string, BenchmarkCard>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<FamilySort>("results")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [domainPanelOpen, setDomainPanelOpen] = useState(false)
  const [domainFilter, setDomainFilter] = useState<Set<string>>(new Set())
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const deferredSearchQuery = useDeferredValue(searchQuery)

  useEffect(() => {
    Promise.all([fetchEvalHierarchy(), fetchEvalList(), fetchBenchmarkMetadata()])
      .then(([h, list, metadata]) => {
        setHierarchy(h)
        setTotalModels(list.totalModels)
        const map = new Map<string, BenchmarkEvalListItem>()
        for (const item of list.evals) map.set(item.evaluation_id, item)
        setEvalItems(map)
        setBenchmarkCards(metadata)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const families = hierarchy?.families ?? []

  // Build a domain → family-count map. The lite eval list doesn't carry
  // benchmark cards, so we read domains from `benchmark-metadata.json`
  // (keyed by benchmark / leaf / family key). For each family we union
  // the domains across the family key itself and every leaf key, then
  // count one bump per family per distinct domain.
  const familyDomains = useMemo(() => {
    const out = new Map<string, Set<string>>()
    const lookupDomains = (key: string | null | undefined): string[] => {
      if (!key) return []
      const card = benchmarkCards[key]
      const domains = card?.benchmark_details?.domains
      return Array.isArray(domains) ? domains : []
    }
    for (const fam of families) {
      const seen = new Set<string>()
      // Family-level fallback first (cards keyed by family slug).
      for (const d of lookupDomains(fam.key)) seen.add(d.trim().toLowerCase())

      // v2 primary path: walk every nested benchmark across composites,
      // standalone benchmarks, and any family-level benchmarks array.
      const nestedBenchmarks = [
        ...(fam.standalone_benchmarks ?? []),
        ...(fam.benchmarks ?? []),
        ...(fam.composites ?? []).flatMap((c) => c.benchmarks ?? []),
      ]
      for (const benchmark of nestedBenchmarks) {
        for (const d of benchmark.tags?.domains ?? []) seen.add(d.trim().toLowerCase())
        for (const d of lookupDomains(benchmark.key)) seen.add(d.trim().toLowerCase())
        for (const id of benchmark.summary_eval_ids ?? []) {
          for (const d of lookupDomains(id)) seen.add(d.trim().toLowerCase())
        }
      }

      // Legacy fallback: per-leaf tags + cards keyed by leaf slug.
      for (const leaf of fam.leaves ?? []) {
        for (const d of leaf.tags?.domains ?? []) seen.add(d.trim().toLowerCase())
        for (const d of lookupDomains(leaf.key)) seen.add(d.trim().toLowerCase())
      }

      // Family-level eval_summary_ids cover both shapes.
      for (const id of fam.eval_summary_ids ?? []) {
        for (const d of lookupDomains(id)) seen.add(d.trim().toLowerCase())
      }
      seen.delete("")
      out.set(fam.key, seen)
    }
    return out
  }, [families, benchmarkCards])

  // Domain → display label (from the first non-empty card occurrence) +
  // count of families touching that domain. Sorted descending by count.
  const domainCounts = useMemo(() => {
    const counts = new Map<string, number>()
    const labels = new Map<string, string>()
    const recordLabel = (raw: string) => {
      const key = raw.trim().toLowerCase()
      if (!key || labels.has(key)) return
      labels.set(key, raw.trim())
    }
    for (const card of Object.values(benchmarkCards)) {
      for (const d of card?.benchmark_details?.domains ?? []) recordLabel(d)
    }
    for (const fam of families) {
      const nestedBenchmarks = [
        ...(fam.standalone_benchmarks ?? []),
        ...(fam.benchmarks ?? []),
        ...(fam.composites ?? []).flatMap((c) => c.benchmarks ?? []),
      ]
      for (const benchmark of nestedBenchmarks) {
        for (const d of benchmark.tags?.domains ?? []) recordLabel(d)
      }
      for (const leaf of fam.leaves ?? []) {
        for (const d of leaf.tags?.domains ?? []) recordLabel(d)
      }
    }
    for (const set of familyDomains.values()) {
      for (const key of set) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({ domain: labels.get(key) ?? key, count, key }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
  }, [familyDomains, families, benchmarkCards])

  const toggleDomain = useCallback((domain: string) => {
    setDomainFilter((current) => {
      const next = new Set(current)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }, [])

  const clearDomainFilter = useCallback(() => setDomainFilter(new Set()), [])

  // Categories present on the family list — drives the pill selector
  // below the toolbar. Sort them by descending family count so the most
  // common ones surface first.
  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const fam of families) {
      const cat = fam.category ?? "General"
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category]) => category)
  }, [families])

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

    if (selectedCategories.length > 0) {
      const set = new Set(selectedCategories)
      list = list.filter((fam) => set.has(fam.category ?? "General"))
    }

    if (domainFilter.size > 0) {
      list = list.filter((fam) => {
        const set = familyDomains.get(fam.key)
        if (!set) return false
        for (const key of set) if (domainFilter.has(key)) return true
        return false
      })
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
  }, [families, deferredSearchQuery, sortBy, domainFilter, selectedCategories, familyDomains])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [deferredSearchQuery, sortBy, domainFilter, selectedCategories])

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
          metrics.
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
              <span className="ec-page-meta-item-l">Composites</span>
              <span className="ec-page-meta-item-v">
                {stats.composite_count.toLocaleString()}
              </span>
            </div>
            <div className="ec-page-meta-item">
              <span className="ec-page-meta-item-l">Single benchmarks</span>
              <span className="ec-page-meta-item-v">
                {(
                  stats.benchmark_count ??
                  (stats.single_benchmark_count ?? 0) +
                    (stats.standalone_benchmark_count ?? 0)
                ).toLocaleString()}
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

          {domainCounts.length > 0 && (
            <button
              type="button"
              onClick={() => setDomainPanelOpen((v) => !v)}
              className="inline-flex items-center gap-2"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "6px 12px",
                border: "1px solid var(--border-strong)",
                background:
                  domainPanelOpen || domainFilter.size > 0 ? "var(--fg)" : "var(--bg)",
                color:
                  domainPanelOpen || domainFilter.size > 0 ? "var(--bg)" : "var(--fg)",
                cursor: "pointer",
              }}
              aria-expanded={domainPanelOpen}
            >
              <Tag className="h-3 w-3" aria-hidden />
              Filter by domain
              {domainFilter.size > 0 && (
                <span className="font-mono tabular-nums" style={{ marginLeft: 2 }}>
                  · {domainFilter.size}
                </span>
              )}
              {domainPanelOpen ? (
                <ChevronUp className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronDown className="h-3 w-3" aria-hidden />
              )}
            </button>
          )}

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

        {/* DOMAIN FILTER PANEL — collapsed by default, opens when the user
            wants to slice the family list by topical domain. Picks unfurl
            every aggregator family in the table below so matching
            benchmarks are immediately visible. */}
        {domainPanelOpen && domainCounts.length > 0 && (
          <div
            className="mb-6"
            style={{
              border: "1px solid var(--border-soft)",
              background: "var(--bg-warm)",
              padding: "12px 16px",
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div
                className="font-mono uppercase"
                style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
              >
                {domainFilter.size === 0
                  ? `Pick one or more domains · ${domainCounts.length} available`
                  : `${domainFilter.size} selected · ${domainCounts.length - domainFilter.size} more`}
              </div>
              {domainFilter.size > 0 && (
                <button
                  type="button"
                  onClick={clearDomainFilter}
                  className="font-mono uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    color: "var(--fg-subtle)",
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {domainCounts.map(({ domain, count }) => {
                const key = domain.trim().toLowerCase()
                const selected = domainFilter.has(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDomain(key)}
                    className="ec-tag outline inline-flex items-center gap-1.5"
                    style={{
                      cursor: "pointer",
                      background: selected ? "var(--fg)" : "var(--bg)",
                      color: selected ? "var(--bg)" : "var(--fg)",
                      borderColor: selected ? "var(--fg)" : "var(--border-strong)",
                      textTransform: "none",
                      letterSpacing: "normal",
                      fontFamily: "var(--font-sans)",
                    }}
                    aria-pressed={selected}
                  >
                    <span className="text-[12px] font-medium capitalize">{domain}</span>
                    <span
                      className="font-mono text-[10px] tabular-nums"
                      style={{ color: selected ? "var(--bg)" : "var(--fg-muted)" }}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* CATEGORY PILLS — quick toggle filter by category. Mirrors the
            same pattern used on benchmark-detail's matrix browser. */}
        {availableCategories.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="kicker mr-2">Category</span>
            <button
              type="button"
              onClick={() => setSelectedCategories([])}
              className={`ec-pill ${selectedCategories.length === 0 ? "on" : ""}`}
            >
              All
            </button>
            {availableCategories.map((category) => {
              const isSelected = selectedCategories.includes(category)
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() =>
                    setSelectedCategories((current) =>
                      current.includes(category)
                        ? current.filter((item) => item !== category)
                        : [...current, category],
                    )
                  }
                  className={`ec-pill ${isSelected ? "on" : ""}`}
                >
                  {category}
                </button>
              )
            })}
          </div>
        )}

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
          <FamilyTable
            families={visibleFamilies}
            totalModels={totalModels}
            evalItems={evalItems}
            benchmarkCards={benchmarkCards}
            domainFilter={domainFilter}
          />
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
