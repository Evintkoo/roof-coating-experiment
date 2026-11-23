// Plan 09 Task 5: the live physics tab on the built report in a real Chrome. One suite body, two sizes: the fast tier (40 live moves, no
// frame budget) and the proof tier (200 moves, the frame budget at 1x and 4x CPU throttle, 20 open and close cycles). Heights, the one
// clock, motion rules, continuity against an independent RK4, arrows at one scale, latency with the panel playing, workers, faults.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import type { Page } from "playwright"
import { scenarioFrom } from "../../src/core/design"
import { netFluxWM2 } from "../../src/core/models/thermal"
import { stackProps } from "../../src/core/pipeline/stackProps"
import { OVERCLAIM_PATTERN } from "../../src/core/report/outline"
import { defaultLiveState } from "../../src/web/liveState"
import { repoRoot, visibleText } from "../helpers"
import { testCtx } from "../support/dayData"
import { textContrast } from "../support/pageContrast"
import { type QaBrowser, qaReport, startQa } from "../support/qaPage"
import type { Tier } from "./scale"

export type PhysicsScale = { tier: Tier; moves: number; cycles: number }
export const PHYSICS_FAST: PhysicsScale = { tier: "fast", moves: 40, cycles: 5 }
export const PHYSICS_PROOF: PhysicsScale = {
  tier: "proof",
  moves: 200,
  cycles: 20,
}

/** Inherited and frozen (plans 00, 06, 07, 08 and the plan 09 spike, docs/spikes/plan-09.md). */
const T_PAGE_PX = 9000
const T_SIZE_MIB = 8
const T_LIVE_MS = 100
const T_OPEN09_PX = 900
const T_FRAME_MS = 20
const T_FRAME_THROTTLED_MS = 34
const PER_TEST_MS = 240_000
export const BASELINE_PX = Number(
  /Baseline closed height frozen[^*]*\*\*(\d+)\*\* px/.exec(
    readFileSync(join(repoRoot, "docs/spikes/plan-08.md"), "utf8"),
  )?.[1],
)

type Ph = {
  state: string
  open: boolean
  ready: boolean
  playing: boolean
  ticker: boolean
  lane: string | null
  version: number
  tS: number
  tK: { recipe: number; c0: number }
  raysShown: number
  rayFrames: number
  requests: number
} | null
const WORKER_COUNTER = `(function(){var W=window.Worker;if(!W)return;window.__w={created:0,terminated:0};window.Worker=function(u,o){window.__w.created++;var w=new W(u,o);var t=w.terminate.bind(w);w.terminate=function(){window.__w.terminated++;return t()};return w};window.Worker.prototype=W.prototype})();`

