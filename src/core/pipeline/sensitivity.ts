import { scenarioFrom } from "../design"
import { InfeasibleError } from "../errors"
import { emitEvent } from "../events"
import { deriveSeed, shuffleInPlace, Xoshiro128 } from "../rng"
import type { ModelContext } from "./context"
import { CONTROL_LAYERS, evaluate } from "./stackProps"
import type { SensRow } from "./tables"

/** Plan 01 D13 stream roles: Saltelli A / B, Morris, bootstrap. */
const STREAM_A = 200
const STREAM_B = 201
const STREAM_MORRIS = 202
const STREAM_BOOT = 203

export const N_MORRIS = 20
export const N_BOOTSTRAP = 100
/** 95 % normal half-width multiplier for the bootstrap and Morris confidence columns. */
const Z95 = 1.959964

export type Bounds = readonly (readonly [number, number])[]
type Vec = ArrayLike<number>

export type SobolResult = {
  variable: string
  S1: number
  S1_conf: number
  ST: number
  ST_conf: number
}
export type MorrisResult = {
  variable: string
  mu_star: number
  sigma: number
  /** 95 % half-width of mu_star (1.96 x standard error of |EE|); an addition to the plan interface. */
  mu_star_conf: number
}

function checkArgs(names: readonly string[], bounds: Bounds): void {
  if (names.length < 1 || names.length !== bounds.length)
    throw new RangeError("names and bounds must have the same length >= 1")
  for (const [lo, hi] of bounds)
    if (!(Number.isFinite(lo) && Number.isFinite(hi) && lo < hi))
      throw new RangeError("every bound needs finite lo < hi")
}

const scale = (
  u: Float64Array,
  bounds: Bounds,
  off: number,
  x: Float64Array,
) => {
  for (let j = 0; j < bounds.length; j++) {
    const [lo, hi] = bounds[j] as readonly [number, number]
    x[j] = lo + (u[off + j] as number) * (hi - lo)
  }
}

/**
 * Saltelli matrices A and B (n x d, row-major, uniform [0, 1)): two SEPARATE xoshiro streams
 * (deriveSeed(seed, 200) and 201), not shifted copies of one stream.
 */
export function sobolMatrices(
  d: number,
  n: number,
  seed: number,
): { A: Float64Array; B: Float64Array } {
  const fill = (stream: number) => {
    const rng = new Xoshiro128(deriveSeed(seed, stream))
    const m = new Float64Array(n * d)
    for (let i = 0; i < m.length; i++) m[i] = rng.next()
    return m
  }
  return { A: fill(STREAM_A), B: fill(STREAM_B) }
}

/** S1 (Saltelli 2010: mean (f(B) - f0)(f(A_B^i) - f(A)) / Var; f0, the mean of f over A and B, is subtracted from f(B) because it has expectation zero in the product and removes the noise a large output mean would add) and ST (Jansen: mean (f(A) - f(A_B^i))^2 / 2 / Var) over the rows in idx. */
function sobolEstimate(
  fA: Float64Array,
  fB: Float64Array,
  fAB: readonly Float64Array[],
  idx: Int32Array,
): { S1: number[]; ST: number[] } {
  const k = idx.length
  let m = 0
  for (const r of idx) m += (fA[r] as number) + (fB[r] as number)
  m /= 2 * k
  let v = 0
  for (const r of idx)
    v += ((fA[r] as number) - m) ** 2 + ((fB[r] as number) - m) ** 2
  v /= 2 * k
  const d = fAB.length
  const S1 = new Array<number>(d).fill(0)
  const ST = new Array<number>(d).fill(0)
  // relative guard: a variance at rounding-noise level is zero variance (indices would be noise / noise)
  if (v <= 1e-24 * m * m || v <= 1e-300) return { S1, ST }
  for (let i = 0; i < d; i++) {
    const ab = fAB[i] as Float64Array
    let s1 = 0
    let st = 0
    for (const r of idx) {
      const a = fA[r] as number
      s1 += ((fB[r] as number) - m) * ((ab[r] as number) - a)
      st += (a - (ab[r] as number)) ** 2
    }
    S1[i] = s1 / k / v
    ST[i] = st / (2 * k) / v
  }
  return { S1, ST }
}

const sd = (xs: readonly number[]): number => {
  const n = xs.length
  if (n < 2) return 0
  let m = 0
  for (const x of xs) m += x
  m /= n
  let s = 0
  for (const x of xs) s += (x - m) ** 2
  return Math.sqrt(s / (n - 1))
}

