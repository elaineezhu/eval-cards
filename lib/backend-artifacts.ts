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