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
    "/evaluations/fraud-detector.json"
  ]

  const evaluations: Evaluation[] = []

  for (const file of evaluationFiles) {
    try {
      const response = await fetch(file)
      if (!response.ok) continue

      const data = await response.json()
      
      // Calculate overall score based on evaluation completeness
      const totalQuestions = Object.values(data.categoryEvaluations || {}).reduce((acc: number, catEval: any) => {
        const benchmarkCount = Object.keys(catEval.benchmarkAnswers || {}).length
        const processCount = Object.keys(catEval.processAnswers || {}).length
        return acc + benchmarkCount + processCount
      }, 0)

      const answeredQuestions = Object.values(data.categoryEvaluations || {}).reduce((acc: number, catEval: any) => {
        const benchmarkAnswered = Object.values(catEval.benchmarkAnswers || {}).filter((answer: any) => 
          answer !== null && answer !== undefined && answer !== ""
        ).length
        const processAnswered = Object.values(catEval.processAnswers || {}).filter((answer: any) => 
          answer !== null && answer !== undefined && answer !== ""
        ).length
        return acc + benchmarkAnswered + processAnswered
      }, 0)

      const overallScore = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0

      const evaluation: Evaluation = {
        id: data.id || file.split('/').pop()?.replace('.json', '') || 'unknown',
        name: data.systemName || 'Unknown System',
        organization: data.provider || 'Unknown Provider',
        overallScore,
        modality: [
          ...(data.inputModalities || []),
          ...(data.outputModalities || [])
        ].filter((v, i, a) => a.indexOf(v) === i), // Remove duplicates
        submittedDate: data.evaluationDate || new Date().toISOString().split('T')[0],
        categoryEvaluations: data.categoryEvaluations
      }

      evaluations.push(evaluation)
    } catch (error) {
      console.error(`Failed to load ${file}:`, error)
      continue
    }
  }

  return evaluations
}

export default function AnalyticsPage() {
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
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <PageHeader 
        title="Analytics & Leaderboards"
        description="Explore evaluation completeness across models and categories with comprehensive analytics and insights."
      />

      <div className="container mx-auto px-4 sm:px-6 py-6">
        <AnalyticsDashboard evaluations={evaluations} />
      </div>
    </div>
  )
}
