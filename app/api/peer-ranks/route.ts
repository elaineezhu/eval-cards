import { NextResponse } from "next/server"

import { fetchPeerRanks } from "@/lib/hf-data"

export async function GET() {
  try {
    const ranks = await fetchPeerRanks()
    return NextResponse.json(ranks, {
      headers: {
        // Per-snapshot file, recomputed by the producer per pipeline run.
        // Hot-cache aggressively in the browser; HF's own CDN handles
        // dataset-side caching for us.
        "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to load peer ranks" },
      { status: 500 }
    )
  }
}
