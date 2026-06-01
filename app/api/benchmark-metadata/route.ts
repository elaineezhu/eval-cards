import { NextResponse } from "next/server"
import { getAllBenchmarkCards } from "@/lib/benchmark-metadata"

export async function GET() {
  const cards = await getAllBenchmarkCards()
  return NextResponse.json(cards, {
    headers: {
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  })
}
