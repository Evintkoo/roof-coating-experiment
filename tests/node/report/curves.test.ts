import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import {
  checkConstraints,
  lhsDesign,
  type scenarioFrom,
  weatherL9,
} from "../../../src/core/design"
import { safeJson } from "../../../src/core/json"
import type { ModelContext } from "../../../src/core/pipeline/context"
import {
  CONTROL_LAYERS,
  stackProps,
  thermalOutcomes,
} from "../../../src/core/pipeline/stackProps"
import {
  validateCurves,
  validateSpectra,
} from "../../../src/core/pipeline/tables"
import {
  drawMaterials,
  quantile7,
} from "../../../src/core/pipeline/uncertainty"
import { deriveSeed } from "../../../src/core/rng"
import type { FlaggedDesignRow, ResultRow } from "../../../src/core/schema"
import { loadContext } from "../../../src/node/context"
import { buildCurves, buildSpectra } from "../../../src/node/report/curves"
import { simulateAll } from "../../../src/node/simulate"
import { repoRoot } from "../../helpers"

let ctx: ModelContext
let design: FlaggedDesignRow[]
let results: ResultRow[]
const SEED = 20261121
const SHORT = {
  high_performing: "SP-001",
  balanced: "SP-004",
  low_cost: "SP-007",
}
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
  design = checkConstraints(lhsDesign(10, ctx.ranges, 7), ctx.ranges)
  results = (await simulateAll(design, weatherL9(ctx.weather), ctx, 8, SEED, 1))
    .results
})

test("curvesHaveNominalAndBands", () => {
  const w = weatherL9(ctx.weather)
  const c = buildCurves(results, SHORT, design, w, ctx, 16, SEED)
  expect(validateCurves(JSON.parse(safeJson(c)))).toBeTruthy() // t_lo <= t <= t_hi at every point
  expect(c.time_s.length).toBe(144)
  expect(c.time_s[1]).toBe(600)
  expect(c.n_mc).toBe(16)
  const cand = c.series.filter((s) => s.kind === "candidate")
  expect(cand.length).toBe(3 * 9)
  expect(cand.every((s) => !s.nominal_only && s.t_lo_c && s.t_hi_c)).toBe(true)
  // at least one point has a real (non-zero-width) band
  expect(
    cand.some((s) =>
      (s.t_hi_c as number[]).some(
        (h, i) => h > ((s.t_lo_c as number[])[i] as number),
      ),
    ),
  ).toBe(true)
  const ctl = c.series.filter((s) => s.kind === "control")
  expect(
    ctl.every(
      (s) => s.nominal_only && s.t_lo_c === undefined && s.t_hi_c === undefined,
    ),
  ).toBe(true)
  const ids = (id: string) => ctl.filter((s) => s.id === id).length
  expect([ids("C0"), ids("C1"), ids("C2:SP-004"), ids("C3:SP-004")]).toEqual([
    9, 9, 9, 9,
  ])
  expect(c.series.length).toBe(27 + 18 + 54)
  // nominal series peak = nominal t_max_pred of results.csv (the 600 s grid is a subset of the 60 s step nodes)
  for (const s of cand) {
    const row = results.find(
      (r) => r.candidate_id === s.id && r.scenario_id === s.scenario_id,
    ) as ResultRow
    const peak = Math.max(...s.t_c)
    expect(peak).toBeLessThanOrEqual(row.t_max_pred + 1e-9)
    expect(peak).toBeGreaterThan(row.t_max_pred - 0.5)
  }
})

