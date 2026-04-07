import { NextResponse } from "next/server"
import { getAllBenchmarkCards } from "@/lib/benchmark-metadata"

export async function GET() {
  const cards = await getAllBenchmarkCards()
  return NextResponse.json(cards)
}
