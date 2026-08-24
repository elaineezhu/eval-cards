"use client"

import { useMemo, useState } from "react"
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
} from "react"

import {
  feedbackConditionDescription,
  type ComputeMark,
  type FeedbackCondition,
  type ProtocolSeries,
  type ScaffoldContextPayload,
} from "@/lib/collections"

interface ScoreSeries {
  /** Stable key — used by the metric dropdown to switch series. */
  key: string
  /** Short label shown in the dropdown and as the panel sub-title. */
  label: string
  /** Optional longer description shown next to the label. */
  caption?: string
  values: number[]
  unit?: string
  lowerIsBetter?: boolean
  /**
   * Per-model rows for the optional frontier-plot view. When provided
   * (and at least one row carries a parseable releaseDate), the panel
   * exposes a chip toggle that swaps the density curve for a
   * release-date frontier (cumulative best score over time).
   */
  points?: Array<{
    score: number
    releaseDate?: string | null
    modelName?: string | null
  }>
}

interface ScoreDistributionProps {
  /** Single-series shorthand. Either pass `values` (single) or `series` (multi). */
  values?: number[]
  label?: string
  unit?: string
  lowerIsBetter?: boolean
  /** Multi-series — when provided, a dropdown picker swaps between them. */
  series?: ScoreSeries[]
  /** Initial selected key when multi-series. Defaults to first. */
  initialKey?: string
  /** Compact variant — shorter, used for matrix per-column distributions. */
  compact?: boolean
  /** Initial view when the active series supports both modes. Defaults
   *  to "distribution". The /embed/.../frontier route passes "frontier"
   *  to open directly on the Pareto-frontier view. */
  defaultView?: "distribution" | "frontier"
  /** When false, the Distribution/Frontier chip toggle is hidden so the
   *  caller can lock the panel to a single view (e.g. inside an embed
   *  iframe that the user explicitly chose to embed as Distribution
   *  *or* Frontier). The metric chips above still appear when the panel
   *  carries more than one series. Defaults to true. */
  showViewToggle?: boolean
  /** Optional Compute view. Only the eval-detail single-metric
   *  call site passes this — matrix/embed sites must not (their row
   *  shapes carry no protocol fields). */
  protocol?: ProtocolSeries
  /** Optional Context view: the collection's own score placed inside the
   *  community's per-scaffold distribution. Server-built and carried on
   *  the per-source summary; absent everywhere else. */
  context?: ScaffoldContextPayload
}

interface SummaryStats {
  n: number
  min: number
  max: number
  mean: number
  median: number
  q1: number
  q3: number
}

function parseReleaseDate(value: string | null | undefined): number | null {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  // Numeric epoch — treat seconds-since-epoch values as such, ms otherwise.
  const numeric = Number(raw)
  if (!Number.isNaN(numeric) && !raw.includes("-")) {
    const ms = numeric > 1_000_000_000_000 ? numeric : numeric * 1000
    return Number.isFinite(ms) ? ms : null
  }
  const parsed = new Date(raw).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
function formatMonthYear(ms: number): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ""
  return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function computeStats(values: number[]): SummaryStats | null {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return null

  const min = sorted[0]
  const max = sorted[n - 1]
  const mean = sorted.reduce((acc, v) => acc + v, 0) / n

  const quantile = (p: number) => {
    if (n === 1) return sorted[0]
    const pos = (n - 1) * p
    const base = Math.floor(pos)
    const rest = pos - base
    return sorted[base + 1] != null
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base]
  }

  return {
    n,
    min,
    max,
    mean,
    median: quantile(0.5),
    q1: quantile(0.25),
    q3: quantile(0.75),
  }
}

function formatValue(v: number, unit?: string) {
  const abs = Math.abs(v)
  let formatted: string
  if (abs >= 100) formatted = v.toFixed(1)
  else if (abs >= 10) formatted = v.toFixed(2)
  else formatted = v.toFixed(3).replace(/0+$/g, "").replace(/\.$/, "")
  return unit ? `${formatted} ${unit}` : formatted
}

/**
 * Continuous-density distribution plot.
 *
 * Builds a smoothed kernel density estimate (KDE) from the raw values rather
 * than a binned histogram, which reads as a continuous probability-weight
 * curve in the paper's hairline style. Median and mean are rendered as
 * vertical rules on top of the curve; IQR is a bracket along the baseline.
 *
 * Multi-series mode shows a small dropdown inside the panel header so a
 * caller (e.g. a multi-metric leaderboard) can stack metrics into one
 * visualization the user swaps between, instead of rendering N panels.
 */
