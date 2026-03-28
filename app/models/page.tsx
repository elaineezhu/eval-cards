"use client"

import { useState, useMemo, useEffect } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowUpDown, Search } from "lucide-react"
import { BenchmarkEvaluationCard, type BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { DeveloperCard } from "@/components/developer-card"
import { ListPagination } from "@/components/list-pagination"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { fetchDevelopers, fetchModelCards, type DeveloperListItem } from "@/lib/dashboard-data-client"

const PAGE_SIZE = 40

export default function ModelsPage() {
  const { mode } = useAudienceMode()
  const [evaluations, setEvaluations] = useState<BenchmarkEvaluationCardData[]>([])
  const [developers, setDevelopers] = useState<DeveloperListItem[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [loadingDevelopers, setLoadingDevelopers] = useState(true)
  const [groupByDeveloper, setGroupByDeveloper] = useState(false)
  const [modelSortBy, setModelSortBy] = useState<"date" | "name" | "benchmarks">("date")
  const [developerSortBy, setDeveloperSortBy] = useState<"coverage" | "evaluated" | "models" | "name">("coverage")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchModelCards()
      .then(setEvaluations)
      .catch((error) => {
        console.error("Failed to load evaluations:", error)
      })
      .finally(() => setLoadingModels(false))

    fetchDevelopers()
      .then(setDevelopers)
      .catch((error) => {
        console.error("Failed to load developers:", error)
      })
      .finally(() => setLoadingDevelopers(false))
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const params = new URLSearchParams(window.location.search)
    setGroupByDeveloper(params.get("group") === "developer")
  }, [])

  const filteredEvaluations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) {
      return [...evaluations]
    }

    return evaluations.filter((evaluation) => {
      const haystacks = [
        evaluation.model_name,
        evaluation.canonical_model_name,
        evaluation.developer,
        evaluation.architecture,
        evaluation.latest_source_name,
        ...evaluation.evaluator_names,
        ...evaluation.top_scores.map((score) => score.benchmark),
      ]

      return haystacks.some((value) => value?.toLowerCase().includes(query))
    })
  }, [evaluations, searchQuery])

  const sortedEvaluations = useMemo(() => {
    const sorted = [...filteredEvaluations]

    switch (modelSortBy) {
      case "date":
        sorted.sort((a, b) =>
          new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime()
        )
        break
      case "name":
        sorted.sort((a, b) => a.model_name.localeCompare(b.model_name))
        break
      case "benchmarks":
        sorted.sort((a, b) => b.benchmarks_count - a.benchmarks_count)
        break
    }

    return sorted
  }, [filteredEvaluations, modelSortBy])

  const filteredDevelopers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
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
  }, [developerSortBy, developers, searchQuery])

  useEffect(() => {
    setPage(1)
  }, [developerSortBy, groupByDeveloper, modelSortBy, searchQuery])

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
  }

  const loading = loadingModels || loadingDevelopers

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
              ? "Group the model corpus by developer to compare how many models each team ships and which eval suites show up most often."
              : mode === "research"
                ? "Browse model cards with benchmark breadth, result density, and technical highlights."
                : "Browse model cards with stronger emphasis on reporting breadth, evidence, and evaluation accountability."
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
              : { label: "Reporting orgs", value: new Set(sortedEvaluations.flatMap((e) => e.evaluator_names)).size.toString() },
          ]}
        />

        <div className="mb-8 flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:flex-wrap sm:items-center">
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
                  <SelectItem value="date">Latest First</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                  <SelectItem value="benchmarks">Most Benchmark Coverage</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {(groupByDeveloper ? filteredDevelopers.length === 0 : sortedEvaluations.length === 0) ? (
          <div className="py-12 text-center">
            <p className="mb-4 text-lg text-muted-foreground">
              {groupByDeveloper
                ? "No developers found matching your filters"
                : "No evaluations found matching your filters"}
            </p>
            <Button
              onClick={() => {
                setModelSortBy("date")
                setDeveloperSortBy("coverage")
                setSearchQuery("")
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
                    onDelete={handleDelete}
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
      </main>
    </div>
  )
}
