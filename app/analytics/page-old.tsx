"use client"

import { useState, useEffect } from "react"
import AnalyticsDashboard from "@/components/analytics-dashboard"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"

interface Evaluation {
  id: string
  name: string
  organization: string
  overallScore: number
  modality: string[]
  submittedDate: string
  categoryEvaluations?: {
    [categoryId: string]: {
      benchmarkAnswers?: { [questionId: string]: string }
      processAnswers?: { [questionId: string]: string }
    }
  }
}

const loadEvaluationData = async (): Promise<Evaluation[]> => {
  const evaluationFiles = [
    "/evaluations/gpt-4-turbo.json",
    "/evaluations/claude-3-sonnet.json", 
    "/evaluations/gemini-pro.json",
    "/evaluations/fraud-detector.json",
  ]

  const additionalFiles = []
  for (let i = 1; i <= 10; i++) {
    additionalFiles.push(`/evaluations/eval-${Date.now() - i * 86400000}.json`)
  }

  const allFiles = [...evaluationFiles, ...additionalFiles]
  const evaluations: Evaluation[] = []

  for (const file of allFiles) {
    try {
      const response = await fetch(file)
      if (!response.ok) continue

      const data = await response.json()

      // Calculate overall score based on completion percentage
      let overallScore = 0
      if (data.categoryEvaluations) {
        const allCategories = Object.keys(data.categoryEvaluations)
        const categoryScores = allCategories.map(categoryId => {
          const categoryData = data.categoryEvaluations[categoryId]
          if (!categoryData) return 0

          // Count total questions and answered questions
          const benchmarkAnswers = categoryData.benchmarkAnswers || {}
          const processAnswers = categoryData.processAnswers || {}
          
          const allAnswers = { ...benchmarkAnswers, ...processAnswers }
          const totalQuestions = Object.keys(allAnswers).length
          if (totalQuestions === 0) return 0

          // Count answered questions (not N/A, null, undefined, or empty)
          const answeredQuestions = Object.values(allAnswers).filter(
            (answer: any) => answer && answer !== "N/A" && String(answer).trim() !== ""
          ).length

          return (answeredQuestions / totalQuestions) * 100
        })

        overallScore = categoryScores.length > 0 
          ? categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length 
          : 0
      }

      const evaluation: Evaluation = {
        id: data.id || `eval-${Date.now()}`,
        name: data.systemName || "Unknown System",
        organization: data.provider || "Unknown Provider",
        overallScore,
        modality: [...(data.inputModalities || ["Text"]), ...(data.outputModalities || ["Text"])],
        submittedDate: data.evaluationDate || new Date().toISOString().split("T")[0],
        categoryEvaluations: data.categoryEvaluations
      }

      evaluations.push(evaluation)
    } catch (error) {
      console.error(`Failed to load evaluation from ${file}:`, error)
    }
  }

  return evaluations
}

export default function AnalyticsPage() {
  const { theme, setTheme } = useTheme()
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await loadEvaluationData()
        setEvaluations(data)
      } catch (error) {
        console.error("Failed to load evaluation data:", error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground">Analytics & Leaderboards</h1>
              <p className="text-sm text-muted-foreground">Explore evaluation completeness across models and categories</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Home className="h-4 w-4" />
                  <span className="hidden sm:inline">Dashboard</span>
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
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <AnalyticsDashboard evaluations={evaluations} />
      </div>
    </div>
  )
}
