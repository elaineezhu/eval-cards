import { CorpusDashboard } from "@/components/signals/corpus-dashboard"
import { Navigation } from "@/components/navigation"
import { fetchCorpusAggregates, fetchEvalListLite } from "@/lib/hf-data"

export default async function CorpusPage() {
  const [aggregates, evalList] = await Promise.all([
    fetchCorpusAggregates(),
    fetchEvalListLite().catch(() => ({ evals: [] })),
  ])

  const completenessScores = evalList.evals
    .map((entry) => entry.evalcards?.annotations?.reporting_completeness?.completeness_score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score))

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        {aggregates ? (
          <CorpusDashboard aggregates={aggregates} completenessScores={completenessScores} />
        ) : (
          <section className="rounded-2xl border border-dashed border-border/70 bg-card p-8 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Interpretive signals
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Corpus aggregates are not available yet</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              The frontend is ready for `corpus-aggregates.json`, but this cached backend snapshot does not include it yet.
              Once the dataset ships the file, this page will render reproducibility, completeness, provenance, and comparability rollups.
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
