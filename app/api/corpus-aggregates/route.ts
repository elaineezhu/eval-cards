import { NextResponse } from "next/server"

import { fetchCorpusAggregates } from "@/lib/hf-data"

export async function GET() {
  const aggregates = await fetchCorpusAggregates()

  if (!aggregates) {
    return NextResponse.json(
      { error: "Corpus aggregates not available" },
      { status: 404 }
    )
  }

  return NextResponse.json(aggregates)
}
