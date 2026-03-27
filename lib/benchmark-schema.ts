/**
 * Benchmark-first evaluation schema types
 * Based on the evalevalai.com schema structure
 */

export interface BenchmarkEvaluation {
  schema_version: string
  evaluation_id: string
  retrieved_timestamp: string
  benchmark?: string
  
  source_data: string[] | SourceData
  source_metadata: SourceMetadata
  eval_library?: EvalLibrary
  model_info: ModelInfo
  evaluation_results: EvaluationResult[]
  detailed_evaluation_results_per_samples?: SampleResult[]
}

export interface EvalLibrary {
  name: string
  version?: string
  additional_details?: Record<string, any>
}

export interface SourceData {
  dataset_name: string
  source_type?: string
  hf_repo?: string
  hf_split?: string
  samples_number?: number
  url?: string[]
  dataset_url?: string
  dataset_version?: string
  [key: string]: any
}

export interface SourceMetadata {
  source_name?: string
  source_type: 'evaluation_run' | 'documentation' | 'paper' | 'leaderboard'
  source_organization_name: string
  source_organization_url?: string
  evaluator_relationship: 'first_party' | 'third_party' | 'collaborative' | 'other'
  source_url?: string
  publication_date?: string
}

export interface ModelInfo {
  name: string
  id: string
  developer?: string
  inference_platform?: string
  inference_engine?: string
  model_version?: string
  architecture?: string
  parameter_count?: string
  release_date?: string
  model_url?: string
  additional_details?: {
    precision?: string
    architecture?: string
    params_billions?: number | string
    [key: string]: any
  }
  modalities?: {
    input: string[]
    output: string[]
  }
}

export interface EvaluationResult {
  evaluation_name: string
  evaluation_timestamp: string
  source_data?: string[] | SourceData
  metric_config: MetricConfig
  score_details: ScoreDetails
  detailed_evaluation_results_url?: string
  generation_config?: GenerationConfig
  factsheet?: {
    purpose?: string
    principles_tested?: string
    functional_props?: string
    input_modality?: string
    output_modality?: string
    input_source?: string
    output_source?: string
    size?: string
    splits?: string
    design?: string
    judge?: string
    protocol?: string
    model_access?: string
    has_heldout?: boolean
    heldout_details?: string
    alignment_validation?: string
    is_valid?: boolean
    baseline_models?: string
    robustness_measures?: string
    known_limitations?: string
    benchmarks_list?: string
  }
}

export interface MetricConfig {
  evaluation_description: string
  lower_is_better: boolean
  score_type: 'continuous' | 'discrete' | 'binary'
  min_score?: number
  max_score?: number
  unit?: string
}

export interface ScoreDetails {
  score: number
  details?: Record<string, any>
  confidence_interval?: {
    lower: number
    upper: number
    confidence_level: number
  }
  sample_size?: number
  standard_error?: number
}

export interface GenerationConfig {
  generation_args: {
    temperature?: number
    top_p?: number
    top_k?: number
    max_tokens?: number
    reasoning?: boolean
    [key: string]: any
  }
  additional_details?: string
  prompt_template?: string
}

export interface SampleResult {
  sample_id: string
  input: string
  ground_truth?: string
  response: string
  choices?: string[]
  is_correct?: boolean
  metadata?: Record<string, any>
}

/**
 * Evaluation categories for classification
 */
export const EVALUATION_CATEGORIES = [
  'Core Performance',
  'Core Quality Dimensions',
  'Robustness',
  'Calibration',
  'Adversarial',
  'Memorization',
  'Fairness',
  'Safety',
  'Leakage/Contamination',
  'Privacy',
  'Interpretability',
  'Efficiency',
  'Retrainability',
  'Meta-Learning',
] as const

export type CategoryType = typeof EVALUATION_CATEGORIES[number]

/**
 * Helper to determine category from benchmark name
 */
