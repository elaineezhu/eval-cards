"use client"

import { Fragment, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react"

import type { HierarchyFamily, HierarchyLeaf } from "@/lib/backend-artifacts"
import type { BenchmarkCard, CategoryType } from "@/lib/benchmark-schema"
import type { BenchmarkEvalListItem } from "@/lib/eval-processing"

/**
 * Per-category chip colour. Uses oklch tokens so the chip reads against
 * both light and dark backgrounds; the saturation is held low to stay in
 * the editorial palette (no candy-bright accents).
 */
// Categories use the neutral chip styling — colour-coded chips read as
// noise against the editorial palette.

const LEAVES_INLINE_MIN = 2
const LEAVES_INLINE_MAX = 50

interface FamilyTableProps {
  families: HierarchyFamily[]
  totalModels: number
  evalItems?: Map<string, BenchmarkEvalListItem>
  /** Optional benchmark-metadata index (keyed by benchmark / leaf / family
   *  key). Used to look up per-leaf domains when the hierarchy doesn't
   *  carry `leaf.tags.domains`, so the domain filter works on data that
   *  only ships domains via the metadata file. */
  benchmarkCards?: Record<string, BenchmarkCard>
  /** Lower-cased domain slugs to filter the listing. When non-empty, every
   *  expandable family is auto-expanded and its leaves are restricted to
   *  those that touch one of the selected domains. Single-benchmark
   *  families are kept only when their domains intersect the filter.
   *  Pass `null`/`undefined` to disable filtering. */
  domainFilter?: Set<string> | null
}

function slugify(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Render a family key as a human-readable title — used as a fallback when
 *  the backend `display_name` is misleading (e.g. names a single leaf instead
 *  of the family). Common acronyms stay uppercase; everything else is title
 *  case. */
const FAMILY_KEY_ACRONYMS = new Set([
  "llm", "llms", "aa", "hf", "api", "cli", "sql", "gpt", "qa", "ai", "ml",
  "nlp", "rl", "vqa", "vlm", "mt", "cv",
])
function humanizeFamilyKey(key: string): string {
  return key
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => {
      if (FAMILY_KEY_ACRONYMS.has(word.toLowerCase())) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join("-")
}

interface LeafEntry {
  id: string
  leafKey: string
  leafName: string
  evalsCount: number
  domains: string[]
}

function collectLeafEntries(
  fam: HierarchyFamily,
  benchmarkCards?: Record<string, BenchmarkCard>,
): LeafEntry[] {
  const out: LeafEntry[] = []
  for (const leaf of fam.leaves ?? []) {
    // Backends differ in whether leaves carry an explicit
    // `eval_summary_ids` array. When absent, fall back to the
    // pipeline's standard `${fam.key}_${leaf.key}` naming, then to the
    // bare leaf key — both are stable enough for the detail page to
    // resolve. This stops the inline benchmarks grid from disappearing
    // on a backend that ships hierarchy.json without leaf eval ids.
    const explicit = leaf.eval_summary_ids ?? []
    const ids =
      explicit.length > 0
        ? explicit
        : leaf.key
        ? [`${fam.key}_${leaf.key}`, leaf.key]
        : []
    if (ids.length === 0) continue
    // Domain sources, in order of trust:
    //   (1) hierarchy `leaf.tags.domains` — sometimes absent
    //   (2) benchmark-metadata keyed by leaf.key
    //   (3) benchmark-metadata keyed by the leaf's eval_summary_id
    const collected = new Set<string>()
    for (const d of leaf.tags?.domains ?? []) collected.add(d.toLowerCase())
    const cardByLeaf = benchmarkCards?.[leaf.key]
    for (const d of cardByLeaf?.benchmark_details?.domains ?? []) collected.add(d.toLowerCase())
    for (const id of ids) {
      const cardById = benchmarkCards?.[id]
      for (const d of cardById?.benchmark_details?.domains ?? []) collected.add(d.toLowerCase())
    }
    out.push({
      id: ids[0],
      leafKey: leaf.key,
      leafName: leaf.display_name || leaf.key,
      evalsCount: leaf.evals_count ?? ids.length,
      domains: Array.from(collected),
    })
  }
  return out
}

/**
 * Pick the eval_summary_id to navigate to when the user clicks the family
 * row. Returns null when the family has no genuine family-level summary —
 * in that case the row click should expand the leaf list instead of
 * opening one arbitrary child.
 *
 * Some backend families flatten their leaf eval_summary_ids into the
 * family's own `eval_summary_ids` array (e.g. family `llm_stats` whose
 * direct ids are `llm_stats_aa_index`, `llm_stats_humaneval`, ... — each
 * a leaf summary). Those are NOT family-level composites; treating them
 * as such is what made clicking "LLM-Stats" land on AA Index.
 *
 * We filter direct ids down to those that are NOT also leaf ids. Whatever
 * remains is a real family-level summary. Then we apply slug-based
 * priority among those.
 */
function pickFamilyNavId(fam: HierarchyFamily, leafEntries: LeafEntry[]): string | null {
  const directIds = fam.eval_summary_ids ?? []
  const leafIdSet = new Set(leafEntries.map((l) => l.id))

  // Real family-level summaries: direct ids that aren't actually leaf ids
  // pulled up to the family. These resolve to is_aggregated/composite
  // summaries on the detail page.
  const compositeDirectIds = directIds.filter((id) => !leafIdSet.has(id))

  if (compositeDirectIds.length === 0) {
    // No genuine family-level composite. If there's exactly one leaf, the
    // family is just that leaf in disguise — open it. Otherwise return
    // null and let the caller expand the list.
    if (leafEntries.length === 1) return leafEntries[0].id
    return null
  }

  if (compositeDirectIds.length === 1) return compositeDirectIds[0]

  const famNameSlug = slugify(fam.display_name)
  const famKeySlug = slugify(fam.key)

  // 1. Direct composite whose slug equals the family display_name slug
  if (famNameSlug) {
    for (const id of compositeDirectIds) {
      if (slugify(id) === famNameSlug) return id
    }
  }

  // 2. Direct composite whose slug equals the family key slug
  for (const id of compositeDirectIds) {
    if (slugify(id) === famKeySlug) return id
  }

  // 3. First direct composite
  return compositeDirectIds[0]
}

/** Returns a one-line description for the family — but only when the
 *  description applies to the whole family. Specifically: we only use the
 *  benchmark_card overview attached to the family's *own* navigation
 *  target (a family-level/composite eval). We don't borrow descriptions
 *  from individual leaves, because a leaf's description describes that
 *  one benchmark, not the family as a whole. */
function pickFamilyDescription(
  navId: string | null,
  leafEntries: LeafEntry[],
  evalItems: Map<string, BenchmarkEvalListItem> | undefined,
): string | null {
  if (!evalItems || !navId) return null
  // If navId resolved to a leaf (single-benchmark family), the leaf's
  // description IS the family's description — that case is fine.
  // If navId resolved to a composite, ditto. The only case we exclude is
  // navId === null (no family-level summary), which the early return
  // covers.
  void leafEntries
  const overview = evalItems.get(navId)?.benchmark_card?.benchmark_details?.overview
  if (!overview) return null
  return overview.length > 140 ? overview.slice(0, 137) + "…" : overview
}

/** Detects whether the family's `display_name` is misleading: backend data
 *  sometimes labels a family after one of its leaves (e.g. family
 *  `llm_stats` with display_name "HumanEval"). When that's the case the
 *  row should be titled with the humanized key instead, so the user can
 *  see they're looking at a *family* rather than a single benchmark. */
function isFamilyDisplayNameMisleading(fam: HierarchyFamily, leafEntries: LeafEntry[]): boolean {
  const nameSlug = slugify(fam.display_name)
  if (!nameSlug) return false
  if (nameSlug === slugify(fam.key)) return false
  if (leafEntries.length < 2) return false
  return leafEntries.some(
    (l) => slugify(l.leafKey) === nameSlug || slugify(l.leafName) === nameSlug,
  )
}

interface RowData {
  key: string
  navId: string | null
  name: string
  keySlug: string
  category: CategoryType
  benchmarks: number
  evalsCount: number
  leaves: LeafEntry[]
  /** True when the family has many leaves with no clean family-level summary —
   *  we open it expanded so the user picks a leaf directly. */
  isAggregator: boolean
  description: string | null
}

export function FamilyTable({
  families,
  totalModels,
  evalItems,
  benchmarkCards,
  domainFilter,
}: FamilyTableProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const filterActive = Boolean(domainFilter && domainFilter.size > 0)

  function leafMatchesFilter(leaf: LeafEntry): boolean {
    if (!filterActive || !domainFilter) return true
    return leaf.domains.some((d) => domainFilter.has(d))
  }

  function familyMatchesFilter(
    fam: HierarchyFamily,
    navId: string | null,
    leafEntries: LeafEntry[],
  ): boolean {
    if (!filterActive || !domainFilter) return true
    if (leafEntries.some(leafMatchesFilter)) return true
    const candidates: BenchmarkCard | undefined = (() => {
      if (navId) {
        const fromList = evalItems?.get(navId)?.benchmark_card
        if (fromList) return fromList
      }
      return undefined
    })()
    const sources: Array<string[]> = []
    if (candidates) sources.push(candidates.benchmark_details?.domains ?? [])
    sources.push(benchmarkCards?.[fam.key]?.benchmark_details?.domains ?? [])
    for (const id of fam.eval_summary_ids ?? []) {
      sources.push(benchmarkCards?.[id]?.benchmark_details?.domains ?? [])
    }
    for (const list of sources) {
      for (const d of list) {
        if (domainFilter.has(d.trim().toLowerCase())) return true
      }
    }
    return false
  }

  const rows = useMemo<RowData[]>(() => {
    const out: RowData[] = []
    for (const fam of families) {
      const composites = fam.composites ?? []
      const standalone = fam.standalone_benchmarks ?? []
      const benchmarks = fam.benchmarks ?? []
      const leaves: HierarchyLeaf[] = fam.leaves ?? []

      const allBenchmarks = [
        ...standalone,
        ...benchmarks,
        ...composites.flatMap((c) => c.benchmarks ?? []),
      ]
      const metricCount =
        (fam.metrics?.length ?? 0) +
        allBenchmarks.reduce(
          (sum, b) => sum + ((b as { metrics?: unknown[] }).metrics?.length ?? 0),
          0,
        )
      const benchmarkCount =
        allBenchmarks.length > 0 ? allBenchmarks.length : leaves.length

      const leafEntries = collectLeafEntries(fam, benchmarkCards)
      const navId = pickFamilyNavId(fam, leafEntries)

      // An "aggregator" family has heterogeneous leaves; we expand it
      // inline so the user can pick a benchmark directly. When the family
      // has no real composite summary (navId === null) it's necessarily
      // an aggregator — clicking the row toggles expand instead of
      // navigating.
      const isAggregator = leafEntries.length >= LEAVES_INLINE_MIN || navId == null

      const displayName = isFamilyDisplayNameMisleading(fam, leafEntries)
        ? humanizeFamilyKey(fam.key)
        : fam.display_name

      // Description sourcing: prefer the eval item the row navigates to;
      // when there's no navId or its eval item carries no overview, walk
      // the leaves until we find one whose benchmark_card has one. That
      // way an aggregator family ("HELM", "BFCL") whose family-level row
      // doesn't directly link to a single eval still surfaces a one-line
      // description from any of its component benchmarks.
      const description = pickFamilyDescription(navId, leafEntries, evalItems)

      if (!familyMatchesFilter(fam, navId, leafEntries)) continue
      const visibleLeafEntries = filterActive
        ? leafEntries.filter(leafMatchesFilter)
        : leafEntries

      out.push({
        key: fam.key,
        navId,
        name: displayName,
        keySlug: fam.key,
        category: (fam.category ?? "General") as CategoryType,
        benchmarks: benchmarkCount,
        evalsCount: fam.evals_count ?? metricCount,
        leaves: visibleLeafEntries,
        isAggregator,
        description,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families, evalItems, benchmarkCards, domainFilter])

  return (
    <div className="overflow-x-auto">
      <table className="ec-htable">
        <thead>
          <tr>
            <th style={{ width: "60%" }}>Family</th>
            <th>Category</th>
            <th className="num">Benchmarks</th>
            <th className="num">Reported results</th>
            <th style={{ width: 90 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // When a domain filter is active we auto-expand every aggregator
            // so the matching leaves are immediately visible, but still let
            // the user collapse a row manually via the chevron.
            const isExpanded = filterActive
              ? expanded[row.key] ?? true
              : expanded[row.key] ?? false
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
                    // Allow chevron click without double-handling
                    const target = event.target as HTMLElement
                    if (target.closest("[data-row-toggle]")) return
                    if (row.navId) {
                      router.push(`/evals/${encodeURIComponent(row.navId)}`)
                    } else if (expandable) {
                      setExpanded((current) => ({ ...current, [row.key]: !isExpanded }))
                    }
                  }}
                  style={{ cursor: row.navId || expandable ? "pointer" : "default" }}
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
                      <div className="min-w-0">
                        <div className="font-semibold text-[14px] text-[color:var(--fg)] truncate">
                          {row.name}
                        </div>
                        {row.description && (
                          <div
                            className="mt-0.5"
                            style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                          >
                            {row.description}
                          </div>
                        )}
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
                    {row.benchmarks.toLocaleString()}
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
                    <td colSpan={5} style={{ padding: 0 }}>
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
