import "server-only"

import { NextResponse } from "next/server"
import { getConnection } from "@/lib/duckdb"

export const dynamic = "force-dynamic"

// Temporary read-only diagnostic for the linux-x64 Space "don't know what
// type:" Parquet-decode failure. Probes the live DuckDB connection on the
// Space hardware to isolate which column / read-path / thread setting
// triggers it. Remove once the root cause is fixed.
//
// Usage: /api/_diag?id=deepseek/deepseek-v4-flash[&threads=1][&http=1]

const NESTED_COLUMNS = [
  "model_info",
  "derived_tags",
  "score_details",
  "generation_config",
  "source_metadata",
  "source_data",
  "eval_library",
  "evalcards_annotations",
]

type ProbeResult = {
  name: string
  ok: boolean
  rows?: number
  ms: number
  error?: string
  note?: string
}

async function probe(
  name: string,
  fn: () => Promise<number>,
  note?: string,
): Promise<ProbeResult> {
  const t0 = Date.now()
  try {
    const rows = await fn()
    return { name, ok: true, rows, ms: Date.now() - t0, note }
  } catch (err) {
    return {
      name,
      ok: false,
      ms: Date.now() - t0,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      note,
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const modelKey = searchParams.get("id") ?? "deepseek/deepseek-v4-flash"
  const threadsParam = searchParams.get("threads")
  const useHttp = searchParams.get("http") === "1"

  const connection = await getConnection()
  const snapshotUrl = (process.env.SNAPSHOT_URL ?? "").replace(/\/+$/, "")

  // When http=1, read straight from the remote parquet (range reads over
  // HTTPS) instead of the disk-cached local file the views point at, so we
  // can tell a local-file/mmap issue apart from a decode issue.
  const source = useHttp
    ? `read_parquet('${snapshotUrl}/eval_results_view.parquet')`
    : `eval_results_view`

  // Count rows through a reader; the JSON-row variant is what the app uses.
  const run = async (sql: string, params?: unknown[]) => {
    const reader = params?.length
      ? await connection.runAndRead(sql, params as any[])
      : await connection.runAndRead(sql)
    await reader.readAll()
    return reader.getRowObjectsJson().length
  }

  let appliedThreads: string | undefined
  if (threadsParam && /^\d+$/.test(threadsParam)) {
    try {
      await connection.run(`SET threads=${Number(threadsParam)}`)
      appliedThreads = threadsParam
    } catch {
      /* ignore */
    }
  }

  const probes: ProbeResult[] = []

  probes.push(
    await probe("version_threads", async () =>
      run("SELECT version() AS v, current_setting('threads') AS threads"),
    ),
  )

  probes.push(
    await probe("count_rows", async () =>
      run(`SELECT count(*) AS n FROM ${source} WHERE model_key = ?`, [modelKey]),
    ),
  )

  probes.push(
    await probe("scan_primitives", async () =>
      run(
        `SELECT evaluation_id, score, model_key FROM ${source} WHERE model_key = ? AND score IS NOT NULL`,
        [modelKey],
      ),
    ),
  )

  // The decisive probe: one to_json column at a time, so we learn exactly
  // which nested column's decode trips the Thrift "don't know what type:".
  for (const col of NESTED_COLUMNS) {
    probes.push(
      await probe(`tojson_${col}`, async () =>
        run(
          `SELECT CAST(to_json(${col}) AS VARCHAR) AS x FROM ${source} WHERE model_key = ? AND score IS NOT NULL`,
          [modelKey],
        ),
      ),
    )
  }

  // Same projection but reading every row (no model filter), to learn
  // whether the bad page is confined to this model's row group.
  probes.push(
    await probe(
      "tojson_evalcards_all_rows",
      async () =>
        run(
          `SELECT CAST(to_json(evalcards_annotations) AS VARCHAR) AS x FROM ${source} WHERE score IS NOT NULL`,
        ),
      "all rows, not just this model",
    ),
  )

  // Reset threads to engine default so the diagnostic doesn't leave the
  // shared connection in a weird state for normal traffic.
  if (appliedThreads) {
    try {
      await connection.run("RESET threads")
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    modelKey,
    snapshotUrl,
    source: useHttp ? "remote-httpfs" : "local-cache-view",
    appliedThreads: appliedThreads ?? "(default)",
    probes,
  })
}
