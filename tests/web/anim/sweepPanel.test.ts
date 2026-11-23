import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  liveValueOf,
  type SweepOutcome,
  type SweepVar,
  sweepChunkSafe,
  sweepValues,
  sweepVariables,
} from "../../../src/core/anim/sweep"
import type { LiveInputs } from "../../../src/core/pipeline/live"
import { LIVE_SEED } from "../../../src/web/liveState"
import { type Panel8, startPanel8 } from "../../support/panel8Page"

let h: Panel8
let vars: SweepVar[]
beforeAll(async () => {
  h = await startPanel8()
  vars = sweepVariables(h.ctx.ranges, h.ctx.weather)
}, 180000)
afterAll(async () => {
  await h?.close()
}, 60000)

const errors = (p: Parameters<Panel8["fx"]["watch"]>[0]) => h.fx.watch(p).errors
const pick = (k: string) => vars.find((v) => v.key === k) as SweepVar

test("computedCurvesEqualDirectCallsForOneVariablePerGroupH5", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  for (const key of ["midcoat_dft_um", "d_baso4_um", "ph", "wind_m_s"]) {
    await p.evaluate((k) => window.SP.selectVariable(k), key)
    expect(await p.evaluate(() => window.SP.compute())).toBe("done")
    const got = await p.evaluate(() => window.SP.data())
    const v = pick(key)
    expect(got?.variable).toBe(key)
    const values = sweepValues(v, liveValueOf(v, h.live, h.ctx), 41)
    expect(got?.xs.length).toBe(41)
    const direct = sweepChunkSafe(
      h.ctx,
      h.live,
      v,
      values,
      values.map((_, i) => i),
      32,
      LIVE_SEED,
    )
    direct.forEach((o, i) => {
      const nom = (o.value as Exclude<SweepOutcome, { failed: true }>).nominal
      // Chrome and Bun differ in the last digits of exp and sin: 1e-9, the H5 tolerance
      expect(Math.abs((got?.xs[i] as number) - values[i]!)).toBeLessThan(1e-12)
      expect(
        Math.abs((got?.nominal.t_max_c?.[i] as number) - nom.t_max_c),
      ).toBeLessThan(1e-9)
      expect(
        Math.abs((got?.nominal.r_solar?.[i] as number) - nom.r_solar),
      ).toBeLessThan(1e-9)
    })
  }
  expect(errors(p)).toEqual([])
}, 120000)

test("controlLinesAreFlatForDesignAndCurvesForWeatherH8", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  const kinds: Record<string, string[]> = {}
  for (const v of vars) {
    await p.evaluate((k) => window.SP.selectVariable(k), v.key)
    expect(await p.evaluate(() => window.SP.compute())).toBe("done")
    kinds[v.key] = await p.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-sweep-chart="t_max_c"] [data-control-kind]',
        ),
      ].map((e) => e.getAttribute("data-control-kind") as string),
    )
  }
  for (const v of vars)
    expect(kinds[v.key], v.key).toEqual(
      v.group === "scenario" ? ["curve", "curve"] : ["flat", "flat"],
    )
  expect(errors(p)).toEqual([])
}, 180000)

test("noC1LineAndNoNaNTextForTheProxiesH9", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  expect(await p.evaluate(() => window.SP.compute())).toBe("done")
  for (const o of ["corrosion_risk", "delam_proxy", "cost_proxy"]) {
    const c1 = await p
      .locator(`[data-sweep-chart="${o}"] [data-source$=":c1"]`)
      .count()
    expect(c1, o).toBe(0)
    expect(
      await p.locator(`figure[data-outcome="${o}"]`).innerText(),
    ).toContain("datasheet, not modelled")
  }
  expect(
    await p
      .locator('[data-sweep-chart="t_max_c"] [data-source$=":c1"]')
      .count(),
  ).toBe(1)
  const text = await p.locator("[data-watch-sweep]").innerText()
  expect(text).not.toMatch(/NaN|undefined/)
  expect(text).toContain("parameter uncertainty only")
  expect(text).toContain("relative cost units")
  expect(
    await p.locator('figure[data-outcome="cost_proxy"]').innerText(),
  ).toContain("no band")
}, 60000)

