import { expect, test } from "bun:test"
import {
  ConfigError,
  DataError,
  InfeasibleError,
  PhysicsRangeError,
  ResourceError,
  SpandekError,
} from "../../src/core/errors"

test("codesAndPhasesAreDistinct", () => {
  const errs = [
    new ConfigError("k", "m"),
    new InfeasibleError("m"),
    new PhysicsRangeError("k", "m"),
    new DataError("k", "m"),
    new ResourceError("m"),
  ]
  expect(errs.map((e) => e.code)).toEqual([2, 3, 4, 5, 6])
  expect(new Set(errs.map((e) => e.code)).size).toBe(5)
  expect(errs.map((e) => e.phase)).toEqual([
    "config",
    "design",
    "model",
    "data",
    "resource",
  ])
  expect(new Set(errs.map((e) => e.phase)).size).toBe(5)
  for (const e of errs) {
    expect(e).toBeInstanceOf(SpandekError)
    expect(e).toBeInstanceOf(Error)
  }
  expect(errs[0]?.key).toBe("k")
  expect(errs[1]?.key).toBeUndefined()
})
