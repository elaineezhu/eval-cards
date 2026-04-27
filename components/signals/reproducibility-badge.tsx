"use client"

import { AlertTriangle } from "lucide-react"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { Badge } from "@/components/ui/badge"
import type { ReproducibilityGap } from "@/lib/backend-artifacts"
import { cn } from "@/lib/utils"
import { formatMissingField } from "./signal-utils"
import { SignalTooltip } from "./signal-tooltip"

export function ReproducibilityBadge({
  gap,
  className,
}: {
  gap?: ReproducibilityGap | null
  className?: string
}) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"

  if (!gap?.has_reproducibility_gap) {
    return null
  }

  const missing = gap.missing_fields.map(formatMissingField)
  const countLine = `${gap.populated_field_count} of ${gap.required_field_count} setup fields recorded.`
  const tooltip = isResearchView
    ? `Setup not fully documented. Missing: ${missing.join(", ") || "none listed"}. ${countLine}`
    : `This score's setup is not fully documented, so it cannot be re-run as-is. ${countLine}`

  return (
    <SignalTooltip content={tooltip}>
      <Badge
        variant="outline"
        className={cn(
          "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
          className
        )}
      >
        <AlertTriangle className="h-3 w-3" />
        {isResearchView ? "Reproducibility gap" : "Setup not documented"}
      </Badge>
    </SignalTooltip>
  )
}
