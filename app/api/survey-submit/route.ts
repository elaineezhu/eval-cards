import { NextResponse } from "next/server"

const HF_REPO = "evaleval/card_survey_data"
const HF_API = "https://huggingface.co/api/datasets"

export async function POST(request: Request) {
  const token = process.env.survey_key
  if (!token) {
    return NextResponse.json(
      { error: "Survey submission is not configured (missing survey_key)" },
      { status: 500 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing survey data" }, { status: 400 })
  }

  // Generate a unique filename based on timestamp and participant info
  const surveyData = body as Record<string, unknown>
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const participant = String(surveyData.participantName || "anonymous")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40)
  const filename = `responses/${timestamp}_${participant}.json`

  const content = JSON.stringify(surveyData, null, 2)

  try {
    // Use the HuggingFace Hub API to upload a file
    const uploadUrl = `${HF_API}/${HF_REPO}/upload/main/${filename}`
    const blob = new Blob([content], { type: "application/json" })

    const formData = new FormData()
    formData.append("file", blob, filename)

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[survey-submit] HF upload failed: ${res.status}`, errorText)
      return NextResponse.json(
        { error: `Failed to save survey data (${res.status})` },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, filename })
  } catch (err) {
    console.error("[survey-submit] Error:", err)
    return NextResponse.json(
      { error: "Failed to submit survey data" },
      { status: 500 }
    )
  }
}
