import { beforeAll, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildScreeningData, designsOf } from "../../../src/core/anim/screening"
import { weatherL9 } from "../../../src/core/design"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { liveSimulate } from "../../../src/core/pipeline/live"
import { CONTROL_LAYERS } from "../../../src/core/pipeline/stackProps"
import { parseResultsCsv } from "../../../src/core/schema"
import { loadContext } from "../../../src/node/context"
import {
  arrowLength,
  FLUX_KEYS,
  fluxAt,
  fluxRefs,
  irradianceAt,
} from "../../../src/web/anim/flux"
import { REPORT_FIXTURE, repoRoot } from "../../helpers"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

test("irradianceIsTheThermalModelHalfSine", () => {
  expect(irradianceAt(6, 800)).toBeCloseTo(0, 9)
  expect(irradianceAt(12, 800)).toBeCloseTo(800, 9)
  expect(irradianceAt(18, 800)).toBeCloseTo(0, 9)
  expect(irradianceAt(3, 800)).toBe(0)
  expect(irradianceAt(22, 800)).toBe(0)
})

test("arrowLengthScalesLinearlyAndGuardsBadInput", () => {
  expect(arrowLength(400, 800, 70)).toBe(35)
  expect(arrowLength(-400, 800, 70)).toBe(-35)
  expect(arrowLength(5, 0, 70)).toBe(0)
  expect(arrowLength(Number.NaN, 5, 70)).toBe(0)
})

test("raysAndArrowsMatchModelOutputsAtFiveRecipesH10", () => {
  const rows = parseResultsCsv(
    readFileSync(join(REPORT_FIXTURE, "results.csv"), "utf8"),
  )
  const data = buildScreeningData(rows, weatherL9(ctx.weather))
  const designs = designsOf(data)
  const w5 = data.scenarios.find((s) => s.scenario_id === "W5")
  if (!w5) throw new Error("no W5")
  const roof = ctx.weather.roof
  const ph = 0.5 * (ctx.ranges.sol_gel_ph.min + ctx.ranges.sol_gel_ph.max)
  for (const i of [0, 20, 49, 70, 95]) {
    const {
      candidate_id: _a,
      feasible: _b,
      violations: _c,
      ...design
    } = designs[i] as (typeof designs)[number]
    const r = liveSimulate(
      {
        design,
        ph,
        layers: CONTROL_LAYERS.C4,
        scenario: {
          irradiance_w_m2: w5.irradiance_w_m2,
          t_air_c: w5.t_air_c,
          wind_m_s: w5.wind_m_s,
        },
      },
      ctx,
      4,
      1,
    )
    const m = {
      gPeak: w5.irradiance_w_m2,
      rSolar: r.nominal.r_solar,
      tInsideK: roof.t_inside_c.value + 273.15,
      rTotal: roof.r_total_m2k_w.value,
      tSurfaceK: r.series.t_k,
    }
    const noon = fluxAt(12, m)
    expect(noon.incident).toBeCloseTo(w5.irradiance_w_m2, 9)
    // reflected = G r_solar, reflected + absorbed = incident (to 1e-9)
    expect(
      Math.abs(noon.reflected - w5.irradiance_w_m2 * r.nominal.r_solar),
    ).toBeLessThan(1e-9)
    expect(
      Math.abs(noon.reflected + noon.absorbed - noon.incident),
    ).toBeLessThan(1e-9)
    // the series mean of the conducted arrow is the model's q_in_mean (144 of 1440 nodes: 1e-3 W/m2)
    let sum = 0
    for (let k = 0; k < r.series.t_k.length; k++)
      sum += fluxAt(k / 6, m).conducted
    expect(
      Math.abs(sum / r.series.t_k.length - r.nominal.q_in_mean_w_m2),
    ).toBeLessThan(1e-3)
    // every arrow is scaled against its own daily peak, so the peak arrow is exactly full length
    const refs = fluxRefs(m)
    for (const k of FLUX_KEYS) expect(refs[k]).toBeGreaterThan(0)
    expect(arrowLength(refs.reflected, refs.reflected, 70)).toBe(70)
  }
}, 120000)

test("aDifferentReflectanceChangesTheSplitNotTheIncident", () => {
  const base = {
    gPeak: 800,
    tInsideK: 300,
    rTotal: 0.2,
    tSurfaceK: new Array(144).fill(310),
  }
  const lo = fluxAt(12, { ...base, rSolar: 0.5 })
  const hi = fluxAt(12, { ...base, rSolar: 0.9 })
  expect(lo.incident).toBe(hi.incident)
  expect(hi.reflected).toBeGreaterThan(lo.reflected)
  expect(hi.absorbed).toBeLessThan(lo.absorbed)
  expect(lo.conducted).toBeCloseTo(50, 9)
})
