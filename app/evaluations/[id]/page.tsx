"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { BenchmarkDetail } from "@/components/benchmark-detail"
import type { ModelEvaluationSummary } from "@/lib/eval-processing"
import { fetchModelSummary } from "@/lib/dashboard-data-client"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function BenchmarkDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [summary, setSummary] = useState<ModelEvaluationSummary | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const routeId = params.id as string

  const getVariantFromQuery = useCallback(
    (modelSummary: ModelEvaluationSummary) => {
      const requestedVersion = searchParams.get("version")

      if (!requestedVersion || modelSummary.variants.length === 0) {
        return modelSummary.variants[0] ?? null
      }

      return (
        modelSummary.variants.find(
          (variant) =>
            variant.variant_key === requestedVersion ||
            variant.variant_id === requestedVersion
        ) ?? modelSummary.variants[0] ?? null
      )
    },
    [searchParams]
  )

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

    router.push("/models")
  }, [router])

  useEffect(() => {
    const loadData = async () => {
      try {
        const modelSummary = await fetchModelSummary(routeId)
        setSummary(modelSummary)
        setSelectedVariantId(getVariantFromQuery(modelSummary)?.variant_id ?? null)
      } catch (err) {
        console.error("Failed to load evaluation:", err)
        setError("Failed to load evaluation data")
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [getVariantFromQuery, routeId])

  useEffect(() => {
    if (!summary?.variants.length) {
      return
    }

    const requestedVariant = getVariantFromQuery(summary)
    if (requestedVariant && requestedVariant.variant_id !== selectedVariantId) {
      setSelectedVariantId(requestedVariant.variant_id)
    }
  }, [getVariantFromQuery, searchParams, selectedVariantId, summary])

  const selectedVariant = useMemo(() => {
    if (!summary) {
      return null
    }

    if (!summary.variants.length) {
      return summary
    }

    return (
      summary.variants.find((variant) => variant.variant_id === selectedVariantId) ??
      summary.variants[0]
    )
  }, [selectedVariantId, summary])

  useEffect(() => {
    if (!summary) {
      return
    }

    const titleParts = [summary.model_family_name]
    if (selectedVariant && "variant_key" in selectedVariant && selectedVariant.variant_key !== "base") {
      titleParts.push(selectedVariant.variant_label)
    }

    document.title = `${titleParts.join(" · ")} - AI Evaluation Dashboard`
  }, [selectedVariant, summary])

  useEffect(() => {
    if (!summary || summary.variants.length <= 1 || !selectedVariant || !routeId) {
      return
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    const currentVersion = nextParams.get("version")
    const nextVersion = selectedVariant.variant_key

    if (currentVersion === nextVersion) {
      return
    }

    nextParams.set("version", nextVersion)
    const nextQuery = nextParams.toString()
    router.replace(
      nextQuery ? `/evaluations/${routeId}?${nextQuery}` : `/evaluations/${routeId}`,
      { scroll: false }
    )
  }, [routeId, router, searchParams, selectedVariant, summary])

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
            <Button onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </main>
      </div>
    )
  }

  const detailSummary = selectedVariant ?? summary
  const hasVariantTabs = summary.variants.length > 1

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
              onClick={handleBack}
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 text-center">
              <h2 className="text-base font-medium tracking-tight text-foreground/90 sm:text-lg">
                Evaluation details
              </h2>
            </div>
          </div>
          
          {/* Desktop layout - Grid with back button, centered title, empty space */}
          <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4">
            <Button 
              variant="ghost" 
              onClick={handleBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="text-center">
              <h2 className="text-xl font-medium tracking-tight text-foreground/90 md:text-2xl">
                Evaluation details
              </h2>
            </div>
            <div />
          </div>

          {hasVariantTabs ? (
            <div className="mt-4 rounded-2xl border border-border/70 bg-background/80 px-3 py-3 shadow-sm">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Versions
              </div>
              <Tabs
                value={selectedVariant?.variant_id ?? summary.variants[0].variant_id}
                onValueChange={setSelectedVariantId}
                className="gap-0"
              >
                <TabsList className="flex w-full flex-wrap gap-2">
                  {summary.variants.map((variant) => (
                    <TabsTrigger
                      key={variant.variant_id}
                      value={variant.variant_id}
                      className="h-auto rounded-full border border-border/80 bg-muted/30 px-3 py-1.5 text-xs sm:text-sm data-[state=active]:border-foreground/20 data-[state=active]:bg-background"
                    >
                      {variant.variant_label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          ) : null}
        </div>
      </div>
      <main className="container mx-auto px-4 py-8">
        <BenchmarkDetail summary={detailSummary} />
      </main>
    </div>
  )
}
