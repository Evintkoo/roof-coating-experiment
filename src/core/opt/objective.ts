import type { Materials } from "../config"
import type { Scenario } from "../design"
import { PhysicsRangeError } from "../errors"
import { delaminationProxy } from "../models/delamination"
import type { ModelContext } from "../pipeline/context"
import {
  CONTROL_LAYERS,
  stackProps,
  thermalOutcomes,
} from "../pipeline/stackProps"
import { quantile7 } from "../pipeline/uncertainty"
import { gradient } from "./gradient"
import { minimise, type OptResult } from "./projectedBfgs"
import { chebyshev, normalised } from "./scalarize"
import { constraints, fromScaled, VARS } from "./vars"

/** Per-objective min and max used to normalise the five objectives (plan 05 D2). */
export type Norm = { lo: readonly number[]; hi: readonly number[] }

export type Model = {
  /** The five plan-3 objectives (scenario means, OBJECTIVES order) at scaled u. Throws PhysicsRangeError (exit 4) on a non-finite value. */
  objectives: (u: Float64Array) => number[]
  /** Chebyshev scalar S of the normalised objectives under weights w (in OBJECTIVES order). */
  scalar: (u: Float64Array, w: readonly number[]) => number
  /** Delamination proxy of the recipe (a function of t1 and t2 only). */
  delam: (u: Float64Array) => number
  /** The three FR-1 constraint values c_j(u) <= 0 (m1 - cpvc, DFT cap, delam). */
  constraint: (u: Float64Array, j: 0 | 1 | 2) => number
  /** Largest of the three constraint values. */
  maxViolation: (u: Float64Array) => number
}

/**
 * Plan 05 D8: the nine variables map to the seven design columns plus the two grade sizes, which enter the models through
 * a private copy of the materials (never an edit of materials.yaml). `mat` is the material set to evaluate under (the
 * nominal ctx.mat or an uncertainty draw); the grade of a draw keeps the draw's relative perturbation: the chosen grade
 * is scaled by draw diameter / nominal diameter.
 */
export function makeModel(
  ctx: ModelContext,
  scenarios: readonly Scenario[],
  norm: Norm,
  cpvc: number,
  dftCap: number,
  mat: Materials = ctx.mat,
): Model {
  const local = structuredClone(mat)
  const rTio2 = mat.tio2.diameter_um.value / ctx.mat.tio2.diameter_um.value
  const rBaso4 = mat.baso4.diameter_um.value / ctx.mat.baso4.diameter_um.value
  const S = scenarios.length

  const objectives = (u: Float64Array): number[] => {
    const x = fromScaled(u)
    local.tio2.diameter_um.value = (x[7] as number) * rTio2
    local.baso4.diameter_um.value = (x[8] as number) * rBaso4
    const sp = stackProps(
      {
        primer_gptes_molfrac: x[0] as number,
        primer_dft_um: x[1] as number,
        midcoat_pvc: x[2] as number,
        midcoat_tio2_fraction: x[3] as number,
        midcoat_dft_um: x[4] as number,
        topcoat_mtes_molfrac: x[5] as number,
        topcoat_dft_um: x[6] as number,
      },
      CONTROL_LAYERS.C4,
      ctx,
      local,
    )
    const outs = thermalOutcomes(
      scenarios.map((s) => ({ sp, s })),
      ctx,
    )
    const sum = [0, 0, 0, 0, 0]
    for (const o of outs) {
      sum[0] = (sum[0] as number) + o.r_solar
      sum[1] = (sum[1] as number) + o.t_max_c
      sum[2] = (sum[2] as number) + o.corrosion_risk
      sum[3] = (sum[3] as number) + o.delam_proxy
      sum[4] = (sum[4] as number) + o.cost_proxy
    }
    const v = sum.map((a) => a / S)
    if (!v.every(Number.isFinite))
      throw new PhysicsRangeError(
        "objectives",
        "the models returned a non-finite objective",
      )
    return v
  }

  const delam = (u: Float64Array): number => {
    const x = fromScaled(u)
    return delaminationProxy(x[5] as number, x[6] as number, local)
  }

  const constraint = (u: Float64Array, j: 0 | 1 | 2): number => {
    const x = fromScaled(u)
    const d =
      j === 2 ? delaminationProxy(x[5] as number, x[6] as number, local) : 0
    return constraints(x, cpvc, dftCap, d)[j] as number
  }

  return {
    objectives,
    scalar: (u, w) => chebyshev(normalised(objectives(u), norm), w),
    delam,
    constraint,
    maxViolation: (u) => {
      const x = fromScaled(u)
      const d = delaminationProxy(x[5] as number, x[6] as number, local)
      return Math.max(...constraints(x, cpvc, dftCap, d))
    },
  }
}

export type SolveOpts = { maxIter?: number; kktTol?: number }

/** One constrained solve of the scalar under weights w: projected BFGS (plan 05 D3, D4) with VARS-based gradient steps. */
export function solveScalar(
  model: Model,
  w: readonly number[],
  u0: Float64Array,
  opts: SolveOpts = {},
): OptResult {
  const hs = VARS.map((v) => v.h)
  const f = (u: Float64Array) => model.scalar(u, w)
  const g = (u: Float64Array) => gradient(f, u, hs)
  const cons = ([0, 1, 2] as const).map(
    (j) => (u: Float64Array) => model.constraint(u, j),
  )
  return minimise(f, g, u0, cons, opts)
}

/**
 * Plan 05 D6: minimise the p-th quantile (type 7, p = 0.9) over K uncertainty models of the scalar, by the same projected
 * BFGS. The quantile is a convex combination of two order statistics, so its gradient is the same combination of the
 * gradients of the two draws holding those ranks (a kink only where the ranks swap). Constraints are the nominal model's.
 */
export function solveQuantile(
  models: readonly Model[],
  nominal: Model,
  w: readonly number[],
  u0: Float64Array,
  p: number,
  opts: SolveOpts = {},
): OptResult {
  const K = models.length
  const hs = VARS.map((v) => v.h)
  const pos = (K - 1) * p
  const i0 = Math.floor(pos)
  const frac = pos - i0
  const values = (u: Float64Array) => models.map((m) => m.scalar(u, w))
  const f = (u: Float64Array) =>
    quantile7(Float64Array.from(values(u)).sort(), p)
  const g = (u: Float64Array) => {
    const v = values(u)
    const order = v
      .map((_, k) => k)
      .sort((a, b) => (v[a] as number) - (v[b] as number) || a - b)
    const grad = new Float64Array(u.length)
    const add = (k: number, c: number) => {
      const m = models[k] as Model
      const gk = gradient((x) => m.scalar(x, w), u, hs)
      for (let i = 0; i < grad.length; i++)
        grad[i] = (grad[i] as number) + c * (gk[i] as number)
    }
    add(order[i0] as number, 1 - frac)
    if (frac > 0 && i0 + 1 < K) add(order[i0 + 1] as number, frac)
    return grad
  }
  const cons = ([0, 1, 2] as const).map(
    (j) => (u: Float64Array) => nominal.constraint(u, j),
  )
  return minimise(f, g, u0, cons, opts)
}
