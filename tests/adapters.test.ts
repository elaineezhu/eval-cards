import { describe, expect, it } from "vitest"

import type { HFEvalDetail, HFModelDetail, HFModelCardEntry } from "../lib/hf-data"
import { flattenModelEvaluations } from "../lib/hf-data"
import {
  hfEvalDetailToSummary,
  hfModelCardToEvaluationCardData,
  hfDeveloperDetailToSummary,
} from "../lib/model-data"

import { fixtureEntries, loadFixture } from "./fixtures/loader"

// Tier B — adapter snapshot tests.
//
// Each adapter is run against every relevant fixture, and the output is
// snapshotted via vitest's toMatchSnapshot(). Initial snapshots are committed.
//
// Workflow:
//   - Edit code → `pnpm test`
//   - If snapshots match → no behavior change. Safe.
//   - If snapshots differ → review the snap diff in tests/__snapshots__/
//     alongside the code diff. If intentional behavior change, run
//     `pnpm test -- -u` to update snapshots and commit them in the same PR.
//     If unintentional, the test caught a regression — fix the code.
//
// New fixtures: add to tests/fixtures/manifest.json, run `pnpm refresh-fixtures`,
// run `pnpm test -- -u` to capture initial snapshots, commit fixtures + snaps
// together.

describe("hfModelCardToEvaluationCardData", () => {
  for (const entry of fixtureEntries("model_cards")) {
    it(`${entry.id} — ${entry.why}`, () => {
      const input = loadFixture<HFModelCardEntry>("model_cards", entry.id)
      expect(hfModelCardToEvaluationCardData(input)).toMatchSnapshot()
    })
  }
})

describe("hfEvalDetailToSummary", () => {
  for (const entry of fixtureEntries("evals")) {
    it(`${entry.id} — ${entry.why}`, () => {
      const input = loadFixture<HFEvalDetail>("evals", entry.id)
      // attachBenchmarkCardToSummary is async + I/O bound — snapshot the
      // synchronous core. attachBenchmarkCardToSummary is covered separately
      // by the parity harness.
      expect(hfEvalDetailToSummary(input)).toMatchSnapshot()
    })
  }
})

describe("flattenModelEvaluations", () => {
  for (const entry of fixtureEntries("models")) {
    it(`${entry.id} — ${entry.why}`, () => {
      const input = loadFixture<HFModelDetail>("models", entry.id)
      const evaluations = flattenModelEvaluations(input)
      // Snapshot a digest rather than the full output (which can be 10k+ lines
      // for large models). The digest captures: count, distinct categories,
      // distinct evaluator_relationships, count of distinct benchmark_family_keys,
      // count of unique evaluation_ids, and a hash of the full output. Any change
      // to the full output changes the hash; the structured fields make the diff
      // readable when something changes.
      expect(digestEvaluations(evaluations)).toMatchSnapshot()
    })
  }
})

describe("hfDeveloperDetailToSummary", () => {
  for (const entry of fixtureEntries("developers")) {
    it(`${entry.id} — ${entry.why}`, () => {
      const input = loadFixture<{ developer: string; models: HFModelCardEntry[] }>("developers", entry.id)
      // Developer fixtures can be large (anthropic.json is 389KB, many model
      // cards). Snapshot a digest: scalar fields plus a count + hash of the
      // model_cards array. Bigger detail goes through hfModelCardToEvaluationCardData
      // tests above.
      expect(digestDeveloperSummary(hfDeveloperDetailToSummary(input))).toMatchSnapshot()
    })
  }
})

import { createHash } from "crypto"
import type { BenchmarkEvaluation } from "../lib/benchmark-schema"

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12)
}

function digestEvaluations(evaluations: BenchmarkEvaluation[]) {
  const categories = new Set<string>()
  const families = new Set<string>()
  const evaluators = new Set<string>()
  const evaluationIds = new Set<string>()
  let missingSourceMetadata = 0
  for (const e of evaluations) {
    if (e.category) categories.add(e.category)
    if (e.benchmark_family_key) families.add(e.benchmark_family_key)
    if (e.source_metadata?.evaluator_relationship) evaluators.add(e.source_metadata.evaluator_relationship)
    if (e.evaluation_id) evaluationIds.add(e.evaluation_id)
    if (!e.source_metadata) missingSourceMetadata += 1
  }
  return {
    count: evaluations.length,
    distinct_evaluation_ids: evaluationIds.size,
    distinct_categories: [...categories].sort(),
    distinct_benchmark_family_keys: families.size,
    distinct_evaluator_relationships: [...evaluators].sort(),
    missing_source_metadata: missingSourceMetadata,
    full_output_hash: stableHash(evaluations),
  }
}

function digestDeveloperSummary(summary: ReturnType<typeof hfDeveloperDetailToSummary>) {
  return {
    developer: summary.developer,
    route_id: summary.route_id,
    model_count: summary.model_count,
    benchmark_count: summary.benchmark_count,
    evaluation_count: summary.evaluation_count,
    popular_evals: summary.popular_evals,
    models_hash: stableHash(summary.models),
    models_count: summary.models.length,
  }
}
