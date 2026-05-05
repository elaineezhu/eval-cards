import "server-only"

import type { BackendManifestStatus } from "@/lib/backend-artifacts"
import { cleanHierarchy } from "@/lib/clean-hierarchy"
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

async function applyModelCoverage<T extends { route_id: string; benchmarks_count: number }>(
  cards: T[],
): Promise<T[]> {
  try {
    const coverage = await (await sidecars()).fetchModelCoverage()
    if (Object.keys(coverage).length === 0) return cards
    return cards.map((c) =>
      coverage[c.route_id] != null
        ? { ...c, benchmarks_count: coverage[c.route_id] }
        : c,
    )
  } catch {
    return cards
  }
}

export async function getModelCards() {
  if (useViewLayerBackend()) {
    const cards = await (await viewBackend()).getModelCards()
    return applyModelCoverage(cards)
  }

  return (await legacyBackend()).getModelCardsFromDuckDB()
}

export async function getModelCardsLite() {
  if (useViewLayerBackend()) {
    const cards = await (await viewBackend()).getModelCardsLite()
    return applyModelCoverage(cards)
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
  // Both backend paths feed through `cleanHierarchy`, so the API route
  // serves a frontend-ready artefact: sanitised display names, populated
  // `derivedTags` everywhere, and a `benchmark_index[]` with
  // family-rollup entries dropped. The cleaner is idempotent — the
  // sidecar disk cache stores the cleaned output, so cold starts skip
  // the work.
  if (useViewLayerBackend()) {
    // The v2 backend ships hierarchy.json in the new composite/family/
    // slice taxonomy shape (top-level `composites[]`, flat `families[]`
    // lookup index). Existing UI components expect the legacy nested
    // `families[].composites[]` / `families[].standalone_benchmarks[]`
    // shape, so route the v2 sidecar through the same adapter the HF
    // path uses.
    const raw = await (await sidecars()).fetchHierarchy()
    return cleanHierarchy((await hfData()).adaptEvalHierarchy(raw))
  }

  return cleanHierarchy(await (await hfData()).fetchEvalHierarchy())
}
