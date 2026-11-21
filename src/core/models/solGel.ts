import type { Materials } from "../config"
import { PhysicsRangeError } from "../errors"
import { emitEvent } from "../events"
import { requireIn } from "./ranges"

const BIG = Number.MAX_VALUE
const TINY = Number.MIN_VALUE
const MODEL = "solGel"
const PH_LO = 3.5
const PH_HI = 5.0
const X_LO = 0.2
const X_HI = 0.8
const BISECT_ITERS = 80

/** Weight-average functionality f_w = (f_T^2 (1-x) + f_O^2 x) / (f_T (1-x) + f_O x); x = organo-silane mole fraction. */
export function weightAverageFunctionality(
  xOrgano: number,
  fOrgano = 3,
  fTeos = 4,
): number {
  requireIn("weightAverageFunctionality", "xOrgano", xOrgano, 0, 1)
  requireIn("weightAverageFunctionality", "fOrgano", fOrgano, 1, BIG)
  requireIn("weightAverageFunctionality", "fTeos", fTeos, 1, BIG)
  return (
    (fTeos * fTeos * (1 - xOrgano) + fOrgano * fOrgano * xOrgano) /
    (fTeos * (1 - xOrgano) + fOrgano * xOrgano)
  )
}

/** Flory-Stockmayer gel-point conversion p_c = 1/(f_w - 1). */
export function gelPointConversion(fW: number): number {
  requireIn("gelPointConversion", "fW", fW, 2 + 1e-9, BIG)
  return 1 / (fW - 1)
}

export type SolResult = { h_end: number; c_end: number; gel_time_s: number }

/** u + expm1(-u) = u - (1 - e^-u) without cancellation for small u. */
function uMinusOneMinusExp(u: number): number {
  if (u > 0.5) return u + Math.expm1(-u)
  let term = (u * u) / 2 // u^n / n!, n = 2
  let sum = 0
  for (let n = 2; n < 40; n++) {
    sum += n % 2 === 0 ? term : -term
    term *= u / (n + 1)
  }
  return sum
}

function cap(waterRatio: number): number {
  return Math.min(1, waterRatio)
}

function checkKinetics(model: string, tS: number, kH: number, w: number): void {
  requireIn(model, "tS", tS, 0, BIG)
  requireIn(model, "kH", kH, TINY, BIG)
  requireIn(model, "waterRatio", w, TINY, BIG)
}

/** D4 hydrolysis: h(t) = min(1 - e^(-k_h t), min(1, r_w)). kH here is the effective k_h in 1/s. */
export function hydrolysis(tS: number, kH: number, waterRatio: number): number {
  checkKinetics("hydrolysis", tS, kH, waterRatio)
  return Math.min(-Math.expm1(-kH * tS), cap(waterRatio))
}

/** I(t) = integral of h over [0, t], closed form (D4). */
function integralH(tS: number, kH: number, hCap: number): number {
  if (hCap >= 1) return uMinusOneMinusExp(kH * tS) / kH
  const tStar = -Math.log1p(-hCap) / kH
  if (tS <= tStar) return uMinusOneMinusExp(kH * tS) / kH
  return tStar - hCap / kH + hCap * (tS - tStar)
}

/** D4 condensation: c(t) = 1 - exp(-k_c I(t)). */
export function condensation(
  tS: number,
  kH: number,
  kC: number,
  waterRatio: number,
): number {
  checkKinetics("condensation", tS, kH, waterRatio)
  requireIn("condensation", "kC", kC, TINY, BIG)
  return -Math.expm1(-kC * integralH(tS, kH, cap(waterRatio)))
}

/**
 * Sol-gel state at tEndS and the gel time (bisection, 80 iterations) for gel at p = c*h >= p_c.
 * kHCoeff is k_H; k_h = k_H 10^(-pH). gel_time_s is Infinity when no gel forms inside [0, tEndS]
 * (then emits model.degenerate, reason gel_not_reached).
 */
export function simulateSol(
  ph: number,
  waterRatio: number,
  xOrgano: number,
  kHCoeff: number,
  kC: number,
  tEndS: number,
): SolResult {
  requireIn("simulateSol", "ph", ph, PH_LO, PH_HI)
  requireIn("simulateSol", "waterRatio", waterRatio, TINY, BIG)
  requireIn("simulateSol", "xOrgano", xOrgano, 0, 1)
  requireIn("simulateSol", "kHCoeff", kHCoeff, TINY, BIG)
  requireIn("simulateSol", "kC", kC, TINY, BIG)
  requireIn("simulateSol", "tEndS", tEndS, TINY, BIG)
  const kH = kHCoeff * 10 ** -ph
  const pC = gelPointConversion(weightAverageFunctionality(xOrgano))
  const hCap = cap(waterRatio)
  const p = (t: number) =>
    Math.min(-Math.expm1(-kH * t), hCap) *
    -Math.expm1(-kC * integralH(t, kH, hCap))
  const hEnd = Math.min(-Math.expm1(-kH * tEndS), hCap)
  const cEnd = -Math.expm1(-kC * integralH(tEndS, kH, hCap))
  let gel = Number.POSITIVE_INFINITY
  if (p(tEndS) >= pC) {
    let lo = 0
    let hi = tEndS
    for (let i = 0; i < BISECT_ITERS; i++) {
      const mid = 0.5 * (lo + hi)
      if (p(mid) >= pC) hi = mid
      else lo = mid
    }
    gel = hi
  } else {
    emitEvent("model.degenerate", "warn", {
      model: MODEL,
      reason: "gel_not_reached",
    })
  }
  return { h_end: hEnd, c_end: cEnd, gel_time_s: gel }
}

/**
 * Gel time relative to the reference condition ref = [pH, water ratio, organo fraction]:
 * t_gel(ph, w, x) / t_gel(ref). PROXY (D4): no dependence on the water ratio for r_w >= 1.
 * A candidate that never gels gives Infinity; a reference that never gels throws PhysicsRangeError (code 4).
 * waterRatio < 1 is accepted deliberately (cap tests); only > 0 is required.
 */
export function gelTimeRel(
  ph: number,
  waterRatio: number,
  xOrgano: number,
  mat: Materials,
  ref: readonly [number, number, number],
): number {
  requireIn("gelTimeRel", "xOrgano", xOrgano, X_LO, X_HI)
  requireIn("gelTimeRel", "ref.xOrgano", ref[2], X_LO, X_HI)
  const { k_h, k_c, t_end_s } = mat.sol_gel
  const r = simulateSol(
    ref[0],
    ref[1],
    ref[2],
    k_h.value,
    k_c.value,
    t_end_s.value,
  )
  if (r.gel_time_s === Number.POSITIVE_INFINITY) {
    throw new PhysicsRangeError(
      "ref",
      "gelTimeRel: reference condition does not gel within t_end_s",
    )
  }
  const t = simulateSol(
    ph,
    waterRatio,
    xOrgano,
    k_h.value,
    k_c.value,
    t_end_s.value,
  )
  return t.gel_time_s / r.gel_time_s
}
