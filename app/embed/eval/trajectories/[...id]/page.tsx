"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { CollectionTrajectories } from "@/components/collection-trajectories"
import { EmbedSourcePicker, useEmbedEvalSummary } from "@/components/embed-eval-source"
import { EmbedStudyContext } from "@/components/embed-study-context"
import { fetchEvalTrajectories } from "@/lib/dashboard-data-client"
import {
  availableTrajectoryPanels,
  parseFeedbackConditionParam,
  parseTrajectoryPanelParam,
  TRAJECTORY_PANEL_LABELS,
  type EvalTrajectoriesPayload,
} from "@/lib/collection-trajectories"
import { routeIdFromSegments } from "@/lib/utils"

/**
 * Embed-only render of the study trajectory panels for one eval.
 * Designed for iframes: no nav, no audience bar, no surrounding chrome.
 * The panels exist only for per-source pages of curated study
 * collections; everything else renders a declared absence, never a
 * blank frame.
 *
 * Query params:
 *   ?panel=tokens|reliability|termination — render one panel
 *                                           (omitted = all available)
 *   ?condition=none|answer_feedback|unknown — preselect the feedback
 *                                             condition chips (they
 *                                             stay interactive)
 *   ?source=<composite_slug> — pin one source of a merged id
 *   ?mode=research|policy    — reader mode for hover detail
 *
 * Merged (single-segment) ids carry no trajectory data of their own;
 * the Source selector is the way in.
 */
export default function EmbedEvalTrajectories() {
  const params = useParams()
  const searchParams = useSearchParams()
  const evalId = routeIdFromSegments(params.id)
  const requestedPanel = parseTrajectoryPanelParam(searchParams.get("panel"))
  const initialCondition = parseFeedbackConditionParam(searchParams.get("condition"))

  const { mode } = useAudienceMode()
  const { summary, error, sources, activeSource, setActiveSource } = useEmbedEvalSummary(
    evalId,
    { sourceParam: searchParams.get("source") },
  )

  // The page owns the trajectory fetch (rather than the section
  // component) so it can say what is missing when the route serves
  // nothing. The result is keyed by the id it was fetched for: when the
  // source picker swaps the summary, the old payload is instantly
  // indistinguishable from "loading", so a stale source's panels can
  // never paint under the new summary's title. undefined = in flight,
  // null = served absence.
  const activeEvaluationId = summary?.evaluation_id
  const [fetchedPayload, setFetchedPayload] = useState<{
    id: string
    data: EvalTrajectoriesPayload | null
  } | null>(null)
  useEffect(() => {
    if (!activeEvaluationId) return
    let cancelled = false
    fetchEvalTrajectories(activeEvaluationId).then((data) => {
      if (!cancelled) setFetchedPayload({ id: activeEvaluationId, data })
    })
    return () => {
      cancelled = true
    }
  }, [activeEvaluationId])
  const payload =
    fetchedPayload && fetchedPayload.id === activeEvaluationId
      ? fetchedPayload.data
      : undefined

  if (error) {
    // Keep the source picker reachable so a failed pinned-source fetch
    // isn't a dead end.
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

  const available = availableTrajectoryPanels(payload ?? null)
  const body =
    payload === undefined ? (
      <div
        className="font-mono uppercase"
        style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--fg-subtle)" }}
      >
        Loading…
      </div>
    ) : payload == null || available.length === 0 ? (
      <div className="font-mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
        No trajectory data for this evaluation.
        {sources && sources.length > 0 && !activeSource
          ? " Pick a source to view the study's trajectories."
          : ""}
      </div>
    ) : requestedPanel && !available.includes(requestedPanel) ? (
      <div className="font-mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
        The &ldquo;{TRAJECTORY_PANEL_LABELS[requestedPanel]}&rdquo; panel is not
        available for this evaluation.
      </div>
    ) : (
      <CollectionTrajectories
        evaluationId={summary.evaluation_id}
        isResearchView={mode === "research"}
        payload={payload}
        panels={requestedPanel ? [requestedPanel] : undefined}
        initialCondition={initialCondition ?? undefined}
      />
    )

  return (
    <div>
      <div className="mb-3">
        <div
          className="font-mono uppercase"
          style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
        >
          {requestedPanel ? TRAJECTORY_PANEL_LABELS[requestedPanel] : "Study trajectories"}
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
      {body}
    </div>
  )
}
