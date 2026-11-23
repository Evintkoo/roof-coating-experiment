import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { liveSimulate } from "../../../src/core/pipeline/live"
import { loadContext } from "../../../src/node/context"
import { dayDataOf } from "../../../src/web/anim/dayData"
import { defaultLiveState, LIVE_SEED, N_LIVE } from "../../../src/web/liveState"
import { repoRoot } from "../../helpers"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

const K = 273.15

test("dayDataIsTheLiveResultInDegreesAndTheRoofConstants", () => {
  const inputs = defaultLiveState(ctx.ranges, ctx.weather).inputs
  const r = liveSimulate(inputs, ctx, N_LIVE, LIVE_SEED)
  const d = dayDataOf(r, inputs, ctx.weather)
  expect(d.recipeC.length).toBe(r.series.t_k.length)
  for (const [i, c] of d.recipeC.entries())
    expect(c).toBeCloseTo((r.series.t_k[i] as number) - K, 9)
  for (const [i, c] of d.bareC.entries())
    expect(c).toBeCloseTo(
      ((r.controls.C0.t_surface_k as Float64Array)[i] as number) - K,
      9,
    )
  expect(d.loC.length).toBe(d.hiC.length)
  // the fan is the draws themselves (H11), not a copy with another seed
  expect(d.drawsK?.length).toBe(N_LIVE)
  expect(d.drawsK?.[0]).toBe(r.series.draws[0])
  expect(d.flux.gPeak).toBe(inputs.scenario.irradiance_w_m2)
  expect(d.flux.rSolar).toBe(r.nominal.r_solar)
  expect(d.flux.tInsideK).toBeCloseTo(ctx.weather.roof.t_inside_c.value + K, 9)
  expect(d.flux.rTotal).toBe(ctx.weather.roof.r_total_m2k_w.value)
  expect(d.flux.tSurfaceK).toBe(r.series.t_k)
})

test("aSeriesWithoutTheBareControlIsRefused", () => {
  const inputs = defaultLiveState(ctx.ranges, ctx.weather).inputs
  const r = liveSimulate(inputs, ctx, 4, LIVE_SEED)
  const broken = {
    ...r,
    controls: {
      ...r.controls,
      C0: { ...r.controls.C0, t_surface_k: undefined },
    },
  }
  expect(() =>
    dayDataOf(broken as unknown as typeof r, inputs, ctx.weather),
  ).toThrow()
})
