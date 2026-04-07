"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search, X } from "lucide-react"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { ListPagination } from "@/components/list-pagination"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { Input } from "@/components/ui/input"
import type { BenchmarkCard, CategoryType } from "@/lib/benchmark-schema"
import type { BenchmarkEvalListItem } from "@/lib/eval-processing"
import { fetchBenchmarkMetadata, fetchEvalList } from "@/lib/dashboard-data-client"
import { getCategoryColor } from "@/lib/benchmark-schema"
import { lookupBenchmarkCard, normalizeBenchmarkKey } from "@/lib/benchmark-metadata-utils"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 40

function shortenLicense(license: string): string {
  if (!license || license === "Not specified") return ""
  if (license.toLowerCase().includes("creative commons attribution 4")) return "CC BY 4.0"
  if (license.toLowerCase().includes("creative commons zero")) return "CC0"
  if (license.toLowerCase().includes("apache license 2") || license.toLowerCase().includes("apache 2")) return "Apache 2.0"
  if (license.toLowerCase().includes("mit license")) return "MIT"
  if (license.toLowerCase().includes("cc-by-sa")) return "CC BY-SA"
  if (license.length > 24) return `${license.slice(0, 22)}…`
  return license
}

const LICENSE_COLORS: Record<string, string> = {
  mit: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200",
  apache: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200",
  "cc by": "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200",
  cc0: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-200",
  "cc-by-sa": "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200",
}

function licenseBadgeClass(license: string): string {
  const normalized = license.toLowerCase()
  for (const [key, className] of Object.entries(LICENSE_COLORS)) {
    if (normalized.includes(key)) return className
  }
  return "bg-muted text-muted-foreground border-border"
}

function slugifyAggregateId(value: string) {
  return `aggregate__${value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`
}

