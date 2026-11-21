import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import fc from "fast-check"
import { parse } from "yaml"
import { ConfigError } from "../../../src/core/errors"
import {
  checkInBox,
  constraints,
  DELAM_MAX,
  fromScaled,
  toScaled,
  VARS,
} from "../../../src/core/opt/vars"
import { repoRoot } from "../../helpers"

const ranges = parse(
  readFileSync(join(repoRoot, "configs", "material_ranges.yaml"), "utf8"),
)
const RANGE_KEYS = [
  "primer_gptes_molfrac",
  "primer_dft_um",
  "midcoat_pvc",
  "midcoat_tio2_fraction",
  "midcoat_dft_um",
  "topcoat_mtes_molfrac",
  "topcoat_dft_um",
]

test("nineVariablesInFixedOrder", () => {
  expect(VARS.map((v) => v.id)).toEqual([
    "p1",
    "p2",
    "m1",
    "m2",
    "m3",
    "t1",
    "t2",
    "d_tio2_um",
    "d_baso4_um",
  ])
  for (const v of VARS) {
    expect(v.lo).toBeLessThan(v.hi)
    expect(v.h).toBeGreaterThan(0)
    expect(v.h).toBeLessThan(0.5)
  }
})

test("ingredientBoundsEqualMaterialRanges", () => {
  RANGE_KEYS.forEach((k, i) => {
    expect(VARS[i]?.lo).toBe(ranges[k].min)
    expect(VARS[i]?.hi).toBe(ranges[k].max)
  })
})

test("scaledRoundTrip", () => {
  fc.assert(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
        minLength: 9,
        maxLength: 9,
      }),
      (u) => {
        const x = fromScaled(Float64Array.from(u))
        const back = toScaled(x)
        for (let i = 0; i < 9; i++) {
          expect(Math.abs((back[i] as number) - (u[i] as number))).toBeLessThan(
            1e-12,
          )
          expect(x[i] as number).toBeGreaterThanOrEqual(VARS[i]?.lo as number)
          expect(x[i] as number).toBeLessThanOrEqual(VARS[i]?.hi as number)
        }
      },
    ),
  )
})

test("scaledEndpoints", () => {
  expect(Array.from(toScaled(VARS.map((v) => v.lo)))).toEqual(Array(9).fill(0))
  expect(Array.from(toScaled(VARS.map((v) => v.hi)))).toEqual(Array(9).fill(1))
  expect(fromScaled(new Float64Array(9).fill(1))).toEqual(VARS.map((v) => v.hi))
})

test("scalingRejectsWrongLength", () => {
  expect(() => toScaled([1, 2])).toThrow(RangeError)
  expect(() => fromScaled(new Float64Array(3))).toThrow(RangeError)
})

test("constraintsSignConvention", () => {
  const x = VARS.map((v) => 0.5 * (v.lo + v.hi))
  const ok = constraints(x, 0.45, 332, 0.2)
  expect(ok).toHaveLength(3)
  for (const c of ok) expect(c).toBeLessThanOrEqual(0)
  // PVC above CPVC
  expect((constraints(x, 0.15, 332, 0.2)[0] as number) > 0).toBe(true)
  // total DFT above the cap: 7 + 200 + 11.5 = 218.5
  expect((constraints(x, 0.45, 200, 0.2)[1] as number) > 0).toBe(true)
  // delamination above 0.5
  expect((constraints(x, 0.45, 332, DELAM_MAX + 0.01)[2] as number) > 0).toBe(
    true,
  )
  // exactly on a bound is feasible (c = 0)
  expect(constraints(x, x[2] as number, 332, DELAM_MAX)[0]).toBe(0)
  expect(DELAM_MAX).toBe(0.5)
})

test("constraintsAreContinuousAndScaleFree", () => {
  const x = VARS.map((v) => 0.5 * (v.lo + v.hi))
  const a = constraints(x, 0.45, 332, 0.2)[1] as number
  const y = x.slice()
  y[4] = (y[4] as number) + 1e-9
  const b = constraints(y, 0.45, 332, 0.2)[1] as number
  expect(Math.abs(b - a)).toBeLessThan(1e-9)
  // normalised by the cap: a 1 um excess is of order 1/cap, not 1
  const c = constraints(
    y.map((v, i) => (i === 4 ? 331 : v)),
    0.45,
    332,
    0.2,
  )[1]
  expect(Math.abs(c as number)).toBeLessThan(1)
})

test("checkInBoxAcceptsBoundsAndRejectsOutside", () => {
  expect(() => checkInBox(VARS.map((v) => v.lo))).not.toThrow()
  expect(() => checkInBox(VARS.map((v) => v.hi))).not.toThrow()
  const x = VARS.map((v) => 0.5 * (v.lo + v.hi))
  x[7] = 0.5 // above the TiO2 grade bound 0.40
  expect(() => checkInBox(x)).toThrow(ConfigError)
  const y = VARS.map((v) => 0.5 * (v.lo + v.hi))
  y[0] = Number.NaN
  expect(() => checkInBox(y)).toThrow(ConfigError)
  expect(() => checkInBox([1, 2, 3])).toThrow(ConfigError)
})
