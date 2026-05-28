import { describe, expect, it } from "vitest"

import { getCanonicalModelIdentity } from "../../lib/model-family"

// Executable spec for the setup-alias-merging transformation.
//
// These tests describe TS as it currently runs in production. Quirks are
// preserved on purpose — the migration target is to move the computation
// upstream without changing what users see, not to fix transformation
// decisions. If a test below looks "wrong" to product sense, that's a
// future product decision; fixing it is out of scope here.
//
// Pipeline-side implementation must produce identical outputs for every
// row. Verify cross-corpus equivalence with `scripts/verify-setup-alias.mjs`
// once pipeline ships.

// ---------------------------------------------------------------------------
// Group A — isSetupAliasQualifier truth table
// ---------------------------------------------------------------------------
//
// Reproduces the function from lib/hf-data.ts (and its identical
// twin in scripts/cache-hf-data.mjs). Pipeline must match exactly.

function normalizeSetupAliasQualifier(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[_\s]+/g, "-") ?? ""
}

function isSetupAliasQualifier(value: string | null | undefined): boolean {
  const normalized = normalizeSetupAliasQualifier(value)
  return (
    normalized === "prompt" ||
    normalized === "fc" ||
    normalized === "function-calling" ||
    normalized.startsWith("thinking")
  )
}

