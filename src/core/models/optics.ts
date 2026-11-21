import type { Materials } from "../config"
import { DataError } from "../errors"
import { emitEvent } from "../events"
import { type NKTable, nkAt, type Spectrum } from "../literature"
import { type MieResult, mieEfficiencies } from "./mie"
import { requireArrayIn, requireIn } from "./ranges"

/** Optics wavelength window (um): the project grid is the TiO2 table grid inside it. */
export const OPTICS_WL_MIN_UM = 0.3
export const OPTICS_WL_MAX_UM = 2.5

/** Domain limits (plan 02 D9). The PVC guard is wider than the plan-1 sweep (0.10-0.35): CPVC 0.45 plus headroom. */
const PVC_MAX = 0.6
const MID_DFT_MIN_UM = 100
const MID_DFT_MAX_UM = 300
/** Topcoat 3-20 um (blueprint 3.3); 0 is allowed so "no topcoat" is the identity. */
const TOP_DFT_MAX_UM = 20
const MU_MAX = 10

export type KmClosure = "eddington" | "hemispheric"

/** Optics grid: the TiO2 table wavelengths inside 0.3-2.5 um (Mie is evaluated only at these). */
export function opticsGrid(tio2: NKTable): Float64Array {
  return tio2.wl_um.filter(
    (w) => w >= OPTICS_WL_MIN_UM && w <= OPTICS_WL_MAX_UM,
  )
}

// ---- Mie cache: Map keyed on the numeric tuple (n, k, d, wl, nMedium), one entry per wavelength ----
const CACHE_MAX = 4096
type MieOne = { q_sca: number; q_abs: number; g: number }
const mieCache = new Map<string, MieOne>()
let hits = 0
let misses = 0

export function resetMieCache(): void {
  mieCache.clear()
  hits = 0
  misses = 0
}

/** Mie of one pigment at the grid wavelengths, with (n, k) given per wavelength; cached per tuple. */
function mieOnGrid(
  n: Float64Array,
  k: Float64Array,
  dUm: number,
  wlUm: Float64Array,
  nMedium: number,
): MieResult {
  const len = wlUm.length
  const res: MieResult = {
    q_sca: new Float64Array(len),
    q_abs: new Float64Array(len),
    g: new Float64Array(len),
  }
  for (let i = 0; i < len; i++) {
    const wl = wlUm[i] as number
    const key = `${n[i]},${k[i]},${dUm},${wl},${nMedium}`
    let v = mieCache.get(key)
    if (v) hits++
    else {
      misses++
      const r = mieEfficiencies(
        n[i] as number,
        k[i] as number,
        dUm,
        Float64Array.of(wl),
        nMedium,
      )
      v = {
        q_sca: r.q_sca[0] as number,
        q_abs: r.q_abs[0] as number,
        g: r.g[0] as number,
      }
      if (mieCache.size >= CACHE_MAX)
        mieCache.delete(mieCache.keys().next().value as string)
      mieCache.set(key, v)
    }
    res.q_sca[i] = v.q_sca
    res.q_abs[i] = v.q_abs
    res.g[i] = v.g
  }
  return res
}

/** Width of the C1 transition of the S >= 0 clamp, relative to the scattering part 3/4 (1-g) sigma_s of S (plan 05 spike Q3). */
export const S_CLAMP_SMOOTH_REL = 1e-3

/**
 * C1 replacement of max(0, s): 0 for s <= 0, s for s >= eps, and the cubic 2 s^2/eps - s^3/eps^2 between
 * (value and slope match at both ends). The plain clamp has a slope jump where S crosses 0, which made the
 * solar reflectance non-differentiable in the pigment grade sizes (plan 05 spike Q3). The change is confined to
 * 0 < s < eps with eps = S_CLAMP_SMOOTH_REL x the scattering part of S.
 */
export function smoothClampS(s: number, scale: number): number {
  const eps = S_CLAMP_SMOOTH_REL * scale
  if (s <= 0) return 0
  if (!(eps > 0) || s >= eps) return s
  const t = s / eps
  return eps * t * t * (2 - t)
}

