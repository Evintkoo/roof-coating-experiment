import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  dayChart,
  dayChartPaths,
  dayGeometry,
} from "../../../../src/web/design/molecules/dayChart"
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
const data = () => ({
  recipeC: day(),
  bareC: day(8),
  loC: day(-1),
  hiC: day(1.5),
})

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R28 DayChart", [])
})

test("everyMovingElementDeclaresItsSource", async () => {
  const els = await elementsOf(dayChart({ name: "SP-075", data: data() }))
  const sources = els.map((e) => e.attrs["data-source"]).filter(Boolean)
  expect(sources).toEqual([
    "band:t_surface",
    "series:bare",
    "series:recipe",
    "clock:t_h",
    "series:bare@t",
    "series:recipe@t",
  ])
  expect(els.find((e) => e.tag === "svg")?.attrs.role).toBe("img")
})

test("pathsHave144PointsAndStayInsideTheFrame", () => {
  const p = dayChartPaths(data())
  expect(p.recipe.split("L").length).toBe(144)
  const nums = [...p.recipe.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)]
  for (const m of nums) {
    expect(Number(m[1])).toBeGreaterThanOrEqual(0)
    expect(Number(m[1])).toBeLessThanOrEqual(640)
    expect(Number(m[2])).toBeGreaterThanOrEqual(0)
    expect(Number(m[2])).toBeLessThanOrEqual(260)
  }
  const g = dayGeometry(data())
  expect(g.y(g.yMin)).toBeGreaterThan(g.y(g.yMax))
})

test("badDataIsABuildErrorF9", () => {
  expectBuildError(
    () => dayChart({ name: "x", data: { ...data(), bareC: [1, 2] } }),
    "DayChart",
  )
  expectBuildError(
    () =>
      dayChart({
        name: "x",
        data: {
          ...data(),
          recipeC: day().map((v, i) => (i === 3 ? Number.NaN : v)),
        },
      }),
    "DayChart",
  )
  expectBuildError(() => dayChart({ name: " ", data: data() }), "DayChart")
  expectBuildError(
    () =>
      dayChart({
        name: "x",
        data: { recipeC: [1], bareC: [1], loC: [1], hiC: [1] },
      }),
    "DayChart",
  )
})

test("aNameWithMarkupIsEscapedF10", async () => {
  const html = dayChart({ name: XSS, data: data() })
  expect((await elementsOf(html)).some((e) => e.tag === "img")).toBe(false)
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(MOLECULE_CSS.dayChart)
})
