"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ArrowUpDown, Search } from "lucide-react"

import { BenchmarkEvaluationCard, type BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { ListPagination } from "@/components/list-pagination"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchDeveloperSummary } from "@/lib/dashboard-data-client"

const PAGE_SIZE = 40

export default function DeveloperDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [developer, setDeveloper] = useState<string>("")
  const [models, setModels] = useState<BenchmarkEvaluationCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"date" | "name" | "benchmarks">("date")
  const [page, setPage] = useState(1)

  const routeId = params.id as string

  const handleBack = useCallback(() => {
    router.push("/developers")
  }, [router])

  useEffect(() => {
    fetchDeveloperSummary(routeId)
      .then((summary) => {
        setDeveloper(summary.developer)
        setModels(summary.models)
      })
      .catch((err) => {
        console.error(err)
        setError("Developer not found")
      })
      .finally(() => setLoading(false))
  }, [routeId])

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
    }

    return filtered
  }, [models, searchQuery, sortBy])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, sortBy])

  const pagedModels = useMemo(
    () => filteredModels.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredModels, page]
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex h-96 items-center justify-center">
            <div className="text-lg text-muted-foreground">Loading developer...</div>
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center h-96 space-y-4">
            <div className="text-lg text-muted-foreground">{error}</div>
            <Button onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Developers
            </Button>
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
          eyebrow="Developer"
          title={developer}
          description="Model cards loaded from this developer’s index and detail files, without scanning the entire corpus."
          metaItems={[
            { label: "Models", value: models.length.toString() },
            {
              label: "Reported Results",
              value: models.reduce((sum, model) => sum + model.evaluations_count, 0).toString(),
            },
          ]}
        >
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </PageHeader>

        <div className="mb-8 mt-8 flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search models or benchmarks"
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
              <SelectItem value="benchmarks">Most Benchmark Coverage</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredModels.length === 0 ? (
          <div className="py-12 text-center text-lg text-muted-foreground">
            No models found matching your filters
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
            {pagedModels.map((model, index) => (
              <BenchmarkEvaluationCard
                key={model.id}
                data={model}
                delayMs={Math.min(index * 45, 240)}
              />
            ))}
          </div>
        )}

        <ListPagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filteredModels.length}
          itemLabel="models"
          onPageChange={setPage}
        />
      </main>
    </div>
  )
}
