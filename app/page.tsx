"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Moon, Sun, Filter, ArrowUpDown, Info } from "lucide-react"
import { useTheme } from "next-themes"
import { EvaluationCard, type EvaluationCardData } from "@/components/evaluation-card"
import { getBenchmarkQuestions, getProcessQuestions } from "@/lib/schema"
import { AIEvaluationDashboard } from "@/components/ai-evaluation-dashboard"
import Link from "next/link"

const loadEvaluationData = async (): Promise<EvaluationCardData[]> => {
  const evaluationFiles = [
    "/evaluations/gpt-4-turbo.json",
    "/evaluations/claude-3-sonnet.json",
    "/evaluations/gemini-pro.json",
    "/evaluations/fraud-detector.json",
  ]

  const additionalFiles = []
  for (let i = 1; i <= 10; i++) {
    additionalFiles.push(`/evaluations/eval-${Date.now() - i * 86400000}.json`) // Check for files from last 10 days
  }

  const allFiles = [...evaluationFiles, ...additionalFiles]
  const evaluations: EvaluationCardData[] = []

  for (const file of allFiles) {
    try {
      const response = await fetch(file)
      if (!response.ok) continue // Skip files that don't exist

      const data = await response.json()

      const cardData: EvaluationCardData = {
        id: data.id || `eval-${Date.now()}`,
        systemName: data.systemName || "Unknown System",
        provider: data.provider || "Unknown Provider",
        inputModalities: data.inputModalities || ["Text"],
        outputModalities: data.outputModalities || ["Text"],
        completedDate: data.evaluationDate || new Date().toISOString().split("T")[0],
        applicableCategories: data.overallStats?.totalApplicable || 0,
        completedCategories: data.overallStats?.totalApplicable || 0,
        status:
          data.overallStats?.strongCategories?.length >= (data.overallStats?.adequateCategories?.length || 0)
            ? "strong"
            : data.overallStats?.adequateCategories?.length >= (data.overallStats?.weakCategories?.length || 0)
              ? "adequate"
              : "weak",
        capabilityEval: {
          strong: (data.overallStats?.strongCategories || []).filter((cat: string) =>
            [
              "language-communication",
              "social-intelligence",
              "problem-solving",
              "creativity-innovation",
              "learning-memory",
              "perception-vision",
              "physical-manipulation",
              "metacognition",
              "robotic-intelligence",
            ].includes(cat),
          ).length,
          adequate: (data.overallStats?.adequateCategories || []).filter((cat: string) =>
            [
              "language-communication",
              "social-intelligence",
              "problem-solving",
              "creativity-innovation",
              "learning-memory",
              "perception-vision",
              "physical-manipulation",
              "metacognition",
              "robotic-intelligence",
            ].includes(cat),
          ).length,
          weak: (data.overallStats?.weakCategories || []).filter((cat: string) =>
            [
              "language-communication",
              "social-intelligence",
              "problem-solving",
              "creativity-innovation",
              "learning-memory",
              "perception-vision",
              "physical-manipulation",
              "metacognition",
              "robotic-intelligence",
            ].includes(cat),
          ).length,
          insufficient: (data.overallStats?.insufficientCategories || []).filter((cat: string) =>
            [
              "language-communication",
              "social-intelligence",
              "problem-solving",
              "creativity-innovation",
              "learning-memory",
              "perception-vision",
              "physical-manipulation",
              "metacognition",
              "robotic-intelligence",
            ].includes(cat),
          ).length,
          strongCategories: (data.overallStats?.strongCategories || []).filter((cat: string) =>
            [
              "language-communication",
              "social-intelligence",
              "problem-solving",
              "creativity-innovation",
              "learning-memory",
              "perception-vision",
              "physical-manipulation",
              "metacognition",
              "robotic-intelligence",
            ].includes(cat),
          ),
          adequateCategories: (data.overallStats?.adequateCategories || []).filter((cat: string) =>
            [
              "language-communication",
              "social-intelligence",
              "problem-solving",
              "creativity-innovation",
              "learning-memory",
              "perception-vision",
              "physical-manipulation",
              "metacognition",
              "robotic-intelligence",
            ].includes(cat),
          ),
          weakCategories: (data.overallStats?.weakCategories || []).filter((cat: string) =>
            [
              "language-communication",
              "social-intelligence",
              "problem-solving",
              "creativity-innovation",
              "learning-memory",
              "perception-vision",
              "physical-manipulation",
              "metacognition",
              "robotic-intelligence",
            ].includes(cat),
          ),
          insufficientCategories: (data.overallStats?.insufficientCategories || []).filter((cat: string) =>
            [
              "language-communication",
              "social-intelligence",
              "problem-solving",
              "creativity-innovation",
              "learning-memory",
              "perception-vision",
              "physical-manipulation",
              "metacognition",
              "robotic-intelligence",
            ].includes(cat),
          ),
          totalApplicable: data.overallStats?.capabilityApplicable || 0,
        },
        riskEval: {
          strong: (data.overallStats?.strongCategories || []).filter((cat: string) =>
            [
              "harmful-content",
              "information-integrity",
              "privacy-data",
              "bias-fairness",
              "security-robustness",
              "dangerous-capabilities",
              "human-ai-interaction",
              "environmental-impact",
              "economic-displacement",
              "governance-accountability",
              "value-chain",
            ].includes(cat),
          ).length,
          adequate: (data.overallStats?.adequateCategories || []).filter((cat: string) =>
            [
              "harmful-content",
              "information-integrity",
              "privacy-data",
              "bias-fairness",
              "security-robustness",
              "dangerous-capabilities",
              "human-ai-interaction",
              "environmental-impact",
              "economic-displacement",
              "governance-accountability",
              "value-chain",
            ].includes(cat),
          ).length,
          weak: (data.overallStats?.weakCategories || []).filter((cat: string) =>
            [
              "harmful-content",
              "information-integrity",
              "privacy-data",
              "bias-fairness",
              "security-robustness",
              "dangerous-capabilities",
              "human-ai-interaction",
              "environmental-impact",
              "economic-displacement",
              "governance-accountability",
              "value-chain",
            ].includes(cat),
          ).length,
          insufficient: (data.overallStats?.insufficientCategories || []).filter((cat: string) =>
            [
              "harmful-content",
              "information-integrity",
              "privacy-data",
              "bias-fairness",
              "security-robustness",
              "dangerous-capabilities",
              "human-ai-interaction",
              "environmental-impact",
              "economic-displacement",
              "governance-accountability",
              "value-chain",
            ].includes(cat),
          ).length,
          strongCategories: (data.overallStats?.strongCategories || []).filter((cat: string) =>
            [
              "harmful-content",
              "information-integrity",
              "privacy-data",
              "bias-fairness",
              "security-robustness",
              "dangerous-capabilities",
              "human-ai-interaction",
              "environmental-impact",
              "economic-displacement",
              "governance-accountability",
              "value-chain",
            ].includes(cat),
          ),
          adequateCategories: (data.overallStats?.adequateCategories || []).filter((cat: string) =>
            [
              "harmful-content",
              "information-integrity",
              "privacy-data",
              "bias-fairness",
              "security-robustness",
              "dangerous-capabilities",
              "human-ai-interaction",
              "environmental-impact",
              "economic-displacement",
              "governance-accountability",
              "value-chain",
            ].includes(cat),
          ),
          weakCategories: (data.overallStats?.weakCategories || []).filter((cat: string) =>
            [
              "harmful-content",
              "information-integrity",
              "privacy-data",
              "bias-fairness",
              "security-robustness",
              "dangerous-capabilities",
              "human-ai-interaction",
              "environmental-impact",
              "economic-displacement",
              "governance-accountability",
              "value-chain",
            ].includes(cat),
          ),
          insufficientCategories: (data.overallStats?.insufficientCategories || []).filter((cat: string) =>
            [
              "harmful-content",
              "information-integrity",
              "privacy-data",
              "bias-fairness",
              "security-robustness",
              "dangerous-capabilities",
              "human-ai-interaction",
              "environmental-impact",
              "economic-displacement",
              "governance-accountability",
              "value-chain",
            ].includes(cat),
          ),
          totalApplicable: data.overallStats?.riskApplicable || 0,
        },
        priorityAreas: data.overallStats?.priorityAreas || [],
        priorityDetails: (() => {
          // Build a richer structure: for each area, include yes questions and negative questions (no/na) with optional reason
          const pd: Record<
            string,
            {
              yes: string[]
              negative: { text: string; status: "no" | "na"; reason?: string }[]
            }
          > = {}
          const areas = data.overallStats?.priorityAreas || []
          for (const area of areas) {
            const catEval = data.categoryEvaluations?.[area]
            if (!catEval) continue

            const yesList: string[] = []
            const negList: { text: string; status: "no" | "na"; reason?: string }[] = []

            // Helper to detect NA reason from category metadata
            const naReasonFromMeta = (): string | undefined => {
              if (typeof catEval.additionalAspects === "string" && /not applicable/i.test(catEval.additionalAspects)) {
                return catEval.additionalAspects
              }
              // look into processSources scopes for any note
              if (catEval.processSources) {
                for (const entries of Object.values(catEval.processSources)) {
                  if (Array.isArray(entries)) {
                    for (const ent of entries as any[]) {
                      if (ent && typeof ent.scope === "string" && /not applicable/i.test(ent.scope)) {
                        return ent.scope
                      }
                    }
                  }
                }
              }
              return undefined
            }

            const naMeta = naReasonFromMeta()

            // check benchmarkAnswers (A1..A6)
            if (catEval.benchmarkAnswers) {
              for (const [qid, ans] of Object.entries(catEval.benchmarkAnswers)) {
                const answer = ans
                const isArray = Array.isArray(answer)
                const negative = answer === "no" || (isArray && (answer as any[]).includes("no"))
                const positive = answer === "yes" || (isArray && (answer as any[]).includes("yes"))
                const qText = getBenchmarkQuestions().find((x) => x.id === qid)?.text || qid
                if (positive) yesList.push(qText)
                if (negative) {
                  const status = naMeta ? "na" : "no"
                  negList.push({ text: qText, status, reason: naMeta })
                }
              }
            }

            // check processAnswers (B1..B6)
            if (catEval.processAnswers) {
              for (const [qid, ans] of Object.entries(catEval.processAnswers)) {
                const answer = ans
                const isArray = Array.isArray(answer)
                const negative = answer === "no" || (isArray && (answer as any[]).includes("no"))
                const positive = answer === "yes" || (isArray && (answer as any[]).includes("yes"))
                const qText = getProcessQuestions().find((x) => x.id === qid)?.text || qid
                if (positive) yesList.push(qText)
                if (negative) {
                  const status = naMeta ? "na" : "no"
                  negList.push({ text: qText, status, reason: naMeta })
                }
              }
            }

            if (yesList.length || negList.length) pd[area] = { yes: yesList, negative: negList }
          }
          return pd
        })(),
      }

      evaluations.push(cardData)
    } catch (error) {
      continue
    }
  }

  return evaluations
}

