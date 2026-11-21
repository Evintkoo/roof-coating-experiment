import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { RESULT_COLUMNS } from "../../../src/core/columns"
import { lhsDesign, scenarioFrom } from "../../../src/core/design"
import {
  applyTopcoat,
  midcoatSpectrum,
  rSolarStack,
} from "../../../src/core/models/optics"
import { simulateDay } from "../../../src/core/models/thermal"
import type { ModelContext } from "../../../src/core/pipeline/context"
import {
  CONTROL_LAYERS,
  evaluate,
  evaluateC1,
  type Layers,
  type Outcome,
  stackProps,
  thermalOutcomes,
  unmodelledColumns,
} from "../../../src/core/pipeline/stackProps"
import type { DesignRow } from "../../../src/core/schema"
import { loadContext } from "../../../src/node/context"
import { repoRoot } from "../../helpers"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

const scen = (g = 800, t = 32, w = 3) => scenarioFrom(g, t, w, ctx.weather)
const cand = (i = 0) => {
  const { candidate_id: _id, ...c } = lhsDesign(10, ctx.ranges, 7)[
    i
  ] as DesignRow
  return c
}
const FULL: Layers = CONTROL_LAYERS.C4
const code = (f: () => unknown): number => {
  try {
    f()
  } catch (e) {
    return (e as { code: number }).code
  }
  return 0
}

/** Outcome field -> RESULT_COLUMNS name (plan 03 D10), nominal columns only. */
const COLMAP: Record<string, string> = {
  r_solar: "r_solar_pred",
  t_max_c: "t_max_pred",
  corrosion_risk: "corrosion_proxy",
  wetting_score: "wetting_proxy",
  wetting_theta_deg: "wetting_theta_pred",
  q_in_mean_w_m2: "q_in_mean_w_m2",
  delam_proxy: "delam_proxy",
  cost_proxy: "cost_proxy",
  gel_time_rel: "gel_time_rel",
}
const nanColumns = (o: Outcome): string[] =>
  Object.entries(COLMAP)
    .filter(([k]) => Number.isNaN((o as unknown as Record<string, number>)[k]))
    .map(([, v]) => v)
    .sort()

test("c4EqualsFullCandidate", () => {
  const c = cand(0)
  const s = scen()
  const a = evaluate(c, s, CONTROL_LAYERS.C4, ctx)
  const b = evaluate(c, s, { primer: true, midcoat: true, topcoat: true }, ctx)
  expect(a).toEqual(b)
  // independent composition straight from the models
  const rMid = midcoatSpectrum(
    c.midcoat_pvc,
    c.midcoat_tio2_fraction,
    c.midcoat_dft_um,
    ctx.mat,
    ctx.tio2,
    ctx.baso4,
    ctx.wlUm,
  )
  const r = rSolarStack(
    applyTopcoat(rMid, c.topcoat_dft_um, ctx.mat.topcoat.mu_per_um.value),
    ctx.wlUm,
    ctx.g173,
  )
  expect(a.r_solar).toBe(r)
  const roof = ctx.weather.roof
  const cA =
    roof.c_substrate_j_m2k.value +
    roof.rho_c_coating_j_m3k.value *
      (c.primer_dft_um + c.midcoat_dft_um + c.topcoat_dft_um) *
      1e-6
  const d = simulateDay({
    r_solar: r,
    emissivity: ctx.mat.coating.emissivity.value,
    g_peak_w_m2: s.irradiance_w_m2,
    t_air_k: s.t_air_c + 273.15,
    t_sky_k: s.t_sky_k,
    h_conv_w_m2k: s.h_conv_w_m2k,
    t_inside_k: roof.t_inside_c.value + 273.15,
    r_total_m2k_w: roof.r_total_m2k_w.value,
    c_a_j_m2k: cA,
  })
  expect(a.t_max_c).toBe(d.t_max_c)
  expect(a.q_in_mean_w_m2).toBe(d.q_in_mean_w_m2)
})

