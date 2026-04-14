import { NextResponse } from "next/server"

import { getModelCardsLite } from "@/lib/model-data"

export async function GET() {
  const models = await getModelCardsLite()
  return NextResponse.json(models, {
    headers: {
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  })
}