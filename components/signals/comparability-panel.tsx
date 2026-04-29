"use client"

import type { ReactNode } from "react"
import { ChevronDown, GitCompareArrows, Info, UsersRound } from "lucide-react"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { SignalTooltip } from "@/components/signals/signal-tooltip"
import type { BenchmarkComparability, ComparabilitySummary, DifferingSetupField } from "@/lib/backend-artifacts"
import {
  formatFieldLabel,
  formatSignalNumber,
  formatSignalValue,
} from "./signal-utils"

export function ComparabilityPanel({
  comparability,
  summary,
}: {
  comparability?: BenchmarkComparability | null
  summary?: ComparabilitySummary
}) {
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const variantGroups = comparability?.variant_divergence_groups ?? []
  const crossPartyGroups = comparability?.cross_party_divergence_groups ?? []
  const showNoCrossPartyNote = summary?.groups_with_cross_party_check === 0

  if (variantGroups.length === 0 && crossPartyGroups.length === 0 && !showNoCrossPartyNote) {
    return null
  }

  return (
    <section
      id="comparability-panel"
      className="rounded-2xl border border-border/70 bg-background/70 p-4 sm:p-5 scroll-mt-24"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">
              {isResearchView ? "Comparability" : "Can these scores be compared directly?"}
            </h3>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isResearchView
              ? "Groups where reported scores diverge across setups or reporting organizations."
              : "Flags cases where score differences may come from setup choices or different reporting sources."}
          </p>
        </div>
        {summary && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{summary.groups_with_variant_check} setup checks</Badge>
            <Badge variant="outline">{summary.groups_with_cross_party_check} source checks</Badge>
          </div>
        )}
      </div>

      {showNoCrossPartyNote && (
        <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
          No third-party reports are available for cross-party comparison.
        </div>
      )}

      {(() => {
        const onlyOne =
          (variantGroups.length > 0 ? 1 : 0) + (crossPartyGroups.length > 0 ? 1 : 0) === 1
        const sectionClass = onlyOne ? "" : "lg:grid lg:grid-cols-2 lg:gap-3"
        const itemsClass = onlyOne ? "grid gap-2 md:grid-cols-2" : "space-y-2"
        return (
          <div className={`mt-4 ${sectionClass}`}>
            {variantGroups.length > 0 && (
              <GroupList
                icon="variant"
                title="Variant divergence"
                count={variantGroups.length}
                itemsClassName={itemsClass}
              >
                {variantGroups.slice(0, 8).map((group) => (
                  <DivergenceGroupItem
                    key={group.group_id}
                    modelRouteId={group.model_route_id}
                    magnitude={group.divergence_magnitude}
                    threshold={group.threshold_used}
                    fields={group.differing_setup_fields}
                  />
                ))}
              </GroupList>
            )}

            {crossPartyGroups.length > 0 && (
              <GroupList
                icon="cross-party"
                title="Cross-party divergence"
                count={crossPartyGroups.length}
                itemsClassName={itemsClass}
              >
                {crossPartyGroups.slice(0, 8).map((group) => (
                  <DivergenceGroupItem
                    key={group.group_id}
                    modelRouteId={group.model_route_id}
                    magnitude={group.divergence_magnitude}
                    threshold={group.threshold_used}
                    fields={group.differing_setup_fields}
                    scoresByOrganization={group.scores_by_organization}
                  />
                ))}
              </GroupList>
            )}
          </div>
        )
      })()}
    </section>
  )
}

