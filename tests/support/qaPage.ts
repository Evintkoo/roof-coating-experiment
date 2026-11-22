// Shared by the QA regression tests (plan 07 Task 1): the report built once per process from the committed fixture run (refine and
// Indonesia outputs included), opened in a real Chrome (own instance, headless) at a given width. One browser per test file.
import { cpSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Browser, chromium, type Page } from "playwright"
import { buildReport } from "../../src/node/report/html"
import { REPORT_FIXTURE, reportOpts } from "../helpers"

let built: Promise<{ path: string; html: string }> | undefined

/** The built report page (path and text); built once per process. */
export function qaReport(): Promise<{ path: string; html: string }> {
  built ??= (async () => {
    const run = mkdtempSync(join(tmpdir(), "qa-run-"))
    cpSync(REPORT_FIXTURE, run, { recursive: true })
    const path = join(mkdtempSync(join(tmpdir(), "qa-html-")), "report.html")
    await buildReport(run, path, reportOpts())
    return { path, html: readFileSync(path, "utf8") }
  })()
  return built
}

export type QaOpts = {
  width?: number
  height?: number
  scheme?: "light" | "dark"
  hash?: string
  /** A script run in every document before the page's own scripts. */
  init?: string
}

export type QaBrowser = {
  browser: Browser
  open(o?: QaOpts): Promise<Page & { errors: string[] }>
  close(): Promise<void>
}

/** Starts a Chrome and returns an `open` that waits for the first figure to draw. Call `close` in `afterAll`. */
export async function startQa(): Promise<QaBrowser> {
  const { path } = await qaReport()
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  const open: QaBrowser["open"] = async (o = {}) => {
    const ctx = await browser.newContext({
      viewport: { width: o.width ?? 1280, height: o.height ?? 800 },
      colorScheme: o.scheme ?? "light",
    })
    if (o.init) await ctx.addInitScript(o.init)
    const page = (await ctx.newPage()) as Page & { errors: string[] }
    page.errors = []
    page.on(
      "console",
      (m) => m.type() === "error" && page.errors.push(m.text()),
    )
    page.on("pageerror", (e) => page.errors.push(String(e)))
    await page.goto(`file://${path}${o.hash ?? ""}`)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await page.waitForFunction(
      () =>
        (document
          .getElementById("fig-why-tofT")
          ?.getElementsByClassName("main-svg").length ?? 0) > 0,
    )
    return page
  }
  return { browser, open, close: () => browser.close() }
}
