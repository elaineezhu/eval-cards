/**
 * Processing utilities for benchmark-first evaluation data
 */

import type {
  BenchmarkEvaluation,
  EvaluationCardData,
  CategoryType,
} from './benchmark-schema'
import type { ModelEvaluationSummary } from './benchmark-schema'
import { inferCategoryFromBenchmark, EVALUATION_CATEGORIES } from './benchmark-schema'

export type { ModelEvaluationSummary }

/**
 * Group multiple evaluations by model
 */
export function groupEvaluationsByModel(
  evaluations: BenchmarkEvaluation[]
): Record<string, BenchmarkEvaluation[]> {
  const grouped: Record<string, BenchmarkEvaluation[]> = {}
  
  for (const eval_ of evaluations) {
    const modelId = eval_.model_info.id
    if (!grouped[modelId]) {
      grouped[modelId] = []
    }
    grouped[modelId].push(eval_)
  }
  
  return grouped
}

/**
 * Create a model evaluation summary from grouped evaluations
 */
export function createModelSummary(
  evaluations: BenchmarkEvaluation[]
): ModelEvaluationSummary {
  if (evaluations.length === 0) {
    throw new Error('No evaluations provided')
  }
  
  const modelInfo = evaluations[0].model_info
  const evaluationsByCategory: Record<string, BenchmarkEvaluation[]> = {}
  const categoriesSet = new Set<CategoryType>()
  
  // Group by category - track which categories each evaluation belongs to
  for (const eval_ of evaluations) {
    const evalCategories = new Set<CategoryType>()
    
    for (const result of eval_.evaluation_results) {
      // Try to get category from factsheet first
      let category: CategoryType | undefined;
      
      if (result.factsheet?.functional_props) {
        // The factsheet might contain multiple categories separated by semicolon
        // We'll pick the first one that matches our known categories
        const props = result.factsheet.functional_props.split(';').map(p => p.trim());
        for (const prop of props) {
          if (EVALUATION_CATEGORIES.includes(prop as CategoryType)) {
            category = prop as CategoryType;
            break;
          }
        }
      }

      // Infer category from evaluation name if not found in factsheet
      if (!category) {
        category = inferCategoryFromBenchmark(result.evaluation_name)
      }
      
      // Fallback to dataset name if source_data is an object
      if (!category && !Array.isArray(eval_.source_data)) {
        category = inferCategoryFromBenchmark(eval_.source_data.dataset_name)
      }
      
      if (category) {
        evalCategories.add(category)
        categoriesSet.add(category)
      }
    }
    
    // Add evaluation to each unique category it belongs to (once per category)
    for (const category of evalCategories) {
      if (!evaluationsByCategory[category]) {
        evaluationsByCategory[category] = []
      }
      evaluationsByCategory[category].push(eval_)
    }
  }
  
  // Find latest timestamp
  const timestamps = evaluations.map(e => parseFloat(e.retrieved_timestamp))
  const latestTimestamp = new Date(Math.max(...timestamps) * 1000).toISOString()
  
  // Calculate total benchmark results
  const totalResults = evaluations.reduce((sum, eval_) => sum + eval_.evaluation_results.length, 0)

  return {
    model_info: modelInfo,
    evaluations_by_category: evaluationsByCategory as Record<CategoryType, BenchmarkEvaluation[]>,
    total_evaluations: totalResults,
    last_updated: latestTimestamp,
    categories_covered: Array.from(categoriesSet),
  }
}

/**
 * Convert model summary to card display format
 */
