import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import fc from "fast-check"
import type { ModelContext } from "../../src/core/pipeline/context"
import { loadContext } from "../../src/node/context"
import {
  clampInputs,
  DESIGN_KEYS,
  defaultLiveState,
  sliderSpecs,
} from "../../src/web/liveState"
import { repoRoot } from "../helpers"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

test("defaultLiveStateInsideRanges", () => {
  const { inputs } = defaultLiveState(ctx.ranges, ctx.weather)
  for (const k of DESIGN_KEYS) {
    expect(inputs.design[k]).toBeGreaterThanOrEqual(ctx.ranges[k].min)
    expect(inputs.design[k]).toBeLessThanOrEqual(ctx.ranges[k].max)
  }
  expect(inputs.ph).toBeGreaterThanOrEqual(ctx.ranges.sol_gel_ph.min)
  expect(inputs.layers).toEqual({ primer: true, midcoat: true, topcoat: true })
  expect(inputs.scenario.irradiance_w_m2).toBe(
    ctx.weather.irradiance_w_m2.values[1],
  )
})

test("clampInputsKeepsInsideRanges", () => {
  const w = ctx.weather
  const wild = fc.oneof(
    fc.double({ min: -1e6, max: 1e6 }),
    fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ),
  )
  fc.assert(
    fc.property(fc.array(wild, { minLength: 11, maxLength: 11 }), (v) => {
      const base = defaultLiveState(ctx.ranges, w).inputs
      const design = { ...base.design }
      DESIGN_KEYS.forEach((k, i) => {
        design[k] = v[i] as number
      })
      const out = clampInputs(
        {
          ...base,
          design,
          ph: v[7] as number,
          scenario: {
            irradiance_w_m2: v[8] as number,
            t_air_c: v[9] as number,
            wind_m_s: v[10] as number,
          },
        },
        ctx.ranges,
        w,
      )
      for (const k of DESIGN_KEYS) {
        expect(out.design[k]).toBeGreaterThanOrEqual(ctx.ranges[k].min)
        expect(out.design[k]).toBeLessThanOrEqual(ctx.ranges[k].max)
      }
      expect(out.ph).toBeGreaterThanOrEqual(ctx.ranges.sol_gel_ph.min)
      expect(out.ph).toBeLessThanOrEqual(ctx.ranges.sol_gel_ph.max)
      const s = out.scenario
      expect(s.irradiance_w_m2).toBeGreaterThanOrEqual(
        w.irradiance_w_m2.values[0],
      )
      expect(s.irradiance_w_m2).toBeLessThanOrEqual(w.irradiance_w_m2.values[2])
      expect(s.t_air_c).toBeGreaterThanOrEqual(w.t_air_c.values[0])
      expect(s.t_air_c).toBeLessThanOrEqual(w.t_air_c.values[2])
      expect(s.wind_m_s).toBeGreaterThanOrEqual(w.wind_m_s.values[0])
      expect(s.wind_m_s).toBeLessThanOrEqual(w.wind_m_s.values[2])
    }),
    { numRuns: 200 },
  )
})

test("clampLeavesInRangeValuesAlone", () => {
  const base = defaultLiveState(ctx.ranges, ctx.weather).inputs
  expect(clampInputs(base, ctx.ranges, ctx.weather)).toEqual(base)
})

test("sliderSpecsComeFromRangesNotLiterals", () => {
  const specs = sliderSpecs(ctx.ranges, ctx.weather)
  expect(specs.length).toBe(11)
  const dft = specs.find((s) => s.key === "midcoat_dft_um")
  expect(dft?.min).toBe(ctx.ranges.midcoat_dft_um.min)
  expect(dft?.max).toBe(ctx.ranges.midcoat_dft_um.max)
  const wind = specs.find((s) => s.key === "wind_m_s")
  expect(wind?.max).toBe(ctx.weather.wind_m_s.values[2])
  for (const s of specs) {
    expect(s.step).toBeGreaterThan(0)
    expect(s.value).toBeGreaterThanOrEqual(s.min)
    expect(s.value).toBeLessThanOrEqual(s.max)
  }
})
