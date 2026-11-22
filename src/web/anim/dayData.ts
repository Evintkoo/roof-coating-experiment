// The day player's data from one live result (plan 07 D3, Q5, Q6): the solved series of the live recipe against bare aluminium (C0)
// under the live scenario, in degrees C, plus the roof constants the heat arrows need. Nothing is invented: every number is a field
// of the live result or of the weather configuration. Pure; browser and Node safe.
import type { WeatherConfig } from "../../core/config"
import type { LiveInputs, LiveResult } from "../../core/pipeline/live"
import type { DayData } from "./dayPlayer"

const K = 273.15

export function dayDataOf(
  r: LiveResult,
  inputs: LiveInputs,
  weather: WeatherConfig,
): DayData {
  const bare = r.controls.C0.t_surface_k
  if (!bare || bare.length !== r.series.t_k.length)
    throw new Error("the live result carries no bare aluminium series")
  const C = (a: ArrayLike<number>): number[] => Array.from(a, (v) => v - K)
  return {
    recipeC: C(r.series.t_k),
    bareC: C(bare),
    loC: C(r.series.lo),
    hiC: C(r.series.hi),
    drawsK: r.series.draws,
    flux: {
      gPeak: inputs.scenario.irradiance_w_m2,
      rSolar: r.nominal.r_solar,
      tInsideK: weather.roof.t_inside_c.value + K,
      rTotal: weather.roof.r_total_m2k_w.value,
      tSurfaceK: r.series.t_k,
    },
  }
}