export function createEvaluationCard(
  summary: ModelEvaluationSummary
): EvaluationCardData {
  // Get all unique benchmarks
  const benchmarksSet = new Set<string>()
  const allScores: Array<{
    benchmark: string
    score: number
    metric: string
    unit?: string
  }> = []
  const sourceUrls = new Set<string>()
  const detailUrls = new Set<string>()
  
  // Collect all evaluations
  for (const evals of Object.values(summary.evaluations_by_category)) {
    for (const eval_ of evals) {
      // Handle source_data as either string[] or SourceData object
      if (Array.isArray(eval_.source_data)) {
        // source_data is string[] (URLs), extract benchmark names from evaluation_results
        for (const result of eval_.evaluation_results) {
          benchmarksSet.add(result.evaluation_name)
        }
      } else {
        benchmarksSet.add(eval_.source_data.dataset_name)
      }
      
      if (eval_.source_metadata.source_url) {
        sourceUrls.add(eval_.source_metadata.source_url)
      }
      
      // Add source_data URLs if it's a string array
      if (Array.isArray(eval_.source_data)) {
        eval_.source_data.forEach(url => sourceUrls.add(url))
      }
      
      for (const result of eval_.evaluation_results) {
        if (result.detailed_evaluation_results_url) {
          detailUrls.add(result.detailed_evaluation_results_url)
        }
        
        allScores.push({
          benchmark: result.evaluation_name,
          score: result.score_details.score,
          metric: result.metric_config.evaluation_description || result.evaluation_name,
          unit: result.metric_config.unit
        })
      }
    }
  }
  
  // Deduplicate by benchmark name, keeping highest score for each
  const scoresByBenchmark = new Map<string, { benchmark: string; score: number; metric: string; unit?: string }>()
  for (const scoreData of allScores) {
    const existing = scoresByBenchmark.get(scoreData.benchmark)
    if (!existing || scoreData.score > existing.score) {
      scoresByBenchmark.set(scoreData.benchmark, scoreData)
    }
  }
  
  // Calculate category stats (count of unique benchmarks per category)
  const categoryStats: Record<CategoryType, number> = {} as any
  
  for (const category of summary.categories_covered) {
    const evals = summary.evaluations_by_category[category] || []
    const categoryBenchmarks = new Set<string>()
    
    for (const eval_ of evals) {
      if (Array.isArray(eval_.source_data)) {
        for (const result of eval_.evaluation_results) {
          // Only count if this result actually belongs to this category
          const resultCategory = inferCategoryFromBenchmark(result.evaluation_name)
          if (resultCategory === category) {
            categoryBenchmarks.add(result.evaluation_name)
          }
        }
      } else {
        // For single-benchmark files, check if the file's main benchmark belongs to category
        // But wait, inferCategoryFromBenchmark might have been used to categorize the whole file
        // Let's just count the benchmarks in this file that match the category
        for (const result of eval_.evaluation_results) {
           const resultCategory = inferCategoryFromBenchmark(result.evaluation_name)
           if (resultCategory === category) {
             categoryBenchmarks.add(result.evaluation_name)
           }
        }
      }
    }
    categoryStats[category] = categoryBenchmarks.size
  }

  // Get top 5 unique benchmarks by score
  const topScores = Array.from(scoresByBenchmark.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return {
    id: summary.model_info.id,
    model_name: summary.model_info.name,
    model_id: summary.model_info.id,
    developer: summary.model_info.developer,
    evaluations_count: summary.total_evaluations,
    benchmarks_count: benchmarksSet.size,
    categories: summary.categories_covered,
    category_stats: categoryStats,
    latest_timestamp: summary.last_updated,
    top_scores: topScores,
    source_urls: Array.from(sourceUrls),
    detail_urls: Array.from(detailUrls),
    architecture: summary.model_info.architecture,
    params: summary.model_info.parameter_count,
    inference_engine: summary.model_info.inference_engine,
    inference_platform: summary.model_info.inference_platform,
    input_modalities: summary.model_info.modalities?.input,
    output_modalities: summary.model_info.modalities?.output,
    release_date: summary.model_info.release_date,
    model_url: summary.model_info.model_url,
  }
}

/**
 * Get category stats for a model
 */
export function getCategoryStats(
  summary: ModelEvaluationSummary
): {
  categories: { category: CategoryType; count: number; avg_score: number }[]
} {
  const categories: { category: CategoryType; count: number; avg_score: number }[] = []
  
  for (const category of summary.categories_covered) {
    const evals = summary.evaluations_by_category[category] || []
    const allScores: number[] = []
    
    for (const eval_ of evals) {
      for (const result of eval_.evaluation_results) {
        allScores.push(result.score_details.score)
      }
    }
    
    const avgScore = allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0
    
    const stat = {
      category,
      count: evals.length,
      avg_score: avgScore,
    }
    
    categories.push(stat)
  }
  
  // Sort categories by name or some other metric if needed
  categories.sort((a, b) => a.category.localeCompare(b.category))
  
  return { categories }
}

/**
 * Load and process evaluations from file paths
 */
export async function loadEvaluations(
  filePaths: string[]
): Promise<BenchmarkEvaluation[]> {
  const evaluations: BenchmarkEvaluation[] = []
  
  for (const path of filePaths) {
    try {
      const response = await fetch(path)
      if (!response.ok) continue
      
      const data = await response.json()
      
      // Validate it matches our schema
      if (data.schema_version && data.evaluation_id && data.model_info) {
        evaluations.push(data as BenchmarkEvaluation)
      }
    } catch (error) {
      console.warn(`Failed to load evaluation from ${path}:`, error)
    }
  }
  
  return evaluations
}

/**
 * Process all evaluations into card data
 */
export async function processEvaluationsToCards(
  filePaths: string[]
): Promise<EvaluationCardData[]> {
  const evaluations = await loadEvaluations(filePaths)
  const grouped = groupEvaluationsByModel(evaluations)
  
  const cards: EvaluationCardData[] = []
  
  for (const modelId in grouped) {
    const modelEvals = grouped[modelId]
    const summary = createModelSummary(modelEvals)
    const card = createEvaluationCard(summary)
    cards.push(card)
  }
  
  return cards
}

/**
 * Format score with proper precision
 */
export function formatScore(
  score: number,
  scoreType: 'continuous' | 'discrete' | 'binary',
  maxScore?: number
): string {
  if (scoreType === 'binary') {
    return score > 0.5 ? 'Pass' : 'Fail'
  }
  
  if (maxScore && maxScore === 1.0) {
    // It's a percentage/ratio
    return `${(score * 100).toFixed(1)}%`
  }
  
  if (maxScore && maxScore === 100) {
    return `${score.toFixed(1)}`
  }
  
  // Default formatting
  return score.toFixed(3)
}

/**
 * Get benchmark display name
 */
export function getBenchmarkDisplayName(name: string | undefined | null): string {
  if (!name) return 'Unknown Benchmark'
  
  // Map common benchmarks to friendly names
  const mapping: Record<string, string> = {
    'MMLU': 'Massive Multitask Language Understanding',
    'MMLU-Pro': 'MMLU Professional',
    'GSM8K': 'Grade School Math 8K',
    'HumanEval': 'Human Eval (Code)',
    'MBPP': 'Mostly Basic Python Problems',
    'HellaSwag': 'HellaSwag (Commonsense)',
    'ARC': 'AI2 Reasoning Challenge',
    'TruthfulQA': 'TruthfulQA',
    'BBH': 'Big-Bench Hard',
    'MATH': 'MATH Dataset',
  }
  
  for (const [key, value] of Object.entries(mapping)) {
    if (name.toUpperCase().includes(key.toUpperCase())) {
      return value
    }
  }
  
  return name
}
