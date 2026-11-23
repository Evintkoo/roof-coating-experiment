import { beforeAll, expect, test } from "bun:test"
import fc from "fast-check"
import {
  balanceTerms,
  createStepper,
  MAX_STEPS_PER_REQUEST,
  paramsFromInputs,
  type StepperParams,
  startLive,
  stepsFor,
} from "../../../src/core/anim/stepper"
import { PhysicsRangeError } from "../../../src/core/errors"
import {
  netFluxWM2,
  SIGMA,
  simulateDay,
} from "../../../src/core/models/thermal"
import { simulateSeriesDay } from "../../../src/core/models/thermalSeries"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { type LiveInputs, liveSimulate } from "../../../src/core/pipeline/live"
import { LIVE_SEED } from "../../../src/web/liveState"
import { testCtx } from "../../support/dayData"
import { twelveSettings } from "../../support/liveSettings"

// Frozen from the plan 09 spike (docs/spikes/plan-09.md), never edited.
const T_STEPPER_TOL = 1e-12
const T_CLOSURE_W_M2 = 1.0
const N_SETTLE = 3
const T_SETTLE_K = 0.05
const DT = 60

let ctx: ModelContext
let settings: LiveInputs[]
beforeAll(async () => {
  ctx = await testCtx()
  settings = twelveSettings(ctx)
})

/** One full local day (1440 steps) of a live stepper, with t_max, q and the 144 output points like simulateDay day 2. */
function day(stepper: ReturnType<typeof startLive>, p: StepperParams) {
  const frames = stepper.stepN(1440)
  const series = new Float64Array(144)
  let tMax = Number.NEGATIVE_INFINITY
  let q = 0
  frames.forEach((f, i) => {
    tMax = Math.max(tMax, f.tK)
    q += (f.tK - p.thermal.t_inside_k) / p.thermal.r_total_m2k_w
    if (i % 10 === 0) series[i / 10] = f.tK
  })
  return { series, t_max_c: tMax - 273.15, q_in_mean_w_m2: q / 1440, frames }
}

test("stepperEqualsSimulateDayH1", () => {
  // 12 settings x recipe and C0: the first live day is the batch day 2 (144 points, t_max_c, q_in_mean_w_m2).
  for (const inp of settings) {
    for (const which of ["recipe", "c0"] as const) {
      const p = paramsFromInputs(ctx, inp, which)
      const ref = simulateDay(p.thermal)
      const got = day(startLive(p), p)
      for (let i = 0; i < 144; i++)
        expect(
          Math.abs((got.series[i] as number) - (ref.t_surface_k[i] as number)),
        ).toBeLessThanOrEqual(T_STEPPER_TOL)
      expect(Math.abs(got.t_max_c - ref.t_max_c)).toBeLessThanOrEqual(
        T_STEPPER_TOL,
      )
      expect(
        Math.abs(got.q_in_mean_w_m2 - ref.q_in_mean_w_m2),
      ).toBeLessThanOrEqual(T_STEPPER_TOL)
    }
  }
})

