// model-resolution-rework — redirect map builder (pure, testable).
//
// Builds the old-route -> new-route 301 redirect map from a registry
// `baseline_resolution.json`. Kept separate from the generated data file
// (`lib/model-url-redirects.ts`) so the generator script AND unit tests can
// exercise the build logic without importing the (large, regenerated) map.
//
// The ~297 changed model routes have two causes (spec §10.5):
//   1. canonical_id FLIP (root -> leaf): the old URL used the *group/root*
//      canonical id (`root_model_id`); the new URL uses the leaf
//      (`canonical_id`, which post-flip == `resolved_leaf_id`).
//   2. casing RE-KEY: a stale lowercase canonical is promoted to HF's true
//      casing. The old URL used the lowercase id (`canonical_id` in the
//      pre-re-key snapshot); the new URL uses the HF-cased id
//      (`json_fixed_hf_model_id`).
//
// Route id form: the producer emits `route_id` as the RFC 3986
// percent-encoded canonical id (whole id encoded, so `/` -> `%2F`). We match
// that exactly with encodeURIComponent so map keys/values are comparable to
// the live `route_id` column and round-trip through `routeIdToPath`.

export interface BaselineEntry {
  model_id: string
  canonical_id?: string | null
  resolved_leaf_id?: string | null
  // pre-flip group/root id; when set and != canonical, the old URL used it.
  root_model_id?: string | null
  model_group_id?: string | null
  // HF-true-cased id; when it differs from canonical_id only by case, the
  // canonical was (or will be) re-keyed to this casing.
  json_fixed_hf_model_id?: string | null
}

export type Baseline = Record<string, BaselineEntry>

/** Encode a plain canonical model id into the producer `route_id` form. */
export function routeId(id: string): string {
  return encodeURIComponent(id.trim())
}

export interface BuildResult {
  /** old route id (encoded) -> new route id (encoded) */
  redirects: Map<string, string>
  flipCount: number
  casingCount: number
  /** entries skipped because old and new encode identically. */
  noopCount: number
  /**
   * Old route ids that resolve to MORE THAN ONE distinct new route (a group
   * root that fans out to several dated leaves, e.g.
   * `anthropic/claude-3.5-sonnet` -> {…-20240620, …-20241022}). These are
   * NOT redirected: a group root has no single canonical leaf, so the route
   * handler leaves them to the page layer (the group may still resolve as a
   * family). Surfaced for review rather than silently picking a leaf.
   */
  ambiguous: Map<string, Set<string>>
}

/**
 * Build the redirect map from a parsed baseline. Pure: deterministic for a
 * given input, no IO. An old route that fans out to multiple distinct new
 * routes is recorded as ambiguous and EXCLUDED from the map (never picks an
 * arbitrary leaf). A repeated old->same-new pair is idempotent.
 */
export function buildRedirects(baseline: Baseline): BuildResult {
  const redirects = new Map<string, string>()
  const kinds = new Map<string, "flip" | "casing">()
  const ambiguous = new Map<string, Set<string>>()
  let noopCount = 0

  const add = (oldId: string, newId: string, kind: "flip" | "casing") => {
    const oldRoute = routeId(oldId)
    const newRoute = routeId(newId)
    if (oldRoute === newRoute) {
      noopCount += 1
      return
    }
    // Already known ambiguous — accumulate the target for reporting.
    const amb = ambiguous.get(oldRoute)
    if (amb) {
      amb.add(newRoute)
      return
    }
    const existing = redirects.get(oldRoute)
    if (existing && existing !== newRoute) {
      // Conflict: demote to ambiguous and drop from the active map.
      redirects.delete(oldRoute)
      kinds.delete(oldRoute)
      ambiguous.set(oldRoute, new Set([existing, newRoute]))
      return
    }
    if (!existing) {
      redirects.set(oldRoute, newRoute)
      kinds.set(oldRoute, kind)
    }
  }

  for (const entry of Object.values(baseline)) {
    const canonical = entry.canonical_id ?? undefined
    if (!canonical) continue

    // (1) FLIP: old group/root id -> new leaf canonical.
    const group = entry.model_group_id ?? entry.root_model_id ?? undefined
    if (group && group !== canonical) {
      add(group, canonical, "flip")
    }

    // (2) CASING re-key: lowercase canonical -> HF-true-cased id.
    const hfTrue = entry.json_fixed_hf_model_id ?? undefined
    if (
      hfTrue &&
      hfTrue !== canonical &&
      hfTrue.toLowerCase() === canonical.toLowerCase()
    ) {
      add(canonical, hfTrue, "casing")
    }
  }

  let flipCount = 0
  let casingCount = 0
  for (const kind of kinds.values()) {
    if (kind === "flip") flipCount += 1
    else casingCount += 1
  }

  return { redirects, flipCount, casingCount, noopCount, ambiguous }
}

/** Serialise a redirect map to the generated TS module source. */
export function serializeRedirectModule(
  redirects: Map<string, string>,
  meta: { source: string; flipCount: number; casingCount: number },
): string {
  const sorted = [...redirects.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const entries = sorted.map(([o, n]) => `  [${JSON.stringify(o)}, ${JSON.stringify(n)}],`).join("\n")
  return `// GENERATED by scripts/generate-model-redirects.ts — do not edit by hand.
//
// PROVISIONAL DATA. Generated from a pre-final registry baseline
// (${meta.source}). The authoritative ~297-entry map (204 flips + 93
// re-keys) must be REGENERATED from the post-M9 baseline_resolution.json at
// integration time. Until then treat the redirects below as illustrative.
//
// Entries: ${redirects.size} (flips=${meta.flipCount}, casing=${meta.casingCount}).
//
// Each entry maps an OLD percent-encoded model route id to the NEW one.
// The route handler at app/models/[...id]/route.ts looks up the incoming
// route here and issues a 301, preserving query params.

/** old encoded route id -> new encoded route id (RFC 3986, \`/\` -> %2F). */
export const MODEL_URL_REDIRECTS = new Map<string, string>([
${entries}
])

export function resolveModelRedirect(routeId: string): string | undefined {
  return MODEL_URL_REDIRECTS.get(routeId)
}
`
}
