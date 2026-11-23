// Plan 08 Task 4/5: the comparison lanes and the one-variable sweep on the built report in a real Chrome. One suite body, two sizes: the
// fast tier (40 live moves) and the proof tier (200). Heights, wording, the one clock, live latency with a sweep running, cancel and stale.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import type { Page } from "playwright"
import { OVERCLAIM_PATTERN } from "../../src/core/report/outline"
import { repoRoot, visibleText } from "../helpers"
import { textContrast } from "../support/pageContrast"
import { type QaBrowser, qaReport, startQa } from "../support/qaPage"
import type { Tier } from "./scale"

export type CompareScale = { tier: Tier; moves: number }
export const COMPARE_FAST: CompareScale = { tier: "fast", moves: 40 }
export const COMPARE_PROOF: CompareScale = { tier: "proof", moves: 200 }

/** Inherited and frozen (plans 00, 06, 07 and the plan 08 spike, docs/spikes/plan-08.md). */
const T_PAGE_PX = 9000
const T_SIZE_MIB = 8
const T_LIVE_MS = 100
const T_OPEN_PX = 900
const PER_TEST_MS = 180_000
/** The closed height before this plan, frozen in docs/spikes/plan-08.md Task 1. */
export const BASELINE_PX = Number(
  /Baseline closed height frozen[^*]*\*\*(\d+)\*\* px/.exec(
    readFileSync(join(repoRoot, "docs/spikes/plan-08.md"), "utf8"),
  )?.[1],
)

type Sweep = {
  state: string
  tH: number
  playing: boolean
  variable: string
  points: number
} | null

