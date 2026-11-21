import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Browser, chromium } from "playwright"
import { parseCsv } from "../../../src/core/csv"
import { buildReport } from "../../../src/node/report/html"
import { fmtValue } from "../../../src/web/fmt"
import {
  buildIndonesiaReport,
  buildTestReport,
  reportOpts,
  visibleText,
} from "../../helpers"

type Built = Awaited<ReturnType<typeof buildIndonesiaReport>>
let b: Built
let plain: { html: string; dir: string }
const outPath = () =>
  join(mkdtempSync(join(tmpdir(), "spandek-ind-")), "report.html")
const codeOf = async (f: () => Promise<unknown>): Promise<number> => {
  try {
    await f()
  } catch (e) {
    return (e as { code?: number }).code ?? -1
  }
  return 0
}
const section = (html: string): string =>
  (/<section id="indonesia"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "") as string
const summary = (dir: string) =>
  parseCsv(
    readFileSync(join(dir, "indonesia", "indonesia_summary.csv"), "utf8"),
  )

beforeAll(async () => {
  plain = await buildTestReport()
  b = await buildIndonesiaReport()
}, 120_000)

test("absentIndonesiaOutputsOmitTheSectionWithoutError", () => {
  expect(plain.html).not.toContain('id="indonesia"')
  expect(plain.html).not.toContain('href="#indonesia"')
})

test("presentOutputsAddTheSectionBetweenOptimisationAndLimits", () => {
  const h = b.html
  expect(h).toContain('href="#indonesia"')
  expect(h.indexOf('<section id="indonesia"')).toBeGreaterThan(
    h.indexOf('<section id="sensitivity"'),
  )
  expect(h.indexOf('<section id="limits"')).toBeGreaterThan(
    h.indexOf('<section id="indonesia"'),
  )
  expect(section(h)).toContain('id="fig-indonesia-bars"')
})

/** H9: every number the section shows is the fmtValue of the CSV cell it names, read through the data- attributes. */
test("indonesiaSectionNumbersEqualCsv", () => {
  const rows = summary(b.dir)
  const cells = [
    ...section(b.html).matchAll(
      /<td data-site="(\w+)" data-bin="(\w+)" data-subject="(\w+)" data-state="(\w+)" data-col="(\w+)">([^<]*)<\/td>/g,
    ),
  ]
  expect(cells.length).toBe(28) // 8 benefit cells + 5 subjects x 2 states x 2 columns
  const digits: Record<string, number> = {
    dq_w_m2: 2,
    t_max_c: 1,
    q_in_mean_w_m2: 2,
  }
  const lo: Record<string, string> = {
    dq_w_m2: "dq_lo",
    t_max_c: "t_max_lo",
    q_in_mean_w_m2: "q_lo",
  }
  const hi: Record<string, string> = {
    dq_w_m2: "dq_hi",
    t_max_c: "t_max_hi",
    q_in_mean_w_m2: "q_hi",
  }
  for (const [, site, bin, subject, state, col, text] of cells) {
    const r = rows.find(
      (x) =>
        x.site === site &&
        x.bin === bin &&
        x.subject === subject &&
        x.state === state,
    )
    if (!r) throw new Error(`no CSV row for ${site} ${bin} ${subject} ${state}`)
    const d = digits[col as string] as number
    const f = (k: string) => fmtValue(Number(r[k]), d)
    expect(text).toBe(
      `${f(col as string)} [${f(lo[col as string] as string)}, ${f(hi[col as string] as string)}]`,
    )
  }
  // the benefit table has one cell per site x subject x state of the weighted view: 4 subjects x 2 states for one site
  expect(
    cells.filter((c) => c[5] === "dq_w_m2" && c[2] === "weighted").length,
  ).toBe(8)
  // the instrument can fail: a different value in the file would not match the displayed text
  const r0 = rows.find((x) => x.bin === "weighted" && x.subject === "card_high")
  expect(fmtValue(Number(r0?.dq_w_m2) + 0.5, 2)).not.toBe(
    fmtValue(Number(r0?.dq_w_m2), 2),
  )
})

test("labelsAgedAsScenario", () => {
  const s = section(b.html)
  const text = visibleText(s)
  expect(text).toContain("PROXY results on aluminium, with scenario ageing")
  expect(text).toContain("not an Indonesian measurement")
  expect(text).toContain("modelled")
  expect(text).toContain("not station measurements")
  // every label that names the aged state says it is a scenario
  const labels = [
    ...s.matchAll(/<(th|option)[^>]*>([^<]*[Aa]ged[^<]*)<\/\1>/g),
  ].map((m) => m[2] as string)
  expect(labels.length).toBeGreaterThanOrEqual(2)
  for (const l of labels) expect(l).toContain("scenario ageing")
  // the cross-check states honestly what it compares
  expect(text).toContain("both modelled products")
  expect(text).toContain("does not compare either with ground measurements")
  expect(text).not.toContain("IWEC")
})

