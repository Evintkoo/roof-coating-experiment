import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  LANE_STATES,
  laneItems,
  laneMeter,
} from "../../../../src/web/design/molecules/laneMeter"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R31 LaneMeter", LANE_STATES)
})

test("oneItemPerLaneWithItsStateInWords", async () => {
  const html = laneMeter({
    total: 864,
    lanes: LANE_STATES.map((state, id) => ({ id, state, tasks: id * 100 })),
  })
  const items = (await elementsOf(html)).filter((e) => e.tag === "li")
  expect(items.map((i) => i.attrs["data-state"])).toEqual([...LANE_STATES])
  expect(html).toContain("failed")
  expect(html).toContain("Worker 1")
  expect(html).toContain("300 cells")
})

test("theInlineLaneIsCalledSingleLaneAndTheBarIsClamped", () => {
  const h = laneItems(
    [{ id: 0, state: "busy", tasks: 5000, inline: true }],
    864,
  )
  expect(h).toContain("Single lane")
  expect(h).toContain("width:100%")
})

test("badInputIsABuildErrorF9", () => {
  expectBuildError(
    () => laneItems([{ id: 0, state: "dead" as never, tasks: 0 }], 10),
    "LaneMeter",
  )
  expectBuildError(() => laneItems([], 0), "LaneMeter")
  expectBuildError(
    () => laneItems([{ id: 0, state: "idle", tasks: Number.NaN }], 10),
    "LaneMeter",
  )
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(MOLECULE_CSS.laneMeter)
})
