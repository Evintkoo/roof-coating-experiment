import { expect, test } from "bun:test"
import fc from "fast-check"
import {
  advance,
  type ClockState,
  DAY_H,
  HOURS_PER_SECOND,
  initialClock,
  type LoopMode,
  seek,
} from "../../../src/core/anim/timeline"

const modes: LoopMode[] = ["once", "loop", "hold"]
const anyNumber = fc.oneof(
  fc.double({ noNaN: false, min: -1e9, max: 1e9 }),
  fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -0,
  ),
)

test("advanceNeverEmitsInvalidTime", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...modes),
      anyNumber,
      anyNumber,
      anyNumber,
      fc.boolean(),
      (mode, t0, dt, speed, playing) => {
        const s = advance(
          { tH: seek(initialClock(mode), t0).tH, mode, playing },
          dt,
          speed,
        )
        expect(Number.isFinite(s.tH)).toBe(true)
        expect(s.tH).toBeGreaterThanOrEqual(0)
        expect(s.tH).toBeLessThanOrEqual(DAY_H)
      },
    ),
  )
})

test("seekClampsF11", () => {
  const c = initialClock("once")
  expect(seek(c, -5).tH).toBe(0)
  expect(seek(c, 99).tH).toBe(DAY_H)
  expect(seek(c, Number.NaN).tH).toBe(0)
  expect(seek(c, Number.POSITIVE_INFINITY).tH).toBe(DAY_H)
  expect(seek(c, 7.5).tH).toBe(7.5)
})

test("negativeOrNaNSpeedAndDtNeverMoveTheClock", () => {
  const c: ClockState = { tH: 5, mode: "loop", playing: true }
  for (const [dt, sp] of [
    [-100, 1],
    [100, -1],
    [100, Number.NaN],
    [Number.NaN, 1],
  ] as const)
    expect(advance(c, dt, sp).tH).toBe(5)
})

test("advanceMovesByDtTimesSpeedOnTheDayScale", () => {
  // one real second at 1x plays HOURS_PER_SECOND of model time (a day in 16 s;
  // 4x plays it in 4 s, inside the 5 s autoplay rule of plan 07 D6)
  const c: ClockState = { tH: 1, mode: "once", playing: true }
  expect(advance(c, 1000, 1).tH).toBeCloseTo(1 + HOURS_PER_SECOND, 12)
  expect(advance(c, 1000, 4).tH).toBeCloseTo(1 + 4 * HOURS_PER_SECOND, 12)
  expect(DAY_H / (4 * HOURS_PER_SECOND)).toBeLessThan(5)
})

test("pausedClockDoesNotAdvance", () => {
  const c: ClockState = { tH: 3, mode: "loop", playing: false }
  expect(advance(c, 5000, 1).tH).toBe(3)
})

test("onceStopsAtTheEnd", () => {
  const s = advance({ tH: 23.9, mode: "once", playing: true }, 10_000, 1)
  expect(s.tH).toBe(DAY_H)
  expect(s.playing).toBe(false)
})

test("loopWraps", () => {
  const s = advance({ tH: 23.9, mode: "loop", playing: true }, 1000, 1)
  expect(s.tH).toBeCloseTo(23.9 + HOURS_PER_SECOND - DAY_H, 9)
  expect(s.playing).toBe(true)
})

test("holdClampsAndKeepsPlayingFlag", () => {
  const s = advance({ tH: 23.9, mode: "hold", playing: true }, 10_000, 1)
  expect(s.tH).toBe(DAY_H)
  expect(s.playing).toBe(true)
})

test("loopWrapStaysInRangeForHugeSteps", () => {
  const s = advance({ tH: 0, mode: "loop", playing: true }, 1e9, 4)
  expect(s.tH).toBeGreaterThanOrEqual(0)
  expect(s.tH).toBeLessThan(DAY_H)
})
