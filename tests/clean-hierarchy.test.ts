import { describe, expect, it } from "vitest"

import type { EvalHierarchy, HierarchyFamily } from "@/lib/backend-artifacts"
import { cleanHierarchy, isHierarchyCleaned } from "@/lib/clean-hierarchy"

function family(key: string, displayName: string, extra: Partial<HierarchyFamily> = {}): HierarchyFamily {
  return {
    key,
    display_name: displayName,
    category: "General",
    tags: { domains: [], languages: [], tasks: [] },
    evals_count: 0,
    eval_summary_ids: [],
    ...extra,
  } as HierarchyFamily
}

describe("cleanHierarchy", () => {
  it("filters family-rollup benchmark_index entries (>2 distinct benchmark_keys)", () => {
    const raw: EvalHierarchy = {
      families: [],
      benchmark_index: [
        // Real cross-family entry (1 distinct benchmark_key) — should keep.
        {
          key: "aime",
          display_name: "AIME",
          appearances: [
            { family_key: "artificial-analysis", benchmark_key: "aime", eval_summary_ids: ["aa%2Faime"], is_canonical_home: false },
            { family_key: "llm-stats", benchmark_key: "aime", eval_summary_ids: ["llm-stats%2Faime"], is_canonical_home: false },
          ],
        },
        // Real 2-key entry — should keep.
        {
          key: "math-500",
          display_name: "MATH-500",
          appearances: [
            { family_key: "vals-ai", benchmark_key: "math-500", eval_summary_ids: ["vals-ai%2Fmath-500"], is_canonical_home: false },
            { family_key: "llm-stats", benchmark_key: "math", eval_summary_ids: ["llm-stats%2Fmath"], is_canonical_home: false },
          ],
        },
        // Family-rollup with 5 distinct benchmark_keys — should drop.
        {
          key: "artificial analysis",
          display_name: "artificial analysis",
          appearances: [
            { family_key: "artificial-analysis", benchmark_key: "aa-lcr", eval_summary_ids: ["aa%2Faa-lcr"], is_canonical_home: false },
            { family_key: "artificial-analysis", benchmark_key: "aime", eval_summary_ids: ["aa%2Faime"], is_canonical_home: false },
            { family_key: "artificial-analysis", benchmark_key: "gpqa", eval_summary_ids: ["aa%2Fgpqa"], is_canonical_home: false },
            { family_key: "artificial-analysis", benchmark_key: "hle", eval_summary_ids: ["aa%2Fhle"], is_canonical_home: false },
            { family_key: "artificial-analysis", benchmark_key: "math-500", eval_summary_ids: ["aa%2Fmath-500"], is_canonical_home: false },
          ],
        },
      ],
    }

    const cleaned = cleanHierarchy(raw)
    const keys = (cleaned.benchmark_index ?? []).map((e) => e.key)
    expect(keys).toContain("aime")
    expect(keys).toContain("math-500")
    expect(keys).not.toContain("artificial analysis")
  })

  it("dedupes (family_key, eval_summary_id) pairs", () => {
    // math-500 sometimes shows up with the same eval_summary_id under
    // both family=math and family=artificial-analysis pointing at the
    // same row. After cleaning, the appearances should have unique
    // pairs per (family_key, eval_summary_id).
    const raw: EvalHierarchy = {
      families: [],
      benchmark_index: [
        {
          key: "math-500",
          display_name: "MATH-500",
          appearances: [
            { family_key: "artificial-analysis", benchmark_key: "math-500", eval_summary_ids: ["aa%2Fmath-500", "aa%2Fmath-500"], is_canonical_home: false },
            { family_key: "vals-ai", benchmark_key: "math-500", eval_summary_ids: ["vals-ai%2Fmath-500"], is_canonical_home: false },
          ],
        },
      ],
    }

    const cleaned = cleanHierarchy(raw)
    const entry = cleaned.benchmark_index?.[0]
    expect(entry).toBeDefined()
    const aaApp = entry!.appearances.find((a) => a.family_key === "artificial-analysis")
    expect(aaApp?.eval_summary_ids).toEqual(["aa%2Fmath-500"])
  })

  it("drops degenerate entries with only one distinct family", () => {
    const raw: EvalHierarchy = {
      families: [],
      benchmark_index: [
        {
          key: "lonely",
          display_name: "Lonely",
          appearances: [
            { family_key: "fam-a", benchmark_key: "lonely", eval_summary_ids: ["fam-a%2Flonely"], is_canonical_home: false },
            { family_key: "fam-a", benchmark_key: "lonely", eval_summary_ids: ["fam-a%2Flonely-2"], is_canonical_home: false },
          ],
        },
      ],
    }

    const cleaned = cleanHierarchy(raw)
    expect(cleaned.benchmark_index).toEqual([])
  })

  it("decorates derivedTags top-down + bottom-up union", () => {
    const raw: EvalHierarchy = {
      families: [
        family("math-mc", "MATH-MC", {
          benchmarks: [
            {
              key: "level-1",
              display_name: "Level 1",
              family_id: "math-mc",
              is_slice: false,
              is_overall: false,
              has_card: true,
              tags: { domains: [], languages: [], tasks: [] },
              slices: [],
              metrics: [],
            } as never,
          ],
        }),
      ],
    }

    const cleaned = cleanHierarchy(raw)
    const fam = cleaned.families[0]
    // Family inherits tags from its children's union — the "math" tag
    // should propagate up even though the family name itself doesn't
    // resolve to a math entry in categories.json.
    expect(fam.derivedTags).toBeDefined()
    expect(fam.derivedTags?.length).toBeGreaterThan(0)
  })

  it("flattens split families (Fibble Arena, CapArena, AgentHarm) into a single composite", () => {
    const raw: EvalHierarchy = {
      families: [
        // Fibble: each split sits in its own composite.
        family("fibble-arena", "Fibble Arena", {
          composites: [
            {
              key: "fibble1-arena",
              display_name: "Fibble1-Arena",
              category: "General",
              tags: { domains: [], languages: [], tasks: [] },
              benchmarks: [
                {
                  key: "fibble1-arena",
                  display_name: "Fibble1-Arena",
                  family_id: "fibble-arena",
                  is_slice: false,
                  is_overall: false,
                  has_card: false,
                  tags: { domains: [], languages: [], tasks: [] },
                  slices: [],
                  metrics: [],
                  summary_eval_ids: ["fibble1-arena%2Ffibble1-arena"],
                },
              ],
            },
            {
              key: "fibble2-arena",
              display_name: "Fibble2 Arena (2 lies)",
              category: "General",
              tags: { domains: [], languages: [], tasks: [] },
              benchmarks: [
                {
                  key: "fibble2-arena",
                  display_name: "Fibble2-Arena",
                  family_id: "fibble-arena",
                  is_slice: false,
                  is_overall: false,
                  has_card: false,
                  tags: { domains: [], languages: [], tasks: [] },
                  slices: [],
                  metrics: [],
                  summary_eval_ids: ["fibble2-arena%2Ffibble2-arena"],
                },
              ],
            },
          ],
        }),
        // CapArena: all splits sit at family level (no composites).
        family("caparena", "CapArena-Auto", {
          benchmarks: [
            {
              key: "caparena-auto-avg",
              display_name: "Caparena-AUTO-AVG",
              family_id: "caparena",
              is_slice: false,
              is_overall: false,
              has_card: false,
              tags: { domains: [], languages: [], tasks: [] },
              slices: [],
              metrics: [],
              summary_eval_ids: ["caparena-auto%2Fcaparena-auto-avg"],
            },
            {
              key: "caparena-vs-gpt-4o",
              display_name: "Caparena-VS-GPT-4o",
              family_id: "caparena",
              is_slice: false,
              is_overall: false,
              has_card: false,
              tags: { domains: [], languages: [], tasks: [] },
              slices: [],
              metrics: [],
              summary_eval_ids: ["caparena-auto%2Fcaparena-vs-gpt-4o"],
            },
          ],
        }),
        // AgentHarm: same family-level layout as CapArena.
        family("agentharm", "agentharm", {
          benchmarks: [
            {
              key: "copyright",
              display_name: "Copyright",
              family_id: "agentharm",
              is_slice: false,
              is_overall: false,
              has_card: false,
              tags: { domains: [], languages: [], tasks: [] },
              slices: [],
              metrics: [],
              summary_eval_ids: ["agentharm%2Fcopyright"],
            },
            {
              key: "cybercrime",
              display_name: "Cybercrime",
              family_id: "agentharm",
              is_slice: false,
              is_overall: false,
              has_card: false,
              tags: { domains: [], languages: [], tasks: [] },
              slices: [],
              metrics: [],
              summary_eval_ids: ["agentharm%2Fcybercrime"],
            },
          ],
        }),
        // Untouched control: a non-split family stays as-is.
        family("helm", "HELM", {
          composites: [
            {
              key: "helm-classic",
              display_name: "HELM Classic",
              category: "General",
              tags: { domains: [], languages: [], tasks: [] },
              benchmarks: [],
            },
            {
              key: "helm-safety",
              display_name: "HELM Safety",
              category: "General",
              tags: { domains: [], languages: [], tasks: [] },
              benchmarks: [],
            },
          ],
        }),
      ],
    }

    const cleaned = cleanHierarchy(raw)
    const fams = Object.fromEntries(cleaned.families.map((f) => [f.key, f]))

    // Fibble: 2 composites collapse to 1; benchmarks preserved.
    expect(fams["fibble-arena"].composites).toHaveLength(1)
    expect(fams["fibble-arena"].composites?.[0].key).toBe("fibble-arena")
    expect(fams["fibble-arena"].composites?.[0].benchmarks?.map((b) => b.key)).toEqual(
      ["fibble1-arena", "fibble2-arena"],
    )

    // CapArena: family-level benchmarks moved into a synthetic composite.
    expect(fams.caparena.benchmarks ?? []).toHaveLength(0)
    expect(fams.caparena.composites).toHaveLength(1)
    expect(fams.caparena.composites?.[0].key).toBe("caparena-auto")
    expect(fams.caparena.composites?.[0].benchmarks?.map((b) => b.key)).toEqual(
      ["caparena-auto-avg", "caparena-vs-gpt-4o"],
    )

    // AgentHarm: family-level benchmarks moved into a synthetic composite.
    expect(fams.agentharm.benchmarks ?? []).toHaveLength(0)
    expect(fams.agentharm.composites?.[0].key).toBe("agentharm")
    expect(fams.agentharm.composites?.[0].benchmarks?.map((b) => b.key)).toEqual(
      ["copyright", "cybercrime"],
    )

    // Control: HELM keeps its two composites untouched.
    expect(fams.helm.composites).toHaveLength(2)
  })

  it("consolidates AIR-Bench under HELM > helm-air-bench, dropping the standalone family and stripping it from agentharm", () => {
    const raw: EvalHierarchy = {
      families: [
        family("helm", "HELM", {
          eval_summary_ids: ["helm-air-bench%2Fair-bench-2024"],
          composites: [
            {
              key: "helm-air-bench",
              display_name: "HELM AIR-Bench",
              category: "Safety",
              tags: { domains: [], languages: [], tasks: [] },
              benchmarks: [
                {
                  key: "air-bench-2024",
                  display_name: "AIR-Bench 2024",
                  family_id: "air-bench-2024",
                  is_slice: false,
                  is_overall: true,
                  has_card: false,
                  tags: { domains: [], languages: [], tasks: [] },
                  slices: [],
                  metrics: [],
                  summary_eval_ids: ["helm-air-bench%2Fair-bench-2024"],
                },
              ],
            },
          ],
        }),
        family("agentharm", "agentharm", {
          eval_summary_ids: [
            "agentharm%2FCopyright",
            "agentharm%2Fair-bench-2024-13-harassment",
            "agentharm%2Fair-bench-2024-32-fraud",
          ],
          benchmarks: [
            {
              key: "Copyright",
              display_name: "Copyright",
              family_id: "agentharm",
              is_slice: false,
              is_overall: false,
              has_card: false,
              tags: { domains: [], languages: [], tasks: [] },
              slices: [],
              metrics: [],
              summary_eval_ids: ["agentharm%2FCopyright"],
            },
            {
              key: "air-bench-2024-13-harassment",
              display_name: "AIR-Bench-2024-13-Harassment",
              family_id: "air-bench-2024",
              is_slice: false,
              is_overall: false,
              has_card: false,
              tags: { domains: [], languages: [], tasks: [] },
              slices: [],
              metrics: [],
              summary_eval_ids: ["agentharm%2Fair-bench-2024-13-harassment"],
            },
            {
              key: "air-bench-2024-32-fraud",
              display_name: "AIR-Bench-2024-32-Fraud",
              family_id: "air-bench-2024",
              is_slice: false,
              is_overall: false,
              has_card: false,
              tags: { domains: [], languages: [], tasks: [] },
              slices: [],
              metrics: [],
              summary_eval_ids: ["agentharm%2Fair-bench-2024-32-fraud"],
            },
          ],
        }),
        family("air-bench-2024", "Air Bench 2024", {
          eval_summary_ids: [
            "agentharm%2Fair-bench-2024-13-harassment",
            "agentharm%2Fair-bench-2024-32-fraud",
          ],
        }),
      ],
    }

    const cleaned = cleanHierarchy(raw)
    const fams = Object.fromEntries(cleaned.families.map((f) => [f.key, f]))

    // Standalone air-bench-2024 family is gone.
    expect(fams["air-bench-2024"]).toBeUndefined()

    // agentharm no longer carries AIR-Bench rows; the synthetic
    // composite from flattenSplitFamilies should only have Copyright
    // (the lone non-AIR-Bench leaf in this fixture).
    const agentharm = fams.agentharm
    expect(agentharm.eval_summary_ids).not.toContain(
      "agentharm%2Fair-bench-2024-13-harassment",
    )
    expect(agentharm.eval_summary_ids).not.toContain(
      "agentharm%2Fair-bench-2024-32-fraud",
    )
    const agentharmComposite = agentharm.composites?.[0]
    expect(agentharmComposite?.benchmarks?.map((b) => b.key)).toEqual([
      "Copyright",
    ])

    // HELM family now lists every AIR-Bench eval id (rollup + the 2
    // agentharm-sourced ones).
    expect(fams.helm.eval_summary_ids).toEqual(
      expect.arrayContaining([
        "helm-air-bench%2Fair-bench-2024",
        "agentharm%2Fair-bench-2024-13-harassment",
        "agentharm%2Fair-bench-2024-32-fraud",
      ]),
    )

    // The helm-air-bench composite's benchmark covers all three.
    const helmAirBench = fams.helm.composites?.find(
      (c) => c.key === "helm-air-bench",
    )
    const airBenchBench = helmAirBench?.benchmarks?.[0]
    expect(airBenchBench?.summary_eval_ids).toEqual(
      expect.arrayContaining([
        "helm-air-bench%2Fair-bench-2024",
        "agentharm%2Fair-bench-2024-13-harassment",
        "agentharm%2Fair-bench-2024-32-fraud",
      ]),
    )
  })

  it("is idempotent: re-applying produces identical output", () => {
    const raw: EvalHierarchy = {
      families: [family("aime", "AIME")],
      benchmark_index: [
        {
          key: "aime",
          display_name: "AIME",
          appearances: [
            { family_key: "fam-a", benchmark_key: "aime", eval_summary_ids: ["fam-a%2Faime"], is_canonical_home: false },
            { family_key: "fam-b", benchmark_key: "aime", eval_summary_ids: ["fam-b%2Faime"], is_canonical_home: false },
          ],
        },
      ],
    }

    const once = cleanHierarchy(raw)
    expect(isHierarchyCleaned(once)).toBe(true)
    const twice = cleanHierarchy(once)
    expect(twice).toBe(once)
  })
})
