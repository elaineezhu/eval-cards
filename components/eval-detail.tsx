"use client"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { Fragment, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CompletenessPanel } from "@/components/signals/completeness-panel"
import { ComparabilityPanel } from "@/components/signals/comparability-panel"
import { ReproducibilityPanel } from "@/components/signals/reproducibility-panel"
import { SignalsRowBadges } from "@/components/signals/signals-row-badges"
import { RowSignalsCompact } from "@/components/signals/row-signals-compact"
import { getCompletenessPopulatedCount } from "@/components/signals/signal-utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScoreDistribution } from "@/components/score-distribution"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getModelFamilyRouteId } from "@/lib/model-family"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Globe,
  Scale,
  Search,
  Shield,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react"
import type { BenchmarkCard } from "@/lib/benchmark-schema"
import type { BenchmarkEvalSummary, ModelResultForBenchmark } from "@/lib/eval-processing"
import { PolicyOverview } from "@/components/policy-overview"
import { ResearcherReproducibilityCard } from "@/components/researcher-reproducibility-card"
import { KnownIssuesPanel } from "@/components/known-issues-panel"
import { getKnownIssues, type KnownIssue } from "@/lib/known-issues"
import { ApplesToApplesBanner } from "@/components/apples-to-apples-banner"
import { FlagScoreButton } from "@/components/flag-score-button"

interface EvalDetailProps {
  summary: BenchmarkEvalSummary
}

interface LeaderboardRow {
  key: string
  rank: number
  modelResult: ModelResultForBenchmark
  normalizedScore: number
}

type LeaderboardMetric = NonNullable<BenchmarkEvalSummary["leaderboard_metrics"]>[number]
type LeaderboardMatrixRow = NonNullable<BenchmarkEvalSummary["leaderboard_rows"]>[number]

/**
 * Pick a representative row-level annotation for the matrix view.
 *
 * Reproducibility and provenance are typically constant across all metrics for
 * a given (model, benchmark) pair, so rendering them in every cell is just
 * noise. This helper grabs the first non-null annotation across visible metrics
 * and returns it for the row-level badge strip.
 */
function getRowLevelAnnotations(
  row: LeaderboardMatrixRow,
  visibleMetrics: LeaderboardMetric[]
) {
  const annotationsByMetric = row.annotations_by_metric
  if (!annotationsByMetric) {
    return null
  }

  for (const metric of visibleMetrics) {
    const annotations = annotationsByMetric[metric.column_key]
    if (annotations) {
      return annotations
    }
  }

  return null
}

const SLICE_PILL_THRESHOLD = 5

interface SliceTab {
  key: string
  label: string
}

/**
 * Slice picker that adapts to slice count.
 *
 * - <= SLICE_PILL_THRESHOLD: render every slice as a pill (current familiar UX).
 * - > SLICE_PILL_THRESHOLD: render "All slices" + currently-selected pill +
 *   a "Browse N slices" button that opens a searchable dialog. Hundreds of
 *   subtasks (e.g. AIRBench's 374) fit cleanly.
 */
