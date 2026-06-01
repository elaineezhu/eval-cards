# Merge cheatsheet: pulling `main` into `feat/use-new-backend-data`

> Drafted 2026-05-04, before pulling. Companion to `backend-v2-migration.md`
> (which is the design doc). This file is just a per-file conflict guide.
>
> Branch: `feat/use-new-backend-data` (2 commits ahead of `main`:
> `7635aee` Integrate with test backend data, `bfce8f2` Drop
> input/output_modalities from MODEL_CARD_COLUMNS).

## Triage at a glance

| File | Risk | Strategy |
|---|---|---|
| `lib/data-backend.ts` | **High** | Keep ours wholesale; re-port any new accessors main added |
| `lib/backend-artifacts.ts` | **High** | Keep our schema renames; reconcile any *new* main-side fields against producer output |
| `components/signals/corpus-dashboard.tsx` | **Med** | Keep main's UI structure; rewire data fields to v2 names |
| `components/signals/corpus-signals-strip.tsx` | **Med** | Same as above |
| `lib/hf-data.ts` | **Med** | Keep `useViewLayerBackend()` short-circuits at top of 5 fetchers |
| `Dockerfile` | **Med** | Keep our `DATA_BACKEND=v2` + `SNAPSHOT_URL` wiring; layer main's other changes on top |
| `lib/benchmark-schema.ts` | **Low** | Trivial 1-line addition (`num_few_shot?`) |
| `app/page.tsx` | **Low** | One-line copy change (`corpus-aggregates.json` → `headline.json`) |

New files (no conflict possible): `lib/view-data.ts`, `lib/duckdb.ts`,
`lib/sidecars.ts`, `tests/view-data.test.ts`,
`notes/backend-v2-migration.md`.

---

## `lib/data-backend.ts` — High

**What we did:** Replaced static re-exports from `lib/duckdb-data` with
a `BACKEND_VERSION` env-flag dispatcher. Each accessor now branches on
`useViewLayerBackend()` (true when `DATA_BACKEND=v2` or `stage-j`) and
lazy-imports either `@/lib/view-data` or `@/lib/duckdb-data`.
Manifest/hierarchy accessors branch between `@/lib/sidecars` and
`@/lib/hf-data`.

**Reconcile:**
- Conflict almost certain if main touched any export wiring here.
- **Keep our file as-is.** The dispatcher pattern is load-bearing.
- If main added a new accessor (e.g. `getFooBar`), add a new dispatcher
  function following the same pattern — only the legacy branch needs
  to be wired immediately; v2 branch can throw `Not implemented` until
  `lib/view-data.ts` adds it.

---

## `lib/backend-artifacts.ts` — High

**What we did:** Renamed corpus-block fields to match what the v2
producer emits:

| Block | v1 (main) | v2 (ours) |
|---|---|---|
| Completeness | `total_benchmarks`, `completeness_score_mean`, `completeness_score_median`, `per_field_population{}` | `total_triples`, `completeness_avg`, `completeness_min`, `completeness_max` |
| Provenance | `multi_source_groups`, `multi_source_rate`, `first_party_only_groups`, `first_party_only_rate`, `total_groups` | `multi_source_triples`, `first_party_only_triples`, `total_triples` (rates dropped — derived in components via local `rate()` helper) |
| Comparability | `variant_eligible_groups`, `variant_divergent_groups`, `variant_divergence_rate`, `cross_party_eligible_groups`, `cross_party_divergent_groups`, `cross_party_divergence_rate`, `total_groups` | `total_triples`, `variant_divergent_count`, `cross_party_divergent_count`, `groups_with_variant_check`, `groups_with_cross_party_check` |

Also added: `DeveloperListEntry` interface, optional
`developers/families/categories` arrays on `CorpusAggregates`,
optional `eval_hierarchy` key in `BackendManifest.summary_artifacts`.

**Reconcile:**
- Producer is the source of truth for v2 field names — do **not** add
  back v1 names to satisfy a main-side change. If main added a field
  the v2 producer doesn't emit, either drop it or check
  `eval_card_backend/notes/08-frontend-view-layer.md` first.
- Keep all three new optional sections on `CorpusAggregates`
  (developers, families, categories) — they back the new
  developer-list path.
- The `summary_artifacts.eval_hierarchy` key is additive; safe to keep
  alongside whatever main added there.

---

## `components/signals/corpus-dashboard.tsx` — Medium

**What we did:** Mechanical rewrite of every field reference in this
file to use the v2 names from `lib/backend-artifacts.ts` (above).
Removed the `per_field_population` per-field grid and replaced it with
a `min / avg / max` MiniMetric trio. Added a local `rate(num, denom)`
helper (returns null if either side is null/zero) since v2 stores
counts, not pre-computed rates. Title-cased `CATEGORY_ORDER`
(`"Agentic"`, `"General"`, …) and made the keys-to-render set extend
gracefully to unknown categories.

