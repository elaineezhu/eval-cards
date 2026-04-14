"use client"

import { useAudienceMode } from "@/components/audience-mode-provider"

export function HomeModeLabel() {
  const { mode } = useAudienceMode()

  return <span>{mode === "research" ? "Research-first reading mode" : "Policy-first reading mode"}</span>
}