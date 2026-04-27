"use client"

import type { RowAnnotations } from "@/lib/backend-artifacts"
import { cn } from "@/lib/utils"
import { CrossPartyDivergenceBadge } from "./cross-party-divergence-badge"
import { ProvenanceBadge } from "./provenance-badge"
import { ReproducibilityBadge } from "./reproducibility-badge"
import { VariantDivergenceBadge } from "./variant-divergence-badge"

/**
 * Renders the four signal badges for a single row.
 *
 * - `variant`="full" (default): shows all four signals. Use for single-metric
 *   leaderboards, expanded row panels, and one-off contexts.
 * - `variant`="cell": only shows divergence signals (variant + cross-party).
 *   Use inside multi-metric matrix cells, where reproducibility and provenance
 *   are constant across columns and would just be visual noise.
 * - `variant`="row": only shows reproducibility + provenance — the constant
 *   per-(model, benchmark) signals. Pair with `variant="cell"` columns so each
 *   row carries its constant signals once at the row header.
 */
export function SignalsRowBadges({
  annotations,
  className,
  hideOnMobile = true,
  variant = "full",
}: {
  annotations?: RowAnnotations | null
  className?: string
  hideOnMobile?: boolean
  variant?: "full" | "cell" | "row"
}) {
  if (!annotations) {
    return null
  }

  const showRowLevel = variant === "full" || variant === "row"
  const showCellLevel = variant === "full" || variant === "cell"

  const hasReproducibility = showRowLevel && annotations.reproducibility_gap?.has_reproducibility_gap
  const hasProvenance =
    showRowLevel &&
    Boolean(
      annotations.provenance && annotations.provenance.source_type !== "unspecified"
    )
  const hasVariant = showCellLevel && annotations.variant_divergence?.has_variant_divergence
  const hasCrossParty =
    showCellLevel && annotations.cross_party_divergence?.has_cross_party_divergence

  if (!hasReproducibility && !hasProvenance && !hasVariant && !hasCrossParty) {
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
      {showRowLevel && <ReproducibilityBadge gap={annotations.reproducibility_gap} />}
      {showRowLevel && <ProvenanceBadge provenance={annotations.provenance} />}
      {showCellLevel && <VariantDivergenceBadge divergence={annotations.variant_divergence} />}
      {showCellLevel && <CrossPartyDivergenceBadge divergence={annotations.cross_party_divergence} />}
    </div>
  )
}
