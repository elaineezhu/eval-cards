"use client"

// Trajectory panels for protocol-varied collection pages
// (notes/collection-benchmark-page-spec.md R2). Mounted below the
// plotbox on per-source pages whose curated collection ships a
// trajectory extract; every panel is independently gated by the shape of
// the served payload and the whole section disappears when the route
// serves nothing. Scores arrive pre-shaped from the server — nothing is
// recomputed or converted here.

import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react"

import { fetchEvalTrajectories } from "@/lib/dashboard-data-client"
import type {
  EvalTrajectoriesPayload,
  ReliabilityPanel,
  TerminationSummary,
  TokensToSuccessPanel,
  TrajectoryModelEntry,
} from "@/lib/collection-trajectories"
import type { FeedbackCondition } from "@/lib/collections"

const CONDITION_LABELS: Record<FeedbackCondition, string> = {
  none: "No feedback",
  answer_feedback: "Oracle score feedback (assisted)",
  unknown: "Condition unknown",
}

// Categorical series colors for the step curves — one hue per model,
// assigned in the page's fixed release order (color follows the entity,
// never its rank, and hues are never cycled: a 7th model falls back to
// neutral ink). Light/dark sets are the dataviz reference palette's
// first six slots, validated with its gate script against this app's
// actual surfaces (#ffffff / #111110): adjacent-pair CVD ΔE ≥ 8.4 and
// normal-vision ΔE ≥ 19.3 in both modes. Three light-mode slots sit
// below 3:1 contrast — relieved by the always-visible named legend and
// the per-curve tooltips (identity never rides on color alone).
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"]
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"]

function TrajectorySeriesStyle() {
  return (
    <style>{`
.traj-series {${SERIES_LIGHT.map((c, i) => ` --traj-c${i}: ${c};`).join("")} }
.dark .traj-series {${SERIES_DARK.map((c, i) => ` --traj-c${i}: ${c};`).join("")} }
`}</style>
  )
}

function seriesColor(index: number): string {
  return index >= 0 && index < SERIES_LIGHT.length ? `var(--traj-c${index})` : "var(--fg-muted)"
}

/** Cursor-anchored hover nameplate shared by the trajectory panels
 *  (same visual as the plotbox tooltips). Mount inside a
 *  position:relative container; pass coordinates relative to it. */
function Nameplate({ x, y, wide, children }: { x: number; y: number; wide?: boolean; children: ReactNode }) {
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        left: x,
        top: y - 12,
        transform: "translate(-50%, -100%)",
        pointerEvents: "none",
        background: "var(--fg)",
        color: "var(--bg)",
        padding: "5px 9px",
        fontSize: 11,
        lineHeight: 1.3,
        whiteSpace: wide ? "normal" : "nowrap",
        maxWidth: wide ? 380 : undefined,
        width: wide ? "max-content" : undefined,
        boxShadow: "var(--shadow-card, 0 2px 6px rgba(0,0,0,0.18))",
        zIndex: 2,
      }}
    >
      {children}
    </div>
  )
}

/** Keep a centered nameplate from clipping at the container's edges. */
function clampTipX(x: number, rect: DOMRect, halfWidth = 190): number {
  const margin = Math.min(halfWidth, rect.width / 2)
  return Math.min(Math.max(x, margin), rect.width - margin)
}

const nameplateLine: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.04em",
  opacity: 0.85,
  marginTop: 1,
}

