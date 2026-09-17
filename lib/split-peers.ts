// Split-aware cross-source peer pool for the model page's per-benchmark
// histogram. The comparison index holds every source page's per-metric
// leaderboard; this module turns those per-source score rows into one
// observation pool for a single (benchmark, effective metric, direction),
// partitions it by reported split label, and ranks the current model in it.
//
// Pure — no React, no DOM. The component gates entry on
// `comparison_index_version >= 2`; without the gate none of this runs.

import type {
  ComparisonEvalEntry,
  ComparisonIndex,
  ComparisonScoreEntry,
} from "@/lib/backend-artifacts"

export type SplitLabel = "train" | "test" | "validation"

/** One model's result on one source page for one metric. */
export interface PeerObservation {
  modelRouteId: string
  sourceEvalId: string
  sourceSlug: string
  sourceDisplayName: string
  /** Normalised split; null when the source stated none or stated a token
   *  outside the recognised vocabulary. */
  label: SplitLabel | null
  rawLabel: string | null
  /** Canonical-scale score when the producer emitted one, else the raw score. */
  score: number
  entry: ComparisonScoreEntry
}

export interface PeerPartition {
  /** Class 1 — both labels recognised and equal. */
  compared: PeerObservation[]
  /** Class 2 — either side's label is unknown or absent. */
  unknown: PeerObservation[]
  /** Class 3 — both recognised and different. */
  excluded: PeerObservation[]
  /** Distinct model_route_id count per excluded label. */
  excludedByLabel: Record<string, number>
}

export function normaliseSplitLabel(
  raw: string | null | undefined,
): SplitLabel | null {
  const value = (raw ?? "").trim().toLowerCase()
  if (value === "train") return "train"
  if (value === "test") return "test"
  if (value === "validation" || value === "val" || value === "dev") return "validation"
  return null
}

