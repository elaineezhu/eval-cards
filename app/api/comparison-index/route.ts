import { NextResponse } from "next/server"

import { fetchComparisonIndex } from "@/lib/hf-data"

export async function GET() {
  try {
    const index = await fetchComparisonIndex()
    return NextResponse.json(index, {
      headers: {
        // The index is ~26 MB uncompressed but recomputed per pipeline run.
        // Hot-cache aggressively in the browser; HF's own CDN handles the
        // dataset-side caching for us.
        "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to load comparison index" },
      { status: 500 }
    )
  }
}
