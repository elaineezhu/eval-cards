# Testing strategy for the TS→pipeline migration

Drafted 2026-04-27. The motivation is the 2026-04-27 review session: subagent audits caught two regressions the parity harness missed (a 22% category change and a `coding: "Reasoning"` mistake based on a substring fallacy). Both required full-production-cache analysis to surface. Subagent audits are not a sustainable workflow.

## Design principle: separate code drift from upstream drift

Upstream data (the published `evaleval/card_backend` HF dataset) is our best guess at a source of truth, but it isn't immutable. Pipeline-side relabeling, registry updates, and schema changes happen. If our regression tests run against live data, every upstream update lights up the test suite and we can't tell "I broke something" from "upstream changed something I happen to consume."

The fix: **pin tests to a committed snapshot of upstream data**. Refresh the snapshot deliberately (script + commit), and the snapshot diff + test diff arrive together for review. Live-data drift detection is a separate, opt-in concern.

```
                 ┌── tests run against ──┐
   live cache ───┤                       ├──→ pinned fixtures ──→ tests
                 └── refresh script ─────┘    (committed)
                     (manual, reviewed)
```

Live cache drift is checked by an opt-in audit, not by the test suite.

## The three tiers

### Tier A — Pipeline contract tests
**Catches:** "pipeline upstream silently dropped a field we depend on." Three repeated manual checks (`source_metadata`, `category`, hierarchy keys) motivated automating this.

**Mechanic:** vitest file that walks every fixture file and asserts presence/shape of fields the TS code depends on. Each contract is a field-level invariant.

**File:** `tests/pipeline-contract.test.ts`

**Initial contract set** (every one corresponds to a real failure mode):
- `every model_result has source_metadata` (we deleted the synthesis fallback assuming this)
- `every model_result.source_metadata has evaluator_relationship in {first_party, third_party, other}`
- `every eval-detail has category as a non-empty string`
- `every eval-detail has eval_summary_id, benchmark, benchmark_leaf_name`
- `every model card has model_family_id matching pipelineSlugify(model_family_id)`
- `every hierarchy_by_category key is one of the 9 known pipeline categories`
- `every BenchmarkEvaluation produced by flattenModelEvaluations has source_metadata` (cross-check: contract + adapter together)
- `every model card has total_evaluations as a number`
- `every model_result.retrieved_timestamp parses as a valid Date`

**Exit criteria:** all contracts pass against pinned fixtures. Each contract should fail loudly with the offending file path + key path when violated.

**Acceptance:** runs in `pnpm test`. Takes <2s. Adding a new contract is 5 lines.

### Tier B — Adapter snapshot tests
**Catches:** "I changed TS code and didn't realize it changes the output for some input shape." This is the bulk of regression-detection.

**Mechanic:** vitest snapshot tests. Each adapter × each fixture → snapshot. Regenerate via `vitest --update-snapshots` when changes are intentional; review the snapshot diff alongside the code diff.

**Files:**
- `tests/adapters/hf-eval-detail-to-summary.test.ts`
- `tests/adapters/hf-model-card-to-evaluation-card-data.test.ts`
- `tests/adapters/flatten-model-evaluations.test.ts`
- `tests/adapters/hf-developer-detail-to-summary.test.ts`
- `tests/adapters/hf-eval-entry-to-list-item.test.ts`
- `tests/adapters/build-benchmark-leaderboard-matrix.test.ts`
- `tests/adapters/build-single-metric-suite-matrix-summary.test.ts`
- `tests/adapters/aggregate-benchmark-summaries.test.ts`

**Snapshot format:** `tests/__snapshots__/<test>.snap` (vitest default). Commit them.

**Acceptance:** `pnpm test` runs all snapshots, reports any diff, exit non-zero on diff. Adding a new fixture is one line of `test.each`.

### Tier C — Full-cache differential audit
**Catches:** "what is the *full* impact of my code change across all 5 830 production models?" Used for big migration items where snapshot fixtures can't enumerate every shape.

**Mechanic:** a Node script that runs all adapters against either pinned fixtures or the live cache, produces a deterministic JSON digest (per-output hash + value distributions + invariant violation counts), and supports diff mode.

**File:** `scripts/audit-adapters.mjs`