export function ScoreDistribution({
  values,
  label,
  unit,
  lowerIsBetter,
  series,
  initialKey,
  compact = false,
  defaultView,
  showViewToggle = true,
  protocol,
  context,
}: ScoreDistributionProps) {
  // Normalize: either we got a single series (via values) or many.
  const seriesList: ScoreSeries[] = useMemo(() => {
    if (series && series.length > 0) return series
    if (values && values.length > 0) {
      return [{ key: "__single", label: label ?? "Score", values, unit, lowerIsBetter }]
    }
    return []
  }, [series, values, label, unit, lowerIsBetter])

  const [activeKey, setActiveKey] = useState<string>(
    () => initialKey ?? series?.[0]?.key ?? "__single",
  )

  const active =
    seriesList.find((s) => s.key === activeKey) ?? seriesList[0]

  const stats = useMemo(() => (active ? computeStats(active.values) : null), [active])

  // Frontier-plot data: parse release dates, sort by time, then walk the
  // sequence emitting an event whenever a model improves on the best
  // score seen so far. Honours lowerIsBetter so e.g. "Mean Response
  // Time · ms" shows the frontier descending instead of climbing.
  const frontier = useMemo(() => {
    if (!active?.points || active.points.length === 0) return null
    const lowerIsBetter = active.lowerIsBetter ?? false
    const parsed = active.points
      .map((p) => {
        const t = parseReleaseDate(p.releaseDate)
        if (t == null) return null
        if (!Number.isFinite(p.score)) return null
        return { time: t, score: p.score, name: p.modelName ?? "" }
      })
      .filter((p): p is { time: number; score: number; name: string } => p !== null)
      .sort((a, b) => a.time - b.time)

    if (parsed.length < 2) return null

    let best = lowerIsBetter ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
    const events: typeof parsed = []
    for (const p of parsed) {
      const better = lowerIsBetter ? p.score < best : p.score > best
      if (better) {
        best = p.score
        events.push(p)
      }
    }
    if (events.length < 2) return null
    return { events, samples: parsed }
  }, [active])

  const canShowFrontier = frontier != null
  const canShowCompute = (protocol?.marks.length ?? 0) > 0
  const canShowContext = (context?.models.length ?? 0) > 0
  const [view, setView] = useState<"distribution" | "frontier" | "compute" | "context">(
    defaultView ?? "distribution",
  )
  // If the active series doesn't support the selected view (e.g. user
  // switched to a metric whose models don't carry release_date), fall
  // back to the distribution view rather than rendering an empty panel.
  const effectiveView =
    view === "frontier" && canShowFrontier
      ? "frontier"
      : view === "compute" && canShowCompute
        ? "compute"
        : view === "context" && canShowContext
          ? "context"
          : "distribution"
  // When the caller hides the toggle (embed locks to one view), force the
  // panel to whatever defaultView/view it was created with — the user
  // can't switch, so any "frontier" inference must come from props.
  const renderViewToggle = showViewToggle && (canShowFrontier || canShowCompute || canShowContext)
  const availableViews = [
    "distribution" as const,
    ...(canShowFrontier ? ["frontier" as const] : []),
    ...(canShowCompute ? ["compute" as const] : []),
    ...(canShowContext ? ["context" as const] : []),
  ]

  const density = useMemo(() => {
    if (!active || !stats) return null
    if (stats.max === stats.min) {
      return { points: [{ x: stats.min, y: 1 }], maxY: 1 }
    }
    const sorted = active.values
      .filter((v) => Number.isFinite(v))
      .slice()
      .sort((a, b) => a - b)
    const n = sorted.length
    if (n === 0) return null

    // Silverman's rule of thumb for bandwidth.
    const variance =
      sorted.reduce((acc, v) => acc + (v - stats.mean) ** 2, 0) / n
    const stdDev = Math.sqrt(variance)
    const iqr = stats.q3 - stats.q1
    const sigma = iqr > 0 ? Math.min(stdDev, iqr / 1.34) : stdDev || (stats.max - stats.min) / 6
    const bandwidth = Math.max(
      1.06 * sigma * Math.pow(n, -0.2),
      (stats.max - stats.min) / 80,
    )

    const sampleCount = compact ? 80 : 140
    const range = stats.max - stats.min
    const xs: number[] = []
    for (let i = 0; i < sampleCount; i++) {
      xs.push(stats.min + (range * i) / (sampleCount - 1))
    }

    const ys = xs.map((x) => {
      let sum = 0
      for (const v of sorted) {
        const u = (x - v) / bandwidth
        sum += Math.exp(-0.5 * u * u)
      }
      return sum / (n * bandwidth * Math.sqrt(2 * Math.PI))
    })

    const maxY = Math.max(...ys, 1e-9)
    const points = xs.map((x, i) => ({ x, y: ys[i] }))
    return { points, maxY }
  }, [active, stats, compact])

  if (!active || !stats || !density) return null

  const width = 100
  const plotHeight = compact ? 28 : 56
  const fullRange = stats.max - stats.min || 1
  const markerX = (v: number) => ((v - stats.min) / fullRange) * width
  const markerY = (y: number) => plotHeight - (y / density.maxY) * (plotHeight - 4)

  const path = density.points
    .map((p, i) => {
      const x = markerX(p.x)
      const y = markerY(p.y)
      return `${i === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`
    })
    .join(" ")
  const fillPath = `${path} L${width.toFixed(3)},${plotHeight.toFixed(3)} L0,${plotHeight.toFixed(3)} Z`

  const captionItems: Array<{ label: string; value: string; key: string }> = [
    { key: "n", label: "n", value: stats.n.toString() },
    { key: "min", label: "min", value: formatValue(stats.min, active.unit) },
    { key: "q1", label: "q1", value: formatValue(stats.q1, active.unit) },
    { key: "median", label: "median", value: formatValue(stats.median, active.unit) },
    { key: "mean", label: "mean", value: formatValue(stats.mean, active.unit) },
    { key: "q3", label: "q3", value: formatValue(stats.q3, active.unit) },
    { key: "max", label: "max", value: formatValue(stats.max, active.unit) },
  ]

  const directionHint = active.lowerIsBetter ? "lower is better ←" : "higher is better →"
  const showPicker = seriesList.length > 1

  return (
    <div
      style={{
        padding: compact ? "10px 12px" : "16px 20px",
        border: "1px solid var(--border-soft)",
        background: "var(--bg)",
      }}
    >
      {!compact && (
        <div className="mb-3 space-y-2">
          {/* Row 1 — View toggle (left) + direction hint (right). The
              kicker label makes it clear that these chips switch the
              chart type, distinguishing them from the metric chips
              below. */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="font-mono uppercase shrink-0"
                style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
              >
                {renderViewToggle ? "View" : "Score distribution"}
              </span>
              {renderViewToggle && (
                <div
                  role="tablist"
                  aria-label="Chart view"
                  className="inline-flex items-center gap-1"
                >
                  {availableViews.map((view) => {
                    const on = effectiveView === view
                    const label =
                      view === "distribution"
                        ? "Distribution"
                        : view === "frontier"
                          ? "Frontier"
                          : view === "compute"
                            ? "Compute"
                            : "Context"
                    return (
                      <button
                        key={view}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setView(view)}
                        title={
                          view === "frontier"
                            ? "Frontier score over model release dates (cumulative best)."
                            : view === "compute"
                              ? `Per-run scores across the study's ${protocol?.axisLabel ?? "compute axis"} settings.`
                              : view === "context"
                                ? "This study's score for each model against the official leaderboard's per-scaffold entries."
                                : "Kernel-density distribution of model scores."
                        }
                        className={`ec-pill${on ? " on" : ""}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div
              className="font-mono uppercase shrink-0"
              style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--fg-subtle)" }}
            >
              {directionHint}
            </div>
          </div>

          {/* Row 2 — Metric chips. Only shown when there's more than
              one series; otherwise the active label gets a quiet inline
              caption next to the view kicker. */}
          {showPicker ? (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className="font-mono uppercase shrink-0"
                style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
              >
                Metric
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {seriesList.map((s) => {
                  const on = s.key === active.key
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`ec-pill${on ? " on" : ""}`}
                      onClick={() => setActiveKey(s.key)}
                      title={s.caption ? `${s.label} · ${s.caption}` : s.label}
                    >
                      {s.label}
                      {s.caption ? (
                        <span
                          className="ml-1.5"
                          style={{ color: on ? undefined : "var(--fg-subtle)" }}
                        >
                          · {s.caption}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div
              className="font-mono uppercase truncate"
              style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--fg-muted)" }}
              title={active.label}
            >
              {active.label}
              {active.unit ? <span style={{ color: "var(--fg-subtle)" }}>{" · " + active.unit}</span> : null}
            </div>
          )}
        </div>
      )}

      {compact && (
        <div
          className="font-mono uppercase mb-1.5 truncate"
          style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "var(--fg-subtle)" }}
          title={active.label}
        >
          {active.label}
        </div>
      )}

      {effectiveView === "context" && context ? (
        <ContextPlot context={context} />
      ) : effectiveView === "compute" && protocol ? (
        <ComputePlot protocol={protocol} unit={active.unit} label={active.label} />
      ) : effectiveView === "frontier" && frontier ? (
        <FrontierPlot
          events={frontier.events}
          samples={frontier.samples}
          unit={active.unit}
          lowerIsBetter={active.lowerIsBetter ?? false}
          label={active.label}
        />
      ) : (
      <svg
        viewBox={`0 0 ${width} ${plotHeight + 8}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: compact ? 38 : 72, display: "block" }}
        role="img"
        aria-label={`${active.label} distribution: ${stats.n} models`}
      >
        {/* Filled density area */}
        <path
          d={fillPath}
          fill="var(--bg-surface)"
          stroke="none"
          opacity={0.85}
        />
        {/* Density curve */}
        <path
          d={path}
          fill="none"
          stroke="var(--fg-muted)"
          strokeWidth={0.7}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Baseline */}
        <line
          x1={0}
          x2={width}
          y1={plotHeight}
          y2={plotHeight}
          stroke="var(--border-strong)"
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
        />

        {/* IQR bracket along baseline */}
        <line
          x1={markerX(stats.q1)}
          x2={markerX(stats.q3)}
          y1={plotHeight + 3}
          y2={plotHeight + 3}
          stroke="var(--fg-muted)"
          strokeWidth={0.7}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={markerX(stats.q1)}
          x2={markerX(stats.q1)}
          y1={plotHeight + 1.5}
          y2={plotHeight + 4.5}
          stroke="var(--fg-muted)"
          strokeWidth={0.7}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={markerX(stats.q3)}
          x2={markerX(stats.q3)}
          y1={plotHeight + 1.5}
          y2={plotHeight + 4.5}
          stroke="var(--fg-muted)"
          strokeWidth={0.7}
          vectorEffect="non-scaling-stroke"
        />

        {/* Median vertical rule (accent) */}
        <line
          x1={markerX(stats.median)}
          x2={markerX(stats.median)}
          y1={2}
          y2={plotHeight}
          stroke="var(--accent)"
          strokeWidth={0.9}
          vectorEffect="non-scaling-stroke"
        />

        {/* Mean tick (dashed) */}
        <line
          x1={markerX(stats.mean)}
          x2={markerX(stats.mean)}
          y1={2}
          y2={plotHeight}
          stroke="var(--fg)"
          strokeWidth={0.6}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      )}

      {/* Caption row — distribution view only; the frontier and compute
          panels render their own captions. */}
      {effectiveView === "distribution" && (
      <div
        className="mt-2 flex flex-wrap items-baseline font-mono"
        style={{
          fontSize: compact ? 9.5 : 10.5,
          letterSpacing: "0.04em",
          color: "var(--fg-muted)",
          gap: compact ? "6px 10px" : "4px 14px",
        }}
      >
        {captionItems.map((item, i) => (
          <span key={item.key} className="inline-flex items-baseline gap-1">
            {i > 0 && <span style={{ color: "var(--fg-subtle)" }}>·</span>}
            <span
              className="uppercase"
              style={{
                color: item.key === "median"
                  ? "var(--accent)"
                  : item.key === "mean"
                  ? "var(--fg)"
                  : "var(--fg-subtle)",
                fontSize: compact ? 9 : 9.5,
                letterSpacing: "0.12em",
              }}
            >
              {item.label}
            </span>
            <span
              className="tabular-nums"
              style={{
                color: item.key === "median" ? "var(--accent)" : "var(--fg)",
                fontWeight: item.key === "median" ? 600 : 500,
              }}
            >
              {item.value}
            </span>
          </span>
        ))}
      </div>
      )}

      {!compact && effectiveView === "distribution" && (
        <div
          className="mt-1 flex items-center gap-3 font-mono"
          style={{ fontSize: 9, letterSpacing: "0.06em", color: "var(--fg-subtle)" }}
        >
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 10,
                height: 1,
                background: "var(--accent)",
              }}
            />
            median
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 10,
                height: 1,
                borderTop: "1px dashed var(--fg)",
              }}
            />
            mean
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 10,
                height: 1,
                background: "var(--fg-muted)",
              }}
            />
            IQR (q1–q3)
          </span>
        </div>
      )}
    </div>
  )
}

