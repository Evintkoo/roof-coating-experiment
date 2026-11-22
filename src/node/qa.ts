// The browser QA of the built report (plan 07 FR-1, H1): opens the page in a real Chrome, drives every interactive control and the
// 50-event burst of the `#test` hook, and reports defects: console errors, page errors, unhandled rejections, failed requests, dead
// anchors, duplicate ids, unnamed controls, NaN or undefined text, stale values after a burst, sideways scroll at four widths.
// Usage: bun run qa <report.html> [--throttle N]. Exit 0 clean, 1 defects, 2 bad usage.
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { chromium, type Page } from "playwright"

export type QaSeverity = "major" | "minor"
export type QaDefect = { id: string; severity: QaSeverity; repro: string }
export type QaReport = {
  defects: QaDefect[]
  /** How many controls and anchors were driven or checked, so a clean report is not an empty one. */
  checked: { controls: number; anchors: number; widths: number; burst: number }
}
export type QaOpts = { cpuThrottle?: number; widths?: readonly number[] }

const WIDTHS = [320, 390, 768, 1280] as const

type Watch = {
  defects: QaDefect[]
  add: (id: string, severity: QaSeverity, repro: string) => void
}

function watch(page: Page, w: Watch): void {
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      w.add(
        "console_error",
        "major",
        `console.error: ${m.text().slice(0, 200)}`,
      ),
  )
  page.on("pageerror", (e) =>
    w.add("page_error", "major", `uncaught: ${String(e).slice(0, 200)}`),
  )
  page.on("requestfailed", (r) =>
    w.add(
      "failed_request",
      "major",
      `request failed: ${r.url().slice(0, 120)}`,
    ),
  )
}

/** In-page audit: anchors, ids, unnamed controls, bad text. Returns defect descriptions. */
function audit(): {
  anchors: number
  controls: number
  found: { id: string; repro: string }[]
} {
  const found: { id: string; repro: string }[] = []
  const ids = new Map<string, number>()
  for (const e of document.querySelectorAll("[id]"))
    ids.set(e.id, (ids.get(e.id) ?? 0) + 1)
  for (const [id, n] of ids)
    if (n > 1)
      found.push({ id: "duplicate_id", repro: `id "${id}" appears ${n} times` })
  let anchors = 0
  for (const a of document.querySelectorAll('a[href^="#"]')) {
    anchors++
    const h = (a as HTMLAnchorElement).getAttribute("href") ?? ""
    const target = h.slice(1)
    if (
      target === "" ||
      (!document.getElementById(target) && target !== "test")
    )
      found.push({
        id: "dead_anchor",
        repro: `link "${(a.textContent ?? "").trim().slice(0, 40)}" to ${h}`,
      })
  }
  const name = (e: Element): string => {
    const al = e.getAttribute("aria-label")?.trim()
    if (al) return al
    const lb = e.getAttribute("aria-labelledby")
    if (
      lb &&
      lb
        .split(/\s+/)
        .some((i) => document.getElementById(i)?.textContent?.trim())
    )
      return "labelled"
    const input = e as HTMLInputElement
    if (
      input.labels &&
      input.labels.length > 0 &&
      [...input.labels].some((l) => l.textContent?.trim())
    )
      return "label"
    if (e.getAttribute("title")?.trim()) return "title"
    if (
      e instanceof HTMLInputElement &&
      ["submit", "button", "reset"].includes(e.type) &&
      e.value
    )
      return "value"
    return (e.textContent ?? "").trim()
  }
  let controls = 0
  for (const e of document.querySelectorAll(
    "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button]",
  )) {
    controls++
    if (name(e) === "")
      found.push({
        id: "unnamed_control",
        repro: `<${e.tagName.toLowerCase()}${e.id ? ` id=${e.id}` : ""}${e.className ? ` class="${String(e.className).slice(0, 40)}"` : ""}> has no accessible name`,
      })
  }
  const text = document.body.innerText
  const m = /\b(NaN|undefined|Infinity|\[object Object\])\b/.exec(text)
  if (m)
    found.push({
      id: "bad_text",
      repro: `visible text contains "${m[0]}" near "${text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ")}"`,
    })
  return { anchors, controls, found }
}

