import "server-only"

import {
  fetchBackendManifest,
  fetchBackendManifestStatus,
  fetchEvalHierarchy,
} from "@/lib/hf-data"

export {
  getDashboardDataFromDuckDB as getDashboardData,
  getModelCardsFromDuckDB as getModelCards,
  getModelCardsLiteFromDuckDB as getModelCardsLite,
  getEvalListDataFromDuckDB as getEvalListData,
  getEvalListLiteDataFromDuckDB as getEvalListLiteData,
  getEvalListFromDuckDB as getEvalList,
  getDeveloperListFromDuckDB as getDeveloperList,
  getDeveloperSummaryByIdFromDuckDB as getDeveloperSummaryById,
  getModelSummaryByIdFromDuckDB as getModelSummaryById,
  getEvalSummaryByIdFromDuckDB as getEvalSummaryById,
} from "@/lib/duckdb-data"

// Metadata-style artifacts are still read through the existing JSON/HF path.
// They are not request-time processing hotspots and the DuckDB shadow doesn't
// re-shape them, so calling lib/hf-data directly avoids needless indirection.
export const getBackendManifestData = fetchBackendManifest
export const getBackendManifestStatusData = fetchBackendManifestStatus
export const getEvalHierarchyData = fetchEvalHierarchy
