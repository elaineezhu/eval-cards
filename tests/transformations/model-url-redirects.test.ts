import { describe, expect, it } from "vitest"

import {
  buildRedirects,
  routeId,
  serializeRedirectModule,
  type Baseline,
} from "@/lib/model-url-redirects-build"
import { resolveModelRedirect } from "@/lib/model-url-redirects"
import { routeIdFromModelId, routeIdToPath } from "@/lib/utils"

// model-resolution-rework — executable spec for the model-URL redirect layer.
//
// Covers the two CRITICAL contract points the playbook calls out:
//   1. percent-encode / round-trip of model ids (RFC 3986, `/` -> %2F).
//   2. query-param preservation across the 301 (asserted via the middleware's
//      target-URL construction, replicated here to stay node-only / no Next
//      runtime).

// ---------------------------------------------------------------------------
// Percent-encoding round-trip
// ---------------------------------------------------------------------------

describe("route id percent-encoding round-trips", () => {
  const ids = [
    "anthropic/claude-3.5-sonnet-20240620",
    "meta/Llama-3.1-8B",
    "01-ai/Yi-1.5-34B",
    "EleutherAI/pythia-6.9b",
    "ByteDance-Seed/Seed-OSS-36B-Instruct",
    "openai/gpt-4o",
    "mistralai/mistral-7b-instruct-v0.3",
  ]

  it.each(ids)("encode→decode is identity for %s", (id) => {
    const encoded = routeIdFromModelId(id)
    // No bare slashes survive encoding (single-segment route id form).
    expect(encoded).not.toContain("/")
    // Full round-trip back to the original id.
    expect(decodeURIComponent(encoded)).toBe(id)
  })

  it("routeIdToPath turns the encoded form back into a slash path", () => {
    const encoded = routeIdFromModelId("anthropic/claude-3.5-sonnet-20240620")
    expect(encoded).toBe("anthropic%2Fclaude-3.5-sonnet-20240620")
    expect(routeIdToPath(encoded)).toBe("anthropic/claude-3.5-sonnet-20240620")
  })

  it("routeIdFromModelId trims and tolerates empty/nullish", () => {
    expect(routeIdFromModelId("  openai/gpt-4o  ")).toBe("openai%2Fgpt-4o")
    expect(routeIdFromModelId(undefined)).toBe("")
    expect(routeIdFromModelId(null)).toBe("")
    expect(routeIdFromModelId("")).toBe("")
  })

  it("casing is preserved through encoding (HF ids are case-sensitive)", () => {
    expect(routeIdFromModelId("meta/Llama-3.1-8B")).toBe("meta%2FLlama-3.1-8B")
    expect(routeIdFromModelId("meta/llama-3.1-8b")).not.toBe(
      routeIdFromModelId("meta/Llama-3.1-8B"),
    )
  })
})

// ---------------------------------------------------------------------------
// buildRedirects — map construction from a baseline
// ---------------------------------------------------------------------------