test("bandsComeFromTheSimulateDrawStream", () => {
  const w = weatherL9(ctx.weather)
  const nMc = 12
  const c = buildCurves(results, SHORT, design, w, ctx, nMc, SEED)
  // independent recomputation for one candidate/scenario/time index
  const cand = design.find(
    (r) => r.candidate_id === "SP-004",
  ) as FlaggedDesignRow
  const sc = w[4] as (typeof w)[number]
  const mats = drawMaterials(ctx.mat, nMc, deriveSeed(SEED, 100))
  const k = 70
  const outs = mats.map((m) => {
    // series via the public thermal path
    return ((evaluateSeries(cand, sc, m) as Float64Array)[k] as number) - 273.15
  })
  const sorted = Float64Array.from(outs).sort()
  const s = c.series.find(
    (x) =>
      x.id === "SP-004" &&
      x.scenario_id === sc.scenario_id &&
      x.kind === "candidate",
  )
  if (!s) throw new Error("series missing")
  const nom = s.t_c[k] as number
  expect(s?.t_hi_c?.[k]).toBeCloseTo(Math.max(nom, quantile7(sorted, 0.95)), 9)
  expect(s?.t_lo_c?.[k]).toBeCloseTo(Math.min(nom, quantile7(sorted, 0.05)), 9)
  // same seed, same bytes
  expect(safeJson(buildCurves(results, SHORT, design, w, ctx, nMc, SEED))).toBe(
    safeJson(c),
  )
})

function evaluateSeries(
  c: FlaggedDesignRow,
  s: ReturnType<typeof scenarioFrom>,
  mat: ModelContext["mat"],
) {
  return thermalOutcomes(
    [{ sp: stackProps(c, CONTROL_LAYERS.C4, ctx, mat), s }],
    ctx,
    { series: true },
  )[0]?.t_surface_k
}

test("curvesJsonHasNoNaN", () => {
  const w = weatherL9(ctx.weather)
  const c = buildCurves(results, SHORT, design, w, ctx, 4, SEED)
  const sp = buildSpectra(SHORT, design, ctx, 4, SEED)
  expect(() => safeJson(c)).not.toThrow()
  expect(() => safeJson(sp)).not.toThrow()
  expect(JSON.stringify(c)).not.toMatch(/null/)
})

test("spectraNominalBandsAndControls", () => {
  const sp = buildSpectra(SHORT, design, ctx, 16, SEED)
  expect(validateSpectra(JSON.parse(safeJson(sp)))).toBeTruthy()
  expect(sp.wl_um.length).toBe(221)
  expect(sp.wl_um[0]).toBe(0.3)
  expect(sp.wl_um[220]).toBe(2.5)
  expect(
    sp.series
      .filter((s) => s.kind === "candidate")
      .every((s) => !s.nominal_only && s.r_lo && s.r_hi),
  ).toBe(true)
  expect(
    sp.series
      .filter((s) => s.kind === "control")
      .every((s) => s.nominal_only && s.r_lo === undefined),
  ).toBe(true)
  const ids = sp.series.map((s) => s.id)
  expect(ids).toContain("C0")
  expect(ids).not.toContain("C1") // datasheet only: no spectrum
  expect(ids).toContain("C2:SP-001")
  expect(ids).toContain("C3:SP-007")
  const c0 = sp.series.find((s) => s.id === "C0")
  expect(new Set(c0?.r)).toEqual(new Set([ctx.mat.substrate.r_solar.value]))
  const cand = sp.series.find((s) => s.id === "SP-001")
  expect(
    cand?.r_hi?.some((h, i) => h > ((cand.r_lo as number[])[i] as number)),
  ).toBe(true)
})

test("shortlistMustBeInDesignAndResults", () => {
  const w = weatherL9(ctx.weather)
  expect(() =>
    buildCurves(
      results,
      { ...SHORT, balanced: "SP-099" },
      design,
      w,
      ctx,
      4,
      SEED,
    ),
  ).toThrow()
  expect(() => buildCurves(results, SHORT, design, w, ctx, 0, SEED)).toThrow()
  expect(() =>
    buildSpectra({ ...SHORT, balanced: "SP-099" }, design, ctx, 4, SEED),
  ).toThrow()
})

test("reportCurvesUnder5s", () => {
  const w = weatherL9(ctx.weather)
  const t0 = performance.now()
  const c = buildCurves(results, SHORT, design, w, ctx, 256, SEED)
  const ms = performance.now() - t0
  const s0 = performance.now()
  buildSpectra(SHORT, design, ctx, 256, SEED)
  const sMs = performance.now() - s0
  console.log(
    `buildCurves ${Math.round(ms)} ms, buildSpectra ${Math.round(sMs)} ms`,
  )
  expect(c.series.length).toBe(99)
  expect(ms).toBeLessThan(5000)
}, 30000)
