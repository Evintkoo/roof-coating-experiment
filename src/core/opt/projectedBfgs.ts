import { gradient, hessian } from "./gradient"

/**
 * Projected BFGS in scaled coordinates (box [0, 1]^n) with Armijo backtracking and an exterior quadratic penalty
 * (plan 05 D3, D4). Constraints are c_j(u) <= 0.
 */
export type OptStatus = "converged" | "max_iter" | "stalled" | "infeasible"

export type OptResult = {
  u: Float64Array
  f: number
  iters: number
  /** Scaled projected-gradient sup-norm of the last penalised merit at the returned point. */
  kkt: number
  status: OptStatus
  /** Penalised merit at the start and after every accepted iterate, round after round (see `rounds`). */
  trace: number[]
  /** One entry per penalty round: its mu and the index in `trace` of the merit at the round start. */
  rounds: { mu: number; start: number }[]
  /** Largest constraint value at the returned point (<= 1e-9 whenever status is not "infeasible"). */
  maxViolation: number
}

export type MinimiseOpts = {
  /** Total iterations over all penalty rounds (D3: 60). */
  maxIter?: number
  /** Stop when the scaled projected gradient is at most this (default 1e-7). */
  kktTol?: number
  /** Step of the finite-difference constraint gradient (default 1e-6). */
  h?: number
}

export const PENALTY_MUS: readonly number[] = [10, 100, 1000]
export const ARMIJO_C = 1e-4
export const BACKTRACK = 0.5
export const FEASIBLE_TOL = 1e-9
const STALL_WINDOW = 5
const STALL_REL = 1e-10
const MAX_HALVINGS = 50

type Fn = (u: Float64Array) => number
type Grad = (u: Float64Array) => Float64Array
type Reason = "converged" | "stalled" | "max_iter" | "line_search"

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/** Scaled projected gradient: sup_i |u_i - P(u_i - g_i)|, zero at a bound whose gradient points outward. */
export function projectedGradientNorm(
  u: Float64Array,
  g: Float64Array,
): number {
  let m = 0
  for (let i = 0; i < u.length; i++) {
    const d = Math.abs(
      (u[i] as number) - clamp01((u[i] as number) - (g[i] as number)),
    )
    if (d > m) m = d
  }
  return m
}

