import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpenText, Database, MessageSquare, Scale } from "lucide-react"
import { HomeModeLabel } from "@/components/home-mode-label"
import { Navigation } from "@/components/navigation"
import { getBackendManifestData, getEvalHierarchyData, getEvalListData, getModelCards } from "@/lib/model-data"

function formatGeneratedAt(value: string | null | undefined) {
  if (!value) return "Unknown"

  try {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return value
  }
}

export default async function HomePage() {
  const [models, evalList, manifest, hierarchy] = await Promise.all([
    getModelCards(),
    getEvalListData(),
    getBackendManifestData(),
    getEvalHierarchyData(),
  ])

  const evalSummaries = evalList.evals
  const developerCount = new Set(models.map((entry) => entry.developer).filter(Boolean)).size
  const avgBenchmarksPerModel =
    models.length > 0
      ? models.reduce((sum, entry) => sum + entry.benchmarks_count, 0) / models.length
      : 0
  const totalReportedResults = models.reduce((sum, entry) => sum + entry.evaluations_count, 0)

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top,rgba(196,167,96,0.12),transparent_60%)]" />
        <div className="absolute inset-y-0 right-0 -z-10 hidden w-[36rem] bg-[radial-gradient(circle_at_center,rgba(71,129,177,0.08),transparent_66%)] lg:block" />

        <section className="mx-auto flex min-h-[calc(100vh-4.25rem)] w-full max-w-[92rem] flex-col justify-between px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pb-12">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.24fr)_minmax(360px,0.76fr)] xl:items-stretch">
            <div className="grid content-start gap-8">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                <span className="rounded-full border border-border/70 bg-background px-3 py-1">Beta preview</span>
                <HomeModeLabel />
                {manifest ? <span>Updated {formatGeneratedAt(manifest.generated_at)}</span> : null}
              </div>

              <div className="space-y-5">
                <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl lg:text-[4.25rem] lg:leading-[1.02]">
                  Public reporting for AI evaluations.
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
                  Browse reported benchmark evidence across models, evaluators, and benchmarks without flattening the record into a single score table.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
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
                <Link href="/survey">
                  <Button size="lg" variant="ghost" className="gap-2 rounded-full px-4 text-foreground">
                    Leave feedback
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="overflow-hidden rounded-[1.65rem] border border-border/70 bg-muted/10">
                <div className="grid md:grid-cols-3 md:divide-x md:divide-border/60">
                  <SignalCard
                    icon={<Database className="h-4 w-4" />}
                    title="Coverage"
                    body="Benchmark breadth, setup details, and provenance stay visible."
                    tone="sky"
                  />
                  <SignalCard
                    icon={<Scale className="h-4 w-4" />}
                    title="Comparability"
                    body="Configuration gaps and evaluator relationships remain part of the reading."
                    tone="amber"
                  />
                  <SignalCard
                    icon={<BookOpenText className="h-4 w-4" />}
                    title="Reading modes"
                    body="Research and policy views shift emphasis without hiding the record."
                    tone="emerald"
                  />
                </div>
              </div>
            </div>

            <aside className="flex h-full flex-col rounded-[2rem] border border-border/70 bg-card/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Current public corpus
                  </div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">
                    Structured records currently available to inspect.
                  </div>
                </div>
                <Database className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="mt-5 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <QuietStat label="Models" value={models.length.toString()} detail="Tracked in the current corpus" tone="amber" />
                <QuietStat label="Evaluations" value={evalSummaries.length.toString()} detail="Benchmark views with linked details" tone="sky" />
                <QuietStat label="Developers" value={developerCount.toString()} detail="Organizations represented" tone="emerald" />
                <QuietStat
                  label="Families"
                  value={hierarchy ? hierarchy.stats.family_count.toString() : "—"}
                  detail="Backend taxonomy families"
                  tone="rose"
                />
                <QuietStat
                  label="Reported results"
                  value={totalReportedResults.toLocaleString()}
                  detail="Model-linked results currently indexed"
                  tone="slate"
                />
                <QuietStat
                  label="Benchmarks per model"
                  value={avgBenchmarksPerModel.toFixed(1)}
                  detail="Average reported benchmark breadth"
                  tone="amber"
                />
              </div>
            </aside>
          </div>

          <div className="mt-10 grid gap-6 border-t border-border/60 pt-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:items-stretch">
            <div className="grid auto-rows-fr gap-4 md:grid-cols-3">
              <RoutePanel
                href="/models"
                icon={<Database className="h-4 w-4" />}
                title="Model-first reading"
                body="See the reported benchmark footprint of a model, including where evidence is broad, narrow, or missing."
              />
              <RoutePanel
                href="/evals"
                icon={<BookOpenText className="h-4 w-4" />}
                title="Benchmark-first reading"
                body="Inspect how a benchmark is reported across models, with room to compare slices, setups, and sources."
              />
              <RoutePanel
                href="/about"
                icon={<Scale className="h-4 w-4" />}
                title="Project framing"
                body="Read the rationale behind the reporting model, the schema direction, and the intended research and policy use."
              />
            </div>

            <div className="flex h-full flex-col rounded-[1.75rem] border border-border/70 bg-muted/20 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MessageSquare className="h-4 w-4 text-rose-600" />
                Feedback
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Use the survey to flag unclear terminology, missing fields, or comparison flows that need work.
              </p>
              <div className="mt-4">
                <Link href="/survey" className="inline-flex items-center gap-2 text-sm font-semibold text-foreground underline underline-offset-4">
                  Open feedback survey
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function QuietStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: "amber" | "emerald" | "rose" | "sky" | "slate"
}) {
  const toneClasses = {
    amber: "border-amber-200/80 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20",
    emerald: "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20",
    rose: "border-rose-200/80 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20",
    sky: "border-sky-200/80 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/20",
    slate: "border-border/70 bg-muted/25",
  }[tone]

  return (
    <div className={`flex h-full flex-col rounded-[1.35rem] border p-4 ${toneClasses}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</div>
      <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  )
}

function SignalCard({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode
  title: string
  body: string
  tone: "amber" | "emerald" | "sky"
}) {
  const toneClasses = {
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    emerald: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
    sky: "bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-300",
  }[tone]

  return (
    <div className="flex h-full flex-col gap-3 px-4 py-4 md:px-5 md:py-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className={`rounded-full p-2 ${toneClasses}`}>{icon}</span>
        {title}
      </div>
      <p className="max-w-[28ch] text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}

function RoutePanel({
  href,
  icon,
  title,
  body,
}: {
  href: string
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-[1.5rem] border border-border/70 bg-background/80 p-5 transition-colors hover:bg-muted/20"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="rounded-full bg-muted/60 p-2 text-muted-foreground transition-colors group-hover:text-foreground">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p>
      <div className="mt-auto pt-4 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        Open
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  )
}
