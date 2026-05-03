"use client"

import { Fragment, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react"

import type { HierarchyFamily, HierarchyLeaf } from "@/lib/backend-artifacts"
import type { CategoryType } from "@/lib/benchmark-schema"

const CATEGORY_DOT: Record<string, string> = {
  General: "bg-sky-400",
  Reasoning: "bg-violet-400",
  Agentic: "bg-amber-400",
  Safety: "bg-rose-400",
  Code: "bg-emerald-400",
  Math: "bg-indigo-400",
  Multilingual: "bg-teal-400",
}

const LEAVES_INLINE_MIN = 2
const LEAVES_INLINE_MAX = 50

interface FamilyTableProps {
  families: HierarchyFamily[]
  totalModels: number
}

function slugify(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")
}

interface LeafEntry {
  id: string
  leafKey: string
  leafName: string
  evalsCount: number
}

function collectLeafEntries(fam: HierarchyFamily): LeafEntry[] {
  const out: LeafEntry[] = []
  for (const leaf of fam.leaves ?? []) {
    const ids = leaf.eval_summary_ids ?? []
    if (ids.length === 0) continue
    out.push({
      id: ids[0],
      leafKey: leaf.key,
      leafName: leaf.display_name || leaf.key,
      evalsCount: leaf.evals_count ?? ids.length,
    })
  }
  return out
}

/**
 * Pick the eval_summary_id that best matches a family's stated display_name.
 *
 * Backend hierarchy data sometimes has a family whose display_name names one
 * specific leaf (e.g. family `llm_stats`, display_name "HumanEval", with 471
 * leaves). The legacy "directIds[0]" pick navigates to whichever leaf was
 * processed first (often `aa_index`) — wrong. This helper:
 *
 * 1. If there is a leaf whose slug matches the family's display_name slug,
 *    prefer that leaf's id. (`HumanEval` → leaf `humaneval`.)
 * 2. Else if there is a direct family-level id whose slug equals the family
 *    key slug, prefer that (genuine family-level page).
 * 3. Otherwise fall back to the first available id.
 */
function pickFamilyNavId(fam: HierarchyFamily, leafEntries: LeafEntry[]): string | null {
  const directIds = fam.eval_summary_ids ?? []
  const all: Array<{ id: string; source: "direct" | "leaf"; leafKey?: string; leafName?: string }> = [
    ...directIds.map((id) => ({ id, source: "direct" as const })),
    ...leafEntries.map((l) => ({ id: l.id, source: "leaf" as const, leafKey: l.leafKey, leafName: l.leafName })),
  ]
  if (all.length === 0) return null
  if (all.length === 1) return all[0].id

  const famNameSlug = slugify(fam.display_name)
  const famKeySlug = slugify(fam.key)

  // 1. Leaf slug matches family display_name: e.g. display "HumanEval" → leaf "humaneval"
  if (famNameSlug && famNameSlug !== famKeySlug) {
    for (const entry of all) {
      if (entry.source !== "leaf") continue
      if (slugify(entry.leafKey) === famNameSlug || slugify(entry.leafName) === famNameSlug) {
        return entry.id
      }
    }
  }

  // 2. Direct family-level id: id slug equals family key slug
  for (const entry of all) {
    if (entry.source !== "direct") continue
    if (slugify(entry.id) === famKeySlug) return entry.id
  }

  // 3. Direct id starting with the family key only (a true family-level summary)
  for (const entry of all) {
    if (entry.source !== "direct") continue
    const idSlug = slugify(entry.id)
    if (idSlug.startsWith(famKeySlug) && idSlug.length === famKeySlug.length) {
      return entry.id
    }
  }

  // 4. Fall back: leaves first, then direct
  const leafFallback = all.find((e) => e.source === "leaf")
  if (leafFallback) return leafFallback.id
  return all[0].id
}

interface RowData {
  key: string
  navId: string | null
  name: string
  keySlug: string
  category: CategoryType
  composites: number
  benchmarks: number
  slices: number
  metrics: number
  evalsCount: number
  leaves: LeafEntry[]
  /** True when the family has many leaves with no clean family-level summary —
   *  we open it expanded so the user picks a leaf directly. */
  isAggregator: boolean
}

export function FamilyTable({ families, totalModels }: FamilyTableProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const rows = useMemo<RowData[]>(() => {
    return families.map((fam) => {
      const composites = fam.composites ?? []
      const standalone = fam.standalone_benchmarks ?? []
      const benchmarks = fam.benchmarks ?? []
      const leaves: HierarchyLeaf[] = fam.leaves ?? []

      const allBenchmarks = [
        ...standalone,
        ...benchmarks,
        ...composites.flatMap((c) => c.benchmarks ?? []),
      ]
      const sliceCount =
        fam.slices?.length ??
        allBenchmarks.reduce(
          (sum, b) => sum + ((b as { slices?: unknown[] }).slices?.length ?? 0),
          0,
        )
      const metricCount =
        (fam.metrics?.length ?? 0) +
        allBenchmarks.reduce(
          (sum, b) => sum + ((b as { metrics?: unknown[] }).metrics?.length ?? 0),
          0,
        )
      const benchmarkCount =
        allBenchmarks.length > 0 ? allBenchmarks.length : leaves.length

      const leafEntries = collectLeafEntries(fam)
      const navId = pickFamilyNavId(fam, leafEntries)

      // An "aggregator" family is one whose display_name doesn't really
      // describe a single benchmark (its leaves are heterogeneous). We
      // detect this by counting leaves and, when there are many, prefer
      // showing the leaf list rather than relying on the family-level id.
      const isAggregator = leafEntries.length >= LEAVES_INLINE_MIN

      return {
        key: fam.key,
        navId,
        name: fam.display_name,
        keySlug: fam.key,
        category: (fam.category ?? "General") as CategoryType,
        composites: composites.length,
        benchmarks: benchmarkCount,
        slices: sliceCount,
        metrics: metricCount,
        evalsCount: fam.evals_count ?? metricCount,
        leaves: leafEntries,
        isAggregator,
      }
    })
  }, [families])

  return (
    <div className="overflow-x-auto">
      <table className="ec-htable">
        <thead>
          <tr>
            <th style={{ width: "30%" }}>Family</th>
            <th>Category</th>
            <th className="num">Suites</th>
            <th className="num">Benchmarks</th>
            <th className="num">Slices</th>
            <th className="num">Metrics</th>
            <th className="num">Reported results</th>
            <th style={{ width: 90 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const dotClass = CATEGORY_DOT[row.category] ?? "bg-stone-400"
            const isExpanded = expanded[row.key] ?? false
            const expandable = row.isAggregator
            const visibleLeaves = isExpanded
              ? row.leaves.slice(0, LEAVES_INLINE_MAX)
              : []
            const hiddenLeafCount = isExpanded
              ? Math.max(row.leaves.length - LEAVES_INLINE_MAX, 0)
              : 0

            return (
              <Fragment key={row.key}>
                <tr
                  onClick={(event) => {
                    // Allow chevron click without navigating
                    const target = event.target as HTMLElement
                    if (target.closest("[data-row-toggle]")) return
                    if (row.navId) router.push(`/evals/${encodeURIComponent(row.navId)}`)
                  }}
                  style={{ cursor: row.navId ? "pointer" : "default" }}
                >
                  <td>
                    <div className="flex items-start gap-2.5 min-w-0">
                      {expandable ? (
                        <button
                          type="button"
                          data-row-toggle
                          onClick={(event) => {
                            event.stopPropagation()
                            setExpanded((current) => ({ ...current, [row.key]: !isExpanded }))
                          }}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Collapse family" : "Expand family"}
                          className="-ml-1 mt-0.5 inline-flex h-4 w-4 items-center justify-center transition-colors hover:text-[color:var(--accent)]"
                          style={{ color: "var(--fg-muted)" }}
                        >
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      ) : (
                        <span className="-ml-1 mt-0.5 inline-block h-4 w-4" aria-hidden />
                      )}
                      <span
                        className={`shrink-0 mt-1.5 h-2 w-2 rounded-full ${dotClass}`}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-[14px] text-[color:var(--fg)] truncate">
                          {row.name}
                        </div>
                        <div className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--fg-subtle)] mt-0.5 truncate">
                          {row.keySlug}
                          {expandable && (
                            <span className="ml-2 normal-case tracking-[0.04em]">
                              · {row.leaves.length} {row.leaves.length === 1 ? "benchmark" : "benchmarks"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--fg-muted)] border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-0.5">
                      {row.category}
                    </span>
                  </td>
                  <td className="num font-mono text-[13px]">
                    {row.composites > 0 ? row.composites.toLocaleString() : "—"}
                  </td>
                  <td className="num font-mono text-[13px]">
                    {row.benchmarks.toLocaleString()}
                  </td>
                  <td className="num font-mono text-[13px]">
                    {row.slices > 0 ? row.slices.toLocaleString() : "—"}
                  </td>
                  <td className="num font-mono text-[13px]">
                    {row.metrics > 0 ? row.metrics.toLocaleString() : "—"}
                  </td>
                  <td className="num font-mono text-[13px]">
                    {row.evalsCount.toLocaleString()}
                    {totalModels > 0 && (
                      <span className="text-[color:var(--fg-subtle)]"> / {totalModels.toLocaleString()}</span>
                    )}
                  </td>
                  <td>
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--accent)] inline-flex items-center gap-1">
                      {expandable ? (isExpanded ? "Hide" : "Browse") : "Open"}
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </span>
                  </td>
                </tr>

                {isExpanded && visibleLeaves.length > 0 && (
                  <tr style={{ background: "var(--bg-warm)" }}>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <div style={{ padding: "10px 24px 14px 64px" }}>
                        <div
                          className="font-mono uppercase mb-2"
                          style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
                        >
                          Benchmarks in this family · {row.leaves.length}
                        </div>
                        <ul
                          className="grid"
                          style={{
                            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                            gap: "0",
                            borderTop: "1px solid var(--border-soft)",
                            borderLeft: "1px solid var(--border-soft)",
                          }}
                        >
                          {visibleLeaves.map((leaf) => (
                            <li
                              key={leaf.id}
                              style={{
                                borderBottom: "1px solid var(--border-soft)",
                                borderRight: "1px solid var(--border-soft)",
                              }}
                            >
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  router.push(`/evals/${encodeURIComponent(leaf.id)}`)
                                }}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-[color:var(--bg-surface)]"
                              >
                                <div className="min-w-0">
                                  <div className="text-[13px] font-medium truncate text-[color:var(--fg)]">
                                    {leaf.leafName}
                                  </div>
                                  <div
                                    className="font-mono truncate"
                                    style={{ fontSize: 10, color: "var(--fg-subtle)", letterSpacing: "0.04em" }}
                                  >
                                    {leaf.id}
                                  </div>
                                </div>
                                <ArrowUpRight
                                  className="h-3 w-3 shrink-0"
                                  style={{ color: "var(--accent)" }}
                                  aria-hidden
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                        {hiddenLeafCount > 0 && (
                          <div
                            className="mt-2 font-mono uppercase"
                            style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-subtle)" }}
                          >
                            {hiddenLeafCount} more · open the family page to browse all
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
