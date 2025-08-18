"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Eye, Download, Trash2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getAllCategories } from "@/lib/schema"

export type EvaluationCardData = {
  id: string
  systemName: string
  provider: string
  inputModalities: string[]
  outputModalities: string[]
  completedDate: string
  applicableCategories: number
  completedCategories: number
  status: "strong" | "adequate" | "weak" | "insufficient"
  capabilityEval: {
    strong: number
    adequate: number
    weak: number
    insufficient: number
    strongCategories: string[]
    adequateCategories: string[]
    weakCategories: string[]
    insufficientCategories: string[]
    totalApplicable: number
  }
  riskEval: {
    strong: number
    adequate: number
    weak: number
    insufficient: number
    strongCategories: string[]
    adequateCategories: string[]
    weakCategories: string[]
    insufficientCategories: string[]
    totalApplicable: number
  }
  priorityAreas?: string[]
  priorityDetails?: Record<
    string,
    {
      yes: string[]
      negative: { text: string; status: "no" | "na"; reason?: string }[]
    }
  >
}

interface EvaluationCardProps {
  evaluation: EvaluationCardData
  onView: (id: string) => void
  onDelete: (id: string) => void
}

const getCompletenessColor = (score: number) => {
  if (score >= 85) return "bg-emerald-500 text-white"
  if (score >= 70) return "bg-blue-500 text-white"
  if (score >= 55) return "bg-amber-500 text-white"
  return "bg-red-500 text-white"
}