function formatTokens(v: number): string {
  const trim = (n: number) => n.toFixed(n >= 10 ? 0 : 1).replace(/\.0$/, "")
  if (v >= 1_000_000) return `${trim(v / 1_000_000)}M`
  if (v >= 1_000) return `${trim(v / 1_000)}k`
  return String(v)
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(v * 100 >= 10 ? 0 : 1)}%`
}

function modelLabel(models: TrajectoryModelEntry[], key: string): string {
  const entry = models.find((m) => m.key === key)
  if (!entry) return key
  return entry.unmatched ? `${entry.label} (unmatched id)` : entry.label
}

function PanelCard({
  kicker,
  title,
  children,
}: {
  kicker: string
  title: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        padding: "16px 20px",
        border: "1px solid var(--border-soft)",
        background: "var(--bg)",
      }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <span
          className="font-mono uppercase"
          style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
        >
          {kicker}
        </span>
        <span
          className="font-mono uppercase"
          style={{ fontSize: 10.5, letterSpacing: "0.08em", color: "var(--fg-muted)" }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

function ConditionChips({
  conditions,
  active,
  onChange,
}: {
  conditions: FeedbackCondition[]
  active: FeedbackCondition
  onChange: (condition: FeedbackCondition) => void
}) {
  if (conditions.length <= 1) {
    return (
      <div
        className="mb-3 font-mono uppercase"
        style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--fg-muted)" }}
      >
        {CONDITION_LABELS[conditions[0] ?? "unknown"]}
      </div>
    )
  }
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {conditions.map((condition) => (
        <button
          key={condition}
          type="button"
          className={`ec-pill${condition === active ? " on" : ""}`}
          onClick={() => onChange(condition)}
        >
          {CONDITION_LABELS[condition]}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// R2a — lowest observed tokens to success (step curves, oracle-feedback condition).
// ---------------------------------------------------------------------------

function TokensToSuccessCard({
  panel,
  models,
  taskCount,
}: {
  panel: TokensToSuccessPanel
  models: TrajectoryModelEntry[]
  taskCount: number
}) {
  const [highlight, setHighlight] = useState<string | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number; modelKey: string; tokens: number } | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  // Draw and label in the page's release order so each model keeps one
  // color everywhere it appears.
  const modelIndex = (key: string) => models.findIndex((m) => m.key === key)
  const curves = [...panel.curves].sort((a, b) => modelIndex(a.modelKey) - modelIndex(b.modelKey))

  const allTokens = curves.flatMap((c) => [
    ...c.steps.map((s) => s.tokens),
    ...(c.censorTokens != null ? [c.censorTokens] : []),
  ])
  if (allTokens.length === 0) return null
  let xLo = Math.log10(Math.min(...allTokens))
  let xHi = Math.log10(Math.max(...allTokens))
  if (xHi - xLo < 1e-9) {
    xLo -= 0.5
    xHi += 0.5
  }
  const pad = (xHi - xLo) * 0.04
  xLo -= pad
  xHi += pad
  const xPct = (tokens: number) => ((Math.log10(tokens) - xLo) / (xHi - xLo)) * 98 + 1
  const yPct = (rate: number) => 100 - rate * 100

  const curvePath = (curve: (typeof curves)[number]): string => {
    let d = ""
    let prevRate = 0
    for (const step of curve.steps) {
      const x = xPct(step.tokens)
      if (d === "") d = `M${x.toFixed(3)},${yPct(prevRate).toFixed(3)} `
      else d += `L${x.toFixed(3)},${yPct(prevRate).toFixed(3)} `
      d += `L${x.toFixed(3)},${yPct(step.rate).toFixed(3)} `
      prevRate = step.rate
    }
    // Extend the plateau to the censoring extent (largest observed
    // consumed tokens among unsolved attempts) — never a nominal budget.
    const lastStep = curve.steps[curve.steps.length - 1]
    const extendTo = Math.max(curve.censorTokens ?? 0, lastStep?.tokens ?? 0)
    if (d !== "" && extendTo > (lastStep?.tokens ?? 0)) {
      d += `L${xPct(extendTo).toFixed(3)},${yPct(prevRate).toFixed(3)}`
    }
    return d
  }

  // Per-curve hover: track the cursor along an invisible fat hit path so
  // the tooltip can read out the curve AT the cursor's token count.
  const handleCurveMove = (modelKey: string) => (event: ReactMouseEvent<SVGPathElement>) => {
    const rect = plotRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const xfrac = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    setHover({
      x: clampTipX(event.clientX - rect.left, rect),
      y: event.clientY - rect.top,
      modelKey,
      tokens: 10 ** (xLo + xfrac * (xHi - xLo)),
    })
    setHighlight(modelKey)
  }

  // Log-decade ticks inside the visible range.
  const ticks: number[] = []
  for (let e = Math.ceil(xLo); e <= Math.floor(xHi); e++) ticks.push(10 ** e)

  const censoredTotal = curves.reduce((acc, c) => acc + c.censoredTasks, 0)
  const hoverCurve = hover ? curves.find((c) => c.modelKey === hover.modelKey) : null
  const hoverSolvedAt = hover && hoverCurve
    ? hoverCurve.steps.filter((s) => s.tokens <= hover.tokens).length
    : 0

  return (
    <PanelCard kicker="Trajectories" title="Lowest observed tokens to success">
      <TrajectorySeriesStyle />
      <div className="traj-series">
        <div
          ref={plotRef}
          style={{ position: "relative", width: "100%", height: 200, paddingBottom: 20, boxSizing: "content-box" }}
          onMouseLeave={() => {
            setHover(null)
            setHighlight(null)
          }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: 200 }}
            role="img"
            aria-label={`Cumulative success rate over tokens to success: ${curves.length} models, oracle score feedback`}
          >
            {[0.25, 0.5, 0.75].map((rate) => (
              <line
                key={rate}
                x1={0}
                x2={100}
                y1={yPct(rate)}
                y2={yPct(rate)}
                stroke="var(--border-soft)"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
            <line
              x1={0}
              x2={100}
              y1={100}
              y2={100}
              stroke="var(--border-strong)"
              strokeWidth={0.7}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {curves.map((curve) => {
              const on = highlight === curve.modelKey
              const dim = highlight != null && !on
              return (
                <path
                  key={curve.modelKey}
                  d={curvePath(curve)}
                  fill="none"
                  stroke={seriesColor(modelIndex(curve.modelKey))}
                  strokeWidth={on ? 2.4 : 1.6}
                  opacity={dim ? 0.2 : 1}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              )
            })}
            {/* Invisible fat hit paths — a hover target wider than the
                1.6px mark, per curve, above the visible strokes. */}
            {curves.map((curve) => (
              <path
                key={`hit-${curve.modelKey}`}
                d={curvePath(curve)}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                vectorEffect="non-scaling-stroke"
                pointerEvents="stroke"
                onMouseMove={handleCurveMove(curve.modelKey)}
                style={{ cursor: "crosshair" }}
              />
            ))}
          </svg>
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              style={{
                position: "absolute",
                left: `${xPct(t)}%`,
                top: 202,
                transform: "translateX(-50%)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--fg-subtle)",
                letterSpacing: "0.06em",
              }}
            >
              {formatTokens(t)}
            </div>
          ))}

          {hover && hoverCurve && (
            <Nameplate x={hover.x} y={hover.y}>
              <div style={{ fontWeight: 600 }}>{modelLabel(models, hover.modelKey)}</div>
              <div style={nameplateLine}>
                {formatPct(hoverSolvedAt / hoverCurve.attemptedTasks)} of{" "}
                {hoverCurve.attemptedTasks} attempted solved within {formatTokens(hover.tokens)}{" "}
                tokens
              </div>
              <div style={nameplateLine}>
                {hoverCurve.solvedTasks} solved · {hoverCurve.censoredTasks} unsolved
              </div>
            </Nameplate>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {curves.map((curve) => (
            <button
              key={curve.modelKey}
              type="button"
              className={`ec-pill${highlight === curve.modelKey ? " on" : ""}`}
              onMouseEnter={() => setHighlight(curve.modelKey)}
              onMouseLeave={() => setHighlight(null)}
              onFocus={() => setHighlight(curve.modelKey)}
              onBlur={() => setHighlight(null)}
              title={`${curve.attemptedTasks} of ${taskCount} benchmark tasks attempted · ${curve.solvedTasks} solved · ${curve.censoredTasks} unsolved`}
            >
              <span
                aria-hidden
                className="mr-1.5 inline-block align-middle"
                style={{
                  width: 12,
                  height: 3,
                  background: seriesColor(modelIndex(curve.modelKey)),
                }}
              />
              {modelLabel(models, curve.modelKey)}
              <span className="ml-1.5" style={{ color: "var(--fg-subtle)" }}>
                · {curve.attemptedTasks} of {taskCount} tasks
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        className="mt-2 space-y-0.5 font-mono"
        style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--fg-muted)" }}
      >
        <div>
          x: lowest observed tokens to success (log) · y: cumulative success rate over
          attempted tasks
        </div>
        {censoredTotal > 0 && (
          <div style={{ color: "var(--fg-subtle)" }}>
            unsolved tasks keep a curve flat; each curve ends at the highest token count reached
          </div>
        )}
        <div style={{ color: "var(--fg-subtle)" }}>
          runs used oracle score feedback and expanded budgets; compare with published
          fixed-budget scores with caution
        </div>
        {curves.length + panel.droppedModels.length < models.length && (
          <div style={{ color: "var(--fg-subtle)" }}>
            the study ran oracle score feedback for{" "}
            {curves.length + panel.droppedModels.length} of this page&apos;s {models.length}{" "}
            models on this benchmark
          </div>
        )}
        {panel.droppedModels.length > 0 && (
          <div style={{ color: "var(--fg-subtle)" }}>
            curves need at least 5 attempted tasks;{" "}
            {panel.droppedModels
              .map((d) => `${modelLabel(models, d.modelKey)} attempted ${d.attemptedTasks}`)
              .join(", ")}
          </div>
        )}
      </div>
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
// R2b — reliability heatmap (models × task-difficulty fifths).
// ---------------------------------------------------------------------------

function ReliabilityCard({
  panels,
  models,
  isResearchView,
}: {
  panels: ReliabilityPanel[]
  models: TrajectoryModelEntry[]
  isResearchView: boolean
}) {
  const conditions = panels.map((p) => p.condition)
  const [condition, setCondition] = useState<FeedbackCondition>(
    conditions.includes("none") ? "none" : conditions[0],
  )
  const panel = panels.find((p) => p.condition === condition) ?? panels[0]
  const gridRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; y: number; modelKey: string; binKey: string } | null>(null)
  if (!panel) return null

  // Columns: the page's models in release order, restricted to models
  // present in this condition.
  const presentKeys = new Set(panel.cells.map((c) => c.modelKey))
  const columns = models.filter((m) => presentKeys.has(m.key))
  const cellFor = (modelKey: string, binKey: string) =>
    panel.cells.find((c) => c.modelKey === modelKey && c.binKey === binKey)

  const handleCellMove = (modelKey: string, binKey: string) => (event: ReactMouseEvent<HTMLTableCellElement>) => {
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ x: clampTipX(event.clientX - rect.left, rect), y: event.clientY - rect.top, modelKey, binKey })
  }
  const hoverBin = hover ? panel.bins.find((b) => b.key === hover.binKey) : null
  const hoverCell = hover ? cellFor(hover.modelKey, hover.binKey) : null

  return (
    <PanelCard kicker="Trajectories" title="Reliability by task difficulty">
      <ConditionChips conditions={conditions} active={panel.condition} onChange={setCondition} />
      <div ref={gridRef} style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
        {hover && hoverBin && (
          <Nameplate x={hover.x} y={hover.y} wide={isResearchView}>
            <div style={{ fontWeight: 600 }}>{modelLabel(models, hover.modelKey)}</div>
            <div style={nameplateLine}>
              {hoverBin.label} · {hoverBin.taskCount} tasks
            </div>
            <div style={nameplateLine}>
              {hoverCell?.solveRate != null
                ? `solved ${formatPct(hoverCell.solveRate)} of ${hoverCell.scoredAttempts} runs on ${hoverCell.attemptedTasks} attempted tasks`
                : "this model has no runs on these tasks in this condition"}
            </div>
            {isResearchView && (
              <div style={nameplateLine}>
                difficulty {hoverBin.difficultyRange[0].toFixed(2)} to{" "}
                {hoverBin.difficultyRange[1].toFixed(2)} · tasks:{" "}
                {hoverBin.taskIds.slice(0, 6).join(", ")}
                {hoverBin.taskIds.length > 6 ? ` +${hoverBin.taskIds.length - 6} more` : ""}
              </div>
            )}
          </Nameplate>
        )}
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th
                className="font-mono uppercase"
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.1em",
                  color: "var(--fg-subtle)",
                  textAlign: "left",
                  padding: "4px 8px 6px 0",
                  fontWeight: 500,
                }}
              >
                Task difficulty
              </th>
              {columns.map((model) => (
                <th
                  key={model.key}
                  className="font-mono"
                  style={{
                    fontSize: 10,
                    color: "var(--fg-muted)",
                    textAlign: "center",
                    padding: "4px 6px 6px",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                  title={model.releaseDate ? `released ${model.releaseDate}` : undefined}
                >
                  {modelLabel(models, model.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {panel.bins.map((bin) => (
              <tr key={bin.key}>
                <td
                  className="font-mono"
                  style={{
                    fontSize: 10,
                    color: "var(--fg-muted)",
                    padding: "3px 8px 3px 0",
                    whiteSpace: "nowrap",
                  }}
                  title={`${bin.taskCount} tasks`}
                >
                  {bin.label}
                </td>
                {columns.map((model) => {
                  const cell = cellFor(model.key, bin.key)
                  const rate = cell?.solveRate ?? null
                  return (
                    <td
                      key={model.key}
                      className="font-mono tabular-nums"
                      onMouseMove={handleCellMove(model.key, bin.key)}
                      style={{
                        fontSize: 11,
                        textAlign: "center",
                        padding: "6px 6px",
                        border: "1px solid var(--border-soft)",
                        cursor: "default",
                        color: rate != null && rate > 0.55 ? "var(--bg)" : "var(--fg)",
                        background:
                          rate == null
                            ? "repeating-linear-gradient(45deg, transparent, transparent 4px, var(--border-soft) 4px, var(--border-soft) 5px)"
                            : `color-mix(in srgb, var(--accent) ${Math.round(8 + rate * 72)}%, transparent)`,
                      }}
                    >
                      {rate != null ? formatPct(rate) : "—"}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      <div
        className="mt-2 space-y-0.5 font-mono"
        style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--fg-muted)" }}
      >
        <div>
          difficulty = 1 − the task&apos;s median solve rate across models, over both feedback
          conditions (the study&apos;s definition). Rows keep the same tasks when you switch
          condition; hatched cells have no runs.
        </div>
      </div>
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
// R2c — how runs ended: the study's termination-table grain — a
// PARTITION of runs by termination cause per feedback condition — plus a
// separately-labeled outcome line (owner decision (c), 2026-08-21).
// ---------------------------------------------------------------------------

function TerminationCard({
  summaries,
  models,
  isResearchView,
}: {
  summaries: TerminationSummary[]
  models: TrajectoryModelEntry[]
  isResearchView: boolean
}) {
  const conditions = summaries.map((s) => s.condition)
  const [condition, setCondition] = useState<FeedbackCondition>(
    conditions.includes("none") ? "none" : conditions[0],
  )
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const rowsRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; y: number; key: string } | null>(null)
  const summary = summaries.find((s) => s.condition === condition) ?? summaries[0]
  if (!summary) return null

  // Partition rows sum to 100%. "Ended on a correct submission" is a
  // termination cause only under oracle score feedback; elsewhere it
  // renders "—" (the category cannot occur), mirroring the study's own
  // table.
  const rows: Array<{
    key: string
    label: string
    value: { n: number; denominator: number } | null
    dashNote?: string
  }> = [
    {
      key: "correct-submit",
      label: "ended on a correct submission",
      value: summary.endedOnCorrectSubmission,
      dashNote: "only occurs under oracle score feedback",
    },
    { key: "guard", label: "repeated similar answers", value: summary.repetitionGuard },
    { key: "budget", label: "token budget exhausted", value: summary.budgetExhausted },
    { key: "other", label: "other endings", value: summary.otherEndings },
  ]

  const reasonKeys = Array.from(
    new Set(summary.byModel.flatMap((m) => Object.keys(m.reasons))),
  ).sort()

  const outcome = summary.reachedCorrectAnswer

  // What sits inside "other endings", pooled across models, for its
  // hover breakdown.
  const TABLE_REASONS = ["completed_on_successful_submit", "repetition_guard", "token_limit"]
  const otherBreakdown: Array<[string, number]> = []
  {
    const pooled = new Map<string, number>()
    for (const model of summary.byModel) {
      for (const [reason, n] of Object.entries(model.reasons)) {
        pooled.set(reason, (pooled.get(reason) ?? 0) + n)
      }
    }
    for (const [reason, n] of pooled) {
      if (!TABLE_REASONS.includes(reason) && n > 0) otherBreakdown.push([reason, n])
    }
    otherBreakdown.sort((a, b) => b[1] - a[1])
  }

  const handleRowMove = (key: string) => (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = rowsRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ x: clampTipX(event.clientX - rect.left, rect), y: event.clientY - rect.top, key })
  }

  const hoverContent = (key: string): ReactNode => {
    const row = rows.find((r) => r.key === key)
    if (key === "outcome" && outcome) {
      const excluded = summary.runCount - outcome.denominator
      return (
        <>
          <div style={{ fontWeight: 600 }}>runs whose outcome was correct</div>
          <div style={nameplateLine}>
            {outcome.n} of {outcome.denominator} runs with a recorded outcome (
            {formatPct(outcome.n / outcome.denominator)})
          </div>
          {excluded > 0 && (
            <div style={nameplateLine}>{excluded} runs have no recorded outcome and are left out</div>
          )}
        </>
      )
    }
    if (!row) return null
    if (!row.value) {
      return (
        <>
          <div style={{ fontWeight: 600 }}>{row.label}</div>
          <div style={nameplateLine}>this can only happen under oracle score feedback</div>
        </>
      )
    }
    const detail =
      key === "correct-submit"
        ? "the oracle ended these runs after a correct submission"
        : key === "guard"
          ? "the run started repeating similar answers and was stopped"
          : key === "budget"
            ? "the run used its full token budget"
            : "the run record stops here, usually during a tool call"
    return (
      <>
        <div style={{ fontWeight: 600 }}>{row.label}</div>
        <div style={nameplateLine}>
          {row.value.n} of {row.value.denominator} runs (
          {formatPct(row.value.denominator > 0 ? row.value.n / row.value.denominator : 0)})
        </div>
        <div style={nameplateLine}>{detail}</div>
        {key === "other" && otherBreakdown.length > 0 && (
          <div style={nameplateLine}>
            {otherBreakdown.map(([reason, n]) => `${reason} ${n}`).join(" · ")}
          </div>
        )}
      </>
    )
  }

  const proportionRow = (
    key: string,
    label: string,
    value: { n: number; denominator: number } | null,
    dashNote?: string,
  ) => {
    const pct = value && value.denominator > 0 ? value.n / value.denominator : 0
    return (
      <div
        key={key}
        className="flex items-center gap-3"
        onMouseMove={handleRowMove(key)}
        style={{ cursor: "default" }}
      >
        <span
          className="font-mono"
          style={{ fontSize: 11, color: "var(--fg)", width: 220, flexShrink: 0 }}
        >
          {label}
        </span>
        <div
          aria-hidden
          style={{ flex: 1, height: 8, background: "var(--bg-surface)", position: "relative" }}
        >
          {value && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${Math.min(100, pct * 100)}%`,
                background: "var(--accent)",
                opacity: 0.75,
              }}
            />
          )}
        </div>
        <span
          className="font-mono tabular-nums"
          style={{ fontSize: 11, color: "var(--fg)", width: 88, textAlign: "right" }}
          title={value ? undefined : dashNote}
        >
          {value ? (
            <>
              {formatPct(pct)}
              <span style={{ color: "var(--fg-subtle)" }}> · {value.n}</span>
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
    )
  }

  return (
    <PanelCard kicker="Trajectories" title="How runs ended">
      <ConditionChips conditions={conditions} active={summary.condition} onChange={setCondition} />
      <div ref={rowsRef} style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
        {hover && <Nameplate x={hover.x} y={hover.y} wide>{hoverContent(hover.key)}</Nameplate>}
        <div className="space-y-2">
          {rows.map((row) => proportionRow(row.key, row.label, row.value, row.dashNote))}
        </div>

        {/* Outcome line, shown apart from the termination categories:
            under no feedback a correct run still ends at the guard or
            the budget, so its ending says nothing about its outcome. */}
        <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--border-soft)" }}>
          <div
            className="mb-1.5 font-mono uppercase"
            style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--fg-subtle)" }}
          >
            Outcome
          </div>
          {outcome ? (
            proportionRow(
              "outcome",
              "runs whose outcome was correct",
              outcome,
            )
          ) : (
            <div
              className="font-mono"
              style={{ fontSize: 10, color: "var(--fg-subtle)", letterSpacing: "0.04em" }}
            >
              this benchmark grades each run on a scale, so there is no correct/incorrect count
            </div>
          )}
          {outcome && outcome.denominator < summary.runCount && (
            <div
              className="mt-1 font-mono"
              style={{ fontSize: 10, color: "var(--fg-subtle)", letterSpacing: "0.04em" }}
            >
              over {outcome.denominator} runs with a recorded outcome
            </div>
          )}
        </div>
      </div>

      <p
        className="mt-3 text-[12px] leading-[1.6]"
        style={{ color: "var(--fg-muted)", maxWidth: 640 }}
      >
        The outcome is listed separately because many correct runs still end at the repetition
        guard or the token limit. &ldquo;Other endings&rdquo; counts runs whose record stops
        outside the three study categories, usually during a tool call.
      </p>

      {isResearchView && reasonKeys.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="ec-pill"
            onClick={() => setBreakdownOpen((v) => !v)}
          >
            {breakdownOpen ? "Hide" : "Show"} per-model stop-reason breakdown
          </button>
          {breakdownOpen && (
            <div className="overflow-x-auto mt-2">
              <table style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th
                      className="font-mono"
                      style={{ fontSize: 10, color: "var(--fg-subtle)", textAlign: "left", padding: "3px 10px 3px 0", fontWeight: 500 }}
                    >
                      model
                    </th>
                    {reasonKeys.map((reason) => (
                      <th
                        key={reason}
                        className="font-mono"
                        style={{ fontSize: 10, color: "var(--fg-subtle)", textAlign: "right", padding: "3px 10px", fontWeight: 500 }}
                      >
                        {reason}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.byModel.map((model) => (
                    <tr key={model.modelKey}>
                      <td
                        className="font-mono"
                        style={{ fontSize: 10.5, color: "var(--fg)", padding: "3px 10px 3px 0", whiteSpace: "nowrap" }}
                      >
                        {modelLabel(models, model.modelKey)}
                      </td>
                      {reasonKeys.map((reason) => {
                        const n = model.reasons[reason] ?? 0
                        return (
                          <td
                            key={reason}
                            className="font-mono tabular-nums"
                            style={{ fontSize: 10.5, color: n > 0 ? "var(--fg)" : "var(--fg-subtle)", textAlign: "right", padding: "3px 10px" }}
                            title={`${n} of ${model.total} runs`}
                          >
                            {model.total > 0 ? formatPct(n / model.total) : "—"}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
// Section wrapper.
// ---------------------------------------------------------------------------

export function CollectionTrajectories({
  evaluationId,
  isResearchView,
}: {
  evaluationId: string
  isResearchView: boolean
}) {
  const [payload, setPayload] = useState<EvalTrajectoriesPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    setPayload(null)
    fetchEvalTrajectories(evaluationId).then((data) => {
      if (!cancelled) setPayload(data)
    })
    return () => {
      cancelled = true
    }
  }, [evaluationId])

  const hasPanels = useMemo(
    () =>
      payload != null &&
      ((payload.tokens_to_success?.curves.length ?? 0) > 0 ||
        payload.reliability.length > 0 ||
        payload.termination.length > 0),
    [payload],
  )

  // Route absent / table absent / zero rows → the page renders exactly
  // as it does without this feature.
  if (!payload || !hasPanels) return null

  return (
    <div className="mb-4 space-y-4">
      {payload.tokens_to_success && payload.tokens_to_success.curves.length > 0 && (
        <TokensToSuccessCard
          panel={payload.tokens_to_success}
          models={payload.models}
          taskCount={payload.task_count}
        />
      )}
      {payload.reliability.length > 0 && (
        <ReliabilityCard
          panels={payload.reliability}
          models={payload.models}
          isResearchView={isResearchView}
        />
      )}
      {payload.termination.length > 0 && (
        <TerminationCard
          summaries={payload.termination}
          models={payload.models}
          isResearchView={isResearchView}
        />
      )}
    </div>
  )
}
