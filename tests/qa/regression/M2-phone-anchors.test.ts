// Regression for docs/qa/bugs.md M2: after a nav link on a phone the section heading is not under the sticky bar. Fails on pre-fix commit 041ab2d.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close(), 120_000)

test("everySectionHeadingClearsTheStickyBarOnAPhone", async () => {
  const page = await qa.open({ width: 390, height: 800 })
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll(".tv-rail a.tv-navlink")].map((a) =>
      (a as HTMLAnchorElement).hash.slice(1),
    ),
  )
  expect(ids.length).toBeGreaterThanOrEqual(7)
  for (const id of ids) {
    await page.evaluate((i) => {
      document.documentElement.style.scrollBehavior = "auto"
      location.hash = ""
      location.hash = i
    }, id)
    await page.waitForTimeout(80)
    const g = await page.evaluate((i) => {
      const sec = document.getElementById(i) as HTMLElement
      const h = (sec.querySelector("h2") ?? sec) as HTMLElement
      return {
        top: h.getBoundingClientRect().top,
        bar: (
          document.querySelector(".tv-rail") as HTMLElement
        ).getBoundingClientRect().bottom,
      }
    }, id)
    expect(g.top, id).toBeGreaterThanOrEqual(g.bar)
  }
}, 60_000)
