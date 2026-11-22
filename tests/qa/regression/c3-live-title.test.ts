// Regression for docs/qa/bugs.md c3: the live temperature chart's y-axis title is not clipped. Pre-fix commit 25d1885: "ce temperature (C), band = ...".
import { afterAll, beforeAll, expect, test } from "bun:test"
import { figText, outside, type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("liveTemperatureYAxisTitleFitsTheFigure", async () => {
  const page = await qa.open()
  const f = await figText(page, "fig-live-tofT", ".g-ytitle text, .ytitle")
  expect(f.boxes.length).toBe(1)
  expect(outside(f.boxes, f.w, f.h)).toEqual([])
}, 90_000)
