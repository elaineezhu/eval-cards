"use client"

// Merged all-sources benchmark page (merged-benchmark-view spec F3/F4).
//
// One page per resolved canonical benchmark, at observation grain: one
// row per (model, source) score, flat-interleaved and sorted by
// score_canonical in the metric's direction (spec Q6). Echo
// republications stay visible (Q3). Controls:
//   - Source narrower: NAVIGATES to the per-source eval page (Q5 —
//     unlike the state-swap SplitPicker on per-source pages).
//   - Metric switcher: re-queries via ?metric= without navigation.
//   - Slice selector (grain='slice' pages only): ?slice=.
// ?source= pre-highlights the clicked browse-tree leaf's source rows.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle } from "lucide-react"

import { fetchMergedBenchmarkSummary } from "@/lib/dashboard-data-client"
import { isMergedBenchmarkSummary } from "@/lib/merged-adapter"
import type { MergedBenchmarkSummary, MergedObservationRow } from "@/lib/eval-processing"
import { formatDateISO, routeIdToPath } from "@/lib/utils"

const PAGE_SIZE = 50

/** Plain numeric formatting on the metric's canonical scale — no unit
 *  guessing (the whole point of score_canonical is one declared scale). */
function formatScore(value: number): string {
  if (!Number.isFinite(value)) return "—"
  if (Math.abs(value) >= 100) return value.toFixed(1)
  if (Math.abs(value) >= 10) return value.toFixed(2)
  return value.toFixed(3).replace(/0+$/g, "").replace(/\.$/, "")
}

