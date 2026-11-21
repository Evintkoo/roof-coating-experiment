import { requireArrayIn, requireIn } from "./ranges"

export type MieResult = {
  q_sca: Float64Array
  q_abs: Float64Array
  g: Float64Array
}

const X_MIN = 1e-3
const X_MAX = 2e4

/**
 * Mie efficiencies of a homogeneous sphere (Bohren & Huffman, "Absorption and Scattering of Light
 * by Small Particles", section 4.4 and the bhmie program of Appendix A), pure real/imag arithmetic.
 *
 * Convention: relative index m = (n + i*k)/n_medium with k >= 0 (BH, exp(-i*omega*t));
 * x = pi * d * n_medium / lambda, where dUm is the sphere DIAMETER in um and wlUm is the vacuum
 * wavelength in um. a_n, b_n use downward recurrence for D_n starting at
 * nmx = max(nmax, ceil(1.1*|m*x|)) + 15, nmax = floor(x + 4*x^(1/3) + 2).
 * g is the asymmetry sum of section 4.4 divided by Q_sca.
 */
export function mieEfficiencies(
  n: number,
  k: number,
  dUm: number,
  wlUm: Float64Array,
  nMedium: number,
): MieResult {
  requireIn("mie", "n", n, 1, 100)
  requireIn("mie", "k", k, 0, 100)
  requireIn("mie", "dUm", dUm, Number.MIN_VALUE, 1e4)
  requireIn("mie", "nMedium", nMedium, 1, 10)
  requireArrayIn("mie", "wlUm", wlUm, 1e-3, 1e4)
  const len = wlUm.length
  const qSca = new Float64Array(len)
  const qAbs = new Float64Array(len)
  const g = new Float64Array(len)
  const mr = n / nMedium
  const mi = k / nMedium
  const mAbs = Math.hypot(mr, mi)
  let dRe = new Float64Array(0)
  let dIm = new Float64Array(0)
  for (let w = 0; w < len; w++) {
    const x = (Math.PI * dUm * nMedium) / (wlUm[w] as number)
    // g = sums / Q_sca ~ x^-4 * (cancelling terms): garbage below x ~ 1e-3 (NaN at x = 0)
    requireIn("mie", "x", x, X_MIN, X_MAX)
    const nmax = Math.floor(x + 4 * x ** (1 / 3) + 2)
    const nmx = Math.max(nmax, Math.ceil(1.1 * mAbs * x)) + 15
    if (dRe.length < nmx + 1) {
      dRe = new Float64Array(nmx + 1)
      dIm = new Float64Array(nmx + 1)
    }
    // Downward recurrence D_{j-1} = j/y - 1/(D_j + j/y), y = m*x, D_nmx = 0.
    const yr = mr * x
    const yi = mi * x
    const y2 = yr * yr + yi * yi
    dRe[nmx] = 0
    dIm[nmx] = 0
    for (let j = nmx; j >= 1; j--) {
      const jr = (j * yr) / y2 // j/y = j*(yr - i*yi)/|y|^2
      const ji = (-j * yi) / y2
      const sr = (dRe[j] as number) + jr
      const si = (dIm[j] as number) + ji
      const s2 = sr * sr + si * si
      dRe[j - 1] = jr - sr / s2
      dIm[j - 1] = ji + si / s2
    }
    // Upward psi_n = x*j_n(x), chi_n = -x*y_n(x) (BH sign), xi_n = psi_n - i*chi_n.
    let psi0 = Math.cos(x)
    let psi1 = Math.sin(x)
    let chi0 = -Math.sin(x)
    let chi1 = Math.cos(x)
    let xi1r = psi1
    let xi1i = -chi1
    let qext = 0
    let qs = 0
    let gSum1 = 0
    let gSum2 = 0
    let anr = 0
    let ani = 0
    let bnr = 0
    let bni = 0
    for (let j = 1; j <= nmax; j++) {
      const fn = (2 * j + 1) / (j * (j + 1))
      const psi = ((2 * j - 1) / x) * psi1 - psi0
      const chi = ((2 * j - 1) / x) * chi1 - chi0
      const xir = psi
      const xii = -chi
      // a_n: coefficient A = D_n/m + n/x ; D/m = D*conj(m)/|m|^2
      const dr = dRe[j] as number
      const di = dIm[j] as number
      const m2 = mAbs * mAbs
      const dmr = (dr * mr + di * mi) / m2
      const dmi = (di * mr - dr * mi) / m2
      const ar = dmr + j / x
      const ai = dmi
      // a_n = (A psi_n - psi_{n-1}) / (A xi_n - xi_{n-1})
      const aNumR = ar * psi - psi1
      const aNumI = ai * psi
      const aDenR = ar * xir - ai * xii - xi1r
      const aDenI = ai * xir + ar * xii - xi1i
      const aDen2 = aDenR * aDenR + aDenI * aDenI
      const newAr = (aNumR * aDenR + aNumI * aDenI) / aDen2
      const newAi = (aNumI * aDenR - aNumR * aDenI) / aDen2
      // b_n: coefficient B = m*D_n + n/x
      const br = mr * dr - mi * di + j / x
      const bi = mr * di + mi * dr
      const bNumR = br * psi - psi1
      const bNumI = bi * psi
      const bDenR = br * xir - bi * xii - xi1r
      const bDenI = bi * xir + br * xii - xi1i
      const bDen2 = bDenR * bDenR + bDenI * bDenI
      const newBr = (bNumR * bDenR + bNumI * bDenI) / bDen2
      const newBi = (bNumI * bDenR - bNumR * bDenI) / bDen2

      const c = 2 * j + 1
      qext += c * (newAr + newBr)
      qs += c * (newAr * newAr + newAi * newAi + newBr * newBr + newBi * newBi)
      if (j > 1) {
        // pairs (n-1, n): n-1 = j-1
        const p = j - 1
        gSum1 +=
          ((p * (p + 2)) / (p + 1)) *
          (anr * newAr + ani * newAi + bnr * newBr + bni * newBi)
      }
      gSum2 += fn * (newAr * newBr + newAi * newBi)
      anr = newAr
      ani = newAi
      bnr = newBr
      bni = newBi
      psi0 = psi1
      psi1 = psi
      chi0 = chi1
      chi1 = chi
      xi1r = psi1
      xi1i = -chi1
    }
    const x2 = x * x
    const sca = (2 / x2) * qs
    const ext = (2 / x2) * qext
    qSca[w] = sca
    // clamp: at k = 0, ext - sca is a difference of equal sums and can be -1e-13
    qAbs[w] = Math.max(0, ext - sca)
    g[w] = ((4 / x2) * (gSum1 + gSum2)) / sca
  }
  return { q_sca: qSca, q_abs: qAbs, g }
}
