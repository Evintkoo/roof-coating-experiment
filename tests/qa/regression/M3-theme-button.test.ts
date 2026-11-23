// Regression for docs/qa/bugs.md M3: the Theme button does not cover the nav bar at 390 and 768 px. Fails on pre-fix commit 041ab2d.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close(), 120_000)

test("themeButtonAndNavBarDoNotOverlapBelowTheWideLayout", async () => {
  for (const width of [390, 768]) {
    const page = await qa.open({ width })
    const o = await page.evaluate(() => {
      const r = (s: string) =>
        (document.querySelector(s) as HTMLElement).getBoundingClientRect()
      const a = r(".tv-rail")
      const b = r(".page__tools")
      const cover =
        Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      const nav = document.querySelector(".tv-rail") as HTMLElement
      return {
        cover,
        reach: nav.scrollWidth - nav.clientWidth,
        links: nav.querySelectorAll("a.tv-navlink").length,
      }
    })
    expect(o.cover, `${width}px overlap area`).toBe(0)
    expect(o.links).toBeGreaterThanOrEqual(7)
  }
}, 60_000)