test("stepperEqualsSeriesDayH1", async () => {
  // Hourly forcing (plan 04): the stepper takes the interpolated series as its forcing function and equals simulateSeriesDay day 2.
  const o = (await Bun.file(
    new URL("../../fixtures/oracle/thermalSeries.json", import.meta.url),
  ).json()) as {
    h_a: number
    h_b: number
    cases: {
      params: Parameters<typeof simulateSeriesDay>[0]
      series: Record<string, number[]>
    }[]
  }
  const sigmaSky = (lw: number) => (lw / SIGMA) ** 0.25
  for (const c of o.cases.slice(0, 6)) {
    const s = Object.fromEntries(
      Object.entries(c.series).map(([k, v]) => [k, Float64Array.from(v)]),
    ) as unknown as Parameters<typeof simulateSeriesDay>[1]
    const ref = simulateSeriesDay(c.params, s, o.h_a, o.h_b)
    const lerp = (a: number[], tS: number) => {
      const seg = Math.floor(tS / 3600)
      const f = (tS - seg * 3600) / 3600
      const x = a[seg % 24] as number
      const y = a[(seg + 1) % 24] as number
      return x + (y - x) * f
    }
    const air = c.series.t_air_c as number[]
    const lw = c.series.lw_down_w_m2 as number[]
    const wind = c.series.wind_m_s as number[]
    const g = c.series.g_w_m2 as number[]
    const sky = lw.map(sigmaSky)
    const h = wind.map((w) => o.h_a + o.h_b * w)
    const p: StepperParams = {
      thermal: {
        ...c.params,
        g_peak_w_m2: 0,
        t_air_k: 300,
        t_sky_k: 280,
        h_conv_w_m2k: 10,
      },
      forcing: (tS) => ({
        g: lerp(g, tS),
        t_air_k: lerp(air, tS) + 273.15,
        t_sky_k: lerp(sky, tS),
        h_conv_w_m2k: lerp(h, tS),
      }),
    }
    const st = createStepper(p, (air[0] as number) + 273.15, 0)
    st.stepN(1440)
    const got = day(st, p)
    for (let i = 0; i < 144; i++)
      expect(
        Math.abs((got.series[i] as number) - (ref.t_surface_k[i] as number)),
      ).toBeLessThanOrEqual(T_STEPPER_TOL)
    expect(Math.abs(got.t_max_c - ref.t_max_c)).toBeLessThanOrEqual(
      T_STEPPER_TOL,
    )
  }
})

test("balanceClosesH2", () => {
  // The five terms at every step node of the live day, recomputed here from the raw inputs by a second formula; the residual
  // |absorbed - radiated - convected - conducted - stored| stays under the frozen bound, and balanceTerms agrees with the test formula.
  let worst = 0
  for (const inp of settings) {
    for (const which of ["recipe", "c0"] as const) {
      const p = paramsFromInputs(ctx, inp, which)
      const t = p.thermal
      const { frames } = day(startLive(p), p)
      for (const f of frames) {
        const gg =
          Math.max(0, Math.sin((Math.PI * ((f.tS % 86400) - 21600)) / 43200)) *
          t.g_peak_w_m2
        const abs = (1 - t.r_solar) * gg
        const rad = t.emissivity * SIGMA * (f.tK ** 4 - t.t_sky_k ** 4)
        const conv = t.h_conv_w_m2k * (f.tK - t.t_air_k)
        const cond = (f.tK - t.t_inside_k) / t.r_total_m2k_w
        expect(f.terms.absorbed).toBeCloseTo(abs, 9)
        expect(f.terms.reflected).toBeCloseTo(t.r_solar * gg, 9)
        expect(f.terms.radiated).toBeCloseTo(rad, 6)
        expect(f.terms.convected).toBeCloseTo(conv, 9)
        expect(f.terms.conducted).toBeCloseTo(cond, 9)
        // the same sum as the model's own netFluxWM2 (different operation order, so a tolerance)
        expect(abs - rad - conv - cond).toBeCloseTo(netFluxWM2(f.tK, gg, t), 6)
        worst = Math.max(
          worst,
          Math.abs(abs - rad - conv - cond - f.terms.stored),
        )
        expect(f.residual).toBeCloseTo(
          abs - rad - conv - cond - f.terms.stored,
          9,
        )
      }
    }
  }
  console.log(
    `closure: largest residual ${worst.toFixed(3)} W/m2 over 12 settings x 2 x 1440 steps (frozen bound ${T_CLOSURE_W_M2})`,
  )
  expect(worst).toBeLessThanOrEqual(T_CLOSURE_W_M2)
  expect(worst).toBeGreaterThan(0) // a control: the residual is a real, measured quantity
})

