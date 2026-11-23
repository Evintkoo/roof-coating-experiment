import { beforeAll, expect, test } from "bun:test"
import fc from "fast-check"
import { mergeOrdered } from "../../../src/core/anim/screening"
import {
  isSweepable,
  layerOf,
  liveValueOf,
  SweepError,
  type SweepVar,
  sweepChunk,
  sweepContext,
  sweepInputs,
  sweepValues,
  sweepVariables,
} from "../../../src/core/anim/sweep"
import { VARS } from "../../../src/core/opt/vars"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { type LiveInputs, liveSimulate } from "../../../src/core/pipeline/live"
import { shuffleInPlace, Xoshiro128 } from "../../../src/core/rng"
import { defaultLiveState, LIVE_SEED, N_LIVE } from "../../../src/web/liveState"
import { testCtx } from "../../support/dayData"

let ctx: ModelContext
let base: LiveInputs
let vars: SweepVar[]
beforeAll(async () => {
  ctx = await testCtx()
  base = defaultLiveState(ctx.ranges, ctx.weather).inputs
  vars = sweepVariables(ctx.ranges, ctx.weather)
})
const N = 41
const DRAWS = 4

const all = (v: SweepVar, n = N, draws = DRAWS) => {
  const values = sweepValues(v, liveValueOf(v, base, ctx), n)
  const idx = values.map((_, i) => i)
  return {
    values,
    out: sweepChunk(ctx, base, v, values, idx, draws, LIVE_SEED),
  }
}

test("sweepVariablesCoverThe13H5", () => {
  expect(vars.length).toBe(13)
  const key = (k: string) => vars.find((v) => v.key === k) as SweepVar
  for (const k of [
    "primer_gptes_molfrac",
    "primer_dft_um",
    "midcoat_pvc",
    "midcoat_tio2_fraction",
    "midcoat_dft_um",
    "topcoat_mtes_molfrac",
    "topcoat_dft_um",
  ] as const) {
    expect(key(k).min).toBe(ctx.ranges[k].min)
    expect(key(k).max).toBe(ctx.ranges[k].max)
  }
  expect([key("ph").min, key("ph").max]).toEqual([
    ctx.ranges.sol_gel_ph.min,
    ctx.ranges.sol_gel_ph.max,
  ])
  for (const g of ["d_tio2_um", "d_baso4_um"]) {
    const o = VARS.find((x) => x.id === g) as (typeof VARS)[number]
    expect([key(g).min, key(g).max]).toEqual([o.lo, o.hi])
  }
  for (const k of ["irradiance_w_m2", "t_air_c", "wind_m_s"] as const) {
    expect(key(k).min).toBe(ctx.weather[k].values[0])
    expect(key(k).max).toBe(ctx.weather[k].values[2])
  }
  expect(vars.every(isSweepable)).toBe(true)
})

test("sweepValuesContainTheLiveValueD6", () => {
  const v = vars[4] as SweepVar
  fc.assert(
    fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (f) => {
      const live = v.min + (v.max - v.min) * f
      const xs = sweepValues(v, live, N)
      expect(xs.length).toBe(N)
      expect(xs.includes(live)).toBe(true)
      for (let i = 1; i < xs.length; i++)
        expect(xs[i] as number).toBeGreaterThan(xs[i - 1] as number)
      expect(xs[0]).toBeGreaterThanOrEqual(v.min)
      expect(xs.at(-1)).toBeLessThanOrEqual(v.max)
    }),
    { numRuns: 200 },
  )
})

test("sweepPointEqualsLiveSimulateH5H6", () => {
  for (const v of vars) {
    const { values, out } = all(v)
    expect(out.length).toBe(N)
    values.forEach((x, i) => {
      const o = out[i] as (typeof out)[number]
      expect(o.index).toBe(i)
      // direct sequential call with that input, built here without the sweep helpers
      const inp: LiveInputs = v.grade
        ? base
        : v.key === "ph"
          ? { ...base, ph: x }
          : v.group === "scenario"
            ? { ...base, scenario: { ...base.scenario, [v.key]: x } }
            : { ...base, design: { ...base.design, [v.key]: x } }
      const c = v.grade
        ? {
            ...ctx,
            mat: {
              ...ctx.mat,
              [v.grade]: {
                ...ctx.mat[v.grade],
                diameter_um: { ...ctx.mat[v.grade].diameter_um, value: x },
              },
            },
          }
        : ctx
      const r = liveSimulate(inp, c, DRAWS, LIVE_SEED)
      for (const k of [
        "r_solar",
        "t_max_c",
        "q_in_mean_w_m2",
        "corrosion_risk",
        "delam_proxy",
        "cost_proxy",
      ] as const)
        expect(
          Object.is(o.point.nominal[k], r.nominal[k]) ||
            Math.abs(o.point.nominal[k] - r.nominal[k]) < 1e-9,
        ).toBe(true)
      for (const b of [
        "r_solar",
        "t_max_c",
        "corrosion_risk",
        "wetting_score",
        "delam_proxy",
      ] as const)
        for (const e of ["lo", "hi"] as const)
          expect(
            Object.is(o.point.bands[b][e], r.bands[b][e]) ||
              Math.abs(o.point.bands[b][e] - r.bands[b][e]) < 1e-9,
          ).toBe(true)
    })
  }
})