interface FrontierPlotProps {
  /** Strictly-improving subset of the input — each entry pushes the
   *  cumulative best score further. Already sorted ascending by time. */
  events: Array<{ time: number; score: number; name: string }>
  /** Every dated sample (improving or not), used as background dots. */
  samples: Array<{ time: number; score: number; name: string }>
  unit?: string
  lowerIsBetter: boolean
  label: string
}

function FrontierPlot({ events, samples, unit, lowerIsBetter, label }: FrontierPlotProps) {
  const PLOT_HEIGHT = 180
  const PAD_T = 8
  const PAD_B = 22 // room for year labels under the axis
  const PAD_L_PCT = 1
  const PAD_R_PCT = 1

  const tMin = Math.min(...samples.map((s) => s.time))
  const tMaxData = Math.max(...samples.map((s) => s.time))
  // Always extend the rightmost edge to "now" so the user sees how
  // long the current frontier holder has been on top.
  const tMax = Math.max(tMaxData, Date.now())
  const tRange = tMax - tMin || 1
  const sValues = samples.map((s) => s.score)
  const sMin = Math.min(...sValues)
  const sMax = Math.max(...sValues)
  const sRange = sMax - sMin || Math.abs(sMax) || 1
  // Pad y so dots don't kiss the borders.
  const yLo = sMin - sRange * 0.05
  const yHi = sMax + sRange * 0.05
  const yRange = yHi - yLo || 1

  // Percent helpers — used for both HTML overlay positioning and the
  // SVG path (which uses a 0-100 viewBox so the line scales with the
  // container without distorting other glyphs).
  const xPct = (t: number) =>
    PAD_L_PCT + ((t - tMin) / tRange) * (100 - PAD_L_PCT - PAD_R_PCT)
  const yPct = (s: number) =>
    100 - ((s - yLo) / yRange) * 100 // 0 at top, 100 at bottom

  // Pixel helpers for the step-line SVG. Keep its viewBox at 100x100
  // so it overlays the container 1:1, while strokeWidth uses
  // vectorEffect=non-scaling-stroke so the line stays crisp.
  let d = ""
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    const x = xPct(e.time)
    const y = yPct(e.score)
    if (i === 0) {
      d += `M${x.toFixed(3)},${y.toFixed(3)} `
    } else {
      const prev = events[i - 1]
      const yPrev = yPct(prev.score)
      d += `L${x.toFixed(3)},${yPrev.toFixed(3)} L${x.toFixed(3)},${y.toFixed(3)} `
    }
  }
  if (events.length > 0) {
    const last = events[events.length - 1]
    d += `L${xPct(tMax).toFixed(3)},${yPct(last.score).toFixed(3)}`
  }

  // Year tick marks along the x-axis. Keep at most 6 to avoid label
  // collisions on narrow viewports.
  const startYear = new Date(tMin).getUTCFullYear()
  const endYear = new Date(tMax).getUTCFullYear()
  const yearSpan = endYear - startYear
  const tickStep = yearSpan <= 6 ? 1 : Math.ceil(yearSpan / 6)
  const yearTicks: number[] = []
  for (let y = startYear; y <= endYear; y += tickStep) yearTicks.push(y)

  // Pre-bucket samples that *aren't* on the frontier so we don't
  // double-render them (the frontier dots are emphasised separately).
  const eventTimes = new Set(events.map((e) => `${e.time}|${e.score}`))
  const bgSamples = samples.filter((s) => !eventTimes.has(`${s.time}|${s.score}`))

  // Local hover state so we can render a richer label than the native
  // `title=` tooltip — keeps the dot and the popup nameplate in sync
  // even when the cursor sits right between two dots.
  const [hover, setHover] = useState<{
    x: number
    y: number
    name: string
    when: string
    score: string
    onFrontier: boolean
  } | null>(null)

  return (
    <div>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: PLOT_HEIGHT,
          paddingTop: PAD_T,
          paddingBottom: PAD_B,
          boxSizing: "border-box",
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Inner plot canvas (the area minus axis padding). */}
        <div
          style={{
            position: "absolute",
            top: PAD_T,
            bottom: PAD_B,
            left: 0,
            right: 0,
          }}
        >
          {/* Step line. The SVG uses a 0-100 viewBox so its path lines
              up with HTML overlays positioned via the same xPct/yPct
              helpers; non-scaling-stroke keeps the stroke crisp. */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
            aria-hidden
          >
            <path
              d={d}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>

          {/* Background sample dots — every dated model that's NOT on
              the frontier. Rendered as HTML so they're crisp circles
              and individually clickable / focusable. */}
          {bgSamples.map((s, i) => (
            <button
              key={`s-${i}`}
              type="button"
              aria-label={`${s.name || "Model"} · ${formatMonthYear(s.time)} · ${formatValue(s.score, unit)}`}
              onMouseEnter={(event) => {
                const rect = event.currentTarget.parentElement!.getBoundingClientRect()
                const dot = event.currentTarget.getBoundingClientRect()
                setHover({
                  x: dot.left + dot.width / 2 - rect.left,
                  y: dot.top + dot.height / 2 - rect.top,
                  name: s.name || "Model",
                  when: formatMonthYear(s.time),
                  score: formatValue(s.score, unit),
                  onFrontier: false,
                })
              }}
              onFocus={(event) => {
                const rect = event.currentTarget.parentElement!.getBoundingClientRect()
                const dot = event.currentTarget.getBoundingClientRect()
                setHover({
                  x: dot.left + dot.width / 2 - rect.left,
                  y: dot.top + dot.height / 2 - rect.top,
                  name: s.name || "Model",
                  when: formatMonthYear(s.time),
                  score: formatValue(s.score, unit),
                  onFrontier: false,
                })
              }}
              style={{
                position: "absolute",
                left: `${xPct(s.time)}%`,
                top: `${yPct(s.score)}%`,
                transform: "translate(-50%, -50%)",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--fg-subtle)",
                opacity: 0.4,
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            />
          ))}

          {/* Frontier-crossing dots, foregrounded. */}
          {events.map((e, i) => (
            <button
              key={`e-${i}`}
              type="button"
              aria-label={`Frontier: ${e.name || "Model"} · ${formatMonthYear(e.time)} · ${formatValue(e.score, unit)}`}
              onMouseEnter={(event) => {
                const rect = event.currentTarget.parentElement!.getBoundingClientRect()
                const dot = event.currentTarget.getBoundingClientRect()
                setHover({
                  x: dot.left + dot.width / 2 - rect.left,
                  y: dot.top + dot.height / 2 - rect.top,
                  name: e.name || "Model",
                  when: formatMonthYear(e.time),
                  score: formatValue(e.score, unit),
                  onFrontier: true,
                })
              }}
              onFocus={(event) => {
                const rect = event.currentTarget.parentElement!.getBoundingClientRect()
                const dot = event.currentTarget.getBoundingClientRect()
                setHover({
                  x: dot.left + dot.width / 2 - rect.left,
                  y: dot.top + dot.height / 2 - rect.top,
                  name: e.name || "Model",
                  when: formatMonthYear(e.time),
                  score: formatValue(e.score, unit),
                  onFrontier: true,
                })
              }}
              style={{
                position: "absolute",
                left: `${xPct(e.time)}%`,
                top: `${yPct(e.score)}%`,
                transform: "translate(-50%, -50%)",
                width: 11,
                height: 11,
                borderRadius: "50%",
                background: "var(--accent)",
                border: "1.5px solid var(--bg)",
                padding: 0,
                cursor: "pointer",
                boxShadow: "0 0 0 0.5px var(--accent)",
              }}
            />
          ))}

          {/* Hover nameplate */}
          {hover && (
            <div
              role="status"
              style={{
                position: "absolute",
                left: hover.x,
                top: hover.y - 14,
                transform: "translate(-50%, -100%)",
                pointerEvents: "none",
                background: "var(--fg)",
                color: "var(--bg)",
                padding: "5px 9px",
                fontSize: 11,
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                fontFamily: "var(--font-sans, inherit)",
                boxShadow: "var(--shadow-card, 0 2px 6px rgba(0,0,0,0.18))",
                zIndex: 2,
              }}
            >
              <div style={{ fontWeight: 600 }}>{hover.name}</div>
              <div
                className="font-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  opacity: 0.8,
                  marginTop: 1,
                }}
              >
                {hover.when} · {hover.score}
                {hover.onFrontier ? " · frontier" : ""}
              </div>
            </div>
          )}

          {/* Baseline */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 1,
              background: "var(--border-strong)",
            }}
          />
        </div>

        {/* Year ticks under the baseline */}
        {yearTicks.map((y) => {
          const t = Date.UTC(y, 0, 1)
          if (t < tMin || t > tMax) return null
          return (
            <div
              key={y}
              aria-hidden
              style={{
                position: "absolute",
                left: `${xPct(t)}%`,
                bottom: 4,
                transform: "translateX(-50%)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--fg-subtle)",
                letterSpacing: "0.06em",
              }}
            >
              {y}
            </div>
          )
        })}
      </div>

      <div
        className="mt-1 flex flex-wrap items-baseline font-mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.04em",
          color: "var(--fg-muted)",
          gap: "4px 14px",
        }}
      >
        <span className="inline-flex items-baseline gap-1">
          <span
            className="uppercase"
            style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--fg-subtle)" }}
          >
            frontier
          </span>
          <span className="tabular-nums" style={{ color: "var(--fg)", fontWeight: 600 }}>
            {events.length} step{events.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="inline-flex items-baseline gap-1">
          <span style={{ color: "var(--fg-subtle)" }}>·</span>
          <span
            className="uppercase"
            style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--fg-subtle)" }}
          >
            best
          </span>
          <span className="tabular-nums" style={{ color: "var(--fg)" }}>
            {formatValue(events[events.length - 1]?.score, unit)}
          </span>
          <span style={{ color: "var(--fg-subtle)" }}>by</span>
          <span style={{ color: "var(--fg)" }}>{events[events.length - 1]?.name || "—"}</span>
        </span>
        <span className="inline-flex items-baseline gap-1">
          <span style={{ color: "var(--fg-subtle)" }}>·</span>
          <span
            className="uppercase"
            style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--fg-subtle)" }}
          >
            since
          </span>
          <span className="tabular-nums" style={{ color: "var(--fg)" }}>
            {formatMonthYear(events[0].time)}
          </span>
        </span>
        <span className="inline-flex items-baseline gap-1" style={{ color: "var(--fg-subtle)" }}>
          <span>·</span>
          <span style={{ fontSize: 9 }}>
            {lowerIsBetter ? "frontier descends: lower is better" : "frontier ascends: higher is better"}
          </span>
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compute view: per-run scores over
// the study's nominal budget axis. Honest-estimator rules: no trend
// lines (2–3 nominal levels per axis, conditions at unmatched budgets — a line
// would assert a compute trend the study says must be compared at
// matched budgets); highlight scopes to one (model, condition), never across
// conditions; the condition legend is always visible.
// ---------------------------------------------------------------------------

