"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { EvalDetail } from "@/components/eval-detail"
import type { BenchmarkEvalSummary } from "@/lib/eval-processing"
import { fetchEvalSummary } from "@/lib/dashboard-data-client"

export default function EvalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [summary, setSummary] = useState<BenchmarkEvalSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined") {
      const referrer = document.referrer

      if (referrer) {
        try {
          const referrerUrl = new URL(referrer)
          if (referrerUrl.origin === window.location.origin) {
            router.back()
            return
          }
        } catch {
          // Fall through to a deterministic in-app destination.
        }
      }
    }

    router.push("/evals")
  }, [router])

  useEffect(() => {
    const load = async () => {
      try {
        const evalId = decodeURIComponent(params.id as string)
        const found = await fetchEvalSummary(evalId)
        setSummary(found)
        document.title = `${found.evaluation_name} | Single Benchmark`
      } catch (err) {
        console.error(err)
        setError("Evaluation not found")
      } finally {
        setLoading(false)
      }
    }
    load()
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
            <div className="text-lg text-muted-foreground">{error ?? "Evaluation not found"}</div>
            <Button onClick={handleBack}>
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
          {/* Mobile */}
          <div className="flex items-center gap-3 sm:hidden">
            <Button variant="ghost" size="sm" onClick={handleBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 text-center">
              <h2 className="text-base font-medium tracking-tight text-foreground/90 sm:text-lg">Single benchmark details</h2>
            </div>
          </div>
          {/* Desktop */}
          <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4">
            <Button variant="ghost" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="text-center">
              <h2 className="text-xl font-medium tracking-tight text-foreground/90 md:text-2xl">
                Single benchmark details
              </h2>
            </div>
            <div />
          </div>
        </div>
      </div>
      <main className="container mx-auto px-4 py-8">
        <EvalDetail summary={summary} />
      </main>
    </div>
  )
}
