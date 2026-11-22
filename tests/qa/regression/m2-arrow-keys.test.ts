// Regression for docs/qa/bugs.md m2: the arrow keys step a fractional number box. Pre-fix commit 39adac6: step="any" gave step 1.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { openLive, type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("arrowUpRaisesAFractionalBoxByItsStep", async () => {
  const page = await qa.open()
  await openLive(page)
  const box = page.locator("#live-num-midcoat_tio2_fraction")
  await box.fill("0.5")
  await box.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp")
  const v = Number(await box.inputValue())
  expect(v).toBeGreaterThan(0.5)
  const step = Number(await box.getAttribute("step"))
  expect(step).toBeGreaterThan(0)
  expect(v).toBeCloseTo(0.5 + 3 * step, 6)
}, 60_000)
