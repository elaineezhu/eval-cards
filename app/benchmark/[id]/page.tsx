"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { BenchmarkDetail } from "@/components/benchmark-detail"
import { loadEvaluations, groupEvaluationsByModel, createModelSummary } from "@/lib/eval-processing"
import type { ModelEvaluationSummary } from "@/lib/eval-processing"

export default function BenchmarkDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [summary, setSummary] = useState<ModelEvaluationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const modelId = decodeURIComponent(params.id as string)
        
        // Load all benchmark files and find the matching model
        const benchmarkFiles = [
          "/benchmarks/meta-llama-3-70b.json",
          "/benchmarks/mistral-mistral-large.json",
          "/benchmarks/anthropic-claude-3-5-sonnet.json",
          "/benchmarks/openai-gpt-4o.json",
          "/benchmarks/google-gemma-2-27b.json",
          "/benchmarks/alibaba-qwen-2-72b.json",
        ]
        
        const evaluations = await loadEvaluations(benchmarkFiles)
        const grouped = groupEvaluationsByModel(evaluations)
        
        // Find the model by ID
        const modelEvals = grouped[modelId]
        
        if (!modelEvals || modelEvals.length === 0) {
          setError("Evaluation not found")
          return
        }
        
        const modelSummary = createModelSummary(modelEvals)
        setSummary(modelSummary)
        document.title = `${modelSummary.model_info.name} - AI Evaluation Dashboard`
      } catch (err) {
        console.error("Failed to load evaluation:", err)
        setError("Failed to load evaluation data")
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [params.id])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="text-lg text-muted-foreground">Loading evaluation details...</div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center h-96 space-y-4">
            <div className="text-lg text-muted-foreground">{error || "Evaluation not found"}</div>
            <Button onClick={() => router.push("/benchmarks")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Evaluations
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
          {/* Mobile layout - Back button + centered title */}
          <div className="flex items-center gap-3 sm:hidden">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => router.push("/")}
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold font-heading text-foreground text-center flex-1">
              {summary.model_info.name} Eval Card
            </h2>
          </div>
          
          {/* Desktop layout - Grid with back button, centered title, empty space */}
          <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4">
            <Button 
              variant="ghost" 
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Evaluations
            </Button>
            <h2 className="text-2xl md:text-3xl font-bold font-heading text-foreground text-center">
              {summary.model_info.name} Eval Card
            </h2>
            <div />
          </div>
        </div>
      </div>
      <main className="container mx-auto px-4 py-8">
        <BenchmarkDetail summary={summary} />
      </main>
    </div>
  )
}
