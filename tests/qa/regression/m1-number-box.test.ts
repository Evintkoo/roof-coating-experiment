// Regression for docs/qa/bugs.md m1: the live number box and the simulated value never disagree silently. An empty, minus or
// out-of-range entry leaves the previous result on screen and marks the box invalid; blur restores a valid clamped value and the
// result matches it. Pre-fix commit 39adac6: empty/NaN flipped the whole result to the midpoint while the user retyped.
import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  openLive,
  type QaBrowser,
  settled,
  startQa,
} from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("invalidEntriesKeepTheResultAndBlurRestoresAValidValue", async () => {
  const page = await qa.open()
  await openLive(page)
  const box = page.locator("#live-num-midcoat_tio2_fraction")
  const nominal = () =>
    page.evaluate(() =>
      Number(
        (document.getElementById("tile-r_solar") as HTMLElement).dataset
          .nominal,
      ),
    )
  await box.fill("0.3")
  await settled(page)
  const at03 = await nominal()
  for (const bad of ["", "-", "-5", "999999"]) {
    await box.focus()
    await box.evaluate((e) => (e as HTMLInputElement).select())
    if (bad === "") await page.keyboard.press("Backspace")
    else await page.keyboard.type(bad)
    await page.waitForTimeout(150)
    await settled(page)
    expect(await nominal(), `entry "${bad}" keeps the result`).toBe(at03)
    expect(
      await box.getAttribute("aria-invalid"),
      `entry "${bad}" is marked`,
    ).toBe("true")
  }
  await box.fill("999999")
  await box.blur()
  await settled(page)
  const shown = Number(await box.inputValue())
  const max = Number(await box.getAttribute("max"))
  expect(shown).toBe(max)
  expect(await box.getAttribute("aria-invalid")).toBeNull()
  const atMax = await nominal()
  await box.fill(String(max))
  await settled(page)
  expect(await nominal(), "result equals the value the box shows").toBe(atMax)
}, 90_000)
