"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { CategoryScore } from "@/components/ai-evaluation-dashboard"
import { HelpCircle, CheckCircle, Plus, Trash2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { SOURCE_TYPES, ADDITIONAL_ASPECTS_SECTION, getFieldPlaceholder, getHint } from "@/lib/schema"
import { getBenchmarkQuestions, getProcessQuestions } from '@/lib/schema'
import formSchema from '@/schema/evaluation-schema.json'

// The detailed per-category and per-question hints, plus recommended placeholders,
// are centralized in `lib/category-data.ts`. This component uses the exported
// helpers `getHint` and `getFieldPlaceholder` and the question lists.

// All benchmark questions share the same input fields; all process questions share the same input fields.

// Local types used by this component (kept minimal for readability)
export type Source = {
  id: string
  url: string
  description: string
  sourceType: string
  benchmarkName?: string
  metrics?: string
  score?: string
  confidenceInterval?: string
  version?: string
  taskVariants?: string
  customFields: Record<string, string>
}

export type DocumentationSource = {
  id: string
  url: string
  description: string
  sourceType: string
  documentType?: string
  title?: string
  author?: string
  organization?: string
  date?: string
  customFields: Record<string, string>
}

export type CategoryEvaluationProps = {
  category: { id: string; name: string; description: string; type: string; detailedGuidance?: string }
  score?: CategoryScore | null
  onScoreUpdate: (score: CategoryScore) => void
  onSaveDetailed?: (categoryId: string, data: any) => void
}

export function CategoryEvaluation({ category, score, onScoreUpdate, onSaveDetailed }: CategoryEvaluationProps) {
  const [benchmarkAnswers, setBenchmarkAnswers] = useState<Record<string, string>>({})
  const [processAnswers, setProcessAnswers] = useState<Record<string, string>>({})
  const [benchmarkSources, setBenchmarkSources] = useState<Record<string, Source[]>>({})
  const [processSources, setProcessSources] = useState<Record<string, DocumentationSource[]>>({})
  const [additionalAspects, setAdditionalAspects] = useState<string>("")
  const [naExplanations, setNaExplanations] = useState<Record<string, string>>({})

  useEffect(() => {
    if (score) {
      // This would be populated from saved data in a real implementation
      // For now, we'll calculate based on the scores
    }
  }, [score])

  const addSource = (questionId: string, section: "benchmark" | "process") => {
    if (section === "benchmark") {
      const newId = (globalThis.crypto && (globalThis.crypto as any).randomUUID)
        ? (globalThis.crypto as any).randomUUID()
        : Date.now().toString()
      const newSource: Source = {
        id: newId,
        url: "",
        description: "",
        sourceType: "internal",
  benchmarkName: "",
  metrics: "",
  score: "",
  confidenceInterval: "",
  version: "",
  taskVariants: "",
        customFields: {},
      }
      setBenchmarkSources((prev) => ({
        ...prev,
        [questionId]: [...(prev[questionId] || []), newSource],
      }))
    } else {
      const newId = (globalThis.crypto && (globalThis.crypto as any).randomUUID)
        ? (globalThis.crypto as any).randomUUID()
        : Date.now().toString()
      const newDocSource: DocumentationSource = {
        id: newId,
        url: "",
        description: "",
        sourceType: "internal",
  documentType: "",
  title: "",
  author: "",
  organization: "",
  date: "",
  customFields: {},
      }
      setProcessSources((prev) => ({
        ...prev,
        [questionId]: [...(prev[questionId] || []), newDocSource],
      }))
    }
  }

  const removeSource = (questionId: string, sourceId: string, section: "benchmark" | "process") => {
    if (section === "benchmark") {
      setBenchmarkSources((prev) => ({
        ...prev,
        [questionId]: (prev[questionId] || []).filter((s) => s.id !== sourceId),
      }))
    } else {
      setProcessSources((prev) => ({
        ...prev,
        [questionId]: (prev[questionId] || []).filter((s) => s.id !== sourceId),
      }))
    }
  }

  const updateSource = (
    questionId: string,
    sourceId: string,
    field: string,
    value: string,
    section: "benchmark" | "process",
  ) => {
    if (section === "benchmark") {
      setBenchmarkSources((prev) => ({
        ...prev,
        [questionId]: (prev[questionId] || []).map((source) =>
          source.id === sourceId ? { ...source, [field]: value } : source,
        ),
      }))
    } else {
      setProcessSources((prev) => ({
        ...prev,
        [questionId]: (prev[questionId] || []).map((source) =>
          source.id === sourceId ? { ...source, [field]: value } : source,
        ),
      }))
    }
  }

  const updateSourceCustomField = (
    questionId: string,
    sourceId: string,
    fieldType: string,
    value: string,
    section: "benchmark" | "process",
  ) => {
    if (section === "benchmark") {
      setBenchmarkSources((prev) => ({
        ...prev,
        [questionId]: (prev[questionId] || []).map((source) =>
          source.id === sourceId
            ? {
                ...source,
                customFields: {
                  ...source.customFields,
                  [fieldType]: value,
                },
              }
            : source,
        ),
      }))
    } else {
      setProcessSources((prev) => ({
        ...prev,
        [questionId]: (prev[questionId] || []).map((source) =>
          source.id === sourceId
            ? {
                ...source,
                customFields: {
                  ...source.customFields,
                  [fieldType]: value,
                },
              }
            : source,
        ),
      }))
    }
  }

  const currentScore = useMemo(() => {
    // Calculate counts
  const totalBenchmarkQuestions = getBenchmarkQuestions().length
  const totalProcessQuestions = getProcessQuestions().length
    const totalQuestions = totalBenchmarkQuestions + totalProcessQuestions

    const benchmarkYesCount = Object.values(benchmarkAnswers).filter((answer) => answer === "yes").length
    const processYesCount = Object.values(processAnswers).filter((answer) => answer === "yes").length

    const benchmarkNaCount = Object.values(benchmarkAnswers).filter((answer) => answer === "na").length
    const processNaCount = Object.values(processAnswers).filter((answer) => answer === "na").length

    const naCount = benchmarkNaCount + processNaCount
    const totalYes = benchmarkYesCount + processYesCount

    // Denominator = total questions in the category minus NA answers
    const totalApplicable = Math.max(0, totalQuestions - naCount)

    const scorePercentage = totalApplicable > 0 ? totalYes / totalApplicable : 0

    let status: CategoryScore["status"]
    if (scorePercentage >= 0.8) status = "strong"
    else if (scorePercentage >= 0.6) status = "adequate"
    else if (scorePercentage >= 0.4) status = "weak"
    else status = "insufficient"

    const result = {
      benchmarkScore: benchmarkYesCount,
      processScore: processYesCount,
      totalScore: totalYes,
      status,
      totalQuestions,
      totalApplicable,
      naCount,
    }

    return result
  }, [benchmarkAnswers, processAnswers])

  const handleAnswerChange = (questionId: string, value: string, section: "benchmark" | "process") => {
    if (section === "benchmark") {
      setBenchmarkAnswers((prev) => ({ ...prev, [questionId]: value }))
      if (value !== "yes") {
        setBenchmarkSources((prev) => ({ ...prev, [questionId]: [] }))
      }
      if (value !== "na") {
        setNaExplanations((prev) => {
          const newExplanations = { ...prev }
          delete newExplanations[questionId]
          return newExplanations
        })
      }
    } else {
      setProcessAnswers((prev) => ({ ...prev, [questionId]: value }))
      if (value !== "yes") {
        setProcessSources((prev) => ({ ...prev, [questionId]: [] }))
      }
      if (value !== "na") {
        setNaExplanations((prev) => {
          const newExplanations = { ...prev }
          delete newExplanations[questionId]
          return newExplanations
        })
      }
    }
  }

  const handleNaExplanationChange = (questionId: string, explanation: string) => {
    setNaExplanations((prev) => ({ ...prev, [questionId]: explanation }))
  }

  const handleSave = () => {
    const allAnswers = { ...benchmarkAnswers, ...processAnswers }
    const missingExplanations = Object.entries(allAnswers)
      .filter(([_, answer]) => answer === "na")
      .filter(([questionId, _]) => !naExplanations[questionId]?.trim())
      .map(([questionId, _]) => questionId)

    if (missingExplanations.length > 0) {
      alert(
        `Please provide explanations for why the following questions are not applicable: ${missingExplanations.join(", ")}`,
      )
      return
    }

    console.log("[v0] Saving category evaluation")
    const detailed = {
      benchmarkAnswers,
      processAnswers,
      benchmarkSources,
      processSources,
      additionalAspects,
      score: currentScore,
    }
    console.log("[v0] Calling onSaveDetailed with:", detailed)
    onSaveDetailed?.(category.id, detailed)
    console.log("[v0] Calling onScoreUpdate with:", currentScore)
    onScoreUpdate(currentScore)
  }

  const isComplete =
    Object.keys(benchmarkAnswers).length + Object.keys(processAnswers).length === getBenchmarkQuestions().length + getProcessQuestions().length

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="font-heading flex flex-col sm:flex-row sm:items-center gap-2">
                  <span>{category.name}</span>
                  <Badge variant={category.type === "capability" ? "secondary" : "destructive"}>{category.type}</Badge>
                </CardTitle>
                <CardDescription className="mt-2">{category.description}</CardDescription>
              </div>
              {isComplete && (
                <div className="text-left sm:text-right">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-sm sm:text-base">Score: {currentScore.totalScore}/{currentScore.totalApplicable || currentScore.totalQuestions}</span>
                  </div>
                  <Badge
                    variant={
                      currentScore.status === "strong"
                        ? "default"
                        : currentScore.status === "adequate"
                          ? "secondary"
                          : currentScore.status === "weak"
                            ? "outline"
                            : "destructive"
                    }
                  >
                    {currentScore.status.charAt(0).toUpperCase() + currentScore.status.slice(1)}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-muted/30 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Source Types</h4>
                <div className="grid gap-2 text-sm">
                  {Object.entries(SOURCE_TYPES).map(([key, type]) => (
                    <div key={key}>
                      <span className="font-medium">{type.label}:</span> {type.description}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Evaluation Guidance</h4>
                <p className="text-sm mb-2 font-medium">
                  Note: The benchmarks and evaluations listed below are suggested examples, not exhaustive requirements.
                  You may use other relevant benchmarks and evaluation methods appropriate for your system.
                </p>
                <div className="text-sm whitespace-pre-line">{category.detailedGuidance}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Part A: Benchmark & Testing Evaluation</CardTitle>
            <CardDescription>
              Quantitative assessment through standardized tests and measurements ({currentScore.benchmarkScore}/6)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {getBenchmarkQuestions().map((question) => (
              <div key={question.id} className="space-y-3">
                <div className="flex items-start gap-2">
                  <Label className="text-sm font-medium flex-1">
                    {question.id}. {question.text}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p>{question.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <RadioGroup
                  value={benchmarkAnswers[question.id] || ""}
                  onValueChange={(value) => handleAnswerChange(question.id, value, "benchmark")}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id={`${question.id}-yes`} />
                    <Label htmlFor={`${question.id}-yes`}>Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id={`${question.id}-no`} />
                    <Label htmlFor={`${question.id}-no`}>No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="na" id={`${question.id}-na`} />
                    <Label htmlFor={`${question.id}-na`}>Not Applicable</Label>
                  </div>
                </RadioGroup>

                {benchmarkAnswers[question.id] === "na" && (
                  <div className="ml-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <Label className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Explanation Required: Why is this question not applicable?
                    </Label>
                    <Textarea
                      placeholder="Please explain why this question/category is not applicable to your system. This explanation will be included in the evaluation documentation."
                      value={naExplanations[question.id] || ""}
                      onChange={(e) => handleNaExplanationChange(question.id, e.target.value)}
                      rows={3}
                      className="mt-2 border-yellow-300 dark:border-yellow-700"
                      required
                    />
                  </div>
                )}

                {benchmarkAnswers[question.id] === "yes" && (
                  <div className="space-y-4 ml-4 p-4 bg-muted/30 rounded-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <Label className="text-sm font-medium">Sources & Evidence</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSource(question.id, "benchmark")}
                        className="flex items-center gap-1 self-start sm:self-auto"
                      >
                        <Plus className="h-3 w-3" />
                        Add Source
                      </Button>
                    </div>

                    {(benchmarkSources[question.id] || []).map((source, index) => (
                      <div key={source.id} className="space-y-3 p-3 border rounded-lg bg-background">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <span className="text-sm font-medium">Source {index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSource(question.id, source.id, "benchmark")}
                            className="self-start sm:self-auto"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="grid gap-3">
                          {/* no structured hint here; description has contextual hints */}

                          {/* Render benchmark source fields from form-schema.json to keep fields uniform */}
                          {formSchema.benchmarkSourceFields.map((field: any) => (
                            <div key={field.name}>
                              <Label className="text-xs">{field.label}</Label>
                              {field.type === "textarea" ? (
                                <Textarea
                                  placeholder={field.placeholder || ""}
                                  value={(source as any)[field.name] || ""}
                                  onChange={(e) => updateSource(question.id, source.id, field.name, e.target.value, "benchmark")}
                                  rows={field.rows || 2}
                                />
                              ) : field.type === "radio" ? (
                                <RadioGroup
                                  value={(source as any)[field.name] || "internal"}
                                  onValueChange={(value) => updateSource(question.id, source.id, field.name, value, "benchmark")}
                                >
                                  <div className="flex flex-col gap-2">
                                    {field.options.map((opt: any) => (
                                      <div key={opt.value} className="flex items-center space-x-2">
                                        <RadioGroupItem value={opt.value} id={`${source.id}-${field.name}-${opt.value}`} />
                                        <Label htmlFor={`${source.id}-${field.name}-${opt.value}`} className="text-xs">
                                          {opt.label}
                                        </Label>
                                      </div>
                                    ))}
                                  </div>
                                </RadioGroup>
                              ) : (
                                <Input
                                  placeholder={field.placeholder || ""}
                                  value={(source as any)[field.name] || ""}
                                  onChange={(e) => updateSource(question.id, source.id, field.name, e.target.value, "benchmark")}
                                />
                              )}
                              {field.name === "description" && (
                                <p className="text-xs text-muted-foreground mt-1">{getHint(category.id, question.id, "benchmark")}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {(benchmarkSources[question.id] || []).length === 0 && (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        Click "Add Source" to document benchmarks and evidence
                      </div>
                    )}
                  </div>
                )}

                <Separator />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Part B: Documentation & Process Evaluation</CardTitle>
            <CardDescription>
              Governance, transparency, and risk management processes ({currentScore.processScore}/5)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {getProcessQuestions().map((question) => (
              <div key={question.id} className="space-y-3">
                <div className="flex items-start gap-2">
                  <Label className="text-sm font-medium flex-1">
                    {question.id}. {question.text}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p>{question.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <RadioGroup
                  value={processAnswers[question.id] || ""}
                  onValueChange={(value) => handleAnswerChange(question.id, value, "process")}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id={`${question.id}-yes`} />
                    <Label htmlFor={`${question.id}-yes`}>Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id={`${question.id}-no`} />
                    <Label htmlFor={`${question.id}-no`}>No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="na" id={`${question.id}-na`} />
                    <Label htmlFor={`${question.id}-na`}>Not Applicable</Label>
                  </div>
                </RadioGroup>

                {processAnswers[question.id] === "na" && (
                  <div className="ml-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <Label className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Explanation Required: Why is this question not applicable?
                    </Label>
                    <Textarea
                      placeholder="Please explain why this question/category is not applicable to your system. This explanation will be included in the evaluation documentation."
                      value={naExplanations[question.id] || ""}
                      onChange={(e) => handleNaExplanationChange(question.id, e.target.value)}
                      rows={3}
                      className="mt-2 border-yellow-300 dark:border-yellow-700"
                      required
                    />
                  </div>
                )}

                {processAnswers[question.id] === "yes" && (
                  <div className="space-y-4 ml-4 p-4 bg-muted/30 rounded-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <Label className="text-sm font-medium">Documentation & Evidence</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSource(question.id, "process")}
                        className="flex items-center gap-1 self-start sm:self-auto"
                      >
                        <Plus className="h-3 w-3" />
                        Add Documentation
                      </Button>
                    </div>

                    {(processSources[question.id] || []).map((source, index) => (
                      <div key={source.id} className="space-y-3 p-3 border rounded-lg bg-background">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <span className="text-sm font-medium">Document {index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSource(question.id, source.id, "process")}
                            className="self-start sm:self-auto"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="grid gap-3">
                          {/* no structured hint here; description has contextual hints */}

                          {/* Render process source fields from form-schema.json */}
                          {formSchema.processSourceFields.map((field: any) => (
                            <div key={field.name}>
                              <Label className="text-xs">{field.label}</Label>
                              {field.type === "textarea" ? (
                                <Textarea
                                  placeholder={field.placeholder || ""}
                                  value={(source as any)[field.name] || ""}
                                  onChange={(e) => updateSource(question.id, source.id, field.name, e.target.value, "process")}
                                  rows={field.rows || 2}
                                />
                              ) : (
                                <Input
                                  placeholder={field.placeholder || ""}
                                  value={(source as any)[field.name] || ""}
                                  onChange={(e) => updateSource(question.id, source.id, field.name, e.target.value, "process")}
                                />
                              )}
                              {field.name === "description" && (
                                <p className="text-xs text-muted-foreground mt-1">{getHint(category.id, question.id, "process")}</p>
                              )}
                            </div>
                          ))}

                          
                        </div>
                      </div>
                    ))}

                    {(processSources[question.id] || []).length === 0 && (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        Click "Add Documentation" to document policies and processes
                      </div>
                    )}
                  </div>
                )}

                <Separator />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Part C: Additional Evaluation Aspects</CardTitle>
            <CardDescription>{ADDITIONAL_ASPECTS_SECTION.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Additional evaluation aspects, methods, or considerations for this category:
              </Label>
              <Textarea
                placeholder="Document any other evaluation approaches, considerations, or aspects that may not have been captured by the structured questions above. This could include novel evaluation methods, domain-specific considerations, or unique aspects of your system's evaluation..."
                value={additionalAspects}
                onChange={(e) => setAdditionalAspects(e.target.value)}
                rows={6}
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                This section is for documentation purposes and will not affect the numerical score but will be included
                in the final evaluation report.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button onClick={handleSave} disabled={!isComplete} size="lg" className="w-full max-w-md">
            {score ? "Update" : "Save"} Category Evaluation
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}
