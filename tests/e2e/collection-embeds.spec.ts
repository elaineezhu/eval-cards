import { expect, test, type Page } from "@playwright/test"

// Collection-study embeds e2e — the context view and trajectory panels
// inside /embed/eval/*. Opt-in via `SNAPSHOT_URL=<warehouse> pnpm
// test:e2e`; self-skips otherwise. Asserts CONTENT (captions, panel
// titles, declared-absence copy), not liveness, because a blank iframe
// and a silently substituted chart both return 200.
//
// The AISI expectations are pinned to the study's shape in the
// warehouse; healthbench (graded outcome) serves only the termination
// panel.

const BASE = `http://localhost:${process.env.PORT || 3211}`
const SNAPSHOT = (process.env.SNAPSHOT_URL || "").replace(/\/+$/, "")

test.describe.configure({ mode: "serial" })
test.skip(!SNAPSHOT, "set SNAPSHOT_URL to run the collection-embeds e2e")

const STUDY = "aisi-inference-scaling"
const STUDY_STRIP = "How Inference Compute Shapes Frontier LLM Evaluation"
const BUDGET_LINE = "Runs used larger inference budgets than standard evaluation setups."

// innerText reflects CSS text-transform (kickers and card titles render
// uppercased), so every containment check is case-insensitive.
const bodyText = async (page: Page, url: string) => {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(400)
  return (await page.locator("body").innerText()).toLowerCase()
}
const has = (text: string, needle: string) => text.includes(needle.toLowerCase())

test("existing embed views: study pages gain the context strip, ordinary pages are untouched", async ({ page }) => {
  const study = await bodyText(page, `/embed/eval/distribution/${STUDY}%2Fterminal-bench-2`)
  expect(has(study, "score distribution")).toBe(true)
  expect(has(study, BUDGET_LINE)).toBe(true)
  expect(has(study, "received oracle score feedback")).toBe(false)

  const frontier = await bodyText(page, `/embed/eval/frontier/${STUDY}%2Fswe-bench-pro`)
  expect(has(frontier, "pareto frontier")).toBe(true)
  expect(has(frontier, STUDY_STRIP)).toBe(true)

  // The study strip rides every embed surface for a curated page.
  for (const url of [
    `/embed/eval/distribution/${STUDY}%2Fterminal-bench-2`,
    `/embed/eval/frontier/${STUDY}%2Fterminal-bench-2`,
    `/embed/eval/trajectories/${STUDY}%2Fterminal-bench-2`,
  ]) {
    const surface = await bodyText(page, url)
    expect(has(surface, STUDY_STRIP), `${url}: strip still renders`).toBe(true)
  }

  // The retired compute view: a live ?view=compute link falls back to the
  // distribution rather than rendering an empty frame.
  const retired = await bodyText(
    page,
    `/embed/eval/distribution/${STUDY}%2Fterminal-bench-2?view=compute`,
  )
  expect(has(retired, "score distribution")).toBe(true)
  expect(has(retired, "score by compute setting")).toBe(false)

  // An ordinary two-segment eval carries no study strip.
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

test("context embed: the scaffold-context strips render, and ?view=context falls back where there is no context", async ({
  page,
}) => {
  // The payload rides the per-source summary, so the API is also the
  // honest probe for whether this snapshot was baked with
  // collection_context.json. A snapshot that predates the bake skips
  // rather than failing — absence there is by design, not a regression.
  const probe = await page.request.get(
    `${BASE}/api/eval-summary?id=${encodeURIComponent(`${STUDY}%2Fterminal-bench-2`)}`,
  )
  const summary = (await probe.json()) as {
    collection?: { context?: { models?: unknown[] } | null }
  }
  test.skip(
    !summary?.collection?.context,
    "snapshot carries no collection_context.json (pre-scaffold-context bake)",
  )

  const text = await bodyText(page, `/embed/eval/distribution/${STUDY}%2Fterminal-bench-2?view=context`)
  expect(has(text, "study scores among other reported evaluations")).toBe(true)
  expect(has(text, STUDY_STRIP)).toBe(true)
  // The two standing caption lines: what a diamond is, what a circle is.
  expect(
    has(
      text,
      "diamonds: the current study's score for the no-feedback (blue) and with-oracle (orange) setup",
    ),
  ).toBe(true)
  expect(has(text, "whiskers show the standard error")).toBe(true)
  expect(has(text, "circles: reported scores from other sources in every eval ever")).toBe(true)
  // The retired band and harvest sentence are gone from every surface.
  expect(has(text, "shaded band")).toBe(false)
  expect(has(text, "measurements harvested")).toBe(false)
  // The strips are not the histogram.
  expect(has(text, "kernel-density")).toBe(false)
})

test("context embed on a no-context eval: unknown-view fallback, never an empty frame", async ({
  page,
}) => {
  // frontiermath is a study page with no scaffold-context entry; an
  // ordinary eval has no collection attachment at all. Both must render
  // the distribution, exactly as an unrecognised ?view= does.
  const fm = await bodyText(page, `/embed/eval/distribution/${STUDY}%2Ffrontiermath?view=context`)
  const fmUnknown = await bodyText(
    page,
    `/embed/eval/distribution/${STUDY}%2Ffrontiermath?view=not-a-view`,
  )
  expect(has(fm, "score distribution")).toBe(true)
  expect(has(fm, "study scores among other reported evaluations")).toBe(false)
  expect(has(fmUnknown, "score distribution")).toBe(true)

  const listRes = await page.request.get(`${BASE}/api/eval-list-lite`)
  const listJson = (await listRes.json()) as
    | { evals?: Array<{ evaluation_id?: string }> }
    | Array<{ evaluation_id?: string }>
  const list = Array.isArray(listJson) ? listJson : listJson.evals ?? []
  const ordinary = list
    .map((e) => e.evaluation_id || "")
    .find((id) => id.includes("%2F") && !id.startsWith(STUDY))
  expect(ordinary, "an ordinary per-source eval exists").toBeTruthy()
  const ord = await bodyText(page, `/embed/eval/distribution/${ordinary}?view=context`)
  expect(has(ord, "score distribution")).toBe(true)
  expect(has(ord, "study scores among other reported evaluations")).toBe(false)
})
