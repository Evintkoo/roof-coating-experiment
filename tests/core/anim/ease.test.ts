import { expect, test } from "bun:test"
import fc from "fast-check"
import { easeStandard, tween } from "../../../src/core/anim/ease"

test("easeIsMonotoneAndHitsEndpoints", () => {
  expect(easeStandard(0)).toBe(0)
  expect(easeStandard(1)).toBe(1)
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        expect(easeStandard(lo)).toBeLessThanOrEqual(easeStandard(hi))
      },
    ),
  )
})

test("easeClampsOutsideAndOnNaN", () => {
  expect(easeStandard(-3)).toBe(0)
  expect(easeStandard(7)).toBe(1)
  expect(easeStandard(Number.NaN)).toBe(0)
})

test("tweenNeverOvershoots", () => {
  fc.assert(
    fc.property(
      fc.double({ min: -1e6, max: 1e6, noNaN: true }),
      fc.double({ min: -1e6, max: 1e6, noNaN: true }),
      fc.double({ min: -1e4, max: 1e5, noNaN: true }),
      fc.double({ min: -10, max: 1e4, noNaN: true }),
      (from, to, elapsed, dur) => {
        const v = tween(from, to, elapsed, dur)
        expect(v).toBeGreaterThanOrEqual(Math.min(from, to))
        expect(v).toBeLessThanOrEqual(Math.max(from, to))
      },
    ),
  )
})

test("tweenEndsExactlyAndStartsExactly", () => {
  expect(tween(2, 9, 0, 200)).toBe(2)
  expect(tween(2, 9, 200, 200)).toBe(9)
  expect(tween(2, 9, 5000, 200)).toBe(9)
  expect(tween(2, 9, 10, 0)).toBe(9) // zero duration = reduced motion: jump
  expect(tween(2, 9, 10, Number.NaN)).toBe(9)
})

test("interruptedTweenRestartsFromCurrent", () => {
  const mid = tween(0, 10, 100, 200)
  expect(mid).toBeGreaterThan(0)
  expect(mid).toBeLessThan(10)
  // a new target at elapsed 0 begins exactly where the old one was
  expect(tween(mid, 3, 0, 200)).toBe(mid)
  expect(tween(mid, 3, 200, 200)).toBe(3)
})
