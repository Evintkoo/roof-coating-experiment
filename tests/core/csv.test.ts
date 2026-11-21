import { expect, test } from "bun:test"
import fc from "fast-check"
import { coerceCell, parseCsv, toCsv } from "../../src/core/csv"
import { DataError } from "../../src/core/errors"
import { RESULT_NAN_COLUMNS } from "../../src/core/schema"

const dataKey = (fn: () => unknown): string | undefined => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(DataError)
    return (e as DataError).key
  }
  throw new Error("expected DataError")
}

test("emptyCellRoundTripsToNaNOnlyInAllowedColumns", () => {
  const nan = new Set(["a"])
  const csv = toCsv(["a"], [{ a: Number.NaN }], { nanColumns: nan })
  expect(csv).toBe("a\n\n")
  expect(coerceCell("a", "", { nanColumns: nan })).toBeNaN()
  expect(
    dataKey(() => toCsv(["b"], [{ b: Number.NaN }], { nanColumns: nan })),
  ).toBe("b")
  expect(dataKey(() => coerceCell("b", "", { nanColumns: nan }))).toBe("b")
  expect(RESULT_NAN_COLUMNS.has("r_solar_pred")).toBe(true)
  expect(RESULT_NAN_COLUMNS.has("feasible")).toBe(false)
  expect(RESULT_NAN_COLUMNS.has("scenario_id")).toBe(false)
  expect(RESULT_NAN_COLUMNS.has("candidate_id")).toBe(false)
})

test("infCellRoundTripsOnlyForGelTime", () => {
  expect(
    toCsv(["gel_time_rel"], [{ gel_time_rel: Number.POSITIVE_INFINITY }]),
  ).toBe("gel_time_rel\ninf\n")
  expect(coerceCell("gel_time_rel", "inf")).toBe(Number.POSITIVE_INFINITY)
  expect(dataKey(() => coerceCell("cost_proxy", "inf"))).toBe("cost_proxy")
  expect(
    dataKey(() =>
      toCsv(["cost_proxy"], [{ cost_proxy: Number.POSITIVE_INFINITY }]),
    ),
  ).toBe("cost_proxy")
  expect(
    dataKey(() =>
      toCsv(["gel_time_rel"], [{ gel_time_rel: Number.NEGATIVE_INFINITY }]),
    ),
  ).toBe("gel_time_rel")
  expect(dataKey(() => coerceCell("x", "abc"))).toBe("x")
  expect(dataKey(() => coerceCell("x", "Infinity"))).toBe("x")
})

test("csvUsesDotDecimalRegardlessOfLocale", () => {
  const orig = Number.prototype.toLocaleString
  Number.prototype.toLocaleString = () => "1,5"
  try {
    expect(toCsv(["a"], [{ a: 1.5 }])).toBe("a\n1.5\n")
    expect(parseCsv("a\n1.5\n")).toEqual([{ a: "1.5" }])
    expect(coerceCell("a", "1.5")).toBe(1.5)
  } finally {
    Number.prototype.toLocaleString = orig
  }
})

test("csvRoundTripExact", () => {
  fc.assert(
    fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (x) => {
      const rows = parseCsv(toCsv(["v"], [{ v: x }]))
      // -0 prints as "0"; numerically equal under ===
      expect(Number(rows[0]?.v) === x).toBe(true)
      expect(coerceCell("v", rows[0]?.v ?? "")).toBe(x === 0 ? 0 : x)
    }),
    { numRuns: 500 },
  )
})

test("parseCsvRaggedRowsThrow", () => {
  expect(dataKey(() => parseCsv("a,b\n1\n"))).toBeDefined()
  expect(dataKey(() => parseCsv("a,b\n1,2,3\n"))).toBeDefined()
  expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([{ a: "1", b: "2" }])
  expect(parseCsv("a,b\n")).toEqual([])
})

test("toCsvRejectsUnsafeStringsAndBooleans", () => {
  expect(toCsv(["a", "b"], [{ a: "x", b: true }])).toBe("a,b\nx,true\n")
  expect(dataKey(() => toCsv(["a"], [{ a: "x,y" }]))).toBe("a")
  expect(dataKey(() => toCsv(["a"], [{ a: "x\ny" }]))).toBe("a")
  expect(dataKey(() => toCsv(["a"], [{}]))).toBe("a")
})
