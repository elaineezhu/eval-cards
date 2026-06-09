"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Search } from "lucide-react"

import { EvalCard } from "@/components/eval-card"
import { InfiniteScrollSentinel } from "@/components/infinite-scroll"
import { Navigation } from "@/components/navigation"
import { VerifiedBadge } from "@/components/signals/verified-badge"
import { fetchEvalList } from "@/lib/dashboard-data-client"
import type { BenchmarkEvalListItem } from "@/lib/eval-processing"
import { getEvalsForEvaluator } from "@/lib/evaluators"

const PAGE_SIZE = 24

function EvaluatorDetailInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const verifiedOnly = searchParams.get("verified") === "1" || searchParams.get("verified") === "true"

  // The slug is a single URL-safe segment, but the route is a catch-all
  // ([...id]) to match the developers/models pattern. Join just in case.
  const slug = useMemo(() => {
    const raw = params.id as string | string[] | undefined
    const joined = Array.isArray(raw) ? raw.join("/") : (raw ?? "")
    return decodeURIComponent(joined)
  }, [params.id])

  const [allEvals, setAllEvals] = useState<BenchmarkEvalListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    fetchEvalList()
      .then((list) => setAllEvals(list.evals))
      .catch((err) => {
        console.error(err)
        setError("Failed to load evaluations")
      })
      .finally(() => setLoading(false))
  }, [])

  const { name, isVerified, evals } = useMemo(
    () => getEvalsForEvaluator(allEvals, slug, { verifiedOnly }),
    [allEvals, slug, verifiedOnly],
  )

  const filteredEvals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const list = query
      ? evals.filter((ev) => {
          const haystacks = [
            ev.evaluation_name,
            ev.family_display_name,
            ev.composite_benchmark_name,
          ]
          return haystacks.some((v) => v?.toLowerCase().includes(query))
        })
      : evals
    return list.slice().sort((a, b) => a.evaluation_name.localeCompare(b.evaluation_name))
  }, [evals, searchQuery])

  // Quantified facts for the header, derived from the org's owned evals.
  // familyCount = distinct benchmark families covered; verifiedCount = evals
  // where this org is a verified evaluator.
  const { familyCount, verifiedCount } = useMemo(() => {
    const families = new Set<string>()
    let verified = 0
    for (const ev of evals) {
      const fam = ev.family_display_name?.trim()
      if (fam) families.add(fam)
      if (name && (ev.verified_evaluator_names ?? []).includes(name)) verified += 1
    }
    return {
      familyCount: families.size,
      verifiedCount: verified,
    }
  }, [evals, name])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchQuery, slug, verifiedOnly])

  const visibleEvals = useMemo(
    () => filteredEvals.slice(0, visibleCount),
    [filteredEvals, visibleCount],
  )
  const hasMore = visibleCount < filteredEvals.length
  const handleLoadMore = useCallback(() => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredEvals.length))
  }, [filteredEvals.length])

  const handleBack = useCallback(() => {
    router.push(verifiedOnly ? "/evals?groupBy=evaluator&verified=1" : "/evals?groupBy=evaluator")
  }, [router, verifiedOnly])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="ec-page">
          <div className="flex h-96 items-center justify-center">
            <div className="kicker">Loading evaluator…</div>
          </div>
        </main>
      </div>
    )
  }

  // Slug resolved to no org (bad/expired link) — or the org has no evals
  // under the active verified filter.
  if (error || !name) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="ec-page">
          <div className="flex flex-col items-center justify-center h-96 space-y-4">
            <div className="kicker">{error ?? "Evaluator not found"}</div>
            <button type="button" onClick={handleBack} className="btn-ec outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto w-full max-w-[96rem] px-4 pt-12 pb-24 sm:px-8">
        {/* BREADCRUMB ----------------------------------------------- */}
        <button
          type="button"
          onClick={handleBack}
          className="ec-crumb mb-4 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-3 w-3" />
          Evaluators
        </button>

        {/* HEADER --------------------------------------------------- */}
        <div className="kicker">Evaluator</div>
        <h1 className="ec-page-h1 inline-flex items-center gap-2">
          {name}
          {isVerified && <VerifiedBadge verified size="md" />}
        </h1>
        <div
          className="mb-5 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em]"
          style={{ color: "var(--fg-muted)" }}
        >
          <span>Reporting organisation</span>
          <span style={{ color: "var(--fg-subtle)" }}>·</span>
          <span>
            {familyCount} {familyCount === 1 ? "family" : "families"}
          </span>
          <span style={{ color: "var(--fg-subtle)" }}>·</span>
          <span>{verifiedCount} verified</span>
        </div>
        <p className="ec-page-lede">
          Reported <strong>{filteredEvals.length.toLocaleString()}</strong>{" "}
          {filteredEvals.length === 1 ? "evaluation" : "evaluations"} across{" "}
          <strong>{familyCount.toLocaleString()}</strong>{" "}
          {familyCount === 1 ? "benchmark family" : "benchmark families"}
          {verifiedCount > 0 && (
            <>
              , <strong>{verifiedCount.toLocaleString()}</strong> verified
            </>
          )}
          {verifiedOnly ? " (verified submissions only)" : ""}.
        </p>

        <div className="ec-page-meta mt-2">
          <div className="ec-page-meta-item">
            <span className="ec-page-meta-item-l">Evaluations</span>
            <span className="ec-page-meta-item-v">{filteredEvals.length.toLocaleString()}</span>
          </div>
          <div className="ec-page-meta-item">
            <span className="ec-page-meta-item-l">Verified</span>
            <span className="ec-page-meta-item-v">{verifiedCount.toLocaleString()}</span>
          </div>
          <div className="ec-page-meta-item">
            <span className="ec-page-meta-item-l">Families</span>
            <span className="ec-page-meta-item-v">{familyCount.toLocaleString()}</span>
          </div>
        </div>

        {/* META + FILTER BAR --------------------------------------- */}
        <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-[color:var(--border-soft)] py-4">
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.1em] uppercase text-[color:var(--fg-subtle)]">
            <span>
              <span className="text-[color:var(--fg)] tabular-nums font-semibold mr-1">
                {filteredEvals.length.toLocaleString()}
              </span>
              {filteredEvals.length === 1 ? "evaluation" : "evaluations"}
            </span>
          </div>

          <span className="hidden h-5 w-px bg-[color:var(--border-soft)] sm:block" />

          <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--fg-subtle)]" />
            <input
              className="ec-input pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search evaluations…"
            />
          </div>
        </div>

        {/* EVAL CARDS ---------------------------------------------- */}
        {filteredEvals.length === 0 ? (
          <div className="border border-dashed border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] py-12 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--fg-subtle)]">
            No evaluations match the current filters
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleEvals.map((ev, i) => (
              <EvalCard key={ev.evaluation_id} summary={ev} delayMs={Math.min(i, 8) * 40} />
            ))}
          </div>
        )}

        <InfiniteScrollSentinel
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          loadingLabel="Loading more…"
          endLabel={`Showing ${Math.min(visibleCount, filteredEvals.length).toLocaleString()} of ${filteredEvals.length.toLocaleString()} evaluations`}
        />
      </main>
    </div>
  )
}

export default function EvaluatorDetailPage() {
  return (
    <Suspense fallback={null}>
      <EvaluatorDetailInner />
    </Suspense>
  )
}
