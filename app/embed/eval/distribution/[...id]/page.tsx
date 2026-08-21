"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { ComputePlot, ScoreDistribution } from "@/components/score-distribution"
import { EmbedSourcePicker, useEmbedEvalSummary } from "@/components/embed-eval-source"
import { EmbedStudyContext } from "@/components/embed-study-context"
import { buildComputeProtocolSeries } from "@/lib/collections"
import {
  buildDistributionSeries,
  buildDistributionSliceAxis,
} from "@/lib/distribution-series"
import { routeIdFromSegments } from "@/lib/utils"

/**
 * Embed-only render of the score-distribution histogram for one eval.
 * Designed for iframes: no nav, no audience bar, no surrounding chrome.
 *
 * Slice-aware: when the eval has subtask slices (e.g. Global MMLU's
 * per-language splits), this page renders a SPLIT dropdown above the
 * plot so the embedded viewer can switch slices the same way the parent
 * eval page does. When there's no slice axis, falls back to building
 * one series per metric (e.g. agentharm's per-category histogram).
 *
 * Query params:
 *   ?view=distribution (default) — lock to distribution, hide toggle
 *   ?view=frontier              — lock to frontier, hide toggle
 *   ?view=both                  — show the Distribution/Frontier toggle
 *   ?view=compute               — study pages only: per-run scores over
 *                                 the study's compute axis; declared
 *                                 absence everywhere else
 *   ?slice=<subtask_key>        — start with this slice selected
 *
 * Merged (single-segment) ids default to the MERGED all-sources data and
 * render a Source selector; ?source=<composite_slug> pins one source's
 * instantiation, ?metric=<metric_id> selects the merged metric.
 */
export default function EmbedEvalDistribution() {
  const params = useParams()
  const searchParams = useSearchParams()
  const evalId = routeIdFromSegments(params.id)
  const viewParam = (searchParams.get("view") || "distribution").toLowerCase()
  const sliceParam = searchParams.get("slice")
  const showToggle = viewParam === "both"
  const computeRequested = viewParam === "compute"
  const defaultView: "distribution" | "frontier" =
    viewParam === "frontier" ? "frontier" : "distribution"

  const { mode } = useAudienceMode()
  const { summary, error, sources, activeSource, setActiveSource } = useEmbedEvalSummary(
    evalId,
    { metricParam: searchParams.get("metric"), sourceParam: searchParams.get("source") },
  )

  // Compute view: built from the payload's model_results (the rows that
  // carry protocol fields), gated on the per-source curated collection
  // attachment. Merged summaries never carry the attachment, so a
  // merged id yields null here until a source is pinned.
  const computeSeries = useMemo(
    () =>
      computeRequested && summary
        ? buildComputeProtocolSeries(
            summary.model_results,
            summary.collection,
            mode === "research",
          )
        : null,
    [computeRequested, summary, mode],
  )

  // Slice axis — present when the eval has multiple subtask-scope metrics
  // sharing a primary root metric (e.g. Global MMLU's 24 language splits).
  const sliceAxis = useMemo(
    () => (summary ? buildDistributionSliceAxis(summary) : null),
    [summary],
  )

  const ALL_SLICE_KEY = "__all__"
  const [activeSlice, setActiveSlice] = useState<string>(() => {
    if (sliceParam && sliceParam.trim()) return sliceParam.trim()
    return ALL_SLICE_KEY
  })
  // If the URL named a slice the eval doesn't carry, fall back to Overall
  // once the summary loads.
  useEffect(() => {
    if (!sliceAxis) return
    if (activeSlice === ALL_SLICE_KEY) return
    if (!sliceAxis.slices.some((s) => s.key === activeSlice)) {
      setActiveSlice(ALL_SLICE_KEY)
    }
  }, [activeSlice, sliceAxis])

  const series = useMemo(
    () => (summary ? buildDistributionSeries(summary, sliceAxis, activeSlice, ALL_SLICE_KEY) : null),
    [summary, sliceAxis, activeSlice],
  )

  if (error) {
    // Keep the source picker reachable so a failed pinned-source fetch
    // isn't a dead end — switching back to Merged (or another source)
    // clears the error and refetches.
    return (
      <div>
        <EmbedSourcePicker sources={sources} value={activeSource} onChange={setActiveSource} />
        <div className="font-mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
          Failed to load: {error}
        </div>
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
  // The compute branch never runs the distribution machinery: the
  // series/slice logic reads leaderboard_rows, which carry no protocol
  // fields, while the compute marks come from model_results. Keeping
  // the branches separate is what guarantees an empty compute result
  // renders the absence line below rather than a substituted histogram.
  if (computeRequested) {
    return (
      <div>
        <div className="mb-3">
          <div
            className="font-mono uppercase"
            style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
          >
            Score by compute setting
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
        <EmbedSourcePicker sources={sources} value={activeSource} onChange={setActiveSource} />
        <EmbedStudyContext summary={summary} />
        {computeSeries ? (
          <ComputePlot
            protocol={computeSeries}
            unit={summary.metric_config.unit ?? undefined}
            label={summary.metric_config.unit ?? "Score"}
          />
        ) : (
          <div className="font-mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
            This evaluation has no compute-varied protocol settings to plot.
          </div>
        )}
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
          {defaultView === "frontier" ? "Pareto frontier" : "Score distribution"}
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
      <EmbedSourcePicker sources={sources} value={activeSource} onChange={setActiveSource} />
      <EmbedStudyContext summary={summary} />
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
      <ScoreDistribution
        series={series}
        defaultView={defaultView}
        showViewToggle={showToggle}
      />
    </div>
  )
}