export function MergedBenchmarkView({ benchmarkId }: { benchmarkId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sourceParam = searchParams.get("source")
  const metricParam = searchParams.get("metric")
  const sliceParam = searchParams.get("slice")

  const [summary, setSummary] = useState<MergedBenchmarkSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchMergedBenchmarkSummary(benchmarkId, {
      metricId: metricParam ?? undefined,
      sliceId: sliceParam ?? undefined,
    })
      .then((payload) => {
        if (cancelled) return
        if (!isMergedBenchmarkSummary(payload)) {
          setError("This snapshot has no merged page for this benchmark.")
          return
        }
        setSummary(payload)
        setError(null)
        setPage(1)
        document.title = `${payload.display_name} | Benchmark`
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError("Benchmark not found")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [benchmarkId, metricParam, sliceParam])

  // Update a query param in place (no navigation) so metric/slice
  // selections survive reload and back.
  const setQueryParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const selectedMetricId = summary?.selected_metric_id
  const selectedMetric = useMemo(
    () => summary?.metrics.find((m) => m.metric_id === selectedMetricId) ?? null,
    [summary, selectedMetricId],
  )
  const isPreferredMetric = summary != null && selectedMetricId === summary.preferred_metric_id

  // Counts at the SELECTED metric's grain (hero scalar counts are at the
  // default metric's).
  const resultsCount = selectedMetric?.results_count ?? summary?.results_count ?? 0
  const sourcesCount = selectedMetric?.sources_count ?? summary?.sources_count ?? 0
  const modelsCount = selectedMetric?.models_count ?? summary?.models_count ?? 0

  const sourceDisplayBySlug = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of summary?.aggregate_sources ?? []) {
      map.set(s.composite_slug, s.composite_display_name || s.composite_slug)
    }
    return map
  }, [summary])

  // Dense rank on score_canonical: ties share a rank, the next distinct
  // score gets rank+1. Rows without a canonical score (flagged) rank "—".
  const rankedRows = useMemo(() => {
    const rows = summary?.results ?? []
    let rank = 0
    let previous: number | null = null
    return rows.map((row) => {
      if (row.score_canonical == null) {
        return { row, rank: null as number | null }
      }
      if (previous === null || row.score_canonical !== previous) {
        rank += 1
        previous = row.score_canonical
      }
      return { row, rank: rank as number | null }
    })
  }, [summary])

  const pagedRows = rankedRows.slice(0, page * PAGE_SIZE)
  const remaining = rankedRows.length - pagedRows.length

  const disclosureSources = (summary?.aggregate_sources ?? []).filter(
    (s) => !s.reports_preferred || s.slice_only,
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="kicker">Loading merged benchmark…</div>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="kicker">{error ?? "Benchmark not found"}</div>
      </div>
    )
  }

  const preselectedSource =
    sourceParam && sourceDisplayBySlug.has(sourceParam) ? sourceParam : ""

  return (
    <div className="space-y-8">
      {/* HERO ------------------------------------------------------------- */}
      <header className="motion-academic-enter">
        <div
          className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: "var(--fg-subtle)" }}
        >
          Merged benchmark · all sources
        </div>
        <h1 className="ec-page-h1">{summary.display_name}</h1>
        <div
          className="mb-4 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em]"
          style={{ color: "var(--fg-muted)" }}
        >
          {summary.family_display_name && summary.family_display_name !== summary.display_name && (
            <>
              <span>{summary.family_display_name}</span>
              <span style={{ color: "var(--fg-subtle)" }}>·</span>
            </>
          )}
          <span>{selectedMetric?.display_name ?? summary.preferred_metric_display_name}</span>
          <span style={{ color: "var(--fg-subtle)" }}>·</span>
          <span>{summary.selected_lower_is_better ? "Lower is better ↓" : "Higher is better ↑"}</span>
        </div>

        <div className="ec-page-meta">
          <div className="ec-page-meta-item">
            <span className="ec-page-meta-item-l">Results</span>
            <span className="ec-page-meta-item-v">
              {resultsCount.toLocaleString()} from {sourcesCount.toLocaleString()}{" "}
              {sourcesCount === 1 ? "source" : "sources"}
            </span>
          </div>
          <div className="ec-page-meta-item">
            <span className="ec-page-meta-item-l">Models</span>
            <span className="ec-page-meta-item-v">{modelsCount.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* CONTROLS ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex flex-col gap-1">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: "var(--fg-subtle)" }}
          >
            Source
          </span>
          <select
            className="ec-select"
            value={preselectedSource}
            onChange={(e) => {
              const slug = e.target.value
              if (!slug) {
                // Back to "All sources": clear the pre-highlight param.
                const params = new URLSearchParams(searchParams.toString())
                params.delete("source")
                const qs = params.toString()
                router.replace(qs ? `${pathname}?${qs}` : pathname)
                return
              }
              const source = summary.aggregate_sources.find((s) => s.composite_slug === slug)
              if (source?.evaluation_id) {
                // Navigate-on-select to the per-source page (spec Q5).
                router.push(`/evals/${routeIdToPath(source.evaluation_id)}`)
              }
            }}
          >
            <option value="">All sources (merged)</option>
            {summary.aggregate_sources.map((source) => (
              <option
                key={source.composite_slug}
                value={source.composite_slug}
                disabled={!source.evaluation_id}
              >
                {source.composite_display_name || source.composite_slug} ({source.models_count}{" "}
                {source.models_count === 1 ? "model" : "models"})
                {source.slice_only ? " — slice-level only" : ""}
              </option>
            ))}
          </select>
        </label>

        {summary.metrics.length > 1 && (
          <label className="flex flex-col gap-1">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{ color: "var(--fg-subtle)" }}
            >
              Metric
            </span>
            <select
              className="ec-select"
              value={selectedMetricId}
              onChange={(e) => {
                const metricId = e.target.value
                setQueryParam("metric", metricId === summary.preferred_metric_id ? null : metricId)
              }}
            >
              {summary.metrics.map((metric) => (
                <option key={metric.metric_id} value={metric.metric_id}>
                  {metric.display_name} ({metric.sources_count}{" "}
                  {metric.sources_count === 1 ? "source" : "sources"},{" "}
                  {metric.results_count} {metric.results_count === 1 ? "result" : "results"})
                </option>
              ))}
            </select>
          </label>
        )}

        {summary.grain === "slice" && (summary.slices?.length ?? 0) > 0 && (
          <label className="flex flex-col gap-1">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{ color: "var(--fg-subtle)" }}
            >
              Slice
            </span>
            <select
              className="ec-select"
              value={summary.selected_slice_id ?? ""}
              onChange={(e) => setQueryParam("slice", e.target.value || null)}
            >
              {(summary.slices ?? []).map((slice) => (
                <option key={slice.slice_id} value={slice.slice_id}>
                  {slice.display_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {summary.grain === "slice" && (
        <p className="text-[13px] leading-[1.6]" style={{ color: "var(--fg-muted)", maxWidth: 720 }}>
          This benchmark reports slice-level results only; each slice merges across sources.
        </p>
      )}

      {/* OBSERVATION TABLE ------------------------------------------------- */}
      {rankedRows.length === 0 ? (
        <div className="ec-card" style={{ padding: 32, textAlign: "center" }}>
          <div className="kicker">No results reported for this metric</div>
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ border: "1px solid var(--border-soft)" }}>
          <table className="ec-htable">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Model</th>
                <th className="num">
                  {selectedMetric?.display_name ?? summary.preferred_metric_display_name}
                </th>
                <th>Source</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map(({ row, rank }, idx) => (
                <ObservationRow
                  key={`${row.evaluation_id}::${row.model_key ?? row.model_info.id}::${idx}`}
                  row={row}
                  rank={rank}
                  highlighted={Boolean(preselectedSource) && row.composite_slug === preselectedSource}
                  sourceDisplayBySlug={sourceDisplayBySlug}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {remaining > 0 && (
        <div className="text-center">
          <button type="button" className="btn-ec outline" onClick={() => setPage((p) => p + 1)}>
            Load more ({remaining} remaining)
          </button>
        </div>
      )}

      {/* DISCLOSURE NOTES -------------------------------------------------- */}
      {disclosureSources.length > 0 && (
        <div className="space-y-1.5">
          {disclosureSources.map((source) => {
            const name = source.composite_display_name || source.composite_slug
            const note = source.slice_only
              ? "reports slice-level results only."
              : "reports only other metrics for this benchmark (see metric switcher)."
            return (
              <p
                key={`${source.composite_slug}-${source.slice_only ? "slice" : "metric"}`}
                className="text-[12px] leading-[1.6]"
                style={{ color: "var(--fg-muted)" }}
              >
                {source.evaluation_id ? (
                  <Link
                    href={`/evals/${routeIdToPath(source.evaluation_id)}`}
                    className="underline underline-offset-2 hover:text-[color:var(--accent)]"
                    style={{ color: "var(--fg)" }}
                  >
                    {name}
                  </Link>
                ) : (
                  <span style={{ color: "var(--fg)" }}>{name}</span>
                )}{" "}
                {note}
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ObservationRow({
  row,
  rank,
  highlighted,
  sourceDisplayBySlug,
}: {
  row: MergedObservationRow
  rank: number | null
  highlighted: boolean
  sourceDisplayBySlug: Map<string, string>
}) {
  const isFlagged = row.scale_conversion === "flagged"
  const sourceName =
    row.composite_display_name ??
    sourceDisplayBySlug.get(row.composite_slug) ??
    row.composite_slug
  const modelHref = row.model_route_id ? `/models/${routeIdToPath(row.model_route_id)}` : null

  return (
    <tr style={highlighted ? { background: "var(--bg-warm)" } : undefined}>
      <td
        className="font-mono tabular-nums"
        style={{ color: rank != null && rank <= 3 ? "var(--accent)" : "var(--fg-muted)", fontSize: 12 }}
      >
        {rank ?? "—"}
      </td>
      <td>
        {modelHref ? (
          <Link
            href={modelHref}
            className="font-semibold text-[14px] hover:text-[color:var(--accent)] transition-colors"
            style={{ color: "var(--fg)", textDecoration: "none" }}
          >
            {row.model_info.name}
          </Link>
        ) : (
          <span className="font-semibold text-[14px]">{row.model_info.name}</span>
        )}
        {row.model_info.developer && (
          <div
            className="font-mono text-[10px] uppercase tracking-[0.08em] mt-0.5"
            style={{ color: "var(--fg-subtle)" }}
          >
            {row.model_info.developer}
          </div>
        )}
      </td>
      <td className="num font-mono tabular-nums" style={{ fontWeight: 600, fontSize: 14 }}>
        {isFlagged ? (
          <span
            title="Unconverted: this score could not be safely converted to the metric's canonical scale."
            style={{ color: "var(--fg-muted)" }}
          >
            <AlertTriangle className="inline h-3 w-3 mr-1 align-[-1px]" aria-hidden />
            {formatScore(row.score)}
          </span>
        ) : (
          formatScore(row.score_canonical ?? row.score)
        )}
      </td>
      <td>
        <Link
          href={`/evals/${routeIdToPath(row.evaluation_id)}`}
          className="text-[13px] hover:text-[color:var(--accent)] transition-colors"
          style={{ color: "var(--fg-muted)", textDecoration: "none" }}
        >
          {sourceName}
        </Link>
      </td>
      <td className="font-mono tabular-nums" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
        {formatDateISO(row.evaluation_timestamp)}
      </td>
    </tr>
  )
}