function SliceSelector({
  activeSubtaskTab,
  onChange,
  tabs,
}: {
  activeSubtaskTab: string
  onChange: (key: string) => void
  tabs: SliceTab[]
}) {
  const [browserOpen, setBrowserOpen] = useState(false)
  const [search, setSearch] = useState("")

  const useBrowser = tabs.length > SLICE_PILL_THRESHOLD
  const activeTab = tabs.find((tab) => tab.key === activeSubtaskTab)

  const filteredTabs = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return tabs
    return tabs.filter((tab) => tab.label.toLowerCase().includes(query))
  }, [search, tabs])

  if (!useBrowser) {
    return (
      <div>
        <div className="kicker mb-2">Benchmark slices</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`ec-pill${activeSubtaskTab === "all" ? " on" : ""}`}
            onClick={() => onChange("all")}
          >
            All slices
          </button>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`ec-pill${activeSubtaskTab === tab.key ? " on" : ""}`}
              onClick={() => onChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="kicker">Benchmark slices</div>
        <span className="kicker">{tabs.length} total</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`ec-pill${activeSubtaskTab === "all" ? " on" : ""}`}
          onClick={() => onChange("all")}
        >
          All slices
        </button>
        {activeTab && (
          <button
            type="button"
            className="ec-pill on max-w-[18rem] truncate"
            onClick={() => onChange("all")}
            title={`Active: ${activeTab.label}. Click to clear.`}
          >
            {activeTab.label}
            <X className="ml-1.5 inline-block h-3 w-3 shrink-0" />
          </button>
        )}
        <button
          type="button"
          className="ec-pill"
          onClick={() => setBrowserOpen(true)}
        >
          <Search className="mr-1.5 inline-block h-3 w-3" />
          {activeTab ? "Change slice" : `Browse ${tabs.length} slices`}
        </button>
      </div>

      <Dialog
        open={browserOpen}
        onOpenChange={(open) => {
          setBrowserOpen(open)
          if (!open) setSearch("")
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Browse benchmark slices</DialogTitle>
            <DialogDescription>
              {tabs.length} slices in this benchmark. Pick one to filter the leaderboard,
              or close to keep showing all slices.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search slices..."
            autoFocus
          />

          <div className="max-h-[60vh] overflow-y-auto border" style={{ borderRadius: 0 }}>
            <button
              type="button"
              onClick={() => {
                onChange("all")
                setBrowserOpen(false)
              }}
              className={cn(
                "flex w-full items-center justify-between border-b px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/40",
                activeSubtaskTab === "all" && "bg-muted/40 font-semibold"
              )}
            >
              <span>All slices (no filter)</span>
              {activeSubtaskTab === "all" && <span className="text-xs text-muted-foreground">selected</span>}
            </button>
            {filteredTabs.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No slices match "{search}".
              </div>
            ) : (
              filteredTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    onChange(tab.key)
                    setBrowserOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between border-b px-4 py-2 text-left text-sm transition-colors hover:bg-muted/40 last:border-b-0",
                    activeSubtaskTab === tab.key && "bg-muted/40 font-semibold"
                  )}
                >
                  <span className="min-w-0 truncate pr-2">{tab.label}</span>
                  {activeSubtaskTab === tab.key && (
                    <span className="shrink-0 text-xs text-muted-foreground">selected</span>
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const PARAM_RANGE_VALUES = [1, 2, 3, 4, 6, 8, 10, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 500] as const
const PARAM_RANGE_MARKERS = [
  { label: "< 1B", step: 0 },
  { label: "6B", step: PARAM_RANGE_VALUES.indexOf(6) },
  { label: "12B", step: PARAM_RANGE_VALUES.indexOf(12) },
  { label: "32B", step: PARAM_RANGE_VALUES.indexOf(32) },
  { label: "128B", step: PARAM_RANGE_VALUES.indexOf(128) },
  { label: "> 500B", step: PARAM_RANGE_VALUES.length - 1 },
] as const

function formatParamBoundLabel(step: number, bound: "min" | "max") {
  const maxStepIndex = PARAM_RANGE_VALUES.length - 1

  if (bound === "min" && step <= 0) {
    return "< 1B"
  }

  if (bound === "max" && step >= maxStepIndex) {
    return "> 500B"
  }

  const value = PARAM_RANGE_VALUES[step]
  return value != null ? `${value}B` : "Not reported"
}

function parseParamsBillionsFromText(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  const compact = normalized.replace(/,/g, "")
  const tokenMatch = compact.match(/(\d+(?:\.\d+)?)\s*(trillion|tn|t|billion|bn|b|million|mn|m|thousand|k)\b/)
  if (tokenMatch) {
    const amount = Number.parseFloat(tokenMatch[1])
    if (!Number.isFinite(amount)) {
      return null
    }

    const unit = tokenMatch[2]
    if (unit === "trillion" || unit === "tn" || unit === "t") {
      return amount * 1000
    }

    if (unit === "billion" || unit === "bn" || unit === "b") {
      return amount
    }

    if (unit === "million" || unit === "mn" || unit === "m") {
      return amount / 1000
    }

    if (unit === "thousand" || unit === "k") {
      return amount / 1_000_000
    }
  }

  const numeric = Number.parseFloat(compact)
  return Number.isFinite(numeric) ? numeric : null
}

function parseParamsBillionsFromModelName(modelName: string | null | undefined) {
  if (!modelName) {
    return null
  }

  const sizeTokens = Array.from(modelName.matchAll(/\b(\d+(?:\.\d+)?)\s*([tmbk])\b/gi))
  if (sizeTokens.length === 0) {
    return null
  }

  const lastToken = sizeTokens[sizeTokens.length - 1]
  const numericValue = Number.parseFloat(lastToken[1])
  if (!Number.isFinite(numericValue)) {
    return null
  }

  const unit = lastToken[2].toLowerCase()
  if (unit === "t") {
    return numericValue * 1000
  }

  if (unit === "b") {
    return numericValue
  }

  if (unit === "m") {
    return numericValue / 1000
  }

  if (unit === "k") {
    return numericValue / 1_000_000
  }

  return null
}

function getParamsBillionsFromModelInfo(modelInfo: ModelResultForBenchmark["model_info"]) {
  const additionalDetails = modelInfo.additional_details
  const rawParamsBillions =
    additionalDetails?.params_billions ??
    additionalDetails?.parameter_count ??
    additionalDetails?.num_parameters ??
    additionalDetails?.params

  if (typeof rawParamsBillions === "number") {
    return rawParamsBillions
  }

  if (typeof rawParamsBillions === "string") {
    const parsed = parseParamsBillionsFromText(rawParamsBillions)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  if (typeof modelInfo.parameter_count === "string") {
    const parsed = parseParamsBillionsFromText(modelInfo.parameter_count)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return parseParamsBillionsFromModelName(modelInfo.name)
}

function getParamsBillions(modelResult: ModelResultForBenchmark) {
  return getParamsBillionsFromModelInfo(modelResult.model_info)
}

function formatMetadataValue(value: unknown): string {
  if (value == null) {
    return "N/A"
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : String(value)
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatMetadataValue(item)).join(", ")
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatDate(ts: string) {
  if (!ts || !ts.trim()) {
    return "Unknown"
  }

  const numeric = Number(ts)
  const parsedDate = !Number.isNaN(numeric) && !ts.includes("-") ? new Date(numeric * 1000) : new Date(ts)

  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown"
  }

  try {
    return parsedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return ts
  }
}

function formatRawScore(score: number, unit?: string) {
  const suffix = unit ? ` ${unit}` : ""
  return `${score.toFixed(2)}${suffix}`
}

function isNumericScore(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function metricLabelReadsAsPercentage(metricLabel: string, unit?: string) {
  const normalized = `${metricLabel} ${unit ?? ""}`.toLowerCase()
  return unit === "%" || /percent|percentage|accuracy|exact match|win rate|pass@|precision|recall|f1/.test(normalized)
}

function describeLeaderboardMetric(metric: LeaderboardMetric) {
  const metricLabel = getCompactMetricLabel(metric.display_name)
  const metricPhrase = metricLabelReadsAsPercentage(metricLabel, metric.unit)
    ? `${metricLabel} percentage`
    : metricLabel

  if (metric.scope === "subtask" && metric.subtask_name) {
    return `${metricPhrase} for ${metric.subtask_name}`
  }

  return metric.canonical_display_name || metric.display_name
}

function getCompactMetricLabel(value: string | undefined) {
  if (!value) {
    return "Metric"
  }

  const parts = value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)

  return parts[parts.length - 1] ?? value
}

/**
 * Best-effort "setup" caption for a row (e.g. "8-shot CoT", "0-shot").
 *
 * Different sources record shots/CoT in different fields, so we look across
 * the common ones in priority order. If nothing useful is recorded we return
 * an empty string and the caller hides the caption rather than printing a
 * placeholder.
 */
function getSetupLabel(modelResult: ModelResultForBenchmark): string {
  const gen = modelResult.result.generation_config
  const args: Record<string, unknown> | undefined = gen?.generation_args as Record<string, unknown> | undefined
  const additional: Record<string, unknown> | undefined =
    typeof gen?.additional_details === "object" && gen?.additional_details !== null
      ? (gen.additional_details as Record<string, unknown>)
      : undefined

  const pickNumber = (...candidates: Array<unknown>) => {
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) return c
      if (typeof c === "string" && /^\d+$/.test(c.trim())) return Number(c.trim())
    }
    return null
  }
  const pickString = (...candidates: Array<unknown>) => {
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c.trim()
    }
    return null
  }

  const shots = pickNumber(
    args?.num_shots,
    args?.n_shots,
    args?.shots,
    args?.num_few_shot,
    additional?.num_shots,
    additional?.n_shots,
    additional?.shots,
  )
  const promptingHint = pickString(
    args?.prompting_strategy,
    args?.reasoning,
    additional?.prompting_strategy,
    additional?.reasoning,
  )
  const isCot = (() => {
    const candidates = [
      args?.chain_of_thought,
      args?.cot,
      additional?.chain_of_thought,
      additional?.cot,
    ]
    if (candidates.some((c) => c === true)) return true
    if (promptingHint && /\bcot\b|chain.of.thought/i.test(promptingHint)) return true
    return false
  })()

  const parts: string[] = []
  if (shots != null) parts.push(`${shots}-shot`)
  if (isCot) parts.push("CoT")
  if (parts.length === 0 && promptingHint) parts.push(promptingHint)
  return parts.join(" ")
}

export function EvalDetail({ summary }: EvalDetailProps) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const hasMultiMetricLeaderboard =
    (summary.leaderboard_metrics?.length ?? 0) > 1 &&
    (summary.leaderboard_rows?.length ?? 0) > 0
  const [overviewOpen, setOverviewOpen] = useState(true)
  // Collapse the dense technical overview by default in policy mode; expand
  // for researchers. Reset whenever the user switches modes.
  useEffect(() => {
    setOverviewOpen(isResearchView)
  }, [isResearchView])
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [leaderboardPage, setLeaderboardPage] = useState(1)
  const [minParamStep, setMinParamStep] = useState(0)
  const [maxParamStep, setMaxParamStep] = useState(PARAM_RANGE_VALUES.length - 1)

  const maxScore = summary.metric_config.max_score ?? 1
  const minScore = summary.metric_config.min_score ?? 0
  const range = maxScore - minScore

  const normalizeScore = (raw: number) => (range > 0 ? (raw - minScore) / range : raw)
  const maxParamStepIndex = PARAM_RANGE_VALUES.length - 1
  const minHandlePercent = (minParamStep / maxParamStepIndex) * 100
  const maxHandlePercent = (maxParamStep / maxParamStepIndex) * 100

  const numericMinParams = useMemo(() => {
    if (minParamStep <= 0) {
      return null
    }

    return PARAM_RANGE_VALUES[minParamStep] ?? null
  }, [minParamStep])

  const numericMaxParams = useMemo(() => {
    if (maxParamStep >= PARAM_RANGE_VALUES.length - 1) {
      return null
    }

    return PARAM_RANGE_VALUES[maxParamStep] ?? null
  }, [maxParamStep])

  const sortedResults = useMemo(
    () =>
      [...summary.model_results].sort((a, b) =>
        summary.metric_config.lower_is_better ? a.score - b.score : b.score - a.score
      ),
    [summary.model_results, summary.metric_config.lower_is_better]
  )

  const hasParameterData = useMemo(
    () => sortedResults.some((result) => getParamsBillions(result) != null),
    [sortedResults]
  )

  const filteredResults = useMemo(() => {
    return sortedResults.filter((modelResult) => {
      const paramsBillions = getParamsBillions(modelResult)

      if (numericMinParams != null && (paramsBillions == null || paramsBillions < numericMinParams)) {
        return false
      }

      if (numericMaxParams != null && (paramsBillions == null || paramsBillions > numericMaxParams)) {
        return false
      }

      return true
    })
  }, [numericMaxParams, numericMinParams, sortedResults])

  const leaderboardRows = useMemo<LeaderboardRow[]>(() => {
    let currentRank = 0
    let previousScore: number | null = null

    return filteredResults.map((modelResult, index) => {
      if (previousScore === null || Math.abs(modelResult.score - previousScore) > 1e-9) {
        currentRank = index + 1
        previousScore = modelResult.score
      }

      return {
        key: `${modelResult.model_info.id}-${index}`,
        rank: currentRank,
        modelResult,
        normalizedScore: normalizeScore(modelResult.score),
      }
    })
  }, [filteredResults])

  const LEADERBOARD_PAGE_SIZE = 50
  const pagedLeaderboardRows = useMemo(
    () => leaderboardRows.slice(0, leaderboardPage * LEADERBOARD_PAGE_SIZE),
    [leaderboardRows, leaderboardPage]
  )

  const avgScoreLabel = formatRawScore(summary.avg_score, summary.metric_config.unit)
  const scoreDirectionLabel = summary.metric_config.lower_is_better ? "Lower scores rank higher" : "Higher scores rank higher"
  const leaderboardTitle = isResearchView ? "Leaderboard" : "Reporting Comparison"
  const sourceDatasetLabel = summary.source_data?.hf_repo ?? summary.source_data?.dataset_name ?? "Summary source"
  const instanceDataLabel = summary.instance_data?.available
    ? `${summary.instance_data.url_count.toLocaleString()} linked URL${summary.instance_data.url_count === 1 ? "" : "s"}`
    : "Not linked"
  const leaderboardDescription = isResearchView
    ? summary.is_aggregated
      ? "Models ranked by average raw score across the suite's component benchmarks."
      : "Models ranked by raw score for this benchmark."
    : summary.is_aggregated
      ? "Averaged model results across the suite's component benchmarks, with drill-down to each component score."
      : "Model results with benchmark context, source dataset detail, and optional instance-data links."
  const reportingCompleteness = summary.evalcards?.annotations?.reporting_completeness
  const benchmarkComparability = summary.evalcards?.annotations?.benchmark_comparability
  const documentationPopulatedCount = reportingCompleteness
    ? getCompletenessPopulatedCount(reportingCompleteness)
    : null

  const toggleRow = (key: string) =>
    setExpandedRows((current) => ({
      ...current,
      [key]: !current[key],
    }))

  const evalKindLabel = summary.is_aggregated
    ? (isResearchView ? "Composite · §3.2" : "Benchmark suite")
    : (isResearchView ? "Single benchmark" : "Benchmark")

  const headerOrg = summary.composite_benchmark_name && summary.composite_benchmark_name !== summary.evaluation_name
    ? summary.composite_benchmark_name
    : null

  const heroLede = isResearchView
    ? summary.metric_config.evaluation_description
    : (summary.benchmark_card?.benchmark_details?.overview?.trim()
       || summary.benchmark_card?.purpose_and_intended_users?.goal?.trim()
       || summary.metric_config.evaluation_description)

  return (
    <div className="space-y-12">
      {/* HERO — paper §3.1 ------------------------------------------------ */}
      <header className="motion-academic-enter">
        <div className="kicker kicker-accent mb-2">{evalKindLabel}</div>
        <h1
          className="font-bold tracking-[-0.025em]"
          style={{ fontSize: "clamp(40px, 5vw, 60px)", lineHeight: 1.04, margin: "8px 0 12px" }}
        >
          {summary.evaluation_name}
        </h1>
        <div
          className="mb-6 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em]"
          style={{ color: "var(--fg-muted)" }}
        >
          {headerOrg && (
            <>
              <span>{headerOrg}</span>
              <span style={{ color: "var(--fg-subtle)" }}>·</span>
            </>
          )}
          <span>{summary.metric_config.score_type}</span>
          <span style={{ color: "var(--fg-subtle)" }}>·</span>
          <span>{summary.metric_config.lower_is_better ? "Lower is better ↓" : "Higher is better ↑"}</span>
          {summary.tags?.languages && summary.tags.languages.length > 0 && (
            <>
              <span style={{ color: "var(--fg-subtle)" }}>·</span>
              <span>{summary.tags.languages.slice(0, 3).join(", ")}</span>
            </>
          )}
        </div>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.65,
            color: "var(--fg)",
            maxWidth: 760,
            margin: 0,
          }}
        >
          {heroLede}
        </p>
      </header>

      {/* BENCHMARK CARD (top-level collapsible, default open) ------------ */}
      {summary.benchmark_card && (
        <BenchmarkCardCollapsible
          card={summary.benchmark_card}
          isResearchView={isResearchView}
          defaultOpen
          defaultRisksOpen={!isResearchView}
          knownIssues={getKnownIssues(
            summary.evaluation_name,
            summary.composite_benchmark_name,
            summary.composite_benchmark_key,
            summary.benchmark_family_key,
            summary.benchmark_leaf_key,
            summary.benchmark_card.benchmark_details?.name,
          )}
        />
      )}

      {/* POLICY NOTE (policy mode only) ---------------------------------- */}
      {!isResearchView && <PolicyOverview summary={summary} />}

      {/* TECHNICAL OVERVIEW — secondary, collapsed by default in policy mode.
          Holds metric spec, completeness/comparability signals, and benchmark
          structure (sub-tasks). Tucked away so the hero / card / policy note
          carry the page's primary read. -------------------------------- */}
      <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between text-left transition-colors hover:bg-[color:var(--bg-warm)]"
            style={{
              padding: "12px 20px",
              border: "1px solid var(--border-soft)",
              background: "var(--bg)",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="kicker kicker-fg">
                {isResearchView ? "Metric & signals" : "Technical details"}
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.12em]"
                style={{ color: "var(--fg-subtle)" }}
              >
                metric spec · completeness · comparability{summary.subtasks?.length ? " · subtasks" : ""}
              </span>
            </div>
            {overviewOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0" style={{ color: "var(--fg-muted)" }} />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--fg-muted)" }} />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3">
          <div className="space-y-4">
            {/* Metric spec / nested datalist (paper-aligned hairline def-list) */}
            <div className="ec-card warm" style={{ padding: "18px 22px" }}>
              <div className="kicker mb-3">
                {isResearchView ? "Metric specification" : "Reading context"}
              </div>
              <dl className="ec-datalist">
                <dt>Suite</dt>
                <dd>
                  {summary.is_aggregated
                    ? summary.aggregate_sources?.map((source) => source.composite_benchmark_name).join(", ") || "Multiple suites"
                    : summary.composite_benchmark_name}
                </dd>
                <dt>{isResearchView ? "Benchmark ID" : "What this covers"}</dt>
                <dd className="break-words">
                  {isResearchView ? summary.evaluation_id : summary.metric_config.evaluation_description}
                </dd>
                <dt>{isResearchView ? "Score scale" : "How to read scores"}</dt>
                <dd>
                  {isResearchView
                    ? `${summary.metric_config.min_score ?? 0} – ${summary.metric_config.max_score ?? 1}`
                    : scoreDirectionLabel}
                </dd>
                <dt>Models</dt>
                <dd className="font-mono tabular-nums">{summary.models_count.toLocaleString()}</dd>
                <dt>{hasMultiMetricLeaderboard ? "Measures" : "Avg score"}</dt>
                <dd className="font-mono tabular-nums">
                  {hasMultiMetricLeaderboard
                    ? summary.metrics_count ?? summary.leaderboard_metrics?.length ?? 1
                    : avgScoreLabel}
                </dd>
                {summary.tags?.domains && summary.tags.domains.length > 0 && (
                  <>
                    <dt>Domain tags</dt>
                    <dd className="capitalize">
                      {summary.tags.domains.slice(0, 4).join(", ")}
                      {summary.tags.domains.length > 4 ? ` +${summary.tags.domains.length - 4} more` : ""}
                    </dd>
                  </>
                )}
                <dt>Source dataset</dt>
                <dd>{sourceDatasetLabel}</dd>
                <dt>Instance data</dt>
                <dd>{instanceDataLabel}</dd>
                {reportingCompleteness && (
                  <>
                    <dt>Card completeness</dt>
                    <dd className="font-mono tabular-nums" style={{ color: "var(--accent)" }}>
                      {Math.round(reportingCompleteness.completeness_score * 100)}%
                      <span className="ml-1" style={{ color: "var(--fg-muted)" }}>
                        ({documentationPopulatedCount}/{reportingCompleteness.total_fields_evaluated} fields)
                      </span>
                    </dd>
                  </>
                )}
              </dl>
            </div>

            <CompletenessPanel completeness={reportingCompleteness} />
            <ComparabilityPanel
              comparability={benchmarkComparability}
              summary={summary.comparability_summary}
            />

            {!hasMultiMetricLeaderboard && (summary.root_metrics?.length || summary.subtasks?.length) ? (
              <section
                style={{
                  padding: 22,
                  border: "1px solid var(--border-soft)",
                  background: "var(--bg)",
                }}
              >
                <div className="kicker mb-2">Benchmark structure</div>
                <p className="text-[13px] mb-4" style={{ color: "var(--fg-muted)", maxWidth: 640 }}>
                  Benchmark-level summary metrics and subtask slices grouped in one compact section.
                </p>

                {summary.root_metrics && summary.root_metrics.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <div
                      className="font-mono uppercase"
                      style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
                    >
                      Benchmark-level metrics
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.root_metrics.map((metric) => (
                        <span
                          key={metric.metric_summary_id}
                          className="ec-tag outline"
                          title={metric.canonical_display_name || metric.display_name}
                        >
                          {getCompactMetricLabel(metric.display_name)}
                          {typeof metric.top_score === "number" ? ` · ${formatRawScore(metric.top_score, metric.unit)}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {summary.subtasks && summary.subtasks.length > 0 && (
                  <div className="space-y-2">
                    <div
                      className="font-mono uppercase mb-1"
                      style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
                    >
                      Subtask breakdown · {summary.subtasks.length}
                    </div>
                    <ul
                      className="flex flex-col"
                      style={{ borderTop: "1px solid var(--border-soft)" }}
                    >
                      {summary.subtasks.map((subtask) => (
                        <li
                          key={subtask.subtask_key}
                          className="grid gap-x-4 py-3"
                          style={{
                            gridTemplateColumns: "minmax(160px, 280px) 1fr",
                            borderBottom: "1px solid var(--border-soft)",
                          }}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-[13px] truncate">
                              {subtask.display_name || subtask.subtask_name}
                            </div>
                            {subtask.canonical_display_name && subtask.canonical_display_name !== (subtask.display_name || subtask.subtask_name) && (
                              <div
                                className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] truncate"
                                style={{ color: "var(--fg-subtle)" }}
                                title={subtask.canonical_display_name}
                              >
                                {subtask.canonical_display_name}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {subtask.metrics.map((metric) => (
                              <span
                                key={metric.metric_summary_id}
                                className="ec-tag"
                                title={metric.canonical_display_name || metric.display_name}
                              >
                                {getCompactMetricLabel(metric.display_name)}
                                {typeof metric.top_score === "number" ? ` · ${formatRawScore(metric.top_score, metric.unit)}` : ""}
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {hasMultiMetricLeaderboard ? (
        <MultiMetricLeaderboard summary={summary} isResearchView={isResearchView} />
      ) : (
        <section>
          <ApplesToApplesBanner
            summary={summary.comparability_summary}
            detailsAnchorId="comparability-panel"
          />
          <div className="section-head">
            <h2>{leaderboardTitle}</h2>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.12em]"
              style={{ color: "var(--fg-muted)" }}
            >
              {leaderboardRows.length === summary.models_count
                ? `${summary.models_count} models`
                : `${leaderboardRows.length} of ${summary.models_count}`}
              {" · "}
              {summary.metric_config.lower_is_better ? "lower is better ↓" : "higher is better ↑"}
              {isResearchView && (
                <>
                  {" · "}scale {summary.metric_config.min_score ?? 0}–{summary.metric_config.max_score ?? 1}
                </>
              )}
            </span>
          </div>
          <p
            className="text-[13px] leading-[1.6] mb-4"
            style={{ color: "var(--fg-muted)", maxWidth: 720 }}
          >
            {leaderboardDescription}
          </p>

          {/* Score distribution — paper-themed mean/median/quartile summary */}
          {leaderboardRows.length >= 3 && (
            <div className="mb-4">
              <ScoreDistribution
                values={leaderboardRows.map((r) => r.modelResult.score)}
                label={summary.metric_config.unit ?? "Score"}
                unit={summary.metric_config.unit}
                lowerIsBetter={summary.metric_config.lower_is_better}
              />
            </div>
          )}

          <div className="ec-card" style={{ padding: 0, overflow: "hidden" }}>
            {hasParameterData && (
              <div
                style={{
                  borderBottom: "1px solid var(--border-soft)",
                  background: "var(--bg-warm)",
                  padding: "16px 20px",
                }}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Parameter range
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Narrow the leaderboard to comparable model sizes.
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-4 lg:max-w-[40rem]">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {PARAM_RANGE_MARKERS.map((marker) => (
                          <span key={marker.label} className="text-center">
                            {marker.label}
                          </span>
                        ))}
                      </div>

                      <div className="relative h-4">
                        <div className="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-border/80" />
                        <div className="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2">
                          <div
                            className="absolute inset-y-0 rounded-full bg-foreground"
                            style={{
                              left: `${minHandlePercent}%`,
                              right: `${Math.max(100 - maxHandlePercent, 0)}%`,
                            }}
                          />
                        </div>

                        <div className="absolute inset-x-1.5 top-1/2 -translate-y-1/2">
                          {PARAM_RANGE_VALUES.map((_, stepIndex) => (
                            <span
                              key={`param-tick-${stepIndex}`}
                              className="absolute top-0 h-2 w-px -translate-x-1/2 rounded-full bg-border"
                              style={{ left: `${(stepIndex / maxParamStepIndex) * 100}%` }}
                              aria-hidden="true"
                            />
                          ))}
                        </div>

                        <input
                          type="range"
                          min={0}
                          max={maxParamStepIndex}
                          step={1}
                          value={minParamStep}
                          onChange={(event) => {
                            const nextMin = Number(event.target.value)
                            setMinParamStep(Math.min(nextMin, maxParamStep))
                          }}
                          className="param-range-input"
                          aria-label="Minimum parameter filter"
                        />

                        <input
                          type="range"
                          min={0}
                          max={maxParamStepIndex}
                          step={1}
                          value={maxParamStep}
                          onChange={(event) => {
                            const nextMax = Number(event.target.value)
                            setMaxParamStep(Math.max(nextMax, minParamStep))
                          }}
                          className="param-range-input"
                          aria-label="Maximum parameter filter"
                        />
                      </div>
                    </div>

                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatParamBoundLabel(minParamStep, "min")} to {formatParamBoundLabel(maxParamStep, "max")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
            <table className="ec-htable" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 64 }} className="num">Rank</th>
                  <th style={{ minWidth: 260 }}>Model</th>
                  <th className="hidden lg:table-cell" style={{ minWidth: 160 }}>
                    {isResearchView ? "Developer" : "Provider"}
                  </th>
                  <th className="hidden md:table-cell" style={{ minWidth: 220 }}>
                    {summary.composite_benchmark_name && summary.composite_benchmark_name !== summary.evaluation_name
                      ? `${summary.composite_benchmark_name} · ${summary.evaluation_name}`
                      : summary.evaluation_name}
                  </th>
                  <th className="num" style={{ width: 130 }}>
                    {summary.metric_config.unit ?? "Score"}
                  </th>
                  <th className="hidden lg:table-cell" style={{ width: 110 }}>Evaluator</th>
                  <th className="num hidden lg:table-cell" style={{ width: 100 }}>Source</th>
                  <th className="hidden xl:table-cell num" style={{ width: 110 }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {pagedLeaderboardRows.map(({ key, rank, modelResult, normalizedScore }) => {
                  const isExpanded = expandedRows[key] ?? false
                  const subtasks = modelResult.score_details.details
                    ? Object.entries(modelResult.score_details.details).filter(([, value]) => typeof value === "number")
                    : []
                  const hasExpandableDetails =
                    isResearchView ||
                    (modelResult.aggregate_components && modelResult.aggregate_components.length > 1) ||
                    subtasks.length > 1

                  const datasetName = Array.isArray(modelResult.source_data)
                    ? undefined
                    : modelResult.source_data.dataset_name

                  const samples = Array.isArray(modelResult.source_data)
                    ? undefined
                    : modelResult.source_data.samples_number
                  const rowAnnotations = modelResult.result.evalcards?.annotations
                  const setupLabel = getSetupLabel(modelResult)
                  const evaluatorRel = modelResult.source_metadata.evaluator_relationship
                  const evaluatorTag = evaluatorRel === "first_party"
                    ? "SELF"
                    : evaluatorRel === "third_party"
                      ? "THIRD-PARTY"
                      : "—"
                  const isThirdParty = evaluatorRel === "third_party"
                  const sourceTypeLabel = (
                    !Array.isArray(modelResult.source_data) && modelResult.source_data.source_type
                  ) || modelResult.source_metadata.source_type || ""
                  const familyLabel = modelResult.model_info.architecture
                    ?? modelResult.model_info.parameter_count
                    ?? null
                  const isTopRank = rank === 1
                  const rankColor = rank === 1 ? "var(--accent)" : "var(--fg-muted)"

                  return (
                    <Fragment key={key}>
                      <tr
                        id={modelResult.model_route_id ? `row-${modelResult.model_route_id}` : undefined}
                        className={cn("align-top", isExpanded && "bg-[color:var(--bg-warm)]")}
                      >
                        <td className="num align-top">
                          <span
                            className="font-mono tabular-nums"
                            style={{
                              fontSize: 14,
                              fontWeight: isTopRank ? 600 : 500,
                              color: rankColor,
                            }}
                          >
                            #{rank}
                          </span>
                        </td>

                        <td className="align-top whitespace-normal">
                          <div className="flex items-start gap-1.5 leading-tight">
                            {hasExpandableDetails && (
                              <button
                                type="button"
                                onClick={() => toggleRow(key)}
                                aria-label={isExpanded ? "Collapse details" : "Expand details"}
                                aria-expanded={isExpanded}
                                className="-ml-1 mt-0.5 inline-flex h-4 w-4 items-center justify-center transition-colors hover:text-[color:var(--accent)]"
                                style={{ color: "var(--fg-muted)" }}
                              >
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            )}
                            <div className="min-w-0">
                              <Link
                                href={`/models/${getModelFamilyRouteId(modelResult.model_info)}`}
                                className="font-semibold text-[14px] hover:text-[color:var(--accent)] transition-colors"
                                style={{ color: "var(--fg)" }}
                              >
                                {modelResult.model_info.name}
                              </Link>
                              {familyLabel && (
                                <div
                                  className="mt-0.5 font-mono uppercase truncate"
                                  style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--fg-subtle)" }}
                                >
                                  {familyLabel}
                                </div>
                              )}
                              {/* mobile-only developer line */}
                              <div
                                className="mt-0.5 lg:hidden text-[12px]"
                                style={{ color: "var(--fg-muted)" }}
                              >
                                {modelResult.model_info.developer ?? "Unknown developer"}
                              </div>
                              {modelResult.aggregate_components && modelResult.aggregate_components.length > 1 && (
                                <div
                                  className="mt-0.5 font-mono uppercase"
                                  style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "var(--fg-subtle)" }}
                                >
                                  Avg of {modelResult.aggregate_components.length}
                                </div>
                              )}
                              <RowSignalsCompact annotations={rowAnnotations} className="mt-1" />
                            </div>
                          </div>
                        </td>

                        <td className="hidden lg:table-cell align-top">
                          <div className="text-[13px] truncate" style={{ color: "var(--fg-muted)" }}>
                            {modelResult.model_info.developer ?? "Unknown developer"}
                          </div>
                        </td>

                        <td className="hidden md:table-cell align-top">
                          {/* Performance bar with shot/setup caption */}
                          <div className="min-w-[200px] py-0.5">
                            <div
                              style={{
                                position: "relative",
                                height: 6,
                                background: "var(--bg-surface)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  width: `${Math.max(2, normalizedScore * 100)}%`,
                                  background: isTopRank ? "var(--accent)" : "var(--fg-muted)",
                                  opacity: isTopRank ? 1 : 0.55,
                                }}
                              />
                            </div>
                            {setupLabel && (
                              <div
                                className="mt-1 font-mono uppercase truncate"
                                style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--fg-subtle)" }}
                              >
                                {setupLabel}
                              </div>
                            )}
                            {!setupLabel && datasetName && !isResearchView && (
                              <div
                                className="mt-1 font-mono truncate"
                                style={{ fontSize: 10, color: "var(--fg-subtle)" }}
                              >
                                {datasetName}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="num align-top tabular-nums" style={{ fontSize: 15, fontWeight: 600 }}>
                          {formatRawScore(modelResult.score, undefined)}
                        </td>

                        <td className="hidden lg:table-cell align-top">
                          <span
                            className="font-mono uppercase inline-flex items-center"
                            style={{
                              fontSize: 9.5,
                              padding: "2px 6px",
                              letterSpacing: "0.08em",
                              background: isThirdParty ? "var(--accent)" : "var(--bg-surface)",
                              color: isThirdParty ? "var(--accent-fg)" : "var(--fg-muted)",
                              border: isThirdParty ? "none" : "1px solid var(--border-soft)",
                            }}
                          >
                            {evaluatorTag}
                          </span>
                        </td>

                        <td className="num hidden lg:table-cell align-top">
                          {sourceTypeLabel ? (
                            modelResult.source_metadata.source_url ? (
                              <a
                                href={modelResult.source_metadata.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono lowercase hover:text-[color:var(--accent)]"
                                style={{ fontSize: 11, color: "var(--fg-muted)" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {sourceTypeLabel}
                              </a>
                            ) : (
                              <span
                                className="font-mono lowercase"
                                style={{ fontSize: 11, color: "var(--fg-muted)" }}
                              >
                                {sourceTypeLabel}
                              </span>
                            )
                          ) : (
                            <span style={{ color: "var(--fg-subtle)" }}>—</span>
                          )}
                        </td>

                        <td className="num hidden xl:table-cell align-top font-mono tabular-nums" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                          {formatDate(modelResult.evaluation_timestamp)}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ background: "var(--bg-warm)", padding: 0 }}>
                            <div className="space-y-5 px-4 py-5 sm:px-6">
                              <div className="grid gap-4 xl:grid-cols-3">
                                <DetailPanel
                                  title={isResearchView ? "Model Profile" : "System Overview"}
                                  subtitle={
                                    isResearchView
                                      ? "Model metadata for the ranked entry."
                                      : "Basic system information for this reported result."
                                  }
                                >
                                  {isResearchView && <MetaRow label="Model ID" value={modelResult.model_info.id} />}
                                  <MetaRow label="Developer" value={modelResult.model_info.developer ?? "Unknown"} />
                                  <MetaRow label="Release Date" value={modelResult.model_info.release_date ?? "Unknown"} />
                                  <MetaRow label="Architecture" value={modelResult.model_info.architecture ?? "Unknown"} />
                                  <MetaRow label="Parameter Count" value={modelResult.model_info.parameter_count ?? "Unknown"} />
                                  <MetaRow label="Inference Engine" value={modelResult.model_info.inference_engine ?? "Unknown"} />
                                </DetailPanel>

                                <DetailPanel
                                  title={isResearchView ? "Evaluation Provenance" : "Source & Accountability"}
                                  subtitle={
                                    isResearchView
                                      ? "Who ran the evaluation and what dataset was used."
                                      : "Reporting organization, relationship, and dataset context."
                                  }
                                >
                                  <MetaRow
                                    label="Organization"
                                    value={modelResult.source_metadata.source_organization_name}
                                  />
                                  <MetaRow
                                    label="Relationship"
                                    value={modelResult.source_metadata.evaluator_relationship.replace(/_/g, " ")}
                                  />
                                  <MetaRow label="Source Type" value={modelResult.source_metadata.source_type} />
                                  <MetaRow label="Dataset" value={datasetName ?? "Not specified"} />
                                  <MetaRow
                                    label="Samples"
                                    value={samples != null ? samples.toLocaleString() : "Unknown"}
                                  />
                                  <MetaRow
                                    label="Published"
                                    value={
                                      modelResult.source_metadata.publication_date
                                        ? formatDate(modelResult.source_metadata.publication_date)
                                        : formatDate(modelResult.evaluation_timestamp)
                                    }
                                  />
                                  {modelResult.source_metadata.source_url && (
                                    <MetaRow
                                      label="Source URL"
                                      value={
                                        <a
                                          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                                          href={modelResult.source_metadata.source_url}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          View source
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      }
                                    />
                                  )}
                                </DetailPanel>

                                {!isResearchView && (
                                  <ReproducibilityPanel gap={rowAnnotations?.reproducibility_gap} />
                                )}

                                <DetailPanel
                                  title={isResearchView ? "Score Breakdown" : "Metric Summary"}
                                  subtitle={
                                    isResearchView
                                      ? "Raw score and scale."
                                      : "Raw performance plus uncertainty and sample details."
                                  }
                                >
                                  <MetaRow
                                    label={modelResult.aggregate_components ? "Average Raw Score" : "Raw Score"}
                                    value={formatRawScore(modelResult.score, summary.metric_config.unit)}
                                  />
                                  <MetaRow label="Score Type" value={modelResult.result.metric_config.score_type} />
                                  <MetaRow label="Range" value={`${minScore} - ${maxScore}`} />
                                  {!isResearchView && (
                                    <>
                                      <MetaRow
                                        label="Sample Size"
                                        value={modelResult.score_details.sample_size ?? "Unknown"}
                                      />
                                      <MetaRow
                                        label="Standard Error"
                                        value={modelResult.score_details.standard_error ?? "Unknown"}
                                      />
                                      {modelResult.score_details.confidence_interval && (
                                        <MetaRow
                                          label="Confidence Interval"
                                          value={`${modelResult.score_details.confidence_interval.lower} - ${modelResult.score_details.confidence_interval.upper} (${modelResult.score_details.confidence_interval.confidence_level}%)`}
                                        />
                                      )}
                                    </>
                                  )}
                                </DetailPanel>
                              </div>

                              {modelResult.aggregate_components && modelResult.aggregate_components.length > 1 && (
                                <div className="space-y-2">
                                  <div
                                    className="font-mono uppercase"
                                    style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
                                  >
                                    Composite score breakdown
                                  </div>
                                  <div className="overflow-x-auto" style={{ border: "1px solid var(--border-soft)" }}>
                                    <table className="ec-htable">
                                      <thead>
                                        <tr>
                                          <th>Benchmark</th>
                                          <th>Source</th>
                                          <th className="num">Raw</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {modelResult.aggregate_components.map((component, i) => (
                                          <tr key={`${component.evaluation_id}-${i}`}>
                                            <td className="font-medium text-[13px]">{component.composite_benchmark_name}</td>
                                            <td className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
                                              {component.source_organization_name}
                                            </td>
                                            <td className="num font-mono tabular-nums text-[13px]" style={{ color: "var(--fg-muted)" }}>
                                              {formatRawScore(component.score)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {subtasks.length > 1 && (
                                <div className="space-y-2">
                                  <div
                                    className="font-mono uppercase"
                                    style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
                                  >
                                    Subtask breakdown
                                  </div>
                                  <div className="overflow-x-auto" style={{ border: "1px solid var(--border-soft)" }}>
                                    <table className="ec-htable">
                                      <thead>
                                        <tr>
                                          <th>Subtask</th>
                                          <th className="num">Raw</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {subtasks.map(([subtaskName, value]) => {
                                          const numericValue = value as number
                                          return (
                                            <tr key={subtaskName}>
                                              <td className="font-medium text-[13px] capitalize">{subtaskName.replace(/_/g, " ")}</td>
                                              <td className="num font-mono tabular-nums text-[13px]" style={{ color: "var(--fg-muted)" }}>
                                                {formatRawScore(numericValue, summary.metric_config.unit)}
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {isResearchView ? (
                                <div className="space-y-3">
                                  <ResearcherReproducibilityCard
                                    modelResult={modelResult}
                                    benchmarkKey={summary.benchmark_leaf_key ?? summary.composite_benchmark_key}
                                    evalName={summary.evaluation_name}
                                  />
                                  <div className="flex justify-end">
                                    <FlagScoreButton
                                      modelName={modelResult.model_info.name}
                                      modelId={modelResult.model_info.id}
                                      benchmarkName={summary.evaluation_name}
                                      benchmarkId={summary.evaluation_id}
                                      score={formatRawScore(modelResult.score, summary.metric_config.unit)}
                                      sourceUrl={modelResult.source_metadata.source_url}
                                      sourceRecordUrl={modelResult.source_record_url}
                                    />
                                  </div>
                                </div>
                              ) : (
                                modelResult.result.generation_config && (
                                  <div className="space-y-3">
                                    <div>
                                      <div
                                        className="font-mono uppercase"
                                        style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
                                      >
                                        Generation config
                                      </div>
                                      <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                                        Evaluation-time generation parameters.
                                      </div>
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                      {modelResult.result.generation_config.generation_args &&
                                        Object.entries(modelResult.result.generation_config.generation_args).map(([key, value]) => (
                                          <div
                                            key={key}
                                            style={{
                                              padding: 14,
                                              border: "1px solid var(--border-soft)",
                                              background: "var(--bg)",
                                            }}
                                          >
                                            <div
                                              className="font-mono uppercase"
                                              style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--fg-subtle)" }}
                                            >
                                              {key.replace(/_/g, " ")}
                                            </div>
                                            <div className="mt-2 text-[13px] font-medium font-mono tabular-nums">
                                              {formatMetadataValue(value)}
                                            </div>
                                          </div>
                                        ))}

                                      {modelResult.result.generation_config.additional_details && (
                                        <div
                                          className="md:col-span-2 xl:col-span-3"
                                          style={{
                                            padding: 14,
                                            border: "1px solid var(--border-soft)",
                                            background: "var(--bg)",
                                          }}
                                        >
                                          <div
                                            className="font-mono uppercase"
                                            style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--fg-subtle)" }}
                                          >
                                            Additional details
                                          </div>
                                          <div className="mt-2 text-[13px] font-medium whitespace-pre-wrap">
                                            {formatMetadataValue(modelResult.result.generation_config.additional_details)}
                                          </div>
                                        </div>
                                      )}

                                      {modelResult.result.generation_config.prompt_template && (
                                        <div
                                          className="md:col-span-2 xl:col-span-3"
                                          style={{
                                            padding: 14,
                                            border: "1px solid var(--border-soft)",
                                            background: "var(--bg)",
                                          }}
                                        >
                                          <div
                                            className="font-mono uppercase"
                                            style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--fg-subtle)" }}
                                          >
                                            Prompt template
                                          </div>
                                          <div className="mt-2 text-[12.5px] font-mono whitespace-pre-wrap">
                                            {formatMetadataValue(modelResult.result.generation_config.prompt_template)}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {leaderboardRows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", color: "var(--fg-muted)" }}>
                      No leaderboard entries match the selected parameter range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>

            {pagedLeaderboardRows.length < leaderboardRows.length && (
              <div
                style={{
                  borderTop: "1px solid var(--border-soft)",
                  background: "var(--bg-warm)",
                  padding: "16px",
                  textAlign: "center",
                }}
              >
                <button
                  type="button"
                  className="btn-ec outline"
                  onClick={() => setLeaderboardPage((p) => p + 1)}
                >
                  Load more ({leaderboardRows.length - pagedLeaderboardRows.length} remaining)
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function MultiMetricLeaderboard({
  summary,
  isResearchView,
}: {
  summary: BenchmarkEvalSummary
  isResearchView: boolean
}) {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string>("coverage")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [activeSubtaskTab, setActiveSubtaskTab] = useState<string>("all")
  const [minParamStep, setMinParamStep] = useState(0)
  const [maxParamStep, setMaxParamStep] = useState(PARAM_RANGE_VALUES.length - 1)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // Index ModelResultForBenchmark entries by model_info.id so we can power the
  // research-mode reproducibility card from a multi-metric row. There may be
  // several entries per model (one per metric); we prefer one with a recorded
  // generation_config so the card has the most data to show.
  const modelResultByModelId = useMemo(() => {
    const map = new Map<string, ModelResultForBenchmark>()
    for (const result of summary.model_results) {
      const id = result.model_info.id
      const existing = map.get(id)
      if (!existing) {
        map.set(id, result)
        continue
      }
      const existingHasGen = existing.result.generation_config != null
      const candidateHasGen = result.result.generation_config != null
      if (!existingHasGen && candidateHasGen) {
        map.set(id, result)
      }
    }
    return map
  }, [summary.model_results])

  const toggleExpandedRow = (key: string) =>
    setExpandedRows((current) => ({ ...current, [key]: !current[key] }))
  const leaderboardMetrics = summary.leaderboard_metrics ?? []
  const leaderboardRows = summary.leaderboard_rows ?? []
  const allMetricKeys = useMemo(() => leaderboardMetrics.map((metric) => metric.column_key), [leaderboardMetrics])
  // Cap default visible columns to avoid hangs on benchmarks with hundreds of metrics
  // (e.g. helm_air_bench has 374 subtask×metric pairs). Users can opt in to more.
  const DEFAULT_VISIBLE_METRIC_CAP = 24
  const defaultVisibleMetricKeys = useMemo(
    () => allMetricKeys.slice(0, DEFAULT_VISIBLE_METRIC_CAP),
    [allMetricKeys]
  )
  const [visibleMetricKeys, setVisibleMetricKeys] = useState<string[]>(() => defaultVisibleMetricKeys)
  const maxParamStepIndex = PARAM_RANGE_VALUES.length - 1
  const leaderboardMetricMap = useMemo(
    () => new Map(leaderboardMetrics.map((metric) => [metric.column_key, metric])),
    [leaderboardMetrics]
  )
  const visibleMetricKeySet = useMemo(() => new Set(visibleMetricKeys), [visibleMetricKeys])
  const subtaskMetricCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const metric of leaderboardMetrics) {
      if (metric.scope === "subtask" && metric.subtask_key) {
        counts.set(metric.subtask_key, (counts.get(metric.subtask_key) ?? 0) + 1)
      }
    }
    return counts
  }, [leaderboardMetrics])

  const singleMetricSubtaskTabs = useMemo(() => {
    return leaderboardMetrics
      .filter((metric) => metric.scope === "subtask" && metric.subtask_key && subtaskMetricCounts.get(metric.subtask_key) === 1)
      .map((metric) => ({
        key: metric.subtask_key as string,
        label: metric.subtask_name ?? getCompactMetricLabel(metric.display_name),
      }))
  }, [leaderboardMetrics, subtaskMetricCounts])

  const hasSubtaskTabs = singleMetricSubtaskTabs.length > 1

  const visibleMetrics = useMemo(
    () =>
      leaderboardMetrics.filter((metric) => {
        if (!visibleMetricKeySet.has(metric.column_key)) {
          return false
        }

        if (!hasSubtaskTabs || activeSubtaskTab === "all") {
          return true
        }

        return metric.scope === "subtask" && metric.subtask_key === activeSubtaskTab
      }),
    [activeSubtaskTab, hasSubtaskTabs, leaderboardMetrics, visibleMetricKeySet]
  )
  const visibleMetricColumnKeySet = useMemo(
    () => new Set(visibleMetrics.map((metric) => metric.column_key)),
    [visibleMetrics]
  )

  const numericMinParams = useMemo(() => {
    if (minParamStep <= 0) {
      return null
    }

    return PARAM_RANGE_VALUES[minParamStep] ?? null
  }, [minParamStep])

  const numericMaxParams = useMemo(() => {
    if (maxParamStep >= PARAM_RANGE_VALUES.length - 1) {
      return null
    }

    return PARAM_RANGE_VALUES[maxParamStep] ?? null
  }, [maxParamStep])

  const filteredRows = useMemo(() => {
    return leaderboardRows
      .filter((row) => {
        const paramsBillions = getParamsBillionsFromModelInfo(row.model_info)

        if (numericMinParams != null && (paramsBillions == null || paramsBillions < numericMinParams)) {
          return false
        }

        if (numericMaxParams != null && (paramsBillions == null || paramsBillions > numericMaxParams)) {
          return false
        }

        return true
      })
  }, [leaderboardRows, numericMaxParams, numericMinParams])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]

    const compareNames = (left: LeaderboardMatrixRow, right: LeaderboardMatrixRow) =>
      left.model_info.name.localeCompare(right.model_info.name) ||
      (left.model_info.developer ?? "").localeCompare(right.model_info.developer ?? "")

    const compareTimestamps = (left: string, right: string) => {
      const leftNumeric = Number(left)
      const rightNumeric = Number(right)
      const leftTimestamp = !Number.isNaN(leftNumeric) && !left.includes("-")
        ? leftNumeric * 1000
        : new Date(left).getTime()
      const rightTimestamp = !Number.isNaN(rightNumeric) && !right.includes("-")
        ? rightNumeric * 1000
        : new Date(right).getTime()
      return leftTimestamp - rightTimestamp
    }

    rows.sort((left, right) => {
      if (sortKey === "model") {
        const comparison = compareNames(left, right)
        return sortDirection === "asc" ? comparison : -comparison
      }

      if (sortKey === "developer") {
        const comparison =
          (left.model_info.developer ?? "").localeCompare(right.model_info.developer ?? "") || compareNames(left, right)
        return sortDirection === "asc" ? comparison : -comparison
      }

      if (sortKey === "coverage") {
        const comparison = left.metrics_present - right.metrics_present || compareNames(left, right)
        return sortDirection === "asc" ? comparison : -comparison
      }

      if (sortKey === "updated") {
        const comparison = compareTimestamps(left.evaluation_timestamp, right.evaluation_timestamp) || compareNames(left, right)
        return sortDirection === "asc" ? comparison : -comparison
      }

      const metric = leaderboardMetricMap.get(sortKey)
      if (metric) {
        const leftValue = left.values[sortKey]
        const rightValue = right.values[sortKey]
        const leftHasValue = isNumericScore(leftValue)
        const rightHasValue = isNumericScore(rightValue)

        if (leftHasValue && rightHasValue) {
          const comparison = leftValue - rightValue || compareNames(left, right)
          return sortDirection === "asc" ? comparison : -comparison
        }

        if (leftHasValue !== rightHasValue) {
          return leftHasValue ? -1 : 1
        }
      }

      return compareNames(left, right)
    })

    return rows
  }, [filteredRows, leaderboardMetricMap, sortDirection, sortKey])

  useEffect(() => {
    setPage(1)
  }, [maxParamStep, minParamStep, sortDirection, sortKey])

  useEffect(() => {
    setVisibleMetricKeys(defaultVisibleMetricKeys)
  }, [defaultVisibleMetricKeys, summary.evaluation_id])

  useEffect(() => {
    setActiveSubtaskTab("all")
  }, [summary.evaluation_id])

  useEffect(() => {
    if (leaderboardMetricMap.has(sortKey) && !visibleMetricColumnKeySet.has(sortKey)) {
      setSortKey("coverage")
      setSortDirection("desc")
    }
  }, [leaderboardMetricMap, sortKey, visibleMetricColumnKeySet])

  useEffect(() => {
    if (!hasSubtaskTabs) {
      if (activeSubtaskTab !== "all") {
        setActiveSubtaskTab("all")
      }
      return
    }

    if (activeSubtaskTab === "all") {
      return
    }

    if (!singleMetricSubtaskTabs.some((tab) => tab.key === activeSubtaskTab)) {
      setActiveSubtaskTab("all")
    }
  }, [activeSubtaskTab, hasSubtaskTabs, singleMetricSubtaskTabs])

  const hasParameterData = useMemo(
    () => leaderboardRows.some((row) => getParamsBillionsFromModelInfo(row.model_info) != null),
    [leaderboardRows]
  )

  const pagedRows = useMemo(
    () => sortedRows.slice(0, page * 50),
    [page, sortedRows]
  )

  const rankByModelId = useMemo(
    () => new Map(sortedRows.map((row, index) => [row.model_info.id, index + 1])),
    [sortedRows]
  )

  const setMetricVisibility = (metricKey: string, nextVisible: boolean) => {
    setVisibleMetricKeys((current) => {
      if (nextVisible) {
        return allMetricKeys.filter((key) => key === metricKey || current.includes(key))
      }

      return current.filter((key) => key !== metricKey)
    })
  }

  const getVisibleMetricCount = (row: LeaderboardMatrixRow) =>
    visibleMetrics.reduce(
      (count, metric) => count + (isNumericScore(row.values[metric.column_key]) ? 1 : 0),
      0
    )

  const getDefaultSortDirection = (key: string): "asc" | "desc" => {
    if (key === "model" || key === "developer") {
      return "asc"
    }

    if (key === "updated" || key === "coverage") {
      return "desc"
    }

    return leaderboardMetricMap.get(key)?.lower_is_better ? "asc" : "desc"
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection(getDefaultSortDirection(key))
  }

  const getSortIndicator = (key: string) => {
    if (sortKey !== key) {
      return ""
    }

    return sortDirection === "asc" ? " ▲" : " ▼"
  }


  return (
    <section>
      <ApplesToApplesBanner
        summary={summary.comparability_summary}
        detailsAnchorId="comparability-panel"
      />
      <div className="section-head">
        <h2>{isResearchView ? "Leaderboard" : "Reporting Comparison"}</h2>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--fg-muted)" }}
        >
          {filteredRows.length === leaderboardRows.length
            ? `${leaderboardRows.length} models`
            : `${filteredRows.length} of ${leaderboardRows.length} models`}
          {" · "}
          {visibleMetrics.length === leaderboardMetrics.length
            ? `${leaderboardMetrics.length} measures`
            : `${visibleMetrics.length} of ${leaderboardMetrics.length} measures`}
        </span>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
        <p
          className="text-[13px] leading-[1.6]"
          style={{ color: "var(--fg-muted)", maxWidth: 720 }}
        >
          {isResearchView
            ? "Each column is a reported benchmark measure. Distinct measures stay separate instead of collapsing into a single raw score."
            : "Each column is a separately reported measure so the benchmark can be read without flattening different results into one number."}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ec-pill inline-flex items-center gap-1.5 shrink-0">
              <SlidersHorizontal className="h-3 w-3" />
              Columns
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Visible measure columns</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setVisibleMetricKeys(allMetricKeys)}>
              Show all
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {leaderboardMetrics.map((metric) => {
              const isVisible = visibleMetricKeySet.has(metric.column_key)
              const isLastVisible = isVisible && visibleMetrics.length === 1
              const visibleLabel = metric.scope === "subtask" && metric.subtask_key && subtaskMetricCounts.get(metric.subtask_key) === 1 && metric.subtask_name
                ? metric.subtask_name
                : getCompactMetricLabel(metric.display_name)

              return (
                <DropdownMenuCheckboxItem
                  key={metric.column_key}
                  checked={isVisible}
                  disabled={isLastVisible}
                  onCheckedChange={(checked) => setMetricVisibility(metric.column_key, checked === true)}
                  className="items-start"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium leading-tight text-foreground">{visibleLabel}</span>
                    <span className="text-xs leading-tight text-muted-foreground">{describeLeaderboardMetric(metric)}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Distribution panel — one curve, dropdown swaps between metrics */}
      {(() => {
        const distSeries = visibleMetrics
          .map((metric) => {
            const values = filteredRows
              .map((r) => r.values[metric.column_key])
              .filter((v): v is number => isNumericScore(v))
            if (values.length < 3) return null
            const label =
              metric.scope === "subtask" && metric.subtask_key && subtaskMetricCounts.get(metric.subtask_key) === 1 && metric.subtask_name
                ? metric.subtask_name
                : getCompactMetricLabel(metric.display_name)
            return {
              key: metric.column_key,
              label,
              caption: metric.unit ?? undefined,
              values,
              unit: metric.unit ?? undefined,
              lowerIsBetter: metric.lower_is_better,
            }
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

        if (distSeries.length === 0) return null
        return (
          <div className="mb-4">
            <ScoreDistribution series={distSeries} />
          </div>
        )
      })()}

      <div className="ec-card" style={{ padding: 0, overflow: "hidden" }}>
        {hasSubtaskTabs && (
          <div className="border-b bg-background px-5 py-3 sm:px-6">
            <SliceSelector
              activeSubtaskTab={activeSubtaskTab}
              onChange={setActiveSubtaskTab}
              tabs={singleMetricSubtaskTabs}
            />
          </div>
        )}

        {hasParameterData && (
          <div className="border-b bg-background px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Parameter range
                </div>
                <div className="text-sm text-muted-foreground">
                  Narrow the matrix to comparable model sizes.
                </div>
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-4 lg:max-w-[40rem]">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {PARAM_RANGE_MARKERS.map((marker) => (
                      <span key={marker.label} className="text-center">
                        {marker.label}
                      </span>
                    ))}
                  </div>

                  <div className="relative h-4">
                    <div className="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-border/80" />
                    <div className="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2">
                      <div
                        className="absolute inset-y-0 rounded-full bg-foreground"
                        style={{
                          left: `${(minParamStep / maxParamStepIndex) * 100}%`,
                          right: `${Math.max(100 - (maxParamStep / maxParamStepIndex) * 100, 0)}%`,
                        }}
                      />
                    </div>

                    <div className="absolute inset-x-1.5 top-1/2 -translate-y-1/2">
                      {PARAM_RANGE_VALUES.map((_, stepIndex) => (
                        <span
                          key={`param-matrix-tick-${stepIndex}`}
                          className="absolute top-0 h-2 w-px -translate-x-1/2 rounded-full bg-border"
                          style={{ left: `${(stepIndex / maxParamStepIndex) * 100}%` }}
                          aria-hidden="true"
                        />
                      ))}
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={maxParamStepIndex}
                      step={1}
                      value={minParamStep}
                      onChange={(event) => {
                        const nextMin = Number(event.target.value)
                        setMinParamStep(Math.min(nextMin, maxParamStep))
                      }}
                      className="param-range-input"
                      aria-label="Minimum parameter filter"
                    />

                    <input
                      type="range"
                      min={0}
                      max={maxParamStepIndex}
                      step={1}
                      value={maxParamStep}
                      onChange={(event) => {
                        const nextMax = Number(event.target.value)
                        setMaxParamStep(Math.max(nextMax, minParamStep))
                      }}
                      className="param-range-input"
                      aria-label="Maximum parameter filter"
                    />
                  </div>
                </div>

                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatParamBoundLabel(minParamStep, "min")} to {formatParamBoundLabel(maxParamStep, "max")}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="ec-htable" style={{ minWidth: 1080 }}>
            <thead>
              <tr>
                <th className="num" style={{ width: 64 }}>
                  Rank
                </th>
                <th
                  style={{ minWidth: 260, cursor: "pointer" }}
                  onClick={() => handleSort("model")}
                >
                  Model{getSortIndicator("model")}
                </th>
                <th
                  className="hidden lg:table-cell"
                  style={{ minWidth: 160, cursor: "pointer" }}
                  onClick={() => handleSort("developer")}
                >
                  {isResearchView ? "Developer" : "Provider"}
                  {getSortIndicator("developer")}
                </th>
                <th
                  className="num"
                  style={{ width: 110, cursor: "pointer" }}
                  onClick={() => handleSort("coverage")}
                >
                  Coverage{getSortIndicator("coverage")}
                </th>
                {visibleMetrics.map((metric) => {
                  const showSubtaskTopline =
                    !hasSubtaskTabs &&
                    !(metric.scope === "subtask" && metric.subtask_key && subtaskMetricCounts.get(metric.subtask_key) === 1) &&
                    metric.scope === "subtask" &&
                    metric.subtask_name
                  const mainLabel =
                    metric.scope === "subtask" && metric.subtask_key && subtaskMetricCounts.get(metric.subtask_key) === 1 && metric.subtask_name
                      ? metric.subtask_name
                      : getCompactMetricLabel(metric.display_name)
                  return (
                    <th
                      key={metric.column_key}
                      className="num"
                      style={{ minWidth: 130, cursor: "pointer" }}
                      onClick={() => handleSort(metric.column_key)}
                      title={describeLeaderboardMetric(metric)}
                    >
                      {showSubtaskTopline && (
                        <div
                          className="font-mono normal-case"
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            color: "var(--fg-subtle)",
                            marginBottom: 2,
                          }}
                        >
                          {metric.subtask_name}
                        </div>
                      )}
                      {mainLabel}
                      {getSortIndicator(metric.column_key)}
                    </th>
                  )
                })}
                <th
                  className="num hidden xl:table-cell"
                  style={{ width: 110, cursor: "pointer" }}
                  onClick={() => handleSort("updated")}
                >
                  Updated{getSortIndicator("updated")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => {
                const rank = rankByModelId.get(row.model_info.id) ?? 0
                const expandKey = row.model_info.id
                const isExpanded = expandedRows[expandKey] ?? false
                const matchingResult = modelResultByModelId.get(row.model_info.id)
                const isTopRank = rank === 1
                const rankColor = rank === 1 ? "var(--accent)" : "var(--fg-muted)"
                const familyLabel = row.model_info.architecture ?? row.model_info.parameter_count ?? null

                return (
                <Fragment key={row.model_info.id}>
                <tr className={cn("align-top", isExpanded && "bg-[color:var(--bg-warm)]")}>
                  <td className="num align-top">
                    <span
                      className="font-mono tabular-nums"
                      style={{
                        fontSize: 14,
                        fontWeight: isTopRank ? 600 : 500,
                        color: rankColor,
                      }}
                    >
                      #{rank}
                    </span>
                  </td>
                  <td className="align-top whitespace-normal">
                    <div className="flex items-start gap-1.5 leading-tight">
                      {isResearchView && matchingResult && (
                        <button
                          type="button"
                          onClick={() => toggleExpandedRow(expandKey)}
                          aria-label={isExpanded ? "Hide reproducibility" : "Show reproducibility"}
                          aria-expanded={isExpanded}
                          className="-ml-1 mt-0.5 inline-flex h-4 w-4 items-center justify-center transition-colors hover:text-[color:var(--accent)]"
                          style={{ color: "var(--fg-muted)" }}
                        >
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/models/${getModelFamilyRouteId(row.model_info)}`}
                          className="font-semibold text-[14px] hover:text-[color:var(--accent)] transition-colors"
                          style={{ color: "var(--fg)" }}
                        >
                          {row.model_info.name}
                        </Link>
                        {familyLabel && (
                          <div
                            className="mt-0.5 font-mono uppercase truncate"
                            style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--fg-subtle)" }}
                          >
                            {familyLabel}
                          </div>
                        )}
                        <div
                          className="mt-0.5 lg:hidden text-[12px]"
                          style={{ color: "var(--fg-muted)" }}
                        >
                          {row.model_info.developer ?? "Unknown developer"}
                        </div>
                        <RowSignalsCompact
                          annotations={getRowLevelAnnotations(row, visibleMetrics)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </td>

                  <td className="hidden lg:table-cell align-top">
                    <div className="text-[13px] truncate" style={{ color: "var(--fg-muted)" }}>
                      {row.model_info.developer ?? "Unknown developer"}
                    </div>
                  </td>

                  <td className="num align-top tabular-nums" style={{ fontSize: 13, fontWeight: 600 }}>
                    {getVisibleMetricCount(row)}
                    <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}>/{visibleMetrics.length}</span>
                  </td>

                  {visibleMetrics.map((metric) => {
                    const score = row.values[metric.column_key]
                    const annotations = row.annotations_by_metric?.[metric.column_key]
                    const valid = isNumericScore(score)
                    return (
                      <td
                        key={metric.column_key}
                        className="num align-top tabular-nums"
                        style={{
                          fontSize: 13,
                          fontWeight: valid ? 600 : 400,
                          color: valid ? "var(--fg)" : "var(--fg-subtle)",
                        }}
                      >
                        <div>{valid ? formatRawScore(score, undefined) : "—"}</div>
                        <SignalsRowBadges annotations={annotations} variant="cell" />
                      </td>
                    )
                  })}

                  <td className="num hidden xl:table-cell align-top font-mono tabular-nums" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                    {formatDate(row.evaluation_timestamp)}
                  </td>
                </tr>
                {isResearchView && isExpanded && matchingResult && (
                  <tr>
                    <td
                      colSpan={visibleMetrics.length + 5}
                      style={{ background: "var(--bg-warm)", padding: "20px 24px" }}
                    >
                      <div className="space-y-3">
                        <ResearcherReproducibilityCard
                          modelResult={matchingResult}
                          benchmarkKey={summary.benchmark_leaf_key ?? summary.composite_benchmark_key}
                          evalName={summary.evaluation_name}
                        />
                        <div className="flex justify-end">
                          <FlagScoreButton
                            modelName={matchingResult.model_info.name}
                            modelId={matchingResult.model_info.id}
                            benchmarkName={summary.evaluation_name}
                            benchmarkId={summary.evaluation_id}
                            score={formatRawScore(matchingResult.score, summary.metric_config.unit)}
                            sourceUrl={matchingResult.source_metadata.source_url}
                            sourceRecordUrl={matchingResult.source_record_url}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              )})}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={visibleMetrics.length + 5} style={{ padding: "32px 16px", textAlign: "center", color: "var(--fg-muted)" }}>
                    No models match the selected parameter range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagedRows.length < filteredRows.length && (
          <div
            style={{
              borderTop: "1px solid var(--border-soft)",
              background: "var(--bg-warm)",
              padding: "16px",
              textAlign: "center",
            }}
          >
            <button
              type="button"
              className="btn-ec outline"
              onClick={() => setPage((current) => current + 1)}
            >
              Load more ({filteredRows.length - pagedRows.length} remaining)
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function BenchmarkCardCollapsible({
  card,
  isResearchView,
  defaultOpen = true,
  defaultRisksOpen = false,
  knownIssues = [],
}: {
  card: BenchmarkCard
  isResearchView: boolean
  defaultOpen?: boolean
  defaultRisksOpen?: boolean
  knownIssues?: KnownIssue[]
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="ec-card flex w-full items-center justify-between text-left transition-colors hover:bg-[color:var(--bg-warm)]"
          style={{ padding: "14px 20px" }}
        >
          <div className="flex items-center gap-3">
            <BookOpen className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
            <span className="kicker kicker-fg">Benchmark card</span>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.12em]"
              style={{ color: "var(--fg-subtle)" }}
            >
              dataset · methodology · risks · resources
            </span>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
          ) : (
            <ChevronDown className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <BenchmarkCardPanel
          card={card}
          isResearchView={isResearchView}
          defaultRisksOpen={defaultRisksOpen}
          knownIssues={knownIssues}
        />
      </CollapsibleContent>
    </Collapsible>
  )
}

function DetailPanel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div
      className="min-w-0"
      style={{
        padding: 16,
        border: "1px solid var(--border-soft)",
        background: "var(--bg)",
      }}
    >
      <div className="mb-3">
        <div
          className="font-mono uppercase mb-1"
          style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
        >
          {title}
        </div>
        <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>{subtitle}</div>
      </div>
      <div className="min-w-0 space-y-2">{children}</div>
    </div>
  )
}

function MetaRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  // Hide rows whose value is missing or a generic placeholder. This keeps
  // the detail panels focused on fields we actually have data for.
  if (value == null) return null
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (
      normalized === "" ||
      normalized === "unknown" ||
      normalized === "n/a" ||
      normalized === "not recorded" ||
      normalized === "not specified" ||
      normalized === "not linked"
    ) {
      return null
    }
  }
  return (
    <div
      className="text-sm"
      style={{
        display: "grid",
        gridTemplateColumns: "8rem minmax(0, 1fr)",
        columnGap: "0.75rem",
        width: "100%",
        minWidth: 0,
      }}
    >
      <div className="text-muted-foreground">{label}</div>
      <div
        className="font-medium"
        style={{
          minWidth: 0,
          maxWidth: "100%",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  )
}

function toStringArray(value: unknown): string[] {
  const result = new Set<string>()

  const visit = (candidate: unknown) => {
    if (!candidate) {
      return
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item)
      }
      return
    }

    if (typeof candidate === "object") {
      for (const item of Object.values(candidate)) {
        visit(item)
      }
      return
    }

    if (typeof candidate !== "string") {
      return
    }

    const normalized = candidate.trim()
    if (!normalized || normalized === "Not specified") {
      return
    }

    for (const part of normalized.split(/[,;|]/)) {
      const token = part.trim()
      if (token && token !== "Not specified") {
        result.add(token)
      }
    }
  }

  visit(value)
  return Array.from(result)
}

