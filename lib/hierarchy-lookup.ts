import type {
  EvalHierarchy,
  HierarchyComposite,
  HierarchyFamily,
} from "@/lib/backend-artifacts"

export interface HierarchyEvalLocation {
  familyKey: string
  familyDisplayName: string
  compositeKey?: string
  compositeDisplayName?: string
}

interface FamilyAppearance {
  family: HierarchyFamily
  composite?: HierarchyComposite
}

function findComposite(
  family: HierarchyFamily,
  evalSummaryId: string,
): HierarchyComposite | undefined {
  const composites = family.composites
  if (!composites?.length) {
    return undefined
  }
  const sourcePrefix = evalSummaryId.split("%2F")[0]
  return composites.find((composite) => composite.key === sourcePrefix)
}

function buildAppearancesIndex(
  hierarchy: EvalHierarchy | null | undefined,
): Map<string, FamilyAppearance[]> {
  const index = new Map<string, FamilyAppearance[]>()
  if (!hierarchy?.families) {
    return index
  }

  for (const family of hierarchy.families) {
    for (const evalSummaryId of family.eval_summary_ids ?? []) {
      const composite = findComposite(family, evalSummaryId)
      const list = index.get(evalSummaryId) ?? []
      list.push({ family, composite })
      index.set(evalSummaryId, list)
    }
  }

  return index
}

/**
 * Build a lookup that maps each `eval_summary_id` to the family / composite
 * that contains it in `hierarchy.json`. The model-detail benchmark grouping
 * needs this because the eval row's own `family_id` is null for ~7% of evals
 * (e.g. CySE2 composites) and points at the leaf instead of the parent for
 * ~70% (singleton families). The hierarchy is the only source that captures
 * curated family→composite→benchmark grouping.
 *
 * 31 eval_summary_ids appear in multiple families. The optional
 * `preferFamilyKey(evalSummaryId)` callback lets the caller pick the canonical
 * family — typically by passing in the eval row's own `family_id`. When no
 * preference is given, the first family encountered wins.
 */
export function buildHierarchyEvalIndex(
  hierarchy: EvalHierarchy | null | undefined,
  preferFamilyKey?: (evalSummaryId: string) => string | null | undefined,
): Map<string, HierarchyEvalLocation> {
  const appearances = buildAppearancesIndex(hierarchy)
  const index = new Map<string, HierarchyEvalLocation>()

  for (const [evalSummaryId, candidates] of appearances) {
    let chosen = candidates[0]
    if (candidates.length > 1) {
      const preferredKey = preferFamilyKey?.(evalSummaryId)?.toString().trim()
      if (preferredKey) {
        const match = candidates.find((c) => c.family.key === preferredKey)
        if (match) {
          chosen = match
        }
      }
    }

    index.set(evalSummaryId, {
      familyKey: chosen.family.key,
      familyDisplayName: chosen.family.display_name,
      compositeKey: chosen.composite?.key,
      compositeDisplayName: chosen.composite?.display_name,
    })
  }

  return index
}