test("balanceTermsHasNoHiddenStateAndFollowsTheNodeH2", () => {
  const p = paramsFromInputs(ctx, settings[0] as LiveInputs, "recipe")
  const a = balanceTerms(310, 43200, p)
  const b = balanceTerms(310, 43200, p)
  expect(a).toEqual(b)
  expect(a.reflected + a.absorbed).toBeCloseTo(p.forcing(43200).g, 9)
  expect(balanceTerms(310, 0, p).absorbed).toBe(0) // night: no sun
})

test("stepperIsDeterministicH3", () => {
  const p = paramsFromInputs(ctx, settings[3] as LiveInputs, "recipe")
  const log = [5, 22, 1, 0, 90, 360]
  const run = () => {
    const st = startLive(p)
    return log.map((n) => st.stepN(n))
  }
  expect(run()).toEqual(run())
})

test("paramChangeIsContinuousH4", () => {
  const inp = settings[0] as LiveInputs
  const p0 = paramsFromInputs(ctx, inp, "recipe")
  const p1 = paramsFromInputs(
    ctx,
    { ...inp, scenario: { ...inp.scenario, irradiance_w_m2: 400 } },
    "recipe",
  )
  const st = startLive(p0)
  st.stepN(700)
  const before = st.state()
  st.setParams(p1)
  expect(st.state()).toEqual(before) // nothing jumps at the swap
  const f = st.stepN(1)[0]
  expect(f?.tK).toBe(before.tK) // the frame at the swap node holds the same T; only the following steps differ
})

