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
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    timeout: 30_000,
  })
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

/** Opens the live simulator disclosure and waits until every requested update has been shown. */
export async function openLive(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(document.getElementById("details-live") as HTMLDetailsElement).open = true
  })
  await settled(page)
}

/** Waits until the live simulator has shown the newest requested update. */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const r = document.getElementById("live-root") as HTMLElement
    return (
      r.dataset.shown === r.dataset.requested && r.dataset.requested !== "0"
    )
  })
}

export type Box = { text: string; l: number; t: number; w: number; h: number }

/** Opens every disclosure, waits until the figure's SVG fills its container, and returns the boxes (relative to the figure) of the text matching `sel`. */
export async function figText(
  page: Page,
  id: string,
  sel: string,
): Promise<{ w: number; h: number; boxes: Box[] }> {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll("details")) d.open = true
    window.dispatchEvent(new Event("resize"))
  })
  await page.waitForFunction(
    ({ i, s }) => {
      const gd = document.getElementById(i) as HTMLElement
      const svg = gd.querySelector("svg.main-svg")
      return (
        !!svg &&
        Math.abs(
          svg.getBoundingClientRect().width - gd.getBoundingClientRect().width,
        ) < 3 &&
        gd.querySelectorAll(s).length > 0
      )
    },
    { i: id, s: sel },
    { timeout: 15_000 },
  )
  await page.waitForTimeout(300)
  return page.evaluate(
    ({ i, s }) => {
      const gd = document.getElementById(i) as HTMLElement
      const r = gd.getBoundingClientRect()
      return {
        w: r.width,
        h: r.height,
        boxes: [...gd.querySelectorAll(s)].map((e) => {
          const b = e.getBoundingClientRect()
          return {
            text: (e.textContent ?? "").trim(),
            l: b.left - r.left,
            t: b.top - r.top,
            w: b.width,
            h: b.height,
          }
        }),
      }
    },
    { i: id, s: sel },
  )
}

/** Pairs of boxes that overlap by more than 2 px in both directions. */
export function overlaps(boxes: readonly Box[]): string[] {
  const out: string[] = []
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++) {
      const p = boxes[a] as Box
      const q = boxes[b] as Box
      const ox = Math.min(p.l + p.w, q.l + q.w) - Math.max(p.l, q.l)
      const oy = Math.min(p.t + p.h, q.t + q.h) - Math.max(p.t, q.t)
      if (ox > 2 && oy > 2) out.push(`${p.text} / ${q.text}`)
    }
  return out
}

/** Boxes that stick out of the figure (clipped). */
export function outside(boxes: readonly Box[], w: number, h: number): string[] {
  return boxes
    .filter(
      (b) => b.l < -1 || b.t < -1 || b.l + b.w > w + 1 || b.t + b.h > h + 1,
    )
    .map((b) => b.text)
}