test("ablationPropertiesTenCandidates", () => {
  const s = scen()
  for (let i = 0; i < 10; i++) {
    const c = cand(i)
    const c4 = evaluate(c, s, CONTROL_LAYERS.C4, ctx)
    const c2 = evaluate(c, s, CONTROL_LAYERS.C2, ctx)
    const c3 = evaluate(c, s, CONTROL_LAYERS.C3, ctx)
    // topcoat only absorbs: removing it cannot lower reflectance
    expect(ctx.mat.topcoat.mu_per_um.value).toBeGreaterThan(0)
    expect(c2.r_solar).toBeGreaterThan(c4.r_solar)
    // primer does not touch optics
    expect(c3.r_solar).toBe(c4.r_solar)
    // C2: same barrier, no delamination index, binder wetting, cheaper than none
    expect(c2.corrosion_risk).toBe(c4.corrosion_risk)
    expect(c2.delam_proxy).toBeNaN()
    expect(c2.wetting_theta_deg).toBe(ctx.mat.wetting.theta_binder_deg.value)
    expect(c2.gel_time_rel).toBe(c4.gel_time_rel)
    // C3: baseline corrosion, no gel time, same topcoat indices
    expect(c3.corrosion_risk).toBe(ctx.mat.baseline_corrosion_risk.value)
    expect(c3.gel_time_rel).toBeNaN()
    expect(c3.delam_proxy).toBe(c4.delam_proxy)
    expect(c3.wetting_score).toBe(c4.wetting_score)
    expect(c4.corrosion_risk).toBeLessThan(c3.corrosion_risk)
    // coated roof is cooler than the topcoat-free one only through R: sanity of ordering
    expect(c4.t_max_c).toBeGreaterThan(0)
    expect(c4.cost_proxy).toBeGreaterThan(0)
    expect(c4.cost_proxy).toBeLessThanOrEqual(1)
  }
})

test("c0UsesSubstrateConstants", () => {
  const c = cand(0)
  const s = scen()
  const o = evaluate(c, s, CONTROL_LAYERS.C0, ctx)
  const sp = stackProps(c, CONTROL_LAYERS.C0, ctx)
  expect(sp.r_solar).toBe(ctx.mat.substrate.r_solar.value)
  expect(sp.emissivity).toBe(ctx.mat.substrate.emissivity.value)
  expect(sp.c_a_j_m2k).toBe(ctx.weather.roof.c_substrate_j_m2k.value)
  expect(sp.c_a_j_m2k).toBe(1218.9)
  expect(sp.spectrum).toBeNull()
  expect(o.corrosion_risk).toBe(1)
  expect(o.cost_proxy).toBe(0)
  const d = simulateDay({
    r_solar: sp.r_solar,
    emissivity: sp.emissivity,
    g_peak_w_m2: s.irradiance_w_m2,
    t_air_k: s.t_air_c + 273.15,
    t_sky_k: s.t_sky_k,
    h_conv_w_m2k: s.h_conv_w_m2k,
    t_inside_k: ctx.weather.roof.t_inside_c.value + 273.15,
    r_total_m2k_w: ctx.weather.roof.r_total_m2k_w.value,
    c_a_j_m2k: 1218.9,
  })
  expect(o.t_max_c).toBe(d.t_max_c)
})

test("c1UnmodelledListMatchesNaNColumns", () => {
  const o = evaluateC1(scen(), ctx)
  expect(o.r_solar).toBe(ctx.controls.c1_r_solar.value)
  expect(Number.isFinite(o.t_max_c)).toBe(true)
  expect(Number.isFinite(o.q_in_mean_w_m2)).toBe(true)
  const list = unmodelledColumns(CONTROL_LAYERS.C4, true)
  expect([...list].sort()).toEqual(nanColumns(o))
  for (const col of list) expect(RESULT_COLUMNS).toContain(col as never)
  // layered controls: list equals the NaN columns of the real outcome
  for (const [name, layers] of Object.entries(CONTROL_LAYERS)) {
    const out = evaluate(cand(1), scen(), layers, ctx)
    expect([...unmodelledColumns(layers)].sort()).toEqual(nanColumns(out))
    expect(name.length).toBe(2)
  }
  expect(unmodelledColumns(CONTROL_LAYERS.C4)).toEqual([])
})

