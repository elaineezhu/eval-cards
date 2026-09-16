"use client"

import { GitCompareArrows, ScanLine } from "lucide-react"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { Badge } from "@/components/ui/badge"
import type { ComparabilityStatus, RowAnnotations, VariantDivergence } from "@/lib/backend-artifacts"
import { cn } from "@/lib/utils"
import { formatDifferingFields, formatSignalNumber, isNotAssessable } from "./signal-utils"
import { SignalTooltip } from "./signal-tooltip"

/**
 * The variant-divergence chip, and — because it is the first divergence
 * signal on the row — the row's "not assessable" chip. A NULL
 * flag or a non-`ok` comparability status means the group was never
 * checked; rendering nothing there would read as "checked, nothing found".
 * The cross-party badge stays silent in that case so a row carries one
 * "not assessable" chip, not two.
 */
export function VariantDivergenceBadge({
  divergence,
  annotations,
  comparabilityStatus,
  className,
}: {
  divergence?: VariantDivergence | null
  annotations?: RowAnnotations | null
  comparabilityStatus?: ComparabilityStatus | null
  className?: string
}) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"

  if (divergence?.has_variant_divergence !== true) {
    if (!isNotAssessable(annotations, comparabilityStatus)) {
      return null
    }
    const status = comparabilityStatus ?? annotations?.comparability_status
    const reason =
      status === "mixed_scale"
        ? "the numbers in its comparison group sit on mixed scales"
        : status === "no_bounds"
          ? "the metric declares no bounds to compare against"
          : "its comparison group could not be put on a common scale"
    return (
      <SignalTooltip
        content={
          isResearchView
            ? `Divergence was not assessed for this row: ${reason}.`
            : `This score could not be cross-checked, because ${reason}.`
        }
      >
        <Badge
          variant="outline"
          className={cn(
            "border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700/60 dark:bg-stone-900/40 dark:text-stone-200",
            className
          )}
        >
          <ScanLine className="h-3 w-3" />
          Not assessable
        </Badge>
      </SignalTooltip>
    )
  }

  const magnitude = formatSignalNumber(divergence.divergence_magnitude)
  const fields = formatDifferingFields(divergence.differing_setup_fields)
  const tooltip = isResearchView
    ? `Scores diverge by ${magnitude} across different setups: ${fields}.`
    : "Different runs of this evaluation produced different scores, so the setup matters."

  return (
    <SignalTooltip content={tooltip}>
      <Badge
        variant="outline"
        className={cn(
          "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-100",
          className
        )}
      >
        <GitCompareArrows className="h-3 w-3" />
        {isResearchView ? "Variant divergence" : "Score depends on setup"}
      </Badge>
    </SignalTooltip>
  )
}
