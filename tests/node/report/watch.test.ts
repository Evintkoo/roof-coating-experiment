import { beforeAll, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { OVERCLAIM_PATTERN } from "../../../src/core/report/outline"
import { buildReport } from "../../../src/node/report/html"
import { bareFixtureRun, reportOpts, visibleText } from "../../helpers"

let html = ""
const build = async (): Promise<string> => {
  const dir = await bareFixtureRun()
  const out = join(mkdtempSync(join(tmpdir(), "watch-")), "report.html")
  await buildReport(dir, out, reportOpts())
  return readFileSync(out, "utf8")
}
beforeAll(async () => {
  html = await build()
}, 120_000)

const section = (): string =>
  /<section id="watch"[\s\S]*?<\/section>/.exec(html)?.[0] ?? ""

test("watchSectionSitsBetweenHowTheLayersWorkAndTheClimate", () => {
  const ids = [...html.matchAll(/<section[^>]* id="([a-z]+)"/g)].map(
    (m) => m[1],
  )
  expect(ids.indexOf("watch")).toBe(ids.indexOf("why") + 1)
  expect(html).toContain('href="#watch"')
})

test("theDayPlayerAndTheClosedScreeningDisclosureAreInTheSection", () => {
  const s = section()
  expect(s).toContain("data-watch-day")
  expect(s).toContain("data-watch-screening")
  // the screening is inside a disclosure that is closed on load (D8)
  expect(s).toMatch(/<details[^>]*id="details-screening"(?![^>]*\sopen)[^>]*>/)
  // honesty label at the container (FR-7, D7)
  expect(s).toContain("Model output, not a measurement")
  // a visible reduce motion switch (rollout)
  expect(s).toContain('data-anim="reduce-motion"')
})

test("everyAnimatedElementDeclaresADataSource", () => {
  const s = section()
  for (const src of [
    "series:recipe",
    "series:bare",
    "band:t_surface",
    "clock:t_h",
    "flux:incident",
    "flux:reflected",
    "flux:absorbed",
    "flux:conducted",
  ])
    expect(s).toContain(`data-source="${src}"`)
})

test("theSectionTextHoldsNoForbiddenClaimWording", () => {
  const text = visibleText(section())
  expect(text.length).toBeGreaterThan(100)
  expect(OVERCLAIM_PATTERN.test(text)).toBe(false)
})

test("theScreeningDataIsEmbeddedForTheBatchCheck", () => {
  expect(html).toContain('"screening":{')
  const m = /"nominal":\[\[/.exec(html)
  expect(m).not.toBeNull()
})

test("twoBuildsGiveTheSameBytes", async () => {
  expect(await build()).toBe(html)
}, 120_000)