const CONDITION_LEGEND: Record<FeedbackCondition, string> = {
  none: "no feedback",
  unknown: "condition unknown",
  answer_feedback: "oracle score feedback (assisted)",
}

function formatTokenTick(v: number): string {
  const trim = (n: number) => {
    const s = n.toFixed(n >= 10 ? 0 : 1)
    return s.replace(/\.0$/, "")
  }
  if (v >= 1_000_000) return `${trim(v / 1_000_000)}M`
  if (v >= 1_000) return `${trim(v / 1_000)}k`
  return String(v)
}

function ConditionGlyph({
  condition,
  highlighted,
}: {
  condition: FeedbackCondition
  highlighted?: boolean
}) {
  const ink = highlighted ? "var(--accent)" : "var(--fg-muted)"
  const base: CSSProperties = { display: "inline-block", boxSizing: "border-box" }
  if (condition === "none") {
    return (
      <span
        aria-hidden
        style={{ ...base, width: 9, height: 9, borderRadius: "50%", background: ink }}
      />
    )
  }
  if (condition === "unknown") {
    return (
      <span
        aria-hidden
        style={{
          ...base,
          width: 8,
          height: 8,
          border: `1.5px solid ${ink}`,
          transform: "rotate(45deg)",
          background: "transparent",
        }}
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{
        ...base,
        width: 9,
        height: 9,
        borderRadius: "50%",
        border: `1.5px solid ${ink}`,
        background: "transparent",
        opacity: highlighted ? 1 : 0.55,
      }}
    />
  )
}

