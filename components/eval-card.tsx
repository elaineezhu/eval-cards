"use client"

import type { ComponentType, CSSProperties } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  BadgeCheck,
  BookOpenText,
  ChartNoAxesColumn,
  FlaskConical,
  Scale,
  Users,
} from "lucide-react"
import type { BenchmarkEvalListItem } from "@/lib/eval-processing"

interface EvalCardProps {
  summary: BenchmarkEvalListItem
  delayMs?: number
}

export function EvalCard({ summary, delayMs = 0 }: EvalCardProps) {
  const router = useRouter()
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const scorePercent = `${Math.round(summary.avg_score_norm * 100)}%`
  const purpose = summary.factsheet?.purpose ?? "General capability evaluation"

  return (
    <Card
      className="motion-academic-enter motion-academic-surface motion-academic-hover cursor-pointer overflow-hidden border-border/70 bg-card hover:shadow-lg"
      style={{ "--enter-delay": `${delayMs}ms` } as CSSProperties}
      onClick={() => router.push(`/evals/${summary.evaluation_id}`)}
    >
      <CardHeader className="space-y-3 border-b border-border/60 pb-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Eval Summary
        </div>

        <div className="min-w-0">
          <div className="text-xl font-bold">{summary.evaluation_name}</div>
          <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {summary.metric_config.evaluation_description}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {summary.third_party_ratio > 0 && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              <BadgeCheck className="mr-1 h-3 w-3" />
              Independently evaluated
            </Badge>
          )}
          {summary.missing_generation_config_count > 0 && (
            <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-500">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Partial config
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {isResearchView ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <MetricPill icon={FlaskConical} label="Models" value={summary.models_count.toLocaleString()} tone="bg-sky-100/80 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100" />
              <MetricPill icon={ChartNoAxesColumn} label="Avg Score" value={scorePercent} tone="bg-amber-100/80 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" />
              <MetricPill icon={Users} label="Evaluators" value={summary.evaluator_names.length.toLocaleString()} tone="bg-emerald-100/80 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" />
            </div>

            <div className="rounded-xl border bg-muted/10 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Methodology</div>
              <div className="space-y-1.5 text-sm">
                {summary.factsheet?.principles_tested && summary.factsheet.principles_tested !== "Not specified" && (
                  <DataRow label="Principles" value={summary.factsheet.principles_tested} />
                )}
                {summary.latest_source_name && (
                  <DataRow label="Source" value={summary.latest_source_name} />
                )}
                <DataRow
                  label="Config"
                  value={
                    summary.missing_generation_config_count > 0
                      ? `${summary.missing_generation_config_count} result${summary.missing_generation_config_count !== 1 ? "s" : ""} without config`
                      : "Fully documented"
                  }
                />
                <DataRow
                  label="Third-party"
                  value={`${Math.round(summary.third_party_ratio * 100)}%`}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/75 p-3 dark:border-amber-900/40 dark:bg-amber-950/15">
              <div className="flex items-start gap-2">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <div className="text-sm font-semibold">Purpose</div>
                  <div className="text-sm text-muted-foreground">{purpose}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <MetricPill icon={BadgeCheck} label="Independent" value={`${Math.round(summary.third_party_ratio * 100)}%`} tone="bg-emerald-100/80 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" />
              <MetricPill icon={BookOpenText} label="Models" value={summary.models_count.toLocaleString()} tone="bg-sky-100/80 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100" />
            </div>

            <div className="rounded-xl border bg-muted/10 p-3">
              <div className="space-y-1.5 text-sm">
                <DataRow
                  label="Avg score"
                  value={scorePercent}
                />
                <DataRow
                  label="Reported by"
                  value={summary.evaluator_names.join(", ") || "Unknown"}
                />
                {summary.missing_generation_config_count > 0 && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    Some results lack documented generation settings — direct score comparisons should be read with care.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MetricPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  tone: string
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2 ${tone}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</span>
      </div>
      <span className="text-sm font-bold">{value}</span>
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}