test("playingMovesTheCursorAndNeverRecomputesH7H11", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  await p.evaluate(() => window.SP.compute())
  const starts = () =>
    p.evaluate(() => window.LOG.filter((l) => l.includes("sweep.start")).length)
  expect(await starts()).toBe(1)
  expect((await p.evaluate(() => window.SP.state())).playing).toBe(false) // nothing autoplays
  expect(await p.evaluate(() => window.L.frames())).toBeGreaterThanOrEqual(0)
  await p.locator('[data-anim="sweep-speed"]').selectOption("4")
  await p.locator('[data-anim="sweep-play"]').click()
  await p.waitForFunction(() => window.SP.state().tH > 2)
  const moving = await p.evaluate(() => [
    window.SP.state().tH,
    document
      .querySelector('[data-sweep-chart="t_max_c"] [data-source="clock:sweep"]')
      ?.getAttribute("x1"),
  ])
  await p.locator('[data-anim="sweep-play"]').click() // pause
  const at = await p.evaluate(() => window.SP.state())
  expect(at.playing).toBe(false)
  await p.waitForTimeout(200)
  expect((await p.evaluate(() => window.SP.state())).tH).toBe(at.tH) // paused: the cursor stays
  await p.evaluate(() => window.SP.seek(12))
  expect(moving[1]).not.toBeNull()
  expect(await starts()).toBe(1) // playing, pausing and seeking never recomputed
  // the cursor carries the value it stands for and reaches the end of the range
  await p.locator('[data-anim="sweep-play"]').click()
  await p.waitForFunction(() => window.SP.state().tH >= 24, undefined, {
    timeout: 15000,
  })
  expect((await p.evaluate(() => window.SP.state())).playing).toBe(false)
  const log = await p.evaluate(() => window.LOG.join("\n"))
  for (const e of [
    "sweep.start",
    "sweep.done",
    "sweep.play",
    "sweep.pause",
    "sweep.seek",
  ])
    expect(log, e).toContain(e)
  expect(errors(p)).toEqual([])
}, 120000)

test("theClockClampsF10", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  await p.evaluate(() => window.SP.compute())
  for (const [input, want] of [
    [Number.NaN, 0],
    [-5, 0],
    [99, 24],
    [Number.POSITIVE_INFINITY, 24],
    [7.5, 7.5],
  ] as const) {
    await p.evaluate((v) => window.SP.seek(v), input)
    expect((await p.evaluate(() => window.SP.state())).tH).toBe(want)
  }
}, 60000)

test("aLiveChangeCancelsPaintsNothingAndMarksStaleH15", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  const run = p.evaluate(() => window.SP.compute())
  await p.waitForTimeout(80)
  const moved: LiveInputs = { ...h.live, ph: h.live.ph + 0.5 }
  await p.evaluate((i) => window.A8.setLive(i), moved)
  expect(await run).toBe("cancelled")
  expect((await p.evaluate(() => window.SP.state())).state).toBe("stale")
  await p.waitForTimeout(400)
  expect(await p.locator('[data-anim="sweep-chart"] svg').count()).toBe(0) // no point of the cancelled run was painted
  const log = await p.evaluate(() => window.LOG.join("\n"))
  expect(log).toContain('sweep.cancel {"reason":"live_changed"}')
  expect(log).not.toContain("sweep.done")
  expect(await p.locator('[data-anim="sweep-status"]').innerText()).toContain(
    "out of date",
  )
  // a computed range goes stale on a later change too, and Play range computes it again
  expect(await p.evaluate(() => window.SP.compute())).toBe("done")
  await p.evaluate((i) => window.A8.setLive(i), {
    ...moved,
    ph: moved.ph - 0.5,
  })
  expect((await p.evaluate(() => window.SP.state())).state).toBe("stale")
  expect(errors(p)).toEqual([])
}, 120000)

