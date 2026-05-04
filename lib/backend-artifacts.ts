export interface BackendManifest {
  generated_at: string
  config_version: number
  skipped_configs: string[]
  // Counts the upstream pipeline already records in manifest.json. The home
  // page reads these directly so it does not have to load model-cards-lite
  // (~20MB) just to display headline numbers.
  model_count?: number
  eval_count?: number
  metric_eval_count?: number
  source_config_count?: number
  skipped_config_count?: number
  summary_artifacts?: {
    corpus_aggregates?: string
    eval_hierarchy?: string
    [key: string]: string | undefined
  }
}

export interface BackendManifestStatus {
  currentManifest: BackendManifest | null
  latestManifest: BackendManifest | null
  currentManifestSignature: string | null
  latestManifestSignature: string | null
  updateAvailable: boolean
  refreshing: boolean
  pendingRefreshCount: number
}

// ---------------------------------------------------------------------------
// EvalCards interpretive signals v1.0
// ---------------------------------------------------------------------------

export interface ReproducibilityGap {
  has_reproducibility_gap: boolean
  missing_fields: string[]
  required_field_count: number
  populated_field_count: number
  signal_version: string
}

export type ProvenanceSourceType =
  | "first_party"
  | "third_party"
  | "collaborative"
  | "unspecified"

export interface Provenance {
  source_type: ProvenanceSourceType
  is_multi_source: boolean
  first_party_only: boolean
  distinct_reporting_organizations: number
  signal_version: string
}

export type DivergenceThresholdBasis =
  | "proportion_or_continuous_normalized"
  | "percent"
  | "range_5pct"
  | "fallback_default"

export interface DifferingSetupField {
  field: string
  values: unknown[]
}

export interface VariantDivergence {
  has_variant_divergence: boolean
  group_id: string
  divergence_magnitude: number
  threshold_used: number
  threshold_basis: DivergenceThresholdBasis
  differing_setup_fields: DifferingSetupField[]
  scores_in_group: number[]
  this_triple_score: number | null
  triple_count_in_group: number
  score_scale_anomaly: boolean
  group_variant_breakdown: Array<{ variant_key: string; row_count: number }>
  signal_version: string
}

export interface CrossPartyDivergence {
  has_cross_party_divergence: boolean
  group_id: string
  divergence_magnitude: number
  threshold_used: number
  threshold_basis: DivergenceThresholdBasis
  scores_by_organization: Record<string, number>
  differing_setup_fields: DifferingSetupField[]
  organization_count: number
  group_variant_breakdown: Array<{ variant_key: string; row_count: number }>
  signal_version: string
}

export interface RowAnnotations {
  reproducibility_gap: ReproducibilityGap | null
  provenance: Provenance | null
  variant_divergence: VariantDivergence | null
  cross_party_divergence: CrossPartyDivergence | null
}

export interface ReportingCompleteness {
  completeness_score: number
  total_fields_evaluated: number
  missing_required_fields: string[]
  partial_fields: Array<{
    field_path: string
    score: number
    populated_subitems: number
    total_subitems: number
  }>
  field_scores: Array<{
    field_path: string
    coverage_type: "full" | "partial" | "reserved"
    score: number
  }>
  signal_version: string
}

export interface BenchmarkComparability {
  variant_divergence_groups: Array<{
    group_id: string
    model_route_id: string
    divergence_magnitude: number
    threshold_used: number
    threshold_basis: DivergenceThresholdBasis
    differing_setup_fields: DifferingSetupField[]
  }>
  cross_party_divergence_groups: Array<{
    group_id: string
    model_route_id: string
    divergence_magnitude: number
    threshold_used: number
    threshold_basis: DivergenceThresholdBasis
    scores_by_organization: Record<string, number>
    differing_setup_fields: DifferingSetupField[]
  }>
}

export interface EvalcardsAnnotations {
  reporting_completeness?: ReportingCompleteness
  benchmark_comparability?: BenchmarkComparability
}

