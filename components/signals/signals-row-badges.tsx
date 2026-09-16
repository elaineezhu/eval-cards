"use client"

import type { ComparabilityStatus, RowAnnotations } from "@/lib/backend-artifacts"
import { cn } from "@/lib/utils"
import { CrossPartyDivergenceBadge } from "./cross-party-divergence-badge"
import { ReproducibilityBadge } from "./reproducibility-badge"
import { isNotAssessable } from "./signal-utils"
import { VariantDivergenceBadge } from "./variant-divergence-badge"

/**
 * Renders the row-level signal badges (reproducibility + divergence).
 *
 * Provenance is intentionally NOT rendered here — every leaderboard that
 * carries this row strip already has a dedicated EVALUATOR column in the
 * row chrome (first/third-party pill), and rendering the same fact twice
 * (in two different visual styles) was confusing readers.
 *
 * - `variant`="full" (default): reproducibility + variant + cross-party.
 *   Use for single-metric leaderboards and expanded row panels.
 * - `variant`="cell": only the divergence signals (variant + cross-party).
 *   Use inside multi-metric matrix cells where reproducibility is constant
 *   across columns and would just be visual noise.
 * - `variant`="row": only reproducibility — the constant per-(model,
 *   benchmark) signal. Pair with `variant="cell"` columns.
 */
export function SignalsRowBadges({
  annotations,
  comparabilityStatus,
  className,
  hideOnMobile = true,
  variant = "full",
}: {
  annotations?: RowAnnotations | null
  /** The row's comparability verdict, when the caller has it
   *  outside the annotation block (eval_results_view ships it flat). */
  comparabilityStatus?: ComparabilityStatus | null
  className?: string
  hideOnMobile?: boolean
  variant?: "full" | "cell" | "row"
}) {
  const showRowLevel = variant === "full" || variant === "row"
  const showCellLevel = variant === "full" || variant === "cell"

  // A row whose comparability group was never assessed carries the verdict
  // on the row itself, so it earns a chip even when the producer attached
  // no annotation struct to it.
  if (!annotations && !(showCellLevel && isNotAssessable(null, comparabilityStatus))) {
    return null
  }

  const hasReproducibility = showRowLevel && annotations?.reproducibility_gap?.has_reproducibility_gap
  // Strict `=== true` — the flags are nullable and a NULL is
  // "not assessable", which the variant badge renders in its own right.
  const hasVariant = showCellLevel && annotations?.variant_divergence?.has_variant_divergence === true
  const hasCrossParty =
    showCellLevel && annotations?.cross_party_divergence?.has_cross_party_divergence === true
  const notAssessable = showCellLevel && isNotAssessable(annotations, comparabilityStatus)

  if (!hasReproducibility && !hasVariant && !hasCrossParty && !notAssessable) {
    return null
  }

  return (
    <div
      className={cn(
        "mt-1.5 flex flex-wrap justify-end gap-1.5",
        hideOnMobile && "hidden md:flex",
        className
      )}
    >
      {showRowLevel && <ReproducibilityBadge gap={annotations?.reproducibility_gap} />}
      {showCellLevel && (
        <VariantDivergenceBadge
          divergence={annotations?.variant_divergence}
          annotations={annotations}
          comparabilityStatus={comparabilityStatus}
        />
      )}
      {showCellLevel && <CrossPartyDivergenceBadge divergence={annotations?.cross_party_divergence} />}
    </div>
  )
}