export default function EvalsPage() {
  const { mode } = useAudienceMode()

  const [summaries, setSummaries] = useState<BenchmarkEvalListItem[]>([])
  const [benchmarkCards, setBenchmarkCards] = useState<Record<string, BenchmarkCard>>({})
  const [loading, setLoading] = useState(true)
  const [totalModels, setTotalModels] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showWithoutMetadata, setShowWithoutMetadata] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    Promise.all([fetchEvalList(), fetchBenchmarkMetadata()])
      .then(([data, cards]) => {
        setSummaries(data.evals)
        setTotalModels(data.totalModels)
        setBenchmarkCards(cards)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const syncSearchFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const incomingSearch = params.get("search") ?? ""
      setSearchQuery(incomingSearch)
    }

    syncSearchFromUrl()
    window.addEventListener("popstate", syncSearchFromUrl)

    return () => {
      window.removeEventListener("popstate", syncSearchFromUrl)
    }
  }, [])

  const summariesWithCards = useMemo(() => {
    return summaries.map((summary) => {
      if (summary.benchmark_card) {
        return summary
      }

      const fallbackCard =
        lookupBenchmarkCard(benchmarkCards, summary.evaluation_name) ??
        lookupBenchmarkCard(benchmarkCards, summary.composite_benchmark_name) ??
        lookupBenchmarkCard(benchmarkCards, summary.composite_benchmark_key)

      return fallbackCard ? { ...summary, benchmark_card: fallbackCard } : summary
    })
  }, [benchmarkCards, summaries])

  const aggregatedSummaries = useMemo(() => {
    const grouped = new Map<string, BenchmarkEvalListItem[]>()
    const passthrough: BenchmarkEvalListItem[] = []

    for (const summary of summariesWithCards) {
      const cardName = summary.benchmark_card?.benchmark_details?.name

      if (!cardName) {
        passthrough.push(summary)
        continue
      }

      const groupKey = normalizeBenchmarkKey(cardName)
      const existing = grouped.get(groupKey) ?? []
      existing.push(summary)
      grouped.set(groupKey, existing)
    }

    const merged = Array.from(grouped.entries()).map(([groupKey, items]) => {
      if (items.length === 1) {
        return items[0]
      }

      const first = items[0]
      const aggregateSources = Array.from(
        new Map(
          items.map((item) => [
            item.evaluation_id,
            {
              evaluation_id: item.evaluation_id,
              composite_benchmark_key: item.composite_benchmark_key,
              composite_benchmark_name: item.composite_benchmark_name,
              models_count: item.models_count,
              avg_score_norm: item.avg_score_norm,
            },
          ])
        ).values()
      ).sort((a, b) => a.composite_benchmark_name.localeCompare(b.composite_benchmark_name))

      const dominantCategory =
        Object.entries(
          items.reduce<Record<string, number>>((counts, item) => {
            counts[item.category] = (counts[item.category] ?? 0) + 1
            return counts
          }, {})
        ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? first.category

      return {
        ...first,
        evaluation_name: first.benchmark_card?.benchmark_details?.name ?? first.evaluation_name,
        evaluation_id: slugifyAggregateId(groupKey),
        composite_benchmark_key: aggregateSources.length === 1 ? aggregateSources[0].composite_benchmark_key : "multiple",
        composite_benchmark_name:
          aggregateSources.length === 1
            ? aggregateSources[0].composite_benchmark_name
            : `${aggregateSources.length} composite benchmarks`,
        category: dominantCategory as CategoryType,
        models_count: Math.max(...items.map((item) => item.models_count)),
        evaluator_names: Array.from(new Set(items.flatMap((item) => item.evaluator_names))).sort((a, b) => a.localeCompare(b)),
        source_types: Array.from(new Set(items.flatMap((item) => item.source_types))).sort((a, b) => a.localeCompare(b)),
        latest_source_name:
          aggregateSources.length === 1 ? aggregateSources[0].composite_benchmark_name : "Multiple sources",
        third_party_ratio:
          items.reduce((sum, item) => sum + item.third_party_ratio, 0) / items.length,
        missing_generation_config_count: items.reduce(
          (sum, item) => sum + item.missing_generation_config_count,
          0
        ),
        avg_score:
          items.reduce((sum, item) => sum + item.avg_score_norm, 0) / items.length,
        avg_score_norm:
          items.reduce((sum, item) => sum + item.avg_score_norm, 0) / items.length,
        best_model: null,
        worst_model: null,
        is_aggregated: true,
        aggregate_sources: aggregateSources,
      }
    })

    return [...merged, ...passthrough]
  }, [summariesWithCards])

  const allDomains = useMemo(() => {
    const domainSet = new Set<string>()
    for (const summary of aggregatedSummaries.filter((entry) => entry.benchmark_card)) {
      for (const domain of summary.benchmark_card?.benchmark_details?.domains ?? []) {
        domainSet.add(domain)
      }
    }
    return Array.from(domainSet).sort((a, b) => a.localeCompare(b))
  }, [aggregatedSummaries])

  const allCategories = useMemo(() => {
    const categorySet = new Set<string>()
    for (const summary of aggregatedSummaries.filter((entry) => entry.benchmark_card)) {
      if (summary.category) {
        categorySet.add(summary.category)
      }
    }
    return Array.from(categorySet).sort((a, b) => a.localeCompare(b))
  }, [aggregatedSummaries])

  const metadataRichCount = useMemo(
    () => aggregatedSummaries.filter((summary) => summary.benchmark_card).length,
    [aggregatedSummaries]
  )

  const metadataPoorCount = aggregatedSummaries.length - metadataRichCount

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let list = showWithoutMetadata
      ? [...aggregatedSummaries]
      : aggregatedSummaries.filter((summary) => summary.benchmark_card)

    if (query) {
      list = list.filter((summary) => {
        const haystacks = [
          summary.evaluation_name,
          summary.composite_benchmark_name,
          summary.metric_config.evaluation_description,
          summary.benchmark_card?.benchmark_details?.overview,
          ...(summary.benchmark_card?.benchmark_details?.domains ?? []),
        ]

        return haystacks.some((value) => value?.toLowerCase().includes(query))
      })
    }

    if (selectedDomain) {
      list = list.filter((summary) =>
        (summary.benchmark_card?.benchmark_details?.domains ?? []).some(
          (domain) => domain.toLowerCase() === selectedDomain.toLowerCase()
        )
      )
    }

    if (selectedCategory) {
      list = list.filter((summary) => summary.category === selectedCategory)
    }

    list.sort((a, b) => a.evaluation_name.localeCompare(b.evaluation_name))
    return list
  }, [aggregatedSummaries, searchQuery, selectedCategory, selectedDomain, showWithoutMetadata])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, selectedCategory, selectedDomain, showWithoutMetadata])

  const pagedSummaries = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="text-lg text-muted-foreground">Loading evaluations...</div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <PageHeader
        eyebrow="Evaluations"
        title="Browse Evaluations"
        description={
          mode === "research"
            ? "Scan single-benchmark evaluations with the benchmark context first, then open the detail page when you need methodology, provenance, or ranking depth."
            : "Scan single-benchmark evaluations with the benchmark context first, then open the detail page when you need accountability, source, or reporting detail."
        }
        metaItems={[
          { label: "Evaluations", value: filtered.length.toString() },
          { label: "Rich cards", value: metadataRichCount.toString() },
          { label: "Models", value: totalModels.toString() },
          { label: "Domains", value: allDomains.length.toString() },
          ...(selectedDomain ? [{ label: "Domain filter", value: selectedDomain }] : []),
          ...(selectedCategory ? [{ label: "Category filter", value: selectedCategory }] : []),
        ]}
      />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-3 border-b border-border/50 pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name, domain, or overview"
                className="pl-9"
              />
            </div>
            <label className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showWithoutMetadata}
                onChange={(event) => setShowWithoutMetadata(event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>Show benchmarks that don't have rich metadata</span>
              {metadataPoorCount > 0 ? (
                <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  +{metadataPoorCount}
                </span>
              ) : null}
            </label>
          </div>

          {allDomains.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Domain
              </span>
              <button
                type="button"
                onClick={() => setSelectedDomain(null)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selectedDomain === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              {allDomains.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  onClick={() => setSelectedDomain(selectedDomain === domain ? null : domain)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                    selectedDomain === domain
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {domain}
                </button>
              ))}
              {selectedDomain && (
                <button
                  type="button"
                  onClick={() => setSelectedDomain(null)}
                  className="ml-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          )}

          {allCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Category
              </span>
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selectedCategory === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              {allCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedCategory === category
                      ? `${getCategoryColor(category as CategoryType)} border-2`
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {category}
                </button>
              ))}
              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="ml-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No evaluations found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pagedSummaries.map((summary) => {
              const card = summary.benchmark_card
              const title = card?.benchmark_details?.name ?? summary.evaluation_name
              const overview =
                card?.benchmark_details?.overview ?? summary.metric_config.evaluation_description
              const domains = card?.benchmark_details?.domains ?? []
              const dataType = card?.benchmark_details?.data_type ?? ""
              const license = card?.ethical_and_legal_considerations?.data_licensing ?? ""
              const shortLicense = shortenLicense(license)
              const showCompositeLabel =
                summary.composite_benchmark_name &&
                summary.composite_benchmark_name.toLowerCase() !== title.toLowerCase()
              const compositeLabel = summary.is_aggregated
                ? summary.aggregate_sources?.map((source) => source.composite_benchmark_name).join(", ")
                : summary.composite_benchmark_name

              return (
                <Link
                  key={summary.evaluation_id}
                  href={`/evals/${summary.evaluation_id}`}
                  className="group flex flex-col rounded-[1.75rem] border border-border/70 bg-card p-5 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)] motion-academic-enter motion-academic-surface motion-academic-hover"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                      {card ? "Benchmark" : "Benchmark without rich metadata"}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {dataType && (
                        <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {dataType}
                        </span>
                      )}
                      {shortLicense && (
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${licenseBadgeClass(license)}`}>
                          {shortLicense}
                        </span>
                      )}
                      <span className="rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {summary.models_count.toLocaleString()} models
                      </span>
                    </div>
                  </div>

                  <h3 className="mb-2 text-base font-bold tracking-tight transition-colors group-hover:text-primary sm:text-lg">
                    {title}
                  </h3>

                  {showCompositeLabel && compositeLabel && (
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {compositeLabel}
                    </div>
                  )}

                  {overview && (
                    <p className="mb-4 flex-1 text-sm leading-6 text-muted-foreground line-clamp-4">
                      {overview}
                    </p>
                  )}

                  {domains.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {domains.slice(0, 5).map((domain) => (
                        <span
                          key={domain}
                          className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-[11px] font-medium capitalize text-muted-foreground"
                        >
                          {domain}
                        </span>
                      ))}
                      {domains.length > 5 && (
                        <span className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                          +{domains.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}

        <ListPagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          itemLabel="evaluations"
          onPageChange={setPage}
        />
      </main>
    </div>
  )
}
