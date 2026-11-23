// Shared by the plan 09 spike scripts: the real context, 12 live settings (plan 08's), scenario to thermal inputs, and a scratch RK4.

import { scenarioFrom } from "../../../src/core/design"
import {
  netFluxWM2,
  type ThermalInputs,
} from "../../../src/core/models/thermal"
import type { ModelContext } from "../../../src/core/pipeline/context"
import type { LiveInputs } from "../../../src/core/pipeline/live"
import {
  CONTROL_LAYERS,
  stackProps,
} from "../../../src/core/pipeline/stackProps"

export { ctx, expectOk, finish, root, twelveSettings } from "../plan-08/lib"

/** ThermalInputs of the recipe or of C0 for a live setting, as thermalOutcomes builds them. */
export function thermalOf(
  c: ModelContext,
  inp: LiveInputs,
  which: "recipe" | "c0",
): ThermalInputs {
  const s = scenarioFrom(
    inp.scenario.irradiance_w_m2,
    inp.scenario.t_air_c,
    inp.scenario.wind_m_s,
    c.weather,
  )
  const sp = stackProps(
    { ...inp.design, ph: inp.ph },
    which === "recipe" ? inp.layers : CONTROL_LAYERS.C0,
    c,
  )
  const roof = c.weather.roof
  return {
    r_solar: sp.r_solar,
    emissivity: sp.emissivity,
    g_peak_w_m2: s.irradiance_w_m2,
    t_air_k: s.t_air_c + 273.15,
    t_sky_k: s.t_sky_k,
    h_conv_w_m2k: s.h_conv_w_m2k,
    t_inside_k: roof.t_inside_c.value + 273.15,
    r_total_m2k_w: roof.r_total_m2k_w.value,
    c_a_j_m2k: sp.c_a_j_m2k,
  }
}
export const halfSine =
  (gPeak: number) =>
  (tS: number): number => {
    const s = Math.sin((Math.PI * ((tS % 86400) - 21600)) / 43200)
    return s > 0 ? gPeak * s : 0
  }
/** Scratch copy of the planned extraction: same operation order as simulateDay. */
export function rk4(
  tK: number,
  tS: number,
  dt: number,
  f: (t: number, s: number) => number,
): number {
  const h2 = dt / 2
  const k1 = f(tK, tS)
  const k2 = f(tK + h2 * k1, tS + h2)
  const k3 = f(tK + h2 * k2, tS + h2)
  const k4 = f(tK + dt * k3, tS + dt)
  return tK + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
}
export { netFluxWM2 }
