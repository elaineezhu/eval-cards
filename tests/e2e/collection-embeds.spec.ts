import { expect, test, type Page } from "@playwright/test"

// Collection-study embeds e2e — the compute view and trajectory panels
// inside /embed/eval/*. Opt-in via `SNAPSHOT_URL=<warehouse> pnpm
// test:e2e`; self-skips otherwise. Asserts CONTENT (axis labels, run
// counts, panel titles, declared-absence copy), not liveness, because a
// blank iframe and a silently substituted chart both return 200.
//
// The AISI expectations are pinned to the study's shape in the
// warehouse: four of the five pages carry a compute axis (two on the
// token budget, two on the reasoning-token allowance) and frontiermath
// carries none by design; healthbench (graded outcome) serves only the
// termination panel.

const BASE = `http://localhost:${process.env.PORT || 3211}`
const SNAPSHOT = (process.env.SNAPSHOT_URL || "").replace(/\/+$/, "")

test.describe.configure({ mode: "serial" })
test.skip(!SNAPSHOT, "set SNAPSHOT_URL to run the collection-embeds e2e")

const STUDY = "aisi-inference-scaling"
const STUDY_STRIP = "How Inference Compute Shapes Frontier LLM Evaluation"
const BUDGET_LINE = "Runs used larger inference budgets than standard evaluation setups."
const COMPUTE_ABSENCE = "no compute-varied protocol settings"

// innerText reflects CSS text-transform (kickers and card titles render
// uppercased), so every containment check is case-insensitive.
const bodyText = async (page: Page, url: string) => {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(400)
  return (await page.locator("body").innerText()).toLowerCase()
}
const has = (text: string, needle: string) => text.includes(needle.toLowerCase())

test("compute embeds: four AISI pages render marks on the right axis, frontiermath declares absence", async ({ page }) => {
  const cases: Array<{ id: string; axis: string; runs: string }> = [
    { id: "swe-bench-pro", axis: "token budget (limit)", runs: "33 runs" },
    { id: "terminal-bench-2", axis: "token budget (limit)", runs: "39 runs" },
    { id: "hle", axis: "reasoning-token allowance", runs: "17 runs" },
    { id: "healthbench", axis: "reasoning-token allowance", runs: "17 runs" },
  ]
  for (const c of cases) {
    const text = await bodyText(page, `/embed/eval/distribution/${STUDY}%2F${c.id}?view=compute`)
    expect(has(text, "score by compute setting"), `${c.id}: kicker`).toBe(true)
    expect(has(text, c.axis), `${c.id}: axis label`).toBe(true)
    expect(has(text, c.runs), `${c.id}: mark count`).toBe(true)
    expect(has(text, STUDY_STRIP), `${c.id}: attribution`).toBe(true)
    expect(has(text, BUDGET_LINE), `${c.id}: budget line`).toBe(true)
    expect(has(text, COMPUTE_ABSENCE), `${c.id}: no absence line`).toBe(false)
  }

  // hle drops 10 of its 27 protocol rows (null on the chosen axis); the
  // caption must say so rather than silently shrinking the population.
  const hle = await bodyText(page, `/embed/eval/distribution/${STUDY}%2Fhle?view=compute`)
  expect(has(hle, "10 runs have no recorded")).toBe(true)

  // frontiermath: nothing numeric varies within a feedback condition, so
  // the axis is null by design and the embed declares absence (the strip
  // still attributes the page's data to the study).
  const fm = await bodyText(page, `/embed/eval/distribution/${STUDY}%2Ffrontiermath?view=compute`)
  expect(has(fm, COMPUTE_ABSENCE)).toBe(true)
  expect(has(fm, STUDY_STRIP)).toBe(true)
})

