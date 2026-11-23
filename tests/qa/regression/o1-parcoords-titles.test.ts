// Regression (owner review, plan 07): the parallel-coordinates axis titles of the three PROXY axes ran to three lines and printed over
// the top range value of their axis. Titles are two lines at most and no title touches an axis range number (1280 and 390 px).
import { afterAll, beforeAll, expect, test } from "bun:test"
import { figText, type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close(), 120_000)

test("parcoordsAxisTitlesDoNotTouchTheRangeNumbers", async () => {
  for (const width of [1280, 390]) {
    const page = await qa.open({ width })
    const f = await figText(
      page,
      "fig-parcoords",
      "text.axis-title, text.axis-extent-top-text",
    )
    const titles = f.boxes.filter((b) => !/^[\d.]+$/.test(b.text))
    const tops = f.boxes.filter((b) => /^[\d.]+$/.test(b.text))
    expect(titles.length, `${width}px`).toBe(5)
    expect(tops.length, `${width}px`).toBe(5)
    // a text box carries about 2 px of line gap; a third title line pushes the box 10 px into the number
    for (const [k, t] of titles.entries())
      expect(t.t + t.h, `${width}px ${t.text}`).toBeLessThan(
        (tops[k] as { t: number }).t + 4,
      )
  }
}, 120_000)
