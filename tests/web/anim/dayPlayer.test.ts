import { afterAll, beforeAll, expect, test } from "bun:test"
import type { Page } from "playwright"
import { sampleSeries } from "../../../src/core/anim/frames"
import type { DayData, DayPlayer } from "../../../src/web/anim/dayPlayer"
import { fluxAt, fluxRefs } from "../../../src/web/anim/flux"
import type { Loop } from "../../../src/web/anim/loop"
import { dayChartPaths } from "../../../src/web/design/molecules/dayChart"
import { watchDay } from "../../../src/web/design/organisms/watchDay"
import { BrowserFixture } from "../../support/browserFixture"
import { loadDay, type PlainDay } from "../../support/dayData"

declare global {
  interface Window {
    A: { mount(d: PlainDay, o?: { noVisible?: boolean }): void }
    P: DayPlayer
    L: Loop
    LOG: string[]
  }
}

const fx = new BrowserFixture()
let day: PlainDay
let day2: PlainDay
let entry = ""
beforeAll(async () => {
  const out = await Bun.build({
    entrypoints: [
      new URL("../../support/animEntry.ts", import.meta.url).pathname,
    ],
    target: "browser",
    format: "iife",
    minify: false,
    root: new URL("../../../", import.meta.url).pathname,
  })
  if (!out.success) throw new Error("bundle failed")
  entry = await (out.outputs[0] as Blob).text()
  ;[day, day2] = await Promise.all([loadDay(7, "W5"), loadDay(60, "W2")])
  await fx.start()
}, 120000)
afterAll(async () => {
  await fx.stop()
}, 60000)

const markup = (d: PlainDay, name = "SP-008") => watchDay({ name, data: d })
async function open(
  o: {
    reduced?: boolean
    clock?: boolean
    scheme?: "light" | "dark"
    noVisible?: boolean
    width?: number
  } = {},
): Promise<Page> {
  const page = await fx.open(markup(day), [entry], {
    ...(o.reduced ? { reducedMotion: true } : {}),
    ...(o.clock ? { clock: true } : {}),
    ...(o.scheme ? { scheme: o.scheme } : {}),
    ...(o.width ? { width: o.width } : {}),
  })
  await page.evaluate(
    ([d, nv]) => window.A.mount(d as PlainDay, { noVisible: nv as boolean }),
    [day, o.noVisible ?? true] as const,
  )
  return page
}
const asDay = (d: PlainDay): DayData => ({
  ...d,
  flux: { ...d.flux, tSurfaceK: d.flux.tSurfaceK },
})
const frames = (p: Page) => p.evaluate(() => window.L.frames())
const state = (p: Page) => p.evaluate(() => window.P.state())

test("dayPlayerIsDataBoundAt24ScrubPositionsH3", async () => {
  const p = await open()
  const t = Float64Array.from({ length: 144 }, (_, i) => i / 6)
  const geom = dayChartPaths(asDay(day)).geometry
  for (let k = 0; k < 24; k++) {
    let h = k + 0.37 * (k % 3)
    await p.locator('[data-anim="scrub"]').evaluate((el, v) => {
      ;(el as HTMLInputElement).value = String(v)
      el.dispatchEvent(new Event("input", { bubbles: true }))
    }, h)
    h = Number(await p.locator('[data-anim="scrub"]').inputValue()) // the slider rounds to its step; the player must follow what it holds
    const got = await p.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll<HTMLElement>('[data-anim="read"]')].map(
          (e) => [e.dataset.read, Number(e.dataset.value)],
        ),
      ),
    )
    const want = {
      recipe: sampleSeries(t, Float64Array.from(day.recipeC), h),
      bare: sampleSeries(t, Float64Array.from(day.bareC), h),
      lo: sampleSeries(t, Float64Array.from(day.loC), h),
      hi: sampleSeries(t, Float64Array.from(day.hiC), h),
    }
    for (const key of ["recipe", "bare", "lo", "hi"] as const)
      expect(Math.abs((got[key] as number) - want[key])).toBeLessThan(1e-9)
    const x1 = Number(
      await p.locator('[data-source="clock:t_h"]').getAttribute("x1"),
    )
    expect(Math.abs(x1 - geom.x(h))).toBeLessThan(0.006) // the cursor is where the scrub value says
    expect(
      Number(await p.locator('[data-anim="time"]').getAttribute("data-value")),
    ).toBe(h)
  }
  expect(fx.watch(p).errors).toEqual([])
}, 120000)

