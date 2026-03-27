import { NextResponse } from "next/server"

import { getEvalListData } from "@/lib/model-data"

export async function GET() {
  const data = await getEvalListData()
  return NextResponse.json(data)
}
