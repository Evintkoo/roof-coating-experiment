import { InfeasibleError } from "../errors"
import { OBJECTIVES } from "../pipeline/optimize"
import type { OBJECTIVE_COLUMNS } from "../pipeline/tables"
import type { ResultRow } from "../schema"

/** FR-2 parameters; configs/optimize.yaml `scalarisation` carries the same values and a test pins them. */
export const BETA = 20
export const RHO = 0.05

/** The five plan-3 objective names in plan-3 order, read from OBJECTIVES at run time (never re-typed). */
export const OBJECTIVE_NAMES: readonly string[] = OBJECTIVES.map(([c]) => c)

function sameLength(g: readonly number[], w: readonly number[]): void {
  if (g.length !== w.length)
    throw new RangeError(`g has ${g.length} entries, w has ${w.length}`)
}

/**
 * FR-2 smooth Chebyshev: S = (1/beta) ln sum_i exp(beta w_i g_i) + rho sum_i w_i g_i, with g_i the normalised,
 * minimised objectives. Log-sum-exp is shifted by its maximum so large arguments do not overflow.
 */
export function chebyshev(
  g: readonly number[],
  w: readonly number[],
  rho = RHO,
  beta = BETA,
): number {
  sameLength(g, w)
  let max = Number.NEGATIVE_INFINITY
  let lin = 0
  for (let i = 0; i < g.length; i++) {
    const a = (w[i] as number) * (g[i] as number)
    if (a > max) max = a
    lin += a
  }
  let s = 0
  for (let i = 0; i < g.length; i++)
    s += Math.exp(beta * ((w[i] as number) * (g[i] as number) - max))
  return max + Math.log(s) / beta + rho * lin
}

/** The true Chebyshev maximum max_i w_i g_i, reported beside S (S exceeds it by at most ln(n)/beta, plus the rho term). */
export function trueChebyshev(
  g: readonly number[],
  w: readonly number[],
): number {
  sameLength(g, w)
  let m = Number.NEGATIVE_INFINITY
  for (let i = 0; i < g.length; i++)
    m = Math.max(m, (w[i] as number) * (g[i] as number))
  return m
}

/** D2: per-objective min and max of plan-3 results over feasible rows (all scenarios, nominal columns). */
export function normaliseObjectives(results: readonly ResultRow[]): {
  lo: number[]
  hi: number[]
} {
  const rows = results.filter((r) => r.feasible)
  if (rows.length === 0)
    throw new InfeasibleError("normalisation needs at least one feasible row")
  const lo: number[] = []
  const hi: number[] = []
  OBJECTIVES.forEach(([name]) => {
    const col = name as (typeof OBJECTIVE_COLUMNS)[number]
    let a = Number.POSITIVE_INFINITY
    let b = Number.NEGATIVE_INFINITY
    for (const r of rows) {
      const v = r[col]
      if (Number.isNaN(v)) continue
      if (v < a) a = v
      if (v > b) b = v
    }
    if (!(b > a))
      throw new InfeasibleError(
        `objective ${name} has no spread over the feasible rows; cannot normalise`,
      )
    lo.push(a)
    hi.push(b)
  })
  return { lo, hi }
}

/** g_i in [0,1] (for values inside the screened range), every objective minimised: the maximised ones are flipped. */
export function normalised(
  values: readonly number[],
  norm: { lo: readonly number[]; hi: readonly number[] },
): number[] {
  if (values.length !== OBJECTIVES.length)
    throw new RangeError(`expected ${OBJECTIVES.length} objective values`)
  return OBJECTIVES.map(([, sense], i) => {
    const lo = norm.lo[i] as number
    const hi = norm.hi[i] as number
    const v = values[i] as number
    return sense === "max" ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo)
  })
}
