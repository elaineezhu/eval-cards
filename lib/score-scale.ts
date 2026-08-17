// Producer-canonical score scales (merged-benchmark-view spec, item F5).
//
// New snapshots stamp every per-source comparison-index score cell (both
// `evals[id].metrics[].scores[]` rows and `by_model` cells) with:
//   `score_canonical`  — the score on the metric's registry scale ([0,1]
//                        for fraction metrics, [0,100] for percent
//                        metrics); null when the row was flagged
//                        unconvertible.
//   `scale_conversion` — how `score` maps onto `score_canonical`.
// Old snapshots lack both keys entirely.
//
// Newer snapshots additionally stamp every comparison-index METRIC entry
// with `canonical_min_score` / `canonical_max_score` — the effective
// metric's registry bounds, i.e. the scale `score_canonical` sits on.
//
// `resolveCanonicalScaleGroup` decides whether a set of cells that a view
// needs on ONE common scale can be settled exactly from those fields. When
// it can, callers use the producer values and skip the legacy
// `|score| > 1.5 ⇒ percent` guess; when it can't — any cell missing the
// keys (old snapshot, or a mixed old/new group which must never be
// half-converted), a bounds-less metric (canonical === raw guarantees
// nothing about scale consistency), an all-flagged group with no usable
// registry bounds, or contradictory conversions — callers keep the legacy
// heuristic byte-for-byte.
//
// NOTE: the comparison-index metric `unit` is source-reported, not the
// registry's — a div100 metric can say "percent" while its canonical
// values are fractions (e.g. vals-ai AIME, score 99.583 / canonical
// 0.99583). Conversions therefore outrank the unit when inferring the
// registry scale; the unit only settles all-'none' groups, where raw
// already equals canonical.

import type { ScaleConversion } from "./backend-artifacts"

export interface CanonicalScaleCell {
  /** Raw source-reported score. */
  score: number
  /** `score_canonical` off the cell; undefined on old snapshots. */
  scoreCanonical: number | null | undefined
  /** `scale_conversion` off the cell; undefined on old snapshots. */
  scaleConversion: ScaleConversion | null | undefined
  /** The owning metric's (source-reported) unit. */
  unit: string | null
}

export function isPercentUnit(unit: string | null | undefined): boolean {
  return /percent|%|pct/.test((unit ?? "").toLowerCase())
}

/** Plain-quantity units come in two trust classes (conservative allowlists
 *  over the source-reported vocabulary, which is small but unnormalised):
 *
 *  PHYSICAL units (latency, cost, token counts…) name a real-world
 *  dimension — a value in them is never a percent or fraction-of-one, at
 *  any magnitude: `0.8 seconds` is 0.8 seconds, not 80%.
 *
 *  AMBIGUOUS score-like units (`points`, `elo`) are only trustworthy for
 *  out-of-fraction-range values: sources stamp "points" on genuine 0–1
 *  fractions (omni-math accuracy 0.8258 "points"), so callers must
 *  corroborate with magnitude (|score| > 1.5) before treating them as
 *  plain quantities. */
const PHYSICAL_QUANTITY_UNIT_RE =
  /^(seconds?|ms|milliseconds?|tokens?|tokens[_\s]per[_\s]second|usd|usd[_\s]per[_\s]1m[_\s]tokens|attempts?|guess(es)?|positions?|ranks?|pairwise[_\s]battle[_\s]net[_\s]wins)$/

const AMBIGUOUS_QUANTITY_UNIT_RE = /^(points?|elo([\s_-]+rating)?)$/

export function isPhysicalQuantityUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").trim().toLowerCase()
  return u !== "" && PHYSICAL_QUANTITY_UNIT_RE.test(u)
}

export function isPlainQuantityUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").trim().toLowerCase()
  if (!u) return false
  return PHYSICAL_QUANTITY_UNIT_RE.test(u) || AMBIGUOUS_QUANTITY_UNIT_RE.test(u)
}

/** The effective metric's registry bounds off a comparison-index metric
 *  entry (`canonical_min_score` / `canonical_max_score`); fields are
 *  undefined on snapshots predating the stamp, null when the registry
 *  declares no bounds. */
export interface RegistryBounds {
  min?: number | null
  max?: number | null
}

/** Scale the registry bounds pin down: true ⇒ percent ([0,100]), false ⇒
 *  fraction (max ≤ 1.5), null ⇒ absent or not usable (open-ended scales
 *  like Elo, unusual ranges). */
export function registryBoundsIsPercent(
  bounds: RegistryBounds | null | undefined,
): boolean | null {
  if (!bounds) return null
  if (bounds.min === 0 && bounds.max === 100) return true
  if (bounds.max != null && bounds.max <= 1.5) return false
  return null
}

/** Merge the per-metric registry bounds behind a cross-metric cell group:
 *  the shared bounds when every stamped metric agrees, undefined when they
 *  conflict (sibling metrics on different registry scales must not share
 *  one anchor) or when no metric carries the stamp. */
export function mergeRegistryBounds(
  boundsList: Iterable<RegistryBounds | null | undefined>,
): RegistryBounds | undefined {
  let merged: { min: number | null; max: number | null } | undefined
  for (const b of boundsList) {
    if (!b || (b.min === undefined && b.max === undefined)) continue // pre-stamp metric
    const min = b.min ?? null
    const max = b.max ?? null
    if (!merged) merged = { min, max }
    else if (merged.min !== min || merged.max !== max) return undefined
  }
  return merged
}

/** Legacy per-row scale guess (`|raw| > 1.5 ⇒ percent`), mapped onto the
 *  requested display scale. Kept for old snapshots and flagged rows. */
