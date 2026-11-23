import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  BAND_LEGEND,
  LAYER_OFF_TEXT,
  NO_C1_TEXT,
  SWEEP_OUTCOMES,
  sweepChart,
  sweepChartGeometry,
  sweepPath,
} from "../../../../src/web/design/molecules/sweepChart"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const xs = Array.from({ length: 41 }, (_, i) => 100 + 5 * i)
const curve = (a: number) => xs.map((x) => a + x / 100)
const flat = (a: number) => xs.map(() => a)
const props = (o: Record<string, unknown> = {}) => ({
  outcome: "t_max_c" as const,
  xs,
  nominal: curve(30),
  lo: curve(29),
  hi: curve(31),
  c0: flat(44),
  c1: flat(32),
  controlKind: "flat" as const,
  cursor: 150,
  unit: "µm",
  xLabel: "Midcoat DFT",
  ...o,
})

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R36 SweepChart", ["t_max_c", "cost_proxy", "flat", "curve"])
})

test("everySeriesHasADataSourceAndTheBandIsLabelledH10H14", async () => {
  const html = sweepChart(props())
  const els = await elementsOf(html)
  expect(els.map((e) => e.attrs["data-source"]).filter(Boolean)).toEqual([
    "sweep:t_max_c:band",
    "sweep:t_max_c:c0",
    "sweep:t_max_c:c1",
    "sweep:t_max_c:nominal",
    "clock:sweep",
    "sweep:t_max_c:nominal@x",
  ])
  expect(html).toContain(BAND_LEGEND)
  expect(html).not.toMatch(/recommended|\bbest\b|optimal/i)
})

test("controlKindMatchesPropH8", async () => {
  const flatEls = await elementsOf(sweepChart(props()))
  expect(
    flatEls
      .filter((e) => e.attrs["data-control-kind"])
      .map((e) => e.attrs["data-control-kind"]),
  ).toEqual(["flat", "flat"])
  const cur = await elementsOf(
    sweepChart(props({ controlKind: "curve", c0: curve(40), c1: curve(31) })),
  )
  expect(
    cur
      .filter((e) => e.attrs["data-control-kind"])
      .map((e) => e.attrs["data-control-kind"]),
  ).toEqual(["curve", "curve"])
  // a flat claim about varying data is refused
  expectBuildError(
    () => sweepChart(props({ controlKind: "flat", c0: curve(40) })),
    "SweepChart",
  )
})

test("noC1LineForNaNH9", async () => {
  for (const c1 of [null, flat(Number.NaN)]) {
    const html = sweepChart(props({ outcome: "corrosion_risk", c1 }))
    const els = await elementsOf(html)
    expect(els.some((e) => e.attrs["data-source"]?.endsWith(":c1"))).toBe(false)
    expect(html).toContain(NO_C1_TEXT)
    expect(html).not.toContain("NaN")
    expect(html).not.toContain("undefined")
  }
})

test("proxyBadgeOnTheThreeProxiesAndCostHasNoBand", async () => {
  for (const o of SWEEP_OUTCOMES) {
    const html = sweepChart(
      props({
        outcome: o,
        lo: o === "cost_proxy" ? null : curve(29),
        hi: o === "cost_proxy" ? null : curve(31),
      }),
    )
    const proxy = ["corrosion_risk", "delam_proxy", "cost_proxy"].includes(o)
    expect(html.includes("data-proxy-badge")).toBe(proxy)
  }
  const cost = sweepChart(props({ outcome: "cost_proxy", lo: null, hi: null }))
  expect(cost).toContain("no band")
  expect(cost).toContain("relative cost units")
  expect(cost).not.toContain(BAND_LEGEND)
})

test("gapsLiftThePenAndAnAllNaNCurveSaysWhy", () => {
  const g = sweepChartGeometry(xs, [curve(30)])
  const v = curve(30)
  v[10] = Number.NaN
  const d = sweepPath(xs, v, g)
  expect(d.split("M").length - 1).toBe(2)
  const off = sweepChart(
    props({
      nominal: flat(Number.NaN),
      lo: flat(Number.NaN),
      hi: flat(Number.NaN),
    }),
  )
  expect(off).toContain(LAYER_OFF_TEXT)
  expect(off).not.toContain("NaN")
})

test("closedUnionsAndBadDataAreBuildErrorsF9", () => {
  expectBuildError(() => sweepChart(props({ outcome: "cost" })), "SweepChart")
  expectBuildError(
    () => sweepChart(props({ controlKind: "line" })),
    "SweepChart",
  )
  expectBuildError(() => sweepChart(props({ nominal: [1, 2] })), "SweepChart")
  expectBuildError(
    () => sweepChart(props({ xs: [...xs].reverse() })),
    "SweepChart",
  )
  expectBuildError(
    () => sweepChart(props({ cursor: Number.NaN })),
    "SweepChart",
  )
  expectBuildError(() => sweepChart(props({ lo: null })), "SweepChart")
})

test("labelsAreEscapedF8", async () => {
  const els = await elementsOf(sweepChart(props({ xLabel: XSS, unit: XSS })))
  expect(els.some((e) => e.tag === "img")).toBe(false)
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(MOLECULE_CSS.sweepChart)
})
