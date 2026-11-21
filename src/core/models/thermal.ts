import { PhysicsRangeError } from "../errors"
import { emitEvent } from "../events"
import { requireIn } from "./ranges"

const SIGMA = 5.670374419e-8 // W m^-2 K^-4 (CODATA 2018, exact)
const DAY_S = 86400
const SIM_S = 2 * DAY_S
const OUT_S = 600
const BIG = Number.MAX_VALUE
const TINY = Number.MIN_VALUE

export type ThermalInputs = {
  r_solar: number
  emissivity: number
  g_peak_w_m2: number
  t_air_k: number
  t_sky_k: number
  h_conv_w_m2k: number
  t_inside_k: number
  r_total_m2k_w: number
  c_a_j_m2k: number
}

export type DiurnalResult = {
  t_max_c: number
  q_in_mean_w_m2: number
  /** Day 2, every 600 s from 24:00, 144 points. */
  t_surface_k: Float64Array
}

export type SimulateOpts = {
  dtS?: number
  gProfile?: (tS: number) => number
  /** Label for the `thermal.solved` debug event. */
  scenarioId?: string
  /** Test-only hook: called with (t, T) at every step node of the 48 h run, including t = 0. */
  onStep?: (tS: number, tK: number) => void
}

function validate(p: ThermalInputs): void {
  const m = "thermal"
  requireIn(m, "r_solar", p.r_solar, 0, 1)
  requireIn(m, "emissivity", p.emissivity, TINY, 1)
  requireIn(m, "g_peak_w_m2", p.g_peak_w_m2, 0, 2000)
  requireIn(m, "t_air_k", p.t_air_k, 150, 400)
  requireIn(m, "t_sky_k", p.t_sky_k, 150, 400)
  requireIn(m, "t_inside_k", p.t_inside_k, 150, 400)
  requireIn(m, "h_conv_w_m2k", p.h_conv_w_m2k, 0, 1000)
  requireIn(m, "r_total_m2k_w", p.r_total_m2k_w, TINY, BIG)
  requireIn(m, "c_a_j_m2k", p.c_a_j_m2k, TINY, BIG)
}

/** RHS of the blueprint 4.3 balance (W/m^2): (1-R)G - eps sigma (T^4 - Tsky^4) - h (T - Tair) - (T - Tin)/R_total. */
export function netFluxWM2(tK: number, gWM2: number, p: ThermalInputs): number {
  const t2 = tK * tK
  const s2 = p.t_sky_k * p.t_sky_k
  return (
    (1 - p.r_solar) * gWM2 -
    p.emissivity * SIGMA * (t2 * t2 - s2 * s2) -
    p.h_conv_w_m2k * (tK - p.t_air_k) -
    (tK - p.t_inside_k) / p.r_total_m2k_w
  )
}

/** Root of netFluxWM2 in T by bisection (the flux is strictly decreasing in T). */
export function steadyStateTempK(p: ThermalInputs, gWM2: number): number {
  validate(p)
  requireIn("thermal", "gWM2", gWM2, 0, 2000)
  let lo = 100
  let hi = 600
  if (!(netFluxWM2(lo, gWM2, p) > 0 && netFluxWM2(hi, gWM2, p) < 0))
    throw new PhysicsRangeError(
      "steadyState",
      "thermal: no steady state inside the 100-600 K bracket",
    )
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi)
    if (mid === lo || mid === hi) break
    if (netFluxWM2(mid, gWM2, p) > 0) lo = mid
    else hi = mid
  }
  return 0.5 * (lo + hi)
}

/** G(t) = G_peak * max(0, sin(pi (t - 6 h) / 12 h)), periodic with period 24 h. */
function halfSine(gPeak: number): (tS: number) => number {
  return (tS) => {
    const s = Math.sin((Math.PI * ((tS % DAY_S) - 21600)) / 43200)
    return s > 0 ? gPeak * s : 0
  }
}

/**
 * D1: single node, T0 = T_air, 48 h of classical RK4 (irradiance evaluated at stage times), day 2 reported.
 * dtS must divide 600 so the 600 s output grid and the irradiance kinks (6, 18, 30, 42 h) lie on step boundaries.
 * t_max_c and q_in_mean_w_m2 are the max and mean over the day-2 step nodes.
 */
export function simulateDay(
  p: ThermalInputs,
  opts: SimulateOpts = {},
): DiurnalResult {
  validate(p)
  const dtS = opts.dtS ?? 60
  if (!(dtS > 0 && dtS <= OUT_S && OUT_S % dtS === 0)) {
    emitEvent("model.out_of_range", "error", {
      model: "thermal",
      quantity: "dtS",
      value: dtS,
      lo: 0,
      hi: OUT_S,
    })
    throw new PhysicsRangeError(
      "dtS",
      `thermal: dtS=${dtS} must be in (0, 600] and divide 600`,
    )
  }
  const g = opts.gProfile ?? halfSine(p.g_peak_w_m2)
  const onStep = opts.onStep
  const nSteps = Math.round(SIM_S / dtS)
  const day2Start = Math.round(DAY_S / dtS)
  const stride = OUT_S / dtS
  const series = new Float64Array(DAY_S / OUT_S)
  const invC = 1 / p.c_a_j_m2k
  let tK = p.t_air_k
  let tMax = Number.NEGATIVE_INFINITY
  let qSum = 0
  const h2 = dtS / 2
  for (let n = 0; n < nSteps; n++) {
    const tS = n * dtS
    if (onStep) onStep(tS, tK)
    if (n >= day2Start) {
      if (tK > tMax) tMax = tK
      qSum += (tK - p.t_inside_k) / p.r_total_m2k_w
      if ((n - day2Start) % stride === 0) series[(n - day2Start) / stride] = tK
    }
    const k1 = netFluxWM2(tK, g(tS), p) * invC
    const k2 = netFluxWM2(tK + h2 * k1, g(tS + h2), p) * invC
    const k3 = netFluxWM2(tK + h2 * k2, g(tS + h2), p) * invC
    const k4 = netFluxWM2(tK + dtS * k3, g(tS + dtS), p) * invC
    tK += (dtS / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
  }
  if (onStep) onStep(nSteps * dtS, tK)
  const out: DiurnalResult = {
    t_max_c: tMax - 273.15,
    q_in_mean_w_m2: qSum / (nSteps - day2Start),
    t_surface_k: series,
  }
  emitEvent("thermal.solved", "debug", {
    scenario_id: opts.scenarioId ?? "-",
    t_max_c: out.t_max_c,
    n_steps: nSteps,
  })
  return out
}
