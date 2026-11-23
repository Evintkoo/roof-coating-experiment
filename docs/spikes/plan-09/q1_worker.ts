import { netFluxWM2 } from "../../../src/core/models/thermal"
import { rk4 } from "./lib"

const p = {
  r_solar: 0.8,
  emissivity: 0.9,
  g_peak_w_m2: 900,
  t_air_k: 300,
  t_sky_k: 280,
  h_conv_w_m2k: 15,
  t_inside_k: 300,
  r_total_m2k_w: 1,
  c_a_j_m2k: 20000,
}
let t = 300
self.onmessage = (e: MessageEvent<number>) => {
  for (let i = 0; i < e.data; i++)
    t = rk4(t, i * 60, 60, (x) => netFluxWM2(x, 500, p) / p.c_a_j_m2k)
  ;(self as unknown as Worker).postMessage(t)
}
