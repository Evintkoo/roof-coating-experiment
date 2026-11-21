import { expect, test } from "bun:test"
import {
  DESIGN_COLUMNS,
  NOT_NAN,
  RESULT_COLUMNS,
  RESULT_NAN_COLUMNS,
} from "../../src/core/columns"

test("resultNanColumnsExcludeDesignAndFlags", () => {
  expect(RESULT_NAN_COLUMNS.has("scenario_id")).toBe(false)
  expect(RESULT_NAN_COLUMNS.has("feasible")).toBe(false)
  for (const c of DESIGN_COLUMNS) expect(RESULT_NAN_COLUMNS.has(c)).toBe(false)
  expect(RESULT_NAN_COLUMNS.has("gel_time_rel")).toBe(true)
  expect(RESULT_NAN_COLUMNS.size + NOT_NAN.size).toBe(RESULT_COLUMNS.length)
})

test("resultColumnsShape", () => {
  expect(RESULT_COLUMNS).toHaveLength(33)
  expect(RESULT_COLUMNS.at(-1)).toBe("feasible")
  expect(new Set(RESULT_COLUMNS).size).toBe(RESULT_COLUMNS.length)
})
