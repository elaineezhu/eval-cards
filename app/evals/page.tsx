"use client"

import { useState, useMemo, useEffect } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowUpDown, Search } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { EvalCard } from "@/components/eval-card"
import { ListPagination } from "@/components/list-pagination"
import type { BenchmarkEvalListItem } from "@/lib/eval-processing"
import { fetchEvalList } from "@/lib/dashboard-data-client"

const PAGE_SIZE = 40

export default function EvalsPage() {
  const { mode } = useAudienceMode()
  const [summaries, setSummaries] = useState<BenchmarkEvalListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [totalModels, setTotalModels] = useState(0)
  const [sortBy, setSortBy] = useState<"name" | "models" | "score">("name")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchEvalList()
      .then((data) => {
        setSummaries(data.evals)
        setTotalModels(data.totalModels)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let list = [...summaries]

    if (query) {
      list = list.filter((summary) => {
        const haystacks = [
          summary.evaluation_name,
          summary.metric_config.evaluation_description,
          summary.latest_source_name,
          summary.factsheet?.purpose,
          summary.factsheet?.principles_tested,
          ...summary.evaluator_names,
          ...summary.source_types,
        ]

        return haystacks.some((value) => value?.toLowerCase().includes(query))
      })
    }

    switch (sortBy) {
      case "name":
        list.sort((a, b) => a.evaluation_name.localeCompare(b.evaluation_name))
        break
      case "models":
        list.sort((a, b) => b.models_count - a.models_count)
        break
      case "score":
        list.sort((a, b) => b.avg_score_norm - a.avg_score_norm)
        break
    }
    return list
  }, [searchQuery, summaries, sortBy])

  useEffect(() => {
    setPage(1)
  }, [sortBy, searchQuery])

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
        title="Explore Evaluations"
        description={
          mode === "research"
            ? "Compare benchmark behavior, methodological framing, and performance spread."
            : "Review evaluation reporting with emphasis on coverage, evidence, and accountable documentation."
        }
        metaItems={[
          { label: "Benchmarks", value: summaries.length.toString() },
          { label: "Models", value: totalModels.toString() },
          { label: "View", value: mode === "research" ? "Research" : "Policy" },
        ]}
      />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-3 border-b border-border/50 pb-6 sm:flex-row">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search benchmarks, purpose, or source"
              className="pl-9"
            />
          </div>
          <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
            <SelectTrigger className="w-[200px]">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Latest Evaluation First</SelectItem>
              <SelectItem value="models">Most Models</SelectItem>
              <SelectItem value="score">Highest Avg Score</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pagedSummaries.map((summary, index) => (
            <EvalCard
              key={summary.evaluation_id}
              summary={summary}
              delayMs={Math.min(index * 45, 240)}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No evaluations found.
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
