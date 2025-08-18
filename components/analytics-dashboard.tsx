"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Trophy, Target, TrendingUp, BarChart3, Grid3X3, List, Filter, Brain, Shield, CheckCircle, ChevronDown } from "lucide-react"

// Category mappings from schema
const CATEGORY_NAMES: { [key: string]: string } = {
  'language-communication': 'Language & Communication',
  'social-intelligence': 'Social Intelligence & Interaction',
  'problem-solving': 'Problem Solving',
  'creativity-innovation': 'Creativity & Innovation',
  'learning-memory': 'Learning & Memory',
  'perception-vision': 'Perception & Vision',
  'physical-manipulation': 'Physical Manipulation & Motor Skills',
  'metacognition': 'Metacognition & Self-Awareness',
  'robotic-intelligence': 'Robotic Intelligence & Autonomy',
  'harmful-content': 'Harmful Content Generation',
  'information-integrity': 'Information Integrity & Misinformation',
  'privacy-data': 'Privacy & Data Protection',
  'bias-fairness': 'Bias & Fairness',
  'security-robustness': 'Security & Robustness',
  'dangerous-capabilities': 'Dangerous Capabilities & Misuse',
  'human-ai-interaction': 'Human-AI Interaction Risks',
  'environmental-impact': 'Environmental & Resource Impact',
  'economic-displacement': 'Economic & Labor Displacement',
  'governance-accountability': 'Governance & Accountability',
  'value-chain': 'Value Chain & Supply Chain Risks'
}

const CAPABILITY_CATEGORIES = [
  'language-communication',
  'social-intelligence', 
  'problem-solving',
  'creativity-innovation',
  'learning-memory',
  'perception-vision',
  'physical-manipulation',
  'metacognition',
  'robotic-intelligence'
]

const RISK_CATEGORIES = [
  'harmful-content',
  'information-integrity',
  'privacy-data',
  'bias-fairness',
  'security-robustness',
  'dangerous-capabilities',
  'human-ai-interaction',
  'environmental-impact',
  'economic-displacement',
  'governance-accountability',
  'value-chain'
]

const MODALITIES = [
  "Text", "Vision", "Audio", "Video", "Code", "Robotics/Action", "Other"
]

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

interface AnalyticsDashboardProps {
  evaluations?: Evaluation[]
}

