// T-HON: the report must not look more certain than the models are. Figure part (plan 00 Task 3);
// the page part (Limits section, forbidden phrases in the built HTML) is added with the builder.
import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import type { ModelContext } from "../src/core/pipeline/context"
import { liveSimulate } from "../src/core/pipeline/live"
import { OVERCLAIM_PATTERN } from "../src/core/report/outline"
import { loadContext } from "../src/node/context"
import {
  figLiveSpectrum,
  figLiveTofT,
  figParcoords,
  figSplom,
} from "../src/web/figures"
import { defaultLiveState } from "../src/web/liveState"
import {
  buildIndonesiaReport,
  buildTestReport,
  repoRoot,
  visibleText,
} from "./helpers"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

test("liveFiguresShowTheBandAndSayHowManyDraws", () => {
  const r = liveSimulate(
    defaultLiveState(ctx.ranges, ctx.weather).inputs,
    ctx,
    32,
    20261121,
  )
  const f = figLiveTofT(r)
  const kinds = (f.data as { meta: { kind: string } }[]).map((t) => t.meta.kind)
  expect(kinds.filter((k) => k === "predicted").length).toBe(1)
  expect(kinds.filter((k) => k === "band").length).toBe(2)
  const y = (f.layout as { yaxis: { title: { text: string } } }).yaxis.title
    .text
  expect(y).toContain("p5-p95")
  expect(y).toContain("32 draws")
  expect(JSON.stringify(figLiveSpectrum(r, ctx.g173).data)).toContain("tonexty")
})

test("proxyAxesSaySoInEveryExplorerFigure", () => {
  const rows = [0, 1].map((i) => ({
    candidate_id: `SP-00${i + 1}`,
    r_solar_pred: 0.8,
    t_max_pred: 40,
    corrosion_proxy: 0.2,
    delam_proxy: 0.2,
    cost_proxy: 0.2,
    t_max_worst: 50,
    on_front: true,
    pareto_freq: 1,
    role: "" as const,
  }))
  for (const f of [figParcoords(rows, {}), figSplom(rows, {})]) {
    const labels = (
      f.data[0] as { dimensions: { label: string }[] }
    ).dimensions.map((d) => d.label)
    for (const l of labels)
      if (/Corrosion|Delamination|Cost/.test(l)) expect(l).toContain("(PROXY)")
  }
})

// ---- page part (plan 00 Task 4) ----

const hasLimits = (html: string): boolean =>
  /<section id="limits"/.test(html) &&
  /<nav[\s\S]*href="#limits"[\s\S]*<\/nav>/.test(html)

test("limitsSectionAndNavLinkPresent", async () => {
  const { html } = await buildTestReport()
  expect(hasLimits(html)).toBe(true)
  const text = visibleText(html)
  expect(text).toContain("Method and limits")
  expect(text).toContain("Every PROXY index is uncalibrated")
  // F5: without the section (or the link) the check fails
  expect(
    hasLimits(html.replace('<section id="limits"', '<section id="other"')),
  ).toBe(false)
  expect(hasLimits(html.replace('href="#limits"', 'href="#other"'))).toBe(false)
})

test("forbiddenPhrasesAbsent", async () => {
  const { html } = await buildTestReport()
  // plan 06: "proven" is word-bounded (the section "Provenance" is not a claim); no label is allow-listed any more
  const text = visibleText(html)
  expect(text).not.toMatch(OVERCLAIM_PATTERN)
  expect(OVERCLAIM_PATTERN.test("a safe coating")).toBe(true) // the scan can fail
  expect(OVERCLAIM_PATTERN.test("this recipe is proven")).toBe(true)
  expect(OVERCLAIM_PATTERN.test("the best recipe")).toBe(true)
  expect(OVERCLAIM_PATTERN.test("Provenance")).toBe(false)
  expect("Highest cooling").not.toMatch(OVERCLAIM_PATTERN)
  expect("Best cooling").toMatch(OVERCLAIM_PATTERN)
  expect("each recommended recipe").toMatch(OVERCLAIM_PATTERN)
})

