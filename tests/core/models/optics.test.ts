import { afterEach, beforeEach, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Materials } from "../../../src/core/config"
import { DataError, PhysicsRangeError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import {
  type NKTable,
  nkAt,
  parseG173,
  parseNk,
  type Spectrum,
} from "../../../src/core/literature"
import { mieEfficiencies } from "../../../src/core/models/mie"
import {
  applyTopcoat,
  kmCoefficients,
  kmLayerReflectance,
  midcoatSpectrum,
  opticsGrid,
  resetMieCache,
  rSolarStack,
  smoothClampS,
  solarWeighted,
} from "../../../src/core/models/optics"
import { loadMaterials } from "../../../src/node/config"
import { repoRoot } from "../../helpers"

const T_EVAL_MS = 5
const T_KM = 1e-9

afterEach(() => setEventSink(null))
beforeEach(() => resetMieCache())

const lit = (f: string) =>
  readFileSync(join(repoRoot, "data/literature", f), "utf8")
const g173: Spectrum = parseG173(lit("g173_global_tilt.csv"))
const tio2: NKTable = parseNk(lit("tio2_nk.csv"))
const mat: Materials = await loadMaterials(
  join(repoRoot, "configs/materials.yaml"),
)
const wl = opticsGrid(tio2)
const flatBaso4 = (): NKTable => ({
  wl_um: tio2.wl_um,
  n: new Float64Array(tio2.wl_um.length).fill(mat.baso4.n.value),
  k: new Float64Array(tio2.wl_um.length),
})
const baso4 = flatBaso4()
const f = (...a: number[]) => Float64Array.from(a)
const rKm = (s: number, k: number, x: number, rg: number) =>
  kmLayerReflectance(f(s), f(k), x, rg)[0] as number

/** One layer whose sigma_s, sigma_a, g come out as given (phi = 1, d = 1.5 -> sigma = Q). */
const layer = (sigS: number, sigA: number, g: number) => ({
  mie: { q_sca: f(sigS), q_abs: f(sigA), g: f(g) },
  dUm: 1.5,
  phi: 1,
})

test("kmThickLimitClosedForm", () => {
  // H5: R_inf = 1 + K/S - sqrt((K/S)^2 + 2K/S), independent of the ground.
  for (const [s, k] of [
    [10, 0.5],
    [1, 3],
    [0.7475, 0.02],
    [3, 0.001],
  ] as const) {
    const ratio = k / s
    const rInf = 1 + ratio - Math.sqrt(ratio * ratio + 2 * ratio)
    for (const rg of [0, 0.3, 1])
      expect(Math.abs(rKm(s, k, 1000 / s, rg) - rInf)).toBeLessThan(T_KM)
  }
  expect(rKm(10, 0.5, 100, 0.3)).toBeCloseTo(0.7298437881283575, 12)
  expect(rKm(1, 3, 2, 0)).toBeCloseTo(0.12701663041843572, 9)
})

test("kmZeroThicknessReturnsGround", () => {
  expect(rKm(2, 0.3, 0, 0.42)).toBe(0.42)
  expect(Math.abs(rKm(1, 3, 1e-9, 0.8) - 0.8)).toBeLessThan(1e-8)
  expect(rKm(0, 0, 100, 0.65)).toBe(0.65)
})

test("kmMappingPinnedToSpikeQ1", () => {
  // Spike Q1 film cases, verbatim (S, K, X, Rg -> R).
  expect(rKm(2, 0, 0.5, 0)).toBeCloseTo(0.5, 12)
  expect(rKm(2, 0, 0.5, 1)).toBeCloseTo(1.0, 12)
  expect(rKm(1, 0.75, 1, 0)).toBeCloseTo(0.2977637056984597, 9)
  expect(rKm(1, 0.75, 1, 0.5)).toBeCloseTo(0.3250749871241361, 9)
  expect(rKm(10, 0.5, 100, 0.3)).toBeCloseTo(0.7298437881283575, 12)
  // Plan R1 closure cases.
  const a = kmCoefficients([layer(1, 0, 0)])
  expect(a.s[0]).toBeCloseTo(0.75, 14)
  expect(a.k[0]).toBe(0)
  expect(kmCoefficients([layer(1, 0, 0)], "hemispheric").s[0]).toBeCloseTo(
    1,
    14,
  )
  const b = kmCoefficients([layer(5, 0.1, 0.5)])
  expect(b.k[0]).toBeCloseTo(0.2, 14)
  expect(b.s[0]).toBeCloseTo(1.85, 14)
  const c = kmCoefficients([layer(1, 0.01, 0)])
  const rInf = (s: number, k: number) =>
    1 + k / s - Math.sqrt((k / s) ** 2 + (2 * k) / s)
  expect(rInf(c.s[0] as number, c.k[0] as number)).toBeCloseTo(0.7939, 4)
  // sigma = 1.5 phi Q / d with phi < 1, and two layers add.
  const two = kmCoefficients([
    { mie: { q_sca: f(2), q_abs: f(0.4), g: f(0) }, dUm: 0.5, phi: 0.1 },
    { mie: { q_sca: f(1), q_abs: f(0), g: f(0.5) }, dUm: 1, phi: 0.2 },
  ])
  const s1 = (1.5 * 0.1 * 2) / 0.5
  const s2 = (1.5 * 0.2 * 1) / 1
  const a1 = (1.5 * 0.1 * 0.4) / 0.5
  expect(two.k[0]).toBeCloseTo(2 * a1, 14)
  expect(two.s[0]).toBeCloseTo(0.75 * s1 + 0.75 * 0.5 * s2 - a1 / 4, 14)
})

test("flatRReturnsR", () => {
  // H6
  for (const c of [0, 0.37, 1])
    expect(
      Math.abs(
        solarWeighted(wl, new Float64Array(wl.length).fill(c), g173) - c,
      ),
    ).toBeLessThan(1e-9)
  expect(
    Math.abs(
      rSolarStack(new Float64Array(wl.length).fill(0.5), wl, g173) - 0.5,
    ),
  ).toBeLessThan(1e-9)
})

test("g173Total", () => {
  // H6: the G173 integral (trapezoid) is 1000.37 +- 1.0 W/m2.
  let total = 0
  for (let i = 1; i < g173.wl_um.length; i++)
    total +=
      0.5 *
      ((g173.irradiance_w_m2_um[i] as number) +
        (g173.irradiance_w_m2_um[i - 1] as number)) *
      ((g173.wl_um[i] as number) - (g173.wl_um[i - 1] as number))
  expect(Math.abs(total - 1000.37)).toBeLessThan(1.0)
})

test("solarWeightedInterpolatesAndHoldsTail", () => {
  // Non-flat r on a coarse grid; expected from numpy (np.interp onto the G173 grid, which holds the
  // end values below 0.5 um and beyond 2.0 um up to 4.0 um, then np.trapezoid ratio), throwaway script
  // in the scratchpad (indep check, not from the TS code).
  const w = f(0.5, 1.0, 2.0)
  const r = f(0.2, 0.6, 0.4)
  expect(solarWeighted(w, r, g173)).toBeCloseTo(0.374858033178181, 12)
  // Same grid with the last value 1 (tail held at 1 from 2 to 4 um), also from numpy.
  expect(solarWeighted(w, f(0.2, 0.6, 1), g173)).toBeCloseTo(
    0.4378523095417368,
    12,
  )
})

test("kmSeriesAndTanhBranchesAgree", () => {
  // t = b*S*X = X*sqrt(K(K+2S)) straddles the 1e-4 branch switch (series below, tanh above).
  // S = 1, X = 1, Rg = 0.3, K chosen so t = 0.99e-4 and 1.01e-4; expected from mpmath (40 digits).
  expect(rKm(1, 4.900499987992549e-9, 1, 0.3)).toBeCloseTo(
    0.5882352910032578,
    12,
  )
  expect(rKm(1, 5.10049998699245e-9, 1, 0.3)).toBeCloseTo(
    0.5882352908761529,
    12,
  )
})

test("pvcZeroGivesBinderOnlyFinite", () => {
  const r = midcoatSpectrum(0, 0.5, 200, mat, tio2, baso4, wl)
  for (const v of r) expect(v).toBe(mat.substrate.r_solar.value)
})

test("pvcOutOfRangeCode4", () => {
  // F5
  for (const pvc of [1.3, -0.1, Number.NaN]) {
    try {
      midcoatSpectrum(pvc, 0.5, 200, mat, tio2, baso4, wl)
      throw new Error("did not throw")
    } catch (e) {
      expect(e).toBeInstanceOf(PhysicsRangeError)
      expect((e as PhysicsRangeError).code).toBe(4)
    }
  }
  expect(() => midcoatSpectrum(0.2, 1.1, 200, mat, tio2, baso4, wl)).toThrow(
    PhysicsRangeError,
  )
})

test("edges100And300UmValid", () => {
  // R at 0.423971 um from the independent script (see midcoatWiringPinnedToIndependentMie).
  const i = gridIndex(0.423971)
  for (const [d, expected] of [
    [100, 0.9475385893932061],
    [300, 0.9475409307418439],
  ] as const) {
    const r = midcoatSpectrum(0.25, 0.5, d, mat, tio2, baso4, wl)
    for (const v of r) expect(v >= 0 && v <= 1).toBe(true)
    expect(Math.abs((r[i] as number) - expected)).toBeLessThan(1e-9)
  }
})

test("pvcUpperGuardEdge", () => {
  expect(() =>
    midcoatSpectrum(0.6, 0.5, 200, mat, tio2, baso4, wl),
  ).not.toThrow()
  expect(() => midcoatSpectrum(0.61, 0.5, 200, mat, tio2, baso4, wl)).toThrow(
    PhysicsRangeError,
  )
})

// Expected values below come from /scratchpad/indep.py (throwaway, python3 -I): Mie by complex
// spherical Bessel/Riccati-Bessel a_n, b_n (scipy.special) with m = (n+ik)/1.48, x = pi d 1.48/lambda;
// sigma = 1.5 phi Q/d; K = 2 sigma_a; S = max(0, 3/4 (1-g) sigma_s - sigma_a/4); closed-form Kubelka
// film with coth; phi_TiO2 = pvc*f, phi_BaSO4 = pvc*(1-f); d_TiO2 0.25, d_BaSO4 1.0 um (n 1.64, k 0);
// ground 0.65; TiO2 n,k = table rows at the grid wavelengths.
const gridIndex = (w: number) => {
  const i = wl.findIndex((v) => Math.abs(v - w) < 1e-9)
  if (i < 0) throw new Error(`no grid point at ${w}`)
  return i
}

test("midcoatWiringPinnedToIndependentMie", () => {
  const r = midcoatSpectrum(0.25, 0.5, 200, mat, tio2, baso4, wl)
  for (const [w, expected] of [
    [0.346606, 0.07654852862243032],
    [0.388899, 0.7590291012579357],
    [0.423971, 0.947540930672583],
    [0.449093, 0.97729958959948],
  ] as const)
    expect(Math.abs((r[gridIndex(w)] as number) - expected)).toBeLessThan(1e-9)
  // Strong UV absorption: S clamps to 0 and the film is a pure absorber (R ~ 0).
  expect(r[0] as number).toBeLessThan(1e-9)
})

test("midcoatAsymmetricFractionsPinned", () => {
  // f = 0.3 (pvc 0.3, 120 um): unlike f = 0.5 this distinguishes phi_TiO2 from phi_BaSO4 and the diameters.
  const r = midcoatSpectrum(0.3, 0.3, 120, mat, tio2, baso4, wl)
  for (const [w, expected] of [
    [0.346606, 0.08049392661375933],
    [0.388899, 0.7603521937150058],
    [0.423971, 0.9479059372138544],
    [0.449093, 0.9762982266699928],
  ] as const)
    expect(Math.abs((r[gridIndex(w)] as number) - expected)).toBeLessThan(1e-9)
})

test("singlePigmentSKRPinnedT_OPT_6", () => {
  // TiO2 only (f = 1), pvc 0.2, 150 um, at 0.388899 um (independent script: S, K, R).
  const i = gridIndex(0.388899)
  const nk = nkAt(tio2, Float64Array.of(0.388899))
  const mie = mieEfficiencies(
    nk.n[0] as number,
    nk.k[0] as number,
    mat.tio2.diameter_um.value,
    Float64Array.of(0.388899),
    mat.binder.n.value,
  )
  const { s, k } = kmCoefficients([
    { mie, dUm: mat.tio2.diameter_um.value, phi: 0.2 },
  ])
  expect(Math.abs((s[0] as number) - 1.8512055361029507)).toBeLessThan(1e-9)
  expect(Math.abs((k[0] as number) - 0.07149838909097356)).toBeLessThan(1e-9)
  const r = midcoatSpectrum(0.2, 1, 150, mat, tio2, baso4, wl)
  expect(Math.abs((r[i] as number) - 0.7580216019679951)).toBeLessThan(1e-9)
})

test("dftOutsideDomainCode4", () => {
  for (const d of [5, 301, 99.9]) {
    expect(() => midcoatSpectrum(0.25, 0.5, d, mat, tio2, baso4, wl)).toThrow(
      PhysicsRangeError,
    )
  }
})

test("missingBaso4KColumnIsDataError", () => {
  const bad = { wl_um: baso4.wl_um, n: baso4.n } as unknown as NKTable
  expect(() => midcoatSpectrum(0.25, 0.5, 200, mat, tio2, bad, wl)).toThrow(
    DataError,
  )
  const short = {
    ...baso4,
    k: new Float64Array(3),
  }
  expect(() => midcoatSpectrum(0.25, 0.5, 200, mat, tio2, short, wl)).toThrow(
    DataError,
  )
})

test("singlePigmentFractionsFinite", () => {
  for (const x of [0, 1]) {
    const r = midcoatSpectrum(0.25, x, 200, mat, tio2, baso4, wl)
    for (const v of r) expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true)
    const s = rSolarStack(r, wl, g173)
    expect(s).toBeGreaterThan(0.3)
    expect(s).toBeLessThanOrEqual(1)
  }
})

