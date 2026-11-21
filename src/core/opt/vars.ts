import { ConfigError } from "../errors"
import { T_DELAM_MAX } from "../pipeline/controls"

/**
 * The nine continuous ingredient variables of plan 05, in the fixed coordinate order of every optimiser vector.
 * lo/hi follow configs/material_ranges.yaml (blueprint 5.1) and the grade-size bounds of plan 05 D8; h is the
 * finite-difference step in SCALED coordinates (docs/spike-refine.md Q1). configs/optimize.yaml carries the same
 * numbers with provenance; tests pin the two against each other.
 */
export const VARS: readonly {
  id: string
  lo: number
  hi: number
  h: number
}[] = [
  { id: "p1", lo: 0.2, hi: 0.8, h: 1e-5 },
  { id: "p2", lo: 2, hi: 12, h: 1e-5 },
  { id: "m1", lo: 0.1, hi: 0.35, h: 1e-4 },
  { id: "m2", lo: 0.2, hi: 0.8, h: 1e-4 },
  { id: "m3", lo: 100, hi: 300, h: 1e-4 },
  { id: "t1", lo: 0.2, hi: 0.8, h: 1e-5 },
  { id: "t2", lo: 3, hi: 20, h: 1e-4 },
  { id: "d_tio2_um", lo: 0.15, hi: 0.4, h: 1e-5 },
  { id: "d_baso4_um", lo: 0.3, hi: 3.0, h: 1e-5 },
]

/** Delamination ceiling of the third constraint: the plan-3 T_delam_max, imported, not re-typed. */
export const DELAM_MAX = T_DELAM_MAX

const N = VARS.length
const IDX = { m1: 2, p2: 1, m3: 4, t2: 6 } as const

function needN(len: number, what: string): void {
  if (len !== N) throw new RangeError(`${what} needs ${N} entries, got ${len}`)
}

/** u = (x - lo)/(hi - lo): [0,1] per variable inside the box. */
export function toScaled(x: readonly number[]): Float64Array {
  needN(x.length, "toScaled")
  const u = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const v = VARS[i] as (typeof VARS)[number]
    u[i] = ((x[i] as number) - v.lo) / (v.hi - v.lo)
  }
  return u
}

export function fromScaled(u: Float64Array): number[] {
  needN(u.length, "fromScaled")
  return VARS.map((v, i) => v.lo + (u[i] as number) * (v.hi - v.lo))
}

/**
 * FR-1 constraints, c_j <= 0 feasible: [m1 - cpvc, (p2 + m3 + t2 - dftCap)/dftCap, delam - DELAM_MAX].
 * The DFT term is divided by the cap so all three have order-one scale in the exterior penalty; its sign is unchanged.
 * `delam` is the evaluated delam_proxy of the recipe (a model output, so the caller supplies it).
 */
export function constraints(
  x: readonly number[],
  cpvc: number,
  dftCap: number,
  delam: number,
): number[] {
  needN(x.length, "constraints")
  const dft =
    (x[IDX.p2] as number) + (x[IDX.m3] as number) + (x[IDX.t2] as number)
  return [
    (x[IDX.m1] as number) - cpvc,
    (dft - dftCap) / dftCap,
    delam - DELAM_MAX,
  ]
}

/** F9: a start (physical units) must have nine finite entries inside the box. */
export function checkInBox(x: readonly number[]): void {
  if (x.length !== N)
    throw new ConfigError("start", `start needs ${N} values, got ${x.length}`)
  VARS.forEach((v, i) => {
    const xi = x[i] as number
    if (!Number.isFinite(xi) || xi < v.lo || xi > v.hi)
      throw new ConfigError(
        `start.${v.id}`,
        `start ${v.id} = ${xi} is outside [${v.lo}, ${v.hi}]`,
      )
  })
}
