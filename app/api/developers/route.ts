import { NextResponse } from "next/server"

import { getDeveloperList } from "@/lib/model-data"

export async function GET() {
  const developers = await getDeveloperList()
  return NextResponse.json(developers)
}
