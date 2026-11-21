import { afterEach, expect, test } from "bun:test"
import { join } from "node:path"
import type { Materials } from "../../../src/core/config"
import { PhysicsRangeError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import {
  condensation,
  gelPointConversion,
  gelTimeRel,
  hydrolysis,
  simulateSol,
  weightAverageFunctionality,
} from "../../../src/core/models/solGel"
import { loadMaterials } from "../../../src/node/config"
import { relErr, repoRoot } from "../../helpers"

afterEach(() => setEventSink(null))

const mat: Materials = await loadMaterials(
  join(repoRoot, "configs/materials.yaml"),
)
const REF = [4.25, 3.0, 0.5] as const
const H = 3600

type SolCase = {
  kind: string
  ph: number
  waterRatio: number
  x: number
  kHCoeff: number
  kC: number
  tEndS: number
  tS: number
  kH: number
  h: number
  c: number
  gel_time_s: number | null
}
const oracle = (await Bun.file(
  join(repoRoot, "tests/fixtures/oracle/solgel.json"),
).json()) as { cases: SolCase[] }

const codeOf = (fn: () => unknown): number | undefined => {
  try {
    fn()
  } catch (e) {
    return e instanceof PhysicsRangeError ? e.code : -1
  }
  return undefined
}

test("floryStockmayerValues", () => {
  // hand values: x=0 pure TEOS f=4 -> 1/3; x=1 f=3 -> 1/2; x=0.5 -> 25/7 -> 7/18
  expect(weightAverageFunctionality(0)).toBe(4)
  expect(weightAverageFunctionality(1)).toBe(3)
  expect(weightAverageFunctionality(0.5)).toBeCloseTo(25 / 7, 14)
  expect(gelPointConversion(4)).toBeCloseTo(1 / 3, 14)
  expect(gelPointConversion(3)).toBe(0.5)
  expect(gelPointConversion(weightAverageFunctionality(0.5))).toBeCloseTo(
    7 / 18,
    14,
  )
  // weight average exceeds number average (3.5) for a mixture
  expect(weightAverageFunctionality(0.5)).toBeGreaterThan(3.5)
  expect(codeOf(() => weightAverageFunctionality(1.1))).toBe(4)
  expect(codeOf(() => gelPointConversion(1))).toBe(4)
})

test("closedFormMatchesOdeFixture", () => {
  let worst = 0
  for (const c of oracle.cases) {
    const eh = relErr(hydrolysis(c.tS, c.kH, c.waterRatio), c.h)
    const ec = relErr(condensation(c.tS, c.kH, c.kC, c.waterRatio), c.c)
    const g = simulateSol(c.ph, c.waterRatio, c.x, c.kHCoeff, c.kC, c.tEndS)
    const eg =
      c.gel_time_s === null
        ? g.gel_time_s === Number.POSITIVE_INFINITY
          ? 0
          : 1
        : relErr(g.gel_time_s, c.gel_time_s)
    worst = Math.max(worst, eh, ec, eg)
    expect(eh).toBeLessThan(1e-6)
    expect(ec).toBeLessThan(1e-6)
    expect(eg).toBeLessThan(1e-6)
  }
  expect(worst).toBeLessThan(1e-6)
})

test("oracleCoverage", () => {
  const capAfter = oracle.cases.filter(
    (c) => c.waterRatio < 1 && c.gel_time_s !== null,
  )
  expect(
    capAfter.filter((c) => c.kind === "cap_after").length,
  ).toBeGreaterThanOrEqual(5)
  expect(
    oracle.cases.filter((c) => c.gel_time_s === null).length,
  ).toBeGreaterThanOrEqual(2)
  for (const c of capAfter.filter((c) => c.kind === "cap_after")) {
    const tStar = -Math.log1p(-c.waterRatio) / c.kH
    expect(c.gel_time_s as number).toBeGreaterThan(tStar)
  }
})

// independent values: python3 -I mpmath, 50 digits (kC = 1, t = 1, k_h = u)
test("taylorSwitchStraddle", () => {
  const ref: [number, number][] = [
    [0.49, 0.18896301424599027],
    [0.5, 0.19189341693404008],
    [0.51, 0.19479469569098004],
  ]
  for (const [u, c] of ref)
    expect(relErr(condensation(1, u, 1, 3), c)).toBeLessThan(1e-13)
})

test("referenceThatNeverGelsRejected", () => {
  // t_end 50 h: pH 3.5 gels, pH 5 does not
  const m = {
    ...mat,
    sol_gel: {
      ...mat.sol_gel,
      t_end_s: { ...mat.sol_gel.t_end_s, value: 50 * H },
    },
  }
  expect(gelTimeRel(5, 3, 0.5, m, [3.5, 3, 0.5])).toBe(Number.POSITIVE_INFINITY)
  expect(codeOf(() => gelTimeRel(3.5, 3, 0.5, m, [5, 3, 0.5]))).toBe(4)
  expect(codeOf(() => gelTimeRel(4.25, 3, 0.5, mat, [4.25, 3, 0.1]))).toBe(4)
  expect(codeOf(() => gelTimeRel(4.25, 3, 0.5, mat, [4.25, 3, 0.9]))).toBe(4)
})

test("spikeQ3GelTimesPinned", () => {
  // docs/spikes/plan-02.md Q3: k_H 0.15, k_c 1e-5, p_c = 1/3 (x = 0 -> f_w = 4)
  const g = (ph: number) =>
    simulateSol(ph, 3, 0, 0.15, 1e-5, 2.592e6).gel_time_s / H
  expect(g(3.5)).toBeCloseTo(17.57, 2)
  expect(g(4.25)).toBeCloseTo(40.99, 2)
  expect(g(5.0)).toBeCloseTo(122, 0)
})

test("waterLimitedHydrolysis", () => {
  expect(hydrolysis(1e9, 1e-3, 0.5)).toBeLessThanOrEqual(0.5)
  expect(hydrolysis(1e9, 1e-3, 0.5)).toBeCloseTo(0.5, 12)
  const r = simulateSol(4.25, 0.5, 0.5, 0.15, 1e-3, 2.592e6)
  expect(r.h_end).toBeLessThanOrEqual(0.5)
  expect(hydrolysis(1e9, 1e-3, 3)).toBeCloseTo(1, 12)
})

test("lowerPhHydrolysesFasterIn3p5To5", () => {
  const t = 3600
  let prev = Infinity
  for (const ph of [3.5, 3.75, 4.0, 4.5, 5.0]) {
    const h = hydrolysis(t, 0.15 * 10 ** -ph, 3)
    expect(h).toBeLessThan(prev)
    prev = h
    const r = simulateSol(ph, 3, 0.5, 0.15, 1e-5, 2.592e6)
    expect(r.h_end).toBeGreaterThan(0)
  }
  const t35 = simulateSol(3.5, 3, 0.5, 0.15, 1e-5, 2.592e6).gel_time_s
  const t50 = simulateSol(5, 3, 0.5, 0.15, 1e-5, 2.592e6).gel_time_s
  expect(t35).toBeLessThan(t50)
})

test("neverGelsReturnsInfinityAndLogsDegenerate", () => {
  const events: { e: string; l: string; f: Record<string, unknown> }[] = []
  setEventSink((e, l, f) => events.push({ e, l, f }))
  const r = simulateSol(5, 3, 0.5, 0.03, 1e-9, 2.592e6)
  expect(r.gel_time_s).toBe(Number.POSITIVE_INFINITY)
  expect(r.c_end).toBeLessThan(7 / 18)
  const d = events.filter((x) => x.e === "model.degenerate")
  expect(d.length).toBe(1)
  expect(d[0]?.l).toBe("warn")
  expect(d[0]?.f.model).toBe("solGel")
  expect(d[0]?.f.reason).toBe("gel_not_reached")
})

test("waterRatioAboveOneHasNoEffectOnGelTime", () => {
  // D4 known limit (i): the hydrolysis cap is 1 for r_w >= 1
  const a = gelTimeRel(4.0, 1, 0.5, mat, REF)
  expect(gelTimeRel(4.0, 2.5, 0.5, mat, REF)).toBe(a)
  expect(gelTimeRel(4.0, 5, 0.5, mat, REF)).toBe(a)
  // below stoichiometry the cap does act
  expect(simulateSol(4, 0.5, 0.5, 0.15, 1e-5, 2.592e6).h_end).toBeLessThan(
    simulateSol(4, 1, 0.5, 0.15, 1e-5, 2.592e6).h_end,
  )
})

test("smallKtIsAccurate", () => {
  const k = 1e-6
  const t = 1
  // series: I = t - (1 - e^-kt)/k = k t^2/2 - k^2 t^3/6 + ...; c = 1 - exp(-k_c I)
  const kc = 1
  const kt = k * t
  const I = t * (kt / 2 - kt ** 2 / 6 + kt ** 3 / 24) // t*(u/2 - u^2/6 + u^3/24)
  const expected = -Math.expm1(-kc * I)
  expect(relErr(condensation(t, k, kc, 3), expected)).toBeLessThan(1e-9)
  expect(
    relErr(hydrolysis(t, k, 3), kt - kt ** 2 / 2 + kt ** 3 / 6),
  ).toBeLessThan(1e-9)
})

test("phEdgesInclusiveAndOutsideRejected", () => {
  expect(
    codeOf(() => simulateSol(3.5, 3, 0.5, 0.15, 1e-5, 2.592e6)),
  ).toBeUndefined()
  expect(
    codeOf(() => simulateSol(5.0, 3, 0.5, 0.15, 1e-5, 2.592e6)),
  ).toBeUndefined()
  expect(codeOf(() => simulateSol(3.49, 3, 0.5, 0.15, 1e-5, 2.592e6))).toBe(4)
  expect(codeOf(() => simulateSol(5.01, 3, 0.5, 0.15, 1e-5, 2.592e6))).toBe(4)
  expect(
    codeOf(() => simulateSol(Number.NaN, 3, 0.5, 0.15, 1e-5, 2.592e6)),
  ).toBe(4)
  expect(codeOf(() => gelTimeRel(3.49, 3, 0.5, mat, REF))).toBe(4)
})

test("waterRatioZeroCode4", () => {
  expect(codeOf(() => hydrolysis(1, 1e-5, 0))).toBe(4)
  expect(codeOf(() => condensation(1, 1e-5, 1e-5, 0))).toBe(4)
  expect(codeOf(() => simulateSol(4, 0, 0.5, 0.15, 1e-5, 2.592e6))).toBe(4)
  expect(codeOf(() => gelTimeRel(4, 0, 0.5, mat, REF))).toBe(4)
})

test("referenceConditionIsOne", () => {
  expect(gelTimeRel(...REF, mat, REF)).toBe(1)
  expect(Number.isFinite(gelTimeRel(3.5, 1, 0.2, mat, REF))).toBe(true)
})
