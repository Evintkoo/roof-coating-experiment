import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Browser, chromium } from "playwright"
import type { BudgetTable } from "../../src/core/opt/budgetTable"
import { OVERCLAIM_PATTERN } from "../../src/core/report/outline"
import { configureLogging } from "../../src/node/logging"
import { buildReport, EXTRA_SECTIONS } from "../../src/node/report/html"
import {
  addRefineOutputs,
  claimText,
  repoRoot,
  reportOpts,
  scriptBlocks,
  unregisterExtra,
  visibleText,
} from "../helpers"
import type { Tier } from "./scale"

export type OptimisationScale = {
  tier: Tier
  /** A finished run directory with no refine or indonesia outputs registered; the suite copies it and never mutates it. */
  base: () => Promise<string>
}

export function optimisationSuite(S: OptimisationScale): void {
  const copyRun = async (): Promise<string> => {
    const dst = mkdtempSync(join(tmpdir(), "spandek-opt-run-"))
    cpSync(await S.base(), dst, { recursive: true })
    return dst
  }
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
    // log to a file, not to stderr: a worker's stderr pipe can be closed under load (EBADF seen in a loaded `bun run check`),
    // and an unhandled write error then fails whichever test logs next
    configureLogging({
      runId: "optimisation-test",
      level: "info",
      runDir: mkdtempSync(join(tmpdir(), "spandek-opt-log-")),
    })
    const bare = await S.base()
    const plainPath = outPath()
    await buildReport(bare, plainPath, reportOpts())
    plain = { html: readFileSync(plainPath, "utf8") }
    const dir = await copyRun()
    await addRefineOutputs(dir)
    const path = outPath()
    await buildReport(dir, path, reportOpts())
    withOpt = { dir, path, html: readFileSync(path, "utf8") }
  }, 120_000)

  test("absentRefineOutputsOmitTheSectionWithoutError", () => {
    expect(plain.html).not.toContain('id="budget"')
    expect(plain.html).not.toContain('href="#budget"')
  })

  test("presentRefineOutputsAddTheSectionBetweenWhyItWorksAndExplore", () => {
    const h = withOpt.html
    const at = (s: string) => h.indexOf(s)
    expect(at('<section id="why"')).toBeGreaterThan(0)
    expect(at('<section id="budget"')).toBeGreaterThan(at('<section id="why"'))
    expect(at('<section id="explore"')).toBeGreaterThan(
      at('<section id="budget"'),
    )
    expect(at('<section id="limits"')).toBeGreaterThan(
      at('<section id="explore"'),
    )
    expect(h).toContain('href="#budget"')
    const text = claimText(h)
    expect(text).toContain("not a measured optimum (PROXY)")
    expect(text).toContain("relative cost units (not IDR)")
    expect(text).toContain("exact lookup, no interpolation")
    expect(text).not.toMatch(OVERCLAIM_PATTERN)
  })

  test("recipeToleranceAndRobustTablesMatchTheCsv", () => {
    const sec = /<section id="budget"[\s\S]*<section id="explore"/.exec(
      withOpt.html,
    )?.[0] as string
    const rows = (name: string) =>
      readFileSync(join(withOpt.dir, "refine", name), "utf8")
        .trim()
        .split("\n").length - 1
    const trCount = (title: string) => {
      const part =
        new RegExp(`${title}</summary>[\\s\\S]*?</table>`).exec(sec)?.[0] ?? ""
      return (part.match(/<tr>/g) ?? []).length - 1 // minus the header row
    }
    expect(trCount("Three refined recipes \\(model optima\\)")).toBe(
      rows("refine_recipes.csv"),
    )
    expect(trCount("Dosing tolerance")).toBe(rows("refine_tolerance.csv"))
    expect(trCount("Robust optimum")).toBe(
      readFileSync(join(withOpt.dir, "refine", "refine_robust.csv"), "utf8")
        .split("\n")
        .filter((l) => l.startsWith("distribution")).length,
    )
    // headers of the objective columns that are PROXY say so
    const head =
      /Three refined recipes \(model optima\)<\/summary>[\s\S]*?(<thead>[\s\S]*?<\/thead>)/.exec(
        sec,
      )?.[1] as string
    expect((head.match(/\(PROXY\)/g) ?? []).length).toBe(3)
    expect(sec).toContain('id="budget-panel"')
    expect(sec).toContain('id="fig-frontier"')
  })

  test("robustChecksAreATableOfQuantityValueBasis", () => {
    const sec = /<section id="budget"[\s\S]*<section id="explore"/.exec(
      withOpt.html,
    )?.[0] as string
    const t = /<table[^>]*id="tbl-robust-checks"[\s\S]*?<\/table>/.exec(
      sec,
    )?.[0] as string
    expect(t).toBeDefined()
    for (const h of ["Quantity", "Value", "Basis"]) expect(t).toContain(h)
    expect(visibleText(t)).toContain("Scalar objective S")
    expect(visibleText(t)).toContain("p90 over the training draws")
    expect((t.match(/<tr\b/g) ?? []).length).toBe(7)
    // no list of "label: value" lines is left in the budget section
    for (const m of sec.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g))
      expect(visibleText(m[1] as string)).not.toMatch(/: -?[\d.]+$/)
  })

  test("embeddedTablesCarryAllProfiles", () => {
    const data = JSON.parse(
      (scriptBlocks(withOpt.html)[0] as string).replace(
        /^window\.__SPANDEK__ = /,
        "",
      ),
    )
    const b = data.ext.budget
    expect(b.opt.tables.length).toBe(3)
    expect(b.opt.cost_unit).toBe("relative")
    expect(b.opt.tables[0].entries.length).toBe(3)
    // the bare-aluminium peak the budget recipes are compared with, and the shared cooling scale
    expect(Number.isFinite(b.c0_mean_c)).toBe(true)
    expect(b.axis.max).toBeGreaterThan(b.axis.min)
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
    // the three CSVs were never registered in this scenario (refine did not write them); the removed table stays listed, which is
    // fine when the table itself is absent
    await unregisterExtra(dir, [
      "refine/refine_front.csv",
      "refine/refine_tolerance.csv",
      "refine/refine_robust.csv",
    ])
    const out = outPath()
    await buildReport(dir, out, reportOpts())
    const h = readFileSync(out, "utf8")
    expect(h).toContain('id="budget"')
    expect(h).toContain("Three refined recipes")
    expect(h).not.toContain('id="budget-panel"')
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

  test("tamperedRefineCsvCellIsRefusedNotShown", async () => {
    // S1: one cell of t_max_pred in refine_recipes.csv changed after `refine` registered the file
    const dir = await copyRun()
    await addRefineOutputs(dir)
    const p = join(dir, "refine", "refine_recipes.csv")
    const text = readFileSync(p, "utf8")
    const lines = text.split("\n")
    const cols = (lines[0] as string).split(",")
    const k = cols.indexOf("t_max_pred")
    expect(k).toBeGreaterThanOrEqual(0)
    const row = (lines[1] as string).split(",")
    row[k] = String(Number(row[k]) + 1)
    lines[1] = row.join(",")
    writeFileSync(p, lines.join("\n"))
    const out = outPath()
    expect(await codeOf(() => buildReport(dir, out, reportOpts()))).toBe(5)
    expect(existsSync(out)).toBe(false)
  })

  test("unlistedOrMissingRefineCsvIsRefused", async () => {
    // present but not in extra[]: refused
    const unlisted = await copyRun()
    await addRefineOutputs(unlisted)
    await unregisterExtra(unlisted, ["refine/refine_tolerance.csv"])
    expect(
      await codeOf(() => buildReport(unlisted, outPath(), reportOpts())),
    ).toBe(5)
    // listed but gone (a partial set): refused
    const partial = await copyRun()
    await addRefineOutputs(partial)
    rmSync(join(partial, "refine", "refine_robust.csv"))
    expect(
      await codeOf(() => buildReport(partial, outPath(), reportOpts())),
    ).toBe(5)
    // the untouched set builds
    const ok = await copyRun()
    await addRefineOutputs(ok)
    expect(await codeOf(() => buildReport(ok, outPath(), reportOpts()))).toBe(0)
  })

  test("manifestTableListsTheEmbeddedExtraFilesWithHashes", () => {
    const h = withOpt.html
    const tbl =
      /<table class="tv-datatable" id="provenance-run-extra">[\s\S]*?<\/table>/.exec(
        h,
      )?.[0] ?? ""
    const m = JSON.parse(
      readFileSync(join(withOpt.dir, "run_manifest.json"), "utf8"),
    ) as { extra: { path: string; sha256: string }[]; core_sha256: string }
    expect(m.extra.length).toBeGreaterThanOrEqual(5)
    for (const e of m.extra) {
      expect(tbl).toContain(e.path)
      expect(tbl).toContain(e.sha256)
    }
    // the page records the core hash it was built against
    expect(h).toContain(
      `<meta name="spandek-core-sha256" content="${m.core_sha256}">`,
    )
    // a run without later outputs shows no such table
    expect(plain.html).not.toContain("provenance-run-extra")
  })

  test("laterPlansAddSectionsThroughTheRegistry", async () => {
    EXTRA_SECTIONS.push({
      id: "indonesia",
      title: "Indonesia",
      order: 65,
      render: () => '<section id="indonesia"><h2>Indonesia</h2></section>',
      data: () => ({ days: 3 }),
    })
    try {
      const out = outPath()
      await buildReport(withOpt.dir, out, reportOpts())
      const h = readFileSync(out, "utf8")
      expect(h.indexOf('<section id="indonesia"')).toBeGreaterThan(
        h.indexOf('<section id="budget"'),
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
      await page.evaluate(() =>
        document.querySelectorAll("details").forEach((d) => {
          d.open = true
        }),
      )
      await page.waitForSelector("#fig-frontier .main-svg")
      expect(
        await page.locator("#fig-refine-front .main-svg").count(),
      ).toBeGreaterThan(0)
      const t = tables.find((x) => x.profile === "balanced") as BudgetTable
      const lo = t.c_min // one merged frontier (no priority chips): the panel shows the balanced table
      const cost2 = (b: number): string => {
        let best = t.entries[0]
        for (const e of t.entries)
          if (e.budget <= b && e.budget > (best?.budget ?? -1)) best = e
        return (best as { cost: number }).cost.toFixed(2)
      }
      const num = "#budget-panel-budget-num"
      const result = "#budget-panel [data-budget-result]"
      for (const b of [
        t.entries[1]?.budget as number,
        (t.entries[1]?.budget as number) + 0.05,
      ]) {
        await page.fill(num, String(b))
        const text = await page.locator(result).innerText()
        expect(text).toContain(`cost ${cost2(b)} relative cost units (not IDR)`)
        expect(text).toContain("parameter uncertainty only")
      }
      // above the range the box is clamped to the largest budget and the last entry shows
      await page.fill(num, String(t.c_max + 1))
      await page.locator(num).blur()
      expect(await page.locator(result).innerText()).toContain(
        `cost ${cost2(t.c_max)} relative cost units (not IDR)`,
      )
      // below the cheapest feasible recipe of the profile the panel says so (when the slider can still reach that budget)
      if (t.c_min > lo) {
        await page.fill(num, String(t.c_min - 0.001))
        expect(await page.locator(result).innerText()).toContain(
          `The cheapest tabulated recipe costs ${t.c_min.toFixed(2)} relative cost units (not IDR)`,
        )
      }
      // the slider and the number box stay in step
      await page.locator("#budget-panel-budget").fill(String(t.c_max))
      expect(Number(await page.inputValue(num))).toBeCloseTo(t.c_max, 6)
      expect(errors).toEqual([])
      expect(failed).toEqual([])
    } finally {
      await ctx.close()
    }
  }, 60000)
}
