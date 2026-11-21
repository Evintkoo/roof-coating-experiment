import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import {
  checkConstraints,
  lhsDesign,
  weatherL9,
} from "../../../src/core/design"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { type LiveInputs, liveSimulate } from "../../../src/core/pipeline/live"
import { CONTROL_LAYERS, evaluate } from "../../../src/core/pipeline/stackProps"
import type { FlaggedDesignRow } from "../../../src/core/schema"
import { loadContext } from "../../../src/node/context"
import { simulateAll } from "../../../src/node/simulate"
import { repoRoot } from "../../helpers"

const SEED = 20261121
let ctx: ModelContext
let cand: FlaggedDesignRow

const inputsFor = (c: FlaggedDesignRow, sid: string): LiveInputs => {
  const s = weatherL9(ctx.weather).find((w) => w.scenario_id === sid)
  if (!s) throw new Error("no scenario")
  const { candidate_id: _id, feasible: _f, violations: _v, ...design } = c
  return {
    design,
    ph: 0.5 * (ctx.ranges.sol_gel_ph.min + ctx.ranges.sol_gel_ph.max),
    layers: CONTROL_LAYERS.C4,
    scenario: {
      irradiance_w_m2: s.irradiance_w_m2,
      t_air_c: s.t_air_c,
      wind_m_s: s.wind_m_s,
    },
  }
}
const codeOf = (f: () => unknown): number => {
  try {
    f()
  } catch (e) {
    return (e as { code?: number }).code ?? -1
  }
  return 0
}

beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
  const rows = checkConstraints(lhsDesign(20, ctx.ranges, 11), ctx.ranges)
  cand = rows.find((r) => r.feasible) as FlaggedDesignRow
})

test("liveEqualsBatchRowAtN256", async () => {
  const sim = await simulateAll(
    [cand],
    weatherL9(ctx.weather),
    ctx,
    256,
    SEED,
    1,
  )
  const row = sim.results.find((r) => r.scenario_id === "W3")
  if (!row) throw new Error("no W3 row")
  const r = liveSimulate(inputsFor(cand, "W3"), ctx, 256, SEED)
  const close = (a: number, b: number) =>
    expect(Math.abs(a - b)).toBeLessThan(1e-9)
  close(r.nominal.r_solar, row.r_solar_pred)
  close(r.nominal.t_max_c, row.t_max_pred)
  close(r.bands.r_solar.lo, row.r_solar_lo)
  close(r.bands.r_solar.hi, row.r_solar_hi)
  close(r.bands.t_max_c.lo, row.t_max_lo)
  close(r.bands.t_max_c.hi, row.t_max_hi)
  close(r.bands.corrosion_risk.lo, row.corrosion_proxy_lo)
  close(r.bands.corrosion_risk.hi, row.corrosion_proxy_hi)
  close(r.bands.wetting_score.lo, row.wetting_proxy_lo)
  close(r.bands.wetting_score.hi, row.wetting_proxy_hi)
  close(r.bands.delam_proxy.lo, row.delam_proxy_lo)
  close(r.bands.delam_proxy.hi, row.delam_proxy_hi)
  // the bands are not degenerate, so the comparison above can fail
  expect(r.bands.t_max_c.hi - r.bands.t_max_c.lo).toBeGreaterThan(1e-6)
}, 60000)

test("bandsContainNominal", () => {
  const r = liveSimulate(inputsFor(cand, "W5"), ctx, 16, SEED)
  const nom = r.nominal
  for (const [v, b] of [
    [nom.r_solar, r.bands.r_solar],
    [nom.t_max_c, r.bands.t_max_c],
    [nom.corrosion_risk, r.bands.corrosion_risk],
    [nom.wetting_score, r.bands.wetting_score],
    [nom.delam_proxy, r.bands.delam_proxy],
  ] as const) {
    expect(b.lo).toBeLessThanOrEqual(v)
    expect(b.hi).toBeGreaterThanOrEqual(v)
  }
  for (let i = 0; i < r.series.t_k.length; i++) {
    expect(r.series.lo[i] as number).toBeLessThanOrEqual(
      r.series.t_k[i] as number,
    )
    expect(r.series.hi[i] as number).toBeGreaterThanOrEqual(
      r.series.t_k[i] as number,
    )
  }
  for (let i = 0; i < r.spectrum.nominal.length; i++) {
    expect(r.spectrum.lo[i] as number).toBeLessThanOrEqual(
      r.spectrum.nominal[i] as number,
    )
    expect(r.spectrum.hi[i] as number).toBeGreaterThanOrEqual(
      r.spectrum.nominal[i] as number,
    )
  }
  expect(r.series.t_k.length).toBe(144)
  expect(r.spectrum.nominal.length).toBe(221)
})

