import "server-only"

import {
  getDashboardDataFromDuckDB,
  getModelCardsFromDuckDB,
  getModelCardsLiteFromDuckDB,
  getEvalListDataFromDuckDB,
  getEvalListLiteDataFromDuckDB,
  getEvalListFromDuckDB,
  getDeveloperListFromDuckDB,
  getDeveloperSummaryByIdFromDuckDB,
  getModelSummaryByIdFromDuckDB,
  getEvalSummaryByIdFromDuckDB,
} from "@/lib/duckdb-data"
import { normalizeEvalSummary } from "@/lib/eval-processing"
import {
  fetchBackendManifest,
  fetchBackendManifestStatus,
  fetchEvalHierarchy,
} from "@/lib/hf-data"

export const getDashboardData = getDashboardDataFromDuckDB
export const getModelCards = getModelCardsFromDuckDB
export const getModelCardsLite = getModelCardsLiteFromDuckDB
export const getEvalListData = getEvalListDataFromDuckDB
export const getEvalListLiteData = getEvalListLiteDataFromDuckDB
export const getEvalList = getEvalListFromDuckDB
export const getDeveloperList = getDeveloperListFromDuckDB
export const getDeveloperSummaryById = getDeveloperSummaryByIdFromDuckDB
export const getModelSummaryById = getModelSummaryByIdFromDuckDB

/**
 * Eval summary lookups go through `normalizeEvalSummary` so derivable but
 * sometimes-blank fields (currently `instance_data`) are reconciled from
 * `model_results` before they reach any consumer. The strict pass-through
 * contract of `duckdb-data.ts` stays intact — reconciliation of known
 * upstream gaps belongs in this thin adapter layer.
 */
export async function getEvalSummaryById(evalId: string) {
  const summary = await getEvalSummaryByIdFromDuckDB(evalId)
  return summary ? normalizeEvalSummary(summary) : summary
}

// Metadata-style artifacts are still read through the existing JSON/HF path.
// They are not request-time processing hotspots and the DuckDB shadow doesn't
// re-shape them, so calling lib/hf-data directly avoids needless indirection.
export const getBackendManifestData = fetchBackendManifest
export const getBackendManifestStatusData = fetchBackendManifestStatus
export const getEvalHierarchyData = fetchEvalHierarchy
