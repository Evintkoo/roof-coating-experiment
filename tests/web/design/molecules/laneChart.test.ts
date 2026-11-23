import { expect, test } from "bun:test"
import { LANE_IDS } from "../../../../src/core/anim/compare"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  laneChart,
  laneChartGeometry,
} from "../../../../src/web/design/molecules/laneChart"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const day = (shift = 0) =>
  Array.from(
    { length: 144 },
    (_, i) =>
      25 + shift + 20 * Math.max(0, Math.sin((Math.PI * (i / 6 - 6)) / 12)),
  )
const props = (o: Record<string, unknown> = {}) => ({
  lane: "surface_c" as const,
  unit: "°C",
  recipe: day(),
  c0: day(8),
  c1: day(2),
  tH: 6,
  source: "lane:surface_c",
  ...o,
})

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R35 LaneChart", ["surface_c", "cumulative_wh"])
})

test("everySeriesHasADataSourceH10", async () => {
  const els = await elementsOf(laneChart(props()))
  const sources = els.map((e) => e.attrs["data-source"]).filter(Boolean)
  expect(sources).toEqual([
    "lane:surface_c:c0",
    "lane:surface_c:c1",
    "lane:surface_c:recipe",
    "clock:t_h",
  ])
  expect(els.find((e) => e.tag === "svg")?.attrs.role).toBe("img")
})

test("c1NullDrawsNoLineAndSaysSoF1", async () => {
  const html = laneChart(props({ c1: null }))
  expect(html).toContain("C1 not available")
  const els = await elementsOf(html)
  expect(els.some((e) => e.attrs["data-source"]?.endsWith(":c1"))).toBe(false)
})

test("everyLaneIdRendersAndAnUnknownOneIsABuildErrorF9", () => {
  for (const lane of LANE_IDS)
    expect(laneChart(props({ lane }))).toContain(lane)
  expectBuildError(() => laneChart(props({ lane: "heat" })), "LaneChart")
  expectBuildError(() => laneChart(props({ c0: [1, 2] })), "LaneChart")
  expectBuildError(
    () =>
      laneChart(
        props({ recipe: day().map((v, i) => (i === 2 ? Number.NaN : v)) }),
      ),
    "LaneChart",
  )
  expectBuildError(() => laneChart(props({ unit: " " })), "LaneChart")
  expectBuildError(() => laneChart(props({ tH: Number.NaN })), "LaneChart")
  expectBuildError(() => laneChart(props({ source: "<x>" })), "LaneChart")
})

test("geometryKeepsEverySeriesInsideTheFrame", () => {
  const g = laneChartGeometry([day(), day(8)])
  expect(g.y(g.yMin)).toBeGreaterThan(g.y(g.yMax))
  const flat = laneChartGeometry([
    [3, 3],
    [3, 3],
  ])
  expect(flat.yMax).toBeGreaterThan(flat.yMin)
})

test("aSourceOrUnitWithMarkupIsEscapedF8", async () => {
  const els = await elementsOf(laneChart(props({ unit: XSS })))
  expect(els.some((e) => e.tag === "img")).toBe(false)
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(MOLECULE_CSS.laneChart)
})
