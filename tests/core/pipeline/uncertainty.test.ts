import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { type Materials, parseMaterials } from "../../../src/core/config"
import { lhsDesign, lhsUnit, scenarioFrom } from "../../../src/core/design"
import { ConfigError } from "../../../src/core/errors"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { CONTROL_LAYERS, evaluate } from "../../../src/core/pipeline/stackProps"
import {
  drawMaterials,
  quantile7,
  widenInterval,
} from "../../../src/core/pipeline/uncertainty"
import type { DesignRow } from "../../../src/core/schema"
import { loadContext } from "../../../src/node/context"
import { repoRoot } from "../../helpers"

let ctx: ModelContext
let mat: Materials
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
  mat = ctx.mat
})

// [value path, unc key, absolute?]: D4 mapping of the 11 perturbed parameters.
const PARAMS: [string, string, boolean][] = [
  ["tio2.diameter_um", "diameter_rel", false],
  ["baso4.diameter_um", "diameter_rel", false],
  ["binder.n", "n_rel", false],
  ["substrate.r_solar", "substrate_r_abs", true],
  ["topcoat.mu_per_um", "mu_rel", false],
  ["barrier.eps_lo", "eps_rel", false],
  ["barrier.eps_hi", "eps_rel", false],
  ["barrier.h_c0_primer_um", "h_c0_rel", false],
  ["barrier.h_c0_top_um", "h_c0_rel", false],
  ["wetting.theta_silica_deg", "theta_deg", true],
  ["wetting.theta_mtes_deg", "theta_deg", true],
]
const get = (m: Materials, path: string): number => {
  const [a, b] = path.split(".") as [string, string]
  return ((m as never)[a][b] as { value: number }).value
}
const unc = (m: Materials, k: string): number =>
  ((m.unc as Record<string, { value: number }>)[k] as { value: number }).value

test("zeroUncertaintyGivesIdenticalMaterials", () => {
  const z = structuredClone(mat)
  for (const k of Object.keys(z.unc))
    (z.unc as Record<string, { value: number }>)[k]!.value = 0
  for (const d of drawMaterials(z, 8, 5)) expect(d).toEqual(z)
})

test("drawsInsideBounds", () => {
  const draws = drawMaterials(mat, 200, 11)
  expect(draws.length).toBe(200)
  for (const d of draws) {
    for (const [p, k, abs] of PARAMS) {
      const v0 = get(mat, p)
      const h = abs ? unc(mat, k) : unc(mat, k) * v0
      const v = get(d, p)
      expect(v).toBeGreaterThanOrEqual(Math.max(v0 - h, 0) - 1e-12)
      expect(v).toBeLessThanOrEqual(v0 + h + 1e-12)
    }
    // plan 02 D9 domains
    expect(d.binder.n.value).toBeGreaterThanOrEqual(1)
    expect(d.baso4.n.value).toBe(mat.baso4.n.value)
    expect(d.substrate.r_solar.value).toBeGreaterThanOrEqual(0)
    expect(d.substrate.r_solar.value).toBeLessThanOrEqual(1)
    for (const t of [d.wetting.theta_silica_deg, d.wetting.theta_mtes_deg]) {
      expect(t.value).toBeGreaterThanOrEqual(0)
      expect(t.value).toBeLessThanOrEqual(180)
    }
    expect(d.barrier.eps_lo.value).toBeLessThan(d.barrier.eps_hi.value)
    expect(() => parseMaterials(d)).not.toThrow()
  }
})

test("drawsClampToDomainWhenBandExceedsIt", () => {
  const m = structuredClone(mat)
  m.unc.substrate_r_abs.value = 2
  m.unc.theta_deg.value = 500
  m.unc.n_rel.value = 0.9
  m.unc.eps_rel.value = 5
  m.unc.diameter_rel.value = 5
  for (const d of drawMaterials(m, 100, 3))
    expect(() => parseMaterials(d)).not.toThrow()
  expect(
    drawMaterials(m, 100, 3).some((d) => d.substrate.r_solar.value === 1),
  ).toBe(true)
})

test("drawMaterialsDoesNotMutateInput", () => {
  const before = structuredClone(mat)
  const out = drawMaterials(mat, 5, 1)
  expect(mat).toEqual(before)
  expect(out[0]).not.toBe(mat)
})

test("sameSeedSameDraws", () => {
  expect(drawMaterials(mat, 10, 42)).toEqual(drawMaterials(mat, 10, 42))
  expect(drawMaterials(mat, 10, 42)).not.toEqual(drawMaterials(mat, 10, 43))
})

test("nZeroOrNegativeRejectedCode2", () => {
  for (const n of [0, -3, 2.5, Number.NaN]) {
    try {
      drawMaterials(mat, n, 1)
      throw new Error("expected throw")
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError)
      expect((e as ConfigError).code).toBe(2)
    }
  }
})

