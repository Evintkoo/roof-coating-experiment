import { afterEach, expect, test } from "bun:test"
import { join } from "node:path"
import { weatherL9 } from "../../../src/core/design"
import { PhysicsRangeError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import {
  netFluxWM2,
  simulateDay,
  steadyStateTempK,
  type ThermalInputs,
} from "../../../src/core/models/thermal"
import { loadWeather } from "../../../src/node/config"
import { repoRoot } from "../../helpers"

const SIGMA = 5.670374419e-8
const T_THM_RTOL = 5e-7
const T_RK4_K = 1e-4
const T_RK4_SERIES_K = 3e-4
const T_Q_W_M2 = 1e-3
const T_THERMAL_MS = 3

afterEach(() => setEventSink(null))

const base: ThermalInputs = {
  r_solar: 0.8,
  emissivity: 0.9,
  g_peak_w_m2: 800,
  t_air_k: 305.15,
  t_sky_k: 290,
  h_conv_w_m2k: 15,
  t_inside_k: 305.15,
  r_total_m2k_w: 0.3,
  c_a_j_m2k: 2000,
}

type OracleCase = {
  inputs: ThermalInputs
  t_max_c: number
  q_in_mean_w_m2: number
  t_surface_k?: number[]
}
const oracle = (await Bun.file(
  join(repoRoot, "tests/fixtures/oracle/thermal.json"),
).json()) as { cases: OracleCase[] }

test("linearCaseMatchesClosedForm", () => {
  // H1: eps = 0, constant G, worst-case corner (C 1500, h 28.5, R 0.1, alpha 0.9, T0 = T_air).
  const p: ThermalInputs = {
    ...base,
    r_solar: 0.1,
    t_inside_k: 298.15,
    emissivity: 1e-300, // D9 domain is (0, 1]; 1e-300 is exactly linear in double precision
    g_peak_w_m2: 1000,
    h_conv_w_m2k: 28.5,
    r_total_m2k_w: 0.1,
    c_a_j_m2k: 1500,
  }
  const g = 1000
  const k = p.h_conv_w_m2k + 1 / p.r_total_m2k_w
  const tss =
    ((1 - p.r_solar) * g +
      p.h_conv_w_m2k * p.t_air_k +
      p.t_inside_k / p.r_total_m2k_w) /
    k
  const tau = p.c_a_j_m2k / k
  const exact = (tS: number) => tss + (p.t_air_k - tss) * Math.exp(-tS / tau)
  const early: { t: number; e: number; got: number }[] = []
  const r = simulateDay(p, {
    dtS: 5,
    gProfile: () => g,
    onStep: (tS, tK) => {
      if (tS <= 600) early.push({ t: tS, e: exact(tS), got: tK })
    },
  })
  // early transient (T0 = T_air, tau = 39 s): a wrong RK4 weight, dt or initial condition fails here
  expect(early.length).toBe(121)
  expect(early[0]?.got).toBe(p.t_air_k)
  let worstEarly = 0
  for (const x of early)
    worstEarly = Math.max(worstEarly, Math.abs(x.got - x.e) / x.e)
  expect(worstEarly).toBeLessThanOrEqual(T_THM_RTOL)
  expect(Math.abs((early[20] as { e: number }).e - p.t_air_k)).toBeGreaterThan(
    5,
  )
  expect(r.t_surface_k.length).toBe(144)
  let worst = 0
  for (let i = 0; i < 144; i++) {
    const e = exact(86400 + 600 * i)
    worst = Math.max(worst, Math.abs((r.t_surface_k[i] as number) - e) / e)
  }
  expect(worst).toBeLessThanOrEqual(T_THM_RTOL)
  expect(Math.abs(r.t_max_c + 273.15 - tss) / tss).toBeLessThanOrEqual(
    T_THM_RTOL,
  )
})

test("steadyStateResidualZero", () => {
  for (const g of [0, 300, 1000]) {
    const t = steadyStateTempK(base, g)
    expect(Math.abs(netFluxWM2(t, g, base))).toBeLessThanOrEqual(1e-6)
  }
})

test("alphaIsOneMinusR", () => {
  const p = { ...base, r_solar: 0.8 }
  const t = 330
  const hand =
    0.2 * 800 -
    0.9 * SIGMA * (t ** 4 - 290 ** 4) -
    15 * (t - 305.15) -
    (t - 305.15) / 0.3
  expect(netFluxWM2(t, 800, p)).toBeCloseTo(hand, 9)
  // inside temperature distinct from air: hand-computed with T_inside = 298.15, T_air = 305.15
  const q = { ...p, t_inside_k: 298.15 }
  const hand2 =
    0.2 * 800 -
    0.9 * SIGMA * (t ** 4 - 290 ** 4) -
    15 * (t - 305.15) -
    (t - 298.15) / 0.3
  expect(netFluxWM2(t, 800, q)).toBeCloseTo(hand2, 9)
  expect(Math.abs(hand2 - hand)).toBeGreaterThan(10)
})

test("zeroForcingStaysConstant", () => {
  const p = { ...base, t_sky_k: base.t_air_k }
  const r = simulateDay(p, { gProfile: () => 0 })
  for (const t of r.t_surface_k) expect(t).toBe(p.t_air_k)
  expect(r.t_max_c).toBeCloseTo(p.t_air_k - 273.15, 12)
  expect(Math.abs(r.q_in_mean_w_m2)).toBeLessThan(1e-9)
})

test("energyClosure", () => {
  const p: ThermalInputs = {
    ...base,
    h_conv_w_m2k: 9.5,
    r_total_m2k_w: 0.6,
    c_a_j_m2k: 2500,
  }
  const dt = 5
  const nodes: number[] = []
  const times: number[] = []
  simulateDay(p, {
    dtS: dt,
    onStep: (tS, tK) => {
      times.push(tS)
      nodes.push(tK)
    },
  })
  // Checks the integrator against the same flux function (not the coefficients; see alphaIsOneMinusR).
  // window 08:00 -> 12:00 on day 1 (strong transient), composite Simpson on the step nodes
  const i0 = Math.round((8 * 3600) / dt)
  const i1 = Math.round((12 * 3600) / dt)
  expect(i1 - i0).toBeGreaterThan(0)
  expect((i1 - i0) % 2).toBe(0)
  const gAt = (tS: number) =>
    p.g_peak_w_m2 * Math.max(0, Math.sin((Math.PI * (tS - 6 * 3600)) / 43200))
  const f = (i: number) =>
    netFluxWM2(nodes[i] as number, gAt(times[i] as number), p)
  let s = f(i0) + f(i1)
  for (let i = i0 + 1; i < i1; i++) s += (i % 2 === 1 ? 4 : 2) * f(i)
  const integral = (s * dt) / 3
  const stored = p.c_a_j_m2k * ((nodes[i1] as number) - (nodes[i0] as number))
  expect(Math.abs(integral - stored) / Math.abs(stored)).toBeLessThanOrEqual(
    1e-6,
  )
})

test("reflectanceMonotoneAllNineScenarios", () => {
  return loadWeather(join(repoRoot, "configs/weather_scenarios.yaml")).then(
    (w) => {
      const scenarios = weatherL9(w)
      expect(scenarios.length).toBe(9)
      for (const sc of scenarios) {
        let prev = Number.POSITIVE_INFINITY
        for (let i = 0; i <= 12; i++) {
          const r = 0.3 + 0.05 * i
          const res = simulateDay({
            r_solar: r,
            emissivity: 0.9,
            g_peak_w_m2: sc.irradiance_w_m2,
            t_air_k: sc.t_air_c + 273.15,
            t_sky_k: sc.t_sky_k,
            h_conv_w_m2k: sc.h_conv_w_m2k,
            t_inside_k: sc.t_air_c + 273.15,
            r_total_m2k_w: 0.3,
            c_a_j_m2k: 2000,
          })
          expect(res.t_max_c).toBeLessThan(prev)
          prev = res.t_max_c
        }
      }
    },
  )
})

test("matchesOracle200Cases", () => {
  expect(oracle.cases.length).toBe(200)
  let seriesCases = 0
  let maxT = 0
  let maxQ = 0
  let maxS = 0
  for (const c of oracle.cases) {
    const r = simulateDay(c.inputs)
    maxT = Math.max(maxT, Math.abs(r.t_max_c - c.t_max_c))
    maxQ = Math.max(maxQ, Math.abs(r.q_in_mean_w_m2 - c.q_in_mean_w_m2))
    if (c.t_surface_k) {
      seriesCases++
      expect(c.t_surface_k.length).toBe(144)
      for (let i = 0; i < 144; i++)
        maxS = Math.max(
          maxS,
          Math.abs((r.t_surface_k[i] as number) - (c.t_surface_k[i] as number)),
        )
    }
  }
  console.log(
    `oracle max errors: t_max ${maxT} K, q ${maxQ} W/m2, series ${maxS} K`,
  )
  expect(seriesCases).toBe(20)
  expect(maxT).toBeLessThanOrEqual(T_RK4_K)
  expect(maxQ).toBeLessThanOrEqual(T_Q_W_M2)
  expect(maxS).toBeLessThanOrEqual(T_RK4_SERIES_K)
})

test("dtNotDividing600Rejected", () => {
  for (const dtS of [70, 0, -60, Number.NaN, 1200]) {
    let err: unknown
    try {
      simulateDay(base, { dtS })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(PhysicsRangeError)
    expect((err as PhysicsRangeError).code).toBe(4)
  }
})

test("thermalSolvedEventAtDebug", () => {
  const seen: {
    event: string
    level: string
    fields: Record<string, unknown>
  }[] = []
  setEventSink((event, level, fields) => seen.push({ event, level, fields }))
  const r = simulateDay(base, { scenarioId: "W3" })
  const ev = seen.filter((e) => e.event === "thermal.solved")
  expect(ev.length).toBe(1)
  expect(ev[0]?.level).toBe("debug")
  expect(ev[0]?.fields).toEqual({
    scenario_id: "W3",
    t_max_c: r.t_max_c,
    n_steps: 2880,
  })
})

test("steadyStateBracketMustStraddleZero", () => {
  // g far beyond the bracket's reach is rejected by the guard; a flux that stays positive at T = 600 K is not a root
  expect(() =>
    steadyStateTempK(
      { ...base, h_conv_w_m2k: 0, emissivity: 1e-300, r_total_m2k_w: 1e12 },
      1500,
    ),
  ).toThrow(PhysicsRangeError)
})

test("zeroRTotalRejected", () => {
  for (const bad of [
    { r_total_m2k_w: 0 },
    { emissivity: 0 },
    { r_solar: 1.01 },
    { c_a_j_m2k: 0 },
    { t_air_k: Number.NaN },
  ]) {
    expect(() => simulateDay({ ...base, ...bad })).toThrow(PhysicsRangeError)
  }
  expect(() => steadyStateTempK({ ...base, r_total_m2k_w: 0 }, 800)).toThrow(
    PhysicsRangeError,
  )
})

test("runtimeUnder3ms", () => {
  const p: ThermalInputs = { ...base, c_a_j_m2k: 2000 }
  for (let i = 0; i < 50; i++) simulateDay(p) // warm up the JIT
  const times: number[] = []
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now()
    simulateDay(p)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const median = times[10] as number
  console.log(
    `thermal 48 h dt=60 s: median ${median.toFixed(3)} ms, min ${times[0]?.toFixed(3)} ms`,
  )
  expect(median).toBeLessThan(T_THERMAL_MS)
})