**Output digest shape:**
```json
{
  "version": 1,
  "source": ".cache/hf-data",
  "generated_at": "2026-04-27T22:00:00Z",
  "adapters": {
    "hfModelCardToEvaluationCardData": {
      "outputs_count": 5830,
      "outputs_hash": "sha256:...",  // hash of all outputs concatenated
      "field_distributions": {
        "developer": { "OpenAI": 12, "Anthropic": 8, ... },
        "categories.length": { "1": 100, "2": 2000, "3": 3000, ... },
        "evaluator_count": { "0": 200, "1": 1500, ... }
      }
    },
    "flattenModelEvaluations": {
      "outputs_count": 86183,
      "outputs_hash": "sha256:...",
      "invariant_violations": []
    }
  }
}
```

**Modes:**
- `node scripts/audit-adapters.mjs --output baseline.json` → write digest
- `node scripts/audit-adapters.mjs --output candidate.json` → write digest after change
- `node scripts/audit-adapters.mjs --diff baseline.json candidate.json` → human-readable diff
- `node scripts/audit-adapters.mjs --against tests/fixtures` → use pinned set instead of live cache
- `node scripts/audit-adapters.mjs --live --against .cache/hf-data` → drift check against live data

**Acceptance:** runs in <30s against full live cache. Diff mode highlights field-distribution shifts, output-hash changes, and new invariant violations with sample paths.

## Fixture management

### Source

Fixtures are pinned copies of files in `.cache/hf-data/` at a moment in time. They are committed JSON. Reviewers can see them in PR diffs.

### Layout

```
tests/fixtures/
  manifest.json        ← list of fixture IDs + source-cache snapshot ts
  evals/
    helm_classic_truthfulqa.json
    helm_safety.json
    apex_v1.json                        ← first-party (Mercor)
    artificial_analysis_*_aime.json     ← third-party (AA)
    helm_capabilities.json              ← composite
    helm_lite_narrativeqa.json          ← subtask
    rewardbench2_chat.json              ← coding key in hierarchy
    ...
  models/
    openai__gpt-5.json                  ← multiple variants
    anthropic__claude-opus-4-5.json     ← typical
    google__gemini-3-flash.json         ← already in the parity test
    ...
  developers/
    openai.json
    anthropic.json
    ...
```

### Curation criteria

Every fixture earns its place by exercising a specific code path. Avoid random sampling.

Required edge cases:
- A model with multiple variants (`openai__gpt-5`)
- A model with subtask hierarchy (helm_lite, helm_classic)
- A first-party eval (Mercor ACE/APEX)
- A third-party eval (Artificial Analysis)
- A composite eval (helm_capabilities)
- A matrix eval id pattern (synthetic, but the adapter handles it)
- An eval with `category: "other"` (most of the corpus)
- An eval that the regex `inferCategoryFromBenchmark` and the pipeline category disagree on (truthfulqa, helm_safety)
- A model with setup-alias merging (multiple "prompt"/"fc" variants of same release)
- An ABC-only benchmark (if any are exposed in eval-list)
- An aggregate eval URL pattern (`aggregate__<suite>`)

Aim for ~25-35 fixtures total. Small enough to review, broad enough to catch the patterns we know about.

### Refresh workflow

```bash
pnpm refresh-fixtures          # copies tests/fixtures/manifest.json IDs
                               # from .cache/hf-data/ into tests/fixtures/
                               # bumps manifest.json snapshot_ts
git diff tests/fixtures/       # review what upstream changed
pnpm test                      # snapshot tests will probably diff
pnpm test -- -u                # update snapshots if intentional
git diff tests/__snapshots__/  # review what adapter outputs changed
git add ...                    # commit fixtures + snapshots together
```

The diff in `tests/fixtures/` shows raw upstream changes. The diff in `tests/__snapshots__/` shows what changes when you feed the new data through the adapters. Both belong in the same commit.

### Refresh cadence

Manual, on demand. Recommended triggers:
- Before starting a new migration item (to work against current upstream)
- After observing a discrepancy between live cache and pinned fixtures
- Periodically (~monthly) to keep fixtures from drifting

There is no auto-refresh. The whole point is that upstream changes are reviewed.

### Live-data drift detection

Separate from regression tests. A vitest file `tests/upstream-drift.test.ts` runs Tier-A contracts against the LIVE cache and reports violations. Run it manually (`pnpm test:drift`); not part of `pnpm test`. If contracts fail there but pass on fixtures, upstream has drifted and someone should refresh fixtures + investigate.

## How upstream changes propagate

Three independent data layers, each updated by a different command:

```
huggingface.co/datasets/evaleval/card_backend       ← truth (changes when pipeline publishes)
                       │  pnpm cache-hf-data        ← user-triggered download
                       ▼
.cache/hf-data/                                      ← live local cache (mutable)
                       │  pnpm refresh-fixtures     ← user-triggered re-pin
                       ▼
tests/fixtures/                                      ← committed pinned snapshots
                       │  pnpm test (adapter outputs)
                       ▼
tests/__snapshots__/                                 ← committed expected outputs
```

Default `pnpm test` only sees the pinned bottom two layers, so upstream churn never flaps the regression suite by accident. Each upstream change is observed *deliberately* by re-pinning and reviewing the diff.

### Scenario matrix — what each layer reports

| What changed upstream | `pnpm test` | `pnpm test:drift` (live cache contracts) | `pnpm refresh-fixtures && pnpm test` (snapshot diff) | `pnpm audit-adapters --diff baseline.json candidate.json` |
|---|---|---|---|---|
| Pure data refresh, no shape change | ✅ | ✅ | ❌ snapshots diff (timestamps, scores) | hash flips for affected adapters |
| Additive (new field that no adapter consumes) | ✅ | ✅ | ✅ (raw fixture diff visible, snapshots stable) | distributions stable |
| New enum value (e.g. `evaluator_relationship: "fourth_party"`) | ✅ | ❌ unknown-value contract | ✅ unless consumed | distribution gains a key |
| Drops a required field (e.g. `source_metadata`) | ✅ | ❌ contract violation with N/M count | ❌ contracts now fail on pinned data too | `throws` count rises |
| Reclassifies an existing value (e.g. `category: "other"` → `"safety"`) | ✅ | ✅ (still a known string) | ❌ snapshots diff for that fixture | hash flips |
| Renames a field | ✅ | varies | ❌ snapshot diff + likely contract failure | hash + throws change |
| Rewrites the schema (breaking) | ✅ | ❌ multiple contracts | ❌ contracts + snapshots both fail | many hash flips |

The "✅" in `pnpm test` for every row is intentional: by design, default tests only fail when *our code* drifts from a pinned baseline. Upstream drift is reported by the opt-in `pnpm test:drift` and by the snapshot diff that lands the moment fixtures are re-pinned.

### Drift-triage decision tree

A `pnpm test:drift` failure means live cache no longer satisfies a contract our deletions assumed. Three possibilities:

1. **Pipeline regressed (e.g. dropped `source_metadata` on some rows)** — coordinate with the pipeline owner to restore. Don't refresh fixtures yet; the regression would propagate into our pinned set. The runtime `assertSourceMetadata` guards (lib/hf-data.ts, lib/model-data.ts) would also start firing in production, providing a second signal.
2. **Pipeline emitted a new value our enum doesn't recognise (e.g. new `evaluator_relationship`)** — extend the corresponding `KNOWN_*` set in `tests/upstream-drift.test.ts` and `tests/pipeline-contract.test.ts` AND any consumer code that branches on the old set.
3. **Pipeline made a schema-level change** — review the upstream commit log (`git -C ../eval_cards_backend_pipeline log`) for context, decide if our consumer needs updates, then refresh fixtures.

A snapshot diff after `pnpm refresh-fixtures` always means *some* output changed. Read the fixture diff and snapshot diff side-by-side:

- Fixture diff explains *what* upstream changed (raw data shift)
- Snapshot diff explains *how* the adapter projected that change into user-visible output
- Together → review and decide if the new output is correct (`pnpm test -- -u`) or a regression to fix

### Known gaps in drift coverage

1. **Stale `.cache/hf-data/`**: `pnpm test:drift` runs against whatever is on disk; it doesn't auto-refresh from huggingface.co. If `pnpm cache-hf-data` hasn't been run recently, "drift" reports stale-cache-vs-fixtures, not upstream-vs-fixtures. Fix: run `pnpm cache-hf-data` before `pnpm test:drift` when you care about true upstream.
2. **Hand-edited fixtures aren't detected**: nothing checks that `tests/fixtures/X.json` matches what `pnpm refresh-fixtures` would produce. If someone edits a fixture for debugging and forgets to restore, tests stay green against the mutation. Mitigation would be a content-hash entry per fixture in `manifest.json`; defer until it's actually a problem.
3. **Drift covers Tier A invariants only, not Tier B snapshots**: a value-reclassification (Scenario "reclassifies an existing value" above) is invisible to drift. Detection requires `pnpm refresh-fixtures` (snapshot diff) or `pnpm audit-adapters --live --diff` against an older baseline. By design — running snapshots against live data would flap on every refresh.
4. **`pnpm test:drift` is opt-in, not scheduled**: nobody runs it unless prompted. A CI nightly cron (or `pnpm test:drift` in a weekly task) would catch upstream contract breaks earlier; currently you discover them only when you next run drift.
5. **Audit script doesn't check Tier A contracts**: if a row violates a contract, the audit reports it indirectly via increased `throws` count (the runtime guards fire) but you'd need `pnpm test:drift` for the exact contract message and per-row locator.