/**
 * Per-length KM coefficients (1/um) of independent-scattering pigment layers (plan 02 D2, spike Q1, ruling R1).
 * sigma_s = 1.5*phi*Q_sca/d, sigma_a = 1.5*phi*Q_abs/d (phi = volume fraction of total solids), summed over
 * pigments; K = 2*sigma_a; Eddington S = 3/4*(1-g)*sigma_s - sigma_a/4 (hemispheric: S = (1-g)*sigma_s),
 * summed per pigment (equal to using the sigma_s-weighted mean g). S >= 0 is kept by the C1 smooth clamp
 * smoothClampS (a pure absorber gives 0): in the band 0 < S < S_CLAMP_SMOOTH_REL x the scattering part the cubic
 * eps*t^2*(2-t), t = S/eps, replaces S (shift at most 0.15 eps).
 * Known limits: independent scattering ignores dependent scattering at PVC up to 0.35; two-flux needs
 * an optically thick film; no size distribution.
 */
export function kmCoefficients(
  layers: readonly { mie: MieResult; dUm: number; phi: number }[],
  closure: KmClosure = "eddington",
): { s: Float64Array; k: Float64Array } {
  const len = layers[0]?.mie.q_sca.length ?? 0
  const s = new Float64Array(len)
  const k = new Float64Array(len)
  const sScale = new Float64Array(len)
  for (const l of layers) {
    requireIn("optics", "dUm", l.dUm, Number.MIN_VALUE, 1e4)
    requireIn("optics", "phi", l.phi, 0, 1)
    if (l.mie.q_sca.length !== len)
      throw new DataError("mie", "layers have different wavelength grids")
    const c = (1.5 * l.phi) / l.dUm
    for (let i = 0; i < len; i++) {
      const sigS = c * (l.mie.q_sca[i] as number)
      const sigA = c * (l.mie.q_abs[i] as number)
      const oneMinusG = 1 - (l.mie.g[i] as number)
      k[i] = (k[i] as number) + 2 * sigA
      sScale[i] = (sScale[i] as number) + 0.75 * oneMinusG * sigS
      s[i] =
        (s[i] as number) +
        (closure === "eddington"
          ? 0.75 * oneMinusG * sigS - sigA / 4
          : oneMinusG * sigS)
    }
  }
  for (let i = 0; i < len; i++)
    s[i] = smoothClampS(s[i] as number, sScale[i] as number)
  return { s, k }
}

/**
 * Kubelka (1948) film on a flat-spectrum ground: a = 1 + K/S, b = sqrt(a^2 - 1),
 * R = (1 - Rg (a - b coth(bSX))) / (a - Rg + b coth(bSX)). K = 0: b coth(bSX) -> 1/(SX);
 * S = 0: a pure absorber, R = Rg exp(-2 K X); S = K = 0 or X = 0: R = Rg.
 */
export function kmLayerReflectance(
  s: Float64Array,
  k: Float64Array,
  dftUm: number,
  rGround: number,
): Float64Array {
  requireIn("optics", "dftUm", dftUm, 0, 1e4)
  requireIn("optics", "rGround", rGround, 0, 1)
  requireArrayIn("optics", "s", s, 0, Number.MAX_VALUE)
  requireArrayIn("optics", "k", k, 0, Number.MAX_VALUE)
  if (s.length !== k.length)
    throw new DataError("km", "s and k have different lengths")
  const out = new Float64Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const si = s[i] as number
    const ki = k[i] as number
    if (dftUm === 0 || (si === 0 && ki === 0)) {
      out[i] = rGround
    } else if (si === 0) {
      out[i] = rGround * Math.exp(-2 * ki * dftUm)
    } else {
      const a = 1 + ki / si
      const b = Math.sqrt(ki * (ki + 2 * si)) / si
      const sx = si * dftUm
      const t = b * sx
      // b*coth(b*S*X); series below t = 1e-4 avoids 0/0 at K = 0 (error O(t^4) relative).
      const bc = t < 1e-4 ? 1 / sx + (b * b * sx) / 3 : b / Math.tanh(t)
      out[i] = (1 - rGround * (a - bc)) / (a - rGround + bc)
    }
  }
  return out
}

/**
 * Irradiance-weighted mean reflectance over the whole G173 range: r is interpolated linearly onto the
 * G173 wavelengths and held at its first/last value outside its grid (so R beyond 2.5 um is held
 * constant to 4 um: a documented bias, R_solar high). Trapezoid; flat r = c returns c exactly.
 */
