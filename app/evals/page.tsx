"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { ListPagination } from "@/components/list-pagination"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import type { EvalHierarchy } from "@/lib/backend-artifacts"
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

function normalizeDomainLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function isMeaningfulDomain(value: string): boolean {
  if (!value) return false
  if (/^[A-Za-z.]$/.test(value)) return false
  if (/^[^A-Za-z0-9]+$/.test(value)) return false
  if (/^not specified$/i.test(value)) return false
  if (/^the paper does not specify/i.test(value)) return false
  if (/does not specify particular research domains/i.test(value)) return false
  return true
}

function normalizeDomainList(value: unknown): string[] {
  const domainSet = new Set<string>()

  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item)
      }
      return
    }

    if (typeof candidate !== "string") {
      return
    }

    const normalized = normalizeDomainLabel(candidate)
    if (!normalized) {
      return
    }

    const parts = /[,;|]/.test(normalized)
      ? normalized.split(/[,;|]/)
      : [normalized]

    for (const part of parts) {
      const cleaned = normalizeDomainLabel(part)
      if (isMeaningfulDomain(cleaned)) {
        domainSet.add(cleaned)
      }
    }
  }

  visit(value)
  return Array.from(domainSet)
}

type EvalBrowserNodeKind = "family" | "suite" | "benchmark" | "split" | "subtask"

interface EvalBrowserMatrixPreviewRow {
  label: string
  value: string
}

interface EvalBrowserNode {
  id: string
  parentId: string | null
  kind: EvalBrowserNodeKind
  title: string
  familyLabel?: string
  suiteLabel?: string
  description: string
  category: CategoryType
  domains: string[]
  dataType?: string
  license?: string
  card?: BenchmarkCard
  modelsCount: number
  metricCount: number
  topScore?: number
  instanceDataLabel: string
  sourceLabel: string
  childIds: string[]
  href?: string
  scopeKeys: string[]
  matrixPreview?: {
    columnLabel: string
    rows: EvalBrowserMatrixPreviewRow[]
  }
}

function getBrowserNodeKindLabel(kind: EvalBrowserNodeKind) {
  switch (kind) {
    case "family":
      return "Benchmark family"
    case "suite":
      return "Benchmark suite"
    case "benchmark":
      return "Single benchmark"
    case "split":
      return "Split"
    case "subtask":
      return "Subtask"
    default:
      return "Node"
  }
}

function isSameHierarchyKey(a: string | undefined | null, b: string | undefined | null) {
  return normalizeBenchmarkKey(a ?? "") === normalizeBenchmarkKey(b ?? "")
}

function getSummaryScopeKey(value: string | undefined | null) {
  return getSuperGroupKey(normalizeBenchmarkKey(value ?? ""))
}

function getDominantCategory(
  summaries: BenchmarkEvalListItem[],
  fallback: CategoryType
): CategoryType {
  const counts = new Map<CategoryType, number>()

  for (const summary of summaries) {
    counts.set(summary.category, (counts.get(summary.category) ?? 0) + 1)
  }

  const winner = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
  return winner ?? fallback
}

function summarizeNodeStats(
  summaries: BenchmarkEvalListItem[],
  fallbackCategory: CategoryType
) {
  const modelsCount =
    summaries.length > 0
      ? Math.max(...summaries.map((summary) => summary.models_count))
      : 0
  const metricCount = summaries.reduce((sum, summary) => sum + (summary.metrics_count ?? 0), 0)
  const topScore = summaries.reduce(
    (highest, summary) => Math.max(highest, summary.top_score ?? Number.NEGATIVE_INFINITY),
    Number.NEGATIVE_INFINITY
  )
  const instanceDataAvailable = summaries.some((summary) => summary.instance_data?.available)
  const instanceUrlCount = summaries.reduce(
    (sum, summary) => sum + (summary.instance_data?.url_count ?? 0),
    0
  )

  return {
    category: getDominantCategory(summaries, fallbackCategory),
    modelsCount,
    metricCount,
    topScore: Number.isFinite(topScore) ? topScore : undefined,
    instanceDataLabel: instanceDataAvailable ? `${instanceUrlCount.toLocaleString()} URLs` : "Not linked",
    sourceLabel:
      summaries[0]?.source_data?.hf_repo ??
      summaries[0]?.source_data?.dataset_name ??
      "Hierarchy summary",
  }
}

function formatCompactScore(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value >= 0 && value <= 1) return `${(value * 100).toFixed(1)}%`
  return value.toFixed(value >= 100 ? 0 : 2)
}

function hasConcreteText(value: string | undefined | null) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return Boolean(normalized) && normalized !== "not specified" && normalized !== "unknown"
}

function firstConcreteListValue(value: string[] | string | undefined | null) {
  if (Array.isArray(value)) {
    return value.find((entry) => hasConcreteText(entry))
  }

  return hasConcreteText(value) ? value : undefined
}

function countConcreteListValues(value: string[] | undefined | null) {
  return (value ?? []).filter((entry) => hasConcreteText(entry)).length
}

function getNodePolicySummary(node: EvalBrowserNode) {
  const card = node.card
  if (!card) return null

  const riskCount = card.possible_risks?.length ?? 0
  const reportingGapCount =
    card.missing_fields?.filter(
      (field) => field.startsWith("methodology") || field.startsWith("purpose_and_intended_users")
    ).length ?? 0

  return {
    goal: hasConcreteText(card.purpose_and_intended_users?.goal)
      ? card.purpose_and_intended_users.goal
      : undefined,
    limitations: hasConcreteText(card.purpose_and_intended_users?.limitations)
      ? card.purpose_and_intended_users.limitations
      : undefined,
    audience: firstConcreteListValue(card.purpose_and_intended_users?.audience),
    compliance: hasConcreteText(card.ethical_and_legal_considerations?.compliance_with_regulations)
      ? card.ethical_and_legal_considerations.compliance_with_regulations
      : undefined,
    riskCount,
    reportingGapCount,
  }
}

function getNodeResearchSummary(node: EvalBrowserNode) {
  const card = node.card
  if (!card) return null

  const similarBenchmarks = Array.isArray(card.benchmark_details?.similar_benchmarks)
    ? card.benchmark_details.similar_benchmarks
    : card.benchmark_details?.similar_benchmarks
      ? [card.benchmark_details.similar_benchmarks]
      : []

  return {
    methodsCount: countConcreteListValues(card.methodology?.methods),
    metricsCount: countConcreteListValues(card.methodology?.metrics),
    similarCount: countConcreteListValues(similarBenchmarks),
    interpretation: hasConcreteText(card.methodology?.interpretation)
      ? card.methodology.interpretation
      : undefined,
    missingMethodCount: card.missing_fields?.filter((field) => field.startsWith("methodology")).length ?? 0,
  }
}

