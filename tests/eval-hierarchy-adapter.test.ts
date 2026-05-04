import { describe, expect, it } from "vitest"

import type { EvalHierarchy } from "../lib/backend-artifacts"
import { adaptEvalHierarchy } from "../lib/hf-data"

describe("adaptEvalHierarchy", () => {
  it("keeps GPQA-Diamond as a benchmark sibling in the curated GPQA family", () => {
    const raw = {
      stats: {
        family_count: 1,
        composite_count: 1,
        benchmark_count: 2,
        slice_count: 0,
        metric_count: 2,
        metric_rows_scanned: 2,
      },
      families: [
        {
          key: "gpqa",
          display_name: "GPQA family",
          member_benchmark_keys: ["gpqa", "gpqa-diamond"],
        },
      ],
      composites: [
        {
          key: "wasp",
          display_name: "WASP",
          category: "Reasoning",
          tags: { domains: ["reasoning"], languages: [], tasks: ["qa"] },
          benchmarks: [
            {
              key: "gpqa",
              display_name: "GPQA",
              has_card: false,
              family_id: "gpqa",
              is_slice: false,
              tags: { domains: ["reasoning"], languages: [], tasks: ["qa"] },
              metrics: [{ key: "accuracy", display_name: "Accuracy" }],
              slices: [],
              summary_eval_ids: ["wasp%2Fgpqa"],
            },
            {
              key: "gpqa-diamond",
              display_name: "GPQA Diamond",
              has_card: false,
              family_id: "gpqa",
              is_slice: false,
              tags: { domains: ["reasoning"], languages: [], tasks: ["qa"] },
              metrics: [{ key: "accuracy", display_name: "Accuracy" }],
              slices: [],
              summary_eval_ids: ["wasp%2Fgpqa-diamond"],
            },
          ],
        },
      ],
    } as unknown as EvalHierarchy

    const adapted = adaptEvalHierarchy(raw)
    const gpqa = adapted.families.find((family) => family.key === "gpqa")

    expect(gpqa).toBeDefined()
    expect(gpqa?.standalone_benchmarks).toEqual([])
    expect(gpqa?.composites).toHaveLength(1)
    expect(gpqa?.composites?.[0].benchmarks.map((benchmark) => benchmark.key)).toEqual([
      "gpqa",
      "gpqa-diamond",
    ])
    expect(
      gpqa?.composites?.[0].benchmarks.flatMap((benchmark) =>
        benchmark.slices.map((slice) => slice.key),
      ),
    ).not.toContain("gpqa-diamond")
  })
})
