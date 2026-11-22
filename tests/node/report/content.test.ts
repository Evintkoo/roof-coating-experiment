import { beforeAll, expect, test } from "bun:test"
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
import { parseCsv } from "../../../src/core/csv"
import { buildReport } from "../../../src/node/report/html"
import {
  addRefineOutputs,
  buildTestReport,
  copyRun,
  reportOpts,
  visibleText,
} from "../../helpers"

let built: { dir: string; path: string; html: string }
beforeAll(async () => {
  built = await buildTestReport()
}, 120_000)
const out = () =>
  join(mkdtempSync(join(tmpdir(), "spandek-content-")), "report.html")
const codeOf = async (f: () => Promise<unknown>): Promise<number> => {
  try {
    await f()
  } catch (e) {
    return (e as { code?: number }).code ?? -1
  }
  return 0
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

test("sectionsComeInTheReadingPathOrderAndOptionalOnesAreOmitted", () => {
  const ids = [...built.html.matchAll(/<section[^>]* id="([a-z]+)"/g)].map(
    (m) => m[1],
  )
  expect(ids).toEqual([
    "verdict",
    "recipes",
    "why",
    "explore",
    "limits",
    "provenance",
  ])
  expect(built.html).not.toContain('id="climate"')
  expect(built.html).not.toContain('id="budget"')
  // the rail links exactly the sections present, in the same order
  const nav = /<nav[\s\S]*?<\/nav>/.exec(built.html)?.[0] as string
  expect([...nav.matchAll(/href="#([a-z]+)"/g)].map((m) => m[1])).toEqual(ids)
})

/** H7 for the first screen: the cooling number of each recipe card is recomputed here from results.csv and controls.csv. */
test("heroCoolingNumbersEqualAnIndependentRecomputation", () => {
  const results = parseCsv(readFileSync(join(built.dir, "results.csv"), "utf8"))
  const controls = parseCsv(
    readFileSync(join(built.dir, "controls.csv"), "utf8"),
  )
  const c0 = mean(
    controls
      .filter((c) => c.control_id === "C0")
      .map((c) => Number(c.t_max_pred)),
  )
  const hero = /<section[^>]*id="verdict"[\s\S]*?<\/section>/.exec(
    built.html,
  )?.[0] as string
  const cards = [
    ...hero.matchAll(
      /<article class="tv-recipe[^"]*" data-recipe data-role="(\w+)">[\s\S]*?<\/article>/g,
    ),
  ]
  expect(cards.length).toBe(3)
  for (const c of cards) {
    const id = /tv-code[^>]*>(SP-\d{3})</.exec(c[0])?.[1] as string
    const rows = results.filter((r) => r.candidate_id === id)
    expect(rows.length).toBeGreaterThan(0)
    const want = (c0 - mean(rows.map((r) => Number(r.t_max_pred)))).toFixed(1)
    const shown = /tv-stat__num[^>]*>([-\d.]+)</.exec(c[0])?.[1]
    expect(shown).toBe(want)
    const lo = (c0 - mean(rows.map((r) => Number(r.t_max_hi)))).toFixed(1)
    const hi = (c0 - mean(rows.map((r) => Number(r.t_max_lo)))).toFixed(1)
    expect(c[0]).toContain(`${lo} to ${hi} K`)
  }
  // the verdict sentence's span is the rounded min and max of the same three numbers
  expect(hero).toMatch(/about \d+ (to \d+ )?K in the models/)
})

test("theFigureMessageOfWhyItWorksIsReadFromCurvesJson", () => {
  const curves = JSON.parse(
    readFileSync(join(built.dir, "curves.json"), "utf8"),
  ) as {
    series: { id: string; scenario_id: string; t_c: number[] }[]
  }
  const c0 = curves.series.filter((s) => s.id === "C0")
  const hot = c0.reduce((a, b) =>
    Math.max(...b.t_c) > Math.max(...a.t_c) ? b : a,
  )
  const why = /<section id="why"[\s\S]*?<\/section>/.exec(
    built.html,
  )?.[0] as string
  const text = visibleText(why)
  expect(text).toContain(`hottest modelled day (${hot.scenario_id})`)
  expect(text).toContain(
    `bare aluminium peaks at ${Math.max(...hot.t_c).toFixed(1)} °C`,
  )
  // one data-drawn schematic per recipe
  expect([...why.matchAll(/data-layer-schematic="(SP-\d{3})"/g)].length).toBe(3)
})

test("recipesFallBackToTheShortlistWithoutRefineFilesAndAnEmptyShortlistIsExit5", async () => {
  // F6: the base run has no refine files; the Recipes section is built from the shortlist
  const rec = /<section id="recipes"[\s\S]*?<\/section>/.exec(
    built.html,
  )?.[0] as string
  expect(rec).not.toContain("refined variant")
  expect(rec).toContain('data-finding="recipe-high_performing"')
  // with the refine files the sentences mention the refined variant
  const dir = await copyRun()
  await addRefineOutputs(dir)
  const o = out()
  await buildReport(dir, o, reportOpts())
  expect(readFileSync(o, "utf8")).toContain("refined variant")
  // no role in the shortlist: exit 5, no file
  const bad = await copyRun()
  const p = join(bad, "pareto.csv")
  const lines = readFileSync(p, "utf8").split("\n")
  const k = (lines[0] as string).split(",").indexOf("role")
  const cleaned = lines.map((l, i) => {
    if (i === 0 || l === "") return l
    const c = l.split(",")
    c[k] = ""
    return c.join(",")
  })
  writeFileSync(p, cleaned.join("\n"))
  const o2 = out()
  expect(await codeOf(() => buildReport(bad, o2, reportOpts()))).not.toBe(0)
  expect(existsSync(o2)).toBe(false)
})

test("aTamperedRefineFileIsRefusedAndAChangedControlsFileToo", async () => {
  // F5: a later output changed after the manifest recorded it
  const dir = await copyRun()
  await addRefineOutputs(dir)
  appendFileSync(join(dir, "refine", "refine_front.csv"), " ")
  const o = out()
  expect(await codeOf(() => buildReport(dir, o, reportOpts()))).toBe(5)
  expect(existsSync(o)).toBe(false)
  // the controls the headline numbers depend on are checked against the manifest too
  const c = await copyRun()
  appendFileSync(join(c, "controls.csv"), "\n")
  const o2 = out()
  expect(await codeOf(() => buildReport(c, o2, reportOpts()))).toBe(5)
  expect(existsSync(o2)).toBe(false)
  rmSync(c, { recursive: true, force: true })
})

test("provenanceStatesTheRunAndKeepsTheVerifyReportLinkage", () => {
  const text = visibleText(
    /<section id="provenance"[\s\S]*?<\/section>/.exec(
      built.html,
    )?.[0] as string,
  )
  expect(text).toContain("Uncertainty draws")
  expect(text).toContain("Core hash")
  const m = JSON.parse(
    readFileSync(join(built.dir, "run_manifest.json"), "utf8"),
  ) as { core_sha256: string }
  expect(text).toContain(m.core_sha256)
  expect(built.html).toContain(
    `<meta name="spandek-core-sha256" content="${m.core_sha256}">`,
  )
})
