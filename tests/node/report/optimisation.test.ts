import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Browser, chromium } from "playwright"
import type { BudgetTable } from "../../../src/core/opt/budgetTable"
import { buildReport, EXTRA_SECTIONS } from "../../../src/node/report/html"
import {
  addRefineOutputs,
  buildTestReport,
  copyRun,
  repoRoot,
  reportOpts,
  scriptBlocks,
  visibleText,
} from "../../helpers"

const outPath = () =>
  join(mkdtempSync(join(tmpdir(), "spandek-opt-")), "report.html")
const codeOf = async (f: () => Promise<unknown>): Promise<number> => {
  try {
    await f()
  } catch (e) {
    return (e as { code?: number }).code ?? -1
  }
  return 0
}
let withOpt: { dir: string; path: string; html: string }
let plain: { html: string }
const tables = (
  JSON.parse(
    readFileSync(
      join(repoRoot, "tests/fixtures/report/refine/budget_table.json"),
      "utf8",
    ),
  ) as { tables: BudgetTable[] }
).tables

beforeAll(async () => {
  plain = await buildTestReport()
  const dir = await copyRun()
  await addRefineOutputs(dir)
  const path = outPath()
  await buildReport(dir, path, reportOpts())
  withOpt = { dir, path, html: readFileSync(path, "utf8") }
})

test("absentRefineOutputsOmitTheSectionWithoutError", () => {
  expect(plain.html).not.toContain('id="optimisation"')
  expect(plain.html).not.toContain('href="#optimisation"')
})

test("presentRefineOutputsAddTheSectionBetweenSensitivityAndLimits", () => {
  const h = withOpt.html
  const at = (s: string) => h.indexOf(s)
  expect(at('<section id="sensitivity"')).toBeGreaterThan(0)
  expect(at('<section id="optimisation"')).toBeGreaterThan(
    at('<section id="sensitivity"'),
  )
  expect(at('<section id="limits"')).toBeGreaterThan(
    at('<section id="optimisation"'),
  )
  expect(h).toContain('href="#optimisation"')
  const text = visibleText(h)
  expect(text).toContain("not a measured optimum (PROXY)")
  expect(text).toContain("relative cost units (not IDR)")
  expect(text).toContain("exact lookup, no interpolation")
  expect(text).not.toMatch(
    /proven|safe|guaranteed|\d+\s*%\s*(safe|aman|self-clean)/i,
  )
})

test("recipeToleranceAndRobustTablesMatchTheCsv", () => {
  const sec = /<section id="optimisation"[\s\S]*?<\/section>/.exec(
    withOpt.html,
  )?.[0] as string
  const rows = (name: string) =>
    readFileSync(join(withOpt.dir, "refine", name), "utf8")
      .trim()
      .split("\n").length - 1
  const trCount = (title: string) => {
    const part =
      new RegExp(`<h3>${title}</h3>[\\s\\S]*?</table>`).exec(sec)?.[0] ?? ""
    return (part.match(/<tr>/g) ?? []).length - 1 // minus the header row
  }
  expect(trCount("Three refined recipes")).toBe(rows("refine_recipes.csv"))
  expect(trCount("Dosing tolerance")).toBe(rows("refine_tolerance.csv"))
  expect(trCount("Robust optimum")).toBe(
    readFileSync(join(withOpt.dir, "refine", "refine_robust.csv"), "utf8")
      .split("\n")
      .filter((l) => l.startsWith("distribution")).length,
  )
  // headers of the objective columns that are PROXY say so
  const head =
    /<h3>Three refined recipes<\/h3>[\s\S]*?(<thead>[\s\S]*?<\/thead>)/.exec(
      sec,
    )?.[1] as string
  expect((head.match(/\(PROXY\)/g) ?? []).length).toBe(3)
  expect(sec).toContain('id="opt-budget"')
  expect(sec).toContain('id="fig-frontier"')
})

test("embeddedTablesCarryAllProfiles", () => {
  const data = JSON.parse(
    (scriptBlocks(withOpt.html)[0] as string).replace(
      /^window\.__SPANDEK__ = /,
      "",
    ),
  )
  expect(data.ext.optimisation.tables.length).toBe(3)
  expect(data.ext.optimisation.cost_unit).toBe("relative")
  expect(data.ext.optimisation.tables[0].entries.length).toBe(3)
})

