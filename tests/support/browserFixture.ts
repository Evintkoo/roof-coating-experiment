// A real-Chrome fixture for component tests: builds the design assets (vendor check, tokens, contrast gate, fonts), wraps a
// fragment and its scripts in a page file and opens it with a given colour scheme and width. One browser per suite.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Browser, chromium, type Page } from "playwright"
import { buildDesignAssets } from "../../src/node/report/design"
import { GALLERY_CSS } from "../../src/web/design/templates/galleryAtoms"
import { repoRoot } from "../helpers"

export type Watch = { errors: string[]; failed: string[] }
export type OpenOpts = {
  /** The theme the page is shown in (its `data-theme`); the system colour scheme is emulated as the OPPOSITE, because the page ignores it. */
  scheme?: "light" | "dark"
  width?: number
  height?: number
  reducedMotion?: boolean
  print?: boolean
  /** Install Playwright's fake clock before the page loads (rAF then advances only with `page.clock.runFor`). */
  clock?: boolean
}

export class BrowserFixture {
  browser!: Browser
  private dir = mkdtempSync(join(tmpdir(), "components-"))
  private n = 0
  private watches = new WeakMap<Page, Watch>()

  async start(): Promise<void> {
    this.browser = await chromium.launch({ channel: "chrome", headless: true })
  }
  async stop(): Promise<void> {
    await this.browser?.close()
    rmSync(this.dir, { recursive: true, force: true })
  }
  watch(page: Page): Watch {
    return this.watches.get(page) as Watch
  }

  /** `body` is the markup inside `<main>`; `scripts` are inline scripts; `extraCss` is appended after the component CSS. */
  async open(
    body: string,
    scripts: readonly string[],
    o: OpenOpts = {},
    extraCss = "",
  ): Promise<Page> {
    const theme = o.scheme ?? "dark"
    const assets = buildDesignAssets({
      vendorRoot: join(repoRoot, "vendor"),
      fontsDir: join(repoRoot, "src/node/report/fonts"),
      componentCount: 1,
    })
    const html = `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Components</title><style>${assets.fontCss}\n${assets.css}${GALLERY_CSS}${extraCss}body{margin:0;padding:var(--tv-space-8);background:var(--tv-surface-base);color:var(--tv-text-primary);font-family:var(--tv-font-sans)}</style></head><body><main id="main">${body}</main>${scripts.map((s) => `<script>${s}</script>`).join("")}</body></html>`
    assets.done(Buffer.byteLength(html))
    const path = join(this.dir, `p${this.n++}.html`)
    writeFileSync(path, html)
    const ctx = await this.browser.newContext({
      colorScheme: theme === "dark" ? "light" : "dark",
      reducedMotion: o.reducedMotion ? "reduce" : "no-preference",
      viewport: { width: o.width ?? 1280, height: o.height ?? 900 },
    })
    const page = await ctx.newPage()
    const w: Watch = { errors: [], failed: [] }
    this.watches.set(page, w)
    page.on("console", (m) => m.type() === "error" && w.errors.push(m.text()))
    page.on("pageerror", (e) => w.errors.push(String(e)))
    page.on("requestfailed", (r) => w.failed.push(r.url()))
    if (o.print) await page.emulateMedia({ media: "print" })
    if (o.clock) await page.clock.install()
    await page.goto(`file://${path}`)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return page
  }
}