export function compareBrowserSuite(S: CompareScale): void {
  let qa: QaBrowser
  beforeAll(async () => {
    qa = await startQa()
  }, 180_000)
  afterAll(async () => {
    await qa?.close()
  })
  const t = (name: string, fn: () => Promise<void>) =>
    test(name, fn, PER_TEST_MS)
  const mounted = (p: Page) =>
    p.waitForFunction(() => window.__anim?.state() != null, undefined, {
      timeout: 30_000,
    })
  // no scrolling: the day player autoplays when the section scrolls into view, which these tests do not want
  const openTab = (p: Page, tab: "screening" | "compare" | "sweep") =>
    p.evaluate((id) => {
      ;(
        document.getElementById("details-screening") as HTMLDetailsElement
      ).open = true
      ;(document.getElementById(`watch-tabs-tab-${id}`) as HTMLElement).click()
    }, tab)
  const sweep = (p: Page) => p.evaluate(() => window.__anim?.sweep() as Sweep)
  const ready = (p: Page) =>
    p.waitForFunction(
      () => window.__anim?.sweep()?.state === "ready",
      undefined,
      {
        timeout: 60_000,
      },
    )

  t("closedHeightWithinTheFrozenBaselineAndTheOpenPanelsFitH12", async () => {
    expect(BASELINE_PX).toBeGreaterThan(8000)
    const { path } = await qaReport()
    const mib = statSync(path).size / 1048576
    const page = await qa.open({ width: 1280, height: 800, hash: "#test" })
    await mounted(page)
    const closed = await page.evaluate(
      () => document.documentElement.scrollHeight,
    )
    const row = await page.evaluate(
      () =>
        (
          document.querySelector("#details-screening > summary") as HTMLElement
        ).getBoundingClientRect().height,
    )
    // the closed disclosure is still one row, and the tabs inside it are hidden
    expect(
      await page.evaluate(
        () =>
          (document.getElementById("details-screening") as HTMLDetailsElement)
            .open,
      ),
    ).toBe(false)
    console.log(
      `closed page height at 1280: ${closed} px (baseline ${BASELINE_PX}, T_page_px ${T_PAGE_PX}); summary row ${row} px; file ${mib.toFixed(2)} MiB`,
    )
    expect(closed).toBeLessThanOrEqual(BASELINE_PX) // T_delta_px 0
    expect(closed).toBeLessThanOrEqual(T_PAGE_PX)
    expect(mib).toBeLessThanOrEqual(T_SIZE_MIB)
    const heights: Record<string, number> = {}
    for (const tab of ["screening", "compare", "sweep"] as const) {
      await openTab(page, tab)
      if (tab === "sweep") await ready(page)
      await page.waitForTimeout(300)
      heights[tab] = await page.evaluate(
        () =>
          (
            document.getElementById("details-screening") as HTMLElement
          ).getBoundingClientRect().height,
      )
    }
    console.log(
      `open disclosure height: screening ${heights.screening} px, compare ${heights.compare} px, sweep ${heights.sweep} px (T_open_px ${T_OPEN_PX})`,
    )
    for (const h of Object.values(heights))
      expect(h).toBeLessThanOrEqual(T_OPEN_PX)
    expect(heights.compare).toBeGreaterThan(300) // a control: the panel really drew its lanes
    expect(heights.sweep).toBeGreaterThan(300)
    expect(page.errors).toEqual([])
  })

  t("lanesFollowTheDayPlayersClockAt24SeeksAndAddNoTickerH4", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await openTab(page, "compare")
    expect(
      await page.locator("#watch-tabs-panel-compare [data-lane-chart]").count(),
    ).toBe(5)
    const f0 = await page.evaluate(() => window.__anim?.frames() ?? -1)
    for (let k = 0; k < 24; k++) {
      await page.locator('#watch [data-anim="scrub"]').evaluate((el, v) => {
        ;(el as HTMLInputElement).value = String(v)
        el.dispatchEvent(new Event("input", { bubbles: true }))
      }, k + 0.4)
      const r = await page.evaluate(() => ({
        tH: window.__anim?.state()?.tH,
        cursors: [
          ...document.querySelectorAll<SVGLineElement>(
            '#watch-tabs-panel-compare [data-source="clock:t_h"]',
          ),
        ].map((c) => Number(c.dataset.t)),
      }))
      expect(r.cursors.length).toBe(5)
      for (const c of r.cursors) expect(c).toBe(r.tH as number)
    }
    // opening and closing the panel and seeking never started the loop: no ticker was added
    expect(await page.evaluate(() => window.__anim?.frames() ?? -1)).toBe(f0)
    // the day player's own play button moves every lane
    await page.evaluate(() =>
      (
        document.querySelector('#watch [data-anim="play"]') as HTMLElement
      ).click(),
    )
    await page.waitForFunction(
      (n) => (window.__anim?.frames() ?? 0) > n + 5,
      f0,
    )
    const sampled = await page.evaluate(
      () =>
        new Promise<number[][]>((res) => {
          const out: number[][] = []
          const step = () => {
            out.push([
              window.__anim?.state()?.tH ?? -1,
              Number(
                document
                  .querySelector(
                    '#watch-tabs-panel-compare [data-lane="reflected"] [data-source="clock:t_h"]',
                  )
                  ?.getAttribute("data-t"),
              ),
            ])
            if (out.length < 30) requestAnimationFrame(step)
            else res(out)
          }
          requestAnimationFrame(step)
        }),
    )
    for (const [a, b] of sampled) expect(b).toBe(a as number)
    expect(page.errors).toEqual([])
  })

  t("liveLatencyHoldsWithThePanelOpenAndASweepRunningH13", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await page.evaluate(() => {
      ;(document.getElementById("details-live") as HTMLDetailsElement).open =
        true
    })
    await openTab(page, "sweep")
    await ready(page)
    // keep the sweep pool busy for the whole measurement: change the variable every 700 ms
    await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>(
        '[data-anim="sweep-var"]',
      ) as HTMLSelectElement
      const keys = [...sel.options]
        .filter((o) => !o.disabled)
        .map((o) => o.value)
      let i = 0
      ;(window as unknown as { __kick: number }).__kick = window.setInterval(
        () => {
          sel.value = keys[++i % keys.length] as string
          sel.dispatchEvent(new Event("change", { bubbles: true }))
        },
        700,
      )
    })
    const lat = await page.evaluate(async (n) => {
      const root = document.getElementById("live-root") as HTMLElement
      const rg = document.getElementById(
        "live-range-midcoat_tio2_fraction",
      ) as HTMLInputElement
      const lo = Number(rg.min)
      const hi = Number(rg.max)
      const out: number[] = []
      for (let i = 0; i < n; i++) {
        const t0 = performance.now()
        rg.value = String(lo + ((hi - lo) * ((i * 37) % 101)) / 100)
        const done = new Promise<void>((resolve) => {
          const id = Number(root.dataset.requested) + 1
          const mo = new MutationObserver(() => {
            if (Number(root.dataset.shown) >= id) {
              mo.disconnect()
              resolve()
            }
          })
          mo.observe(root, {
            attributes: true,
            attributeFilter: ["data-shown"],
          })
        })
        rg.dispatchEvent(new Event("input", { bubbles: true }))
        await done
        out.push(performance.now() - t0)
      }
      clearInterval((window as unknown as { __kick: number }).__kick)
      return out
    }, S.moves)
    const sorted = [...lat].sort((a, b) => a - b)
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] as number
    console.log(
      `live latency with the sweep panel open and sweeps running, ${lat.length} moves: median ${(sorted[Math.floor(sorted.length / 2)] as number).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${(sorted[sorted.length - 1] as number).toFixed(1)} ms (T_live_ms ${T_LIVE_MS})`,
    )
    expect(lat.length).toBe(S.moves)
    // strict bound in the proof tier (quiet machine); the fast tier runs beside other suites and sessions, so it only catches a gross regression
    expect(p95).toBeLessThanOrEqual(
      S.tier === "proof" ? T_LIVE_MS : 3 * T_LIVE_MS,
    )
    // the moves marked the sweep stale or cancelled it; the page is still sound
    expect(["stale", "ready", "running", "idle"]).toContain(
      (await sweep(page))?.state as string,
    )
    expect(page.errors).toEqual([])
  })

  t("aLiveMoveCancelsARunningSweepAndMarksItStaleH15", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await page.evaluate(() => {
      ;(document.getElementById("details-live") as HTMLDetailsElement).open =
        true
    })
    await openTab(page, "sweep")
    await ready(page)
    await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>(
        '[data-anim="sweep-var"]',
      ) as HTMLSelectElement
      sel.value = "wind_m_s"
      sel.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await page.waitForFunction(
      () => window.__anim?.sweep()?.state === "running",
    )
    await page.evaluate(() => {
      const rg = document.getElementById(
        "live-range-midcoat_tio2_fraction",
      ) as HTMLInputElement
      rg.value = rg.max
      rg.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await page.waitForFunction(
      () => window.__anim?.sweep()?.state === "stale",
      undefined,
      { timeout: 10_000 },
    )
    expect(
      await page.locator('[data-anim="sweep-status"]').innerText(),
    ).toContain("out of date")
    // the live numbers still update (the live worker is not the sweep pool)
    await page.waitForFunction(() => {
      const r = document.getElementById("live-root") as HTMLElement
      return r.dataset.shown === r.dataset.requested
    })
    expect(page.errors).toEqual([])
  })

  t("nothingAutoplaysAndReducedMotionKeepsTheLoopAtZeroH11", async () => {
    const page = await qa.open({ hash: "#test", reducedMotion: true })
    await mounted(page)
    await openTab(page, "sweep")
    await ready(page)
    await page.waitForTimeout(800)
    expect((await sweep(page))?.playing).toBe(false)
    expect(await page.evaluate(() => window.__anim?.frames() ?? -1)).toBe(0)
    expect(
      await page.locator("#watch-tabs-panel-sweep [data-sweep-chart]").count(),
    ).toBe(5)
    await page
      .locator('#watch-tabs-panel-sweep [data-anim="sweep-speed"]')
      .selectOption("4")
    await page
      .locator('#watch-tabs-panel-sweep [data-anim="sweep-play"]')
      .click()
    await page.waitForFunction(() => (window.__anim?.sweep()?.tH ?? 0) > 1)
    await page
      .locator('#watch-tabs-panel-sweep [data-anim="sweep-play"]')
      .click()
    expect((await sweep(page))?.playing).toBe(false)
    expect(page.errors).toEqual([])
  })

  t("wordingAndNoNaNOnTheBuiltPageH9H14", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await openTab(page, "sweep")
    await ready(page)
    const html = await page.evaluate(
      () => document.getElementById("watch")?.outerHTML ?? "",
    )
    const text = visibleText(html)
    expect(OVERCLAIM_PATTERN.test(text)).toBe(false)
    expect(/\boptimal\b/i.test(text)).toBe(false)
    expect(text).not.toMatch(/NaN|undefined/)
    expect(text).toContain("Model output, not a measurement")
    expect(text).toContain("parameter uncertainty only")
    expect(text).toContain("relative cost units")
    expect(text).toContain("US")
    expect(text).toContain("ageing is not shown")
    for (const o of ["corrosion_risk", "delam_proxy", "cost_proxy"])
      expect(
        await page
          .locator(`figure[data-outcome="${o}"] [data-proxy-badge]`)
          .count(),
        o,
      ).toBe(1)
    expect(
      await page
        .locator('figure[data-outcome="t_max_c"] [data-proxy-badge]')
        .count(),
    ).toBe(0)
    // every drawn series of the new panels declares a source
    const bare = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll(
            '#watch-tabs-panel-compare path[class*="tv-lane__line"],#watch-tabs-panel-sweep path[class*="tv-sweep__"]',
          ),
        ].filter((e) => !e.getAttribute("data-source")).length,
    )
    expect(bare).toBe(0)
    expect(page.errors).toEqual([])
  })

  t("textContrastOfTheNewPanelsMeetsAABothThemesH13", async () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await qa.open({ hash: "#test", scheme })
      await mounted(page)
      await page.evaluate((th) => {
        document.documentElement.dataset.theme = th
      }, scheme)
      let n = 0
      for (const tab of ["compare", "sweep"] as const) {
        await openTab(page, tab)
        if (tab === "sweep") await ready(page)
        const rows = await textContrast(page, `#watch-tabs-panel-${tab}`)
        expect(rows.length, `${scheme} ${tab}`).toBeGreaterThan(10)
        n += rows.length
        for (const r of rows.filter((x) => !x.gradient && !x.exempt))
          expect(
            r.ratio,
            `${scheme} ${tab} ${r.key} "${r.text}"`,
          ).toBeGreaterThanOrEqual(4.5)
      }
      console.log(
        `text contrast of the new panels, ${scheme}: ${n} text elements, all at least 4.5`,
      )
      await page.context().close()
    }
  })
}