function getNodeCard(
  benchmarkCards: Record<string, BenchmarkCard>,
  ...candidates: Array<string | undefined>
) {
  for (const candidate of candidates) {
    if (!candidate) continue
    const card = lookupBenchmarkCard(benchmarkCards, candidate)
    if (card) {
      return card
    }
  }

  return undefined
}

function looksLikeLanguageSplit(value: string) {
  const normalized = normalizeBenchmarkKey(value)
  const languageLike = new Set([
    "arabic",
    "bengali",
    "burmese",
    "chinese",
    "english",
    "french",
    "german",
    "hindi",
    "indonesian",
    "italian",
    "japanese",
    "korean",
    "portuguese",
    "spanish",
    "swahili",
    "yoruba",
  ])
  return languageLike.has(normalized) || normalized.startsWith("culturally_")
}

function pickSummaryForKey(
  summaries: BenchmarkEvalListItem[],
  nodeKey: string,
  scopeKeys: string[]
) {
  const normalizedNodeKey = normalizeBenchmarkKey(nodeKey)
  const normalizedScopes = scopeKeys.map((key) => normalizeBenchmarkKey(key)).filter(Boolean)

  const candidates = summaries.filter((summary) => {
    const evaluationKey = normalizeBenchmarkKey(summary.evaluation_id)
    const leafKey = normalizeBenchmarkKey(summary.benchmark_leaf_key ?? "")
    const parentKey = normalizeBenchmarkKey(summary.composite_benchmark_key ?? "")
    const familyKey = getSummaryScopeKey(summary.benchmark_family_key ?? summary.composite_benchmark_key ?? "")

    return (
      evaluationKey === normalizedNodeKey ||
      leafKey === normalizedNodeKey ||
      parentKey === normalizedNodeKey ||
      familyKey === getSummaryScopeKey(normalizedNodeKey)
    )
  })

  return candidates
    .map((summary) => {
      let score = 0
      const evaluationKey = normalizeBenchmarkKey(summary.evaluation_id)
      const leafKey = normalizeBenchmarkKey(summary.benchmark_leaf_key ?? "")
      const parentKey = normalizeBenchmarkKey(summary.composite_benchmark_key ?? "")
      const familyKey = getSummaryScopeKey(summary.benchmark_family_key ?? summary.composite_benchmark_key ?? "")

      if (evaluationKey === normalizedNodeKey) score += 4
      if (leafKey === normalizedNodeKey) score += 5
      if (parentKey === normalizedNodeKey) score += 3
      if (familyKey === getSummaryScopeKey(normalizedNodeKey)) score += 2
      if (normalizedScopes.includes(parentKey)) score += 3
      if (normalizedScopes.includes(familyKey)) score += 2

      return { summary, score }
    })
    .sort((a, b) => b.score - a.score || b.summary.models_count - a.summary.models_count)[0]?.summary
}

function mapHierarchyCategory(value: string | undefined | null): CategoryType {
  const normalized = String(value ?? "").trim().toLowerCase()
  switch (normalized) {
    case "agentic":
      return "Agentic"
    case "reasoning":
      return "Reasoning"
    case "knowledge":
      return "Knowledge"
    case "safety":
      return "Safety"
    default:
      return "General"
  }
}

