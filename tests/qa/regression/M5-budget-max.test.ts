// Regression for docs/qa/bugs.md M5: the budget slider reaches the dearest tabulated recipe (End key, typed value; the priority chips were removed by the m5 decision).
// Pre-fix commit f37a4c2: the rounded range value was 4e-16 below the table's c_max, so the lookup returned the second-highest tier.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

const read = (page: Awaited<ReturnType<QaBrowser["open"]>>) =>
  page.evaluate(() => {
    const root = document.getElementById("budget-panel") as HTMLElement
    const sentence = (root.querySelector(".tv-budget__sentence") as HTMLElement)
      .textContent as string
    const m = /cost ([0-9.]+) .*headroom ([0-9.]+)/.exec(sentence)
    return {
      cost: Number(m?.[1]),
      head: Number(m?.[2]),
      max: Number(
        (root.querySelector("input[type=range]") as HTMLInputElement).max,
      ),
    }
  })

test("endKeyAndTypedMaximumSelectTheDearestRecipe", async () => {
  const page = await qa.open()
  const range = page.locator("#budget-panel-budget")
  const num = page.locator("#budget-panel-budget-num")
  await range.focus()
  await page.keyboard.press("End")
  let r = await read(page)
  expect(r.head, "End key headroom").toBe(0)
  expect(r.cost).toBeCloseTo(r.max, 2)
  // another tier first, then a typed over-range value and blur: the clamped value is the true maximum
  await page.keyboard.press("Home")
  await num.fill("99")
  await num.blur()
  r = await read(page)
  expect(r.head, "typed maximum headroom").toBe(0)
}, 60_000)