export function heuristicToScale(raw: number, toPercent: boolean): number {
  const looksHigh = Math.abs(raw) > 1.5
  if (toPercent) return looksHigh ? raw : raw * 100
  return looksHigh ? raw / 100 : raw
}

/** Re-express a value between the fraction (0-1) and percent (0-100) scales. */
export function scaleOnto(value: number, fromPercent: boolean, toPercent: boolean): number {
  if (fromPercent === toPercent) return value
  return toPercent ? value * 100 : value / 100
}

/** Scale of ONE cell's canonical value: true ⇒ percent, false ⇒ fraction,
 *  null ⇒ not derivable (flagged / bounds-less / old snapshot). Only for
 *  cells judged in isolation (e.g. the sibling-whisker lookup); inside a
 *  group prefer the group's `registryIsPercent` — a 'none' cell's
 *  source-reported unit can misstate the metric scale that its converted
 *  siblings pin down exactly. */
export function canonicalCellIsPercent(
  cell: CanonicalScaleCell,
  registryBounds?: RegistryBounds | null,
): boolean | null {
  if (cell.scoreCanonical == null) return null
  switch (cell.scaleConversion) {
    case "div100":
      return false // raw percent ÷ 100 ⇒ the registry scale is the fraction
    case "mul100":
      return true // raw fraction × 100 ⇒ the registry scale is the percent
    case "none":
    case "curated": {
      // The producer-stamped registry bounds settle the canonical scale
      // exactly when usable. Otherwise 'none' falls back to the
      // source-reported unit (raw already sits on the registry scale) and
      // 'curated' stays underivable — the tag alone can't anchor.
      const fromBounds = registryBoundsIsPercent(registryBounds)
      if (fromBounds != null) return fromBounds
      return cell.scaleConversion === "none" ? isPercentUnit(cell.unit) : null
    }
    default:
      return null // 'no_bounds', 'flagged', unexpected tokens
  }
}

export interface CanonicalScaleGroup {
  /** Scale the canonical values sit on: true ⇒ [0,100]. */
  registryIsPercent: boolean
  /** Census of the convertible cells' source-side scales. Sites derive
   *  their historical display convention from these (majority vote with
   *  percent winning ties, or any-percent) instead of magnitude guesses. */
  percentSourceCount: number
  fractionSourceCount: number
  /** The cell's value on the requested display scale: exact for
   *  canonical-bearing cells, legacy per-row guess for flagged ones. */
  toDisplay(cell: CanonicalScaleCell, displayIsPercent: boolean): number
}

export function resolveCanonicalScaleGroup(
  cells: readonly CanonicalScaleCell[],
  registryBounds?: RegistryBounds | null,
): CanonicalScaleGroup | null {
  if (cells.length === 0) return null
  let sawDiv100 = false
  let sawMul100 = false
  let noneCount = 0
  let nonePercentUnit = false
  let noneFractionUnit = false
  for (const c of cells) {
    // Old-snapshot cell in the group ⇒ the whole group stays legacy.
    if (c.scoreCanonical === undefined && c.scaleConversion === undefined) return null
    if (c.scaleConversion === "no_bounds") return null
    // 'curated' canonicals are trustworthy for display but the tag alone
    // can't anchor fraction-vs-percent — neutral, like flagged, except
    // toDisplay uses their canonical exactly.
    if (c.scoreCanonical == null || c.scaleConversion === "flagged" || c.scaleConversion === "curated")
      continue
    if (c.scaleConversion === "div100") sawDiv100 = true
    else if (c.scaleConversion === "mul100") sawMul100 = true
    else if (c.scaleConversion === "none") {
      noneCount += 1
      if (isPercentUnit(c.unit)) nonePercentUnit = true
      else noneFractionUnit = true
    } else return null // unknown conversion token — don't guess
  }
  if (sawDiv100 && sawMul100) return null // contradictory conversions
  // Scale precedence: a conversion pins the registry scale exactly; next
  // the metric's stamped registry bounds; last the 'none' cells' unit
  // vote. Bounds let anchor-neutral groups (all-curated, all-flagged) and
  // unit-conflicted groups resolve exactly instead of falling back.
  let registryIsPercent: boolean
  if (sawMul100) registryIsPercent = true
  else if (sawDiv100) registryIsPercent = false
  else {
    const boundsScale = registryBoundsIsPercent(registryBounds)
    if (boundsScale != null) registryIsPercent = boundsScale
    else {
      // Need at least one 'none' cell to anchor the unit vote…
      if (noneCount === 0) return null
      // …and when the 'none' cells' source units DISAGREE about
      // percent-ness, the units are lying about at least one cell
      // (they're source-reported, not registry data) — a lone mislabeled
      // "percent" must not flip the whole group 100x. Stay legacy.
      if (nonePercentUnit && noneFractionUnit) return null
      registryIsPercent = nonePercentUnit
    }
  }
  let percentSourceCount = 0
  let fractionSourceCount = 0
  for (const c of cells) {
    if (c.scoreCanonical == null) continue
    // 'curated' sources sit on neither scale (e.g. 1-10 points) — they
    // don't vote; ties break percent-ward at the call sites.
    if (c.scaleConversion === "curated") continue
    if (c.scaleConversion === "div100") percentSourceCount += 1
    else if (c.scaleConversion === "mul100") fractionSourceCount += 1
    else if (isPercentUnit(c.unit)) percentSourceCount += 1
    else fractionSourceCount += 1
  }
  return {
    registryIsPercent,
    percentSourceCount,
    fractionSourceCount,
    toDisplay(cell, displayIsPercent) {
      return cell.scoreCanonical != null
        ? scaleOnto(cell.scoreCanonical, registryIsPercent, displayIsPercent)
        : heuristicToScale(cell.score, displayIsPercent)
    },
  }
}
