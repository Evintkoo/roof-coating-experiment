// Q4 and Q5: the scratch RK4 equals simulateDay bit for bit; closure residual of the five terms; settling after a slider change.
import { simulateDay } from "../../../src/core/models/thermal"
import {
  ctx,
  expectOk,
  finish,
  halfSine,
  netFluxWM2,
  rk4,
  thermalOf,
  twelveSettings,
} from "./lib"

const c = await ctx()
const dt = 60
let maxDiff = 0
let maxRes = 0
for (const inp of twelveSettings(c)) {
  for (const which of ["recipe", "c0"] as const) {
    const p = thermalOf(c, inp, which)
    const g = halfSine(p.g_peak_w_m2)
    const ref = simulateDay(p)
    const invC = 1 / p.c_a_j_m2k
    let tK = p.t_air_k
    const day2: number[] = []
    for (let n = 0; n < 2880; n++) {
      const tS = n * dt
      if (n >= 1440 && (n - 1440) % 10 === 0) day2.push(tK)
      const next = rk4(tK, tS, dt, (t, s) => netFluxWM2(t, g(s), p) * invC)
      if (n >= 1440) {
        // terms at the node, stored from the step's mean slope
        const gg = g(tS)
        const absorbed = (1 - p.r_solar) * gg
        const radiated =
          p.emissivity * 5.670374419e-8 * (tK ** 4 - p.t_sky_k ** 4)
        const convected = p.h_conv_w_m2k * (tK - p.t_air_k)
        const conducted = (tK - p.t_inside_k) / p.r_total_m2k_w
        const stored = (p.c_a_j_m2k * (next - tK)) / dt
        maxRes = Math.max(
          maxRes,
          Math.abs(absorbed - radiated - convected - conducted - stored),
        )
      }
      tK = next
    }
    for (let i = 0; i < 144; i++)
      maxDiff = Math.max(
        maxDiff,
        Math.abs((ref.t_surface_k[i] as number) - (day2[i] as number)),
      )
  }
}
console.log(
  `max |series diff| ${maxDiff}; max closure residual ${maxRes} W/m2 over 12 settings x recipe, C0`,
)
expectOk("scratch RK4 equals simulateDay", maxDiff === 0, `diff ${maxDiff}`)
expectOk("T_stepper_tol 1e-12 is met", maxDiff < 1e-12)
expectOk(
  "closure residual measured",
  Number.isFinite(maxRes) && maxRes > 0,
  `T_closure_w_m2 = 2x = ${(2 * maxRes).toPrecision(2)}`,
)

// Q5 settling: after a step change of each slider to its extreme, days until the day max is within 0.05 K of the settled day
const start = twelveSettings(c)[0]!
const lo = (w: { values: readonly [number, number, number] }) => w.values[0]
const hi = (w: { values: readonly [number, number, number] }) => w.values[2]
const moves = [
  ["irradiance low", { irradiance_w_m2: lo(c.weather.irradiance_w_m2) }],
  ["irradiance high", { irradiance_w_m2: hi(c.weather.irradiance_w_m2) }],
  ["air low", { t_air_c: lo(c.weather.t_air_c) }],
  ["air high", { t_air_c: hi(c.weather.t_air_c) }],
  ["wind low", { wind_m_s: lo(c.weather.wind_m_s) }],
  ["wind high", { wind_m_s: hi(c.weather.wind_m_s) }],
] as const
let worst = 0
for (const [name, patch] of moves) {
  const p0 = thermalOf(c, start, "recipe")
  const p1 = thermalOf(
    c,
    { ...start, scenario: { ...start.scenario, ...patch } },
    "recipe",
  )
  const settled = simulateDay(p1).t_max_c
  const g1 = halfSine(p1.g_peak_w_m2)
  const invC = 1 / p1.c_a_j_m2k
  // state at the end of day 1 of the old parameters, then the new ones
  const g0 = halfSine(p0.g_peak_w_m2)
  let tK = p0.t_air_k
  for (let n = 0; n < 1440; n++)
    tK = rk4(tK, n * dt, dt, (t, s) => netFluxWM2(t, g0(s), p0) / p0.c_a_j_m2k)
  let days = 0
  for (; days < 20; days++) {
    let mx = -Infinity
    for (let n = 0; n < 1440; n++) {
      mx = Math.max(mx, tK)
      tK = rk4(tK, n * dt, dt, (t, s) => netFluxWM2(t, g1(s), p1) * invC)
    }
    if (Math.abs(mx - 273.15 - settled) < 0.05) break
  }
  worst = Math.max(worst, days + 1)
  console.log(
    `${name}: ${days + 1} day(s) to within 0.05 K of liveSimulate's nominal day max`,
  )
}
expectOk(
  "every extreme settles within 5 days",
  worst <= 5,
  `worst ${worst} days`,
)
finish()
