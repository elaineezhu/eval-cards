import "server-only"

import { DuckDBConnection } from "@duckdb/node-api"

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

export async function getConnection(): Promise<DuckDBConnection> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const connection = await DuckDBConnection.create()

      for (const [viewName, fileName] of Object.entries(VIEW_FILES)) {
        await connection.run(
          `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_parquet(${sqlString(snapshotArtifact(fileName))})`
        )
      }

      return connection
    })()
  }

  return connectionPromise
}
