import { NextResponse } from "next/server"

import { getEvalSummaryById, getMergedBenchmarkSummary } from "@/lib/data-backend"
import { isMergedEvalId, routeIdFromSegments } from "@/lib/utils"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Missing evaluation id" }, { status: 400 })
  }

  // Merged benchmark page: single-segment ids (no %2F after
  // normalization) resolve through the merged accessor and return the
  // `{ merged: true, ... }` discriminated payload. Two-segment
  // per-source ids keep the existing path untouched. When the snapshot
  // predates merged_evals_view (accessor returns null) we fall through
  // to the per-source lookup so old snapshots behave exactly as before.
  if (isMergedEvalId(id)) {
    const metricId = searchParams.get("metric")?.trim() || undefined
    const sliceId = searchParams.get("slice")?.trim() || undefined
    try {
      const merged = await getMergedBenchmarkSummary(routeIdFromSegments(id), metricId, sliceId)
      if (merged) {
        return NextResponse.json(merged)
      }
    } catch (error) {
      // A connection reset can drop the optional merged table between
      // the presence probe and the query — degrade to the per-source
      // lookup/404 instead of a 500.
      console.warn(`[eval-summary] merged lookup failed for ${id}:`, error)
    }
  }

  const summary = await getEvalSummaryById(id)

  if (!summary) {
    return NextResponse.json({ error: "Evaluation not found" }, { status: 404 })
  }

  return NextResponse.json(summary)
}
