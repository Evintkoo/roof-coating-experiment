import { beforeAll, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { safeJson } from "../../src/core/json"
import type { ModelContext } from "../../src/core/pipeline/context"
import { liveSimulate } from "../../src/core/pipeline/live"
import {
  type CurvesJson,
  OBJECTIVE_COLUMNS,
  type ObjRow,
  type SensRow,
  type SpectraJson,
} from "../../src/core/pipeline/tables"
import { loadContext } from "../../src/node/context"
import {
  axisLabel,
  axisThemeKeys,
  type FigureSpec,
  figIndonesiaBars,
  figLiveSpectrum,
  figLiveTofT,
  figMorris,
  figParcoords,
  figSobol,
  figSpectrum,
  figSplom,
  figTofT,
  INDONESIA_SERIES_COLORS,
  type IndonesiaSummaryRow,
  type ThemeTokens,
  themeKeys,
  themeSeries,
} from "../../src/web/figures"
import { contrastRatio } from "../../src/web/fmt"
import { defaultLiveState } from "../../src/web/liveState"
import { repoRoot } from "../helpers"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

const obj = (n: number): ObjRow[] =>
  Array.from({ length: n }, (_, i) => ({
    candidate_id: `SP-${String(i + 1).padStart(3, "0")}`,
    r_solar_pred: 0.7 + 0.002 * i,
    t_max_pred: 40 - 0.05 * i,
    corrosion_proxy: 0.3 + 0.001 * i,
    delam_proxy: 0.2,
    cost_proxy: 0.1 + 0.005 * i,
    t_max_worst: 60,
    on_front: i % 2 === 0,
    pareto_freq: (i % 10) / 10,
    role: "",
  }))
const SHORT = {
  high_performing: "SP-001",
  balanced: "SP-002",
  low_cost: "SP-003",
}

const curves: CurvesJson = {
  time_s: [0, 600, 1200],
  n_mc: 8,
  series: [
    ...["SP-001", "SP-002"].map((id) => ({
      id,
      kind: "candidate" as const,
      scenario_id: "W3",
      nominal_only: false,
      t_c: [30, 31, 32],
      t_lo_c: [29, 30, 31],
      t_hi_c: [31, 32, 33],
    })),
    {
      id: "C0",
      kind: "control" as const,
      scenario_id: "W3",
      nominal_only: true,
      t_c: [35, 36, 37],
    },
    {
      id: "C1",
      kind: "control" as const,
      scenario_id: "W3",
      nominal_only: true,
      t_c: [33, 34, 35],
    },
    {
      id: "SP-001",
      kind: "candidate" as const,
      scenario_id: "W1",
      nominal_only: false,
      t_c: [1, 2, 3],
      t_lo_c: [0, 1, 2],
      t_hi_c: [2, 3, 4],
    },
  ],
}
const spectra: SpectraJson = {
  wl_um: [0.3, 0.4, 0.5],
  n_mc: 8,
  series: [
    {
      id: "SP-001",
      kind: "candidate",
      nominal_only: false,
      r: [0.5, 0.8, 0.9],
      r_lo: [0.4, 0.7, 0.8],
      r_hi: [0.6, 0.9, 1],
    },
    { id: "C0", kind: "control", nominal_only: true, r: [0.5, 0.5, 0.5] },
  ],
}
const g173 = {
  wl_um: Float64Array.of(0.28, 0.3, 0.4, 2.5, 2.6),
  irradiance_w_m2_um: Float64Array.of(0.1, 100, 1500, 3, 2),
}
const sens: SensRow[] = ["S1", "ST"].flatMap((index) =>
  ["a", "b"].map((variable, j) => ({
    output: "r_solar_pred",
    method: "sobol" as const,
    variable,
    index: index as "S1" | "ST",
    value: 0.2 + 0.1 * j + (index === "ST" ? 0.1 : 0),
    conf: 0.01 * (j + 1),
  })),
)
const morris: SensRow[] = ["a", "b"].flatMap((variable, j) =>
  (["mu_star", "sigma"] as const).map((index) => ({
    output: "t_max_pred",
    method: "morris" as const,
    variable,
    index,
    value: 1 + j,
    conf: 0.1,
  })),
)

const live = () => {
  const inp = defaultLiveState(ctx.ranges, ctx.weather).inputs
  return liveSimulate(inp, ctx, 4, 20261121)
}
const allFigures = (): [string, FigureSpec][] => [
  ["parcoords", figParcoords(obj(96), SHORT)],
  ["splom", figSplom(obj(96), SHORT)],
  ["tofT", figTofT(curves, "W3")],
  ["spectrum", figSpectrum(spectra, g173)],
  ["sobol", figSobol(sens, "r_solar_pred")],
  ["morris", figMorris(morris, "t_max_pred")],
  ["liveT", figLiveTofT(live())],
  ["liveSpec", figLiveSpectrum(live(), g173)],
]
type Tr = { meta?: { kind: string; id: string }; fill?: string; name?: string }
const traces = (f: FigureSpec) => f.data as Tr[]

test("parcoordsHasFiveDimensionsAndIds", () => {
  const f = figParcoords(obj(96), SHORT)
  const t = f.data[0] as {
    type: string
    ids: string[]
    dimensions: { label: string; values: number[] }[]
    line: { color: number[]; colorscale: unknown }
  }
  expect(t.type).toBe("parcoords")
  expect(t.dimensions.length).toBe(5)
  expect(t.ids.length).toBe(96)
  expect(new Set(t.ids).size).toBe(96)
  expect(t.dimensions.every((d) => d.values.length === 96)).toBe(true)
  expect(t.line.color.length).toBe(96)
  expect(JSON.stringify(t.line.colorscale)).toContain("#fde725") // Viridis end
})

test("everyLineHasBandTrace", () => {
  for (const f of [
    figTofT(curves, "W3"),
    figLiveTofT(live()),
    figSpectrum(spectra, g173),
    figLiveSpectrum(live(), g173),
  ]) {
    const t = traces(f)
    const predicted = t.filter((x) => x.meta?.kind === "predicted")
    expect(predicted.length).toBeGreaterThan(0)
    for (const p of predicted) {
      const bands = t.filter(
        (x) => x.meta?.kind === "band" && x.meta.id === p.meta?.id,
      )
      expect(bands.length).toBe(2)
      expect(bands.some((b) => b.fill === "tonexty")).toBe(true)
    }
    // anything else drawn as a line is explicitly nominal-only or a reference
    for (const x of t.filter((y) => y.meta?.kind === "nominal_only"))
      expect(x.name).toContain("nominal only")
    for (const x of t.filter((y) => y.meta?.kind === "reference"))
      expect(x.name).toContain("reference")
  }
  // scenario filter: W1 has one candidate only
  expect(
    traces(figTofT(curves, "W1")).filter((x) => x.meta?.kind === "predicted")
      .length,
  ).toBe(1)
})

test("bandIsBelowAndAboveTheLine", () => {
  const t = traces(figTofT(curves, "W3"))
  const lo = t.find((x) => x.meta?.kind === "band") as unknown as {
    y: number[]
  }
  const hi = t.filter((x) => x.meta?.kind === "band")[1] as unknown as {
    y: number[]
  }
  const line = t.find((x) => x.meta?.kind === "predicted") as unknown as {
    y: number[]
  }
  line.y.forEach((v, i) => {
    expect(lo.y[i] as number).toBeLessThanOrEqual(v)
    expect(hi.y[i] as number).toBeGreaterThanOrEqual(v)
  })
})

test("sobolErrorBarsEqualConf", () => {
  const f = figSobol(sens, "r_solar_pred")
  const [s1, st] = f.data as {
    x: string[]
    y: number[]
    error_y: { array: number[]; visible: boolean }
  }[]
  expect(s1?.error_y.array).toEqual([0.01, 0.02])
  expect(st?.error_y.array).toEqual([0.01, 0.02])
  expect(s1?.error_y.visible).toBe(true)
  expect(s1?.y[0]).toBe(0.2)
  expect(s1?.y[1]).toBeCloseTo(0.3, 12)
  expect(st?.y[1]).toBeCloseTo(0.4, 12)
  // another output's rows are not mixed in
  expect(figSobol(sens, "t_max_pred").data.length).toBe(2)
  expect((figSobol(sens, "t_max_pred").data[0] as { x: string[] }).x).toEqual(
    [],
  )
})

test("axisLabelsMarkProxy", () => {
  for (const c of [
    "corrosion_proxy",
    "delam_proxy",
    "cost_proxy",
    "wetting_proxy",
    "corrosion_risk",
    "delam_x",
    "cost",
  ])
    expect(axisLabel(c)).toContain("(PROXY)")
  expect(axisLabel("r_solar_pred")).not.toContain("PROXY")
  expect(axisLabel("t_max_pred")).not.toContain("PROXY")
  expect(axisLabel("corrosion_proxy").match(/PROXY/g)?.length).toBe(1)
  const f = figParcoords(obj(5), SHORT)
  const labels = (
    f.data[0] as { dimensions: { label: string }[] }
  ).dimensions.map((d) => d.label)
  expect(labels.filter((l) => l.includes("PROXY")).length).toBe(3)
  const sp = (
    figSplom(obj(5), SHORT).data[0] as { dimensions: { label: string }[] }
  ).dimensions.map((d) => d.label)
  expect(sp).toEqual(labels)
})

test("infeasibleRowsAbsentFromFigures", () => {
  const rows = obj(10)
  rows[3] = {
    ...(rows[3] as ObjRow),
    r_solar_pred: Number.NaN,
    t_max_pred: Number.NaN,
  }
  for (const f of [figParcoords(rows, SHORT), figSplom(rows, SHORT)]) {
    const t = f.data[0] as { ids: string[]; dimensions: { values: number[] }[] }
    expect(t.ids.length).toBe(9)
    expect(t.ids).not.toContain("SP-004")
    expect(() => safeJson(f)).not.toThrow()
  }
})

test("noNonFiniteInFigureSpecs", () => {
  for (const [name, f] of allFigures()) {
    expect(() => safeJson(f), name).not.toThrow()
  }
  // a layers-off live result has NaN bands in the tiles but its figures stay finite
  const inp = defaultLiveState(ctx.ranges, ctx.weather).inputs
  const off = liveSimulate(
    { ...inp, layers: { primer: false, midcoat: false, topcoat: false } },
    ctx,
    4,
    1,
  )
  expect(() => safeJson(figLiveTofT(off))).not.toThrow()
  expect(() => safeJson(figLiveSpectrum(off, g173))).not.toThrow()
})

test("everyFigureSetsUirevision", () => {
  for (const [name, f] of allFigures())
    expect((f.layout as { uirevision?: string }).uirevision, name).toBe(
      "spandek",
    )
})

const T: ThemeTokens = {
  paper: "#ffffff",
  plot: "#ffffff",
  font: "#111111",
  grid: "#dddddd",
  axisStroke: "#333333",
  colorway: ["#E69F00"],
}
const DARK: ThemeTokens = {
  ...T,
  paper: "#101418",
  plot: "#101418",
  font: "#eeeeee",
  grid: "#333a44",
  axisStroke: "#cccccc",
}

test("themeKeysCoverEachChartType", () => {
  const k = themeKeys(DARK)
  expect(k.relayout).toEqual({
    paper_bgcolor: "#101418",
    plot_bgcolor: "#101418",
    "font.color": "#eeeeee",
  })
  // parcoords: font colours and colourscale go through restyle, not relayout
  expect(Object.keys(k.restyleParcoords).sort()).toEqual([
    "labelfont.color",
    "line.colorscale",
    "rangefont.color",
    "tickfont.color",
  ])
  expect(k.restyleParcoords["tickfont.color"]).toBe("#eeeeee")
  expect(Object.keys(k.relayout).some((x) => x.includes("labelfont"))).toBe(
    false,
  )
  // the dark colourscale differs from the light one (low end stays visible)
  expect(JSON.stringify(k.restyleParcoords["line.colorscale"])).not.toBe(
    JSON.stringify(themeKeys(T).restyleParcoords["line.colorscale"]),
  )
  // scatter and bar: grid per axis; splom: every axis present in the rendered layout
  expect(
    axisThemeKeys(figTofT(curves, "W3").layout, T)["xaxis.gridcolor"],
  ).toBe("#dddddd")
  expect(
    axisThemeKeys(figSobol(sens, "r_solar_pred").layout, T)["yaxis.gridcolor"],
  ).toBe("#dddddd")
  const sp = axisThemeKeys(
    { xaxis: {}, xaxis2: {}, yaxis: {}, yaxis2: {}, margin: {} },
    DARK,
  )
  expect(
    Object.keys(sp)
      .filter((x) => x.endsWith("gridcolor"))
      .sort(),
  ).toEqual([
    "xaxis.gridcolor",
    "xaxis2.gridcolor",
    "yaxis.gridcolor",
    "yaxis2.gridcolor",
  ])
})

test("splomDimsUnselected", () => {
  const rows = obj(6)
  const f = figSplom(rows, SHORT, new Set(["SP-002", "SP-003"]))
  const m = (f.data[0] as { marker: { opacity: number[]; symbol: string[] } })
    .marker
  expect(m.opacity.filter((o) => o > 0.5).length).toBe(2)
  expect(m.opacity.filter((o) => o < 0.5).length).toBe(4)
  expect(new Set(m.symbol).size).toBe(4) // three roles plus the rest: not colour only
})

test("columnsMatchObjectives", () => {
  expect(OBJECTIVE_COLUMNS.length).toBe(5)
})

// ---- Indonesia bars (plan 04 Task 6) ----
const iRow = (
  site: string,
  bin: string,
  subject: string,
  state: string,
  dq: number,
): IndonesiaSummaryRow => ({
  site,
  bin,
  subject,
  state,
  t_max_c: 40,
  t_max_lo: 39,
  t_max_hi: 41,
  q_in_mean_w_m2: 1,
  q_lo: 0,
  q_hi: 2,
  dq_w_m2: dq,
  dq_lo: dq - 1.5,
  dq_hi: dq + 0.5,
})

test("figIndonesiaBarsCarryWhiskersLabelsAndTheChosenState", () => {
  const subjects = ["C1", "card_high", "card_balanced", "card_low"]
  const rows = ["jakarta", "medan"].flatMap((s, si) =>
    ["hot", "typical", "overcast", "weighted"].flatMap((b, bi) =>
      subjects.flatMap((u, ui) =>
        ["initial", "aged"].map((st) =>
          iRow(s, b, u, st, 10 * si + bi + ui + (st === "aged" ? -3 : 0)),
        ),
      ),
    ),
  )
  const fig = figIndonesiaBars(rows, "aged")
  const data = fig.data as {
    name: string
    y: number[]
    x: string[][]
    error_y: { array: number[]; arrayminus: number[]; symmetric: boolean }
  }[]
  expect(data.length).toBe(4)
  const t = data[1] as (typeof data)[number]
  expect(t.y.length).toBe(8) // 2 sites x 4 day types
  expect(t.x[0]).toEqual([
    "Jakarta",
    "Jakarta",
    "Jakarta",
    "Jakarta",
    "Medan",
    "Medan",
    "Medan",
    "Medan",
  ])
  expect(t.x[1]?.[3]).toBe("weighted")
  // aged values, with whiskers to the outer bound of the row: y + array = hi, y - arrayminus = lo
  expect(t.y[0]).toBe(0 + 1 - 3)
  t.y.forEach((y, i) => {
    expect(y + (t.error_y.array[i] as number)).toBeCloseTo(y + 0.5, 12)
    expect(y - (t.error_y.arrayminus[i] as number)).toBeCloseTo(y - 1.5, 12)
  })
  expect(t.error_y.symmetric).toBe(false)
  const lay = fig.layout as {
    xaxis: { title: { text: string } }
    yaxis: { title: { text: string } }
  }
  expect(lay.xaxis.title.text).toContain(
    "aluminium, scenario ageing: aged (scenario ageing)",
  )
  expect(lay.yaxis.title.text).toContain("PROXY")
  expect(lay.yaxis.title.text).toContain("outer bound")
  // the initial view says initial and shows the other numbers
  const ini = figIndonesiaBars(rows, "initial")
  expect((ini.layout as typeof lay).xaxis.title.text).toContain(": initial")
  expect(((ini.data as typeof data)[1] as (typeof data)[number]).y[0]).toBe(1)
  // a missing row is a gap (NaN), not a zero bar
  const gap = figIndonesiaBars(
    rows.filter((r) => !(r.site === "medan" && r.bin === "hot")),
    "initial",
  )
  expect(
    Number.isNaN(((gap.data as typeof data)[0] as (typeof data)[number]).y[4]),
  ).toBe(true)
})

// ---- S4: series colours in both themes ----

const THEME_BG = (() => {
  const css = readFileSync(
    join(import.meta.dir, "../../src/web/theme.css"),
    "utf8",
  )
  const light = /:root\s*{[^}]*?--bg:\s*(#[0-9a-fA-F]{6})/.exec(
    css,
  )?.[1] as string
  const dark =
    /:root\[data-theme="dark"\]\s*{[^}]*?--bg:\s*(#[0-9a-fA-F]{6})/.exec(
      css,
    )?.[1] as string
  return { light, dark }
})()

test("indonesiaSeriesColoursReach3To1InBothThemes", () => {
  expect(THEME_BG.light.toLowerCase()).toBe("#ffffff")
  expect(THEME_BG.dark.toLowerCase()).toBe("#12161b")
  for (const theme of ["light", "dark"] as const)
    for (const c of INDONESIA_SERIES_COLORS[theme])
      expect(contrastRatio(c, THEME_BG[theme])).toBeGreaterThanOrEqual(3)
  // the old colour is what the test must catch: black on the dark plot is far below 3:1
  expect(contrastRatio("#000000", THEME_BG.dark)).toBeLessThan(1.5)
  // the four series differ within a theme
  for (const theme of ["light", "dark"] as const)
    expect(new Set(INDONESIA_SERIES_COLORS[theme]).size).toBe(4)
})

test("themeSeriesPicksTheColourForThePlotBackground", () => {
  const rows = [
    ["jakarta", "hot"],
    ["jakarta", "weighted"],
  ].flatMap(([site, bin]) =>
    ["C1", "card_high", "card_balanced", "card_low"].map((subject) => ({
      site: site as string,
      bin: bin as string,
      subject,
      state: "initial",
      t_max_c: 40,
      t_max_lo: 39,
      t_max_hi: 41,
      q_in_mean_w_m2: 10,
      q_lo: 9,
      q_hi: 11,
      dq_w_m2: 1,
      dq_lo: 0,
      dq_hi: 2,
    })),
  )
  const fig = figIndonesiaBars(rows, "initial")
  const tok = (plot: string): ThemeTokens => ({
    paper: plot,
    plot,
    font: "#000000",
    grid: "#cccccc",
    axisStroke: "#000000",
    colorway: [],
  })
  const colours = (t: ThemeTokens) =>
    themeSeries(fig, t).data.map(
      (d) => (d as { marker: { color: string } }).marker.color,
    )
  expect(colours(tok(THEME_BG.light))).toEqual([
    ...INDONESIA_SERIES_COLORS.light,
  ])
  expect(colours(tok(THEME_BG.dark))).toEqual([...INDONESIA_SERIES_COLORS.dark])
  for (const c of colours(tok(THEME_BG.dark)))
    expect(contrastRatio(c, THEME_BG.dark)).toBeGreaterThanOrEqual(3)
  // traces without a palette are left alone
  const plain = { data: [{ marker: { color: "#123456" } }], layout: {} }
  expect(themeSeries(plain, tok(THEME_BG.dark)).data[0]).toEqual(plain.data[0])
})
