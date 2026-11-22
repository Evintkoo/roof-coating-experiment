import { expect, test } from "bun:test"
import { join } from "node:path"
import { DataError } from "../../../src/core/errors"
import {
  loadFindingsInput,
  shortlistFromCards,
} from "../../../src/node/report/findingsInput"
import { REPORT_FIXTURE } from "../../helpers"

const RUN = REPORT_FIXTURE

test("readsTheRealRunIntoTypedInput", () => {
  const i = loadFindingsInput(RUN)
  expect(i.results.length).toBe(96 * 9)
  expect(i.controls.some((c) => c.control_id === "C0")).toBe(true)
  expect(i.shortlist).toEqual({
    balanced: "SP-031",
    high_performing: "SP-075",
    low_cost: "SP-046",
  })
  expect(i.refine?.length).toBe(3)
  expect(i.budget?.tables.length).toBe(3)
  expect(i.indonesia?.summary.length).toBeGreaterThan(0)
  expect(i.indonesia?.loss_lo).toBe(0.14)
})

test("optionalPartsAreAbsentWhenTheirFilesAre", () => {
  expect(shortlistFromCards(join(RUN, "no-such-dir"))).toEqual({})
  expect(() => loadFindingsInput(join(RUN, "no-such-dir"))).toThrow(DataError)
})
