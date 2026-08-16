import type { Metadata } from "next"

import { getEvalSummaryById, getMergedBenchmarkSummary } from "@/lib/data-backend"
import { isMergedEvalId, routeIdFromSegments, routeIdToPath } from "@/lib/utils"

/**
 * Server-side metadata for the eval/benchmark detail page. Mirrors
 * app/models/[...id]/layout.tsx — the page itself is a client
 * component, so this sibling owns the OpenGraph payload so unfurls
 * surface the specific benchmark's name + per-benchmark thumbnail
 * (rendered by /api/og/evals/<id>).
 */
export async function generateMetadata(props: {
  params: Promise<{ id: string | string[] }>
}): Promise<Metadata> {
  const { id } = await props.params
  const routeId = routeIdFromSegments(id)
  let evalName = "Benchmark"
  let category: string | null = null
  let modelsCount: number | null = null

  try {
    // Single-segment ids are merged all-sources benchmark pages (spec
    // F2); their identity lives in merged_evals_view, not evals_view.
    const merged = isMergedEvalId(routeId) ? await getMergedBenchmarkSummary(routeId) : null
    if (merged) {
      evalName = merged.display_name
      modelsCount = merged.models_count ?? null
    } else {
      const summary = await getEvalSummaryById(routeId)
      if (summary) {
        evalName =
          summary.canonical_display_name ??
          summary.evaluation_name ??
          summary.composite_display_name ??
          evalName
        category = summary.derived_tags?.[0] ?? null
        modelsCount = summary.models_count ?? null
      }
    }
  } catch {
    // Fall through to generic copy.
  }

  const idSlug = routeIdToPath(routeId)
  const title = category ? `${evalName} — ${category}` : evalName
  const description = modelsCount
    ? `${evalName} — ${modelsCount.toLocaleString("en-US")} models evaluated, with reproducibility, completeness, provenance, and comparability signals computed over every result.`
    : `${evalName} — reported model–benchmark results on Evaluation Cards.`
  const imageUrl = `/api/og/evals/${idSlug}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${evalName} — Evaluation Cards`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default function EvalDetailLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
