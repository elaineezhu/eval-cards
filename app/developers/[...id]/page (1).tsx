"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ArrowUpDown, Search, Tag } from "lucide-react"

import { BenchmarkEvaluationCard, type BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { ListPagination } from "@/components/list-pagination"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { BenchmarkCard } from "@/lib/benchmark-schema"
import { lookupBenchmarkCard } from "@/lib/benchmark-metadata-utils"
import { fetchDeveloperSummary, fetchBenchmarkMetadata } from "@/lib/dashboard-data-client"

const PAGE_SIZE = 40

export default function DeveloperDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [developer, setDeveloper] = useState<string>("")
  const [models, setModels] = useState<BenchmarkEvaluationCardData[]>([])
  const [benchmarkCards, setBenchmarkCards] = useState<Record<string, BenchmarkCard>>({})
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

  // Collect all unique domains from benchmarks this developer's models are evaluated on
  const domainCoverage = useMemo(() => {
    const domainMap = new Map<string, Set<string>>() // domain → set of benchmark names
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
          description={`Evaluation coverage across ${models.length} model${models.length !== 1 ? "s" : ""} from this developer, including benchmark domain coverage where metadata is available.`}
          metaItems={[
            { label: "Models", value: models.length.toString() },
            {
              label: "Reported Results",
              value: models.reduce((sum, model) => sum + model.evaluations_count, 0).toString(),
            },
            ...(domainCoverage.length > 0
              ? [{ label: "Domains covered", value: domainCoverage.length.toString() }]
              : []),
          ]}
        >
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </PageHeader>

        {/* Domain coverage strip */}
        {domainCoverage.length > 0 && (
          <div className="mb-4 mt-6 rounded-[1.5rem] border border-border/70 bg-muted/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              Benchmark domain coverage
            </div>
            <div className="flex flex-wrap gap-2">
              {domainCoverage.map(({ domain, count }) => (
                <span
                  key={domain}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium capitalize"
                >
                  {domain}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

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
                benchmarkCards={benchmarkCards}
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
