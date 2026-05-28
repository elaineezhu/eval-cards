/**
 * Benchmark-first evaluation schema types.
 */

import type { EvalcardsAnnotations, RowAnnotations, SignalSummaries } from "@/lib/backend-artifacts"

export interface BenchmarkEvaluation {
  schema_version: string
  eval_summary_id?: string
  evaluation_id: string
  retrieved_timestamp: string
  /** Legacy benchmark-name-or-slug field. The view-data layer
   *  (lib/view-data.ts) populates this from eval_evaluation_name with a
   *  benchmark_id fallback, so it works as a stable name source for
   *  badges and grouping when nothing better is on-hand. New callers
   *  should prefer `display_name` / `canonical_display_name`; this
   *  field is kept for the surfaces that aren't yet migrated. */
  benchmark?: string
  display_name?: string
  canonical_display_name?: string
  category?: CategoryType
  family_id?: string
  benchmark_family_name?: string
  parent_benchmark_id?: string
  benchmark_parent_name?: string
  benchmark_leaf_name?: string
  is_slice?: boolean
  benchmark_component_key?: string | null
  benchmark_component_name?: string | null
  is_summary_score?: boolean
  slice_key?: string
  slice_name?: string

  source_data: string[] | SourceData
  source_metadata: SourceMetadata
  eval_library?: EvalLibrary
  model_info: ModelInfo
  generation_config?: GenerationConfig
  evaluation_results: EvaluationResult[]
  detailed_evaluation_results_per_samples?: SampleResult[]
  evalcards?: { annotations?: EvalcardsAnnotations }
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
  display_name?: string
  canonical_display_name?: string
  metric_summary_id?: string
  metric_key?: string
  evaluation_timestamp: string
  source_data?: string[] | SourceData
  metric_config: MetricConfig
  score_details: ScoreDetails
  detailed_evaluation_results_url?: string
  generation_config?: GenerationConfig
  evalcards?: { annotations?: RowAnnotations }
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
  num_few_shot?: number
  generation_args?: {
    temperature?: number
    top_p?: number
    top_k?: number
    max_tokens?: number
    reasoning?: boolean
    [key: string]: any
  }
  additional_details?: string | Record<string, any>
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
 * Evaluation categories — aligned with the pipeline's category labels.
 */
export const EVALUATION_CATEGORIES = [
  'General',
  'Reasoning',
  'Agentic',
  'Safety',
  'Knowledge',
] as const

export type CategoryType = typeof EVALUATION_CATEGORIES[number]

/**
 * Returns Tailwind badge classes for a given category
 */
export function getCategoryColor(category: CategoryType | string): string {
  switch (category) {
    case 'General':
      return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200'
    case 'Reasoning':
      return 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200'
    case 'Agentic':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200'
    case 'Safety':
      return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200'
    case 'Knowledge':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

/**
 * Helper to determine category from benchmark name.
 * The pipeline now provides categories directly, so this is only used as a fallback.
 */
export function inferCategoryFromBenchmark(benchmarkName: string): CategoryType {
  const name = benchmarkName.toLowerCase()

  if (name.includes('safety') || name.includes('harmful') || name.includes('toxic') || name.includes('truthful') ||
      name.includes('unsafe') || name.includes('civilcomments') || name.includes('civil_comments') ||
      name.includes('jailbreak') || name.includes('red-team') || name.includes('adversarial')) {
    return 'Safety'
  }
  if (name.includes('agent') || name.includes('swe-bench') || name.includes('swe_bench') ||
      name.includes('terminal-bench') || name.includes('tau-bench') || name.includes('tau_bench') ||
      name.includes('appworld') || name.includes('browsecomp')) {
    return 'Agentic'
  }
  if (name.includes('reasoning') || name.includes('bbh') || name.includes('math') || name.includes('gsm') ||
      name.includes('gpqa') || name.includes('musr') || name.includes('code') || name.includes('humaneval') ||
      name.includes('livecodebench')) {
    return 'Reasoning'
  }
  if (name.includes('mmlu') || name.includes('knowledge') || name.includes('trivia') || name.includes('medqa') ||
      name.includes('legalbench') || name.includes('theory_of_mind')) {
    return 'Knowledge'
  }

  return 'General'
}

/**
 * Aggregate evaluations by model
 */
export interface ModelSummaryCore extends SignalSummaries {
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
  benchmark_names?: string[]
  score_summary?: {
    count: number
    min: number
    max: number
    average: number | null
  }
  reproducibility_summary?: SignalSummaries["reproducibility_summary"]
  provenance_summary?: SignalSummaries["provenance_summary"]
  comparability_summary?: SignalSummaries["comparability_summary"]
  
  // Quick stats
  top_scores: Array<{
    benchmark: string
    benchmarkKey?: string
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

// ── Benchmark Card types (from metadata/benchmark_card_*.json) ────────────────

export interface BenchmarkCardDetails {
  name: string
  overview: string
  data_type: string
  domains: string[]
  languages: string[]
  similar_benchmarks: string[] | string
  resources: string[]
}

export interface BenchmarkCardPurpose {
  goal: string
  audience: string[] | string
  tasks: string[]
  limitations: string
  out_of_scope_uses: string[] | string
}

export interface BenchmarkCardData {
  source: string
  size: string
  format: string
  annotation: string
}

export interface BenchmarkCardMethodology {
  methods: string[]
  metrics: string[]
  calculation: string
  interpretation: string
  baseline_results: string
  validation: string
}

export interface BenchmarkCardEthical {
  privacy_and_anonymity: string
  data_licensing: string
  consent_procedures: string
  compliance_with_regulations: string
}

export interface BenchmarkCardRisk {
  category: string
  description: string[]
  url: string
}

export interface BenchmarkCard {
  benchmark_details: BenchmarkCardDetails
  purpose_and_intended_users: BenchmarkCardPurpose
  data: BenchmarkCardData
  methodology: BenchmarkCardMethodology
  ethical_and_legal_considerations: BenchmarkCardEthical
  possible_risks: BenchmarkCardRisk[]
  flagged_fields: Record<string, string>
  missing_fields: string[]
  card_info: {
    created_at: string
    llm: string
  }
}