function BenchmarkCardPanel({
  card,
  isResearchView,
  defaultRisksOpen = false,
  knownIssues = [],
}: {
  card: BenchmarkCard
  isResearchView: boolean
  defaultRisksOpen?: boolean
  knownIssues?: KnownIssue[]
}) {
  const [risksOpen, setRisksOpen] = useState(defaultRisksOpen)
  const details = card.benchmark_details
  const purpose = card.purpose_and_intended_users
  const methodology = card.methodology
  const data = card.data
  const ethical = card.ethical_and_legal_considerations
  const risks = card.possible_risks ?? []
  const flaggedFields = Object.entries(card.flagged_fields ?? {})
  const missingFields = card.missing_fields ?? []

  const domains = toStringArray(details.domains)
  const languages = toStringArray(details.languages)
  const resources = (details.resources ?? []).filter(Boolean)
  const tasks = toStringArray(purpose.tasks)
  const audience = toStringArray(purpose.audience)

  const license = ethical.data_licensing ?? ""
  const shortLicense = license && license !== "Not specified" ? license : null

  return (
    <div className="ec-card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 20px",
          background: "var(--bg-warm)",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        <div className="flex flex-wrap items-center gap-3 mb-1.5">
          <BookOpen className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
          <span className="kicker kicker-fg" style={{ fontSize: 12, letterSpacing: "0.16em" }}>
            Benchmark Card
          </span>
          {shortLicense && (
            <span className="ec-tag outline">{shortLicense}</span>
          )}
          {(flaggedFields.length > 0 || missingFields.length > 0) && (
            <span
              className="font-mono inline-flex items-center gap-1"
              style={{
                fontSize: 10,
                padding: "2px 8px",
                letterSpacing: "0.06em",
                background: "var(--bg)",
                color: "var(--accent)",
                border: "1px solid var(--accent)",
                textTransform: "uppercase",
              }}
            >
              <AlertTriangle className="h-3 w-3" />
              {flaggedFields.length} flagged · {missingFields.length} missing
            </span>
          )}
        </div>
        <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
          Structured metadata about this benchmark: what it measures, how it was built, and known limitations.
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {knownIssues.length > 0 && <KnownIssuesPanel issues={knownIssues} variant="full" />}

        {/* Overview + domains */}
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">{details.overview}</p>

          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <span key={d} className="ec-tag outline">
                <Tag className="h-3 w-3 shrink-0" />
                {d}
              </span>
            ))}
            {languages.map((l) => (
              <span key={l} className="ec-tag outline">
                <Globe className="h-3 w-3 shrink-0" />
                {l}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {/* Goal */}
          <div
            style={{
              padding: 16,
              border: "1px solid var(--border-soft)",
              background: "var(--bg)",
            }}
          >
            <div
              className="mb-2 flex items-center gap-2 font-mono uppercase"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
            >
              <Scale className="h-3 w-3" /> Goal
            </div>
            <p className="text-[13px] leading-[1.55]" style={{ color: "var(--fg)" }}>{purpose.goal}</p>
          </div>

          {/* Metric interpretation */}
          <div
            style={{
              padding: 16,
              border: "1px solid var(--border-soft)",
              background: "var(--bg)",
            }}
          >
            <div
              className="mb-2 flex items-center gap-2 font-mono uppercase"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
            >
              <BarChart3 className="h-3 w-3" /> Score interpretation
            </div>
            <p className="text-[13px] leading-[1.55]" style={{ color: "var(--fg)" }}>{methodology.interpretation}</p>
          </div>

          {/* Limitations */}
          <div
            style={{
              padding: 16,
              border: "1px solid var(--accent)",
              background: "var(--bg-warm)",
            }}
          >
            <div
              className="mb-2 flex items-center gap-2 font-mono uppercase"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--accent)" }}
            >
              <AlertTriangle className="h-3 w-3" /> Limitations
            </div>
            <p className="text-[13px] leading-[1.55]" style={{ color: "var(--accent)" }}>{purpose.limitations}</p>
          </div>
        </div>

        {(methodology.methods?.length > 0 ||
          (methodology.calculation && methodology.calculation !== "Not specified") ||
          (methodology.validation && methodology.validation !== "Not specified")) && (
          <div
            style={{
              padding: 16,
              border: "1px solid var(--border-soft)",
              background: "var(--bg)",
            }}
          >
            <div
              className="mb-3 font-mono uppercase"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
            >
              How tasks were sourced and scored
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {methodology.methods?.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-foreground/80">
                    Task setup
                  </div>
                  <ol className="list-decimal space-y-1.5 pl-4 text-sm leading-5 text-muted-foreground">
                    {methodology.methods.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="space-y-3">
                {methodology.calculation && methodology.calculation !== "Not specified" && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-foreground/80">
                      Score calculation
                    </div>
                    <p className="text-sm leading-5 text-muted-foreground">
                      {methodology.calculation}
                    </p>
                  </div>
                )}
                {methodology.validation && methodology.validation !== "Not specified" && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-foreground/80">
                      Validation
                    </div>
                    <p className="text-sm leading-5 text-muted-foreground">
                      {methodology.validation}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Research-only: methodology + dataset details */}
        {isResearchView && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              style={{
                padding: 16,
                border: "1px solid var(--border-soft)",
                background: "var(--bg)",
              }}
            >
              <div
                className="mb-3 font-mono uppercase"
                style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
              >
                Dataset
              </div>
              <dl className="space-y-2 text-[13px]">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0" style={{ color: "var(--fg-muted)" }}>Size</dt>
                  <dd className="font-medium">{data.size}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0" style={{ color: "var(--fg-muted)" }}>Format</dt>
                  <dd className="font-medium capitalize">{data.format}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0" style={{ color: "var(--fg-muted)" }}>Source</dt>
                  <dd className="font-medium">{data.source}</dd>
                </div>
              </dl>
            </div>

            <div
              style={{
                padding: 16,
                border: "1px solid var(--border-soft)",
                background: "var(--bg)",
              }}
            >
              <div
                className="mb-3 font-mono uppercase"
                style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
              >
                Methodology
              </div>
              <dl className="space-y-2 text-[13px]">
                {methodology.metrics.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0" style={{ color: "var(--fg-muted)" }}>Metrics</dt>
                    <dd className="font-medium">{methodology.metrics.join(", ")}</dd>
                  </div>
                )}
                {tasks.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0" style={{ color: "var(--fg-muted)" }}>Tasks</dt>
                    <dd className="font-medium">{tasks.join(", ")}</dd>
                  </div>
                )}
                {audience.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0" style={{ color: "var(--fg-muted)" }}>Audience</dt>
                    <dd className="font-medium">{audience.join("; ")}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}

        {/* Generic IBM-style AI risks. These are boilerplate (per audit
            feedback: "least useful feature for policy users"), so in policy
            mode we hide them entirely — the curated known-issues panel above
            carries the benchmark-specific concerns. Researchers still get the
            full collapsible list. */}
        {risks.length > 0 && isResearchView && (
          <Collapsible open={risksOpen} onOpenChange={setRisksOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between text-left transition-colors hover:bg-[color:var(--bg-warm)]"
                style={{
                  padding: "12px 16px",
                  border: "1px solid var(--border-soft)",
                  background: "var(--bg)",
                }}
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
                  <span
                    className="font-mono uppercase"
                    style={{ fontSize: 11, letterSpacing: "0.12em", color: "var(--fg)" }}
                  >
                    Risk considerations ({risks.length})
                  </span>
                </div>
                {risksOpen ? (
                  <ChevronUp className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
                ) : (
                  <ChevronDown className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {risks.map((risk, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 14,
                      border: "1px solid var(--border-soft)",
                      background: "var(--bg)",
                    }}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <span className="text-[13px] font-semibold">{risk.category}</span>
                      {risk.url && (
                        <a
                          href={risk.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 hover:text-[color:var(--accent)]"
                          style={{ color: "var(--fg-muted)" }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {risk.description?.[0] && (
                      <p
                        className="text-[12px] leading-[1.55] line-clamp-3"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        {risk.description[0]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Compliance / ethical notes (policy view emphasis) */}
        {!isResearchView && (
          <div
            style={{
              padding: 16,
              border: "1px solid var(--border-soft)",
              background: "var(--bg)",
            }}
          >
            <div
              className="mb-3 font-mono uppercase"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
            >
              Ethical &amp; legal
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
              {shortLicense && (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0" style={{ color: "var(--fg-muted)" }}>License</dt>
                  <dd className="font-medium">{license}</dd>
                </div>
              )}
              {ethical.compliance_with_regulations && ethical.compliance_with_regulations !== "Not specified" && (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0" style={{ color: "var(--fg-muted)" }}>Compliance</dt>
                  <dd className="font-medium">{ethical.compliance_with_regulations}</dd>
                </div>
              )}
              {ethical.privacy_and_anonymity && ethical.privacy_and_anonymity !== "Not specified" && (
                <div className="col-span-full flex gap-2">
                  <dt className="w-28 shrink-0" style={{ color: "var(--fg-muted)" }}>Privacy</dt>
                  <dd className="font-medium">{ethical.privacy_and_anonymity}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Flagged / missing fields warning */}
        {(flaggedFields.length > 0 || missingFields.length > 0) && isResearchView && (
          <div
            style={{
              padding: 14,
              border: "1px solid var(--accent)",
              background: "var(--bg-warm)",
            }}
          >
            <div
              className="mb-2 font-mono uppercase"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--accent)" }}
            >
              Card quality notes
            </div>
            {flaggedFields.length > 0 && (
              <ul className="space-y-1 text-[12px]" style={{ color: "var(--fg)" }}>
                {flaggedFields.map(([field, note]) => (
                  <li key={field}>
                    <span className="font-semibold">{field}:</span> {note}
                  </li>
                ))}
              </ul>
            )}
            {missingFields.length > 0 && (
              <p className="mt-1 text-[12px]" style={{ color: "var(--fg-muted)" }}>
                Missing: {missingFields.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* External resources */}
        {resources.length > 0 && (
          <div>
            <div
              className="mb-2 font-mono uppercase"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
            >
              Resources
            </div>
            <div className="flex flex-wrap gap-2">
              {resources.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ec-tag outline inline-flex items-center gap-1.5"
                  style={{ textDecoration: "none" }}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  {url.replace(/^https?:\/\//, "").replace(/\/.+/, "")}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
