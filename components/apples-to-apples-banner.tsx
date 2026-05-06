"use client"

import { AlertTriangle, GitCompareArrows, UsersRound } from "lucide-react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { SignalTooltip } from "@/components/signals/signal-tooltip"
import type { ComparabilitySummary } from "@/lib/backend-artifacts"

interface ApplesToApplesBannerProps {
  summary?: ComparabilitySummary | null
  /**
   * Optional anchor id so the "see details" link can scroll to the full
   * Comparability panel further down the page.
   */
  detailsAnchorId?: string
}

/**
 * High-visibility warning shown above the leaderboard when the row-level
 * comparability summary indicates that some scores were collected under
 * different setups (variant divergence) or only by the model developer
 * (cross-party divergence). Designed to interrupt naive ranking comparisons
 * before the reader scrolls to the per-row signals.
 */
export function ApplesToApplesBanner({ summary, detailsAnchorId }: ApplesToApplesBannerProps) {
  const { mode } = useAudienceMode()

  if (!summary) return null

  const variantCount = summary.variant_divergent_count ?? 0
  const crossPartyCount = summary.cross_party_divergent_count ?? 0
  const totalConcerns = variantCount + crossPartyCount
  if (totalConcerns === 0) return null

  const variantsChecked = summary.groups_with_variant_check ?? 0
  const crossPartyChecked = summary.groups_with_cross_party_check ?? 0

  const concernPhrases: string[] = []
  if (variantCount > 0) {
    concernPhrases.push(
      `${variantCount} group${variantCount === 1 ? "" : "s"} where models used different setups`,
    )
  }
  if (crossPartyCount > 0) {
    concernPhrases.push(
      `${crossPartyCount} group${crossPartyCount === 1 ? "" : "s"} where reports come only from the model developer`,
    )
  }

  const headline =
    mode === "policy"
      ? "Heads up: not every score here is directly comparable."
      : "Apples-to-apples warning"

  const body =
    mode === "policy"
      ? `${concernPhrases.join(" and ")}. Direct ranking comparisons may be misleading.`
      : `${concernPhrases.join("; ")}. See the Comparability panel below for which models and which fields differ.`

  return (
    <div
      className="flex items-start gap-3 px-4 py-3"
      style={{
        border: "1px solid var(--border-soft)",
        borderLeft: "2px solid var(--fg-muted)",
        background: "var(--bg-warm)",
        color: "var(--fg)",
      }}
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color: "var(--fg-muted)" }}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="font-semibold text-[14px] leading-tight">{headline}</div>
        <p className="text-[13px] leading-5" style={{ color: "var(--fg-muted)" }}>{body}</p>
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono uppercase tracking-[0.1em]"
          style={{ fontSize: 10, color: "var(--fg-subtle)" }}
        >
          {variantCount > 0 && (
            <SignalTooltip
              content={`${variantCount} of ${variantsChecked} groups checked for setup divergence flagged a problem (e.g. different shots, prompts, or scoring).`}
            >
              <span className="inline-flex items-center gap-1 cursor-help">
                <GitCompareArrows className="h-3 w-3" />
                Setup divergence: {variantCount}/{variantsChecked || variantCount}
              </span>
            </SignalTooltip>
          )}
          {crossPartyCount > 0 && (
            <SignalTooltip
              content={`${crossPartyCount} of ${crossPartyChecked} groups checked for source divergence flagged a problem (only the model developer reported a number).`}
            >
              <span className="inline-flex items-center gap-1 cursor-help">
                <UsersRound className="h-3 w-3" />
                Source divergence: {crossPartyCount}/{crossPartyChecked || crossPartyCount}
              </span>
            </SignalTooltip>
          )}
          {detailsAnchorId && (
            <a
              href={`#${detailsAnchorId}`}
              className="ml-auto font-medium hover:underline underline-offset-4"
              style={{ color: "var(--fg-muted)" }}
            >
              See details ↓
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
