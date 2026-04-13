"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search, X } from "lucide-react"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { ListPagination } from "@/components/list-pagination"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { Input } from "@/components/ui/input"
import type { EvalHierarchy, HierarchyFamily } from "@/lib/backend-artifacts"
import type { BenchmarkCard, CategoryType } from "@/lib/benchmark-schema"
import type { BenchmarkEvalListItem } from "@/lib/eval-processing"
import { fetchBenchmarkMetadata, fetchEvalHierarchy, fetchEvalList } from "@/lib/dashboard-data-client"
import { getCategoryColor } from "@/lib/benchmark-schema"
import { lookupBenchmarkCard, normalizeBenchmarkKey } from "@/lib/benchmark-metadata-utils"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 40

function shortenLicense(license: string): string {
  if (!license || license === "Not specified") return ""
  if (license.toLowerCase().includes("creative commons attribution 4")) return "CC BY 4.0"
  if (license.toLowerCase().includes("creative commons zero")) return "CC0"
  if (license.toLowerCase().includes("apache license 2") || license.toLowerCase().includes("apache 2")) return "Apache 2.0"
  if (license.toLowerCase().includes("mit license")) return "MIT"
  if (license.toLowerCase().includes("cc-by-sa")) return "CC BY-SA"
  if (license.length > 24) return `${license.slice(0, 22)}…`
  return license
}

const LICENSE_COLORS: Record<string, string> = {
  mit: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200",
  apache: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200",
  "cc by": "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200",
  cc0: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-200",
  "cc-by-sa": "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200",
}

function licenseBadgeClass(license: string): string {
  const normalized = license.toLowerCase()
  for (const [key, className] of Object.entries(LICENSE_COLORS)) {
    if (normalized.includes(key)) return className
  }
  return "bg-muted text-muted-foreground border-border"
}

function categoryGlowClass(category: CategoryType | string) {
  switch (category) {
    case "General":
      return "bg-sky-200/45 dark:bg-sky-900/30"
    case "Reasoning":
      return "bg-violet-200/45 dark:bg-violet-900/30"
    case "Agentic":
      return "bg-amber-200/45 dark:bg-amber-900/30"
    case "Safety":
      return "bg-rose-200/45 dark:bg-rose-900/30"
    case "Knowledge":
      return "bg-emerald-200/45 dark:bg-emerald-900/30"
    default:
      return "bg-stone-200/45 dark:bg-stone-800/40"
  }
}

function slugifyAggregateId(value: string) {
  return `aggregate__${value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`
}

// Canonical display names — keyed by normalized form (lowercase, separators→underscores)
const BENCHMARK_DISPLAY_NAMES: Record<string, string> = {
  hfopenllm_v2: "HF Open LLM v2",
  hfopenllm: "HF Open LLM",
  helm_lite: "HELM Lite",
  helm_capabilities: "HELM Capabilities",
  helm_classic: "HELM Classic",
  helm_instruct: "HELM Instruct",
  helm_mmlu: "HELM MMLU",
  reward_bench: "RewardBench",
  reward_bench_2: "RewardBench 2",
  bfcl: "BFCL",
  global_mmlu_lite: "Global MMLU Lite",
  swe_bench: "SWE-bench",
  arc_agi: "ARC AGI",
  tau_bench_2: "TAU-Bench 2",
  ace: "ACE",
  apex_agents: "APEX Agents",
  apex_v1: "APEX v1",
  appworld: "AppWorld",
  browsecompplus: "BrowseComp+",
  livecodebenchpro: "LiveCodeBench Pro",
  sciarena: "SciArena",
  terminal_bench_2_0: "Terminal Bench 2.0",
  la_leaderboard: "LA Leaderboard",
  theory_of_mind: "Theory of Mind",
  fibble_arena: "Fibble Arena",
  fibble1_arena: "Fibble Arena v1",
  fibble2_arena: "Fibble Arena v2",
  fibble3_arena: "Fibble Arena v3",
  fibble4_arena: "Fibble Arena v4",
  fibble5_arena: "Fibble Arena v5",
  wordle_arena: "Wordle Arena",
  bfcl_live: "BFCL Live",
  bfcl_non_live: "BFCL Non Live",
  bfcl_multi_turn: "BFCL Multi Turn",
  bfcl_overall: "BFCL Overall",
}