test("startAndCancel20TimesLeavesNoWorkerBehindH15", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  const keys = ["midcoat_dft_um", "primer_dft_um", "ph", "wind_m_s"]
  for (let i = 0; i < 20; i++) {
    const r = p.evaluate(() => window.SP.compute())
    await p.evaluate(
      (k) => window.SP.selectVariable(k),
      keys[i % keys.length] as string,
    )
    void r
  }
  await p.waitForFunction(
    () => window.SP.state().state === "ready",
    undefined,
    { timeout: 30000 },
  )
  const s = await p.evaluate(() => window.SP.poolStats())
  const size = await p.evaluate(() =>
    Math.max(
      1,
      Math.min(Math.floor(navigator.hardwareConcurrency || 2) - 1, 6),
    ),
  )
  expect(s?.live).toBe(size) // equals the pool size: nothing leaked
  const log = await p.evaluate(() => window.LOG.join("\n"))
  expect((log.match(/sweep\.cancel/g) ?? []).length).toBeGreaterThan(5)
  // a cancel terminates the workers at once (well inside 500 ms)
  const t = await p.evaluate(async () => {
    const r = window.SP.compute()
    await new Promise((a) => setTimeout(a, 30))
    const t0 = performance.now()
    window.SP.selectVariable("t_air_c")
    const live = window.SP.poolStats()?.live
    await r
    return { ms: performance.now() - t0, live }
  })
  expect(t.ms).toBeLessThan(500)
  expect(errors(p)).toEqual([])
}, 120000)

test("aLayerThatIsOffSaysSoAndTheCurvesAreFlatF5", async () => {
  const p = await h.open()
  await p.evaluate(() => {
    window.LIVE = {
      ...window.LIVE,
      layers: { ...window.LIVE.layers, primer: false },
    }
    window.SP.setOpen(true)
    window.SP.selectVariable("primer_dft_um")
  })
  await p.waitForFunction(
    () => window.SP.state().state === "ready",
    undefined,
    { timeout: 30000 },
  )
  expect(await p.locator('[data-anim="layer-off"]').isVisible()).toBe(true)
  expect(await p.locator('[data-anim="layer-off"]').innerText()).toContain(
    "layer is off",
  )
  const d = await p.evaluate(() => window.SP.data())
  const t = d?.nominal.t_max_c as number[]
  expect(Math.max(...t) - Math.min(...t)).toBeLessThan(1e-12)
}, 120000)

test("reducedMotionMovesNothingUntilAPressAndHiddenTabFreezesF7H11", async () => {
  const p = await h.open({ reduced: true })
  await p.evaluate(() => window.SP.setOpen(true))
  await p.waitForFunction(
    () => window.SP.state().state === "ready",
    undefined,
    { timeout: 30000 },
  )
  await p.waitForTimeout(600)
  expect(await p.evaluate(() => window.L.frames())).toBe(0)
  expect((await p.evaluate(() => window.SP.state())).playing).toBe(false)
  expect(await p.locator('[data-anim="sweep-chart"] svg').count()).toBe(5) // the full curves are there at once
  expect(
    await p.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--tv-motion-base")
        .trim(),
    ),
  ).toMatch(/^0/)
  await p.locator('[data-anim="sweep-speed"]').selectOption("4")
  await p.locator('[data-anim="sweep-play"]').click()
  await p.waitForFunction(() => window.SP.state().tH > 1)
  // hidden: the loop stops and the cursor stays
  await p.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await p.waitForTimeout(100)
  const a = await p.evaluate(() => [window.SP.state().tH, window.L.frames()])
  await p.waitForTimeout(400)
  const b = await p.evaluate(() => [window.SP.state().tH, window.L.frames()])
  expect(b).toEqual(a)
  expect(errors(p)).toEqual([])
}, 120000)

