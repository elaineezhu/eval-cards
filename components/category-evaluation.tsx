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
import { BENCHMARK_QUESTIONS, PROCESS_QUESTIONS, SOURCE_TYPES, ADDITIONAL_ASPECTS_SECTION, getFieldPlaceholder, getHint } from "@/lib/category-data"

// The detailed per-category and per-question hints, plus recommended placeholders,
// are centralized in `lib/category-data.ts`. This component uses the exported
// helpers `getHint` and `getFieldPlaceholder` and the question lists.

const CustomFieldComponent = ({
  questionId,
  fieldType,
  value,
  onChange,
}: {
  questionId: string
  fieldType: string
  value: string
  onChange: (value: string) => void
}) => {
  const getFieldConfig = (questionId: string, fieldType: string) => {
    const configs: Record<string, Record<string, { label: string; placeholder: string; type?: string }>> = {
      A2: {
        thresholds: { label: "Quantitative Thresholds", placeholder: "e.g., >85% accuracy, <0.1 error rate" },
        thresholdSource: {
          label: "Threshold Source",
          placeholder: "e.g., industry standard, research paper, policy requirement",
        },
        passFail: { label: "Pass/Fail Determination", placeholder: "e.g., Pass - exceeded 85% threshold" },
      },
      A3: {
        comparativeScores: {
          label: "Comparative Scores",
          placeholder: "e.g., Our model: 87.2%, GPT-4: 85.1%, Previous version: 82.3%",
        },
        baselineType: { label: "Baseline Type", placeholder: "e.g., SOTA, previous version, industry standard" },
        significance: { label: "Statistical Significance", placeholder: "e.g., p<0.05, 95% CI: [1.2, 3.8]" },
      },
      A4: {
        testTypes: { label: "Test Types", placeholder: "e.g., adversarial attacks, load testing, distribution shift" },
        failureRates: { label: "Failure/Degradation Rates", placeholder: "e.g., 15% failure under adversarial inputs" },
        robustnessMetrics: {
          label: "Robustness Metrics",
          placeholder: "e.g., attack success rate, performance drop %",
        },
      },
      A5: {
        liveMetrics: { label: "Live Metrics Tracked", placeholder: "e.g., error rates, latency, drift detection" },
        samplingCadence: { label: "Sampling Cadence", placeholder: "e.g., every 1000 requests, hourly, daily" },
        alertThresholds: { label: "Alert Thresholds", placeholder: "e.g., >5% error rate, >500ms latency" },
      },
      A6: {
        procedure: {
          label: "Contamination Check Procedure",
          placeholder: "e.g., n-gram overlap analysis, URL deduplication",
        },
        contaminationRate: {
          label: "Contamination Rate",
          placeholder: "e.g., <1% overlap detected, 0.3% exact matches",
        },
        mitigations: { label: "Mitigations Taken", placeholder: "e.g., removed overlapping samples, used holdout set" },
      },
      A7: {
        comparisonSystems: { label: "Comparison Systems", placeholder: "e.g., GPT-4, Claude-3, Gemini Pro" },
        evaluationConditions: {
          label: "Evaluation Conditions",
          placeholder: "e.g., same prompts, temperature=0, identical hardware",
        },
        relativeMetrics: {
          label: "Relative Performance Metrics",
          placeholder: "e.g., 15% better accuracy, 2x faster inference",
        },
      },
      B1: {
        scope: {
          label: "Evaluation Scope",
          placeholder: "e.g., measures reasoning capability in mathematical contexts",
        },
        successFailureDefinitions: {
          label: "Success/Failure Definitions",
          placeholder: "e.g., success = >80% on grade-level problems",
        },
        hypotheses: { label: "Hypotheses Being Tested", placeholder: "e.g., model can solve multi-step word problems" },
      },
      B2: {
        replicationPackage: {
          label: "Replication Package",
          placeholder: "e.g., GitHub repo with code, configs, prompts",
        },
        accessLevel: { label: "Access Level", placeholder: "e.g., public, access-controlled, internal only" },
        proxies: { label: "Proxies (if not shareable)", placeholder: "e.g., synthetic examples, anonymized data" },
      },
      B5: {
        reviewers: { label: "Reviewers", placeholder: "e.g., domain experts, affected user groups, ethics board" },
        feedbackChanges: {
          label: "Changes from Feedback",
          placeholder: "e.g., added bias metrics, revised interpretation",
        },
        disagreements: {
          label: "Unresolved Disagreements",
          placeholder: "e.g., threshold levels, risk severity ratings",
        },
      },
      B6: {
        uncertaintyDisclosure: {
          label: "Uncertainty Disclosure",
          placeholder: "e.g., error bars, confidence intervals, variance across runs",
        },
        axesConsistency: { label: "Axes Consistency", placeholder: "e.g., consistent 0-100 scale, no truncated axes" },
        sampleSizes: { label: "Sample Sizes", placeholder: "e.g., n=1000 test samples, 5 random seeds" },
        selectionCriteria: { label: "Selection Criteria", placeholder: "e.g., all results shown, no cherry-picking" },
      },
      B8: {
        triggers: {
          label: "Re-evaluation Triggers",
          placeholder: "e.g., model updates, data drift >5%, security incidents",
        },
        versionedSpecs: { label: "Versioned Eval Specs", placeholder: "e.g., eval spec v2.1, change log maintained" },
        auditTrail: { label: "Audit Trail", placeholder: "e.g., all changes logged with timestamps and rationale" },
        mitigationProtocols: {
          label: "Mitigation Protocols",
          placeholder: "e.g., automated rollback, manual review process",
        },
        retestProcedures: {
          label: "Retest Procedures",
          placeholder: "e.g., full eval suite after fixes, regression testing",
        },
      },
    }

    return configs[questionId]?.[fieldType] || { label: fieldType, placeholder: "" }
  }

  const config = getFieldConfig(questionId, fieldType)

  return (
    <div>
      <Label className="text-xs font-medium">{config.label}</Label>
      <Textarea
        placeholder={config.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="mt-1"
      />
    </div>
  )
}

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
}