test("tamperedPartialOrUnlistedIndonesiaFilesAreRefused", async () => {
  const copy = (): string => {
    const d = mkdtempSync(join(tmpdir(), "spandek-ind-copy-"))
    cpSync(b.dir, d, { recursive: true })
    return d
  }
  // one byte appended to a listed file
  const t = copy()
  appendFileSync(join(t, "indonesia", "indonesia_summary.csv"), " ")
  expect(await codeOf(() => buildReport(t, outPath(), reportOpts()))).toBe(5)
  // a missing file of the set
  const m = copy()
  rmSync(join(m, "indonesia", "indonesia_crosscheck.csv"))
  expect(await codeOf(() => buildReport(m, outPath(), reportOpts()))).toBe(5)
  // outputs that the manifest does not list (a copy of the outputs next to a manifest without extra[])
  const u = copy()
  const manifest = JSON.parse(
    readFileSync(join(u, "run_manifest.json"), "utf8"),
  )
  expect(manifest.extra.map((e: { path: string }) => e.path)).toContain(
    "indonesia/indonesia_summary.csv",
  )
  rmSync(join(u, "run_manifest.json"))
  cpSync(join(plain.dir, "run_manifest.json"), join(u, "run_manifest.json"))
  expect(await codeOf(() => buildReport(u, outPath(), reportOpts()))).toBe(5)
  expect(existsSync(join(u, "report.html.tmp"))).toBe(false)
})
// ---- the page in a real Chrome (the DOM is the thing under test) ----
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true })
})
afterAll(async () => {
  await browser?.close()
})

test("benefitBarsInChromeEqualTheCsvForBothStates", async () => {
  const ctx = await browser.newContext({ offline: true })
  try {
    const page = await ctx.newPage()
    const errors: string[] = []
    const failed: string[] = []
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    page.on("pageerror", (e) => errors.push(String(e)))
    page.on("requestfailed", (r) => failed.push(r.url()))
    await page.goto(`file://${b.path}`)
    await page.waitForSelector("#fig-indonesia-bars .main-svg")
    const rows = summary(b.dir)
    for (const state of ["initial", "aged"] as const) {
      if (state === "aged") {
        await page.selectOption("#sel-indonesia-state", "aged")
        await page.waitForFunction(() =>
          (
            document.querySelector("#fig-indonesia-bars") as unknown as {
              layout: { xaxis: { title: { text: string } } }
            }
          ).layout.xaxis.title.text.includes("aged"),
        )
      }
      const fig = await page.evaluate(() => {
        const gd = document.querySelector("#fig-indonesia-bars") as unknown as {
          data: {
            name: string
            y: number[]
            x: string[][]
            error_y: { array: number[]; arrayminus: number[] }
          }[]
          layout: { xaxis: { title: { text: string } } }
        }
        return {
          title: gd.layout.xaxis.title.text,
          data: gd.data.map((t) => ({
            name: t.name,
            y: t.y,
            bins: t.x[1],
            up: t.error_y.array,
            down: t.error_y.arrayminus,
          })),
        }
      })
      expect(fig.title).toContain("aluminium, scenario ageing")
      expect(fig.data.length).toBe(4)
      const label: Record<string, string> = {
        "hot day": "hot",
        "typical day": "typical",
        "overcast day": "overcast",
        weighted: "weighted",
      }
      const subj: Record<string, string> = {
        "C1 commercial datasheet": "C1",
        "High-performing card": "card_high",
        "Balanced card": "card_balanced",
        "Low-cost card": "card_low",
      }
      let n = 0
      for (const t of fig.data)
        t.y.forEach((y, i) => {
          const r = rows.find(
            (x) =>
              x.site === "jakarta" &&
              x.bin === label[t.bins?.[i] as string] &&
              x.subject === subj[t.name] &&
              x.state === state,
          )
          if (!r) throw new Error(`no row for ${t.name} ${t.bins?.[i]}`)
          n++
          expect(y).toBeCloseTo(Number(r.dq_w_m2), 12)
          expect((y as number) + (t.up[i] as number)).toBeCloseTo(
            Number(r.dq_hi),
            9,
          )
          expect((y as number) - (t.down[i] as number)).toBeCloseTo(
            Number(r.dq_lo),
            9,
          )
        })
      expect(n).toBe(16) // 4 subjects x (3 day types + weighted)
    }
    expect(errors).toEqual([])
    expect(failed).toEqual([])
    // the benefit table cell the page shows equals the same CSV number
    const cell = await page.textContent(
      'td[data-subject="card_balanced"][data-state="initial"][data-bin="weighted"][data-col="dq_w_m2"]',
    )
    const r = summary(b.dir).find(
      (x) =>
        x.bin === "weighted" &&
        x.subject === "card_balanced" &&
        x.state === "initial",
    )
    expect(cell).toBe(
      `${fmtValue(Number(r?.dq_w_m2), 2)} [${fmtValue(Number(r?.dq_lo), 2)}, ${fmtValue(Number(r?.dq_hi), 2)}]`,
    )
  } finally {
    await ctx.close()
  }
}, 60_000)