/**
 * Sobol indices for every output of a vector-valued model from ONE set of n (d + 2) evaluations.
 * Rows (A_r, B_r, A_B^i_r) with a non-finite value in an output are dropped for that output only and logged
 * (model.degenerate). Result is [output][variable]; conf is the 1.96 x sd of `bootstrap` resamples of the evaluation rows (stream 203).
 */
export function sobolIndicesMulti(
  f: (x: Float64Array) => Vec,
  nOut: number,
  names: readonly string[],
  bounds: Bounds,
  n: number,
  seed: number,
  bootstrap = N_BOOTSTRAP,
  outputNames: readonly string[] = Array.from(
    { length: nOut },
    (_, o) => `y${o}`,
  ),
): SobolResult[][] {
  checkArgs(names, bounds)
  const d = names.length
  if (!Number.isInteger(n) || n < 2)
    throw new RangeError("n must be an integer >= 2")
  const { A, B } = sobolMatrices(d, n, seed)
  // vals[o][block][row]; block 0 = A, 1 = B, 2 + i = A_B^i (A with column i taken from B)
  const vals = Array.from({ length: nOut }, () =>
    Array.from({ length: d + 2 }, () => new Float64Array(n)),
  )
  const x = new Float64Array(d)
  const put = (block: number, r: number) => {
    const y = f(x)
    for (let o = 0; o < nOut; o++)
      ((vals[o] as Float64Array[])[block] as Float64Array)[r] = y[o] as number
  }
  for (let r = 0; r < n; r++) {
    scale(A, bounds, r * d, x)
    put(0, r)
    scale(B, bounds, r * d, x)
    put(1, r)
    for (let i = 0; i < d; i++) {
      scale(A, bounds, r * d, x)
      const [lo, hi] = bounds[i] as readonly [number, number]
      x[i] = lo + (B[r * d + i] as number) * (hi - lo)
      put(2 + i, r)
    }
  }
  const boot = new Xoshiro128(deriveSeed(seed, STREAM_BOOT))
  return Array.from({ length: nOut }, (_, o) => {
    const blocks = vals[o] as Float64Array[]
    const keep: number[] = []
    for (let r = 0; r < n; r++)
      if (blocks.every((b) => Number.isFinite(b[r] as number))) keep.push(r)
    const dropped = n - keep.length
    const oname = outputNames[o] as string
    if (dropped > 0)
      emitEvent("model.degenerate", "warn", {
        model: "sensitivity",
        reason: "nonfinite_output_excluded",
        output: oname,
        n_dropped: dropped,
      })
    if (keep.length < 2)
      throw new InfeasibleError(
        `sensitivity output ${oname}: fewer than 2 finite evaluation rows`,
      )
    const all = Int32Array.from(keep)
    const fA = blocks[0] as Float64Array
    const fB = blocks[1] as Float64Array
    const fAB = blocks.slice(2)
    const est = sobolEstimate(fA, fB, fAB, all)
    if (est.S1.every((s) => s === 0) && est.ST.every((s) => s === 0))
      emitEvent("model.degenerate", "warn", {
        model: "sensitivity",
        reason: "zero_variance",
        output: oname,
        n_dropped: dropped,
      })
    const bs1 = Array.from({ length: d }, () => [] as number[])
    const bst = Array.from({ length: d }, () => [] as number[])
    const pick = new Int32Array(keep.length)
    for (let b = 0; b < bootstrap; b++) {
      for (let j = 0; j < pick.length; j++)
        pick[j] = all[Math.floor(boot.next() * all.length)] as number
      const e = sobolEstimate(fA, fB, fAB, pick)
      for (let i = 0; i < d; i++) {
        ;(bs1[i] as number[]).push(e.S1[i] as number)
        ;(bst[i] as number[]).push(e.ST[i] as number)
      }
    }
    return names.map((variable, i) => ({
      variable,
      S1: est.S1[i] as number,
      S1_conf: Z95 * sd(bs1[i] as number[]),
      ST: est.ST[i] as number,
      ST_conf: Z95 * sd(bst[i] as number[]),
    }))
  })
}

