"use client"

import { AlertTriangle } from "lucide-react"

import { useAudienceMode } from "@/components/audience-mode-provider"
import type { ReproducibilityGap } from "@/lib/backend-artifacts"
import { formatMissingField } from "./signal-utils"

export function ReproducibilityPanel({
  gap,
}: {
  gap?: ReproducibilityGap | null
}) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"

  if (!gap) {
    return null
  }

  return (
    <div className="rounded-2xl border bg-background/70 p-4">
      <div className="mb-4 flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
        <div>
          <div className="font-semibold">
            {isResearchView ? "Reproducibility" : "Re-runnability"}
          </div>
          <div className="text-sm text-muted-foreground">
            {isResearchView
              ? "Whether the setup is documented well enough for someone else to re-run."
              : "Whether someone could re-run this evaluation with the information available."}
          </div>
        </div>
      </div>

      <div className="space-y-2.5 text-sm">
        <PanelRow
          label="Setup fields recorded"
          value={`${gap.populated_field_count} of ${gap.required_field_count}`}
        />
        {gap.missing_fields.length > 0 && (
          <PanelRow
            label="Missing"
            value={gap.missing_fields.map(formatMissingField).join(", ")}
          />
        )}
      </div>
    </div>
  )
}

function PanelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words font-medium">{value}</span>
    </div>
  )
}
