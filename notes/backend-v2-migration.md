# Frontend migration to backend v2 (Stage J view layer)

> **Status:** spec, drafted 2026-05-03 against `eval_card_backend`'s
> Stage J view-layer contract.
>
> **Sources:**
> - Backend spec (the contract this consumes):
>   `../eval_card_backend/notes/08-frontend-view-layer.md`
> - Canonical schema (audit/debug only; not in hot path):
>   `../eval_card_backend/notes/01-schema-from-frontend.md`

---

## Context

The legacy producer (`eval_cards_backend_pipeline`) emitted ten
parquets where each row carried a `payload_json` VARCHAR with the
post-TS-adapter shape baked in. The frontend's "DuckDB backend"
(`lib/duckdb-data.ts`) read these blobs and `JSON.parse`d them — column
projection, filter pushdown, and type contracts were all forfeited.

The new producer (`eval_card_backend`) emits a typed view layer over
its canonical normalised tables. Three Parquet files cover every page
shape, three small JSON sidecars cover corpus-level scalars and the
hierarchy tree. Column names match the frontend's TS interfaces
field-for-field, so the row→object cast is a typed spread for most
accessors. Two interfaces (`ModelResultForBenchmark` and the
`evaluations_by_category` body of `ModelEvaluationSummary`) require a
small mechanical reshape over the row, since one nests fields that the
view stores flat — see the per-accessor sections below. No
HF-record-to-display adapter logic survives.

This document specifies what changes in `general-eval-card` once
backend v2 is faithfully implemented. **The visual frontend, page
renderers, and TS interface shapes do not change.** Only the I/O
boundary moves.

---

## What changes (overview)