describe("buildRedirects", () => {
  it("emits a flip redirect from group root to leaf canonical", () => {
    const baseline: Baseline = {
      "anthropic/claude-3-haiku-20240307": {
        model_id: "anthropic/claude-3-haiku-20240307",
        canonical_id: "anthropic/claude-3-haiku-20240307",
        resolved_leaf_id: "anthropic/claude-3-haiku-20240307",
        root_model_id: "anthropic/claude-3-haiku",
      },
    }
    const { redirects, flipCount, casingCount } = buildRedirects(baseline)
    expect(flipCount).toBe(1)
    expect(casingCount).toBe(0)
    expect(redirects.get(routeId("anthropic/claude-3-haiku"))).toBe(
      routeId("anthropic/claude-3-haiku-20240307"),
    )
  })

  it("prefers model_group_id over root_model_id when both present", () => {
    const baseline: Baseline = {
      x: {
        model_id: "org/leaf",
        canonical_id: "org/leaf",
        model_group_id: "org/group-new",
        root_model_id: "org/group-old",
      },
    }
    const { redirects } = buildRedirects(baseline)
    expect(redirects.get(routeId("org/group-new"))).toBe(routeId("org/leaf"))
    expect(redirects.has(routeId("org/group-old"))).toBe(false)
  })

  it("emits a casing redirect from lowercase canonical to HF-true casing", () => {
    const baseline: Baseline = {
      "eleutherai/gpt-neo-125m": {
        model_id: "eleutherai/gpt-neo-125m",
        canonical_id: "eleutherai/gpt-neo-125m",
        json_fixed_hf_model_id: "EleutherAI/gpt-neo-125m",
      },
    }
    const { redirects, flipCount, casingCount } = buildRedirects(baseline)
    expect(flipCount).toBe(0)
    expect(casingCount).toBe(1)
    expect(redirects.get(routeId("eleutherai/gpt-neo-125m"))).toBe(
      routeId("EleutherAI/gpt-neo-125m"),
    )
  })

  it("does NOT treat a genuinely different id as a casing re-key", () => {
    const baseline: Baseline = {
      a: {
        model_id: "org/model-a",
        canonical_id: "org/model-a",
        json_fixed_hf_model_id: "org/model-b", // differs beyond case
      },
    }
    const { redirects, casingCount } = buildRedirects(baseline)
    expect(casingCount).toBe(0)
    expect(redirects.size).toBe(0)
  })

  it("skips no-op self-redirects", () => {
    const baseline: Baseline = {
      a: {
        model_id: "org/model",
        canonical_id: "org/model",
        root_model_id: "org/model", // == canonical -> no redirect
      },
    }
    const { redirects, noopCount } = buildRedirects(baseline)
    expect(redirects.size).toBe(0)
    // root == canonical is filtered before `add`, so it's not counted as noop;
    // the important invariant is simply that no redirect is emitted.
    expect(noopCount).toBe(0)
  })

  it("excludes (does not arbitrarily pick) a group root that fans out to multiple leaves", () => {
    const baseline: Baseline = {
      leafA: {
        model_id: "anthropic/claude-3.5-sonnet-20240620",
        canonical_id: "anthropic/claude-3.5-sonnet-20240620",
        root_model_id: "anthropic/claude-3.5-sonnet",
      },
      leafB: {
        model_id: "anthropic/claude-3.5-sonnet-20241022",
        canonical_id: "anthropic/claude-3.5-sonnet-20241022",
        root_model_id: "anthropic/claude-3.5-sonnet",
      },
    }
    const { redirects, ambiguous } = buildRedirects(baseline)
    expect(redirects.has(routeId("anthropic/claude-3.5-sonnet"))).toBe(false)
    const amb = ambiguous.get(routeId("anthropic/claude-3.5-sonnet"))
    expect(amb).toBeDefined()
    expect(amb!.size).toBe(2)
  })

  it("is idempotent for a repeated identical old->new pair", () => {
    const baseline: Baseline = {
      one: { model_id: "org/leaf", canonical_id: "org/leaf", root_model_id: "org/group" },
      two: { model_id: "org/leaf", canonical_id: "org/leaf", root_model_id: "org/group" },
    }
    const { redirects, flipCount } = buildRedirects(baseline)
    expect(redirects.size).toBe(1)
    expect(flipCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// serializeRedirectModule — generated source shape
// ---------------------------------------------------------------------------

describe("serializeRedirectModule", () => {
  it("produces sorted, parseable entries and marks the data provisional", () => {
    const map = new Map([
      ["b%2Fx", "b%2Fy"],
      ["a%2Fx", "a%2Fy"],
    ])
    const src = serializeRedirectModule(map, { source: "test.json", flipCount: 1, casingCount: 1 })
    expect(src).toContain("PROVISIONAL")
    // sorted: a before b
    expect(src.indexOf('"a%2Fx"')).toBeLessThan(src.indexOf('"b%2Fx"'))
    expect(src).toContain("export const MODEL_URL_REDIRECTS")
  })
})

// ---------------------------------------------------------------------------
// Redirect target construction — query-param preservation (CRITICAL)
// ---------------------------------------------------------------------------
//
// Replicates the middleware target-building logic against a real URL so we
// assert the 301 contract without booting the Next runtime.

function buildRedirectTarget(incomingUrl: string): { url: URL; status: number } | null {
  const url = new URL(incomingUrl)
  const MODELS_PREFIX = "/models/"
  if (!url.pathname.startsWith(MODELS_PREFIX)) return null
  const rawTail = url.pathname.slice(MODELS_PREFIX.length)
  if (!rawTail) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(rawTail)
  } catch {
    decoded = rawTail
  }
  const incomingRouteId = encodeURIComponent(decoded)
  const newRouteId = resolveModelRedirect(incomingRouteId)
  if (!newRouteId) return null
  const target = new URL(url.toString())
  target.pathname = `${MODELS_PREFIX}${newRouteId}`
  target.search = url.search // preserve query params
  return { url: target, status: 301 }
}

describe("redirect target construction (middleware contract)", () => {
  // A known provisional redirect from the generated map.
  const OLD = "anthropic/claude-3-haiku"
  const NEW = "anthropic/claude-3-haiku-20240307"

  it("the generated map contains the expected provisional redirect", () => {
    expect(resolveModelRedirect(routeId(OLD))).toBe(routeId(NEW))
  })

  it("redirects an old encoded URL to the new one with 301", () => {
    const res = buildRedirectTarget(`https://x.test/models/${routeId(OLD)}`)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(301)
    expect(res!.url.pathname).toBe(`/models/${routeId(NEW)}`)
  })

  it("PRESERVES query params across the redirect", () => {
    const res = buildRedirectTarget(`https://x.test/models/${routeId(OLD)}?version=20240307&foo=bar`)
    expect(res).not.toBeNull()
    expect(res!.url.search).toBe("?version=20240307&foo=bar")
    expect(res!.url.searchParams.get("version")).toBe("20240307")
    expect(res!.url.searchParams.get("foo")).toBe("bar")
  })

  it("preserves an empty query string (no spurious ?)", () => {
    const res = buildRedirectTarget(`https://x.test/models/${routeId(OLD)}`)
    expect(res!.url.search).toBe("")
  })

  it("handles the decoded (slash) path form too — round-trips to the same redirect", () => {
    // Next.js may hand us the decoded path; the lookup re-encodes it.
    const res = buildRedirectTarget(`https://x.test/models/${OLD}?version=v1`)
    expect(res).not.toBeNull()
    expect(res!.url.pathname).toBe(`/models/${routeId(NEW)}`)
    expect(res!.url.searchParams.get("version")).toBe("v1")
  })

  it("returns null (no redirect) for an unknown model route", () => {
    const res = buildRedirectTarget("https://x.test/models/unknown%2Fmodel-xyz")
    expect(res).toBeNull()
  })
})
