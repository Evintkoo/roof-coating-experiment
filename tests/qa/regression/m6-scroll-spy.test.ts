// Regression for docs/qa/bugs.md m6: the rail marks the section being read (aria-current on exactly one link, the one whose section
// is in view). Pre-fix commit 407009f^: no link ever had aria-current after any of 8 clicks.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("exactlyOneRailLinkIsCurrentAndItIsTheSectionInView", async () => {
  const page = await qa.open({ width: 1280, height: 800 })
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll(".tv-rail a.tv-navlink")].map((a) =>
      (a as HTMLAnchorElement).hash.slice(1),
    ),
  )
  expect(ids.length).toBeGreaterThanOrEqual(7)
  for (const id of ids) {
    await page.evaluate((i) => {
      document.documentElement.style.scrollBehavior = "auto"
      ;(document.getElementById(i) as HTMLElement).scrollIntoView()
    }, id)
    await page
      .waitForFunction(
        (i) =>
          (
            document.querySelector(
              ".tv-rail [aria-current]",
            ) as HTMLAnchorElement | null
          )?.hash === `#${i}`,
        id,
        { timeout: 3000 },
      )
      .catch(() => undefined)
    const cur = await page.evaluate(() =>
      (
        document.querySelector(".tv-rail [aria-current]") as HTMLAnchorElement
      ).hash.slice(1),
    )
    expect(cur, `at #${id}`).toBe(id)
    expect(await page.locator(".tv-rail [aria-current]").count()).toBe(1)
  }
}, 60_000)
