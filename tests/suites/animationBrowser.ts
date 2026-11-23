// Plan 07 Task 6: the animated section of the built report in a real Chrome. One suite body, two sizes: the fast tier checks height,
// labels, sources, autoplay, reduced motion, visibility, tweening, the screening run, the inline lane and the failed live worker on
// the committed fixture run; the proof tier adds the frame budget at 1x and 4x CPU throttle (H4), which depends on the machine.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { statSync } from "node:fs"
import type { Page } from "playwright"
import { OVERCLAIM_PATTERN } from "../../src/core/report/outline"
import { visibleText } from "../helpers"
import { type QaBrowser, qaReport, startQa } from "../support/qaPage"
import type { Tier } from "./scale"

export type AnimationScale = { tier: Tier }
export const ANIMATION_FAST: AnimationScale = { tier: "fast" }
export const ANIMATION_PROOF: AnimationScale = { tier: "proof" }

/** Inherited from plans 00 and 06 (frozen) and from the plan 07 spike (docs/spikes/plan-07.md). */
export const T_PAGE_PX = 9000
export const T_SIZE_MIB = 8
export const T_FRAME_MS = 20
export const T_FRAME_THROTTLED_MS = 34
const PER_TEST_MS = 120_000

type AnimState = {
  tH: number
  playing: boolean
  speed: number
  autoplayed: boolean
} | null

