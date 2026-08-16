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
// `resolveCanonicalScaleGroup` decides whether a set of cells that a view
// needs on ONE common scale can be settled exactly from those fields. When
// it can, callers use the producer values and skip the legacy
// `|score| > 1.5 ⇒ percent` guess; when it can't — any cell missing the
// keys (old snapshot, or a mixed old/new group which must never be
// half-converted), a bounds-less metric (canonical === raw guarantees
// nothing about scale consistency), an all-flagged group, or contradictory
// conversions — callers keep the legacy heuristic byte-for-byte.
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
export function canonicalCellIsPercent(cell: CanonicalScaleCell): boolean | null {
  if (cell.scoreCanonical == null) return null
  switch (cell.scaleConversion) {
    case "div100":
      return false // raw percent ÷ 100 ⇒ the registry scale is the fraction
    case "mul100":
      return true // raw fraction × 100 ⇒ the registry scale is the percent
    case "none":
      return isPercentUnit(cell.unit) // raw already sits on the registry scale
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
): CanonicalScaleGroup | null {
  if (cells.length === 0) return null
  let sawDiv100 = false
  let sawMul100 = false
  let noneCount = 0
  let nonePercentUnit = false
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
    } else return null // unknown conversion token — don't guess
  }
  // Need at least one convertible cell to anchor the scale, and the
  // conversions must not contradict each other.
  if (!sawDiv100 && !sawMul100 && noneCount === 0) return null
  if (sawDiv100 && sawMul100) return null
  const registryIsPercent = sawMul100 || (!sawDiv100 && nonePercentUnit)
  let percentSourceCount = 0
  let fractionSourceCount = 0
  for (const c of cells) {
    if (c.scoreCanonical == null) continue
    if (c.scaleConversion === "div100") percentSourceCount += 1
    else if (c.scaleConversion === "mul100") fractionSourceCount += 1
    else if (registryIsPercent) percentSourceCount += 1
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
