"use client"

import { useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { SystemInfoForm } from "./system-info-form"
import { CategorySelection } from "./category-selection"
import { CategoryEvaluation } from "./category-evaluation"
import { EvaluationForm } from "./evaluation-form"
import { ResultsDashboard } from "./results-dashboard"
import { CATEGORIES } from "@/lib/category-data"

export type SystemInfo = {
  name: string
  url: string
  provider: string
  systemTypes: string[]
  deploymentContexts: string[]
  modality: string
  modelTag?: string
  knowledgeCutoff?: string
  modelType?: "foundational" | "fine-tuned" | "na"
  inputModalities?: string[]
  outputModalities?: string[]
}

export type CategoryScore = {
  benchmarkScore: number
  processScore: number
  totalScore: number
  status: "strong" | "adequate" | "weak" | "insufficient" | "not-evaluated"
  // optional metadata
  totalQuestions?: number
  totalApplicable?: number
  naCount?: number
}

export type EvaluationData = {
  systemInfo: SystemInfo | null
  selectedCategories: string[]
  excludedCategoryReasons?: Record<string, string>
  categoryScores: Record<string, CategoryScore>
  currentCategory: string | null
}

interface AIEvaluationDashboardProps {
  onBack?: () => void
  onSaveEvaluation?: (evaluation: any) => void
}

export function AIEvaluationDashboard({ onBack, onSaveEvaluation }: AIEvaluationDashboardProps) {
  const [currentStep, setCurrentStep] = useState<"system-info" | "categories" | "evaluation" | "results">("system-info")
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0)
  const [evaluationData, setEvaluationData] = useState<EvaluationData>({
    systemInfo: null,
    selectedCategories: [],
    categoryScores: {},
    currentCategory: null,
  })

  const steps = [
    { id: "system-info", label: "System Info", number: 1 },
    { id: "categories", label: "Categories", number: 2 },
    { id: "evaluation", label: "Evaluation", number: 3 },
    { id: "results", label: "Results", number: 4 },
  ]

  const getOverallProgress = () => {
    if (currentStep === "system-info") return 10
    if (currentStep === "categories") return 25
    if (currentStep === "evaluation") {
      const completed = Object.keys(evaluationData.categoryScores).length
      const total = evaluationData.selectedCategories.length
      return total > 0 ? 25 + (completed / total) * 65 : 25
    }
    return 100
  }

  const handleSystemInfoComplete = (systemInfo: SystemInfo) => {
    setEvaluationData((prev) => ({ ...prev, systemInfo }))
    setCurrentStep("categories")
  }

  const handleCategoriesSelected = (categories: string[]) => {
    setEvaluationData((prev) => ({ ...prev, selectedCategories: categories }))
    setCurrentCategoryIndex(0)
    setCurrentStep("evaluation")
  }

  const handleCategoriesSelectedWithReasons = (categories: string[], excludedReasons: Record<string, string>) => {
    setEvaluationData((prev) => ({ ...prev, selectedCategories: categories, excludedCategoryReasons: excludedReasons }))
    setCurrentCategoryIndex(0)
    setCurrentStep("evaluation")
  }

  const handleCategoryComplete = (categoryId: string, score: CategoryScore) => {
    console.log("[v0] handleCategoryComplete called with:", { categoryId, score })

    setEvaluationData((prev) => {
      const newCategoryScores = { ...prev.categoryScores, [categoryId]: score }
      console.log("[v0] Updated categoryScores:", newCategoryScores)
      return {
        ...prev,
        categoryScores: newCategoryScores,
      }
    })

    const nextIndex = currentCategoryIndex + 1
    console.log(
      "[v0] Current index:",
      currentCategoryIndex,
      "Next index:",
      nextIndex,
      "Total categories:",
      evaluationData.selectedCategories.length,
    )

    if (nextIndex >= evaluationData.selectedCategories.length) {
      console.log("[v0] All categories complete, moving to results")
      setCurrentStep("results")
    } else {
      console.log("[v0] Moving to next category at index:", nextIndex)
      setCurrentCategoryIndex(nextIndex)
    }
  }

  const handleSaveEvaluation = async () => {
    console.log("[v0] handleSaveEvaluation called")
    console.log("[v0] evaluationData:", evaluationData)

    if (!evaluationData.systemInfo || evaluationData.selectedCategories.length === 0) {
      alert("Please complete system information and select categories before saving.")
      return
    }

    const timestamp = Date.now()
    const evaluationId = `eval-${timestamp}`
    console.log("[v0] Generated evaluationId:", evaluationId)

    console.log("[v0] Processing category scores:", evaluationData.categoryScores)

    const capabilityCategories = evaluationData.selectedCategories.filter((cat) => {
      const category = CATEGORIES.find((c) => c.id === cat)
      console.log("[v0] Category check:", cat, "type:", category?.type)
      return category?.type === "capability"
    })
    console.log("[v0] Capability categories:", capabilityCategories)

    const riskCategories = evaluationData.selectedCategories.filter((cat) => {
      const category = CATEGORIES.find((c) => c.id === cat)
      return category?.type === "risk"
    })
    console.log("[v0] Risk categories:", riskCategories)

    const strongCategories = Object.entries(evaluationData.categoryScores)
      .filter(([_, score]) => {
        console.log("[v0] Checking score for strong:", score)
        return score.status === "strong"
      })
      .map(([catId]) => catId)
    console.log("[v0] Strong categories:", strongCategories)

    const adequateCategories = Object.entries(evaluationData.categoryScores)
      .filter(([_, score]) => score.status === "adequate")
      .map(([catId]) => catId)
    console.log("[v0] Adequate categories:", adequateCategories)

    const weakCategories = Object.entries(evaluationData.categoryScores)
      .filter(([_, score]) => score.status === "weak")
      .map(([catId]) => catId)
    console.log("[v0] Weak categories:", weakCategories)

    const insufficientCategories = Object.entries(evaluationData.categoryScores)
      .filter(([_, score]) => score.status === "insufficient")
      .map(([catId]) => catId)
    console.log("[v0] Insufficient categories:", insufficientCategories)

    const evaluationJson = {
      id: evaluationId,
      systemName: evaluationData.systemInfo.name,
      provider: evaluationData.systemInfo.provider,
      version: evaluationData.systemInfo.url || "1.0",
      deploymentContext: evaluationData.systemInfo.deploymentContexts.join(", ") || "Production",
      evaluator: "Current User",
      modality: evaluationData.systemInfo.modality,
      evaluationDate: new Date().toISOString().split("T")[0],
      selectedCategories: evaluationData.selectedCategories,
  excludedCategoryReasons: evaluationData.excludedCategoryReasons || {},
      categoryEvaluations: evaluationData.categoryScores,
      overallStats: {
        completenessScore: 85, // Safe default value
        totalApplicable: evaluationData.selectedCategories.length,
        capabilityApplicable: capabilityCategories.length,
        riskApplicable: riskCategories.length,
        strongCategories,
        adequateCategories,
        weakCategories,
        insufficientCategories,
      },
    }

    console.log("[v0] Final evaluationJson:", evaluationJson)

    try {
      console.log("[v0] Creating blob and download")
      const blob = new Blob([JSON.stringify(evaluationJson, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${evaluationId}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log("[v0] Download completed successfully")
      alert(
        `Evaluation saved as ${evaluationId}.json. Please upload this file to the public/evaluations/ directory to see it on the homepage.`,
      )
      onBack?.()
    } catch (error) {
      console.error("[v0] Error saving evaluation:", error)
      alert("Error saving evaluation. Please try again.")
    }
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "system-info":
        return <SystemInfoForm onSubmit={handleSystemInfoComplete} initialData={evaluationData.systemInfo} />
      case "categories":
        return (
          <CategorySelection
            categories={CATEGORIES}
            selectedCategories={evaluationData.selectedCategories}
            onSelectionChange={handleCategoriesSelectedWithReasons}
          />
        )
      case "evaluation":
        return (
          <EvaluationForm
            categories={CATEGORIES}
            selectedCategories={evaluationData.selectedCategories}
            categoryScores={evaluationData.categoryScores}
            onScoreUpdate={(categoryId, score) => handleCategoryComplete(categoryId, score)}
            onComplete={() => setCurrentStep("results")}
          />
        )
      case "results":
        return (
          <ResultsDashboard
            systemInfo={evaluationData.systemInfo}
            categories={CATEGORIES}
            selectedCategories={evaluationData.selectedCategories}
            categoryScores={evaluationData.categoryScores}
            excludedCategoryReasons={evaluationData.excludedCategoryReasons || {}}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              <div>
                <h1 className="text-2xl font-bold font-heading text-foreground">New Eval Card</h1>
                <p className="text-muted-foreground">Create comprehensive AI system evaluation card</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Overall Progress</p>
                <div className="flex items-center gap-2">
                  <Progress value={getOverallProgress()} className="w-24" />
                  <span className="text-sm font-medium">{Math.round(getOverallProgress())}%</span>
                </div>
              </div>
              {evaluationData.systemInfo && (
                <Badge variant="secondary" className="font-medium">
                  {evaluationData.systemInfo.name}
                </Badge>
              )}
              <Button onClick={handleSaveEvaluation} className="gap-2">
                Save Eval Card
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Step tabs navigation */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6">
          <div className="flex items-center space-x-8">
            {steps.map((step) => {
              const isActive = currentStep === step.id
              const isCompleted =
                (step.id === "system-info" && evaluationData.systemInfo) ||
                (step.id === "categories" && evaluationData.selectedCategories.length > 0) ||
                (step.id === "evaluation" && Object.keys(evaluationData.categoryScores).length > 0) ||
                (step.id === "results" && currentStep === "results")

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 py-4 border-b-2 transition-colors ${
                    isActive
                      ? "border-primary text-primary"
                      : isCompleted
                        ? "border-green-500 text-green-600"
                        : "border-transparent text-muted-foreground"
                  }`}
                >
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isCompleted
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.number}
                  </div>
                  <span className="font-medium">{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

  <div className="container mx-auto px-6 py-6 flex-1 min-h-0">{renderCurrentStep()}</div>
    </div>
  )
}