export function solarWeighted(
  wlUm: Float64Array,
  r: Float64Array,
  g173: Spectrum,
): number {
  if (wlUm.length === 0 || wlUm.length !== r.length)
    throw new DataError("optics", "wavelength and reflectance grids differ")
  requireArrayIn("optics", "r", r, 0, 1)
  const gw = g173.wl_um
  const ge = g173.irradiance_w_m2_um
  const m = wlUm.length
  let j = 0
  let num = 0
  let den = 0
  let prevW = 0
  let prevE = 0
  let prevR = 0
  for (let i = 0; i < gw.length; i++) {
    const w = gw[i] as number
    const e = ge[i] as number
    while (j < m - 1 && (wlUm[j + 1] as number) <= w) j++
    let ri: number
    if (w <= (wlUm[0] as number)) ri = r[0] as number
    else if (w >= (wlUm[m - 1] as number)) ri = r[m - 1] as number
    else {
      const w0 = wlUm[j] as number
      const f = (w - w0) / ((wlUm[j + 1] as number) - w0)
      ri = (r[j] as number) + f * ((r[j + 1] as number) - (r[j] as number))
    }
    if (i > 0) {
      const dw = w - prevW
      num += 0.5 * (e * ri + prevE * prevR) * dw
      den += 0.5 * (e + prevE) * dw
    }
    prevW = w
    prevE = e
    prevR = ri
  }
  return num / den
}

function checkTable(name: string, t: NKTable): void {
  const ok = (a: unknown): a is Float64Array => a instanceof Float64Array
  if (
    !ok(t?.wl_um) ||
    !ok(t.n) ||
    !ok(t.k) ||
    t.n.length !== t.wl_um.length ||
    t.k.length !== t.wl_um.length
  )
    throw new DataError(
      name,
      "n,k table needs wl_um, n and k columns of equal length",
    )
}

/**
 * Midcoat reflectance spectrum on wlUm. Volume fractions of total solids: phi_TiO2 = pvc*tio2Fraction,
 * phi_BaSO4 = pvc*(1 - tio2Fraction); the binder (n = materials binder.n) is the host medium.
 * pvc = 0 gives the binder-only film: no scatterers or absorbers, transparent, R = r_ground everywhere.
 * Ground is the substrate: flat r_ground = substrate.r_solar.
 */
export function midcoatSpectrum(
  pvc: number,
  tio2Fraction: number,
  dftUm: number,
  mat: Materials,
  tio2: NKTable,
  baso4: NKTable,
  wlUm: Float64Array,
  closure: KmClosure = "eddington",
): Float64Array {
  requireIn("optics", "pvc", pvc, 0, PVC_MAX)
  requireIn("optics", "tio2Fraction", tio2Fraction, 0, 1)
  requireIn("optics", "midcoatDftUm", dftUm, MID_DFT_MIN_UM, MID_DFT_MAX_UM)
  checkTable("tio2", tio2)
  checkTable("baso4", baso4)
  requireArrayIn("optics", "wlUm", wlUm, OPTICS_WL_MIN_UM, OPTICS_WL_MAX_UM)
  const nMed = mat.binder.n.value
  const layers: { mie: MieResult; dUm: number; phi: number }[] = []
  const add = (nk: NKTable, dUm: number, phi: number) => {
    if (phi <= 0) return
    const { n, k } = nkAt(nk, wlUm)
    layers.push({ mie: mieOnGrid(n, k, dUm, wlUm, nMed), dUm, phi })
  }
  add(tio2, mat.tio2.diameter_um.value, pvc * tio2Fraction)
  add(baso4, mat.baso4.diameter_um.value, pvc * (1 - tio2Fraction))
  emitEvent("mie.cache_stats", "debug", { hits, misses })
  const { s, k } =
    layers.length === 0
      ? { s: new Float64Array(wlUm.length), k: new Float64Array(wlUm.length) }
      : kmCoefficients(layers, closure)
  return kmLayerReflectance(s, k, dftUm, mat.substrate.r_solar.value)
}

/** D3: topcoat Beer-Lambert over the midcoat, two passes: R_eff = R_mid * exp(-2*mu*DFT). */
export function applyTopcoat(
  rMid: Float64Array,
  dftUm: number,
  muPerUm: number,
): Float64Array {
  requireIn("optics", "topcoatDftUm", dftUm, 0, TOP_DFT_MAX_UM)
  requireIn("optics", "muPerUm", muPerUm, 0, MU_MAX)
  requireArrayIn("optics", "rMid", rMid, 0, 1)
  const att = Math.exp(-2 * muPerUm * dftUm)
  return rMid.map((r) => r * att)
}

/** Solar-weighted reflectance of a stack spectrum (same weighting as solarWeighted). */
export function rSolarStack(
  r: Float64Array,
  wlUm: Float64Array,
  g173: Spectrum,
): number {
  return solarWeighted(wlUm, r, g173)
}
