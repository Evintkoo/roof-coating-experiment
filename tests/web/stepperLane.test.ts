import { beforeAll, expect, test } from "bun:test"
import type { ModelContext } from "../../src/core/pipeline/context"
import { contextToJson } from "../../src/core/pipeline/contextJson"
import type { LiveInputs } from "../../src/core/pipeline/live"
import {
  type LaneReply,
  openStepperLane,
  type StepperLane,
} from "../../src/web/stepperLane"
import { testCtx } from "../support/dayData"
import { twelveSettings } from "../support/liveSettings"

// Frozen from the plan 09 spike (docs/spikes/plan-09.md), never edited.
const T_STEP_MS = 4
const WORKER_URL = new URL("../../src/web/worker.ts", import.meta.url)
let ctx: ModelContext
let ctxJson: string
let inputs: LiveInputs
let moved: LiveInputs
beforeAll(async () => {
  ctx = await testCtx()
  ctxJson = contextToJson(ctx)
  const s = twelveSettings(ctx)
  inputs = s[0] as LiveInputs
  moved = {
    ...inputs,
    scenario: { ...inputs.scenario, irradiance_w_m2: 500, wind_m_s: 1 },
  }
})

const lane = (
  o: { worker: boolean; ctx?: string; hangMs?: number } = { worker: true },
): StepperLane =>
  openStepperLane(o.ctx ?? ctxJson, inputs, {
    ...(o.worker ? { Worker, workerUrl: WORKER_URL } : {}),
    ...(o.hangMs ? { hangMs: o.hangMs } : {}),
  })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ok = (r: LaneReply | "stale"): LaneReply => {
  if (r === "stale") throw new Error("stale")
  return r
}

/** One logged request sequence: counts and a parameter change by step index; returns the bytes of every frame. */
async function drive(l: StepperLane, delayMs: number): Promise<string> {
  await l.ready
  const out: string[] = []
  let v = 1
  const step = async (n: number) => {
    out.push(JSON.stringify(ok(await l.request(n, v)).frames))
    if (delayMs > 0) await sleep(delayMs)
  }
  await step(5)
  await step(22)
  await step(1)
  v = 2
  l.setParams(moved, v)
  await step(360)
  await step(90)
  v = 3
  l.restart(inputs, v)
  await step(7)
  l.close()
  return out.join("\n")
}

test("workerEqualsInlineH3", async () => {
  const inline = await drive(lane({ worker: false }), 0)
  expect(inline.length).toBeGreaterThan(1000)
  for (const d of [0, 7, 40]) {
    const w = lane()
    const bytes = await drive(w, d)
    expect(bytes).toBe(inline)
  }
})

test("workerKindAndInlineKind", async () => {
  const w = lane()
  await w.ready
  expect(w.kind()).toBe("worker")
  w.close()
  const i = lane({ worker: false })
  await i.ready
  expect(i.kind()).toBe("inline")
})

test("staleReplyIsDroppedH16", async () => {
  for (const o of [{ worker: true }, { worker: false }]) {
    const l = lane(o)
    await l.ready
    const old = l.request(10, 1)
    l.setParams(moved, 2) // a slider change while the request is in flight
    expect(await old).toBe("stale")
    const fresh = ok(await l.request(10, 2))
    expect(fresh.version).toBe(2)
    expect(fresh.frames.recipe.length).toBe(10)
    // the overtaken request stepped nothing: model time did not run ahead of what was shown
    expect(fresh.frames.recipe[0]?.tS).toBe(86400)
    l.close()
  }
})

test("closeTerminatesWithin500msH16", async () => {
  const l = lane()
  await l.ready
  ok(await l.request(3, 1))
  const t0 = performance.now()
  const pending = l.request(3, 1)
  l.close()
  expect(performance.now() - t0).toBeLessThan(500)
  expect(
    await pending.then(
      () => "settled",
      () => "settled",
    ),
  ).toBe("settled")
  expect(await l.request(1, 5)).toBe("stale")
})

