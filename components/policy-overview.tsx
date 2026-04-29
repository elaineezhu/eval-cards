"use client"

import { useMemo, useState } from "react"
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, FileText, Globe, Layers, ScrollText, Tag, Users } from "lucide-react"
import { SignalTooltip } from "@/components/signals/signal-tooltip"
import type { BenchmarkEvalSummary } from "@/lib/eval-processing"
import { getKnownIssues } from "@/lib/known-issues"
import { KnownIssuesPanel } from "@/components/known-issues-panel"

interface PolicyOverviewProps {
  summary: BenchmarkEvalSummary
}

const SUMMARY_PREVIEW_CHARS = 280

function classifyResource(url: string): { kind: "paper" | "dataset" | "leaderboard" | "site"; label: string } {
  const lower = url.toLowerCase()
  if (lower.includes("arxiv.org") || lower.endsWith(".pdf") || lower.includes("/papers/")) {
    return { kind: "paper", label: "Paper" }
  }
  if (lower.includes("huggingface.co/datasets") || lower.includes("/dataset")) {
    return { kind: "dataset", label: "Dataset" }
  }
  if (lower.includes("leaderboard")) {
    return { kind: "leaderboard", label: "Leaderboard" }
  }
  return { kind: "site", label: "Source" }
}

function shortHost(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
}

/**
 * Plain-language summary surface shown at the top of the benchmark page in
 * policy mode. Designed to answer three questions a non-technical reader has:
 * what does this measure, who built it, and where does it come from?
 *
 * Technical detail (variants, metric specifications, score scales) lives in
 * the existing overview card below this and is collapsed by default.
 */
function normalizeId(value: string | undefined | null): string {
  if (!value) return ""
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s_\-/]+/g, "")
}

