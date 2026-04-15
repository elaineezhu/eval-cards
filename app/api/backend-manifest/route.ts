import { NextResponse } from "next/server"

import { getBackendManifestStatusData } from "@/lib/model-data"

export async function GET() {
  const manifestStatus = await getBackendManifestStatusData()
  return NextResponse.json(manifestStatus)
}