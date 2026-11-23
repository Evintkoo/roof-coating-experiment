// A real day for the player tests: the live simulation of one fixture recipe in one scenario, as the numbers the page would hold.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildScreeningData, designsOf } from "../../src/core/anim/screening"
import { weatherL9 } from "../../src/core/design"
import type { ModelContext } from "../../src/core/pipeline/context"
import { liveSimulate } from "../../src/core/pipeline/live"
import { CONTROL_LAYERS } from "../../src/core/pipeline/stackProps"
import { parseResultsCsv } from "../../src/core/schema"
import { loadContext } from "../../src/node/context"
import type { DayData } from "../../src/web/anim/dayPlayer"
import { LIVE_SEED, N_LIVE } from "../../src/web/liveState"
import { REPORT_FIXTURE, repoRoot } from "../helpers"

const K = 273.15
let cached: Promise<ModelContext> | undefined
export const testCtx = (): Promise<ModelContext> =>
  (cached ??= loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  ))

export type PlainDay = Omit<DayData, "flux" | "drawsK"> & {
  flux: Omit<DayData["flux"], "tSurfaceK"> & { tSurfaceK: number[] }
  drawsK: number[][]
}

/** Recipe `index` (0 to 95) in scenario `sid` (W1 to W9) as plain arrays (JSON safe, so a page can receive them). */
export async function loadDay(index: number, sid: string): Promise<PlainDay> {
  const ctx = await testCtx()
  const rows = parseResultsCsv(
    readFileSync(join(REPORT_FIXTURE, "results.csv"), "utf8"),
  )
  const data = buildScreeningData(rows, weatherL9(ctx.weather))
  const {
    candidate_id: _a,
    feasible: _b,
    violations: _c,
    ...design
  } = designsOf(data)[index] as ReturnType<typeof designsOf>[number]
  const s = data.scenarios.find((x) => x.scenario_id === sid)
  if (!s) throw new Error(`no scenario ${sid}`)
  const ph = 0.5 * (ctx.ranges.sol_gel_ph.min + ctx.ranges.sol_gel_ph.max)
  const r = liveSimulate(
    {
      design,
      ph,
      layers: CONTROL_LAYERS.C4,
      scenario: {
        irradiance_w_m2: s.irradiance_w_m2,
        t_air_c: s.t_air_c,
        wind_m_s: s.wind_m_s,
      },
    },
    ctx,
    N_LIVE,
    LIVE_SEED,
  )
  const C = (a: ArrayLike<number>) => Array.from(a, (v) => v - K)
  return {
    recipeC: C(r.series.t_k),
    bareC: C(r.controls.C0.t_surface_k as Float64Array),
    loC: C(r.series.lo),
    hiC: C(r.series.hi),
    drawsK: r.series.draws.map((d) => Array.from(d)),
    flux: {
      gPeak: s.irradiance_w_m2,
      rSolar: r.nominal.r_solar,
      tInsideK: ctx.weather.roof.t_inside_c.value + K,
      rTotal: ctx.weather.roof.r_total_m2k_w.value,
      tSurfaceK: Array.from(r.series.t_k),
    },
  }
}
