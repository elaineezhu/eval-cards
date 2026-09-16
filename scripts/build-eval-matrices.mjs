#!/usr/bin/env node
// Precompute per-evaluation multi-metric and per-slice score matrices and
// emit them as one JSON map at data/eval-matrices.json.
//
// The runtime eval-summary endpoint currently only returns one
// (metric, model) row per model — sourced from the primary metric of
// `eval_results_view`. The other declared `leaderboard_metrics` (and
// per-slice subtask scores hiding inside `fact_results`) are dropped on
// the floor, which is why the eval page can't render a multi-metric
// leaderboard or a slice dropdown.
//
// Both views are reconstructable from the warehouse parquet files; this
// script does the join once at build time so the runtime path is a flat
// O(1) lookup against the precomputed map.
//
// Output schema:
//   {
//     snapshot_id,                     // pinned for cache busting
//     generated_at,
//     evals: {
//       "<evaluation_id>": {
//         // Per-(model, metric) values across the eval's full
//         // leaderboard_metrics list. Drives the multi-metric matrix.
//         leaderboard_rows: [
//           {
//             model_route_id,
//             values: { "<column_key>": score | null },
//             verified: { "<column_key>": boolean },
//             comparability_status: { "<column_key>": "ok"|"mixed_scale"|"no_bounds" },
//             // Judge panel behind the cell's number, and the same
//             // (model, metric)'s other panels — the pivot has one row per
//             // model, so these ride the cell. Both omitted when the
//             // benchmark names no judge.
//             judge_condition: { "<column_key>": "<judge_condition JSON>" },
//             judge_alternates: {
//               "<column_key>": [{ judge_condition, score }]
//             }
//           }
//         ],
//         // Subtask-scope metric entries to *append* to the eval's
//         // leaderboard_metrics. Each carries column_key
//         // "<metric_id>::<slice_key>" so it slots into values{} above.
//         subtask_metrics: [BenchmarkLeaderboardMetric]
//       }
//     }
//   }
//
// Run via the build chain (`pnpm build`) or standalone:
//   node scripts/build-eval-matrices.mjs

import { DuckDBInstance } from "@duckdb/node-api"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

// DuckDB-node returns its list / struct / map values as opaque wrapper
// classes whose payload lives behind `.items` / `.entries`. Walk through
// these so downstream code can treat the result as plain JSON.
function normalizeDuck(value) {
  if (value == null) return value
  if (typeof value === "bigint") return Number(value)
  if (Array.isArray(value)) return value.map(normalizeDuck)
  if (typeof value === "object") {
    const ctor = value.constructor?.name ?? ""
    if (ctor === "DuckDBListValue" || ctor === "DuckDBArrayValue") {
      return (value.items ?? []).map(normalizeDuck)
    }
    if (ctor === "DuckDBStructValue") {
      return normalizeDuck(value.entries)
    }
    if (ctor === "DuckDBMapValue" && Array.isArray(value.entries)) {
      const out = {}
      for (const e of value.entries) out[String(e.key)] = normalizeDuck(e.value)
      return out
    }
    if (ctor === "DuckDBDecimalValue" && typeof value.toString === "function") {
      return Number(value.toString())
    }
    if (ctor.startsWith("DuckDB") && typeof value.toString === "function") {
      return value.toString()
    }
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = normalizeDuck(v)
    return out
  }
  return value
}

function readDuckRows(reader) {
  return reader.getRowObjects().map(normalizeDuck).map((row) => normalizeDuck(row))
}

// Deterministic pick among a cell's judge arms when the snapshot marks no
// headline: the widest panel wins (a mean of three judges is the reading a
// source presents as its own), then the canonical condition JSON ascending.
// On a snapshot WITH is_headline the query has already left exactly one arm
// standing, so this never fires.
export function judgeRank(condition) {
  if (!condition) return 0
  try {
    const parsed = JSON.parse(condition)
    return Array.isArray(parsed?.judges) ? parsed.judges.length : 0
  } catch {
    return 0
  }
}

