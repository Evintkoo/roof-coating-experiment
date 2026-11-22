import { expect, test } from "bun:test"
import {
  createLoop,
  type FrameStats,
  type LoopDeps,
  testHooksEnabled,
} from "../../../src/web/anim/loop"

// A fake frame source: a test calls `step(ms)` to deliver the one pending frame, so the loop is fully deterministic.
function rig(opts: { hidden?: boolean } = {}) {
  let pending: ((t: number) => void) | null = null
  let now = 1000
  let hidden = opts.hidden === true
  let vis: (() => void) | null = null
  let outstanding = 0
  let maxOutstanding = 0
  const stats: FrameStats[] = []
  const deps: LoopDeps = {
    raf: (cb) => {
      pending = cb
      outstanding++
      maxOutstanding = Math.max(maxOutstanding, outstanding)
      return 1
    },
    caf: () => {
      if (pending) outstanding--
      pending = null
    },
    hidden: () => hidden,
    onVisibility: (cb) => {
      vis = cb
      return () => {
        vis = null
      }
    },
    onStats: (s) => stats.push(s),
  }
  return {
    deps,
    stats,
    step(ms: number) {
      now += ms
      const cb = pending
      pending = null
      if (cb) {
        outstanding--
        cb(now)
      }
    },
    hasPending: () => pending !== null,
    setHidden(h: boolean) {
      hidden = h
      vis?.()
    },
    maxOutstanding: () => maxOutstanding,
  }
}

test("noFrameIsRequestedUntilATickerExistsAndStaysAtZero", () => {
  const r = rig()
  const loop = createLoop(r.deps)
  expect(r.hasPending()).toBe(false)
  expect(loop.frames()).toBe(0)
  expect(loop.running()).toBe(false)
})

test("oneFrameChainDeliversDtToEveryTickerAndStopsWithTheLastOne", () => {
  const r = rig()
  const loop = createLoop(r.deps)
  const a: number[] = []
  const b: number[] = []
  const offA = loop.add((dt) => a.push(dt))
  loop.add((dt) => b.push(dt))
  r.step(16)
  r.step(16)
  r.step(17)
  expect(a).toEqual([0, 16, 17]) // the first frame has no previous one
  expect(b).toEqual(a)
  expect(loop.frames()).toBe(3)
  expect(r.maxOutstanding()).toBe(1) // never two chains
  offA()
  r.step(16)
  expect(a.length).toBe(3)
  expect(b.length).toBe(4)
})

test("aHiddenPageRunsNoFramesAndResumesWithoutAJump", () => {
  const r = rig()
  const loop = createLoop(r.deps)
  const dts: number[] = []
  loop.add((dt) => dts.push(dt))
  r.step(16)
  r.step(16)
  const before = loop.frames()
  r.setHidden(true)
  expect(r.hasPending()).toBe(false)
  expect(loop.running()).toBe(false)
  r.step(5000) // nothing is delivered while hidden
  expect(loop.frames()).toBe(before)
  r.setHidden(false)
  expect(r.hasPending()).toBe(true)
  r.step(16)
  r.step(16)
  expect(dts.slice(before)).toEqual([0, 16]) // the 5 s hidden gap is not a tick
})

test("startedWhileHiddenWaitsForVisibility", () => {
  const r = rig({ hidden: true })
  const loop = createLoop(r.deps)
  loop.add(() => {})
  expect(r.hasPending()).toBe(false)
  r.setHidden(false)
  expect(r.hasPending()).toBe(true)
})

test("aLongGapIsAPauseNotASlowFrame", () => {
  const r = rig()
  const loop = createLoop(r.deps)
  const dts: number[] = []
  loop.add((dt) => dts.push(dt))
  r.step(16)
  r.step(900)
  r.step(16)
  expect(dts).toEqual([0, 0, 16])
})

test("frameStatsArriveOncePerSecondWithPercentilesAndDroppedFrames", () => {
  const r = rig()
  const loop = createLoop(r.deps)
  loop.add(() => {})
  for (let i = 0; i < 80; i++) r.step(i % 20 === 19 ? 40 : 16)
  expect(r.stats.length).toBeGreaterThanOrEqual(1)
  const s = r.stats[0] as FrameStats
  expect(s.frames).toBeGreaterThan(30)
  expect(s.p50_ms).toBe(16)
  expect(s.p95_ms).toBeGreaterThanOrEqual(16)
  expect(s.dropped).toBeGreaterThanOrEqual(1)
})

test("destroyStopsEverything", () => {
  const r = rig()
  const loop = createLoop(r.deps)
  loop.add(() => {})
  loop.destroy()
  expect(r.hasPending()).toBe(false)
  r.setHidden(false)
  expect(r.hasPending()).toBe(false)
})

test("testHooksExistOnlyWithTheFragment", () => {
  expect(testHooksEnabled("#test")).toBe(true)
  expect(testHooksEnabled("#a&test")).toBe(true)
  expect(testHooksEnabled("")).toBe(false)
  expect(testHooksEnabled("#testing")).toBe(false)
  expect(testHooksEnabled("#why")).toBe(false)
})

// H14: the animation JS added to the page stays under T_js_kib, frozen after Task 5 from the measured size
// (docs/spikes/plan-07.md: 43.9 KiB unminified without the inline lane, 74.5 KiB with it; cap 150).
const T_JS_KIB = 100
test("animationJsStaysUnderTheFrozenSizeH14", async () => {
  const root = new URL("../../../", import.meta.url).pathname
  const entry = `${root}tests/support/sizeEntry.ts`
  const out = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "iife",
    minify: false,
    root,
  })
  expect(out.success).toBe(true)
  const kib = Buffer.byteLength(await (out.outputs[0] as Blob).text()) / 1024
  expect(kib).toBeLessThan(T_JS_KIB)
  expect(kib).toBeGreaterThan(10) // the entry really pulls the animation code in
})