test("pageStatesProxyAndIntervalsUpFront", async () => {
  const { html } = await buildTestReport()
  const text = visibleText(html)
  expect(text).toContain("PROXY")
  expect(text).toContain("parameter uncertainty only")
  expect(text).toContain("not a laboratory result")
  // every recipe prediction of the comparison table carries an interval in brackets, every index its PROXY badge
  const table =
    /<table class="tv-datatable" id="tbl-recipes">[\s\S]*?<\/table>/.exec(
      html,
    )?.[0] as string
  const rows = [...table.matchAll(/<tr data-row="\d+">[\s\S]*?<\/tr>/g)].slice(
    0,
    3,
  )
  expect(rows.length).toBe(3)
  for (const r of rows) {
    expect((r[0].match(/\[[-\d.]+, [-\d.]+\]/g) ?? []).length).toBe(2)
    expect((r[0].match(/tv-badge--proxy/g) ?? []).length).toBe(3)
  }
})

// ---- Indonesia section (plan 04 Task 6): the forbidden phrases extend to claims the data cannot carry ----

test("forbiddenPhrasesAbsentFromTheIndonesiaSection", async () => {
  const { html } = await buildIndonesiaReport()
  const forbidden = OVERCLAIM_PATTERN
  const text = visibleText(html)
  expect(text).not.toMatch(forbidden)
  const section = visibleText(
    /<section id="climate"[\s\S]*<section id="limits"/.exec(
      html,
    )?.[0] as string,
  )
  expect(section.length).toBeGreaterThan(2000)
  // the scan can fail on the phrases it is meant to catch
  for (const bad of [
    "validated against stations",
    "ground truth",
    "measured in Indonesia",
    "a safe roof",
    "field tested",
  ])
    expect(forbidden.test(bad)).toBe(true)
  // what the section must say up front
  for (const must of ["PROXY", "scenario ageing", "modelled", "aluminium"])
    expect(section).toContain(must)
  // every benefit figure has an interval in brackets (the weighted table: 8 cells with value [p5, p95])
  const table = /<table id="tbl-indonesia-benefit"[\s\S]*?<\/table>/.exec(
    html,
  )?.[0] as string
  const cells = [...table.matchAll(/data-col="dq_w_m2">([^<]*)</g)]
  expect(cells.length).toBe(8)
  for (const c of cells)
    expect(c[1]).toMatch(/^-?[\d.]+ \[-?[\d.]+, -?[\d.]+\]$/)
})

// ---- S3: ageing is stated once, precisely, and no sentence of the page contradicts the Indonesia section ----

test("ageingStatementsDoNotContradictAcrossThePage", async () => {
  const { html } = await buildIndonesiaReport()
  const text = visibleText(html)
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x !== "")
  // a sentence that says ageing or weathering is not modelled must also say where the scenario is (or that it is only a scenario)
  const denies = (x: string): boolean =>
    /(ageing|weathering)[^.]*not (modelled|measured)|not modelled[^.]*(ageing|weathering)/i.test(
      x,
    )
  const bad = sentences.filter(
    (x) => denies(x) && !/scenario|Indonesia section/i.test(x),
  )
  expect(bad).toEqual([])
  // the scan can fail on the old wording
  expect(denies("Weathering, ageing and adhesion are not modelled.")).toBe(true)
  expect(
    /scenario|Indonesia section/i.test(
      "Weathering, ageing and adhesion are not modelled.",
    ),
  ).toBe(false)
  // the overview names the initial state for the main results and the labelled scenario for ageing
  const overview = visibleText(
    /<section id="limits"[\s\S]*?<\/section>/.exec(html)?.[0] as string,
  )
  expect(overview).toContain("initial, as-applied state")
  expect(overview).toContain(
    "labelled scenario in the Indonesian climate section",
  )
  expect(overview).toContain("never as a measurement")
  // a page without the Indonesia section does not point at it as if it were there
  const plain = visibleText((await buildTestReport()).html)
  expect(plain).not.toMatch(/ageing[^.]*not modelled here/i)
})