export async function runQa(
  htmlPath: string,
  opts: QaOpts = {},
): Promise<QaReport> {
  const defects: QaDefect[] = []
  const seen = new Set<string>()
  const add = (id: string, severity: QaSeverity, repro: string) => {
    const k = `${id}|${repro}`
    if (seen.has(k)) return
    seen.add(k)
    defects.push({ id, severity, repro })
  }
  const w: Watch = { defects, add }
  const checked = { controls: 0, anchors: 0, widths: 0, burst: 0 }
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const url = `file://${resolve(htmlPath)}`
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    await ctx.addInitScript(() =>
      addEventListener("unhandledrejection", (e) =>
        console.error(
          `unhandled rejection: ${String((e as PromiseRejectionEvent).reason)}`,
        ),
      ),
    )
    const page = await ctx.newPage()
    watch(page, w)
    if (opts.cpuThrottle && opts.cpuThrottle > 1) {
      const cdp = await ctx.newCDPSession(page)
      await cdp.send("Emulation.setCPUThrottlingRate", {
        rate: opts.cpuThrottle,
      })
    }
    await page.goto(`${url}#test`)
    await page.waitForFunction(
      () =>
        (document
          .getElementById("fig-why-tofT")
          ?.getElementsByClassName("main-svg").length ?? 0) > 0,
    )
    await page.evaluate(() => {
      for (const d of document.querySelectorAll("details")) d.open = true
    })
    await page.waitForFunction(
      () =>
        (document.getElementById("live-root") as HTMLElement | null)?.dataset
          .shown !== "0",
    )

    // every interactive control, driven: ranges to both ends, number boxes with a bad and a good value, selects through all options, checkboxes, toggle, sort buttons
    for (const r of await page
      .locator(
        '#live-controls input[type="range"], #budget-panel input[type="range"]',
      )
      .all()) {
      await r.focus()
      await page.keyboard.press("Home")
      await page.keyboard.press("End")
      checked.controls++
    }
    for (const n of await page
      .locator(
        '#live-controls input[type="number"], #budget-panel input[type="number"]',
      )
      .all()) {
      await n.focus()
      await n.evaluate((e) => (e as HTMLInputElement).select())
      await page.keyboard.press("Backspace")
      await page.keyboard.type("-")
      await n.fill("0")
      await n.blur()
      checked.controls++
    }
    for (const s of await page.locator("select").all()) {
      for (const o of await s.locator("option").all())
        await s.selectOption({
          index: (await o.evaluate(
            (e) => (e as HTMLOptionElement).index,
          )) as number,
        })
      checked.controls++
    }
    for (const c of await page
      .locator("#live-controls input[type=checkbox]")
      .all()) {
      await c.click()
      await c.click()
      checked.controls++
    }
    for (const b of await page.locator("#tbl-explorer .tv-table__sort").all()) {
      await b.click()
      checked.controls++
    }
    await page.locator("#theme-toggle").click()
    await page.locator("#theme-toggle").click()
    checked.controls++
    await page.waitForTimeout(400)
    const a = await page.evaluate(audit)
    checked.anchors = a.anchors
    for (const f of a.found)
      add(f.id, f.id === "bad_text" ? "minor" : "major", f.repro)

    // 50-event burst: the newest request is the one shown, and the tile equals the nominal of the last inputs
    const burst = await page.evaluate(async () => {
      const b = await (
        window as unknown as {
          __burst: (
            n: number,
            ms: number,
          ) => Promise<{ shown: number[]; requested: number }>
        }
      ).__burst(50, 20)
      const root = document.getElementById("live-root") as HTMLElement
      return {
        last: b.shown[b.shown.length - 1],
        requested: b.requested,
        shown: root.dataset.shown,
        ascending: b.shown.every(
          (v, i, all) => i === 0 || (all[i - 1] as number) < v,
        ),
      }
    })
    checked.burst = 50
    if (
      burst.last !== burst.requested ||
      Number(burst.shown) !== burst.requested
    )
      add(
        "stale_value",
        "major",
        `after 50 slider events the page showed update ${burst.last} but ${burst.requested} was requested`,
      )
    if (!burst.ascending)
      add(
        "out_of_order",
        "major",
        "live results were shown out of order during a 50-event burst",
      )

    // sideways scroll at four widths
    for (const width of opts.widths ?? WIDTHS) {
      await page.setViewportSize({ width, height: 800 })
      await page.waitForTimeout(150)
      const o = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        view: innerWidth,
      }))
      if (o.doc > o.view)
        add("overflow", "minor", `at ${width} px the page is ${o.doc} px wide`)
      checked.widths++
    }
    await ctx.close()
  } finally {
    await browser.close()
  }
  return { defects, checked }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const t = args.indexOf("--throttle")
  const throttle = t >= 0 ? Number(args[t + 1]) : undefined
  const file = args.find(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--throttle",
  )
  if (
    !file ||
    !existsSync(file) ||
    (throttle !== undefined && !(throttle >= 1))
  ) {
    console.error("usage: bun run qa <report.html> [--throttle N]")
    process.exit(2)
  }
  const r = await runQa(
    file,
    throttle === undefined ? {} : { cpuThrottle: throttle },
  )
  console.log(JSON.stringify(r, null, 2))
  console.log(
    r.defects.length === 0 ? "qa: clean" : `qa: ${r.defects.length} defect(s)`,
  )
  process.exit(r.defects.length === 0 ? 0 : 1)
}
