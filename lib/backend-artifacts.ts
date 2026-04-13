export interface BackendManifest {
  generated_at: string
  config_version: number
  skipped_configs: string[]
}

export interface HierarchyTags {
  domains: string[]
  languages: string[]
  tasks: string[]
}

export interface HierarchyMetric {
  key: string
  display_name: string
  sources?: string[]
}

export interface HierarchySlice {
  key: string
  display_name: string
  metrics: HierarchyMetric[]
}

export interface HierarchyBenchmark {
  key: string
  display_name: string
  has_card: boolean
  tags: HierarchyTags
  slices: HierarchySlice[]
  metrics: HierarchyMetric[]
}

export interface HierarchyComposite {
  key: string
  display_name: string
  has_card: boolean
  category: string
  tags: HierarchyTags
  benchmarks: HierarchyBenchmark[]
  summary_eval_ids?: string[]
}

export interface HierarchyFamily {
  key: string
  display_name: string
  has_card: boolean
  category: string
  tags: HierarchyTags
  standalone_benchmarks?: HierarchyBenchmark[]
  composites?: HierarchyComposite[]
  benchmarks?: HierarchyBenchmark[]
  slices?: HierarchySlice[]
  metrics?: HierarchyMetric[]
}

export interface EvalHierarchyStats {
  family_count: number
  composite_count: number
  standalone_benchmark_count: number
  single_benchmark_count: number
  slice_count: number
  metric_count: number
  metric_rows_scanned: number
}

export interface EvalHierarchy {
  stats: EvalHierarchyStats
  families: HierarchyFamily[]
}

// ---------------------------------------------------------------------------
// comparison-index.json — per-(eval, metric) leaderboards for the histogram UI
// ---------------------------------------------------------------------------

export type MetricGroup =
  | "capability"
  | "robustness"
  | "efficiency"
  | "cost"
  | "latency"
  | "rank"
  | "other"

export type SubmissionAxis = "default" | "harness" | "variant" | "rerun" | "mixed"

export interface ComparisonSubmission {
  score: number
  run_kind: SubmissionAxis
  run_label: string
  raw_model_id: string | null
}

export interface ComparisonScoreEntry {
  model_route_id: string
  model_family_id: string
  model_family_name: string
  developer: string
  variant_key: string
  score: number
  rank: number
  total: number
  submission_count: number
  submission_axis: SubmissionAxis
  headline_run_kind?: SubmissionAxis
  headline_run_label?: string
  submissions?: ComparisonSubmission[]
}

export interface ComparisonMetricEntry {
  metric_summary_id: string
  metric_name: string
  metric_id: string | null
  metric_key: string | null
  group: MetricGroup
  group_order: number
  lower_is_better: boolean
  unit: string | null
  scores: ComparisonScoreEntry[]
}

export interface ComparisonEvalEntry {
  eval_summary_id: string
  benchmark_family_key: string | null
  benchmark_family_name: string | null
  benchmark_parent_key: string | null
  benchmark_parent_name: string | null
  benchmark_leaf_key: string | null
  benchmark_leaf_name: string | null
  display_name: string | null
  category: string
  is_summary_score: boolean
  summary_score_for: string | null
  summary_eval_ids: string[]
  metrics: ComparisonMetricEntry[]
}

export interface ComparisonByModelEntry {
  score: number
  rank: number
  total: number
  submission_count: number
  submission_axis: SubmissionAxis
}

export interface ComparisonIndex {
  generated_at: string
  config_version: number
  metric_group_order: MetricGroup[]
  evals: Record<string, ComparisonEvalEntry>
  by_model: Record<string, Record<string, Record<string, ComparisonByModelEntry>>>
}