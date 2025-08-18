"use client"

import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Download, Eye, EyeOff, Info, Database, Globe, Calendar, User, Building, Cpu, MonitorSpeaker, Hash, Tags, Clock, Activity, Settings,
  // Section icons
  Target, BarChart3, Shield, AlertTriangle, 
  // Capability icons
  MessageCircle, Heart, Brain, Lightbulb, BookOpen, Camera, Hand, Search, Bot,
  // Risk icons
  Skull, AlertCircle, Lock, Zap, Gavel, Users, Leaf, TrendingDown, Scale, Factory } from "lucide-react"
import { getAllCategories, getCategoryById, getBenchmarkQuestions, getProcessQuestions } from "@/lib/schema"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { naReasonForCategoryFromEval } from "@/lib/na-utils"
import Link from "next/link"

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

// Category icon mapping
const getCategoryIcon = (categoryId: string) => {
  const iconMap: Record<string, any> = {
    // Capabilities
    "language-communication": MessageCircle,
    "social-intelligence": Heart,
    "problem-solving": Brain,
    "creativity-innovation": Lightbulb,
    "learning-memory": BookOpen,
    "perception-vision": Camera,
    "physical-manipulation": Hand,
    "metacognition": Search,
    "robotic-intelligence": Bot,
    
    // Risks
    "harmful-content": Skull,
    "information-integrity": AlertCircle,
    "privacy-data": Lock,
    "bias-fairness": Scale,
    "security-robustness": Shield,
    "dangerous-capabilities": Zap,
    "human-ai-interaction": Users,
    "environmental-impact": Leaf,
    "economic-displacement": TrendingDown,
    "governance-accountability": Gavel,
    "value-chain": Factory
  }
  
  return iconMap[categoryId] || Target
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
  getAllCategories().forEach((c) => (map[c.id] = true))
  setVisibleCategories(map)
  }
  const deselectAll = () => {
  const map: Record<string, boolean> = {}
  getAllCategories().forEach((c) => (map[c.id] = false))
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

    // if nothing saved, initialize defaults (visible for applicable categories)
    if (evaluation) {
      const init: Record<string, boolean> = {}
      // default: eyes open (visible) for all categories unless explicitly NA
      getAllCategories().forEach((c) => {
        const na = naReasonForCategory(c.id)
        init[c.id] = !na
      })
      setVisibleCategories((p) => ({ ...init, ...p }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId, evaluation?.selectedCategories])

  // Proxy to the centralized helper
  const naReasonForCategory = (categoryId: string): string | undefined => {
    const catEval = evaluation?.categoryEvaluations?.[categoryId]
    if (!catEval) return undefined
  const benchmarkQs = getBenchmarkQuestions().map((q) => q.id)
  const processQs = getProcessQuestions().map((q) => q.id)
    return naReasonForCategoryFromEval(catEval, benchmarkQs, processQs)
  }

  // Compute overall stats from evaluation data dynamically
  const computedStats = (() => {
    const strongCategories: string[] = []
    const adequateCategories: string[] = []
    const weakCategories: string[] = []
    const insufficientCategories: string[] = []

    const allEntries = evaluation?.categoryEvaluations || {}
    for (const [catId, catData] of Object.entries(allEntries)) {
      // Count yes/no across A & B
      let yes = 0
      let no = 0
      let na = 0
      const bQs = getBenchmarkQuestions().map((q) => q.id)
      const pQs = getProcessQuestions().map((q) => q.id)
      for (const qid of [...bQs, ...pQs]) {
        const raw = (catData as any).benchmarkAnswers?.[qid] ?? (catData as any).processAnswers?.[qid]
        const arr = Array.isArray(raw) ? raw : raw ? [raw] : []
        const hasYes = arr.some((a: string) => String(a).toLowerCase() === "yes")
        const hasNo = arr.some((a: string) => String(a).toLowerCase() === "no")
        if (hasYes) yes++
        else if (hasNo) no++
        else na++
      }

      const totalApplicable = yes + no
      const ratio = totalApplicable > 0 ? yes / totalApplicable : 0
      if (ratio >= 0.8) strongCategories.push(catId)
      else if (ratio >= 0.6) adequateCategories.push(catId)
      else if (ratio >= 0.4) weakCategories.push(catId)
      else insufficientCategories.push(catId)
    }

    return { strongCategories, adequateCategories, weakCategories, insufficientCategories }
  })()

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
          <div className="flex items-center gap-2">
            <Link href="/about">
              <Button variant="ghost" size="sm">
                <Info className="h-4 w-4 mr-2" />
                About
              </Button>
            </Link>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        <div className="mt-3 text-center">
          <h1 className="text-3xl font-heading">{evaluation.systemName}</h1>
          <p className="text-muted-foreground">{evaluation.provider}</p>
        </div>
      </div>

      {/* System Information (detailed) */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                System Information
              </CardTitle>
              <p className="text-sm text-muted-foreground">Metadata about the evaluated system</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">System Name</p>
                  <p className="text-lg font-semibold text-foreground mt-1">{evaluation.systemName || evaluation.systemName || "—"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-50 dark:bg-green-950 rounded-lg">
                  <Tags className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">System Version</p>
                  <p className="text-lg font-semibold text-foreground mt-1">{evaluation.version || evaluation.modelTag || "—"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-50 dark:bg-purple-950 rounded-lg">
                  <Building className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Provider</p>
                  <p className="text-lg font-semibold text-foreground mt-1">{evaluation.provider || "—"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950 rounded-lg">
                  <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">URL</p>
                  <p className="text-lg font-semibold text-foreground mt-1 break-all">
                    {evaluation.url ? (
                      <a href={evaluation.url} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 underline decoration-primary/30 hover:decoration-primary/60 transition-colors">
                        {evaluation.url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-cyan-50 dark:bg-cyan-950 rounded-lg">
                  <Globe className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Deployment Context</p>
                  <p className="text-lg font-semibold text-foreground mt-1">{evaluation.deploymentContext || (evaluation.deploymentContexts && evaluation.deploymentContexts.join(", ")) || "—"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
                  <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Input Modalities</p>
                  <div className="text-lg font-semibold text-foreground mt-1">
                    {evaluation.inputModalities?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {evaluation.inputModalities.map((modality: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {modality}
                          </Badge>
                        ))}
                      </div>
                    ) : "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-50 dark:bg-rose-950 rounded-lg">
                  <MonitorSpeaker className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Output Modalities</p>
                  <div className="text-lg font-semibold text-foreground mt-1">
                    {evaluation.outputModalities?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {evaluation.outputModalities.map((modality: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {modality}
                          </Badge>
                        ))}
                      </div>
                    ) : "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded-lg">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Knowledge Cutoff</p>
                  <p className="text-lg font-semibold text-foreground mt-1">{evaluation.knowledgeCutoff || "—"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row - Metadata Cards */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/50 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">System ID</div>
              </div>
              <div className="font-mono text-sm text-blue-900 dark:text-blue-100 break-all">{evaluation.id || "—"}</div>
            </div>

            <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/50 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <Tags className="h-4 w-4 text-green-600 dark:text-green-400" />
                <div className="text-sm font-medium text-green-700 dark:text-green-300">System Types</div>
              </div>
              <div className="font-medium text-green-900 dark:text-green-100">{evaluation.systemTypes?.length ? evaluation.systemTypes.join(", ") : "—"}</div>
            </div>

            <div className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/50 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <div className="text-sm font-medium text-purple-700 dark:text-purple-300">Evaluation Date</div>
              </div>
              <div className="font-medium text-purple-900 dark:text-purple-100">{evaluation.evaluationDate || "—"}</div>
            </div>
          </div>

          {/* Additional Bottom Fields */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-violet-50 dark:bg-violet-950 rounded-lg">
                <User className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Evaluator</p>
                <p className="text-lg font-semibold text-foreground mt-1">{evaluation.evaluator || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-pink-50 dark:bg-pink-950 rounded-lg">
                <Activity className="h-4 w-4 text-pink-600 dark:text-pink-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Completeness Score</p>
                <p className="text-lg font-semibold text-foreground mt-1">{evaluation.overallStats?.completenessScore ? `${evaluation.overallStats.completenessScore}%` : "N/A"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Applicable Categories - split into Capabilities & Risks with visibility toggles */}
      <Card className="mb-6">
        <CardHeader>
            <div className="flex items-center justify-between w-full">
              {/* compute applicable count as non-NA categories from the full CATEGORIES list */}
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-green-600" />
                Applicable Categories ({
                  getAllCategories().filter((c) => {
                    const sel = new Set(evaluation.selectedCategories || [])
                    // treat as applicable only when selected and not explicitly NA
                    const na = naReasonForCategory(c.id)
                    return sel.has(c.id) && !na
                  }).length
                })
              </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={selectAll}>
                Show all
              </Button>
              <Button size="sm" variant="outline" onClick={deselectAll}>
                Hide all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium mb-2">Capabilities</div>
              <div className="flex flex-col gap-2">
                {getAllCategories().filter((c) => c.type === "capability").map((category) => {
                    const sel = new Set(evaluation.selectedCategories || [])
                    const naReason = naReasonForCategory(category.id)
                    const isSelected = sel.has(category.id)
                    const isNA = !isSelected || !!naReason
                    return (
                      <label key={category.id} className="flex items-center gap-2">
                        {isNA ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button variant="ghost" size="sm" className="p-0" disabled>
                                    <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-sm">{naReason ?? "Not applicable"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-0"
                            onClick={() => toggleCategoryVisibility(category.id)}
                            aria-pressed={!!visibleCategories[category.id]}
                            aria-label={visibleCategories[category.id] ? `Hide ${category.name}` : `Show ${category.name}`}
                          >
                            {visibleCategories[category.id] ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </Button>
                        )}
                        <span className="ml-2">
                          {isNA ? (
                              <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-muted/30 text-muted-foreground border-2 border-purple-500">
                                {(() => {
                                  const IconComponent = getCategoryIcon(category.id)
                                  return (
                                    <>
                                      <IconComponent className="h-3 w-3 mr-1" />
                                      {getCategoryById(category.id)?.name || category.name}
                                    </>
                                  )
                                })()}
                              </span>
                            ) : (
                              <Badge variant="secondary" className="cursor-pointer">
                                {(() => {
                                  const IconComponent = getCategoryIcon(category.id)
                                  return (
                                    <>
                                      <IconComponent className="h-3 w-3 mr-1" />
                                      {getCategoryById(category.id)?.name || category.name}
                                    </>
                                  )
                                })()}
                              </Badge>
                            )}
                        </span>
                      </label>
                    )
                  })}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Risks</div>
              <div className="flex flex-col gap-2">
                {getAllCategories().filter((c) => c.type === "risk").map((category) => {
                    const sel = new Set(evaluation.selectedCategories || [])
                    const naReason = naReasonForCategory(category.id)
                    const isSelected = sel.has(category.id)
                    const isNA = !isSelected || !!naReason
                    return (
                      <label key={category.id} className="flex items-center gap-2">
                        {isNA ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button variant="ghost" size="sm" className="p-0" disabled>
                                    <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-sm">{naReason ?? "Not applicable"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-0"
                            onClick={() => toggleCategoryVisibility(category.id)}
                            aria-pressed={!!visibleCategories[category.id]}
                            aria-label={visibleCategories[category.id] ? `Hide ${category.name}` : `Show ${category.name}`}
                          >
                            {visibleCategories[category.id] ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </Button>
                        )}
                        <span className="ml-2">
                          {isNA ? (
                            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-muted/30 text-muted-foreground border-2 border-red-500">
                              {(() => {
                                const IconComponent = getCategoryIcon(category.id)
                                return (
                                  <>
                                    <IconComponent className="h-3 w-3 mr-1" />
                                    {getCategoryById(category.id)?.name || category.name}
                                  </>
                                )
                              })()}
                            </span>
                          ) : (
                            <Badge variant="destructive" className="cursor-pointer">
                              {(() => {
                                const IconComponent = getCategoryIcon(category.id)
                                return (
                                  <>
                                    <IconComponent className="h-3 w-3 mr-1" />
                                    {getCategoryById(category.id)?.name || category.name}
                                  </>
                                )
                              })()}
                            </Badge>
                          )}
                        </span>
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
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Overall Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                {computedStats.strongCategories.length}
              </div>
              <div className="text-sm text-green-600 dark:text-green-400">Strong</div>
            </div>
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {computedStats.adequateCategories.length}
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">Adequate</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                {computedStats.weakCategories.length}
              </div>
              <div className="text-sm text-yellow-600 dark:text-yellow-400">Weak</div>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                {computedStats.insufficientCategories.length}
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
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Priority Areas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...(evaluation.overallStats?.insufficientCategories || []), ...(evaluation.overallStats?.weakCategories || [])]
                .filter(Boolean)
                .map((catId: string) => {
                  const category = getCategoryById(catId)
                  return (
                    <div key={catId} className="p-3 border rounded-md flex items-center justify-between">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {(() => {
                            const IconComponent = getCategoryIcon(catId)
                            return <IconComponent className="h-4 w-4 text-muted-foreground" />
                          })()}
                          {category?.name || catId}
                        </div>
                        <div className="text-xs text-muted-foreground ml-6">{category?.description}</div>
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
          .filter(([categoryId]) => {
            // hide category cards for categories explicitly marked Not Applicable
            const na = naReasonForCategory(categoryId)
            return !na && (visibleCategories[categoryId] ?? true)
          })
      .map(([categoryId, data]: [string, any]) => {
    const category = getCategoryById(categoryId)

            // compute per-category score (yes out of applicable (yes+no)) across A & B
            const benchmarkQs = getBenchmarkQuestions().map((q) => q.id)
            const processQs = getProcessQuestions().map((q) => q.id)
            let yesCount = 0
            let noCount = 0
            let naCount = 0

            for (const qid of getBenchmarkQuestions().map((q) => q.id)) {
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

            for (const qid of getProcessQuestions().map((q) => q.id)) {
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
            if (computedStats.strongCategories.includes(categoryId)) rating = "Strong"
            else if (computedStats.adequateCategories.includes(categoryId)) rating = "Adequate"
            else if (computedStats.weakCategories.includes(categoryId)) rating = "Weak"
            else if (computedStats.insufficientCategories.includes(categoryId)) rating = "Insufficient"

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
                        {(() => {
                          const IconComponent = getCategoryIcon(categoryId)
                          return <IconComponent className="h-5 w-5" />
                        })()}
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
                        {getBenchmarkQuestions().map((q) => {
                          const questionId = q.id
                          const sources = data.benchmarkSources?.[questionId] || []
                          const qText = q.text
                          const rawAnswer = data.benchmarkAnswers?.[questionId]
                          const answers = Array.isArray(rawAnswer) ? rawAnswer : rawAnswer ? [rawAnswer] : []
                          const hasYes = answers.some((a: string) => String(a).toLowerCase() === "yes")
                          const hasNo = answers.some((a: string) => String(a).toLowerCase() === "no")
                          const hasNA = answers.length === 0 || answers.some((a: string) => String(a).toLowerCase().includes("not applicable") || String(a).toLowerCase() === "n/a")

                          const key = `bench-${categoryId}-${questionId}`

                          return (
                            <div key={questionId} className="border rounded-lg overflow-hidden">
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleNegatives(key)}
                                className="p-4 hover:bg-muted/20 cursor-pointer transition-colors"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="font-semibold text-sm bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded text-blue-700 dark:text-blue-300">
                                        {questionId}
                                      </span>
                                      {hasYes ? (
                                        <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100">
                                          ✓ Yes
                                        </Badge>
                                      ) : hasNo ? (
                                        <Badge variant="destructive">
                                          ✗ No
                                        </Badge>
                                      ) : (
                                        <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                                          N/A
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-sm text-muted-foreground leading-relaxed">{qText}</div>
                                    {hasYes && (
                                      <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                                        Click to {expandedNegatives[key] ? 'hide' : 'view'} benchmark details
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {hasYes && expandedNegatives[key] && (() => {
                                const cards = (sources || []).flatMap((src: any) => {
                                  const names = String(src.benchmarkName || '')
                                    .split(',')
                                    .map((s: string) => s.trim())
                                    .filter(Boolean)

                                  const scoreParts = String(src.score || '')
                                    .split(',')
                                    .map((s: string) => s.trim())
                                    .filter(Boolean)

                                  return (names.length > 0 ? names : ['Benchmark']).map((name: string, idx: number) => {
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
                                      <div key={`${questionId}-${name}-${idx}`} className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 hover:shadow-sm transition-shadow">
                                        {/* Header with score */}
                                        <div className="flex items-center justify-between mb-3">
                                          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded-full">
                                            Percentage Score
                                          </div>
                                          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                                            {scoreNum != null ? `${scoreNum}%` : '—'}
                                          </div>
                                        </div>

                                        {/* Benchmark name */}
                                        <div className="mb-3">
                                          <h4 className="font-semibold text-lg text-foreground leading-tight">{name}</h4>
                                        </div>

                                        {/* Progress bar */}
                                        {scoreNum != null && (
                                          <div className="mb-4">
                                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                              <div 
                                                className="h-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out" 
                                                style={{ width: `${Math.max(0, Math.min(100, scoreNum))}%` }} 
                                              />
                                            </div>
                                          </div>
                                        )}

                                        {/* Details */}
                                        <div className="space-y-2 text-sm">
                                          <div className="flex items-start gap-2">
                                            <span className="text-muted-foreground font-medium min-w-[60px]">Source:</span>
                                            <div className="flex-1 min-w-0">
                                              {src.url ? (
                                                <a 
                                                  className="text-primary hover:text-primary/80 underline decoration-primary/30 hover:decoration-primary/60 transition-colors break-all" 
                                                  href={src.url} 
                                                  target="_blank" 
                                                  rel="noreferrer"
                                                  title={src.url}
                                                >
                                                  {src.url.length > 50 ? `${src.url.substring(0, 50)}...` : src.url}
                                                </a>
                                              ) : (
                                                <span className="text-muted-foreground">—</span>
                                              )}
                                            </div>
                                          </div>
                                          
                                          <div className="flex items-center gap-2">
                                            <span className="text-muted-foreground font-medium min-w-[60px]">Type:</span>
                                            <span className="text-foreground">{src.sourceType || src.documentType || '—'}</span>
                                          </div>
                                          
                                          {src.metrics && (
                                            <div className="flex items-center gap-2">
                                              <span className="text-muted-foreground font-medium min-w-[60px]">Metric:</span>
                                              <span className="text-foreground">{src.metrics}</span>
                                            </div>
                                          )}
                                          
                                          {src.confidenceInterval && (
                                            <div className="flex items-center gap-2">
                                              <span className="text-muted-foreground font-medium min-w-[60px]">CI:</span>
                                              <span className="text-foreground">{src.confidenceInterval}</span>
                                            </div>
                                          )}
                                        </div>

                                        {/* Description */}
                                        {src.description && (
                                          <div className="mt-3 p-3 bg-muted/30 dark:bg-muted/10 rounded-lg">
                                            <p className="text-sm text-muted-foreground leading-relaxed">{src.description}</p>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })
                                })

                                if (cards.length === 0) return <div className="text-sm text-muted-foreground">No benchmark details available.</div>

                                return <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{cards}</div>
                              })()}

                              {hasNA && (
                                <div className="mt-2 text-sm text-muted-foreground">Reason: {sources?.[0]?.description || data.additionalAspects || 'Not applicable'}</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Process Questions */}
                  {data.processSources && (
                    <div>
                      <h4 className="font-semibold mb-3">Part B: Documentation & Process</h4>
                      <div className="space-y-4">
                        {getProcessQuestions().map((q) => {
                          const questionId = q.id
                          const sources = data.processSources?.[questionId] || []
                          const qText = q.text
                          const rawAnswer = data.processAnswers?.[questionId]
                          const answers = Array.isArray(rawAnswer) ? rawAnswer : rawAnswer ? [rawAnswer] : []
                          const hasYes = answers.some((a: string) => String(a).toLowerCase() === "yes")
                          const hasNo = answers.some((a: string) => String(a).toLowerCase() === "no")
                          const hasNA = answers.length === 0 || answers.some((a: string) => String(a).toLowerCase().includes("not applicable") || String(a).toLowerCase() === "n/a")

                          const key = `proc-${categoryId}-${questionId}`

                          return (
                            <div key={questionId} className="border rounded-lg p-4">
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleNegatives(key)}
                                className="flex items-center gap-2 mb-2 justify-between cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-medium">{questionId}:</span>
                                  <div className="text-sm">{qText}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {hasYes ? (
                                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">yes</span>
                                  ) : hasNo ? (
                                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">no</span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-muted/20 text-muted-foreground">n/a</span>
                                  )}
                                </div>
                              </div>

                              {hasYes && expandedNegatives[key] && (
                                <div className="mt-3 space-y-3">
                                  {(sources || []).map((src: any, i: number) => (
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

                              {hasNA && (
                                <div className="mt-2 text-sm text-muted-foreground">Reason: {sources?.[0]?.description || data.additionalAspects || 'Not applicable'}</div>
                              )}
                            </div>
                          )
                        })}
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