test("quantile7MatchesKnownValues", () => {
  const s = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  expect(quantile7(s, 0.05)).toBeCloseTo(1.45, 12)
  expect(quantile7(s, 0.5)).toBeCloseTo(5.5, 12)
  expect(quantile7(s, 0.95)).toBeCloseTo(9.55, 12)
  expect(quantile7(s, 0)).toBe(1)
  expect(quantile7(s, 1)).toBe(10)
  expect(quantile7(Float64Array.from([4]), 0.3)).toBe(4)
})

test("intervalContainsPred", () => {
  const d = Float64Array.from([5, 1, 9, 3, 7, 2, 8, 4, 6, 10])
  const inner = widenInterval(5.5, d)
  expect(inner.lo).toBeCloseTo(1.45, 12)
  expect(inner.hi).toBeCloseTo(9.55, 12)
  expect(widenInterval(0, d)).toEqual({ lo: 0, hi: inner.hi })
  expect(widenInterval(99, d)).toEqual({ lo: inner.lo, hi: 99 })
  expect(d[0]).toBe(5) // input not sorted in place
})

test("negativeUncertaintyRejected", () => {
  for (const k of Object.keys(mat.unc)) {
    const m = structuredClone(mat)
    ;(m.unc as Record<string, { value: number }>)[k]!.value = -0.01
    try {
      parseMaterials(m)
      throw new Error("expected throw")
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError)
      expect((e as ConfigError).key).toBe(`unc.${k}.value`)
    }
  }
})

test("doubledUncertaintyWidensRealModelOutputs", () => {
  const { candidate_id: _id, ...c } = lhsDesign(
    10,
    ctx.ranges,
    7,
  )[0] as DesignRow
  const s = scenarioFrom(800, 32, 3, ctx.weather)
  const doubled = structuredClone(mat)
  for (const k of Object.keys(doubled.unc))
    (doubled.unc as Record<string, { value: number }>)[k]!.value *= 2
  const width = (m: Materials, f: "r_solar" | "t_max_c") => {
    const v = Float64Array.from(
      drawMaterials(m, 60, 100).map(
        (d) => evaluate(c, s, CONTROL_LAYERS.C4, ctx, d)[f],
      ),
    ).sort()
    return quantile7(v, 0.95) - quantile7(v, 0.05)
  }
  for (const f of ["r_solar", "t_max_c"] as const) {
    const w1 = width(mat, f)
    expect(w1).toBeGreaterThan(0)
    expect(width(doubled, f)).toBeGreaterThan(w1)
  }
})

test("eachParameterStratifiedOneDrawPerStratum", () => {
  const n = 20
  const draws = drawMaterials(mat, n, 9)
  const half = (p: string, k: string, abs: boolean): number =>
    abs ? unc(mat, k) : unc(mat, k) * get(mat, p)
  for (const [p, k, abs] of PARAMS) {
    // invert v = v0 + (2u - 1) h; the default bands never reach a domain edge
    const strata = draws
      .map((d) => {
        const u = ((get(d, p) - get(mat, p)) / half(p, k, abs) + 1) / 2
        return Math.floor(u * n)
      })
      .sort((a, b) => a - b)
    expect(strata).toEqual(Array.from({ length: n }, (_, i) => i))
  }
})

test("overlappingEpsBandsAreSwappedSoLoStaysBelowHi", () => {
  const m = structuredClone(mat)
  m.barrier.eps_lo.value = 0.5
  m.barrier.eps_hi.value = 0.5001
  const n = 60
  const seed = 4
  const draws = drawMaterials(m, n, seed)
  const u = lhsUnit(n, PARAMS.length, seed)
  const iLo = PARAMS.findIndex(([p]) => p === "barrier.eps_lo")
  const iHi = PARAMS.findIndex(([p]) => p === "barrier.eps_hi")
  const hw = 0.5 * unc(m, "eps_rel")
  let swapped = 0
  draws.forEach((d, i) => {
    const a = 0.5 + (2 * (u[i] as number[])[iLo]! - 1) * hw
    const b = 0.5001 + (2 * (u[i] as number[])[iHi]! - 1) * hw * (0.5001 / 0.5)
    if (a >= b) swapped++
    expect(d.barrier.eps_lo.value).toBeLessThan(d.barrier.eps_hi.value)
    expect(d.barrier.eps_lo.value).toBeCloseTo(Math.min(a, b), 6)
    expect(d.barrier.eps_hi.value).toBeCloseTo(Math.max(a, b), 6)
    expect(() => parseMaterials(d)).not.toThrow()
  })
  expect(swapped).toBeGreaterThan(10) // the swap branch really ran
})

test("emptyOrNaNDrawsRejectedCode2", () => {
  const bad = [new Float64Array(0), Float64Array.from([1, Number.NaN, 3])]
  for (const d of bad) {
    for (const f of [
      () => widenInterval(1, d),
      () => quantile7(Float64Array.from(d).sort(), 0.5),
    ]) {
      try {
        f()
        throw new Error("expected throw")
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError)
        expect((e as ConfigError).code).toBe(2)
      }
    }
  }
})
