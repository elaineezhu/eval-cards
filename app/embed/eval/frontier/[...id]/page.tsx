"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { ScoreDistribution } from "@/components/score-distribution"
import { fetchEvalSummary } from "@/lib/dashboard-data-client"
import { getMetricChipLabel } from "@/lib/metric-labels"
import { routeIdFromSegments } from "@/lib/utils"
import type { BenchmarkEvalSummary } from "@/lib/eval-processing"

/**
 * Embed-only render of the Pareto-frontier (score vs release date)
 * scatter for one eval. Reuses ScoreDistribution but opens it in
 * frontier view by default.
 *
 * Slice-aware: when the eval has subtask slices (e.g. Global MMLU's
 * per-language splits), renders a SPLIT dropdown above the plot —
 * mirroring the distribution embed.
 *
 * Query params:
 *   ?slice=<subtask_key> — start with this slice selected
 */
export default function EmbedEvalFrontier() {
  const params = useParams()
  const searchParams = useSearchParams()
  const evalId = routeIdFromSegments(params.id)
  const sliceParam = searchParams.get("slice")

  const [summary, setSummary] = useState<BenchmarkEvalSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchEvalSummary(evalId)
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [evalId])

  // Slice axis — present when the eval has multiple subtask-scope metrics
  // sharing a primary root metric (e.g. Global MMLU's 24 language splits).
  const sliceAxis = useMemo(() => {
    if (!summary) return null
    const metrics = summary.leaderboard_metrics ?? []
    const primary = metrics.find((m) => m.scope !== "subtask")
    if (!primary?.column_key) return null
    const seen = new Map<string, string>()
    for (const m of metrics) {
      if (m.scope === "subtask" && m.subtask_key && !seen.has(m.subtask_key)) {
        seen.set(m.subtask_key, m.subtask_name ?? m.subtask_key)
      }
    }
    if (seen.size <= 1) return null
    return {
      primaryColumn: primary.column_key,
      primaryLabel: getMetricChipLabel(primary),
      unit: primary.unit ?? summary.metric_config.unit,
      lowerIsBetter: Boolean(primary.lower_is_better ?? summary.metric_config.lower_is_better),
      slices: Array.from(seen, ([key, label]) => ({ key, label })),
    }
  }, [summary])

  const ALL_SLICE_KEY = "__all__"
  const [activeSlice, setActiveSlice] = useState<string>(() => {
    if (sliceParam && sliceParam.trim()) return sliceParam.trim()
    return ALL_SLICE_KEY
  })
  useEffect(() => {
    if (!sliceAxis) return
    if (activeSlice === ALL_SLICE_KEY) return
    if (!sliceAxis.slices.some((s) => s.key === activeSlice)) {
      setActiveSlice(ALL_SLICE_KEY)
    }
  }, [activeSlice, sliceAxis])

  const series = useMemo(() => {
    if (!summary) return null
    const rows = summary.leaderboard_rows ?? []

    // Slice-axis path: render one series for the active slice (Overall or
    // a specific subtask). Drives the SPLIT dropdown UX.
    if (sliceAxis) {
      const columnKey =
        activeSlice === ALL_SLICE_KEY
          ? sliceAxis.primaryColumn
          : `${sliceAxis.primaryColumn}::${activeSlice}`
      const points: { score: number; releaseDate: string | null; modelName: string }[] = []
      for (const row of rows) {
        const raw = (row.values as Record<string, unknown> | undefined)?.[columnKey]
        const numeric = typeof raw === "number" ? raw : Number(raw)
        if (!Number.isFinite(numeric)) continue
        const modelInfo = (row as { model_info?: { name?: string; release_date?: string | null } }).model_info
        points.push({
          score: numeric,
          modelName: modelInfo?.name ?? "",
          releaseDate: modelInfo?.release_date ?? null,
        })
      }
      if (points.length < 3) return null
      const sliceLabel =
        activeSlice === ALL_SLICE_KEY
          ? "Overall"
          : sliceAxis.slices.find((s) => s.key === activeSlice)?.label ?? activeSlice
      return [
        {
          key: `${sliceAxis.primaryColumn}::${activeSlice}`,
          label: `${sliceAxis.primaryLabel} · ${sliceLabel}`,
          values: points.map((p) => p.score),
          unit: sliceAxis.unit,
          lowerIsBetter: sliceAxis.lowerIsBetter,
          points,
        },
      ]
    }

    // Non-slice path: one series per metric. ScoreDistribution surfaces a
    // metric chip picker.
    const metrics = summary.leaderboard_metrics ?? []
    const built = metrics
      .map((metric) => {
        const columnKey = metric.column_key ?? metric.metric_summary_id
        if (!columnKey) return null
        const points: { score: number; releaseDate: string | null; modelName: string }[] = []
        for (const row of rows) {
          const raw = (row.values as Record<string, unknown> | undefined)?.[columnKey]
          const numeric = typeof raw === "number" ? raw : Number(raw)
          if (!Number.isFinite(numeric)) continue
          const modelInfo = (row as { model_info?: { name?: string; release_date?: string | null } }).model_info
          points.push({
            score: numeric,
            modelName: modelInfo?.name ?? "",
            releaseDate: modelInfo?.release_date ?? null,
          })
        }
        if (points.length < 3) return null
        return {
          key: columnKey,
          label: getMetricChipLabel(metric),
          values: points.map((p) => p.score),
          unit: metric.unit ?? summary.metric_config.unit,
          lowerIsBetter: Boolean(metric.lower_is_better ?? summary.metric_config.lower_is_better),
          points,
        }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
    return built.length > 0 ? built : null
  }, [summary, sliceAxis, activeSlice])

  if (error) {
    return (
      <div className="font-mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
        Failed to load: {error}
      </div>
    )
  }
  if (!summary) {
    return (
      <div
        className="font-mono uppercase"
        style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--fg-subtle)" }}
      >
        Loading…
      </div>
    )
  }
  if (!series) {
    return (
      <div className="font-mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
        No score data available for this evaluation yet.
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3">
        <div
          className="font-mono uppercase"
          style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
        >
          Pareto frontier
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            color: "var(--fg)",
            marginTop: 2,
          }}
        >
          {summary.evaluation_name}
        </div>
      </div>
      {sliceAxis && (
        <div className="mb-3 flex items-center gap-3">
          <span
            className="font-mono uppercase shrink-0"
            style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
          >
            Split
          </span>
          <select
            className="ec-select"
            value={activeSlice}
            onChange={(e) => setActiveSlice(e.target.value)}
          >
            <option value={ALL_SLICE_KEY}>Overall</option>
            {sliceAxis.slices.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <ScoreDistribution series={series} defaultView="frontier" showViewToggle={false} />
    </div>
  )
}
