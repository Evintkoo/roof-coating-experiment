// Regression for docs/qa/bugs.md c1: the scatter-matrix axis titles do not overprint or run out of the figure (1280 and 390 px).
// Pre-fix commit 25d1885.
import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  figText,
  outside,
  overlaps,
  type QaBrowser,
  startQa,
} from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("splomAxisTitlesAreSeparateAndInsideTheFigure", async () => {
  for (const width of [1280, 390]) {
    const page = await qa.open({ width })
    const f = await figText(
      page,
      "fig-splom",
      '.infolayer [class*="g-x"][class*="title"] text, .infolayer [class*="g-y"][class*="title"] text',
    )
    expect(f.boxes.length, `${width}px`).toBeGreaterThanOrEqual(4)
    expect(overlaps(f.boxes), `${width}px overlaps`).toEqual([])
    expect(outside(f.boxes, f.w, f.h), `${width}px clipped`).toEqual([])
  }
}, 120_000)
