import type { Scenario } from "../../core/design"
import { ConfigError, DataError } from "../../core/errors"
import type { ModelContext } from "../../core/pipeline/context"
import {
  CONTROL_LAYERS,
  evaluateC1,
  type Layers,
  stackProps,
  thermalOutcomes,
} from "../../core/pipeline/stackProps"
import type {
  CurveSeries,
  CurvesJson,
  SpectraJson,
  SpectraSeries,
} from "../../core/pipeline/tables"
import { drawMaterials, widenInterval } from "../../core/pipeline/uncertainty"
import { deriveSeed } from "../../core/rng"
import type { FlaggedDesignRow, ResultRow } from "../../core/schema"

const KELVIN = 273.15
const OUT_S = 600
const idCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function pick(
  shortlist: Record<string, string>,
  design: readonly FlaggedDesignRow[],
  nMc: number,
): FlaggedDesignRow[] {
  if (!Number.isInteger(nMc) || nMc < 1)
    throw new ConfigError("n_mc", "must be an integer >= 1")
  const byId = new Map(design.map((r) => [r.candidate_id, r]))
  return [...new Set(Object.values(shortlist))].sort(idCmp).map((id) => {
    const c = byId.get(id)
    if (c === undefined)
      throw new ConfigError("shortlist", `${id} is not in the design`)
    if (!c.feasible) throw new ConfigError("shortlist", `${id} is infeasible`)
    return c
  })
}

/** p5/p95 over `draws` (one column), widened to include the nominal value. */
function bandOf(
  nominal: ArrayLike<number>,
  draws: readonly ArrayLike<number>[],
): { lo: number[]; hi: number[] } {
  const n = nominal.length
  const lo = new Array<number>(n)
  const hi = new Array<number>(n)
  const col = new Float64Array(draws.length)
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < draws.length; d++)
      col[d] = (draws[d] as ArrayLike<number>)[i] as number
    const w = widenInterval(nominal[i] as number, col)
    lo[i] = w.lo
    hi[i] = w.hi
  }
  return { lo, hi }
}

/**
 * D12 temperature curves: for each shortlisted candidate and all scenarios the day-2 surface temperature every 600 s
 * (degrees C) as nominal plus the p5 and p95 band over the same Latin-hypercube draws as `simulate`
 * (deriveSeed(seed, 100)), so the bands and the results.csv intervals share a source. Controls C0, C1 and, per
 * shortlisted candidate, C2 and C3 are nominal only. `results` is used to check that the shortlist is in this run.
 */
