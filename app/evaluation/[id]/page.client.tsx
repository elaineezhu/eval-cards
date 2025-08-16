"use client"

import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Download } from "lucide-react"
import { CATEGORIES } from "@/lib/category-data"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BENCHMARK_QUESTIONS, PROCESS_QUESTIONS } from "@/lib/category-data"

const loadEvaluationDetails = async (id: string) => {
  const evaluationFiles = [
    "/evaluations/gpt-4-turbo.json",
    "/evaluations/claude-3-sonnet.json",
    "/evaluations/gemini-pro.json",
    "/evaluations/fraud-detector.json",
  ]

  for (const file of evaluationFiles) {
    try {
      const response = await fetch(file)
      const data = await response.json()

      if (data.id === id) {
        return data
      }
    } catch (error) {
      console.error(`Failed to load evaluation data from ${file}:`, error)
    }
  }

  return null
}

export default function EvaluationDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const evaluationId = params.id as string

  const [evaluation, setEvaluation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({})
  const toggleArea = (area: string) => setExpandedAreas((p) => ({ ...p, [area]: !p[area] }))
  const [expandedNegatives, setExpandedNegatives] = useState<Record<string, boolean>>({})
  const toggleNegatives = (key: string) => setExpandedNegatives((p) => ({ ...p, [key]: !p[key] }))
  const [visibleCategories, setVisibleCategories] = useState<Record<string, boolean>>({})
  const toggleCategoryVisibility = (id: string) => setVisibleCategories((p) => ({ ...p, [id]: !p[id] }))
  const selectAll = () => {
    const map: Record<string, boolean> = {}
    ;(evaluation.selectedCategories || []).forEach((id: string) => (map[id] = true))
    setVisibleCategories(map)
  }
  const deselectAll = () => {
    const map: Record<string, boolean> = {}
    ;(evaluation.selectedCategories || []).forEach((id: string) => (map[id] = false))
    setVisibleCategories(map)
  }

  // Persist visibility in localStorage per evaluation
  const STORAGE_KEY = `eval:${evaluationId}:visibleCategories`
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setVisibleCategories(parsed)
        return
      }
    } catch (e) {
      // ignore
    }

    // if nothing saved, initialize defaults (visible)
    if (evaluation?.selectedCategories) {
      const init: Record<string, boolean> = {}
      evaluation.selectedCategories.forEach((id: string) => {
        init[id] = true
      })
      setVisibleCategories((p) => ({ ...init, ...p }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId, evaluation?.selectedCategories])

  // Determine if a category is effectively 'Not applicable' and return a reason string when available
  const naReasonForCategory = (categoryId: string): string | undefined => {
    const catEval = evaluation?.categoryEvaluations?.[categoryId]
    if (!catEval) return undefined

    // Helper to check sources for explicit NA notes
    const checkSourcesForNA = (sourcesObj: any) => {
      if (!sourcesObj) return undefined
      for (const entries of Object.values(sourcesObj)) {
        if (Array.isArray(entries)) {
          for (const ent of entries) {
            if (!ent) continue
            if (typeof ent.scope === "string" && /not applicable/i.test(ent.scope)) return ent.scope
            if (typeof ent.description === "string" && /not applicable/i.test(ent.description)) return ent.description
          }
        }
      }
      return undefined
    }

    // If there are any non-NA answers (yes/no or any non 'n/a' text), the category is applicable
    const isNonNAAnswer = (ans: any) => {
      if (ans === undefined || ans === null) return false
      if (Array.isArray(ans)) {
        return ans.some((a) => {
          const s = String(a || "").trim().toLowerCase()
          return s !== "n/a" && !/not applicable/i.test(s) && s.length > 0
        })
      }
      const s = String(ans).trim().toLowerCase()
      return s !== "n/a" && !/not applicable/i.test(s) && s.length > 0
    }

    const benchmarkQs = BENCHMARK_QUESTIONS.map((q) => q.id)
    const processQs = PROCESS_QUESTIONS.map((q) => q.id)

    // Check answers for any non-NA content
    let anyNonNA = false
    if (catEval.benchmarkAnswers) {
      for (const k of benchmarkQs) {
        if (isNonNAAnswer(catEval.benchmarkAnswers[k])) {
          anyNonNA = true
          break
        }
      }
    }
    if (!anyNonNA && catEval.processAnswers) {
      for (const k of processQs) {
        if (isNonNAAnswer(catEval.processAnswers[k])) {
          anyNonNA = true
          break
        }
      }
    }

    if (anyNonNA) return undefined

    // Only treat category as fully N/A when the category-level field `additionalAspects`
    // explicitly marks it as not applicable (page 2 of the form). Question-level markers
    // (process/benchmark source descriptions or scopes) should NOT make the entire category
    // non-selectable — they will still be shown as per-question NA in the details view.
    if (typeof catEval.additionalAspects === "string" && /not applicable/i.test(catEval.additionalAspects)) {
      return catEval.additionalAspects
    }

    return undefined
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleCategories))
    } catch (e) {
      // ignore
    }
  }, [visibleCategories, evaluationId])

  useEffect(() => {
    const loadData = async () => {
      const data = await loadEvaluationDetails(evaluationId)
      setEvaluation(data)
      setLoading(false)
    }
    loadData()
  }, [evaluationId])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading evaluation details...</p>
        </div>
      </div>
    )
  }

  if (!evaluation) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-heading mb-4">Evaluation Not Found</h1>
          <Button onClick={() => router.push("/")} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <Button onClick={() => router.push("/")} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>

        <div className="mt-3 text-center">
          <h1 className="text-3xl font-heading">{evaluation.systemName}</h1>
          <p className="text-muted-foreground">{evaluation.provider}</p>
        </div>
      </div>

      {/* System Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">System Version</p>
            <p className="font-medium">{evaluation.version}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Deployment Context</p>
            <p className="font-medium">{evaluation.deploymentContext}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Evaluation Date</p>
            <p className="font-medium">{evaluation.evaluationDate}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Evaluator</p>
            <p className="font-medium">{evaluation.evaluator}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Modality</p>
            <p className="font-medium">{evaluation.modality}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Completeness Score</p>
            <p className="font-medium">{evaluation.overallStats?.completenessScore || "N/A"}%</p>
          </div>
        </CardContent>
      </Card>

      {/* Applicable Categories - split into Capabilities & Risks with visibility toggles */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle>Applicable Categories ({evaluation.selectedCategories?.length || 0})</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={selectAll}>
                Select all
              </Button>
              <Button size="sm" variant="outline" onClick={deselectAll}>
                Deselect all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium mb-2">Capabilities</div>
              <div className="flex flex-col gap-2">
                {evaluation.selectedCategories
                  ?.map((id: string) => CATEGORIES.find((c) => c.id === id))
                  .filter(Boolean)
                  .filter((c: any) => c.type === "capability")
                  .map((category: any) => {
                    const naReason = naReasonForCategory(category.id)
                    const isNA = !!naReason
                    return (
                      <label key={category.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={isNA ? false : visibleCategories[category.id] ?? true}
                          onCheckedChange={() => !isNA && toggleCategoryVisibility(category.id)}
                          disabled={isNA}
                        />
                        {isNA ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Badge variant="outline" className="cursor-default text-muted-foreground">
                                    {category.name}
                                  </Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-sm">{naReason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Badge variant="secondary" className="cursor-pointer">
                            {category.name}
                          </Badge>
                        )}
                      </label>
                    )
                  })}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Risks</div>
              <div className="flex flex-col gap-2">
                {evaluation.selectedCategories
                  ?.map((id: string) => CATEGORIES.find((c) => c.id === id))
                  .filter(Boolean)
                  .filter((c: any) => c.type === "risk")
                  .map((category: any) => {
                    const naReason = naReasonForCategory(category.id)
                    const isNA = !!naReason
                    return (
                      <label key={category.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={isNA ? false : visibleCategories[category.id] ?? true}
                          onCheckedChange={() => !isNA && toggleCategoryVisibility(category.id)}
                          disabled={isNA}
                        />
                        {isNA ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Badge variant="outline" className="cursor-default text-muted-foreground">
                                    {category.name}
                                  </Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-sm">{naReason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Badge variant="destructive" className="cursor-pointer">
                            {category.name}
                          </Badge>
                        )}
                      </label>
                    )
                  })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overall Statistics */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Overall Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                {evaluation.overallStats?.strongCategories?.length || 0}
              </div>
              <div className="text-sm text-green-600 dark:text-green-400">Strong</div>
            </div>
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {evaluation.overallStats?.adequateCategories?.length || 0}
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">Adequate</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                {evaluation.overallStats?.weakCategories?.length || 0}
              </div>
              <div className="text-sm text-yellow-600 dark:text-yellow-400">Weak</div>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                {evaluation.overallStats?.insufficientCategories?.length || 0}
              </div>
              <div className="text-sm text-red-600 dark:text-red-400">Insufficient</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Priority Areas (show only weak/insufficient like results) */}
      {((evaluation.overallStats?.weakCategories || []).length > 0 || (evaluation.overallStats?.insufficientCategories || []).length > 0) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Priority Areas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...(evaluation.overallStats?.insufficientCategories || []), ...(evaluation.overallStats?.weakCategories || [])]
                .filter(Boolean)
                .map((catId: string) => {
                  const category = CATEGORIES.find((c) => c.id === catId)
                  return (
                    <div key={catId} className="p-3 border rounded-md flex items-center justify-between">
                      <div>
                        <div className="font-medium">{category?.name || catId}</div>
                        <div className="text-xs text-muted-foreground">{category?.description}</div>
                      </div>
                      <Badge variant={evaluation.overallStats?.insufficientCategories?.includes(catId) ? "destructive" : "outline"}>
                        {evaluation.overallStats?.insufficientCategories?.includes(catId) ? "insufficient" : "weak"}
                      </Badge>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evaluation Details */}
      {evaluation.categoryEvaluations &&
        Object.entries(evaluation.categoryEvaluations)
          .filter(([categoryId]) => visibleCategories[categoryId] ?? true)
          .map(([categoryId, data]: [string, any]) => {
            const category = CATEGORIES.find((c) => c.id === categoryId)

            // compute per-category score (yes out of applicable (yes+no)) across A & B
            const benchmarkQs = BENCHMARK_QUESTIONS.map((q) => q.id)
            const processQs = PROCESS_QUESTIONS.map((q) => q.id)
            let yesCount = 0
            let noCount = 0
            let naCount = 0

            for (const qid of benchmarkQs) {
              const raw = data.benchmarkAnswers?.[qid]
              const answers = Array.isArray(raw) ? raw : raw ? [raw] : []
              const hasYes = answers.some((a: string) => String(a).toLowerCase() === "yes")
              const hasNo = answers.some((a: string) => String(a).toLowerCase() === "no")
              const hasNA = answers.length === 0 || answers.some((a: string) => String(a).toLowerCase().includes("not applicable") || String(a).toLowerCase() === "n/a")
              if (hasYes) yesCount++
              else if (hasNo) noCount++
              else if (hasNA) naCount++
              else naCount++
            }

            for (const qid of processQs) {
              const raw = data.processAnswers?.[qid]
              const answers = Array.isArray(raw) ? raw : raw ? [raw] : []
              const hasYes = answers.some((a: string) => String(a).toLowerCase() === "yes")
              const hasNo = answers.some((a: string) => String(a).toLowerCase() === "no")
              const hasNA = answers.length === 0 || answers.some((a: string) => String(a).toLowerCase().includes("not applicable") || String(a).toLowerCase() === "n/a")
              if (hasYes) yesCount++
              else if (hasNo) noCount++
              else if (hasNA) naCount++
              else naCount++
            }

            const totalApplicable = yesCount + noCount
            const scoreText = totalApplicable > 0 ? `${yesCount}/${totalApplicable}` : "N/A"
            let rating = "Unknown"
            if (evaluation.overallStats?.strongCategories?.includes(categoryId)) rating = "Strong"
            else if (evaluation.overallStats?.adequateCategories?.includes(categoryId)) rating = "Adequate"
            else if (evaluation.overallStats?.weakCategories?.includes(categoryId)) rating = "Weak"
            else if (evaluation.overallStats?.insufficientCategories?.includes(categoryId)) rating = "Insufficient"

            const ratingClass =
              rating === "Strong"
                ? "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700"
                : rating === "Adequate"
                ? "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700"
                : rating === "Weak"
                ? "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800"
                : "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700"

            return (
              <Card key={categoryId} className="mb-6">
                <CardHeader>
                  <div className="flex items-start justify-between w-full gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {category?.name || categoryId}
                        <Badge variant={category?.type === "capability" ? "secondary" : "destructive"}>
                          {category?.type || "unknown"}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{category?.description}</p>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Score</div>
                      <div className="font-semibold">{scoreText}</div>
                      <div className="mt-2">
                        <span className={ratingClass}>{rating}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Benchmark Questions */}
                  {data.benchmarkSources && (
                    <div>
                      <h4 className="font-semibold mb-3">Part A: Benchmark & Testing</h4>
                      <div className="space-y-4">
                        {(() => {
                          const entries = Object.entries(data.benchmarkSources || {}) as [string, any][]
                          const yesItems: any[] = []
                          const noItems: any[] = []
                          const naItems: any[] = []

                          // iterate the union of known source keys and answer keys so we show questions
                          const canonicalKeys = BENCHMARK_QUESTIONS.map((q) => q.id)
                          const answerKeys = Object.keys(data.benchmarkAnswers || {})
                          const sourceKeys = Object.keys(data.benchmarkSources || {})
                          const keySet = new Set<string>([...canonicalKeys, ...answerKeys, ...sourceKeys])
                          for (const questionId of Array.from(keySet)) {
                            const sources = data.benchmarkSources?.[questionId] || []
                            const qText = BENCHMARK_QUESTIONS.find((x) => x.id === questionId)?.text || questionId
                            const rawAnswer = data.benchmarkAnswers?.[questionId]
                            const answers = Array.isArray(rawAnswer) ? rawAnswer : rawAnswer ? [rawAnswer] : []
                            const hasYes = answers.some((a: string) => String(a).toLowerCase() === "yes")
                            const hasNo = answers.some((a: string) => String(a).toLowerCase() === "no")
                            const hasNA = answers.length === 0 || answers.some((a: string) => String(a).toLowerCase().includes("not applicable") || String(a).toLowerCase() === "n/a")

                            const reason =
                              sources?.[0]?.scope || sources?.[0]?.description || data.additionalAspects || (hasNA ? "Not applicable" : undefined)

                            if (hasYes) yesItems.push({ questionId, qText, sources })
                            else if (hasNo) noItems.push({ questionId, qText })
                            else if (hasNA) naItems.push({ questionId, qText, reason })
                            else naItems.push({ questionId, qText, reason: reason || "Not applicable" })
                          }

                          return (
                            <>
                              {yesItems.map((it) => {
                                const key = `bench-${categoryId}-${it.questionId}`
                                return (
                                  <div key={it.questionId} className="border rounded-lg p-4">
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => toggleNegatives(key)}
                                      className="flex items-center gap-2 mb-2 justify-between cursor-pointer"
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="font-medium">{it.questionId}:</span>
                                        <div className="text-sm">{it.qText}</div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">yes</span>
                                      </div>
                                    </div>

                                    {expandedNegatives[key] && (() => {
                                      const cards = (it.sources || []).flatMap((src: any) => {
                                        const names = String(src.benchmarkName || '')
                                          .split(',')
                                          .map((s: string) => s.trim())
                                          .filter(Boolean)

                                        const scoreParts = String(src.score || '')
                                          .split(',')
                                          .map((s: string) => s.trim())
                                          .filter(Boolean)

                                        return (names.length > 0 ? names : ['Benchmark']).map((name: string, idx: number) => {
                                          // determine score for this benchmark (positional or by name) or fallback to any numeric
                                          let scoreNum: number | undefined
                                          if (scoreParts.length === names.length && scoreParts[idx]) {
                                            const m = scoreParts[idx].match(/(\d+(?:\.\d+)?)/)
                                            if (m) scoreNum = parseFloat(m[1])
                                          } else if (scoreParts.length > 0) {
                                            const byName = scoreParts.find((p: string) => p.toLowerCase().includes(name.toLowerCase()))
                                            const m = (byName || scoreParts[0]).match(/(\d+(?:\.\d+)?)/)
                                            if (m) scoreNum = parseFloat(m[1])
                                          } else if (src?.score) {
                                            const m = String(src.score).match(/(\d+(?:\.\d+)?)/)
                                            if (m) scoreNum = parseFloat(m[1])
                                          }

                                          return (
                                            <div key={`${it.questionId}-${name}-${idx}`} className="p-4 border rounded-lg bg-background">
                                              <div className="flex items-start justify-between">
                                                <div className="text-xs inline-flex items-center rounded-full px-2 py-1 bg-indigo-50 text-indigo-700">Percentage</div>
                                                <div className="text-2xl font-bold text-indigo-600">{scoreNum != null ? `${scoreNum}%` : '—'}</div>
                                              </div>

                                              <div className="mt-3 text-lg font-semibold">{name}</div>

                                              {scoreNum != null && (
                                                <div className="mt-3">
                                                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-2 bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, scoreNum))}%` }} />
                                                  </div>
                                                </div>
                                              )}

                                              <div className="mt-3 space-y-2 text-sm">
                                                <div>
                                                  <span className="text-muted-foreground">Source:</span>{' '}
                                                  {src.url ? (
                                                    <a className="text-primary underline" href={src.url} target="_blank" rel="noreferrer">
                                                      {src.url}
                                                    </a>
                                                  ) : (
                                                    '—'
                                                  )}
                                                </div>
                                                <div>
                                                  <span className="text-muted-foreground">Type:</span> {src.sourceType || src.documentType || '—'}
                                                </div>
                                                {src.metrics && (
                                                  <div>
                                                    <span className="text-muted-foreground">Metric:</span> {src.metrics}
                                                  </div>
                                                )}
                                                {src.confidenceInterval && (
                                                  <div>
                                                    <span className="text-muted-foreground">Confidence Interval:</span> {src.confidenceInterval}
                                                  </div>
                                                )}
                                                {src.description && (
                                                  <div className="mt-2 p-2 bg-muted/40 rounded text-sm">{src.description}</div>
                                                )}
                                              </div>
                                            </div>
                                          )
                                        })
                                      })

                                      if (cards.length === 0) return <div className="text-sm text-muted-foreground">No benchmark details available.</div>

                                      return <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{cards}</div>
                                    })()}
                                  </div>
                                )
                              })}

                              {noItems.map((it) => (
                                <div key={it.questionId} className="border rounded-lg p-4">
                                  <div className="flex items-center gap-2 mb-2 justify-between">
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium">{it.questionId}:</span>
                                      <div className="text-sm">{it.qText}</div>
                                    </div>
                                    <div>
                                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">no</span>
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {naItems.length > 0 && (
                                <div className="border rounded-lg p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="font-medium">Not applicable ({naItems.length})</div>
                                    <button onClick={() => toggleNegatives(`bench-na-${categoryId}`)} className="text-sm text-primary underline">
                                      {expandedNegatives[`bench-na-${categoryId}`] ? "Hide" : "Show"}
                                    </button>
                                  </div>

                                  {expandedNegatives[`bench-na-${categoryId}`] && (
                                    <div className="mt-3 space-y-2">
                                      {naItems.map((it) => (
                                        <div key={it.questionId} className="p-2 bg-muted rounded">
                                          <div className="flex items-center justify-between">
                                            <div className="text-sm">
                                              <span className="font-medium">{it.questionId}:</span> {it.qText}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Reason: {it.reason}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Process Questions */}
                  {data.processSources && (
                    <div>
                      <h4 className="font-semibold mb-3">Part B: Documentation & Process</h4>
                      <div className="space-y-4">
                        {(() => {
                          const entries = Object.entries(data.processSources || {}) as [string, any][]
                          const yesItems: any[] = []
                          const noItems: any[] = []
                          const naItems: any[] = []

                          const canonicalKeys = PROCESS_QUESTIONS.map((q) => q.id)
                          const answerKeys = Object.keys(data.processAnswers || {})
                          const sourceKeys = Object.keys(data.processSources || {})
                          const keySet = new Set<string>([...canonicalKeys, ...answerKeys, ...sourceKeys])
                          for (const questionId of Array.from(keySet)) {
                            const sources = data.processSources?.[questionId] || []
                            const qText = PROCESS_QUESTIONS.find((x) => x.id === questionId)?.text || questionId
                            const rawAnswer = data.processAnswers?.[questionId]
                            const answers = Array.isArray(rawAnswer) ? rawAnswer : rawAnswer ? [rawAnswer] : []
                            const hasYes = answers.some((a: string) => String(a).toLowerCase() === "yes")
                            const hasNo = answers.some((a: string) => String(a).toLowerCase() === "no")
                            const hasNA = answers.length === 0 || answers.some((a: string) => String(a).toLowerCase().includes("not applicable") || String(a).toLowerCase() === "n/a")

                            const reason = sources?.[0]?.scope || sources?.[0]?.description || data.additionalAspects || (hasNA ? "Not applicable" : undefined)

                            if (hasYes) yesItems.push({ questionId, qText, sources })
                            else if (hasNo) noItems.push({ questionId, qText })
                            else if (hasNA) naItems.push({ questionId, qText, reason })
                            else naItems.push({ questionId, qText, reason: reason || "Not applicable" })
                          }

                          return (
                            <>
                              {yesItems.map((it) => {
                                const key = `proc-${categoryId}-${it.questionId}`
                                return (
                                  <div key={it.questionId} className="border rounded-lg p-4">
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => toggleNegatives(key)}
                                      className="flex items-center gap-2 mb-2 justify-between cursor-pointer"
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="font-medium">{it.questionId}:</span>
                                        <div className="text-sm">{it.qText}</div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">yes</span>
                                        </div>
                                    </div>

                                    {expandedNegatives[key] && (
                                      <div className="mt-3 space-y-3">
                                        {(it.sources || []).map((src: any, i: number) => (
                                          <div key={i} className="p-3 bg-muted rounded">
                                            <div className="grid grid-cols-1 gap-2 text-sm">
                                              <div>
                                                <span className="text-muted-foreground">URL:</span> {src?.url || '—'}
                                              </div>
                                              <div>
                                                <span className="text-muted-foreground">Document Type:</span> {src?.documentType || src?.sourceType || '—'}
                                              </div>
                                            </div>
                                            {src?.description && (
                                              <div className="mt-2 text-sm">
                                                <span className="text-muted-foreground">Description:</span> {src.description}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}

                              {noItems.map((it) => (
                                <div key={it.questionId} className="border rounded-lg p-4">
                                  <div className="flex items-center gap-2 mb-2 justify-between">
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium">{it.questionId}:</span>
                                      <div className="text-sm">{it.qText}</div>
                                    </div>
                                    <div>
                                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">no</span>
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {naItems.length > 0 && (
                                <div className="border rounded-lg p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="font-medium">Not applicable ({naItems.length})</div>
                                    <button onClick={() => toggleNegatives(`proc-na-${categoryId}`)} className="text-sm text-primary underline">
                                      {expandedNegatives[`proc-na-${categoryId}`] ? "Hide" : "Show"}
                                    </button>
                                  </div>

                                  {expandedNegatives[`proc-na-${categoryId}`] && (
                                    <div className="mt-3 space-y-2">
                                      {naItems.map((it) => (
                                        <div key={it.questionId} className="p-2 bg-muted rounded">
                                          <div className="flex items-center justify-between">
                                            <div className="text-sm">
                                              <span className="font-medium">{it.questionId}:</span> {it.qText}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Reason: {it.reason}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Additional Aspects */}
                  {data.additionalAspects && (
                    <div>
                      <h4 className="font-semibold mb-3">Part C: Additional Aspects</h4>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm">{data.additionalAspects}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
    </div>
  )
}
