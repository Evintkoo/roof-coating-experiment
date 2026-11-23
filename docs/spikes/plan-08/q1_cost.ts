// Q1: cost of one liveSimulate (33 thermal solves) and of a 41-point sweep on 1, 2 and 4 Bun workers (one point per message,
// results placed by index). Chrome timing with the Blob worker is measured by the page proof (docs/proofs/plan-08.md).
import { cpus, loadavg } from "node:os"
import { contextToJson } from "../../../src/core/pipeline/contextJson"
import { liveSimulate } from "../../../src/core/pipeline/live"
import { defaultLiveState } from "../../../src/web/liveState"
import { ctx, expectOk, finish } from "./lib"

const c = await ctx()
const base = defaultLiveState(c.ranges, c.weather).inputs
const pts = Array.from({ length: 41 }, (_, i) => ({
  ...base,
  design: { ...base.design, midcoat_dft_um: 100 + (200 * i) / 40 },
}))
const t0 = performance.now()
const seq = pts.map((p) => liveSimulate(p, c, 32, 20261121).nominal.t_max_c)
const seqMs = performance.now() - t0
console.log(
  `cores=${cpus().length} load1=${loadavg()[0]?.toFixed(1)}; one point ${(seqMs / 41).toFixed(1)} ms, 41 points on the main thread ${seqMs.toFixed(0)} ms`,
)
const ctxJson = contextToJson(c)
async function onPool(n: number): Promise<{ ms: number; out: number[] }> {
  const ws = Array.from(
    { length: n },
    () => new Worker(new URL("./q1_worker.ts", import.meta.url).href),
  )
  const out = new Array<number>(41)
  let next = 0
  const t = performance.now()
  await Promise.all(
    ws.map(
      (w) =>
        new Promise<void>((done) => {
          const pump = () => {
            if (next >= 41) return done()
            const i = next++
            w.onmessage = (e: MessageEvent) => {
              out[i] = e.data.out[0][0]
              pump()
            }
            w.postMessage({ ctxJson, inputs: [pts[i]] })
          }
          pump()
        }),
    ),
  )
  const ms = performance.now() - t
  for (const w of ws) w.terminate()
  return { ms, out }
}
await onPool(1) // warm
const r1 = await onPool(1)
const r2 = await onPool(2)
const r4 = await onPool(4)
console.log(
  `41 points: 1 worker ${r1.ms.toFixed(0)} ms, 2 workers ${r2.ms.toFixed(0)} ms, 4 workers ${r4.ms.toFixed(0)} ms (speedup 4 over 1: ${(r1.ms / r4.ms).toFixed(2)}x)`,
)
expectOk(
  "41 points with 32 draws fit under T_sweep_s = 2 on 4 workers",
  r4.ms < 2000,
)
expectOk(
  "speedup 4 over 1 at least the 1.5 floor",
  r1.ms / r4.ms >= 1.5,
  (r1.ms / r4.ms).toFixed(2),
)
expectOk(
  "1, 2 and 4 workers equal the sequential values",
  [r1, r2, r4].every((r) => r.out.every((v, i) => v === seq[i])),
)
expectOk(
  "the main thread would block for more than one frame (so the pool is needed)",
  seqMs > 50,
  `${seqMs.toFixed(0)} ms`,
)
finish()
