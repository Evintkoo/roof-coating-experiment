// Rays and arrows of the day player (plan 07 Q6, D5, H10): every number is a model output, none is invented. At time t of a
// scenario with peak irradiance G the incident flux is G(t) = G * max(0, sin(pi (t - 6) / 12)); the reflected flux is G(t) r_solar,
// the absorbed flux G(t) (1 - r_solar), and the conducted flux (T_surface(t) - T_inside) / R_total from the solved series.

export type FluxModel = {
  gPeak: number
  rSolar: number
  tInsideK: number
  rTotal: number
  /** The solved surface temperature series (K), nodes at i / 6 h. */
  tSurfaceK: ArrayLike<number>
}
export type Flux = {
  incident: number
  reflected: number
  absorbed: number
  conducted: number
}
export const FLUX_KEYS = [
  "incident",
  "reflected",
  "absorbed",
  "conducted",
] as const
export type FluxKey = (typeof FLUX_KEYS)[number]

/** Incident irradiance (W/m2) at hour tH: the same half sine as the thermal model. */
export function irradianceAt(tH: number, gPeak: number): number {
  const s = Math.sin((Math.PI * (tH - 6)) / 12)
  return gPeak * Math.max(0, s)
}

function surfaceAt(v: ArrayLike<number>, tH: number): number {
  const n = v.length
  if (n === 0) return Number.NaN
  const x = Math.min(n - 1, Math.max(0, tH * 6))
  const i = Math.floor(x)
  const j = Math.min(n - 1, i + 1)
  return (v[i] as number) + ((v[j] as number) - (v[i] as number)) * (x - i)
}

export function fluxAt(tH: number, m: FluxModel): Flux {
  const g = irradianceAt(tH, m.gPeak)
  return {
    incident: g,
    reflected: g * m.rSolar,
    absorbed: g * (1 - m.rSolar),
    conducted: (surfaceAt(m.tSurfaceK, tH) - m.tInsideK) / m.rTotal,
  }
}

/** Reference value each arrow is scaled against: the day's maximum magnitude of that flux (so a full-length arrow is the day's peak). */
export function fluxRefs(m: FluxModel): Flux {
  const peak = { incident: 0, reflected: 0, absorbed: 0, conducted: 0 }
  for (let k = 0; k <= 144; k++) {
    const f = fluxAt(k / 6, m)
    for (const key of FLUX_KEYS)
      peak[key] = Math.max(peak[key], Math.abs(f[key]))
  }
  return peak
}

/** Signed arrow length in px: `lMax * w / wRef`, so a negative flux points the other way. */
export function arrowLength(w: number, wRef: number, lMax: number): number {
  if (!Number.isFinite(w) || !(wRef > 0)) return 0
  return (lMax * w) / wRef
}
