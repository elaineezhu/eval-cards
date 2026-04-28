import "server-only"

import * as jsonData from "@/lib/model-data"

function isDuckDBBackend() {
  return process.env.DATA_BACKEND?.trim().toLowerCase() === "duckdb"
}

async function duckdbData() {
  return import("@/lib/duckdb-data")
}

export async function getDashboardData() {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getDashboardDataFromDuckDB()
  }

  return jsonData.getDashboardData()
}

export async function getModelCards() {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getModelCardsFromDuckDB()
  }

  return jsonData.getModelCards()
}

export async function getModelCardsLite() {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getModelCardsLiteFromDuckDB()
  }

  return jsonData.getModelCardsLite()
}

export async function getEvalListData() {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getEvalListDataFromDuckDB()
  }

  return jsonData.getEvalListData()
}

export async function getEvalListLiteData() {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getEvalListLiteDataFromDuckDB()
  }

  return jsonData.getEvalListLiteData()
}

export async function getEvalList() {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getEvalListFromDuckDB()
  }

  return jsonData.getEvalList()
}

export async function getDeveloperList() {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getDeveloperListFromDuckDB()
  }

  return jsonData.getDeveloperList()
}

export async function getDeveloperSummaryById(routeId: string) {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getDeveloperSummaryByIdFromDuckDB(routeId)
  }

  return jsonData.getDeveloperSummaryById(routeId)
}

export async function getModelSummaryById(modelId: string) {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getModelSummaryByIdFromDuckDB(modelId)
  }

  return jsonData.getModelSummaryById(modelId)
}

export async function getEvalSummaryById(evalId: string) {
  if (isDuckDBBackend()) {
    return (await duckdbData()).getEvalSummaryByIdFromDuckDB(evalId)
  }

  return jsonData.getEvalSummaryById(evalId)
}

// Metadata-style artifacts are intentionally still read through the existing
// JSON/HF path during the local DuckDB experiment. They are not request-time
// processing hotspots, and keeping them unchanged avoids broadening rollout.
export const getBackendManifestData = jsonData.getBackendManifestData
export const getBackendManifestStatusData = jsonData.getBackendManifestStatusData
export const getEvalHierarchyData = jsonData.getEvalHierarchyData
