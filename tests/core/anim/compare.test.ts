import { beforeAll, expect, test } from "bun:test"
import {
  CompareError,
  cumulativeHeat,
  diffAt,
  heatOverDay,
  laneSeries,
  nodeTimes,
} from "../../../src/core/anim/compare"
import { sampleSeries } from "../../../src/core/anim/frames"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { type LiveInputs, liveSimulate } from "../../../src/core/pipeline/live"
import { fluxAt } from "../../../src/web/anim/flux"
import { LIVE_SEED } from "../../../src/web/liveState"
import { testCtx } from "../../support/dayData"
import { twelveSettings } from "../../support/liveSettings"

// Frozen from the plan 08 spike Q5 (docs/spikes/plan-08.md), never edited.
const T_HEAT_TOL = 0.06
const K = 273.15
let ctx: ModelContext
let settings: LiveInputs[]
beforeAll(async () => {
  ctx = await testCtx()
  settings = twelveSettings(ctx)
})
const liveAt = (i: LiveInputs) => liveSimulate(i, ctx, 4, LIVE_SEED)

test("lanesEqualTheSeriesH1", () => {
  // 24 scrub positions: on a node the flux lanes equal fluxAt exactly; between nodes the surface and conducted lanes equal
  // sampleSeries of the solved series, and the analytic reflected and absorbed lanes stay within the chord error of the half sine
  // (at most G h^2 / 8 (pi/12)^2 = 0.24 W/m2 at G = 1000, h = 1/6 h).
  const nodes = Array.from({ length: 24 }, (_, i) => i * 6)
  const between = Array.from({ length: 24 }, (_, i) => i + 0.37)
  for (const inp of settings) {
    const r = liveAt(inp)
    const lanes = laneSeries(r, inp, ctx.weather)
    expect(lanes.map((l) => l.id)).toEqual([
      "surface_c",
      "reflected",
      "absorbed",
      "conducted",
      "cumulative_wh",
    ])
    const t = nodeTimes(r.series.t_k.length)
    const model = (o: typeof r.nominal) => ({
      gPeak: inp.scenario.irradiance_w_m2,
      rSolar: o.r_solar,
      tInsideK: ctx.weather.roof.t_inside_c.value + K,
      rTotal: ctx.weather.roof.r_total_m2k_w.value,
      tSurfaceK: o.t_surface_k as Float64Array,
    })
    const outs = [r.nominal, r.controls.C0, r.controls.C1] as const
    const at = (l: (typeof lanes)[number], k: number): Float64Array =>
      [l.recipe, l.c0, l.c1 as Float64Array][k] as Float64Array
    outs.forEach((o, k) => {
      for (const n of nodes) {
        const f = fluxAt(n / 6, model(o))
        for (const [li, key] of [
          [1, "reflected"],
          [2, "absorbed"],
          [3, "conducted"],
        ] as const)
          expect(
            at(lanes[li] as (typeof lanes)[0], k)[n] as number,
          ).toBeCloseTo(f[key], 9)
      }
      for (const tH of between) {
        const s = sampleSeries(t, o.t_surface_k as Float64Array, tH)
        expect(
          sampleSeries(t, at(lanes[0] as (typeof lanes)[0], k), tH),
        ).toBeCloseTo(s - K, 9)
        const f = fluxAt(tH, model(o))
        expect(
          sampleSeries(t, at(lanes[3] as (typeof lanes)[0], k), tH),
        ).toBeCloseTo(f.conducted, 9)
        for (const [li, key] of [
          [1, "reflected"],
          [2, "absorbed"],
        ] as const)
          expect(
            Math.abs(
              sampleSeries(t, at(lanes[li] as (typeof lanes)[0], k), tH) -
                f[key],
            ),
          ).toBeLessThan(0.3)
      }
    })
  }
})

test("cumulativeEqualsMeanTimes24H2", () => {
  for (const inp of settings) {
    const r = liveAt(inp)
    const lanes = laneSeries(r, inp, ctx.weather)
    const tH = nodeTimes(r.series.t_k.length)
    const cond = lanes[3] as (typeof lanes)[number]
    const outs = [r.nominal, r.controls.C0, r.controls.C1]
    const total = [cond.recipe, cond.c0, cond.c1 as Float64Array].map((c) =>
      heatOverDay(c, tH),
    )
    outs.forEach((o, k) => {
      expect(
        Math.abs((total[k] as number) - o.q_in_mean_w_m2 * 24),
      ).toBeLessThan(T_HEAT_TOL)
    })
    // the cumulative lane ends at the trapezoid to the last node, and recipe minus C0 follows the means
    const cum = lanes[4] as (typeof lanes)[number]
    expect(cum.recipe.at(-1)).toBeCloseTo(
      cumulativeHeat(cond.recipe, tH).at(-1) as number,
      12,
    )
    const dm =
      (total[0] as number) -
      (total[1] as number) -
      (r.nominal.q_in_mean_w_m2 - r.controls.C0.q_in_mean_w_m2) * 24
    expect(Math.abs(dm)).toBeLessThan(T_HEAT_TOL)
  }
})

test("diffIsRecomputedH3", () => {
  const inp = settings[3] as LiveInputs
  const r = liveAt(inp)
  const lanes = laneSeries(r, inp, ctx.weather)
  for (let k = 0; k < 24; k++) {
    const tH = k + 0.5
    const d = diffAt(lanes[0] as (typeof lanes)[0], tH)
    // independent: straight interpolation between the two raw nodes, no shared code
    const x = tH * 6
    const i = Math.floor(x)
    const w = x - i
    const raw = (s: Float64Array) =>
      (s[i] as number) * (1 - w) + (s[i + 1] as number) * w
    const rec = raw(r.series.t_k)
    expect(d.c0).toBeCloseTo(
      rec - raw(r.controls.C0.t_surface_k as Float64Array),
      9,
    )
    expect(d.c1 as number).toBeCloseTo(
      rec - raw(r.controls.C1.t_surface_k as Float64Array),
      9,
    )
  }
})

test("lanesRejectUnequalLengthsF2", () => {
  const inp = settings[0] as LiveInputs
  const r = liveAt(inp)
  const short = {
    ...r,
    controls: {
      ...r.controls,
      C0: {
        ...r.controls.C0,
        t_surface_k: (r.controls.C0.t_surface_k as Float64Array).slice(0, 100),
      },
    },
  }
  let err: unknown
  try {
    laneSeries(short, inp, ctx.weather)
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(CompareError)
  expect((err as CompareError).code).toBe(4)
  expect((err as CompareError).phase).toBe("compare")
})

test("c1NullWhenAbsentF1", () => {
  const inp = settings[0] as LiveInputs
  const r = liveAt(inp)
  const { t_surface_k: _x, ...c1 } = r.controls.C1
  const lanes = laneSeries(
    { ...r, controls: { ...r.controls, C1: c1 } },
    inp,
    ctx.weather,
  )
  expect(lanes.every((l) => l.c1 === null)).toBe(true)
  expect(lanes.every((l) => l.c0.length === l.recipe.length)).toBe(true)
  expect(diffAt(lanes[0] as (typeof lanes)[0], 12).c1).toBeNull()
})
