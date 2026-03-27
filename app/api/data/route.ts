import { NextResponse } from "next/server"

import { getDashboardData } from "@/lib/model-data"

export async function GET() {
  const data = await getDashboardData()
  return NextResponse.json(data)
}
