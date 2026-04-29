import "./server-only-shim.mjs"
import fs from "fs"

const { getCanonicalModelIdentity, getModelFamilyRouteId } = await import("../lib/model-family.ts")

// Replicate the runtime normalizer's logic exactly (lib/hf-data.ts:750-812)
// so we can trace what it would do against any real card.
function normalizeSetupAliasQualifier(value) {
  return value?.trim().toLowerCase().replace(/[_\s]+/g, "-") ?? ""
}
function isSetupAliasQualifier(value) {
  const normalized = normalizeSetupAliasQualifier(value)
  return (
    normalized === "prompt" ||
    normalized === "fc" ||
    normalized === "function-calling" ||
    normalized.startsWith("thinking")
  )
}
function getLatestTimestamp(a, b) {
  if (!a) return b
  if (!b) return a
  const aTime = new Date(a).getTime()
  const bTime = new Date(b).getTime()
  if (!Number.isFinite(aTime)) return b
  if (!Number.isFinite(bTime)) return a
  return bTime > aTime ? b : a
}
function normalizeSingleModelCardEntry(entry) {
  const familyIdentity = getCanonicalModelIdentity({ id: entry.model_family_id, name: entry.model_family_name })
  const variantsByKey = new Map()
  for (const variant of entry.variants ?? []) {
    let normalizedVariantKey = variant.variant_key
    let normalizedVariantLabel = variant.variant_label
    if (variant.variant_key === "base") {
      normalizedVariantKey = "default"
      normalizedVariantLabel = "Default"
    } else if (variant.variant_key !== "default") {
      const syntheticIdentity = getCanonicalModelIdentity({
        id: `${familyIdentity.familyId}-${variant.variant_key}`,
        name: `${familyIdentity.familyId}-${variant.variant_key}`,
      })
      if (syntheticIdentity.versionDate && isSetupAliasQualifier(syntheticIdentity.versionQualifier)) {
        normalizedVariantKey = syntheticIdentity.versionDate
        normalizedVariantLabel = syntheticIdentity.versionDate
      } else {
        normalizedVariantKey = syntheticIdentity.variantKey
        normalizedVariantLabel = syntheticIdentity.variantLabel
      }
    }
    const existing = variantsByKey.get(normalizedVariantKey)
    if (existing) {
      existing.evaluation_count += variant.evaluation_count
      existing.last_updated = getLatestTimestamp(existing.last_updated, variant.last_updated)
      existing.raw_model_ids = Array.from(new Set([...(existing.raw_model_ids ?? []), ...(variant.raw_model_ids ?? [])])).sort()
      continue
    }
    variantsByKey.set(normalizedVariantKey, {
      ...variant,
      variant_key: normalizedVariantKey,
      variant_label: normalizedVariantLabel,
      raw_model_ids: [...(variant.raw_model_ids ?? [])].sort(),
    })
  }
  const normalizedVariants = Array.from(variantsByKey.values())
  return { ...entry, variants: normalizedVariants }
}

const cards = JSON.parse(fs.readFileSync(".cache/hf-data/model-cards.json", "utf8"))

// === Sample a known-affected card to show pre/post ===
console.log("=== Sample: openai/gpt-5.2 (multi-variant flagship, known to exercise the rule) ===")
const gpt52 = cards.find(c => c.model_family_id === "openai/gpt-5.2")
if (gpt52) {
  console.log("Input variants (cache state):")
  for (const v of gpt52.variants) console.log(`  '${v.variant_key}'`)
  console.log("After runtime normalize (what /api/model-cards returns):")
  const normalized = normalizeSingleModelCardEntry(gpt52)
  for (const v of normalized.variants) console.log(`  '${v.variant_key}' / raw_ids count=${v.raw_model_ids?.length ?? 0}`)
}

// === Aggregate audit: across all cards, does normalizer change anything? ===
console.log("\n=== Aggregate: cards where normalizer would CHANGE the variants list ===")
let changedCount = 0
const changedExamples = []
for (const c of cards) {
  const beforeKeys = (c.variants ?? []).map(v => v.variant_key).sort().join("|")
  const afterKeys = normalizeSingleModelCardEntry(c).variants.map(v => v.variant_key).sort().join("|")
  if (beforeKeys !== afterKeys) {
    changedCount++
    if (changedExamples.length < 5) changedExamples.push({ family: c.model_family_id, before: beforeKeys, after: afterKeys })
  }
}
console.log(`  ${changedCount} of ${cards.length} cards would have variants changed by runtime normalizer`)
for (const ex of changedExamples) {
  console.log(`  ${ex.family}:`)
  console.log(`    before: ${ex.before}`)
  console.log(`    after:  ${ex.after}`)
}