test("defaultMidcoatIsReflective", () => {
  const r = midcoatSpectrum(0.25, 0.5, 200, mat, tio2, baso4, wl)
  const s = rSolarStack(r, wl, g173)
  // 0.95107 from an independent numpy Mie + KM recomputation (reviewer), narrow band.
  expect(Math.abs(s - 0.95107)).toBeLessThan(5e-5)
})

test("thickerNeverLessReflective", () => {
  let prev = -1
  for (let d = 100; d <= 300; d += 25) {
    const s = rSolarStack(
      midcoatSpectrum(0.2, 0.4, d, mat, tio2, baso4, wl),
      wl,
      g173,
    )
    // substrate (0.65) is darker than the opaque film: more film cannot reflect less.
    expect(s).toBeGreaterThanOrEqual(prev - 1e-12)
    prev = s
  }
})

test("topcoatNeverIncreasesR", () => {
  const r = midcoatSpectrum(0.25, 0.5, 200, mat, tio2, baso4, wl)
  for (const d of [3, 10, 20]) {
    const t = applyTopcoat(r, d, mat.topcoat.mu_per_um.value)
    for (let i = 0; i < r.length; i++)
      expect(t[i] as number).toBeLessThanOrEqual(r[i] as number)
    // r[0] is ~0 in the UV, so pin the factor at the most reflective wavelength
    const iMax = r.indexOf(Math.max(...r))
    expect(r[iMax] as number).toBeGreaterThan(0.5)
    expect(t[iMax] as number).toBeCloseTo(
      (r[iMax] as number) * Math.exp(-2 * 0.002 * d),
      14,
    )
  }
  expect(() => applyTopcoat(r, 10, -1)).toThrow(PhysicsRangeError)
  expect(() => applyTopcoat(r, 21, 0.002)).toThrow(PhysicsRangeError)
})