describe("Group A — isSetupAliasQualifier", () => {
  const cases = [
    { input: "prompt", expected: true, why: "exact: prompt" },
    { input: "Prompt", expected: true, why: "case-insensitive" },
    { input: "PROMPT", expected: true, why: "case-insensitive" },
    { input: "fc", expected: true, why: "exact: fc" },
    { input: "FC", expected: true, why: "case-insensitive" },
    { input: "function-calling", expected: true, why: "exact" },
    { input: "function calling", expected: true, why: "space → dash" },
    { input: "function_calling", expected: true, why: "underscore → dash" },
    { input: "thinking", expected: true, why: "exact thinking" },
    { input: "thinking-1k", expected: true, why: "starts with thinking" },
    { input: "thinking-medium", expected: true, why: "starts with thinking" },
    { input: "thinking-none", expected: true, why: "starts with thinking" },
    { input: "thinking_xhigh", expected: true, why: "underscore → dash, then prefix" },
    { input: "Thinking 1K", expected: true, why: "case + space normalized → starts with thinking" },
    { input: "high", expected: false, why: "non-alias inference qualifier" },
    { input: "medium", expected: false, why: "non-alias" },
    { input: "low", expected: false, why: "non-alias" },
    { input: "minimal", expected: false, why: "non-alias" },
    { input: "8k", expected: false, why: "context-length without thinking prefix" },
    { input: "16k", expected: false, why: "context-length without thinking prefix" },
    { input: "", expected: false, why: "empty" },
    { input: null, expected: false, why: "null" },
    { input: undefined, expected: false, why: "undefined" },
    { input: "  prompt  ", expected: true, why: "leading/trailing whitespace trimmed" },
    { input: "prompts", expected: false, why: "trailing s — not exact prompt and no thinking prefix" },
    { input: "fcfc", expected: false, why: "doesn't match exact fc" },
  ]
  it.each(cases)("'$input' → $expected ($why)", ({ input, expected }) => {
    expect(isSetupAliasQualifier(input)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// Group B — End-to-end variant normalization (TS-as-is)
// ---------------------------------------------------------------------------
//
// Replicates lib/hf-data.ts verbatim, NO date-format fix applied.
// Documents the dashed-date fall-through behaviour as the canonical spec.

interface VariantInput {
  variant_key: string
  variant_label?: string
}

function normalizeOne(familyId: string, variant: VariantInput): { variant_key: string; variant_label: string } {
  if (variant.variant_key === "base") {
    return { variant_key: "default", variant_label: "Default" }
  }
  if (variant.variant_key === "default") {
    return { variant_key: "default", variant_label: variant.variant_label ?? "Default" }
  }

  const synth = getCanonicalModelIdentity({
    id: `${familyId}-${variant.variant_key}`,
    name: `${familyId}-${variant.variant_key}`,
  })

  if (synth.versionDate && isSetupAliasQualifier(synth.versionQualifier)) {
    return { variant_key: synth.versionDate, variant_label: synth.versionDate }
  }
  return { variant_key: synth.variantKey, variant_label: synth.variantLabel }
}

describe("Group B — End-to-end variant normalization", () => {
  const familyId = "openai/gpt-5.2"
  const cases = [
    { variant_key: "default", expected: { variant_key: "default", variant_label: "Default" }, why: "default passes through" },
    { variant_key: "base", expected: { variant_key: "default", variant_label: "Default" }, why: "base renamed to default" },
    { variant_key: "20251101", expected: { variant_key: "20251101", variant_label: "2025-11-01" }, why: "YYYYMMDD date-only — preserved as raw token, ISO label" },
    {
      variant_key: "2025-11-01",
      expected: { variant_key: "base", variant_label: "Current" },
      why: "DASHED date-only falls through to base — TS quirk, preserved as canonical for this migration",
    },
    {
      variant_key: "20240620-thinking",
      expected: { variant_key: "2024-06-20", variant_label: "2024-06-20" },
      why: "YYYYMMDD + thinking → merge to ISO date",
    },
    {
      variant_key: "20240620-thinking-1k",
      expected: { variant_key: "2024-06-20", variant_label: "2024-06-20" },
      why: "YYYYMMDD + thinking-1k → merge (startsWith match aggregates all thinking budgets)",
    },
    {
      variant_key: "20240620-thinking-medium",
      expected: { variant_key: "2024-06-20", variant_label: "2024-06-20" },
      why: "all thinking-N variants for this YYYYMMDD date collapse together",
    },
    { variant_key: "20240620-fc", expected: { variant_key: "2024-06-20", variant_label: "2024-06-20" }, why: "YYYYMMDD + fc → merge" },
    { variant_key: "20240620-prompt", expected: { variant_key: "2024-06-20", variant_label: "2024-06-20" }, why: "YYYYMMDD + prompt → merge" },
    {
      variant_key: "20240620-high",
      expected: { variant_key: "20240620-high", variant_label: "2024-06-20 · High" },
      why: "non-alias qualifier preserved with date",
    },
    {
      variant_key: "2025-12-11-thinking-medium",
      expected: { variant_key: "base", variant_label: "Current" },
      why: "DASHED date — regex doesn't match, falls through to base (TS quirk)",
    },
    {
      variant_key: "2025-12-11-thinking-1k",
      expected: { variant_key: "base", variant_label: "Current" },
      why: "DASHED date with thinking-1k — same fall-through",
    },
    {
      variant_key: "2025-12-11-fc",
      expected: { variant_key: "base", variant_label: "Current" },
      why: "DASHED date + fc — fall-through",
    },
    {
      variant_key: "2025-12-11-high",
      expected: { variant_key: "base", variant_label: "Current" },
      why: "DASHED date + non-alias qualifier — fall-through",
    },
    { variant_key: "gpt-foo-bar", expected: { variant_key: "base", variant_label: "Current" }, why: "no date detected" },
  ]
  it.each(cases)("'$variant_key' → '$expected.variant_key' ($why)", ({ variant_key, expected }) => {
    const result = normalizeOne(familyId, { variant_key })
    expect(result.variant_key).toBe(expected.variant_key)
    expect(result.variant_label).toBe(expected.variant_label)
  })
})

// ---------------------------------------------------------------------------
// Group C — Multi-variant deduplication after normalization
// ---------------------------------------------------------------------------
//
// Documents the user-visible aggregation effect: cards with multiple
// dashed-date variants all collapse into a single "base" entry. This is
// TS as-is. If the team later decides users would benefit from
// disaggregation, that's a separate product call (see the spec doc).

function normalizeVariants(
  familyId: string,
  variants: Array<VariantInput & { evaluation_count?: number; raw_model_ids?: string[]; last_updated?: string }>
) {
  const byKey = new Map<
    string,
    { variant_key: string; variant_label: string; evaluation_count: number; raw_model_ids: string[]; last_updated?: string }
  >()
  for (const v of variants) {
    const norm = normalizeOne(familyId, v)
    const existing = byKey.get(norm.variant_key)
    if (existing) {
      existing.evaluation_count += v.evaluation_count ?? 0
      existing.raw_model_ids = Array.from(new Set([...existing.raw_model_ids, ...(v.raw_model_ids ?? [])])).sort()
      if (v.last_updated && (!existing.last_updated || new Date(v.last_updated) > new Date(existing.last_updated))) {
        existing.last_updated = v.last_updated
      }
    } else {
      byKey.set(norm.variant_key, {
        variant_key: norm.variant_key,
        variant_label: norm.variant_label,
        evaluation_count: v.evaluation_count ?? 0,
        raw_model_ids: [...(v.raw_model_ids ?? [])].sort(),
        last_updated: v.last_updated,
      })
    }
  }
  return [...byKey.values()]
}

describe("Group C — Multi-variant deduplication (TS-as-is)", () => {
  it("openai/gpt-5.2: 7 dashed-date variants collapse into default + base", () => {
    const result = normalizeVariants("openai/gpt-5.2", [
      { variant_key: "default", evaluation_count: 1, raw_model_ids: ["openai/gpt-5.2"] },
      {
        variant_key: "2025-12-11",
        evaluation_count: 3,
        raw_model_ids: ["openai/gpt-5.2-2025-12-11", "openai/gpt-5-2-2025-12-11-fc", "openai/gpt-5-2-2025-12-11-prompt"],
      },
      { variant_key: "2025-12-11-thinking-medium", evaluation_count: 1, raw_model_ids: ["openai/gpt-5-2-2025-12-11-thinking-medium"] },
      { variant_key: "2025-12-11-thinking-low", evaluation_count: 1, raw_model_ids: ["openai/gpt-5-2-2025-12-11-thinking-low"] },
      { variant_key: "2025-12-11-thinking-high", evaluation_count: 1, raw_model_ids: ["openai/gpt-5-2-2025-12-11-thinking-high"] },
      { variant_key: "2025-12-11-thinking-none", evaluation_count: 1, raw_model_ids: ["openai/gpt-5-2-2025-12-11-thinking-none"] },
      { variant_key: "2025-12-11-thinking-xhigh", evaluation_count: 1, raw_model_ids: ["openai/gpt-5-2-2025-12-11-thinking-xhigh"] },
    ])
    // All 6 dashed-date variants collapse into a single "base" entry. This
    // is TS-as-is behaviour and the canonical spec for this migration.
    expect(result.map((v) => v.variant_key).sort()).toEqual(["base", "default"])
    const base = result.find((v) => v.variant_key === "base")!
    expect(base.evaluation_count).toBe(8)
    expect(base.raw_model_ids.length).toBe(8)
  })

  it("anthropic/claude-haiku-4.5: YYYYMMDD-thinking-Nk variants merge into ISO date (startsWith match fires)", () => {
    const result = normalizeVariants("anthropic/claude-haiku-4.5", [
      { variant_key: "default", evaluation_count: 1, raw_model_ids: ["anthropic/claude-haiku-4.5"] },
      { variant_key: "20251001", evaluation_count: 2, raw_model_ids: ["anthropic/claude-haiku-4-5-20251001", "anthropic/claude-haiku-4-5-20251001-fc"] },
      { variant_key: "20251001-thinking-1k", evaluation_count: 1, raw_model_ids: ["anthropic/claude-haiku-4-5-20251001-thinking-1k"] },
      { variant_key: "20251001-thinking-8k", evaluation_count: 1, raw_model_ids: ["anthropic/claude-haiku-4-5-20251001-thinking-8k"] },
      { variant_key: "20251001-thinking-16k", evaluation_count: 1, raw_model_ids: ["anthropic/claude-haiku-4-5-20251001-thinking-16k"] },
      { variant_key: "20251001-thinking-32k", evaluation_count: 1, raw_model_ids: ["anthropic/claude-haiku-4-5-20251001-thinking-32k"] },
    ])
    // YYYYMMDD-thinking-Nk variants merge into "2024-10-01" (ISO) via the
    // startsWith("thinking") match. The base "20251001" stays as YYYYMMDD
    // because it has no qualifier. So they DON'T merge with each other —
    // different normalized keys ("20251001" vs "2025-10-01"). TS quirk.
    const keys = result.map((v) => v.variant_key).sort()
    expect(keys).toContain("default")
    expect(keys).toContain("20251001")
    expect(keys).toContain("2025-10-01")
    expect(keys.length).toBe(3)
    const merged = result.find((v) => v.variant_key === "2025-10-01")!
    expect(merged.evaluation_count).toBe(4)
    expect(merged.raw_model_ids.length).toBe(4)
  })

  it("non-alias qualifiers with YYYYMMDD dates preserved as separate variants", () => {
    const result = normalizeVariants("openai/gpt-5", [
      { variant_key: "default", evaluation_count: 1, raw_model_ids: [] },
      { variant_key: "20250807", evaluation_count: 1, raw_model_ids: [] },
      { variant_key: "20250807-high", evaluation_count: 1, raw_model_ids: [] },
      { variant_key: "20250807-low", evaluation_count: 1, raw_model_ids: [] },
      { variant_key: "20250807-medium", evaluation_count: 1, raw_model_ids: [] },
      { variant_key: "20250807-minimal", evaluation_count: 1, raw_model_ids: [] },
    ])
    expect(result.map((v) => v.variant_key).sort()).toEqual([
      "20250807",
      "20250807-high",
      "20250807-low",
      "20250807-medium",
      "20250807-minimal",
      "default",
    ])
  })
})