export default function AnalyticsDashboard({ evaluations = [] }: AnalyticsDashboardProps) {
  const [loading, setLoading] = useState(false)
  
  // Filter states
  const [modalityFilter, setModalityFilter] = useState("all")
  const [organizationFilter, setOrganizationFilter] = useState("all")
  const [sortBy, setSortBy] = useState<"score" | "date" | "name">("score")
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  
  // Category selection state
  const [selectedCategories, setSelectedCategories] = useState<string[]>(Object.keys(CATEGORY_NAMES))

  // Get unique organizations
  const ORGANIZATIONS = useMemo(() => 
    Array.from(new Set(evaluations.map(e => e.organization)))
  , [evaluations])

  // Calculate scores dynamically based on selected categories
  const recalculatedEvaluations = useMemo(() => {
    return evaluations.map(evaluation => {
      if (!evaluation.categoryEvaluations || selectedCategories.length === 0) {
        return { ...evaluation, overallScore: 0 }
      }

      const scores = selectedCategories.map(categoryId => {
        const categoryData = evaluation.categoryEvaluations?.[categoryId]
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

      const overallScore = scores.length > 0 
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length 
        : 0

      return { ...evaluation, overallScore }
    })
  }, [evaluations, selectedCategories])

  // Apply filters
  const filteredEvaluations = useMemo(() => {
    return recalculatedEvaluations
      .filter(evaluation => {
        const matchesModality = modalityFilter === "all" || evaluation.modality.includes(modalityFilter)
        const matchesOrganization = organizationFilter === "all" || evaluation.organization === organizationFilter
        return matchesModality && matchesOrganization
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "score":
            return b.overallScore - a.overallScore
          case "date":
            return new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime()
          case "name":
            return a.name.localeCompare(b.name)
          default:
            return 0
        }
      })
  }, [recalculatedEvaluations, modalityFilter, organizationFilter, sortBy])

  // Calculate category data based on selected categories
  const categoryData = useMemo(() => {
    return selectedCategories.map(categoryId => {
      const scores = evaluations.map(evaluation => {
        const categoryData = evaluation.categoryEvaluations?.[categoryId]
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

      const averageScore = scores.length > 0 
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length 
        : 0

      return {
        id: categoryId,
        name: CATEGORY_NAMES[categoryId],
        type: CAPABILITY_CATEGORIES.includes(categoryId) ? "capability" : "risk",
        averageScore,
        evaluationCount: evaluations.length
      }
    })
  }, [evaluations, selectedCategories])

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default"
    if (score >= 60) return "secondary"
    if (score >= 40) return "outline"
    return "destructive"
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400"
    if (score >= 60) return "text-blue-600 dark:text-blue-400"
    if (score >= 40) return "text-yellow-600 dark:text-yellow-400"
    return "text-red-600 dark:text-red-400"
  }

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  const selectAllCategories = () => {
    setSelectedCategories(Object.keys(CATEGORY_NAMES))
  }

  const selectOnlyCapabilities = () => {
    setSelectedCategories(CAPABILITY_CATEGORIES)
  }

  const selectOnlyRisks = () => {
    setSelectedCategories(RISK_CATEGORIES)
  }

  const clearAllCategories = () => {
    setSelectedCategories([])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Trophy className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{evaluations.length}</p>
                <p className="text-sm text-muted-foreground">Total Evaluations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {filteredEvaluations.length > 0 ? 
                    Math.round(filteredEvaluations.reduce((sum, evaluation) => sum + evaluation.overallScore, 0) / filteredEvaluations.length) : 0}%
                </p>
                <p className="text-sm text-muted-foreground">Average Score</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {filteredEvaluations.length > 0 ? Math.round(Math.max(...filteredEvaluations.map(e => e.overallScore))) : 0}%
                </p>
                <p className="text-sm text-muted-foreground">Highest Score</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{selectedCategories.length}/{Object.keys(CATEGORY_NAMES).length}</p>
                <p className="text-sm text-muted-foreground">Selected Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overall" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overall">Overall Leaderboard</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overall" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filters & View
                  </CardTitle>
                  <CardDescription>Filter and sort evaluation results</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={viewMode === "grid" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Category Selection Dropdown */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Categories ({selectedCategories.length} selected)</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        Select Categories
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <div className="p-4 space-y-4">
                        {/* Quick Actions */}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={selectAllCategories}>
                            All
                          </Button>
                          <Button size="sm" variant="outline" onClick={selectOnlyCapabilities}>
                            <Brain className="h-3 w-3 mr-1" />
                            Capabilities
                          </Button>
                          <Button size="sm" variant="outline" onClick={selectOnlyRisks}>
                            <Shield className="h-3 w-3 mr-1" />
                            Risks
                          </Button>
                          <Button size="sm" variant="outline" onClick={clearAllCategories}>
                            Clear
                          </Button>
                        </div>

                        {/* Capabilities */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Brain className="h-4 w-4 text-blue-500" />
                            Capabilities
                          </h4>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {CAPABILITY_CATEGORIES.map(categoryId => (
                              <div key={categoryId} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`cap-${categoryId}`}
                                  checked={selectedCategories.includes(categoryId)}
                                  onCheckedChange={() => handleCategoryToggle(categoryId)}
                                />
                                <label htmlFor={`cap-${categoryId}`} className="text-xs cursor-pointer">
                                  {CATEGORY_NAMES[categoryId]}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Risks */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Shield className="h-4 w-4 text-red-500" />
                            Risks
                          </h4>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {RISK_CATEGORIES.map(categoryId => (
                              <div key={categoryId} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`risk-${categoryId}`}
                                  checked={selectedCategories.includes(categoryId)}
                                  onCheckedChange={() => handleCategoryToggle(categoryId)}
                                />
                                <label htmlFor={`risk-${categoryId}`} className="text-xs cursor-pointer">
                                  {CATEGORY_NAMES[categoryId]}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Modality</label>
                  <Select value={modalityFilter} onValueChange={setModalityFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modalities</SelectItem>
                      {MODALITIES.map(modality => (
                        <SelectItem key={modality} value={modality}>{modality}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Organization</label>
                  <Select value={organizationFilter} onValueChange={setOrganizationFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Organizations</SelectItem>
                      {ORGANIZATIONS.map(org => (
                        <SelectItem key={org} value={org}>{org}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Sort By</label>
                  <Select value={sortBy} onValueChange={(value: "score" | "date" | "name") => setSortBy(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="score">Completeness Score</SelectItem>
                      <SelectItem value="date">Submit Date</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setModalityFilter("all")
                      setOrganizationFilter("all")
                      setSortBy("score")
                    }}
                    className="w-full"
                  >
                    Reset Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Overall Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle>Overall Completeness Leaderboard</CardTitle>
              <CardDescription>
                Ranked by evaluation completeness score ({filteredEvaluations.length} {filteredEvaluations.length === 1 ? 'evaluation' : 'evaluations'})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredEvaluations.map((evaluation, index) => (
                    <Card key={evaluation.id} className="relative">
                      <CardContent className="p-6">
                        {index < 3 && (
                          <div className="absolute -top-2 -right-2">
                            <Badge variant={index === 0 ? "default" : "secondary"} className="rounded-full px-3 py-1">
                              #{index + 1}
                            </Badge>
                          </div>
                        )}
                        
                        <div className="space-y-4">
                          <div>
                            <h3 className="font-semibold text-lg">{evaluation.name}</h3>
                            <p className="text-sm text-muted-foreground">{evaluation.organization}</p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Completeness Score</span>
                              <Badge variant={getScoreBadgeVariant(evaluation.overallScore)}>
                                {Math.round(evaluation.overallScore)}%
                              </Badge>
                            </div>
                            <Progress value={evaluation.overallScore} className="h-2" />
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {evaluation.modality.map(mod => (
                              <Badge key={mod} variant="outline" className="text-xs">
                                {mod}
                              </Badge>
                            ))}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            Submitted: {new Date(evaluation.submittedDate).toLocaleDateString()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredEvaluations.map((evaluation, index) => (
                    <div key={evaluation.id} className="group hover:bg-muted/30 transition-colors rounded-lg p-3">
                      <div className="flex items-center gap-4">
                        {/* Organization Logo/Icon */}
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {evaluation.organization.charAt(0)}
                          </div>
                          <div className="text-left">
                            <div className="font-medium text-sm">{evaluation.organization}</div>
                            <div className="font-semibold">{evaluation.name}</div>
                          </div>
                        </div>

                        {/* Horizontal Bar Chart */}
                        <div className="flex-1 relative">
                          <div className="flex items-center gap-3">
                            {/* Progress Bar Container */}
                            <div className="flex-1 relative h-6 bg-muted rounded-full overflow-hidden">
                              {/* Background bar */}
                              <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700"></div>
                              {/* Progress bar */}
                              <div 
                                className={`absolute left-0 top-0 h-full transition-all duration-500 ease-out ${
                                  evaluation.overallScore >= 80 ? 'bg-purple-600' :
                                  evaluation.overallScore >= 60 ? 'bg-purple-500' :
                                  evaluation.overallScore >= 40 ? 'bg-purple-400' :
                                  'bg-purple-300'
                                }`}
                                style={{ 
                                  width: `${Math.max(evaluation.overallScore, 5)}%`,
                                  animationDelay: `${index * 100}ms`
                                }}
                              ></div>
                            </div>
                            
                            {/* Score */}
                            <div className="min-w-[50px] text-right">
                              <span className="text-lg font-bold">
                                {Math.round(evaluation.overallScore)}%
                              </span>
                            </div>
                          </div>
                          
                          {/* Modality badges - shown on hover */}
                          <div className="flex flex-wrap gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {evaluation.modality.slice(0, 3).map(mod => (
                              <Badge key={mod} variant="outline" className="text-xs">
                                {mod}
                              </Badge>
                            ))}
                            {evaluation.modality.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{evaluation.modality.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          {/* Key Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Categories</CardTitle>
                <CardDescription>Categories with highest average completeness from selected categories</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categoryData
                    .sort((a, b) => b.averageScore - a.averageScore)
                    .slice(0, 5)
                    .map((category, index) => (
                      <div key={category.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center p-0">
                            {index + 1}
                          </Badge>
                          <div>
                            <p className="font-medium text-sm">{category.name}</p>
                            <Badge variant={category.type === "capability" ? "secondary" : "destructive"} className="text-xs">
                              {category.type}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${getScoreColor(category.averageScore)}`}>
                            {Math.round(category.averageScore)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  {categoryData.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">
                      No categories selected. Please select categories from the filters above.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Areas for Improvement</CardTitle>
                <CardDescription>Categories with lowest average completeness from selected categories</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categoryData
                    .sort((a, b) => a.averageScore - b.averageScore)
                    .slice(0, 5)
                    .map((category, index) => (
                      <div key={category.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center p-0">
                            {index + 1}
                          </Badge>
                          <div>
                            <p className="font-medium text-sm">{category.name}</p>
                            <Badge variant={category.type === "capability" ? "secondary" : "destructive"} className="text-xs">
                              {category.type}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${getScoreColor(category.averageScore)}`}>
                            {Math.round(category.averageScore)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  {categoryData.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">
                      No categories selected. Please select categories from the filters above.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Category Performance Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Capabilities */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-blue-500" />
                  Capability Categories
                </CardTitle>
                <CardDescription>Average completeness by capability category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categoryData
                    .filter(cat => cat.type === "capability")
                    .sort((a, b) => b.averageScore - a.averageScore)
                    .map(category => (
                      <div key={category.id} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate pr-2">{category.name}</span>
                          <Badge variant={getScoreBadgeVariant(category.averageScore)}>
                            {Math.round(category.averageScore)}%
                          </Badge>
                        </div>
                        <Progress value={category.averageScore} className="h-2" />
                        <div className="text-xs text-muted-foreground">
                          {category.evaluationCount} evaluation{category.evaluationCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    ))}
                  {categoryData.filter(cat => cat.type === "capability").length === 0 && (
                    <p className="text-muted-foreground text-center py-4">
                      No capability categories selected.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Risks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-red-500" />
                  Risk Categories
                </CardTitle>
                <CardDescription>Average completeness by risk category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categoryData
                    .filter(cat => cat.type === "risk")
                    .sort((a, b) => b.averageScore - a.averageScore)
                    .map(category => (
                      <div key={category.id} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate pr-2">{category.name}</span>
                          <Badge variant={getScoreBadgeVariant(category.averageScore)}>
                            {Math.round(category.averageScore)}%
                          </Badge>
                        </div>
                        <Progress value={category.averageScore} className="h-2" />
                        <div className="text-xs text-muted-foreground">
                          {category.evaluationCount} evaluation{category.evaluationCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    ))}
                  {categoryData.filter(cat => cat.type === "risk").length === 0 && (
                    <p className="text-muted-foreground text-center py-4">
                      No risk categories selected.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Distribution Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Score Distribution</CardTitle>
              <CardDescription>Breakdown of evaluation completeness scores based on current filters and selected categories</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { range: "80-100%", color: "bg-green-500", count: filteredEvaluations.filter(e => e.overallScore >= 80).length },
                  { range: "60-79%", color: "bg-blue-500", count: filteredEvaluations.filter(e => e.overallScore >= 60 && e.overallScore < 80).length },
                  { range: "40-59%", color: "bg-yellow-500", count: filteredEvaluations.filter(e => e.overallScore >= 40 && e.overallScore < 60).length },
                  { range: "0-39%", color: "bg-red-500", count: filteredEvaluations.filter(e => e.overallScore < 40).length }
                ].map(item => (
                  <div key={item.range} className="text-center space-y-2">
                    <div className={`${item.color} rounded-full w-16 h-16 flex items-center justify-center text-white font-bold text-xl mx-auto`}>
                      {item.count}
                    </div>
                    <p className="text-sm font-medium">{item.range}</p>
                    <p className="text-xs text-muted-foreground">
                      {filteredEvaluations.length > 0 ? Math.round((item.count / filteredEvaluations.length) * 100) : 0}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Additional Insights */}
          {evaluations.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Most Common Modalities</CardTitle>
                  <CardDescription>Frequently evaluated modality combinations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Array.from(new Set(evaluations.flatMap(e => e.modality)))
                      .map(modality => ({
                        modality,
                        count: evaluations.filter(e => e.modality.includes(modality)).length
                      }))
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 5)
                      .map(item => (
                        <div key={item.modality} className="flex justify-between items-center">
                          <Badge variant="outline">{item.modality}</Badge>
                          <span className="text-sm font-medium">{item.count} evaluation{item.count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Organizations</CardTitle>
                  <CardDescription>Number of evaluations per organization</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {ORGANIZATIONS
                      .map(org => ({
                        organization: org,
                        count: evaluations.filter(e => e.organization === org).length
                      }))
                      .sort((a, b) => b.count - a.count)
                      .map(item => (
                        <div key={item.organization} className="flex justify-between items-center">
                          <span className="text-sm font-medium">{item.organization}</span>
                          <Badge variant="secondary">{item.count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Evaluation Timeline</CardTitle>
                  <CardDescription>Recent evaluation activity</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {evaluations
                      .sort((a, b) => new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime())
                      .slice(0, 5)
                      .map(evaluation => (
                        <div key={evaluation.id} className="flex justify-between items-center text-sm">
                          <span className="font-medium">{evaluation.name}</span>
                          <span className="text-muted-foreground">
                            {new Date(evaluation.submittedDate).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