test("topcoatZeroDftIdentity", () => {
  const r = midcoatSpectrum(0.25, 0.5, 200, mat, tio2, baso4, wl)
  expect(Array.from(applyTopcoat(r, 0, 0.002))).toEqual(Array.from(r))
  expect(Array.from(applyTopcoat(r, 10, 0))).toEqual(Array.from(r))
})

test("mieCacheStatsEventAtDebug", () => {
  // Counters are cumulative since resetMieCache(); the event fires once per midcoatSpectrum call.
  const seen: { event: string; level: string; hits: number; misses: number }[] =
    []
  setEventSink((event, level, fields) => {
    if (event === "mie.cache_stats")
      seen.push({
        event,
        level,
        hits: fields.hits as number,
        misses: fields.misses as number,
      })
  })
  midcoatSpectrum(0.25, 0.5, 200, mat, tio2, baso4, wl) // all misses
  midcoatSpectrum(0.3, 0.5, 150, mat, tio2, baso4, wl) // same pigments, same grid: all hits
  midcoatSpectrum(0.2, 0.5, 250, mat, tio2, baso4, wl) // all hits
  expect(seen.length).toBe(3)
  expect(seen.every((e) => e.level === "debug")).toBe(true)
  const n = wl.length // one tuple per pigment per wavelength
  expect(seen.map((e) => [e.hits, e.misses])).toEqual([
    [0, 2 * n],
    [2 * n, 2 * n],
    [4 * n, 2 * n],
  ])
})

