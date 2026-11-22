import { afterAll, beforeAll, expect, test } from "bun:test"
import type { Page } from "playwright"
import type { Panel } from "../../../src/web/anim/screeningPanel"
import { watchScreening } from "../../../src/web/design/organisms/watchScreening"
import { BrowserFixture } from "../../support/browserFixture"
import { type Harness, startPoolHarness } from "../../support/poolBrowser"

declare global {
  interface Window {
    PANEL: Panel
    LOG: string[]
  }
}

const fx = new BrowserFixture()
let h: Harness
let entry = ""
beforeAll(async () => {
  h = await startPoolHarness()
  const out = await Bun.build({
    entrypoints: [
      new URL("../../support/panelEntry.ts", import.meta.url).pathname,
    ],
    target: "browser",
    format: "iife",
    minify: false,
    root: new URL("../../../", import.meta.url).pathname,
  })
  if (!out.success) throw new Error("bundle failed")
  entry = await (out.outputs[0] as Blob).text()
  await fx.start()
}, 180000)
afterAll(async () => {
  await fx.stop()
  await h?.close()
}, 60000)

const open = async (
  o: { noWorker?: boolean; truncate?: boolean } = {},
): Promise<Page> => {
  const page = await fx.open(
    watchScreening({ candidates: 96, scenarios: 9, draws: 32 }),
    [],
    o.noWorker ? {} : {},
  )
  if (o.noWorker) await page.evaluate("delete window.Worker")
  await page.addScriptTag({ content: entry })
  await page.evaluate(
    ([w, c, d]) =>
      (window as unknown as { A: { mount(...a: unknown[]): void } }).A.mount(
        w,
        c,
        d,
      ),
    [
      h.workerSrc,
      o.truncate ? h.ctxJson.slice(0, 1500) : h.ctxJson,
      h.data,
    ] as const,
  )
  return page
}
const text = (p: Page, k: string) => p.locator(`[data-anim="${k}"]`).innerText()
const filled = (p: Page) =>
  p.locator('[data-cell][class*="tv-cell--b"]').count()

test("runFillsTheGridShowsLanesAndTheBatchCheckPassesG2", async () => {
  const p = await open()
  expect(await filled(p)).toBe(0)
  await p
    .getByRole("button", { name: "Run the screening in my browser" })
    .click()
  await p.waitForFunction(
    () =>
      document
        .querySelector('[data-anim="check"]')
        ?.textContent?.startsWith("Check"),
    null,
    { timeout: 60000 },
  )
  expect(await filled(p)).toBe(864)
  expect(await text(p, "check")).toContain(
    "Check passed: all 2592 values (864 cells x 3 quantities) equal the batch results within 1e-9",
  )
  const summary = await text(p, "summary")
  expect(summary).toContain("864 cells computed")
  expect(summary).toContain("this machine's measurement")
  expect(summary).toContain("nominal values only")
  expect(summary).toMatch(/Lowest mean peak surface temperature: SP-\d{3} \(/)
  expect(await p.locator(".tv-lane").count()).toBeGreaterThanOrEqual(1)
  expect(
    await p.locator('[data-anim="computing"]').getAttribute("data-state"),
  ).toBe("idle")
  expect(await p.locator('[data-anim="screen-start"]').innerText()).toBe(
    "Run the screening in my browser",
  )
  expect(fx.watch(p).errors).toEqual([])
}, 120000)

test("oneAndFourWorkersPaintTheSameGridAndTheSameSummaryNumbers", async () => {
  const grids: string[] = []
  const sums: string[] = []
  for (const n of ["1", "4"]) {
    const p = await open()
    await p.locator('[data-anim="workers"]').selectOption(n)
    await p.evaluate(() => window.PANEL.start())
    grids.push(
      await p.evaluate(() =>
        [...document.querySelectorAll("[data-cell]")]
          .map((e) => e.getAttribute("class"))
          .join("|"),
      ),
    )
    sums.push((await text(p, "summary")).replace(/in [\d.]+ s on [^(]+\(/, "("))
  }
  expect(grids[1]).toBe(grids[0] as string)
  expect(sums[1]).toBe(sums[0] as string)
}, 120000)

test("withDrawsTheRunSaysSoAndStillMatchesTheBatchNominal", async () => {
  const p = await open()
  await p.locator('[data-anim="draws"]').check()
  const r = await p.evaluate(() => window.PANEL.start())
  expect(r).toBe("done")
  expect(await text(p, "summary")).toContain(
    "with 32 uncertainty draws per cell",
  )
  expect(await text(p, "check")).toContain("Check passed")
}, 180000)

test("cancelStopsPaintingAndSaysSoH8", async () => {
  const p = await open()
  await p.locator('[data-anim="draws"]').check()
  const btn = p.locator('[data-anim="screen-start"]')
  await btn.click()
  await p.waitForFunction(
    () =>
      document.querySelector('[data-anim="screen-start"]')?.textContent ===
      "Cancel the run",
  )
  await p.waitForTimeout(300)
  await btn.click()
  const n = await filled(p)
  expect(await text(p, "summary")).toContain("Cancelled")
  expect(await text(p, "check")).toContain("because the run was cancelled")
  expect(
    await p.locator('[data-anim="computing"]').getAttribute("data-state"),
  ).toBe("idle")
  await p.waitForTimeout(600)
  expect(await filled(p)).toBe(n) // nothing painted afterwards
  expect(n).toBeLessThan(864)
}, 120000)

test("aNewRunCancelsTheOldOneNewestWins", async () => {
  const p = await open()
  await p.locator('[data-anim="draws"]').check()
  const [a, b] = await p.evaluate(async () => {
    const first = window.PANEL.start()
    await new Promise((r) => setTimeout(r, 200))
    const second = window.PANEL.start()
    return [await first, await second]
  })
  expect(a).toBe("cancelled")
  expect(b).toBe("done")
  expect(await filled(p)).toBe(864)
  expect(await text(p, "check")).toContain("Check passed")
}, 240000)

test("aBrokenContextShowsAnErrorStateWithoutHangingF7", async () => {
  const p = await open({ truncate: true })
  const t0 = Date.now()
  const r = await p.evaluate(() => window.PANEL.start())
  expect(r).toBe("failed")
  expect(Date.now() - t0).toBeLessThan(15000)
  expect(await text(p, "summary")).toContain("The screening could not finish")
  expect(await text(p, "check")).toContain("No check was made")
  expect(await filled(p)).toBe(0)
  expect(
    await p.locator('[data-anim="computing"]').getAttribute("data-state"),
  ).toBe("idle")
  expect(
    await p.evaluate(() =>
      window.LOG.some((l) => l.includes("pool.worker.failed")),
    ),
  ).toBe(true)
}, 60000)

test("withoutTheWorkerApiItRunsOnOneLaneAndSaysSoF5", async () => {
  const p = await open({ noWorker: true })
  const r = await p.evaluate(() => window.PANEL.start())
  expect(r).toBe("done")
  expect(await p.locator(".tv-lane").count()).toBe(1)
  expect(await text(p, "lanes")).toContain("Single lane")
  expect(await text(p, "summary")).toContain("on a single lane")
  expect(await text(p, "check")).toContain("Check passed")
  expect(
    await p.evaluate(() => window.LOG.some((l) => l.includes("pool.fallback"))),
  ).toBe(true)
}, 120000)
