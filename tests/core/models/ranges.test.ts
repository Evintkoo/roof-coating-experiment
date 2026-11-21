import { afterEach, expect, test } from "bun:test"
import { PhysicsRangeError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import { requireArrayIn, requireIn } from "../../../src/core/models/ranges"

afterEach(() => setEventSink(null))

test("edgesInclusive", () => {
  expect(requireIn("m", "q", 0, 0, 1)).toBe(0)
  expect(requireIn("m", "q", 1, 0, 1)).toBe(1)
  expect(requireArrayIn("m", "q", Float64Array.of(0, 0.5, 1), 0, 1)).toEqual(
    Float64Array.of(0, 0.5, 1),
  )
  expect(() => requireIn("m", "q", 1 + Number.EPSILON, 0, 1)).toThrow(
    PhysicsRangeError,
  )
  expect(() => requireIn("m", "q", -Number.EPSILON, 0, 1)).toThrow(
    PhysicsRangeError,
  )
})

test("outsideThrowsCode4PhaseModel", () => {
  try {
    requireIn("barrier", "dft", 5, 0, 1)
    throw new Error("did not throw")
  } catch (e) {
    expect(e).toBeInstanceOf(PhysicsRangeError)
    const err = e as PhysicsRangeError
    expect(err.code).toBe(4)
    expect(err.phase).toBe("model")
    expect(err.key).toBe("dft")
  }
})

test("eventEmittedWithFields", () => {
  const got: unknown[] = []
  setEventSink((e, l, f) => got.push([e, l, f]))
  expect(() => requireIn("barrier", "dft", 5, 0, 1)).toThrow()
  expect(got).toEqual([
    [
      "model.out_of_range",
      "error",
      { model: "barrier", quantity: "dft", value: 5, lo: 0, hi: 1 },
    ],
  ])
  got.length = 0
  expect(() =>
    requireArrayIn("optics", "n", Float64Array.of(0.5, 3), 0, 1),
  ).toThrow(PhysicsRangeError)
  expect(got).toEqual([
    [
      "model.out_of_range",
      "error",
      { model: "optics", quantity: "n[1]", value: 3, lo: 0, hi: 1 },
    ],
  ])
})

test("nanRejected", () => {
  const got: Array<Record<string, unknown>> = []
  setEventSink((_e, _l, f) => got.push(f))
  expect(() => requireIn("m", "q", Number.NaN, 0, 1)).toThrow(PhysicsRangeError)
  expect(() =>
    requireArrayIn("m", "q", Float64Array.of(0.5, Number.NaN), 0, 1),
  ).toThrow(PhysicsRangeError)
  expect(got.length).toBe(2)
  expect(got[0]?.value).toBeNaN()
})
