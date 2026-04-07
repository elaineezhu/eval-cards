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
import { getCategoryColor } from "@/lib/benchmark-schema"

const LICENSE_COLORS: Record<string, string> = {
  "mit": "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200",
  "apache": "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200",
  "cc by": "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200",
  "cc0": "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-200",
  "cc-by-sa": "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200",
}

function licenseBadgeClass(license: string): string {
  const l = license.toLowerCase()
  for (const [key, cls] of Object.entries(LICENSE_COLORS)) {
    if (l.includes(key)) return cls
  }
  return "bg-muted text-muted-foreground border-border"
}

function shortenLicense(license: string): string {
  if (!license || license === "Not specified") return ""
  // Shorten known verbose license names
  if (license.toLowerCase().includes("creative commons attribution 4")) return "CC BY 4.0"
  if (license.toLowerCase().includes("creative commons zero")) return "CC0"
  if (license.toLowerCase().includes("apache license 2") || license.toLowerCase().includes("apache 2")) return "Apache 2.0"
  if (license.toLowerCase().includes("mit license")) return "MIT"
  if (license.toLowerCase().includes("cc-by-sa")) return "CC BY-SA"
  if (license.length > 24) return license.slice(0, 22) + "…"
  return license
}

interface EvalCardProps {
  summary: BenchmarkEvalListItem
  delayMs?: number
}

export function EvalCard({ summary, delayMs = 0 }: EvalCardProps) {
  const router = useRouter()
  const { mode } = useAudienceMode()
  const isResearchView = mode === "research"
  const scorePercent = `${Math.round(summary.avg_score_norm * 100)}%`
  const purpose = summary.factsheet?.purpose ?? "General single-benchmark evaluation"
  const card = summary.benchmark_card
  const domains: string[] = card?.benchmark_details?.domains ?? []
  const license = card?.ethical_and_legal_considerations?.data_licensing ?? ""
  const shortLicense = shortenLicense(license)
  // Use the benchmark overview as a richer description when available
  const overviewText = card?.benchmark_details?.overview
  // Policy: rich context from metadata card
  const policyGoal = card?.purpose_and_intended_users?.goal
  const policyLimitations = card?.purpose_and_intended_users?.limitations
  const policyAudience = card?.purpose_and_intended_users?.audience
  const audienceText = Array.isArray(policyAudience)
    ? policyAudience.slice(0, 2).join("; ")
    : typeof policyAudience === "string"
    ? policyAudience
    : null
  // Research: score interpretation + similar benchmarks
  const scoreInterpretation = card?.methodology?.interpretation
  const rawSimilar = card?.benchmark_details?.similar_benchmarks
  const similarBenchmarks: string[] = Array.isArray(rawSimilar) ? rawSimilar : rawSimilar ? [rawSimilar] : []

  return (
    <Card
      className="motion-academic-enter motion-academic-surface motion-academic-hover cursor-pointer overflow-hidden border-border/70 bg-card hover:shadow-lg"
      style={{ "--enter-delay": `${delayMs}ms` } as CSSProperties}
      onClick={() => router.push(`/evals/${summary.evaluation_id}`)}
    >
      <CardHeader className="space-y-3 border-b border-border/60 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Single Benchmark
            </div>
            {summary.category && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getCategoryColor(summary.category)}`}>
                {summary.category}
              </span>
            )}
          </div>
          {shortLicense && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${licenseBadgeClass(license)}`}>
              {shortLicense}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-xl font-bold">{summary.evaluation_name}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Composite benchmark: {summary.composite_benchmark_name}
          </div>
          <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {overviewText ?? summary.metric_config.evaluation_description}
          </div>
        </div>

        {domains.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {domains.slice(0, 5).map((d) => (
              <span
                key={d}
                className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground"
              >
                {d}
              </span>
            ))}
            {domains.length > 5 && (
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                +{domains.length - 5}
              </span>
            )}
          </div>
        )}

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

            {/* Research: score interpretation from metadata */}
            {scoreInterpretation && (
              <div className="rounded-xl border border-sky-200/60 bg-sky-50/40 p-3 text-sm dark:border-sky-900/40 dark:bg-sky-950/10">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">Score interpretation</div>
                <p className="text-muted-foreground line-clamp-2">{scoreInterpretation}</p>
              </div>
            )}

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
                <DataRow label="Third-party" value={`${Math.round(summary.third_party_ratio * 100)}%`} />
                {similarBenchmarks.length > 0 && (
                  <DataRow label="See also" value={similarBenchmarks.slice(0, 3).join(", ")} />
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Policy: goal (from metadata card if available, otherwise factsheet purpose) */}
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/75 p-3 dark:border-amber-900/40 dark:bg-amber-950/15">
              <div className="flex items-start gap-2">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <div className="text-sm font-semibold">Purpose</div>
                  <div className="text-sm text-muted-foreground line-clamp-3">
                    {policyGoal ?? purpose}
                  </div>
                </div>
              </div>
            </div>

            {/* Policy: audience + limitations from metadata */}
            {(audienceText || policyLimitations) && (
              <div className="space-y-2">
                {audienceText && (
                  <div className="rounded-xl border border-sky-200/60 bg-sky-50/50 p-3 text-sm dark:border-sky-900/40 dark:bg-sky-950/15">
                    <span className="font-semibold text-sky-800 dark:text-sky-200">Intended for: </span>
                    <span className="text-muted-foreground">{audienceText}</span>
                  </div>
                )}
                {policyLimitations && (
                  <div className="rounded-xl border border-rose-200/60 bg-rose-50/50 p-3 text-sm dark:border-rose-900/40 dark:bg-rose-950/15">
                    <span className="font-semibold text-rose-800 dark:text-rose-200">Known limitation: </span>
                    <span className="text-muted-foreground line-clamp-2">{policyLimitations}</span>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <MetricPill icon={BadgeCheck} label="Independent" value={`${Math.round(summary.third_party_ratio * 100)}%`} tone="bg-emerald-100/80 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" />
              <MetricPill icon={BookOpenText} label="Models" value={summary.models_count.toLocaleString()} tone="bg-sky-100/80 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100" />
            </div>

            <div className="rounded-xl border bg-muted/10 p-3">
              <div className="space-y-1.5 text-sm">
                <DataRow label="Avg score" value={scorePercent} />
                <DataRow label="Reported by" value={summary.evaluator_names.join(", ") || "Unknown"} />
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
