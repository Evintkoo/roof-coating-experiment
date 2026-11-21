import { expect, test } from "bun:test"
import fc from "fast-check"
import { SOBOL_MAX_DIM, sobolPoints } from "../../../src/core/opt/sobol"

test("firstPointsMatchTheKnownSequence", () => {
  expect(sobolPoints(4, 2)).toEqual([
    [0, 0],
    [0.5, 0.5],
    [0.75, 0.25],
    [0.25, 0.75],
  ])
})

test("everyDimensionIsStratifiedOnPowersOfTwo", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 10 }), fc.boolean(), (k, shifted) => {
      const n = 2 ** k
      const pts = sobolPoints(n, SOBOL_MAX_DIM, shifted ? 12345 : undefined)
      for (let d = 0; d < SOBOL_MAX_DIM; d++) {
        const cells = new Set(pts.map((p) => Math.floor((p[d] as number) * n)))
        if (cells.size !== n) return false
      }
      return true
    }),
    { numRuns: 20 },
  )
})

test("firstTwoDimensionsAreBalancedOnA4x4Grid", () => {
  // dimensions 1 and 2 form a (0, m, 2)-net in base 2: every 4 x 4 cell holds exactly one of the first 16 points
  const pts = sobolPoints(16, 2)
  const cells = new Set(
    pts.map(
      (p) =>
        Math.floor((p[0] as number) * 4) * 4 + Math.floor((p[1] as number) * 4),
    ),
  )
  expect(cells.size).toBe(16)
})

test("shiftIsDeterministicInRangeAndSeedDependent", () => {
  const a = sobolPoints(64, 9, 7)
  expect(sobolPoints(64, 9, 7)).toEqual(a)
  expect(sobolPoints(64, 9, 8)).not.toEqual(a)
  for (const p of a) for (const v of p) expect(v >= 0 && v < 1).toBe(true)
})

test("badArgumentsThrow", () => {
  expect(() => sobolPoints(4, 0)).toThrow(RangeError)
  expect(() => sobolPoints(4, SOBOL_MAX_DIM + 1)).toThrow(RangeError)
  expect(() => sobolPoints(-1, 2)).toThrow(RangeError)
})
