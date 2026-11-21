import { expect, test } from "bun:test"
import fc from "fast-check"
import { PhysicsRangeError } from "../../../src/core/errors"
import { crackIndex } from "../../../src/core/models/shared"

test("crackIndexLimits", () => {
  expect(crackIndex(0.5, 0, 10, 1)).toBe(0)
  // L = h_c: rho=0.5, p=1, h_c0=10 -> h_c=20
  expect(crackIndex(0.5, 20, 10, 1)).toBeCloseTo(1 - Math.exp(-1), 12)
  expect(crackIndex(1, 10, 10, 2)).toBeCloseTo(1 - Math.exp(-1), 12)
  fc.assert(
    fc.property(
      fc.double({ min: 0.01, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1000, noNaN: true }),
      fc.double({ min: 0, max: 1000, noNaN: true }),
      fc.double({ min: 0.1, max: 100, noNaN: true }),
      fc.double({ min: 0.1, max: 4, noNaN: true }),
      (rho, a, b, h0, p) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        const cLo = crackIndex(rho, lo, h0, p)
        const cHi = crackIndex(rho, hi, h0, p)
        return cLo >= 0 && cHi <= 1 && cLo <= cHi
      },
    ),
  )
})

test("crackIndexZeroDensityMeansNoCrack", () => {
  // rho_net = 0 -> h_c = h_c0 * 0^(-p) = Infinity -> crack = 0 for any finite DFT
  expect(crackIndex(0, 50, 10, 1.5)).toBe(0)
  expect(crackIndex(0, 0, 10, 1.5)).toBe(0)
})

test("crackIndexGuardsInputs", () => {
  expect(() => crackIndex(-0.1, 1, 10, 1)).toThrow(PhysicsRangeError)
  expect(() => crackIndex(Number.NaN, 1, 10, 1)).toThrow(PhysicsRangeError)
  expect(() => crackIndex(0.5, -1, 10, 1)).toThrow(PhysicsRangeError)
  expect(() => crackIndex(0.5, 1, 0, 1)).toThrow(PhysicsRangeError)
  expect(() => crackIndex(0.5, 1, 10, 0)).toThrow(PhysicsRangeError)
  expect(() => crackIndex(0.5, Number.POSITIVE_INFINITY, 10, 1)).toThrow(
    PhysicsRangeError,
  )
})
