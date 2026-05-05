import "server-only"

import type {
  BackendManifest,
  ComparisonIndex,
  CorpusAggregates,
  EvalHierarchy,
} from "@/lib/backend-artifacts"

let cache: {
  manifest?: Promise<BackendManifest>
  headline?: Promise<CorpusAggregates>
  hierarchy?: Promise<EvalHierarchy>
  comparisonIndex?: Promise<ComparisonIndex>
} = {}

function getSnapshotUrl() {
  const snapshotUrl = process.env.SNAPSHOT_URL?.trim()
  if (!snapshotUrl) {
    throw new Error("DATA_BACKEND=v2 requires SNAPSHOT_URL to point at a Stage J snapshot directory")
  }

  return snapshotUrl.replace(/\/+$/, "")
}

function sidecarUrl(name: string) {
  return `${getSnapshotUrl()}/${name}`
}

async function fetchJson<T>(name: string): Promise<T> {
  const url = sidecarUrl(name)

  if (url.startsWith("file://")) {
    const fs = await import("fs/promises")
    const text = await fs.readFile(new URL(url), "utf8")
    return JSON.parse(text) as T
  }

  const response = await fetch(url, { next: { revalidate: 3600 } })
  if (!response.ok) {
    throw new Error(`Snapshot sidecar fetch failed: ${response.status} ${response.statusText} for ${url}`)
  }

  return (await response.json()) as T
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

export function fetchComparisonIndex(): Promise<ComparisonIndex> {
  return (cache.comparisonIndex ??= fetchJson<ComparisonIndex>("comparison-index.json").then(
    (index) => {
      assertComparisonIndexShape(index)
      return index
    },
  ))
}

/**
 * Fail fast on contract regressions. Comparison-index rows must carry
 * `family_id`; the model-page graph view collapses without it. See
 * `notes/hierarchy-alignment.md` §5.2.
 */
export function assertComparisonIndexShape(index: ComparisonIndex): void {
  for (const [evalId, entry] of Object.entries(index.evals ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(entry, "family_id")) {
      throw new Error(
        `comparison-index contract regression: evals[${evalId}] is missing family_id. ` +
          `See notes/hierarchy-alignment.md §5.2.`,
      )
    }
  }
}

export function resetSidecarCacheForTests() {
  cache = {}
}