test("arrowsFollowTheModelFluxAtTheCursorH10", async () => {
  const p = await open()
  const m = asDay(day).flux
  const refs = fluxRefs(m)
  for (const h of [0, 8.5, 12, 15.25, 21]) {
    await p.evaluate((v) => window.P.seek(v), h)
    const w = fluxAt(h, m)
    for (const k of [
      "incident",
      "reflected",
      "absorbed",
      "conducted",
    ] as const) {
      const g = p.locator(`[data-flux="${k}"]`)
      expect(
        Math.abs(Number(await g.getAttribute("data-w")) - w[k]),
      ).toBeLessThan(1e-9)
      expect(Number(await g.getAttribute("data-wref"))).toBe(refs[k])
      const line = g.locator("line")
      const len = Math.abs(
        Number(await line.getAttribute("y2")) -
          Number(await line.getAttribute("y1")),
      )
      expect(Math.abs(len - (70 * Math.abs(w[k])) / refs[k])).toBeLessThan(0.01)
    }
  }
  const noon = fluxAt(12, m)
  expect(Math.abs(noon.reflected / noon.incident - m.rSolar)).toBeLessThan(
    1e-12,
  )
}, 60000)

test("everyAnimatedElementDeclaresASourceThatResolvesH10", async () => {
  const p = await open()
  const els = await p.evaluate(() =>
    [...document.querySelectorAll("[data-source]")].map((e) =>
      e.getAttribute("data-source"),
    ),
  )
  expect(els.length).toBeGreaterThanOrEqual(10)
  const resolves = (s: string) =>
    /^(series:(recipe|bare)(@t)?|band:t_surface|clock:t_h|flux:(incident|reflected|absorbed|conducted)|draw:\d+)$/.test(
      s,
    )
  for (const s of els) expect(resolves(s as string), s as string).toBe(true)
  // the fan is only there when draws are given, 32 of them, each a data-source
  await p.evaluate((d) => window.P.setData(d as never), day)
  expect(await p.locator('[data-source^="draw:"]').count()).toBe(32)
  const moving = await p.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          ".tv-daychart__line,.tv-daychart__cursor,.tv-daychart__dot,.tv-flux__arrow,.tv-fan__line",
        ),
      ].filter((e) => !e.getAttribute("data-source")).length,
  )
  expect(moving).toBe(0)
}, 60000)

test("changingTheRecipeRedrawsFromTheNewSeries", async () => {
  const p = await open()
  const before = await p
    .locator('[data-source="series:recipe"]')
    .getAttribute("d")
  await p.evaluate((d) => window.P.setData(d as never), day2)
  const after = await p
    .locator('[data-source="series:recipe"]')
    .getAttribute("d")
  expect(after).not.toBe(before)
  expect(after).toBe(dayChartPaths(asDay(day2)).recipe)
  await p.evaluate(() => window.P.seek(14))
  const t = Float64Array.from({ length: 144 }, (_, i) => i / 6)
  const v = Number(
    await p.locator('[data-read="recipe"]').getAttribute("data-value"),
  )
  expect(
    Math.abs(v - sampleSeries(t, Float64Array.from(day2.recipeC), 14)),
  ).toBeLessThan(1e-9)
}, 60000)

