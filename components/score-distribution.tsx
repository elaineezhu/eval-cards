"use client"

import { useMemo, useState } from "react"

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
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="font-mono uppercase shrink-0"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
            >
              Score distribution
            </div>
            {showPicker ? (
              <select
                className="ec-select"
                value={active.key}
                onChange={(event) => setActiveKey(event.target.value)}
                style={{ minWidth: 200, maxWidth: "100%" }}
              >
                {seriesList.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                    {s.caption ? ` · ${s.caption}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className="font-mono uppercase truncate"
                style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--fg)" }}
                title={active.label}
              >
                · {active.label}
              </span>
            )}
          </div>
          <div
            className="font-mono uppercase shrink-0"
            style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--fg-subtle)" }}
          >
            {directionHint}
          </div>
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

      {/* Caption row */}
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

      {!compact && (
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
