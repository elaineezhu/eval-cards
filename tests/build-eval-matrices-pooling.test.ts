import path from "path"
import { fileURLToPath } from "url"

import { DuckDBConnection } from "@duckdb/node-api"
import { describe, expect, it } from "vitest"

import { factModelKeySql, pooledFactScoreSql } from "../scripts/build-eval-matrices.mjs"

// The prebaked matrix and the live page must agree on a cell's number. The
// producer pools a cell's facts by first-party-preferred MEDIAN over its
// model AGGREGATION key (stage J `tri_agg`). An AVG of the raw rows
// grouped by `model_id` reports a value no source published on any cell
// holding more than one fact, and loses every folded model outright.
//
// So the check is not "the SQL parses" but "the SQL reproduces the
// producer": run the builder's own pooling expression over the ROOT facts
// and demand it land on eval_results_view's headline score, cell for cell.
//
// tests/fixtures/pooling/*.parquet are the two warehouse tables cut down to
// 65 (composite, benchmark, metric, model) cells of a real snapshot —
// chosen for several headline facts, first/third-party mixes, folded models
// and cells that also carry non-headline facts — with only the columns this
// path reads.

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/pooling",
)
const facts = `read_parquet('${path.join(FIXTURE, "fact_results.parquet")}')`
const view = `read_parquet('${path.join(FIXTURE, "eval_results_view.parquet")}')`

interface CellRow {
  composite_slug: string
  benchmark_key: string
  metric_key: string
  model_key: string
  headline_facts: number
  pooled: number
  avg_of_raw: number
  view_score: number
}

async function pooledCells(): Promise<CellRow[]> {
  const connection = await DuckDBConnection.create()
  try {
    // The builder's own expressions, not a restatement of them.
    const pooled = pooledFactScoreSql({})
    const modelKey = factModelKeySql("f", true)
    const reader = await connection.runAndReadAll(
      `WITH pooled AS (
         SELECT
           f.composite_slug,
           f.benchmark_key,
           f.metric_key,
           ${modelKey} AS model_key,
           ${pooled} AS pooled,
           -- The rule this cell must NOT follow: a flat mean of the rows.
           AVG(COALESCE(f.score_canonical, f.score)) AS avg_of_raw,
           CAST(count(*) AS INTEGER) AS headline_facts
         FROM ${facts} f
         WHERE f.is_headline
         GROUP BY 1, 2, 3, 4
       )
       SELECT
         p.*,
         COALESCE(v.score_canonical, v.score) AS view_score
       FROM pooled p
       JOIN (SELECT * FROM ${view} WHERE is_headline) v
         ON v.composite_slug = p.composite_slug
        AND v.benchmark_id = p.benchmark_key
        AND v.metric_id = p.metric_key
        AND v.model_key = p.model_key
       ORDER BY 1, 2, 3, 4`,
    )
    return reader.getRowObjects().map((row) => ({
      composite_slug: String(row.composite_slug),
      benchmark_key: String(row.benchmark_key),
      metric_key: String(row.metric_key),
      model_key: String(row.model_key),
      headline_facts: Number(row.headline_facts),
      pooled: Number(row.pooled),
      avg_of_raw: Number(row.avg_of_raw),
      view_score: Number(row.view_score),
    }))
  } finally {
    connection.closeSync()
  }
}

describe("build-eval-matrices fact pooling", () => {
  it("lands every root-metric cell on the view's headline score", async () => {
    const cells = await pooledCells()

    // Every fixture cell has a headline row on both sides — a shortfall
    // here means the pooling key stopped matching the view's own.
    expect(cells.length).toBeGreaterThanOrEqual(50)
    const multiFact = cells.filter((c) => c.headline_facts > 1)
    expect(multiFact.length).toBeGreaterThanOrEqual(20)

    const off = cells.filter((c) => Math.abs(c.pooled - c.view_score) > 1e-9)
    expect(
      off.map((c) => `${c.composite_slug}/${c.benchmark_key}/${c.metric_key}/${c.model_key}: ${c.pooled} vs ${c.view_score}`),
    ).toEqual([])
  })

  it("rejects a flat mean of the raw rows", async () => {
    // Guards the guard: on these cells the two rules genuinely differ, so
    // the equality above is a real constraint rather than an identity.
    const diverging = (await pooledCells()).filter(
      (c) => Math.abs(c.avg_of_raw - c.view_score) > 1e-9,
    )
    expect(diverging.length).toBeGreaterThan(0)
    for (const cell of diverging) {
      expect(Math.abs(cell.pooled - cell.view_score)).toBeLessThanOrEqual(1e-9)
    }
  })

  it("keeps folded models addressable", async () => {
    const connection = await DuckDBConnection.create()
    try {
      // A fold's member ids are not what the view carries, so a lookup
      // keyed on `model_id` finds no route for them and drops the cell.
      const reader = await connection.runAndReadAll(
        `SELECT
           CAST(count(DISTINCT f.model_aggregation_key) AS INTEGER) AS folded_keys,
           CAST(count(DISTINCT f.model_id) FILTER (
             WHERE f.model_id NOT IN (SELECT model_key FROM ${view})
           ) AS INTEGER) AS unaddressable_model_ids
         FROM ${facts} f
         WHERE f.model_aggregation_key IS DISTINCT FROM f.model_id
           AND f.model_aggregation_key IN (SELECT model_key FROM ${view})`,
      )
      const row = reader.getRowObjects()[0]
      expect(Number(row.folded_keys)).toBeGreaterThan(0)
      expect(Number(row.unaddressable_model_ids)).toBeGreaterThan(0)
    } finally {
      connection.closeSync()
    }
  })
})