test("reducedMotionNoAutoplayNoTweenH5", async () => {
  const p = await open({ reduced: true, clock: true })
  expect(
    await p.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true)
  expect(await p.evaluate(() => window.P.autoplayOnce())).toBe(false)
  await p.clock.runFor(2000)
  expect(await frames(p)).toBe(0) // the loop never ran
  expect((await state(p)).playing).toBe(false)
  // duration tokens are zero, so no transition or animation has any length
  const dur = await p.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--tv-motion-base")
      .trim(),
  )
  expect(dur).toBe("0ms")
  const anim = await p.evaluate(
    () =>
      getComputedStyle(document.querySelector(".tv-play") as Element)
        .transitionDuration,
  )
  expect(anim === "0s").toBe(true)
  // the static frame shows the full day, and every control still works
  expect(
    (await p.locator('[data-source="series:recipe"]').getAttribute("d"))?.split(
      "L",
    ).length,
  ).toBe(144)
  await p.getByRole("button", { name: "Forward one hour" }).click()
  expect((await state(p)).tH).toBe(1)
  await p.getByRole("button", { name: "Play the day" }).click()
  await p.clock.runFor(500)
  expect(await frames(p)).toBeGreaterThan(0)
  expect(fx.watch(p).errors).toEqual([])
}, 60000)

