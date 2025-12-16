"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Eye, ExternalLink, Award, TrendingUp, Calendar, Building } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { CategoryType } from "@/lib/benchmark-schema"
import { EVALUATION_CATEGORIES } from "@/lib/benchmark-schema"

export type BenchmarkEvaluationCardData = {
  id: string
  model_name: string
  model_id: string
  developer: string
  evaluations_count: number
  benchmarks_count: number
  categories: CategoryType[]
  category_stats: Record<CategoryType, number>
  latest_timestamp: string
  
  // Quick stats
  top_scores: Array<{
    benchmark: string
    score: number
    metric: string
    unit?: string
  }>
  
  // Links
  source_urls: string[]
  detail_urls: string[]

  // Model Metadata
  model_url?: string
  release_date?: string
  input_modalities?: string[]
  output_modalities?: string[]
  architecture?: string
  params?: string
  inference_engine?: string
  inference_platform?: string
}

interface BenchmarkEvaluationCardProps {
  data: BenchmarkEvaluationCardData
  onDelete?: (id: string) => void
}

export function BenchmarkEvaluationCard({ data, onDelete }: BenchmarkEvaluationCardProps) {
  const router = useRouter()
  
  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return isoString
    }
  }
  
  const getCategoryColor = (category: CategoryType, index: number): string => {
    const colors = [
      "bg-emerald-500", "bg-blue-500", "bg-indigo-500", "bg-violet-500", 
      "bg-fuchsia-500", "bg-pink-500", "bg-rose-500", "bg-orange-500",
      "bg-amber-500", "bg-yellow-500", "bg-lime-500", "bg-teal-500"
    ]
    // Use a consistent hash or just the index if the list is stable
    return colors[index % colors.length]
  }
  
  const getCategoryLabel = (category: CategoryType): string => {
    return category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const renderCategoryDistribution = () => {
    const totalBenchmarks = data.categories.reduce((acc, cat) => acc + (data.category_stats[cat] || 0), 0)
    
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-end">
          <span className="text-sm font-medium text-muted-foreground">Category Breakdown</span>
          <span className="text-xs text-muted-foreground">({EVALUATION_CATEGORIES.length} categories, {totalBenchmarks} benchmarks)</span>
        </div>
        <div className="flex h-3 w-full gap-0.5 rounded-full overflow-hidden bg-secondary/30">
          {EVALUATION_CATEGORIES.map((category, idx) => {
            const count = data.category_stats[category] || 0
            const isZero = count === 0
            
            return (
              <TooltipProvider key={category}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className={`h-full ${getCategoryColor(category, idx)} transition-all cursor-help ${isZero ? 'w-1 flex-none opacity-30 hover:opacity-50' : 'hover:opacity-80'}`}
                      style={!isZero ? { flexGrow: count } : undefined}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-semibold">{getCategoryLabel(category)}</p>
                    <p className="text-xs">{count} benchmarks</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          })}
        </div>
      </div>
    )
  }
  
  const completeness = Math.round((data.categories.length / EVALUATION_CATEGORIES.length) * 100)
  
  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
      <CardHeader className="space-y-4 pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1" onClick={() => router.push(`/benchmark/${encodeURIComponent(data.id)}`)}>
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors">
                {data.model_name}
              </CardTitle>
            </div>
            <div className="text-sm text-muted-foreground mb-3">
              {data.developer}
            </div>
            
            {((data.input_modalities?.length || 0) > 1 || (data.output_modalities?.length || 0) > 1) && (
              <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200 gap-1">
                <span className="text-lg">🤖</span> Multimodal
              </Badge>
            )}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/benchmark/${encodeURIComponent(data.id)}`)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              {data.source_urls.length > 0 && (
                <DropdownMenuItem onClick={() => window.open(data.source_urls[0], '_blank')}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Source
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem 
                  onClick={() => onDelete(data.id)}
                  className="text-destructive"
                >
                  <Award className="mr-2 h-4 w-4" />
                  Remove
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Completeness & Date Row */}
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-muted-foreground">Completeness</div>
            <div className="h-7 w-full bg-secondary rounded-full overflow-hidden relative">
              <div 
                className="h-full bg-blue-600 absolute top-0 left-0 transition-all duration-500"
                style={{ width: `${completeness}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] z-10">
                {data.categories.length}/{EVALUATION_CATEGORIES.length} categories
              </div>
            </div>
          </div>
          
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-muted-foreground">Submitted</div>
            <div className="h-7 flex items-center text-sm font-medium">
              {formatDate(data.latest_timestamp)}
            </div>
          </div>
        </div>

        {/* Broken Bars */}
        <div className="space-y-4">
          {renderCategoryDistribution()}
        </div>
      </CardContent>
    </Card>
  )
}
