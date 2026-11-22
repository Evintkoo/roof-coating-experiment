// Regression for docs/qa/bugs.md m10 (recorded against the snapshot's older toggle): the toggle exposes its state with aria-pressed and the
// choice survives a reload. The toggle of src/web/design/theme.ts already does both; this pins it on the built page.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("toggleStateIsExposedAndPersistsAcrossReload", async () => {
  const page = await qa.open()
  const btn = page.locator("#theme-toggle")
  expect(await btn.getAttribute("aria-pressed")).toBe("false")
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("light")
  await btn.click()
  expect(await btn.getAttribute("aria-pressed")).toBe("true")
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("dark")
  await page.reload()
  await page.waitForFunction(
    () => document.getElementById("theme-toggle") !== null,
  )
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("dark")
  expect(await page.locator("#theme-toggle").getAttribute("aria-pressed")).toBe(
    "true",
  )
}, 60_000)
