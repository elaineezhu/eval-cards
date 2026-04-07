import "server-only"

import { promises as fs, type Dirent } from "fs"
import path from "path"

import type { BenchmarkCard } from "@/lib/benchmark-schema"
import { normalizeBenchmarkKey, candidateBenchmarkKeys as candidateKeys } from "@/lib/benchmark-metadata-utils"

export { normalizeBenchmarkKey }

interface IndexedBenchmarkDetailFile {
  benchmark_cards?: Record<string, BenchmarkCard>
}

function getBenchmarkDataDirectory() {
  return path.join(process.cwd(), "data", "benchmarks")
}

async function readEmbeddedBenchmarkCards(): Promise<Map<string, BenchmarkCard>> {
  const dir = getBenchmarkDataDirectory()
  const map = new Map<string, BenchmarkCard>()

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return map
  }

  const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))

  await Promise.all(
    jsonFiles.map(async (entry) => {
      try {
        const raw = await fs.readFile(path.join(dir, entry.name), "utf8")
        const parsed = JSON.parse(raw) as IndexedBenchmarkDetailFile
        const embeddedCards = parsed.benchmark_cards

        if (!embeddedCards || typeof embeddedCards !== "object") {
          return
        }

        for (const [metricName, card] of Object.entries(embeddedCards)) {
          if (!card?.benchmark_details?.name) {
            continue
          }

          for (const key of candidateKeys(metricName)) {
            if (!map.has(key)) map.set(key, card)
          }

          for (const key of candidateKeys(card.benchmark_details.name)) {
            if (!map.has(key)) map.set(key, card)
          }
        }
      } catch (err) {
        console.warn(`benchmark-metadata: failed to load embedded cards from ${entry.name}:`, err)
      }
    })
  )

  return map
}

let cachedMapPromise: Promise<Map<string, BenchmarkCard>> | null = null

function getMap(): Promise<Map<string, BenchmarkCard>> {
  if (process.env.NODE_ENV === "production") {
    if (!cachedMapPromise) cachedMapPromise = readEmbeddedBenchmarkCards()
    return cachedMapPromise
  }
  return readEmbeddedBenchmarkCards()
}

/** Look up a BenchmarkCard by any commonly-used benchmark name. Returns null if not found. */
export async function getBenchmarkCard(benchmarkName: string): Promise<BenchmarkCard | null> {
  const map = await getMap()
  for (const key of candidateKeys(benchmarkName)) {
    const card = map.get(key)
    if (card) return card
  }
  return null
}

/** Returns all loaded BenchmarkCards keyed by their normalised canonical name. */
export async function getAllBenchmarkCards(): Promise<Record<string, BenchmarkCard>> {
  const map = await getMap()
  // Deduplicate: only emit one entry per card (by canonical name)
  const seen = new Set<BenchmarkCard>()
  const result: Record<string, BenchmarkCard> = {}
  for (const [key, card] of map) {
    if (!seen.has(card)) {
      seen.add(card)
      result[normalizeBenchmarkKey(card.benchmark_details.name)] = card
    }
  }
  return result
}
