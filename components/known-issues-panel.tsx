"use client"

import { AlertOctagon, AlertTriangle, ExternalLink, Info } from "lucide-react"
import type { KnownIssue } from "@/lib/known-issues"

interface KnownIssuesPanelProps {
  issues: KnownIssue[]
  /**
   * "compact" — single-line summary chip suitable for surfacing at the top of
   * the policy overview. "full" — full bordered list with descriptions.
   */
  variant?: "compact" | "full"
}

const SEVERITY_STYLE: Record<KnownIssue["severity"], { wrap: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  info: {
    wrap: "border-sky-300/60 bg-sky-50/60 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-100",
    icon: Info,
    label: "Note",
  },
  warning: {
    wrap: "border-amber-300/60 bg-amber-50/60 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100",
    icon: AlertTriangle,
    label: "Known issue",
  },
  critical: {
    wrap: "border-rose-300/60 bg-rose-50/60 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-100",
    icon: AlertOctagon,
    label: "Critical issue",
  },
}

export function KnownIssuesPanel({ issues, variant = "full" }: KnownIssuesPanelProps) {
  if (issues.length === 0) return null

  const sorted = [...issues].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const headlineSeverity = sorted[0].severity
  const Style = SEVERITY_STYLE[headlineSeverity]
  const Icon = Style.icon

  if (variant === "compact") {
    return (
      <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm ${Style.wrap}`}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <span className="font-semibold">
            {issues.length} known issue{issues.length === 1 ? "" : "s"} documented
          </span>
          <span className="ml-1 text-muted-foreground">— see below for detail.</span>
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Known issues with this benchmark
      </div>
      <ul className="space-y-2">
        {sorted.map((issue, idx) => {
          const S = SEVERITY_STYLE[issue.severity]
          const I = S.icon
          return (
            <li
              key={`${issue.title}-${idx}`}
              className={`rounded-2xl border px-3.5 py-3 ${S.wrap}`}
            >
              <div className="flex items-start gap-2">
                <I className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
                      {S.label}
                    </span>
                    <span className="font-semibold leading-tight">{issue.title}</span>
                  </div>
                  <p className="mt-1 text-sm leading-5 opacity-90">{issue.summary}</p>
                  {(issue.source_url || issue.published) && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs opacity-80">
                      {issue.source_url && (
                        <a
                          href={issue.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                        >
                          Source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {issue.published && <span>Published {issue.published}</span>}
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function severityRank(s: KnownIssue["severity"]): number {
  if (s === "critical") return 3
  if (s === "warning") return 2
  return 1
}
