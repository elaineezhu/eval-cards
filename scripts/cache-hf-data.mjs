/**
 * Downloads HF dataset files to local cache during build.
 * This avoids hitting HF rate limits at runtime.
 *
 * Phase 1: Download index files (model-cards, eval-list, developers, benchmark-metadata, peer-ranks)
 * Phase 2: Download all developer detail files (developers/*.json)
 * Phase 3: Download all eval detail files (evals/*.json)
 *
 * Run with:  node scripts/cache-hf-data.mjs
 */

import fs from "fs/promises"
import path from "path"

const root = path.resolve(new URL(import.meta.url).pathname, "..", "..")
const cacheDir = path.join(root, ".cache", "hf-data")
const publicDir = path.join(root, "public")
const HF_BASE = "https://huggingface.co/datasets/evaleval/card_backend/resolve/main"

// Rate-limit-aware download with retries
async function download(remotePath, localPath) {
  const url = `${HF_BASE}/${remotePath}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt))
      const res = await fetch(url)
      if (res.status === 429) {
        console.warn(`  ⏳ Rate limited on ${remotePath}, retrying...`)
        continue
      }
      if (!res.ok) return false
      const data = await res.text()
      await fs.mkdir(path.dirname(localPath), { recursive: true })
      await fs.writeFile(localPath, data)
      return true
    } catch {
      if (attempt === 2) return false
    }
  }
  return false
}

// Download in batches to avoid rate limits
async function downloadBatch(items, concurrency = 5) {
  let done = 0
  let failed = 0
  const total = items.length

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const results = await Promise.all(
      batch.map(({ remote, local }) => download(remote, local))
    )
    done += results.filter(Boolean).length
    failed += results.filter((r) => !r).length

    // Brief pause between batches to be polite
    if (i + concurrency < items.length) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  return { done, failed, total }
}

function slugify(text) {
  return (text.replace(/[\x00-\x1f\x7f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "") || "unknown")
}

async function main() {
  console.log("Caching HF dataset files for build...\n")

  // ── Phase 1: Index files ──────────────────────────────────────────────
  console.log("Phase 1: Index files")
  const indexFiles = [
    { remote: "model-cards.json", local: path.join(cacheDir, "model-cards.json") },
    { remote: "eval-list.json", local: path.join(cacheDir, "eval-list.json") },
    { remote: "developers.json", local: path.join(cacheDir, "developers.json") },
    { remote: "benchmark-metadata.json", local: path.join(cacheDir, "benchmark-metadata.json") },
    { remote: "eval-hierarchy.json", local: path.join(cacheDir, "eval-hierarchy.json") },
    { remote: "peer-ranks.json", local: path.join(publicDir, "peer-ranks.json") },
  ]

  await fs.mkdir(cacheDir, { recursive: true })
  await fs.mkdir(publicDir, { recursive: true })

  for (const file of indexFiles) {
    const ok = await download(file.remote, file.local)
    const stat = ok ? await fs.stat(file.local) : null
    const sizeKB = stat ? (stat.size / 1024).toFixed(0) : "?"
    console.log(`  ${ok ? "✓" : "✗"} ${file.remote} ${ok ? `(${sizeKB} KB)` : "(failed)"}`)
  }

  // ── Phase 2: Developer detail files ───────────────────────────────────
  console.log("\nPhase 2: Developer detail files")
  let developerItems = []
  try {
    const devIndex = JSON.parse(await fs.readFile(path.join(cacheDir, "developers.json"), "utf8"))
    developerItems = devIndex.map((entry) => {
      const slug = slugify(entry.developer.trim().toLowerCase())
      return {
        remote: `developers/${slug}.json`,
        local: path.join(cacheDir, "developers", `${slug}.json`),
      }
    })
  } catch (err) {
    console.warn("  Could not read developers index:", err.message)
  }

  if (developerItems.length > 0) {
    const res = await downloadBatch(developerItems)
    console.log(`  ✓ ${res.done}/${res.total} developer files cached (${res.failed} not found)`)
  }

  // ── Phase 3: Eval detail files ────────────────────────────────────────
  console.log("\nPhase 3: Eval detail files")
  let evalItems = []
  try {
    const evalIndex = JSON.parse(await fs.readFile(path.join(cacheDir, "eval-list.json"), "utf8"))
    const evals = evalIndex.evals ?? evalIndex
    evalItems = evals.map((entry) => ({
      remote: `evals/${entry.eval_summary_id}.json`,
      local: path.join(cacheDir, "evals", `${entry.eval_summary_id}.json`),
    }))
  } catch (err) {
    console.warn("  Could not read eval-list index:", err.message)
  }

  if (evalItems.length > 0) {
    const res = await downloadBatch(evalItems)
    console.log(`  ✓ ${res.done}/${res.total} eval files cached (${res.failed} not found)`)
  }

  // ── Phase 4: Model detail files ──────────────────────────────────────
  console.log("\nPhase 4: Model detail files")
  let modelItems = []
  try {
    const modelCards = JSON.parse(await fs.readFile(path.join(cacheDir, "model-cards.json"), "utf8"))
    modelItems = modelCards.map((entry) => ({
      remote: `models/${entry.model_route_id}.json`,
      local: path.join(cacheDir, "models", `${entry.model_route_id}.json`),
    }))
  } catch (err) {
    console.warn("  Could not read model-cards index:", err.message)
  }

  if (modelItems.length > 0) {
    const res = await downloadBatch(modelItems, 3)
    console.log(`  ✓ ${res.done}/${res.total} model files cached (${res.failed} not found)`)
  }

  console.log("\nDone.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
