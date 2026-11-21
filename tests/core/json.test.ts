import { expect, test } from "bun:test"
import { DataError } from "../../src/core/errors"
import { safeJson } from "../../src/core/json"

test("safeJsonThrowsOnNaNAndInfinityNested", () => {
  for (const bad of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    for (const v of [bad, { a: { b: [1, bad] } }, [[bad]]]) {
      let caught: unknown
      try {
        safeJson(v)
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(DataError)
      expect((caught as DataError).key).toBe("json")
      expect((caught as DataError).code).toBe(5)
    }
  }
  expect(safeJson({ a: [1, 2.5] })).toBe('{"a":[1,2.5]}')
  expect(safeJson({ a: 1 }, 2)).toBe('{\n  "a": 1\n}')
})
