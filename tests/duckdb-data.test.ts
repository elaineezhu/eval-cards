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
  const parquetDir = path.join(outputDir, "duckdb", "v1")
  await mkdir(parquetDir, { recursive: true })

  const selects = payloads
    .map((payload) => {
      const payloadJson = JSON.stringify(payload)
      return `SELECT ${sqlString(payloadJson)} AS payload_json`
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
          id: "openai/gpt-5",
          route_id: "openai__gpt-5",
          model_name: "GPT 5",
          model_id: "openai/gpt-5",
          canonical_model_name: "GPT 5",
          developer: "OpenAI",
          evaluations_count: 3,
          benchmarks_count: 2,
          variant_count: 1,
          categories: ["Reasoning"],
          category_stats: { General: 0, Reasoning: 2, Agentic: 0, Safety: 0, Knowledge: 0 },
          latest_timestamp: "2026-01-01T00:00:00Z",
          evaluator_count: 1,
          evaluator_names: ["OpenAI"],
          source_type_count: 1,
          source_types: ["documentation"],
          evidence_count: 3,
          missing_generation_config_count: 0,
          third_party_eval_count: 0,
          independent_verification_ratio: 0,
          reproducibility_status: "complete",
          eval_libraries: [],
          params_billions: 100,
          score_summary: { count: 1, min: 0.7, max: 0.9, average: 0.8 },
          benchmark_names: ["mmlu"],
          top_scores: [
            { benchmark: "mmlu", score: 0.9, metric: "accuracy" },
          ],
          source_urls: [],
          detail_urls: [],
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
        /duckdb\/v1\/model_cards_lite\.parquet/
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
