// Live-simulation worker (plan 00 D3/D4): receives the model context once, then answers {id, inputs}
// with liveSimulate(inputs, ctx, N_LIVE, LIVE_SEED). No logic of its own beyond marshalling.
import {
  designsOf,
  type ScreeningData,
  screenChunk,
} from "../core/anim/screening"
import { createPair, type Pair } from "../core/anim/stepper"
import { type SweepVar, sweepChunkSafe } from "../core/anim/sweep"
import type { Scenario } from "../core/design"
import { SpandekError } from "../core/errors"
import { type Level, setEventSink } from "../core/events"
import type { ModelContext } from "../core/pipeline/context"
import { contextFromJson } from "../core/pipeline/contextJson"
import { type LiveInputs, liveSimulate } from "../core/pipeline/live"
import type { FlaggedDesignRow } from "../core/schema"
import { LIVE_SEED, N_LIVE } from "./liveState"

type In =
  | {
      type: "init"
      ctxJson: string
      screening?: { data: ScreeningData; draws: number | null }
    }
  | {
      type: "screen"
      id: number
      tasks: { index: number; candidate: number; scenario: number }[]
    }
  | {
      type: "sweep"
      id: number
      base: LiveInputs
      v: SweepVar
      values: number[]
      idx: number[]
      nDraws: number
      seed: number
    }
  | { type: "run"; id: number; inputs: LiveInputs }
  | {
      type: "stepper"
      id: number
      op: "init" | "params" | "step"
      version: number
      payload: { inputs?: LiveInputs; n?: number }
    }
type EventFields = Record<string, string | number | boolean>

const w = self as unknown as {
  onmessage: ((e: MessageEvent<In>) => void) | null
  postMessage: (m: unknown) => void
}
let ctx: ModelContext | null = null
let screening: {
  designs: FlaggedDesignRow[]
  scenarios: Scenario[]
  draws: number | null
} | null = null
let pair: Pair | null = null
let buffered: { event: string; level: Level; fields: EventFields }[] = []
setEventSink((event, level, fields) => {
  buffered.push({ event, level, fields })
})
const flush = () => {
  if (buffered.length === 0) return
  w.postMessage({ type: "events", list: buffered })
  buffered = []
}

w.onmessage = (e) => {
  const m = e.data
  if (m.type === "init") {
    ctx = contextFromJson(m.ctxJson)
    if (m.screening)
      screening = {
        designs: designsOf(m.screening.data),
        scenarios: m.screening.data.scenarios,
        draws: m.screening.draws,
      }
    w.postMessage({ type: "ready" })
    return
  }
  if (m.type === "stepper") {
    // plan 09: the live stepper, one request in flight at a time; the reply carries the request's version back
    try {
      if (ctx === null) throw new Error("stepper used before init")
      if (m.op === "init")
        pair = createPair(ctx, m.payload.inputs as LiveInputs)
      else if (pair === null) throw new Error("stepper used before its init")
      else if (m.op === "params") pair.setParams(m.payload.inputs as LiveInputs)
      const frames =
        m.op === "step" && pair ? pair.stepN(m.payload.n ?? 0) : null
      w.postMessage({
        type: "stepper",
        id: m.id,
        op: m.op,
        version: m.version,
        ok: true,
        frames,
      })
    } catch (err) {
      w.postMessage({
        type: "stepper",
        id: m.id,
        op: m.op,
        version: m.version,
        ok: false,
        error: {
          code: err instanceof SpandekError ? err.code : 0,
          phase: err instanceof SpandekError ? err.phase : "worker",
          key: err instanceof SpandekError ? (err.key ?? "") : "",
        },
      })
    }
    return
  }
  const t0 = performance.now()
  if (m.type === "screen") {
    try {
      if (ctx === null || screening === null)
        throw new Error("screening used before init")
      const out = screenChunk(
        ctx,
        screening.designs,
        screening.scenarios,
        m.tasks,
        screening.draws,
      )
      w.postMessage({
        type: "screened",
        id: m.id,
        out,
        ms: performance.now() - t0,
      })
    } catch (err) {
      w.postMessage({
        type: "error",
        id: m.id,
        error: {
          code: err instanceof SpandekError ? err.code : 0,
          phase: "screen",
          key: "",
        },
      })
    }
    return
  }
  if (m.type === "sweep") {
    try {
      if (ctx === null) throw new Error("sweep used before init")
      const out = sweepChunkSafe(
        ctx,
        m.base,
        m.v,
        m.values,
        m.idx,
        m.nDraws,
        m.seed,
      ).map((o) => ({ index: o.index, value: o.value }))
      w.postMessage({
        type: "screened",
        id: m.id,
        out,
        ms: performance.now() - t0,
      })
    } catch (err) {
      w.postMessage({
        type: "error",
        id: m.id,
        error: {
          code: err instanceof SpandekError ? err.code : 0,
          phase: "sweep",
          key: "",
        },
      })
    }
    return
  }
  try {
    if (ctx === null) throw new Error("worker used before init")
    const result = liveSimulate(m.inputs, ctx, N_LIVE, LIVE_SEED)
    flush()
    w.postMessage({
      type: "result",
      id: m.id,
      result,
      ms: performance.now() - t0,
    })
  } catch (err) {
    flush()
    w.postMessage({
      type: "error",
      id: m.id,
      error:
        err instanceof SpandekError
          ? { code: err.code, phase: err.phase, key: err.key ?? "" }
          : { code: 0, phase: "worker", key: "" },
    })
  }
}
