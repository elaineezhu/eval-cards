import { NextResponse } from "next/server"

import { getModelCards } from "@/lib/model-data"

export async function GET() {
  const models = await getModelCards()
  return NextResponse.json(models)
}
