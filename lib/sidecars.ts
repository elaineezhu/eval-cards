import "server-only"

import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type {
  BackendManifest,
  ComparisonIndex,
  CorpusAggregates,
  EvalHierarchy,
  PeerRanksMap,
  PeerRanksSidecar,
} from "@/lib/backend-artifacts"

let cache: {
  manifest?: Promise<BackendManifest>
  headline?: Promise<CorpusAggregates>
  hierarchy?: Promise<EvalHierarchy>
  comparisonIndex?: Promise<ComparisonIndex>
  peerRanks?: Promise<PeerRanksMap>
} = {}

function getSnapshotUrl() {
  const snapshotUrl = process.env.SNAPSHOT_URL?.trim()
  if (!snapshotUrl) {
    throw new Error("DATA_BACKEND=v2 requires SNAPSHOT_URL to point at a Stage J snapshot directory")
  }

  return snapshotUrl.replace(/\/+$/, "")
}

function sidecarUrl(name: string) {
  return `${getSnapshotUrl()}/${name}`
}

// Disk cache directory + TTL for the multi-MB sidecar payloads. Next.js'
// built-in fetch cache rejects items over 2 MB so the 47 MB
// comparison-index / 6 MB peer-ranks / 2.5 MB hierarchy were re-fetched
// from HuggingFace on every cold start. With the disk cache, a warm
// container reads from `/tmp/eval-card-sidecars/*` (sub-second) instead
// of re-downloading. Override the directory via `SIDECAR_CACHE_DIR` and
// the TTL via `SIDECAR_CACHE_TTL_SECONDS`.
const DISK_CACHE_DIR =
  process.env.SIDECAR_CACHE_DIR?.trim() || join(tmpdir(), "eval-card-sidecars")
const DISK_CACHE_TTL_MS =
  Number.parseInt(process.env.SIDECAR_CACHE_TTL_SECONDS ?? "3600", 10) * 1000

function diskCachePath(url: string): string {
  // The path encodes the URL hash so swapping SNAPSHOT_URL doesn't
  // collide with the previous snapshot's cached payloads.
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16)
  const safeName = url.split("/").slice(-1)[0]?.replace(/[^a-zA-Z0-9._-]/g, "_") ?? "sidecar"
  return join(DISK_CACHE_DIR, `${hash}-${safeName}`)
}

async function readFromDisk(path: string): Promise<string | null> {
  try {
    const info = await stat(path)
    if (Date.now() - info.mtimeMs > DISK_CACHE_TTL_MS) return null
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

async function writeToDisk(path: string, payload: string): Promise<void> {
  try {
    await mkdir(DISK_CACHE_DIR, { recursive: true })
    // Atomic-ish write: stage to a temp file then rename so concurrent
    // readers never observe a partial payload.
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmpPath, payload, "utf8")
    const fs = await import("node:fs/promises")
    await fs.rename(tmpPath, path)
  } catch (err) {
    // Cache writes are best-effort — log and move on so a read-only FS
    // doesn't break the request.
    console.warn(`[sidecars] failed to write disk cache ${path}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function fetchJson<T>(name: string): Promise<T> {
  const url = sidecarUrl(name)

  if (url.startsWith("file://")) {
    const text = await readFile(new URL(url), "utf8")
    return JSON.parse(text) as T
  }

  const cachePath = diskCachePath(url)
  const cached = await readFromDisk(cachePath)
  if (cached !== null) {
    return JSON.parse(cached) as T
  }

  const response = await fetch(url, { next: { revalidate: 3600 } })
  if (!response.ok) {
    throw new Error(`Snapshot sidecar fetch failed: ${response.status} ${response.statusText} for ${url}`)
  }

  const text = await response.text()
  // Fire-and-forget: we don't want disk I/O on the hot path for the
  // first request, but we do want subsequent requests in the same
  // container to read from disk.
  void writeToDisk(cachePath, text)
  return JSON.parse(text) as T
}

export function fetchManifest(): Promise<BackendManifest> {
  return (cache.manifest ??= fetchJson<BackendManifest>("manifest.json"))
}

export function fetchHeadline(): Promise<CorpusAggregates> {
  return (cache.headline ??= fetchJson<CorpusAggregates>("headline.json"))
}

export function fetchHierarchy(): Promise<EvalHierarchy> {
  return (cache.hierarchy ??= fetchJson<EvalHierarchy>("hierarchy.json"))
}

export function fetchComparisonIndex(): Promise<ComparisonIndex> {
  return (cache.comparisonIndex ??= fetchJson<ComparisonIndex>("comparison-index.json").then(
    (index) => {
      assertComparisonIndexShape(index)
      return index
    },
  ))
}

/**
 * Per-(eval, model) primary-metric peer ranks from
 * `warehouse/<snapshot>/peer-ranks.json`. Resolves to the bare
 * `eval_summary_id → model_route_id → {position, total}` map the
 * model-detail benchmark grid expects, so callers don't have to reach
 * into `.ranks` themselves.
 *
 * Returns an empty map if the snapshot doesn't carry the file yet —
 * the producer started emitting it as a Stage J sidecar in May 2026,
 * so older pinned snapshots may 404. Logs a warning in that case rather
 * than throwing so the rest of the page still renders.
 */
export function fetchPeerRanks(): Promise<PeerRanksMap> {
  return (cache.peerRanks ??= fetchJson<PeerRanksSidecar>("peer-ranks.json")
    .then((payload) => payload?.ranks ?? {})
    .catch((err) => {
      console.warn(
        `[sidecars] peer-ranks.json not available on snapshot; ` +
          `falling back to empty map. ${err instanceof Error ? err.message : String(err)}`,
      )
      return {} as PeerRanksMap
    }))
}

/**
 * Fail fast on contract regressions. Comparison-index rows must carry
 * `family_id`; the model-page graph view collapses without it. See
 * `notes/hierarchy-alignment.md` §5.2.
 */
export function assertComparisonIndexShape(index: ComparisonIndex): void {
  for (const [evalId, entry] of Object.entries(index.evals ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(entry, "family_id")) {
      throw new Error(
        `comparison-index contract regression: evals[${evalId}] is missing family_id. ` +
          `See notes/hierarchy-alignment.md §5.2.`,
      )
    }
  }
}

export function resetSidecarCacheForTests() {
  cache = {}
}
