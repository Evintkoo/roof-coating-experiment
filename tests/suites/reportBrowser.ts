// Plan 00 Task 5: the report page in a real Chrome (Playwright library inside bun:test, `channel: "chrome"`, headless).
// The tests start and close only their own browser. Oracles: a plain filter written in the test (brushing), `liveSimulate`
// run in the Bun test process (live values), arithmetic on timings measured in the page (latency, newest wins).
// One suite body, two sizes (docs/testing.md): the fast tier registers the small subset, the proof tier everything.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type Browser, chromium, type Page } from "playwright"
import type { ModelContext } from "../../src/core/pipeline/context"
import { type LiveInputs, liveSimulate } from "../../src/core/pipeline/live"
import { type ObjRow, parseParetoCsv } from "../../src/core/pipeline/tables"
import { loadContext } from "../../src/node/context"
import { figLiveTofT } from "../../src/web/figures"
import { clampInputs, defaultLiveState, N_LIVE } from "../../src/web/liveState"
import { buildTestReport, repoRoot } from "../helpers"
import type { Tier } from "./scale"

export type BrowserScale = {
  tier: Tier
  /** Programmatic slider moves for the latency proof (H9). */
  moves: number
}
export const BROWSER_FAST: BrowserScale = { tier: "fast", moves: 200 }
export const BROWSER_PROOF: BrowserScale = { tier: "proof", moves: 200 }

/** T_live_ms (plan 00, frozen), T_phone_px, and the live seed of the page. */
export const T_LIVE_MS = 100
export const T_PHONE_PX = 390
const LIVE_SEED = 20261121
const PER_TEST_MS = 60_000

type Watch = { errors: string[]; failed: string[] }
const watches = new WeakMap<Page, Watch>()

export type Opts = {
  offline?: boolean
  colorScheme?: "light" | "dark"
  viewport?: { width: number; height: number }
  hooks?: boolean
}

type Ranges = Record<string, [number, number][]>

const settled = (): boolean => {
  const d = (document.getElementById("live-root") as HTMLElement).dataset
  return Number(d.requested) > 0 && Number(d.shown) >= Number(d.requested)
}

