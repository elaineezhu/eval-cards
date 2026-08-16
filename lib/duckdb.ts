import "server-only"

import { DuckDBConnection } from "@duckdb/node-api"
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

// Additive snapshot artifacts that older snapshots don't ship. Loaded
// best-effort: a missing file must NOT fail connection init (the required
// loop above hard-fails by design). Consumers probe table presence and
// degrade — getMergedBenchmarkSummary returns null when the merged view
// is absent.
const OPTIONAL_VIEW_FILES = {
  merged_evals_view: "merged_evals_view.parquet",
} as const

export async function getConnection(): Promise<DuckDBConnection> {
  if (!connectionPromise) {
    const pending = (async () => {
      const connection = await DuckDBConnection.create()

      // Materialise each parquet snapshot into an in-memory DuckDB table at
      // connection-open time, reading once straight from HF over httpfs.
      //
      // We previously mirrored the parquet to a local disk cache (/data on
      // the Space) and opened views over the file. But DuckDB memory-maps
      // local parquet files, and right after a fresh download onto HF's
      // /data persistent mount those mmap'd pages could be read back
      // incoherent — failing a query mid-scan with "Invalid Error: don't
      // know what type:" even though the bytes on disk were byte-for-byte
      // correct (sha256 matched the remote). Reading over httpfs never
      // mmaps a local file, so it is unaffected.
      //
      // Loading into a table (not an httpfs-backed view) keeps queries
      // fast: the one-time startup read replaces the old cache download,
      // and every subsequent query hits RAM instead of the network or a
      // memory-mapped file. The snapshots are small (a few MB each).
      const t0 = Date.now()
      for (const [viewName, fileName] of Object.entries(VIEW_FILES)) {
        const url = snapshotArtifact(fileName)
        // file:// SNAPSHOT_URL (local dev) is a filesystem path to
        // read_parquet, not an httpfs URL.
        const source = url.startsWith("file://") ? fileURLToPath(url) : url
        await connection.run(
          `CREATE OR REPLACE TABLE ${viewName} AS SELECT * FROM read_parquet(${sqlString(source)})`,
        )
      }
      let optionalLoaded = 0
      for (const [viewName, fileName] of Object.entries(OPTIONAL_VIEW_FILES)) {
        const url = snapshotArtifact(fileName)
        const source = url.startsWith("file://") ? fileURLToPath(url) : url
        try {
          await connection.run(
            `CREATE OR REPLACE TABLE ${viewName} AS SELECT * FROM read_parquet(${sqlString(source)})`,
          )
          optionalLoaded += 1
        } catch (err) {
          console.warn(
            `[duckdb] optional snapshot table ${viewName} unavailable (${
              err instanceof Error ? err.message : String(err)
            }) — continuing without it`,
          )
        }
      }
      console.warn(
        `[duckdb] loaded ${Object.keys(VIEW_FILES).length + optionalLoaded} snapshot tables in ${Date.now() - t0}ms`,
      )

      return connection
    })()
    connectionPromise = pending
    // If init fails (e.g. a transient httpfs blip during the snapshot
    // read), clear the cached rejected promise so the NEXT request retries
    // instead of every request awaiting a permanently-rejected promise
    // until the Space restarts. Guard on identity so a later retry already
    // in flight is never stomped.
    pending.catch(() => {
      if (connectionPromise === pending) connectionPromise = null
    })
  }

  return connectionPromise
}
