"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import { ArrowRightLeft, Search, X } from "lucide-react"

import { type BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { DeveloperTable } from "@/components/developer-table"
import { InfiniteScrollSentinel } from "@/components/infinite-scroll"
import { ModelCompareDialog } from "@/components/model-compare-dialog"
import { ModelTable } from "@/components/model-table"
import { Navigation } from "@/components/navigation"
import { fetchDevelopers, fetchModelCards, fetchBenchmarkMetadata, type DeveloperListItem } from "@/lib/dashboard-data-client"
import type { BenchmarkCard } from "@/lib/benchmark-schema"

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
  if (bound === "min" && step <= 0) return "< 1B"
  if (bound === "max" && step >= maxStepIndex) return "> 500B"
  const value = PARAM_RANGE_VALUES[step]
  return value != null ? `${value}B` : "?"
}

type ModelSort = "benchmarks" | "results" | "name" | "released" | "params"
type DevSort = "coverage" | "evaluated" | "models" | "name"

function safeTimestamp(value: string | null | undefined) {
  if (!value) return 0
  const numeric = Number(value)
  if (!Number.isNaN(numeric) && !value.includes("-")) {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000
  }
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

export default function ModelsPage() {
  const [evaluations, setEvaluations] = useState<BenchmarkEvaluationCardData[]>([])
  const [developers, setDevelopers] = useState<DeveloperListItem[]>([])
  const [benchmarkCards, setBenchmarkCards] = useState<Record<string, BenchmarkCard>>({})
  const [loadingModels, setLoadingModels] = useState(true)
  const [loadingDevelopers, setLoadingDevelopers] = useState(false)
  const [developersReady, setDevelopersReady] = useState(false)
  const [groupByDeveloper, setGroupByDeveloper] = useState(false)
  const [modelSortBy, setModelSortBy] = useState<ModelSort>("benchmarks")
  const [developerSortBy, setDeveloperSortBy] = useState<DevSort>("coverage")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [minParamStep, setMinParamStep] = useState(0)
  const [maxParamStep, setMaxParamStep] = useState(PARAM_RANGE_VALUES.length - 1)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const maxParamStepIndex = PARAM_RANGE_VALUES.length - 1
  const numericMinParams = useMemo(
    () => (minParamStep <= 0 ? null : PARAM_RANGE_VALUES[minParamStep] ?? null),
    [minParamStep]
  )
  const numericMaxParams = useMemo(
    () => (maxParamStep >= PARAM_RANGE_VALUES.length - 1 ? null : PARAM_RANGE_VALUES[maxParamStep] ?? null),
    [maxParamStep]
  )

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
    if (!groupByDeveloper || developersReady || loadingDevelopers) return
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

  const totalBenchmarks = useMemo(() => Object.keys(benchmarkCards).length, [benchmarkCards])

  // Models — filter + sort
  const sortedEvaluations = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()
    let filtered = evaluations

    if (numericMinParams != null) {
      filtered = filtered.filter(
        (row) => row.params_billions != null && row.params_billions >= numericMinParams
      )
    }
    if (numericMaxParams != null) {
      filtered = filtered.filter(
        (row) => row.params_billions != null && row.params_billions <= numericMaxParams
      )
    }

    if (query) {
      filtered = filtered.filter((row) => {
        return (
          row.model_name.toLowerCase().includes(query) ||
          row.canonical_model_name.toLowerCase().includes(query) ||
          row.developer.toLowerCase().includes(query) ||
          (row.benchmark_names ?? []).some((b) => b.toLowerCase().includes(query))
        )
      })
    }

    return filtered.slice().sort((a, b) => {
      switch (modelSortBy) {
        case "name":
          return a.model_name.localeCompare(b.model_name)
        case "released":
          return safeTimestamp(b.release_date ?? b.latest_timestamp) - safeTimestamp(a.release_date ?? a.latest_timestamp)
        case "params":
          return (b.params_billions ?? 0) - (a.params_billions ?? 0)
        case "results":
          return b.evaluations_count - a.evaluations_count
        case "benchmarks":
        default:
          return b.benchmarks_count - a.benchmarks_count
      }
    })
  }, [evaluations, deferredSearchQuery, modelSortBy, numericMinParams, numericMaxParams])

  // Developers — filter + sort
  const sortedDevelopers = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()
    let filtered = developers

    if (query) {
      filtered = filtered.filter(
        (dev) =>
          dev.developer.toLowerCase().includes(query) ||
          dev.popular_evals.some((ev) => ev.benchmark.toLowerCase().includes(query)),
      )
    }

    return filtered.slice().sort((a, b) => {
      switch (developerSortBy) {
        case "evaluated":
          return b.evaluation_count - a.evaluation_count
        case "models":
          return b.model_count - a.model_count
        case "name":
          return a.developer.localeCompare(b.developer)
        case "coverage":
        default:
          return b.benchmark_count - a.benchmark_count
      }
    })
  }, [developers, deferredSearchQuery, developerSortBy])

  // Reset visible window when filter/sort changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [groupByDeveloper, modelSortBy, developerSortBy, deferredSearchQuery, minParamStep, maxParamStep])

  const totalCount = groupByDeveloper ? sortedDevelopers.length : sortedEvaluations.length
  const visibleEvaluations = useMemo(
    () => sortedEvaluations.slice(0, visibleCount),
    [sortedEvaluations, visibleCount],
  )
  const visibleDevelopers = useMemo(
    () => sortedDevelopers.slice(0, visibleCount),
    [sortedDevelopers, visibleCount],
  )
  const hasMore = visibleCount < totalCount
  const handleLoadMore = useCallback(() => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, totalCount))
  }, [totalCount])

  const toggleModelSelection = useCallback((id: string) => {
    setSelectedModelIds((current) => {
      if (current.includes(id)) return current.filter((existing) => existing !== id)
      if (current.length >= MAX_COMPARE_MODELS) return current
      return [...current, id]
    })
  }, [])

  const selectedModels = useMemo(
    () =>
      selectedModelIds
        .map((id) => evaluations.find((evaluation) => evaluation.id === id))
        .filter((evaluation): evaluation is BenchmarkEvaluationCardData => Boolean(evaluation)),
    [evaluations, selectedModelIds],
  )

  const loading = loadingModels || (groupByDeveloper && !developersReady)
  const totalResults = useMemo(
    () => sortedEvaluations.reduce((sum, row) => sum + row.evaluations_count, 0),
    [sortedEvaluations],
  )

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto w-full max-w-[96rem] px-4 pt-12 pb-24 sm:px-8">
        {/* HEADER --------------------------------------------------- */}
        <div className="kicker">Index</div>
        <h1 className="ec-page-h1">{groupByDeveloper ? "Model developers" : "Models"}</h1>
        <p className="ec-page-lede">
          {groupByDeveloper
            ? "Every reporting organisation in the corpus and the breadth of evaluation it ships."
            : (
              <>
                Every indexed model and the shape of its published evaluation record. Coverage shows the
                share of the{" "}
                <span className="font-mono text-[13px]">
                  {totalBenchmarks.toLocaleString()}-benchmark
                </span>{" "}
                registry that the developer (or a third party) has reported on.
              </>
            )}
        </p>

        {/* META + FILTER BAR — single row -------------------------- */}
        <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-[color:var(--border-soft)] py-4">
          {/* Inline meta — mono kicker stat strip */}
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.1em] uppercase text-[color:var(--fg-subtle)]">
            <span>
              <span className="text-[color:var(--fg)] tabular-nums font-semibold mr-1">
                {totalCount.toLocaleString()}
              </span>
              {groupByDeveloper ? "developers" : "models"}
            </span>
            {!groupByDeveloper && (
              <span>
                · <span className="text-[color:var(--fg)] tabular-nums font-semibold mr-1">{totalResults.toLocaleString()}</span>
                results
              </span>
            )}
            {!groupByDeveloper && (
              <span>
                · <span className="text-[color:var(--fg)] tabular-nums font-semibold mr-1">{selectedModels.length}/{MAX_COMPARE_MODELS}</span>
                tray
              </span>
            )}
          </div>

          <span className="hidden h-5 w-px bg-[color:var(--border-soft)] sm:block" />

          <div className="ec-mode-toggle">
            <button
              type="button"
              className={!groupByDeveloper ? "on" : ""}
              onClick={() => setGroupByDeveloper(false)}
            >
              Models
            </button>
            <button
              type="button"
              className={groupByDeveloper ? "on" : ""}
              onClick={() => setGroupByDeveloper(true)}
            >
              Developers
            </button>
          </div>

          <div className="relative min-w-[180px] flex-1 sm:max-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--fg-subtle)]" />
            <input
              className="ec-input pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={
                groupByDeveloper ? "Search developers…" : "Search model or developer…"
              }
            />
          </div>

          {!groupByDeveloper && (
            <>
              <span className="hidden h-5 w-px bg-[color:var(--border-soft)] sm:block" />

              {/* Compact param picker — kicker + slider + readout, all inline */}
              <div className="flex min-w-[260px] flex-1 items-center gap-4 sm:max-w-[300px]">
                <span className="kicker shrink-0">Params</span>
                <div className="relative h-4 min-w-0 flex-1">
                  <div className="absolute inset-x-2 top-1/2 h-[2px] -translate-y-1/2 bg-[color:var(--border-soft)]" />
                  <div className="absolute inset-x-2 top-1/2 h-[2px] -translate-y-1/2">
                    <div
                      className="absolute inset-y-0 bg-[color:var(--fg)] transition-[left,right] duration-200 ease-[var(--ease-out-quart)]"
                      style={{
                        left: `${(minParamStep / maxParamStepIndex) * 100}%`,
                        right: `${Math.max(100 - (maxParamStep / maxParamStepIndex) * 100, 0)}%`,
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={maxParamStepIndex}
                    step={1}
                    value={minParamStep}
                    onChange={(event) =>
                      setMinParamStep(Math.min(Number(event.target.value), maxParamStep))
                    }
                    className="param-range-input"
                    aria-label="Minimum parameter filter"
                  />
                  <input
                    type="range"
                    min={0}
                    max={maxParamStepIndex}
                    step={1}
                    value={maxParamStep}
                    onChange={(event) =>
                      setMaxParamStep(Math.max(Number(event.target.value), minParamStep))
                    }
                    className="param-range-input"
                    aria-label="Maximum parameter filter"
                  />
                </div>
                <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-[color:var(--fg-muted)]">
                  {formatParamBoundLabel(minParamStep, "min")} – {formatParamBoundLabel(maxParamStep, "max")}
                </span>
                {(minParamStep > 0 || maxParamStep < maxParamStepIndex) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMinParamStep(0)
                      setMaxParamStep(maxParamStepIndex)
                    }}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--fg-subtle)] hover:text-[color:var(--accent)] transition-colors"
                    aria-label="Reset parameters filter"
                  >
                    Reset
                  </button>
                )}
              </div>
            </>
          )}

          <select
            className="ec-select ml-auto shrink-0"
            value={groupByDeveloper ? developerSortBy : modelSortBy}
            onChange={(event) => {
              const value = event.target.value
              if (groupByDeveloper) setDeveloperSortBy(value as DevSort)
              else setModelSortBy(value as ModelSort)
            }}
          >
            {groupByDeveloper ? (
              <>
                <option value="coverage">Sort · Coverage</option>
                <option value="evaluated">Sort · Reported results</option>
                <option value="models">Sort · Most models</option>
                <option value="name">Sort · Name</option>
              </>
            ) : (
              <>
                <option value="benchmarks">Sort · Benchmarks</option>
                <option value="results">Sort · Reported results</option>
                <option value="released">Sort · Released</option>
                <option value="params">Sort · Parameters</option>
                <option value="name">Sort · Name</option>
              </>
            )}
          </select>
        </div>

        {/* TABLE ---------------------------------------------------- */}
        {loading ? (
          <div className="py-24 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--fg-subtle)]">
            Loading…
          </div>
        ) : totalCount === 0 ? (
          <div className="py-16 text-center border border-dashed border-[color:var(--border-soft)] bg-[color:var(--bg-warm)]">
            <p className="mb-4 text-base text-[color:var(--fg-muted)]">
              {groupByDeveloper
                ? "No developers found matching your filters."
                : "No models found matching your filters."}
            </p>
            <button
              type="button"
              className="btn-ec outline"
              onClick={() => {
                setSearchQuery("")
                setModelSortBy("benchmarks")
                setDeveloperSortBy("coverage")
              }}
            >
              Reset filters
            </button>
          </div>
        ) : groupByDeveloper ? (
          <DeveloperTable rows={visibleDevelopers} />
        ) : (
          <ModelTable
            rows={visibleEvaluations}
            totalBenchmarks={totalBenchmarks}
            selectedIds={selectedModelIds}
            onToggleSelect={toggleModelSelection}
            maxCompare={MAX_COMPARE_MODELS}
          />
        )}

        <InfiniteScrollSentinel
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          loadingLabel="Loading more…"
          endLabel={`Showing ${Math.min(visibleCount, totalCount).toLocaleString()} of ${totalCount.toLocaleString()} ${groupByDeveloper ? "developers" : "models"}`}
        />

        {/* COMPARE TRAY (sticky bottom) ---------------------------- */}
        {!groupByDeveloper && selectedModels.length > 0 && (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-5xl border border-[color:var(--fg)] bg-[color:var(--bg)] p-4 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="kicker">Compare tray</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedModels.map((model) => (
                      <span
                        key={model.id}
                        className="inline-flex items-center gap-2 border border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] px-3 py-1.5 text-sm"
                      >
                        <span className="font-medium text-[color:var(--fg)]">
                          {model.model_name}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleModelSelection(model.id)}
                          className="text-[color:var(--fg-muted)] transition-colors hover:text-[color:var(--fg)]"
                          aria-label={`Remove ${model.model_name} from compare`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-ec ghost"
                    onClick={() => setSelectedModelIds([])}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareOpen(true)}
                    disabled={selectedModels.length < 2}
                    className="btn-ec disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Compare {selectedModels.length}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <ModelCompareDialog
        models={selectedModels}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
    </div>
  )
}
