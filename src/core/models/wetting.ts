import type { Materials } from "../config"
import { requireIn } from "./ranges"

const DEG = Math.PI / 180
const clampCos = (c: number): number => Math.min(1, Math.max(-1, c))
const acosDeg = (c: number): number => Math.acos(clampCos(c)) / DEG
const clip01 = (x: number): number => Math.min(1, Math.max(0, x))

/** Score: 0 at 90 deg and below, 1 at 150 deg and above; higher = more hydrophobic. */
const score = (thetaDeg: number): number => clip01((thetaDeg - 90) / 60)

/** Young angle of a silica/MTES mixed film: linear in the MTES fraction y (plan 02 D6). */
export function youngAngleDeg(
  yMtes: number,
  thetaSilicaDeg: number,
  thetaMtesDeg: number,
): number {
  requireIn("wetting", "yMtes", yMtes, 0, 1)
  requireIn("wetting", "thetaSilicaDeg", thetaSilicaDeg, 0, 180)
  requireIn("wetting", "thetaMtesDeg", thetaMtesDeg, 0, 180)
  return thetaSilicaDeg + (thetaMtesDeg - thetaSilicaDeg) * yMtes
}

/** Wenzel: cos(theta*) = r cos(theta_Y), cos clamped to [-1, 1]; r >= 1. */
export function wenzelAngleDeg(thetaYDeg: number, r: number): number {
  requireIn("wetting", "thetaYDeg", thetaYDeg, 0, 180)
  requireIn("wetting", "r", r, 1, Number.MAX_VALUE)
  return acosDeg(r * Math.cos(thetaYDeg * DEG))
}

/** Cassie-Baxter (flat solid fraction f, air elsewhere): cos(theta*) = f (cos(theta_Y) + 1) - 1. f = 0 gives 180 deg exactly. */
export function cassieBaxterAngleDeg(
  thetaYDeg: number,
  fSolid: number,
): number {
  requireIn("wetting", "thetaYDeg", thetaYDeg, 0, 180)
  requireIn("wetting", "fSolid", fSolid, 0, 1)
  return acosDeg(fSolid * (Math.cos(thetaYDeg * DEG) + 1) - 1)
}

export type WettingResult = {
  theta_pred: number
  theta_lo: number
  theta_hi: number
  score: number
  score_lo: number
  score_hi: number
}

/** Nominal = Young angle (smooth film); interval = extremes over the corners r in [1, r_max], f in [f_min, 1]. */
function result(thetaY: number, mat: Materials): WettingResult {
  const candidates = [
    thetaY,
    wenzelAngleDeg(thetaY, mat.wetting.r_max.value),
    cassieBaxterAngleDeg(thetaY, mat.wetting.f_solid_min.value),
  ]
  const lo = Math.min(...candidates)
  const hi = Math.max(...candidates)
  return {
    theta_pred: thetaY,
    theta_lo: lo,
    theta_hi: hi,
    score: score(thetaY),
    score_lo: score(lo),
    score_hi: score(hi),
  }
}

export function wetting(yMtes: number, mat: Materials): WettingResult {
  return result(
    youngAngleDeg(
      yMtes,
      mat.wetting.theta_silica_deg.value,
      mat.wetting.theta_mtes_deg.value,
    ),
    mat,
  )
}

/** No topcoat: Young angle is the binder angle, same corner interval. */
export function wettingBinder(mat: Materials): WettingResult {
  return result(mat.wetting.theta_binder_deg.value, mat)
}