/** Scalar-model convenience over sobolIndicesMulti. Variable order follows `names`. */
export function sobolIndices(
  f: (x: Float64Array) => number,
  names: readonly string[],
  bounds: Bounds,
  n: number,
  seed: number,
  bootstrap = N_BOOTSTRAP,
): SobolResult[] {
  return sobolIndicesMulti(
    (x) => [f(x)],
    1,
    names,
    bounds,
    n,
    seed,
    bootstrap,
    ["f"],
  )[0] as SobolResult[]
}

/**
 * Morris elementary effects on the unit cube of the bounds: 4 levels {0, 1/3, 2/3, 1}, delta = 2/3. Each trajectory
 * starts at a random level in {0, 1/3} per variable (so every step +delta stays on the grid) and moves the variables
 * one at a time, in a random permutation, each by +delta; EE = (f_after - f_before) / delta (per unit of normalised
 * range). mu_star = mean |EE|, sigma = sd of EE. Result is [output][variable]; non-finite EEs are skipped per output and logged.
 */
export function morrisScreenMulti(
  f: (x: Float64Array) => Vec,
  nOut: number,
  names: readonly string[],
  bounds: Bounds,
  trajectories: number,
  seed: number,
  outputNames: readonly string[] = Array.from(
    { length: nOut },
    (_, o) => `y${o}`,
  ),
): MorrisResult[][] {
  checkArgs(names, bounds)
  if (!Number.isInteger(trajectories) || trajectories < 1)
    throw new RangeError("trajectories must be an integer >= 1")
  const d = names.length
  const DELTA = 2 / 3
  const rng = new Xoshiro128(deriveSeed(seed, STREAM_MORRIS))
  // ee[o][variable] = list of finite elementary effects
  const ee = Array.from({ length: nOut }, () =>
    Array.from({ length: d }, () => [] as number[]),
  )
  const dropped = new Array<number>(nOut).fill(0)
  const lvl = new Int32Array(d)
  const u = new Float64Array(d)
  const x = new Float64Array(d)
  const at = (): Vec => {
    for (let j = 0; j < d; j++) u[j] = (lvl[j] as number) / 3
    scale(u, bounds, 0, x)
    return f(x)
  }
  for (let t = 0; t < trajectories; t++) {
    for (let j = 0; j < d; j++) lvl[j] = Math.floor(rng.next() * 2)
    const order = Array.from({ length: d }, (_, j) => j)
    shuffleInPlace(rng, order)
    let prev = Array.from(at())
    for (const j of order) {
      lvl[j] = (lvl[j] as number) + 2
      const cur = Array.from(at())
      for (let o = 0; o < nOut; o++) {
        const e = ((cur[o] as number) - (prev[o] as number)) / DELTA
        if (Number.isFinite(e)) ((ee[o] as number[][])[j] as number[]).push(e)
        else dropped[o] = (dropped[o] as number) + 1
      }
      prev = cur
    }
  }
  return Array.from({ length: nOut }, (_, o) => {
    const oname = outputNames[o] as string
    if ((dropped[o] as number) > 0)
      emitEvent("model.degenerate", "warn", {
        model: "sensitivity",
        reason: "nonfinite_output_excluded",
        output: oname,
        n_dropped: dropped[o] as number,
      })
    return names.map((variable, j) => {
      const es = (ee[o] as number[][])[j] as number[]
      if (es.length === 0)
        throw new InfeasibleError(
          `Morris output ${oname}, variable ${variable}: no finite elementary effect`,
        )
      const abs = es.map(Math.abs)
      return {
        variable,
        mu_star: abs.reduce((a, b) => a + b, 0) / abs.length,
        sigma: sd(es),
        mu_star_conf: (Z95 * sd(abs)) / Math.sqrt(abs.length),
      }
    })
  })
}

/** Scalar-model convenience over morrisScreenMulti. */
export function morrisScreen(
  f: (x: Float64Array) => number,
  names: readonly string[],
  bounds: Bounds,
  trajectories: number,
  seed: number,
): { variable: string; mu_star: number; sigma: number }[] {
  return (
    morrisScreenMulti((x) => [f(x)], 1, names, bounds, trajectories, seed, [
      "f",
    ])[0] as MorrisResult[]
  ).map(({ variable, mu_star, sigma }) => ({ variable, mu_star, sigma }))
}

