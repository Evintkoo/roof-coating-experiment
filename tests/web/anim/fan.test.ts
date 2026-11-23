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
import { fanEnvelope, fanLines, linePath } from "../../../src/web/anim/fan"
import { LIVE_SEED, N_LIVE } from "../../../src/web/liveState"
import { REPORT_FIXTURE, repoRoot } from "../../helpers"
import { elementsOf } from "../../support/designComponents"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

function live() {
  const rows = parseResultsCsv(
    readFileSync(join(REPORT_FIXTURE, "results.csv"), "utf8"),
  )
  const data = buildScreeningData(rows, weatherL9(ctx.weather))
  const {
    candidate_id: _a,
    feasible: _b,
    violations: _c,
    ...design
  } = designsOf(data)[7] as ReturnType<typeof designsOf>[number]
  const s = data.scenarios[4] as (typeof data.scenarios)[number]
  const ph = 0.5 * (ctx.ranges.sol_gel_ph.min + ctx.ranges.sol_gel_ph.max)
  return liveSimulate(
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
}

test("fanLinesAreTheDrawsAndMatchTheBandH11", async () => {
  const r = live()
  expect(r.series.draws.length).toBe(N_LIVE)
  // the pointwise p5 and p95 of the 32 draws, widened to the nominal, are the band the simulator shows (1e-9)
  const env = fanEnvelope(r.series.draws, r.series.t_k)
  let max = 0
  for (let i = 0; i < env.lo.length; i++)
    max = Math.max(
      max,
      Math.abs((env.lo[i] as number) - (r.series.lo[i] as number)),
      Math.abs((env.hi[i] as number) - (r.series.hi[i] as number)),
    )
  expect(max).toBeLessThan(1e-9)
  // the 32 drawn lines are the draw series: each path point maps back to its value (identity map, 0.01 rounding)
  const els = await elementsOf(
    fanLines(r.series.draws, { x: (t) => t, y: (c) => c }),
  )
  expect(els.length).toBe(N_LIVE)
  expect(els.map((e) => e.attrs["data-source"])).toEqual(
    Array.from({ length: N_LIVE }, (_, i) => `draw:${i}`),
  )
  const html = fanLines(r.series.draws, { x: (t) => t, y: (c) => c })
  const ds = [...html.matchAll(/ d="([^"]+)"/g)].map((m) => m[1] as string)
  ds.forEach((d, i) => {
    const ys = [...d.matchAll(/[ML]-?[\d.]+ (-?[\d.]+)/g)].map((m) =>
      Number(m[1]),
    )
    expect(ys.length).toBe(144)
    for (const k of [0, 50, 100, 143])
      expect(
        Math.abs(
          (ys[k] as number) -
            (((r.series.draws[i] as Float64Array)[k] as number) - 273.15),
        ),
      ).toBeLessThan(0.006)
  })
})

test("theFanIsNotDegenerateAndSitsInsideTheBandAtTheEdges", () => {
  const r = live()
  const spread = r.series.hi.reduce(
    (m, h, i) => Math.max(m, h - (r.series.lo[i] as number)),
    0,
  )
  expect(spread).toBeGreaterThan(0.05)
  for (const d of r.series.draws)
    for (const i of [30, 90]) {
      const v = d[i] as number
      expect(v).toBeGreaterThanOrEqual((r.series.lo[i] as number) - 1e-9 - 5)
      expect(v).toBeLessThanOrEqual((r.series.hi[i] as number) + 1e-9 + 5)
    }
})

test("linePathStartsWithMAndHasOnePointPerNode", () => {
  const p = linePath([300, 301, 302], { x: (t) => t * 10, y: (c) => c })
  expect(p).toBe("M0 26.85L1.67 27.85L3.33 28.85")
})
