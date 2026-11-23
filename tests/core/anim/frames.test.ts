import { expect, test } from "bun:test"
import fc from "fast-check"
import { sampleSeries } from "../../../src/core/anim/frames"

const t = Float64Array.from([0, 0.5, 1, 4, 24])
const v = Float64Array.from([10, 20, 15, 35, -5])

test("sampleSeriesMatchesExactAtNodes", () => {
  for (let i = 0; i < t.length; i++)
    expect(sampleSeries(t, v, t[i] as number)).toBe(v[i] as number)
})

test("sampleSeriesInterpolatesLinearly", () => {
  expect(sampleSeries(t, v, 0.25)).toBeCloseTo(15, 12)
  expect(sampleSeries(t, v, 2.5)).toBeCloseTo(25, 12)
})

test("sampleSeriesClampsAndHandlesNaN", () => {
  expect(sampleSeries(t, v, -3)).toBe(10)
  expect(sampleSeries(t, v, 99)).toBe(-5)
  expect(sampleSeries(t, v, Number.NaN)).toBe(10)
})

test("sampleSeriesStaysWithinNeighbourValues", () => {
  fc.assert(
    fc.property(fc.double({ min: 0, max: 24, noNaN: true }), (x) => {
      const y = sampleSeries(t, v, x)
      expect(y).toBeGreaterThanOrEqual(-5)
      expect(y).toBeLessThanOrEqual(35)
    }),
  )
})

test("sampleSeriesRejectsBadSeries", () => {
  expect(() =>
    sampleSeries(new Float64Array(0), new Float64Array(0), 1),
  ).toThrow()
  expect(() => sampleSeries(t, Float64Array.from([1, 2]), 1)).toThrow()
  expect(() =>
    sampleSeries(Float64Array.from([0, 2, 1]), Float64Array.from([1, 2, 3]), 1),
  ).toThrow()
})

test("singlePointSeriesIsConstant", () => {
  expect(sampleSeries(Float64Array.of(3), Float64Array.of(7), 100)).toBe(7)
})