test("killedWorkerFallsBackToInlineF4", async () => {
  const undisturbed = lane({ worker: false })
  await undisturbed.ready
  const a1 = ok(await undisturbed.request(30, 1))
  const a2 = ok(await undisturbed.request(30, 1))
  const w = lane()
  await w.ready
  expect(w.kind()).toBe("worker")
  const b1 = ok(await w.request(30, 1))
  w.kill()
  const b2 = ok(await w.request(30, 1)) // the inline lane replays the log and carries on
  expect(w.kind()).toBe("inline")
  expect(JSON.stringify([b1, b2])).toBe(JSON.stringify([a1, a2]))
  // killed while a request is in flight: the same bytes as an undisturbed inline run
  const w2 = lane()
  await w2.ready
  const inflight = w2.request(60, 1)
  w2.kill()
  const ref = lane({ worker: false })
  await ref.ready
  expect(JSON.stringify(ok(await inflight).frames)).toBe(
    JSON.stringify(ok(await ref.request(60, 1)).frames),
  )
  expect(w2.kind()).toBe("inline")
})

test("noWorkerUsesInlineF4", async () => {
  const l = lane({ worker: false })
  await l.ready
  expect(l.kind()).toBe("inline")
  expect(ok(await l.request(2, 1)).frames.c0.length).toBe(2)
})

test("truncatedContextShowsErrorF11", async () => {
  for (const o of [{ worker: true }, { worker: false }]) {
    const l = lane({ ...o, ctx: ctxJson.slice(0, 500) })
    const t0 = performance.now()
    await expect(l.ready).rejects.toBeInstanceOf(Error)
    expect(performance.now() - t0).toBeLessThan(10_000) // T_hang_s
    await expect(l.request(1, 1)).rejects.toBeInstanceOf(Error)
  }
})

test("outOfRangeParamsKeepTheLastValidFrameF3", async () => {
  const l = lane()
  await l.ready
  const before = ok(await l.request(3, 1))
  l.setParams(
    { ...inputs, scenario: { ...inputs.scenario, irradiance_w_m2: 2500 } },
    2,
  )
  const after = ok(await l.request(3, 2))
  expect(l.lastError()).toBe("physics_range")
  // the stepper kept its parameters: the next frames continue the same day
  expect(after.frames.recipe[0]?.tS).toBe(
    (before.frames.recipe[2]?.tS ?? 0) + 60,
  )
  l.close()
})

test("requestLogReplaysToTheSameBytesH3", async () => {
  const l = lane({ worker: false })
  await l.ready
  ok(await l.request(40, 1))
  l.setParams(moved, 2)
  ok(await l.request(25, 2))
  const log = l.requestLog()
  expect(log.map((e) => e.op)).toEqual(["init", "step", "params", "step"])
  const again = lane({ worker: false })
  await again.ready
  const r1 = ok(await again.request(40, 1))
  again.setParams(moved, 2)
  const r2 = ok(await again.request(25, 2))
  const l2 = ok(await l.request(5, 2))
  const a2 = ok(await again.request(5, 2))
  expect(JSON.stringify(l2)).toBe(JSON.stringify(a2))
  expect(r1.frames.recipe.length + r2.frames.recipe.length).toBe(65)
})

test("roundTripWithinBudgetH12", async () => {
  const l = lane()
  await l.ready
  for (let i = 0; i < 20; i++) ok(await l.request(6, 1))
  const ms: number[] = []
  for (let i = 0; i < 200; i++) {
    const t0 = performance.now()
    ok(await l.request(6, 1)) // six steps: one 4x frame
    ms.push(performance.now() - t0)
  }
  ms.sort((a, b) => a - b)
  const p95 = ms[Math.floor(0.95 * ms.length)] as number
  console.log(
    `stepper worker round trip, 6 steps, 200 requests (Bun): median ${(ms[100] as number).toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, max ${(ms[199] as number).toFixed(3)} ms (T_step_ms ${T_STEP_MS})`,
  )
  expect(p95).toBeLessThanOrEqual(T_STEP_MS)
  l.close()
})