export function reportBrowserSuite(S: BrowserScale): void {
  let browser: Browser
  let path = ""
  let pareto: ObjRow[] = []
  let ctx: ModelContext
  const contexts: { close(): Promise<void> }[] = []

  beforeAll(async () => {
    const built = await buildTestReport()
    path = built.path
    pareto = parseParetoCsv(readFileSync(join(built.dir, "pareto.csv"), "utf8"))
    ctx = await loadContext(
      join(repoRoot, "configs"),
      join(repoRoot, "data", "literature"),
    )
    browser = await chromium.launch({ channel: "chrome", headless: true })
  }, 120_000)
  afterAll(async () => {
    for (const c of contexts) await c.close().catch(() => undefined)
    await browser?.close()
  })

  async function openPage(opts: Opts = {}): Promise<Page> {
    const c = await browser.newContext({
      offline: opts.offline ?? false,
      colorScheme: opts.colorScheme ?? "light",
      viewport: opts.viewport ?? { width: 1280, height: 900 },
    })
    contexts.push(c)
    const page = await c.newPage()
    const w: Watch = { errors: [], failed: [] }
    watches.set(page, w)
    page.on("console", (m) => m.type() === "error" && w.errors.push(m.text()))
    page.on("pageerror", (e) => w.errors.push(String(e)))
    page.on("requestfailed", (r) => w.failed.push(r.url()))
    await page.goto(`file://${path}${opts.hooks === false ? "" : "#test"}`)
    // the explorer, the curves and the live simulator sit in closed disclosures (plan 06 D5); their figures are drawn when one opens
    await page.evaluate(() =>
      document.querySelectorAll("details.tv-disclosure").forEach((d) => {
        ;(d as HTMLDetailsElement).open = true
      }),
    )
    await page.waitForSelector("#fig-parcoords .axis-brush rect.background")
    await page.waitForFunction(
      () =>
        Number(
          (document.getElementById("live-root") as HTMLElement).dataset.shown,
        ) > 0,
    )
    await page.waitForSelector("#fig-live-tofT .main-svg")
    return page
  }
  const watch = (p: Page): Watch => watches.get(p) as Watch

  async function dragBrush(
    page: Page,
    axis: number,
    from: number,
    to: number,
  ): Promise<void> {
    await page.locator("#fig-parcoords").scrollIntoViewIfNeeded()
    const boxes = await page.$$eval(
      "#fig-parcoords .axis-brush rect.background",
      (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        }),
    )
    const b = boxes[axis]
    if (!b) throw new Error(`no brush box for axis ${axis}`)
    const x = b.x + b.w / 2
    await page.mouse.move(x, b.y + b.h * from)
    await page.mouse.down()
    await page.mouse.move(x, b.y + b.h * ((from + to) / 2), { steps: 5 })
    await page.mouse.move(x, b.y + b.h * to, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(250)
  }
  const shownRows = (page: Page): Promise<string[]> =>
    page.$$eval("#tbl-explorer tbody tr[data-id]:not([hidden])", (rows) =>
      rows.map((r) => (r as HTMLElement).dataset.id as string),
    )
  const splomSelected = (page: Page): Promise<string[]> =>
    page.evaluate(() => {
      const gd = document.getElementById("fig-splom") as unknown as {
        data: { ids: string[]; marker: { opacity: number[] } }[]
      }
      const t = gd.data[0] as { ids: string[]; marker: { opacity: number[] } }
      return t.ids.filter((_, i) => (t.marker.opacity[i] as number) > 0.5)
    })
  const brushRanges = (page: Page): Promise<Ranges> =>
    page.evaluate(() =>
      (window as never as { __brushRanges: () => Ranges }).__brushRanges(),
    )

  /** The oracle for brushing: a plain filter, AND across axes, OR across the ranges of one axis. */
  function plainFilter(ranges: Ranges): string[] {
    return pareto
      .filter((r) =>
        Object.entries(ranges).every(([col, rs]) =>
          rs.some(([lo, hi]) => {
            const v = (r as unknown as Record<string, number>)[col] as number
            return v >= lo && v <= hi
          }),
        ),
      )
      .map((r) => r.candidate_id)
  }

  type LiveRead = {
    tiles: Record<
      string,
      { nominal: number; lo: number | null; hi: number | null }
    >
    tofT: number[]
    spectrum: number[]
    status: string
  }
  const readLive = (page: Page): Promise<LiveRead> =>
    page.evaluate(() => {
      const num = (s: string | undefined): number | null =>
        s === undefined || s === "" ? null : Number(s)
      const tiles: LiveRead["tiles"] = {}
      for (const e of document.querySelectorAll<HTMLElement>(".tile"))
        tiles[e.id.replace("tile-", "")] = {
          nominal: Number(e.dataset.nominal),
          lo: num(e.dataset.lo),
          hi: num(e.dataset.hi),
        }
      const line = (id: string): number[] => {
        const gd = document.getElementById(id) as unknown as {
          data: { meta?: { kind: string; id: string }; y: number[] }[]
        }
        const t = gd.data.find(
          (x) => x.meta?.kind === "predicted" && x.meta.id === "live",
        )
        return t ? [...t.y] : []
      }
      return {
        tiles,
        tofT: line("fig-live-tofT"),
        spectrum: line("fig-live-spectrum"),
        status:
          (document.getElementById("live-status") as HTMLElement).textContent ??
          "",
      }
    })

  const close = (a: number | null, b: number | null, what: string): void => {
    if (a === null || b === null) {
      expect(a, what).toBe(b)
      return
    }
    if (Number.isNaN(a) || Number.isNaN(b)) {
      expect(Number.isNaN(a) && Number.isNaN(b), what).toBe(true)
      return
    }
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      expect(a, what).toBe(b)
      return
    }
    expect(
      Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)),
      `${what}: ${a} vs ${b}`,
    ).toBe(true)
  }

  /** Compare what the page shows with `liveSimulate` run here, in Bun, for the same inputs (1e-6). */
  function expectLiveEqualsCore(read: LiveRead, inputs: LiveInputs): void {
    const r = liveSimulate(inputs, ctx, N_LIVE, LIVE_SEED)
    const want: Record<string, [number, { lo: number; hi: number } | null]> = {
      r_solar: [r.nominal.r_solar, r.bands.r_solar],
      t_max: [r.nominal.t_max_c, r.bands.t_max_c],
      corrosion: [r.nominal.corrosion_risk, r.bands.corrosion_risk],
      wetting: [r.nominal.wetting_score, r.bands.wetting_score],
      delam: [r.nominal.delam_proxy, r.bands.delam_proxy],
      cost: [r.nominal.cost_proxy, null],
      gel: [r.nominal.gel_time_rel, null],
    }
    for (const [id, [nom, band]] of Object.entries(want)) {
      const t = read.tiles[id] as LiveRead["tiles"][string]
      close(t.nominal, nom, `${id} nominal`)
      close(t.lo, band ? band.lo : null, `${id} lo`)
      close(t.hi, band ? band.hi : null, `${id} hi`)
    }
    const spec = figLiveTofT(r).data as {
      meta?: { kind: string }
      y: number[]
    }[]
    const y = (
      spec.find((t) => t.meta?.kind === "predicted") as { y: number[] }
    ).y
    expect(read.tofT.length).toBe(y.length)
    for (let i = 0; i < y.length; i++)
      close(read.tofT[i] as number, y[i] as number, `T(t)[${i}]`)
    expect(Math.max(...read.tofT)).toBeCloseTo(Math.max(...y), 6)
    expect(read.spectrum.length).toBe(r.spectrum.nominal.length)
    for (let i = 0; i < r.spectrum.nominal.length; i++)
      close(
        read.spectrum[i] as number,
        r.spectrum.nominal[i] as number,
        `R(${i})`,
      )
  }

  const round = (x: number): number => Number(x.toPrecision(6))
  /** Type values into the number boxes the way a user would (input, then change). */
  async function setInputs(page: Page, inp: LiveInputs): Promise<void> {
    const boxes: [string, number][] = [
      ...Object.entries(inp.design),
      ["ph", inp.ph],
      ...Object.entries(inp.scenario),
    ]
    await page.evaluate(
      ({ boxes, layers }) => {
        for (const [key, v] of boxes) {
          const el = document.getElementById(
            `live-num-${key}`,
          ) as HTMLInputElement
          el.value = String(v)
          el.dispatchEvent(new Event("input", { bubbles: true }))
          el.dispatchEvent(new Event("change", { bubbles: true }))
        }
        for (const [name, on] of Object.entries(layers)) {
          const cb = document.getElementById(
            `live-layer-${name}`,
          ) as HTMLInputElement
          if (cb.checked !== on) {
            cb.checked = on
            cb.dispatchEvent(new Event("change", { bubbles: true }))
          }
        }
      },
      { boxes, layers: inp.layers },
    )
    await page.waitForFunction(settled)
  }

  /** Five fixed input states: the defaults, both corners of every range, and two interior points. */
  function fiveStates(): LiveInputs[] {
    const d = defaultLiveState(ctx.ranges, ctx.weather).inputs
    const pick = (
      f: (lo: number, hi: number, i: number) => number,
    ): LiveInputs => {
      const design = { ...d.design } as Record<string, number>
      let i = 0
      for (const k of Object.keys(design)) {
        const r = (
          ctx.ranges as unknown as Record<string, { min: number; max: number }>
        )[k] as {
          min: number
          max: number
        }
        design[k] = round(f(r.min, r.max, i++))
      }
      const ph = ctx.ranges.sol_gel_ph
      const w = ctx.weather
      return clampInputs(
        {
          design: design as LiveInputs["design"],
          ph: round(f(ph.min, ph.max, i++)),
          layers: { primer: true, midcoat: true, topcoat: true },
          scenario: {
            irradiance_w_m2: round(
              f(w.irradiance_w_m2.values[0], w.irradiance_w_m2.values[2], i++),
            ),
            t_air_c: round(f(w.t_air_c.values[0], w.t_air_c.values[2], i++)),
            wind_m_s: round(f(w.wind_m_s.values[0], w.wind_m_s.values[2], i++)),
          },
        },
        ctx.ranges,
        ctx.weather,
      )
    }
    return [
      d,
      pick((lo) => lo),
      pick((_, hi) => hi),
      pick((lo, hi, i) => lo + (hi - lo) * (0.2 + 0.07 * i)),
      pick((lo, hi, i) => hi - (hi - lo) * (0.15 + 0.05 * i)),
    ]
  }

  const reg = (name: string, fast: boolean, fn: () => Promise<void>): void => {
    if (fast || S.tier === "proof") test(name, fn, PER_TEST_MS)
  }

  // ---------------------------------------------------------------- fast subset
  reg("offlineZeroFailedRequestsAndNoConsoleErrors", true, async () => {
    const page = await openPage({ offline: true })
    await page.waitForSelector("#fig-live-spectrum .main-svg")
    expect(
      await page.$$eval(".main-svg", (e) => e.length),
    ).toBeGreaterThanOrEqual(10)
    const tile = await page.$eval(
      "#tile-r_solar .tile-value",
      (e) => e.textContent,
    )
    expect(Number(tile)).toBeGreaterThan(0)
    expect(watch(page).failed).toEqual([])
    expect(watch(page).errors).toEqual([])
  })

  reg("brushTwoAxesMatchesFilter", true, async () => {
    const page = await openPage({ offline: true })
    await dragBrush(page, 0, 0.3, 0.8)
    await dragBrush(page, 2, 0.1, 0.6)
    const ranges = await brushRanges(page)
    expect(Object.keys(ranges).length).toBe(2)
    const expected = plainFilter(ranges).sort()
    expect(expected.length).toBeGreaterThan(0)
    expect(expected.length).toBeLessThan(pareto.length)
    expect((await shownRows(page)).sort()).toEqual(expected)
    expect((await splomSelected(page)).sort()).toEqual(expected)
  })

  reg("brushClearRestoresAll96", true, async () => {
    const page = await openPage()
    expect(pareto.length).toBe(96)
    await dragBrush(page, 1, 0.2, 0.5)
    expect((await shownRows(page)).length).toBeLessThan(96)
    await page.locator("#fig-parcoords").scrollIntoViewIfNeeded()
    const b = await page.$$eval(
      "#fig-parcoords .axis-brush rect.background",
      (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        }),
    )
    const b1 = b[1] as { x: number; y: number; w: number; h: number }
    await page.mouse.click(b1.x + b1.w / 2, b1.y + b1.h * 0.95)
    await page.waitForTimeout(250)
    expect(await brushRanges(page)).toEqual({})
    expect((await shownRows(page)).length).toBe(96)
    expect((await splomSelected(page)).length).toBe(96)
    expect(await page.textContent("#tbl-count")).toContain("96 of 96")
  })

  reg("darkSchemeBackgroundAndPlotlyColours", true, async () => {
    const page = await openPage({ colorScheme: "dark" })
    const lum = (rgb: string): number => {
      const [r, g, b] = (rgb.match(/\d+/g) as string[]).slice(0, 3).map((x) => {
        const s = Number(x) / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }) as [number, number, number]
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const state = () =>
      page.evaluate(() => {
        const css = getComputedStyle(document.documentElement)
          .getPropertyValue("--tv-surface-base")
          .trim()
        const paper = (id: string) =>
          (
            document.getElementById(id) as unknown as {
              _fullLayout: { paper_bgcolor: string }
            }
          )._fullLayout.paper_bgcolor
        const stroke = getComputedStyle(
          document.querySelector(
            "#fig-parcoords .parcoords .axis path.domain",
          ) as Element,
        ).stroke
        return {
          body: getComputedStyle(document.body).backgroundColor,
          css,
          papers: [
            "fig-parcoords",
            "fig-splom",
            "fig-live-tofT",
            "fig-spectrum",
          ].map(paper),
          stroke,
        }
      })
    const dark = await state()
    expect(lum(dark.body)).toBeLessThan(0.2)
    for (const p of dark.papers)
      expect(p.toLowerCase()).toBe(dark.css.toLowerCase())
    expect(dark.stroke).not.toBe("rgb(0, 0, 0)")
    // the toggle flips to light: background, Plotly paper and the axis stroke follow
    await page.click("#theme-toggle")
    await page.waitForTimeout(400)
    const light = await state()
    expect(lum(light.body)).toBeGreaterThan(0.8)
    expect(light.css).not.toBe(dark.css)
    for (const p of light.papers)
      expect(p.toLowerCase()).toBe(light.css.toLowerCase())
    expect(watch(page).errors).toEqual([])
  })

  reg("phoneViewportNoHorizontalOverflow", true, async () => {
    const page = await openPage({
      viewport: { width: T_PHONE_PX, height: 844 },
    })
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
      body: document.body.scrollWidth,
    }))
    expect(m.scroll).toBeLessThanOrEqual(m.inner)
    expect(m.body).toBeLessThanOrEqual(m.inner)
  })

  reg("testHooksOnlyWithTheFragment", true, async () => {
    const plain = await openPage({ hooks: false })
    expect(
      await plain.evaluate(() => [
        typeof (window as never as Record<string, unknown>).__brushRanges,
        typeof (window as never as Record<string, unknown>).__burst,
      ]),
    ).toEqual(["undefined", "undefined"])
    const hooked = await openPage()
    expect(
      await hooked.evaluate(() => [
        typeof (window as never as Record<string, unknown>).__brushRanges,
        typeof (window as never as Record<string, unknown>).__burst,
      ]),
    ).toEqual(["function", "function"])
  })

  // ---------------------------------------------------------------- full tier (the five size-independent proofs of plan 00 D7 and
  // T-BRW-4 run in the fast tier too, see above; what stays here is timing-bound or a long hold)
  reg("axisReorderKeepsBrush", true, async () => {
    const page = await openPage()
    await dragBrush(page, 1, 0.2, 0.5)
    const before = await brushRanges(page)
    const rows = (await shownRows(page)).sort()
    expect(Object.keys(before).length).toBe(1)
    const events = await page.evaluate(() => {
      const gd = document.getElementById("fig-parcoords") as unknown as {
        on: (e: string, f: (p: object[]) => void) => void
      }
      const keys: string[][] = []
      gd.on("plotly_restyle", (p) => keys.push(Object.keys(p[0] as object)))
      ;(window as never as { __keys: string[][] }).__keys = keys
    })
    void events
    const titles = await page.$$eval(
      "#fig-parcoords .y-axis .axis-heading, #fig-parcoords .y-axis text.axis-title",
      (els) =>
        els.map((x) => {
          const r = x.getBoundingClientRect()
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
        }),
    )
    const boxes = await page.$$eval(
      "#fig-parcoords .axis-brush rect.background",
      (els) =>
        els.map(
          (e) =>
            e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2,
        ),
    )
    const t0 = titles[0] as { x: number; y: number }
    const labelsBefore = await page.evaluate(() =>
      (
        document.getElementById("fig-parcoords") as unknown as {
          data: { dimensions: { label: string }[] }[]
        }
      ).data[0]?.dimensions.map((d) => d.label),
    )
    await page.mouse.move(t0.x, t0.y)
    await page.mouse.down()
    await page.mouse.move((boxes[2] as number) + 20, t0.y, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    const keys = await page.evaluate(
      () => (window as never as { __keys: string[][] }).__keys,
    )
    expect(keys.some((k) => k.some((x) => x.startsWith("dimensions")))).toBe(
      true,
    )
    const labelsAfter = await page.evaluate(() =>
      (
        document.getElementById("fig-parcoords") as unknown as {
          data: { dimensions: { label: string }[] }[]
        }
      ).data[0]?.dimensions.map((d) => d.label),
    )
    expect(labelsAfter).not.toEqual(labelsBefore)
    expect(await brushRanges(page)).toEqual(before)
    expect((await shownRows(page)).sort()).toEqual(rows)
    // the new order and the brush also survive a redraw of the parcoords figure
    await page.click("#theme-toggle")
    await page.waitForTimeout(400)
    expect(await brushRanges(page)).toEqual(before)
    expect(
      await page.evaluate(() =>
        (
          document.getElementById("fig-parcoords") as unknown as {
            data: { dimensions: { label: string }[] }[]
          }
        ).data[0]?.dimensions.map((d) => d.label),
      ),
    ).toEqual(labelsAfter)
  })

  reg("brushSurvivesPlotlyReact", true, async () => {
    const page = await openPage()
    await dragBrush(page, 0, 0.3, 0.8)
    await dragBrush(page, 2, 0.1, 0.6)
    const before = await brushRanges(page)
    const rows = (await shownRows(page)).sort()
    const dims = () =>
      page.evaluate(() =>
        (
          document.getElementById("fig-parcoords") as unknown as {
            data: { dimensions: { constraintrange?: unknown }[] }[]
          }
        ).data[0]?.dimensions.map((d) => d.constraintrange ?? null),
      )
    const held = await dims()
    // the theme toggle redraws every figure with Plotly.react: the app re-injects the held ranges (uirevision alone does not, plotly.js 4.3.0)
    await page.click("#theme-toggle")
    await page.waitForTimeout(400)
    expect(await dims()).toEqual(held)
    expect(await brushRanges(page)).toEqual(before)
    // a scenario change redraws the T(t) figure; the selection stays
    await page.selectOption("#sel-scenario", "W5")
    await page.waitForTimeout(300)
    expect(await dims()).toEqual(held)
    expect((await shownRows(page)).sort()).toEqual(rows)
    expect(watch(page).errors).toEqual([])
  })

  reg("noMatchShowsExplicitRow", true, async () => {
    const page = await openPage()
    await dragBrush(page, 0, 0.0, 0.1)
    await dragBrush(page, 1, 0.0, 0.1)
    const ranges = await brushRanges(page)
    expect(plainFilter(ranges)).toEqual([])
    expect(await shownRows(page)).toEqual([])
    expect(await page.isVisible("#tbl-empty")).toBe(true)
    expect(await page.textContent("#tbl-empty")).toContain(
      "No candidates match",
    )
    expect(await page.textContent("#tbl-count")).toContain("0 of")
    expect(await splomSelected(page)).toEqual([])
  })

  reg("scenarioChangeKeepsSelection", true, async () => {
    const page = await openPage()
    await dragBrush(page, 3, 0.2, 0.7)
    const rows = (await shownRows(page)).sort()
    expect(rows.length).toBeGreaterThan(0)
    const curve = () =>
      page.evaluate(() =>
        JSON.stringify(
          (
            document.getElementById("fig-tofT") as unknown as {
              data: { y: number[] }[]
            }
          ).data.map((t) => t.y),
        ),
      )
    const before = await curve()
    await page.selectOption("#sel-scenario", "W9")
    await page.waitForTimeout(300)
    expect(await curve()).not.toBe(before)
    expect((await shownRows(page)).sort()).toEqual(rows)
    expect(Object.keys(await brushRanges(page))).toHaveLength(1)
  })

  reg("liveMatchesCoreInBun", true, async () => {
    const page = await openPage()
    for (const state of fiveStates()) {
      await setInputs(page, state)
      expectLiveEqualsCore(await readLive(page), state)
    }
    expect(watch(page).errors).toEqual([])
  })

  reg("sliderMoveUpdatesWithinLimit", false, async () => {
    const page = await openPage()
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
    const median = sorted[Math.floor(sorted.length / 2)] as number
    // recorded in docs/proofs/plan-00.md (H9)
    console.log(
      `live latency over ${lat.length} moves: median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${sorted[sorted.length - 1]?.toFixed(1)} ms (T_live_ms ${T_LIVE_MS})`,
    )
    expect(lat.length).toBe(S.moves)
    expect(p95).toBeLessThanOrEqual(T_LIVE_MS)
  })

  reg("newestWinsUnderBurst", false, async () => {
    const page = await openPage()
    const log = await page.evaluate(() =>
      (
        window as never as {
          __burst: (
            n: number,
            ms: number,
          ) => Promise<{
            shown: number[]
            requested: number
            lastInputs: LiveInputs
            finalNominal: { r_solar: number; t_max_c: number }
          }>
        }
      ).__burst(50, 100),
    )
    expect(log.requested).toBeGreaterThanOrEqual(50)
    for (let i = 1; i < log.shown.length; i++)
      expect(log.shown[i] as number).toBeGreaterThan(log.shown[i - 1] as number)
    expect(log.shown.length).toBeGreaterThanOrEqual(2)
    expect(log.shown.length).toBeLessThan(50)
    expect(log.shown[log.shown.length - 1]).toBe(log.requested)
    const want = liveSimulate(log.lastInputs, ctx, N_LIVE, LIVE_SEED)
    close(log.finalNominal.r_solar, want.nominal.r_solar, "final r_solar")
    close(log.finalNominal.t_max_c, want.nominal.t_max_c, "final t_max")
    expect(watch(page).errors).toEqual([])
  })

  reg("layersOffShowsBareSpandek", false, async () => {
    const page = await openPage()
    const off: LiveInputs = {
      ...defaultLiveState(ctx.ranges, ctx.weather).inputs,
      layers: { primer: false, midcoat: false, topcoat: false },
    }
    await setInputs(page, off)
    const read = await readLive(page)
    expect(read.status).toBe("")
    expectLiveEqualsCore(read, off)
    // bare Spandek is the C0 control of the same scenario
    const r = liveSimulate(off, ctx, N_LIVE, LIVE_SEED)
    close(
      read.tiles.r_solar?.nominal as number,
      r.controls.C0.r_solar,
      "C0 r_solar",
    )
    expect(watch(page).errors).toEqual([])
  })

  reg("extremeSliderHoldNoErrors", false, async () => {
    const page = await openPage()
    const log = await page.evaluate(() =>
      (
        window as never as {
          __burst: (
            n: number,
            ms: number,
          ) => Promise<{ shown: number[]; requested: number }>
        }
      ).__burst(300, 60),
    )
    expect(log.requested).toBeGreaterThanOrEqual(300)
    // requests coalesce: far fewer frames than events, and the queue never grows (one in flight, one pending)
    expect(log.shown.length).toBeLessThan(60)
    expect(log.shown[log.shown.length - 1]).toBe(log.requested)
    expect((await readLive(page)).status).toBe("")
    expect(watch(page).errors).toEqual([])
  })

  reg("outOfRangeValueIsClamped", false, async () => {
    const page = await openPage()
    const probe = (key: string, v: string) =>
      page.evaluate(
        async ({ key, v }) => {
          const el = document.getElementById(
            `live-num-${key}`,
          ) as HTMLInputElement
          el.value = v
          el.dispatchEvent(new Event("input", { bubbles: true }))
          el.dispatchEvent(new Event("change", { bubbles: true }))
          return {
            box: el.value,
            range: (
              document.getElementById(`live-range-${key}`) as HTMLInputElement
            ).value,
          }
        },
        { key, v },
      )
    const r = ctx.ranges.topcoat_dft_um
    const hi = await probe("topcoat_dft_um", "1e9")
    expect(Number(hi.box)).toBe(r.max)
    const lo = await probe("topcoat_dft_um", "-1e9")
    expect(Number(lo.box)).toBe(r.min)
    const w = ctx.weather.wind_m_s.values
    expect(Number((await probe("wind_m_s", "1e9")).box)).toBe(w[2])
    expect(Number((await probe("wind_m_s", "-5")).box)).toBe(w[0])
    await page.waitForFunction(settled)
    const read = await readLive(page)
    expect(read.status).toBe("")
    expect(watch(page).errors).toEqual([])
  })

  reg("keyboardReachesLimitsLink", false, async () => {
    const page = await openPage()
    let hit = false
    for (let i = 0; i < 30 && !hit; i++) {
      await page.keyboard.press("Tab")
      hit = await page.evaluate(
        () =>
          (document.activeElement as HTMLAnchorElement | null)?.getAttribute(
            "href",
          ) === "#limits",
      )
    }
    expect(hit).toBe(true)
    await page.keyboard.press("Enter")
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => location.hash)).toBe("#limits")
    expect(await page.isVisible("#limits")).toBe(true)
  })

  reg("printMediaNoDarkBackground", false, async () => {
    const page = await openPage({ colorScheme: "dark" })
    await page.emulateMedia({ media: "print", colorScheme: "dark" })
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    )
    const [r, g, b] = (bg.match(/\d+/g) as string[]).map(Number) as [
      number,
      number,
      number,
    ]
    expect(Math.min(r, g, b)).toBeGreaterThan(240)
    expect(await page.isHidden(".tv-rail")).toBe(true)
    const lightPaper = await page.evaluate(
      () =>
        (
          window as never as {
            __SPANDEK__: { plotThemes: { light: { paper: string } } }
          }
        ).__SPANDEK__.plotThemes.light.paper,
    )
    // the figures are redrawn with the print palette when the browser prepares a print
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")))
    await page.waitForTimeout(500)
    const papers = await page.evaluate(() =>
      ["fig-parcoords", "fig-live-tofT", "fig-splom"].map(
        (id) =>
          (
            document.getElementById(id) as unknown as {
              _fullLayout: { paper_bgcolor: string }
            }
          )._fullLayout.paper_bgcolor,
      ),
    )
    expect(papers).toEqual([lightPaper, lightPaper, lightPaper])
    await page.emulateMedia({ media: "screen", colorScheme: "dark" })
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")))
    await page.waitForTimeout(500)
    expect(
      await page.evaluate(
        () =>
          (
            document.getElementById("fig-live-tofT") as unknown as {
              _fullLayout: { paper_bgcolor: string }
            }
          )._fullLayout.paper_bgcolor,
      ),
    ).not.toBe(lightPaper)
  })

  reg("noConsoleErrorsDuringLiveUse", false, async () => {
    const page = await openPage({ offline: true })
    for (const st of fiveStates()) await setInputs(page, st)
    await page.selectOption("#live-scenario", "W3")
    await page.waitForFunction(settled)
    await page.uncheck("#live-layer-midcoat")
    await page.waitForFunction(settled)
    await page.check("#live-layer-midcoat")
    await page.click("#theme-toggle")
    await page.fill("#live-num-ph", "7")
    await page.waitForFunction(settled)
    expect((await readLive(page)).status).toBe("")
    expect(watch(page).errors).toEqual([])
    expect(watch(page).failed).toEqual([])
  })

  reg("debugPanelShowsEventsAndTimings", false, async () => {
    const page = await openPage()
    expect(await page.isVisible("#debug-events")).toBe(false)
    await page.click("#debug summary")
    await page.waitForFunction(
      () =>
        (
          (document.getElementById("debug-events") as HTMLElement)
            .textContent ?? ""
        ).length > 0,
    )
    const events = (await page.textContent("#debug-events")) ?? ""
    expect(events).toContain("live.update")
    expect(events.split("\n").length).toBeLessThanOrEqual(100)
    expect((await page.textContent("#debug-timing")) ?? "").toMatch(
      /models [\d.]+ ms in the worker, input to charts [\d.]+ ms/,
    )
    // after many updates the ring buffer is still capped at 100 lines
    await page.evaluate(() =>
      (
        window as never as {
          __burst: (n: number, ms: number) => Promise<unknown>
        }
      ).__burst(40, 400),
    )
    expect(
      ((await page.textContent("#debug-events")) ?? "").split("\n").length,
    ).toBeLessThanOrEqual(100)
  })
}