export function winsJudgePick(previous, condition) {
  if (previous === undefined) return true
  const delta = judgeRank(condition) - judgeRank(previous)
  if (delta !== 0) return delta > 0
  return String(condition ?? "") < String(previous ?? "")
}

// The identity a cell's facts pool under. The producer aggregates on
// `model_aggregation_key` — the id a fold's members all share — so pooling
// on the raw `model_id` splits one cell into a cell per folded variant and
// then loses the ones whose id the view never carries. `model_id` is also
// NULL on facts whose model never resolved, where the aggregation key still
// holds the raw spelling.
export function factModelKeySql(alias, hasAggregationKey) {
  return hasAggregationKey
    ? `COALESCE(${alias}.model_aggregation_key, ${alias}.model_id)`
    : `${alias}.model_id`
}

// One score column pooled the producer's way: the MEDIAN of the first-party
// rows, falling back to the median of all rows (stage J `tri_agg`). A
// snapshot with no `evaluator_relationship` gets the plain median.
export function pooledMedianSql(column, { alias = "f", hasRelationship = true } = {}) {
  const col = `${alias}.${column}`
  const allRows = `MEDIAN(${col}) FILTER (WHERE ${col} IS NOT NULL)`
  if (!hasRelationship) return allRows
  return (
    `COALESCE(MEDIAN(${col}) FILTER (` +
    `WHERE ${alias}.evaluator_relationship = 'first_party' AND ${col} IS NOT NULL), ` +
    `${allRows})`
  )
}

// A cell's pooled score, by the producer's own rule, so a slice cell and
// the root cell above it are pooled identically. A flat AVG over the raw
// rows would report a number no source published on any cell holding more
// than one fact. Canonical and raw scales pool SEPARATELY (as stage J
// does) and the canonical value wins, so a cell is never a median taken
// across two scales.
export function pooledFactScoreSql({
  alias = "f",
  hasCanonical = true,
  hasRelationship = true,
} = {}) {
  const raw = pooledMedianSql("score", { alias, hasRelationship })
  if (!hasCanonical) return raw
  return `COALESCE(${pooledMedianSql("score_canonical", { alias, hasRelationship })}, ${raw})`
}