export default function EvalsPage() {
  const { mode } = useAudienceMode()
  const router = useRouter()
  const isResearchView = mode === "research"

  const [summaries, setSummaries] = useState<BenchmarkEvalListItem[]>([])
  const [benchmarkCards, setBenchmarkCards] = useState<Record<string, BenchmarkCard>>({})
  const [hierarchy, setHierarchy] = useState<EvalHierarchy | null>(null)
  const [loading, setLoading] = useState(true)
  const [totalModels, setTotalModels] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedNodeKind, setSelectedNodeKind] = useState<EvalBrowserNodeKind | null>(null)
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const pendingHistoryActionRef = useRef<"push" | "replace">("replace")

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
      const incomingDomain = params.get("domain")
      const incomingCategory = params.get("category")
      const incomingNode = params.get("node")
      setSearchQuery(incomingSearch)
      setSelectedDomain(incomingDomain)
      setSelectedCategory(incomingCategory)
      setCurrentNodeId(incomingNode)
    }

    syncSearchFromUrl()
    window.addEventListener("popstate", syncSearchFromUrl)

    return () => {
      window.removeEventListener("popstate", syncSearchFromUrl)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const params = new URLSearchParams()
    if (searchQuery.trim()) {
      params.set("search", searchQuery.trim())
    }
    if (selectedDomain) {
      params.set("domain", selectedDomain)
    }
    if (selectedCategory) {
      params.set("category", selectedCategory)
    }
    if (currentNodeId) {
      params.set("node", currentNodeId)
    }

    const nextUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname

    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (currentUrl !== nextUrl) {
      if (pendingHistoryActionRef.current === "push") {
        window.history.pushState({ source: "eval-browser" }, "", nextUrl)
      } else {
        window.history.replaceState({ source: "eval-browser" }, "", nextUrl)
      }
    }

    pendingHistoryActionRef.current = "replace"
  }, [currentNodeId, searchQuery, selectedCategory, selectedDomain])

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

  const browserTree = useMemo(() => {
    const nodes = new Map<string, EvalBrowserNode>()
    const rootIds: string[] = []

    if (!hierarchy) {
      return { nodes, rootIds }
    }

    const addNode = (node: EvalBrowserNode) => {
      nodes.set(node.id, node)
      if (node.parentId) {
        const parent = nodes.get(node.parentId)
        if (parent && !parent.childIds.includes(node.id)) {
          parent.childIds.push(node.id)
        }
      } else if (!rootIds.includes(node.id)) {
        rootIds.push(node.id)
      }
    }

    const buildDescription = (
      label: string,
      card: BenchmarkCard | undefined,
      fallback: string
    ) => {
      return (
        card?.benchmark_details?.overview ??
        card?.purpose_and_intended_users?.goal ??
        fallback.replace("{label}", label)
      )
    }

    const buildNode = ({
      id,
      parentId,
      kind,
      title,
      familyLabel,
      suiteLabel,
      category,
      domains,
      summaries,
      card,
      sourceLabel,
      childIds = [],
      href,
      scopeKeys,
      matrixPreview,
      descriptionFallback,
    }: {
      id: string
      parentId: string | null
      kind: EvalBrowserNodeKind
      title: string
      familyLabel?: string
      suiteLabel?: string
      category: CategoryType
      domains: string[]
      summaries: BenchmarkEvalListItem[]
      card?: BenchmarkCard
      sourceLabel?: string
      childIds?: string[]
      href?: string
      scopeKeys: string[]
      matrixPreview?: EvalBrowserNode["matrixPreview"]
      descriptionFallback: string
    }) => {
      const stats = summarizeNodeStats(summaries, category)
      addNode({
        id,
        parentId,
        kind,
        title,
        familyLabel,
        suiteLabel,
        description: buildDescription(title, card, descriptionFallback),
        category: stats.category,
        domains: Array.from(new Set(domains.flatMap((domain) => normalizeDomainList(domain)))),
        dataType: card?.benchmark_details?.data_type,
        license: card?.ethical_and_legal_considerations?.data_licensing,
        card,
        modelsCount: stats.modelsCount,
        metricCount: stats.metricCount,
        topScore: stats.topScore,
        instanceDataLabel: stats.instanceDataLabel,
        sourceLabel: sourceLabel ?? stats.sourceLabel,
        childIds,
        href,
        scopeKeys,
        matrixPreview,
      })
    }

    const buildSingleMetricMatrixPreview = (
      benchmarks: Array<{
        key: string
        display_name: string
        slices?: Array<{ key: string; display_name: string; metrics: Array<{ key: string; display_name: string }> }>
        metrics?: Array<{ key: string; display_name: string }>
      }>,
      scopeKeys: string[]
    ): EvalBrowserNode["matrixPreview"] | undefined => {
      if (benchmarks.length < 2) {
        return undefined
      }

      const metricLabels = new Set<string>()
      const rows: EvalBrowserMatrixPreviewRow[] = []

      for (const benchmark of benchmarks) {
        if ((benchmark.slices?.length ?? 0) > 0 || (benchmark.metrics?.length ?? 0) !== 1) {
          return undefined
        }

        const metric = benchmark.metrics?.[0]
        metricLabels.add(metric?.display_name || metric?.key || "Metric")

        const benchmarkSummary = pickSummaryForKey(summariesWithCards, benchmark.key, scopeKeys)
        rows.push({
          label: formatBenchmarkLabel(benchmark.display_name || benchmark.key),
          value: formatCompactScore(benchmarkSummary?.top_score),
        })
      }

      if (metricLabels.size !== 1) {
        return undefined
      }

      return {
        columnLabel: Array.from(metricLabels)[0],
        rows,
      }
    }

    const createSliceNodes = (
      parentId: string,
      benchmarkTitle: string,
      benchmarkSummary: BenchmarkEvalListItem | undefined,
      slices: Array<{ key: string; display_name: string; metrics: Array<{ key: string; display_name: string }> }>,
      category: CategoryType,
      scopeKeys: string[]
    ) => {
      for (const slice of slices) {
        const kind: EvalBrowserNodeKind = looksLikeLanguageSplit(slice.display_name) ? "split" : "subtask"
        const sliceId = `${parentId}::${kind}:${normalizeBenchmarkKey(slice.key)}`
        buildNode({
          id: sliceId,
          parentId,
          kind,
          title: slice.display_name,
          category,
          domains: [],
          summaries: benchmarkSummary ? [benchmarkSummary] : [],
          card: benchmarkSummary?.benchmark_card,
          sourceLabel: benchmarkTitle,
          href: benchmarkSummary ? `/evals/${benchmarkSummary.evaluation_id}` : undefined,
          scopeKeys,
          descriptionFallback: `Browse the {label} breakdown for this benchmark.`,
        })
      }
    }

    const createBenchmarkNode = ({
      parentId,
      familyLabel,
      suiteLabel,
      benchmarkKey,
      benchmarkLabel,
      category,
      domains,
      cardCandidates,
      summary,
      slices = [],
      metrics = [],
      scopeKeys,
    }: {
      parentId: string | null
      familyLabel?: string
      suiteLabel?: string
      benchmarkKey: string
      benchmarkLabel: string
      category: CategoryType
      domains: string[]
      cardCandidates: string[]
      summary?: BenchmarkEvalListItem
      slices?: Array<{ key: string; display_name: string; metrics: Array<{ key: string; display_name: string }> }>
      metrics?: Array<{ key: string; display_name: string }>
      scopeKeys: string[]
    }) => {
      const benchmarkId = `${parentId ?? "root"}::benchmark:${normalizeBenchmarkKey(benchmarkKey)}`
      const card = summary?.benchmark_card ?? getNodeCard(benchmarkCards, ...cardCandidates)
      const childSlices = slices.filter((slice) => !isSameHierarchyKey(slice.key, benchmarkKey))
      const drilldownSlices = childSlices.filter((slice) => (slice.metrics?.length ?? 0) > 1)
      const fallbackSummary =
        !summary && metrics.length > 0
          ? scopeKeys.map((scopeKey) => pickSummaryForKey(summariesWithCards, scopeKey, scopeKeys)).find(Boolean)
          : undefined
      const isParentRollupBenchmark =
        Boolean(parentId) && scopeKeys.some((scopeKey) => isSameHierarchyKey(scopeKey, benchmarkKey))

      if (isParentRollupBenchmark && parentId) {
        const parentLabel = suiteLabel || familyLabel || benchmarkLabel

        if (drilldownSlices.length > 0) {
          createSliceNodes(parentId, parentLabel, summary, drilldownSlices, category, scopeKeys)
        } else if (summary) {
          const parent = nodes.get(parentId)
          if (parent && !parent.href) {
            parent.href = `/evals/${summary.evaluation_id}`
          }
        }
        return
      }

      buildNode({
        id: benchmarkId,
        parentId,
        kind: "benchmark",
        title: benchmarkLabel,
        familyLabel,
        suiteLabel,
        category,
        domains,
        summaries: summary ? [summary] : [],
        card,
        href:
          drilldownSlices.length === 0
            ? summary
              ? `/evals/${summary.evaluation_id}`
              : fallbackSummary
                ? `/evals/${fallbackSummary.evaluation_id}`
                : undefined
            : undefined,
        scopeKeys,
        descriptionFallback: `Browse the {label} benchmark and its lower-level breakdowns.`,
      })

      if (drilldownSlices.length > 0) {
        createSliceNodes(benchmarkId, benchmarkLabel, summary, drilldownSlices, category, scopeKeys)
      }
    }

    for (const family of hierarchy.families) {
      const familyKey = normalizeBenchmarkKey(family.key)
      const familyScopeKeys = [familyKey, getSummaryScopeKey(family.key)]
      const familyLabel = formatBenchmarkLabel(family.display_name || family.key)
      const familyCard = getNodeCard(benchmarkCards, family.display_name, family.key)
      const familySummaries = summariesWithCards.filter((summary) => {
        const summaryFamily = getSummaryScopeKey(summary.benchmark_family_key ?? summary.composite_benchmark_key)
        return summaryFamily === getSummaryScopeKey(family.key)
      })

      const familyBenchmarks = family.benchmarks ?? []
      const familyComposites = family.composites ?? []
      const familyStandalone = family.standalone_benchmarks ?? []
      const familyRollupBenchmark = familyBenchmarks.find((benchmark) => isSameHierarchyKey(benchmark.key, family.key))
      const childBenchmarks = familyBenchmarks.filter((benchmark) => !isSameHierarchyKey(benchmark.key, family.key))
      const familyMatrixPreview = buildSingleMetricMatrixPreview(childBenchmarks, familyScopeKeys)
      const familyRollupSummary = pickSummaryForKey(summariesWithCards, family.key, familyScopeKeys)

      if (
        familyComposites.length === 0 &&
        familyStandalone.length === 0 &&
        familyRollupBenchmark &&
        familyMatrixPreview
      ) {
        buildNode({
          id: `family:${familyKey}`,
          parentId: null,
          kind: "family",
          title: familyLabel,
          category: mapHierarchyCategory(family.category),
          domains: normalizeDomainList(family.tags?.domains),
          summaries: familySummaries,
          card: familyCard,
          sourceLabel: familyLabel,
          href: familyRollupSummary ? `/evals/${familyRollupSummary.evaluation_id}` : undefined,
          scopeKeys: familyScopeKeys,
          matrixPreview: familyMatrixPreview,
          descriptionFallback: `Browse the {label} rollup and compare its single-metric branches in one matrix view.`,
        })

        continue
      }

      const topLevelMode: "family" | "suite" | "benchmark" =
        familyComposites.length > 1
          ? "family"
          : familyComposites.length === 1
            ? "suite"
            : familyStandalone.length > 1
              ? "family"
              : familyStandalone.length === 1
                ? "benchmark"
                : childBenchmarks.length > 1
                  ? (family.has_card ? "suite" : "family")
                  : childBenchmarks.length === 1
                    ? "benchmark"
                    : "benchmark"

      if (topLevelMode === "family") {
        const familyId = `family:${familyKey}`
        buildNode({
          id: familyId,
          parentId: null,
          kind: "family",
          title: familyLabel,
          category: mapHierarchyCategory(family.category),
          domains: normalizeDomainList(family.tags?.domains),
          summaries: familySummaries,
          card: familyCard,
          sourceLabel: familyLabel,
          scopeKeys: familyScopeKeys,
          descriptionFallback: `Explore the {label} family and drill into its benchmark branches.`,
        })

        for (const composite of familyComposites) {
          const suiteId = `${familyId}::suite:${normalizeBenchmarkKey(composite.key)}`
          const suiteLabel = formatBenchmarkLabel(composite.display_name || composite.key)
          const suiteScopeKeys = [...familyScopeKeys, normalizeBenchmarkKey(composite.key)]
          const suiteSummaries = summariesWithCards.filter(
            (summary) =>
              getSummaryScopeKey(summary.benchmark_family_key ?? summary.composite_benchmark_key) === getSummaryScopeKey(composite.key)
          )
          const suiteCard = getNodeCard(benchmarkCards, composite.display_name, composite.key)
          const rollupBenchmark = (composite.benchmarks ?? []).find((benchmark) => isSameHierarchyKey(benchmark.key, composite.key))
          const suiteBenchmarks = (composite.benchmarks ?? []).filter((benchmark) => !isSameHierarchyKey(benchmark.key, composite.key))
          const suiteMatrixPreview = buildSingleMetricMatrixPreview(suiteBenchmarks, suiteScopeKeys)
          const rollupSummary = pickSummaryForKey(summariesWithCards, composite.key, suiteScopeKeys)
          const hasSuiteRollup = Boolean(rollupBenchmark && rollupSummary)
          const syntheticMatrixEvalId = suiteMatrixPreview && !hasSuiteRollup ? `matrix__${composite.key}` : undefined

          buildNode({
            id: suiteId,
            parentId: familyId,
            kind: "suite",
            title: suiteLabel,
            familyLabel,
            category: mapHierarchyCategory(composite.category),
            domains: normalizeDomainList(composite.tags?.domains),
            summaries: suiteSummaries,
            card: suiteCard,
            sourceLabel: suiteLabel,
            href: suiteMatrixPreview
              ? hasSuiteRollup
                ? `/evals/${rollupSummary.evaluation_id}`
                : syntheticMatrixEvalId
                  ? `/evals/${syntheticMatrixEvalId}`
                  : undefined
              : undefined,
            scopeKeys: suiteScopeKeys,
            matrixPreview: suiteMatrixPreview,
            descriptionFallback: `Browse the {label} suite and then open its benchmark children.`,
          })

          if (!suiteMatrixPreview) {
            for (const benchmark of suiteBenchmarks) {
              const benchmarkSummary = pickSummaryForKey(summariesWithCards, benchmark.key, suiteScopeKeys)
              createBenchmarkNode({
                parentId: suiteId,
                familyLabel,
                suiteLabel,
                benchmarkKey: benchmark.key,
                benchmarkLabel: formatBenchmarkLabel(benchmark.display_name || benchmark.key),
                category: mapHierarchyCategory(composite.category),
                domains: normalizeDomainList(benchmark.tags?.domains),
                cardCandidates: [benchmark.display_name, benchmark.key],
                summary: benchmarkSummary,
                slices: benchmark.slices ?? [],
                metrics: benchmark.metrics ?? [],
                scopeKeys: suiteScopeKeys,
              })
            }

            if (rollupBenchmark) {
              createSliceNodes(
                suiteId,
                suiteLabel,
                rollupSummary,
                (rollupBenchmark.slices ?? []).map((slice) => ({
                  key: slice.key,
                  display_name: slice.display_name,
                  metrics: slice.metrics ?? [],
                })),
                mapHierarchyCategory(composite.category),
                suiteScopeKeys
              )
            }
          }

          const suiteNode = nodes.get(suiteId)
          if (suiteNode && suiteNode.childIds.length === 0) {
            if (hasSuiteRollup) {
              suiteNode.href = `/evals/${rollupSummary.evaluation_id}`
            } else if (syntheticMatrixEvalId) {
              suiteNode.href = `/evals/${syntheticMatrixEvalId}`
            }
          }
        }

        for (const standalone of familyStandalone) {
          const benchmarkSummary = pickSummaryForKey(summariesWithCards, standalone.key, familyScopeKeys)
          createBenchmarkNode({
            parentId: familyId,
            familyLabel,
            benchmarkKey: standalone.key,
            benchmarkLabel: formatBenchmarkLabel(standalone.display_name || standalone.key),
            category: mapHierarchyCategory(family.category),
            domains: normalizeDomainList(standalone.tags?.domains),
            cardCandidates: [standalone.display_name, standalone.key],
            summary: benchmarkSummary,
            slices: standalone.slices ?? [],
            metrics: standalone.metrics ?? [],
            scopeKeys: familyScopeKeys,
          })
        }

        for (const benchmark of childBenchmarks) {
          const benchmarkSummary = pickSummaryForKey(summariesWithCards, benchmark.key, familyScopeKeys)
          createBenchmarkNode({
            parentId: familyId,
            familyLabel,
            benchmarkKey: benchmark.key,
            benchmarkLabel: formatBenchmarkLabel(benchmark.display_name || benchmark.key),
            category: mapHierarchyCategory(family.category),
            domains: normalizeDomainList(benchmark.tags?.domains),
            cardCandidates: [benchmark.display_name, benchmark.key],
            summary: benchmarkSummary,
            slices: benchmark.slices ?? [],
            metrics: benchmark.metrics ?? [],
            scopeKeys: familyScopeKeys,
          })
        }

        continue
      }

      if (topLevelMode === "suite") {
        const suiteKey = familyComposites[0]?.key ?? family.key
        const suiteLabel = formatBenchmarkLabel(familyComposites[0]?.display_name || family.display_name || family.key)
        const suiteScopeKeys = [normalizeBenchmarkKey(suiteKey), getSummaryScopeKey(suiteKey)]
        const suiteBenchmarks = familyComposites[0]?.benchmarks ?? childBenchmarks
        const rollupBenchmark = suiteBenchmarks.find((benchmark) => isSameHierarchyKey(benchmark.key, suiteKey)) ?? familyRollupBenchmark
        const visibleBenchmarks = suiteBenchmarks.filter((benchmark) => !isSameHierarchyKey(benchmark.key, suiteKey))
        const suiteMatrixPreview = buildSingleMetricMatrixPreview(visibleBenchmarks, suiteScopeKeys)
        const rollupSummary = pickSummaryForKey(summariesWithCards, suiteKey, suiteScopeKeys)
        const hasSuiteRollup = Boolean(rollupBenchmark && rollupSummary)
        const syntheticMatrixEvalId = suiteMatrixPreview && !hasSuiteRollup ? `matrix__${suiteKey}` : undefined
        const suiteSummaries = summariesWithCards.filter((summary) => {
          const familyScope = getSummaryScopeKey(summary.benchmark_family_key ?? summary.composite_benchmark_key)
          return familyScope === getSummaryScopeKey(suiteKey)
        })

        const suiteId = `suite:${normalizeBenchmarkKey(suiteKey)}`
        buildNode({
          id: suiteId,
          parentId: null,
          kind: "suite",
          title: suiteLabel,
          familyLabel: familyComposites[0] ? familyLabel : undefined,
          category: mapHierarchyCategory(familyComposites[0]?.category ?? family.category),
          domains: normalizeDomainList(familyComposites[0]?.tags?.domains ?? family.tags?.domains),
          summaries: suiteSummaries,
          card: getNodeCard(
            benchmarkCards,
            familyComposites[0]?.display_name,
            familyComposites[0]?.key,
            family.display_name,
            family.key
          ),
          sourceLabel: suiteLabel,
          href: suiteMatrixPreview
            ? hasSuiteRollup
              ? `/evals/${rollupSummary.evaluation_id}`
              : syntheticMatrixEvalId
                ? `/evals/${syntheticMatrixEvalId}`
                : undefined
            : undefined,
          scopeKeys: suiteScopeKeys,
          matrixPreview: suiteMatrixPreview,
          descriptionFallback: `Browse the {label} suite and then open its benchmark children.`,
        })

        if (!suiteMatrixPreview) {
          for (const benchmark of visibleBenchmarks) {
            const benchmarkSummary = pickSummaryForKey(summariesWithCards, benchmark.key, suiteScopeKeys)
            createBenchmarkNode({
              parentId: suiteId,
              familyLabel: familyComposites[0] ? familyLabel : undefined,
              suiteLabel,
              benchmarkKey: benchmark.key,
              benchmarkLabel: formatBenchmarkLabel(benchmark.display_name || benchmark.key),
              category: mapHierarchyCategory(familyComposites[0]?.category ?? family.category),
              domains: normalizeDomainList(benchmark.tags?.domains),
              cardCandidates: [benchmark.display_name, benchmark.key],
              summary: benchmarkSummary,
              slices: benchmark.slices ?? [],
              metrics: benchmark.metrics ?? [],
              scopeKeys: suiteScopeKeys,
            })
          }

          if (rollupBenchmark) {
            createSliceNodes(
              suiteId,
              suiteLabel,
              rollupSummary,
              (rollupBenchmark.slices ?? []).map((slice) => ({
                key: slice.key,
                display_name: slice.display_name,
                metrics: slice.metrics ?? [],
              })),
              nodes.get(suiteId)?.category ?? "General",
              suiteScopeKeys
            )
          }
        }

        const suiteNode = nodes.get(suiteId)
        if (suiteNode && suiteNode.childIds.length === 0) {
          if (hasSuiteRollup) {
            suiteNode.href = `/evals/${rollupSummary.evaluation_id}`
          } else if (syntheticMatrixEvalId) {
            suiteNode.href = `/evals/${syntheticMatrixEvalId}`
          }
        }

        continue
      }

      const benchmarkKey =
        familyStandalone[0]?.key ??
        childBenchmarks[0]?.key ??
        family.key
      const benchmarkLabel =
        formatBenchmarkLabel(
          familyStandalone[0]?.display_name ??
          childBenchmarks[0]?.display_name ??
          family.display_name ??
          family.key
        )
      const benchmarkSummary = pickSummaryForKey(summariesWithCards, benchmarkKey, familyScopeKeys)
      const benchmarkSource =
        familyStandalone[0] ??
        childBenchmarks[0] ??
        familyRollupBenchmark

      createBenchmarkNode({
        parentId: null,
        familyLabel: familyStandalone[0] || childBenchmarks[0] ? familyLabel : undefined,
        benchmarkKey,
        benchmarkLabel,
        category: mapHierarchyCategory(family.category),
        domains: normalizeDomainList(benchmarkSource?.tags?.domains ?? family.tags?.domains),
        cardCandidates: [
          benchmarkSource?.display_name,
          benchmarkSource?.key,
          family.display_name,
          family.key,
        ].filter(Boolean) as string[],
        summary: benchmarkSummary,
        slices:
          benchmarkSource?.slices?.length
            ? benchmarkSource.slices.map((slice) => ({
                key: slice.key,
                display_name: slice.display_name,
                metrics: slice.metrics ?? [],
              }))
            : (family.slices ?? []).map((slice) => ({
                key: slice.key,
                display_name: slice.display_name,
                metrics: slice.metrics ?? [],
              })),
        metrics: benchmarkSource?.metrics ?? family.metrics ?? [],
        scopeKeys: familyScopeKeys,
      })
    }

    return { nodes, rootIds }
  }, [benchmarkCards, hierarchy, summariesWithCards])

  const currentNode = currentNodeId ? browserTree.nodes.get(currentNodeId) ?? null : null

  const currentLevelNodes = useMemo(() => {
    const ids = currentNode ? currentNode.childIds : browserTree.rootIds
    return ids
      .map((id) => browserTree.nodes.get(id))
      .filter((node): node is EvalBrowserNode => Boolean(node))
  }, [browserTree, currentNode])

  const breadcrumbs = useMemo(() => {
    if (!currentNode) return []

    const items: EvalBrowserNode[] = []
    let cursor: EvalBrowserNode | null = currentNode

    while (cursor) {
      items.unshift(cursor)
      cursor = cursor.parentId ? browserTree.nodes.get(cursor.parentId) ?? null : null
    }

    return items
  }, [browserTree, currentNode])

  const query = searchQuery.trim().toLowerCase()

  const nodesMatchingSearch = useMemo(() => {
    if (!query) {
      return currentLevelNodes
    }

    return currentLevelNodes.filter((node) => {
      const haystacks = [
        node.title,
        node.familyLabel,
        node.suiteLabel,
        node.description,
        node.sourceLabel,
        ...node.domains,
      ]

      return haystacks.some((value) => value?.toLowerCase().includes(query))
    })
  }, [currentLevelNodes, query])

  const allDomains = useMemo(() => {
    const domainSet = new Set<string>()
    let domainCandidates = nodesMatchingSearch

    if (selectedNodeKind) {
      domainCandidates = domainCandidates.filter((node) => node.kind === selectedNodeKind)
    }

    if (selectedCategory) {
      domainCandidates = domainCandidates.filter((node) => node.category === selectedCategory)
    }

    for (const node of domainCandidates) {
      for (const domain of node.domains) {
        domainSet.add(domain)
      }
    }

    return Array.from(domainSet).sort((a, b) => a.localeCompare(b))
  }, [nodesMatchingSearch, selectedCategory])

  const allCategories = useMemo(() => {
    const categorySet = new Set<string>()
    let categoryCandidates = nodesMatchingSearch

    if (selectedNodeKind) {
      categoryCandidates = categoryCandidates.filter((node) => node.kind === selectedNodeKind)
    }

    if (selectedDomain) {
      categoryCandidates = categoryCandidates.filter((node) =>
        node.domains.some((domain) => domain.toLowerCase() === selectedDomain.toLowerCase())
      )
    }

    for (const node of categoryCandidates) {
      categorySet.add(node.category)
    }

    return Array.from(categorySet).sort((a, b) => a.localeCompare(b))
  }, [nodesMatchingSearch, selectedDomain])

  const filtered = useMemo(() => {
    let list = [...nodesMatchingSearch]

    if (selectedNodeKind) {
      list = list.filter((node) => node.kind === selectedNodeKind)
    }

    if (selectedDomain) {
      list = list.filter((node) =>
        node.domains.some(
          (domain) => domain.toLowerCase() === selectedDomain.toLowerCase()
        )
      )
    }

    if (selectedCategory) {
      list = list.filter((node) => node.category === selectedCategory)
    }

    list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }))
    return list
  }, [nodesMatchingSearch, selectedCategory, selectedDomain, selectedNodeKind])

  useEffect(() => {
    if (selectedDomain && !allDomains.includes(selectedDomain)) {
      setSelectedDomain(null)
    }
  }, [allDomains, selectedDomain])

  useEffect(() => {
    if (selectedCategory && !allCategories.includes(selectedCategory)) {
      setSelectedCategory(null)
    }
  }, [allCategories, selectedCategory])

  useEffect(() => {
    setPage(1)
  }, [currentNodeId, searchQuery, selectedCategory, selectedDomain, selectedNodeKind])

  const pagedNodes = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  )

  const currentLevelKinds = Array.from(new Set(currentLevelNodes.map((node) => node.kind)))
  const activeFilterCount = [searchQuery.trim(), selectedDomain, selectedCategory, selectedNodeKind].filter(Boolean).length
  const currentLevelLabel =
    currentNodeId === null
      ? "Rollout entry level"
      : currentLevelKinds.length === 1
        ? getBrowserNodeKindLabel(currentLevelKinds[0])
        : "Mixed rollout level"
  const currentLevelDescription = currentNode
    ? `Showing the next level under ${currentNode.title}.`
    : "Showing the highest rollout node for each benchmark branch before you drill into suites, benchmarks, splits, subtasks, and metrics."

  useEffect(() => {
    if (selectedNodeKind && !currentLevelKinds.includes(selectedNodeKind)) {
      setSelectedNodeKind(null)
    }
  }, [currentLevelKinds, selectedNodeKind])

  useEffect(() => {
    if (activeFilterCount > 0) {
      setFiltersOpen(true)
    }
  }, [activeFilterCount])

  const handleNodeOpen = useCallback(
    (node: EvalBrowserNode) => {
      if (node.childIds.length > 0) {
        pendingHistoryActionRef.current = "push"
        setCurrentNodeId(node.id)
        return
      }

      if (node.href) {
        const params = new URLSearchParams()
        if (typeof window !== "undefined") {
          const currentPath = `${window.location.pathname}${window.location.search}`
          params.set("from", currentPath)
        }
        const href = params.toString() ? `${node.href}?${params.toString()}` : node.href
        router.push(href)
      }
    },
    [router]
  )

  const handleLevelBack = useCallback(() => {
    if (!currentNode) {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back()
        return
      }

      router.push("/")
      return
    }

    pendingHistoryActionRef.current = "replace"
    setCurrentNodeId(currentNode.parentId)
  }, [currentNode, router])

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
      {currentNode ? (
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
            <div className="flex items-center gap-3 sm:hidden">
              <Button variant="ghost" size="sm" onClick={handleLevelBack} className="shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 text-center">
                <h2 className="text-base font-medium tracking-tight text-foreground/90">
                  Browse Evaluations
                </h2>
              </div>
            </div>

            <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4">
              <Button variant="ghost" onClick={handleLevelBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="text-center">
                <h2 className="text-xl font-medium tracking-tight text-foreground/90 md:text-2xl">
                  Browse Evaluations
                </h2>
              </div>
              <div />
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:mt-4">
              {mode === "research"
                ? "Single-benchmark evaluations with benchmark context first; open the detail page for methodology, provenance, and rankings."
                : "Single-benchmark evaluations with benchmark context first; open the detail page for source, accountability, and reporting detail."}
            </p>
          </div>
        </div>
      ) : (
        <PageHeader
          eyebrow="Evaluations"
          title="Browse Evaluations"
          description={
            mode === "research"
              ? "Single-benchmark evaluations. Open one for methodology, provenance, and rankings."
              : "Single-benchmark evaluations. Open one for source, accountability, and reporting detail."
          }
        />
      )}

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
                    setSelectedNodeKind(null)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 dark:border-stone-700/80 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <X className="h-3.5 w-3.5" />
                  Reset filters
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-stone-200/80 pt-4 dark:border-stone-800/80">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                    {currentLevelLabel}
                  </div>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                    {currentLevelDescription}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentNodeId !== null) {
                        pendingHistoryActionRef.current = "push"
                      }
                      setCurrentNodeId(null)
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      currentNodeId === null
                        ? "border-stone-950 bg-stone-950 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950"
                        : "border-stone-200/80 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700/80 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                    )}
                  >
                    All branches
                  </button>
                  {breadcrumbs.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        if (currentNodeId !== node.id) {
                          pendingHistoryActionRef.current = "push"
                        }
                        setCurrentNodeId(node.id)
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        currentNodeId === node.id
                          ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                          : "border-stone-200/80 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700/80 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                      )}
                    >
                      {node.title}
                    </button>
                  ))}
                </div>
              </div>

              {hierarchy && (
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full border border-stone-200/80 bg-stone-50/80 px-3 py-1.5 font-medium text-stone-700 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-200">
                    {hierarchy.stats.family_count} families
                  </span>
                  <span className="rounded-full border border-stone-200/80 bg-stone-50/80 px-3 py-1.5 font-medium text-stone-700 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-200">
                    {hierarchy.stats.composite_count} suites
                  </span>
                  <span className="rounded-full border border-stone-200/80 bg-stone-50/80 px-3 py-1.5 font-medium text-stone-700 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-200">
                    {hierarchy.stats.single_benchmark_count} benchmarks
                  </span>
                  <span className="rounded-full border border-stone-200/80 bg-stone-50/80 px-3 py-1.5 font-medium text-stone-700 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-200">
                    {hierarchy.stats.slice_count} slices
                  </span>
                </div>
              )}
            </div>
          </div>

          <Collapsible
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            className="mt-4 rounded-[1.35rem] border border-stone-200/80 bg-white/70 dark:border-stone-800/80 dark:bg-stone-950/60"
          >
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Refine this list
                  </div>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                    {activeFilterCount > 0
                      ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active`
                      : "Open filters only when you need to narrow by node type, domain tags, or category."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <span className="rounded-full border border-stone-200/80 bg-stone-100/80 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:border-stone-700/80 dark:bg-stone-900/80 dark:text-stone-200">
                      {activeFilterCount} active
                    </span>
                  )}
                  <ChevronDown className={cn("h-4 w-4 text-stone-500 transition-transform dark:text-stone-400", filtersOpen && "rotate-180")} />
                </div>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="border-t border-stone-200/80 px-4 pb-4 pt-4 dark:border-stone-800/80">
                {currentLevelKinds.length > 1 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                      Node type
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedNodeKind(null)}
                        className={cn(
                          "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          selectedNodeKind === null
                            ? "border-stone-950 bg-stone-950 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950"
                            : "border-stone-200/80 bg-stone-50/80 text-stone-600 hover:bg-stone-100 dark:border-stone-700/80 dark:bg-stone-900/70 dark:text-stone-300 dark:hover:bg-stone-800"
                        )}
                      >
                        All
                      </button>
                      {currentLevelKinds.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => setSelectedNodeKind(selectedNodeKind === kind ? null : kind)}
                          className={cn(
                            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            selectedNodeKind === kind
                              ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                              : "border-stone-200/80 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700/80 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                          )}
                        >
                          {getBrowserNodeKindLabel(kind)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {allDomains.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                      Domain tags
                    </div>
                    <div className="flex max-h-40 flex-wrap items-center gap-1.5 overflow-y-auto pr-1">
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
                            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
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
              </div>
            </CollapsibleContent>
          </Collapsible>
        </section>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No nodes found for this level.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {pagedNodes.map((node) => {
              const shortLicense = shortenLicense(node.license ?? "")
              const topScoreLabel = formatCompactScore(node.topScore)
              const categoryBadgeClass = getCategoryColor(node.category)
              const isNavigable = node.childIds.length > 0 || Boolean(node.href)
              const actionLabel = node.childIds.length > 0 ? "Open level" : node.matrixPreview ? "View rollup" : "View benchmark"
              const kindLabel = getBrowserNodeKindLabel(node.kind)
              const policySummary = getNodePolicySummary(node)
              const researchSummary = getNodeResearchSummary(node)

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => handleNodeOpen(node)}
                  disabled={!isNavigable}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,248,245,0.92))] p-5 text-left shadow-[0_14px_36px_-28px_rgba(15,23,42,0.38)] transition-all dark:border-stone-800/80 dark:bg-[linear-gradient(180deg,rgba(28,27,26,0.98),rgba(23,23,23,0.94))] motion-academic-enter motion-academic-surface motion-academic-hover",
                    isNavigable
                      ? "hover:-translate-y-0.5 hover:border-stone-300/90 hover:shadow-[0_22px_48px_-30px_rgba(15,23,42,0.44)] dark:hover:border-stone-700/90"
                      : "cursor-default"
                  )}
                >
                  <div className={`pointer-events-none absolute right-2 top-2 h-24 w-24 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-90 ${categoryGlowClass(node.category)}`} />

                  <div className="relative mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500 dark:text-stone-400">
                          {kindLabel}
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${categoryBadgeClass}`}>
                          {node.category}
                        </span>
                        {node.childIds.length > 0 && (
                          <span className="rounded-full border border-stone-200/80 bg-stone-100/80 px-2.5 py-0.5 text-[10px] font-semibold text-stone-700 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-200">
                            {node.childIds.length} child{node.childIds.length === 1 ? "" : "ren"}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                        {node.familyLabel && (
                          <>
                            <span className="uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Family</span>
                            <span className="text-stone-700 dark:text-stone-200">{node.familyLabel}</span>
                          </>
                        )}
                        {node.suiteLabel && (
                          <>
                            {node.familyLabel && <span className="text-stone-300 dark:text-stone-600">/</span>}
                            <span className="uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Suite</span>
                            <span className="text-stone-700 dark:text-stone-200">{node.suiteLabel}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {node.dataType && (
                        <span className="rounded-full border border-stone-200/80 bg-white/85 px-2.5 py-0.5 text-[10px] font-medium text-stone-500 dark:border-stone-700/80 dark:bg-stone-900/85 dark:text-stone-300">
                          {node.dataType}
                        </span>
                      )}
                      {shortLicense && (
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${licenseBadgeClass(node.license ?? "")}`}>
                          {shortLicense}
                        </span>
                      )}
                      <span className="rounded-full border border-stone-200/80 bg-white/85 px-2.5 py-0.5 text-[10px] font-semibold text-stone-600 dark:border-stone-700/80 dark:bg-stone-900/85 dark:text-stone-300">
                        {node.modelsCount.toLocaleString()} models · {node.metricCount} metric{node.metricCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <h3 className="relative mb-2 text-lg font-bold tracking-tight text-stone-950 transition-colors group-hover:text-stone-700 dark:text-stone-50 dark:group-hover:text-stone-200">
                    {node.title}
                  </h3>

                  {node.description && (
                    <p className="mb-4 flex-1 text-sm leading-6 text-stone-600 line-clamp-3 dark:text-stone-300">
                      {node.description}
                    </p>
                  )}

                  {!isResearchView && policySummary && (
                    <div className="mb-4 space-y-2 rounded-[1.1rem] border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-200">
                        Policy notes
                      </div>
                      {policySummary.goal && (
                        <p className="text-sm leading-6 text-stone-700 dark:text-stone-200">
                          <span className="font-semibold">What it measures: </span>
                          {policySummary.goal}
                        </p>
                      )}
                      {policySummary.limitations && (
                        <p className="text-sm leading-6 text-stone-700 dark:text-stone-200">
                          <span className="font-semibold">Main caveat: </span>
                          {policySummary.limitations}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-[11px] text-stone-700 dark:text-stone-200">
                        {policySummary.audience && (
                          <span className="rounded-full border border-amber-200/80 bg-white/80 px-2.5 py-1 dark:border-amber-900/50 dark:bg-stone-950/70">
                            Intended for {policySummary.audience}
                          </span>
                        )}
                        {policySummary.compliance && (
                          <span className="rounded-full border border-amber-200/80 bg-white/80 px-2.5 py-1 dark:border-amber-900/50 dark:bg-stone-950/70">
                            Regulation note documented
                          </span>
                        )}
                        {policySummary.riskCount > 0 && (
                          <span className="rounded-full border border-amber-200/80 bg-white/80 px-2.5 py-1 dark:border-amber-900/50 dark:bg-stone-950/70">
                            {policySummary.riskCount} risk note{policySummary.riskCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {policySummary.reportingGapCount > 0 && (
                          <span className="rounded-full border border-rose-200/80 bg-white/80 px-2.5 py-1 text-rose-700 dark:border-rose-900/50 dark:bg-stone-950/70 dark:text-rose-200">
                            {policySummary.reportingGapCount} missing reporting field{policySummary.reportingGapCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {isResearchView && researchSummary && (
                    <div className="mb-4 space-y-2 rounded-[1.1rem] border border-sky-200/80 bg-sky-50/70 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-800 dark:text-sky-200">
                        Research notes
                      </div>
                      {researchSummary.interpretation && (
                        <p className="text-sm leading-6 text-stone-700 dark:text-stone-200">
                          <span className="font-semibold">Score interpretation: </span>
                          {researchSummary.interpretation}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-[11px] text-stone-700 dark:text-stone-200">
                        {researchSummary.methodsCount > 0 && (
                          <span className="rounded-full border border-sky-200/80 bg-white/80 px-2.5 py-1 dark:border-sky-900/50 dark:bg-stone-950/70">
                            {researchSummary.methodsCount} method note{researchSummary.methodsCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {researchSummary.metricsCount > 0 && (
                          <span className="rounded-full border border-sky-200/80 bg-white/80 px-2.5 py-1 dark:border-sky-900/50 dark:bg-stone-950/70">
                            {researchSummary.metricsCount} documented metric{researchSummary.metricsCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {researchSummary.similarCount > 0 && (
                          <span className="rounded-full border border-sky-200/80 bg-white/80 px-2.5 py-1 dark:border-sky-900/50 dark:bg-stone-950/70">
                            {researchSummary.similarCount} related benchmark{researchSummary.similarCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {researchSummary.missingMethodCount > 0 && (
                          <span className="rounded-full border border-rose-200/80 bg-white/80 px-2.5 py-1 text-rose-700 dark:border-rose-900/50 dark:bg-stone-950/70 dark:text-rose-200">
                            {researchSummary.missingMethodCount} missing method field{researchSummary.missingMethodCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {node.matrixPreview && (
                    <div className="mb-4 overflow-hidden rounded-[1.2rem] border border-stone-200/80 bg-stone-50/85 dark:border-stone-800/80 dark:bg-stone-900/85">
                      <div className="space-y-2 bg-white/92 px-3 py-3 dark:bg-stone-950/92">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
                          Rollup preview
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-stone-200/80 bg-stone-100/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-300">
                            {node.matrixPreview.rows.length} slice{node.matrixPreview.rows.length === 1 ? "" : "s"}
                          </span>
                          <span className="rounded-full border border-stone-200/80 bg-stone-100/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-300">
                            Metric: {node.matrixPreview.columnLabel}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 dark:text-stone-300">
                          Open rollup to view slice-level scores in the matrix leaderboard.
                        </p>
                      </div>
                    </div>
                  )}

                  <dl className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {topScoreLabel !== "—" && (
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">Top score</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-stone-900 dark:text-stone-100">{topScoreLabel}</dd>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">Source</dt>
                      <dd className="mt-0.5 truncate font-semibold text-stone-900 dark:text-stone-100">{node.sourceLabel}</dd>
                    </div>
                    {node.instanceDataLabel && node.instanceDataLabel !== "Not linked" && (
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">Instances</dt>
                        <dd className="mt-0.5 font-semibold text-stone-900 dark:text-stone-100">{node.instanceDataLabel}</dd>
                      </div>
                    )}
                  </dl>

                  {node.domains.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {node.domains.slice(0, 3).map((domain) => (
                        <span
                          key={domain}
                          className="rounded-full border border-stone-200/80 bg-stone-100/70 px-3 py-1 text-[11px] font-medium text-stone-600 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-300"
                        >
                          {domain}
                        </span>
                      ))}
                      {node.domains.length > 3 && (
                        <span className="rounded-full border border-stone-200/80 bg-stone-100/70 px-3 py-1 text-[11px] font-medium text-stone-600 dark:border-stone-700/80 dark:bg-stone-800/70 dark:text-stone-300">
                          +{node.domains.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-4 inline-flex items-center text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                    {actionLabel}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <ListPagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          itemLabel="nodes"
          onPageChange={setPage}
        />
      </main>
    </div>
  )
}
