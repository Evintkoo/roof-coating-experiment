// Plan 06 Task 4: the molecules and organisms in a real Chrome (Playwright library inside bun:test). One suite body, two sizes
// (docs/testing.md): the fast tier checks behaviour and the gallery in both themes; the proof tier adds the heavier checks.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { lookupBudget } from "../../src/core/opt/budgetTable"
import { disclosure } from "../../src/web/design/molecules/disclosure"
import { SLIDER_SCRIPT } from "../../src/web/design/molecules/sliderField"
import { tabs } from "../../src/web/design/molecules/tabs"
import { budgetPanel } from "../../src/web/design/organisms/budgetPanel"
import {
  dataTable,
  TABLE_SORT_SCRIPT,
} from "../../src/web/design/organisms/dataTable"
import { glossary } from "../../src/web/design/organisms/glossary"
import { heroVerdict } from "../../src/web/design/organisms/heroVerdict"
import { navRail } from "../../src/web/design/organisms/navRail"
import { COMPONENT_SCRIPT } from "../../src/web/design/scripts"
import {
  GALLERY_MOLECULES_CSS,
  galleryMoleculeCells,
  galleryMolecules,
} from "../../src/web/design/templates/galleryMolecules"
import {
  GALLERY_ORGANISMS_CSS,
  galleryOrganismCells,
  galleryOrganisms,
} from "../../src/web/design/templates/galleryOrganisms"
import { linkTerms } from "../../src/web/design/terms"
import { repoRoot } from "../helpers"
import { BrowserFixture } from "../support/browserFixture"
import { BUDGET_TEST_TABLES, budgetRecipe } from "../support/budgetFixture"
import { textContrast } from "../support/pageContrast"
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
  beforeAll(() => fx.start(), 120_000)
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

  const T_TAP_PX = 44
  const GALLERY_CSS_ALL = GALLERY_MOLECULES_CSS + GALLERY_ORGANISMS_CSS
  const galleryBody = () => galleryMolecules() + galleryOrganisms()
  const cellCount = () =>
    galleryMoleculeCells().length + galleryOrganismCells().length

  reg(
    "galleryOfEveryMoleculeAndOrganismStateRendersInBothThemes",
    false,
    async () => {
      for (const scheme of ["light", "dark"] as const) {
        const page = await fx.open(
          galleryBody(),
          [COMPONENT_SCRIPT],
          { scheme },
          GALLERY_CSS_ALL,
        )
        const cells = await page.$$eval("[data-atom]", (els) =>
          els.map((e) => {
            const r = (
              e.querySelector(".tv-gallery__sample") as HTMLElement
            ).getBoundingClientRect()
            return {
              key: `${e.getAttribute("data-atom")}/${e.getAttribute("data-state")}`,
              w: r.width,
              h: r.height,
            }
          }),
        )
        expect(cells.length).toBe(cellCount())
        for (const c of cells) {
          expect(c.w, c.key).toBeGreaterThan(0)
          expect(c.h, c.key).toBeGreaterThan(0)
        }
        const base = await page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--tv-surface-base")
            .trim(),
        )
        expect(base).toBe(scheme === "dark" ? "#0b1020" : "#f7f8fa")
        const w = fx.watch(page)
        expect(w.failed).toEqual([])
        expect(w.errors).toEqual([])
        await page.context().close()
      }
    },
  )

  reg("interactiveTargetsAreAtLeast44px", false, async () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await fx.open(
        galleryBody(),
        [COMPONENT_SCRIPT],
        { scheme },
        GALLERY_CSS_ALL,
      )
      const targets = await page.$$eval(
        '[data-interactive="true"] :is(a:not(.tv-term), button, summary, input)',
        (els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect()
            const cell = e.closest("[data-atom]")
            return {
              key: `${cell?.getAttribute("data-atom")}/${cell?.getAttribute("data-state")} ${e.tagName.toLowerCase()}`,
              w: r.width,
              h: r.height,
            }
          }),
      )
      expect(targets.length).toBeGreaterThan(40)
      for (const t of targets) {
        expect(t.h, `${t.key} height`).toBeGreaterThanOrEqual(T_TAP_PX - 0.5)
        expect(t.w, `${t.key} width`).toBeGreaterThanOrEqual(T_TAP_PX - 0.5)
      }
      await page.context().close()
    }
  })

  reg("galleryHasNoHorizontalOverflowOnAPhone", false, async () => {
    const page = await fx.open(
      galleryBody(),
      [COMPONENT_SCRIPT],
      { scheme: "light", width: 390 },
      GALLERY_CSS_ALL,
    )
    const over = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: innerWidth,
    }))
    expect(over.doc).toBeLessThanOrEqual(over.win)
    await page.context().close()
  })

  reg("firstTabStopIsTheSkipLinkAndTheFocusRingIsVisible", false, async () => {
    const body = `<div class="tv-shell">${navRail({
      brand: "Spandek report",
      items: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      current: "a",
      mainId: "main",
    })}<div><h1 id="a">A</h1><h2 id="b">B</h2></div></div>`
    for (const scheme of ["light", "dark"] as const) {
      const page = await fx.open(body, [COMPONENT_SCRIPT], { scheme })
      await page.keyboard.press("Tab")
      const info = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement
        const r = a.getBoundingClientRect()
        const s = getComputedStyle(a)
        return {
          cls: a.className,
          href: a.getAttribute("href"),
          top: r.top,
          left: r.left,
          style: s.outlineStyle,
          width: s.outlineWidth,
        }
      })
      expect(info.cls).toBe("tv-skip")
      expect(info.href).toBe("#main")
      expect(info.top).toBeGreaterThanOrEqual(0) // on screen once focused
      expect(info.style).toBe("solid")
      expect(info.width).toBe("2px")
      await page.keyboard.press("Tab")
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute("href")),
      ).toBe("#a")
      await page.context().close()
    }
  })

  reg("navRailIsALeftRailOnWideScreensAndATopBarOnAPhone", false, async () => {
    const items = [
      "verdict",
      "recipes",
      "why",
      "climate",
      "budget",
      "explore",
      "limits",
      "provenance",
    ].map((id) => ({ id, label: id }))
    const body = `<div class="tv-shell">${navRail({ brand: "Spandek report", items, current: "verdict", mainId: "main" })}<div id="pg" style="min-height:3000px"><h1>x</h1></div></div>`
    const wide = await fx.open(body, [COMPONENT_SCRIPT], {
      width: 1280,
      height: 800,
    })
    const w = await wide.evaluate(() => {
      const n = (
        document.querySelector(".tv-rail") as HTMLElement
      ).getBoundingClientRect()
      const m = (
        document.getElementById("pg") as HTMLElement
      ).getBoundingClientRect()
      return {
        navRight: n.right,
        mainLeft: m.left,
        navHeight: n.height,
        navTop: n.top,
      }
    })
    expect(w.navRight).toBeLessThanOrEqual(w.mainLeft + 0.5)
    expect(w.navHeight).toBeGreaterThanOrEqual(790)
    await wide.evaluate(() => window.scrollTo(0, 1500))
    expect(
      await wide.evaluate(
        () =>
          (
            document.querySelector(".tv-rail") as HTMLElement
          ).getBoundingClientRect().top,
      ),
    ).toBeCloseTo(0, 0) // sticky
    await wide.context().close()
    const phone = await fx.open(body, [COMPONENT_SCRIPT], {
      width: 390,
      height: 800,
    })
    const p = await phone.evaluate(() => {
      const n = (
        document.querySelector(".tv-rail") as HTMLElement
      ).getBoundingClientRect()
      const m = (
        document.getElementById("pg") as HTMLElement
      ).getBoundingClientRect()
      return {
        navWidth: n.width,
        navHeight: n.height,
        mainTop: m.top,
        doc: document.documentElement.scrollWidth,
      }
    })
    expect(p.navWidth).toBeLessThanOrEqual(390)
    expect(p.navHeight).toBeLessThan(120) // one scrolling row, not a column
    expect(p.mainTop).toBeGreaterThanOrEqual(p.navHeight - 1) // main sits below the bar
    expect(p.doc).toBeLessThanOrEqual(390)
    await phone.context().close()
  })

  reg("heroAnswersOnTheFirstScreen", false, async () => {
    const rec = (
      role: "high_performing" | "balanced" | "low_cost",
      name: string,
      v: number,
      cost: number,
    ) => ({
      role,
      name,
      cooling: {
        value: v,
        lo: v - 0.1,
        hi: v + 0.1,
        min: 0,
        max: 20,
        digits: 1,
      },
      cost: { value: cost, digits: 2 },
    })
    const body = `<div class="tv-shell">${navRail({
      brand: "Spandek report",
      items: [
        { id: "verdict", label: "Verdict" },
        { id: "limits", label: "Limits" },
      ],
      current: "verdict",
      mainId: "main",
    })}<div id="main">${heroVerdict({
      eyebrow: "Spandek aluminium roof coating, digital screening",
      verdict:
        "Three coatings cool aluminium by 13.4 to 14.4 K in the models; none is measured yet",
      lead: "Best cooling: SP-075 lowers the peak surface temperature against bare aluminium.",
      recipes: [
        rec("high_performing", "SP-075", 14.4, 0.64),
        rec("balanced", "SP-031", 13.6, 0.59),
        rec("low_cost", "SP-046", 13.4, 0.34),
      ],
      honesty: "PROXY results. Intervals show parameter uncertainty only.",
      limitsHref: "#limits",
    })}<section id="limits"><h2>Limits</h2></section></div></div>`
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
    ] as const) {
      for (const scheme of ["light", "dark"] as const) {
        const page = await fx.open(body, [COMPONENT_SCRIPT], {
          width,
          height,
          scheme,
        })
        for (const sel of [
          "[data-hero-verdict]",
          "[data-recipe][data-role=high_performing]",
          "[data-recipe][data-role=balanced]",
          "[data-recipe][data-role=low_cost]",
          "[data-honesty]",
          "a[href='#limits'].tv-button",
        ]) {
          const r = await page.evaluate((s) => {
            const b = (
              document.querySelector(s) as HTMLElement
            ).getBoundingClientRect()
            return { top: b.top, bottom: b.bottom, h: innerHeight }
          }, sel)
          expect(
            r.top,
            `${sel} top ${width}x${height} ${scheme}`,
          ).toBeGreaterThanOrEqual(0)
          expect(
            r.bottom,
            `${sel} bottom ${width}x${height} ${scheme}`,
          ).toBeLessThanOrEqual(r.h)
        }
        await page.context().close()
      }
    }
  })

  reg("tabsFollowTheAriaPatternWithArrowHomeEndAndClick", false, async () => {
    const html = tabs({
      id: "st",
      label: "State",
      tabs: [
        { id: "a", label: "Initial" },
        { id: "b", label: "Aged" },
        { id: "c", label: "Both" },
      ],
    })(["<p>pa</p>", "<p>pb</p>", "<p>pc</p>"])
    const page = await fx.open(html, [COMPONENT_SCRIPT])
    const state = () =>
      page.evaluate(() => ({
        selected: [...document.querySelectorAll("[role=tab]")].map((e) =>
          e.getAttribute("aria-selected"),
        ),
        visible: [...document.querySelectorAll("[role=tabpanel]")].map(
          (e) => !(e as HTMLElement).hidden,
        ),
        focused: document.activeElement?.id,
        tabindex: [...document.querySelectorAll("[role=tab]")].map(
          (e) => (e as HTMLElement).tabIndex,
        ),
      }))
    expect((await state()).visible).toEqual([true, false, false])
    await page.locator("#st-tab-a").focus()
    await page.keyboard.press("ArrowRight")
    let s = await state()
    expect(s.selected).toEqual(["false", "true", "false"])
    expect(s.visible).toEqual([false, true, false])
    expect(s.focused).toBe("st-tab-b")
    expect(s.tabindex).toEqual([-1, 0, -1])
    await page.keyboard.press("End")
    expect((await state()).focused).toBe("st-tab-c")
    await page.keyboard.press("ArrowRight") // wraps
    expect((await state()).focused).toBe("st-tab-a")
    await page.keyboard.press("ArrowLeft") // wraps back
    expect((await state()).focused).toBe("st-tab-c")
    await page.keyboard.press("Home")
    s = await state()
    expect(s.focused).toBe("st-tab-a")
    expect(s.visible).toEqual([true, false, false])
    await page.locator("#st-tab-b").click()
    expect((await state()).visible).toEqual([false, true, false])
    // Tab from the selected tab goes into its panel (the panel is a tab stop, the other tabs are not)
    await page.keyboard.press("Tab")
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("role")),
    ).toBe("tabpanel")
    expect(fx.watch(page).errors).toEqual([])
    await page.context().close()
  })

  reg(
    "aGlossaryLinkOpensTheClosedDisclosureAroundItsTarget",
    false,
    async () => {
      const seen = new Set<string>()
      const sentence = linkTerms("This ranks by a PROXY index.", seen)
      const body = `<p id="use">${sentence}</p>${disclosure({ summary: "Glossary", level: "detail", id: "gl" })(glossary({}))}`
      const page = await fx.open(body, [COMPONENT_SCRIPT])
      expect(
        await page.evaluate(
          () => (document.getElementById("gl") as HTMLDetailsElement).open,
        ),
      ).toBe(false)
      await page.locator("a.tv-term").click()
      expect(
        await page.evaluate(
          () => (document.getElementById("gl") as HTMLDetailsElement).open,
        ),
      ).toBe(true)
      expect(await page.evaluate(() => location.hash)).toBe(
        "#glossary-proxy-index",
      )
      // smooth scrolling is on (no reduced motion), so wait for the target to arrive in the viewport
      await page.waitForFunction(() => {
        const r = (
          document.getElementById("glossary-proxy-index") as HTMLElement
        ).getBoundingClientRect()
        return r.bottom > 0 && r.top < innerHeight
      })
      // the address alone also opens it (a shared link)
      const page2 = await fx.open(body, [COMPONENT_SCRIPT])
      await page2.evaluate(() => {
        location.hash = "#glossary-bare-aluminium"
      })
      await page2.waitForFunction(
        () => (document.getElementById("gl") as HTMLDetailsElement).open,
      )
      // Enter and Space toggle a disclosure natively
      const page3 = await fx.open(
        disclosure({ summary: "More", level: "detail", id: "d" })("<p>x</p>"),
        [COMPONENT_SCRIPT],
      )
      await page3.locator("summary").focus()
      await page3.keyboard.press("Enter")
      expect(
        await page3.evaluate(
          () => (document.getElementById("d") as HTMLDetailsElement).open,
        ),
      ).toBe(true)
      await page3.keyboard.press("Space")
      expect(
        await page3.evaluate(
          () => (document.getElementById("d") as HTMLDetailsElement).open,
        ),
      ).toBe(false)
      for (const p of [page, page2, page3]) {
        expect(fx.watch(p).errors).toEqual([])
        await p.context().close()
      }
    },
  )

  reg(
    "printShowsEveryClosedDisclosureAndEveryTabPanelWithALightPalette",
    false,
    async () => {
      const body = `${disclosure({ summary: "Closed", level: "detail", id: "c" })('<p id="in-closed">hidden detail</p>')}${tabs(
        {
          id: "pt",
          label: "L",
          tabs: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
        },
      )(["<p>pa</p>", '<p id="in-b">pb</p>'])}`
      const page = await fx.open(body, [COMPONENT_SCRIPT], {
        scheme: "dark",
        print: true,
      })
      const r = await page.evaluate(() => {
        const vis = (id: string) =>
          (document.getElementById(id) as HTMLElement).checkVisibility()
        return {
          closed: vis("in-closed"),
          tabB: vis("in-b"),
          list: getComputedStyle(
            document.querySelector(".tv-tabs__list") as HTMLElement,
          ).display,
          bg: getComputedStyle(document.documentElement)
            .getPropertyValue("--tv-surface-base")
            .trim(),
        }
      })
      // control: on screen the closed disclosure and the unselected panel really are hidden, so the check can fail
      const screen = await fx.open(body, [COMPONENT_SCRIPT], { scheme: "dark" })
      const hidden = await screen.evaluate(() =>
        ["in-closed", "in-b"].map((id) =>
          (document.getElementById(id) as HTMLElement).checkVisibility(),
        ),
      )
      expect(hidden).toEqual([false, false])
      await screen.context().close()
      expect(r.closed).toBe(true)
      expect(r.tabB).toBe(true)
      expect(r.list).toBe("none")
      expect(r.bg).toBe("#f7f8fa") // never a dark background on paper
      await page.context().close()
    },
  )

  reg("textContrastOfEveryComponentStateMeetsAABothThemes", true, async () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await fx.open(
        galleryBody(),
        [COMPONENT_SCRIPT],
        { scheme },
        GALLERY_CSS_ALL,
      )
      const rows = await textContrast(page, ".tv-gallery__sample")
      expect(rows.length).toBeGreaterThan(300)
      for (const r of rows.filter((x) => !x.gradient && !x.exempt))
        expect(
          r.ratio,
          `${scheme} ${r.key} "${r.text}"`,
        ).toBeGreaterThanOrEqual(4.5)
      await page.context().close()
    }
  })

  reg("galleryPrintsWithALightPaletteAndNoClippedTables", true, async () => {
    const page = await fx.open(
      galleryBody(),
      [COMPONENT_SCRIPT],
      { scheme: "dark", print: true, width: 794 },
      GALLERY_CSS_ALL,
    )
    const r = await page.evaluate(() => ({
      bg: getComputedStyle(document.documentElement)
        .getPropertyValue("--tv-surface-base")
        .trim(),
      overflow: [...document.querySelectorAll(".tv-table")].map(
        (e) => (e as HTMLElement).scrollWidth - (e as HTMLElement).clientWidth,
      ),
    }))
    expect(r.bg).toBe("#f7f8fa")
    expect(r.overflow.length).toBeGreaterThan(0)
    await page.context().close()
  })
}
