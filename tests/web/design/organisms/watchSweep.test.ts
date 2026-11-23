import { beforeAll, expect, test } from "bun:test"
import { type SweepVar, sweepVariables } from "../../../../src/core/anim/sweep"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import { HONESTY_LABEL } from "../../../../src/web/design/organisms/watchDay"
import {
  LAYER_OFF_NOTE,
  SWEEP_NOTE,
  SWEEP_STATES,
  watchSweep,
} from "../../../../src/web/design/organisms/watchSweep"
import { testCtx } from "../../../support/dayData"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

let vars: SweepVar[]
beforeAll(async () => {
  const c = await testCtx()
  vars = sweepVariables(c.ranges, c.weather)
})
const props = (o: Record<string, unknown> = {}) => ({
  variables: vars,
  selected: "midcoat_dft_um",
  state: "idle" as const,
  ...o,
})

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R38 WatchSweep", [...SWEEP_STATES])
})

test("hasEveryControlTheLabelsAndFiveChartSlots", async () => {
  const html = watchSweep(props())
  const els = await elementsOf(html)
  const anim = els.map((e) => e.attrs["data-anim"]).filter(Boolean)
  for (const k of [
    "sweep-var",
    "sweep-play",
    "sweep-scrub",
    "sweep-value",
    "sweep-speed",
    "sweep-computing",
    "layer-off",
    "sweep-status",
    "sweep-readout",
  ])
    expect(anim, k).toContain(k)
  expect(anim.filter((k) => k === "sweep-chart").length).toBe(5)
  expect(els.filter((e) => e.tag === "option").length).toBe(13 + 4) // 13 variables and the 4 speeds
  expect(html).toContain(HONESTY_LABEL)
  expect(html).toContain("parameter uncertainty only")
  expect(html).toContain("relative cost units")
  expect(html).toContain(SWEEP_NOTE.replace("'", "&#39;"))
  for (const e of els.filter(
    (x) => x.tag === "button" || x.tag === "input" || x.tag === "select",
  ))
    expect(
      Boolean(e.attrs["aria-label"]) ||
        e.tag === "button" ||
        e.tag === "select",
      JSON.stringify(e.attrs),
    ).toBe(true)
  expect(
    els.find((e) => e.attrs["data-anim"] === "sweep-status")?.attrs.role,
  ).toBe("status")
})

test("everyStateIsAClosedUnionAndWorksF9", async () => {
  for (const s of SWEEP_STATES) {
    const els = await elementsOf(watchSweep(props({ state: s })))
    expect(
      els.find((e) => e.attrs["data-watch-sweep"] !== undefined)?.attrs[
        "data-state"
      ],
    ).toBe(s)
    expect(
      els.find((e) => e.attrs["data-anim"] === "sweep-computing")?.attrs[
        "data-state"
      ],
    ).toBe(s === "running" ? "busy" : "idle")
  }
  expectBuildError(() => watchSweep(props({ state: "paused" })), "WatchSweep")
  expectBuildError(() => watchSweep(props({ selected: "nope" })), "WatchSweep")
  expectBuildError(() => watchSweep(props({ variables: [] })), "WatchSweep")
  expectBuildError(
    () => watchSweep(props({ variables: [...vars, vars[0]] })),
    "WatchSweep",
  )
})

test("layerOffNoteF5", async () => {
  const on = await elementsOf(watchSweep(props({ layerOff: true })))
  const off = await elementsOf(watchSweep(props()))
  expect(
    on.find((e) => e.attrs["data-anim"] === "layer-off")?.attrs.hidden,
  ).toBeUndefined()
  expect(
    off.find((e) => e.attrs["data-anim"] === "layer-off")?.attrs.hidden,
  ).toBeDefined()
  expect(watchSweep(props({ layerOff: true }))).toContain(LAYER_OFF_NOTE)
})

test("aZeroWidthVariableIsListedButNotSelectableF3", async () => {
  const fixed = vars.map((v, i) => (i === 0 ? { ...v, min: 1, max: 1 } : v))
  const html = watchSweep(props({ variables: fixed }))
  expect(html).toContain("fixed in this configuration")
  const els = await elementsOf(html)
  const o = els.find(
    (e) => e.tag === "option" && e.attrs.value === (vars[0] as SweepVar).key,
  )
  expect(o?.attrs.disabled).toBeDefined()
})

test("noRecommendedBestOptimalH14", () => {
  for (const s of SWEEP_STATES)
    expect(watchSweep(props({ state: s, layerOff: true }))).not.toMatch(
      /\brecommended\b|\bbest\b|\boptimal\b/i,
    )
})

test("textInAFieldIsEscapedF8", async () => {
  const bad = vars.map((v, i) =>
    i === 0 ? { ...v, label: XSS, unit: XSS } : v,
  )
  const els = await elementsOf(watchSweep(props({ variables: bad })))
  expect(els.some((e) => e.tag === "img")).toBe(false)
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(ORGANISM_CSS.watchSweep as string)
})