test("compute embed on non-study surfaces: declared absence, never a substituted chart", async ({ page }) => {
  // Merged id unpinned: merged summaries never carry the collection
  // attachment, so compute is unreachable until a source is pinned.
  const merged = await bodyText(page, "/embed/eval/distribution/hle?view=compute")
  expect(has(merged, COMPUTE_ABSENCE)).toBe(true)
  expect(has(merged, "merged (all sources)")).toBe(true)
  // No strip. Assert on the strip's own sentence, not the study name —
  // the source picker's option label can carry the study title when the
  // snapshot uses it as the composite display name.
  expect(has(merged, BUDGET_LINE)).toBe(false)

  // Pinning the study source swaps in its per-source payload.
  const pinned = await bodyText(page, `/embed/eval/distribution/hle?view=compute&source=${STUDY}`)
  expect(has(pinned, "reasoning-token allowance")).toBe(true)
  // The strip's own sentence — the picker's option label can carry the
  // study title, so the name alone doesn't prove the strip rendered.
  expect(has(pinned, BUDGET_LINE)).toBe(true)
})

test("existing embed views: study pages gain the context strip, ordinary pages are untouched", async ({ page }) => {
  const study = await bodyText(page, `/embed/eval/distribution/${STUDY}%2Fterminal-bench-2`)
  expect(has(study, "score distribution")).toBe(true)
  expect(has(study, "21 of 39 runs received oracle score feedback")).toBe(true)

  const frontier = await bodyText(page, `/embed/eval/frontier/${STUDY}%2Fswe-bench-pro`)
  expect(has(frontier, "pareto frontier")).toBe(true)
  expect(has(frontier, STUDY_STRIP)).toBe(true)

  // An ordinary two-segment eval: no strip, and ?view=compute is absence.
  const listRes = await page.request.get(`${BASE}/api/eval-list-lite`)
  const listJson = (await listRes.json()) as
    | { evals?: Array<{ evaluation_id?: string }> }
    | Array<{ evaluation_id?: string }>
  const list = Array.isArray(listJson) ? listJson : listJson.evals ?? []
  const ordinary = list
    .map((e) => e.evaluation_id || "")
    .find((id) => id.includes("%2F") && !id.startsWith(STUDY))
  expect(ordinary, "an ordinary per-source eval exists").toBeTruthy()
  const ord = await bodyText(page, `/embed/eval/distribution/${ordinary}`)
  expect(has(ord, BUDGET_LINE)).toBe(false)
  const ordCompute = await bodyText(page, `/embed/eval/distribution/${ordinary}?view=compute`)
  expect(has(ordCompute, COMPUTE_ABSENCE)).toBe(true)
})

test("trajectories embed: per-page panel sets, panel filter, and declared absence", async ({ page }) => {
  const TOKENS = "lowest observed tokens to success"
  const RELIABILITY = "reliability by task difficulty"
  const TERMINATION = "how runs ended"

  // Binary-outcome pages serve all three panels.
  for (const id of ["hle", "swe-bench-pro", "terminal-bench-2", "frontiermath"]) {
    const text = await bodyText(page, `/embed/eval/trajectories/${STUDY}%2F${id}`)
    expect(has(text, TOKENS), `${id}: tokens panel`).toBe(true)
    expect(has(text, RELIABILITY), `${id}: reliability panel`).toBe(true)
    expect(has(text, TERMINATION), `${id}: termination panel`).toBe(true)
    expect(has(text, STUDY_STRIP), `${id}: attribution`).toBe(true)
  }

  // healthbench is graded: exactly the termination panel, and asking for
  // a panel it does not carry is a declared absence.
  const hb = await bodyText(page, `/embed/eval/trajectories/${STUDY}%2Fhealthbench`)
  expect(has(hb, TERMINATION)).toBe(true)
  expect(has(hb, TOKENS)).toBe(false)
  expect(has(hb, RELIABILITY)).toBe(false)
  const hbTokens = await bodyText(page, `/embed/eval/trajectories/${STUDY}%2Fhealthbench?panel=tokens`)
  expect(has(hbTokens, "is not available for this evaluation")).toBe(true)

  // ?panel narrows to one card.
  const one = await bodyText(page, `/embed/eval/trajectories/${STUDY}%2Fswe-bench-pro?panel=termination`)
  expect(has(one, TERMINATION)).toBe(true)
  expect(has(one, TOKENS)).toBe(false)

  // Merged id unpinned: absence plus the way in.
  const merged = await bodyText(page, "/embed/eval/trajectories/hle")
  expect(has(merged, "no trajectory data for this evaluation")).toBe(true)
  expect(has(merged, "pick a source")).toBe(true)
})
