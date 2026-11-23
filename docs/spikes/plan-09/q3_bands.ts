// Q3: band shares and reflected fractions from R(lambda) and the G173 spectrum; the weighted sum against solarWeighted and r_solar.

import { solarWeighted } from "../../../src/core/models/optics"
import { liveSimulate } from "../../../src/core/pipeline/live"
import { LIVE_SEED, N_LIVE } from "../../../src/web/liveState"
import { ctx, expectOk, finish, twelveSettings } from "./lib"

const c = await ctx()
const EDGE = [0.4, 0.7]
let worst = 0
let worstNom = 0
for (const inp of twelveSettings(c)) {
  const r = liveSimulate(inp, c, 2, LIVE_SEED)
  const R = r.spectrum.nominal
  const gw = c.g173.wl_um
  const ge = c.g173.irradiance_w_m2_um
  const num = [0, 0, 0]
  const den = [0, 0, 0]
  const sw = solarWeighted(c.wlUm, R, c.g173)
  // same interpolation as solarWeighted, segments assigned to the band of their midpoint
  let j = 0
  let pw = 0,
    pe = 0,
    pr = 0
  const m = c.wlUm.length
  for (let i = 0; i < gw.length; i++) {
    const w = gw[i] as number
    while (j < m - 1 && (c.wlUm[j + 1] as number) <= w) j++
    let ri: number
    if (w <= (c.wlUm[0] as number)) ri = R[0] as number
    else if (w >= (c.wlUm[m - 1] as number)) ri = R[m - 1] as number
    else {
      const w0 = c.wlUm[j] as number
      ri =
        (R[j] as number) +
        ((w - w0) / ((c.wlUm[j + 1] as number) - w0)) *
          ((R[j + 1] as number) - (R[j] as number))
    }
    const e = ge[i] as number
    if (i > 0) {
      const mid = 0.5 * (w + pw)
      const b = mid < EDGE[0]! ? 0 : mid < EDGE[1]! ? 1 : 2
      num[b]! += 0.5 * (e * ri + pe * pr) * (w - pw)
      den[b]! += 0.5 * (e + pe) * (w - pw)
    }
    pw = w
    pe = e
    pr = ri
  }
  const tot = den[0]! + den[1]! + den[2]!
  const sum = (num[0]! + num[1]! + num[2]!) / tot
  worst = Math.max(worst, Math.abs(sum - sw))
  worstNom = Math.max(worstNom, Math.abs(sum - r.nominal.r_solar))
}
console.log(
  `weighted band sum vs solarWeighted: max diff ${worst}; vs nominal r_solar: ${worstNom}`,
)
expectOk("band sum equals solarWeighted", worst < 1e-12, `${worst}`)
expectOk(
  "band sum equals nominal r_solar",
  worstNom < 1e-12,
  `${worstNom} (T_band_tol 1e-9)`,
)
console.log(
  "scattering: S(lambda) is computed inside midcoatSpectrum (Mie on the grid, kmCoefficients); exposing it additively is possible but costs a Mie call per slider move in the stepper lane and page JS; lean decision: the scattering visual is dropped (FR-7 allows it); H9 asserts absence.",
)
finish()
