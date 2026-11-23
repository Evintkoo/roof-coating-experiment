// Plan 09 Layer B: the spectral view. R(lambda) of the stack (LiveResult.spectrum.nominal) and the ASTM G173 irradiance cut into UV,
// visible and NIR bands: per band the share of sunlight and the reflected fraction. The weighted sum equals solarWeighted (every
// trapezoid segment of the G173 grid belongs to exactly one band, by its midpoint), so it equals the nominal r_solar. The ray counts
// are quotas of these numbers; nothing here draws a random number. There is no scattering function on purpose (plan 09 Q3).
import { SpandekError } from "../errors"
import type { Spectrum } from "../literature"
import { requireArrayIn } from "../models/ranges"

/** F2: a typed error, code 4, phase "physics". */
export class BandsError extends SpandekError {
  constructor(message: string) {
    super(4, "physics", "spectrum", message)
  }
}

export type BandId = "uv" | "visible" | "nir"
export const BAND_IDS: readonly BandId[] = ["uv", "visible", "nir"]
const EDGES = { uv: [0.3, 0.4], visible: [0.4, 0.7], nir: [0.7, 4.0] } as const
export type Band = {
  id: BandId
  lo_um: number
  hi_um: number
  /** Share of the G173 irradiance in this band (sums to 1). */
  share: number
  /** Irradiance-weighted reflectance of the band. */
  reflected: number
}

export function bandSplit(
  wlUm: Float64Array,
  r: Float64Array,
  g173: Spectrum,
): Band[] {
  if (wlUm.length === 0 || wlUm.length !== r.length)
    throw new BandsError("wavelength and reflectance grids differ")
  requireArrayIn("bands", "r", r, 0, 1)
  const gw = g173.wl_um
  const ge = g173.irradiance_w_m2_um
  const m = wlUm.length
  const num = [0, 0, 0]
  const den = [0, 0, 0]
  let j = 0
  let pw = 0
  let pe = 0
  let pr = 0
  for (let i = 0; i < gw.length; i++) {
    const w = gw[i] as number
    const e = ge[i] as number
    while (j < m - 1 && (wlUm[j + 1] as number) <= w) j++
    let ri: number
    if (w <= (wlUm[0] as number)) ri = r[0] as number
    else if (w >= (wlUm[m - 1] as number)) ri = r[m - 1] as number
    else {
      const w0 = wlUm[j] as number
      ri =
        (r[j] as number) +
        ((w - w0) / ((wlUm[j + 1] as number) - w0)) *
          ((r[j + 1] as number) - (r[j] as number))
    }
    if (i > 0) {
      const mid = 0.5 * (w + pw)
      const b = mid < EDGES.uv[1] ? 0 : mid < EDGES.visible[1] ? 1 : 2
      const dw = w - pw
      num[b] = (num[b] as number) + 0.5 * (e * ri + pe * pr) * dw
      den[b] = (den[b] as number) + 0.5 * (e + pe) * dw
    }
    pw = w
    pe = e
    pr = ri
  }
  const total = (den[0] as number) + (den[1] as number) + (den[2] as number)
  if (!(total > 0)) throw new BandsError("the G173 spectrum has no irradiance")
  return BAND_IDS.map((id, k) => ({
    id,
    lo_um: id === "uv" ? Math.min(EDGES.uv[0], gw[0] as number) : EDGES[id][0],
    hi_um: EDGES[id][1],
    share: (den[k] as number) / total,
    reflected:
      (den[k] as number) > 0 ? (num[k] as number) / (den[k] as number) : 0,
  }))
}

/** D7: of n rays of a band, round(n R) are reflected and the rest absorbed. */
export function rayQuota(
  b: Band,
  n: number,
): { reflected: number; absorbed: number } {
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  const r = Number.isFinite(b.reflected) ? b.reflected : 0
  const reflected = Math.min(count, Math.max(0, Math.round(count * r)))
  return { reflected, absorbed: count - reflected }
}

/** The low-discrepancy order: ray i of n is reflected iff it is a step of the Bresenham line of `reflected` marks, exactly `reflected` in all. */
export function isReflectedRay(
  i: number,
  n: number,
  reflected: number,
): boolean {
  if (n <= 0) return false
  return Math.floor(((i + 1) * reflected) / n) > Math.floor((i * reflected) / n)
}

/** Rays per band for n rays in all, proportional to the shares, largest remainder so the counts sum to n. */
export function allocateRays(bands: readonly Band[], n: number): number[] {
  const total = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  const exact = bands.map((b) => b.share * total)
  const out = exact.map(Math.floor)
  let left = total - out.reduce((s, x) => s + x, 0)
  const order = exact
    .map((x, i) => ({ i, f: x - Math.floor(x) }))
    .sort((a, b) => b.f - a.f || a.i - b.i)
  for (
    let k = 0;
    left > 0 && order.length > 0;
    k = (k + 1) % order.length, left--
  )
    out[(order[k] as { i: number }).i] =
      (out[(order[k] as { i: number }).i] as number) + 1
  return out
}
