import { RESULT_COLUMNS } from "../columns"
import type { Materials } from "../config"
import type { Scenario } from "../design"
import { barrier } from "../models/barrier"
import { delaminationProxy } from "../models/delamination"
import { applyTopcoat, midcoatSpectrum, rSolarStack } from "../models/optics"
import { requireIn } from "../models/ranges"
import { gelTimeRel } from "../models/solGel"
import { simulateDay } from "../models/thermal"
import { wetting, wettingBinder } from "../models/wetting"
import type { DesignRow } from "../schema"
import type { ModelContext } from "./context"

export type Layers = { primer: boolean; midcoat: boolean; topcoat: boolean }

/** D2 layer sets of the model-run controls; C1 is datasheet-only (evaluateC1). */
export const CONTROL_LAYERS = {
  C0: { primer: false, midcoat: false, topcoat: false },
  C2: { primer: true, midcoat: true, topcoat: false },
  C3: { primer: false, midcoat: true, topcoat: true },
  C4: { primer: true, midcoat: true, topcoat: true },
} as const satisfies Record<string, Layers>

export type StackProps = {
  r_solar: number
  emissivity: number
  c_a_j_m2k: number
  corrosion_risk: number
  wetting_score: number
  wetting_theta_deg: number
  wetting_score_corners: { lo: number; hi: number }
  wetting_theta_corners: { lo: number; hi: number }
  delam_proxy: number
  cost_proxy: number
  gel_time_rel: number
  spectrum: Float64Array | null
}

export type Outcome = {
  r_solar: number
  t_max_c: number
  q_in_mean_w_m2: number
  corrosion_risk: number
  wetting_score: number
  wetting_theta_deg: number
  delam_proxy: number
  cost_proxy: number
  gel_time_rel: number
  t_surface_k?: Float64Array
}

type CandidateInput = Omit<DesignRow, "candidate_id"> & Partial<{ ph: number }>
type Weather = Omit<Scenario, "scenario_id">

const M = "stackProps"
const NAN_PAIR = { lo: Number.NaN, hi: Number.NaN }
const mid = (r: { min: number; max: number }): number => 0.5 * (r.min + r.max)

/**
 * Everything about a candidate that does not depend on the weather scenario: optics, C_A, indices, cost.
 * Layer DFT domains are enforced here for present layers only (primer 2-12, midcoat 100-300, topcoat 3-20 um);
 * an absent layer's DFT is ignored. cost_proxy (D3) = sum rc_i DFT_i over the PRESENT layers / sum rc_i DFT_i,max over ALL three layers (fixed
 * denominator, so layer sets are comparable: C0 = 0, C2 and C3 < C4; full candidates reach at most 1).
 */
export function stackProps(
  c: CandidateInput,
  layers: Layers,
  ctx: ModelContext,
  mat: Materials = ctx.mat,
): StackProps {
  const { primer, midcoat, topcoat } = layers
  const rg = ctx.ranges
  if (primer) requireIn(M, "primer_dft_um", c.primer_dft_um, 2, 12)
  if (midcoat) requireIn(M, "midcoat_dft_um", c.midcoat_dft_um, 100, 300)
  if (topcoat) requireIn(M, "topcoat_dft_um", c.topcoat_dft_um, 3, 20)

  // optics (once per candidate)
  let spectrum: Float64Array | null = null
  if (midcoat)
    spectrum = midcoatSpectrum(
      c.midcoat_pvc,
      c.midcoat_tio2_fraction,
      c.midcoat_dft_um,
      mat,
      ctx.tio2,
      ctx.baso4,
      ctx.wlUm,
    )
  if (topcoat) {
    const base =
      spectrum ??
      new Float64Array(ctx.wlUm.length).fill(mat.substrate.r_solar.value)
    spectrum = applyTopcoat(base, c.topcoat_dft_um, mat.topcoat.mu_per_um.value)
  }
  const rSolar = spectrum
    ? rSolarStack(spectrum, ctx.wlUm, ctx.g173)
    : mat.substrate.r_solar.value

  // thermal capacity
  const roof = ctx.weather.roof
  const dftM =
    ((primer ? c.primer_dft_um : 0) +
      (midcoat ? c.midcoat_dft_um : 0) +
      (topcoat ? c.topcoat_dft_um : 0)) *
    1e-6
  const cA =
    roof.c_substrate_j_m2k.value + roof.rho_c_coating_j_m3k.value * dftM

  // indices
  const ph = c.ph ?? mid(rg.sol_gel_ph)
  const water = mid(rg.sol_gel_water_ratio)
  const ref = [mid(rg.sol_gel_ph), water, mid(rg.primer_gptes_molfrac)] as const
  const corrosion = primer
    ? barrier(c.primer_gptes_molfrac, c.primer_dft_um, mat).corrosion_risk
    : mat.baseline_corrosion_risk.value
  const gel = primer
    ? gelTimeRel(ph, water, c.primer_gptes_molfrac, mat, ref)
    : Number.NaN
  const delam = topcoat
    ? delaminationProxy(c.topcoat_mtes_molfrac, c.topcoat_dft_um, mat)
    : Number.NaN
  const w = topcoat
    ? wetting(c.topcoat_mtes_molfrac, mat)
    : midcoat
      ? wettingBinder(mat)
      : null

  // cost
  const cost = mat.cost
  const terms: [boolean, number, number, number][] = [
    [primer, cost.rc_primer.value, c.primer_dft_um, rg.primer_dft_um.max],
    [midcoat, cost.rc_mid.value, c.midcoat_dft_um, rg.midcoat_dft_um.max],
    [topcoat, cost.rc_top.value, c.topcoat_dft_um, rg.topcoat_dft_um.max],
  ]
  let num = 0
  let den = 0
  for (const [on, rc, d, dMax] of terms) {
    if (on) num += rc * d
    den += rc * dMax
  }

  return {
    r_solar: rSolar,
    emissivity:
      primer || midcoat || topcoat
        ? mat.coating.emissivity.value
        : mat.substrate.emissivity.value,
    c_a_j_m2k: cA,
    corrosion_risk: corrosion,
    wetting_score: w ? w.score : Number.NaN,
    wetting_theta_deg: w ? w.theta_pred : Number.NaN,
    wetting_score_corners: w ? { lo: w.score_lo, hi: w.score_hi } : NAN_PAIR,
    wetting_theta_corners: w ? { lo: w.theta_lo, hi: w.theta_hi } : NAN_PAIR,
    delam_proxy: delam,
    cost_proxy: num / den,
    gel_time_rel: gel,
    spectrum,
  }
}

