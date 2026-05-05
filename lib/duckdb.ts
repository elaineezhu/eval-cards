import "server-only"

import { DuckDBConnection } from "@duckdb/node-api"
import { createHash } from "node:crypto"
import { accessSync, constants as fsConstants, createWriteStream } from "node:fs"
import { mkdir, rename, stat, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

let connectionPromise: Promise<DuckDBConnection> | null = null

function getSnapshotUrl() {
  const snapshotUrl = process.env.SNAPSHOT_URL?.trim()
  if (!snapshotUrl) {
    throw new Error("DATA_BACKEND=v2 requires SNAPSHOT_URL to point at a Stage J snapshot directory")
  }

  return snapshotUrl.replace(/\/+$/, "")
}

function snapshotArtifact(name: string) {
  return `${getSnapshotUrl()}/${name}`
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

const VIEW_FILES = {
  models_view: "models_view.parquet",
  evals_view: "evals_view.parquet",
  eval_results_view: "eval_results_view.parquet",
} as const

// Mirror lib/sidecars.ts so JSON sidecars and Parquet views share one
// disk-cache directory + obey the same env knobs (SIDECAR_CACHE_DIR,
// SIDECAR_CACHE_TTL_SECONDS, SIDECAR_CACHE_PURGE). Resolves to
// /data/sidecars on the HF Space (writable persistent bucket) and
// `<tmpdir>/eval-card-sidecars` locally.
function resolveDiskCacheDir(): string {
  const explicit = process.env.SIDECAR_CACHE_DIR?.trim()
  if (explicit) return explicit
  try {
    accessSync("/data", fsConstants.W_OK)
    return "/data/sidecars"
  } catch {
    return join(tmpdir(), "eval-card-sidecars")
  }
}

const DISK_CACHE_DIR = resolveDiskCacheDir()
const DISK_CACHE_TTL_MS =
  Number.parseInt(process.env.SIDECAR_CACHE_TTL_SECONDS ?? "3600", 10) * 1000

function diskCachePath(url: string): string {
  // The path encodes the URL hash so swapping SNAPSHOT_URL doesn't
  // collide with the previous snapshot's cached payloads.
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16)
  const safeName = url.split("/").slice(-1)[0]?.replace(/[^a-zA-Z0-9._-]/g, "_") ?? "parquet"
  return join(DISK_CACHE_DIR, `${hash}-${safeName}`)
}

async function isCachedAndFresh(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    if (info.size === 0) return false
    if (Date.now() - info.mtimeMs > DISK_CACHE_TTL_MS) return false
    return true
  } catch {
    return false
  }
}

/**
 * Mirror a remote parquet file to the local disk cache and return the
 * local path. Fails open to the source URL when the download or write
 * doesn't succeed — DuckDB can still range-read over HTTP, just slowly.
 *
 * Streamed via `Readable.fromWeb(...)` rather than buffered through
 * `arrayBuffer()` because `eval_results_view.parquet` can run into
 * hundreds of MB and blowing that into a single Node Buffer evicts
 * the rest of the page render.
 */
async function ensureLocalParquet(url: string): Promise<string> {
  // file:// SNAPSHOT_URL already points at local disk; skip mirroring.
  // Node's fetch() doesn't support file://, so without this the call
  // would always take the catch path with an opaque "fetch failed".
  if (url.startsWith("file://")) return fileURLToPath(url)

  const cachePath = diskCachePath(url)
  if (await isCachedAndFresh(cachePath)) return cachePath
  try {
    const t0 = Date.now()
    const response = await fetch(url)
    if (!response.ok || !response.body) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    await mkdir(DISK_CACHE_DIR, { recursive: true })
    const tmpPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`
    try {
      await pipeline(
        Readable.fromWeb(response.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>),
        createWriteStream(tmpPath),
      )
      // Atomic publish so a concurrent reader never sees a half-written
      // file (DuckDB would crash on a truncated parquet footer).
      await rename(tmpPath, cachePath)
    } catch (writeErr) {
      // Best-effort cleanup of the partial tmp file; ignore unlink
      // failures (it may not exist if the pipeline failed before
      // creating it).
      await unlink(tmpPath).catch(() => undefined)
      throw writeErr
    }
    const info = await stat(cachePath)
    console.warn(
      `[duckdb] cached ${url.split("/").slice(-1)[0]} ` +
        `(${(info.size / 1024 / 1024).toFixed(1)} MB) in ${Date.now() - t0}ms`,
    )
    return cachePath
  } catch (err) {
    console.warn(
      `[duckdb] disk-cache mirror failed for ${url}: ` +
        `${err instanceof Error ? err.message : String(err)} — ` +
        `falling back to streaming reads from HF`,
    )
    return url
  }
}

export async function getConnection(): Promise<DuckDBConnection> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const connection = await DuckDBConnection.create()

      // Mirror parquet views to local disk before opening DuckDB views
      // so query-time range reads hit the local SSD instead of HF over
      // HTTPS. Cold first start pays a one-time download (a few hundred
      // MB total); subsequent server starts within the TTL skip
      // straight to local reads. Downloads run in parallel — we're
      // bandwidth-bound, not CPU-bound.
      const sources = await Promise.all(
        Object.entries(VIEW_FILES).map(async ([viewName, fileName]) => ({
          viewName,
          source: await ensureLocalParquet(snapshotArtifact(fileName)),
        })),
      )

      for (const { viewName, source } of sources) {
        await connection.run(
          `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_parquet(${sqlString(source)})`
        )
      }

      return connection
    })()
  }

  return connectionPromise
}
