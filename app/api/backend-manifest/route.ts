import { NextResponse } from "next/server"

import { getBackendManifestData } from "@/lib/model-data"

export async function GET() {
  const manifest = await getBackendManifestData()
  return NextResponse.json(manifest)
}