test("paramChangeEqualsIndependentRk4H4", () => {
  // The next 1440 steps equal an RK4 written here from netFluxWM2 only, started from the same state with the new parameters.
  const inp = settings[5] as LiveInputs
  const p0 = paramsFromInputs(ctx, inp, "recipe")
  const p1 = paramsFromInputs(
    ctx,
    { ...inp, scenario: { ...inp.scenario, t_air_c: 38, wind_m_s: 0.5 } },
    "recipe",
  )
  const st = startLive(p0)
  st.stepN(555)
  const s0 = st.state()
  st.setParams(p1)
  const got = st.stepN(1440)
  const t = p1.thermal
  const flux = (tK: number, tS: number) =>
    netFluxWM2(tK, p1.forcing(tS).g, t) / t.c_a_j_m2k
  let tK = s0.tK
  let tS = s0.tS
  for (let i = 0; i < 1440; i++) {
    const k1 = flux(tK, tS)
    const k2 = flux(tK + 30 * k1, tS + 30)
    const k3 = flux(tK + 30 * k2, tS + 30)
    const k4 = flux(tK + 60 * k3, tS + 60)
    tK += (60 / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
    tS += 60
    expect(
      Math.abs(tK - (got[i + 1]?.tK ?? st.state().tK)),
    ).toBeLessThanOrEqual(i + 1 < 1440 ? T_STEPPER_TOL : T_STEPPER_TOL)
  }
})

test("relaxesToLiveSimulateH4", () => {
  // After N_settle further days the day maximum is within T_settle_k of liveSimulate's nominal for the new settings.
  const inp = settings[0] as LiveInputs
  for (const patch of [
    { irradiance_w_m2: 1000 },
    { t_air_c: 24 },
    { wind_m_s: 0.5 },
  ]) {
    const next: LiveInputs = { ...inp, scenario: { ...inp.scenario, ...patch } }
    const st = startLive(paramsFromInputs(ctx, inp, "recipe"))
    st.setParams(paramsFromInputs(ctx, next, "recipe"))
    let tMax = 0
    for (let d = 0; d < N_SETTLE; d++)
      tMax = Math.max(...st.stepN(1440).map((f) => f.tK))
    const nominal = liveSimulate(next, ctx, 2, LIVE_SEED).nominal.t_max_c
    expect(Math.abs(tMax - 273.15 - nominal)).toBeLessThanOrEqual(T_SETTLE_K)
  }
})

test("clampsSpeedAndStepsF10", () => {
  const p = paramsFromInputs(ctx, settings[0] as LiveInputs, "recipe")
  const st = startLive(p)
  for (const bad of [Number.NaN, -3, Number.NEGATIVE_INFINITY])
    expect(st.stepN(bad)).toEqual([])
  expect(st.stepN(1e9).length).toBe(MAX_STEPS_PER_REQUEST)
  expect(st.stepN(2.9).length).toBe(2)
  // the step count the loop asks for is finite and non-negative for any dt and speed
  for (const [dt, sp] of [
    [Number.NaN, 1],
    [16, Number.NaN],
    [-5, 1],
    [16, -1],
    [Number.POSITIVE_INFINITY, 4],
  ] as const) {
    const r = stepsFor(dt, sp, 0.3)
    expect(r.n).toBe(0)
    expect(r.carry).toBe(0.3)
  }
  // 16.7 ms at 1x is 1.5 steps: the remainder is carried, never lost
  let carry = 0
  let total = 0
  for (let i = 0; i < 60; i++) {
    const r = stepsFor(1000 / 60, 1, carry)
    carry = r.carry
    total += r.n
  }
  expect(total + carry).toBeCloseTo(90, 9)
  expect(carry).toBeLessThan(1)
  expect(total).toBeGreaterThanOrEqual(89)
})

test("outOfRangeIsPhysicsRangeErrorF3", () => {
  const inp = settings[0] as LiveInputs
  const bad = paramsFromInputs(
    ctx,
    { ...inp, scenario: { ...inp.scenario, irradiance_w_m2: 2500 } },
    "recipe",
  )
  expect(() => startLive(bad).stepN(1)).toThrow(PhysicsRangeError)
  const cold = paramsFromInputs(
    ctx,
    { ...inp, scenario: { ...inp.scenario, t_air_c: -200 } },
    "recipe",
  )
  expect(() => startLive(cold).stepN(1)).toThrow(PhysicsRangeError)
  // a bad swap throws and leaves the last valid state in place
  const st = startLive(paramsFromInputs(ctx, inp, "recipe"))
  const s = st.state()
  expect(() => st.setParams(bad)).toThrow(PhysicsRangeError)
  expect(st.state()).toEqual(s)
  expect(st.stepN(1).length).toBe(1)
})

test("temperatureStaysInTheBracketForAnySliderInRangeH4", () => {
  const inp = settings[0] as LiveInputs
  const w = ctx.weather
  fc.assert(
    fc.property(
      fc.double({
        min: w.irradiance_w_m2.values[0],
        max: w.irradiance_w_m2.values[2],
        noNaN: true,
      }),
      fc.double({
        min: w.t_air_c.values[0],
        max: w.t_air_c.values[2],
        noNaN: true,
      }),
      fc.double({
        min: w.wind_m_s.values[0],
        max: w.wind_m_s.values[2],
        noNaN: true,
      }),
      (g, a, v) => {
        const st = startLive(
          paramsFromInputs(
            ctx,
            {
              ...inp,
              scenario: { irradiance_w_m2: g, t_air_c: a, wind_m_s: v },
            },
            "recipe",
          ),
        )
        for (const f of st.stepN(1440)) {
          expect(f.tK).toBeGreaterThan(100)
          expect(f.tK).toBeLessThan(600)
        }
      },
    ),
    { numRuns: 12 },
  )
})

test("allLayersOffMakesTheRecipeEqualC0F6", () => {
  const off = {
    ...(settings[0] as LiveInputs),
    layers: { primer: false, midcoat: false, topcoat: false },
  }
  const a = day(
    startLive(paramsFromInputs(ctx, off, "recipe")),
    paramsFromInputs(ctx, off, "recipe"),
  )
  const b = day(
    startLive(paramsFromInputs(ctx, off, "c0")),
    paramsFromInputs(ctx, off, "c0"),
  )
  expect(a.t_max_c).toBe(b.t_max_c)
})
