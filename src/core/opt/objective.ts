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
  /** The cost_proxy objective alone (plan 03 D3): a function of the three layer DFTs, no thermal run (0.5 ms). */
  cost: (u: Float64Array) => number
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

  const stack = (u: Float64Array) => {
    const x = fromScaled(u)
    local.tio2.diameter_um.value = (x[7] as number) * rTio2
    local.baso4.diameter_um.value = (x[8] as number) * rBaso4
    return stackProps(
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
  }

  const objectives = (u: Float64Array): number[] => {
    const sp = stack(u)
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

  const cost = (u: Float64Array): number => {
    const c = stack(u).cost_proxy
    if (!Number.isFinite(c))
      throw new PhysicsRangeError(
        "cost",
        "the cost model returned a non-finite value",
      )
    return c
  }

  return {
    objectives,
    cost,
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

/** Segment point toward `ref`: the feasible end of the segment from u (t = 1) to ref (t = 0) by bisection. */
export function restoreToward(
  ok: (u: Float64Array) => boolean,
  u: Float64Array,
  ref: Float64Array,
): Float64Array {
  if (ok(u)) return u
  const at = (t: number) =>
    Float64Array.from(ref, (v, i) => v + t * ((u[i] as number) - v))
  let lo = 0
  let hi = 1
  for (let k = 0; k < 60; k++) {
    const t = 0.5 * (lo + hi)
    if (ok(at(t))) lo = t
    else hi = t
  }
  return at(lo)
}

/** Cost scale of the budget constraint, so its penalty term has order-one size. */
const COST_SCALE = 1
/** The three coordinates cost_proxy depends on (p2, m3, t2; plan 03 D3); a test pins that the others leave it unchanged. */
export const COST_COORDS: readonly number[] = [1, 4, 6]
const FEASIBLE_VIOLATION = 1e-9

/**
 * A point inside the budget and the FR-1 constraints, as close to `u` as the cost allows. Only the three cost coordinates
 * move (toward `ref`'s), so a recipe that is over budget by a hair keeps its other six levels instead of collapsing onto
 * `ref`; when that mixed point is itself infeasible the whole segment toward `ref` is used. `ref` must be feasible.
 */
export function pullIntoBudget(
  model: Model,
  u: Float64Array,
  budget: number,
  ref: Float64Array,
): Float64Array {
  const ok = (x: Float64Array) =>
    model.cost(x) <= budget && model.maxViolation(x) <= FEASIBLE_VIOLATION
  if (ok(u)) return u
  const mix = (t: number) => {
    const x = Float64Array.from(u)
    for (const i of COST_COORDS)
      x[i] = (ref[i] as number) + t * ((u[i] as number) - (ref[i] as number))
    return x
  }
  if (!ok(mix(0))) return restoreToward(ok, u, ref)
  let lo = 0
  let hi = 1
  for (let k = 0; k < 60; k++) {
    const t = 0.5 * (lo + hi)
    if (ok(mix(t))) lo = t
    else hi = t
  }
  return mix(lo)
}

/**
 * One budget-constrained solve: min S under the FR-1 constraints and cost <= budget, from `u0` (pulled into the budget
 * first when it is over it, toward the feasible `ref`). The result is pulled back inside the budget when the penalty method
 * ends outside it, so cost <= budget always holds.
 */
export function solveUnderBudget(
  model: Model,
  w: readonly number[],
  budget: number,
  u0: Float64Array,
  opts: { maxIter: number; kktTol: number },
  ref: Float64Array = u0,
): OptResult {
  const hs = VARS.map((v) => v.h)
  const f = (u: Float64Array) => model.scalar(u, w)
  const g = (u: Float64Array) => gradient(f, u, hs)
  const cons = [
    ...([0, 1, 2] as const).map(
      (j) => (u: Float64Array) => model.constraint(u, j),
    ),
    (u: Float64Array) => (model.cost(u) - budget) / COST_SCALE,
  ]
  const start = pullIntoBudget(model, u0, budget, ref)
  const r = minimise(f, g, start, cons, opts)
  const u = pullIntoBudget(model, r.u, budget, start)
  if (u === r.u) return r
  return { ...r, u, f: f(u), maxViolation: model.maxViolation(u) }
}

/** Relative headroom above which a winning level is solved again, and the number of such extra passes. */
const TIGHTEN_SLACK = 1e-6
const MAX_TIGHTEN = 3

/**
 * FR-9: the `solve(budget, warm)` callback of buildBudgetTable for one profile. The scalar is not convex in the recipe: the
 * best recipe at a high budget (a thick, expensive primer) is in another basin than the best one at a low budget, so
 * upward continuation alone would never reach it. A downward sweep from the unconstrained optimum `uStar` (budget c_max)
 * provides the second candidate of every level, and each level keeps the better of the two, so the upward sweep continues
 * from whichever basin is currently best. Both sweeps stay deterministic functions of their inputs.
 */
export function budgetSolver(
  model: Model,
  w: readonly number[],
  levels: readonly number[],
  uMin: Float64Array,
  uStar: Float64Array,
  opts: { maxIter: number; kktTol: number },
): (budget: number, warm: Float64Array | null) => OptResult {
  const down = new Map<number, OptResult>()
  const sweepDown = () => {
    let from = uStar
    for (let k = levels.length - 1; k >= 0; k--) {
      const b = levels[k] as number
      const r = solveUnderBudget(model, w, b, from, opts, uMin)
      down.set(b, r)
      from = r.u
    }
  }
  return (budget, warm) => {
    if (down.size === 0) sweepDown()
    const up = solveUnderBudget(model, w, budget, warm ?? uMin, opts, uMin)
    const dn = down.get(budget)
    let best = dn !== undefined && dn.f < up.f ? dn : up
    // a winner that leaves budget unspent is re-solved at the exact budget (a penalty solve can stop short of the bound)
    for (let pass = 0; pass < MAX_TIGHTEN; pass++) {
      if ((budget - model.cost(best.u)) / budget <= TIGHTEN_SLACK) break
      const again = solveUnderBudget(model, w, budget, best.u, opts, uMin)
      if (!(again.f < best.f)) break
      best = again
    }
    return best
  }
}

/** FR-9 c_min: the cheapest recipe under the FR-1 constraints (cost minimised by the same projected BFGS). */
export function solveMinCost(
  model: Model,
  u0: Float64Array,
  opts: SolveOpts = {},
): OptResult {
  const hs = VARS.map((v) => v.h)
  const f = (u: Float64Array) => model.cost(u)
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