## Build order

Tier A first (smallest, foundational). Tier B next (replaces subagent audits for normal regression detection). Tier C last (heaviest tooling).

Each tier is independently usable, so they can be built in parallel by different agents:

| Tier | Estimated effort | Depends on | Parallelizable? |
|---|---|---|---|
| A — contract tests | 1-2h | nothing | yes |
| B — snapshot tests | 2-3h | fixture set (shared) | mostly |
| C — audit script | 2-3h | nothing | yes |
| Fixture set (~25 files) | 1h | curation decisions | shared dep |

Recommended: build the fixture set + Tier A in series (one agent), Tier B and Tier C in parallel after fixtures are in.

## Test-additions deferred to specific migration items

The original Tier B plan listed 8 adapters; 4 are built. The remaining 4 (`hfEvalEntryToListItem`, `aggregateBenchmarkSummaries`, `buildSingleMetricSuiteMatrixSummary`, `createModelFamilySummary`) are deferred to the migration items that touch them — adding fixtures + snapshots speculatively now would be testing-for-testing's-sake. Specifically:

- **`hfEvalEntryToListItem` snapshot** — add when starting #1 (identity parsing) or #2 (setup-alias). Needs an `eval_list_entries` fixture group extracted from `.cache/hf-data/eval-list.json`. Cover at least: a typical entry, one with `display_name` starting with "accuracy on " (triggers `prefersBenchmarkName`), one with `display_name` containing "for scorer", one with a missing `display_name`.
- **Setup-alias collision fixture** — add when starting #2. Pick a model with `additional_details.mode` ∈ {"prompt", "fc", "thinking"} appearing across multiple submissions for the same model_id. `openai__gpt-5.2` model card has thinking variants; find a corresponding model detail file.
- **`aggregate__<suite>` pattern** — add when starting #5 (composites) or #6 (matrix synthesis). The aggregate URL pattern is synthetic, not on disk; the test would call `aggregateBenchmarkSummaries` directly with a curated input set. Defer until that adapter is actually being touched.
- **`createModelFamilySummary` snapshot** — add when starting #3. The flatten + family-summary chain is what `getModelSummaryById` returns; snapshotting `createModelFamilySummary(flattenModelEvaluations(model))` locks the full surface before the refactor.

## Reshape-class items: testing addendum (added 2026-04-28)

The Tier B snapshot framework above assumes the migration target is "pipeline emits the value, TS reads it." That works for cleaning-class items. For **reshape-class** items (#3 hierarchy flatten, #5 composite rollup, #6 matrix synthesis, #14 score summary stats, #16 per-category counts; plus the reshape halves of #2 and #13), the migration target is different: pipeline emits relational rows, **DuckDB SQL** does the dedup/groupby/aggregate. See `notes/migration-plan.md` § "Data direction" for framing.

This shifts what the test set has to verify:

- **Tier A contracts gain a parquet schema dimension.** Today's contracts assert JSON field invariants on `.cache/hf-data/**`. When the parquet schema goes more relational (e.g. one row per `(eval_summary_id, variant_key, retrieved_timestamp)` for the variant dedup case), Tier A grows a parallel set of contracts asserting the new typed columns are present and well-typed. File: `tests/parquet-contract.test.ts` (new, parallel to `tests/pipeline-contract.test.ts`).
- **Tier B snapshots become parity gates, not destinations.** Today, `tests/adapters/flatten-model-evaluations.test.ts` snapshots the TS reshape output. Once SQL replaces the TS, the same snapshot becomes a TS-vs-SQL parity assertion: run both, diff. The snapshot is committed; the SQL output is computed at test time; equality is the gate. Reshape-class snapshots stay green during the migration *exactly because* they assert behavior preservation, not implementation. Don't delete them on TS removal — convert them.
- **Tier C audit script grows a backend dimension.** `scripts/audit-adapters.mjs` currently runs adapters against the live cache. Add `--backend duckdb` so the same adapter contract is exercised against the DuckDB read path, producing a digest that diffs against the JSON-backend digest. This is the full-corpus generalization of `scripts/compare-data-backends.mjs`, but at the adapter-output level rather than the HTTP-endpoint level.
- **Five of the eight planned Tier B adapters are reshape-class:** `flattenModelEvaluations`, `buildBenchmarkLeaderboardMatrix`, `buildSingleMetricSuiteMatrixSummary`, `aggregateBenchmarkSummaries`, `createModelFamilySummary`. Their snapshots are the contract the SQL replacement must match. Build them when migrating each item — the snapshots gate the deletion.

What this doesn't change: cleaning-class items (the 12 that aren't reshape) work exactly as the existing framework describes — refresh fixtures → snapshot diff → review → ship. No structural test changes needed for cleaning items.

