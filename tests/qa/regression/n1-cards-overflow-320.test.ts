// Regression for a defect found by `bun run qa` (not in docs/qa/bugs.md): with every disclosure open the three full candidate cards
// pushed the page 14 px wider than a 320 px screen. Pre-fix commit 1fe8a4e.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("noSidewaysScrollAt320WithEveryDisclosureOpen", async () => {
  const page = await qa.open({ width: 320 })
  await page.evaluate(() => {
    for (const d of document.querySelectorAll("details")) d.open = true
  })
  await page.waitForTimeout(500)
  const w = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    view: innerWidth,
  }))
  expect(w.doc).toBeLessThanOrEqual(w.view)
}, 60_000)