export function canonicalScoreOf(entry: {
  score: number
  score_canonical?: number | null
}): number | null {
  const value = entry.score_canonical ?? entry.score
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function isBetter(candidate: number, incumbent: number, lowerIsBetter: boolean) {
  return lowerIsBetter ? candidate < incumbent : candidate > incumbent
}

function compareStrings(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Every identifier the current model may appear under on a score row: the
 *  route id, the group-root `model_family_id` the rows actually carry, and the
 *  legacy `model_group_id`. Shared by the current-row lookup and peer
 *  exclusion so a model can never be both. */
export function matchesIdentity(
  entry: ComparisonScoreEntry,
  identityKeys: Set<string>,
): boolean {
  return (
    identityKeys.has(entry.model_route_id) ||
    identityKeys.has(entry.model_family_id) ||
    identityKeys.has(entry.model_group_id)
  )
}

/** Non-merged entries grouped by canonical benchmark. Built once per histogram
 *  build so the collector never rescans every eval entry per metric tab. */
export type BenchmarkEntryIndex = Map<string, Array<[string, ComparisonEvalEntry]>>

export function buildBenchmarkEntryIndex(index: ComparisonIndex): BenchmarkEntryIndex {
  const byBenchmark: BenchmarkEntryIndex = new Map()
  for (const [evalId, entry] of Object.entries(index.evals ?? {})) {
    if (entry.is_merged) continue
    if (!entry.benchmark_id) continue
    const bucket = byBenchmark.get(entry.benchmark_id)
    if (bucket) bucket.push([evalId, entry])
    else byBenchmark.set(entry.benchmark_id, [[evalId, entry]])
  }
  return byBenchmark
}

/** Every per-source observation for this canonical benchmark on an exactly
 *  matching effective metric and direction, minus the current model's own
 *  rows. Merged entries are never read: they collapse to one row per model
 *  before the split is known. */
export function collectPeerObservationsFrom(
  byBenchmark: BenchmarkEntryIndex,
  benchmarkId: string,
  metricId: string,
  lowerIsBetter: boolean,
  currentIdentityKeys: Set<string>,
): PeerObservation[] {
  const observations: PeerObservation[] = []
  for (const [evalId, entry] of byBenchmark.get(benchmarkId) ?? []) {
    const sourceSlug = entry.composite_slug ?? entry.family_id ?? evalId
    const sourceDisplayName =
      entry.composite_display_name ??
      entry.family_display_name ??
      entry.display_name ??
      sourceSlug
    for (const metric of entry.metrics) {
      if (metric.metric_id !== metricId) continue
      if (Boolean(metric.lower_is_better) !== lowerIsBetter) continue
      for (const score of metric.scores) {
        if (matchesIdentity(score, currentIdentityKeys)) continue
        const value = canonicalScoreOf(score)
        if (value == null) continue
        const rawLabel = typeof score.split === "string" ? score.split.trim() : ""
        observations.push({
          modelRouteId: score.model_route_id,
          sourceEvalId: evalId,
          sourceSlug,
          sourceDisplayName,
          label: normaliseSplitLabel(score.split),
          rawLabel: rawLabel || null,
          score: value,
          entry: score,
        })
      }
    }
  }
  return observations.sort(
    (a, b) =>
      compareStrings(a.sourceSlug, b.sourceSlug) ||
      compareStrings(a.modelRouteId, b.modelRouteId),
  )
}

export function collectPeerObservations(
  index: ComparisonIndex,
  benchmarkId: string,
  metricId: string,
  lowerIsBetter: boolean,
  currentIdentityKeys: Set<string>,
): PeerObservation[] {
  return collectPeerObservationsFrom(
    buildBenchmarkEntryIndex(index),
    benchmarkId,
    metricId,
    lowerIsBetter,
    currentIdentityKeys,
  )
}

export function partitionPeers(
  currentLabel: SplitLabel | null,
  observations: PeerObservation[],
): PeerPartition {
  const compared: PeerObservation[] = []
  const unknown: PeerObservation[] = []
  const excluded: PeerObservation[] = []
  const excludedRoutes: Record<string, Set<string>> = {}
  for (const observation of observations) {
    if (observation.label == null || currentLabel == null) {
      unknown.push(observation)
      continue
    }
    if (observation.label === currentLabel) {
      compared.push(observation)
      continue
    }
    excluded.push(observation)
    const routes = excludedRoutes[observation.label] ?? new Set<string>()
    routes.add(observation.modelRouteId)
    excludedRoutes[observation.label] = routes
  }
  const excludedByLabel: Record<string, number> = {}
  for (const label of Object.keys(excludedRoutes).sort()) {
    excludedByLabel[label] = excludedRoutes[label].size
  }
  return { compared, unknown, excluded, excludedByLabel }
}

/** One observation per model: the best in the metric's direction, ties broken
 *  by source slug then route id. Returned best-first so the histogram's
 *  best/worst peer picks stay index-based. */
export function bestPerModel(
  eligible: PeerObservation[],
  lowerIsBetter: boolean,
): PeerObservation[] {
  const ordered = [...eligible].sort(
    (a, b) =>
      compareStrings(a.sourceSlug, b.sourceSlug) ||
      compareStrings(a.modelRouteId, b.modelRouteId),
  )
  const best = new Map<string, PeerObservation>()
  for (const observation of ordered) {
    const incumbent = best.get(observation.modelRouteId)
    if (incumbent == null || isBetter(observation.score, incumbent.score, lowerIsBetter)) {
      best.set(observation.modelRouteId, observation)
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      (lowerIsBetter ? a.score - b.score : b.score - a.score) ||
      compareStrings(a.sourceSlug, b.sourceSlug) ||
      compareStrings(a.modelRouteId, b.modelRouteId),
  )
}

/** Competition rank (1, 1, 3) on exact score equality, matching the producer.
 *  The total includes the current model. */
export function competitionRank(
  currentScore: number,
  eligible: PeerObservation[],
  lowerIsBetter: boolean,
): { position: number; total: number } {
  let better = 0
  for (const observation of eligible) {
    if (isBetter(observation.score, currentScore, lowerIsBetter)) better += 1
  }
  return { position: better + 1, total: eligible.length + 1 }
}

export function excludedHoverTitle(currentLabel: SplitLabel | null): string {
  return `Excluded because their reported split label differs from this model's (\`${currentLabel ?? "none"}\`). Labels are as submitted and may be recording errors.`
}

export const CAPTION_SEPARATOR = " · "

/** Caption clauses kept apart so the render can put the caveat hover on the
 *  excluded fragments only. `text` is the joined line. */
export interface PeerCaptionFragments {
  base: string
  unknown: string | null
  excluded: Array<{ label: string; count: number; text: string }>
  text: string
}

export function peerCaption(input: {
  position: number
  total: number
  sourceCount: number
  currentLabel: SplitLabel | null
  unknownCount: number
  anyPeerLabelled: boolean
  excludedByLabel: Record<string, number>
}): PeerCaptionFragments {
  const base = `Rank ${input.position} of ${input.total} across ${input.sourceCount} source${input.sourceCount === 1 ? "" : "s"}`
  const unknown =
    input.currentLabel == null
      ? input.anyPeerLabelled
        ? "compared as split unknown"
        : null
      : input.unknownCount > 0
        ? `${input.unknownCount} with no reported split`
        : null
  const excluded = Object.entries(input.excludedByLabel).map(([label, count]) => ({
    label,
    count,
    text: `${count} on ${label} excluded (reported label differs)`,
  }))
  const text = [base, ...(unknown ? [unknown] : []), ...excluded.map((e) => e.text)].join(
    CAPTION_SEPARATOR,
  )
  return { base, unknown, excluded, text }
}
