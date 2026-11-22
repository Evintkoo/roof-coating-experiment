// Regression for docs/qa/bugs.md M4: the charts read on a phone and the curve legends do not overprint. (a) parallel-coordinates axis
// titles at 390 px, (b) the day-2 temperature labels (17 entries in 256 px), (c) the spectrum labels, SP-075 included.
// Pre-fix commit 25d1885: titles overprinted, labels stacked on each other, the SP-075 spectrum labels missing.
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

test("parallelCoordinatesTitlesDoNotOverprintAtPhoneWidth", async () => {
  const page = await qa.open({ width: 390 })
  const f = await figText(page, "fig-parcoords", ".axis-title")
  expect(f.boxes.length).toBe(5)
  expect(overlaps(f.boxes)).toEqual([])
  expect(outside(f.boxes, f.w, f.h)).toEqual([])
}, 90_000)

test("curveLabelsNeitherOverprintNorClipAtDesktopAndPhoneWidth", async () => {
  for (const width of [1280, 390]) {
    const page = await qa.open({ width })
    for (const id of ["fig-tofT", "fig-spectrum"]) {
      const f = await figText(page, id, "g.annotation text")
      expect(
        f.boxes.length,
        `${id} ${width}px has labels`,
      ).toBeGreaterThanOrEqual(5)
      expect(overlaps(f.boxes), `${id} ${width}px overlaps`).toEqual([])
      expect(outside(f.boxes, f.w, f.h), `${id} ${width}px clipped`).toEqual([])
    }
    const spec = await figText(page, "fig-spectrum", "g.annotation text")
    expect(
      spec.boxes.some((b) => b.text.includes("SP-075")),
      "SP-075 label on the spectrum",
    ).toBe(true)
  }
}, 120_000)