test("theLivePointIsTheLiveResultExactlyH6", () => {
  for (const v of [vars[4], vars[9], vars[11]] as SweepVar[]) {
    const live = liveValueOf(v, base, ctx)
    const values = sweepValues(v, live, N)
    const i = values.indexOf(live)
    expect(i).toBeGreaterThanOrEqual(0)
    const p = (
      sweepChunk(ctx, base, v, values, [i], N_LIVE, LIVE_SEED)[0] as {
        point: ReturnType<typeof sweepChunk>[0]["point"]
      }
    ).point
    const r = liveSimulate(base, ctx, N_LIVE, LIVE_SEED)
    expect(p.nominal.t_max_c).toBe(r.nominal.t_max_c)
    expect(p.nominal.r_solar).toBe(r.nominal.r_solar)
    expect(p.bands.t_max_c).toEqual(r.bands.t_max_c)
    expect(p.bands.delam_proxy).toEqual(r.bands.delam_proxy)
    expect(p.c0.t_max_c).toBe(r.controls.C0.t_max_c)
  }
})

test("controlsFlatForDesignCurveForWeatherH8", () => {
  for (const v of vars) {
    const { out } = all(v, N, 2)
    const spread = (f: (p: (typeof out)[0]["point"]) => number) => {
      const xs = out.map((o) => f(o.point))
      return Math.max(...xs) - Math.min(...xs)
    }
    const weather = v.group === "scenario"
    for (const f of [
      (p: (typeof out)[0]["point"]) => p.c0.t_max_c,
      (p: (typeof out)[0]["point"]) => p.c1.t_max_c,
    ]) {
      if (weather) expect(spread(f)).toBeGreaterThan(1e-3)
      else expect(spread(f)).toBeLessThan(1e-12)
    }
  }
})

test("c1NaNOutcomesStayNaNH9", () => {
  const { out } = all(vars[0] as SweepVar, 5, 2)
  for (const o of out) {
    for (const k of [
      "corrosion_risk",
      "delam_proxy",
      "wetting_score",
      "cost_proxy",
    ] as const)
      expect(Number.isNaN(o.point.c1[k])).toBe(true)
    expect(Number.isFinite(o.point.c1.t_max_c)).toBe(true)
    expect(Number.isFinite(o.point.c1.r_solar)).toBe(true)
  }
})

test("zeroWidthRangeIsNotSweepableF3", () => {
  const v: SweepVar = { ...(vars[0] as SweepVar), min: 0.5, max: 0.5 }
  expect(isSweepable(v)).toBe(false)
  expect(() => sweepValues(v, 0.5, N)).toThrow(SweepError)
  expect(isSweepable({ ...v, max: Number.NaN })).toBe(false)
})

test("sweepIsOrderIndependentH7", () => {
  const v = vars[7] as SweepVar
  const values = sweepValues(v, liveValueOf(v, base, ctx), 9)
  const chunks = [
    [0, 1, 2],
    [3, 4],
    [5, 6, 7, 8],
  ].map((idx) => sweepChunk(ctx, base, v, values, idx, 2, LIVE_SEED))
  const merge = (cs: typeof chunks) =>
    JSON.stringify(
      mergeOrdered(
        cs.flat().map((o) => ({ index: o.index, value: o.point })),
        9,
      ),
    )
  const ref = merge(chunks)
  for (const seed of [1, 2, 3]) {
    const c = [...chunks]
    shuffleInPlace(new Xoshiro128(seed), c)
    expect(merge(c)).toBe(ref)
  }
  expect(ref).toBe(
    JSON.stringify(
      sweepChunk(
        ctx,
        base,
        v,
        values,
        values.map((_, i) => i),
        2,
        LIVE_SEED,
      ).map((o) => o.point),
    ),
  )
})

test("layersAndInputsAreMappedPerVariable", () => {
  const k = (s: string) => vars.find((v) => v.key === s) as SweepVar
  expect(layerOf(k("primer_dft_um"))).toBe("primer")
  expect(layerOf(k("ph"))).toBe("primer")
  expect(layerOf(k("midcoat_pvc"))).toBe("midcoat")
  expect(layerOf(k("d_baso4_um"))).toBe("midcoat")
  expect(layerOf(k("topcoat_dft_um"))).toBe("topcoat")
  expect(layerOf(k("wind_m_s"))).toBeNull()
  expect(sweepInputs(base, k("d_tio2_um"), 0.3)).toBe(base)
  expect(
    sweepContext(ctx, k("d_tio2_um"), 0.3).mat.tio2.diameter_um.value,
  ).toBe(0.3)
  expect(sweepContext(ctx, k("ph"), 3)).toBe(ctx)
  expect(sweepInputs(base, k("ph"), 3).ph).toBe(3)
})
