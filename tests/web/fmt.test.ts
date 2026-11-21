import { expect, test } from "bun:test"
import { contrastRatio, fmtValue } from "../../src/web/fmt"

test("fmtValueInfinityAndNaN", () => {
  expect(fmtValue(Number.POSITIVE_INFINITY)).toBe("never gels")
  expect(fmtValue(Number.NaN)).toBe("not evaluated")
  expect(fmtValue(Number.NEGATIVE_INFINITY)).toBe("not evaluated")
  expect(fmtValue(0.123456)).toBe("0.123")
  expect(fmtValue(36.318245, 1)).toBe("36.3")
  expect(fmtValue(0, 2)).toBe("0.00")
})

test("contrastRatioKnownValues", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10)
  expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 10)
  expect(contrastRatio("#336699", "#336699")).toBe(1)
  // WCAG reference value: #777777 on white is 4.48
  expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2)
  expect(() => contrastRatio("red", "#fff")).toThrow()
})