export function physicsBrowserSuite(S: PhysicsScale): void {
  let qa: QaBrowser
  beforeAll(async () => {
    qa = await startQa()
  }, 180_000)
  afterAll(async () => {
    await qa?.close()
  })
  const t = (name: string, fn: () => Promise<void>, proofOnly = false) => {
    if (proofOnly && S.tier !== "proof") return
    test(name, fn, PER_TEST_MS)
  }
  const mounted = (p: Page) =>
    p.waitForFunction(() => window.__anim?.state() != null, undefined, {
      timeout: 30_000,
    })
  const ph = (p: Page) => p.evaluate(() => window.__anim?.physics() as Ph)
  const openPhysics = async (p: Page) => {
    await p.evaluate(() => {
      ;(
        document.getElementById("details-screening") as HTMLDetailsElement
      ).open = true
      ;(
        document.getElementById("watch-tabs-tab-physics") as HTMLElement
      ).click()
    })
    await p.waitForFunction(
      () => window.__anim?.physics()?.ready === true,
      undefined,
      { timeout: 30_000 },
    )
  }
  const stepAndWait = async (p: Page, n: number) => {
    const before = (await ph(p))?.requests ?? 0
    await p.evaluate((k) => window.__anim?.physicsStep(k), n)
    await p.waitForFunction(
      (r) => (window.__anim?.physics()?.requests ?? 0) > r,
      before,
      { timeout: 10_000 },
    )
    await p.waitForFunction(
      () => window.__anim?.physics()?.tK.recipe !== undefined,
      undefined,
      { timeout: 10_000 },
    )
    await p.waitForTimeout(30)
  }

  t("closedHeightWithinTheFrozenBaselineAndTheOpenTabFitsH13", async () => {
    expect(BASELINE_PX).toBeGreaterThan(8000)
    const { path } = await qaReport()
    const mib = statSync(path).size / 1048576
    const page = await qa.open({ width: 1280, height: 800, hash: "#test" })
    await mounted(page)
    const closed = await page.evaluate(
      () => document.documentElement.scrollHeight,
    )
    console.log(
      `closed page height at 1280: ${closed} px (plan 08 baseline ${BASELINE_PX}, T_page_px ${T_PAGE_PX}); file ${mib.toFixed(2)} MiB`,
    )
    expect(closed).toBeLessThanOrEqual(BASELINE_PX) // T_delta_px 0
    expect(closed).toBeLessThanOrEqual(T_PAGE_PX)
    expect(mib).toBeLessThanOrEqual(T_SIZE_MIB)
    await openPhysics(page)
    const h = await page.evaluate(
      () =>
        (
          document.getElementById("details-screening") as HTMLElement
        ).getBoundingClientRect().height,
    )
    console.log(
      `open disclosure with the live physics tab: ${h} px (T_open09_px ${T_OPEN09_PX})`,
    )
    expect(h).toBeLessThanOrEqual(T_OPEN09_PX)
    expect(h).toBeGreaterThan(300) // a control: the panel really drew its panes
    expect(page.errors).toEqual([])
  })

  t("nothingAutoplaysSpaceTogglesOneTickerAndClosingStopsItH11", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    expect(await page.evaluate(() => window.__anim?.physics())).toBeNull() // no panel, no worker before the tab is opened (D13)
    await openPhysics(page)
    const f0 = await page.evaluate(() => window.__anim?.frames() ?? -1)
    await page.waitForTimeout(700)
    const s = await ph(page)
    expect(s?.playing).toBe(false)
    expect(s?.ticker).toBe(false) // opening the tab adds 0 tickers
    expect(s?.requests).toBe(0)
    expect(await page.evaluate(() => window.__anim?.frames() ?? -1)).toBe(f0)
    // Space with focus in the panel (not on a control) toggles
    await page.locator("#watch-tabs-panel-physics").focus()
    await page.keyboard.press("Space")
    await page.waitForFunction(() => window.__anim?.physics()?.playing === true)
    expect((await ph(page))?.ticker).toBe(true)
    await page.waitForTimeout(400)
    expect((await ph(page))?.tS).toBeGreaterThan(86400)
    await page.keyboard.press("Space")
    await page.waitForFunction(
      () => window.__anim?.physics()?.playing === false,
    )
    expect((await ph(page))?.ticker).toBe(false) // none when paused
    // Pause is a real button reachable by Tab
    expect(
      await page
        .locator('[data-anim="phys-play"]')
        .evaluate((e) => (e as HTMLButtonElement).tabIndex),
    ).toBeGreaterThanOrEqual(0)
    await page.locator('[data-anim="phys-play"]').click()
    await page.waitForFunction(() => window.__anim?.physics()?.playing === true)
    // closing the disclosure stops the ticker and the lane
    await page.evaluate(() => {
      ;(
        document.getElementById("details-screening") as HTMLDetailsElement
      ).open = false
    })
    await page.waitForFunction(() => window.__anim?.physics()?.open === false)
    const c = await ph(page)
    expect(c?.playing).toBe(false)
    expect(c?.ticker).toBe(false)
    expect(c?.lane).toBeNull()
    expect(page.errors).toEqual([])
  })

  t("reducedMotionNoParticlesAndMovesOneHourPerPressH11", async () => {
    const page = await qa.open({ hash: "#test", reducedMotion: true })
    await mounted(page)
    await openPhysics(page)
    expect(await page.locator('[data-layer-group="rays"] line').count()).toBe(0) // the particle layer is absent
    const f0 = await page.evaluate(() => window.__anim?.frames() ?? -1)
    await page.waitForTimeout(500)
    expect((await ph(page))?.tS).toBe(86400)
    await page.locator('[data-anim="phys-play"]').click()
    await page.waitForFunction(
      () => (window.__anim?.physics()?.tS ?? 0) > 86400,
      undefined,
      { timeout: 10_000 },
    )
    await page.waitForTimeout(300)
    const s = await ph(page)
    expect(s?.ticker).toBe(false)
    expect(s?.playing).toBe(false)
    expect(s?.rayFrames).toBe(0)
    expect(s?.tS).toBe(86400 + 3600 - 60) // the last frame of one model hour (60 steps)
    expect(await page.evaluate(() => window.__anim?.frames() ?? -1)).toBe(f0) // the loop never ran
    expect(page.errors).toEqual([])
  })

  t("hiddenTabFreezesModelTimeF7", async () => {
    const page = await qa.open({
      hash: "#test",
      init: "Object.defineProperty(document,'hidden',{get:()=>true});Object.defineProperty(document,'visibilityState',{get:()=>'hidden'})",
    })
    await mounted(page)
    await openPhysics(page)
    await page.locator('[data-anim="phys-play"]').click()
    await page.waitForTimeout(800)
    const s = await ph(page)
    expect(s?.playing).toBe(true)
    expect(s?.tS).toBe(86400) // no step was requested while hidden
    expect(s?.requests).toBe(0)
    expect(await page.evaluate(() => window.__anim?.frames() ?? -1)).toBe(0)
  })

  t(
    "aSliderChangeIsContinuousEqualsAnIndependentRk4AndMarksTheTransientH4",
    async () => {
      const page = await qa.open({ hash: "#test" })
      await mounted(page)
      await openPhysics(page)
      // run to the afternoon, then pause; the node and temperature shown are the ones the stepper produced
      await stepAndWait(page, 60 * 14)
      const s0 = await ph(page)
      const inputs = await page.evaluate(() => {
        const g = (id: string) =>
          Number((document.getElementById(id) as HTMLInputElement).value)
        return {
          g: g("live-range-irradiance_w_m2"),
          a: g("live-range-t_air_c"),
          w: g("live-range-wind_m_s"),
        }
      })
      expect(s0?.state).not.toBe("transient")
      await stepAndWait(page, 1)
      const m = await ph(page) // frame m: temperature at node m
      const T = (m as NonNullable<Ph>).tK.recipe
      const tS = (m as NonNullable<Ph>).tS
      // the change: the irradiance slider of the PANEL (shared with the live simulator, D10)
      const newG = inputs.g < 900 ? inputs.g + 150 : inputs.g - 150
      await page.evaluate((v) => {
        const el = document.getElementById(
          "phys-irradiance",
        ) as HTMLInputElement
        el.value = String(v)
        el.dispatchEvent(new Event("input", { bubbles: true }))
      }, newG)
      expect(
        await page.locator('[data-anim="phys-status"]').innerText(),
      ).toContain("Transient after your change, not the settled day.")
      // the live simulator's own slider moved with it: one source of truth
      expect(
        await page.evaluate(() =>
          Number(
            (
              document.getElementById(
                "live-range-irradiance_w_m2",
              ) as HTMLInputElement
            ).value,
          ),
        ),
      ).toBeCloseTo(newG, 6)
      await stepAndWait(page, 1)
      const after1 = (await ph(page)) as NonNullable<Ph> // node m+1: produced by the step BEFORE the change (old parameters)
      await stepAndWait(page, 1)
      const after2 = (await ph(page)) as NonNullable<Ph> // node m+2: produced by the step AFTER the change (new parameters)
      // an independent RK4 written here from netFluxWM2 and the model inputs (no stepper code): old parameters for node m to m+1, new after
      const ctx = await testCtx()
      const live = defaultLiveState(ctx.ranges, ctx.weather).inputs
      const sp = stackProps({ ...live.design, ph: live.ph }, live.layers, ctx)
      const roof = ctx.weather.roof
      const step = (T0: number, t0: number, g: number) => {
        const sc = scenarioFrom(g, inputs.a, inputs.w, ctx.weather)
        const th = {
          r_solar: sp.r_solar,
          emissivity: sp.emissivity,
          g_peak_w_m2: g,
          t_air_k: sc.t_air_c + 273.15,
          t_sky_k: sc.t_sky_k,
          h_conv_w_m2k: sc.h_conv_w_m2k,
          t_inside_k: roof.t_inside_c.value + 273.15,
          r_total_m2k_w: roof.r_total_m2k_w.value,
          c_a_j_m2k: sp.c_a_j_m2k,
        }
        const gt = (ts: number) =>
          Math.max(0, Math.sin((Math.PI * ((ts % 86400) - 21600)) / 43200)) * g
        const f = (T: number, ts: number) =>
          netFluxWM2(T, gt(ts), th) / th.c_a_j_m2k
        const k1 = f(T0, t0)
        const k2 = f(T0 + 30 * k1, t0 + 30)
        const k3 = f(T0 + 30 * k2, t0 + 30)
        const k4 = f(T0 + 60 * k3, t0 + 60)
        return T0 + 10 * (k1 + 2 * k2 + 2 * k3 + k4)
      }
      // continuity: the step that ran before the change used the old irradiance and equals the independent step from T_m
      expect(Math.abs(after1.tK.recipe - step(T, tS, inputs.g))).toBeLessThan(
        1e-9,
      )
      // the first step after the change equals the independent step with the new irradiance from T_(m+1)
      expect(
        Math.abs(after2.tK.recipe - step(after1.tK.recipe, after1.tS, newG)),
      ).toBeLessThan(1e-9)
      expect(after1.tS).toBe(tS + 60)
      expect(after2.tS).toBe(after1.tS + 60)
      expect(page.errors).toEqual([])
    },
  )

  t("arrowLengthsAreTheFluxesAtOneScaleAt24TimesH7", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await openPhysics(page)
    let checked = 0
    for (let h = 0; h < 24; h++) {
      await stepAndWait(page, 60)
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll<SVGGElement>("[data-arrow]")].map((g) => {
          const l = g.querySelector("line") as SVGLineElement
          const txt = g.querySelector("[data-flux-text]") as SVGTextElement
          return {
            pane: g
              .closest("[data-physics-scene]")
              ?.getAttribute("data-physics-scene"),
            k: g.getAttribute("data-arrow"),
            w: Number(g.getAttribute("data-w")),
            len: Number(l.getAttribute("y2")) - Number(l.getAttribute("y1")),
            text: txt.textContent,
          }
        }),
      )
      expect(rows.length).toBe(8)
      for (const r of rows) {
        // inward arrows (absorbed, conducted) point down: +y; outward arrows point up
        const sign = r.k === "absorbed" || r.k === "conducted" ? 1 : -1
        expect(Math.abs(r.len - (sign * (60 * r.w)) / 1000)).toBeLessThan(0.02) // one scale: 60 px per 1000 W/m2, in both panes
        expect(Number.parseInt(r.text ?? "", 10)).toBe(Math.round(r.w) || 0) // the number shown is the flux, to display precision
        checked++
      }
    }
    expect(checked).toBe(24 * 8)
    expect(page.errors).toEqual([])
  })

  t(
    "liveLatencyHoldsWithThePanelPlayingAndASliderBeingDraggedH14",
    async () => {
      const page = await qa.open({ hash: "#test" })
      await mounted(page)
      await page.evaluate(() => {
        ;(document.getElementById("details-live") as HTMLDetailsElement).open =
          true
      })
      await openPhysics(page)
      await page.locator('[data-anim="phys-play"]').click()
      await page.waitForFunction(
        () => window.__anim?.physics()?.playing === true,
      )
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
        return out
      }, S.moves)
      const sorted = [...lat].sort((a, b) => a - b)
      const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] as number
      console.log(
        `live latency with the physics panel playing, ${lat.length} moves: median ${(sorted[Math.floor(sorted.length / 2)] as number).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${(sorted[sorted.length - 1] as number).toFixed(1)} ms (T_live_ms ${T_LIVE_MS})`,
      )
      expect(lat.length).toBe(S.moves)
      expect(p95).toBeLessThanOrEqual(T_LIVE_MS)
      expect((await ph(page))?.playing).toBe(true) // still running; the recipe change was a parameter swap, not a restart
      expect((await ph(page))?.tS).toBeGreaterThan(86400)
      expect(page.errors).toEqual([])
    },
  )

  t(
    "manySliderMovesNeverPaintAStaleFrameAndTheVersionOnlyGrowsH16",
    async () => {
      const page = await qa.open({ hash: "#test" })
      await mounted(page)
      await openPhysics(page)
      await page.locator('[data-anim="phys-speed"]').selectOption("4")
      await page.locator('[data-anim="phys-play"]').click()
      await page.waitForFunction(
        () => window.__anim?.physics()?.playing === true,
      )
      const log = await page.evaluate(async (n) => {
        const el = document.getElementById("phys-wind") as HTMLInputElement
        const lo = Number(el.min)
        const hi = Number(el.max)
        const seen: number[] = []
        let lastTs = 0
        let backwards = 0
        for (let i = 0; i < n; i++) {
          el.value = String(lo + ((hi - lo) * ((i * 37) % 101)) / 100)
          el.dispatchEvent(new Event("input", { bubbles: true }))
          await new Promise((r) => setTimeout(r, 12))
          const s = window.__anim?.physics()
          if (s) {
            seen.push(s.version)
            if (s.tS < lastTs) backwards++
            lastTs = s.tS
          }
        }
        return { seen, backwards }
      }, S.moves)
      expect(log.backwards).toBe(0) // model time never goes back: a stale reply never paints
      for (let i = 1; i < log.seen.length; i++)
        expect(log.seen[i] as number).toBeGreaterThanOrEqual(
          log.seen[i - 1] as number,
        )
      expect((await ph(page))?.version).toBeGreaterThanOrEqual(S.moves - 1)
      expect(page.errors).toEqual([])
    },
  )

  t("openAndCloseCyclesLeaveNoWorkerBehindAndCloseIsFastH16", async () => {
    const page = await qa.open({ hash: "#test", init: WORKER_COUNTER })
    await mounted(page)
    await page.evaluate(() => {
      ;(
        document.getElementById("details-screening") as HTMLDetailsElement
      ).open = true
    })
    const live = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __w: { created: number; terminated: number }
            }
          ).__w,
      )
    const base = await live()
    const baseLive = base.created - base.terminated
    for (let i = 0; i < S.cycles; i++) {
      await page.evaluate(() =>
        (
          document.getElementById("watch-tabs-tab-physics") as HTMLElement
        ).click(),
      )
      await page.waitForFunction(
        () => window.__anim?.physics()?.ready === true,
        undefined,
        { timeout: 30_000 },
      )
      const during = await live()
      expect(during.created - during.terminated, `open ${i}`).toBe(baseLive + 1) // the one stepper lane
      const t0 = Date.now()
      await page.evaluate(() =>
        (
          document.getElementById("watch-tabs-tab-screening") as HTMLElement
        ).click(),
      )
      await page.waitForFunction(() => window.__anim?.physics()?.open === false)
      expect(Date.now() - t0).toBeLessThan(500)
      const after = await live()
      expect(after.created - after.terminated, `closed ${i}`).toBe(baseLive)
    }
    expect(page.errors).toEqual([])
  })

  t(
    "framesAt1xAnd4xAndThrottled4xHoldTheFrozenBudgetsH12",
    async () => {
      const page = await qa.open({ hash: "#test" })
      await mounted(page)
      await openPhysics(page)
      const cdp = await page.context().newCDPSession(page)
      // the machine's own frame cadence on an empty animation frame loop (a loaded or headless host may cap at 30 Hz)
      const sample = (ms: number) =>
        page.evaluate(
          (dur) =>
            new Promise<{ p50: number; p95: number; n: number }>((resolve) => {
              const d: number[] = []
              let last = performance.now()
              const t0 = last
              const tick = (now: number) => {
                d.push(now - last)
                last = now
                if (now - t0 < dur) requestAnimationFrame(tick)
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
          ms,
        )
      const base1 = await sample(1500)
      for (const [rate, limit, speed] of [
        [1, T_FRAME_MS, "1"],
        [1, T_FRAME_MS, "4"],
        [4, T_FRAME_THROTTLED_MS, "4"],
      ] as const) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate })
        await page.locator('[data-anim="phys-speed"]').selectOption(speed)
        const playing = (await ph(page))?.playing
        if (!playing) await page.locator('[data-anim="phys-play"]').click()
        const stats = await sample(5000)
        console.log(
          `physics frames at ${speed}x speed, ${rate}x throttle: n=${stats.n} p50=${stats.p50.toFixed(1)} ms p95=${stats.p95.toFixed(1)} ms (limit ${limit}; empty-page cadence p95 ${base1.p95.toFixed(1)} ms)`,
        )
        expect(stats.n).toBeGreaterThan(50)
        // a host that runs even an empty rAF loop above the limit cannot hold any page to it: the bound is then the empty-loop cadence plus 2 ms
        expect(stats.p95).toBeLessThanOrEqual(Math.max(limit, base1.p95 + 2))
        const late = (await ph(page))?.requests
        void late
        await page.locator('[data-anim="phys-play"]').click()
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      expect(page.errors).toEqual([])
    },
    true,
  )

  t("aLayerThatIsOffIsDrawnOffAndAllOffGivesNoDifferenceF5F6", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await page.evaluate(() => {
      ;(document.getElementById("details-live") as HTMLDetailsElement).open =
        true
    })
    const toggle = async (name: string) => {
      await page.evaluate((n) => {
        const cb = document.getElementById(
          `live-layer-${n}`,
        ) as HTMLInputElement
        cb.checked = !cb.checked
        cb.dispatchEvent(new Event("change", { bubbles: true }))
      }, name)
      await page.waitForFunction(() => {
        const r = document.getElementById("live-root") as HTMLElement
        return r.dataset.shown === r.dataset.requested
      })
    }
    await toggle("midcoat")
    await openPhysics(page)
    expect(
      await page.locator('[data-pane="recipe"] [data-layer="midcoat"]').count(),
    ).toBe(0)
    expect(
      await page.locator('[data-pane="recipe"] [data-layer="topcoat"]').count(),
    ).toBe(1)
    expect(await page.locator('[data-anim="phys-layer-off"]').isVisible()).toBe(
      true,
    )
    expect(
      await page.locator('[data-anim="phys-layer-off"]').innerText(),
    ).toContain("Midcoat is off in the live simulator")
    expect(
      await page
        .locator("[data-physics-scene] [data-source*='scatter']")
        .count(),
    ).toBe(0)
    await toggle("primer")
    await toggle("topcoat")
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-pane="recipe"] [data-layer]')
          .length === 1,
    )
    await stepAndWait(page, 60 * 13)
    const diff = Number(
      await page.locator('[data-anim="phys-diff"]').getAttribute("data-value"),
    )
    expect(diff).toBe(0) // recipe equals C0
    expect(await page.locator('[data-anim="phys-diff"]').innerText()).toBe(
      "0.0",
    )
    expect(page.errors).toEqual([])
  })

  t("aKilledWorkerAndNoWorkerFallBackToTheInlineLaneF4", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await openPhysics(page)
    expect((await ph(page))?.lane).toBe("worker")
    await page.locator('[data-anim="phys-play"]').click()
    await page.waitForFunction(
      () => (window.__anim?.physics()?.tS ?? 0) > 86400 + 600,
    )
    const t1 = (await ph(page))?.tS as number
    await page.evaluate(() => window.__anim?.physicsKill())
    await page.waitForFunction(
      (t) => (window.__anim?.physics()?.tS ?? 0) > t + 600,
      t1,
      { timeout: 15_000 },
    )
    expect((await ph(page))?.lane).toBe("inline") // the run went on from the last good state
    await page.locator('[data-anim="phys-play"]').click()
    // no Worker for the stepper only: the first construction (the live simulator) works, the next throws
    const none = await qa.open({
      hash: "#test",
      init: "(function(){var W=window.Worker,n=0;window.Worker=function(u,o){if(++n>1)throw new Error('no worker');return new W(u,o)};window.Worker.prototype=W.prototype})()",
    })
    await mounted(none)
    await openPhysics(none)
    expect((await ph(none))?.lane).toBe("inline")
    await none.evaluate(() => window.__anim?.physicsStep(60))
    await none.waitForFunction(
      () => (window.__anim?.physics()?.tS ?? 0) > 86400,
    )
    expect(await none.locator('[data-anim="phys-lane"]').innerText()).toBe(
      "single lane",
    )
    expect(page.errors).toEqual([])
  })

  t("wordingNoNaNAndEverySourceDeclaredOnTheBuiltPageH10H15", async () => {
    const page = await qa.open({ hash: "#test" })
    await mounted(page)
    await openPhysics(page)
    await page.locator('[data-anim="phys-speed"]').selectOption("4")
    await page.locator('[data-anim="phys-play"]').click()
    await page.waitForFunction(
      () => (window.__anim?.physics()?.tS ?? 0) > 86400 + 3600 * 8,
      undefined,
      { timeout: 30_000 },
    )
    await page.locator('[data-anim="phys-play"]').click()
    await page.waitForFunction(
      () => window.__anim?.physics()?.playing === false,
    )
    const html = await page.evaluate(
      () =>
        document.getElementById("watch-tabs-panel-physics")?.outerHTML ?? "",
    )
    const text = visibleText(html)
    expect(OVERCLAIM_PATTERN.test(text)).toBe(false)
    expect(/\boptimal\b|real-time measurement|scatter/i.test(text)).toBe(false)
    expect(text).not.toMatch(/NaN|undefined/)
    expect(text).toContain("Model output, not a measurement")
    expect(text).toContain("Illustrative scale")
    expect(text).toContain("Rays show fractions, not photons")
    expect(text).toContain("ageing is not shown")
    expect(text).toContain("not a temperature per layer")
    const bare = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll(
            '#watch-tabs-panel-physics [data-ray],#watch-tabs-panel-physics [data-arrow],#watch-tabs-panel-physics [data-anim="phys-temp"],#watch-tabs-panel-physics [data-anim="drop-surface"]',
          ),
        ].filter((e) => !e.getAttribute("data-source")).length,
    )
    expect(bare).toBe(0)
    // exactly one temperature number per scene and two in each drop: no per-layer temperature on the page
    expect(await page.locator("[data-anim='phys-temp']").count()).toBe(2)
    expect(await page.locator("[data-drop-profile] circle").count()).toBe(4)
    expect(page.errors).toEqual([])
  })

  t("textContrastOfThePhysicsPanelMeetsAABothThemesH14", async () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await qa.open({ hash: "#test", scheme })
      await mounted(page)
      await page.evaluate((th) => {
        document.documentElement.dataset.theme = th
      }, scheme)
      await openPhysics(page)
      const rows = await textContrast(page, "#watch-tabs-panel-physics")
      expect(rows.length, scheme).toBeGreaterThan(10)
      for (const r of rows.filter((x) => !x.gradient && !x.exempt))
        expect(
          r.ratio,
          `${scheme} ${r.key} "${r.text}"`,
        ).toBeGreaterThanOrEqual(4.5)
      console.log(
        `text contrast of the physics panel, ${scheme}: ${rows.length} text elements, all at least 4.5`,
      )
      await page.context().close()
    }
  })
}