/** D8: the 11 sensitivity variables (7 design variables, pH, irradiance, air temperature, wind). The water ratio has zero effect in 1-5 (plan 02 D4) and is not varied. */
export const SENSITIVITY_VARIABLES = [
  "primer_gptes_molfrac",
  "primer_dft_um",
  "midcoat_pvc",
  "midcoat_tio2_fraction",
  "midcoat_dft_um",
  "topcoat_mtes_molfrac",
  "topcoat_dft_um",
  "sol_gel_ph",
  "irradiance_w_m2",
  "t_air_c",
  "wind_m_s",
] as const
/** D8: outputs analysed, all from one evaluation. */
export const SENSITIVITY_OUTPUTS = [
  "t_max_c",
  "r_solar",
  "corrosion_risk",
  "gel_time_rel",
] as const

/** Bounds in SENSITIVITY_VARIABLES order: plan 01 ranges, irradiance 600-1000, air temperature 28-36, wind 1-6 (D8). */
export function sensitivityBounds(ctx: ModelContext): Bounds {
  const r = ctx.ranges
  const b = (x: { min: number; max: number }) => [x.min, x.max] as const
  return [
    b(r.primer_gptes_molfrac),
    b(r.primer_dft_um),
    b(r.midcoat_pvc),
    b(r.midcoat_tio2_fraction),
    b(r.midcoat_dft_um),
    b(r.topcoat_mtes_molfrac),
    b(r.topcoat_dft_um),
    b(r.sol_gel_ph),
    [600, 1000],
    [28, 36],
    [1, 6],
  ]
}

/** One full-stack (C4) evaluation of the 11 variables: [t_max_c, r_solar, corrosion_risk, gel_time_rel]. */
export function sensitivityModel(
  ctx: ModelContext,
): (x: Float64Array) => number[] {
  return (x) => {
    const o = evaluate(
      {
        primer_gptes_molfrac: x[0] as number,
        primer_dft_um: x[1] as number,
        midcoat_pvc: x[2] as number,
        midcoat_tio2_fraction: x[3] as number,
        midcoat_dft_um: x[4] as number,
        topcoat_mtes_molfrac: x[5] as number,
        topcoat_dft_um: x[6] as number,
        ph: x[7] as number,
      },
      scenarioFrom(
        x[8] as number,
        x[9] as number,
        x[10] as number,
        ctx.weather,
      ),
      CONTROL_LAYERS.C4,
      ctx,
    )
    return [o.t_max_c, o.r_solar, o.corrosion_risk, o.gel_time_rel]
  }
}

/**
 * D8: Morris screening (20 trajectories x 12 = 240 evaluations) and Sobol (n x 13 evaluations; 13,312 at n = 1024)
 * of the four outputs on the full C4 stack, one evaluation yielding all four. Streams: A/B 200/201, Morris 202, bootstrap 203.
 */
export function runSensitivity(
  ctx: ModelContext,
  seed: number,
  n = 1024,
): SensRow[] {
  const f = sensitivityModel(ctx)
  const names = SENSITIVITY_VARIABLES
  const bounds = sensitivityBounds(ctx)
  const outs = SENSITIVITY_OUTPUTS
  const d = names.length
  const sobol = sobolIndicesMulti(
    f,
    outs.length,
    names,
    bounds,
    n,
    seed,
    N_BOOTSTRAP,
    outs,
  )
  const morris = morrisScreenMulti(
    f,
    outs.length,
    names,
    bounds,
    N_MORRIS,
    seed,
    outs,
  )
  const rows: SensRow[] = []
  outs.forEach((output, o) => {
    const sb = sobol[o] as SobolResult[]
    const mo = morris[o] as MorrisResult[]
    for (const r of sb)
      rows.push({
        output,
        method: "sobol",
        variable: r.variable,
        index: "S1",
        value: r.S1,
        conf: r.S1_conf,
      })
    for (const r of sb)
      rows.push({
        output,
        method: "sobol",
        variable: r.variable,
        index: "ST",
        value: r.ST,
        conf: r.ST_conf,
      })
    for (const r of mo)
      rows.push({
        output,
        method: "morris",
        variable: r.variable,
        index: "mu_star",
        value: r.mu_star,
        conf: r.mu_star_conf,
      })
    for (const r of mo)
      rows.push({
        output,
        method: "morris",
        variable: r.variable,
        index: "sigma",
        value: r.sigma,
        conf: 0,
      })
    emitEvent("sensitivity.done", "info", {
      method: "sobol",
      output,
      n_evals: n * (d + 2),
    })
    emitEvent("sensitivity.done", "info", {
      method: "morris",
      output,
      n_evals: N_MORRIS * (d + 1),
    })
  })
  return rows
}
