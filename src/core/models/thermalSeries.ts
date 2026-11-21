import { DataError, PhysicsRangeError } from "../errors"
import { emitEvent } from "../events"
import {
  type HourlySeries,
  skyTempK,
  validateSeries,
} from "../indonesia/series"
import { requireIn } from "./ranges"
import { type DiurnalResult, netFluxWM2, type ThermalInputs } from "./thermal"

const DAY_S = 86400
const HOUR_S = 3600
const SIM_S = 2 * DAY_S
const OUT_S = 600
/** 60 s divides 3600, so every hourly kink of the linear interpolation is a step boundary (H4). */
export const SERIES_DT_S = 60
const BIG = Number.MAX_VALUE
const TINY = Number.MIN_VALUE

export type SeriesParams = Omit<
  ThermalInputs,
  "g_peak_w_m2" | "t_air_k" | "t_sky_k" | "h_conv_w_m2k"
>

export type SeriesOpts = {
  /** Test-only hook: called with (t, T) at every step node of the 48 h run, including t = 0 and t = 48 h. */
  onStep?: (tS: number, tK: number) => void
}

function checkParams(p: SeriesParams, hA: number, hB: number): void {
  const m = "thermalSeries"
  requireIn(m, "r_solar", p.r_solar, 0, 1)
  requireIn(m, "emissivity", p.emissivity, TINY, 1)
  requireIn(m, "t_inside_k", p.t_inside_k, 150, 400)
  requireIn(m, "r_total_m2k_w", p.r_total_m2k_w, TINY, BIG)
  requireIn(m, "c_a_j_m2k", p.c_a_j_m2k, TINY, BIG)
  requireIn(m, "h_a", hA, 0, 1000)
  requireIn(m, "h_b", hB, 0, 1000)
}

function checkSeries(s: HourlySeries): void {
  try {
    validateSeries(s, "-")
  } catch (e) {
    if (e instanceof DataError) {
      emitEvent("indonesia.series.rejected", "error", {
        site: "-",
        column: e.key ?? "-",
        hour_index: Number(/hour (\d+)/.exec(e.message)?.[1] ?? -1),
        reason: "series_invalid",
      })
    }
    throw e
  }
}

/**
 * Plan 04 FR-2: the plan-2 single-node balance (same RK4, dt = 60 s, T0 = air temperature at hour 0) driven by one
 * local day of hourly data repeated twice (48 h), day 2 reported like plan 2 (step nodes for t_max and q, 144 points
 * every 600 s). The 24 hourly points are values at the full hours 0..23, linearly interpolated, wrapping from hour 23
 * to hour 0 of the repeated day. G, T_air, wind (so h = hA + hB V) and T_sky = (LW/sigma)^(1/4) of each hourly point
 * are interpolated; relative humidity does not enter the balance. The units are W/m2, degC, m/s, W/m2.
 */
export function simulateSeriesDay(
  p: SeriesParams,
  s: HourlySeries,
  hA: number,
  hB: number,
  opts: SeriesOpts = {},
): DiurnalResult {
  checkSeries(s)
  checkParams(p, hA, hB)
  const m = "thermalSeries"
  const g = new Float64Array(24)
  const tAir = new Float64Array(24)
  const tSky = new Float64Array(24)
  const h = new Float64Array(24)
  for (let i = 0; i < 24; i++) {
    g[i] = requireIn(m, `g_w_m2[${i}]`, s.g_w_m2[i] as number, 0, 2000)
    tAir[i] = requireIn(
      m,
      `t_air_k[${i}]`,
      (s.t_air_c[i] as number) + 273.15,
      150,
      400,
    )
    tSky[i] = requireIn(
      m,
      `t_sky_k[${i}]`,
      skyTempK(s.lw_down_w_m2[i] as number),
      150,
      400,
    )
    h[i] = requireIn(
      m,
      `h_conv_w_m2k[${i}]`,
      hA + hB * (s.wind_m_s[i] as number),
      0,
      1000,
    )
  }
  emitEvent("thermal.series.step", "debug", { step: "interp" })

  const scratch: ThermalInputs = {
    ...p,
    g_peak_w_m2: 0,
    t_air_k: tAir[0] as number,
    t_sky_k: tSky[0] as number,
    h_conv_w_m2k: h[0] as number,
  }
  const lerp = (a: Float64Array, seg: number, f: number): number => {
    const x = a[seg % 24] as number
    const y = a[(seg + 1) % 24] as number
    return x + (y - x) * f
  }
  /** Sets the interpolated air, sky and convective values on scratch and returns G at time tS. */
  const forcing = (tS: number): number => {
    const seg = Math.floor(tS / HOUR_S)
    const f = (tS - seg * HOUR_S) / HOUR_S
    scratch.t_air_k = lerp(tAir, seg, f)
    scratch.t_sky_k = lerp(tSky, seg, f)
    scratch.h_conv_w_m2k = lerp(h, seg, f)
    return lerp(g, seg, f)
  }

  const dtS = SERIES_DT_S
  const nSteps = SIM_S / dtS
  const day2Start = DAY_S / dtS
  const stride = OUT_S / dtS
  const series = new Float64Array(DAY_S / OUT_S)
  const invC = 1 / p.c_a_j_m2k
  const onStep = opts.onStep
  const h2 = dtS / 2
  let tK = tAir[0] as number
  let tMax = Number.NEGATIVE_INFINITY
  let qSum = 0
  const flux = (tTemp: number, tS: number): number =>
    netFluxWM2(tTemp, forcing(tS), scratch) * invC
  for (let n = 0; n < nSteps; n++) {
    const tS = n * dtS
    if (onStep) onStep(tS, tK)
    if (n >= day2Start) {
      if (tK > tMax) tMax = tK
      qSum += (tK - p.t_inside_k) / p.r_total_m2k_w
      if ((n - day2Start) % stride === 0) series[(n - day2Start) / stride] = tK
    }
    const k1 = flux(tK, tS)
    const k2 = flux(tK + h2 * k1, tS + h2)
    const k3 = flux(tK + h2 * k2, tS + h2)
    const k4 = flux(tK + dtS * k3, tS + dtS)
    tK += (dtS / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
    if (!Number.isFinite(tK)) {
      throw new PhysicsRangeError(
        "t_surface_k",
        "thermalSeries: integration diverged",
      )
    }
  }
  if (onStep) onStep(nSteps * dtS, tK)
  emitEvent("thermal.series.step", "debug", { step: "rk4" })
  const out: DiurnalResult = {
    t_max_c: tMax - 273.15,
    q_in_mean_w_m2: qSum / (nSteps - day2Start),
    t_surface_k: series,
  }
  emitEvent("thermal.series.step", "debug", { step: "day2.extract" })
  return out
}
