// Comparison lanes (plan 08 FR-1 to FR-4, D3): the live recipe, bare aluminium (C0) and the datasheet product (C1) as five lanes over
// the day, built only from the fields of the live result (series, r_solar, the roof constants). Nothing is invented: a control a
// quantity is not modelled for is `null`, never a made-up line. Pure.

import { type FluxModel, fluxAt } from "../../web/anim/flux"
import type { WeatherConfig } from "../config"
import { SpandekError } from "../errors"
import type { LiveInputs, LiveResult } from "../pipeline/live"
import type { Outcome } from "../pipeline/stackProps"
import { sampleSeries } from "./frames"

export const LANE_IDS = [
  "surface_c",
  "reflected",
  "absorbed",
  "conducted",
  "cumulative_wh",
] as const
export type LaneId = (typeof LANE_IDS)[number]
export type Lane = {
  id: LaneId
  unit: string
  recipe: Float64Array
  c0: Float64Array
  /** null when C1 has no solved series (F1). */
  c1: Float64Array | null
}

/** Plan 08 F2: a typed error, code 4, phase "compare". */
export class CompareError extends SpandekError {
  constructor(message: string) {
    super(4, "compare", "lanes", message)
  }
}

const K = 273.15
/** Nodes of the solved series are at i / 6 h (600 s steps). */
export const nodeTimes = (n: number): Float64Array =>
  Float64Array.from({ length: n }, (_, i) => i / 6)

/** Trapezoid of the flux over the nodes: W h/m2 at each node (0 at the first). */
export function cumulativeHeat(
  conducted: Float64Array,
  tH: Float64Array,
): Float64Array {
  if (conducted.length !== tH.length)
    throw new CompareError("flux and time must have the same length")
  const out = new Float64Array(conducted.length)
  for (let i = 1; i < conducted.length; i++)
    out[i] =
      (out[i - 1] as number) +
      0.5 *
        ((conducted[i - 1] as number) + (conducted[i] as number)) *
        ((tH[i] as number) - (tH[i - 1] as number))
  return out
}

/**
 * Heat over the whole 24 h day (W h/m2): the trapezoid to the last node plus the closing interval to 24 h at the mean of the last and
 * the first node, because the day is periodic and the series stops one step before 24 h (spike Q5, `T_heat_tol` 0.06).
 */
export function heatOverDay(conducted: Float64Array, tH: Float64Array): number {
  const cum = cumulativeHeat(conducted, tH)
  const n = conducted.length
  if (n === 0) return 0
  return (
    (cum[n - 1] as number) +
    (24 - (tH[n - 1] as number)) *
      0.5 *
      ((conducted[n - 1] as number) + (conducted[0] as number))
  )
}

const UNITS: Record<LaneId, string> = {
  surface_c: "°C",
  reflected: "W/m²",
  absorbed: "W/m²",
  conducted: "W/m²",
  cumulative_wh: "W h/m²",
}

function fluxLanes(
  o: Outcome,
  inputs: LiveInputs,
  weather: WeatherConfig,
  tH: Float64Array,
): {
  reflected: Float64Array
  absorbed: Float64Array
  conducted: Float64Array
} {
  const m: FluxModel = {
    gPeak: inputs.scenario.irradiance_w_m2,
    rSolar: o.r_solar,
    tInsideK: weather.roof.t_inside_c.value + K,
    rTotal: weather.roof.r_total_m2k_w.value,
    tSurfaceK: o.t_surface_k as Float64Array,
  }
  const n = tH.length
  const reflected = new Float64Array(n)
  const absorbed = new Float64Array(n)
  const conducted = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const f = fluxAt(tH[i] as number, m)
    reflected[i] = f.reflected
    absorbed[i] = f.absorbed
    conducted[i] = f.conducted
  }
  return { reflected, absorbed, conducted }
}

/** The five lanes of the live result. Throws a CompareError (code 4, phase compare) for series of unequal length (F2). */
export function laneSeries(
  r: LiveResult,
  inputs: LiveInputs,
  weather: WeatherConfig,
): Lane[] {
  const rec = r.series.t_k
  const c0s = r.controls.C0.t_surface_k
  const c1s = r.controls.C1.t_surface_k
  if (!c0s || c0s.length !== rec.length)
    throw new CompareError(
      "the bare aluminium series is missing or has a different length",
    )
  if (c1s && c1s.length !== rec.length)
    throw new CompareError("the C1 series has a different length")
  if (rec.length < 2) throw new CompareError("a day needs at least two points")
  const tH = nodeTimes(rec.length)
  const C = (a: Float64Array): Float64Array => a.map((v) => v - K)
  const fr = fluxLanes(r.nominal, inputs, weather, tH)
  const f0 = fluxLanes(r.controls.C0, inputs, weather, tH)
  const f1 = c1s ? fluxLanes(r.controls.C1, inputs, weather, tH) : null
  const lane = (
    id: LaneId,
    recipe: Float64Array,
    c0: Float64Array,
    c1: Float64Array | null,
  ): Lane => ({ id, unit: UNITS[id], recipe, c0, c1 })
  return [
    lane("surface_c", C(rec), C(c0s), c1s ? C(c1s) : null),
    lane("reflected", fr.reflected, f0.reflected, f1 ? f1.reflected : null),
    lane("absorbed", fr.absorbed, f0.absorbed, f1 ? f1.absorbed : null),
    lane("conducted", fr.conducted, f0.conducted, f1 ? f1.conducted : null),
    lane(
      "cumulative_wh",
      cumulativeHeat(fr.conducted, tH),
      cumulativeHeat(f0.conducted, tH),
      f1 ? cumulativeHeat(f1.conducted, tH) : null,
    ),
  ]
}

/** Recipe minus control at hour tH, sampled from the lane series (never stored). c1 is null when C1 is not available. */
export function diffAt(l: Lane, tH: number): { c0: number; c1: number | null } {
  const t = nodeTimes(l.recipe.length)
  const rec = sampleSeries(t, l.recipe, tH)
  return {
    c0: rec - sampleSeries(t, l.c0, tH),
    c1: l.c1 ? rec - sampleSeries(t, l.c1, tH) : null,
  }
}
