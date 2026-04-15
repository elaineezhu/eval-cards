"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowUpDown, ArrowRightLeft, Download, Search, X } from "lucide-react"
import { BenchmarkEvaluationCard, type BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { DeveloperCard } from "@/components/developer-card"
import { ListPagination } from "@/components/list-pagination"
import { ModelCompareDialog } from "@/components/model-compare-dialog"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { fetchDevelopers, fetchModelCards, fetchBenchmarkMetadata, type DeveloperListItem } from "@/lib/dashboard-data-client"
import type { BenchmarkCard } from "@/lib/benchmark-schema"
import { getCategoryColor, type CategoryType } from "@/lib/benchmark-schema"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 40
const MAX_COMPARE_MODELS = 4
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

  if (bound === "min" && step <= 0) {
    return "< 1B"
  }

  if (bound === "max" && step >= maxStepIndex) {
    return "> 500B"
  }

  const value = PARAM_RANGE_VALUES[step]
  return value != null ? `${value}B` : "Not reported"
}

function safeTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0
  }

  const numeric = Number(value)
  if (!Number.isNaN(numeric) && !value.includes("-")) {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

export default function ModelsPage() {
  const { mode } = useAudienceMode()
  const [evaluations, setEvaluations] = useState<BenchmarkEvaluationCardData[]>([])
  const [developers, setDevelopers] = useState<DeveloperListItem[]>([])
  const [benchmarkCards, setBenchmarkCards] = useState<Record<string, BenchmarkCard>>({})
  const [loadingModels, setLoadingModels] = useState(true)
  const [loadingDevelopers, setLoadingDevelopers] = useState(false)
  const [developersReady, setDevelopersReady] = useState(false)
  const [groupByDeveloper, setGroupByDeveloper] = useState(false)
  const [modelSortBy, setModelSortBy] = useState<"date" | "name" | "benchmarks" | "variants" | "size">("benchmarks")
  const [developerSortBy, setDeveloperSortBy] = useState<"coverage" | "evaluated" | "models" | "name">("coverage")
  const [searchQuery, setSearchQuery] = useState("")
  const [minParamStep, setMinParamStep] = useState(0)
  const [maxParamStep, setMaxParamStep] = useState(PARAM_RANGE_VALUES.length - 1)
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [page, setPage] = useState(1)
  const deferredSearchQuery = useDeferredValue(searchQuery)

  useEffect(() => {
    Promise.all([fetchModelCards(), fetchBenchmarkMetadata()])
      .then(([cards, metadata]) => {
        setEvaluations(cards)
        setBenchmarkCards(metadata)
      })
      .catch((error) => {
        console.error("Failed to load evaluations:", error)
      })
      .finally(() => setLoadingModels(false))
  }, [])

  useEffect(() => {
    if (!groupByDeveloper || developersReady || loadingDevelopers) {
      return
    }

    setLoadingDevelopers(true)
    fetchDevelopers()
      .then(setDevelopers)
      .catch((error) => {
        console.error("Failed to load developers:", error)
      })
      .finally(() => {
        setLoadingDevelopers(false)
        setDevelopersReady(true)
      })
  }, [developersReady, groupByDeveloper, loadingDevelopers])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const params = new URLSearchParams(window.location.search)
    setGroupByDeveloper(params.get("group") === "developer")
  }, [])

  useEffect(() => {
    setSelectedModelIds((current) =>
      current.filter((id) => evaluations.some((evaluation) => evaluation.id === id))
    )
  }, [evaluations])

  const numericMinParams = useMemo(() => {
    if (minParamStep <= 0) {
      return null
    }

    return PARAM_RANGE_VALUES[minParamStep] ?? null
  }, [minParamStep])

  const numericMaxParams = useMemo(() => {
    if (maxParamStep >= PARAM_RANGE_VALUES.length - 1) {
      return null
    }

    return PARAM_RANGE_VALUES[maxParamStep] ?? null
  }, [maxParamStep])

  const allCategories = useMemo(() => {
    const catSet = new Set<string>()
    for (const evaluation of evaluations) {
      for (const cat of evaluation.categories ?? []) {
        catSet.add(cat)
      }
    }
    return Array.from(catSet).sort((a, b) => a.localeCompare(b))
  }, [evaluations])

  const filteredEvaluations = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()

    return evaluations.filter((evaluation) => {
      if (numericMinParams != null) {
        if (evaluation.params_billions == null || evaluation.params_billions < numericMinParams) {
          return false
        }
      }

      if (numericMaxParams != null) {
        if (evaluation.params_billions == null || evaluation.params_billions > numericMaxParams) {
          return false
        }
      }

      if (selectedCategories.length > 0) {
        if (!evaluation.categories.some((c) => selectedCategories.includes(c))) {
          return false
        }
      }

      if (!query) {
        return true
      }

      const haystacks = [
        evaluation.model_name,
        evaluation.canonical_model_name,
        evaluation.developer,
        evaluation.architecture,
        evaluation.latest_source_name,
        ...(evaluation.benchmark_names ?? []),
        ...evaluation.top_scores.map((score) => score.benchmark),
      ]

      return haystacks.some((value) => value?.toLowerCase().includes(query))
    })
  }, [deferredSearchQuery, evaluations, numericMaxParams, numericMinParams, selectedCategories])

  const sortedEvaluations = useMemo(() => {
    const sorted = [...filteredEvaluations]
    const byName = (a: BenchmarkEvaluationCardData, b: BenchmarkEvaluationCardData) =>
      a.model_name.localeCompare(b.model_name) ||
      (a.developer ?? "").localeCompare(b.developer ?? "")

    switch (modelSortBy) {
      case "date":
        sorted.sort((a, b) => {
          const comparison = safeTimestamp(b.latest_timestamp) - safeTimestamp(a.latest_timestamp)
          if (comparison !== 0) {
            return comparison
          }

          return byName(a, b)
        })
        break
      case "name":
        sorted.sort((a, b) => byName(a, b))
        break
      case "benchmarks":
        sorted.sort((a, b) => {
          if (b.benchmarks_count !== a.benchmarks_count) {
            return b.benchmarks_count - a.benchmarks_count
          }

          if (b.evaluations_count !== a.evaluations_count) {
            return b.evaluations_count - a.evaluations_count
          }

          return byName(a, b)
        })
        break
      case "variants":
        sorted.sort((a, b) => {
          if (b.variant_count !== a.variant_count) {
            return b.variant_count - a.variant_count
          }

          if (b.benchmarks_count !== a.benchmarks_count) {
            return b.benchmarks_count - a.benchmarks_count
          }

          return byName(a, b)
        })
        break
      case "size":
        sorted.sort((a, b) => {
          const aSize = a.params_billions ?? null
          const bSize = b.params_billions ?? null

          if (aSize != null && bSize != null) {
            if (bSize !== aSize) {
              return bSize - aSize
            }
          } else if (aSize != null || bSize != null) {
            return aSize == null ? 1 : -1
          }

          if (b.benchmarks_count !== a.benchmarks_count) {
            return b.benchmarks_count - a.benchmarks_count
          }

          return byName(a, b)
        })
        break
    }

    return sorted
  }, [filteredEvaluations, modelSortBy])

  const filteredDevelopers = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()
    const filtered = query
      ? developers.filter((developer) => {
          const haystacks = [
            developer.developer,
            ...developer.popular_evals.map((evaluation) => evaluation.benchmark),
          ]

          return haystacks.some((value) => value?.toLowerCase().includes(query))
        })
      : [...developers]

    filtered.sort((a, b) => {
      switch (developerSortBy) {
        case "coverage":
          if (b.benchmark_count !== a.benchmark_count) {
            return b.benchmark_count - a.benchmark_count
          }
          if (b.evaluation_count !== a.evaluation_count) {
            return b.evaluation_count - a.evaluation_count
          }
          if (b.model_count !== a.model_count) {
            return b.model_count - a.model_count
          }
          break
        case "evaluated":
          if (b.evaluation_count !== a.evaluation_count) {
            return b.evaluation_count - a.evaluation_count
          }
          break
        case "models":
          if (b.model_count !== a.model_count) {
            return b.model_count - a.model_count
          }
          break
        case "name":
          break
      }

      return a.developer.localeCompare(b.developer)
    })

    return filtered
  }, [deferredSearchQuery, developerSortBy, developers])

  useEffect(() => {
    setPage(1)
  }, [developerSortBy, groupByDeveloper, maxParamStep, minParamStep, modelSortBy, searchQuery, selectedCategories])

  const pagedEvaluations = useMemo(
    () => sortedEvaluations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedEvaluations, page]
  )

  const pagedDevelopers = useMemo(
    () => filteredDevelopers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredDevelopers, page]
  )

  const handleDelete = (id: string) => {
    setEvaluations((prev) => prev.filter((e) => e.id !== id))
    setSelectedModelIds((prev) => prev.filter((selectedId) => selectedId !== id))
  }

  const selectedModels = useMemo(
    () =>
      selectedModelIds
        .map((id) => evaluations.find((evaluation) => evaluation.id === id))
        .filter((evaluation): evaluation is BenchmarkEvaluationCardData => Boolean(evaluation)),
    [evaluations, selectedModelIds]
  )

  useEffect(() => {
    if (compareOpen && selectedModels.length < 2) {
      setCompareOpen(false)
    }
  }, [compareOpen, selectedModels.length])

  const sharedBenchmarkCount = useMemo(() => {
    if (selectedModels.length < 2) {
      return 0
    }

    const benchmarkCounts = new Map<string, number>()

    for (const model of selectedModels) {
      const benchmarks = new Set([
        ...(model.benchmark_names ?? []),
        ...model.top_scores.map((score) => score.benchmark),
      ])

      for (const benchmark of benchmarks) {
        benchmarkCounts.set(benchmark, (benchmarkCounts.get(benchmark) ?? 0) + 1)
      }
    }

    return Array.from(benchmarkCounts.values()).filter((count) => count === selectedModels.length).length
  }, [selectedModels])

  const handleExport = () => {
    const payload = groupByDeveloper
      ? {
          view: "developers",
          filters: {
            search: searchQuery,
            sort: developerSortBy,
          },
          rows: filteredDevelopers.map((developer) => ({
            developer: developer.developer,
            route_id: developer.route_id,
            model_count: developer.model_count,
            benchmark_count: developer.benchmark_count,
            evaluation_count: developer.evaluation_count,
            popular_evals: developer.popular_evals,
          })),
        }
      : {
          view: "models",
          filters: {
            search: searchQuery,
            sort: modelSortBy,
            categories: selectedCategories,
            min_params_billions: numericMinParams,
            max_params_billions: numericMaxParams,
          },
          rows: sortedEvaluations.map((evaluation) => ({
            model_name: evaluation.model_name,
            route_id: evaluation.route_id,
            developer: evaluation.developer,
            benchmark_suites: evaluation.benchmarks_count,
            reported_results: evaluation.evaluations_count,
            categories: evaluation.categories,
            visible_benchmarks: (evaluation.benchmark_names ?? []).slice(0, 8),
          })),
        }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = groupByDeveloper ? "eval-cards-developers-view.json" : "eval-cards-model-view.json"
    link.click()
    URL.revokeObjectURL(url)
  }

  const toggleModelSelection = (id: string) => {
    setSelectedModelIds((current) => {
      if (current.includes(id)) {
        return current.filter((selectedId) => selectedId !== id)
      }

      if (current.length >= MAX_COMPARE_MODELS) {
        return current
      }

      return [...current, id]
    })
  }

  const loading = loadingModels || (groupByDeveloper && !developersReady)
  const maxParamStepIndex = PARAM_RANGE_VALUES.length - 1
  const minHandlePercent = (minParamStep / maxParamStepIndex) * 100
  const maxHandlePercent = (maxParamStep / maxParamStepIndex) * 100

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="text-lg text-muted-foreground">Loading models...</div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <PageHeader
          eyebrow="Models"
          title={groupByDeveloper ? "Model Developers" : "AI Model Evaluations"}
          description={
            groupByDeveloper
              ? "Group models by developer to see how many each team ships and which eval suites appear most."
              : mode === "research"
                ? "Model cards with benchmark breadth, comparison context, and reproducibility signals."
                : "Model cards with reporting breadth, evidence quality, and evaluator accountability."
          }
          metaItems={[
            groupByDeveloper
              ? { label: "Developers", value: filteredDevelopers.length.toString() }
              : { label: "Models", value: sortedEvaluations.length.toString() },
            groupByDeveloper
              ? {
                  label: "Indexed Models",
                  value: filteredDevelopers.reduce((sum, developer) => sum + developer.model_count, 0).toString(),
                }
              : { label: "Reported results", value: sortedEvaluations.reduce((sum, e) => sum + e.evaluations_count, 0).toString() },
            groupByDeveloper
              ? {
                  label: "Benchmarks",
                  value: filteredDevelopers.reduce((sum, developer) => sum + developer.benchmark_count, 0).toString(),
                }
              : { label: "Developers", value: new Set(sortedEvaluations.map((e) => e.developer)).size.toString() },
            !groupByDeveloper
              ? { label: "Compare tray", value: selectedModels.length.toString() }
              : { label: "View", value: "Developer" },
            ...(selectedCategories.length > 0 ? [{ label: "Category filter", value: selectedCategories.join(", ") }] : []),
          ]}
        />

        {!groupByDeveloper ? (
          <div className="mb-6 rounded-[1.5rem] border border-border/70 bg-muted/10 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Compare Workflow
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Filter the list, then compare up to {MAX_COMPARE_MODELS} models side by side.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Export current view</Badge>
                <Badge variant="outline">Benchmark coverage</Badge>
                <Badge variant="outline">Table comparison</Badge>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-8 flex flex-col gap-4 border-b border-border/50 pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="inline-flex w-fit rounded-full border bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => setGroupByDeveloper(false)}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                !groupByDeveloper
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Models
            </button>
            <button
              type="button"
              onClick={() => setGroupByDeveloper(true)}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                groupByDeveloper
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Group by model developer
            </button>
          </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={
                  groupByDeveloper
                    ? "Search developers or popular evals"
                    : "Search models, developers, or benchmarks"
                }
                className="pl-9"
              />
            </div>
          {!groupByDeveloper ? (
            <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-sm font-medium text-foreground">Parameters</span>

                <div className="min-w-0 flex-1 w-[min(92vw,360px)]">
                  <div className="relative mb-1 h-4 text-[11px] text-muted-foreground">
                    {PARAM_RANGE_MARKERS.map((marker) => (
                      <span
                        key={marker.label}
                        className="absolute top-0 whitespace-nowrap"
                        style={{
                          left: `${(marker.step / maxParamStepIndex) * 100}%`,
                          transform:
                            marker.step === 0
                              ? "translateX(0)"
                              : marker.step === maxParamStepIndex
                                ? "translateX(-100%)"
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
                          left: `${minHandlePercent}%`,
                          right: `${Math.max(100 - maxHandlePercent, 0)}%`,
                        }}
                      />
                    </div>

                    <div className="absolute inset-x-1.5 top-1/2 -translate-y-1/2">
                      {PARAM_RANGE_VALUES.map((_, stepIndex) => (
                        <span
                          key={`param-tick-${stepIndex}`}
                          className="absolute top-0 h-2 w-px -translate-x-1/2 rounded-full bg-border"
                          style={{ left: `${(stepIndex / maxParamStepIndex) * 100}%` }}
                          aria-hidden="true"
                        />
                      ))}
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={maxParamStepIndex}
                      step={1}
                      value={minParamStep}
                      onChange={(event) => {
                        const nextMin = Number(event.target.value)
                        setMinParamStep(Math.min(nextMin, maxParamStep))
                      }}
                      className="param-range-input"
                      aria-label="Minimum parameter filter"
                    />

                    <input
                      type="range"
                      min={0}
                      max={maxParamStepIndex}
                      step={1}
                      value={maxParamStep}
                      onChange={(event) => {
                        const nextMax = Number(event.target.value)
                        setMaxParamStep(Math.max(nextMax, minParamStep))
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
          ) : null}
          <Select
            value={groupByDeveloper ? developerSortBy : modelSortBy}
            onValueChange={(value) => {
              if (groupByDeveloper) {
                setDeveloperSortBy(value as typeof developerSortBy)
              } else {
                setModelSortBy(value as typeof modelSortBy)
              }
            }}
          >
            <SelectTrigger className="w-[180px]">
              <ArrowUpDown className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {groupByDeveloper ? (
                <>
                  <SelectItem value="coverage">Most Coverage</SelectItem>
                  <SelectItem value="evaluated">Most Results</SelectItem>
                  <SelectItem value="models">Most Models</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="benchmarks">Most Benchmark Coverage</SelectItem>
                  <SelectItem value="variants">Most Versions</SelectItem>
                  <SelectItem value="size">Largest Models</SelectItem>
                  <SelectItem value="date">Latest First</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export current view
          </Button>
          </div>

          {/* Category filter chips — only shown for model view */}
          {!groupByDeveloper && allCategories.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Category Match
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {allCategories.map((cat) => {
                  const isActive = selectedCategories.includes(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setSelectedCategories((prev) =>
                          prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                        )
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        isActive
                          ? getCategoryColor(cat as CategoryType) + " border-2"
                          : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {cat}
                    </button>
                  )
                })}
                {selectedCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategories([])}
                    className="ml-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Showing models tagged with any selected category.
              </p>
            </div>
          )}
        </div>

        {(groupByDeveloper ? filteredDevelopers.length === 0 : sortedEvaluations.length === 0) ? (
          <div className="py-12 text-center">
            <p className="mb-4 text-lg text-muted-foreground">
              {groupByDeveloper
                ? "No developers found matching your filters"
                : "No model cards found matching your filters"}
            </p>
            <Button
              onClick={() => {
                setModelSortBy("benchmarks")
                setDeveloperSortBy("coverage")
                setSearchQuery("")
                setSelectedCategories([])
                setMinParamStep(0)
                setMaxParamStep(PARAM_RANGE_VALUES.length - 1)
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
            {groupByDeveloper
              ? pagedDevelopers.map((developer, index) => (
                  <DeveloperCard
                    key={developer.route_id}
                    developer={developer}
                    delayMs={Math.min(index * 45, 240)}
                  />
                ))
              : pagedEvaluations.map((evaluation, index) => (
                  <BenchmarkEvaluationCard
                    key={evaluation.id}
                    data={evaluation}
                    benchmarkCards={benchmarkCards}
                    onDelete={handleDelete}
                    selectedForCompare={selectedModelIds.includes(evaluation.id)}
                    onToggleCompare={toggleModelSelection}
                    delayMs={Math.min(index * 45, 240)}
                  />
                ))}
          </div>
        )}

        <ListPagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={groupByDeveloper ? filteredDevelopers.length : sortedEvaluations.length}
          itemLabel={groupByDeveloper ? "developers" : "models"}
          onPageChange={setPage}
        />

        {!groupByDeveloper && selectedModels.length > 0 ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-5xl rounded-[1.5rem] border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Compare Tray
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedModels.map((model) => (
                      <span
                        key={model.id}
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/20 px-3 py-1.5 text-sm"
                      >
                        <span className="font-medium">{model.model_name}</span>
                        <button
                          type="button"
                          onClick={() => toggleModelSelection(model.id)}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={`Remove ${model.model_name} from compare`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {sharedBenchmarkCount > 0
                      ? `${sharedBenchmarkCount} surfaced benchmark${sharedBenchmarkCount === 1 ? " overlaps" : "s overlap"} across the selected models.`
                      : `Select up to ${MAX_COMPARE_MODELS} models. The compare view is most useful when the selected models share benchmark coverage.`}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" onClick={() => setSelectedModelIds([])}>
                    Clear
                  </Button>
                  <Button
                    onClick={() => setCompareOpen(true)}
                    disabled={selectedModels.length < 2}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Compare {selectedModels.length} model{selectedModels.length !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <ModelCompareDialog
        models={selectedModels}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
    </div>
  )
}
