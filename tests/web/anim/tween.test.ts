import { expect, test } from "bun:test"
import fc from "fast-check"
import { createTweens } from "../../../src/web/anim/tween"

test("glidesThroughIntermediateValuesAndEndsExactly", () => {
  const tw = createTweens(() => false)
  const seen: number[] = []
  tw.to("t", 10, (v) => seen.push(v), 240) // first value: shown at once
  tw.to("t", 20, (v) => seen.push(v), 240)
  for (const ms of [0, 60, 120, 180, 240, 300]) tw.tick(1000 + ms)
  expect(seen[0]).toBe(10)
  const mid = seen.slice(1)
  expect(mid.some((v) => v > 10 && v < 20)).toBe(true)
  expect(mid[mid.length - 1]).toBe(20) // exact end
  expect(mid.every((v, i) => i === 0 || v >= (mid[i - 1] as number))).toBe(true)
  expect(tw.active()).toBe(0)
})

test("interruptedTweenRestartsFromTheValueShown", () => {
  const tw = createTweens(() => false)
  let shown = 0
  tw.to(
    "k",
    0,
    (v) => {
      shown = v
    },
    240,
  )
  tw.to(
    "k",
    100,
    (v) => {
      shown = v
    },
    240,
  )
  tw.tick(0)
  tw.tick(120)
  const mid = shown
  expect(mid).toBeGreaterThan(0)
  expect(mid).toBeLessThan(100)
  tw.to(
    "k",
    0,
    (v) => {
      shown = v
    },
    240,
  ) // reverse mid-flight
  tw.tick(121)
  expect(Math.abs(shown - mid)).toBeLessThan(5) // continues from where it was, no jump to 100 or 0
  tw.tick(121 + 240)
  expect(shown).toBe(0)
})

test("reducedMotionAndZeroDurationApplyAtOnce", () => {
  const tw = createTweens(() => true)
  const seen: number[] = []
  tw.to("k", 5, (v) => seen.push(v), 240)
  tw.to("k", 9, (v) => seen.push(v), 240)
  expect(seen).toEqual([5, 9])
  expect(tw.active()).toBe(0)
  const tw2 = createTweens(() => false)
  const s2: number[] = []
  tw2.to("k", 1, (v) => s2.push(v), 0)
  tw2.to("k", 2, (v) => s2.push(v), 0)
  expect(s2).toEqual([1, 2])
})

test("nonFiniteTargetsAreIgnored", () => {
  const tw = createTweens(() => false)
  const seen: number[] = []
  tw.to("k", Number.NaN, (v) => seen.push(v), 240)
  tw.to("k", Number.POSITIVE_INFINITY, (v) => seen.push(v), 240)
  expect(seen).toEqual([])
  expect(tw.current("k")).toBeUndefined()
})

test("neverLeavesTheRangeBetweenStartAndTargetAnyScheduleH13", () => {
  fc.assert(
    fc.property(
      fc.double({ min: -1000, max: 1000, noNaN: true }),
      fc.double({ min: -1000, max: 1000, noNaN: true }),
      fc.array(fc.integer({ min: 0, max: 400 }), {
        minLength: 1,
        maxLength: 12,
      }),
      (a, b, gaps) => {
        const tw = createTweens(() => false)
        const seen: number[] = []
        tw.to("k", a, () => {}, 240)
        tw.to("k", b, (v) => seen.push(v), 240)
        let now = 0
        tw.tick(now)
        for (const g of gaps) {
          now += g
          tw.tick(now)
        }
        tw.tick(now + 1000)
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        return (
          seen.every((v) => v >= lo && v <= hi) && seen[seen.length - 1] === b
        )
      },
    ),
  )
})

test("stopForgetsTheKeySoARunningTweenNeverWritesAgain", () => {
  const t = createTweens(() => false)
  const seen: number[] = []
  t.to("a", 0, (v) => seen.push(v), 100)
  t.to("a", 10, (v) => seen.push(v), 100)
  t.tick(0)
  t.tick(50)
  const n = seen.length
  t.stop("a")
  expect(t.active()).toBe(0)
  t.tick(200)
  expect(seen.length).toBe(n)
  // after a stop the next value is applied at once (nothing is shown to glide from)
  t.to("a", 3, (v) => seen.push(v), 100)
  expect(seen[seen.length - 1]).toBe(3)
  t.stop()
  expect(t.current("a")).toBeUndefined()
})
