import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { HomeModeLabel } from "@/components/home-mode-label"
import { Navigation } from "@/components/navigation"
import { CorpusSignalsStrip } from "@/components/signals/corpus-signals-strip"
import { getDeveloperList } from "@/lib/data-backend"
import {
  fetchBackendManifest,
  fetchCorpusAggregates,
  fetchEvalHierarchy,
} from "@/lib/hf-data"

function formatGeneratedAt(value: string | null | undefined) {
  if (!value) return null
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  } catch {
    return value
  }
}

function formatNumber(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("en-US")
}

export default async function HomePage() {
  const [aggregates, manifest, hierarchy, developers] = await Promise.all([
    fetchCorpusAggregates(),
    fetchBackendManifest(),
    fetchEvalHierarchy(),
    getDeveloperList().catch(() => []),
  ])

  const stats = hierarchy.stats
  const familyCount = stats?.family_count ?? hierarchy.families.length
  const compositeCount = stats?.composite_count ?? 0
  const singleBenchmarkCount = stats?.single_benchmark_count ?? 0
  const standaloneBenchmarkCount = stats?.standalone_benchmark_count ?? 0
  const benchmarkLeafCount = singleBenchmarkCount + standaloneBenchmarkCount
  const sliceCount = stats?.slice_count ?? 0
  const metricCount = stats?.metric_count ?? 0
  const tripleCount = stats?.metric_rows_scanned ?? 0
  const modelCount = manifest?.model_count ?? 0
  const developerCount = developers.length
  const generatedAt = formatGeneratedAt(manifest?.generated_at)

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto w-full max-w-[88rem] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {/* Masthead */}
        <section className="border-b border-border/60 pb-10">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            <HomeModeLabel />
            {generatedAt && <span>Snapshot · {generatedAt}</span>}
            {aggregates && (
              <Badge variant="outline" className="font-normal tracking-normal">
                Signals v{aggregates.signal_version}
              </Badge>
            )}
          </div>

          <h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-[3.75rem] lg:leading-[1.05]">
            Eval Cards
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            An interpretative integration layer for AI evaluation reporting. Eval Cards composes
            benchmark metadata, evaluation run data, and provenance into a single reading surface,
            and surfaces four interpretive signals — reproducibility, reporting completeness,
            provenance, and comparability — over a public corpus of reported scores.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/models">
              <Button size="lg" className="gap-2 rounded-full px-6">
                Browse models
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/evals">
              <Button size="lg" variant="outline" className="gap-2 rounded-full px-6">
                Browse evaluations
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/about">
              <Button size="lg" variant="ghost" className="gap-2 rounded-full px-4 text-foreground">
                About this project
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Corpus stats — paper §5.1 */}
        <section className="border-b border-border/60 py-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] lg:gap-12">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Corpus
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
                What this snapshot covers
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
                Reports are organized through a six-level rollout hierarchy
                (family → suite → single benchmark → split → subtask → metric) so that
                aggregate claims can be drilled down to the evidence supporting them.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <CorpusStat
                label="Models"
                value={formatNumber(modelCount)}
                detail="Tracked across reporting sources"
              />
              <CorpusStat
                label="Reported results"
                value={formatNumber(tripleCount)}
                detail="(model, benchmark, metric) triples"
              />
              <CorpusStat
                label="Reporting organizations"
                value={formatNumber(developerCount)}
                detail="Developers and third-party evaluators"
              />
              <CorpusStat
                label="Benchmark families"
                value={formatNumber(familyCount)}
                detail="Top of the rollout hierarchy"
              />
              <CorpusStat
                label="Suites"
                value={formatNumber(compositeCount)}
                detail="Composite reporting units"
              />
              <CorpusStat
                label="Single benchmarks"
                value={formatNumber(benchmarkLeafCount)}
                detail={`${formatNumber(sliceCount)} slices · ${formatNumber(metricCount)} metrics`}
              />
            </div>
          </div>
        </section>

        {/* Four interpretive signals */}
        <section className="py-10">
          <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] lg:gap-12">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Interpretive signals
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
                Reproducibility, completeness, provenance, comparability
              </h2>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Each signal answers a question a reader brings to a reported score. Per-record
              instances appear on every model and benchmark page. Corpus-level rollups below
              show how reporting practice looks across the public record as a whole.
            </p>
          </div>

          {aggregates ? (
            <CorpusSignalsStrip aggregates={aggregates} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-8 text-center">
              <h3 className="text-lg font-semibold tracking-tight">Corpus aggregates unavailable</h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                The current backend snapshot does not include <code>corpus-aggregates.json</code>.
                When it does, this section will render the four corpus-level rollups.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function CorpusStat({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-[1.625rem]">
        {value}
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}
