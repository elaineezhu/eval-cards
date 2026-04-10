import { NextResponse } from "next/server"

import { getEvalHierarchyData } from "@/lib/model-data"

export async function GET() {
  const hierarchy = await getEvalHierarchyData()
  return NextResponse.json(hierarchy)
}