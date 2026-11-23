// Q1: cost of one RK4 step and of 22 steps inline (Bun), and a Bun worker round trip of 6 steps (4x frame). Chrome is measured by the page proof.
import { netFluxWM2 } from "../../../src/core/models/thermal"
import {
  ctx,
  expectOk,
  finish,
  halfSine,
  rk4,
  thermalOf,
  twelveSettings,
} from "./lib"

const c = await ctx()
const p = thermalOf(c, twelveSettings(c)[0]!, "recipe")
const g = halfSine(p.g_peak_w_m2)
const invC = 1 / p.c_a_j_m2k
const run = (n: number, t0: number): number => {
  let t = t0
  for (let i = 0; i < n; i++)
    t = rk4(t, i * 60, 60, (x, s) => netFluxWM2(x, g(s), p) * invC)
  return t
}
const time = (n: number, reps: number): number => {
  const t0 = performance.now()
  let sink = 0
  for (let r = 0; r < reps; r++) sink += run(n, p.t_air_k)
  if (sink === 0.123) console.log("")
  return (performance.now() - t0) / reps
}
run(22, 300)
const one = time(1, 20000)
const w22 = time(22, 5000)
console.log(
  `inline: 1 step ${(one * 1000).toFixed(2)} us, 22 steps ${(w22 * 1000).toFixed(1)} us`,
)
const url = new URL("./q1_worker.ts", import.meta.url).href
const w = new Worker(url)
await new Promise<void>((res) => {
  w.onmessage = () => res()
  w.postMessage(0)
})
const rt: number[] = []
for (let i = 0; i < 300; i++) {
  const t0 = performance.now()
  await new Promise<void>((res) => {
    w.onmessage = () => res()
    w.postMessage(6)
  })
  rt.push(performance.now() - t0)
}
w.terminate()
rt.sort((a, b) => a - b)
const p95 = rt[Math.floor(0.95 * rt.length)]!
console.log(
  `worker round trip for 6 steps (Bun): median ${rt[150]!.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`,
)
expectOk(
  "inline cost per 4x frame is under 0.05 ms",
  w22 < 0.05,
  `${(w22 * 1000).toFixed(1)} us`,
)
expectOk(
  "worker round trip p95 under the frozen T_step_ms 4",
  p95 < 4,
  `${p95.toFixed(3)} ms`,
)
console.log(
  "The inline cost is far below a frame, so the worker is kept (it was requested) for isolation, not for speed (plan 09 Q1 rule).",
)
finish()