export function buildCurves(
  results: readonly ResultRow[],
  shortlist: Record<string, string>,
  design: readonly FlaggedDesignRow[],
  weather: readonly Scenario[],
  ctx: ModelContext,
  nMc: number,
  seed: number,
): CurvesJson {
  const cands = pick(shortlist, design, nMc)
  const have = new Set(
    results.filter((r) => r.feasible).map((r) => r.candidate_id),
  )
  for (const c of cands)
    if (!have.has(c.candidate_id))
      throw new DataError(
        "results.csv",
        `${c.candidate_id} has no feasible rows in results.csv`,
      )
  const scens = [...weather].sort((a, b) => idCmp(a.scenario_id, b.scenario_id))
  const mats = drawMaterials(ctx.mat, nMc, deriveSeed(seed, 100))
  const series: CurveSeries[] = []
  const celsius = (k: ArrayLike<number>): number[] =>
    Array.from(k, (v) => v - KELVIN)
  const cases = (sp: ReturnType<typeof stackProps>) =>
    scens.map((s) => ({ sp, s }))

  for (const c of cands) {
    const nom = thermalOutcomes(
      cases(stackProps(c, CONTROL_LAYERS.C4, ctx)),
      ctx,
      { series: true },
    )
    // draws[s][d] = series of draw d in scenario s
    const draws: Float64Array[][] = scens.map(() => [])
    for (const mat of mats) {
      const outs = thermalOutcomes(
        cases(stackProps(c, CONTROL_LAYERS.C4, ctx, mat)),
        ctx,
        { series: true },
      )
      outs.forEach((o, s) => {
        ;(draws[s] as Float64Array[]).push(o.t_surface_k as Float64Array)
      })
    }
    scens.forEach((s, i) => {
      const t = nom[i]?.t_surface_k as Float64Array
      const b = bandOf(t, draws[i] as Float64Array[])
      series.push({
        id: c.candidate_id,
        kind: "candidate",
        scenario_id: s.scenario_id,
        nominal_only: false,
        t_c: celsius(t),
        t_lo_c: b.lo.map((v) => v - KELVIN),
        t_hi_c: b.hi.map((v) => v - KELVIN),
      })
    })
  }

  const control = (id: string, scenario_id: string, k: Float64Array) =>
    series.push({
      id,
      kind: "control",
      scenario_id,
      nominal_only: true,
      t_c: celsius(k),
    })
  const layerSeries = (id: string, layers: Layers, c: FlaggedDesignRow) => {
    const o = thermalOutcomes(cases(stackProps(c, layers, ctx)), ctx, {
      series: true,
    })
    for (const [i, s] of scens.entries())
      control(id, s.scenario_id, o[i]?.t_surface_k as Float64Array)
  }
  layerSeries("C0", CONTROL_LAYERS.C0, cands[0] as FlaggedDesignRow)
  for (const s of scens)
    control(
      "C1",
      s.scenario_id,
      evaluateC1(s, ctx, { series: true }).t_surface_k as Float64Array,
    )
  for (const c of cands)
    layerSeries(`C2:${c.candidate_id}`, CONTROL_LAYERS.C2, c)
  for (const c of cands)
    layerSeries(`C3:${c.candidate_id}`, CONTROL_LAYERS.C3, c)
  const n = series[0]?.t_c.length ?? 0
  return {
    time_s: Array.from({ length: n }, (_, i) => i * OUT_S),
    n_mc: nMc,
    series,
  }
}

/**
 * D12 reflectance spectra R(lambda) on the 300-2500 nm grid: shortlisted candidates (full stack) as nominal plus
 * p5/p95 over the same draws as simulate; C2 and C3 per shortlisted candidate and C0 (the substrate constant) nominal only.
 * C1 is datasheet-only and has no spectrum.
 */
export function buildSpectra(
  shortlist: Record<string, string>,
  design: readonly FlaggedDesignRow[],
  ctx: ModelContext,
  nMc: number,
  seed: number,
): SpectraJson {
  const cands = pick(shortlist, design, nMc)
  const mats = drawMaterials(ctx.mat, nMc, deriveSeed(seed, 100))
  const spec = (c: FlaggedDesignRow, layers: Layers, mat = ctx.mat) =>
    stackProps(c, layers, ctx, mat).spectrum as Float64Array
  const series: SpectraSeries[] = []
  for (const c of cands) {
    const nom = spec(c, CONTROL_LAYERS.C4)
    const b = bandOf(
      nom,
      mats.map((m) => spec(c, CONTROL_LAYERS.C4, m)),
    )
    series.push({
      id: c.candidate_id,
      kind: "candidate",
      nominal_only: false,
      r: Array.from(nom),
      r_lo: b.lo,
      r_hi: b.hi,
    })
  }
  series.push({
    id: "C0",
    kind: "control",
    nominal_only: true,
    r: Array.from(ctx.wlUm, () => ctx.mat.substrate.r_solar.value),
  })
  for (const id of ["C2", "C3"] as const)
    for (const c of cands)
      series.push({
        id: `${id}:${c.candidate_id}`,
        kind: "control",
        nominal_only: true,
        r: Array.from(spec(c, CONTROL_LAYERS[id])),
      })
  return { wl_um: Array.from(ctx.wlUm), n_mc: nMc, series }
}
