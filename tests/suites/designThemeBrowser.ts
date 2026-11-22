// Plan 06 D3 (amended): the report opens LIGHT whatever the system scheme says; one toggle switches to DARK and back; the choice
// is remembered; every role maps to the corresponding token value in each theme; the figures re-theme live without losing the
// brush or the live simulator. These tests run inside the design report suite (one build, one browser). Real Chrome, no mocks.
import { expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Page } from "playwright"
import { buildGallery } from "../../src/node/report/gallery"
import { THEME_KEY } from "../../src/web/design/theme"

type Harness = {
  reg: (name: string, proofOnly: boolean, fn: () => Promise<void>) => void
  open: (o?: {
    width?: number
    height?: number
    scheme?: "light" | "dark"
    media?: "print"
    hash?: string
    init?: string
  }) => Promise<Page>
  watches: WeakMap<Page, { errors: string[]; failed: string[] }>
  path: () => string
}

/** A stored theme, set before any page script runs. */
const stored = (t: "dark" | "light") =>
  `try{localStorage.setItem(${JSON.stringify(THEME_KEY)},${JSON.stringify(t)})}catch(e){}`
/** Storage that throws on access, as in a blocked-cookies or private window. */
const BLOCKED = `Object.defineProperty(window,"localStorage",{get(){throw new DOMException("blocked","SecurityError")}})`

type Sample = { name: string; sel: string; prop: string; token: string }
/** One element per role (surface, text, muted, link, border, status, action, badge, callout, interval, chart-in-svg, control). */
const SAMPLES: Sample[] = [
  {
    name: "page background",
    sel: "body",
    prop: "backgroundColor",
    token: "surface-base",
  },
  { name: "body text", sel: "body", prop: "color", token: "text-primary" },
  { name: "muted text", sel: ".page-hint", prop: "color", token: "text-muted" },
  {
    name: "link",
    sel: ".page-section a:not(.tv-button)",
    prop: "color",
    token: "link",
  },
  {
    name: "section rule",
    sel: ".page-section + .page-section",
    prop: "borderTopColor",
    token: "border-panel",
  },
  {
    name: "tile surface",
    sel: ".tile",
    prop: "backgroundColor",
    token: "surface-glass",
  },
  {
    name: "tile border",
    sel: ".tile",
    prop: "borderTopColor",
    token: "border-glass",
  },
  {
    name: "tile label",
    sel: ".tile-label",
    prop: "color",
    token: "text-muted",
  },
  {
    name: "proxy badge",
    sel: ".tv-badge--proxy",
    prop: "color",
    token: "status-proxy",
  },
  {
    name: "toggle label",
    sel: "#theme-toggle",
    prop: "color",
    token: "text-primary",
  },
  {
    name: "section heading",
    sel: ".page-section > h2",
    prop: "color",
    token: "text-primary",
  },
  {
    name: "tile range",
    sel: ".tile-range",
    prop: "color",
    token: "text-muted",
  },
  {
    name: "nominal badge border",
    sel: ".tv-badge--nominal",
    prop: "borderTopColor",
    token: "border-control",
  },
  {
    name: "limit callout bar",
    sel: ".tv-callout--limit",
    prop: "borderInlineStartColor",
    token: "status-stop",
  },
  {
    name: "caution callout bar",
    sel: ".tv-callout--caution",
    prop: "borderInlineStartColor",
    token: "status-proxy",
  },
  {
    name: "interval cap",
    sel: ".tv-interval__cap",
    prop: "backgroundColor",
    token: "viz-recommended",
  },
  {
    name: "interval mark",
    sel: ".tv-interval__mark",
    prop: "backgroundColor",
    token: "text-primary",
  },
  {
    name: "interval track",
    sel: ".tv-interval__track",
    prop: "backgroundColor",
    token: "surface-raised",
  },
  {
    name: "select surface",
    sel: ".ctl select",
    prop: "backgroundColor",
    token: "surface-elevated",
  },
  {
    name: "select border",
    sel: ".ctl select",
    prop: "borderTopColor",
    token: "border-control",
  },
  {
    name: "layer midcoat outline",
    sel: ".tv-schem__midcoat",
    prop: "stroke",
    token: "text-muted",
  },
  {
    name: "layer topcoat",
    sel: ".tv-schem__topcoat",
    prop: "fill",
    token: "viz-1",
  },
  {
    name: "layer substrate",
    sel: ".tv-schem__substrate",
    prop: "fill",
    token: "viz-baseline",
  },
  {
    name: "layer label",
    sel: ".tv-schem__label",
    prop: "fill",
    token: "text-primary",
  },
]