**Reconcile:**
- If main touched this file for design/UX reasons, **prefer main's
  visual structure** — but keep our field accessors. The recipe is:
  - Anywhere main reads `multi_source_rate`, replace with `rate(prov.multi_source_triples, prov.total_triples)`.
  - Anywhere main reads `completeness_score_mean`, replace with `comp.completeness_avg`.
  - Anywhere main reads `*_eligible_groups` / `*_divergent_groups`, swap to `groups_with_*_check` / `*_divergent_count`.
  - Drop any new code that reads `per_field_population` — gone in v2.
- Keep the local `rate()` helper at the bottom of the file.
- Category lookup must use the new title-cased keys (or stay tolerant
  via the `available` set logic we added).

---

## `components/signals/corpus-signals-strip.tsx` — Medium

**What we did:** Same field renames as above, same local `rate()`
helper added. Headline copy updated from "groups" → "triples" where
the underlying unit changed.

**Reconcile:** Apply the same recipe as `corpus-dashboard.tsx`. The
two files share field names and the `rate()` helper.

---

## `lib/hf-data.ts` — Medium

**What we did:** Added an early-return guard at the top of five
functions:
- `fetchBackendManifestStatus` — synthesizes a status from the v2 manifest sidecar
- `fetchBenchmarkMetadataMap` — delegates to `view-data.getBenchmarkMetadataMap`
- `fetchBackendManifest` — delegates to `sidecars.fetchManifest`
- `fetchEvalHierarchy` — delegates to `sidecars.fetchHierarchy` (still wraps in `adaptEvalHierarchy`)
- `fetchCorpusAggregates` — delegates to `sidecars.fetchHeadline`

Plus a module-level `useViewLayerBackend()` helper and a lazy
`fetchSnapshotSidecars()` importer near the top of the file.

**Reconcile:**
- These are all additive guards at the start of existing functions —
  conflicts are likely only if main re-shaped the same function
  bodies.
- Pattern: `if (useViewLayerBackend()) { return <v2 path> }` then fall
  through to the existing v1 implementation untouched.
- If main renamed one of these functions, port the guard into the
  renamed version. Don't drop the guard.

---

## `Dockerfile` — Medium

**What we did:**
- Default `ARG DATA_BACKEND` flipped from `duckdb` → `v2` in **both**
  stages (builder and runner).
- Added `ARG SNAPSHOT_URL` + `ENV SNAPSHOT_URL` in both stages,
  defaulting to a pinned `evaleval/eval-cards-data` warehouse path.
- Comment block rewritten to reflect v2 + legacy coexistence.
- Kept legacy `LOCAL_PIPELINE_OUTPUT`, `HF_DATA_LOCAL_DIR`,
  `HF_DATA_OFFLINE=1` envs intact (legacy backend still compilable).

**Uncommitted tweak (working tree):** `SNAPSHOT_URL` default points at
`j-chim/temp_evalcard_backend` instead of `evaleval/eval-cards-data` —
this is the dev/test dataset for the temp HF Space deploy. Do **not**
commit this override; revert before merging to main, or keep it only
on local working copy.

**Reconcile:**
- Keep our `DATA_BACKEND=v2` default and `SNAPSHOT_URL` plumbing.
- Layer main's non-data changes (base image bumps, `pnpm` version,
  build commands) on top.

---

## `lib/benchmark-schema.ts` — Low

**What we did:** Added one optional field, `num_few_shot?: number`, on
`GenerationConfig`. That's it.

**Reconcile:** Trivially additive. Keep our line; merge tool should
handle it cleanly unless main touched the same struct.

---

## `app/page.tsx` — Low

**What we did:** One-line copy change in the empty-state banner —
`corpus-aggregates.json` → `headline.json` (the v2 sidecar name).

**Reconcile:** Trivial. Keep ours.

---

## Order of operations after `git pull`

1. Resolve `lib/backend-artifacts.ts` first — it's the schema source
   of truth that the components depend on.
2. Resolve `lib/data-backend.ts` and `lib/hf-data.ts` — backend wiring.
3. Resolve the two `components/signals/*` files using the rename recipe.
4. Resolve `Dockerfile` — keep our v2 envs.
5. `app/page.tsx` and `lib/benchmark-schema.ts` — should auto-merge or
   be trivial.
6. Run `pnpm tsc --noEmit` (or whatever the project's typecheck is) to
   catch any v1 field references main introduced that didn't conflict
   textually but break against our renamed types.
7. Run `pnpm test` — `tests/view-data.test.ts` and
   `tests/duckdb-data.test.ts` should both still pass.
8. Smoke test with `DATA_BACKEND=v2 SNAPSHOT_URL=file://…` and again
   without (legacy path) — both must render.
