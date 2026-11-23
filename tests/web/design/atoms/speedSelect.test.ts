import { expect, test } from "bun:test"
import {
  parseSpeed,
  SPEEDS,
  speedSelect,
} from "../../../../src/web/design/atoms/speedSelect"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R26 SpeedSelect", SPEEDS.map(String))
})

test("hasOneOptionPerSpeedAndTheGivenOneSelected", async () => {
  for (const value of SPEEDS) {
    const els = await elementsOf(speedSelect({ value }))
    expect(els.map((e) => e.tag)).toEqual([
      "label",
      "span",
      "select",
      ...SPEEDS.map(() => "option"),
    ])
    const selected = els.filter(
      (e) => e.tag === "option" && "selected" in e.attrs,
    )
    expect(selected.map((e) => e.attrs.value)).toEqual([String(value)])
  }
})

test("anyOtherSpeedIsABuildErrorF11", () => {
  for (const v of [0, -1, Number.NaN, 3, 8])
    expectBuildError(() => speedSelect({ value: v as never }), "SpeedSelect")
  expect(parseSpeed("0.5")).toBe(0.5)
  expect(parseSpeed("4")).toBe(4)
  expectBuildError(() => parseSpeed("-2"), "SpeedSelect")
  expectBuildError(() => parseSpeed("abc"), "SpeedSelect")
})
