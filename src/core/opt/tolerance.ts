import { emitEvent } from "../events"
import { hessian } from "./gradient"
import { VARS } from "./vars"

type Fn = (u: Float64Array) => number

export type ToleranceRow = {
  id: string
  /** Largest decrease of the scaled coordinate (u) whose loss stays within the tolerance; 0 at an active lower bound. */
  tol_lo: number
  /** Largest increase of the scaled coordinate whose loss stays within the tolerance; 0 at an active upper bound. */
  tol_hi: number
  /** Relative loss (f - f*)/|f*| at the lower and upper edge, from direct evaluation. */
  loss_lo: number
  loss_hi: number
  /** The larger of the two edge losses (both equal the tolerance for an unclipped variable, to 1e-6). */
  loss_edge: number
  /** True when an edge is limited by the box (or the variable is at a bound) instead of by the loss. */
  clipped: boolean
  /** True when the loss at 1.5 x the tolerance exceeds the tolerance on every unclipped side (H8 second half). */
  grows: boolean
}

/** H8: each unclipped edge is bisected on direct evaluation to loss tolLoss, within this band. */
export const EDGE_BAND = 1e-6
const BISECT_ITERS = 80
const AT_BOUND = 1e-9

/**
 * Plan 05 FR-6, D5: per variable, the largest dose change (scaled units) that keeps the relative loss of f within
 * `tolLoss`. The Hessian estimate delta_i = sqrt(2 tol f* / H_ii) only brackets the search: each edge is then found by
 * doubling/halving and bisection on DIRECT evaluations of f until its loss is tolLoss within EDGE_BAND. The step is
 * clipped to the box and to the distance to the nearest bound (a side with no room has tolerance 0 and clipped = true;
 * a side whose loss never reaches tolLoss inside the box reports the distance to the bound and clipped = true).
 * `h` are the finite-difference steps of the Hessian (scaled).
 */
export function toleranceTable(
  f: Fn,
  uStar: Float64Array,
  h: readonly number[],
  tolLoss: number,
  opts: { role?: string } = {},
): ToleranceRow[] {
  if (!(tolLoss > 0 && tolLoss < 1))
    throw new RangeError(`tolLoss must be in (0, 1), got ${tolLoss}`)
  const fStar = f(uStar)
  const scale = Math.max(Math.abs(fStar), 1e-12)
  const H = hessian(f, uStar, h)
  const work = Float64Array.from(uStar)
  const loss = (i: number, d: number): number => {
    const old = work[i] as number
    work[i] = old + d
    const v = (f(work) - fStar) / scale
    work[i] = old
    return v
  }

  /** Distance d in (0, room] where loss(sign d) reaches tolLoss; clipped when it does not within `room`. */
  const edge = (
    i: number,
    sign: 1 | -1,
    room: number,
    d0: number,
  ): { d: number; loss: number; clipped: boolean } => {
    if (room <= AT_BOUND) return { d: 0, loss: 0, clipped: true }
    const L = (d: number) => loss(i, sign * d)
    const lroom = L(room)
    if (!(lroom > tolLoss + EDGE_BAND))
      return { d: room, loss: lroom, clipped: true }
    // bracket [a, b]: L(a) <= tol < L(b); start from the Hessian estimate
    let a = 0
    let b = Math.min(room, Math.max(d0, 1e-9))
    let lb = L(b)
    if (lb <= tolLoss) {
      a = b
      while (b < room && lb <= tolLoss) {
        a = b
        b = Math.min(room, 2 * b)
        lb = L(b)
      }
    } else {
      // shrink until the loss is below tolerance (it is 0 at d = 0)
      let c = b / 2
      while (c > 1e-15 && L(c) > tolLoss) {
        b = c
        c /= 2
      }
      a = c
    }
    let m = 0.5 * (a + b)
    let lm = L(m)
    for (let k = 0; k < BISECT_ITERS; k++) {
      if (Math.abs(lm - tolLoss) <= EDGE_BAND * 1e-3) break
      if (lm > tolLoss) b = m
      else a = m
      m = 0.5 * (a + b)
      lm = L(m)
    }
    return { d: m, loss: lm, clipped: false }
  }

  return VARS.map((v, i) => {
    const ui = uStar[i] as number
    const hii = (H[i] as Float64Array)[i] as number
    const d0 =
      hii > 0
        ? Math.sqrt((2 * tolLoss * scale) / hii)
        : Number.POSITIVE_INFINITY
    const lo = edge(i, -1, ui, d0)
    const hi = edge(i, 1, 1 - ui, d0)
    const grows = (
      [
        [lo, -1],
        [hi, 1],
      ] as const
    ).every(
      ([e, s]) =>
        e.clipped ||
        loss(i, s * Math.min(1.5 * e.d, s < 0 ? ui : 1 - ui)) > tolLoss,
    )
    const row: ToleranceRow = {
      id: v.id,
      tol_lo: lo.d,
      tol_hi: hi.d,
      loss_lo: lo.loss,
      loss_hi: hi.loss,
      loss_edge: Math.max(lo.loss, hi.loss),
      clipped: lo.clipped || hi.clipped,
      grows,
    }
    emitEvent("refine.tolerance.done", "info", {
      ...(opts.role !== undefined ? { role: opts.role } : {}),
      variable: v.id,
      tol_lo: row.tol_lo,
      tol_hi: row.tol_hi,
      loss_pct: 100 * row.loss_edge,
    })
    return row
  })
}
