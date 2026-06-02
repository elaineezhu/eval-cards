import "server-only"

import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { copyFileSync, statSync, createReadStream } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  getConnection,
  getResolvedSources,
  getSnapshotArtifactUrl,
} from "@/lib/duckdb"

export const dynamic = "force-dynamic"

// Temporary read-only diagnostic for the linux-x64 Space "don't know what
// type:" Parquet-decode failure. Probes the live DuckDB connection on the
// Space hardware to isolate which column / read-path triggers it. The
// failing query selects only PRIMITIVE columns, and reading the same bytes
// over httpfs succeeds while the local /data cache read fails — pointing at
// the local-file (mmap on the /data network mount) read path. These probes
// confirm that. Remove once the root cause is fixed.
//
// Usage: /api/diag?id=deepseek/deepseek-v4-flash[&threads=1][&http=1]

const PRIMITIVE_COLUMNS = [
  "evaluation_id",
  "metric_summary_id",
  "benchmark_id",
  "metric_id",
  "model_key",
  "score",
  "metric_display_name",
  "instance_file_path",
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

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    createReadStream(path)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject)
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const modelKey = searchParams.get("id") ?? "deepseek/deepseek-v4-flash"
  const threadsParam = searchParams.get("threads")
  const useHttp = searchParams.get("http") === "1"

  const connection = await getConnection()
  const snapshotUrl = (process.env.SNAPSHOT_URL ?? "").replace(/\/+$/, "")
  const sources = getResolvedSources()
  const localPath = sources["eval_results_view"] ?? ""
  const remoteUrl = getSnapshotArtifactUrl("eval_results_view.parquet")

  const source = useHttp
    ? `read_parquet('${remoteUrl}')`
    : `eval_results_view`

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

  // ---- File integrity: is the local cached file byte-identical to remote? ----
  const fileInfo: Record<string, unknown> = { localPath, remoteUrl }
  try {
    fileInfo.localSize = statSync(localPath).size
    fileInfo.localSha256 = await sha256File(localPath)
  } catch (err) {
    fileInfo.localError = err instanceof Error ? err.message : String(err)
  }
  try {
    const res = await fetch(remoteUrl)
    const buf = Buffer.from(await res.arrayBuffer())
    fileInfo.remoteSize = buf.length
    fileInfo.remoteSha256 = createHash("sha256").update(buf).digest("hex")
    fileInfo.sha256Match = fileInfo.remoteSha256 === fileInfo.localSha256
  } catch (err) {
    fileInfo.remoteError = err instanceof Error ? err.message : String(err)
  }

  const probes: ProbeResult[] = []

  probes.push(
    await probe("version_threads", async () =>
      run("SELECT version() AS v, current_setting('threads') AS threads"),
    ),
  )

  // Isolate exactly which primitive column's decode fails.
  for (const col of PRIMITIVE_COLUMNS) {
    probes.push(
      await probe(`col_${col}`, async () =>
        run(
          `SELECT ${col} FROM ${source} WHERE model_key = ? AND score IS NOT NULL`,
          [modelKey],
        ),
      ),
    )
  }

  // ---- Read the SAME local file copied to /tmp (container-ephemeral disk)
  // instead of /data (HF persistent/overlay mount). If /tmp works and /data
  // fails on identical bytes, it's the /data filesystem + DuckDB's local
  // reader (mmap), not the file or the data. ----
  if (localPath && !useHttp) {
    const tmpCopy = join(tmpdir(), "diag-eval_results_view.parquet")
    probes.push(
      await probe(
        "col_evaluation_id_from_tmp_copy",
        async () => {
          copyFileSync(localPath, tmpCopy)
          return run(
            `SELECT evaluation_id FROM read_parquet('${tmpCopy}') WHERE model_key = ? AND score IS NOT NULL`,
            [modelKey],
          )
        },
        "same bytes, read from os.tmpdir() instead of /data",
      ),
    )

    // And explicitly from the /data path via read_parquet (not the view),
    // to confirm the view isn't the variable.
    probes.push(
      await probe(
        "col_evaluation_id_from_data_path",
        async () =>
          run(
            `SELECT evaluation_id FROM read_parquet('${localPath}') WHERE model_key = ? AND score IS NOT NULL`,
            [modelKey],
          ),
        "explicit /data path",
      ),
    )
  }

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
    fileInfo,
    probes,
  })
}