export function minimise(
  f: Fn,
  g: Grad,
  u0: Float64Array,
  cons: readonly Fn[],
  opts: MinimiseOpts = {},
): OptResult {
  const n = u0.length
  const maxIter = opts.maxIter ?? 60
  const kktTol = opts.kktTol ?? 1e-7
  const hs = new Array<number>(n).fill(opts.h ?? 1e-6)
  const m = cons.length
  const lam = new Array<number>(m).fill(0)
  let mu = 0

  const cvals = (u: Float64Array) => cons.map((c) => c(u))
  const viol = (u: Float64Array) => {
    let v = Number.NEGATIVE_INFINITY
    for (const c of cons) v = Math.max(v, c(u))
    return m === 0 ? 0 : v
  }
  const isFeasible = (u: Float64Array) => viol(u) <= FEASIBLE_TOL

  /** Merit phi = f + sum mu max(0, c_j + lam_j / 2mu)^2 - lam_j^2 / 4mu and its gradient (lam = 0 in round one). */
  function evalMerit(u: Float64Array, wantGrad: boolean) {
    const fv = f(u)
    let phi = fv
    const s: number[] = []
    if (m > 0) {
      const c = cvals(u)
      for (let j = 0; j < m; j++) {
        const sj = Math.max(0, (c[j] as number) + (lam[j] as number) / (2 * mu))
        s.push(sj)
        phi += mu * sj * sj - (lam[j] as number) ** 2 / (4 * mu)
      }
    }
    let gr: Float64Array | undefined
    if (wantGrad) {
      gr = Float64Array.from(g(u))
      for (let j = 0; j < m; j++) {
        const sj = s[j] as number
        if (sj > 0) {
          const gc = gradient(cons[j] as Fn, u, hs)
          for (let i = 0; i < n; i++)
            gr[i] = (gr[i] as number) + 2 * mu * sj * (gc[i] as number)
        }
      }
    }
    return { fv, phi, grad: gr, s }
  }

  let u: Float64Array = Float64Array.from(u0, clamp01)
  // best feasible iterate seen (lowest f): the reference of the final feasibility restoration and the FR-3 guard
  let bestU: Float64Array | null = null
  let bestF = Number.POSITIVE_INFINITY
  const seen = (x: Float64Array, fv: number) => {
    if (fv < bestF && isFeasible(x)) {
      bestF = fv
      bestU = Float64Array.from(x)
    }
  }
  seen(u, f(u))

  const trace: number[] = []
  const rounds: { mu: number; start: number }[] = []
  let iters = 0
  let lastReason: Reason = "converged"
  const mus = m === 0 ? [1] : PENALTY_MUS

  // inverse-Hessian estimate, kept across penalty rounds (null = identity, scaled after the first step)
  let H: Float64Array[] | null = null
  for (let r = 0; r < mus.length; r++) {
    mu = mus[r] as number
    const last = r === mus.length - 1
    const tol = last ? kktTol : Math.max(kktTol, 1e-4)
    rounds.push({ mu, start: trace.length })
    let cur = evalMerit(u, true)
    trace.push(cur.phi)
    const hist: number[] = [cur.phi]
    let reason: Reason = "max_iter"
    for (;;) {
      const gr = cur.grad as Float64Array
      if (projectedGradientNorm(u, gr) <= tol) {
        reason = "converged"
        break
      }
      if (iters >= maxIter) {
        reason = "max_iter"
        break
      }
      // active set: at a bound with the gradient pointing out of the box
      const free: number[] = []
      for (let i = 0; i < n; i++) {
        const ui = u[i] as number
        const gi = gr[i] as number
        const act = (ui <= 0 && gi > 0) || (ui >= 1 && gi < 0)
        if (!act) free.push(i)
      }
      const d = new Float64Array(n)
      const direction = () => {
        d.fill(0)
        for (const i of free) {
          let s = 0
          if (H === null) s = gr[i] as number
          else
            for (const j of free)
              s += ((H[i] as Float64Array)[j] as number) * (gr[j] as number)
          d[i] = -s
        }
        let gd = 0
        for (const i of free) gd += (gr[i] as number) * (d[i] as number)
        return gd
      }
      let gd = direction()
      if (!(gd < 0) && H !== null) {
        H = null
        gd = direction()
      }
      if (!(gd < 0)) {
        reason = "converged"
        break
      }
      let dmax = 0
      for (const i of free) dmax = Math.max(dmax, Math.abs(d[i] as number))
      let alpha = H === null ? Math.min(1, 0.1 / dmax) : 1
      let accepted: {
        x: Float64Array
        ev: ReturnType<typeof evalMerit>
        step: number
      } | null = null
      for (let k = 0; k < MAX_HALVINGS; k++) {
        const x = new Float64Array(n)
        let slope = 0
        for (let i = 0; i < n; i++) {
          x[i] = clamp01((u[i] as number) + alpha * (d[i] as number))
          slope += (gr[i] as number) * ((x[i] as number) - (u[i] as number))
        }
        if (slope < 0) {
          const ev = evalMerit(x, false)
          if (ev.phi <= cur.phi + ARMIJO_C * slope) {
            accepted = { x, ev, step: alpha }
            break
          }
        }
        alpha *= BACKTRACK
      }
      if (accepted === null) {
        if (H !== null) {
          H = null
          continue
        }
        reason = "line_search"
        break
      }
      const nxt = evalMerit(accepted.x, true)
      const sv = new Float64Array(n)
      const yv = new Float64Array(n)
      let sy = 0
      let ss = 0
      let yy = 0
      for (const i of free) {
        sv[i] = (accepted.x[i] as number) - (u[i] as number)
        yv[i] = ((nxt.grad as Float64Array)[i] as number) - (gr[i] as number)
        sy += (sv[i] as number) * (yv[i] as number)
        ss += (sv[i] as number) ** 2
        yy += (yv[i] as number) ** 2
      }
      if (sy > 1e-10 * Math.sqrt(ss * yy) && sy > 0) {
        if (H === null) {
          const sc = sy / yy
          H = Array.from({ length: n }, (_, i) => {
            const row = new Float64Array(n)
            row[i] = sc
            return row
          })
        }
        // H <- (I - rho s y^T) H (I - rho y s^T) + rho s s^T on the free block
        const rho = 1 / sy
        const Hy = new Float64Array(n)
        for (const i of free)
          for (const j of free)
            Hy[i] =
              (Hy[i] as number) +
              ((H[i] as Float64Array)[j] as number) * (yv[j] as number)
        let yHy = 0
        for (const i of free) yHy += (yv[i] as number) * (Hy[i] as number)
        for (const i of free)
          for (const j of free) {
            const row = H[i] as Float64Array
            row[j] =
              (row[j] as number) -
              rho *
                ((Hy[i] as number) * (sv[j] as number) +
                  (sv[i] as number) * (Hy[j] as number)) +
              (rho * rho * yHy + rho) * (sv[i] as number) * (sv[j] as number)
          }
      }
      u = accepted.x
      cur = nxt
      iters++
      trace.push(cur.phi)
      seen(u, cur.fv)
      hist.push(cur.phi)
      if (hist.length > STALL_WINDOW) {
        const old = hist[hist.length - 1 - STALL_WINDOW] as number
        if (old - cur.phi < STALL_REL * Math.max(1, Math.abs(cur.phi))) {
          reason = "stalled"
          break
        }
      }
    }
    lastReason = reason
    // multiplier update (method of multipliers on the same quadratic penalty): lam <- 2 mu max(0, c + lam / 2mu)
    const inactive = cur.s.every((v) => v === 0)
    if (m > 0) {
      for (let j = 0; j < m; j++) lam[j] = 2 * mu * (cur.s[j] as number)
    }
    if (
      !last &&
      reason === "converged" &&
      inactive &&
      lam.every((v) => v === 0) &&
      projectedGradientNorm(u, cur.grad as Float64Array) <= kktTol
    ) {
      // the constraints are not touched: more rounds change nothing
      break
    }
    if (iters >= maxIter && reason === "max_iter") break
  }

  // D4 feasibility restoration: bisect toward the best feasible iterate until every c_j <= 1e-9
  let out: Float64Array = u
  let status: OptStatus
  const ref = bestU as Float64Array | null
  if (isFeasible(out)) {
    status =
      lastReason === "converged"
        ? "converged"
        : lastReason === "stalled"
          ? "stalled"
          : "max_iter"
  } else if (ref === null) {
    status = "infeasible"
  } else {
    let lo = 0
    let hi = 1
    for (let k = 0; k < 200 && hi - lo > 1e-16; k++) {
      const t = 0.5 * (lo + hi)
      const x = Float64Array.from(ref, (v, i) => v + t * ((u[i] as number) - v))
      if (isFeasible(x)) lo = t
      else hi = t
    }
    out = Float64Array.from(ref, (v, i) => v + lo * ((u[i] as number) - v))
    status =
      lastReason === "converged"
        ? "converged"
        : lastReason === "stalled"
          ? "stalled"
          : "max_iter"
  }
  let fOut = f(out)
  // FR-3: never return a point worse than the best feasible one seen (the start when it was feasible)
  if (status !== "infeasible" && ref !== null && bestF < fOut) {
    out = Float64Array.from(ref)
    fOut = bestF
  }
  const fin = evalMerit(out, true)
  return {
    u: out,
    f: fOut,
    iters,
    kkt: projectedGradientNorm(out, fin.grad as Float64Array),
    status,
    trace,
    rounds,
    maxViolation: viol(out),
  }
}