export function inferCategoryFromBenchmark(benchmarkName: string): CategoryType {
  const name = benchmarkName.toLowerCase()
  
  // Category mappings
  if (name.includes('advglue') || name.includes('jailbreak') || name.includes('attack') || name.includes('adversarial') || name.includes('red-team')) {
    return 'Adversarial'
  }
  if (name.includes('fairness') || name.includes('bias') || name.includes('stereo') || name.includes('bbq') || name.includes('celeb') || name.includes('winobias')) {
    return 'Fairness'
  }
  if (name.includes('safety') || name.includes('harmful') || name.includes('toxic') || name.includes('truthful') || name.includes('unsafe')) {
    return 'Safety'
  }
  if (name.includes('leakage') || name.includes('contamination')) {
    return 'Leakage/Contamination'
  }
  if (name.includes('privacy') || name.includes('pii') || name.includes('gdpr') || name.includes('private')) {
    return 'Privacy'
  }
  if (name.includes('robust')) {
    return 'Robustness'
  }
  if (name.includes('calibration') || name.includes('confidence')) {
    return 'Calibration'
  }
  if (name.includes('memoriz') || name.includes('copyright')) {
    return 'Memorization'
  }
  if (name.includes('interpret') || name.includes('explain')) {
    return 'Interpretability'
  }
  if (name.includes('efficien') || name.includes('latency') || name.includes('throughput') || name.includes('speed')) {
    return 'Efficiency'
  }
  if (name.includes('retrain') || name.includes('forgetting')) {
    return 'Retrainability'
  }
  if (name.includes('meta') || name.includes('few-shot') || name.includes('learning')) {
    return 'Meta-Learning'
  }
  if (name.includes('mt-bench') || name.includes('quality') || name.includes('human') || name.includes('fact') || name.includes('hallucination')) {
    return 'Core Quality Dimensions'
  }
  
  // Default to Core Performance for standard benchmarks
  if (name.includes('mmlu') || name.includes('arc') || name.includes('hellaswag') || name.includes('winogrande') || name.includes('gpqa') ||
      name.includes('gsm') || name.includes('math') || name.includes('minerva') || name.includes('mgsm') ||
      name.includes('humaneval') || name.includes('mbpp') || name.includes('code') || name.includes('apps') ||
      name.includes('vision') || name.includes('vqa') || name.includes('image') || name.includes('coco') ||
      name.includes('multimodal') || name.includes('mmmu') || name.includes('seed-bench') ||
      name.includes('bbh') || name.includes('reasoning') || name.includes('musr') ||
      name.includes('xsum') || name.includes('summariz') || name.includes('dialog') || name.includes('translation') || name.includes('ifeval') ||
      name.includes('creative') || name.includes('social') || name.includes('agent')) {
    return 'Core Performance'
  }
  
  return 'Core Performance'
}

/**
 * Aggregate evaluations by model
 */
export interface ModelSummaryCore {
  model_info: ModelInfo
  evaluations_by_category: Record<CategoryType, BenchmarkEvaluation[]>
  total_evaluations: number
  last_updated: string
  categories_covered: CategoryType[]
}

export interface ModelVariantSummary extends ModelSummaryCore {
  variant_id: string
  variant_key: string
  variant_label: string
  variant_display_name: string
  raw_model_ids: string[]
  family_id: string
  family_name: string
  version_date?: string
  version_qualifier?: string
}

export interface ModelEvaluationSummary extends ModelSummaryCore {
  model_family_id: string
  model_route_id: string
  model_family_name: string
  raw_model_ids: string[]
  variants: ModelVariantSummary[]
}

/**
 * Display-friendly format for the UI
 */
export interface EvaluationCardData {
  id: string
  route_id: string
  model_name: string
  model_id: string
  canonical_model_name: string
  developer: string
  evaluations_count: number
  benchmarks_count: number
  variant_count: number
  categories: CategoryType[]
  category_stats: Record<CategoryType, number>
  latest_timestamp: string
  evaluator_count: number
  evaluator_names: string[]
  source_type_count: number
  source_types: Array<SourceMetadata["source_type"]>
  evidence_count: number
  missing_generation_config_count: number
  third_party_eval_count: number
  independent_verification_ratio: number
  reproducibility_status: "complete" | "partial" | "missing"
  eval_libraries: Array<{
    name: string
    version?: string
    fork?: string
  }>
  latest_source_name?: string
  params_billions?: number | null
  
  // Quick stats
  top_scores: Array<{
    benchmark: string
    score: number
    metric: string
  }>
  
  // Links
  source_urls: string[]
  detail_urls: string[]

  // Model Metadata (from auxiliary sources or model_metadata.json)
  model_url?: string
  release_date?: string
  input_modalities?: string[]
  output_modalities?: string[]
  architecture?: string
  params?: string
  inference_engine?: string
  inference_platform?: string
}