export function registerThemeTests(h: Harness): void {
  const { reg, open } = h
  const html = (p: Page) =>
    p.evaluate(() => document.documentElement.dataset.theme)
  const bg = (p: Page) =>
    p.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const click = async (p: Page) => {
    await p.click("#theme-toggle")
    await p.waitForTimeout(500)
  }
  /** `getComputedStyle` of a fresh element given `prop: var(--tv-token)`: the browser's own rendering of a token in the current theme. */
  const expectedOf = (p: Page, rows: { prop: string; token: string }[]) =>
    p.evaluate((rs) => {
      const out: string[] = []
      for (const r of rs) {
        const d = document.createElement("div")
        d.style.setProperty(
          r.prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
          `var(--tv-${r.token})`,
        )
        document.body.append(d)
        out.push(
          (getComputedStyle(d) as unknown as Record<string, string>)[
            r.prop
          ] as string,
        )
        d.remove()
      }
      return out
    }, rows)
  const actualOf = (p: Page, rows: Sample[]) =>
    p.evaluate(
      (rs) =>
        rs.map((r) => {
          const e = document.querySelector(r.sel)
          if (!e) return `MISSING ${r.sel}`
          return (getComputedStyle(e) as unknown as Record<string, string>)[
            r.prop
          ] as string
        }),
      rows,
    )
  const openAll = async (p: Page) => {
    await p.evaluate(() =>
      document.querySelectorAll("details").forEach((d) => {
        d.open = true
      }),
    )
    await p.waitForFunction(() => {
      const figs = [...document.querySelectorAll(".js-plotly-plot")]
      return (
        figs.length >= 10 &&
        figs.every((f) => f.getElementsByClassName("main-svg").length > 0)
      )
    })
  }
  type Layout = Record<string, string>
  const layouts = (p: Page) =>
    p.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".js-plotly-plot")].map(
        (el) => {
          const gd = el as unknown as {
            _fullLayout: {
              paper_bgcolor: string
              plot_bgcolor: string
              font: { color: string }
              hoverlabel: { bgcolor: string; font: { color: string } }
              xaxis?: { gridcolor: string; linecolor: string }
            }
          }
          const l = gd._fullLayout
          const out: Record<string, string> = {
            id: el.id,
            paper: l.paper_bgcolor,
            plot: l.plot_bgcolor,
            font: l.font.color,
            hoverBg: l.hoverlabel.bgcolor,
            hoverFont: l.hoverlabel.font.color,
          }
          if (l.xaxis?.gridcolor) out.grid = l.xaxis.gridcolor
          if (l.xaxis?.linecolor) out.axis = l.xaxis.linecolor
          return out as Record<string, string>
        },
      ),
    )
  const plotThemes = (p: Page) =>
    p.evaluate(
      () =>
        (
          window as never as {
            __SPANDEK__: {
              plotThemes: Record<string, Record<string, string>>
            }
          }
        ).__SPANDEK__.plotThemes,
    )

  // ---- default ----
  reg("defaultIsLightEvenWhenOsPrefersDark", false, async () => {
    const page = await open({ scheme: "dark" })
    expect(
      await page.evaluate(
        () => matchMedia("(prefers-color-scheme: dark)").matches,
      ),
    ).toBe(true)
    expect(await html(page)).toBe("light")
    expect(await bg(page)).toBe("rgb(247, 248, 250)")
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      ),
    ).toBe("light")
    expect(await page.getAttribute("#theme-toggle", "aria-pressed")).toBe(
      "false",
    )
    for (const l of await layouts(page))
      expect(l.paper?.toLowerCase(), `${l.id}`).toBe("#f7f8fa")
    expect(h.watches.get(page)?.errors).toEqual([])
  })

  // ---- the toggle changes every role and back ----
  reg("toggleSwitchesAllRolesAndBack", false, async () => {
    const page = await open({ scheme: "dark" })
    await openAll(page)
    const rows = SAMPLES
    const light = await actualOf(page, rows)
    expect(light.filter((x) => x.startsWith("MISSING"))).toEqual([])
    expect(rows.length).toBeGreaterThanOrEqual(15)
    expect(light).toEqual(await expectedOf(page, rows))
    const plot = await plotThemes(page)
    const lightLayouts = await layouts(page)
    const lightExpected = rows.map((r) => r.name)
    await click(page)
    expect(await html(page)).toBe("dark")
    const dark = await actualOf(page, rows)
    expect(dark).toEqual(await expectedOf(page, rows))
    // every sampled role really changed (a role that stayed would be a stale colour)
    rows.forEach((r, i) => {
      expect(dark[i], `${r.name} changed`).not.toBe(light[i] as string)
    })
    // every figure: layout colours are the dark theme's, none stale
    const darkLayouts = await layouts(page)
    expect(darkLayouts.length).toBe(lightLayouts.length)
    darkLayouts.forEach((d, i) => {
      const l = lightLayouts[i] as Layout
      const t = plot.dark as Record<string, string>
      expect(d.paper?.toLowerCase(), `${d.id} paper`).toBe(
        (t.paper as string).toLowerCase(),
      )
      // a parcoords figure has no plot area: its plot colour is undefined in both themes
      if (l.plot !== undefined)
        expect(d.plot?.toLowerCase(), `${d.id} plot`).toBe(
          (t.plot as string).toLowerCase(),
        )
      expect(d.font?.toLowerCase(), `${d.id} font`).toBe(
        (t.font as string).toLowerCase(),
      )
      expect(d.hoverBg?.toLowerCase(), `${d.id} hover`).toBe(
        (t.hoverBg as string).toLowerCase(),
      )
      expect(d.paper, `${d.id} changed`).not.toBe(l.paper as string)
      expect(d.font, `${d.id} font changed`).not.toBe(l.font as string)
      expect(d.hoverBg, `${d.id} hover changed`).not.toBe(l.hoverBg as string)
      if (l.grid) expect(d.grid, `${d.id} grid changed`).not.toBe(l.grid)
    })
    // and back: identical to the first light state
    await click(page)
    expect(await html(page)).toBe("light")
    expect(await actualOf(page, rows)).toEqual(light)
    expect(await layouts(page)).toEqual(lightLayouts)
    void lightExpected
    expect(h.watches.get(page)?.errors).toEqual([])
  })

  // ---- storage ----
  reg("toggleRestoresFromStorage", false, async () => {
    const page = await open({ scheme: "light" })
    await click(page)
    expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe(
      "dark",
    )
    await page.reload()
    await page.waitForSelector("#fig-why-tofT .main-svg")
    expect(await html(page)).toBe("dark")
    expect(await page.getAttribute("#theme-toggle", "aria-pressed")).toBe(
      "true",
    )
    expect(await page.textContent("#theme-toggle [data-theme-state]")).toBe(
      "On",
    )
    expect(
      (await layouts(page)).every((l) => l.paper?.toLowerCase() === "#0b1020"),
    ).toBe(true)
    await click(page)
    await page.reload()
    expect(await html(page)).toBe("light")
    expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe(
      "light",
    )
  })

  reg("storageBlockedStillWorks", false, async () => {
    const page = await open({ scheme: "dark", init: BLOCKED })
    // storage throws on access: the page is light, renders its figures, and the toggle still switches for the session
    expect(await html(page)).toBe("light")
    expect(await bg(page)).toBe("rgb(247, 248, 250)")
    await click(page)
    expect(await html(page)).toBe("dark")
    expect(await bg(page)).toBe("rgb(11, 16, 32)")
    expect(
      (await layouts(page)).every((l) => l.paper?.toLowerCase() === "#0b1020"),
    ).toBe(true)
    await click(page)
    expect(await html(page)).toBe("light")
    expect(h.watches.get(page)?.errors).toEqual([])
  })

  reg("storedDarkPaintsDarkFromTheFirstFrame", false, async () => {
    // record every data-theme change and the first paint; every change must come before the first paint, and the first computed
    // background after the stylesheet applies (DOMContentLoaded) is already dark
    const init = `${stored("dark")}
window.__themeLog=[];window.__dcl="";
new MutationObserver(function(){window.__themeLog.push([document.documentElement.getAttribute("data-theme"),performance.now()])}).observe(document,{attributes:true,subtree:true,attributeFilter:["data-theme"]});
document.addEventListener("DOMContentLoaded",function(){window.__dcl=getComputedStyle(document.body).backgroundColor});`
    const page = await open({ scheme: "light", init })
    const r = await page.evaluate(() => {
      const w = window as never as {
        __themeLog: [string, number][]
        __dcl: string
      }
      const fp = performance.getEntriesByName("first-paint")[0]
      return { log: w.__themeLog, dcl: w.__dcl, paint: fp?.startTime ?? -1 }
    })
    expect(r.dcl).toBe("rgb(11, 16, 32)")
    expect(r.paint).toBeGreaterThan(0)
    for (const [, t] of r.log) expect(t).toBeLessThan(r.paint)
    expect(r.log.map((x) => x[0]).at(-1) ?? "dark").toBe("dark")
    // control: without a stored theme the DOMContentLoaded background is light, so the probe can fail
    const plain = await open({
      scheme: "light",
      init: `window.__dcl="";document.addEventListener("DOMContentLoaded",function(){window.__dcl=getComputedStyle(document.body).backgroundColor});`,
    })
    expect(
      await plain.evaluate(() => (window as never as { __dcl: string }).__dcl),
    ).toBe("rgb(247, 248, 250)")
  })

  // ---- figures keep their state ----
  reg("figuresRethemeOnToggleKeepBrushAndLiveState", false, async () => {
    const page = await open({ scheme: "dark", hash: "#test" })
    await openAll(page)
    await page.waitForSelector("#fig-parcoords .axis-brush rect.background")
    const drag = async (axis: number, from: number, to: number) => {
      await page.locator("#fig-parcoords").scrollIntoViewIfNeeded()
      const boxes = await page.$$eval(
        "#fig-parcoords .axis-brush rect.background",
        (els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect()
            return { x: r.x, y: r.y, w: r.width, h: r.height }
          }),
      )
      const b = boxes[axis] as { x: number; y: number; w: number; h: number }
      const x = b.x + b.w / 2
      await page.mouse.move(x, b.y + b.h * from)
      await page.mouse.down()
      await page.mouse.move(x, b.y + b.h * ((from + to) / 2), { steps: 5 })
      await page.mouse.move(x, b.y + b.h * to, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(250)
    }
    await drag(0, 0.3, 0.8)
    await drag(2, 0.1, 0.6)
    const ranges = () =>
      page.evaluate(() =>
        (window as never as { __brushRanges: () => unknown }).__brushRanges(),
      )
    const rows = () =>
      page.$$eval("#tbl-explorer tbody tr[data-id]:not([hidden])", (r) =>
        r.map((x) => (x as HTMLElement).dataset.id as string).sort(),
      )
    const live = () =>
      page.evaluate(() => {
        const t: Record<string, string> = {}
        for (const e of document.querySelectorAll<HTMLElement>(".tile"))
          t[e.id] = `${e.dataset.nominal}|${e.dataset.lo}|${e.dataset.hi}`
        return {
          t,
          ph: (document.getElementById("live-num-ph") as HTMLInputElement)
            .value,
        }
      })
    const span = await page.$eval("#live-num-ph", (e) => ({
      min: Number((e as HTMLInputElement).min),
      max: Number((e as HTMLInputElement).max),
    }))
    const at = (f: number) => String(span.min + (span.max - span.min) * f)
    await page.fill("#live-num-ph", at(0.25))
    await page.waitForFunction(() => {
      const d = (document.getElementById("live-root") as HTMLElement).dataset
      return Number(d.requested) > 0 && Number(d.shown) >= Number(d.requested)
    })
    const before = {
      ranges: await ranges(),
      rows: await rows(),
      live: await live(),
    }
    expect(Object.keys(before.ranges as object).length).toBe(2)
    expect(before.rows.length).toBeLessThan(96)
    const lightL = await layouts(page)
    await click(page)
    expect(await html(page)).toBe("dark")
    expect(await ranges()).toEqual(before.ranges)
    expect(await rows()).toEqual(before.rows)
    expect(await live()).toEqual(before.live)
    // the parcoords figure now carries the dark colours and still holds its brush
    const darkL = await layouts(page)
    expect(
      (darkL.find((l) => l.id === "fig-parcoords") as Layout).paper,
    ).not.toBe((lightL.find((l) => l.id === "fig-parcoords") as Layout).paper)
    // a live change after the toggle still updates the tiles (the simulator is not frozen by the redraw)
    await page.fill("#live-num-ph", at(0.75))
    await page.waitForTimeout(400)
    expect((await live()).t).not.toEqual(before.live.t)
    expect(await ranges()).toEqual(before.ranges)
    expect(h.watches.get(page)?.errors).toEqual([])
  })

  // ---- native controls ----
  reg("nativeControlsFollowColorScheme", false, async () => {
    const page = await open({ scheme: "dark" })
    await openAll(page)
    const read = () =>
      page.evaluate(() =>
        [
          "html",
          "select",
          'input[type="range"]',
          "details > summary",
          "input[type=number]",
          ".scroll",
        ].map((s) => {
          const e = document.querySelector(s)
          return e ? getComputedStyle(e).colorScheme : "MISSING"
        }),
      )
    const l = await read()
    expect(
      l.every((x) => x === "light"),
      l.join(),
    ).toBe(true)
    await click(page)
    const d = await read()
    expect(
      d.every((x) => x === "dark"),
      d.join(),
    ).toBe(true)
  })

  // ---- no stale colour of the other theme ----
  reg("noStaleDarkInLightAndViceVersa", false, async () => {
    const page = await open({ scheme: "dark" })
    await openAll(page)
    /** Every distinct colour painted by a visible element (text, background, borders, outline, svg fill and stroke), as the browser reports it. */
    const painted = () =>
      page.evaluate(() => {
        const props = [
          "color",
          "backgroundColor",
          "borderTopColor",
          "borderRightColor",
          "borderBottomColor",
          "borderLeftColor",
          "fill",
          "stroke",
        ] as const
        const seen = new Map<string, string>()
        for (const e of document.querySelectorAll("body *")) {
          if (e.closest("canvas")) continue
          if (e.getClientRects().length === 0) continue
          // a range, checkbox or radio draws no text: its UA `color` is the system FieldText of the colour scheme (white in dark), not a token
          const noText = e.matches(
            'input[type="range"],input[type="checkbox"],input[type="radio"]',
          )
          const cs = getComputedStyle(e)
          for (const p of props) {
            const v = cs[p]
            if (!v || v === "none" || v.startsWith("url(")) continue
            if (p === "color" && noText) continue
            // a border colour only shows with a border
            if (p.startsWith("border")) {
              const side = p.slice(6, -5)
              const w = cs[`border${side}Width` as "borderTopWidth"]
              if (
                w === "0px" ||
                cs[`border${side}Style` as "borderTopStyle"] === "none"
              )
                continue
            }
            if (p === "backgroundColor" && v === "rgba(0, 0, 0, 0)") continue
            if (!seen.has(v))
              seen.set(
                v,
                `${e.tagName.toLowerCase()}.${(e.getAttribute("class") ?? "").split(" ")[0]}#${e.id} ${p}`,
              )
          }
        }
        return Object.fromEntries(seen)
      })
    /** All token values of both themes as the browser writes them; a value is "only dark" or "only light" when the other theme has no token of that value. */
    const sets = async () => {
      const names = (await page.evaluate(() =>
        [...document.styleSheets].flatMap((s) =>
          [...s.cssRules].flatMap((r) =>
            r instanceof CSSStyleRule
              ? [...r.cssText.matchAll(/--tv-([a-z0-9-]+):/g)].map(
                  (m) => m[1] as string,
                )
              : [],
          ),
        ),
      )) as string[]
      const colourNames = [...new Set(names)].filter((n) =>
        /^(surface|text|border|action|accent|glow|focus|link|status|viz)-/.test(
          n,
        ),
      )
      const values = async (theme: string) => {
        await page.evaluate(
          (t) => document.documentElement.setAttribute("data-theme", t),
          theme,
        )
        return page.evaluate(
          (ns) =>
            ns.map((n) => {
              const d = document.createElement("div")
              d.style.color = `var(--tv-${n})`
              document.body.append(d)
              const c = getComputedStyle(d).color
              d.remove()
              return c
            }),
          colourNames,
        )
      }
      const l = await values("light")
      const dk = await values("dark")
      await page.evaluate(() =>
        document.documentElement.setAttribute("data-theme", "light"),
      )
      await page.waitForTimeout(500)
      return {
        onlyLight: new Set(l.filter((v) => !dk.includes(v))),
        onlyDark: new Set(dk.filter((v) => !l.includes(v))),
      }
    }
    const { onlyLight, onlyDark } = await sets()
    expect(onlyDark.size).toBeGreaterThan(10)
    const lightPaint = await painted()
    const leakedDark = Object.entries(lightPaint).filter(([v]) =>
      onlyDark.has(v),
    )
    expect(leakedDark, "dark-only colours painted in the light theme").toEqual(
      [],
    )
    expect(Object.keys(lightPaint).some((v) => onlyLight.has(v))).toBe(true)
    await click(page)
    expect(await html(page)).toBe("dark")
    const darkPaint = await painted()
    const leakedLight = Object.entries(darkPaint).filter(([v]) =>
      onlyLight.has(v),
    )
    expect(leakedLight, "light-only colours painted in the dark theme").toEqual(
      [],
    )
    expect(Object.keys(darkPaint).some((v) => onlyDark.has(v))).toBe(true)
  })

  // ---- Plotly data: the colours inside the figures (canvas figures draw nothing in the DOM to scan) ----
  reg("everyFigureTraceColourIsTheShownThemesNotTheOther", false, async () => {
    const page = await open({ scheme: "dark" })
    await openAll(page)
    const pal = await plotThemes(page)
    const flat = (v: unknown): string[] =>
      Array.isArray(v) ? v.flatMap(flat) : typeof v === "string" ? [v] : []
    const colours = (t: Record<string, unknown>) =>
      flat(Object.values(t)).filter((c) => /^(#[0-9a-f]{6}|rgba?\()/i.test(c))
    const light = new Set(
      colours(pal.light as Record<string, unknown>).map((c) => c.toLowerCase()),
    )
    const dark = new Set(
      colours(pal.dark as Record<string, unknown>).map((c) => c.toLowerCase()),
    )
    const onlyLight = [...light].filter((c) => !dark.has(c))
    const onlyDark = [...dark].filter((c) => !light.has(c))
    expect(onlyLight.length).toBeGreaterThan(10)
    const scan = (mode: "light" | "dark") =>
      page.evaluate(
        ({ mode, pal, other }) => {
          const t = pal[mode] as Record<string, string | string[]>
          const slot = (s: string): string => {
            if (s === "ink") return t.font as string
            if (s === "recommended") return t.recommended as string
            if (s === "baseline" || s === "neutral") return t.baseline as string
            return (t.colorway as string[])[Number(s.slice(7)) - 1] as string
          }
          const bad: string[] = []
          for (const el of document.querySelectorAll<HTMLElement>(
            ".js-plotly-plot",
          )) {
            const gd = el as unknown as {
              data: Record<string, unknown>[]
              layout: object
            }
            const text = JSON.stringify([gd.data, gd.layout]).toLowerCase()
            for (const c of other)
              if (text.includes(c))
                bad.push(`${el.id}: ${c} of the other theme`)
            for (const tr of gd.data) {
              const meta = tr.meta as
                | { slot?: string; scale?: string }
                | undefined
              const line = tr.line as
                | { color?: string; colorscale?: unknown[][] }
                | undefined
              const marker = tr.marker as
                | {
                    color?: unknown
                    line?: { color?: string }
                    colorscale?: unknown[][]
                  }
                | undefined
              if (meta?.slot) {
                const want = slot(meta.slot).toLowerCase()
                if (
                  typeof line?.color === "string" &&
                  line.color.toLowerCase() !== want
                )
                  bad.push(`${el.id}: line ${line.color} != ${want}`)
                if (
                  typeof marker?.color === "string" &&
                  marker.color.toLowerCase() !== want
                )
                  bad.push(`${el.id}: marker ${marker.color} != ${want}`)
                if (
                  typeof marker?.line?.color === "string" &&
                  marker.line.color.toLowerCase() !== want
                )
                  bad.push(
                    `${el.id}: marker line ${marker.line.color} != ${want}`,
                  )
              }
              if (meta?.scale === "seq") {
                const scale = (
                  marker?.colorscale ??
                  line?.colorscale ??
                  []
                ).map((p) => String(p[1]).toLowerCase())
                if (
                  scale.join() !==
                  (t.seq as string[]).map((c) => c.toLowerCase()).join()
                )
                  bad.push(
                    `${el.id}: colour scale is not the ${mode} sequential scale`,
                  )
              }
            }
          }
          return bad
        },
        { mode, pal, other: mode === "light" ? onlyDark : onlyLight },
      )
    expect(await scan("light")).toEqual([])
    await click(page)
    expect(await scan("dark")).toEqual([])
    await click(page)
    expect(await scan("light")).toEqual([])
    // the scan can fail: asked for the wrong theme it reports colours
    expect((await scan("dark")).length).toBeGreaterThan(0)
  })

  // ---- print ----
  reg("printStaysLight", false, async () => {
    const page = await open({ scheme: "dark", init: stored("dark") })
    expect(await html(page)).toBe("dark")
    await page.emulateMedia({ media: "print", colorScheme: "dark" })
    const r = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      tile: getComputedStyle(document.querySelector(".tile") as Element)
        .backgroundColor,
      glossary: (
        document.querySelector("#details-glossary .tv-glossary") as HTMLElement
      ).checkVisibility(),
    }))
    expect(r.body).toBe("rgb(247, 248, 250)")
    expect(r.text).toBe("rgb(11, 16, 32)")
    expect(r.scheme).toBe("light")
    expect(r.tile).toBe("rgba(11, 16, 32, 0.04)")
    expect(r.glossary).toBe(true)
    // the screen is dark again afterwards (the control that makes the print assertion able to fail)
    await page.emulateMedia({ media: "screen" })
    expect(await bg(page)).toBe("rgb(11, 16, 32)")
  })

  // ---- keyboard and aria ----
  reg("toggleKeyboardAndAria", false, async () => {
    const page = await open({ scheme: "dark" })
    const btn = page.getByRole("button", { name: "Dark mode", pressed: false })
    expect(await btn.count()).toBe(1)
    const box = (await btn.boundingBox()) as { width: number; height: number }
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(await page.textContent("#theme-toggle [data-theme-state]")).toBe(
      "Off",
    )
    // reach it with the keyboard
    let reached = false
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press("Tab")
      reached = await page.evaluate(
        () => document.activeElement?.id === "theme-toggle",
      )
    }
    expect(reached).toBe(true)
    // a visible focus ring from the focus-ring token
    const ring = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement as Element)
      const probe = document.createElement("div")
      probe.style.color = "var(--tv-focus-ring)"
      document.body.append(probe)
      const want = getComputedStyle(probe).color
      probe.remove()
      return {
        style: cs.outlineStyle,
        width: cs.outlineWidth,
        color: cs.outlineColor,
        want,
      }
    })
    expect(ring.style).toBe("solid")
    expect(ring.width).toBe("2px")
    expect(ring.color).toBe(ring.want)
    await page.keyboard.press("Space")
    await page.waitForTimeout(400)
    expect(await html(page)).toBe("dark")
    expect(await page.getAttribute("#theme-toggle", "aria-pressed")).toBe(
      "true",
    )
    expect(await page.textContent("#theme-toggle [data-theme-state]")).toBe(
      "On",
    )
    expect(
      await page
        .getByRole("button", { name: "Dark mode", pressed: true })
        .count(),
    ).toBe(1)
    await page.keyboard.press("Enter")
    await page.waitForTimeout(400)
    expect(await html(page)).toBe("light")
    expect(await page.getAttribute("#theme-toggle", "aria-pressed")).toBe(
      "false",
    )
  })

  // ---- the gallery: light by default, both themes side by side, a toggle ----
  reg("galleryShowsBothThemesAndAToggle", false, async () => {
    const out = join(
      mkdtempSync(join(tmpdir(), "spandek-gallery-")),
      "components.html",
    )
    buildGallery(out)
    const page = await (async () => {
      const probe = await open({ scheme: "dark" })
      const ctx = probe.context()
      const g = await ctx.newPage()
      await g.goto(`file://${out}`)
      await g.evaluate(() => document.fonts.ready.then(() => undefined))
      return g
    })()
    expect(await html(page)).toBe("light")
    expect(await bg(page)).toBe("rgb(247, 248, 250)")
    const panes = () =>
      page.$$eval("[data-pane]", (els) =>
        els.map((e) => ({
          pane: e.getAttribute("data-pane"),
          bg: getComputedStyle(e).backgroundColor,
          fg: getComputedStyle(e).color,
          scheme: getComputedStyle(e).colorScheme,
          visible: e.getClientRects().length > 0,
        })),
      )
    const before = await panes()
    expect(before).toEqual([
      {
        pane: "light",
        bg: "rgb(247, 248, 250)",
        fg: "rgb(11, 16, 32)",
        scheme: "light",
        visible: true,
      },
      {
        pane: "dark",
        bg: "rgb(11, 16, 32)",
        fg: "rgb(247, 248, 250)",
        scheme: "dark",
        visible: true,
      },
    ])
    await page.click("#theme-toggle")
    expect(await html(page)).toBe("dark")
    expect(await bg(page)).toBe("rgb(11, 16, 32)")
    // the panes keep their own theme while the page flips
    expect(await panes()).toEqual(before)
    expect(await page.getAttribute("#theme-toggle", "aria-pressed")).toBe(
      "true",
    )
  })
}