test("partialOutputsStillBuild", async () => {
  const dir = await copyRun()
  await addRefineOutputs(dir)
  for (const f of [
    "refine_front.csv",
    "refine_tolerance.csv",
    "refine_robust.csv",
    "budget_table.json",
  ])
    rmSync(join(dir, "refine", f))
  // the manifest still lists the removed table, which is fine when the table itself is absent
  const out = outPath()
  await buildReport(dir, out, reportOpts())
  const h = readFileSync(out, "utf8")
  expect(h).toContain('id="optimisation"')
  expect(h).toContain("Three refined recipes")
  expect(h).not.toContain('id="opt-budget"')
  expect(h).not.toContain("Dosing tolerance")
})

test("tamperedBudgetTableIsRefusedNotShown", async () => {
  const dir = await copyRun()
  await addRefineOutputs(dir)
  const p = join(dir, "refine", "budget_table.json")
  writeFileSync(p, readFileSync(p, "utf8").replace('"c_min"', '"c_min" '))
  const out = outPath()
  expect(await codeOf(() => buildReport(dir, out, reportOpts()))).toBe(5)
  expect(existsSync(out)).toBe(false)
})

test("laterPlansAddSectionsThroughTheRegistry", async () => {
  EXTRA_SECTIONS.push({
    id: "indonesia",
    title: "Indonesia",
    order: 75,
    render: () => '<section id="indonesia"><h2>Indonesia</h2></section>',
    data: () => ({ days: 3 }),
  })
  try {
    const out = outPath()
    await buildReport(withOpt.dir, out, reportOpts())
    const h = readFileSync(out, "utf8")
    expect(h.indexOf('<section id="indonesia"')).toBeGreaterThan(
      h.indexOf('<section id="optimisation"'),
    )
    expect(h.indexOf('<section id="limits"')).toBeGreaterThan(
      h.indexOf('<section id="indonesia"'),
    )
    expect(h).toContain('href="#indonesia"')
    const data = JSON.parse(
      (scriptBlocks(h)[0] as string).replace(/^window\.__SPANDEK__ = /, ""),
    )
    expect(data.ext.indonesia).toEqual({ days: 3 })
  } finally {
    EXTRA_SECTIONS.length = 0
  }
})

// ---- the budget slider in a real Chrome (the DOM is the thing under test) ----
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true })
})
afterAll(async () => {
  await browser?.close()
})

test("budgetLookupInChromeEqualsATablePlainScan", async () => {
  const ctx = await browser.newContext({ offline: true })
  try {
    const page = await ctx.newPage()
    const errors: string[] = []
    const failed: string[] = []
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    page.on("pageerror", (e) => errors.push(String(e)))
    page.on("requestfailed", (r) => failed.push(r.url()))
    await page.goto(`file://${withOpt.path}`)
    await page.waitForSelector("#fig-frontier .main-svg")
    expect(
      await page.locator("#fig-refine-front .main-svg").count(),
    ).toBeGreaterThan(0)
    const t = tables.find((x) => x.profile === "balanced") as BudgetTable
    await page.selectOption("#opt-profile", "balanced")
    const cost4 = (b: number): string => {
      let best = t.entries[0]
      for (const e of t.entries)
        if (e.budget <= b && e.budget > (best?.budget ?? -1)) best = e
      return (best as { cost: number }).cost.toFixed(4)
    }
    for (const b of [
      t.entries[1]?.budget as number,
      (t.entries[1]?.budget as number) + 0.05,
      t.c_max + 1,
    ]) {
      await page.fill("#opt-budget", String(b))
      const text = await page.locator("#opt-result").innerText()
      expect(text).toContain(`cost ${cost4(b)} relative cost units (not IDR)`)
      expect(text).toContain("Value [p5, p95]")
    }
    await page.fill("#opt-budget", String(t.c_min - 0.01))
    expect(await page.locator("#opt-result").innerText()).toContain(
      `minimum feasible cost for this profile is ${t.c_min.toFixed(4)}`,
    )
    // the slider and the number input stay in step
    await page.locator("#opt-budget-range").fill(String(t.c_max))
    expect(Number(await page.inputValue("#opt-budget"))).toBeCloseTo(t.c_max, 6)
    expect(errors).toEqual([])
    expect(failed).toEqual([])
  } finally {
    await ctx.close()
  }
}, 60000)