export function ComputePlot({
  protocol,
  unit,
  label,
}: {
  protocol: ProtocolSeries
  unit?: string
  label: string
}) {
  const { marks, axisLabel, omitted, mismatchedConditionBudgets, researcherMode } = protocol
  const PLOT_HEIGHT = 190
  const PAD_T = 8
  const PAD_B = 24

  const logs = marks.map((m) => Math.log10(m.x))
  let xLo = Math.min(...logs)
  let xHi = Math.max(...logs)
  if (xHi - xLo < 1e-9) {
    xLo -= 0.5
    xHi += 0.5
  }
  const xPad = (xHi - xLo) * 0.06
  xLo -= xPad
  xHi += xPad

  const scores = marks.map((m) => m.score)
  const sMin = Math.min(...scores)
  const sMax = Math.max(...scores)
  const sRange = sMax - sMin || Math.abs(sMax) || 1
  const yLo = sMin - sRange * 0.05
  const yHi = sMax + sRange * 0.05
  const yRange = yHi - yLo || 1

  const xPct = (v: number) => ((Math.log10(v) - xLo) / (xHi - xLo)) * 98 + 1
  const yPct = (s: number) => 100 - ((s - yLo) / yRange) * 100

  // Ticks at the distinct NOMINAL levels actually present (2–6 values).
  const ticks = Array.from(new Set(marks.map((m) => m.x))).sort((a, b) => a - b)
  const conditionsPresent = (["none", "unknown", "answer_feedback"] as FeedbackCondition[]).filter(
    (condition) => marks.some((m) => m.condition === condition),
  )

  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number; mark: ComputeMark } | null>(null)
  const markKey = (mark: ComputeMark) => `${mark.modelName}|${mark.condition}`

  const hoverDetail = (mark: ComputeMark): string => {
    if (researcherMode) {
      return Object.entries(mark.protocolFields)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" · ")
    }
    return feedbackConditionDescription(mark.condition)
  }

  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${marks.length} runs over ${axisLabel}`}
        style={{
          position: "relative",
          width: "100%",
          height: PLOT_HEIGHT,
          paddingTop: PAD_T,
          paddingBottom: PAD_B,
          boxSizing: "border-box",
        }}
        onMouseLeave={() => {
          setHover(null)
          setHighlightKey(null)
        }}
      >
        <div style={{ position: "absolute", top: PAD_T, bottom: PAD_B, left: 0, right: 0 }}>
          {/* Tick rules at the nominal levels */}
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              style={{
                position: "absolute",
                left: `${xPct(t)}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: "var(--border-soft)",
              }}
            />
          ))}

          {marks.map((mark, i) => {
            const highlighted = highlightKey === markKey(mark)
            const dimmed = highlightKey != null && !highlighted
            const enter = (
              event: ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
            ) => {
              const rect = event.currentTarget.parentElement!.getBoundingClientRect()
              const dot = event.currentTarget.getBoundingClientRect()
              setHover({
                x: dot.left + dot.width / 2 - rect.left,
                y: dot.top + dot.height / 2 - rect.top,
                mark,
              })
              // Highlight every mark of this (model, condition) pair —
              // never across conditions, which would imply a
              // cross-condition per-model trend.
              setHighlightKey(markKey(mark))
            }
            return (
              <button
                key={`m-${i}`}
                type="button"
                aria-label={`${mark.modelName} · ${CONDITION_LEGEND[mark.condition]} · ${formatValue(mark.score, unit)} at ${formatTokenTick(mark.x)} ${axisLabel}`}
                onMouseEnter={enter}
                onFocus={enter}
                style={{
                  position: "absolute",
                  left: `${xPct(mark.x)}%`,
                  top: `${yPct(mark.score)}%`,
                  transform: "translate(-50%, -50%)",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  opacity: dimmed ? 0.3 : 1,
                  zIndex: highlighted ? 1 : undefined,
                }}
              >
                <ConditionGlyph condition={mark.condition} highlighted={highlighted} />
              </button>
            )
          })}

          {hover && (
            <div
              role="status"
              style={{
                position: "absolute",
                left: hover.x,
                top: hover.y - 14,
                transform: "translate(-50%, -100%)",
                pointerEvents: "none",
                background: "var(--fg)",
                color: "var(--bg)",
                padding: "5px 9px",
                fontSize: 11,
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                maxWidth: 420,
                boxShadow: "var(--shadow-card, 0 2px 6px rgba(0,0,0,0.18))",
                zIndex: 2,
              }}
            >
              <div style={{ fontWeight: 600 }}>{hover.mark.modelName}</div>
              <div
                className="font-mono"
                style={{ fontSize: 10, letterSpacing: "0.04em", opacity: 0.8, marginTop: 1 }}
              >
                {formatValue(hover.mark.score, unit)} · {formatTokenTick(hover.mark.x)}{" "}
                {axisLabel}
              </div>
              <div style={{ fontSize: 10, opacity: 0.8, marginTop: 1, whiteSpace: "normal" }}>
                {hoverDetail(hover.mark)}
              </div>
            </div>
          )}

          {/* Baseline */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 1,
              background: "var(--border-strong)",
            }}
          />
        </div>

        {/* Nominal-level labels under the baseline (log-positioned) */}
        {ticks.map((t) => (
          <div
            key={`t-${t}`}
            aria-hidden
            style={{
              position: "absolute",
              left: `${xPct(t)}%`,
              bottom: 4,
              transform: "translateX(-50%)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-subtle)",
              letterSpacing: "0.06em",
            }}
          >
            {formatTokenTick(t)}
          </div>
        ))}
      </div>

      {/* Condition legend — ALWAYS visible: the study's own figures use
          solid/hollow marks with a different meaning, so arriving
          readers need the encoding spelled out. */}
      <div
        className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono"
        style={{ fontSize: 9.5, letterSpacing: "0.06em", color: "var(--fg-subtle)" }}
      >
        {conditionsPresent.map((condition) => (
          <span key={condition} className="inline-flex items-center gap-1.5">
            <ConditionGlyph condition={condition} />
            {CONDITION_LEGEND[condition]}
          </span>
        ))}
      </div>

      <div
        className="mt-1.5 space-y-0.5 font-mono"
        style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--fg-muted)" }}
      >
        <div>
          {marks.length} runs · x: {axisLabel} (log scale) · y: {label}
        </div>
        {omitted > 0 && (
          <div style={{ color: "var(--fg-subtle)" }}>
            {omitted} {omitted === 1 ? "run has" : "runs have"} no recorded {axisLabel} and{" "}
            {omitted === 1 ? "is" : "are"} left out
          </div>
        )}
        {mismatchedConditionBudgets && (
          <div style={{ color: "var(--fg-subtle)" }}>
            feedback conditions ran at different budgets; compare them only where budgets match
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Context view: the collection's own published score for each model placed
// inside the community's per-scaffold score distribution for the same model
// on the same benchmark (finding I1).
//
// Presentation rules that carry meaning:
//   - the band is a posterior-predictive interval over re-runs of the SAME
//     tasks. It is not centered on the published score and must never be
//     drawn as if it were: no centre tick, no midpoint marker.
//   - one accent token (the published score) and one neutral token
//     (everything else), so the strip reads the same in both themes.
//   - the x scale is shared across strips and clipped to a padded data
//     range; placements are only comparable on one axis.
// ---------------------------------------------------------------------------

function formatAccuracyPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** Distinct values as "a" or "a–b" — the strips can disagree on task count
 *  and runs/task, and a single number would misreport the others. */
function formatSpan(values: number[]): string {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return "?"
  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  return lo === hi ? String(lo) : `${lo}–${hi}`
}

/** "A", "A and B", "A, B and C" — the caption register's list form. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** Round percent ticks inside the padded range (3–6 of them). */
function contextTicks(lo: number, hi: number): number[] {
  const span = hi - lo
  if (!(span > 0)) return [lo]
  const steps = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5]
  const step = steps.find((s) => span / s <= 6) ?? steps[steps.length - 1]
  const ticks: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
    ticks.push(Number(t.toFixed(6)))
  }
  return ticks
}

