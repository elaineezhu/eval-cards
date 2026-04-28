import { NextResponse } from "next/server"

import { getEvalHierarchyData } from "@/lib/data-backend"

export async function GET() {
  const hierarchy = await getEvalHierarchyData()
  return NextResponse.json(hierarchy)
}