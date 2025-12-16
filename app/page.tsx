"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Filter, ArrowUpDown, Info } from "lucide-react"
import { BenchmarkEvaluationCard, type BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { processEvaluationsToCards } from "@/lib/eval-processing"
import type { CategoryType } from "@/lib/benchmark-schema"
import { EVALUATION_CATEGORIES } from "@/lib/benchmark-schema"

export default function HomePage() {
  const [evaluations, setEvaluations] = useState<BenchmarkEvaluationCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<"date" | "name" | "benchmarks">("date")
  const [filterCategory, setFilterCategory] = useState<"all" | CategoryType>("all")

  // Load evaluations on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Discover all benchmark files dynamically
        const benchmarkFiles = [
          "/benchmarks/meta-llama-3-70b.json",
          "/benchmarks/mistral-mistral-large.json",
          "/benchmarks/anthropic-claude-3-5-sonnet.json",
          "/benchmarks/openai-gpt-4o.json",
          "/benchmarks/google-gemma-2-27b.json",
          "/benchmarks/alibaba-qwen-2-72b.json",
        ]
        
        const cards = await processEvaluationsToCards(benchmarkFiles)
        setEvaluations(cards)
      } catch (error) {
        console.error("Failed to load evaluations:", error)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  // Filter evaluations
  const filteredEvaluations = useMemo(() => {
    let filtered = [...evaluations]
    
    // Filter by specific category
    if (filterCategory !== "all") {
      filtered = filtered.filter((eval_) => 
        eval_.categories.includes(filterCategory)
      )
    }
    
    return filtered
  }, [evaluations, filterCategory])

  // Sort evaluations
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
          title="Eval Cards Platform"
          description="A central platform for informative, transparent, and comparable AI evaluations. Explore standardized reports across models and benchmarks."
        />

        <Alert className="mb-8 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle>Demo Environment</AlertTitle>
          <AlertDescription>
            This is a demonstration of the evaluation dashboard. The data shown below is currently dummy data generated for testing purposes and does not reflect actual model performance.
          </AlertDescription>
        </Alert>

        {/* Filters and Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex gap-2 flex-1">
            <Select 
              value={filterCategory} 
              onValueChange={(value) => setFilterCategory(value as any)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Array.from(EVALUATION_CATEGORIES).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
            <SelectTrigger className="w-[180px]">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Latest First</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
              <SelectItem value="benchmarks">Most Benchmarks</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 border rounded-lg">
            <div className="text-2xl font-bold">{sortedEvaluations.length}</div>
            <div className="text-sm text-muted-foreground">Models Evaluated</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="text-2xl font-bold">
              {sortedEvaluations.reduce((sum, e) => sum + e.evaluations_count, 0)}
            </div>
            <div className="text-sm text-muted-foreground">Total Evaluations</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="text-2xl font-bold">
              {new Set(sortedEvaluations.flatMap(e => e.categories)).size}
            </div>
            <div className="text-sm text-muted-foreground">Categories Covered</div>
          </div>
        </div>

        {/* Evaluation Cards */}
        {sortedEvaluations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg text-muted-foreground mb-4">
              No evaluations found matching your filters
            </p>
            <Button onClick={() => {
              setFilterCategory("all")
            }}>
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {sortedEvaluations.map((evaluation) => (
              <BenchmarkEvaluationCard
                key={evaluation.id}
                data={evaluation}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
