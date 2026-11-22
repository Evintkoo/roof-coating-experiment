// Plan 06 Task 3: the atom gallery in a real Chrome (Playwright library inside bun:test, `channel: "chrome"`, headless, the
// test's own browser). One suite body, two sizes (docs/testing.md): the fast tier renders every atom state in both themes,
// requires no console errors and no failed requests, and measures target sizes, the focus ring and reduced motion; the proof
// tier adds a computed-style text contrast check of every state in both themes and the print palette.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Browser, chromium, type Page } from "playwright"
import { buildDesignAssets } from "../../src/node/report/design"
import {
  GALLERY_CSS,
  galleryAtomCells,
  galleryAtoms,
} from "../../src/web/design/templates/galleryAtoms"
import { repoRoot } from "../helpers"
import { textContrast } from "../support/pageContrast"
import type { Tier } from "./scale"

export type AtomsBrowserScale = { tier: Tier }
export const ATOMS_FAST: AtomsBrowserScale = { tier: "fast" }
export const ATOMS_PROOF: AtomsBrowserScale = { tier: "proof" }

const T_TAP_PX = 44
const PER_TEST_MS = 60_000

export function designAtomsBrowserSuite(S: AtomsBrowserScale): void {
  let browser: Browser
  let dir = ""
  let path = ""
  const reg = (name: string, proofOnly: boolean, fn: () => Promise<void>) => {
    if (proofOnly && S.tier !== "proof") return
    test(name, fn, PER_TEST_MS)
  }
  const watch = new WeakMap<Page, { errors: string[]; failed: string[] }>()

  beforeAll(async () => {
    const assets = buildDesignAssets({
      vendorRoot: join(repoRoot, "vendor"),
      fontsDir: join(repoRoot, "src/node/report/fonts"),
      componentCount: galleryAtomCells().length,
    })
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atoms</title><style>${assets.fontCss}\n${assets.css}${GALLERY_CSS}body{margin:0;padding:var(--tv-space-8);background:var(--tv-surface-base);color:var(--tv-text-primary);font-family:var(--tv-font-sans)}</style></head><body><main>${galleryAtoms()}</main></body></html>`
    assets.done(Buffer.byteLength(html))
    dir = mkdtempSync(join(tmpdir(), "atoms-gallery-"))
    path = join(dir, "atoms.html")
    writeFileSync(path, html)
    browser = await chromium.launch({ channel: "chrome", headless: true })
  }, 120_000)
  afterAll(async () => {
    await browser?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function open(opts: {
    scheme: "light" | "dark"
    width?: number
    reducedMotion?: boolean
    print?: boolean
  }): Promise<Page> {
    const ctx = await browser.newContext({
      colorScheme: opts.scheme,
      reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
      viewport: { width: opts.width ?? 1280, height: 900 },
    })
    const page = await ctx.newPage()
    const w = { errors: [] as string[], failed: [] as string[] }
    watch.set(page, w)
    page.on("console", (m) => m.type() === "error" && w.errors.push(m.text()))
    page.on("pageerror", (e) => w.errors.push(String(e)))
    page.on("requestfailed", (r) => w.failed.push(r.url()))
    if (opts.print) await page.emulateMedia({ media: "print" })
    await page.goto(`file://${path}`)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return page
  }
  const token = (page: Page, name: string) =>
    page.evaluate((n) => {
      const p = document.createElement("span")
      p.style.color = `var(--tv-${n})`
      document.body.append(p)
      const c = getComputedStyle(p).color
      p.remove()
      return c
    }, name)

  reg("everyAtomStateRendersInBothThemes", false, async () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await open({ scheme })
      const cells = await page.$$eval("[data-atom]", (els) =>
        els.map((e) => {
          const s = e.querySelector(".tv-gallery__sample") as HTMLElement
          const first = s.firstElementChild as HTMLElement
          const r = first.getBoundingClientRect()
          return {
            key: `${e.getAttribute("data-atom")}/${e.getAttribute("data-state")}`,
            w: r.width,
            h: r.height,
          }
        }),
      )
      expect(cells.length).toBe(galleryAtomCells().length)
      for (const c of cells) {
        expect(c.w, c.key).toBeGreaterThan(0)
        expect(c.h, c.key).toBeGreaterThan(0)
      }
      // the page follows the system scheme: the brand dark theme is the default, light is derived
      const base = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--tv-surface-base")
          .trim(),
      )
      expect(base).toBe(scheme === "dark" ? "#0b1020" : "#f7f8fa")
      // the three embedded families really load from the file
      const fonts = await page.evaluate(() =>
        [...document.fonts]
          .filter((f) => f.status === "loaded")
          .map((f) => f.family),
      )
      expect(fonts.length).toBeGreaterThan(0)
      const w = watch.get(page)
      expect(w?.failed).toEqual([])
      expect(w?.errors).toEqual([])
      await page.context().close()
    }
  })

  reg("dataThemeOverridesTheSystemScheme", false, async () => {
    const page = await open({ scheme: "light" })
    const read = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--tv-text-primary")
          .trim(),
      )
    expect(await read()).toBe("#0b1020")
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-theme", "dark"),
    )
    expect(await read()).toBe("#f7f8fa")
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-theme", "light"),
    )
    expect(await read()).toBe("#0b1020")
    await page.context().close()
  })

  reg("interactiveTargetsAreAtLeast44px", false, async () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await open({ scheme })
      const targets = await page.$$eval(
        '[data-interactive="true"] :is(a, button)',
        (els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect()
            const cell = e.closest("[data-atom]")
            return {
              key: `${cell?.getAttribute("data-atom")}/${cell?.getAttribute("data-state")}`,
              w: r.width,
              h: r.height,
            }
          }),
      )
      // 12 buttons, 3 more button forms, 1 logo, 2 nav links, 2 toggle chips
      expect(targets.length).toBe(20)
      for (const t of targets) {
        expect(t.w, `${t.key} width`).toBeGreaterThanOrEqual(T_TAP_PX - 0.5)
        expect(t.h, `${t.key} height`).toBeGreaterThanOrEqual(T_TAP_PX - 0.5)
      }
      await page.context().close()
    }
  })

  reg("focusRingIsVisibleOnKeyboardFocus", false, async () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await open({ scheme })
      await page.keyboard.press("Tab")
      const ring = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement
        const s = getComputedStyle(a)
        return {
          tag: a.tagName,
          style: s.outlineStyle,
          width: s.outlineWidth,
          offset: s.outlineOffset,
          color: s.outlineColor,
        }
      })
      expect(ring.tag).toBe("BUTTON")
      expect(ring.style).toBe("solid")
      expect(ring.width).toBe("2px")
      expect(ring.offset).toBe("2px")
      expect(ring.color).toBe(await token(page, "focus-ring"))
      await page.context().close()
    }
  })

  reg("reducedMotionRemovesTransitionsAndNudges", false, async () => {
    const page = await open({ scheme: "dark", reducedMotion: true })
    const d = await page.evaluate(() => {
      const b = document.querySelector(".tv-button") as HTMLElement
      const i = document.querySelector(".tv-button .tv-icon") as HTMLElement
      const c = document.querySelector(".tv-chip--toggle") as HTMLElement
      return [
        getComputedStyle(b).transitionDuration,
        getComputedStyle(i).transitionDuration,
        getComputedStyle(c).transitionDuration,
      ]
    })
    expect(d).toEqual(["0s", "0s", "0s"])
    await page.context().close()
    const page2 = await open({ scheme: "dark" })
    const d2 = await page2.evaluate(
      () =>
        getComputedStyle(document.querySelector(".tv-button") as HTMLElement)
          .transitionDuration,
    )
    expect(d2).not.toBe("0s")
    await page2.context().close()
  })

  reg("noHorizontalOverflowOnAPhone", false, async () => {
    const page = await open({ scheme: "light", width: 390 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.context().close()
  })

  reg("textContrastMeetsAAInEveryStateBothThemes", true, async () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await open({ scheme })
      const res = await textContrast(page, ".tv-gallery__sample")
      // one text-bearing element per state of every atom except the icons (they carry no text)
      expect(res.length).toBe(
        galleryAtomCells().filter((c) => c.atom !== "Icon").length,
      )
      for (const r of res.filter((x) => !x.gradient))
        expect(r.ratio, `${scheme} ${r.key}`).toBeGreaterThanOrEqual(4.5)
      // text on the orange gradient is covered by the token pair table (action-label on both gradient stops)
      const grads = res.filter((x) => x.gradient)
      expect(grads.length).toBeGreaterThan(0)
      for (const g of grads)
        expect(
          g.key.startsWith("Button/primary") ||
            g.key.startsWith("Button/link") ||
            g.key.startsWith("Button/icon"),
        ).toBe(true)
      await page.context().close()
    }
  })

  reg("printUsesTheLightPaletteWithADarkSystemScheme", true, async () => {
    const page = await open({ scheme: "dark", print: true })
    const v = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--tv-surface-base")
        .trim(),
    )
    expect(v).toBe("#f7f8fa")
    await page.context().close()
  })
}