// Read a snapshot sidecar from whatever SNAPSHOT_URL points at. Node's
// `fetch` has no file: scheme, so a file:// snapshot (the documented local
// v2 loop) is read off disk — otherwise the read fails and the build writes
// an unpinned `snapshot_id: "unknown"`. Directory paths with no scheme are
// a disk read too; everything else is an HTTPS snapshot and goes over fetch.
export async function readSnapshotSidecar(base, name) {
  const url = `${base}/${name}`
  if (url.startsWith("file://")) return fs.readFile(fileURLToPath(url), "utf8")
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return fs.readFile(url, "utf8")
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.text()
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const WAREHOUSE = path.join(ROOT, ".cache/hf-data/warehouse/latest")
const OUT_PATH = path.join(ROOT, "data/eval-matrices.json")

async function main() {
  // Sanity check: the warehouse parquet files must exist locally.
  // `pnpm cache-hf-data` (legacy) or a manual download populates them; the
  // v2 build-time path streams them via duckdb's HTTPS reader, so when we
  // can't find them locally we point duckdb at SNAPSHOT_URL instead.
  const snapshotUrl = process.env.SNAPSHOT_URL?.replace(/\/+$/, "")
  let base = WAREHOUSE
  let useRemote = false
  try {
    await fs.access(path.join(WAREHOUSE, "eval_results_view.parquet"))
  } catch {
    if (!snapshotUrl) {
      console.error(
        "[build-eval-matrices] no local warehouse cache and no SNAPSHOT_URL — abort.",
      )
      process.exit(1)
    }
    base = snapshotUrl
    useRemote = true
  }

  const t0 = Date.now()
  const db = await DuckDBInstance.create()
  const con = await db.connect()

  const fileRef = (name) => {
    const url = useRemote ? `${base}/${name}` : path.join(base, name)
    return `'${url.replace(/'/g, "''")}'`
  }

  // Reading snapshot_id from snapshot_meta.json so the output can be
  // matched against the pinned build snapshot.
  let snapshotId = "unknown"
  try {
    const metaText = useRemote
      ? await readSnapshotSidecar(base, "snapshot_meta.json")
      : await fs.readFile(path.join(WAREHOUSE, "snapshot_meta.json"), "utf8")
    snapshotId = JSON.parse(metaText).snapshot_id ?? "unknown"
  } catch (err) {
    console.warn(
      `[build-eval-matrices] couldn't resolve snapshot_id: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // 1. All (eval, model, metric, score) rows. Includes non-primary
  //    metrics that getEvalSummaryById currently filters out.
  //    Exactly one row per (eval, model, metric): the model's headline
  //    reading where the snapshot marks one, and otherwise the pipeline's
  //    ranked-best row (position ranks on the canonical scale in the
  //    metric's direction; unranked rows — feedback arms, flagged
  //    scales — sort last). The verified flag and the comparability
  //    verdict ride the same chosen row, so a cell's value, checkmark and
  //    badge can't come from different observations. `score_canonical`
  //    puts every cell of a column on one scale; older snapshots without
  //    the column fall back to raw.
  const viewCols = new Set(
    readDuckRows(
      await con.runAndReadAll(
        `SELECT column_name FROM (DESCRIBE SELECT * FROM read_parquet(${fileRef("eval_results_view.parquet")}))`,
      ),
    ).map((r) => r.column_name),
  )
  const hasCanonical = viewCols.has("score_canonical")
  const hasPosition = viewCols.has("position")
  const viewHasHeadline = viewCols.has("is_headline")
  const viewHasStatus = viewCols.has("comparability_status")
  const viewHasJudge = viewCols.has("judge_condition")
  const metricRows = await con.runAndReadAll(`
    SELECT
      r.evaluation_id,
      r.metric_id,
      r.model_route_id,
      r.score,
      ${hasCanonical ? "r.score_canonical" : "NULL"} AS score_canonical,
      ${viewHasStatus ? "r.comparability_status" : "NULL"} AS comparability_status,
      ${viewHasJudge ? "r.judge_condition" : "NULL"} AS judge_condition,
      r.is_verified_evaluator
    FROM read_parquet(${fileRef("eval_results_view.parquet")}) r
    WHERE r.score IS NOT NULL
      AND r.model_route_id IS NOT NULL
      ${viewHasHeadline ? "AND r.is_headline" : ""}
    QUALIFY row_number() OVER (
      PARTITION BY r.evaluation_id, r.model_route_id, r.metric_id
      ORDER BY
        ${hasPosition ? "(r.position IS NULL), r.position," : ""}
        ${hasCanonical ? "r.score_canonical DESC NULLS LAST," : ""}
        r.score DESC,
        r.metric_summary_id
    ) = 1
    ORDER BY r.evaluation_id, r.model_route_id, r.metric_id
  `)

  // 1b. The judge readings the pick above left behind. The matrix is a
  //     pivot — one row per model — so a losing judge panel has no row of
  //     its own here the way it does on a single-metric leaderboard. These
  //     ride the cell instead, and without them a multi-metric page drops
  //     every alternate reading silently. One row per (eval, model, metric,
  //     panel); a snapshot with no headline or no judge axis has none.
  const judgeAlternateRows =
    viewHasHeadline && viewHasJudge
      ? await con.runAndReadAll(`
          SELECT
            r.evaluation_id,
            r.metric_id,
            r.model_route_id,
            r.judge_condition,
            ${hasCanonical ? "COALESCE(any_value(r.score_canonical), any_value(r.score))" : "any_value(r.score)"} AS score
          FROM read_parquet(${fileRef("eval_results_view.parquet")}) r
          WHERE r.score IS NOT NULL
            AND r.model_route_id IS NOT NULL
            AND r.judge_condition IS NOT NULL
            AND NOT r.is_headline
          GROUP BY 1,2,3,4
          ORDER BY 1,2,3,4
        `)
      : null

  // 2. Per-slice (composite_slug, benchmark, model, metric, slice_key,
  //    score) rows. The upstream pipeline parks slice scores in
  //    fact_results rather than threading them through eval_results_view,
  //    so we have to reach in here. We carry composite_slug because some
  //    benchmarks (e.g. `gpqa`) appear under multiple composites and
  //    fact_results emits a per-source pseudo-slice (slice_key =
  //    "artificial analysis", "llm stats", "openeval gpqa", ...) for
  //    each source family. Joining slices on (composite_slug,
  //    benchmark_id) keeps each composite's slices in its own lane,
  //    so HF Open LLM v2's GPQA doesn't inherit Artificial Analysis's
  //    pseudo-slice, etc. Also drop the self-rollup (slice_key ==
  //    benchmark_id) since that duplicates the eval's overall score.
  //    Facts pool the producer's way (see pooledFactScoreSql).
  const factCols = new Set(
    readDuckRows(
      await con.runAndReadAll(
        `SELECT column_name FROM (DESCRIBE SELECT * FROM read_parquet(${fileRef("fact_results.parquet")}))`,
      ),
    ).map((r) => r.column_name),
  )
  // `metric_key` is the EFFECTIVE metric identity (after the registry's
  // rename rules); `metric_id` is the pre-rename id and is not what the
  // view keys its columns on, so slice columns built from it would never
  // line up with their root metric. `score_canonical` puts a slice cell on
  // the same scale as the root cell above it.
  const factMetric = factCols.has("metric_key") ? "f.metric_key" : "f.metric_id"
  const factScore = pooledFactScoreSql({
    hasCanonical: factCols.has("score_canonical"),
    hasRelationship: factCols.has("evaluator_relationship"),
  })
  const factModelKey = factModelKeySql("f", factCols.has("model_aggregation_key"))
  const factHasJudge = factCols.has("judge_condition")
  const factHasStatus = factCols.has("comparability_status")
  const factHasHeadline = factCols.has("is_headline")
  if (!factHasHeadline) {
    console.warn(
      "[build-eval-matrices] fact_results has no is_headline column — slice cells fall back to " +
        "picking one judge condition per cell (highest judge cardinality first). " +
        "Rebake against a snapshot that carries the column for the producer's own pick.",
    )
  }
  const sliceRows = await con.runAndReadAll(`
    SELECT
      f.composite_slug,
      f.benchmark_id,
      f.parent_benchmark_id,
      ${factMetric} AS metric_id,
      f.slice_key,
      f.slice_name,
      ${factModelKey} AS model_key,
      ${factHasJudge ? "f.judge_condition" : "NULL"} AS judge_condition,
      ${factScore} AS score,
      ${factHasStatus ? "any_value(f.comparability_status)" : "NULL"} AS comparability_status,
      bool_or(f.is_verified_evaluator) AS is_verified_evaluator
    FROM read_parquet(${fileRef("fact_results.parquet")}) f
    WHERE f.score IS NOT NULL
      AND f.slice_key IS NOT NULL
      AND ${factMetric} IS NOT NULL
      AND f.composite_slug IS NOT NULL
      ${factHasHeadline ? "AND f.is_headline" : ""}
      -- Drop any slice that's a self-rollup of the eval — slice_key
      -- equals the benchmark, the composite, or the parent benchmark
      -- after normalising separators (so "global mmlu lite" filters
      -- against benchmark_id "global-mmlu-lite", "fibble_arena"
      -- against "fibble-arena", "artificial analysis" against
      -- composite "artificial-analysis-llms", etc.).
      AND regexp_replace(lower(f.slice_key), '[^a-z0-9]+', '', 'g')
          != regexp_replace(lower(f.benchmark_id), '[^a-z0-9]+', '', 'g')
      AND regexp_replace(lower(f.slice_key), '[^a-z0-9]+', '', 'g')
          != regexp_replace(lower(f.composite_slug), '[^a-z0-9]+', '', 'g')
      -- Also drop slices whose slug is a strict prefix of the
      -- composite_slug (e.g. "artificial analysis" vs
      -- composite "artificial-analysis-llms" — the slice is just
      -- the source family naming itself, not a real subtask).
      AND NOT regexp_replace(lower(f.composite_slug), '[^a-z0-9]+', '', 'g')
          LIKE regexp_replace(lower(f.slice_key), '[^a-z0-9]+', '', 'g') || '%'
      AND (
        f.parent_benchmark_id IS NULL
        OR regexp_replace(lower(f.slice_key), '[^a-z0-9]+', '', 'g')
           != regexp_replace(lower(f.parent_benchmark_id), '[^a-z0-9]+', '', 'g')
      )
    -- Grouping by judge_condition keeps a model's judge arms apart. Without
    -- it the pool mixes a headline reading with the individual judges'
    -- readings and reports a number no source ever published. On a
    -- snapshot that marks is_headline only one arm reaches here anyway.
    GROUP BY 1,2,3,4,5,6,7,8
    ORDER BY 1,2,3,4,5,6,7,8
  `)

  // 3. eval → (composite_slug, benchmark_id) mapping so we can join
  //    slice rows back to the right evaluation_id. composite_slug is
  //    what disambiguates HF Open LLM v2's GPQA from Artificial
  //    Analysis's GPQA — both share benchmark_id `gpqa`. Also pull
  //    leaderboard_metrics so we know each metric's metric_summary_id /
  //    unit / lower_is_better when synthesising subtask-scope entries.
  const evalRows = await con.runAndReadAll(`
    SELECT
      evaluation_id,
      benchmark_id,
      parent_benchmark_id,
      composite_slug,
      leaderboard_metrics
    FROM read_parquet(${fileRef("evals_view.parquet")})
  `)

  // 4. Map the producer's model AGGREGATION key → model_route_id so the
  //    per-slice rows (pooled on that key above) can land alongside the
  //    per-metric rows (model_route_id). `eval_results_view.model_key` IS
  //    that key: a fold's member ids are not what the view carries, so a
  //    lookup keyed on `model_id` finds no route for them and drops the
  //    cell. The model_id map stays as the fallback for snapshots
  //    predating `model_key`.
  const viewHasModelKey = viewCols.has("model_key")
  const modelKeyRows = await con.runAndReadAll(`
    SELECT
      ${viewHasModelKey ? "model_key" : "model_id"} AS model_key,
      model_id,
      min(model_route_id) AS model_route_id
    FROM read_parquet(${fileRef("eval_results_view.parquet")})
    WHERE model_route_id IS NOT NULL
    GROUP BY 1, 2
  `)

  await con.disconnectSync()

  // Index both maps so slice lookups are O(1). The smallest route id wins
  // a key served by several rows, so the build is order-independent.
  const modelKeyToRoute = new Map()
  const modelIdToRoute = new Map()
  const rememberRoute = (map, key, route) => {
    if (key == null || route == null) return
    const previous = map.get(key)
    if (previous === undefined || route < previous) map.set(key, route)
  }
  for (const row of modelKeyRows.getRowObjects().map(normalizeDuck)) {
    rememberRoute(modelKeyToRoute, row.model_key, row.model_route_id)
    rememberRoute(modelIdToRoute, row.model_id, row.model_route_id)
  }

  // Group eval rows by evaluation_id, indexed by (composite_slug,
  // benchmark_id) for the slice join. Two evals can share a benchmark_id
  // across composites (gpqa under both hfopenllm-v2 and
  // artificial-analysis-llms), so the composite_slug component is what
  // keeps them separated.
  const evalsByCompositeBench = new Map()
  const evalsById = new Map()
  const compositeBenchKey = (composite, bench) =>
    `${composite ?? ""}|${bench ?? ""}`
  for (const row of evalRows.getRowObjects().map(normalizeDuck)) {
    evalsById.set(row.evaluation_id, row)
    const bid = row.benchmark_id ?? null
    const composite = row.composite_slug ?? null
    if (bid && composite) {
      const key = compositeBenchKey(composite, bid)
      if (!evalsByCompositeBench.has(key)) evalsByCompositeBench.set(key, [])
      evalsByCompositeBench.get(key).push(row.evaluation_id)
    }
  }

  // Bucket metric rows by evaluation_id and within that by model.
  // out[evalId].rows[modelRoute].values = { column_key: score }
  const out = {}
  const ensureEval = (evalId) => {
    if (!out[evalId]) {
      out[evalId] = {
        leaderboard_rows: new Map(), // route_id → values
        subtask_metric_keys: new Set(), // tracks which subtask cols we've seen
        subtask_metrics: [],
      }
    }
    return out[evalId]
  }

  // modelEntry holds parallel maps keyed by column_key: `values` (score),
  // `verified` (the per-cell verified-evaluator flag),
  // `comparability_status` (the cell's comparability verdict, so a matrix
  // cell can render "not assessable" rather than a silence that reads as
  // "checked, nothing found"), `judge_condition` (the panel behind the cell's
  // number) and `judge_alternates` (the same model's other panels for that
  // metric, which the pivot has no row to show).
  const ensureModelEntry = (bucket, route) => {
    let modelEntry = bucket.leaderboard_rows.get(route)
    if (!modelEntry) {
      modelEntry = {
        values: {},
        verified: {},
        comparability_status: {},
        judge_condition: {},
        judge_alternates: {},
        judgePick: {},
      }
      bucket.leaderboard_rows.set(route, modelEntry)
    }
    return modelEntry
  }

  for (const row of metricRows.getRowObjects().map(normalizeDuck)) {
    const bucket = ensureEval(row.evaluation_id)
    const modelEntry = ensureModelEntry(bucket, row.model_route_id)
    modelEntry.values[row.metric_id] = Number(
      row.score_canonical != null ? row.score_canonical : row.score,
    )
    if (row.is_verified_evaluator != null) {
      modelEntry.verified[row.metric_id] = Boolean(row.is_verified_evaluator)
    }
    if (row.comparability_status != null) {
      modelEntry.comparability_status[row.metric_id] = String(row.comparability_status)
    }
    if (row.judge_condition != null) {
      modelEntry.judge_condition[row.metric_id] = String(row.judge_condition)
    }
  }

  for (const row of judgeAlternateRows?.getRowObjects().map(normalizeDuck) ?? []) {
    const bucket = out[row.evaluation_id]
    // Only cells the pivot actually renders: an alternate whose model or
    // metric never produced a headline cell has nothing to hang off.
    const modelEntry = bucket?.leaderboard_rows.get(row.model_route_id)
    if (!modelEntry || !(row.metric_id in modelEntry.values)) continue
    const score = Number(row.score)
    const list = (modelEntry.judge_alternates[row.metric_id] ??= [])
    list.push({
      judge_condition: String(row.judge_condition),
      score: Number.isFinite(score) ? score : null,
    })
  }


  // Plant slice scores. Each (metric_id, slice_key) becomes a column
  // keyed "<metric_id>::<slice_key>" so it slots into values{} alongside
  // root metrics. The matching subtask leaderboard metric metadata is
  // emitted in subtask_metrics for the runtime to splice into the eval's
  // leaderboard_metrics array.
  for (const row of sliceRows.getRowObjects().map(normalizeDuck)) {
    const evalIds = evalsByCompositeBench.get(
      compositeBenchKey(row.composite_slug, row.benchmark_id),
    )
    if (!evalIds) continue
    const route =
      modelKeyToRoute.get(row.model_key) ?? modelIdToRoute.get(row.model_key)
    if (!route) continue
    const sliceKey = String(row.slice_key)
    const sliceName = row.slice_name ? String(row.slice_name) : sliceKey
    const metricId = String(row.metric_id)
    const columnKey = `${metricId}::${sliceKey}`
    const score = Number(row.score)
    if (!Number.isFinite(score)) continue

    for (const evalId of evalIds) {
      const bucket = ensureEval(evalId)
      const modelEntry = ensureModelEntry(bucket, route)
      if (winsJudgePick(modelEntry.judgePick[columnKey], row.judge_condition ?? null)) {
        modelEntry.judgePick[columnKey] = row.judge_condition ?? null
        modelEntry.values[columnKey] = score
        if (row.judge_condition != null) {
          modelEntry.judge_condition[columnKey] = String(row.judge_condition)
        }
        if (row.is_verified_evaluator != null) {
          modelEntry.verified[columnKey] = Boolean(row.is_verified_evaluator)
        }
        if (row.comparability_status != null) {
          modelEntry.comparability_status[columnKey] = String(row.comparability_status)
        }
      }

      if (!bucket.subtask_metric_keys.has(columnKey)) {
        bucket.subtask_metric_keys.add(columnKey)
        // Look up the parent eval's metric metadata so the subtask-scope
        // entry inherits unit / lower_is_better. Fall back to defaults
        // when the registry doesn't carry the metric.
        const evalMeta = evalsById.get(evalId)
        const rootMetric = (evalMeta?.leaderboard_metrics ?? []).find(
          (m) => m.metric_id === metricId,
        )
        bucket.subtask_metrics.push({
          column_key: columnKey,
          metric_summary_id: rootMetric?.metric_summary_id ?? `${evalId}%3A${metricId}`,
          metric_id: metricId,
          metric_name: rootMetric?.metric_name ?? metricId,
          display_name: rootMetric?.display_name ?? metricId,
          canonical_display_name: rootMetric?.canonical_display_name ?? null,
          lower_is_better: rootMetric?.lower_is_better ?? false,
          unit: rootMetric?.unit ?? null,
          scope: "subtask",
          subtask_key: sliceKey,
          subtask_name: sliceName,
        })
      }
    }
  }

  // Materialise: convert internal Maps to JSON-friendly arrays. Drop
  // evals that ended up with a single root metric and no subtasks since
  // the runtime can already render those through the existing path.
  const finalEvals = {}
  for (const [evalId, bucket] of Object.entries(out)) {
    const rows = []
    for (const [routeId, entry] of bucket.leaderboard_rows) {
      rows.push({
        model_route_id: routeId,
        values: entry.values,
        verified: entry.verified,
        comparability_status: entry.comparability_status,
        // Judge maps are empty on all but a handful of benchmarks; omitting
        // them keeps the artifact the size it was everywhere else.
        ...(Object.keys(entry.judge_condition).length > 0
          ? { judge_condition: entry.judge_condition }
          : {}),
        ...(Object.keys(entry.judge_alternates).length > 0
          ? { judge_alternates: entry.judge_alternates }
          : {}),
      })
    }
    // Skip evals where every model has at most one metric and no
    // subtask data — adds no information beyond the existing summary.
    const hasMultiMetric = rows.some((r) => Object.keys(r.values).length > 1)
    if (!hasMultiMetric && bucket.subtask_metrics.length === 0) continue
    finalEvals[evalId] = {
      leaderboard_rows: rows,
      subtask_metrics: bucket.subtask_metrics,
    }
  }

  const payload = {
    snapshot_id: snapshotId,
    generated_at: new Date().toISOString(),
    evals: finalEvals,
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true })
  await fs.writeFile(OUT_PATH, JSON.stringify(payload))

  const sizeMb = (
    Buffer.byteLength(JSON.stringify(payload), "utf8") / 1024 / 1024
  ).toFixed(2)
  console.log(
    `[build-eval-matrices] wrote ${Object.keys(finalEvals).length} evals to ${path.relative(ROOT, OUT_PATH)} (${sizeMb} MB) in ${Date.now() - t0}ms`,
  )
}

// Only run the build when invoked as a script; importing the module (tests
// of the pure helpers above) must not touch the warehouse or the output file.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[build-eval-matrices] failed:", err)
    process.exit(1)
  })
}
