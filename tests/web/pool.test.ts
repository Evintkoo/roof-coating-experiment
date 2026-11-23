import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  sweepChunkSafe,
  sweepValues,
  sweepVariables,
} from "../../src/core/anim/sweep"
import { defaultLiveState, LIVE_SEED } from "../../src/web/liveState"
import {
  autoSize,
  chunkByCandidate,
  type SweepKind,
  sweepTasks,
} from "../../src/web/pool"
import { testCtx } from "../support/dayData"
import { type Harness, startPoolHarness } from "../support/poolBrowser"

let h: Harness
let sweep: SweepKind["sweep"]
let sequential: string
/** Largest absolute difference between the numbers of two JSON documents of the same shape (null equals null). */
function maxDiff(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b)
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return a === b ? 0 : Number.POSITIVE_INFINITY
  const ka = Object.keys(a as object)
  if (ka.length !== Object.keys(b as object).length)
    return Number.POSITIVE_INFINITY
  return Math.max(
    0,
    ...ka.map((k) =>
      maxDiff(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    ),
  )
}
const T_SPEEDUP = 1.5 // inherited floor (plan 07), re-measured for the sweep
beforeAll(async () => {
  h = await startPoolHarness()
  const ctx = await testCtx()
  const base = defaultLiveState(ctx.ranges, ctx.weather).inputs
  const v = sweepVariables(ctx.ranges, ctx.weather)[4] // midcoat DFT
  if (!v) throw new Error("no sweep variable")
  const values = sweepValues(v, base.design.midcoat_dft_um, 41)
  sweep = { base, v, values, nDraws: 32, seed: LIVE_SEED }
  sequential = JSON.stringify(
    sweepChunkSafe(
      ctx,
      base,
      v,
      values,
      values.map((_, i) => i),
      32,
      LIVE_SEED,
    ).map((o) => o.value),
  )
}, 120000)
afterAll(async () => {
  await h?.close()
}, 60000)

test("sizeAndChunkingArePure", () => {
  expect(autoSize(10)).toBe(6)
  expect(autoSize(4)).toBe(3)
  expect(autoSize(1)).toBe(1)
  expect(autoSize(undefined)).toBe(1)
  const ch = chunkByCandidate([
    { index: 0, candidate: 0, scenario: 0 },
    { index: 1, candidate: 0, scenario: 1 },
    { index: 2, candidate: 1, scenario: 0 },
  ])
  expect(ch.map((c) => c.length)).toEqual([2, 1])
})

test("sameBytesForOneTwoFourWorkers", async () => {
  const p = await h.page()
  const out: Record<number, string> = {}
  let vals: number[][] = []
  for (const size of [1, 2, 4]) {
    await p.evaluate(({ w, c, d, s }) => window.T.make(w, c, d, s), {
      w: h.workerSrc,
      c: h.ctxJson,
      d: h.data,
      s: size,
    })
    const r = await p.evaluate(() => window.T.full(96))
    out[size] = r.json
    vals = r.vals
    expect(r.n).toBe(864)
    await p.evaluate(() => window.T.terminate())
  }
  expect(out[2]).toBe(out[1] as string)
  expect(out[4]).toBe(out[1] as string)
  // H7: the 864 x 3 nominal values equal the batch columns within 1e-9
  let max = 0
  let compared = 0
  vals.forEach((v, i) => {
    const r = h.rows[i] as (typeof h.rows)[number]
    for (const [a, b] of [
      [v[0], r.r_solar_pred],
      [v[1], r.t_max_pred],
      [v[2], r.q_in_mean_w_m2],
    ] as const) {
      max = Math.max(max, Math.abs((a as number) - b))
      compared++
    }
  })
  expect(compared).toBe(2592)
  expect(max).toBeLessThan(1e-9)
  await p.context().close()
}, 120000)

