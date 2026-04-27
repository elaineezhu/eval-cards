"use client"

import type { ReactNode } from "react"
import { ChevronDown, GitCompareArrows, UsersRound } from "lucide-react"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
    <section className="rounded-2xl border border-border/70 bg-background/70 p-4 sm:p-5">
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

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {variantGroups.length > 0 && (
          <GroupList
            icon="variant"
            title="Variant divergence"
            count={variantGroups.length}
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
    </section>
  )
}

function GroupList({
  icon,
  title,
  count,
  children,
}: {
  icon: "variant" | "cross-party"
  title: string
  count: number
  children: ReactNode
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
      <CollapsibleContent className="mt-2 space-y-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
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
  return (
    <a
      href={`#row-${modelRouteId}`}
      className="block rounded-xl border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{modelRouteId}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Divergence {formatSignalNumber(magnitude)}; threshold {formatSignalNumber(threshold)}
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-primary">Jump to row</span>
      </div>

      {fields.length > 0 && (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {fields.slice(0, 3).map((field) => (
            <div key={field.field}>
              <span className="font-medium text-foreground">{formatFieldLabel(field.field)}:</span>{" "}
              {field.values.map(formatSignalValue).join(", ")}
            </div>
          ))}
        </div>
      )}

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
