import { afterAll, beforeAll, expect, test } from "bun:test"
import { LANE_IDS } from "../../../src/core/anim/compare"
import { LANE_H, LANE_W } from "../../../src/web/design/molecules/laneChart"
import { type Panel8, startPanel8 } from "../../support/panel8Page"

let h: Panel8
beforeAll(async () => {
  h = await startPanel8()
}, 180000)
afterAll(async () => {
  await h?.close()
}, 60000)

// laneChart geometry constants (left and right margins of the plot); the cursor x is L + tH / 24 * (W - L - R)
const L = 40
const R = 8
const cursorX = (tH: number) => L + (tH / 24) * (LANE_W - L - R)

test("cursorsEqualTheDayPlayerAt24SeeksH4", async () => {
  expect(LANE_H).toBeGreaterThan(0)
  const p = await h.open()
  await p.evaluate(() => window.CP.setOpen(true))
  for (let k = 0; k < 24; k++) {
    const t = k + 0.37
    await p.evaluate((v) => window.P.seek(v), t)
    const r = await p.evaluate(() => ({
      tH: window.P.state().tH,
      cursors: [
        ...document.querySelectorAll<SVGLineElement>(
          '[data-watch-compare] [data-source="clock:t_h"]',
        ),
      ].map((c) => [Number(c.dataset.t), Number(c.getAttribute("x1"))]),
    }))
    expect(r.cursors.length).toBe(5)
    for (const [ct, x] of r.cursors) {
      expect(ct).toBe(r.tH)
      expect(Math.abs((x as number) - cursorX(r.tH))).toBeLessThan(0.006)
    }
  }
  expect(fxErrors(p)).toEqual([])
}, 120000)

const fxErrors = (p: Parameters<Panel8["fx"]["watch"]>[0]) =>
  h.fx.watch(p).errors

test("lanesAndDifferencesAreTheSolvedSeriesH1H3", async () => {
  const p = await h.open()
  await p.evaluate(() => window.CP.setOpen(true))
  const r = h.result
  const K = 273.15
  for (let k = 0; k < 24; k++) {
    const t = k + 0.5
    await p.evaluate((v) => window.P.seek(v), t)
    const got = await p.evaluate(() => {
      const o = (c: string) =>
        Number(
          document
            .querySelector<HTMLElement>(
              `[data-anim="diff"][data-lane="surface_c"][data-control="${c}"]`,
            )
            ?.getAttribute("data-value"),
        )
      return { c0: o("c0"), c1: o("c1") }
    })
    // independent: straight interpolation between the two raw nodes of the live result, no shared code with the panel
    const x = t * 6
    const i = Math.floor(x)
    const w = x - i
    const raw = (s: Float64Array) =>
      (s[i] as number) * (1 - w) + (s[i + 1] as number) * w
    const rec = raw(r.series.t_k) - K
    // Chrome and Bun differ in the last digits of exp/sin, so the page against Bun is held to 1e-6; the unit tests hold 1e-9
    expect(
      Math.abs(
        got.c0 - (rec - (raw(r.controls.C0.t_surface_k as Float64Array) - K)),
      ),
    ).toBeLessThan(1e-6)
    expect(
      Math.abs(
        got.c1 - (rec - (raw(r.controls.C1.t_surface_k as Float64Array) - K)),
      ),
    ).toBeLessThan(1e-6)
  }
  expect(fxErrors(p)).toEqual([])
}, 120000)

test("lanesMoveWithTheDayPlayersOwnControlsOnPlayedFramesH4", async () => {
  const p = await h.open()
  await p.evaluate(() => window.CP.setOpen(true))
  await p.locator('[data-anim="play"]').click()
  const rows = await p.evaluate(
    () =>
      new Promise<number[][]>((res) => {
        const out: number[][] = []
        const f = () => {
          const c = document.querySelector<SVGLineElement>(
            '[data-lane="surface_c"] [data-source="clock:t_h"]',
          )
          out.push([window.P.state().tH, Number(c?.dataset.t)])
          if (out.length < 30) requestAnimationFrame(f)
          else res(out)
        }
        requestAnimationFrame(f)
      }),
  )
  expect(rows.length).toBe(30)
  for (const [a, b] of rows) expect(b).toBe(a as number)
  expect(new Set(rows.map((r) => r[0])).size).toBeGreaterThan(5) // it really moved
  // the day player's own step and scrub controls move the lanes too
  await p.locator('[data-anim="play"]').click()
  await p.locator('[data-anim="step-fwd"]').click()
  const s = await p.evaluate(() => [
    window.P.state().tH,
    Number(
      document
        .querySelector<SVGLineElement>(
          '[data-lane="conducted"] [data-source="clock:t_h"]',
        )
        ?.getAttribute("data-t"),
    ),
  ])
  expect(s[1]).toBe(s[0] as number)
}, 60000)