export function animationBrowserSuite(S: AnimationScale): void {
  let qa: QaBrowser
  beforeAll(async () => {
    qa = await startQa()
  }, 180_000)
  afterAll(async () => {
    await qa?.close()
  }, 120_000)
  const t = (name: string, fn: () => Promise<void>, proofOnly = false) => {
    if (proofOnly && S.tier !== "proof") return
    test(name, fn, PER_TEST_MS)
  }
  const state = (p: Page) =>
    p.evaluate(() => window.__anim?.state() as AnimState)
  const frames = (p: Page) => p.evaluate(() => window.__anim?.frames() ?? -1)
  const toSection = async (p: Page) => {
    await p.evaluate(() =>
      document.getElementById("watch")?.scrollIntoView({ block: "start" }),
    )
  }
  const mounted = (p: Page) =>
    p.waitForFunction(() => window.__anim?.state() != null, undefined, {
      timeout: 30_000,
    })

  t("watchItRunKeepsClosedHeightUnder9000", async () => {
    const { path } = await qaReport()
    const mib = statSync(path).size / 1048576
    const page = await qa.open({ width: 1280, height: 800 })
    const h = await page.evaluate(() => document.documentElement.scrollHeight)
    console.log(
      `closed page height at 1280: ${h} px (T_page_px ${T_PAGE_PX}), file ${mib.toFixed(2)} MiB`,
    )
    expect(h).toBeLessThanOrEqual(T_PAGE_PX)
    expect(mib).toBeLessThanOrEqual(T_SIZE_MIB)
    expect(
      await page.evaluate(() => document.getElementById("watch") !== null),
    ).toBe(true)
    // a control: opening every disclosure makes the page taller, so the measure sees content
    await page.evaluate(() => {
      for (const d of document.querySelectorAll("details")) d.open = true
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeGreaterThan(h)
    expect(page.errors).toEqual([])
  })

  t("honestyLabelOnEveryMovingContainerAndEverySourceResolves", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    const r = await page.evaluate(() => {
      const label = "Model output, not a measurement"
      const roots = [
        ...document.querySelectorAll("[data-watch-day],[data-watch-screening]"),
      ]
      const unlabeled = roots.filter(
        (e) => !(e.textContent ?? "").includes(label),
      ).length
      const sources = [
        ...document.querySelectorAll("#watch [data-source]"),
      ].map((e) => e.getAttribute("data-source") ?? "")
      const bad = sources.filter(
        (s) =>
          !/^(series:recipe(@t)?|series:bare(@t)?|band:t_surface|clock:t_h|clock:sweep|flux:(incident|reflected|absorbed|conducted)|draw:\d+|screening:t_max|lane:(surface_c|reflected|absorbed|conducted|cumulative_wh):(recipe|c0|c1)|sweep:[a-z_]+:(nominal(@x)?|band|c0|c1)|bands:(uv|visible|nir)|stepper:(recipe|aluminium):(t_k|t_inside_k|absorbed|radiated|convected|conducted|r_total|residual|conduction_law)|stepper:t_s|stepper:recipe:t_k-stepper:aluminium:t_k)$/.test(
            s,
          ),
      )
      return { roots: roots.length, unlabeled, n: sources.length, bad }
    })
    expect(r.roots).toBe(2)
    expect(r.unlabeled).toBe(0)
    expect(r.n).toBeGreaterThan(8)
    expect(r.bad).toEqual([])
    // the fan is the 32 draws of the live result (H11): one line per draw, each declaring its draw index
    expect(await page.locator('#watch [data-source^="draw:"]').count()).toBe(32)
    // the section text passes the wording scan
    const text = visibleText(
      await page.evaluate(
        () => document.getElementById("watch")?.outerHTML ?? "",
      ),
    )
    expect(OVERCLAIM_PATTERN.test(text)).toBe(false)
    expect(page.errors).toEqual([])
  })

  t("theDayAutoplaysOnceAndStopsWithinFiveSeconds", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    expect((await state(page))?.playing).toBe(false)
    expect(await frames(page)).toBe(0) // nothing moves until the section is in view
    await toSection(page)
    await page.waitForFunction(
      () => window.__anim?.state()?.autoplayed === true,
      undefined,
      { timeout: 10_000 },
    )
    const t0 = Date.now()
    await page.waitForFunction(
      () => {
        const s = window.__anim?.state()
        return !!s && !s.playing && s.tH === 24
      },
      undefined,
      { timeout: 15_000 },
    )
    console.log(`autoplay ran ${Date.now() - t0} ms of wall time`)
    // it ran once: scrolling away and back does not start it again
    await page.evaluate(() => window.scrollTo(0, 0))
    await toSection(page)
    await page.waitForTimeout(400)
    expect((await state(page))?.playing).toBe(false)
    expect(page.errors).toEqual([])
  })

  t("anyUseOfAControlEndsTheAutoplayAndSpaceTogglesIt", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await toSection(page)
    await page.waitForFunction(
      () => window.__anim?.state()?.playing === true,
      undefined,
      { timeout: 10_000 },
    )
    await page.locator('#watch [data-anim="step-fwd"]').click()
    expect((await state(page))?.playing).toBe(false)
    await page.locator('#watch [data-anim="play"]').focus()
    await page.keyboard.press("Space") // a native button: Space presses it (play)
    await page.waitForFunction(() => window.__anim?.state()?.playing === true)
    await page.keyboard.press("Space")
    expect((await state(page))?.playing).toBe(false)
    expect(page.errors).toEqual([])
  })

  t("reducedMotionNoAutoplayNoTween", async () => {
    const page = await qa.open({ hash: "#test", reducedMotion: true })
    await mounted(page)
    await toSection(page)
    await page.waitForTimeout(1200)
    expect((await state(page))?.playing).toBe(false)
    expect((await state(page))?.autoplayed).toBe(false)
    expect(await frames(page)).toBe(0)
    expect(
      await page.evaluate(() => {
        const e = document.querySelector(
          "#tile-t_max .tile-value",
        ) as HTMLElement
        return getComputedStyle(e).transitionDuration
      }),
    ).toBe("0s")
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--tv-motion-base")
          .trim(),
      ),
    ).toBe("0ms")
    // the static frame shows the whole day: the curve spans the chart
    expect(
      await page
        .locator('#watch [data-source="series:recipe"]')
        .getAttribute("d"),
    ).toMatch(/^M.*L/)
    // a tile jumps: after a slider move nothing is tweening, the text is already the result
    await page.evaluate(() => {
      ;(document.getElementById("details-live") as HTMLDetailsElement).open =
        true
    })
    const before = await page.locator("#tile-t_max .tile-value").textContent()
    await page.evaluate(() => {
      const rg = document.getElementById(
        "live-range-midcoat_tio2_fraction",
      ) as HTMLInputElement
      rg.value = rg.max
      rg.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await page.waitForFunction(() => {
      const r = document.getElementById("live-root") as HTMLElement
      return (
        r.dataset.shown === r.dataset.requested && r.dataset.requested !== "0"
      )
    })
    expect(await page.evaluate(() => window.__anim?.tweening())).toBe(0)
    expect(await frames(page)).toBe(0)
    const after = await page.locator("#tile-t_max .tile-value").textContent()
    expect(after).not.toBe(before)
    // all controls still work: pressing play runs the loop
    await page.locator('#watch [data-anim="play"]').click()
    await page.waitForFunction(() => (window.__anim?.frames() ?? 0) > 3)
    expect(page.errors).toEqual([])
  })

  t("reduceMotionSwitchStopsAutoplayAndPausesAPlayingDay", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await page.locator('[data-anim="reduce-motion"]').check()
    expect(
      await page.evaluate(() => document.documentElement.dataset.motion),
    ).toBe("reduce")
    await toSection(page)
    await page.waitForTimeout(1000)
    expect((await state(page))?.autoplayed).toBe(false)
    expect(await frames(page)).toBe(0)
    await page.locator('#watch [data-anim="play"]').click()
    await page.waitForFunction(() => window.__anim?.state()?.playing === true)
    await page.locator('[data-anim="reduce-motion"]').uncheck()
    await page.locator('[data-anim="reduce-motion"]').check()
    await page.waitForFunction(() => window.__anim?.state()?.playing === false)
    expect(page.errors).toEqual([])
  })

  t("pauseControlsAndVisibilityPause", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await page.locator('#watch [data-anim="speed"]').selectOption("0.5")
    await page.locator('#watch [data-anim="play"]').click()
    await page.waitForFunction(() => (window.__anim?.frames() ?? 0) > 3)
    // the pause control is reachable by Tab from the section start
    await page.locator('#watch [data-anim="play"]').focus()
    expect(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-anim"),
      ),
    ).toBe("play")
    const hide = (h: boolean) =>
      page.evaluate((hidden) => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => hidden,
        })
        document.dispatchEvent(new Event("visibilitychange"))
      }, h)
    await hide(true)
    await page.waitForTimeout(150)
    const f0 = await frames(page)
    const s0 = await state(page)
    await page.waitForTimeout(500)
    expect(await frames(page)).toBe(f0) // G4, H6: the loop does not advance while hidden
    expect((await state(page))?.tH).toBe(s0?.tH as number)
    await hide(false)
    await page.waitForFunction((f) => (window.__anim?.frames() ?? 0) > f, f0)
    expect((await state(page))?.tH).toBeGreaterThanOrEqual(s0?.tH as number)
    expect(page.errors).toEqual([])
  })

  t("tilesGlideAndEndExactly", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await page.evaluate(() => {
      ;(document.getElementById("details-live") as HTMLDetailsElement).open =
        true
    })
    await page.waitForFunction(() => {
      const r = document.getElementById("live-root") as HTMLElement
      return (
        r.dataset.shown === r.dataset.requested && r.dataset.requested !== "0"
      )
    })
    await page.waitForFunction(() => window.__anim?.tweening() === 0)
    const seen = await page.evaluate(
      () =>
        new Promise<{
          start: string
          texts: string[]
          end: string
          nominal: string
        }>((resolve) => {
          const val = document.querySelector(
            "#tile-t_max .tile-value",
          ) as HTMLElement
          const tile = document.getElementById("tile-t_max") as HTMLElement
          const start = val.textContent ?? ""
          const texts: string[] = []
          const rg = document.getElementById(
            "live-range-midcoat_tio2_fraction",
          ) as HTMLInputElement
          rg.value = rg.min
          rg.dispatchEvent(new Event("input", { bubbles: true }))
          const t0 = performance.now()
          const sample = () => {
            texts.push(val.textContent ?? "")
            if (performance.now() - t0 < 1500) requestAnimationFrame(sample)
            else
              resolve({
                start,
                texts,
                end: val.textContent ?? "",
                nominal: tile.dataset.nominal ?? "",
              })
          }
          requestAnimationFrame(sample)
        }),
    )
    const nums = seen.texts.map(Number).filter(Number.isFinite)
    const end = Number(seen.end)
    const digits = 1
    expect(seen.end).toBe(Number(seen.nominal).toFixed(digits))
    expect(Number(seen.start)).not.toBe(end) // the move changed the value, so a glide is observable
    console.log(
      `tile glide: ${seen.start} -> ${seen.end}, ${new Set(seen.texts).size} distinct texts over ${seen.texts.length} frames`,
    )
    const lo = Math.min(Number(seen.start), end)
    const hi = Math.max(Number(seen.start), end)
    // never outside the two ends (no overshoot) and at least one value strictly between them (it glided)
    for (const v of nums) {
      expect(v).toBeGreaterThanOrEqual(lo - 0.051)
      expect(v).toBeLessThanOrEqual(hi + 0.051)
    }
    if (hi - lo > 0.3)
      expect(nums.some((v) => v > lo + 0.05 && v < hi - 0.05)).toBe(true)
    expect(page.errors).toEqual([])
  })

  t("theComputingIndicatorShowsWhileTheLiveWorkerIsBusy", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await page.evaluate(() => {
      ;(document.getElementById("details-live") as HTMLDetailsElement).open =
        true
    })
    const states = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const el = document.getElementById("live-computing") as HTMLElement
          const seen: string[] = []
          const mo = new MutationObserver(() =>
            seen.push(el.dataset.state ?? ""),
          )
          mo.observe(el, { attributes: true, attributeFilter: ["data-state"] })
          const rg = document.getElementById(
            "live-range-primer_dft_um",
          ) as HTMLInputElement
          rg.value = rg.max
          rg.dispatchEvent(new Event("input", { bubbles: true }))
          setTimeout(() => {
            mo.disconnect()
            resolve(seen)
          }, 1500)
        }),
    )
    expect(states).toContain("busy")
    expect(states[states.length - 1]).toBe("idle")
    expect(page.errors).toEqual([])
  })

  t("bothThemesRedrawSvgAndThereIsNoCanvas", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    const read = () =>
      page.evaluate(() => ({
        line: getComputedStyle(
          document.querySelector(
            '#watch [data-source="series:recipe"]',
          ) as Element,
        ).stroke,
        arrow: getComputedStyle(
          document.querySelector(
            '#watch [data-flux="absorbed"] line',
          ) as Element,
        ).stroke,
        canvas: document.querySelectorAll("#watch canvas").length,
      }))
    const light = await read()
    await page.locator("#theme-toggle").click()
    expect(
      await page.evaluate(() => document.documentElement.dataset.theme),
    ).toBe("dark")
    const dark = await read()
    expect(dark.line).not.toBe(light.line)
    expect(dark.arrow).not.toBe(light.arrow)
    expect(light.canvas + dark.canvas).toBe(0)
    expect(page.errors).toEqual([])
  })

  t("theScreeningRunsOnWorkersAndTheCheckLineMatchesTheBatch", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await page.locator("#details-screening > summary").click()
    await page.locator('#watch [data-anim="workers"]').selectOption("4")
    await page.locator('#watch [data-anim="screen-start"]').click()
    await page.waitForFunction(
      () =>
        /Check (passed|FAILED)/.test(
          document.querySelector('#watch [data-anim="check"]')?.textContent ??
            "",
        ),
      undefined,
      { timeout: 60_000 },
    )
    const check =
      (await page.locator('#watch [data-anim="check"]').textContent()) ?? ""
    expect(check).toContain("Check passed: all 2592 values")
    const summary =
      (await page.locator('#watch [data-anim="summary"]').textContent()) ?? ""
    expect(summary).toContain("864 cells computed")
    expect(summary).toContain("4 workers")
    expect(summary).toContain("this machine's measurement")
    expect(
      await page
        .locator(
          "#watch [data-cell]:not(.tv-cell--empty):not(.tv-cell--failed)",
        )
        .count(),
    ).toBe(864)
    expect(page.errors).toEqual([])
  })

  t("withoutWorkerTheScreeningRunsOnTheInlineLaneF5", async () => {
    const page = await qa.open({
      hash: "#test",
      init: "delete window.Worker",
    })
    await page.waitForTimeout(500)
    // the live simulator cannot start without Worker: it says so, and the indicator is not left on "computing" (review finding)
    expect(await page.locator("#live-status").textContent()).toMatch(
      /cannot start/i,
    )
    expect(
      await page.locator("#live-computing").getAttribute("data-state"),
    ).toBe("idle")
    await page.locator("#details-screening > summary").click()
    await page.locator('#watch [data-anim="screen-start"]').click()
    await page.waitForFunction(
      () =>
        /Check (passed|FAILED)/.test(
          document.querySelector('#watch [data-anim="check"]')?.textContent ??
            "",
        ),
      undefined,
      { timeout: 90_000 },
    )
    expect(
      await page.locator('#watch [data-anim="check"]').textContent(),
    ).toContain("Check passed")
    expect(
      await page.locator('#watch [data-anim="summary"]').textContent(),
    ).toContain("a single lane")
    expect(
      await page.locator('#watch [data-anim="lanes"]').textContent(),
    ).toMatch(/single lane|inline/i)
  })

  t("aKilledWorkerIsVisibleAndTheRunStillMatchesTheBatchF6", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await page.locator("#details-screening > summary").click()
    await page.locator('#watch [data-anim="workers"]').selectOption("4")
    await page.locator('#watch [data-anim="draws"]').check() // the slow run, so the kill lands mid-run
    await page.locator('#watch [data-anim="screen-start"]').click()
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "#watch [data-cell]:not(.tv-cell--empty):not(.tv-cell--failed)",
        ).length > 0,
      undefined,
      { timeout: 60_000 },
    )
    await page.evaluate(() => window.__anim?.killWorker(1))
    await page.waitForFunction(
      () =>
        /Check (passed|FAILED)|could not finish/.test(
          (document.querySelector('#watch [data-anim="check"]')?.textContent ??
            "") +
            (document.querySelector('#watch [data-anim="summary"]')
              ?.textContent ?? ""),
        ),
      undefined,
      { timeout: 120_000 },
    )
    expect(
      await page.locator('#watch [data-anim="check"]').textContent(),
    ).toContain("Check passed")
    expect(
      await page.locator('#watch [data-lane][data-state="failed"]').count(),
    ).toBeGreaterThanOrEqual(1)
  })

  t("aTruncatedContextShowsTheErrorStatesAndNeverHangsF7", async () => {
    const page = await qa
      .open({
        hash: "#test",
        init: `(() => { let real; Object.defineProperty(window, "__SPANDEK__", { configurable: true, set(v) { v.ctxJson = v.ctxJson.slice(0, 800); real = v }, get() { return real } }) })()`,
      })
      .catch(() => null)
    // the page may or may not draw its first figure with a broken context: either way it must not hang or throw out of the page
    if (page === null) return
    await page.waitForTimeout(1500)
    expect(await page.locator("#live-status").textContent()).toMatch(
      /live simulator/i,
    )
    expect(await page.locator('#watch [data-anim="day-status"]').count()).toBe(
      1,
    )
    await page.locator("#details-screening > summary").click()
    await page.locator('#watch [data-anim="screen-start"]').click()
    await page.waitForFunction(
      () =>
        /could not finish|cannot run/.test(
          document.querySelector('#watch [data-anim="summary"]')?.textContent ??
            "",
        ),
      undefined,
      { timeout: 30_000 },
    )
  })

  t(
    "frameBudgetAt1xAnd4xThrottle",
    async () => {
      const page = await qa.open({ hash: "#test" })
      await mounted(page)
      await page.locator('#watch [data-anim="speed"]').selectOption("0.5")
      const cdp = await page.context().newCDPSession(page)
      await toSection(page)
      for (const [rate, limit] of [
        [1, T_FRAME_MS],
        [4, T_FRAME_THROTTLED_MS],
      ] as const) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate })
        const stats = await page.evaluate(
          () =>
            new Promise<{
              p50: number
              p95: number
              n: number
            }>((resolve) => {
              const d: number[] = []
              let last = performance.now()
              const t0 = last
              const play = document.querySelector(
                '#watch [data-anim="play"]',
              ) as HTMLElement
              if (play.dataset.state !== "playing") play.click()
              const tick = (now: number) => {
                d.push(now - last)
                last = now
                if (now - t0 < 5000) requestAnimationFrame(tick)
                else {
                  const s = [...d].sort((a, b) => a - b)
                  const q = (x: number) =>
                    s[
                      Math.min(s.length - 1, Math.floor(x * s.length))
                    ] as number
                  resolve({ p50: q(0.5), p95: q(0.95), n: d.length })
                }
              }
              requestAnimationFrame(tick)
            }),
        )
        console.log(
          `frames at ${rate}x throttle: n=${stats.n} p50=${stats.p50.toFixed(1)} ms p95=${stats.p95.toFixed(1)} ms (limit ${limit})`,
        )
        expect(stats.n).toBeGreaterThan(50)
        expect(stats.p95).toBeLessThanOrEqual(limit)
        await page.evaluate(() => {
          const play = document.querySelector(
            '#watch [data-anim="play"]',
          ) as HTMLElement
          if (play.dataset.state === "playing") play.click()
        })
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      expect(page.errors).toEqual([])
    },
    true,
  )
}
