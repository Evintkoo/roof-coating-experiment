import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import { intervalBar } from "../../../../src/web/design/molecules/intervalBar"
import { stat } from "../../../../src/web/design/molecules/stat"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const ok = {
  lo: 14.3,
  hi: 14.5,
  value: 14.4,
  min: 0,
  max: 20,
  label: "Cooling",
  unit: "K",
  digits: 1,
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R6 IntervalBar", [])
})

test("drawsBandCapsAndMarkerAtTheRightPercentAndNamesTheUncertainty", async () => {
  const html = intervalBar(ok)
  const els = await elementsOf(html)
  const track = els.find((e) => e.attrs.role === "img")
  expect(track?.attrs["aria-label"]).toBe(
    "Cooling: 14.4 K, parameter uncertainty only 14.3 to 14.5 K, on a scale from 0 to 20 K",
  )
  expect(html).toContain("left:71.5%;width:1%")
  expect(html).toContain("left:72%") // marker
  expect(html).toContain("parameter uncertainty only: 14.3 to 14.5 K")
  expect(html).toContain("tv-interval__cap")
  expect(html).toContain("tv-interval__mark")
  expect(html).toContain(">0 K<")
  expect(html).toContain(">20 K<")
})

test("barsOnTheSameScaleAreComparable", () => {
  const a = intervalBar({ ...ok, lo: 5, hi: 10, value: 7, min: 0, max: 20 })
  const b = intervalBar({ ...ok, lo: 10, hi: 15, value: 12, min: 0, max: 20 })
  expect(a).toContain("left:25%;width:25%")
  expect(b).toContain("left:50%;width:25%")
})

test("statDrawsTheBarWhenGivenAnAxis", () => {
  const html = stat({
    label: "Cooling",
    value: 14.4,
    unit: "K",
    digits: 1,
    tone: "interval",
    interval: { lo: 14.3, hi: 14.5 },
    axis: { min: 0, max: 20 },
  })
  expect(html).toContain("data-interval-bar")
  expect(html.match(/parameter uncertainty only:/g)?.length).toBe(1)
})

test("invalidScalesAndIntervalsAreBuildErrorsF7", () => {
  for (const bad of [
    { min: 5, max: 5 },
    { min: 20, max: 0 },
    { lo: 15, hi: 14 },
    { lo: -1 },
    { hi: 21 },
    { value: 25 },
    { value: Number.NaN },
    { label: "" },
  ])
    expectBuildError(() => intervalBar({ ...ok, ...bad }), "IntervalBar")
})

test("escapesLabelAndUnitF8", async () => {
  const html = intervalBar({ ...ok, label: XSS, unit: XSS })
  expect((await elementsOf(html)).some((e) => e.tag === "img")).toBe(false)
})

test("cssIsTokenOnlyAndPrintKeepsTheTrack", () => {
  expectTokenOnly(MOLECULE_CSS.intervalBar)
  expect(MOLECULE_CSS.intervalBar).toContain("@media print")
  expect(MOLECULE_CSS.intervalBar).toContain("35%")
})
