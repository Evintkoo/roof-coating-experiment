// Browser worker for the spike: same pure functions as src/web/worker.ts, one chunk per message.
import { contextFromJson } from "../../../src/core/pipeline/contextJson"
import {
  CONTROL_LAYERS,
  stackProps,
  thermalOutcomes,
} from "../../../src/core/pipeline/stackProps"

const w = self as unknown as {
  onmessage: (e: { data: any }) => void
  postMessage: (m: unknown) => void
}
let ctx: ReturnType<typeof contextFromJson> | null = null
let designs: any[] = []
let scenarios: any[] = []
w.onmessage = (e) => {
  const m = e.data
  if (m.type === "init") {
    ctx = contextFromJson(m.ctxJson)
    designs = m.designs
    scenarios = m.scenarios
    w.postMessage({ type: "ready" })
    return
  }
  const out: [number, number, number, number][] = []
  let cand = -1
  let sp: ReturnType<typeof stackProps> | null = null
  for (const t of m.chunk as {
    index: number
    candidate: number
    scenario: number
  }[]) {
    if (cand !== t.candidate || sp === null) {
      sp = stackProps(designs[t.candidate], CONTROL_LAYERS.C4, ctx!)
      cand = t.candidate
    }
    const o = thermalOutcomes([{ sp, s: scenarios[t.scenario] }], ctx!)[0]!
    out.push([t.index, o.r_solar, o.t_max_c, o.q_in_mean_w_m2])
  }
  w.postMessage({ type: "result", id: m.id, out })
}
