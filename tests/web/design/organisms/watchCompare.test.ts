import { expect, test } from "bun:test"
import { LANE_IDS, type LaneId } from "../../../../src/core/anim/compare"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import {
  C1_NOTE,
  diffUnit,
  formatDiff,
  watchCompare,
} from "../../../../src/web/design/organisms/watchCompare"
import { HONESTY_LABEL } from "../../../../src/web/design/organisms/watchDay"
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
const lanes = (c1: boolean) =>
  LANE_IDS.map((id) => ({
    id,
    unit:
      id === "surface_c" ? "°C" : id === "cumulative_wh" ? "W h/m²" : "W/m²",
    recipe: day(),
    c0: day(8),
    c1: c1 ? day(2) : null,
  }))
const diff = (c1: boolean) =>
  Object.fromEntries(
    LANE_IDS.map((id) => [id, { c0: -7.84, c1: c1 ? -2.06 : null }]),
  ) as Record<LaneId, { c0: number; c1: number | null }>
const props = (c1 = true) => ({ lanes: lanes(c1), diff: diff(c1), tH: 13 })

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R37 WatchCompare", [])
})

test("hasFiveLanesTheLabelAndNoControlOrClock", async () => {
  const html = watchCompare(props())
  const els = await elementsOf(html)
  expect(els.filter((e) => e.attrs["data-anim"] === "lane-slot").length).toBe(5)
  expect(els.filter((e) => e.attrs["data-lane-chart"]).length).toBe(5)
  expect(els.filter((e) => e.attrs["data-anim"] === "diff").length).toBe(10)
  expect(html).toContain(HONESTY_LABEL)
  expect(html).toContain("data-watch-compare")
  // the panel owns no clock and no control (FR-2)
  expect(els.some((e) => ["button", "input", "select"].includes(e.tag))).toBe(
    false,
  )
  expect(html).toContain("US")
  expect(html).toContain(C1_NOTE)
  expect(html).toContain("ageing is not shown")
})

test("formatsTheDifferenceWithSignAndUnit", () => {
  expect(formatDiff(-7.84, "°C")).toBe("−7.8 K")
  expect(formatDiff(2.06, "W/m²")).toBe("+2.1 W/m²")
  expect(formatDiff(0.01, "W h/m²")).toBe("0.0 W h/m²")
  expect(diffUnit("°C")).toBe("K")
})

test("c1MissingIsSaidInWordsF1", async () => {
  const html = watchCompare(props(false))
  expect(html).toContain("not available")
  expect(html).toContain("C1 not available")
  const els = await elementsOf(html)
  expect(els.filter((e) => e.attrs["data-control"] === "c1").length).toBe(0)
  expect(html).not.toContain("NaN")
})

test("noRecommendedBestOptimalH14", () => {
  expect(watchCompare(props())).not.toMatch(
    /\brecommended\b|\bbest\b|\boptimal\b/i,
  )
})

test("everySeriesDeclaresASourceH10", async () => {
  const els = await elementsOf(watchCompare(props()))
  const drawn = els.filter((e) =>
    /tv-lane__(line|cursor)/.test(e.attrs.class ?? ""),
  )
  expect(drawn.length).toBe(5 * 4)
  for (const e of drawn)
    expect(e.attrs["data-source"], e.attrs.class).toBeTruthy()
})

test("badInputIsABuildErrorF9", () => {
  expectBuildError(
    () => watchCompare({ ...props(), lanes: lanes(true).slice(1) }),
    "WatchCompare",
  )
  expectBuildError(
    () => watchCompare({ ...props(), tH: Number.NaN }),
    "WatchCompare",
  )
  expectBuildError(
    () =>
      watchCompare({
        ...props(),
        lanes: [
          {
            ...(lanes(true)[0] as ReturnType<typeof lanes>[0]),
            id: "heat" as LaneId,
          },
          ...lanes(true).slice(1),
        ],
      }),
    "WatchCompare",
  )
  const bad = diff(true)
  bad.surface_c = { c0: Number.NaN, c1: 0 }
  expectBuildError(
    () => watchCompare({ ...props(), diff: bad }),
    "WatchCompare",
  )
})

test("textInAFieldIsEscapedF8", async () => {
  const l = lanes(true).map((x) => ({ ...x, unit: XSS }))
  const els = await elementsOf(watchCompare({ ...props(), lanes: l }))
  expect(els.some((e) => e.tag === "img")).toBe(false)
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(ORGANISM_CSS.watchCompare as string)
})
