"use client"

// Study context strip for the /embed/eval/* pages. An embedded plot
// travels without the benchmark page around it, so the attribution and
// protocol facts that live in the page chrome are restated here, once
// per iframe. Renders only when the active summary carries a curated
// collection attachment; ordinary evals render nothing.

import { isAssistedResult } from "@/lib/eval-processing"
import type { BenchmarkEvalSummary } from "@/lib/eval-processing"

export function EmbedStudyContext({ summary }: { summary: BenchmarkEvalSummary }) {
  const collection = summary.collection
  if (!collection?.curated) return null

  const total = summary.model_results.length
  const assisted = summary.model_results.filter((r) =>
    isAssistedResult(r.protocol_condition),
  ).length
  // The strip renders inside third-party pages; only link out to a real
  // web URL from the sidecar, never any other scheme.
  const paperUrl =
    collection.url && /^https?:\/\//.test(collection.url) ? collection.url : null

  return (
    <div
      className="mb-3"
      style={{
        padding: "8px 12px",
        borderLeft: "2px solid var(--fg-muted)",
        background: "var(--bg-warm)",
        color: "var(--fg)",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div>
        From <span style={{ fontWeight: 600 }}>{collection.display_name}</span>
        {paperUrl && (
          <>
            {" · "}
            <a
              href={paperUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-[color:var(--accent)]"
              style={{ color: "var(--fg-muted)" }}
            >
              paper ↗
            </a>
          </>
        )}
      </div>
      <div style={{ color: "var(--fg-muted)" }}>
        Runs used larger inference budgets than standard evaluation setups.
        {assisted > 0 && (
          <>
            {" "}
            {assisted} of {total} runs received oracle score feedback (the model
            was told when its answer was correct).
          </>
        )}
      </div>
    </div>
  )
}