export function EvaluationCard({ evaluation, onView, onDelete }: EvaluationCardProps) {
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({})
  const toggleArea = (area: string) => setExpandedAreas((p) => ({ ...p, [area]: !p[area] }))
  const router = useRouter()
  
  const handleCardClick = () => {
    router.push(`/evaluation/${evaluation.id}`)
  }

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click when clicking menu
  }

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click when clicking export
    
    const reportData = {
      id: evaluation.id,
      systemName: evaluation.systemName,
      provider: evaluation.provider,
      completedDate: evaluation.completedDate,
      exportDate: new Date().toISOString(),
      inputModalities: evaluation.inputModalities,
      outputModalities: evaluation.outputModalities,
      completenessScore: Math.round((evaluation.completedCategories / evaluation.applicableCategories) * 100),
      status: evaluation.status,
      capabilityEvaluation: evaluation.capabilityEval,
      riskEvaluation: evaluation.riskEval,
      priorityAreas: evaluation.priorityAreas,
      priorityDetails: evaluation.priorityDetails
    }

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `evaluation-summary-${evaluation.systemName.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const modalityMap: Record<string, { label: string; emoji?: string; variant?: string }> = {
    "Text": { label: "Text", emoji: "📝" },
    "Image": { label: "Image", emoji: "🖼️" },
    "Audio": { label: "Audio", emoji: "🔊" },
    "Video": { label: "Video", emoji: "🎥" },
    "Tabular": { label: "Tabular", emoji: "📊" },
    "Robotics/Action": { label: "Robotics", emoji: "🤖" },
    "Other": { label: "Other", emoji: "⚡" },
  }

  const getModalityDisplay = (inputModalities: string[], outputModalities: string[]) => {
    const inputStr = inputModalities.join(", ")
    const outputStr = outputModalities.join(", ")
    
    // Special cases for common patterns
    if (inputModalities.length === 1 && outputModalities.length === 1) {
      if (inputModalities[0] === "Text" && outputModalities[0] === "Text") {
        return { label: "Text → Text", emoji: "�" }
      }
      if (inputModalities[0] === "Text" && outputModalities[0] === "Image") {
        return { label: "Text → Image", emoji: "�️" }
      }
      if (inputModalities[0] === "Image" && outputModalities[0] === "Text") {
        return { label: "Image → Text", emoji: "📷" }
      }
      if (inputModalities[0] === "Tabular" && outputModalities[0] === "Tabular") {
        return { label: "Tabular", emoji: "📊" }
      }
    }
    
    // Multimodal cases
    if (inputModalities.length > 1 || outputModalities.length > 1) {
      return { label: "Multimodal", emoji: "🤖" }
    }
    
    // Fallback
    return { label: `${inputStr} → ${outputStr}`, emoji: "⚡" }
  }
  const getUniqueCount = (lists: string[][]) => {
    const set = new Set<string>()
    lists.forEach((list) => (list || []).forEach((item) => set.add(item)))
    return set.size
  }

  const capTotalComputed = getUniqueCount([
    evaluation.capabilityEval.strongCategories,
    evaluation.capabilityEval.adequateCategories,
    evaluation.capabilityEval.weakCategories,
    evaluation.capabilityEval.insufficientCategories,
  ])

  const riskTotalComputed = getUniqueCount([
    evaluation.riskEval.strongCategories,
    evaluation.riskEval.adequateCategories,
    evaluation.riskEval.weakCategories,
    evaluation.riskEval.insufficientCategories,
  ])
  const calculateCompletenessScore = () => {
  const weights = { strong: 4, adequate: 3, weak: 2, insufficient: 1 }
  const capTotal = capTotalComputed
  const riskTotal = riskTotalComputed

    if (capTotal === 0 && riskTotal === 0) {
      return "0.0"
    }

    let capScore = 0
    if (capTotal > 0) {
      capScore =
        ((evaluation.capabilityEval.strong * weights.strong +
          evaluation.capabilityEval.adequate * weights.adequate +
          evaluation.capabilityEval.weak * weights.weak +
          evaluation.capabilityEval.insufficient * weights.insufficient) /
          (capTotal * 4)) *
        100
    }

    let riskScore = 0
    if (riskTotal > 0) {
      riskScore =
        ((evaluation.riskEval.strong * weights.strong +
          evaluation.riskEval.adequate * weights.adequate +
          evaluation.riskEval.weak * weights.weak +
          evaluation.riskEval.insufficient * weights.insufficient) /
          (riskTotal * 4)) *
        100
    }

  const totalApplicable = capTotal + riskTotal
    const weightedScore = (capScore * capTotal + riskScore * riskTotal) / totalApplicable

    // Ensure we return a valid number
  return isNaN(weightedScore) ? "0.0" : weightedScore.toFixed(1)
  }

  const handleViewDetails = () => {
    router.push(`/evaluation/${evaluation.id}`)
  }

  const completenessScore = Number.parseFloat(calculateCompletenessScore())

  return (
    <TooltipProvider>
      <Card 
        className="hover:shadow-lg transition-all duration-200 cursor-pointer hover:border-primary/20 hover:shadow-primary/5"
        onClick={handleCardClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1 min-w-0">
              <CardTitle className="text-xl font-bold truncate">{evaluation.systemName}</CardTitle>
              <p className="text-sm text-muted-foreground truncate font-medium">{evaluation.provider}</p>
              {/* Enhanced modality badge with emoji and hover detail */}
              {(() => {
                const info = getModalityDisplay(evaluation.inputModalities, evaluation.outputModalities)
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs px-2 py-1 w-fit flex items-center gap-2 cursor-help">
                        {info.emoji ? <span aria-hidden className="text-sm">{info.emoji}</span> : null}
                        <span className="whitespace-nowrap">{info.label}</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="text-sm">
                        <div><strong>Input:</strong> {evaluation.inputModalities.join(", ")}</div>
                        <div><strong>Output:</strong> {evaluation.outputModalities.join(", ")}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )
              })()}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div onClick={handleMenuClick}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleViewDetails}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Export Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDelete(evaluation.id)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Top row: Key metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground font-medium">Completeness</span>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 flex items-center justify-center text-xs font-bold text-white ${getCompletenessColor(completenessScore)}`}
                  style={{ width: `${Math.max(completenessScore, 8)}%` }}
                >
                  {completenessScore}%
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground font-medium">Submitted</span>
              <p className="text-sm font-semibold">{evaluation.completedDate}</p>
            </div>
          </div>

          {/* Quick summary stats */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-medium">Capability Eval</span>
                  <span className="text-xs text-muted-foreground">({evaluation.capabilityEval.totalApplicable} applicable)</span>
                </div>
                <div className="flex gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 h-2 bg-emerald-500 rounded-full cursor-help" style={{
                        opacity: evaluation.capabilityEval.strong > 0 ? 1 : 0.2,
                        flexGrow: evaluation.capabilityEval.strong
                      }} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                        <span className="text-xs"><strong>Strong:</strong> {evaluation.capabilityEval.strong} categories - Most evals reported</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 h-2 bg-blue-500 rounded-full cursor-help" style={{
                        opacity: evaluation.capabilityEval.adequate > 0 ? 1 : 0.2,
                        flexGrow: evaluation.capabilityEval.adequate
                      }} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-xs"><strong>Adequate:</strong> {evaluation.capabilityEval.adequate} categories - Many evals reported</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 h-2 bg-yellow-500 rounded-full cursor-help" style={{
                        opacity: evaluation.capabilityEval.weak > 0 ? 1 : 0.2,
                        flexGrow: evaluation.capabilityEval.weak
                      }} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <span className="text-xs"><strong>Weak:</strong> {evaluation.capabilityEval.weak} categories - Some evals reported</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 h-2 bg-red-500 rounded-full cursor-help" style={{
                        opacity: evaluation.capabilityEval.insufficient > 0 ? 1 : 0.2,
                        flexGrow: evaluation.capabilityEval.insufficient
                      }} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <span className="text-xs"><strong>Insufficient:</strong> {evaluation.capabilityEval.insufficient} categories - Few evals reported</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-medium">Risk Eval</span>
                  <span className="text-xs text-muted-foreground">({evaluation.riskEval.totalApplicable} applicable)</span>
                </div>
                <div className="flex gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 h-2 bg-emerald-500 rounded-full cursor-help" style={{
                        opacity: evaluation.riskEval.strong > 0 ? 1 : 0.2,
                        flexGrow: evaluation.riskEval.strong
                      }} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                        <span className="text-xs"><strong>Strong:</strong> {evaluation.riskEval.strong} categories - Most evals reported</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 h-2 bg-blue-500 rounded-full cursor-help" style={{
                        opacity: evaluation.riskEval.adequate > 0 ? 1 : 0.2,
                        flexGrow: evaluation.riskEval.adequate
                      }} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-xs"><strong>Adequate:</strong> {evaluation.riskEval.adequate} categories - Many evals reported</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 h-2 bg-yellow-500 rounded-full cursor-help" style={{
                        opacity: evaluation.riskEval.weak > 0 ? 1 : 0.2,
                        flexGrow: evaluation.riskEval.weak
                      }} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <span className="text-xs"><strong>Weak:</strong> {evaluation.riskEval.weak} categories - Some evals reported</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 h-2 bg-red-500 rounded-full cursor-help" style={{
                        opacity: evaluation.riskEval.insufficient > 0 ? 1 : 0.2,
                        flexGrow: evaluation.riskEval.insufficient
                      }} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <span className="text-xs"><strong>Insufficient:</strong> {evaluation.riskEval.insufficient} categories - Few evals reported</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