export function ContextPlot({ context }: { context: ScaffoldContextPayload }) {
  const {
    models,
    officialTaskCount,
    contextSourceDisplay,
    modelsWithoutContext,
    hiddenTotal,
  } = context

  // Hover is addressed by (strip, point index) so the tooltip can be
  // positioned on the same percentage scale as the dot it describes —
  // no measurement, no drift when the panel resizes.
  const [hover, setHover] = useState<{ modelKey: string; index: number } | null>(null)

  // One shared scale over every quantity actually drawn, padded so the
  // extreme marks are not clipped by the strip edge.
  const values: number[] = []
  for (const model of models) {
    values.push(model.score, model.bandLo, model.bandHi)
    for (const point of model.points) values.push(point.score)
  }
  const finite = values.filter((v) => Number.isFinite(v))
  const dataLo = finite.length > 0 ? Math.min(...finite) : 0
  const dataHi = finite.length > 0 ? Math.max(...finite) : 1
  const spread = dataHi - dataLo || 0.05
  const xLo = dataLo - spread * 0.08
  const xHi = dataHi + spread * 0.08
  const xPct = (value: number) => ((value - xLo) / (xHi - xLo)) * 100
  const ticks = contextTicks(xLo, xHi)

  const STRIP_HEIGHT = 30
  // The producer resolves the source display string; never re-derive it
  // from ids here.
  const sourceLabel = contextSourceDisplay?.trim() || "official"
  // Models whose ranked (best-scoring) no-feedback row is a different
  // condition from the one plotted. Named once, in one caption, rather
  // than repeated under every strip.
  const rankedDifferentModels = models
    .filter((model) => model.conditionDiffersFromBestScoring)
    .map((model) => model.displayName)

  return (
    <div>
      <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
        {models.map((model) => (
          <div key={model.key} className="mb-2">
            <div className="flex items-center gap-3">
              <div
                className="font-mono truncate shrink-0"
                style={{ width: 132, fontSize: 10.5, letterSpacing: "0.04em", color: "var(--fg)" }}
                title={model.displayName}
              >
                {model.displayName}
              </div>
              <div
                role="img"
                aria-label={`${model.displayName}: this study's score ${formatAccuracyPct(model.score)} over ${model.nTasks} tasks, re-run band ${formatAccuracyPct(model.bandLo)} to ${formatAccuracyPct(model.bandHi)}, ${model.points.length} leaderboard ${model.points.length === 1 ? "scaffold" : "scaffolds"} from ${formatAccuracyPct(Math.min(...model.points.map((p) => p.score), model.score))} to ${formatAccuracyPct(Math.max(...model.points.map((p) => p.score), model.score))}`}
                style={{ position: "relative", flex: 1, height: STRIP_HEIGHT }}
              >
                {/* Re-run band. Drawn behind everything and deliberately
                    without a centre marker: it is a posterior-predictive
                    interval, not an error bar around the diamond. */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${xPct(model.bandLo)}%`,
                    width: `${Math.max(xPct(model.bandHi) - xPct(model.bandLo), 0.4)}%`,
                    top: 5,
                    bottom: 5,
                    background: "var(--fg-muted)",
                    opacity: 0.16,
                  }}
                />
                {/* Strip baseline */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: STRIP_HEIGHT / 2,
                    height: 1,
                    background: "var(--border-soft)",
                  }}
                />
                {model.points.map((point, index) => (
                  <button
                    key={`${point.scaffold}-${index}`}
                    type="button"
                    aria-label={`${point.scaffold} · ${formatAccuracyPct(point.score)}${point.runDate ? ` · ${point.runDate}` : ""}`}
                    onMouseEnter={() => setHover({ modelKey: model.key, index })}
                    onFocus={() => setHover({ modelKey: model.key, index })}
                    onBlur={() => setHover(null)}
                    style={{
                      position: "absolute",
                      left: `${xPct(point.score)}%`,
                      top: STRIP_HEIGHT / 2,
                      transform: "translate(-50%, -50%)",
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: "block",
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        border: "1.5px solid var(--fg-muted)",
                        background: "transparent",
                        boxSizing: "border-box",
                      }}
                    />
                  </button>
                ))}
                {/* Published score. Always a served fact_results number. */}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${xPct(model.score)}%`,
                    top: STRIP_HEIGHT / 2,
                    transform: "translate(-50%, -50%) rotate(45deg)",
                    width: 9,
                    height: 9,
                    background: "var(--accent)",
                    boxSizing: "border-box",
                  }}
                />
                {hover?.modelKey === model.key && model.points[hover.index] && (
                  <div
                    role="status"
                    style={{
                      position: "absolute",
                      left: `${xPct(model.points[hover.index].score)}%`,
                      bottom: STRIP_HEIGHT / 2 + 8,
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                      background: "var(--fg)",
                      color: "var(--bg)",
                      padding: "5px 9px",
                      fontSize: 11,
                      lineHeight: 1.3,
                      whiteSpace: "nowrap",
                      boxShadow: "var(--shadow-card, 0 2px 6px rgba(0,0,0,0.18))",
                      zIndex: 2,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{model.points[hover.index].scaffold}</div>
                    <div
                      className="font-mono"
                      style={{ fontSize: 10, letterSpacing: "0.04em", opacity: 0.8, marginTop: 1 }}
                    >
                      {formatAccuracyPct(model.points[hover.index].score)}
                      {model.points[hover.index].runDate
                        ? ` · ${model.points[hover.index].runDate}`
                        : ""}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.8, marginTop: 1 }}>
                      {model.displayName}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

      </div>

      {/* Shared x axis */}
      <div className="flex items-center gap-3">
        <div className="shrink-0" style={{ width: 132 }} />
        <div style={{ position: "relative", flex: 1, height: 16 }}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 1,
              background: "var(--border-strong)",
            }}
          />
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden
              style={{
                position: "absolute",
                left: `${xPct(tick)}%`,
                top: 2,
                transform: "translateX(-50%)",
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                color: "var(--fg-subtle)",
                letterSpacing: "0.06em",
              }}
            >
              {formatAccuracyPct(tick)}
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-3 space-y-0.5 font-mono"
        style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--fg-muted)" }}
      >
        <div>each circle is one agent scaffold on the {sourceLabel} leaderboard</div>
        <div>
          diamonds: this study&apos;s no-feedback score over{" "}
          {formatSpan(models.map((m) => m.nTasks))} of the {officialTaskCount} tasks
        </div>
        <div>
          shaded band: estimated score range for a re-run at{" "}
          {formatSpan(models.map((m) => m.bandRuns))} runs per task
        </div>
        {rankedDifferentModels.length > 0 && (
          <div style={{ color: "var(--fg-subtle)" }}>
            the ranked list shows each model&apos;s best score, for{" "}
            {joinNames(rankedDifferentModels)} from a smaller task set
          </div>
        )}
        {modelsWithoutContext.length > 0 && (
          <div style={{ color: "var(--fg-subtle)" }}>
            no leaderboard entries for {joinNames(modelsWithoutContext)}
          </div>
        )}
        {hiddenTotal > 0 && <div style={{ color: "var(--fg-subtle)" }}>+{hiddenTotal} not shown</div>}
      </div>
    </div>
  )
}
