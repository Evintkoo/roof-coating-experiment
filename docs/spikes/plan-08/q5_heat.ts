// Q5: cumulative heat. Trapezoid of the conducted flux (T_surface - T_inside) / R_total on the 144-node series against
// q_in_mean_w_m2 * 24 for the recipe, C0 and C1 at 12 settings; three ways of closing the day are compared.
import { liveSimulate } from "../../../src/core/pipeline/live"
import { LIVE_SEED, N_LIVE } from "../../../src/web/liveState"
import { ctx, expectOk, finish, twelveSettings } from "./lib"

const c = await ctx()
const K = 273.15
const tIn = c.weather.roof.t_inside_c.value + K
const rT = c.weather.roof.r_total_m2k_w.value
let worstA = 0
let worstB = 0
let worstC = 0
for (const inp of twelveSettings(c)) {
  const r = liveSimulate(inp, c, 4, LIVE_SEED)
  for (const o of [r.nominal, r.controls.C0, r.controls.C1]) {
    const s = o.t_surface_k as Float64Array
    const q = Array.from(s, (v) => (v - tIn) / rT)
    let trap = 0
    for (let i = 1; i < q.length; i++)
      trap += 0.5 * (q[i - 1]! + q[i]!) * (1 / 6)
    const ref = o.q_in_mean_w_m2 * 24
    // A: trapezoid to the last node (23.833 h); B: closed periodically to 24 h; C: arithmetic mean of the nodes times 24
    const a = trap
    const b = trap + (1 / 6) * 0.5 * (q[q.length - 1]! + q[0]!)
    const mean = q.reduce((x, y) => x + y, 0) / q.length
    worstA = Math.max(worstA, Math.abs(a - ref))
    worstB = Math.max(worstB, Math.abs(b - ref))
    worstC = Math.max(worstC, Math.abs(mean * 24 - ref))
  }
}
console.log(
  `largest |difference| in W h/m2: A (to last node) ${worstA.toExponential(2)}, B (periodic closure) ${worstB.toExponential(2)}, C (node mean x 24) ${worstC.toExponential(2)}`,
)
expectOk(
  "closing the day periodically (B) is the closest to the model's own mean",
  worstB <= worstA && worstB <= 1,
)
console.log(`T_heat_tol (Wh/m2) = 2 x B = ${(2 * worstB).toExponential(2)}`)
finish()
