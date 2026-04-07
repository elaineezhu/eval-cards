/**
 * Pre-computes peer ranks for all models across all benchmark evaluations.
 *
 * Outputs: public/peer-ranks.json
 * Shape:   Record<evalSummaryId, Record<modelId, { position: number; total: number }>>
 *
 * Run with:  node scripts/precompute-ranks.mjs
 * Or via:    npm run precompute-ranks
 */

import fs from "fs/promises"
import path from "path"

const root = path.resolve(new URL(import.meta.url).pathname, "..", "..")
const modelsDir = path.join(root, "data", "models")
const outputPath = path.join(root, "public", "peer-ranks.json")

// --- Replicated from lib/eval-processing.ts ---

const GENERIC_EVALUATION_NAMES = new Set([
  "accuracy",
  "score",
  "pass@1",
  "exact match",
  "f1",
  "mean win rate",
])

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function getBenchmarkName(evaluation, result) {
  const resultSource = result?.source_data
  if (resultSource && !Array.isArray(resultSource) && resultSource.dataset_name) {
    return resultSource.dataset_name
  }
  if (evaluation.benchmark) return evaluation.benchmark
  if (!Array.isArray(evaluation.source_data) && evaluation.source_data?.dataset_name) {
    return evaluation.source_data.dataset_name
  }
  return result?.evaluation_name ?? evaluation.evaluation_id
}

function getEvaluationDisplayName(evaluation, result) {
  const benchmarkName = getBenchmarkName(evaluation, result)
  const metricName = result.evaluation_name.trim()
  if (metricName === benchmarkName) return metricName
  if (GENERIC_EVALUATION_NAMES.has(metricName.toLowerCase())) {
    return `${benchmarkName} - ${metricName}`
  }
  return metricName
}

function getEvaluationSummaryId(evaluation, result) {
  const benchmarkKey = evaluation.benchmark || getBenchmarkName(evaluation, result)
  return slugify(`${benchmarkKey}__${result.evaluation_name}`)
}

// --- Main logic ---

async function loadAllEvaluations() {
  const files = (await fs.readdir(modelsDir)).filter((f) => f.endsWith(".json"))
  const evaluations = []

  for (const file of files) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(modelsDir, file), "utf8"))
      const modelInfo = raw.model_info
      for (const eval_ of raw.evaluations ?? []) {
        evaluations.push({ ...eval_, model_info: modelInfo })
      }
    } catch {
      // skip malformed files
    }
  }

  return evaluations
}

function groupByBenchmark(evaluations) {
  /** @type {Map<string, { metric_config: any; lower_is_better: boolean; results: Array<{modelId: string; score: number}> }>} */
  const summaries = new Map()

  for (const eval_ of evaluations) {
    for (const result of eval_.evaluation_results ?? []) {
      const evalId = getEvaluationSummaryId(eval_, result)
      const lowerIsBetter = result.metric_config?.lower_is_better ?? false

      if (!summaries.has(evalId)) {
        summaries.set(evalId, {
          lower_is_better: lowerIsBetter,
          results: [],
        })
      }

      summaries.get(evalId).results.push({
        modelId: eval_.model_info.id,
        score: result.score_details?.score ?? 0,
      })
    }
  }

  return summaries
}

function computeRanks(summaries) {
  /** @type {Record<string, Record<string, { position: number; total: number }>>} */
  const ranks = {}

  for (const [evalId, { lower_is_better, results }] of summaries) {
    if (results.length === 0) continue

    const sorted = [...results].sort((a, b) =>
      lower_is_better ? a.score - b.score : b.score - a.score
    )

    const total = sorted.length
    ranks[evalId] = {}

    let currentRank = 0
    let previousScore = null

    for (let i = 0; i < sorted.length; i++) {
      const { modelId, score } = sorted[i]
      if (previousScore === null || Math.abs(score - previousScore) > 1e-9) {
        currentRank = i + 1
        previousScore = score
      }
      // Keep best rank if the same model appears multiple times
      if (!(modelId in ranks[evalId]) || ranks[evalId][modelId].position > currentRank) {
        ranks[evalId][modelId] = { position: currentRank, total }
      }
    }
  }

  return ranks
}

async function main() {
  console.log("Loading evaluations…")
  const evaluations = await loadAllEvaluations()
  console.log(`  Loaded ${evaluations.length} evaluations`)

  console.log("Grouping by benchmark…")
  const summaries = groupByBenchmark(evaluations)
  console.log(`  Found ${summaries.size} unique benchmark/metric combinations`)

  console.log("Computing ranks…")
  const ranks = computeRanks(summaries)

  const evalCount = Object.keys(ranks).length
  const entryCount = Object.values(ranks).reduce((n, m) => n + Object.keys(m).length, 0)
  console.log(`  ${evalCount} evals, ${entryCount} model-rank entries`)

  await fs.mkdir(path.join(root, "public"), { recursive: true })
  await fs.writeFile(outputPath, JSON.stringify(ranks))
  console.log(`Written to ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