test("costProxyInUnitIntervalAndMonotoneInDft", () => {
  const base = cand(2)
  const cost = (o: Partial<typeof base>) =>
    stackProps({ ...base, ...o }, FULL, ctx).cost_proxy
  const r = ctx.ranges
  for (const [key, rg] of [
    ["primer_dft_um", r.primer_dft_um],
    ["midcoat_dft_um", r.midcoat_dft_um],
    ["topcoat_dft_um", r.topcoat_dft_um],
  ] as const) {
    let prev = -1
    for (let i = 0; i <= 4; i++) {
      const v = cost({ [key]: rg.min + ((rg.max - rg.min) * i) / 4 })
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  }
  const max = cost({
    primer_dft_um: r.primer_dft_um.max,
    midcoat_dft_um: r.midcoat_dft_um.max,
    topcoat_dft_um: r.topcoat_dft_um.max,
  })
  expect(max).toBeCloseTo(1, 12)
})

test("missingPrimerGivesBaselineCorrosionRisk", () => {
  const sp = stackProps(cand(0), CONTROL_LAYERS.C3, ctx)
  expect(sp.corrosion_risk).toBe(ctx.mat.baseline_corrosion_risk.value)
  expect(sp.gel_time_rel).toBeNaN()
})

test("pvcOutOfDomainCode4", () => {
  expect(
    code(() => stackProps({ ...cand(0), midcoat_pvc: 0.9 }, FULL, ctx)),
  ).toBe(4)
  expect(
    code(() => stackProps({ ...cand(0), topcoat_dft_um: 2 }, FULL, ctx)),
  ).toBe(4)
  expect(
    code(() => stackProps({ ...cand(0), primer_dft_um: 13 }, FULL, ctx)),
  ).toBe(4)
  expect(
    code(() => stackProps({ ...cand(0), midcoat_dft_um: 50 }, FULL, ctx)),
  ).toBe(4)
  // absent layers ignore their DFT
  expect(
    code(() =>
      stackProps({ ...cand(0), topcoat_dft_um: 999 }, CONTROL_LAYERS.C2, ctx),
    ),
  ).toBe(0)
})

test("pureFunctionSameInputSameOutput", () => {
  const c = cand(3)
  const s = scen()
  expect(evaluate(c, s, FULL, ctx)).toEqual(evaluate(c, s, FULL, ctx))
  expect(stackProps(c, FULL, ctx)).toEqual(stackProps(c, FULL, ctx))
})

test("optionalPhOverrideChangesGelTimeOnly", () => {
  const c = cand(4)
  const a = stackProps(c, FULL, ctx)
  const b = stackProps({ ...c, ph: ctx.ranges.sol_gel_ph.min }, FULL, ctx)
  expect(b.gel_time_rel).not.toBe(a.gel_time_rel)
  expect({ ...b, gel_time_rel: 0 }).toEqual({ ...a, gel_time_rel: 0 })
})

test("noTopcoatUsesBinderAngle", () => {
  const sp = stackProps(cand(0), CONTROL_LAYERS.C2, ctx)
  expect(sp.wetting_theta_deg).toBe(ctx.mat.wetting.theta_binder_deg.value)
  expect(sp.wetting_theta_corners.lo).toBeLessThanOrEqual(sp.wetting_theta_deg)
  expect(sp.wetting_theta_corners.hi).toBeGreaterThanOrEqual(
    sp.wetting_theta_deg,
  )
  expect(sp.delam_proxy).toBeNaN()
})

test("bareStackHasNaNWettingAndListsItAsUnmodelled", () => {
  const sp = stackProps(cand(0), CONTROL_LAYERS.C0, ctx)
  expect(sp.wetting_score).toBeNaN()
  expect(sp.wetting_theta_deg).toBeNaN()
  expect(sp.wetting_score_corners.lo).toBeNaN()
  expect(sp.wetting_theta_corners.hi).toBeNaN()
  const u = unmodelledColumns(CONTROL_LAYERS.C0)
  expect(u).toContain("wetting_proxy")
  expect(u).toContain("wetting_theta_pred")
  expect(u).toContain("delam_proxy")
  expect(u).toContain("gel_time_rel")
  expect(u).not.toContain("corrosion_proxy")
})

test("stackPropsDoesNotDependOnScenario", () => {
  const c = cand(5)
  const a = evaluate(c, scen(600, 28, 1), FULL, ctx)
  const b = evaluate(c, scen(1000, 36, 6), FULL, ctx)
  expect(a.r_solar).toBe(b.r_solar)
  expect(a.corrosion_risk).toBe(b.corrosion_risk)
  expect(a.t_max_c).not.toBe(b.t_max_c)
})

test("thermalOutcomesBatchAndSeries", () => {
  const sp = stackProps(cand(0), FULL, ctx)
  const out = thermalOutcomes(
    [
      { sp, s: scen() },
      { sp, s: scen(1000, 36, 1) },
    ],
    ctx,
    { series: true },
  )
  expect(out.length).toBe(2)
  expect(out[0]?.t_surface_k?.length).toBe(144)
  expect(
    thermalOutcomes([{ sp, s: scen() }], ctx)[0]?.t_surface_k,
  ).toBeUndefined()
})
