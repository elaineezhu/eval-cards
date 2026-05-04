import "server-only"

import type { BackendManifestStatus } from "@/lib/backend-artifacts"
import { normalizeEvalSummary } from "@/lib/eval-processing"

const BACKEND_VERSION = process.env.DATA_BACKEND?.trim().toLowerCase() ?? "duckdb"

function useViewLayerBackend() {
  return BACKEND_VERSION === "v2" || BACKEND_VERSION === "stage-j"
}

async function legacyBackend() {
  return import("@/lib/duckdb-data")
}

async function viewBackend() {
  return import("@/lib/view-data")
}

async function sidecars() {
  return import("@/lib/sidecars")
}

async function hfData() {
  return import("@/lib/hf-data")
}

export async function getModelCards() {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getModelCards()
  }

  return (await legacyBackend()).getModelCardsFromDuckDB()
}

export async function getModelCardsLite() {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getModelCardsLite()
  }

  return (await legacyBackend()).getModelCardsLiteFromDuckDB()
}

export async function getEvalListData() {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getEvalListData()
  }

  return (await legacyBackend()).getEvalListDataFromDuckDB()
}

export async function getEvalListLiteData() {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getEvalListLiteData()
  }

  return (await legacyBackend()).getEvalListLiteDataFromDuckDB()
}

export async function getEvalList() {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getEvalList()
  }

  return (await legacyBackend()).getEvalListFromDuckDB()
}

export async function getDashboardData() {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getDashboardData()
  }

  return (await legacyBackend()).getDashboardDataFromDuckDB()
}

export async function getDeveloperList() {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getDeveloperList()
  }

  return (await legacyBackend()).getDeveloperListFromDuckDB()
}

export async function getDeveloperSummaryById(routeId: string) {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getDeveloperSummaryById(routeId)
  }

  return (await legacyBackend()).getDeveloperSummaryByIdFromDuckDB(routeId)
}

export async function getModelSummaryById(modelId: string) {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getModelSummaryById(modelId)
  }

  return (await legacyBackend()).getModelSummaryByIdFromDuckDB(modelId)
}

export async function getEvalSummaryById(evalId: string) {
  if (useViewLayerBackend()) {
    return (await viewBackend()).getEvalSummaryById(evalId)
  }

  const summary = await (await legacyBackend()).getEvalSummaryByIdFromDuckDB(evalId)
  return summary ? normalizeEvalSummary(summary) : summary
}

export async function getBackendManifestData() {
  if (useViewLayerBackend()) {
    return (await sidecars()).fetchManifest()
  }

  return (await hfData()).fetchBackendManifest()
}

export async function getBackendManifestStatusData(): Promise<BackendManifestStatus> {
  if (useViewLayerBackend()) {
    const manifest = await (await sidecars()).fetchManifest()
    return {
      currentManifest: manifest,
      latestManifest: manifest,
      currentManifestSignature: manifest.generated_at,
      latestManifestSignature: manifest.generated_at,
      updateAvailable: false,
      refreshing: false,
      pendingRefreshCount: 0,
    }
  }

  return (await hfData()).fetchBackendManifestStatus()
}

export async function getEvalHierarchyData() {
  if (useViewLayerBackend()) {
    // The v2 backend ships hierarchy.json in the new composite/family/
    // slice taxonomy shape (top-level `composites[]`, flat `families[]`
    // lookup index). Existing UI components expect the legacy nested
    // `families[].composites[]` / `families[].standalone_benchmarks[]`
    // shape, so route the v2 sidecar through the same adapter the HF
    // path uses.
    const raw = await (await sidecars()).fetchHierarchy()
    return (await hfData()).adaptEvalHierarchy(raw)
  }

  return (await hfData()).fetchEvalHierarchy()
}