test("sectionStatesTheSpikeCaveatsAndHonestIntervals", () => {
  const text = visibleText(section(b.html))
  // S6: grid-point elevation bias, Medan's missing dry season, the wet/dry definition
  expect(text).toContain("921.68 m")
  expect(text).toMatch(/1 to 2 K cool/)
  expect(text).toMatch(/Medan and Makassar[^.]*may read cool/)
  expect(text).toContain("Medan has no clear dry season")
  expect(text).toContain("relative to its other months")
  expect(text).toContain("exceeds 150 mm")
  expect(text).toMatch(/Bandung's June \(151 mm\) sits right on it/)
  // N1: the aged C1 against the cards is an assumption, not a result
  expect(text).toContain("driven by the assumed loss")
  expect(text).toContain("intervals overlap")
  expect(text).toMatch(/loss of about 14 %/)
  expect(text).toMatch(/midpoint of the scenario loss range \(about 20 %\)/)
  // N2: the benefit bracket is an outer bound, not a p5-p95 of the benefit
  expect(text).toContain("outer bound, not the p5 to p95 of the benefit")
  expect(text).toContain("[outer bound]")
  const tbl = /<table id="tbl-indonesia-benefit"[\s\S]*?<\/thead>/.exec(
    b.html,
  )?.[0] as string
  expect(tbl).not.toContain("[p5, p95]")
  // N7: the temperature column is the weighted mean of the day peaks
  expect(text).toContain("Weighted mean of the day peaks")
  expect(text).not.toMatch(/weighted peak/i)
})

test("indonesiaBarSeriesAreVisibleInBothThemesAndTheYTitleIsNotClipped", async () => {
  // S4: computed colours of every bar series against the computed plot background, light and dark, and the toggle
  const rgb = (c: string): [number, number, number] =>
    c.startsWith("#")
      ? ([1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16)) as [
          number,
          number,
          number,
        ])
      : ((c.match(/\d+/g) as string[]).slice(0, 3).map(Number) as [
          number,
          number,
          number,
        ])
  const lum = (c: string): number => {
    const [r, g, bl] = rgb(c).map((x) => {
      const v = x / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const ratio = (a: string, c: string): number => {
    const [x, y] = [lum(a), lum(c)]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }
  for (const scheme of ["dark", "light"] as const) {
    const ctx = await browser.newContext({
      offline: true,
      colorScheme: scheme,
      viewport: { width: 1280, height: 900 },
    })
    try {
      const page = await ctx.newPage()
      await page.goto(`file://${b.path}`)
      await page.waitForSelector("#fig-indonesia-bars .main-svg")
      const read = () =>
        page.evaluate(() => {
          const gd = document.querySelector(
            "#fig-indonesia-bars",
          ) as unknown as {
            data: { marker: { color: string } }[]
            _fullLayout: { plot_bgcolor: string; paper_bgcolor: string }
          }
          const title = document.querySelector(
            "#fig-indonesia-bars .ytitle",
          ) as Element
          const t = title.getBoundingClientRect()
          const f = (
            document.querySelector("#fig-indonesia-bars") as Element
          ).getBoundingClientRect()
          return {
            colours: gd.data.map((t) => t.marker.color),
            plot: gd._fullLayout.plot_bgcolor,
            bg: getComputedStyle(document.documentElement)
              .getPropertyValue("--bg")
              .trim(),
            titleLeft: t.left - f.left,
            titleTop: t.top - f.top,
            titleBottom: f.bottom - t.bottom,
          }
        })
      const first = await read()
      expect(first.plot).toBe(first.bg)
      expect(first.colours.length).toBe(4)
      for (const c of first.colours)
        expect(ratio(c, first.bg)).toBeGreaterThanOrEqual(3)
      // the y-axis title lies inside the figure
      expect(first.titleLeft).toBeGreaterThanOrEqual(0)
      expect(first.titleTop).toBeGreaterThanOrEqual(0)
      expect(first.titleBottom).toBeGreaterThanOrEqual(0)
      // the toggle flips the theme: the series follow and stay visible
      await page.click("#theme-toggle")
      await page.waitForTimeout(500)
      const flipped = await read()
      expect(flipped.bg).not.toBe(first.bg)
      expect(flipped.colours).not.toEqual(first.colours)
      for (const c of flipped.colours)
        expect(ratio(c, flipped.bg)).toBeGreaterThanOrEqual(3)
    } finally {
      await ctx.close()
    }
  }
}, 60000)
