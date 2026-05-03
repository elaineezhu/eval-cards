"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import type { DeveloperListItem } from "@/lib/dashboard-data-client"

interface DeveloperTableProps {
  rows: DeveloperListItem[]
}

export function DeveloperTable({ rows }: DeveloperTableProps) {
  const maxModels = rows.reduce((m, r) => Math.max(m, r.model_count), 1)

  return (
    <div className="overflow-x-auto">
      <table className="ec-htable">
        <thead>
          <tr>
            <th style={{ width: "32%" }}>Developer</th>
            <th className="num">Models</th>
            <th className="num">Benchmarks</th>
            <th className="num">Reported results</th>
            <th style={{ width: "32%" }}>Top evaluations</th>
            <th style={{ width: 90 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((dev) => {
            const pct = (dev.model_count / maxModels) * 100
            return (
              <tr key={dev.route_id}>
                <td>
                  <Link
                    href={`/developers/${dev.route_id}`}
                    className="block min-w-0 group"
                  >
                    <div className="font-semibold text-[14px] text-[color:var(--fg)] group-hover:text-[color:var(--accent)] transition-colors">
                      {dev.developer}
                    </div>
                    <div className="mt-1 relative h-1 w-32 bg-[color:var(--bg-surface)]">
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-[color:var(--accent)] opacity-60"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                </td>
                <td className="num font-mono text-[13px]">
                  {dev.model_count.toLocaleString()}
                </td>
                <td className="num font-mono text-[13px]">
                  {dev.benchmark_count.toLocaleString()}
                </td>
                <td className="num font-mono text-[13px]">
                  {dev.evaluation_count.toLocaleString()}
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {dev.popular_evals.slice(0, 3).map((ev) => (
                      <span
                        key={ev.benchmark}
                        className="inline-flex items-center gap-1 border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-0.5 font-mono text-[10px] tracking-[0.04em] text-[color:var(--fg-muted)]"
                        title={`${ev.benchmark} · ${ev.model_count} models`}
                      >
                        <span className="truncate max-w-[120px]">
                          {ev.benchmark}
                        </span>
                        <span className="text-[color:var(--fg-subtle)]">
                          {ev.model_count}
                        </span>
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <Link
                    href={`/developers/${dev.route_id}`}
                    className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] inline-flex items-center gap-1"
                  >
                    Open
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