const BENCHMARK_TOKEN_CASE_OVERRIDES: Record<string, string> = {
  agi: "AGI",
  ai: "AI",
  apex: "APEX",
  api: "API",
  arc: "ARC",
  bbh: "BBH",
  bfcl: "BFCL",
  gpqa: "GPQA",
  gsm8k: "GSM8K",
  hf: "HF",
  helm: "HELM",
  if: "IF",
  ifeval: "IFEval",
  la: "LA",
  llm: "LLM",
  math: "MATH",
  medqa: "MedQA",
  mmlu: "MMLU",
  musr: "MUSR",
  omni: "Omni",
  qa: "QA",
  swe: "SWE",
  tau: "TAU",
  vqa: "VQA",
}

function toCanonicalBenchmarkLabelKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function formatBenchmarkToken(token: string): string {
  const trimmed = token.trim()
  if (!trimmed) return ""

  const canonical = trimmed.toLowerCase()
  if (BENCHMARK_TOKEN_CASE_OVERRIDES[canonical]) {
    return BENCHMARK_TOKEN_CASE_OVERRIDES[canonical]
  }

  if (/^[A-Z0-9]+$/.test(trimmed) && /[A-Z]/.test(trimmed)) {
    return trimmed
  }

  if (/^[vV]\d+[a-zA-Z0-9]*$/.test(trimmed)) {
    return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1).toLowerCase()}`
}

/**
 * Normalize benchmark keys that are numbered variants of the same suite into
 * a single super-group key. E.g. fibble1_arena → fibble_arena, arc_agi_v2 → arc_agi.
 * Returns the original key if no super-group applies.
 */
function getSuperGroupKey(benchmarkKey: string): string {
  const k = benchmarkKey.toLowerCase().replace(/[-.\s]+/g, "_").replace(/^_+|_+$/g, "")
  // fibble1_arena, fibble2_arena, ... → fibble_arena
  if (/^fibble\d*_arena$/.test(k)) return "fibble_arena"
  // arc_agi_v1, arc_agi_v2, arc_agi_v3 → arc_agi
  if (/^arc_agi_v\d+/.test(k)) return "arc_agi"
  // apex_v1, apex_v2 → apex (but keep apex_agents separate)
  if (/^apex_v\d+$/.test(k)) return "apex"
  return k
}

function humanizeBenchmarkKey(key: string): string {
  const canonical = toCanonicalBenchmarkLabelKey(key)
  const superGroupKey = getSuperGroupKey(canonical)

  if (BENCHMARK_DISPLAY_NAMES[canonical]) return BENCHMARK_DISPLAY_NAMES[canonical]
  if (BENCHMARK_DISPLAY_NAMES[superGroupKey]) return BENCHMARK_DISPLAY_NAMES[superGroupKey]

  return key
    .replace(/[/.]+/g, " ")
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map(formatBenchmarkToken)
    .join(" ")
}

function formatBenchmarkLabel(value?: string | null): string {
  if (!value) return ""
  return humanizeBenchmarkKey(value)
}

function getSummaryHierarchyLabels(
  summary: BenchmarkEvalListItem,
  card: BenchmarkCard | undefined,
  familyLabels: Map<string, string>
) {
  const familyLabel =
    (summary.benchmark_family_key ? familyLabels.get(summary.benchmark_family_key) : undefined) ??
    formatBenchmarkLabel(summary.benchmark_family_key)

  const suiteLabel = formatBenchmarkLabel(
    summary.composite_benchmark_name || summary.evaluation_name
  )

  const benchmarkLabel = formatBenchmarkLabel(
    summary.is_aggregated
      ? summary.composite_benchmark_name || summary.evaluation_name
      : card?.benchmark_details?.name ?? summary.evaluation_name
  )

  const suiteKey = normalizeBenchmarkKey(suiteLabel)
  const benchmarkKey = normalizeBenchmarkKey(benchmarkLabel)
  const isSuiteLevel = !benchmarkKey || suiteKey === benchmarkKey
  const showFamilyLabel = Boolean(familyLabel) && normalizeBenchmarkKey(familyLabel) !== suiteKey

  return {
    familyLabel,
    suiteLabel,
    benchmarkLabel: isSuiteLevel ? suiteLabel : benchmarkLabel,
    displayTitle: isSuiteLevel ? suiteLabel : `${suiteLabel}: ${benchmarkLabel}`,
    isSuiteLevel,
    showFamilyLabel,
  }
}

function countFamilySurface(family: HierarchyFamily) {
  const directBenchmarks = family.benchmarks?.length ?? 0
  const standaloneBenchmarks = family.standalone_benchmarks?.length ?? 0
  const compositeBenchmarks = (family.composites ?? []).reduce(
    (sum, composite) => sum + (composite.benchmarks?.length ?? 0),
    0
  )
  return directBenchmarks + standaloneBenchmarks + compositeBenchmarks + (family.slices?.length ?? 0)
}

export default function EvalsPage() {
  const { mode } = useAudienceMode()

  const [summaries, setSummaries] = useState<BenchmarkEvalListItem[]>([])
  const [benchmarkCards, setBenchmarkCards] = useState<Record<string, BenchmarkCard>>({})
  const [hierarchy, setHierarchy] = useState<EvalHierarchy | null>(null)
  const [loading, setLoading] = useState(true)
  const [totalModels, setTotalModels] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    Promise.all([fetchEvalList(), fetchBenchmarkMetadata()])
      .then(([data, cards]) => {
        setSummaries(data.evals)
        setTotalModels(data.totalModels)
        setBenchmarkCards(cards)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }


    fetchEvalHierarchy()
      .then(setHierarchy)
      .catch(console.error)
    const syncSearchFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const incomingSearch = params.get("search") ?? ""
      setSearchQuery(incomingSearch)
    }

    syncSearchFromUrl()
    window.addEventListener("popstate", syncSearchFromUrl)

    return () => {
      window.removeEventListener("popstate", syncSearchFromUrl)
    }
  }, [])

  const summariesWithCards = useMemo(() => {
    return summaries.map((summary) => {
      if (summary.benchmark_card) {
        return summary
      }

      const fallbackCard =
        lookupBenchmarkCard(benchmarkCards, summary.evaluation_name) ??
        lookupBenchmarkCard(benchmarkCards, summary.composite_benchmark_name) ??
        lookupBenchmarkCard(benchmarkCards, summary.composite_benchmark_key)

      return fallbackCard ? { ...summary, benchmark_card: fallbackCard } : summary
    })
  }, [benchmarkCards, summaries])

  const aggregatedSummaries = useMemo(() => {
    // Group by top-level benchmark (composite_benchmark_key) so that
    // individual metrics like "hfopenllm_v2 / BBH" and "hfopenllm_v2 / GPQA"
    // collapse into a single "HF Open LLM v2" card.
    const grouped = new Map<string, BenchmarkEvalListItem[]>()

    for (const summary of summariesWithCards) {
      const rawKey = summary.composite_benchmark_key || summary.evaluation_id
      const groupKey = getSuperGroupKey(rawKey)
      const existing = grouped.get(groupKey) ?? []
      existing.push(summary)
      grouped.set(groupKey, existing)
    }

    return Array.from(grouped.entries()).map(([groupKey, items]) => {
      if (items.length === 1) {
        return items[0]
      }

      const first = items[0]
      // Pick the best benchmark card from any item in the group
      const bestCard = items.find((item) => item.benchmark_card)?.benchmark_card ?? first.benchmark_card

      const aggregateSources = items
        .map((item) => ({
          evaluation_id: item.evaluation_id,
          composite_benchmark_key: item.composite_benchmark_key,
          composite_benchmark_name: item.evaluation_name,
          models_count: item.models_count,
          avg_score_norm: item.avg_score_norm,
        }))
        .sort((a, b) => a.composite_benchmark_name.localeCompare(b.composite_benchmark_name))

      const dominantCategory =
        Object.entries(
          items.reduce<Record<string, number>>((counts, item) => {
            counts[item.category] = (counts[item.category] ?? 0) + 1
            return counts
          }, {})
        ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? first.category

      // Use the suite/composite name for grouped benchmarks, NOT the sub-benchmark card name
      const displayName = first.composite_benchmark_name
        ?? humanizeBenchmarkKey(groupKey)

      const combinedMetricNames = Array.from(
        new Set(items.flatMap((item) => item.metric_names ?? []))
      )

      const combinedInstanceData = {
        available: items.some((item) => item.instance_data?.available),
        url_count: items.reduce((sum, item) => sum + (item.instance_data?.url_count ?? 0), 0),
        sample_urls: Array.from(
          new Set(items.flatMap((item) => item.instance_data?.sample_urls ?? []))
        ).slice(0, 3),
        models_with_loaded_instances: items.reduce(
          (sum, item) => sum + (item.instance_data?.models_with_loaded_instances ?? 0),
          0
        ),
      }
      const highestTopScore = items.reduce(
        (highest, item) => Math.max(highest, item.top_score ?? Number.NEGATIVE_INFINITY),
        Number.NEGATIVE_INFINITY
      )

      return {
        ...first,
        evaluation_name: displayName,
        evaluation_id: slugifyAggregateId(groupKey),
        composite_benchmark_key: groupKey,
        composite_benchmark_name: displayName,
        category: dominantCategory as CategoryType,
        models_count: Math.max(...items.map((item) => item.models_count)),
        evaluator_names: Array.from(new Set(items.flatMap((item) => item.evaluator_names))).sort(),
        source_types: Array.from(new Set(items.flatMap((item) => item.source_types))).sort(),
        latest_source_name: displayName,
        third_party_ratio:
          items.reduce((sum, item) => sum + item.third_party_ratio, 0) / items.length,
        missing_generation_config_count: items.reduce(
          (sum, item) => sum + item.missing_generation_config_count, 0
        ),
        avg_score:
          items.reduce((sum, item) => sum + item.avg_score_norm, 0) / items.length,
        avg_score_norm:
          items.reduce((sum, item) => sum + item.avg_score_norm, 0) / items.length,
        best_model: null,
        worst_model: null,
        benchmark_card: bestCard,
        is_aggregated: items.length > 1,
        aggregate_sources: aggregateSources,
        metrics_count: items.reduce((sum, item) => sum + (item.metrics_count ?? 0), 0),
        metric_names: combinedMetricNames,
        top_score: Number.isFinite(highestTopScore) ? highestTopScore : undefined,
        subtasks_count: items.reduce((sum, item) => sum + (item.subtasks_count ?? 0), 0),
        instance_data: combinedInstanceData,
        source_data: first.source_data,
        summary_eval_ids: Array.from(new Set(items.flatMap((item) => item.summary_eval_ids ?? []))),
      } satisfies BenchmarkEvalListItem
    })
  }, [summariesWithCards])

  const allDomains = useMemo(() => {
    const domainSet = new Set<string>()
    for (const summary of aggregatedSummaries) {
      for (const domain of summary.tags?.domains ?? []) {
        domainSet.add(domain)
      }
      for (const domain of summary.benchmark_card?.benchmark_details?.domains ?? []) {
        domainSet.add(domain)
      }
    }
    return Array.from(domainSet).sort((a, b) => a.localeCompare(b))
  }, [aggregatedSummaries])

  const allCategories = useMemo(() => {
    const categorySet = new Set<string>()
    for (const summary of aggregatedSummaries) {
      if (summary.category) {
        categorySet.add(summary.category)
      }
    }
    return Array.from(categorySet).sort((a, b) => a.localeCompare(b))
  }, [aggregatedSummaries])

  const taxonomyFamilies = useMemo(() => {
    if (!hierarchy) return []

    return [...hierarchy.families]
      .sort((a, b) => countFamilySurface(b) - countFamilySurface(a) || a.display_name.localeCompare(b.display_name))
      .slice(0, 10)
  }, [hierarchy])

  const familyDisplayLabels = useMemo(() => {
    const labels = new Map<string, string>()

    for (const summary of aggregatedSummaries) {
      if (summary.benchmark_family_key && !labels.has(summary.benchmark_family_key)) {
        labels.set(summary.benchmark_family_key, formatBenchmarkLabel(summary.benchmark_family_key))
      }
    }

    for (const family of hierarchy?.families ?? []) {
      labels.set(family.key, formatBenchmarkLabel(family.display_name || family.key))
    }

    return labels
  }, [aggregatedSummaries, hierarchy])

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let list = [...aggregatedSummaries]

    if (query) {
      list = list.filter((summary) => {
        const haystacks = [
          summary.evaluation_name,
          summary.composite_benchmark_name,
          summary.metric_config.evaluation_description,
          summary.source_data?.dataset_name,
          summary.source_data?.hf_repo,
          summary.benchmark_card?.benchmark_details?.overview,
          ...(summary.benchmark_card?.benchmark_details?.domains ?? []),
          ...(summary.tags?.domains ?? []),
          ...(summary.tags?.tasks ?? []),
          ...(summary.metric_names ?? []),
        ]

        return haystacks.some((value) => value?.toLowerCase().includes(query))
      })
    }

    if (selectedDomain) {
      list = list.filter((summary) => {
        const allDomains = [
          ...(summary.tags?.domains ?? []),
          ...(summary.benchmark_card?.benchmark_details?.domains ?? []),
        ]
        return allDomains.some(
          (domain) => domain.toLowerCase() === selectedDomain.toLowerCase()
        )
      })
    }

    if (selectedCategory) {
      list = list.filter((summary) => summary.category === selectedCategory)
    }

    // Sort by relevance: population × 0.45 + has_metadata × 0.35 + is_composite × 0.2
    const maxModels = Math.max(1, ...list.map((s) => s.models_count))
    list.sort((a, b) => {
      const aScore =
        (a.models_count / maxModels) * 0.45 +
        (a.benchmark_card ? 1 : 0) * 0.35 +
        (a.aggregate_sources && a.aggregate_sources.length > 1 ? 1 : 0) * 0.2
      const bScore =
        (b.models_count / maxModels) * 0.45 +
        (b.benchmark_card ? 1 : 0) * 0.35 +
        (b.aggregate_sources && b.aggregate_sources.length > 1 ? 1 : 0) * 0.2
      if (bScore !== aScore) return bScore - aScore
      return a.evaluation_name.localeCompare(b.evaluation_name)
    })
    return list
  }, [aggregatedSummaries, searchQuery, selectedCategory, selectedDomain])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, selectedCategory, selectedDomain])

  const pagedSummaries = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  )

  const activeFilterCount = [searchQuery.trim(), selectedDomain, selectedCategory].filter(Boolean).length

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="text-lg text-muted-foreground">Loading evaluations...</div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <PageHeader
        eyebrow="Evaluations"
        title="Browse Evaluations"
        description={
          mode === "research"
            ? "Scan single-benchmark evaluations with the benchmark context first, then open the detail page when you need methodology, provenance, or ranking depth."
            : "Scan single-benchmark evaluations with the benchmark context first, then open the detail page when you need accountability, source, or reporting detail."
        }
      />

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <section className="mb-8 rounded-[1.5rem] border border-stone-200/80 bg-white/82 p-4 shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] dark:border-stone-800/80 dark:bg-stone-950/70">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name, domain, or overview"
                className="h-11 rounded-full border-stone-200/80 bg-stone-50/70 pl-10 shadow-none dark:border-stone-700/70 dark:bg-stone-900/60"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-stone-200/80 bg-stone-50/80 px-3 py-1.5 font-medium text-stone-700 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-200">
                {filtered.length} visible
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedDomain(null)
                    setSelectedCategory(null)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 dark:border-stone-700/80 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <X className="h-3.5 w-3.5" />
                  Reset filters
                </button>
              )}
            </div>
          </div>

          {hierarchy && taxonomyFamilies.length > 0 && (
            <div className="mt-4 border-t border-stone-200/80 pt-4 dark:border-stone-800/80">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                    Benchmark families
                  </div>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                    Jump into the main suites first, then narrow with domain or category filters.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full border border-stone-200/80 bg-stone-50/80 px-3 py-1.5 font-medium text-stone-700 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-200">
                    {hierarchy.stats.composite_count} composites
                  </span>
                  <span className="rounded-full border border-stone-200/80 bg-stone-50/80 px-3 py-1.5 font-medium text-stone-700 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-200">
                    {hierarchy.stats.single_benchmark_count} benchmarks
                  </span>
                  <span className="rounded-full border border-stone-200/80 bg-stone-50/80 px-3 py-1.5 font-medium text-stone-700 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-200">
                    {hierarchy.stats.slice_count} slices
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {taxonomyFamilies.map((family) => (
                  <button
                    key={family.key}
                    type="button"
                    onClick={() => setSearchQuery(formatBenchmarkLabel(family.display_name || family.key))}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-200/80 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700/80 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    {formatBenchmarkLabel(family.display_name || family.key)}
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:bg-stone-800 dark:text-stone-300">
                      {countFamilySurface(family)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {allDomains.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                Domain
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedDomain(null)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      selectedDomain === null
                        ? "border-stone-950 bg-stone-950 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950"
                        : "border-stone-200/80 bg-stone-50/80 text-stone-600 hover:bg-stone-100 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-300 dark:hover:bg-stone-800"
                    )}
                  >
                    All
                  </button>
                  {allDomains.map((domain) => (
                    <button
                      key={domain}
                      type="button"
                      onClick={() => setSelectedDomain(selectedDomain === domain ? null : domain)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                        selectedDomain === domain
                          ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                          : "border-stone-200/80 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700/80 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                      )}
                    >
                      {domain}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {allCategories.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                Category
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      selectedCategory === null
                        ? "border-stone-950 bg-stone-950 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950"
                        : "border-stone-200/80 bg-stone-50/80 text-stone-600 hover:bg-stone-100 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-300 dark:hover:bg-stone-800"
                    )}
                  >
                    All
                  </button>
                  {allCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selectedCategory === category
                          ? `${getCategoryColor(category as CategoryType)} border`
                          : "border-stone-200/80 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700/80 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                      )}
                    >
                      {category}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </section>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No evaluations found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {pagedSummaries.map((summary) => {
              const card = summary.benchmark_card
              const hierarchyLabels = getSummaryHierarchyLabels(summary, card, familyDisplayLabels)
              const title = hierarchyLabels.displayTitle
              const overview = summary.is_aggregated
                ? `Composite benchmark with ${summary.aggregate_sources?.length ?? 0} metrics across ${summary.models_count.toLocaleString()} models.`
                : (card?.benchmark_details?.overview ?? summary.metric_config.evaluation_description)
              const domains = summary.tags?.domains ?? card?.benchmark_details?.domains ?? []
              const dataType = card?.benchmark_details?.data_type ?? ""
              const license = card?.ethical_and_legal_considerations?.data_licensing ?? ""
              const shortLicense = shortenLicense(license)
              const topScoreLabel = summary.top_score != null
                ? summary.top_score >= 0 && summary.top_score <= 1
                  ? `${(summary.top_score * 100).toFixed(1)}%`
                  : summary.top_score.toFixed(summary.top_score >= 100 ? 0 : 2)
                : null
              const categoryBadgeClass = getCategoryColor(summary.category as CategoryType)

              return (
                <Link
                  key={summary.evaluation_id}
                  href={`/evals/${summary.evaluation_id}`}
                  className="group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,248,245,0.92))] p-5 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.38)] transition-all hover:-translate-y-0.5 hover:border-stone-300/90 hover:shadow-[0_22px_48px_-30px_rgba(15,23,42,0.44)] dark:border-stone-800/80 dark:bg-[linear-gradient(180deg,rgba(28,27,26,0.98),rgba(23,23,23,0.94))] dark:hover:border-stone-700/90 motion-academic-enter motion-academic-surface motion-academic-hover"
                >
                  <div className={`pointer-events-none absolute right-2 top-2 h-24 w-24 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-90 ${categoryGlowClass(summary.category as CategoryType)}`} />

                  <div className="relative mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500 dark:text-stone-400">
                          {hierarchyLabels.isSuiteLevel ? "Benchmark suite" : "Benchmark"}
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${categoryBadgeClass}`}>
                          {summary.category}
                        </span>
                        {summary.is_summary_score && (
                          <span className="rounded-full border border-stone-200/80 bg-stone-100/80 px-2.5 py-0.5 text-[10px] font-semibold text-stone-700 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-200">
                            Summary score
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                        {hierarchyLabels.showFamilyLabel && hierarchyLabels.familyLabel && (
                          <>
                            <span className="uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Family</span>
                            <span className="text-stone-700 dark:text-stone-200">{hierarchyLabels.familyLabel}</span>
                          </>
                        )}
                        {!hierarchyLabels.isSuiteLevel && hierarchyLabels.suiteLabel && (
                          <>
                            {hierarchyLabels.showFamilyLabel && <span className="text-stone-300 dark:text-stone-600">/</span>}
                            <span className="uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Suite</span>
                            <span className="text-stone-700 dark:text-stone-200">{hierarchyLabels.suiteLabel}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {summary.is_summary_score && (
                        <span className="hidden" />
                      )}
                      {dataType && (
                        <span className="rounded-full border border-stone-200/80 bg-white/85 px-2.5 py-0.5 text-[10px] font-medium text-stone-500 dark:border-stone-700/80 dark:bg-stone-900/85 dark:text-stone-300">
                          {dataType}
                        </span>
                      )}
                      {shortLicense && (
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${licenseBadgeClass(license)}`}>
                          {shortLicense}
                        </span>
                      )}
                      <span className="rounded-full border border-stone-200/80 bg-white/85 px-2.5 py-0.5 text-[10px] font-semibold text-stone-600 dark:border-stone-700/80 dark:bg-stone-900/85 dark:text-stone-300">
                        {summary.models_count.toLocaleString()} models · {summary.metrics_count ?? 0} metric{(summary.metrics_count ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <h3 className="relative mb-2 text-lg font-bold tracking-tight text-stone-950 transition-colors group-hover:text-stone-700 dark:text-stone-50 dark:group-hover:text-stone-200">
                    {title}
                  </h3>

                  {summary.is_aggregated && summary.aggregate_sources && summary.aggregate_sources.length > 1 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {summary.aggregate_sources.slice(0, 3).map((source) => (
                        <span key={source.evaluation_id} className="rounded-full border border-stone-200/80 bg-stone-100/70 px-2.5 py-0.5 text-[10px] font-medium text-stone-600 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-300">
                          {formatBenchmarkLabel(source.composite_benchmark_name)}
                        </span>
                      ))}
                      {summary.aggregate_sources.length > 3 && (
                        <span className="rounded-full border border-stone-200/80 bg-stone-100/70 px-2.5 py-0.5 text-[10px] font-medium text-stone-600 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-300">
                          +{summary.aggregate_sources.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {overview && (
                    <p className="mb-4 flex-1 text-sm leading-6 text-stone-600 line-clamp-3 dark:text-stone-300">
                      {overview}
                    </p>
                  )}

                  <div className="mb-4 grid gap-px overflow-hidden rounded-[1.2rem] border border-stone-200/80 bg-stone-200/80 dark:border-stone-800/80 dark:bg-stone-800/80 sm:grid-cols-2 xl:grid-cols-3">
                    {topScoreLabel && (
                      <div className="bg-white/90 px-3 py-3 dark:bg-stone-950/90">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">Top score</div>
                        <div className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">{topScoreLabel}</div>
                      </div>
                    )}
                    <div className="bg-white/90 px-3 py-3 dark:bg-stone-950/90">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">Source</div>
                      <div className="mt-1 truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                        {summary.source_data?.hf_repo ?? summary.source_data?.dataset_name ?? "Backend summary"}
                      </div>
                    </div>
                    <div className="bg-white/90 px-3 py-3 dark:bg-stone-950/90">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">Instance data</div>
                      <div className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
                        {summary.instance_data?.available ? `${summary.instance_data.url_count.toLocaleString()} URLs` : "Not linked"}
                      </div>
                    </div>
                  </div>

                  {domains.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {domains.slice(0, 3).map((domain) => (
                        <span
                          key={domain}
                          className="rounded-full border border-stone-200/80 bg-stone-100/70 px-3 py-1 text-[11px] font-medium capitalize text-stone-600 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-300"
                        >
                          {domain}
                        </span>
                      ))}
                      {domains.length > 3 && (
                        <span className="rounded-full border border-stone-200/80 bg-stone-100/70 px-3 py-1 text-[11px] font-medium text-stone-600 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-300">
                          +{domains.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}

        <ListPagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          itemLabel="evaluations"
          onPageChange={setPage}
        />
      </main>
    </div>
  )
}