test("withDrawsSameBytesForOneAndThreeWorkers", async () => {
  const p = await h.page()
  const r: string[] = []
  for (const size of [1, 3]) {
    await p.evaluate(
      ({ w, c, d, s }) => window.T.make(w, c, d, s, { draws: 32 }),
      { w: h.workerSrc, c: h.ctxJson, d: h.data, s: size },
    )
    const x = await p.evaluate(() => window.T.full(6))
    expect(x.n).toBe(54)
    expect(x.vals[0]?.length).toBe(5)
    r.push(x.json)
    await p.evaluate(() => window.T.terminate())
  }
  expect(r[1]).toBe(r[0] as string)
  await p.context().close()
}, 120000)

test("cancelPaintsNothingAndTerminates", async () => {
  const p = await h.page()
  await p.evaluate(({ w, c, d }) => window.T.make(w, c, d, 2, { draws: 32 }), {
    w: h.workerSrc,
    c: h.ctxJson,
    d: h.data,
  })
  const x = await p.evaluate(() => window.T.cancelAfter(150, 96))
  expect(x.why).toBe("cancelled")
  expect(x.after).toBe(x.atCancel) // nothing painted after the cancel
  expect(x.atCancel).toBeLessThan(864)
  expect(x.live).toBe(0) // every worker terminated synchronously, far inside 500 ms
  expect(x.cancelMs).toBeLessThan(500)
  // and the pool still serves the next run
  const next = await p.evaluate(() => window.T.full(2))
  expect(next.n).toBe(18)
  await p.context().close()
}, 120000)

test("noWorkerLeakAfter20Cycles", async () => {
  const p = await h.page()
  await p.evaluate(({ w, c, d }) => window.T.make(w, c, d, 3, { draws: 32 }), {
    w: h.workerSrc,
    c: h.ctxJson,
    d: h.data,
  })
  for (let i = 0; i < 20; i++) {
    const x = await p.evaluate(() => window.T.cancelAfter(5, 96))
    expect(x.live).toBe(0)
    expect(x.after).toBe(x.atCancel)
  }
  const last = await p.evaluate(() => window.T.full(2))
  expect(last.n).toBe(18)
  const s = await p.evaluate(() => window.T.stats())
  expect(s.live).toBe(3) // equals the pool size: nothing leaked
  expect(s.created - s.terminated).toBe(3)
  await p.context().close()
}, 120000)

test("killedWorkerIsVisibleAndRecovers", async () => {
  const p = await h.page()
  await p.evaluate(({ w, c, d }) => window.T.make(w, c, d, 3, { draws: 32 }), {
    w: h.workerSrc,
    c: h.ctxJson,
    d: h.data,
  })
  const x = await p.evaluate(() => window.T.failure(24, 100, 1))
  expect(x.n).toBe(216)
  expect(x.lanes.some((l) => l.state === "failed")).toBe(true)
  const ev = await p.evaluate(() => window.T.events())
  expect(ev.some((e) => e.name === "pool.worker.failed")).toBe(true)
  // the surviving lanes produced the batch nominal values
  let max = 0
  x.vals.forEach((v, i) => {
    const r = h.rows[i] as (typeof h.rows)[number]
    max = Math.max(
      max,
      Math.abs((v[0] as number) - r.r_solar_pred),
      Math.abs((v[1] as number) - r.t_max_pred),
      Math.abs((v[2] as number) - r.q_in_mean_w_m2),
    )
  })
  expect(max).toBeLessThan(1e-9)
  await p.context().close()
}, 120000)

test("aHungWorkerEndsInAVisibleErrorNotASilentHang", async () => {
  const p = await h.page()
  const silent =
    "onmessage=(e)=>{if(e.data.type==='init')postMessage({type:'ready'})}"
  await p.evaluate(
    ({ w, c, d, s }) =>
      window.T.make(w, c, d, 2, { hangMs: 400, workerOverride: s }),
    { w: h.workerSrc, c: h.ctxJson, d: h.data, s: silent },
  )
  const x = await p.evaluate(() => window.T.expectRejection(4))
  expect(x.rejected).toBe(true)
  expect(x.reason).toBe("failed")
  expect(x.ms).toBeLessThan(3000)
  const ev = await p.evaluate(() => window.T.events())
  expect(ev.filter((e) => e.name === "pool.worker.failed").length).toBe(2)
  await p.context().close()
}, 60000)