export default function HomePage() {
  const { theme, setTheme } = useTheme()
  const [showNewEvaluation, setShowNewEvaluation] = useState(false)
  const [evaluationsData, setEvaluationsData] = useState<EvaluationCardData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const data = await loadEvaluationData()
      setEvaluationsData(data)
      setLoading(false)
    }
    loadData()
  }, [])

  const [sortBy, setSortBy] = useState<"date-newest" | "date-oldest" | "completeness-highest" | "completeness-lowest">("date-newest")
  const [filterByProvider, setFilterByProvider] = useState<string>("all")
  const [filterByModality, setFilterByModality] = useState<string>("all")

  const uniqueProviders = useMemo(() => {
    const providers = [...new Set(evaluationsData.map((item) => item.provider))].sort()
    return providers
  }, [evaluationsData])

  const uniqueModalities = useMemo(() => {
    // Define all possible modalities to ensure complete filter options
    const allModalities = ["Text", "Image", "Audio", "Video", "Tabular", "Robotics/Action", "Other"]
    
    // Get modalities that actually exist in the data
    const existingModalities = new Set<string>()
    evaluationsData.forEach((item) => {
      item.inputModalities.forEach((mod) => existingModalities.add(mod))
      item.outputModalities.forEach((mod) => existingModalities.add(mod))
    })
    
    // Return all predefined modalities, with existing ones first, then missing ones
    const existing = allModalities.filter(mod => existingModalities.has(mod)).sort()
    const missing = allModalities.filter(mod => !existingModalities.has(mod)).sort()
    
    return [...existing, ...missing]
  }, [evaluationsData])

  const filteredAndSortedEvaluations = useMemo(() => {
    let filtered = evaluationsData

    if (filterByProvider !== "all") {
      filtered = filtered.filter((item) => item.provider === filterByProvider)
    }

    if (filterByModality !== "all") {
      filtered = filtered.filter((item) => 
        item.inputModalities.includes(filterByModality) || 
        item.outputModalities.includes(filterByModality)
      )
    }

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === "completeness-highest" || sortBy === "completeness-lowest") {
        // Calculate completeness scores for both items
        const calculateCompletenessScore = (evaluation: EvaluationCardData) => {
          const capTotal = evaluation.capabilityEval.strong + evaluation.capabilityEval.adequate + evaluation.capabilityEval.weak + evaluation.capabilityEval.insufficient
          const riskTotal = evaluation.riskEval.strong + evaluation.riskEval.adequate + evaluation.riskEval.weak + evaluation.riskEval.insufficient
          const totalItems = capTotal + riskTotal
          
          if (totalItems === 0) return 0
          
          const capScore = evaluation.capabilityEval.strong * 4 + evaluation.capabilityEval.adequate * 3 + evaluation.capabilityEval.weak * 2 + evaluation.capabilityEval.insufficient * 1
          const riskScore = evaluation.riskEval.strong * 4 + evaluation.riskEval.adequate * 3 + evaluation.riskEval.weak * 2 + evaluation.riskEval.insufficient * 1
          
          return Math.round(((capScore + riskScore) / (totalItems * 4)) * 100)
        }
        
        const scoreA = calculateCompletenessScore(a)
        const scoreB = calculateCompletenessScore(b)
        
        if (sortBy === "completeness-highest") {
          return scoreB - scoreA
        } else {
          return scoreA - scoreB
        }
      } else {
        const dateA = new Date(a.completedDate)
        const dateB = new Date(b.completedDate)

        if (sortBy === "date-newest") {
          return dateB.getTime() - dateA.getTime()
        } else {
          return dateA.getTime() - dateB.getTime()
        }
      }
    })

    return filtered
  }, [evaluationsData, sortBy, filterByProvider, filterByModality])

  const handleViewEvaluation = (id: string) => {}

  const handleDeleteEvaluation = (id: string) => {
    setEvaluationsData((prev) => prev.filter((evaluation) => evaluation.id !== id))
  }

  const handleSaveEvaluation = (newEvaluation: EvaluationCardData) => {
    setEvaluationsData((prev) => [newEvaluation, ...prev])
  }

  if (showNewEvaluation) {
    return <AIEvaluationDashboard onBack={() => setShowNewEvaluation(false)} onSaveEvaluation={handleSaveEvaluation} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading evaluations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground">AI Evaluation Dashboard</h1>
              <p className="text-sm text-muted-foreground">Manage and track your AI system evaluations</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/analytics">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  <span className="hidden sm:inline">Analytics</span>
                </Button>
              </Link>
              <Link href="/about">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Info className="h-4 w-4" />
                  <span className="hidden sm:inline">About</span>
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-9 w-9 p-0"
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
              <Button onClick={() => setShowNewEvaluation(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New Eval Card</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold font-heading">Evaluation Cards</h2>
            <p className="text-sm text-muted-foreground">{filteredAndSortedEvaluations.length} eval cards</p>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 sm:gap-4 p-4 bg-card rounded-lg border">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Sort by:</span>
              <Select value={sortBy} onValueChange={(value: "date-newest" | "date-oldest" | "completeness-highest" | "completeness-lowest") => setSortBy(value)}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-newest">Date (Newest)</SelectItem>
                  <SelectItem value="date-oldest">Date (Oldest)</SelectItem>
                  <SelectItem value="completeness-highest">Completeness (Highest)</SelectItem>
                  <SelectItem value="completeness-lowest">Completeness (Lowest)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Provider:</span>
              <Select value={filterByProvider} onValueChange={setFilterByProvider}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  {uniqueProviders.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Modality:</span>
              <Select value={filterByModality} onValueChange={setFilterByModality}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modalities</SelectItem>
                  {uniqueModalities.map((modality) => (
                    <SelectItem key={modality} value={modality}>
                      {modality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredAndSortedEvaluations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAndSortedEvaluations.map((evaluation) => (
                <EvaluationCard
                  key={evaluation.id}
                  evaluation={evaluation}
                  onView={handleViewEvaluation}
                  onDelete={handleDeleteEvaluation}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                <Filter className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No evaluations match your filters</h3>
              <p className="text-muted-foreground mb-4">Try adjusting your filter criteria to see more results</p>
              <Button
                variant="outline"
                onClick={() => {
                  setFilterByProvider("all")
                  setFilterByModality("all")
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
