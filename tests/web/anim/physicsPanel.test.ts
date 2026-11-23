import { afterAll, beforeAll, expect, test } from "bun:test"
import type { Page } from "playwright"
import { type QaBrowser, startQa } from "../../support/qaPage"

// The panel on the built report page in a real Chrome (the panel needs the page's loop, live simulator and worker).
let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 180_000)
afterAll(async () => {
  await qa?.close()
})
type Ph = {
  open: boolean
  ready: boolean
  playing: boolean
  ticker: boolean
  version: number
  tS: number
  requests: number
  state: string
}
const ph = (p: Page) => p.evaluate(() => window.__anim?.physics() as Ph)
async function open(): Promise<Page & { errors: string[] }> {
  const p = await qa.open({ hash: "#test" })
  await p.waitForFunction(() => window.__anim?.state() != null, undefined, {
    timeout: 30_000,
  })
  await p.evaluate(() => {
    ;(document.getElementById("details-screening") as HTMLDetailsElement).open =
      true
    ;(document.getElementById("watch-tabs-tab-physics") as HTMLElement).click()
  })
  await p.waitForFunction(
    () => window.__anim?.physics()?.ready === true,
    undefined,
    { timeout: 30_000 },
  )
  return p
}
const move = (p: Page, id: string, f: number) =>
  p.evaluate(
    ([i, x]) => {
      const el = document.getElementById(i as string) as HTMLInputElement
      el.value = String(
        Number(el.min) + (Number(el.max) - Number(el.min)) * (x as number),
      )
      el.dispatchEvent(new Event("input", { bubbles: true }))
    },
    [id, f] as const,
  )

test("opensAndClosesWithoutATickerLeakAndRebuildsOnReopen", async () => {
  const p = await open()
  await p.locator('[data-anim="phys-play"]').click()
  await p.waitForFunction(() => window.__anim?.physics()?.ticker === true)
  for (const tab of ["screening", "physics", "compare", "physics"])
    await p.evaluate(
      (t) =>
        (document.getElementById(`watch-tabs-tab-${t}`) as HTMLElement).click(),
      tab,
    )
  await p.waitForFunction(
    () => window.__anim?.physics()?.ready === true,
    undefined,
    { timeout: 30_000 },
  )
  const s = await ph(p)
  expect(s.open).toBe(true)
  expect(s.ticker).toBe(false) // a reopened panel starts paused: no ticker outlived the tab
  expect(s.playing).toBe(false)
  expect(s.tS).toBe(86400)
  expect(p.errors).toEqual([])
}, 120_000)

test("versionBumpsOnEverySliderChangeH16", async () => {
  const p = await open()
  const v0 = (await ph(p)).version
  for (let i = 1; i <= 5; i++) {
    await move(
      p,
      ["phys-irradiance", "phys-t-air", "phys-wind"][i % 3] as string,
      i / 6,
    )
    expect((await ph(p)).version).toBeGreaterThanOrEqual(v0 + i)
  }
  expect(p.errors).toEqual([])
}, 120_000)

test("stepsFollowTheLoopClockAtTheSpeedWithTheRemainderCarriedD2", async () => {
  const p = await open()
  await p.locator('[data-anim="phys-play"]').click()
  await p.waitForTimeout(2000)
  await p.locator('[data-anim="phys-play"]').click()
  await p.waitForFunction(() => window.__anim?.physics()?.playing === false)
  await p.waitForTimeout(150)
  const s = await ph(p)
  const steps = (s.tS - 86400) / 60
  // 90 steps per real second at 1x over about 2 s of frames (the first frame has dt 0, a slow frame is a pause): within 25 %
  expect(steps).toBeGreaterThan(90 * 2 * 0.6)
  expect(steps).toBeLessThan(90 * 2 * 1.25)
  expect(s.tS % 60).toBe(0)
  expect(p.errors).toEqual([])
}, 120_000)

test("transientNoteAfterAChangeAndRestartClearsItH15", async () => {
  const p = await open()
  expect(await p.locator('[data-anim="phys-status"]').innerText()).toContain(
    "Press Play",
  )
  await move(p, "phys-wind", 0.9)
  expect(await p.locator('[data-anim="phys-status"]').innerText()).toContain(
    "Transient after your change, not the settled day.",
  )
  await p.locator('[data-anim="phys-restart"]').click()
  expect((await ph(p)).tS).toBe(86400)
  expect(
    await p.locator('[data-anim="phys-status"]').innerText(),
  ).not.toContain("Transient")
  expect(p.errors).toEqual([])
}, 120_000)
