// Live-simulation worker (plan 00 D3/D4): receives the model context once, then answers {id, inputs}
// with liveSimulate(inputs, ctx, N_LIVE, LIVE_SEED). No logic of its own beyond marshalling.
import { SpandekError } from "../core/errors"
import { type Level, setEventSink } from "../core/events"
import type { ModelContext } from "../core/pipeline/context"
import { contextFromJson } from "../core/pipeline/contextJson"
import { type LiveInputs, liveSimulate } from "../core/pipeline/live"
import { LIVE_SEED, N_LIVE } from "./liveState"

type In =
  | { type: "init"; ctxJson: string }
  | { type: "run"; id: number; inputs: LiveInputs }
type EventFields = Record<string, string | number | boolean>

const w = self as unknown as {
  onmessage: ((e: MessageEvent<In>) => void) | null
  postMessage: (m: unknown) => void
}
let ctx: ModelContext | null = null
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
    w.postMessage({ type: "ready" })
    return
  }
  const t0 = performance.now()
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
