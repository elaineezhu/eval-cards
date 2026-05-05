"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import type { BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import { cn } from "@/lib/utils"

interface ModelTableProps {
  rows: BenchmarkEvaluationCardData[]
  totalBenchmarks: number
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  maxCompare: number
}

function formatDateShort(value: string | undefined) {
  if (!value) return "—"
  const numeric = Number(value)
  const date =
    !Number.isNaN(numeric) && !value.includes("-")
      ? new Date(numeric * 1000)
      : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" })
}

function formatParams(row: BenchmarkEvaluationCardData) {
  if (row.params_billions != null && Number.isFinite(row.params_billions)) {
    if (row.params_billions >= 100) return `${Math.round(row.params_billions)}B`
    if (row.params_billions >= 10) return `${row.params_billions.toFixed(0)}B`
    if (row.params_billions >= 1) return `${row.params_billions.toFixed(1)}B`
    return `${(row.params_billions * 1000).toFixed(0)}M`
  }
  if (row.params && row.params !== "Not specified") return row.params
  return "—"
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

export function ModelTable({
  rows,
  totalBenchmarks,
  selectedIds,
  onToggleSelect,
  maxCompare,
}: ModelTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="ec-htable">
        <thead>
          <tr>
            <th style={{ width: "30%" }}>Model</th>
            <th>Developer</th>
            <th>Released</th>
            <th>Params</th>
            <th className="num">Benchmarks</th>
            <th className="num">Results</th>
            <th style={{ width: "20%" }}>Coverage</th>
            <th style={{ width: 90 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selectedIds.includes(row.id)
            const coverage =
              totalBenchmarks > 0
                ? clampPct((row.benchmarks_count / totalBenchmarks) * 100)
                : 0
            const cantSelect = !isSelected && selectedIds.length >= maxCompare

            return (
              <tr key={row.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() => {
                        if (cantSelect) return
                        onToggleSelect(row.id)
                      }}
                      disabled={cantSelect}
                      title={
                        cantSelect
                          ? `Compare tray full (max ${maxCompare}).`
                          : isSelected
                          ? "Remove from compare"
                          : "Add to compare"
                      }
                      className={cn(
                        "shrink-0 h-3.5 w-3.5 border transition-colors",
                        isSelected
                          ? "bg-[color:var(--accent)] border-[color:var(--accent)]"
                          : cantSelect
                          ? "border-[color:var(--border-soft)] cursor-not-allowed opacity-40"
                          : "border-[color:var(--border-strong)] hover:border-[color:var(--fg)]"
                      )}
                    >
                      <span className="sr-only">
                        {isSelected ? "Selected for compare" : "Add to compare"}
                      </span>
                    </button>
                    <Link
                      href={`/models/${row.route_id}`}
                      className="block min-w-0 group"
                    >
                      <div className="font-semibold text-[14px] text-[color:var(--fg)] group-hover:text-[color:var(--accent)] transition-colors">
                        {row.model_name}
                      </div>
                      {row.canonical_model_name &&
                        row.canonical_model_name !== row.model_name && (
                          <div className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--fg-subtle)] mt-0.5 truncate">
                            {row.canonical_model_name}
                          </div>
                        )}
                    </Link>
                  </div>
                </td>
                <td className="text-[13px] text-[color:var(--fg-muted)]">
                  {row.developer}
                </td>
                <td className="font-mono text-[12px] text-[color:var(--fg-muted)] num">
                  {formatDateShort(row.release_date)}
                </td>
                <td className="font-mono text-[12px] text-[color:var(--fg-muted)]">
                  {formatParams(row)}
                </td>
                <td className="num font-mono text-[13px]">
                  {row.benchmarks_count.toLocaleString()}
                  <span className="text-[color:var(--fg-subtle)]">
                    {" "}
                    / {totalBenchmarks.toLocaleString()}
                  </span>
                </td>
                <td className="num font-mono text-[13px]">
                  {row.evaluations_count.toLocaleString()}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="relative h-1.5 flex-1 bg-[color:var(--bg-surface)]">
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-[color:var(--accent)] motion-academic-progress"
                        style={{ width: `${coverage}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-[color:var(--fg)] tabular-nums w-9 text-right">
                      {Math.round(coverage)}%
                    </span>
                  </div>
                </td>
                <td>
                  <Link
                    href={`/models/${row.route_id}`}
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
