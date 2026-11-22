// Regression for docs/qa/bugs.md m8: at 320 px the page does not scroll sideways (the Limits button was nowrap). Fails on pre-fix commit 041ab2d.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("noHorizontalScrollAt320", async () => {
  const page = await qa.open({ width: 320 })
  const w = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    view: innerWidth,
  }))
  expect(w.doc).toBeLessThanOrEqual(w.view)
}, 60_000)