test("missingWorkerApiFallsBackToOneLane", async () => {
  const p = await h.page({ noWorker: true })
  const m = await p.evaluate(
    ({ w, c, d }) => window.T.make(w, c, d, 4, { withInline: true }),
    { w: h.workerSrc, c: h.ctxJson, d: h.data },
  )
  expect(m.mode).toBe("inline")
  expect(m.size).toBe(1)
  const x = await p.evaluate(() => window.T.full(96))
  expect(x.n).toBe(864)
  const ev = await p.evaluate(() => window.T.events())
  expect(ev.some((e) => e.name === "pool.fallback")).toBe(true)
  const lanes = await p.evaluate(() => window.T.lanes())
  expect(lanes.length).toBe(1)
  expect(lanes[0]?.inline).toBe(true)
  let max = 0
  x.vals.forEach((v, i) => {
    const r = h.rows[i] as (typeof h.rows)[number]
    max = Math.max(
      max,
      Math.abs((v[0] as number) - r.r_solar_pred),
      Math.abs((v[2] as number) - r.q_in_mean_w_m2),
    )
  })
  expect(max).toBeLessThan(1e-9)
  await p.context().close()
}, 120000)

test("missingWorkerApiWithoutAnInlineLaneIsAVisibleError", async () => {
  const p = await h.page({ noWorker: true })
  const x = await p.evaluate(({ w, c, d }) => window.T.rawCreate(w, c, d, 2), {
    w: h.workerSrc,
    c: h.ctxJson,
    d: h.data,
  })
  expect(x.ok).toBe(false)
  expect(x.reason).toBe("no_worker")
  await p.context().close()
}, 60000)

test("truncatedContextShowsErrorState", async () => {
  const p = await h.page()
  const x = await p.evaluate(({ w, c, d }) => window.T.rawCreate(w, c, d, 2), {
    w: h.workerSrc,
    c: h.ctxJson.slice(0, 1500),
    d: h.data,
  })
  expect(x.ok).toBe(false)
  expect(x.reason).toBe("init")
  expect(x.ms).toBeLessThan(3000)
  expect(x.events.some((e) => e.name === "pool.worker.failed")).toBe(true)
  await p.context().close()
}, 60000)

test("hiddenTabStillCorrect", async () => {
  const p = await h.page({ hidden: true })
  expect(await p.evaluate(() => document.hidden)).toBe(true)
  await p.evaluate(({ w, c, d }) => window.T.make(w, c, d, 2), {
    w: h.workerSrc,
    c: h.ctxJson,
    d: h.data,
  })
  const x = await p.evaluate(() => window.T.full(96))
  expect(x.n).toBe(864)
  const ref = await startRef(h)
  expect(x.json).toBe(ref)
  await p.context().close()
}, 120000)

async function startRef(hh: Harness): Promise<string> {
  const p = await hh.page()
  await p.evaluate(({ w, c, d }) => window.T.make(w, c, d, 1), {
    w: hh.workerSrc,
    c: hh.ctxJson,
    d: hh.data,
  })
  const r = await p.evaluate(() => window.T.full(96))
  await p.context().close()
  return r.json
}

test("sweepTasksAreOnePointEach", () => {
  const t = sweepTasks(5)
  expect(t.map((x) => x.index)).toEqual([0, 1, 2, 3, 4])
  expect(chunkByCandidate(t).map((c) => c.length)).toEqual([1, 1, 1, 1, 1])
})

test("sweepOnPoolEqualsSequentialAt1_2_4H7", async () => {
  const p = await h.page()
  const bytes: string[] = []
  for (const size of [1, 2, 4]) {
    await p.evaluate(({ w, c, s }) => window.T.makeSweep(w, c, s), {
      w: h.workerSrc,
      c: h.ctxJson,
      s: size,
    })
    const r = await p.evaluate((k) => window.T.sweep(k), sweep)
    expect(r.n).toBe(41)
    bytes.push(r.json)
    await p.evaluate(() => window.T.terminate())
  }
  // byte-identical for 1, 2 and 4 workers (one engine); equal to the Bun sequential call within 1e-9 (the engines differ in the last digit)
  expect(bytes[1]).toBe(bytes[0] as string)
  expect(bytes[2]).toBe(bytes[0] as string)
  expect(
    maxDiff(JSON.parse(bytes[0] as string), JSON.parse(sequential)),
  ).toBeLessThan(1e-9)
  await p.context().close()
}, 120000)

