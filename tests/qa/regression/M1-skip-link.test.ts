// Regression for docs/qa/bugs.md M1: the skip link is visible when focused (it was painted under the rail). Fails on pre-fix commit 041ab2d.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close(), 120_000)

test("skipLinkIsTheTopElementWhenFocused", async () => {
  for (const width of [390, 1280]) {
    const page = await qa.open({ width })
    await page.keyboard.press("Tab")
    const hit = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement
      const r = a.getBoundingClientRect()
      const top = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      )
      return { cls: a.className, topIsSkip: top === a || a.contains(top) }
    })
    expect(hit.cls, `${width}px`).toBe("tv-skip")
    expect(hit.topIsSkip, `${width}px`).toBe(true)
  }
}, 60_000)