export interface ReproducibilitySummary {
  results_total: number
  has_reproducibility_gap_count: number
  populated_ratio_avg: number | null
}

export interface ProvenanceSummary {
  total_results: number
  total_groups: number
  multi_source_groups: number
  first_party_only_groups: number
  source_type_distribution: Record<ProvenanceSourceType, number>
}

export interface ComparabilitySummary {
  total_groups: number
  groups_with_variant_check: number
  groups_with_cross_party_check: number
  variant_divergent_count: number
  cross_party_divergent_count: number
}

export interface SignalSummaries {
  reproducibility_summary?: ReproducibilitySummary
  provenance_summary?: ProvenanceSummary
  comparability_summary?: ComparabilitySummary
}

export interface CorpusAggregates {
  generated_at: string
  signal_version: string
  stratification_dimensions: ["category"]
  reproducibility: Stratified<ReproducibilityCorpusBlock>
  completeness: Stratified<CompletenessCorpusBlock>
  provenance: Stratified<ProvenanceCorpusBlock>
  comparability: Stratified<ComparabilityCorpusBlock>
  developers?: DeveloperListEntry[]
  families?: Array<{
    family_key: string
    display_name: string
    model_count: number
    eval_count: number
  }>
  categories?: Array<{
    category: string
    model_count: number
    eval_count: number
  }>
}

export interface DeveloperListEntry {
  developer: string
  route_id: string
  model_count: number
  benchmark_count: number
  evaluation_count: number
  popular_evals: Array<{ benchmark: string; model_count: number }>
}

export interface Stratified<T> {
  overall: T
  by_category: Record<string, T>
}

export interface ReproducibilityCorpusBlock {
  total_triples: number
  triples_with_reproducibility_gap: number
  reproducibility_gap_rate: number | null
  agentic_triples: number
  per_field_missingness: Record<string, {
    missing_count: number
    missing_rate: number | null
    denominator: "all_triples" | "agentic_only"
    denominator_count: number
  }>
}

export interface CompletenessCorpusBlock {
  total_triples: number
  completeness_avg: number | null
  completeness_min: number | null
  completeness_max: number | null
}

export interface ProvenanceCorpusBlock {
  total_triples: number
  multi_source_triples: number
  first_party_only_triples: number
  source_type_distribution: Record<ProvenanceSourceType, number>
}

export interface ComparabilityCorpusBlock {
  total_triples: number
  variant_divergent_count: number
  cross_party_divergent_count: number
  groups_with_variant_check: number
  groups_with_cross_party_check: number
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

export interface HierarchyBenchmark extends SignalSummaries {
  key: string
  display_name: string
  has_card: boolean
  tags: HierarchyTags
  slices: HierarchySlice[]
  metrics: HierarchyMetric[]
  summary_eval_ids?: string[]
}

export interface HierarchyComposite extends SignalSummaries {
  key: string
  display_name: string
  has_card: boolean
  category: string
  tags: HierarchyTags
  benchmarks: HierarchyBenchmark[]
  summary_eval_ids?: string[]
}

export interface HierarchyLeaf extends SignalSummaries {
  key: string
  display_name: string
  category: string
  evals_count?: number
  eval_summary_ids?: string[]
  tags?: Partial<HierarchyTags>
  has_card?: boolean
}

export interface HierarchyFamily extends SignalSummaries {
  key: string
  display_name: string
  has_card?: boolean
  category: string
  tags?: Partial<HierarchyTags>
  evals_count?: number
  eval_summary_ids?: string[]
  // Legacy nested shape (composites + standalone benchmarks)
  standalone_benchmarks?: HierarchyBenchmark[]
  composites?: HierarchyComposite[]
  benchmarks?: HierarchyBenchmark[]
  slices?: HierarchySlice[]
  metrics?: HierarchyMetric[]
  // Newer 2-level shape (family → leaf)
  leaves?: HierarchyLeaf[]
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
  stats?: EvalHierarchyStats
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