export function CategoryEvaluation({ category, score, onScoreUpdate }: CategoryEvaluationProps) {
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
      const newSource: Source = {
        id: Date.now().toString(),
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
      const newDocSource: DocumentationSource = {
        id: Date.now().toString(),
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
    const totalBenchmarkQuestions = BENCHMARK_QUESTIONS.length
    const totalProcessQuestions = PROCESS_QUESTIONS.length
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
    console.log("[v0] Calling onScoreUpdate with:", currentScore)
    onScoreUpdate(currentScore)
  }

  const isComplete =
    Object.keys(benchmarkAnswers).length + Object.keys(processAnswers).length === BENCHMARK_QUESTIONS.length + PROCESS_QUESTIONS.length

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <CardTitle className="font-heading flex items-center gap-2">
                  {category.name}
                  <Badge variant={category.type === "capability" ? "secondary" : "destructive"}>{category.type}</Badge>
                </CardTitle>
                <CardDescription className="mt-2">{category.description}</CardDescription>
              </div>
              {isComplete && (
                <div className="text-right">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium">Score: {currentScore.totalScore}/{currentScore.totalApplicable || currentScore.totalQuestions}</span>
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
            {BENCHMARK_QUESTIONS.map((question) => (
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
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Sources & Evidence</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSource(question.id, "benchmark")}
                        className="flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Add Source
                      </Button>
                    </div>

                    {(benchmarkSources[question.id] || []).map((source, index) => (
                      <div key={source.id} className="space-y-3 p-3 border rounded-lg bg-background">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Source {index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSource(question.id, source.id, "benchmark")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="grid gap-3">
                          {/* no structured hint here; description has contextual hints */}

                          <div>
                            <Label className="text-xs">Benchmark/Dataset Name</Label>
                            <Input
                              placeholder={getFieldPlaceholder(category.id, question.id, "benchmarkName")}
                              value={source.benchmarkName || ""}
                              onChange={(e) =>
                                updateSource(question.id, source.id, "benchmarkName", e.target.value, "benchmark")
                              }
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Version</Label>
                              <Input
                                placeholder="e.g., v1.2, 2024-01"
                                value={source.version || ""}
                                onChange={(e) =>
                                  updateSource(question.id, source.id, "version", e.target.value, "benchmark")
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Task Variants</Label>
                              <Input
                                placeholder="e.g., multiple choice, generation"
                                value={source.taskVariants || ""}
                                onChange={(e) =>
                                  updateSource(question.id, source.id, "taskVariants", e.target.value, "benchmark")
                                }
                              />
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs">Metrics</Label>
                            <Input
                              placeholder={getFieldPlaceholder(category.id, question.id, "metrics")}
                              value={source.metrics || ""}
                              onChange={(e) =>
                                updateSource(question.id, source.id, "metrics", e.target.value, "benchmark")
                              }
                            />
                          </div>

                          <div>
                            <Label className="text-xs">URL</Label>
                            <Input
                              placeholder="https://..."
                              value={source.url}
                              onChange={(e) => updateSource(question.id, source.id, "url", e.target.value, "benchmark")}
                            />
                          </div>

                          <div>
                            <Label className="text-xs">Description</Label>
                            <Textarea
                              placeholder="Describe the benchmark, test, or evaluation method..."
                              value={source.description}
                              onChange={(e) =>
                                updateSource(question.id, source.id, "description", e.target.value, "benchmark")
                              }
                              rows={2}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {getHint(category.id, question.id, "benchmark")}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Source Type</Label>
                              <RadioGroup
                                value={source.sourceType}
                                onValueChange={(value) =>
                                  updateSource(question.id, source.id, "sourceType", value, "benchmark")
                                }
                              >
                                {Object.entries(SOURCE_TYPES).map(([key, type]) => (
                                  <div key={key} className="flex items-center space-x-2">
                                    <RadioGroupItem value={key} id={`${source.id}-${key}`} />
                                    <Label htmlFor={`${source.id}-${key}`} className="text-xs">
                                      {type.label}
                                    </Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </div>

                            <div>
                              <Label className="text-xs">Score (if applicable)</Label>
                              <Input
                                placeholder="e.g., 85%, 0.92, Pass"
                                value={source.score || ""}
                                onChange={(e) =>
                                  updateSource(question.id, source.id, "score", e.target.value, "benchmark")
                                }
                              />
                              <Label className="text-xs mt-2">Confidence Interval (optional)</Label>
                              <Input
                                placeholder="e.g., 95% CI [90,94]"
                                value={(source as any).confidenceInterval || ""}
                                onChange={(e) =>
                                  updateSource(question.id, source.id, "confidenceInterval", e.target.value, "benchmark")
                                }
                              />
                            </div>
                          </div>
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
            {PROCESS_QUESTIONS.map((question) => (
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
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Documentation & Evidence</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSource(question.id, "process")}
                        className="flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Add Documentation
                      </Button>
                    </div>

                    {(processSources[question.id] || []).map((source, index) => (
                      <div key={source.id} className="space-y-3 p-3 border rounded-lg bg-background">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Document {index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSource(question.id, source.id, "process")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="grid gap-3">
                          {/* no structured hint here; description has contextual hints */}

                          <div>
                            <Label className="text-xs">URL</Label>
                            <Input
                              placeholder="https://..."
                              value={source.url}
                              onChange={(e) => updateSource(question.id, source.id, "url", e.target.value, "process")}
                            />
                          </div>

                          <div>
                            <Label className="text-xs">Description</Label>
                            <Textarea
                              placeholder="Describe the documentation, policy, or process..."
                              value={source.description}
                              onChange={(e) =>
                                updateSource(question.id, source.id, "description", e.target.value, "process")
                              }
                              rows={2}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {getHint(category.id, question.id, "process")}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Source Type</Label>
                              <RadioGroup
                                value={source.sourceType}
                                onValueChange={(value) =>
                                  updateSource(question.id, source.id, "sourceType", value, "process")
                                }
                              >
                                {Object.entries(SOURCE_TYPES).map(([key, type]) => (
                                  <div key={key} className="flex items-center space-x-2">
                                    <RadioGroupItem value={key} id={`${source.id}-${key}`} />
                                    <Label htmlFor={`${source.id}-${key}`} className="text-xs">
                                      {type.label}
                                    </Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </div>

                            <div>
                              <Label className="text-xs">Document Type</Label>
                              <Input
                                placeholder="e.g., Policy, Procedure, Report"
                                value={source.documentType || ""}
                                onChange={(e) =>
                                  updateSource(question.id, source.id, "documentType", e.target.value, "process")
                                }
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div>
                              <Label className="text-xs">Title</Label>
                              <Input
                                placeholder="Document title"
                                value={(source as any).title || ""}
                                onChange={(e) => updateSource(question.id, source.id, "title", e.target.value, "process")}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Author</Label>
                              <Input
                                placeholder="Author or owner"
                                value={(source as any).author || ""}
                                onChange={(e) => updateSource(question.id, source.id, "author", e.target.value, "process")}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div>
                              <Label className="text-xs">Organization</Label>
                              <Input
                                placeholder="Owning org"
                                value={(source as any).organization || ""}
                                onChange={(e) => updateSource(question.id, source.id, "organization", e.target.value, "process")}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Date</Label>
                              <Input
                                placeholder="YYYY-MM-DD"
                                value={(source as any).date || ""}
                                onChange={(e) => updateSource(question.id, source.id, "date", e.target.value, "process")}
                              />
                            </div>
                          </div>

                          
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