test("openingAndClosingAddsNoTickerAndLeaksNothing", async () => {
  const p = await h.open()
  for (let i = 0; i < 20; i++)
    await p.evaluate(() => {
      window.CP.setOpen(true)
      window.CP.setOpen(false)
    })
  await p.waitForTimeout(300)
  expect(await p.evaluate(() => window.L.frames())).toBe(0)
  expect(await p.evaluate(() => window.L.running())).toBe(false)
  // closed, the panel does no work: a seek leaves the cursor where it was drawn
  await p.evaluate(() => window.P.seek(9))
  expect(
    await p.evaluate(() =>
      document
        .querySelector<SVGLineElement>(
          '[data-lane="surface_c"] [data-source="clock:t_h"]',
        )
        ?.getAttribute("data-t"),
    ),
  ).toBe("0")
  await p.evaluate(() => window.CP.destroy())
  await p.evaluate(() => window.P.seek(10)) // no throw after destroy
  expect(fxErrors(p)).toEqual([])
}, 60000)

test("aBrokenSeriesShowsTheErrorStateAndTheDayPlayerSurvivesF2", async () => {
  const p = await h.open()
  await p.evaluate(() => {
    const r = window.RESULT
    window.CP.setOpen(true)
    window.CP.update(
      {
        ...r,
        controls: {
          ...r.controls,
          C0: {
            ...r.controls.C0,
            t_surface_k: (r.controls.C0.t_surface_k as Float64Array).slice(
              0,
              100,
            ),
          },
        },
      },
      window.LIVE,
      window.CTX.weather,
    )
  })
  expect(await p.locator('[data-anim="compare-status"]').innerText()).toContain(
    "could not be drawn",
  )
  expect(
    await p.locator("[data-watch-compare]").getAttribute("data-state"),
  ).toBe("error")
  await p.evaluate(() => window.P.seek(5))
  expect(await p.evaluate(() => window.P.state().tH)).toBe(5)
  expect(
    await p.evaluate(() => window.LOG.some((l) => l.includes("compare.error"))),
  ).toBe(true)
}, 60000)

test("aMissingC1SeriesKeepsRecipeAndC0AndLogsOneControlF1", async () => {
  const p = await h.open()
  await p.evaluate(() => {
    const r = window.RESULT
    const { t_surface_k: _x, ...c1 } = r.controls.C1
    window.CP.setOpen(true)
    window.CP.update(
      { ...r, controls: { ...r.controls, C1: c1 } },
      window.LIVE,
      window.CTX.weather,
    )
  })
  expect(await p.locator("[data-watch-compare]").innerText()).toContain(
    "C1 not available",
  )
  expect(await p.locator('[data-anim="diff"][data-control="c0"]').count()).toBe(
    5,
  )
  expect(await p.locator('[data-anim="diff"][data-control="c1"]').count()).toBe(
    0,
  )
  const log = await p.evaluate(() =>
    window.LOG.filter((l) => l.includes("compare.open")),
  )
  expect(log.at(-1)).toContain('"controls":1')
  expect(log.at(-1)).toContain(`"lanes":${LANE_IDS.length}`)
  expect(fxErrors(p)).toEqual([])
}, 60000)

test("aNonFiniteSeriesValueIsTheErrorStateNotAThrowFix4", async () => {
  const p = await h.open()
  const threw = await p.evaluate(() => {
    const r = window.RESULT
    const bad = (r.series.t_k as Float64Array).slice()
    bad[10] = Number.NaN
    window.CP.setOpen(true)
    try {
      window.CP.update(
        { ...r, series: { ...r.series, t_k: bad } },
        window.LIVE,
        window.CTX.weather,
      )
      return false
    } catch {
      return true
    }
  })
  expect(threw).toBe(false)
  expect(await p.locator('[data-anim="compare-status"]').innerText()).toContain(
    "could not be drawn",
  )
  await p.evaluate(() => window.P.seek(7))
  expect(await p.evaluate(() => window.P.state().tH)).toBe(7)
  expect(fxErrors(p)).toEqual([])
}, 60000)
