import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpenText, Database, MessageSquare, Scale } from "lucide-react"
import { HomeModeLabel } from "@/components/home-mode-label"
import { Navigation } from "@/components/navigation"
import { getBackendManifestData, getEvalListLiteData, getModelCardsLite } from "@/lib/data-backend"

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
  const [models, evalList, manifest] = await Promise.all([
    getModelCardsLite(),
    getEvalListLiteData(),
    getBackendManifestData(),
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

        <section className="mx-auto flex min-h-[calc(100vh-4.25rem)] w-full max-w-[92rem] flex-col gap-10 px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pb-12">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-stretch">
            <div className="flex flex-1 flex-col gap-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                <span className="rounded-full border border-border/70 bg-background px-3 py-1">Beta preview</span>
                <HomeModeLabel />
                {manifest ? <span>Updated {formatGeneratedAt(manifest.generated_at)}</span> : null}
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl lg:text-[4.25rem] lg:leading-[1.02]">
                  Public reporting for AI evaluations
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                  Explore which models and benchmarks are reported, where coverage is sparse, and what details are missing.
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
            </div>

            <aside className="flex min-w-[300px] flex-col rounded-[2rem] border border-border/70 bg-card/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] xl:max-w-[22rem]">
              <div className="grid grid-cols-2 gap-3">
                <QuietStat label="Models" value={models.length.toString()} detail="Tracked" tone="amber" />
                <QuietStat label="Evaluations" value={evalSummaries.length.toString()} detail="Benchmarks" tone="sky" />
                <QuietStat label="Developers" value={developerCount.toString()} detail="Organizations" tone="emerald" />
                <QuietStat
                  label="Results"
                  value={totalReportedResults.toLocaleString()}
                  detail={`${avgBenchmarksPerModel.toFixed(1)} avg per model`}
                  tone="slate"
                />
              </div>
            </aside>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SignalCard
              icon={<Database className="h-4 w-4" />}
              title="Reported benchmarks"
              body="Which benchmarks, settings, and sources are documented."
              tone="sky"
            />
            <SignalCard
              icon={<Scale className="h-4 w-4" />}
              title="Comparison context"
              body="Evaluator relationships and config gaps attached to each record."
              tone="amber"
            />
            <SignalCard
              icon={<BookOpenText className="h-4 w-4" />}
              title="Reader modes"
              body="Research and policy views highlight different fields."
              tone="emerald"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border/60 pt-8 sm:grid-cols-2 lg:grid-cols-4">
            <RoutePanel
              href="/models"
              icon={<Database className="h-4 w-4" />}
              title="Model records"
              body="Reported benchmarks per model, plus what's missing."
            />
            <RoutePanel
              href="/evals"
              icon={<BookOpenText className="h-4 w-4" />}
              title="Benchmark records"
              body="How a benchmark is reported across models."
            />
            <RoutePanel
              href="/about"
              icon={<Scale className="h-4 w-4" />}
              title="Project notes"
              body="Why this reporting format exists."
            />
            <Link
              href="/survey"
              className="group flex h-full flex-col rounded-[1.5rem] border border-border/70 bg-muted/20 p-5 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="rounded-full bg-rose-50 p-2 text-rose-600 dark:bg-rose-950/30">
                  <MessageSquare className="h-4 w-4" />
                </span>
                Feedback
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Flag missing fields or unclear labels.
              </p>
              <div className="mt-auto pt-4 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                Open survey
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
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

  const surfaceClasses = {
    amber: "border-amber-200/70 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/15",
    emerald: "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/15",
    sky: "border-sky-200/70 bg-sky-50/40 dark:border-sky-900/40 dark:bg-sky-950/15",
  }[tone]

  return (
    <div className={`flex h-full flex-col gap-3 rounded-[1.5rem] border p-5 ${surfaceClasses}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className={`rounded-full p-2 ${toneClasses}`}>{icon}</span>
        {title}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
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
