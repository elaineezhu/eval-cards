import { mkdtemp, mkdir, rm } from "fs/promises"
import os from "os"
import path from "path"

import { DuckDBConnection } from "@duckdb/node-api"
import { describe, expect, it } from "vitest"

import { getModelCardsLiteFromDuckDB } from "../lib/duckdb-data"

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

async function writeParquetPayload(outputDir: string, fileName: string, payloads: unknown[]) {
  const parquetDir = path.join(outputDir, "experimental", "parquet")
  await mkdir(parquetDir, { recursive: true })

  const selects = payloads
    .map((payload, index) => {
      const record = payload as Record<string, unknown>
      const payloadJson = JSON.stringify(payload)
      return [
        `SELECT 'model_card_lite' AS record_type`,
        `${sqlString(String(record.model_route_id ?? index))} AS model_route_id`,
        `${sqlString(String(record.model_family_id ?? ""))} AS model_family_id`,
        `${sqlString(String(record.developer ?? ""))} AS developer`,
        `NULL AS eval_summary_id`,
        `NULL AS developer_route_id`,
        `NULL AS category`,
        `NULL AS benchmark_family_key`,
        `${Number(record.benchmark_family_count ?? 0)} AS models_count`,
        `${Number(record.total_evaluations ?? 0)} AS total_evaluations`,
        `${sqlString(String(record.last_updated ?? ""))} AS last_updated`,
        `${sqlString(payloadJson)} AS payload_json`,
      ].join(", ")
    })
    .join(" UNION ALL ")

  const connection = await DuckDBConnection.create()
  await connection.run(`COPY (${selects}) TO ${sqlString(path.join(parquetDir, fileName))} (FORMAT parquet)`)
}

describe("DuckDB local data backend", () => {
  it("reads model-card lite payloads from local Parquet", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "eval-card-duckdb-"))
    const previousOutput = process.env.LOCAL_PIPELINE_OUTPUT

    try {
      process.env.LOCAL_PIPELINE_OUTPUT = outputDir
      await writeParquetPayload(outputDir, "model_cards_lite.parquet", [
        {
          model_family_id: "openai/gpt-5",
          model_route_id: "openai__gpt-5",
          model_family_name: "GPT 5",
          developer: "openai",
          params_billions: 100,
          total_evaluations: 3,
          benchmark_count: 2,
          benchmark_family_count: 2,
          categories_covered: ["reasoning"],
          last_updated: "2026-01-01T00:00:00Z",
          variants: [],
          score_summary: { count: 1, min: 0.7, max: 0.9, average: 0.8 },
          benchmark_names: ["mmlu"],
          top_benchmark_scores: [
            { benchmark: "mmlu", score: 0.9, metric: "accuracy" },
          ],
        },
      ])

      const cards = await getModelCardsLiteFromDuckDB()
      expect(cards).toHaveLength(1)
      expect(cards[0]).toMatchObject({
        route_id: "openai__gpt-5",
        model_name: "GPT 5",
        developer: "OpenAI",
        evaluations_count: 3,
      })
    } finally {
      if (previousOutput == null) {
        delete process.env.LOCAL_PIPELINE_OUTPUT
      } else {
        process.env.LOCAL_PIPELINE_OUTPUT = previousOutput
      }
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it("fails clearly when the expected Parquet file is missing", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "eval-card-duckdb-missing-"))
    const previousOutput = process.env.LOCAL_PIPELINE_OUTPUT

    try {
      process.env.LOCAL_PIPELINE_OUTPUT = outputDir
      await expect(getModelCardsLiteFromDuckDB()).rejects.toThrow(
        /EXPORT_EXPERIMENTAL_PARQUET=1/
      )
    } finally {
      if (previousOutput == null) {
        delete process.env.LOCAL_PIPELINE_OUTPUT
      } else {
        process.env.LOCAL_PIPELINE_OUTPUT = previousOutput
      }
      await rm(outputDir, { recursive: true, force: true })
    }
  })
})
