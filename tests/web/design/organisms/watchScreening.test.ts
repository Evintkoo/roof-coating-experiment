import { expect, test } from "bun:test"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import { watchScreening } from "../../../../src/web/design/organisms/watchScreening"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R34 WatchScreening", ["auto"])
})

test("hasTheButtonWorkersDrawsLanesGridSummaryAndCheck", async () => {
  const html = watchScreening({ candidates: 96, scenarios: 9, draws: 32 })
  const els = await elementsOf(html)
  const anim = els.map((e) => e.attrs["data-anim"]).filter(Boolean)
  for (const k of [
    "screen-start",
    "workers",
    "draws",
    "computing",
    "lanes",
    "grid",
    "summary",
    "check",
  ])
    expect(anim, k).toContain(k)
  expect(els.filter((e) => e.attrs["data-cell"] !== undefined).length).toBe(864)
  expect(html).toContain("Model output, not a measurement")
  expect(html).toContain("32 per cell")
  expect(els.find((e) => e.attrs["data-anim"] === "summary")?.attrs.role).toBe(
    "status",
  )
  expect(els.find((e) => e.attrs["data-anim"] === "screen-start")?.tag).toBe(
    "button",
  )
})

test("badInputIsABuildErrorF9", () => {
  expectBuildError(
    () => watchScreening({ candidates: 96, scenarios: 9, draws: 0 }),
    "WatchScreening",
  )
  expectBuildError(
    () => watchScreening({ candidates: Number.NaN, scenarios: 9, draws: 32 }),
    "WatchScreening",
  )
  expectBuildError(
    () => watchScreening({ candidates: 0, scenarios: 9, draws: 32 }),
    "LaneMeter",
  )
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(ORGANISM_CSS.watchScreening as string)
})

test("fourthTabLivePhysicsInTheSameDisclosureRowPlan09", async () => {
  const base = { candidates: 96, scenarios: 9, draws: 32 }
  const three = await elementsOf(
    watchScreening({
      ...base,
      tabsHost: { id: "watch-tabs", compare: "<p>c</p>", sweep: "<p>s</p>" },
    }),
  )
  expect(three.filter((e) => e.attrs.role === "tab").length).toBe(3)
  const four = await elementsOf(
    watchScreening({
      ...base,
      tabsHost: {
        id: "watch-tabs",
        compare: "<p>c</p>",
        sweep: "<p>s</p>",
        physics: "<p>p</p>",
      },
    }),
  )
  const tabs = four.filter((e) => e.attrs.role === "tab")
  expect(tabs.map((t) => t.attrs["data-tab"])).toEqual([
    "screening",
    "compare",
    "sweep",
    "physics",
  ])
  expect(four.filter((e) => e.attrs.role === "tabpanel").length).toBe(4)
})
