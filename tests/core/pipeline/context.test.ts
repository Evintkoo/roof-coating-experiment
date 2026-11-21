import { expect, test } from "bun:test"
import { makeWlGrid } from "../../../src/core/pipeline/context"

test("wlGridHas221PointsAndEndpoints", () => {
  const g = makeWlGrid()
  expect(g.length).toBe(221)
  expect(g[0]).toBe(0.3)
  expect(g[220]).toBe(2.5)
  for (let i = 1; i < g.length; i++)
    expect((g[i] as number) - (g[i - 1] as number)).toBeCloseTo(0.01, 12)
})
