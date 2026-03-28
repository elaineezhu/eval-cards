import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Database,
  FileCode,
  FlaskConical,
  LibraryBig,
  Scale,
  Search,
  ShieldAlert,
} from "lucide-react"

import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <PageHeader
        eyebrow="About"
        title="About"
        description="A benchmark-first interface for reading AI evaluation evidence with separate researcher and policy lenses."
        metaItems={[
          { label: "Modes", value: "Research + Policy" },
          { label: "Source", value: "Structured JSON" },
        ]}
      />

      <main className="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-8">
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="overflow-hidden border-border/70">
              <CardHeader className="border-b bg-gradient-to-br from-muted/35 via-background to-background pb-4">
                <div className="flex items-center gap-2">
                  <LibraryBig className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">What This Demo Is</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-6 text-sm leading-7 text-muted-foreground">
                <p>
                  Eval Cards is a structured interface for browsing reported AI evaluation results. Instead of treating
                  evaluations as scattered tables, blog posts, and benchmark screenshots, it presents them as a
                  comparable evidence layer around models and benchmarks.
                </p>
                <p>
                  The current demo is benchmark-first. It uses model JSON files as the source of truth, derives model
                  and evaluation views from those files, and highlights reporting provenance, benchmark scope, setup
                  differences, and reproducibility gaps directly in the UI.
                </p>
                <p>
                  The goal is not just to show scores. It is to help readers understand who reported them, what was
                  tested, whether comparisons are fair, and where the evidence is thin.
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/70">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">What You Can Explore</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid gap-3">
                  <SurfaceNote
                    icon={<Database className="h-4 w-4 text-sky-600" />}
                    title="Model snapshots"
                    body="See benchmark breadth, reporting sources, top signals, and accountability context for a given model."
                  />
                  <SurfaceNote
                    icon={<BookOpenText className="h-4 w-4 text-rose-600" />}
                    title="Evaluation leaderboards"
                    body="See which models were reported on a benchmark, how they rank, and what methodological or reporting context is attached."
                  />
                  <SurfaceNote
                    icon={<FileCode className="h-4 w-4 text-amber-600" />}
                    title="Benchmark detail"
                    body="Compare setup changes, subtasks, and score spread within a single model’s reported benchmark results."
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-sky-600" />
                  <CardTitle className="text-lg">Research Mode</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Research mode foregrounds comparability, benchmark setup, eval libraries, generation config, and
                  score behavior.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Methodology first</Badge>
                  <Badge variant="outline">Config-aware comparisons</Badge>
                  <Badge variant="outline">Sample and metric detail</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Scale className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Policy Mode</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Policy mode translates the same evidence into plain-language interpretation, evaluator independence,
                  caveats, and comparability warnings.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Plain-language summaries</Badge>
                  <Badge variant="outline">Accountability cues</Badge>
                  <Badge variant="outline">Visible limitations</Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <InfoCard
              icon={<BadgeCheck className="h-5 w-5 text-emerald-600" />}
              title="What Counts As Stronger Evidence"
              body="Independent reporting, linked sources, benchmark breadth, and complete generation settings all make a score easier to trust and compare."
            />
            <InfoCard
              icon={<ShieldAlert className="h-5 w-5 text-amber-600" />}
              title="What To Treat Carefully"
              body="Missing generation config, mixed reporting sources, setup-sensitive benchmarks, and large model-size differences can all weaken apples-to-apples comparison."
            />
            <InfoCard
              icon={<Database className="h-5 w-5 text-sky-600" />}
              title="Current Data Model"
              body="The app derives its views from JSON files under the top-level data directory. Model-level and evaluation-level summaries are computed from that reporting layer."
            />
          </section>

          <section>
            <Card className="border-border/70">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle className="text-xl">Terminology We Use</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                <p className="text-sm leading-7 text-muted-foreground">
                  The evaluation community often uses <span className="font-medium text-foreground">benchmark</span>, <span className="font-medium text-foreground">eval</span>, <span className="font-medium text-foreground">metric</span>, and <span className="font-medium text-foreground">task</span> interchangeably. That ambiguity showed up repeatedly in this project, so we use a more operational set of definitions in the interface.
                </p>

                <div className="grid gap-4 md:grid-cols-3">
                  <DefinitionCard
                    title="Single benchmark"
                    definition="An individual evaluation with a defined dataset and scoring method."
                    examples={["GSM8K", "IFEval", "MMLU-Pro"]}
                  />
                  <DefinitionCard
                    title="Composite benchmark"
                    definition="A collection of single benchmarks reported together, often under a unified leaderboard."
                    examples={["Open LLM Leaderboard", "HELM Instruct", "HF Open LLM v2"]}
                  />
                  <DefinitionCard
                    title="Metric"
                    definition="Strictly what is measured and how; not a benchmark nested inside a composite."
                    examples={["Accuracy", "pass@1", "F1", "binary accuracy"]}
                  />
                </div>

                <div className="rounded-2xl border bg-muted/10 p-4 text-sm leading-7 text-muted-foreground">
                  <div className="font-medium text-foreground">Important example</div>
                  <p className="mt-2">
                    If Reward Bench lists <span className="font-medium text-foreground">factuality</span> under a “metrics” heading, we treat that as a <span className="font-medium text-foreground">benchmark</span> in this interface. The <span className="font-medium text-foreground">metric</span> is the scoring rule attached to it, such as binary accuracy.
                  </p>
                  <p className="mt-2">
                    This is also why the Evaluations page can now group <span className="font-medium text-foreground">single benchmarks</span> underneath a <span className="font-medium text-foreground">composite benchmark</span> like HF Open LLM v2 instead of conflating the two.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-border/70">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle className="text-xl">Reading This Interface Responsibly</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
                <GuidanceBlock
                  title="This interface helps you ask:"
                  items={[
                    "What benchmarks were actually reported for this model?",
                    "Who reported those results and how independent were they?",
                    "Are score differences likely to reflect setup changes rather than capability?",
                    "Which benchmarks have broader support versus thin evidence?",
                  ]}
                />
                <GuidanceBlock
                  title="This interface should not imply:"
                  items={[
                    "That a single score is a complete picture of a model.",
                    "That all reported results are directly comparable.",
                    "That missing methodology can be ignored if the numbers look strong.",
                    "That benchmark coverage is the same thing as deployment readiness.",
                  ]}
                />
              </CardContent>
            </Card>
          </section>

          <section className="flex flex-col gap-4 rounded-[1.75rem] border border-border/70 bg-gradient-to-br from-muted/30 via-background to-background p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="text-lg font-semibold">Explore the evidence layer</div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Start from models if you want breadth and reporting context. Start from evaluations if you want a
                benchmark-centric view of model performance and methodology.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/">
                <Button className="gap-2">
                  Explore Models
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/evals">
                <Button variant="outline" className="gap-2">
                  Explore Evaluations
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function DefinitionCard({
  title,
  definition,
  examples,
}: {
  title: string
  definition: string
  examples: string[]
}) {
  return (
    <div className="rounded-2xl border bg-muted/10 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{definition}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((example) => (
          <Badge key={example} variant="outline">
            {example}
          </Badge>
        ))}
      </div>
    </div>
  )
}

function SurfaceNote({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="rounded-2xl border bg-muted/10 p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <div className="font-medium">{title}</div>
      </div>
      <div className="text-sm leading-6 text-muted-foreground">{body}</div>
    </div>
  )
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <Card className="border-border/70">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          {icon}
          <div className="font-semibold">{title}</div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  )
}

function GuidanceBlock({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 rounded-xl bg-muted/10 px-3 py-3">
            <div className="mt-1 h-1.5 w-1.5 rounded-full bg-foreground/60" />
            <div className="text-sm leading-6 text-muted-foreground">{item}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
