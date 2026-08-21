import { NextResponse } from "next/server"

import { getEvalTrajectories } from "@/lib/data-backend"

// Trajectory panels for protocol-varied collection pages, keyed like
// every per-page route:
// ?id=<url-encoded evaluation_id>. Missing trajectory table / sidecar /
// non-collection pages 404 and the client renders no panels.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Missing evaluation id" }, { status: 400 })
  }

  const payload = await getEvalTrajectories(id)

  if (!payload) {
    return NextResponse.json({ error: "No trajectory data for this evaluation" }, { status: 404 })
  }

  return NextResponse.json(payload)
}
