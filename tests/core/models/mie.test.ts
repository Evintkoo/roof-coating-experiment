import { afterEach, expect, test } from "bun:test"
import { join } from "node:path"
import { PhysicsRangeError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import { mieEfficiencies } from "../../../src/core/models/mie"
import { repoRoot } from "../../helpers"

const T_MIE_REL = 1e-8
const T_MIE_ABS = 1e-8
const T_MIE_G_ABS = 1e-7
const T_MIE_LOWX_REL = 1e-6
const T_MIE_MS = 2

afterEach(() => setEventSink(null))

type MieCase = {
  n: number
  k: number
  d_um: number
  n_medium: number
  wl_um: number[]
  q_ext: number[]
  q_sca: number[]
  q_abs: number[]
  g: number[]
}
const oracle = (await Bun.file(
  join(repoRoot, "tests/fixtures/oracle/mie.json"),
).json()) as { cases: MieCase[] }

const sizeParam = (c: MieCase, wl: number) =>
  (Math.PI * c.d_um * c.n_medium) / wl

/** Returns the H4 violations of one case (empty array = pass). */
function violations(c: MieCase): string[] {
  const r = mieEfficiencies(
    c.n,
    c.k,
    c.d_um,
    Float64Array.from(c.wl_um),
    c.n_medium,
  )
  const bad: string[] = []
  c.wl_um.forEach((wl, i) => {
    const qSca = r.q_sca[i] as number
    const qAbs = r.q_abs[i] as number
    const qExt = qSca + qAbs
    // miepython switches to a low-x series when |m|x < 0.1 (mie_jit.py, _single_sphere_nb)
    const mx = (Math.hypot(c.n, c.k) / c.n_medium) * sizeParam(c, wl)
    const rel = mx < 0.1 ? T_MIE_LOWX_REL : T_MIE_REL
    const where = `n=${c.n} k=${c.k} d=${c.d_um} nm=${c.n_medium} wl=${wl}`
    const refExt = c.q_ext[i] as number
    const refSca = c.q_sca[i] as number
    if (Math.abs(qExt - refExt) > rel * Math.abs(refExt))
      bad.push(`${where} q_ext`)
    if (Math.abs(qSca - refSca) > rel * Math.abs(refSca))
      bad.push(`${where} q_sca`)
    // The fixture's q_abs = q_ext - q_sca inherits miepython's low-x series error (confirmed with
    // 40-digit mpmath: this code is correct to 1e-14 there), so the low-x relaxation applies to it too: so the low-x relaxation applies to it too
    // (measured 1.1e-10 abs on q_abs = 1.7e-4; a miepython multipole-sum run agrees with this code to 5e-13)
    const absTol = (mx < 0.1 ? T_MIE_LOWX_REL : T_MIE_ABS) * refExt + 1e-12
    if (Math.abs(qAbs - (c.q_abs[i] as number)) > absTol) {
      bad.push(`${where} q_abs`)
    }
    if (Math.abs((r.g[i] as number) - (c.g[i] as number)) > T_MIE_G_ABS) {
      bad.push(`${where} g`)
    }
  })
  return bad
}

test("matchesMiepythonFixture", () => {
  // H4 / T-MIE-1
  expect(oracle.cases.length).toBeGreaterThanOrEqual(60)
  const bad = oracle.cases.flatMap(violations)
  expect(bad).toEqual([])
})

test("stronglyAbsorbingLowXCaseIsCovered", () => {
  // n = 2.7, k = 0.5, d = 0.02 um, n_medium 1.49: |m| x < 0.1 at 2.5 um (miepython series branch; 1.6 um is just above)
  const c = oracle.cases.find(
    (o) => o.n === 2.7 && o.k === 0.5 && o.d_um === 0.02,
  )
  expect(c).toBeDefined()
  const cc = c as MieCase
  const lowX = cc.wl_um.filter(
    (w) =>
      (Math.hypot(cc.n, cc.k) / cc.n_medium) *
        ((Math.PI * cc.d_um * cc.n_medium) / w) <
      0.1,
  )
  expect(lowX).toEqual([2.5])
  expect(violations(cc)).toEqual([])
})

test("largeXMatchesFixture", () => {
  // T-MIE-4: the x ~ 105 (n_medium 1.0) and x ~ 156 (n_medium 1.49) cases pass the H4 rule
  const big = oracle.cases.filter((c) => c.d_um === 10)
  expect(big.some((c) => c.n_medium === 1)).toBe(true)
  expect(big.some((c) => c.n_medium === 1.49)).toBe(true)
  const xMax = Math.max(...big.map((c) => sizeParam(c, Math.min(...c.wl_um))))
  expect(xMax).toBeGreaterThan(150)
  expect(big.flatMap(violations)).toEqual([])
})

test("rayleighLimit", () => {
  // x = 0.01, m = 1.5: Q_sca = (8/3) x^4 ((m^2-1)/(m^2+2))^2
  const x = 0.01
  const m = 1.5
  const d = 1
  const wl = (Math.PI * d) / x
  const r = mieEfficiencies(m, 0, d, Float64Array.of(wl), 1)
  const ref = (8 / 3) * x ** 4 * ((m * m - 1) / (m * m + 2)) ** 2
  expect(Math.abs((r.q_sca[0] as number) - ref) / ref).toBeLessThan(0.01)
})

test("nonAbsorbingConservesEnergy", () => {
  // T-MIE-2
  const wl = Float64Array.from([0.3, 0.55, 1, 1.6, 2.5])
  for (const nm of [1, 1.49]) {
    for (const n of [1.5, 2.0, 2.7]) {
      const r = mieEfficiencies(n, 0, 0.8, wl, nm)
      for (const q of r.q_abs) expect(Math.abs(q)).toBeLessThan(1e-9)
    }
  }
})

test("sizeParameterBoundedBelow", () => {
  // g sums cancel when Q_sca -> 0; x < 1e-3 is rejected (code 4)
  const rejects = (d: number, wl: number) => {
    try {
      mieEfficiencies(1.5, 0, d, Float64Array.of(wl), 1)
    } catch (e) {
      return e instanceof PhysicsRangeError && e.code === 4
    }
    return false
  }
  expect(rejects(1e-4 / Math.PI, 1)).toBe(true) // x = 1e-4
  expect(rejects(1e-300, 1)).toBe(true)
  const r = mieEfficiencies(1.5, 0, 1e-3 / Math.PI, Float64Array.of(1), 1) // x = 1e-3
  expect(Number.isFinite(r.g[0])).toBe(true)
  expect(Math.abs(r.g[0] as number)).toBeLessThan(1e-6)
})

test("tio2AbsorbsInUv", () => {
  // T-MIE-3
  const r = mieEfficiencies(2.7, 0.05, 0.25, Float64Array.of(0.35), 1)
  expect(r.q_abs[0] as number).toBeGreaterThan(0.1)
})

test("negativeKRejected", () => {
  // T-MIE-5 / F8
  const seen: string[] = []
  setEventSink((event) => seen.push(event))
  let err: unknown
  try {
    mieEfficiencies(1.5, -0.01, 0.25, Float64Array.of(0.55), 1)
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(PhysicsRangeError)
  expect((err as PhysicsRangeError).code).toBe(4)
  expect(seen).toContain("model.out_of_range")
})

test("otherInputsGuarded", () => {
  const wl = Float64Array.of(0.55)
  expect(() => mieEfficiencies(0.9, 0, 0.25, wl, 1)).toThrow(PhysicsRangeError)
  expect(() => mieEfficiencies(1.5, 0, 0, wl, 1)).toThrow(PhysicsRangeError)
  expect(() => mieEfficiencies(1.5, 0, 0.25, Float64Array.of(0), 1)).toThrow(
    PhysicsRangeError,
  )
  expect(() => mieEfficiencies(1.5, 0, 0.25, wl, 0.5)).toThrow(
    PhysicsRangeError,
  )
  expect(() => mieEfficiencies(Number.NaN, 0, 0.25, wl, 1)).toThrow(
    PhysicsRangeError,
  )
})

test("runtime221Wavelengths", () => {
  const wl = new Float64Array(221)
  for (let i = 0; i < 221; i++) wl[i] = 0.3 + (2.2 * i) / 220
  const run = () => mieEfficiencies(2.7, 0.05, 0.25, wl, 1.49)
  for (let i = 0; i < 5; i++) run() // warm-up
  const times: number[] = []
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now()
    run()
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const median = ((times[9] as number) + (times[10] as number)) / 2
  expect(median).toBeLessThan(T_MIE_MS)
})

test("mieCacheStatsEvent", () => {
  // The mie.cache_stats event and its Map cache belong to optics (plan 02 Task 5: emitter
  // `optics`); mie itself is stateless, so it must stay silent and repeat calls give identical output.
  const seen: string[] = []
  setEventSink((event) => seen.push(event))
  const wl = Float64Array.of(0.4, 0.8)
  const a = mieEfficiencies(1.64, 0.001, 0.8, wl, 1)
  const b = mieEfficiencies(1.64, 0.001, 0.8, wl, 1)
  expect(seen.filter((e) => e === "mie.cache_stats")).toEqual([])
  expect(Array.from(a.q_sca)).toEqual(Array.from(b.q_sca))
})
