import Link from "next/link"
import {
  ArrowRight,
  BookOpenText,
  ClipboardCheck,
  Database,
  GitCompareArrows,
  Layers,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react"

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
        description="An interpretative integration layer for AI evaluation reporting. Eval Cards composes existing evaluation infrastructure into a single reading surface, organizes reported scores through a six-level rollout hierarchy, and surfaces four interpretive signals that help readers decide whether to trust a reported result."
        size="wide"
        metaItems={[
          { label: "Reader modes", value: "Research + Policy" },
          { label: "Signal layers", value: "Reproducibility · Completeness · Provenance · Comparability" },
        ]}
      />

      <main className="mx-auto w-full max-w-[88rem] px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-14">
          {/* The framing problem */}
          <section className="grid gap-8 border-b border-border/60 pb-12 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] lg:gap-12">
            <div className="space-y-3">
              <SectionLabel label="The problem" />
              <h2 className="max-w-sm text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[1.75rem]">
                Evaluation results travel faster than the context needed to interpret them.
              </h2>
            </div>

            <div className="space-y-4 text-base leading-7 text-muted-foreground">
              <p>
                AI evaluations are produced at scale and reported through papers, leaderboards, model cards, and
                framework outputs that rarely share conventions. The cost of fragmentation is paid at the point
                of interpretation: provenance gets lost, configurations differ silently, and incomplete reporting
                is treated indistinguishably from complete reporting.
              </p>
              <p>
                Eval Cards composes three existing sources into a single record — Auto-BenchmarkCards for
                benchmark metadata, the EEE schema for evaluation run data, and voluntary developer disclosure
                for fields neither captures — then exposes interpretive signals over the result.
              </p>
            </div>
          </section>

          {/* Six-level rollout hierarchy */}
          <section className="grid gap-8 border-b border-border/60 pb-12 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] lg:gap-12">
            <div className="space-y-3">
              <SectionLabel label="Rollout hierarchy" />
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[1.75rem]">
                Six levels from a benchmark family down to a single metric.
              </h2>
              <p className="max-w-md text-sm leading-7 text-muted-foreground">
                Reports are not flat (model, benchmark, score) triples. Every score resolves to an explicit
                path through this hierarchy, which makes drill-down and apples-to-apples comparison possible.
              </p>
            </div>

            <ol className="space-y-3">
              <RollupRow
                index="1"
                title="Family"
                body="A related collection sharing a common object of measurement or methodological lineage (e.g., the SWE-bench family, the MMLU family)."
              />
              <RollupRow
                index="2"
                title="Suite"
                body="A named composite reporting unit that aggregates multiple benchmarks under a unified presentation (e.g., Open LLM Leaderboard v2, HELM Instruct)."
              />
              <RollupRow
                index="3"
                title="Single benchmark"
                body="An individual evaluation with a defined dataset and scoring method (e.g., GSM8K, IFEval, MMLU-Pro)."
              />
              <RollupRow
                index="4"
                title="Split"
                body="A named partition of a benchmark's item set (e.g., test, validation, or a language-specific subset)."
              />
              <RollupRow
                index="5"
                title="Subtask"
                body="A capability- or construct-level decomposition within a benchmark (e.g., algebra within MATH)."
              />
              <RollupRow
                index="6"
                title="Metric"
                body="The specific scoring rule attached to a result (e.g., pass@1, accuracy, F1)."
              />
            </ol>
          </section>

          {/* Four interpretive signals */}
          <section className="grid gap-8 border-b border-border/60 pb-12 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] lg:gap-12">
            <div className="space-y-3">
              <SectionLabel label="Interpretive signals" />
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[1.75rem]">
                Four signals that help readers decide whether to trust a reported score.
              </h2>
              <p className="max-w-md text-sm leading-7 text-muted-foreground">
                Each signal is computed at the record level and rolled up at the corpus level. Per-record
                instances appear on every model and benchmark page; rollups appear on the home page.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SignalCard
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Reproducibility"
                question="Can this be reproduced?"
                body="Flags reported scores whose generation and prompting setup is too underspecified to re-run independently."
              />
              <SignalCard
                icon={<ClipboardCheck className="h-4 w-4" />}
                label="Reporting completeness"
                question="Is the documentation complete?"
                body="Measures the fraction of operationalized framework fields that are populated for a benchmark."
              />
              <SignalCard
                icon={<Users className="h-4 w-4" />}
                label="Provenance"
                question="Who reported this, and what risks does the benchmark carry?"
                body="Distinguishes first-party, third-party, and collaborative reporting and surfaces multi-source coverage."
              />
              <SignalCard
                icon={<GitCompareArrows className="h-4 w-4" />}
                label="Comparability"
                question="Are these scores really comparable?"
                body="Flags score divergence across setup variants and across reporting parties for the same (model, benchmark, metric)."
              />
            </div>
          </section>

          {/* Two reader modes */}
          <section className="grid gap-8 border-b border-border/60 pb-12 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] lg:gap-12">
            <div className="space-y-3">
              <SectionLabel label="Reader modes" />
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[1.75rem]">
                Two renderings of the same record.
              </h2>
              <p className="max-w-md text-sm leading-7 text-muted-foreground">
                The two modes operate on the same underlying data. The difference is which fields are
                surfaced, which are compressed, and which framing is used.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                title="Research mode"
                body="Foregrounds methodology and configuration. Reproducibility gaps list specific missing fields. Comparability surfaces the underlying setup differences. Default for technical evaluators, benchmark developers, and meta-analysis."
              />
              <ModeCard
                title="Policy mode"
                body="Foregrounds accountability and plain-language interpretation. The same signals render with narrative caveats and compressed metric configuration. Default for regulators, standards bodies, and non-technical readers."
              />
            </div>
          </section>

          {/* Composition + sources */}
          <section className="grid gap-8 lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] lg:gap-12">
            <div className="space-y-3">
              <SectionLabel label="Composition" />
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[1.75rem]">
                Eval Cards does not collect evaluation data directly.
              </h2>
              <p className="max-w-md text-sm leading-7 text-muted-foreground">
                It composes three existing sources and applies a canonicalization layer that maps surface
                identifiers to nodes in the rollout hierarchy.
              </p>
            </div>

            <div className="space-y-3">
              <SourceRow
                icon={<BookOpenText className="h-4 w-4" />}
                title="Auto-BenchmarkCards"
                body="Benchmark metadata: design intent, scoring methodology, data licensing, risk annotations."
              />
              <SourceRow
                icon={<Database className="h-4 w-4" />}
                title="EEE (evaluation run data)"
                body="Generation configuration, evaluator relationships, and per-instance results from major frameworks."
              />
              <SourceRow
                icon={<Scale className="h-4 w-4" />}
                title="Voluntary disclosure"
                body="Two reserved fields accept developer-supplied disclosure: preregistration links and lifecycle status."
              />
            </div>
          </section>

          {/* CTAs */}
          <section className="flex flex-wrap gap-3 border-t border-border/60 pt-10">
            <Link href="/">
              <Button className="gap-2 rounded-full px-5">
                Back to home
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/models">
              <Button variant="outline" className="gap-2 rounded-full px-5">
                Browse models
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/evals">
              <Button variant="outline" className="gap-2 rounded-full px-5">
                Browse evaluations
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/survey">
              <Button variant="ghost" className="gap-2 rounded-full px-4 text-foreground">
                Leave feedback
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
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

function RollupRow({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/70 text-xs font-semibold text-muted-foreground">
        {index}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </li>
  )
}

function SignalCard({
  icon,
  label,
  question,
  body,
}: {
  icon: React.ReactNode
  label: string
  question: string
  body: string
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-muted/60 p-1.5 text-muted-foreground">{icon}</span>
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      </div>
      <div className="text-sm font-semibold text-foreground">{question}</div>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}

function ModeCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}

function SourceRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4">
      <span className="rounded-full bg-muted/60 p-1.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
