/**
 * Finite-difference gradients and Hessians in scaled coordinates (plan 05 FR-1, D1, D5). Every variable lives in [0, 1];
 * no evaluation is ever made outside that box. `h[i]` is the step of variable i (VARS[i].h in the pipeline).
 */

type Fn = (u: Float64Array) => number

function checkDims(u: Float64Array, h: readonly number[]): void {
  if (u.length !== h.length)
    throw new RangeError(`u has ${u.length} entries, h has ${h.length}`)
  for (let i = 0; i < h.length; i++) {
    const hi = h[i] as number
    if (!(hi > 0 && hi < 0.5))
      throw new RangeError(`step h[${i}] = ${hi} must be in (0, 0.5)`)
    const ui = u[i] as number
    if (!(ui >= 0 && ui <= 1))
      throw new RangeError(`u[${i}] = ${ui} is outside the scaled box [0, 1]`)
  }
}

/** f at u with coordinate i moved by delta (u is restored before returning). */
function at(f: Fn, u: Float64Array, i: number, delta: number): number {
  const old = u[i] as number
  u[i] = old + delta
  const v = f(u)
  u[i] = old
  return v
}

/**
 * dF/du_i: central difference (f(u+h) - f(u-h)) / 2h where both neighbours are inside [0, 1]; otherwise the one-sided
 * second-order formula (-3 f0 + 4 f1 - f2) / 2h (forward at the lower bound, mirrored backward at the upper bound).
 * The work vector is a copy, `u` is never modified.
 */
export function gradient(
  f: Fn,
  u: Float64Array,
  h: readonly number[],
): Float64Array {
  checkDims(u, h)
  const w = Float64Array.from(u)
  const g = new Float64Array(u.length)
  let f0 = Number.NaN
  for (let i = 0; i < u.length; i++) {
    const hi = h[i] as number
    const ui = u[i] as number
    if (ui - hi >= 0 && ui + hi <= 1) {
      g[i] = (at(f, w, i, hi) - at(f, w, i, -hi)) / (2 * hi)
      continue
    }
    if (Number.isNaN(f0)) f0 = f(w)
    if (ui - hi < 0) {
      if (ui + 2 * hi > 1)
        throw new RangeError(`step h[${i}] = ${hi} does not fit in the box`)
      g[i] = (-3 * f0 + 4 * at(f, w, i, hi) - at(f, w, i, 2 * hi)) / (2 * hi)
    } else {
      if (ui - 2 * hi < 0)
        throw new RangeError(`step h[${i}] = ${hi} does not fit in the box`)
      g[i] = (3 * f0 - 4 * at(f, w, i, -hi) + at(f, w, i, -2 * hi)) / (2 * hi)
    }
  }
  return g
}

/**
 * Hessian by central second differences with the same steps: (f(+h) - 2 f0 + f(-h)) / h^2 on the diagonal and the four
 * point mixed difference off it. The stencil centre is clamped into [h_i, 1 - h_i] so no point leaves the box (at a bound
 * the result is the Hessian at the clamped centre, O(h) away). Exactly symmetric by construction.
 */
export function hessian(
  f: Fn,
  u: Float64Array,
  h: readonly number[],
): Float64Array[] {
  checkDims(u, h)
  const n = u.length
  const c = Float64Array.from(u)
  for (let i = 0; i < n; i++) {
    const hi = h[i] as number
    if (2 * hi > 1) throw new RangeError(`step h[${i}] does not fit in the box`)
    c[i] = Math.min(Math.max(c[i] as number, hi), 1 - hi)
  }
  const H = Array.from({ length: n }, () => new Float64Array(n))
  const f0 = f(c)
  const w = Float64Array.from(c)
  for (let i = 0; i < n; i++) {
    const hi = h[i] as number
    ;(H[i] as Float64Array)[i] =
      (at(f, w, i, hi) - 2 * f0 + at(f, w, i, -hi)) / (hi * hi)
    for (let j = i + 1; j < n; j++) {
      const hj = h[j] as number
      const pp = (s: number, t: number) => {
        const oi = w[i] as number
        const oj = w[j] as number
        w[i] = oi + s * hi
        w[j] = oj + t * hj
        const v = f(w)
        w[i] = oi
        w[j] = oj
        return v
      }
      const v = (pp(1, 1) - pp(1, -1) - pp(-1, 1) + pp(-1, -1)) / (4 * hi * hj)
      ;(H[i] as Float64Array)[j] = v
      ;(H[j] as Float64Array)[i] = v
    }
  }
  return H
}

/**
 * D1 Richardson check per variable: |G(h) - G(h/2)| / max(|G(h/2)|, 1e-3 max_k |G_k(h/2)|), the floor keeping a
 * variable with a (near) zero gradient from dividing by zero (docs/spike-refine.md Q1). 0 when the whole gradient is 0.
 */
export function richardsonCheck(
  f: Fn,
  u: Float64Array,
  h: readonly number[],
): number[] {
  const g1 = gradient(f, u, h)
  const g2 = gradient(
    f,
    u,
    h.map((x) => x / 2),
  )
  let big = 0
  for (const v of g2) big = Math.max(big, Math.abs(v))
  const floor = 1e-3 * big
  return Array.from(g1, (v, i) => {
    const d = Math.abs(v - (g2[i] as number))
    const den = Math.max(Math.abs(g2[i] as number), floor)
    return den > 0 ? d / den : 0
  })
}
