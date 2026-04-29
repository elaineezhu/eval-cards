import "./server-only-shim.mjs"
import fs from "fs"

const { getCanonicalModelIdentity, getModelFamilyRouteId } = await import("../lib/model-family.ts")

const cards = JSON.parse(fs.readFileSync(".cache/hf-data/model-cards.json", "utf8"))

let total = 0
let familyIdMismatch = 0
let familyNameMismatch = 0
const familyIdExamples = []
const familyNameExamples = []

for (const c of cards) {
  total++
  const computed = getCanonicalModelIdentity({
    id: c.model_family_id,
    name: c.model_family_name,
  })
  if (computed.familyId !== c.model_family_id) {
    familyIdMismatch++
    if (familyIdExamples.length < 5) familyIdExamples.push({pipeline: c.model_family_id, computed: computed.familyId})
  }
  if (computed.familyName !== c.model_family_name) {
    familyNameMismatch++
    if (familyNameExamples.length < 10) familyNameExamples.push({pipeline: c.model_family_name, computed: computed.familyName})
  }
  const computedRoute = getModelFamilyRouteId(computed.familyId)
  if (computedRoute !== c.model_route_id) {
    console.error("ROUTE MISMATCH", c.model_family_id, "->", computedRoute, "vs", c.model_route_id)
  }
}

console.log({total, familyIdMismatch, familyNameMismatch})
if (familyIdExamples.length) console.log("familyId examples:", familyIdExamples)
if (familyNameExamples.length) console.log("familyName examples:", familyNameExamples.slice(0, 10))
