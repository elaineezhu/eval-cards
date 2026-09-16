import { describe, expect, it } from "vitest"

import {
  groupByHeadlineModel,
  orderGroupsByScore,
  scoreSortBaseDirection,
} from "@/lib/eval-processing"

// The leaderboard arrives BEST first, which is descending on an accuracy
// metric and ascending on an error-rate one. A score sort that hard-codes
// "best first == descending" shows a lower-is-better board upside down the
// moment the user touches the control, and then reverses the wrong way.
//
// The sort also has to move whole models: a model's judge and protocol
// readings sit beneath its headline row, so reversing the flat row list
// would put every secondary reading above the row it belongs to.

interface Row {
  name: string
  score: number
  result: { is_headline?: boolean; model_route_id: string }
}

const row = (name: string, score: number, headline = true): Row => ({
  name,
  score,
  result: { is_headline: headline, model_route_id: name.split(" ")[0] },
})

// Two models, each with a secondary reading beneath its headline row, in
// the order the ranker emits them for the metric's own direction.
const bestFirst: Row[] = [
  row("a headline", 0.9),
  row("a judge", 0.95, false),
  row("b headline", 0.5),
  row("b judge", 0.4, false),
]
const groups = groupByHeadlineModel(bestFirst, (r) => r.result)
const names = (rows: Row[]) => rows.map((r) => r.name)

describe("leaderboard score sort", () => {
  it("names the direction the ranker's own order already reads in", () => {
    expect(scoreSortBaseDirection(false)).toBe("desc")
    expect(scoreSortBaseDirection(undefined)).toBe("desc")
    expect(scoreSortBaseDirection(null)).toBe("desc")
    expect(scoreSortBaseDirection(true)).toBe("asc")
  })

  it("sorts a higher-is-better metric in both directions", () => {
    // desc is the page's natural order: the 0.9 model first.
    expect(names(orderGroupsByScore(groups, "desc", false))).toEqual([
      "a headline",
      "a judge",
      "b headline",
      "b judge",
    ])
    // asc is the flip: the 0.5 model first, and still ahead of the 0.9 one.
    const asc = orderGroupsByScore(groups, "asc", false)
    expect(names(asc)).toEqual(["b headline", "b judge", "a headline", "a judge"])
    expect(asc[0].score).toBeLessThan(asc[2].score)
  })

  it("sorts a lower-is-better metric in both directions", () => {
    // Here the ranker emitted best-first == ascending, so `asc` is the
    // identity and `desc` is the flip — the opposite of the metric above.
    const asc = orderGroupsByScore(groups, "asc", true)
    expect(names(asc)).toEqual(["a headline", "a judge", "b headline", "b judge"])
    expect(asc[0].score).toBeGreaterThan(asc[2].score)

    const desc = orderGroupsByScore(groups, "desc", true)
    expect(names(desc)).toEqual(["b headline", "b judge", "a headline", "a judge"])
    expect(desc[0].score).toBeLessThan(desc[2].score)
  })

  it("keeps every secondary reading beneath its own headline row", () => {
    for (const lowerIsBetter of [false, true]) {
      for (const direction of ["asc", "desc"] as const) {
        const ordered = orderGroupsByScore(groups, direction, lowerIsBetter)
        expect(ordered).toHaveLength(bestFirst.length)
        for (const [index, entry] of ordered.entries()) {
          if (entry.result.is_headline === false) {
            expect(ordered[index - 1]?.result.model_route_id).toBe(
              entry.result.model_route_id,
            )
          }
        }
      }
    }
  })
})