## What this DOESN'T cover

- **End-to-end UI tests.** No clicking through pages. Adapter snapshots are a proxy.
- **Performance regression.** No timing assertions.
- **Pipeline-side correctness.** Pipeline has its own tests in the sibling repo. Our contracts assert what we *consume*, not what's *correct upstream*.
- **The DuckDB shadow read.** That's covered by the existing `scripts/compare-data-backends.mjs` parity harness — at the HTTP-endpoint level. The adapter-level parity for reshape items (TS reshape output vs SQL reshape output) is the addendum above.

## Workflows

### Migration workflow (TS deletion against current upstream)

Use this for items #1, #2, #3 and any pipeline-side change that flows back into deletions in this repo.

```bash
# 1. Sync to current upstream so the work is against fresh data
pnpm cache-hf-data
pnpm test:drift                                  # does upstream still satisfy our contracts?
                                                 # if no → triage per "Drift-triage decision tree" first

# 2. Re-pin fixtures to current upstream
pnpm refresh-fixtures
pnpm test                                        # any pre-deletion snapshot diffs?
                                                 # if yes → review, then `pnpm test -- -u`, separate commit
                                                 # so the pin-update is isolated from the deletion

# 3. Capture a full-cache baseline so we can diff the impact of the change
pnpm audit-adapters --output /tmp/baseline.json --live

# 4. Make the deletion (or refactor)

# 5. Verify
pnpm test                                        # snapshots flag any unexpected output change
pnpm audit-adapters --output /tmp/candidate.json --live
pnpm audit-adapters --diff /tmp/baseline.json /tmp/candidate.json   # full-cache impact
pnpm compare-data-backends --json-base http://localhost:3001 --duckdb-base http://localhost:3002

# 6. Review snapshot diff alongside code diff
#    - intentional behaviour change: `pnpm test -- -u`, document the why in the commit
#    - unintentional: fix the code

# 7. Ship
```

Each step covers a distinct failure mode; nothing duplicates. Steps 3, 5b, 5c (the audit captures) are skippable for tiny changes — start with `pnpm test` alone and escalate if you want fuller coverage.

### Light-touch workflow (small change, no upstream sync needed)

```bash
pnpm test                                        # baseline green
# make the change
pnpm test                                        # snapshots flag any output change
# review snapshot diff, `pnpm test -- -u` if intentional
pnpm compare-data-backends ...
```

### Drift-only workflow (you suspect upstream changed)

```bash
pnpm cache-hf-data                               # ensure local cache is current
pnpm test:drift                                  # 5 contracts against full live cache
# if green: upstream still satisfies our deletions' assumptions
# if red: triage per "Drift-triage decision tree"
```

### Cross-repo workflow (pipeline-side change first, TS deletion later)

```bash
# In ../eval_cards_backend_pipeline
uv run --with huggingface_hub --no-project python -m scripts.pipeline --dry-run \
    -e EXPORT_EXPERIMENTAL_PARQUET=1
# verify output/ has the new field

# Back in this repo
pnpm cache-hf-data                               # picks up the new published artifact
pnpm test:drift                                  # do we now have a NEW contract we want to assert?
                                                 # if yes: extend tests/pipeline-contract.test.ts + drift
pnpm refresh-fixtures
pnpm test                                        # snapshots reflect the new field if any adapter consumes it
# now eligible to delete the TS code that the pipeline emission obviates
```
