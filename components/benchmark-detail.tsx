"use client"

// Force recompile
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  ExternalLink, TrendingUp, Info, Database, Settings, FileCode, Building, Calendar, User, Server, 
  ChevronDown, ChevronUp, BarChart3, Award, AlertTriangle,
  Cpu, Tag, Globe, Network, Activity, MessageSquare, Clock, Hash, Layers, CheckCircle, Search
} from "lucide-react"
import type { BenchmarkEvaluation, CategoryType, EvaluationResult } from "@/lib/benchmark-schema"
import { inferCategoryFromBenchmark, EVALUATION_CATEGORIES } from "@/lib/benchmark-schema"
import { formatScore, getBenchmarkDisplayName, getCategoryStats } from "@/lib/eval-processing"
import type { ModelEvaluationSummary } from "@/lib/eval-processing"
import { useState, useEffect, useMemo } from "react"

interface BenchmarkDetailProps {
  summary: ModelEvaluationSummary
}

export function BenchmarkDetail({ summary }: BenchmarkDetailProps) {
  const stats = getCategoryStats(summary)
  
  // Calculate additional summary stats
  const categoryScores = stats.categories.map(c => ({
    category: c.category,
    score: c.avg_score,
    count: c.count
  }));
  
  const bestCategory = [...categoryScores].sort((a, b) => b.score - a.score)[0];
  const worstCategory = [...categoryScores].sort((a, b) => a.score - b.score)[0];
  
  const overallAvg = categoryScores.reduce((acc, curr) => acc + (curr.score * curr.count), 0) / summary.total_evaluations;

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return isoString
    }
  }
  
  return (
    <div className="space-y-6">
      {/* System Information Card */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4 border-b bg-muted/10">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-xl">System Information</CardTitle>
              <CardDescription>Metadata about the evaluated system</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          {/* Main Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {/* Left Column */}
            <div className="space-y-6">
              <div className="flex gap-3">
                <div className="mt-1 bg-blue-100 dark:bg-blue-900/30 p-2 rounded-md h-fit">
                  <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">System Name</div>
                  <div className="font-semibold text-lg">{summary.model_info.name}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-1 bg-green-100 dark:bg-green-900/30 p-2 rounded-md h-fit">
                  <Tag className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">System Version</div>
                  <div className="font-medium">{summary.model_info.model_version || "N/A"}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-1 bg-purple-100 dark:bg-purple-900/30 p-2 rounded-md h-fit">
                  <Building className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Provider</div>
                  <div className="font-medium">{summary.model_info.developer}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-1 bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-md h-fit">
                  <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">URL</div>
                  {summary.model_info.model_url ? (
                    <a href={summary.model_info.model_url} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-dotted hover:text-primary truncate block max-w-[200px]">
                      {summary.model_info.model_url.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <div className="font-medium text-muted-foreground">N/A</div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div className="flex gap-3">
                <div className="mt-1 bg-cyan-100 dark:bg-cyan-900/30 p-2 rounded-md h-fit">
                  <Network className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Deployment Context</div>
                  <div className="font-medium">
                    {summary.model_info.additional_details?.deployment_context || "General Purpose"}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-1 bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-md h-fit">
                  <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Input Modalities</div>
                  <div className="flex flex-wrap gap-2">
                    {summary.model_info.modalities?.input.map(m => (
                      <Badge key={m} variant="secondary" className="font-normal">{m}</Badge>
                    )) || <span className="text-muted-foreground">Text</span>}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-1 bg-rose-100 dark:bg-rose-900/30 p-2 rounded-md h-fit">
                  <MessageSquare className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Output Modalities</div>
                  <div className="flex flex-wrap gap-2">
                    {summary.model_info.modalities?.output.map(m => (
                      <Badge key={m} variant="secondary" className="font-normal">{m}</Badge>
                    )) || <span className="text-muted-foreground">Text</span>}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-1 bg-amber-100 dark:bg-amber-900/30 p-2 rounded-md h-fit">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Knowledge Cutoff / Release</div>
                  <div className="font-medium">
                    {summary.model_info.release_date ? formatDate(summary.model_info.release_date).split(',')[0] : "Unknown"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Colored Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                <Hash className="h-4 w-4" />
                <span className="text-sm font-semibold">System ID</span>
              </div>
              <div className="font-mono text-sm truncate" title={summary.model_info.id}>
                {summary.model_info.id}
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                <Layers className="h-4 w-4" />
                <span className="text-sm font-semibold">System Types</span>
              </div>
              <div className="font-medium text-sm truncate">
                {summary.model_info.architecture || summary.model_info.inference_engine || "Model"}
              </div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-2">
                <Calendar className="h-4 w-4" />
                <span className="text-sm font-semibold">Evaluation Date</span>
              </div>
              <div className="font-medium text-sm">
                {formatDate(summary.last_updated).split(' at ')[0]}
              </div>
            </div>
          </div>

          {/* Footer Stats */}
          <div className="flex flex-col md:flex-row gap-8 pt-4 border-t">
            <div className="flex gap-3">
              <div className="mt-1 bg-muted p-2 rounded-md h-fit">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Evaluator</div>
                <div className="font-medium">Aggregated Benchmarks</div>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="mt-1 bg-pink-100 dark:bg-pink-900/30 p-2 rounded-md h-fit">
                <Activity className="h-4 w-4 text-pink-600 dark:text-pink-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Completeness Score</div>
                <div className="font-bold text-lg">
                  {Math.round((stats.categories.length / EVALUATION_CATEGORIES.length) * 100)}%
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Evaluation Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="p-4 bg-muted/20 rounded-lg border">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Total Evals</span>
          </div>
          <div className="text-3xl font-bold text-primary">{summary.total_evaluations}</div>
        </div>
        <div className="p-4 bg-muted/20 rounded-lg border">
          <div className="flex items-center justify-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Avg Score (Norm)</span>
          </div>
          <div className="text-3xl font-bold text-blue-600">{(overallAvg * 100).toFixed(1)}%</div>
        </div>
        {bestCategory && (
          <div className="p-4 bg-green-50/50 dark:bg-green-900/10 rounded-lg border border-green-100 dark:border-green-900/20">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Award className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Best Category</span>
            </div>
            <div className="text-lg font-bold text-green-700 dark:text-green-400 truncate" title={bestCategory.category}>
              {bestCategory.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </div>
            <div className="text-xs text-green-600/80">{(bestCategory.score * 100).toFixed(1)}% avg</div>
          </div>
        )}
        {worstCategory && (
          <div className="p-4 bg-red-50/50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/20">
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-muted-foreground">Needs Improvement</span>
            </div>
            <div className="text-lg font-bold text-red-700 dark:text-red-400 truncate" title={worstCategory.category}>
              {worstCategory.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </div>
            <div className="text-xs text-red-600/80">{(worstCategory.score * 100).toFixed(1)}% avg</div>
          </div>
        )}
      </div>

      {/* Categories View */}
      <Accordion type="multiple" className="space-y-4" defaultValue={stats.categories.map(c => c.category)}>
        {stats.categories.map((stat) => {
          const evals = summary.evaluations_by_category[stat.category] || []
          
          // Collect all results for this category across all evaluations
          const categoryResults: { evaluation: BenchmarkEvaluation, result: EvaluationResult }[] = []
          
          evals.forEach(eval_ => {
            eval_.evaluation_results.forEach(result => {
              let resultCategory: CategoryType | undefined;

              // Try to get category from factsheet first
              if (result.factsheet?.functional_props) {
                const props = result.factsheet.functional_props.split(';').map(p => p.trim());
                // Check if the current category we are rendering is in the props
                if (props.includes(stat.category)) {
                  resultCategory = stat.category;
                }
              }

              // If not found in factsheet, try to infer
              if (!resultCategory) {
                const inferred = inferCategoryFromBenchmark(result.evaluation_name);
                if (inferred === stat.category) {
                  resultCategory = inferred;
                }
              }
              
              if (resultCategory === stat.category) {
                categoryResults.push({ evaluation: eval_, result })
              }
            })
          })
          
          if (categoryResults.length === 0) return null

          return (
            <AccordionItem key={stat.category} value={stat.category} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold tracking-tight capitalize">
                    {stat.category.replace(/-/g, ' ')}
                  </h2>
                  <Badge variant="secondary" className="text-sm">
                    {categoryResults.length} Benchmarks
                  </Badge>
                  <div className="text-sm text-muted-foreground font-normal">
                    Avg: {(stat.avg_score * 100).toFixed(1)}%
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6">
                <div className="grid grid-cols-1 gap-4">
                  {categoryResults.map((item, idx) => (
                    <BenchmarkResultCard 
                      key={`${item.evaluation.evaluation_id}-${idx}`}
                      evaluation={item.evaluation}
                      result={item.result}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}

function SampleDataDialog({ 
  samples, 
  evaluationName 
}: { 
  samples: any[], 
  evaluationName: string 
}) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const filteredSamples = samples.filter(sample => 
    sample.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sample.response.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sample.ground_truth.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalPages = Math.ceil(filteredSamples.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const currentSamples = filteredSamples.slice(startIndex, startIndex + itemsPerPage)

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Database className="h-4 w-4" />
          View All {samples.length} Samples
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Sample Level Data</DialogTitle>
          <DialogDescription>
            Detailed results for {samples.length} samples from {evaluationName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center py-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search samples..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredSamples.length)} of {filteredSamples.length}
          </div>
        </div>

        <div className="flex-1 border rounded-md overflow-hidden">
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead className="min-w-[300px]">Input</TableHead>
                  <TableHead className="min-w-[300px]">Model Response</TableHead>
                  <TableHead className="min-w-[300px]">Ground Truth</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentSamples.length > 0 ? (
                  currentSamples.map((sample, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs align-top">
                        {sample.sample_id || idx}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="whitespace-pre-wrap text-xs font-mono max-h-[200px] overflow-y-auto">
                          {sample.input}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="whitespace-pre-wrap text-xs text-blue-600 dark:text-blue-400 max-h-[200px] overflow-y-auto">
                          {sample.response}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="whitespace-pre-wrap text-xs text-green-600 dark:text-green-400 max-h-[200px] overflow-y-auto">
                          {sample.ground_truth}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No results found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <div className="text-sm font-medium">
            Page {currentPage} of {totalPages || 1}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
          >
            Next
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BenchmarkResultCard({ 
  evaluation, 
  result 
}: { 
  evaluation: BenchmarkEvaluation, 
  result: EvaluationResult 
}) {
  const [isOpen, setIsOpen] = useState(false)

  const randomSample = useMemo(() => {
    const samples = evaluation.detailed_evaluation_results_per_samples;
    if (!samples || samples.length === 0) return null;
    // Use a simple hash of the evaluation ID to pick a consistent "random" sample for this session
    // or just Math.random() if we don't mind it changing on refresh
    const randomIndex = Math.floor(Math.random() * samples.length);
    return samples[randomIndex];
  }, [evaluation.detailed_evaluation_results_per_samples]);

  const formatDate = (timestamp: string) => {
    try {
      // Handle unix timestamp (seconds or milliseconds)
      const ts = parseFloat(timestamp)
      const date = new Date(ts > 10000000000 ? ts : ts * 1000)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return timestamp
    }
  }

  const { score } = result.score_details
  const { min_score = 0, max_score = 1, unit, lower_is_better } = result.metric_config
  
  // Normalize to 0-1 for color coding
  let normalized = (score - min_score) / (max_score - min_score)
  if (lower_is_better) normalized = 1 - normalized
  
  const isHigh = normalized >= 0.8
  const isMedium = normalized >= 0.6
  
  let displayScore = score.toFixed(2)
  let displayUnit = unit || "Accuracy"
  
  if (unit === 'accuracy' || !unit) {
      displayScore = (score * 100).toFixed(1) + "%"
      displayUnit = "Accuracy"
  } else if (unit === 'points') {
      displayScore = score.toFixed(1)
      displayUnit = "/ 10"
  } else if (unit === 'pass@1') {
      displayScore = (score * 100).toFixed(1) + "%"
      displayUnit = "Pass@1"
  } else {
      displayUnit = unit.charAt(0).toUpperCase() + unit.slice(1)
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden border-l-4 border-l-primary">
        <div className="bg-card p-4 flex justify-between items-center">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{result.evaluation_name}</h3>
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                {result.metric_config.score_type}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1 line-clamp-1">{result.metric_config.evaluation_description}</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-2xl font-bold">{displayScore}</div>
              <div className="text-xs text-muted-foreground">{displayUnit}</div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-9 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="sr-only">Toggle details</span>
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <Separator />
          <CardContent className="p-6 space-y-6 bg-muted/5">
            {/* Source Provenance */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-4 w-4 text-primary" />
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source Provenance</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/10 p-4 rounded-lg border">
                {/* Source Metadata */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-primary/80">Evaluator Metadata</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Organization:</span>
                      <span className="font-medium">{evaluation.source_metadata.source_organization_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Relationship:</span>
                      <Badge variant="outline" className="text-xs">{evaluation.source_metadata.evaluator_relationship}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Source Type:</span>
                      <span className="capitalize">{evaluation.source_metadata.source_type.replace(/_/g, ' ')}</span>
                    </div>
                    {evaluation.source_metadata.source_url && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">URL:</span>
                        <a href={evaluation.source_metadata.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                          Link <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date:</span>
                      <span>{formatDate(evaluation.retrieved_timestamp)}</span>
                    </div>
                  </div>
                </div>

                {/* Source Data */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-primary/80">Dataset Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-medium">
                        {Array.isArray(evaluation.source_data) ? 'Multiple Sources' : evaluation.source_data.dataset_name}
                      </span>
                    </div>
                    {!Array.isArray(evaluation.source_data) && (
                      <>
                        {evaluation.source_data.hf_repo && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">HuggingFace:</span>
                            <a href={`https://huggingface.co/${evaluation.source_data.hf_repo}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                              {evaluation.source_data.hf_repo.split('/')[1] || evaluation.source_data.hf_repo} <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {evaluation.source_data.hf_split && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Split:</span>
                            <code className="bg-muted px-1 rounded text-xs">{evaluation.source_data.hf_split}</code>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Samples:</span>
                          <span>{evaluation.source_data.samples_number?.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Evaluation Results */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Evaluation Results</div>
              
              <div className="bg-background rounded-lg p-4 border">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <div className="font-medium text-lg">Overall Score</div>
                    <div className="text-xs text-muted-foreground">
                      {result.metric_config.score_type} • {result.metric_config.min_score}-{result.metric_config.max_score} • {result.metric_config.lower_is_better ? 'Lower is better' : 'Higher is better'}
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-primary">{displayScore}</div>
                </div>
                <Progress value={normalized * 100} className="h-2 mb-4" />
                
                {result.score_details.details && Object.keys(result.score_details.details).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
                    {Object.entries(result.score_details.details).map(([key, value]) => {
                      let valDisplay = typeof value === 'number' ? value.toFixed(2) : value;
                      if (typeof value === 'number') {
                          if (unit === 'accuracy' || !unit || unit === 'pass@1') {
                              valDisplay = (value * 100).toFixed(1) + "%";
                          } else {
                              valDisplay = value.toFixed(2);
                          }
                      }
                      
                      return (
                      <div key={key} className="bg-muted/30 p-3 rounded border">
                        <div className="text-xs text-muted-foreground mb-1 truncate" title={key}>{key}</div>
                        <div className="font-semibold text-lg">
                          {valDisplay}
                        </div>
                      </div>
                    )})}
                  </div>
                )}
              </div>
            </div>

            {/* Factsheet Information */}
            {result.factsheet && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileCode className="h-4 w-4 text-primary" />
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Benchmark Factsheet</div>
                </div>
                
                <div className="grid grid-cols-1 gap-6 bg-background p-6 rounded-lg border">
                  {/* General Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {result.factsheet.purpose && (
                      <div className="col-span-full">
                        <span className="font-semibold text-sm block mb-1">Purpose</span>
                        <p className="text-sm text-muted-foreground">{result.factsheet.purpose}</p>
                      </div>
                    )}
                    {result.factsheet.principles_tested && (
                      <div className="col-span-full">
                        <span className="font-semibold text-sm block mb-1">Principles Tested</span>
                        <p className="text-sm text-muted-foreground">{result.factsheet.principles_tested}</p>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Methodology */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3 text-primary/80">Methodology</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      {result.factsheet.judge && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Judge</span>
                          <span>{result.factsheet.judge}</span>
                        </div>
                      )}
                      {result.factsheet.protocol && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Protocol</span>
                          <span>{result.factsheet.protocol}</span>
                        </div>
                      )}
                      {result.factsheet.model_access && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Model Access</span>
                          <span>{result.factsheet.model_access}</span>
                        </div>
                      )}
                      {result.factsheet.input_modality && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Input Modality</span>
                          <span>{result.factsheet.input_modality}</span>
                        </div>
                      )}
                      {result.factsheet.output_modality && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Output Modality</span>
                          <span>{result.factsheet.output_modality}</span>
                        </div>
                      )}
                      {result.factsheet.design && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Design</span>
                          <span>{result.factsheet.design}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Data & Validation */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3 text-primary/80">Data & Validation</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {result.factsheet.size && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Size</span>
                          <span>{result.factsheet.size}</span>
                        </div>
                      )}
                      {result.factsheet.splits && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Splits</span>
                          <span>{result.factsheet.splits}</span>
                        </div>
                      )}
                      {result.factsheet.has_heldout !== undefined && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Held-out Set</span>
                          <Badge variant={result.factsheet.has_heldout ? "default" : "secondary"}>
                            {result.factsheet.has_heldout ? "Yes" : "No"}
                          </Badge>
                        </div>
                      )}
                      {result.factsheet.is_valid !== undefined && (
                        <div>
                          <span className="font-medium block text-xs text-muted-foreground uppercase mb-1">Valid</span>
                          <Badge variant={result.factsheet.is_valid ? "outline" : "destructive"}>
                            {result.factsheet.is_valid ? "Yes" : "No"}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Limitations */}
                  {result.factsheet.known_limitations && (
                    <>
                      <Separator />
                      <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded border border-red-100 dark:border-red-900/20">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="font-semibold text-sm">Known Limitations</span>
                        </div>
                        <p className="text-sm text-red-600/90 dark:text-red-400/90">{result.factsheet.known_limitations}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Generation Configuration */}
            {result.generation_config && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="h-4 w-4 text-primary" />
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generation Configuration</div>
                </div>
                
                <div className="bg-slate-950 text-slate-200 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  {result.generation_config.additional_details && (
                    <div className="mb-4 pb-4 border-b border-slate-800">
                      <div className="text-slate-500 text-xs uppercase mb-1">Description</div>
                      <div>{result.generation_config.additional_details}</div>
                    </div>
                  )}
                  
                  {result.generation_config.generation_args && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(result.generation_config.generation_args).map(([key, value]) => (
                        <div key={key}>
                          <div className="text-slate-500 text-xs">{key}</div>
                          <div className="text-emerald-400">{String(value)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sample Level Data */}
            {evaluation.detailed_evaluation_results_per_samples && evaluation.detailed_evaluation_results_per_samples.length > 0 && randomSample && (
              <div>
                <Separator className="my-6" />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-primary" />
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sample Level Data (Random Sample)</div>
                  </div>
                  <Badge variant="outline">{evaluation.detailed_evaluation_results_per_samples.length} Samples</Badge>
                </div>

                <div className="space-y-4">
                  <div className="bg-muted/10 border rounded-lg p-4 text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="secondary" className="font-mono text-xs">ID: {randomSample.sample_id}</Badge>
                    </div>
                    
                    <div className="grid gap-4">
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Input</div>
                        <div className="bg-muted/30 p-3 rounded whitespace-pre-wrap font-mono text-xs">{randomSample.input}</div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Model Response</div>
                          <div className="bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                            {randomSample.response}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Ground Truth</div>
                          <div className="bg-green-50/50 dark:bg-green-900/10 p-3 rounded whitespace-pre-wrap text-green-900 dark:text-green-100">
                            {randomSample.ground_truth}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center pt-2">
                    <SampleDataDialog 
                      samples={evaluation.detailed_evaluation_results_per_samples}
                      evaluationName={result.evaluation_name}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Footer Links */}
            <div className="flex gap-3 pt-2">
              {result.detailed_evaluation_results_url && (
                <a 
                  href={result.detailed_evaluation_results_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Database className="h-4 w-4" />
                  View detailed per-sample results <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function AllEvaluationsView({ evaluations }: { evaluations: BenchmarkEvaluation[] }) {
  return (
    <div className="space-y-6">
      {evaluations.map((eval_, idx) => (
        <div key={idx} className="space-y-6">
          {eval_.evaluation_results.map((result, ridx) => (
            <BenchmarkResultCard 
              key={`${eval_.evaluation_id}-${ridx}`}
              evaluation={eval_}
              result={result}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function CategoryStatsView({ 
  stats, 
  summary
}: { 
  stats: { category: CategoryType; count: number; avg_score: number }[]
  summary: ModelEvaluationSummary
}) {
  const getCategoryColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600'
    if (score >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }
  
  const getCategoryLabel = (category: CategoryType): string => {
    return category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {stats.map((stat) => {
        const evals = summary.evaluations_by_category[stat.category] || []
        
        return (
          <Card key={stat.category} className="overflow-hidden">
            <CardHeader className="bg-muted/30 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{getCategoryLabel(stat.category)}</CardTitle>
                <div className={`text-2xl font-bold ${getCategoryColor(stat.avg_score)}`}>
                  {(stat.avg_score * 100).toFixed(1)}%
                </div>
              </div>
              <CardDescription>{stat.count} evaluation{stat.count !== 1 ? 's' : ''}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {evals.map((eval_: BenchmarkEvaluation, idx: number) => {
                  // Filter results to only show those that match this category
                  const relevantResults = eval_.evaluation_results.filter((result: any) => {
                    const resultCategory = inferCategoryFromBenchmark(result.evaluation_name)
                    return resultCategory === stat.category
                  })
                  
                  if (relevantResults.length === 0) return null
                  
                  return relevantResults.map((result: any, ridx: number) => (
                    <div key={`${idx}-${ridx}`} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{result.evaluation_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {Array.isArray(eval_.source_data) 
                            ? (eval_.source_metadata.source_name || 'Unknown')
                            : eval_.source_data.dataset_name}
                        </div>
                      </div>
                      <div className="font-mono font-semibold">
                        {formatScore(
                          result.score_details.score,
                          result.metric_config.score_type,
                          result.metric_config.max_score
                        )}
                      </div>
                    </div>
                  ))
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
