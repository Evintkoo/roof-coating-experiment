import { type Scenario, scenarioFrom } from "../design"
import { deriveSeed } from "../rng"
import type { DesignRow } from "../schema"
import type { ModelContext } from "./context"
import {
  CONTROL_LAYERS,
  evaluateC1,
  type Layers,
  type Outcome,
  type StackProps,
  stackProps,
  thermalOutcomes,
} from "./stackProps"
import { drawMaterials, widenInterval } from "./uncertainty"

export type LiveInputs = {
  design: Omit<DesignRow, "candidate_id">
  ph: number
  layers: Layers
  scenario: { irradiance_w_m2: number; t_air_c: number; wind_m_s: number }
}
export type Band = { lo: number; hi: number }
export type LiveResult = {
  nThermalCases: number
  nominal: Outcome
  bands: {
    r_solar: Band
    t_max_c: Band
    corrosion_risk: Band
    wetting_score: Band
    delam_proxy: Band
  }
  series: {
    t_k: Float64Array
    lo: Float64Array
    hi: Float64Array
    /** The nDraws solved surface-temperature series the band is the p5 to p95 of (plan 07 H11); additive, no other number changes. */
    draws: Float64Array[]
  }
  spectrum: { nominal: Float64Array; lo: Float64Array; hi: Float64Array }
  controls: { C0: Outcome; C1: Outcome }
  nDraws: number
}

const NAN_BAND: Band = { lo: Number.NaN, hi: Number.NaN }

/** p5-p95 over the draws widened to the nominal (D4/D5), or a NaN band when the quantity is not modelled (layer off). */
function band(
  nominal: number,
  draws: Float64Array,
  extra?: readonly [number, number],
): Band {
  if (Number.isNaN(nominal)) return NAN_BAND
  const w = widenInterval(nominal, draws)
  return extra
    ? { lo: Math.min(w.lo, extra[0]), hi: Math.max(w.hi, extra[1]) }
    : w
}

function pointwise(nominal: Float64Array, draws: Float64Array[]) {
  const n = nominal.length
  const lo = new Float64Array(n)
  const hi = new Float64Array(n)
  const col = new Float64Array(draws.length)
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < draws.length; d++)
      col[d] = (draws[d] as Float64Array)[i] as number
    const w = widenInterval(nominal[i] as number, col)
    lo[i] = w.lo
    hi[i] = w.hi
  }
  return { lo, hi }
}

/**
 * Live evaluation (plan 00 D2): stackProps for the nominal plus nDraws Latin-hypercube material draws from the same
 * stream as the batch (deriveSeed(seed, 100)), one thermal case each for the chosen scenario (nDraws + 1 in all), and
 * the controls C0 and C1 as reference lines. Pure: no I/O, no clock. Out-of-domain inputs throw PhysicsRangeError (code 4).
 */
export function liveSimulate(
  inp: LiveInputs,
  ctx: ModelContext,
  nDraws: number,
  seed: number,
): LiveResult {
  const s: Omit<Scenario, "scenario_id"> = scenarioFrom(
    inp.scenario.irradiance_w_m2,
    inp.scenario.t_air_c,
    inp.scenario.wind_m_s,
    ctx.weather,
  )
  const cand = { ...inp.design, ph: inp.ph }
  const mats = drawMaterials(ctx.mat, nDraws, deriveSeed(seed, 100))
  const props: StackProps[] = [
    stackProps(cand, inp.layers, ctx),
    ...mats.map((m) => stackProps(cand, inp.layers, ctx, m)),
  ]
  const outs = thermalOutcomes(
    props.map((sp) => ({ sp, s })),
    ctx,
    { series: true },
  )
  const nominal = outs[0] as Outcome
  const nomProps = props[0] as StackProps
  const drawOuts = outs.slice(1)
  const col = (f: (o: Outcome) => number): Float64Array =>
    Float64Array.from(drawOuts, f)
  const spec = (sp: StackProps, o: Outcome): Float64Array =>
    sp.spectrum ?? new Float64Array(ctx.wlUm.length).fill(o.r_solar)
  const nomSpec = spec(nomProps, nominal)
  const sb = pointwise(
    nominal.t_surface_k as Float64Array,
    drawOuts.map((o) => o.t_surface_k as Float64Array),
  )
  const rb = pointwise(
    nomSpec,
    drawOuts.map((o, i) => spec(props[i + 1] as StackProps, o)),
  )
  const c = nomProps.wetting_score_corners
  return {
    nThermalCases: outs.length,
    nominal,
    bands: {
      r_solar: band(
        nominal.r_solar,
        col((o) => o.r_solar),
      ),
      t_max_c: band(
        nominal.t_max_c,
        col((o) => o.t_max_c),
      ),
      corrosion_risk: band(
        nominal.corrosion_risk,
        col((o) => o.corrosion_risk),
      ),
      wetting_score: band(
        nominal.wetting_score,
        col((o) => o.wetting_score),
        [c.lo, c.hi],
      ),
      delam_proxy: band(
        nominal.delam_proxy,
        col((o) => o.delam_proxy),
      ),
    },
    series: {
      t_k: nominal.t_surface_k as Float64Array,
      lo: sb.lo,
      hi: sb.hi,
      draws: drawOuts.map((o) => o.t_surface_k as Float64Array),
    },
    spectrum: { nominal: nomSpec, lo: rb.lo, hi: rb.hi },
    controls: {
      C0: thermalOutcomes(
        [{ sp: stackProps(cand, CONTROL_LAYERS.C0, ctx), s }],
        ctx,
        { series: true },
      )[0] as Outcome,
      C1: evaluateC1(s, ctx, { series: true }),
    },
    nDraws,
  }
}
