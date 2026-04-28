import { NextResponse } from "next/server"

import { getEvalListLiteData } from "@/lib/data-backend"

export async function GET() {
  const data = await getEvalListLiteData()
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  })
}