/** Eigenvalues of a symmetric matrix by cyclic Jacobi rotations (ascending). */
export function symmetricEigenvalues(a: readonly Float64Array[]): number[] {
  const n = a.length
  const A = a.map((r) => Float64Array.from(r))
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        off += ((A[i] as Float64Array)[j] as number) ** 2
    if (off < 1e-30) break
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = (A[p] as Float64Array)[q] as number
        if (apq === 0) continue
        const theta =
          (((A[q] as Float64Array)[q] as number) -
            ((A[p] as Float64Array)[p] as number)) /
          (2 * apq)
        const t =
          Math.sign(theta || 1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = (A[k] as Float64Array)[p] as number
          const akq = (A[k] as Float64Array)[q] as number
          ;(A[k] as Float64Array)[p] = c * akp - s * akq
          ;(A[k] as Float64Array)[q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = (A[p] as Float64Array)[k] as number
          const aqk = (A[q] as Float64Array)[k] as number
          ;(A[p] as Float64Array)[k] = c * apk - s * aqk
          ;(A[q] as Float64Array)[k] = s * apk + c * aqk
        }
      }
  }
  return A.map((r, i) => r[i] as number).sort((x, y) => x - y)
}

/**
 * H7 second-order check: smallest eigenvalue of the Hessian restricted to the variables not on a bound. A stationary point
 * with minEig < -tol is a saddle (or maximum) and must be reported as such, not as an optimum.
 */
export function secondOrderCheck(
  f: Fn,
  u: Float64Array,
  h: readonly number[],
  tol: number,
): { minEig: number; saddle: boolean } {
  const H = hessian(f, u, h)
  const free: number[] = []
  for (let i = 0; i < u.length; i++)
    if ((u[i] as number) > 1e-9 && (u[i] as number) < 1 - 1e-9) free.push(i)
  if (free.length === 0) return { minEig: 0, saddle: false }
  const sub = free.map((i) =>
    Float64Array.from(free.map((j) => (H[i] as Float64Array)[j] as number)),
  )
  const minEig = symmetricEigenvalues(sub)[0] as number
  return { minEig, saddle: minEig < -tol }
}