function GroupList({
  icon,
  title,
  count,
  children,
  itemsClassName = "space-y-2",
}: {
  icon: "variant" | "cross-party"
  title: string
  count: number
  children: ReactNode
  itemsClassName?: string
}) {
  const Icon = icon === "variant" ? GitCompareArrows : UsersRound

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-muted/10 px-3 py-2 text-left transition-colors hover:bg-muted/20"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
            <Badge variant="secondary">{count}</Badge>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className={`mt-2 ${itemsClassName}`}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Try to extract a human-readable label from a structured setup-field value.
 * Common shape from agentic evals: { additional_details: { agent_name, agent_framework } }.
 * Falls back to picking the first short string property, or null when the
 * value can't be summarized cleanly.
 */
function extractFriendlyLabel(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") return value.length > 60 ? null : value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof value !== "object") return null

  const obj = value as Record<string, unknown>
  const details = (obj.additional_details && typeof obj.additional_details === "object")
    ? (obj.additional_details as Record<string, unknown>)
    : obj

  const agentName = typeof details.agent_name === "string" ? details.agent_name : null
  const agentFramework = typeof details.agent_framework === "string" ? details.agent_framework : null
  if (agentName) {
    return agentFramework && agentFramework !== agentName ? `${agentName} (${agentFramework})` : agentName
  }

  for (const key of ["name", "label", "id", "title"]) {
    const v = details[key]
    if (typeof v === "string" && v.length <= 60) return v
  }

  return null
}

function chipsForFieldValues(values: unknown[]): { label: string; raw: unknown }[] {
  const seen = new Set<string>()
  const result: { label: string; raw: unknown }[] = []
  for (const v of values) {
    const friendly = extractFriendlyLabel(v)
    const label = friendly ?? formatSignalValue(v)
    const truncated = label.length > 80 ? label.slice(0, 80) + "…" : label
    if (seen.has(truncated)) continue
    seen.add(truncated)
    result.push({ label: truncated, raw: v })
  }
  return result
}

function DivergenceGroupItem({
  modelRouteId,
  magnitude,
  threshold,
  fields,
  scoresByOrganization,
}: {
  modelRouteId: string
  magnitude: number
  threshold: number
  fields: DifferingSetupField[]
  scoresByOrganization?: Record<string, number>
}) {
  const fieldLabels = fields.map((f) => formatFieldLabel(f.field))
  const summarySentence =
    fieldLabels.length === 0
      ? `Reported scores diverge by ${formatSignalNumber(magnitude)}, above the ${formatSignalNumber(threshold)} threshold. The setup difference is not labelled.`
      : `Reported scores diverge by ${formatSignalNumber(magnitude)} (threshold ${formatSignalNumber(threshold)}) because the runs differ on ${
          fieldLabels.length === 1
            ? fieldLabels[0]
            : fieldLabels.slice(0, -1).join(", ") + " and " + fieldLabels[fieldLabels.length - 1]
        }. The chips below show each variant.`

  return (
    <a
      href={`#row-${modelRouteId}`}
      className="block rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{modelRouteId}</span>
            <SignalTooltip content={summarySentence}>
              <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-muted-foreground" />
            </SignalTooltip>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Diverges by {formatSignalNumber(magnitude)} (threshold {formatSignalNumber(threshold)})
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-primary">Jump to row</span>
      </div>

      {fields.slice(0, 3).map((field) => {
        const chips = chipsForFieldValues(field.values).slice(0, 6)
        const overflow = field.values.length - chips.length
        return (
          <div key={field.field} className="mt-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Differs by {formatFieldLabel(field.field)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip, idx) => {
                const friendly = extractFriendlyLabel(chip.raw)
                const tooltipBody = friendly ? formatSignalValue(chip.raw) : null
                const pill = (
                  <span
                    className="inline-flex max-w-[18rem] items-center rounded-full border border-border/60 bg-muted/20 px-2 py-0.5 text-[11px] text-foreground/90 truncate"
                    title={!tooltipBody ? chip.label : undefined}
                  >
                    {chip.label}
                  </span>
                )
                return tooltipBody ? (
                  <SignalTooltip
                    key={`${field.field}-${idx}`}
                    content={
                      <span className="block max-w-[24rem] break-all font-mono text-[10px] leading-snug">
                        {tooltipBody}
                      </span>
                    }
                  >
                    {pill}
                  </SignalTooltip>
                ) : (
                  <span key={`${field.field}-${idx}`}>{pill}</span>
                )
              })}
              {overflow > 0 && (
                <span className="inline-flex items-center rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                  +{overflow} more
                </span>
              )}
            </div>
          </div>
        )
      })}

      {scoresByOrganization && Object.keys(scoresByOrganization).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(scoresByOrganization).slice(0, 4).map(([org, score]) => (
            <span
              key={org}
              className="rounded-full border border-border/60 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {org}: {formatSignalNumber(score)}
            </span>
          ))}
        </div>
      )}
    </a>
  )
}
