"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowRight, BadgeCheck, BarChart3, Database, Info, LayoutGrid, Clock3, Scale } from "lucide-react"
import type { BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import type { BenchmarkEvalListItem } from "@/lib/eval-processing"
import { fetchEvalList, fetchModelCards } from "@/lib/dashboard-data-client"

export default function HomePage() {
  const { mode } = useAudienceMode()
  const [models, setModels] = useState<BenchmarkEvaluationCardData[]>([])
  const [evalSummaries, setEvalSummaries] = useState<BenchmarkEvalListItem[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [evalsLoading, setEvalsLoading] = useState(true)

  useEffect(() => {
    fetchModelCards()
      .then(setModels)
      .catch(console.error)
      .finally(() => setModelsLoading(false))

    fetchEvalList()
      .then((data) => setEvalSummaries(data.evals))
      .catch(console.error)
      .finally(() => setEvalsLoading(false))
  }, [])

  const loading = modelsLoading || evalsLoading

  const reportingOrgCount = useMemo(
    () => new Set(models.flatMap((entry) => entry.evaluator_names)).size,
    [models]
  )

  const avgBenchmarksPerModel = useMemo(() => {
    if (models.length === 0) return 0
    return models.reduce((sum, entry) => sum + entry.benchmarks_count, 0) / models.length
  }, [models])

  const totalReportedResults = useMemo(
    () => models.reduce((sum, entry) => sum + entry.evaluations_count, 0),
    [models]
  )

  const broadestModels = useMemo(() => {
    return [...models]
      .sort((a, b) => {
        if (b.benchmarks_count !== a.benchmarks_count) {
          return b.benchmarks_count - a.benchmarks_count
        }

        return new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime()
      })
      .slice(0, 6)
  }, [models])

  const widestEvaluations = useMemo(() => {
    return [...evalSummaries]
      .sort((a, b) => {
        if (b.models_count !== a.models_count) {
          return b.models_count - a.models_count
        }

        return b.avg_score_norm - a.avg_score_norm
      })
      .slice(0, 6)
  }, [evalSummaries])

  const latestModels = useMemo(() => {
    return [...models]
      .sort((a, b) => new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime())
      .slice(0, 6)
  }, [models])

  const independentlyReportedModels = useMemo(() => {
    return [...models]
      .sort((a, b) => {
        if (b.independent_verification_ratio !== a.independent_verification_ratio) {
          return b.independent_verification_ratio - a.independent_verification_ratio
        }
        return b.benchmarks_count - a.benchmarks_count
      })
      .slice(0, 6)
  }, [models])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex h-96 items-center justify-center">
            <div className="text-lg text-muted-foreground">Loading overview...</div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <PageHeader
        eyebrow="Overview"
        title="Eval Cards Overview"
        description={
          mode === "research"
            ? "A benchmark-first overview of reported model evidence, methodological breadth, and evaluation coverage."
            : "A public-interest overview of reported model evidence, accountability signals, and benchmark coverage."
        }
        metaItems={[
          { label: "Models", value: models.length.toString() },
          { label: "Evaluations", value: evalSummaries.length.toString() },
          { label: "View", value: mode === "research" ? "Research" : "Policy" },
        ]}
      />

      <main className="container mx-auto px-4 py-8">
        <Alert className="mb-8 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle>Demo Environment</AlertTitle>
          <AlertDescription>
            This is a research preview with sample data for demonstration purposes.
          </AlertDescription>
        </Alert>

        <section className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <OverviewStat
            icon={LayoutGrid}
            label="Models"
            value={models.length.toString()}
            description="Model cards aggregated into one evidence layer"
            tone="bg-sky-50 text-sky-950 ring-sky-200/70 dark:bg-sky-950/20 dark:text-sky-100 dark:ring-sky-900/50"
          />
          <OverviewStat
            icon={BarChart3}
            label="Evaluations"
            value={evalSummaries.length.toString()}
            description="Benchmark views derived from reported model results"
            tone="bg-stone-100 text-stone-950 ring-stone-200/80 dark:bg-stone-900/40 dark:text-stone-100 dark:ring-stone-800/70"
          />
          <OverviewStat
            icon={Database}
            label="Reported Results"
            value={totalReportedResults.toString()}
            description="Individual benchmark result entries across the corpus"
            tone="bg-amber-50 text-amber-950 ring-amber-200/70 dark:bg-amber-950/20 dark:text-amber-100 dark:ring-amber-900/50"
          />
          <OverviewStat
            icon={BadgeCheck}
            label="Reporting Orgs"
            value={reportingOrgCount.toString()}
            description="Distinct organizations contributing evidence"
            tone="bg-emerald-50 text-emerald-950 ring-emerald-200/70 dark:bg-emerald-950/20 dark:text-emerald-100 dark:ring-emerald-900/50"
          />
        </section>

        <section className="mb-10 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[1.5rem] border border-border/70 bg-muted/10 p-5">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              State Of The Corpus
            </div>
            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Eval Cards brings together reported evaluation evidence from many sources into one benchmark-first reading surface.
              </p>
              <p>
                On average, each model currently has <span className="font-medium text-foreground">{avgBenchmarksPerModel.toFixed(1)}</span> benchmark views and the corpus spans <span className="font-medium text-foreground">{reportingOrgCount}</span> distinct reporting organizations.
              </p>
              <p>
                {mode === "research"
                  ? "Research mode is best for reading methodological spread, coverage breadth, and source comparability before drilling into the dedicated model or evaluation pages."
                  : "Policy mode is best for reading accountability, evidence coverage, and the breadth of public reporting before drilling into dedicated model or evaluation pages."}
              </p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-border/70 bg-background p-5">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Quick Actions
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/models">
                <Button variant="outline" className="w-full justify-between">
                  Browse model evidence
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/evals">
                <Button variant="outline" className="w-full justify-between">
                  Browse evaluation leaderboards
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="mb-10 grid gap-6 xl:grid-cols-2">
          <OverviewPanel
            eyebrow="Coverage"
            title="Broadest model evidence"
            description="Models with the widest reported benchmark coverage in the current corpus."
            href="/models"
            cta="All models"
          >
            <div className="space-y-1">
              {broadestModels.map((model, index) => (
                <ModelOverviewRow
                  key={model.id}
                  rank={index + 1}
                  model={model}
                  metricLabel="Benchmarks"
                  metricValue={model.benchmarks_count.toString()}
                  secondaryLabel={`${model.evaluator_count} orgs`}
                />
              ))}
            </div>
          </OverviewPanel>

          <OverviewPanel
            eyebrow="Benchmarks"
            title="Widest benchmark coverage"
            description="Evaluations that currently compare the most models."
            href="/evals"
            cta="All evaluations"
          >
            <div className="space-y-1">
              {widestEvaluations.map((evaluation, index) => (
                <EvalOverviewRow
                  key={evaluation.evaluation_id}
                  rank={index + 1}
                  evaluation={evaluation}
                  metricLabel="Models"
                  metricValue={evaluation.models_count.toString()}
                  secondaryLabel={`${Math.round(evaluation.third_party_ratio * 100)}% third-party`}
                />
              ))}
            </div>
          </OverviewPanel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <OverviewPanel
            eyebrow="Accountability"
            title="Highest third-party reporting share"
            description="Models with the largest share of third-party benchmark reporting in the current corpus."
            href="/models"
            cta="Browse models"
          >
            <div className="space-y-1">
              {independentlyReportedModels.map((model, index) => (
                <ModelOverviewRow
                  key={model.id}
                  rank={index + 1}
                  model={model}
                  metricLabel="Third-party share"
                  metricValue={`${Math.round(model.independent_verification_ratio * 100)}%`}
                  secondaryLabel={`${model.benchmarks_count} benchmarks`}
                  highlight={model.independent_verification_ratio > 0.5}
                />
              ))}
            </div>
          </OverviewPanel>

          <OverviewPanel
            eyebrow="Recent Activity"
            title="Latest reporting updates"
            description="Recently updated model evidence entries across the corpus."
            href="/models"
            cta="See latest models"
          >
            <div className="space-y-1">
              {latestModels.map((model, index) => (
                <ModelOverviewRow
                  key={model.id}
                  rank={index + 1}
                  model={model}
                  metricLabel="Updated"
                  metricValue={formatCompactDate(model.latest_timestamp)}
                  secondaryLabel={`${model.benchmarks_count} benchmarks`}
                />
              ))}
            </div>
          </OverviewPanel>
        </section>
      </main>
    </div>
  )
}

function formatCompactDate(value: string) {
  const numeric = Number(value)
  const parsed =
    !Number.isNaN(numeric) && !value.includes("-")
      ? new Date(numeric * 1000)
      : new Date(value)

  try {
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  } catch {
    return value
  }
}

function OverviewStat({
  icon: Icon,
  label,
  value,
  description,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  description: string
  tone: string
}) {
  return (
    <div className={`rounded-[1.5rem] p-4 ring-1 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</div>
        </div>
        <Icon className="mt-0.5 h-5 w-5 opacity-75" />
      </div>
      <div className="mt-3 text-sm leading-6 opacity-80">{description}</div>
    </div>
  )
}

function OverviewPanel({
  eyebrow,
  title,
  description,
  href,
  cta,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  href: string
  cta: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[1.5rem] border border-border/70 bg-background p-5">
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Link href={href}>
          <Button variant="ghost" className="gap-2">
            {cta}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
      {children}
    </section>
  )
}

function ModelOverviewRow({
  rank,
  model,
  metricLabel,
  metricValue,
  secondaryLabel,
  highlight = false,
}: {
  rank: number
  model: BenchmarkEvaluationCardData
  metricLabel: string
  metricValue: string
  secondaryLabel: string
  highlight?: boolean
}) {
  return (
    <Link href={`/models/${model.route_id}`} className="block">
      <div className="flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-muted/30">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{model.model_name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {model.developer} · {secondaryLabel}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {metricLabel}
          </div>
          <div className="mt-1 flex items-center justify-end gap-2">
            {highlight && (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                Strong
              </Badge>
            )}
            <span className="text-sm font-bold tabular-nums">{metricValue}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function EvalOverviewRow({
  rank,
  evaluation,
  metricLabel,
  metricValue,
  secondaryLabel,
}: {
  rank: number
  evaluation: BenchmarkEvalListItem
  metricLabel: string
  metricValue: string
  secondaryLabel: string
}) {
  return (
    <Link href={`/evals/${evaluation.evaluation_id}`} className="block">
      <div className="flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-muted/30">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{evaluation.evaluation_name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {evaluation.latest_source_name ?? "Reported benchmark"} · {secondaryLabel}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {metricLabel}
          </div>
          <div className="mt-1 text-sm font-bold tabular-nums">{metricValue}</div>
        </div>
      </div>
    </Link>
  )
}