| layer | before (v1) | after (v2) |
|---|---|---|
| Distribution | `LOCAL_PIPELINE_OUTPUT` env var pointing at a producer output dir; `duckdb/v1/` subpath; implicit "warehouse/latest/" coupling | `SNAPSHOT_URL` env var (file:// or HF dataset URL); one snapshot pinned per deploy |
| Storage shape | 10 parquets each with one `payload_json` column | 3 typed-column view parquets + 3 JSON sidecars |
| Read pattern | `SELECT payload_json FROM read_parquet(?) WHERE id = ?`, then `JSON.parse` | `SELECT col1, col2, ... FROM <view> WHERE id = ?`, typed row spread |
| List vs detail | Separate `*_lite.parquet` files | Column projection on the same parquet |
| Suite/aggregate dispatch | Eval id prefix (`aggregate__`, `matrix__`) → different parquet | `is_summary_score` flag + `parent_benchmark_id` on `evals_view` |
| Slug rule | Custom `replace('/', '__')` escapes; per-page slug helpers | Producer-owned RFC 3986 percent-encoded `route_id` / `evaluation_id` / `metric_summary_id`; frontend decodes only on `<Link>` href |
| Corpus aggregates | `corpus-aggregates.json` over HF JSON loader | `headline.json` sidecar in the snapshot dir |
| Hierarchy | Synthesised in the producer's `eval_hierarchy` JSON | `hierarchy.json` sidecar |
| Backend manifest | `manifest.json` fetched from upstream HF dataset root via `lib/hf-data.ts` | `manifest.json` sidecar inside the snapshot dir, read via `SNAPSHOT_URL` |

The TS interfaces (`EvaluationCardData`, `BenchmarkEvalSummary`,
`ModelEvaluationSummary`, `ModelResultForBenchmark`, `CorpusAggregates`,
`EvalHierarchy`, `BackendManifest`) stay as-is — the producer agreed to
emit columns under those exact names.

---

## What does not change

- All page components under `app/`. The renderer trees are unchanged.
- TS interface declarations in `lib/benchmark-schema.ts`,
  `lib/eval-processing.ts`, `lib/backend-artifacts.ts`. These are now
  the contract surface — column names match field names by agreement
  with the producer.
- Component files under `components/`.
- `lib/glossary.ts`, `lib/known-issues.ts`, `lib/utils.ts`,
  `lib/na-utils.ts` — these are pure presentation helpers.
- `app/api/*/route.ts` handlers stay as thin pass-throughs to
  `lib/data-backend.ts`.

---

## Distribution: `SNAPSHOT_URL`

Frontend reads `SNAPSHOT_URL` from env at process start. One deploy =
one snapshot. The URL points at a directory containing the six
artifacts the frontend reads:

```
$SNAPSHOT_URL/
├── models_view.parquet
├── evals_view.parquet
├── eval_results_view.parquet
├── headline.json
├── hierarchy.json
└── manifest.json
```

Examples:

- Local dev: `SNAPSHOT_URL=file:///path/to/eval_card_backend/warehouse/2026-05-03T15-48-59Z`
- Production (pinned snapshot): `SNAPSHOT_URL=https://huggingface.co/datasets/evaleval/eval-cards-data/resolve/<rev>/warehouse/<snapshot_id>`
- Production (rolling): `SNAPSHOT_URL=https://huggingface.co/datasets/evaleval/eval-cards-data/resolve/main/warehouse/latest`

`LOCAL_PIPELINE_OUTPUT` is removed. The `duckdb/v1/` subpath is
removed. The producer maintains a `warehouse/latest/` alias that
points at the most recent snapshot, so deploys can pin either to a
timestamped snapshot (immutable, redeploy required to roll forward)
or to `latest` (auto-rolls forward on the next Space rebuild). Within
a running process the snapshot is still effectively constant — sidecar
caches in `lib/sidecars.ts` are first-write-wins per process.

---

## DuckDB connection lifecycle

`lib/duckdb.ts` (new file; replaces the connection-management portion
of `lib/duckdb-data.ts`):

```ts
import "server-only"
import { DuckDBConnection } from "@duckdb/node-api"

let connectionPromise: Promise<DuckDBConnection> | null = null

const SNAPSHOT_URL = process.env.SNAPSHOT_URL
if (!SNAPSHOT_URL) {
  throw new Error("SNAPSHOT_URL must be set; see notes/backend-v2-migration.md")
}

const VIEWS = {
  models_view:       `${SNAPSHOT_URL}/models_view.parquet`,
  evals_view:        `${SNAPSHOT_URL}/evals_view.parquet`,
  eval_results_view: `${SNAPSHOT_URL}/eval_results_view.parquet`,
} as const

export async function getConnection(): Promise<DuckDBConnection> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const conn = await DuckDBConnection.create()
      // httpfs is built into duckdb-node-api; no INSTALL needed.
      // Register each parquet as a view so callers write `FROM models_view`,
      // not the full URL.
      for (const [name, path] of Object.entries(VIEWS)) {
        await conn.run(
          `CREATE OR REPLACE VIEW ${name} AS SELECT * FROM read_parquet(?)`,
          [path]
        )
      }
      return conn
    })()
  }
  return connectionPromise
}
```

One connection per Node process. Views are registered once at
startup; subsequent queries write `FROM models_view` rather than
re-passing the parquet URL. DuckDB's column projection means the cost
of `SELECT route_id, model_name FROM models_view` is independent of
how wide `models_view` is.

---

## Per-accessor mapping

`lib/data-backend.ts` keeps its current export names. `lib/duckdb-data.ts`
gets gutted; each function becomes a thin typed `SELECT`. The mapping
below uses the column names spec'd in
`../eval_card_backend/notes/08-frontend-view-layer.md` — the row
returned by DuckDB casts directly to the TS interface.

### Models

```ts
// getModelCards / getModelCardsLite — list pages
export async function getModelCards(): Promise<EvaluationCardData[]> {
  const conn = await getConnection()
  const reader = await conn.runAndReadAll(`
    SELECT id, route_id, model_name, model_id, canonical_model_name, developer,
           evaluations_count, benchmarks_count, variant_count,
           categories, category_stats, latest_timestamp,
           evaluator_count, evaluator_names, source_type_count, source_types,
           evidence_count, missing_generation_config_count,
           third_party_eval_count, independent_verification_ratio,
           reproducibility_status, eval_libraries, latest_source_name,
           params_billions, benchmark_names, score_summary,
           reproducibility_summary, provenance_summary, comparability_summary,
           top_scores, source_urls, detail_urls,
           model_url, release_date, input_modalities, output_modalities,
           architecture, params, inference_engine, inference_platform
    FROM models_view
    ORDER BY latest_timestamp DESC
  `)
  return reader.getRowObjects() as EvaluationCardData[]
}

// "Lite" is just narrower projection — same parquet, fewer columns.
export async function getModelCardsLite(): Promise<EvaluationCardData[]> {
  const conn = await getConnection()
  const reader = await conn.runAndReadAll(`
    SELECT id, route_id, model_name, model_id, developer,
           evaluations_count, benchmarks_count, categories,
           latest_timestamp, third_party_eval_count,
           independent_verification_ratio, reproducibility_status,
           latest_source_name, params_billions
    FROM models_view
    ORDER BY benchmarks_count DESC, evaluations_count DESC, model_name ASC
  `)
  return reader.getRowObjects() as EvaluationCardData[]
}

// getModelSummaryById — detail page.
//
// The row carries the metadata shell (variants[], categories,
// category_stats, signal summaries, model_family_id, raw_model_ids,
// total_evaluations, last_updated). The full `ModelEvaluationSummary`
// also requires `evaluations_by_category: Record<CategoryType,
// BenchmarkEvaluation[]>`, which is a heavyweight per-cell breakdown —
// produced by a separate join over `eval_results_view`, see
// `getModelEvaluationCells` below.
//
// Returning a `ModelSummaryShell` (Omit-ed type, defined alongside the
// existing TS interface) makes the contract explicit and stops the cast
// from lying. The model-detail page composes the full
// `ModelEvaluationSummary` from `shell` + `cells`.
export type ModelSummaryShell = Omit<
  ModelEvaluationSummary,
  "evaluations_by_category"
>

export async function getModelSummaryById(routeId: string): Promise<ModelSummaryShell | null> {
  const conn = await getConnection()
  const reader = await conn.runAndReadAll(
    `SELECT * FROM models_view WHERE route_id = ? OR model_family_id = ? LIMIT 1`,
    [routeId, routeId]
  )
  const rows = reader.getRowObjects()
  if (rows.length === 0) return null
  return rows[0] as unknown as ModelSummaryShell
}

// Per-cell reshape helper. `eval_results_view` rows carry the per-cell
// fields scattered (model_info, score_details, evaluation_timestamp,
// source_metadata, source_data, metric_*, etc.) rather than under a
// nested `result: EvaluationResult` STRUCT. Reshape into the
// `ModelResultForBenchmark` shape the leaderboard / model-detail
// renderers expect. Single helper; reused by getEvalSummaryById and
// getModelEvaluationCells. No HF-record-to-display logic survives.
function reshapeCellToModelResult(row: Record<string, any>): ModelResultForBenchmark {
  return {
    model_info:           row.model_info,
    model_route_id:       row.model_route_id,
    score:                row.score,
    score_details:        row.score_details,
    evaluation_timestamp: row.evaluation_timestamp,
    source_metadata:      row.source_metadata,
    source_data:          row.source_data,
    source_record_url:    row.source_record_url,
    aggregate_components: row.aggregate_components,
    result: {
      evaluation_name:      row.metric_display_name,
      metric_summary_id:    row.metric_summary_id,
      metric_key:           row.metric_id,
      evaluation_timestamp: row.evaluation_timestamp,
      metric_config:        { lower_is_better: row.lower_is_better, unit: row.metric_unit, /* …denormalised meta… */ },
      score_details:        row.score_details,
      evalcards:            row.evalcards_annotations ? { annotations: row.evalcards_annotations } : undefined,
    },
  }
}

// Helper for the model-detail page's evaluations_by_category body.
// The page groups by `category` in TS after this returns.
export async function getModelEvaluationCells(modelId: string): Promise<ModelResultForBenchmark[]> {
  const conn = await getConnection()
  const reader = await conn.runAndReadAll(
    `SELECT * FROM eval_results_view WHERE model_id = ? ORDER BY category, percentile DESC`,
    [modelId]
  )
  return reader.getRowObjects().map(reshapeCellToModelResult)
}
```

### Evals

```ts
// getEvalListData / getEvalListLiteData — list pages
export async function getEvalListData(): Promise<{
  evals: BenchmarkEvalListItem[]
  totalModels: number
}> {
  const conn = await getConnection()
  const [evalsReader, modelsReader] = await Promise.all([
    conn.runAndReadAll(`
      SELECT evaluation_id, evaluation_name, canonical_display_name,
             composite_benchmark_key, composite_benchmark_name,
             benchmark_family_key, benchmark_leaf_key, category,
             metric_config, models_count, evaluator_names, source_types,
             latest_source_name, third_party_ratio,
             missing_generation_config_count, best_model, worst_model,
             avg_score, avg_score_norm, has_card,
             is_aggregated, aggregate_sources, tags,
             metrics_count, metric_names, instance_data, top_score,
             subtasks_count, is_summary_score, summary_eval_ids,
             root_metrics, subtasks, leaderboard_metrics,
             reproducibility_summary, provenance_summary, comparability_summary,
             source_data
      FROM evals_view
      ORDER BY evaluation_name ASC
    `),
    conn.runAndReadAll(`SELECT COUNT(*) AS n FROM models_view`),
  ])
  return {
    evals: evalsReader.getRowObjects() as BenchmarkEvalListItem[],
    totalModels: Number(modelsReader.getRowObjects()[0].n),
  }
}

// getEvalSummaryById — detail page.
//
// No more aggregate__/matrix__ id-prefix dispatch — `evals_view` is the
// single source for all eval shapes. Suite-vs-leaf is a column
// (`is_summary_score`, `is_aggregated`) on the same parquet.
//
// `model_results[]` rows go through the same reshape helper as
// `getModelEvaluationCells` (defined below) — they share the
// ModelResultForBenchmark target shape, so the eval/metric/cell
// → BenchmarkEvaluation reshape is one helper, two callers.
export async function getEvalSummaryById(evalId: string): Promise<BenchmarkEvalSummary | null> {
  const conn = await getConnection()
  const [evalReader, cellsReader] = await Promise.all([
    conn.runAndReadAll(
      `SELECT * FROM evals_view WHERE evaluation_id = ? LIMIT 1`,
      [evalId]
    ),
    conn.runAndReadAll(
      `SELECT * FROM eval_results_view
       WHERE evaluation_id = ?
         AND metric_id     = (SELECT primary_metric_id FROM evals_view WHERE evaluation_id = ?)
       ORDER BY position ASC`,
      [evalId, evalId]
    ),
  ])
  const evalRows = evalReader.getRowObjects()
  if (evalRows.length === 0) return null
  return {
    ...(evalRows[0] as Omit<BenchmarkEvalSummary, "model_results">),
    model_results: cellsReader.getRowObjects().map(reshapeCellToModelResult),
  } as BenchmarkEvalSummary
}
```

### Developers

```ts
// getDeveloperList — list page; reads from headline.json (precomputed,
// including producer-owned route_id, model/benchmark/evaluation counts,
// and popular_evals). DeveloperListEntry is satisfied directly by the
// headline entry shape.
export async function getDeveloperList(): Promise<DeveloperListEntry[]> {
  const headline = await fetchHeadline()
  return headline.developers as DeveloperListEntry[]
}

// getDeveloperSummaryById — detail page; reads models_view filtered by developer.
// The route_id on headline.developers[] is the canonical lookup key — we don't
// re-derive `developer` from the URL slug, since percent-decoding may not
// round-trip exactly to the producer's source string.
export async function getDeveloperSummaryById(routeId: string) {
  const headline = await fetchHeadline()
  const headlineEntry = headline.developers.find((d) => d.route_id === routeId)
  if (!headlineEntry) return null
  const conn = await getConnection()
  const reader = await conn.runAndReadAll(
    `SELECT * FROM models_view WHERE developer = ?`,
    [headlineEntry.developer]
  )
  const models = reader.getRowObjects() as EvaluationCardData[]
  return { ...headlineEntry, models }
}
```

### Dashboard convenience accessor

```ts
// Was: { models, evals } over both legacy parquets; same shape, new sources.
export async function getDashboardData() {
  const [models, evalListData] = await Promise.all([
    getModelCards(),
    getEvalListData(),
  ])
  return { models, evals: evalListData.evals }
}
```

---

## Sidecar fetchers (replace `lib/hf-data.ts` corpus calls)

Three small JSON files live in the snapshot dir alongside the
parquets. New module `lib/sidecars.ts` exposes typed fetchers.
`lib/hf-data.ts`'s `fetchCorpusAggregates`, `fetchEvalHierarchy`,
`fetchBackendManifest`, and `fetchBackendManifestStatus` get their
implementations replaced — same export names, new sources.

```ts
// lib/sidecars.ts
import "server-only"
import type {
  CorpusAggregates,
  EvalHierarchy,
  BackendManifest,
} from "@/lib/backend-artifacts"

const SNAPSHOT_URL = process.env.SNAPSHOT_URL!

let cache: {
  manifest?: Promise<BackendManifest>
  headline?: Promise<CorpusAggregates>
  hierarchy?: Promise<EvalHierarchy>
} = {}

async function fetchJson<T>(name: string): Promise<T> {
  const url = `${SNAPSHOT_URL}/${name}`
  const res = url.startsWith("file://")
    ? await import("fs/promises").then((fs) => fs.readFile(new URL(url), "utf8"))
    : await fetch(url, { next: { revalidate: 3600 } }).then((r) => r.text())
  return JSON.parse(typeof res === "string" ? res : res.toString()) as T
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
```

Then in `lib/hf-data.ts`:

```ts
// fetchBackendManifest: was a fetchHFJsonSafe call; now reads the snapshot sidecar.
export const fetchBackendManifest = fetchManifest
export const fetchCorpusAggregates = fetchHeadline
export const fetchEvalHierarchy = fetchHierarchy

// fetchBackendManifestStatus: simplified — single snapshot pin, no "latest" comparison.
export async function fetchBackendManifestStatus(): Promise<BackendManifestStatus> {
  const m = await fetchManifest()
  return {
    currentManifest: m,
    latestManifest: m,                          // no separate "latest" — snapshot is pinned
    currentManifestSignature: m.generated_at,
    latestManifestSignature: m.generated_at,
    updateAvailable: false,
    refreshing: false,
    pendingRefreshCount: 0,
  }
}
```

---

## What deletes

After v2 is live, the following code is dead and can be removed in a
follow-up cleanup:

- `lib/duckdb-data.ts` — replaced by typed SELECTs split between
  `lib/duckdb.ts` (connection) and `lib/data-backend.ts` (queries).
- The `payload_json` parser helpers (`parsePayload`, `readPayloads`,
  `readPayloadById`, `assertDeveloperListShape`) — no JSON blobs to
  parse.
- The `aggregate__` / `matrix__` eval-id prefix dispatch in
  `getEvalSummaryByIdFromDuckDB` — the typed view is the only path.
- `lib/model-data.ts` — most of its functions exist to convert HF
  JSON records into `BenchmarkEvaluation` / `EvaluationCardData`. Once
  the producer emits those shapes directly, the adapter logic deletes.
  Keep only the helpers that don't touch HF records (slug parsing,
  display formatters).
- `lib/eval-processing.ts` — the `groupEvaluationsByModel`,
  `createModelSummary`, `createBenchmarkEvalSummary`, and
  `inferCategoryFromBenchmark` adapter functions are no longer called
  in the data path. The exported types stay.
- `scripts/audit-adapters.mjs`, `scripts/dump-adapter-outputs.mts`,
  `scripts/compare-data-backends.mjs`, `scripts/refresh-fixtures.mjs`,
  `scripts/cache-hf-data.mjs` — adapter / parity-check tooling for the
  legacy pipeline. Delete once v1 is retired.
- `data/models/`, `data/developers/`, `data/benchmarks.json`,
  `data/models.json`, `data/developers.json` — bundled snapshots of
  v1 output for fixture tests. Replace with v2 fixtures if needed.
- `LOCAL_PIPELINE_OUTPUT` env var, `duckdb/v1/` subpath conventions,
  and the parity-emitter expectations documented in
  `lib/duckdb-data.ts`'s preamble.
- `inferCategoryFromBenchmark` regex chain in
  `lib/benchmark-schema.ts` — producer is the source of truth for
  category. Keep the `EVALUATION_CATEGORIES` const + `CategoryType`
  type; delete the inference function and `BENCHMARK_PRIORITY_RULES`.

---

## Slug rule

Producer emits all URL-bearing identifiers in
RFC 3986 percent-encoded form (`route_id`, `evaluation_id`,
`metric_summary_id`). Frontend treats them as opaque except for
`<Link>` href construction:

```tsx
// Old: href={`/models/${model.route_id}`}  // route_id was already escaped via __ rule
// New: href={`/models/${model.route_id}`}  // same code; route_id is now percent-encoded
```

Decode happens inside the route handler when looking up by slug:

```ts
// app/models/[id]/page.tsx
export default async function ModelDetailPage({ params }: { params: { id: string } }) {
  const summary = await getModelSummaryById(params.id)  // pass encoded form straight through
  ...
}
```

`getModelSummaryById` looks up by `route_id = ?` directly without
decoding — the producer's `route_id` column matches the URL path
segment byte-for-byte. The legacy `replace('/', '__')` and
`replace(/\//g, ...)` helpers in `lib/utils.ts` and `lib/model-family.ts`
become dead code; remove them in the cleanup pass.

---

## Migration strategy

A feature flag gates v1 vs v2 during the transition:

```ts
// lib/data-backend.ts
const BACKEND_VERSION = process.env.DATA_BACKEND ?? "v1"

export const getModelCards =
  BACKEND_VERSION === "v2"
    ? (await import("@/lib/duckdb")).getModelCards
    : (await import("@/lib/duckdb-data")).getModelCardsFromDuckDB
// ... same pattern for other accessors
```

Phase plan:

1. **Producer ships Stage J.** `eval_card_backend` emits the six
   v2 artifacts in `warehouse/<snapshot_id>/`. Existing canonical
   parquets stay alongside.
2. **Frontend lands `lib/duckdb.ts` + `lib/sidecars.ts`** behind the
   `DATA_BACKEND=v2` flag. CI builds both backends; default stays v1.
3. **Smoke test in dev with `DATA_BACKEND=v2`,
   `SNAPSHOT_URL=file://...`.** Verify each page renders identical
   bytes (modulo source-of-data labels). Where they diverge, file
   producer issues — do not patch the frontend to paper over.
4. **Flip the production default to v2.** Keep v1 path compilable but
   unreachable. Monitor for a release.
5. **Delete v1 path** (the "What deletes" list above).

The flag is intentionally process-wide, not per-accessor. Mixing
backends within one render produces inconsistent snapshots.

---

## What doesn't move

- **Instance-level data fetching** (`fetchInstanceLevelData` in
  `lib/hf-data.ts`). Instance JSONL is referenced by URL in
  `eval_results_view.instance_file_path`; the lazy-load stays. Pointer
  shape on the row is unchanged from v1.
- **Benchmark card metadata** lives inside `evals_view.benchmark_card`
  STRUCT now, not a separate `benchmark_card_*.json` per file. The
  page reads it from the eval row directly. Adapter-style readers
  (`fetchBenchmarkMetadataMap`) become a `SELECT benchmark_id, benchmark_card
  FROM evals_view` aggregation if anything still calls them — most
  callers should fold into `getEvalSummaryById`.
- **EvalCards annotations** (`evalcards.annotations`) live on
  `eval_results_view.evalcards_annotations` per-row. The eval-detail
  page reads them inline; no separate fetcher.

---

## Open questions / risks

- **httpfs cold-start latency.** First query against an HF-hosted
  parquet pays a round trip per file. Mitigate by pre-registering all
  three views at process start (above), so the first user query hits
  warm metadata. Measure on the production HF Space; if too slow,
  consider downloading the snapshot to local disk at container start
  (~MB per snapshot).
- **Connection lifetime in serverless.** Vercel's serverless
  runtime tears down the Node process per request; the
  `connectionPromise` cache doesn't help. The HF Space deployment
  (Docker, long-lived) is unaffected. If we ever target serverless,
  switch to `duckdb-wasm` in the browser or a separate serving
  process.
- **`aggregate_components[]` on `eval_results_view`.** This array is
  the per-suite-component breakdown for rollup rows. For non-rollup
  rows it's always empty. If suite rollups grow common, the storage
  cost of trailing-empty arrays is non-trivial; consider splitting
  into a dedicated parquet at that point.
- **Category drift.** Producer's `category_mapping.json` will lag real
  benchmark tag changes. The mapping is producer-owned, so the
  frontend can't patch around drift — this is a feature, not a bug,
  but it requires operator discipline. Surface "uncategorised
  benchmark count" in the producer's run summary and the home-page
  manifest banner.
- **Type widening for `score_summary` etc.** The producer emits these
  as DuckDB STRUCTs; the TS interface declares them as nested
  `{ count, min, max, average }`. `runAndReadAll` returns nested
  STRUCTs as plain JS objects, so the cast works — but if duckdb-node
  changes its STRUCT serialisation, audit the `as` casts here. Add a
  dev-only validator that runs `EvaluationCardData`'s shape check at
  the row level on the first `getModelCards()` call after process
  start.

## model-resolution-rework — view-layer contract additions

This is the producer↔frontend column contract for the model-resolution
rework (proposal §10.5, contract surface 3). The frontend interface field
names below MUST match the producer `models_view` / `eval_results_view`
column names exactly. All fields are **additive and nullable** — the
frontend conditionally renders them and falls back gracefully when null,
so producer and frontend can roll out independently.

### New columns the frontend reads

| view column | frontend field | interface | meaning |
| --- | --- | --- | --- |
| `inference_platform` | `inference_platform` | `ModelInfo`, `EvaluationCardData` | FK to `inference_platforms.id`; "served by" provenance. Already present pre-rework; now populated by the resolver output. |
| `model_family_id` | `model_family_id` | `EvaluationCardData`, `ModelEvaluationSummary`, `ModelResultForBenchmark`, `BenchmarkLeaderboardRow` | family canonical id (grouping root). Replaces the deleted client-side family computation (`lib/model-family.ts`). Routing fallback when `model_route_id` is absent. |
| `lineage_origin_model_id` | `lineage_origin_model_id` | `EvaluationCardData`, `ModelSummaryCore` | deepest non-variant ancestor (base model for finetunes/merges/quants). Surfaced as "Base model" on the model detail page. |
| `resolution_source` | `resolution_source` | `EvaluationCardData`, `ModelSummaryCore` | enum `hf \| models_dev \| curated \| inferred \| none`. Surfaced as "Resolved via". |
| `resolution_granularity` | `resolution_granularity` | `EvaluationCardData`, `ModelSummaryCore` | enum `variant \| group \| family`. Surfaced as "Granularity". |

These read off `SELECT *`-backed accessors (`getModelSummaryById`) and the
per-cell reshape, so they flow through automatically once the producer view
emits them. The explicit `MODEL_CARD_COLUMNS` projection in
`lib/view-data.ts` is intentionally NOT extended with the three pure-display
fields until the producer view layer ships them (an explicit SELECT of a
non-existent column errors). Add them to that projection in lockstep with the
producer change.

### Renames the frontend does NOT read (cosmetic)

`root_model_id → model_group_id` and `lineage_origin_org_id →
lineage_origin_model_org_id` are renamed in the registry/producer data layer.
The frontend view-layer interfaces never read either name (verified by grep;
the only `root_model_id` reference is in the redirect *generator*, which reads
the registry `baseline_resolution.json`, not the view layer). No frontend
change is required for these renames.

### `canonical_id` flip + URL redirects (breaking, data)

Post-flip, `canonical_id` is the **leaf**; ~297 model URLs change (204 flips +
93 casing re-keys). Old bookmarked URLs are 301-redirected by `middleware.ts`
using the generated `lib/model-url-redirects.ts` map. The map is regenerated
from the registry `baseline_resolution.json` via
`scripts/generate-model-redirects.ts`. **The committed map is PROVISIONAL** —
built from the pre-final spec-dir baseline — and MUST be regenerated from the
post-M9 baseline at integration. The redirect preserves query params and the
ids round-trip through percent-encoding (RFC 3986, `/ → %2F`), matching the
producer `route_id` form.