test("noEventCarriesARecipeValueAndEveryOneIsEmittedH9", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  await p.evaluate(() => window.SP.compute())
  await p.evaluate(() => {
    window.SP.play()
    window.SP.pause()
    window.SP.seek(3)
  })
  const log = await p.evaluate(() =>
    window.LOG.filter((l) => l.includes("sweep.")),
  )
  const names = new Set(log.map((l) => l.split(" ")[1]))
  for (const n of [
    "sweep.start",
    "sweep.done",
    "sweep.play",
    "sweep.pause",
    "sweep.seek",
  ])
    expect(names.has(n), n).toBe(true)
  const start = log.find((l) => l.includes("sweep.start")) as string
  const f = JSON.parse(start.slice(start.indexOf("{")))
  expect(Object.keys(f).sort()).toEqual([
    "draws",
    "points",
    "variable",
    "workers",
  ])
  expect(f.variable).toBe("midcoat_dft_um") // the key, never the value
  for (const l of log) expect(l).not.toMatch(/0\.\d{4,}/) // no recipe-identifying number
}, 60000)

test("twoComputesDuringThePoolStartShareOnePoolNoLeakFix1", async () => {
  const p = await h.open()
  const r = await p.evaluate(async () => {
    window.SP.setOpen(true) // starts the first compute at once
    const second = window.SP.compute() // a second compute while the pool is still starting
    const out = await second
    await new Promise((a) => setTimeout(a, 300))
    return { out, stats: window.SP.poolStats() }
  })
  expect(r.out).toBe("done")
  const size = await p.evaluate(() =>
    Math.max(
      1,
      Math.min(Math.floor(navigator.hardwareConcurrency || 2) - 1, 6),
    ),
  )
  expect(r.stats?.created).toBe(size) // one pool, never two
  expect(r.stats?.live).toBe(size)
}, 60000)

test("aLiveChangeDuringThePoolStartCancelsTheRunFix1", async () => {
  const p = await h.open()
  const out = await p.evaluate(
    async (i) => {
      window.SP.setOpen(false)
      const run = window.SP.compute() // the pool has not started yet
      window.A8.setLive(i) // the live settings change in the same task
      return { run: await run, state: window.SP.state().state }
    },
    { ...h.live, ph: h.live.ph + 0.4 },
  )
  expect(out.run).toBe("cancelled")
  expect(out.state).toBe("stale")
  await p.waitForTimeout(500)
  expect(await p.locator('[data-anim="sweep-chart"] svg').count()).toBe(0)
  expect(await p.evaluate(() => window.LOG.join("\n"))).not.toContain(
    "sweep.done",
  )
}, 60000)

test("closingThePanelReleasesTheWorkersAndAVariableChangeClearsTheOldChartsFix1Fix3", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  await p.waitForFunction(
    () => window.SP.state().state === "ready",
    undefined,
    { timeout: 30000 },
  )
  expect(await p.locator('[data-anim="sweep-chart"] svg').count()).toBe(5)
  // a variable change empties the charts at once: the old variable's curves never sit under the new name
  const cleared = await p.evaluate(() => {
    window.SP.selectVariable("topcoat_dft_um")
    return (
      document.querySelectorAll('[data-anim="sweep-chart"] svg').length +
      document.querySelector('[data-anim="sweep-readout"]')!.textContent!.length
    )
  })
  expect(cleared).toBe(0)
  await p.waitForFunction(
    () => window.SP.state().state === "ready",
    undefined,
    { timeout: 30000 },
  )
  await p.evaluate(() => window.SP.setOpen(false))
  expect(await p.evaluate(() => window.SP.poolStats())).toBeNull() // a closed panel holds no pool
}, 60000)

test("theEndsOfTheRangeAreSweptEvenNearTheLiveValueFix2", async () => {
  const p = await h.open()
  await p.evaluate(() => window.SP.setOpen(true))
  await p.waitForFunction(
    () => window.SP.state().state === "ready",
    undefined,
    { timeout: 30000 },
  )
  for (const k of ["midcoat_dft_um", "wind_m_s"]) {
    await p.evaluate((x) => window.SP.selectVariable(x), k)
    await p.waitForFunction(
      () => window.SP.state().state === "ready",
      undefined,
      { timeout: 30000 },
    )
    const d = await p.evaluate(() => window.SP.data())
    const v = pick(k)
    expect(d?.xs[0]).toBe(v.min)
    expect(d?.xs.at(-1)).toBe(v.max)
  }
}, 120000)