test("allLayersOffEqualsC0", () => {
  const inp = {
    ...inputsFor(cand, "W3"),
    layers: CONTROL_LAYERS.C0,
  }
  const r = liveSimulate(inp, ctx, 8, SEED)
  const s = inp.scenario
  const c0 = evaluate(
    { ...inp.design, ph: inp.ph },
    {
      ...s,
      h_conv_w_m2k:
        ctx.weather.h_conv_a.value + ctx.weather.h_conv_b.value * s.wind_m_s,
      t_sky_k: 0.0552 * (s.t_air_c + 273.15) ** 1.5,
    },
    CONTROL_LAYERS.C0,
    ctx,
  )
  expect(r.nominal.t_max_c).toBeCloseTo(c0.t_max_c, 9)
  expect(r.nominal.r_solar).toBe(c0.r_solar)
  expect(r.controls.C0.t_max_c).toBeCloseTo(r.nominal.t_max_c, 9)
  expect(Number.isNaN(r.nominal.delam_proxy)).toBe(true)
  expect(Number.isNaN(r.bands.delam_proxy.lo)).toBe(true)
  expect(r.nThermalCases).toBe(9)
})

test("outOfDomainInputThrowsCode4", () => {
  const base = inputsFor(cand, "W3")
  expect(
    codeOf(() =>
      liveSimulate(
        { ...base, design: { ...base.design, midcoat_dft_um: 5000 } },
        ctx,
        2,
        SEED,
      ),
    ),
  ).toBe(4)
  expect(
    codeOf(() =>
      liveSimulate(
        { ...base, scenario: { ...base.scenario, irradiance_w_m2: 1e6 } },
        ctx,
        2,
        SEED,
      ),
    ),
  ).toBe(4)
  expect(codeOf(() => liveSimulate(base, ctx, 2, SEED))).toBe(0)
})

test("liveRunsOneThermalCasePerDraw", () => {
  for (const n of [1, 4, 32]) {
    const r = liveSimulate(inputsFor(cand, "W1"), ctx, n, SEED)
    expect(r.nThermalCases).toBe(n + 1)
    expect(r.nDraws).toBe(n)
  }
})

test("workerBundleHasNoZod", async () => {
  const entry = join(repoRoot, "tests", "fixtures", "liveBundleEntry.ts")
  const out = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "iife",
    minify: false,
  })
  expect(out.success).toBe(true)
  const text = await (out.outputs[0] as Blob).text()
  expect(text).not.toContain("ZodError")
  expect(text).not.toContain("node:")
  expect(text).toContain("liveSimulate")
})

test("liveUnder100msForN32", () => {
  const inp = inputsFor(cand, "W3")
  liveSimulate(inp, ctx, 32, SEED) // warm up
  const t: number[] = []
  for (let i = 0; i < 9; i++) {
    const t0 = performance.now()
    liveSimulate(inp, ctx, 32, SEED)
    t.push(performance.now() - t0)
  }
  t.sort((a, b) => a - b)
  expect(t[4] as number).toBeLessThan(100)
})

test("seedFixedBandsDoNotJitter", () => {
  const inp = inputsFor(cand, "W7")
  const a = liveSimulate(inp, ctx, 8, SEED)
  const b = liveSimulate(inp, ctx, 8, SEED)
  expect(b).toEqual(a)
  const c = liveSimulate(inp, ctx, 8, SEED + 1)
  expect(c.bands.t_max_c).not.toEqual(a.bands.t_max_c)
})
