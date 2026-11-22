// Page side of the pool tests (bundled to an IIFE and run in real Chrome): thin drivers around createPool that return plain data.
import {
  designsOf,
  type ScreeningData,
  screenChunk,
} from "../../src/core/anim/screening"
import { contextFromJson } from "../../src/core/pipeline/contextJson"
import {
  createPool,
  type Pool,
  type PoolOpts,
  type Task,
} from "../../src/web/pool"

type Ev = { name: string; level: string; f: Record<string, unknown> }
const inline: NonNullable<PoolOpts["inline"]> = (ctxJson, data, draws) => {
  const ctx = contextFromJson(ctxJson)
  const designs = designsOf(data)
  return (tasks) => screenChunk(ctx, designs, data.scenarios, tasks, draws)
}
const tasksFor = (data: ScreeningData, nCand: number): Task[] => {
  const out: Task[] = []
  const nS = data.scenarios.length
  for (let c = 0; c < nCand; c++)
    for (let s = 0; s < nS; s++)
      out.push({ index: c * nS + s, candidate: c, scenario: s })
  return out
}
const url = (src: string) =>
  URL.createObjectURL(new Blob([src], { type: "text/javascript" }))

;(window as unknown as { T: unknown }).T = {
  async make(
    workerSrc: string,
    ctxJson: string,
    data: ScreeningData,
    size: number,
    o: {
      draws?: number | null
      withInline?: boolean
      hangMs?: number
      workerOverride?: string
    } = {},
  ) {
    const events: Ev[] = []
    const pool = await createPool(
      size,
      url(o.workerOverride ?? workerSrc),
      ctxJson,
      {
        screening: data,
        draws: o.draws ?? null,
        ...(o.withInline ? { inline } : {}),
        ...(o.hangMs ? { hangMs: o.hangMs } : {}),
        onEvent: (name, level, f) => events.push({ name, level, f }),
      },
    )
    ;(window as unknown as { P: Pool; E: Ev[]; D: ScreeningData }).P = pool
    ;(window as unknown as { E: Ev[] }).E = events
    ;(window as unknown as { D: ScreeningData }).D = data
    return { size: pool.size, mode: pool.mode }
  },
  async full(nCand: number) {
    const w = window as unknown as { P: Pool; D: ScreeningData }
    const t0 = performance.now()
    const r = w.P.run(tasksFor(w.D, nCand), () => {})
    const v = await r.done
    return {
      json: JSON.stringify(v),
      ms: performance.now() - t0,
      n: v.length,
      vals: v,
    }
  },
  async cancelAfter(ms: number, nCand: number) {
    const w = window as unknown as { P: Pool; D: ScreeningData }
    let painted = 0
    const r = w.P.run(tasksFor(w.D, nCand), () => {
      painted++
    })
    const rejected = r.done.then(
      () => "done",
      (e) => (e as { reason?: string }).reason ?? "error",
    )
    await new Promise((a) => setTimeout(a, ms))
    const atCancel = painted
    const t0 = performance.now()
    r.cancel()
    const live = w.P.stats().live
    const why = await rejected
    await new Promise((a) => setTimeout(a, 400))
    return {
      atCancel,
      after: painted,
      live,
      why,
      cancelMs: performance.now() - t0,
      stats: w.P.stats(),
    }
  },
  async failure(nCand: number, killAfterMs: number, victim: number) {
    const w = window as unknown as { P: Pool; D: ScreeningData }
    const r = w.P.run(tasksFor(w.D, nCand), () => {})
    await new Promise((a) => setTimeout(a, killAfterMs))
    w.P.killLane(victim)
    const v = await r.done
    return { vals: v, lanes: w.P.lanes(), n: v.length }
  },
  async expectRejection(nCand: number) {
    const w = window as unknown as { P: Pool; D: ScreeningData }
    const t0 = performance.now()
    try {
      await w.P.run(tasksFor(w.D, nCand), () => {}).done
      return { rejected: false, ms: performance.now() - t0, reason: "" }
    } catch (e) {
      return {
        rejected: true,
        ms: performance.now() - t0,
        reason: (e as { reason?: string }).reason ?? "",
      }
    }
  },
  events: () => (window as unknown as { E: Ev[] }).E,
  stats: () => (window as unknown as { P: Pool }).P.stats(),
  lanes: () => (window as unknown as { P: Pool }).P.lanes(),
  terminate: () => (window as unknown as { P: Pool }).P.terminate(),
  async rawCreate(
    workerSrc: string,
    ctxJson: string,
    data: ScreeningData,
    size: number,
  ) {
    const events: Ev[] = []
    const t0 = performance.now()
    try {
      await createPool(size, url(workerSrc), ctxJson, {
        screening: data,
        hangMs: 3000,
        onEvent: (name, level, f) => events.push({ name, level, f }),
      })
      return { ok: true, reason: "", events, ms: performance.now() - t0 }
    } catch (e) {
      return {
        ok: false,
        reason: (e as { reason?: string }).reason ?? "",
        events,
        ms: performance.now() - t0,
      }
    }
  },
}
