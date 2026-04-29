import { describe, expect, it } from "vitest"

import { getCanonicalModelIdentity, getModelFamilyRouteId } from "../../lib/model-family"

// Executable spec for `notes/transformations/01-identity-canonicalization.md`.
//
// Each table here corresponds to a Group in the spec. Pipeline-side
// implementation must produce identical outputs for every row. Adding a row
// here is the way to extend the spec.
//
// When the pipeline ships matching values, run `scripts/verify-identity.mjs`
// against the full live cache to confirm cross-corpus equivalence before
// deleting the TS implementation (task #5b in the migration tasklist).

interface Case {
  id: string
  name?: string
  developer?: string
  expected: {
    namespace?: string
    familySlug?: string
    familyId?: string
    familyName?: string
    variantKey?: string
    variantLabel?: string
    versionDate?: string | undefined
    versionQualifier?: string | undefined
    variantDisplayName?: string
  }
  why: string
}

// ---------------------------------------------------------------------------
// Group A — Token case map
// ---------------------------------------------------------------------------
//
// Each token in the map below must title-case to the canonical form. The full
// case map is captured in the spec doc (Group A table). Here we exercise a
// representative subset plus the "no map entry" baseline.

describe("Group A — token case map", () => {
  const cases: Case[] = [
    { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", expected: { familyName: "Claude Opus 4.5" }, why: "claude → Claude, opus → Opus" },
    { id: "openai/gpt-5", name: "GPT 5", expected: { familyName: "GPT 5" }, why: "gpt → GPT (uppercased)" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", expected: { familyName: "Gemini 2.5 Pro" }, why: "gemini, pro" },
    { id: "meta/llama-3", name: "Llama 3", expected: { familyName: "Llama 3" }, why: "llama" },
    { id: "01-ai/yi-large", name: "Yi Large", expected: { familyName: "Yi Large" }, why: "yi (lowercase letter, but in map)" },
    { id: "anthropic/claude-haiku", name: "Claude Haiku", expected: { familyName: "Claude Haiku" }, why: "haiku" },
    { id: "anthropic/claude-instant", name: "Claude Instant", expected: { familyName: "Claude Instant" }, why: "instant" },
    { id: "x/x-ai", name: "x AI", expected: { familyName: "X AI" }, why: "ai → AI (a deliberate capitalization)" },
    { id: "test/turbo-mini", name: "Turbo Mini", expected: { familyName: "Turbo Mini" }, why: "turbo, mini" },
    { id: "qwen/qwen-coder", name: "Qwen Coder", expected: { familyName: "Qwen Coder" }, why: "qwen, coder" },
    { id: "test/foo-bar", name: "Foo Bar", expected: { familyName: "Foo Bar" }, why: "tokens not in map → naive title-case" },
  ]
  it.each(cases)("$why → familyName=$expected.familyName", ({ id, name, expected }) => {
    const result = getCanonicalModelIdentity({ id, name: name ?? "" })
    expect(result.familyName).toBe(expected.familyName)
  })
})

// ---------------------------------------------------------------------------
// Group B — v/V version-token rule
// ---------------------------------------------------------------------------
//
// Tokens matching /^v\d/i are lowercased. This rule is the source of the
// 1,253-card pipeline disagreement documented in the spec; pipeline must
// apply this rule before emitting model_family_name.

describe("Group B — v/V version-token rule", () => {
  const cases: Case[] = [
    { id: "deepseek-ai/deepseek-v3", name: "Deepseek V3", expected: { familyName: "Deepseek v3" }, why: "trailing v3" },
    { id: "deepseek-ai/deepseek-v3.1", name: "Deepseek V3.1", expected: { familyName: "Deepseek v3.1" }, why: "v3.1 with patch" },
    { id: "mistralai/mistral-7b-instruct-v0.3", name: "Mistral 7B Instruct v0.3", expected: { familyName: "Mistral 7B Instruct v0.3" }, why: "v0.3 in middle, mistral & instruct in case map" },
    { id: "mistralai/mixtral-8x22b-instruct-v0.1", name: "Mixtral 8x22b Instruct v0.1", expected: { familyName: "Mixtral 8x22b Instruct v0.1" }, why: "v0.1 with size token" },
    { id: "amazon/nova-lite-v1.0", name: "Nova Lite v1.0", expected: { familyName: "Nova Lite v1.0" }, why: "v1.0" },
    { id: "test/foo-bar", name: "Foo Bar", expected: { familyName: "Foo Bar" }, why: "no v rule applies" },
  ]
  it.each(cases)("$why → familyName=$expected.familyName", ({ id, name, expected }) => {
    expect(getCanonicalModelIdentity({ id, name: name ?? "" }).familyName).toBe(expected.familyName)
  })
})

// ---------------------------------------------------------------------------
// Group C — Date and qualifier extraction
// ---------------------------------------------------------------------------

describe("Group C — date and qualifier extraction", () => {
  const cases: Case[] = [
    {
      id: "anthropic/claude-3-5-sonnet",
      name: "Claude 3.5 Sonnet",
      expected: { familySlug: "claude-3.5-sonnet", versionDate: undefined, versionQualifier: undefined, variantKey: "base", variantLabel: "Current" },
      why: "no date in handle → base variant, Current label",
    },
    {
      id: "anthropic/claude-3-5-sonnet-20240620",
      name: "Claude 3.5 Sonnet 20240620",
      expected: { familySlug: "claude-3.5-sonnet", versionDate: "2024-06-20", versionQualifier: undefined, variantKey: "20240620", variantLabel: "2024-06-20" },
      why: "YYYYMMDD date present, no qualifier",
    },
    {
      id: "anthropic/claude-3-5-sonnet-20240620-thinking",
      name: "Claude 3.5 Sonnet 20240620 Thinking",
      expected: {
        familySlug: "claude-3.5-sonnet",
        versionDate: "2024-06-20",
        versionQualifier: "Thinking",
        variantKey: "20240620-thinking",
        variantLabel: "2024-06-20 · Thinking",
      },
      why: "date plus single-token qualifier",
    },
    {
      id: "openai/gpt-5-2025-12-11-thinking-high",
      name: "GPT 5 2025-12-11 thinking high",
      expected: {
        // The (?:19|20)\d{6} regex requires 8 contiguous digits; "2025-12-11" has dashes, so
        // it doesn't match as a date. NormalizeHandle's digit-dash-digit collapse only fires when
        // the right side is followed by a dash or end, so "2025-12-11" stays as is.
        // → no date matched → base variant.
        variantKey: "base",
        versionDate: undefined,
      },
      why: "dashed date is NOT recognized — only YYYYMMDD form",
    },
  ]
  it.each(cases)("$why", ({ id, name, expected }) => {
    const result = getCanonicalModelIdentity({ id, name: name ?? "" })
    if (expected.familySlug !== undefined) expect(result.familySlug).toBe(expected.familySlug)
    if (expected.versionDate !== undefined || "versionDate" in expected) expect(result.versionDate).toBe(expected.versionDate)
    if (expected.versionQualifier !== undefined || "versionQualifier" in expected) expect(result.versionQualifier).toBe(expected.versionQualifier)
    if (expected.variantKey !== undefined) expect(result.variantKey).toBe(expected.variantKey)
    if (expected.variantLabel !== undefined) expect(result.variantLabel).toBe(expected.variantLabel)
  })
})

// ---------------------------------------------------------------------------
// Group D — Handle normalization
// ---------------------------------------------------------------------------

describe("Group D — handle normalization (familyId derivation)", () => {
  const cases: Case[] = [
    { id: "anthropic/Claude_Opus_4.5", name: "Claude Opus 4.5", expected: { familyId: "anthropic/claude-opus-4.5" }, why: "underscore → dash, lowercase" },
    { id: "anthropic/claude opus 4.5", name: "Claude Opus 4.5", expected: { familyId: "anthropic/claude-opus-4.5" }, why: "space → dash" },
    { id: "anthropic/--claude--opus--", name: "Claude Opus", expected: { familyId: "anthropic/claude-opus" }, why: "leading/trailing/repeated dashes collapsed" },
    { id: "anthropic/claude-3-5-sonnet", name: "Claude 3.5 Sonnet", expected: { familyId: "anthropic/claude-3.5-sonnet" }, why: "digit-dash-digit-dash collapses to digit-dot-digit-dash" },
    { id: "anthropic/claude-3-5", name: "Claude 3.5", expected: { familyId: "anthropic/claude-3.5" }, why: "digit-dash-digit at end collapses to digit-dot-digit" },
    { id: "google/gemini-1.5-pro", name: "Gemini 1.5 Pro", expected: { familyId: "google/gemini-1.5-pro" }, why: "existing dot is preserved" },
  ]
  it.each(cases)("$why", ({ id, name, expected }) => {
    expect(getCanonicalModelIdentity({ id, name: name ?? "" }).familyId).toBe(expected.familyId)
  })
})

// ---------------------------------------------------------------------------
// Group E — Namespace and rawHandle extraction
// ---------------------------------------------------------------------------

describe("Group E — namespace + rawHandle extraction", () => {
  it("id with slash → first segment is namespace, rest is handle", () => {
    const r = getCanonicalModelIdentity({ id: "anthropic/claude-opus-4-5", name: "Claude Opus 4.5" })
    expect(r.namespace).toBe("anthropic")
    expect(r.rawHandle).toBe("claude-opus-4-5")
  })
  it("id without slash falls back to developer field for namespace", () => {
    const r = getCanonicalModelIdentity({ id: "gpt-5", name: "GPT 5", developer: "OpenAI" })
    expect(r.namespace).toBe("openai")
  })
  it("developer with spaces is slug-cased for namespace", () => {
    const r = getCanonicalModelIdentity({ id: "claude-opus-4.5", name: "Claude Opus 4.5", developer: "Anthropic AI" })
    expect(r.namespace).toBe("anthropic-ai")
  })
  it("namespace prefix in name is stripped when computing rawHandle from name", () => {
    // Falls into getRawHandle's strippedName path when id has no '/' segment
    const r = getCanonicalModelIdentity({ id: "", name: "anthropic/Claude Opus 4.5", developer: "Anthropic" })
    expect(r.namespace).toBe("anthropic")
    // Note: with id empty, idHandle is empty, so falls back to stripNamespace(name, namespace)
    expect(r.rawHandle).toBe("Claude Opus 4.5")
  })
})

// ---------------------------------------------------------------------------
// Group F — familyId and model_route_id contract
// ---------------------------------------------------------------------------

describe("Group F — familyId and model_route_id", () => {
  const cases = [
    { familyId: "anthropic/claude-opus-4.5", routeId: "anthropic__claude-opus-4.5" },
    { familyId: "openai/gpt-5", routeId: "openai__gpt-5" },
    { familyId: "01-ai/yi-large", routeId: "01-ai__yi-large" },
    { familyId: "google/gemini-2.5-pro", routeId: "google__gemini-2.5-pro" },
  ]
  it.each(cases)("getModelFamilyRouteId($familyId) === $routeId", ({ familyId, routeId }) => {
    expect(getModelFamilyRouteId(familyId)).toBe(routeId)
  })
})

// ---------------------------------------------------------------------------
// Integration cases — full-tuple round-trips for fixtures we ship
// ---------------------------------------------------------------------------
//
// These mirror real model cards in tests/fixtures/model-cards/ (where the
// pipeline ALSO emits the canonical fields). When pipeline matches across the
// full corpus, this section is a sanity check that the spec stays in sync
// with the fixtures.

describe("integration — fixtures round-trip", () => {
  const fixtures = [
    {
      id: "anthropic/claude-opus-4.5",
      name: "Claude Opus 4.5",
      expected: {
        familyId: "anthropic/claude-opus-4.5",
        familyName: "Claude Opus 4.5",
        variantKey: "base",
      },
      why: "anthropic__claude-opus-4.5 fixture (dotted route_id quirk)",
    },
    {
      id: "openai/gpt-5",
      name: "GPT 5",
      expected: {
        familyId: "openai/gpt-5",
        familyName: "GPT 5",
        variantKey: "base",
      },
      why: "openai__gpt-5 fixture",
    },
    {
      id: "01-ai/yi-34b",
      name: "Yi 34B",
      expected: {
        familyId: "01-ai/yi-34b",
        familyName: "Yi 34B",
        variantKey: "base",
      },
      why: "01-ai__yi-34b fixture (dash-prefix slug)",
    },
  ]
  it.each(fixtures)("$why", ({ id, name, expected }) => {
    const result = getCanonicalModelIdentity({ id, name })
    expect(result.familyId).toBe(expected.familyId)
    expect(result.familyName).toBe(expected.familyName)
    expect(result.variantKey).toBe(expected.variantKey)
  })
})
