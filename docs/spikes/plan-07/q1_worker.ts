// Spike worker (Bun): evaluates a chunk of screening tasks through the same pure functions as the batch.
import { contextFromJson } from "../../../src/core/pipeline/contextJson"
import {
  CONTROL_LAYERS,
  stackProps,
  thermalOutcomes,
} from "../../../src/core/pipeline/stackProps"

type Job = {
  ctxJson: string
  designs: any[]
  scenarios: any[]
  chunk: { index: number; candidate: number; scenario: number }[]
  shareStack: boolean
}
declare const self: {
  onmessage: (e: { data: Job }) => void
  postMessage: (m: unknown) => void
}
let ctx: ReturnType<typeof contextFromJson> | null = null
let cached = ""
self.onmessage = (e) => {
  const j = e.data
  if (ctx === null || cached !== j.ctxJson) {
    ctx = contextFromJson(j.ctxJson)
    cached = j.ctxJson
  }
  const t0 = performance.now()
  const out: { index: number; v: [number, number, number] }[] = []
  let spCand = -1
  let sp: ReturnType<typeof stackProps> | null = null
  for (const t of j.chunk) {
    if (!j.shareStack || spCand !== t.candidate || sp === null) {
      sp = stackProps(j.designs[t.candidate], CONTROL_LAYERS.C4, ctx)
      spCand = t.candidate
    }
    const o = thermalOutcomes([{ sp, s: j.scenarios[t.scenario] }], ctx)[0]!
    out.push({ index: t.index, v: [o.r_solar, o.t_max_c, o.q_in_mean_w_m2] })
  }
  self.postMessage({ out, ms: performance.now() - t0 })
}
