"use client"

import { useState, useMemo, useEffect } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowUpDown, Search } from "lucide-react"
import { BenchmarkEvaluationCard, type BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { ListPagination } from "@/components/list-pagination"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { fetchModelCards } from "@/lib/dashboard-data-client"

const PAGE_SIZE = 40

export default function ModelsPage() {
  const { mode } = useAudienceMode()
  const [evaluations, setEvaluations] = useState<BenchmarkEvaluationCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<"date" | "name" | "benchmarks">("date")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchModelCards()
        setEvaluations(data)
      } catch (error) {
        console.error("Failed to load evaluations:", error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
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

    switch (sortBy) {
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
  }, [filteredEvaluations, sortBy])

  useEffect(() => {
    setPage(1)
  }, [sortBy, searchQuery])

  const pagedEvaluations = useMemo(
    () => sortedEvaluations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedEvaluations, page]
  )

  const handleDelete = (id: string) => {
    setEvaluations((prev) => prev.filter((e) => e.id !== id))
  }

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
      <main className="container mx-auto px-4 py-8">
        <PageHeader
          eyebrow="Models"
          title="AI Model Evaluations"
          description={
            mode === "research"
              ? "Browse model cards with benchmark breadth, result density, and technical highlights."
              : "Browse model cards with stronger emphasis on reporting breadth, evidence, and evaluation accountability."
          }
          metaItems={[
            { label: "Models", value: sortedEvaluations.length.toString() },
            { label: "Reported results", value: sortedEvaluations.reduce((sum, e) => sum + e.evaluations_count, 0).toString() },
            { label: "Reporting orgs", value: new Set(sortedEvaluations.flatMap((e) => e.evaluator_names)).size.toString() },
          ]}
        />

        <div className="mb-8 flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search models, developers, or benchmarks"
              className="pl-9"
            />
          </div>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
            <SelectTrigger className="w-[180px]">
              <ArrowUpDown className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Latest First</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
              <SelectItem value="benchmarks">Most Benchmarks</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {sortedEvaluations.length === 0 ? (
          <div className="py-12 text-center">
            <p className="mb-4 text-lg text-muted-foreground">
              No evaluations found matching your filters
            </p>
            <Button
              onClick={() => {
                setSortBy("date")
                setSearchQuery("")
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
            {pagedEvaluations.map((evaluation, index) => (
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
          totalItems={sortedEvaluations.length}
          itemLabel="models"
          onPageChange={setPage}
        />
      </main>
    </div>
  )
}
