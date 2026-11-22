// Plan 06 Task 4: the molecules and organisms in a real Chrome (Playwright library inside bun:test). One suite body, two sizes
// (docs/testing.md): the fast tier checks behaviour and the gallery in both themes; the proof tier adds the heavier checks.
import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  dataTable,
  TABLE_SORT_SCRIPT,
} from "../../src/web/design/organisms/dataTable"
import { BrowserFixture } from "../support/browserFixture"
import type { Tier } from "./scale"

export type ComponentsBrowserScale = { tier: Tier }
export const COMPONENTS_FAST: ComponentsBrowserScale = { tier: "fast" }
export const COMPONENTS_PROOF: ComponentsBrowserScale = { tier: "proof" }

const PER_TEST_MS = 60_000

export function designComponentsBrowserSuite(S: ComponentsBrowserScale): void {
  const fx = new BrowserFixture()
  const reg = (name: string, proofOnly: boolean, fn: () => Promise<void>) => {
    if (proofOnly && S.tier !== "proof") return
    test(name, fn, PER_TEST_MS)
  }
  beforeAll(() => fx.start())
  afterAll(() => fx.stop())

  reg("sortableTableSortsFromTheKeyboardAndSetsAriaSort", false, async () => {
    const html = dataTable({
      id: "t",
      caption: "Recipes",
      columns: [
        {
          key: "name",
          label: "Recipe",
          kind: "text",
          rowHeader: true,
          sortable: true,
        },
        {
          key: "cool",
          label: "Cooling",
          unit: "K",
          kind: "number",
          digits: 1,
          sortable: true,
        },
      ],
      rows: [
        { name: "b", cool: 13.6 },
        { name: "a", cool: 14.4 },
        { name: "c", cool: null },
        { name: "d", cool: 9.1 },
      ],
    })
    const page = await fx.open(html, [TABLE_SORT_SCRIPT])
    const names = () =>
      page.$$eval("tbody tr th", (els) => els.map((e) => e.textContent))
    const sortAttr = () =>
      page.$$eval("th[aria-sort]", (els) =>
        els.map((e) => e.getAttribute("aria-sort")),
      )
    expect(await names()).toEqual(["b", "a", "c", "d"])
    // keyboard: Tab to the first sort button (the scroll region comes first), Enter sorts the name column
    const btn = page.locator(".tv-table__sort").nth(1)
    await btn.focus()
    await page.keyboard.press("Enter")
    expect(await sortAttr()).toEqual(["none", "ascending"])
    expect(await names()).toEqual(["d", "b", "a", "c"]) // 9.1, 13.6, 14.4, empty last
    await page.keyboard.press("Space")
    expect(await sortAttr()).toEqual(["none", "descending"])
    expect(await names()).toEqual(["a", "b", "d", "c"]) // empty stays last
    await page.keyboard.press("Enter")
    expect(await sortAttr()).toEqual(["none", "none"])
    expect(await names()).toEqual(["b", "a", "c", "d"]) // original order restored
    // sorting another column resets the first
    await page.locator(".tv-table__sort").nth(0).focus()
    await page.keyboard.press("Enter")
    expect(await names()).toEqual(["a", "b", "c", "d"])
    expect(await sortAttr()).toEqual(["ascending", "none"])
    // numeric headers are right-aligned like their cells
    const aligned = await page.evaluate(() => {
      const th = document.querySelectorAll(
        "th[data-kind=number]",
      )[0] as HTMLElement
      const td = document.querySelector("td.tv-cell--number") as HTMLElement
      return [getComputedStyle(th).textAlign, getComputedStyle(td).textAlign]
    })
    expect(aligned).toEqual(["right", "right"])
    const w = fx.watch(page)
    expect(w.errors).toEqual([])
    expect(w.failed).toEqual([])
    await page.context().close()
  })
}
