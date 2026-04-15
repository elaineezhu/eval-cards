import Link from "next/link"
import { ArrowRight, BookOpenText, Database, Scale, Search } from "lucide-react"

import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <PageHeader
        eyebrow="About"
        title="About Eval Cards"
        description="Why public AI evaluation reporting needs shared infrastructure, and what this project builds toward it."
        size="wide"
        metaItems={[
          { label: "Modes", value: "Research + Policy" },
          { label: "Core", value: "Reporting + Schema + Platform" },
        ]}
      />

      <main className="mx-auto w-full max-w-[92rem] px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-16">
          <section className="grid gap-8 border-b border-border/60 pb-12 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] lg:gap-12">
            <div className="space-y-3">
              <SectionLabel label="Why this exists" />
              <h2 className="max-w-sm text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-[2.2rem]">
                Evaluation scores travel faster than the context needed to interpret them.
              </h2>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
              <div className="space-y-4 text-base leading-8 text-muted-foreground">
                <p>
                  AI evaluations shape discussions about capability, safety, and deployment. Public reporting arrives through papers, leaderboards, blog posts, and framework outputs that rarely line up.
                </p>
                <p>
                  Eval Cards treats reporting as infrastructure. Beyond collecting scores, it surfaces who reported a result, when it was run, what slice it covers, and whether the setup makes comparison reasonable.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-border/70 bg-muted/20 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Reading stance
                </div>
                <div className="mt-4 space-y-4">
                  <SignalLine icon={<Search className="h-4 w-4" />} label="Inspect provenance alongside rankings." tone="sky" />
                  <SignalLine icon={<Scale className="h-4 w-4" />} label="Surface comparability caveats early." tone="amber" />
                  <SignalLine icon={<BookOpenText className="h-4 w-4" />} label="Support research and policy use without duplicating the record." tone="emerald" />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-5 border-b border-border/60 pb-12">
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] lg:items-start">
              <div className="space-y-3">
                <SectionLabel label="Core contribution" />
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
                  Three layers, one public interface.
                </h2>
              </div>
              <p className="max-w-3xl text-base leading-8 text-muted-foreground">
                A reporting framework, a standardized data layer, and an interface for exploring the evidence across models, evaluations, and benchmarks.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <AboutPanel
                icon={<BookOpenText className="h-4 w-4" />}
                tone="amber"
                title="Reporting framework"
                body="A structured view of which evaluation details matter for interpretation, reproducibility, and public accountability."
              />
              <AboutPanel
                icon={<Database className="h-4 w-4" />}
                tone="sky"
                title="Standardized records"
                body="Evaluation outputs and benchmark metadata are shaped into a consistent layer that can be queried and compared across sources."
              />
              <AboutPanel
                icon={<Scale className="h-4 w-4" />}
                tone="emerald"
                title="Public reading interface"
                body="The interface keeps setup differences, provenance, and evidence gaps visible so interpretation does not detach from reporting conditions."
              />
            </div>
          </section>

          <section className="grid gap-10 border-b border-border/60 pb-12 lg:grid-cols-2">
            <div className="space-y-5">
              <SectionLabel label="What the platform supports" />
              <div className="space-y-4 text-base leading-8 text-muted-foreground">
                <p>
                  Move from a model to its reported benchmarks, from an evaluation to the models that ran on it, and from a benchmark family down to its slices and metrics.
                </p>
                <p>
                  Scores are useful only when paired with benchmark scope, evaluator identity, generation setup, and the places where reporting is incomplete.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <SectionLabel label="Who it is for" />
              <div className="grid gap-4 sm:grid-cols-2">
                <AudienceCard
                  title="Researchers"
                  body="Need reproducibility cues, benchmark decomposition, and apples-to-apples comparison support before drawing substantive conclusions."
                />
                <AudienceCard
                  title="Policy readers"
                  body="Need evaluator independence, benchmark purpose, source accountability, and clearly stated limitations before using reported results."
                />
              </div>
              <p className="text-sm leading-7 text-muted-foreground">
                Audience modes change emphasis, not the underlying record.
              </p>
            </div>
          </section>

          <section className="grid gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(280px,0.72fr)]">
            <div className="space-y-5">
              <SectionLabel label="Current scope" />
              <div className="space-y-4 text-base leading-8 text-muted-foreground">
                <p>
                  Read this version as a public beta. It tries to make structured evaluation reporting legible, while testing which fields, comparison flows, and abstractions hold up in practice.
                </p>
                <p>
                  The larger goal: make AI evaluation evidence easier to inspect and harder to over-interpret.
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-[1.75rem] border border-border/70 bg-[linear-gradient(180deg,rgba(71,129,177,0.08),rgba(71,129,177,0.02))] p-5">
              <SectionLabel label="Next steps" />
              <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                <p>The homepage is the shortest path into the data.</p>
                <p>The survey collects missing fields, confusing labels, and misleading comparisons.</p>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link href="/">
                  <Button className="gap-2 rounded-full px-5">
                    Back to homepage
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/survey">
                  <Button variant="outline" className="gap-2 rounded-full px-5">
                    Leave feedback
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
      {label}
    </div>
  )
}

function AboutRow({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="border-t border-border/50 pt-5 first:border-t-0 first:pt-0">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
    </div>
  )
}

function AboutPanel({
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
    amber: "bg-amber-50/70 dark:bg-amber-950/20",
    emerald: "bg-emerald-50/70 dark:bg-emerald-950/20",
    sky: "bg-sky-50/70 dark:bg-sky-950/20",
  }[tone]

  return (
    <div className={`rounded-[1.5rem] border border-border/70 p-5 ${toneClasses}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="rounded-full bg-background/80 p-2 text-muted-foreground">{icon}</span>
        {title}
      </div>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p>
    </div>
  )
}

function AudienceCard({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
    </div>
  )
}

function SignalLine({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode
  label: string
  tone: "amber" | "emerald" | "sky"
}) {
  const toneClasses = {
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    emerald: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
    sky: "bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-300",
  }[tone]

  return (
    <div className="flex items-start gap-3">
      <div className={`rounded-full p-2 ${toneClasses}`}>{icon}</div>
      <div className="text-sm leading-6 text-muted-foreground">{label}</div>
    </div>
  )
}