test("speedupFloorH7", async () => {
  const p = await h.page()
  const best: Record<number, number> = {}
  for (const size of [1, 4]) {
    await p.evaluate(({ w, c, s }) => window.T.makeSweep(w, c, s), {
      w: h.workerSrc,
      c: h.ctxJson,
      s: size,
    })
    let ms = Number.POSITIVE_INFINITY
    for (let i = 0; i < 2; i++)
      ms = Math.min(ms, (await p.evaluate((k) => window.T.sweep(k), sweep)).ms)
    best[size] = ms
    await p.evaluate(() => window.T.terminate())
  }
  const speedup = (best[1] as number) / (best[4] as number)
  console.log(
    `sweep in Chrome: 1 worker ${(best[1] as number).toFixed(0)} ms, 4 workers ${(best[4] as number).toFixed(0)} ms, speedup ${speedup.toFixed(2)}x (floor ${T_SPEEDUP}, T_sweep_s 2)`,
  )
  expect(speedup).toBeGreaterThanOrEqual(T_SPEEDUP)
  expect(best[4] as number).toBeLessThanOrEqual(2000)
  await p.context().close()
}, 120000)

test("sweepCancelPaintsNothingAndNoLeakH15", async () => {
  const p = await h.page()
  await p.evaluate(({ w, c }) => window.T.makeSweep(w, c, 3), {
    w: h.workerSrc,
    c: h.ctxJson,
  })
  for (let i = 0; i < 20; i++) {
    const x = await p.evaluate((k) => window.T.sweepCancelAfter(k, 5), sweep)
    expect(x.why).toBe("cancelled")
    expect(x.live).toBe(0)
    expect(x.after).toBe(x.atCancel)
  }
  const last = await p.evaluate((k) => window.T.sweep(k), sweep)
  expect(maxDiff(JSON.parse(last.json), JSON.parse(sequential))).toBeLessThan(
    1e-9,
  )
  const s = await p.evaluate(() => window.T.stats())
  expect(s.live).toBe(3) // equals the pool size: nothing leaked
  await p.context().close()
}, 120000)

test("killedWorkerRecoversF4", async () => {
  const p = await h.page()
  await p.evaluate(({ w, c }) => window.T.makeSweep(w, c, 3), {
    w: h.workerSrc,
    c: h.ctxJson,
  })
  const x = await p.evaluate((k) => window.T.sweepKill(k, 120, 1), sweep)
  expect(x.n).toBe(41)
  expect(x.lanes.some((l) => l.state === "failed")).toBe(true)
  // the chunk was re-queued: same bytes as an undisturbed run in the same engine
  await p.evaluate(() => window.T.terminate())
  await p.evaluate(({ w, c }) => window.T.makeSweep(w, c, 2), {
    w: h.workerSrc,
    c: h.ctxJson,
  })
  const calm = await p.evaluate((k) => window.T.sweep(k), sweep)
  expect(x.json).toBe(calm.json)
  expect(maxDiff(JSON.parse(x.json), JSON.parse(sequential))).toBeLessThan(1e-9)
  await p.context().close()
}, 120000)

test("inlineLaneF6", async () => {
  const p = await h.page({ noWorker: true })
  const m = await p.evaluate(
    ({ w, c }) => window.T.makeSweep(w, c, 4, { withInline: true }),
    { w: h.workerSrc, c: h.ctxJson },
  )
  expect(m.mode).toBe("inline")
  const r = await p.evaluate((k) => window.T.sweep(k), sweep)
  expect(maxDiff(JSON.parse(r.json), JSON.parse(sequential))).toBeLessThan(1e-9)
  const lanes = await p.evaluate(() => window.T.lanes())
  expect(lanes.length).toBe(1)
  expect(lanes[0]?.inline).toBe(true)
  await p.context().close()
}, 120000)