/** Batch of day simulations; the roof constants come from ctx.weather.roof, the weather from each case. */
export function thermalOutcomes(
  cases: readonly { sp: StackProps; s: Weather }[],
  ctx: ModelContext,
  opts: { series?: boolean } = {},
): Outcome[] {
  const roof = ctx.weather.roof
  const tIn = roof.t_inside_c.value + 273.15
  const rTot = roof.r_total_m2k_w.value
  return cases.map(({ sp, s }) => {
    const d = simulateDay({
      r_solar: sp.r_solar,
      emissivity: sp.emissivity,
      g_peak_w_m2: s.irradiance_w_m2,
      t_air_k: s.t_air_c + 273.15,
      t_sky_k: s.t_sky_k,
      h_conv_w_m2k: s.h_conv_w_m2k,
      t_inside_k: tIn,
      r_total_m2k_w: rTot,
      c_a_j_m2k: sp.c_a_j_m2k,
    })
    const o: Outcome = {
      r_solar: sp.r_solar,
      t_max_c: d.t_max_c,
      q_in_mean_w_m2: d.q_in_mean_w_m2,
      corrosion_risk: sp.corrosion_risk,
      wetting_score: sp.wetting_score,
      wetting_theta_deg: sp.wetting_theta_deg,
      delam_proxy: sp.delam_proxy,
      cost_proxy: sp.cost_proxy,
      gel_time_rel: sp.gel_time_rel,
    }
    if (opts.series) o.t_surface_k = d.t_surface_k
    return o
  })
}

export function evaluate(
  c: CandidateInput,
  s: Weather,
  layers: Layers,
  ctx: ModelContext,
  mat?: Materials,
): Outcome {
  return thermalOutcomes(
    [{ sp: stackProps(c, layers, ctx, mat), s }],
    ctx,
  )[0] as Outcome
}

/**
 * C1 (D2): thermal from the datasheet reflectance and emissivity; every other field NaN
 * (see unmodelledColumns(_, true)). C_A is the bare substrate value: the datasheet gives no DFT.
 * Immaterial: the substrate-only C_A changes day-2 T_max by about 7e-7 K at a 300 um coating.
 */
export function evaluateC1(s: Weather, ctx: ModelContext): Outcome {
  const nan = Number.NaN
  const sp: StackProps = {
    r_solar: ctx.controls.c1_r_solar.value,
    emissivity: ctx.controls.c1_emissivity.value,
    c_a_j_m2k: ctx.weather.roof.c_substrate_j_m2k.value,
    corrosion_risk: nan,
    wetting_score: nan,
    wetting_theta_deg: nan,
    wetting_score_corners: NAN_PAIR,
    wetting_theta_corners: NAN_PAIR,
    delam_proxy: nan,
    cost_proxy: nan,
    gel_time_rel: nan,
    spectrum: null,
  }
  return thermalOutcomes([{ sp, s }], ctx)[0] as Outcome
}

/**
 * Intentionally-NaN output columns (RESULT_COLUMNS names, nominal columns only; controls carry no intervals)
 * for a control row, in RESULT_COLUMNS order. C1 (datasheet): everything except the thermal columns.
 */
export function unmodelledColumns(layers: Layers, isC1 = false): string[] {
  const nan = new Set<string>()
  if (isC1) {
    for (const c of [
      "corrosion_proxy",
      "wetting_proxy",
      "wetting_theta_pred",
      "delam_proxy",
      "cost_proxy",
      "gel_time_rel",
    ])
      nan.add(c)
  } else {
    if (!layers.primer) nan.add("gel_time_rel")
    if (!layers.topcoat) nan.add("delam_proxy")
    if (!layers.topcoat && !layers.midcoat) {
      nan.add("wetting_proxy")
      nan.add("wetting_theta_pred")
    }
  }
  return RESULT_COLUMNS.filter((c) => nan.has(c))
}
