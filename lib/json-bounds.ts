// Wire form for a metric bound that is unbounded by definition.
//
// The registry marks such a bound with an infinite float, and every JSON
// hop (the producer's sidecars, the registry API, every_eval_ever's schema)
// carries it as the string "Infinity" / "-Infinity", because JSON has no
// literal for it. This module is the one place the frontend crosses that
// boundary, in both directions, so it is safe to import from server and
// client code alike (no "server-only", no Node imports).
//
// Reading (`reviveNonFiniteBounds`, a JSON.parse reviver) applies one of two
// policies by what the key is for:
//  - `canonical_min_score` / `canonical_max_score` are the registry's
//    definitional stamp on a comparison-index metric. They come back as the
//    infinite number: their only consumers are the scale resolvers in
//    score-scale.ts, which read an open side as "neither fraction nor
//    percent" (never as a range to divide by).
//  - every other bound key (`metric_config.min_score` and friends) is a
//    per-fact range used for normalisation, "0 to N scale" copy and
//    thresholds, arithmetic that has no meaning on an open side. Those come
//    back as null, the value the same code paths already handle for a bound
//    the source never stated. The producer never emits the wire form on
//    those keys today (its metric-meta chain keeps per-fact bounds finite or
//    null); this is the guarantee that nothing downstream of a JSON parse
//    can see a non-finite range even if it did.
// Only bound keys are touched, so a benchmark named "Infinity" is untouched.
//
// Writing (`replaceNonFiniteBounds`, a JSON.stringify replacer) is the
// inverse for the app's own API routes: a bare JSON.stringify would turn a
// revived infinity into null and the browser would lose the distinction the
// stamp exists to carry.

const BOUND_KEY = /(?:^|_)(?:min|max)_score$/
const CANONICAL_BOUND_KEY = /^canonical_(?:min|max)_score$/

export function reviveNonFiniteBounds(key: string, value: unknown): unknown {
  if (typeof value === "string" && BOUND_KEY.test(key)) {
    if (value === "Infinity" || value === "-Infinity") {
      if (!CANONICAL_BOUND_KEY.test(key)) return null
      return value === "Infinity" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
    }
  }
  return value
}

export function replaceNonFiniteBounds(key: string, value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value) && BOUND_KEY.test(key)) {
    if (value === Number.POSITIVE_INFINITY) return "Infinity"
    if (value === Number.NEGATIVE_INFINITY) return "-Infinity"
    return null // NaN: no meaning on the wire
  }
  return value
}

/** JSON.parse with the bound reviver; the one parse helper sidecar readers
 *  and API clients should use for producer-shaped payloads. */
export function parseJsonWithBounds<T>(text: string): T {
  return JSON.parse(text, reviveNonFiniteBounds) as T
}

/** JSON.stringify with the bound replacer, for payloads the app re-serves. */
export function stringifyJsonWithBounds(value: unknown): string {
  return JSON.stringify(value, replaceNonFiniteBounds)
}
