// Plan 06 Task 4: the molecules and organisms in a real Chrome (Playwright library inside bun:test). One suite body, two sizes
// (docs/testing.md): the fast tier checks behaviour and the gallery in both themes; the proof tier adds the heavier checks.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { lookupBudget } from "../../src/core/opt/budgetTable"
import { SLIDER_SCRIPT } from "../../src/web/design/molecules/sliderField"
import { budgetPanel } from "../../src/web/design/organisms/budgetPanel"
import {
  dataTable,
  TABLE_SORT_SCRIPT,
} from "../../src/web/design/organisms/dataTable"
import { repoRoot } from "../helpers"
import { BrowserFixture } from "../support/browserFixture"
import { BUDGET_TEST_TABLES, budgetRecipe } from "../support/budgetFixture"
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

  reg(
    "budgetPanelUpdatesItsLiveRegionFromTheSliderTheNumberBoxAndTheChips",
    false,
    async () => {
      const built = await Bun.build({
        entrypoints: [join(repoRoot, "tests/support/budgetMountEntry.ts")],
        target: "browser",
      })
      expect(built.success).toBe(true)
      const bundle = await (built.outputs[0] as Blob).text()
      const lookup = (profile: string, budget: number) => {
        const t = BUDGET_TEST_TABLES.find((x) => x.profile === profile)
        if (!t) throw new RangeError("no table")
        const r = lookupBudget(t, budget)
        if (r.status === "infeasible")
          return { status: "infeasible" as const, c_min: r.c_min }
        return {
          status: "ok" as const,
          cost: r.entry.cost,
          headroom: r.headroom,
          knee: t.knee_budget,
          recipe: budgetRecipe(profile, r.entry.cost),
        }
      }
      const html = budgetPanel({
        id: "budget",
        profiles: [
          { id: "cooling", label: "Cooling first" },
          { id: "balanced", label: "Balanced" },
        ],
        profile: "balanced",
        budget: { min: 0.2, max: 1, step: 0.01, value: 0.5 },
        lookup,
      })
      for (const scheme of ["dark", "light"] as const) {
        const page = await fx.open(html, [SLIDER_SCRIPT, bundle], { scheme })
        await page.waitForFunction(
          () => (window as unknown as { __ready?: boolean }).__ready === true,
        )
        const region = page.locator("[data-budget-result]")
        expect(await region.getAttribute("aria-live")).toBe("polite")
        expect(await region.textContent()).toContain("cost 0.48")
        // the slider moves the lookup (keyboard on the range)
        await page.locator("#budget-budget").focus()
        for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight") // 0.5 -> 0.7
        expect(await page.locator("#budget-budget-num").inputValue()).toBe(
          "0.7",
        )
        expect(await page.locator("#budget-budget-out").textContent()).toBe(
          "0.70",
        )
        expect(await region.textContent()).toContain("cost 0.66")
        // typing a number below the cheapest tabulated recipe is infeasible, and is clamped to the slider range on change
        await page.locator("#budget-budget-num").fill("0.25")
        expect(await region.textContent()).toContain(
          "cheapest tabulated recipe costs 0.30",
        )
        await page.locator("#budget-budget-num").fill("5")
        await page.locator("#budget-budget-num").blur()
        expect(await page.locator("#budget-budget").inputValue()).toBe("1")
        expect(await region.textContent()).toContain("cost 0.90")
        // the profile chip switches the table and exactly one chip stays pressed
        await page.getByRole("button", { name: "Cooling first" }).click()
        expect(
          await page
            .locator(".tv-chip--toggle")
            .evaluateAll((els) =>
              els.map((e) => e.getAttribute("aria-pressed")),
            ),
        ).toEqual(["true", "false"])
        expect(await region.textContent()).toContain("14.4")
        const w = fx.watch(page)
        expect(w.errors).toEqual([])
        expect(w.failed).toEqual([])
        await page.context().close()
      }
    },
  )
}
