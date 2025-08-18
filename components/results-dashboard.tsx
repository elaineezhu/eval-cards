"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { SystemInfo, CategoryScore } from "@/components/ai-evaluation-dashboard"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Download, AlertTriangle, CheckCircle, AlertCircle, XCircle, Globe, Calendar, User, Building, Cpu, MonitorSpeaker, Database, Hash, Tags, Clock, Activity, Headphones, Settings } from "lucide-react"

interface Category {
  id: string
  name: string
  type: "capability" | "risk"
}

interface ResultsDashboardProps {
  systemInfo: SystemInfo | null
  categories: Category[]
  selectedCategories: string[]
  categoryScores: Record<string, CategoryScore>
  excludedCategoryReasons?: Record<string, string>
}

const STATUS_COLORS = {
  strong: "#22c55e",
  adequate: "#3b82f6",
  weak: "#f59e0b",
  insufficient: "#ef4444",
}

const STATUS_ICONS = {
  strong: CheckCircle,
  adequate: CheckCircle,
  weak: AlertCircle,
  insufficient: XCircle,
}

export function ResultsDashboard({
  systemInfo,
  categories,
  selectedCategories,
  categoryScores,
  excludedCategoryReasons,
}: ResultsDashboardProps) {
  const safeCategories = categories || []
  const safeSelectedCategories = selectedCategories || []
  const safeCategoryScores = categoryScores || {}

  console.log("[v0] ResultsDashboard rendering with:", {
    systemInfo,
    categoriesCount: safeCategories.length,
    selectedCount: safeSelectedCategories.length,
    scoresCount: Object.keys(safeCategoryScores).length,
    scores: safeCategoryScores,
  })

  const selectedCategoryObjects = safeCategories.filter((c) => safeSelectedCategories.includes(c.id))

  const getStatusCounts = () => {
    const scores = Object.values(safeCategoryScores)
    return {
      strong: scores.filter((s) => s.status === "strong").length,
      adequate: scores.filter((s) => s.status === "adequate").length,
      weak: scores.filter((s) => s.status === "weak").length,
      insufficient: scores.filter((s) => s.status === "insufficient").length,
    }
  }

  const getCapabilityRiskBreakdown = () => {
    const capability = selectedCategoryObjects.filter((c) => c.type === "capability")
    const risk = selectedCategoryObjects.filter((c) => c.type === "risk")

    const capabilityScores = capability.map((c) => safeCategoryScores[c.id]).filter(Boolean)
    const riskScores = risk.map((c) => safeCategoryScores[c.id]).filter(Boolean)

    const avgCapability =
      capabilityScores.length > 0
        ? capabilityScores.reduce((sum, s) => sum + (s.totalScore || 0), 0) / capabilityScores.length
        : 0
    const avgRisk =
      riskScores.length > 0 ? riskScores.reduce((sum, s) => sum + (s.totalScore || 0), 0) / riskScores.length : 0

    const safeCapability = isNaN(avgCapability) || !isFinite(avgCapability) ? 0 : avgCapability
    const safeRisk = isNaN(avgRisk) || !isFinite(avgRisk) ? 0 : avgRisk

    console.log("[v0] Capability/Risk breakdown:", {
      capabilityScores: capabilityScores.length,
      riskScores: riskScores.length,
      avgCapability,
      avgRisk,
      safeCapability,
      safeRisk,
    })

    return {
      capability: safeCapability,
      risk: safeRisk,
    }
  }

  const getChartData = () => {
    return selectedCategoryObjects
      .map((category) => {
        const score = safeCategoryScores[category.id]
        return {
          name: category.name.length > 20 ? category.name.substring(0, 20) + "..." : category.name,
          fullName: category.name,
          benchmarkScore: score?.benchmarkScore || 0,
          processScore: score?.processScore || 0,
          totalScore: score?.totalScore || 0,
          type: category.type,
        }
      })
      .sort((a, b) => b.totalScore - a.totalScore)
  }

  const getPieData = () => {
    const counts = getStatusCounts()
    return [
      { name: "Strong (12-15)", value: counts.strong, color: STATUS_COLORS.strong },
      { name: "Adequate (8-11)", value: counts.adequate, color: STATUS_COLORS.adequate },
      { name: "Weak (4-7)", value: counts.weak, color: STATUS_COLORS.weak },
      { name: "Insufficient (0-3)", value: counts.insufficient, color: STATUS_COLORS.insufficient },
    ].filter((item) => item.value > 0)
  }

  const statusCounts = getStatusCounts()
  const breakdown = getCapabilityRiskBreakdown()
  const chartData = getChartData()
  const pieData = getPieData()

  const totalEvaluated = Object.keys(safeCategoryScores).length
  const overallAverage =
    totalEvaluated > 0
      ? Object.values(safeCategoryScores).reduce((sum, s) => sum + (s.totalScore || 0), 0) / totalEvaluated
      : 0

  const safeOverallAverage = isNaN(overallAverage) || !isFinite(overallAverage) ? 0 : overallAverage

  console.log("[v0] Overall average calculation:", {
    totalEvaluated,
    overallAverage,
    safeOverallAverage,
  })

  const safeToFixed = (value: number, digits = 1): string => {
    if (isNaN(value) || !isFinite(value)) {
      console.log("[v0] Warning: Invalid value for toFixed:", value)
      return "0.0"
    }
    return value.toFixed(digits)
  }

  const exportResults = () => {
    const results = {
      systemInfo,
      evaluationDate: new Date().toISOString(),
      summary: {
        totalCategories: safeSelectedCategories.length,
        evaluatedCategories: totalEvaluated,
        overallAverage: safeOverallAverage.toFixed(1),
        statusBreakdown: statusCounts,
      },
      categoryResults: safeCategories.map((category) => ({
        ...category,
        score: safeCategoryScores[category.id] || null,
        excludedReason: !safeSelectedCategories.includes(category.id)
          ? excludedCategoryReasons?.[category.id] || null
          : null,
      })),
    }

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ai-evaluation-${systemInfo?.name || "system"}-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* System Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-heading">Evaluation Results</CardTitle>
              <CardDescription>Comprehensive assessment results for {systemInfo?.name}</CardDescription>
            </div>
            <Button onClick={exportResults} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Results
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{totalEvaluated}</div>
              <div className="text-sm text-muted-foreground">Categories Evaluated</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{safeToFixed(safeOverallAverage)}/15</div>
              <div className="text-sm text-muted-foreground">Overall Average</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{safeToFixed(breakdown.capability)}/15</div>
              <div className="text-sm text-muted-foreground">Capability Average</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{safeToFixed(breakdown.risk)}/15</div>
              <div className="text-sm text-muted-foreground">Risk Average</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Information (detailed) */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-heading flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                System Information
              </CardTitle>
              <CardDescription>A summary of metadata provided for the evaluated system</CardDescription>
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
                  <div className="text-sm font-medium text-muted-foreground">System Name</div>
                  <div className="text-lg font-semibold text-foreground mt-1">
                    {(systemInfo as any)?.systemName || systemInfo?.name || "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-50 dark:bg-green-950 rounded-lg">
                  <Tags className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground">System Version</div>
                  <div className="text-lg font-semibold text-foreground mt-1">
                    {systemInfo?.version || (systemInfo as any)?.modelTag || "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-50 dark:bg-purple-950 rounded-lg">
                  <Building className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground">Provider</div>
                  <div className="text-lg font-semibold text-foreground mt-1">{systemInfo?.provider || "—"}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950 rounded-lg">
                  <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground">URL</div>
                  <div className="text-lg font-semibold text-foreground mt-1 break-all">
                    {systemInfo?.url ? (
                      <a href={systemInfo.url} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 underline decoration-primary/30 hover:decoration-primary/60 transition-colors">
                        {systemInfo.url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-orange-50 dark:bg-orange-950 rounded-lg">
                  <Settings className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground">Model Type</div>
                  <div className="text-lg font-semibold text-foreground mt-1">
                    {systemInfo?.modelType ? (
                      <Badge variant="secondary" className="text-sm">
                        {systemInfo.modelType === "foundational" ? "Foundational Model" : 
                         systemInfo.modelType === "fine-tuned" ? "Fine-tuned Model" : 
                         "Not Applicable"}
                      </Badge>
                    ) : "—"}
                  </div>
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
                  <div className="text-sm font-medium text-muted-foreground">Deployment Context</div>
                  <div className="text-lg font-semibold text-foreground mt-1">
                    {(systemInfo as any)?.deploymentContext || (systemInfo?.deploymentContexts && systemInfo.deploymentContexts.join(", ")) || "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
                  <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground">Input Modalities</div>
                  <div className="text-lg font-semibold text-foreground mt-1">
                    {systemInfo?.inputModalities?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {systemInfo.inputModalities.map((modality: string, idx: number) => (
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
                  <div className="text-sm font-medium text-muted-foreground">Output Modalities</div>
                  <div className="text-lg font-semibold text-foreground mt-1">
                    {systemInfo?.outputModalities?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {systemInfo.outputModalities.map((modality: string, idx: number) => (
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
                  <div className="text-sm font-medium text-muted-foreground">Knowledge Cutoff</div>
                  <div className="text-lg font-semibold text-foreground mt-1">{systemInfo?.knowledgeCutoff || "—"}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-violet-50 dark:bg-violet-950 rounded-lg">
                  <User className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground">Evaluator</div>
                  <div className="text-lg font-semibold text-foreground mt-1">{(systemInfo as any)?.evaluator || "—"}</div>
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
              <div className="font-mono text-sm text-blue-900 dark:text-blue-100 break-all">{(systemInfo as any)?.id || "—"}</div>
            </div>

            <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/50 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <Tags className="h-4 w-4 text-green-600 dark:text-green-400" />
                <div className="text-sm font-medium text-green-700 dark:text-green-300">System Types</div>
              </div>
              <div className="font-medium text-green-900 dark:text-green-100">{(systemInfo as any)?.systemTypes?.length ? (systemInfo as any).systemTypes.join(", ") : "—"}</div>
            </div>

            <div className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/50 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <div className="text-sm font-medium text-purple-700 dark:text-purple-300">Evaluation Date</div>
              </div>
              <div className="font-medium text-purple-900 dark:text-purple-100">{(systemInfo as any)?.evaluationDate || "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  {Object.entries(statusCounts).map(([status, count]) => {
          const key = (status as string) as keyof typeof STATUS_ICONS
          const Icon = STATUS_ICONS[key] ?? AlertTriangle
          return (
            <Card key={status}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm text-muted-foreground capitalize">{status}</div>
                  </div>
                  <Icon className="h-8 w-8" style={{ color: STATUS_COLORS[key] ?? STATUS_COLORS.insufficient }} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
            <CardDescription>Categories by evaluation status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Scores */}
        <Card>
          <CardHeader>
            <CardTitle>Category Scores</CardTitle>
            <CardDescription>Benchmark vs Process scores by category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.slice(0, 8)} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 15]} />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip labelFormatter={(label) => chartData.find((d) => d.name === label)?.fullName || label} />
                <Bar dataKey="benchmarkScore" stackId="a" fill="#3b82f6" name="Benchmark" />
                <Bar dataKey="processScore" stackId="a" fill="#8b5cf6" name="Process" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Results */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Category Results</CardTitle>
          <CardDescription>Complete breakdown of all evaluated categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {selectedCategoryObjects.map((category) => {
              const score = safeCategoryScores[category.id]
              if (!score) return null

              const key = (score.status as string) as keyof typeof STATUS_ICONS
              const Icon = (STATUS_ICONS as any)[key] ?? AlertTriangle
              const color = (STATUS_COLORS as any)[key] ?? STATUS_COLORS.insufficient

              return (
                <div key={category.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" style={{ color }} />
                    <div>
                      <div className="font-medium">{category.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={category.type === "capability" ? "secondary" : "destructive"}
                          className="text-xs"
                        >
                          {category.type}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Benchmark: {score.benchmarkScore}/7 | Process: {score.processScore}/8
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{score.totalScore}/15</div>
                    <Badge
                      variant={
                        score.status === "strong"
                          ? "default"
                          : score.status === "adequate"
                            ? "secondary"
                            : score.status === "weak"
                              ? "outline"
                              : "destructive"
                      }
                      className="text-xs"
                    >
                      {score.status}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Excluded Categories with Reasons */}
      <Card>
        <CardHeader>
          <CardTitle>Excluded Categories & Reasons</CardTitle>
          <CardDescription>Categories you marked as not applicable and the rationale provided</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {safeCategories
              .filter((c) => !safeSelectedCategories.includes(c.id))
              .map((c) => (
                <div key={c.id} className="p-3 border rounded-md">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {excludedCategoryReasons?.[c.id] || "No reason provided"}
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Priority Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Priority Action Areas
          </CardTitle>
          <CardDescription>Categories requiring immediate attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {statusCounts.insufficient > 0 && (
              <div>
                <h4 className="font-medium text-destructive mb-2">
                  Critical - Insufficient Categories ({statusCounts.insufficient})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedCategoryObjects
                    .filter((c) => safeCategoryScores[c.id]?.status === "insufficient")
                    .map((category) => (
                      <Badge key={category.id} variant="destructive" className="justify-start">
                        {category.name}
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            {statusCounts.weak > 0 && (
              <div>
                <h4 className="font-medium text-amber-600 mb-2">
                  High Priority - Weak Categories ({statusCounts.weak})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedCategoryObjects
                    .filter((c) => safeCategoryScores[c.id]?.status === "weak")
                    .map((category) => (
                      <Badge key={category.id} variant="outline" className="justify-start">
                        {category.name}
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            {statusCounts.insufficient === 0 && statusCounts.weak === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-600" />
                <p>No critical priority areas identified. All categories scored adequate or above.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