test("autoplayRunsOnceStopsWithin5sAndAnyControlEndsItH6", async () => {
  const p = await open({ clock: true })
  expect(await p.evaluate(() => window.P.autoplayOnce())).toBe(true)
  expect(await p.evaluate(() => window.P.autoplayOnce())).toBe(false) // once
  await p.clock.runFor(5000)
  const s = await state(p)
  expect(s.playing).toBe(false) // done inside 5 s
  expect(s.tH).toBe(24)
  expect(await p.locator('[data-anim="play"]').getAttribute("data-state")).toBe(
    "ended",
  )
  const log = await p.evaluate(() => window.LOG)
  expect(
    log.some((l) => l.startsWith("anim.play") && l.includes('"source":"auto"')),
  ).toBe(true)
  // a second page: the reader takes a control during autoplay -> it stops at once
  const q = await open({ clock: true })
  await q.evaluate(() => window.P.autoplayOnce())
  await q.clock.runFor(1000)
  await q.locator('[data-anim="scrub"]').evaluate((el) => {
    ;(el as HTMLInputElement).value = "5"
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
  expect((await state(q)).playing).toBe(false)
  expect((await state(q)).tH).toBe(5)
}, 60000)

test("autoplayGivesTheSpeedChoiceBackWhenItEnds", async () => {
  // owner review: after the autoplay the Speed box was left on 4x and the next Play ran at 4x although the reader never chose it
  const p = await open({ clock: true })
  const speedBox = p.locator('[data-anim="speed"]')
  await p.evaluate(() => window.P.autoplayOnce())
  expect(await speedBox.inputValue()).toBe("4") // the box tells the truth while it runs fast
  await p.clock.runFor(5000)
  expect((await state(p)).playing).toBe(false)
  expect(await speedBox.inputValue()).toBe("1")
  expect((await state(p)).speed).toBe(1)
  await p.getByRole("button", { name: "Replay the day" }).click()
  await p.clock.runFor(1000)
  expect((await state(p)).tH).toBeLessThan(2) // 1 s at 1x is 1.5 h
  // a reader who took over mid-run also gets the box back
  const q = await open({ clock: true })
  await q.evaluate(() => window.P.autoplayOnce())
  await q.clock.runFor(500)
  await q.getByRole("button", { name: /Pause/ }).click()
  expect(await q.locator('[data-anim="speed"]').inputValue()).toBe("1")
  // a speed the reader chose first is the one that comes back
  const r = await open({ clock: true })
  await r.locator('[data-anim="speed"]').selectOption("2")
  await r.evaluate(() => window.P.autoplayOnce())
  await r.clock.runFor(5000)
  expect(await r.locator('[data-anim="speed"]').inputValue()).toBe("2")
}, 60000)

test("pauseButtonSpaceAndHiddenTabAllStopTheClockH6", async () => {
  const p = await open({ clock: true })
  const btn = p.locator('[data-anim="play"]')
  await btn.click()
  await p.clock.runFor(1000)
  const playing = await state(p)
  expect(playing.playing).toBe(true)
  expect(playing.tH).toBeGreaterThan(1) // 1 s at 1x is 1.5 h
  expect(playing.tH).toBeLessThan(2)
  await btn.click() // pause button
  const t1 = (await state(p)).tH
  await p.clock.runFor(1000)
  expect((await state(p)).tH).toBe(t1)
  // Space toggles it when focus is in the player (not on a control)
  await p.locator(".tv-daychart").evaluate((el) => {
    el.setAttribute("tabindex", "0")
    ;(el as unknown as HTMLElement).focus()
  })
  await p.keyboard.press("Space")
  expect((await state(p)).playing).toBe(true)
  // hidden tab: the loop frame counter does not advance, and playback resumes from where it was
  const f0 = await frames(p)
  const tBefore = (await state(p)).tH
  await p.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await p.clock.runFor(2000)
  expect(await frames(p)).toBe(f0)
  expect((await state(p)).tH).toBe(tBefore)
  await p.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await p.clock.runFor(500)
  expect(await frames(p)).toBeGreaterThan(f0)
  const resumed = (await state(p)).tH
  expect(resumed).toBeGreaterThan(tBefore)
  expect(resumed - tBefore).toBeLessThan(1.5) // no jump across the hidden time
}, 60000)

test("deterministicClockStepsAreExactly16msAndSpeedScalesTheDay", async () => {
  const p = await open({ clock: true })
  await p.evaluate(() => window.P.setSpeed(2))
  await p.locator('[data-anim="play"]').click()
  const t0 = (await state(p)).tH
  await p.clock.runFor(1000)
  const dt = (await state(p)).tH - t0
  // 1 s at 2x is 3 h, within one 16 ms frame of slack
  expect(dt).toBeGreaterThan(2.9)
  expect(dt).toBeLessThan(3.05)
}, 60000)

test("nothingFlashesDuringPlaybackH6", async () => {
  const p = await open()
  await p.evaluate(() => window.P.setSpeed(4))
  await p.locator('[data-anim="play"]').click()
  const flips = await p.evaluate(
    () =>
      new Promise<number>((done) => {
        const els = [...document.querySelectorAll("[data-source]")]
        const sig = (e: Element) => {
          const c = getComputedStyle(e)
          return `${c.opacity}|${c.fill}|${c.stroke}`
        }
        const last = new Map(els.map((e) => [e, sig(e)]))
        let changes = 0
        const t0 = performance.now()
        const step = () => {
          for (const e of els) {
            const s = sig(e)
            if (s !== last.get(e)) {
              changes++
              last.set(e, s)
            }
          }
          if (performance.now() - t0 < 2000) requestAnimationFrame(step)
          else done(changes)
        }
        requestAnimationFrame(step)
      }),
  )
  // at most 3 luminance changes per second anywhere: none at all (only positions move)
  expect(flips / 2).toBeLessThanOrEqual(3)
}, 60000)

test("controlsAre44pxAndKeyboardOperableInBothThemes", async () => {
  for (const scheme of ["light", "dark"] as const) {
    const p = await open({ scheme })
    for (const sel of [
      '[data-anim="play"]',
      '[data-anim="step-back"]',
      '[data-anim="step-fwd"]',
      '[data-anim="scrub"]',
      '[data-anim="speed"]',
    ]) {
      const box = await p.locator(sel).boundingBox()
      expect(box?.height ?? 0, `${scheme} ${sel}`).toBeGreaterThanOrEqual(43.5)
      expect(box?.width ?? 0, `${scheme} ${sel}`).toBeGreaterThanOrEqual(43.5)
    }
    await p.locator('[data-anim="scrub"]').focus()
    await p.keyboard.press("ArrowRight")
    expect((await state(p)).tH).toBeGreaterThan(0)
    await p.locator('[data-anim="speed"]').selectOption("4")
    expect((await state(p)).speed).toBe(4)
    await p.getByRole("button", { name: "Forward one hour" }).focus()
    await p.keyboard.press("Enter")
    expect((await state(p)).tH).toBeGreaterThanOrEqual(1)
    expect(fx.watch(p).errors).toEqual([])
  }
}, 120000)