test("evalUnder5ms", () => {
  // Warm: median of 20 runs of the full optics evaluation (midcoat + topcoat + solar weighting)
  // with the Mie cache warm (the optimiser varies pvc/fraction/DFT, not diameters), and a cold-cache
  // variant for the worst case.
  const run = (i: number) => {
    const r = midcoatSpectrum(
      0.15 + 0.01 * i,
      0.5,
      120 + 5 * i,
      mat,
      tio2,
      baso4,
      wl,
    )
    return rSolarStack(applyTopcoat(r, 10, 0.002), wl, g173)
  }
  const median = (cold: boolean) => {
    run(0)
    const times: number[] = []
    for (let i = 0; i < 20; i++) {
      if (cold) resetMieCache()
      const t0 = performance.now()
      run(i)
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    return ((times[9] as number) + (times[10] as number)) / 2
  }
  const warm = median(false)
  const cold = median(true)
  console.log(
    `optics eval median: warm ${warm.toFixed(3)} ms, cold ${cold.toFixed(3)} ms`,
  )
  expect(warm).toBeLessThan(T_EVAL_MS)
  expect(cold).toBeLessThan(T_EVAL_MS)
})

test("smoothClampSIsC1AndMatchesClampOutsideTheBand", () => {
  const scale = 2
  const eps = 1e-3 * scale
  expect(smoothClampS(-1, scale)).toBe(0)
  expect(smoothClampS(0, scale)).toBe(0)
  expect(smoothClampS(eps, scale)).toBe(eps)
  expect(smoothClampS(5, scale)).toBe(5)
  const d = (a: number) =>
    (smoothClampS(a + 1e-9, scale) - smoothClampS(a - 1e-9, scale)) / 2e-9
  expect(Math.abs(d(1e-7))).toBeLessThan(1e-3) // slope 0 at the lower end
  expect(Math.abs(d(eps - 1e-7) - 1)).toBeLessThan(1e-3) // slope 1 at the upper end
  expect(smoothClampS(0.5 * eps, scale)).toBeCloseTo(0.375 * eps, 12)
})
