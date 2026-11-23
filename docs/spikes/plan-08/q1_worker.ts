// Spike worker (Bun): one sweep chunk, a liveSimulate per value.
import { contextFromJson } from "../../../src/core/pipeline/contextJson"
import { liveSimulate } from "../../../src/core/pipeline/live"

declare const self: {
  onmessage: (e: { data: any }) => void
  postMessage: (m: unknown) => void
}
let ctx: ReturnType<typeof contextFromJson> | null = null
self.onmessage = (e) => {
  const j = e.data
  ctx ??= contextFromJson(j.ctxJson)
  const t0 = performance.now()
  const out = j.inputs.map((inp: any) => {
    const r = liveSimulate(inp, ctx!, 32, 20261121)
    return [r.nominal.t_max_c, r.bands.t_max_c.lo, r.bands.t_max_c.hi]
  })
  self.postMessage({ out, ms: performance.now() - t0 })
}