export function PolicyOverview({ summary }: PolicyOverviewProps) {
  const card = summary.benchmark_card

  // Defensive check: pipelines older than the "ancestor card leak" fix
  // sometimes attach the parent suite's card to a leaf benchmark (e.g.
  // helm_classic's card embedded under XSUM). Detect when the card's own
  // name is clearly not this benchmark and ignore its narrative text — the
  // synthesized fallback below produces something accurate instead.
  const cardName = card?.benchmark_details?.name
  const cardNameNorm = normalizeId(cardName)
  const evalIdentifiers = [
    summary.evaluation_name,
    summary.benchmark_leaf_key,
    summary.composite_benchmark_key,
    summary.composite_benchmark_name,
    summary.canonical_display_name,
    summary.evaluation_id,
  ].map(normalizeId)
  // Treat the card as belonging to this eval when its name fuzzily appears in
  // any of the eval's identifiers (or vice versa). Otherwise the card is from
  // a different (typically ancestor) benchmark.
  const cardMatchesEval =
    !cardName ||
    evalIdentifiers.some(
      (id) =>
        id.length > 0 &&
        cardNameNorm.length > 0 &&
        (id.includes(cardNameNorm) || cardNameNorm.includes(id)),
    )

  const overview = cardMatchesEval ? card?.benchmark_details?.overview?.trim() || "" : ""
  const goal = cardMatchesEval ? card?.purpose_and_intended_users?.goal?.trim() || "" : ""

  // Detect "parent" benchmark pages — either an aggregated composite or a
  // multi-metric matrix where each column is a subtask. In both cases the
  // per-evaluation `metric_config.evaluation_description` belongs to whichever
  // component was processed first (e.g. just the "airline" subset of Tau
  // Bench 2) and would mislead a policy reader. Synthesize parent framing
  // instead and surface the subtasks separately.
  const isAggregated = summary.is_aggregated === true
  const aggregateNames = (summary.aggregate_sources ?? [])
    .map((s) => s.composite_benchmark_name)
    .filter((s): s is string => typeof s === "string" && s.length > 0)

  const subtaskLabels = useMemo(() => {
    const seen = new Set<string>()
    const labels: string[] = []
    const add = (raw: string | undefined | null) => {
      if (!raw) return
      const trimmed = raw.trim()
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      labels.push(trimmed)
    }
    for (const subtask of summary.subtasks ?? []) {
      add(subtask.display_name || subtask.subtask_name)
    }
    for (const metric of summary.leaderboard_metrics ?? []) {
      if (metric.scope === "subtask") {
        add(metric.subtask_name || metric.display_name)
      }
    }
    for (const name of aggregateNames) add(name)
    return labels
  }, [summary.subtasks, summary.leaderboard_metrics, aggregateNames])

  const isMatrix = (summary.leaderboard_metrics?.length ?? 0) > 1
  const isParentPage = isAggregated || (isMatrix && subtaskLabels.length > 1)
  const useComponentDescription = !isParentPage

  const parentFallback = isParentPage && subtaskLabels.length > 1
    ? `${summary.evaluation_name} reports results across ${subtaskLabels.length} ${
        isAggregated ? "component benchmarks" : "subtasks"
      }. Each is evaluated separately; the score shown is the ${
        isAggregated ? "average" : "per-subtask result"
      }.`
    : null

  const summaryText =
    overview ||
    goal ||
    parentFallback ||
    (useComponentDescription ? summary.metric_config.evaluation_description : summary.evaluation_name)

  const [expanded, setExpanded] = useState(false)
  const [subtasksOpen, setSubtasksOpen] = useState(false)
  const isLong = summaryText.length > SUMMARY_PREVIEW_CHARS
  const visibleText = expanded || !isLong
    ? summaryText
    : summaryText.slice(0, SUMMARY_PREVIEW_CHARS).replace(/\s+\S*$/, "") + "…"

  const domains = useMemo(() => {
    const fromTags = summary.tags?.domains ?? []
    const fromCard = cardMatchesEval ? card?.benchmark_details?.domains ?? [] : []
    return Array.from(new Set([...fromTags, ...fromCard].map((d) => d.trim()).filter(Boolean))).slice(0, 6)
  }, [summary.tags?.domains, card?.benchmark_details?.domains, cardMatchesEval])

  const languages = useMemo(() => {
    const fromTags = summary.tags?.languages ?? []
    const fromCard = cardMatchesEval ? card?.benchmark_details?.languages ?? [] : []
    return Array.from(new Set([...fromTags, ...fromCard].map((d) => d.trim()).filter(Boolean))).slice(0, 4)
  }, [summary.tags?.languages, card?.benchmark_details?.languages, cardMatchesEval])

  const license = card?.ethical_and_legal_considerations?.data_licensing
  const showLicense = license && license !== "Not specified"

  const resources = useMemo(() => {
    if (!cardMatchesEval) return []
    const urls = (card?.benchmark_details?.resources ?? []).filter((r) => typeof r === "string" && r.startsWith("http"))
    const seen = new Map<string, { kind: ReturnType<typeof classifyResource>["kind"]; label: string; url: string }>()
    for (const url of urls) {
      const c = classifyResource(url)
      if (!seen.has(c.kind)) {
        seen.set(c.kind, { ...c, url })
      }
    }
    return Array.from(seen.values())
  }, [card?.benchmark_details?.resources, cardMatchesEval])

  const evaluators = (summary.evaluator_names ?? []).slice(0, 3)
  const hasMoreEvaluators = (summary.evaluator_names?.length ?? 0) > evaluators.length

  const knownIssues = useMemo(
    () =>
      getKnownIssues(
        summary.evaluation_name,
        summary.composite_benchmark_name,
        summary.composite_benchmark_key,
        summary.benchmark_family_key,
        summary.benchmark_leaf_key,
        card?.benchmark_details?.name,
      ),
    [
      summary.evaluation_name,
      summary.composite_benchmark_name,
      summary.composite_benchmark_key,
      summary.benchmark_family_key,
      summary.benchmark_leaf_key,
      card?.benchmark_details?.name,
    ],
  )

  const directionLabel = summary.metric_config.lower_is_better
    ? "Lower scores are better"
    : "Higher scores are better"

  return (
    <section className="rounded-3xl border bg-card p-5 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold tracking-tight">{summary.evaluation_name}</h2>
        <span className="text-xs text-muted-foreground">In plain language</span>
      </header>

      {knownIssues.length > 0 && (
        <div className="mb-3">
          <KnownIssuesPanel issues={knownIssues} variant="compact" />
        </div>
      )}

      <p className="text-base leading-7 text-foreground/90">
        {visibleText}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </p>

      <p className="mt-3 text-sm text-muted-foreground">
        <SignalTooltip
          content={
            summary.metric_config.lower_is_better
              ? "On this benchmark, a lower number means the model did better."
              : "On this benchmark, a higher number means the model did better."
          }
        >
          <span className="underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 cursor-help">
            {directionLabel}.
          </span>
        </SignalTooltip>{" "}
        Compared across {summary.models_count} model{summary.models_count === 1 ? "" : "s"}.
      </p>

      {isParentPage && subtaskLabels.length > 1 && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-muted/10">
          <button
            type="button"
            onClick={() => setSubtasksOpen((v) => !v)}
            aria-expanded={subtasksOpen}
            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/20 rounded-2xl"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              {isAggregated ? `Component benchmarks (${subtaskLabels.length})` : `Subtasks (${subtaskLabels.length})`}
            </span>
            {subtasksOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {subtasksOpen && (
            <ul className="grid list-disc gap-x-6 gap-y-1 px-3.5 pb-3.5 pl-9 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {subtaskLabels.map((name) => (
                <li key={name} className="capitalize">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(domains.length > 0 || languages.length > 0 || showLicense) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {domains.map((d) => (
            <span
              key={`d-${d}`}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-medium capitalize"
            >
              <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
              {d}
            </span>
          ))}
          {languages.map((l) => (
            <span
              key={`l-${l}`}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200/70 bg-sky-50/60 px-2.5 py-1 text-xs font-medium dark:border-sky-900/40 dark:bg-sky-950/20"
            >
              <Globe className="h-3 w-3 shrink-0 text-sky-600" />
              {l}
            </span>
          ))}
          {showLicense && (
            <SignalTooltip content="The license under which the benchmark dataset is released.">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs font-medium cursor-help">
                <ScrollText className="h-3 w-3 shrink-0 text-muted-foreground" />
                {license}
              </span>
            </SignalTooltip>
          )}
        </div>
      )}

      {(resources.length > 0 || evaluators.length > 0) && (
        <div className="mt-5 border-t pt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Where this comes from
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {resources.map((r) => (
              <a
                key={r.url}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="font-semibold text-foreground">{r.label}</span>
                <span className="text-muted-foreground">{shortHost(r.url)}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ))}
            {evaluators.length > 0 && (
              <SignalTooltip
                content={
                  <span className="block space-y-1">
                    <span className="block font-semibold">Who reported these scores</span>
                    <span className="block">{summary.evaluator_names?.join(", ")}</span>
                    {summary.third_party_ratio > 0 && (
                      <span className="block text-muted-foreground">
                        {Math.round(summary.third_party_ratio * 100)}% of results come from independent evaluators (not the model's own developer).
                      </span>
                    )}
                  </span>
                }
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium cursor-help">
                  <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="font-semibold text-foreground">Reported by</span>
                  <span className="text-muted-foreground">
                    {evaluators.join(", ")}
                    {hasMoreEvaluators ? ` +${(summary.evaluator_names?.length ?? 0) - evaluators.length} more` : ""}
                  </span>
                </span>
              </SignalTooltip>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
