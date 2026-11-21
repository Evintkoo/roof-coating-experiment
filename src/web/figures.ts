import type { Spectrum } from "../core/literature"
import { makeWlGrid } from "../core/pipeline/context"
import type { LiveResult } from "../core/pipeline/live"
import {
  type CurvesJson,
  OBJECTIVE_COLUMNS,
  type ObjRow,
  type SensRow,
  type SpectraJson,
} from "../core/pipeline/tables"
import { luminance } from "./fmt"

export type ThemeTokens = {
  paper: string
  plot: string
  font: string
  grid: string
  axisStroke: string
  colorway: readonly string[]
}
export type FigureSpec = { data: object[]; layout: object; config?: object }

/** D6: Okabe-Ito for categories. */
export const OKABE_ITO = [
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7",
  "#000000",
] as const
/** Viridis stops for pareto_freq; the dark variant starts lighter so the low end stays visible on a dark paper. */
const VIRIDIS_LIGHT: [number, string][] = [
  [0, "#440154"],
  [0.25, "#3b528b"],
  [0.5, "#21918c"],
  [0.75, "#5ec962"],
  [1, "#fde725"],
]
const VIRIDIS_DARK: [number, string][] = [
  [0, "#8e7cf0"],
  [0.25, "#5a8bd8"],
  [0.5, "#21b8a8"],
  [0.75, "#7fe07a"],
  [1, "#fde725"],
]
export const UIREVISION = "spandek"
const CONFIG = { responsive: true, displaylogo: false }

const HUMAN: Record<string, string> = {
  r_solar_pred: "Solar reflectance r_solar",
  t_max_pred: "Peak surface temperature (°C)",
  corrosion_proxy: "Corrosion index",
  corrosion_risk: "Corrosion index",
  wetting_proxy: "Water-repellence index",
  delam_proxy: "Delamination index",
  cost_proxy: "Cost index",
  q_in_mean_w_m2: "Mean heat flux into the building (W/m²)",
  gel_time_rel: "Relative gel time",
  wetting_theta_pred: "Contact angle (deg)",
  pareto_freq: "Pareto frequency",
  t_max_worst: "Peak temperature, hottest scenario (°C)",
}

/** Readable axis or column label; every PROXY index (`*_proxy`, corrosion_risk, delam, cost) ends in "(PROXY)". */
export function axisLabel(column: string): string {
  const base = HUMAN[column] ?? column
  const proxy = /(_proxy$|^corrosion_risk$|delam|^cost)/.test(column)
  return proxy && !base.includes("PROXY") ? `${base} (PROXY)` : base
}

const finite = (row: ObjRow): boolean =>
  OBJECTIVE_COLUMNS.every((c) => Number.isFinite(row[c])) &&
  Number.isFinite(row.pareto_freq)

/** F3: a candidate with a non-finite objective is not drawn. */
const drawable = (obj: readonly ObjRow[]): ObjRow[] => obj.filter(finite)

const baseLayout = (extra: object = {}): object => ({
  uirevision: UIREVISION,
  margin: { l: 56, r: 16, t: 24, b: 48 },
  colorway: [...OKABE_ITO],
  ...extra,
})

const roleOf = (
  id: string,
  shortlist: Record<string, string>,
): string | undefined =>
  Object.entries(shortlist).find(([, v]) => v === id)?.[0]

/** Parallel coordinates of the five objectives; line colour = pareto_freq (Viridis); `ids` carries the candidate ids. */
export function figParcoords(
  obj: readonly ObjRow[],
  _shortlist: Record<string, string>,
): FigureSpec {
  const rows = drawable(obj)
  const dimensions = OBJECTIVE_COLUMNS.map((c) => {
    const v = rows.map((r) => r[c])
    const lo = v.length ? Math.min(...v) : 0
    const hi = v.length ? Math.max(...v) : 1
    return {
      label: axisLabel(c),
      values: v,
      range: [lo, hi > lo ? hi : lo + 1],
    }
  })
  return {
    data: [
      {
        type: "parcoords",
        ids: rows.map((r) => r.candidate_id),
        line: {
          color: rows.map((r) => r.pareto_freq),
          colorscale: VIRIDIS_LIGHT,
          cmin: 0,
          cmax: 1,
          showscale: true,
          colorbar: { title: { text: "Pareto frequency" }, thickness: 12 },
        },
        dimensions,
      },
    ],
    layout: baseLayout({ margin: { l: 70, r: 70, t: 56, b: 24 } }),
    config: CONFIG,
  }
}

const SYMBOL: Record<string, string> = {
  high_performing: "diamond",
  balanced: "square",
  low_cost: "triangle-up",
}

/** Scatter matrix of the five objectives; shortlisted candidates get distinct symbols (not colour only); `selected` dims the rest. */
export function figSplom(
  obj: readonly ObjRow[],
  shortlist: Record<string, string>,
  selected?: ReadonlySet<string>,
): FigureSpec {
  const rows = drawable(obj)
  const isSel = (id: string) => selected === undefined || selected.has(id)
  return {
    data: [
      {
        type: "splom",
        ids: rows.map((r) => r.candidate_id),
        text: rows.map((r) => {
          const role = roleOf(r.candidate_id, shortlist)
          return role ? `${r.candidate_id} (${role})` : r.candidate_id
        }),
        hovertemplate: "%{text}<extra></extra>",
        dimensions: OBJECTIVE_COLUMNS.map((c) => ({
          label: axisLabel(c),
          values: rows.map((r) => r[c]),
        })),
        marker: {
          color: rows.map((r) => r.pareto_freq),
          colorscale: VIRIDIS_LIGHT,
          cmin: 0,
          cmax: 1,
          size: rows.map((r) => (roleOf(r.candidate_id, shortlist) ? 9 : 5)),
          symbol: rows.map(
            (r) => SYMBOL[roleOf(r.candidate_id, shortlist) ?? ""] ?? "circle",
          ),
          opacity: rows.map((r) => (isSel(r.candidate_id) ? 0.95 : 0.12)),
          line: { width: 0.5, color: "#444444" },
        },
        showupperhalf: false,
        diagonal: { visible: false },
      },
    ],
    layout: baseLayout({
      dragmode: "select",
      margin: { l: 90, r: 16, t: 16, b: 70 },
    }),
    config: CONFIG,
  }
}

type Kind = "predicted" | "nominal_only" | "reference" | "band"
const meta = (kind: Kind, id: string) => ({ kind, id })

/** One predicted line with its p5-p95 band: lower bound (invisible), upper bound filled "tonexty", then the line. */
function lineWithBand(
  id: string,
  name: string,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  lo: ArrayLike<number>,
  hi: ArrayLike<number>,
  color: string,
  extra: object = {},
): object[] {
  const X = Array.from(x)
  return [
    {
      type: "scatter",
      mode: "lines",
      x: X,
      y: Array.from(lo),
      line: { width: 0, color },
      hoverinfo: "skip",
      showlegend: false,
      legendgroup: id,
      meta: meta("band", id),
      ...extra,
    },
    {
      type: "scatter",
      mode: "lines",
      x: X,
      y: Array.from(hi),
      line: { width: 0, color },
      fill: "tonexty",
      fillcolor: `${color}33`,
      hoverinfo: "skip",
      showlegend: false,
      legendgroup: id,
      meta: meta("band", id),
      ...extra,
    },
    {
      type: "scatter",
      mode: "lines",
      x: X,
      y: Array.from(y),
      name,
      line: { width: 2, color },
      legendgroup: id,
      meta: meta("predicted", id),
      ...extra,
    },
  ]
}

function nominalLine(
  id: string,
  name: string,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  color: string,
  dash: string,
  extra: object = {},
): object {
  return {
    type: "scatter",
    mode: "lines",
    x: Array.from(x),
    y: Array.from(y),
    name: `${name} (nominal only, no interval)`,
    line: { width: 1.5, color, dash },
    legendgroup: id,
    meta: meta("nominal_only", id),
    ...extra,
  }
}

const hours = (time_s: ArrayLike<number>): number[] =>
  Array.from(time_s, (t) => t / 3600)
const colorOf = (i: number): string =>
  OKABE_ITO[i % (OKABE_ITO.length - 1)] as string // the last colour (black) is for controls
const CONTROL_COLOR = "#000000"
const DASHES = ["dash", "dot", "dashdot", "longdash"]

/** Day-2 surface temperature (°C) of one scenario: predicted candidates with p5-p95 bands, controls as nominal-only lines. */
export function figTofT(curves: CurvesJson, scenarioId: string): FigureSpec {
  const x = hours(curves.time_s)
  const data: object[] = []
  let ci = 0
  let ki = 0
  for (const s of curves.series.filter((q) => q.scenario_id === scenarioId)) {
    if (s.kind === "candidate" && s.t_lo_c && s.t_hi_c) {
      data.push(
        ...lineWithBand(
          s.id,
          s.id,
          x,
          s.t_c,
          s.t_lo_c,
          s.t_hi_c,
          colorOf(ci++),
        ),
      )
    } else
      data.push(
        nominalLine(
          s.id,
          s.id,
          x,
          s.t_c,
          CONTROL_COLOR,
          DASHES[ki++ % DASHES.length] as string,
        ),
      )
  }
  return {
    data,
    layout: baseLayout({
      xaxis: { title: { text: "Hour of day 2" }, dtick: 4 },
      yaxis: { title: { text: "Surface temperature (°C)" } },
      legend: { orientation: "h", y: -0.25 },
    }),
    config: CONFIG,
  }
}

/** The ASTM G173 reference on a secondary axis (a reference spectrum, not a prediction), limited to 0.3-2.5 µm. */
function g173Trace(g173: Spectrum): object {
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i < g173.wl_um.length; i++) {
    const w = g173.wl_um[i] as number
    if (w >= 0.3 && w <= 2.5) {
      x.push(w * 1000)
      y.push(g173.irradiance_w_m2_um[i] as number)
    }
  }
  return {
    type: "scatter",
    mode: "lines",
    x,
    y,
    yaxis: "y2",
    name: "AM1.5G irradiance (reference, not a prediction)",
    line: { width: 1, color: "#888888" },
    fill: "tozeroy",
    fillcolor: "#88888822",
    meta: meta("reference", "G173"),
  }
}

const spectrumLayout = (): object =>
  baseLayout({
    xaxis: { title: { text: "Wavelength (nm)" } },
    yaxis: { title: { text: "Reflectance R" }, range: [0, 1.02] },
    yaxis2: {
      title: { text: "Irradiance (W m⁻² µm⁻¹)" },
      overlaying: "y",
      side: "right",
      showgrid: false,
    },
    legend: { orientation: "h", y: -0.25 },
  })

/** Reflectance spectra: predicted candidates with p5-p95 bands, controls nominal only, G173 as reference. */
export function figSpectrum(spec: SpectraJson, g173: Spectrum): FigureSpec {
  const x = spec.wl_um.map((w) => w * 1000)
  const data: object[] = [g173Trace(g173)]
  let ci = 0
  let ki = 0
  for (const s of spec.series) {
    if (s.kind === "candidate" && s.r_lo && s.r_hi)
      data.push(
        ...lineWithBand(s.id, s.id, x, s.r, s.r_lo, s.r_hi, colorOf(ci++)),
      )
    else
      data.push(
        nominalLine(
          s.id,
          s.id,
          x,
          s.r,
          CONTROL_COLOR,
          DASHES[ki++ % DASHES.length] as string,
        ),
      )
  }
  return { data, layout: spectrumLayout(), config: CONFIG }
}

const sensRows = (
  sens: readonly SensRow[],
  output: string,
  method: SensRow["method"],
): SensRow[] => sens.filter((s) => s.output === output && s.method === method)

/** Sobol S1 and ST bars per variable; the error bars are the stored confidence half-widths. */
export function figSobol(sens: readonly SensRow[], output: string): FigureSpec {
  const rows = sensRows(sens, output, "sobol")
  const vars = [...new Set(rows.map((r) => r.variable))]
  const bar = (index: "S1" | "ST", color: string, name: string) => {
    const by = new Map(
      rows.filter((r) => r.index === index).map((r) => [r.variable, r]),
    )
    return {
      type: "bar",
      name,
      x: vars,
      y: vars.map((v) => by.get(v)?.value ?? 0),
      error_y: {
        type: "data",
        array: vars.map((v) => by.get(v)?.conf ?? 0),
        visible: true,
      },
      marker: { color },
    }
  }
  return {
    data: [
      bar("S1", OKABE_ITO[1], "S1 (first order)"),
      bar("ST", OKABE_ITO[5], "ST (total)"),
    ],
    layout: baseLayout({
      barmode: "group",
      xaxis: { title: { text: "Input variable" }, tickangle: -35 },
      yaxis: { title: { text: `Sobol index of ${axisLabel(output)}` } },
      margin: { l: 56, r: 16, t: 24, b: 110 },
    }),
    config: CONFIG,
  }
}

/** Morris screening: mu* against sigma per variable (large sigma = interaction or non-linearity). */
export function figMorris(
  sens: readonly SensRow[],
  output: string,
): FigureSpec {
  const rows = sensRows(sens, output, "morris")
  const vars = [...new Set(rows.map((r) => r.variable))]
  const get = (v: string, index: "mu_star" | "sigma") =>
    rows.find((r) => r.variable === v && r.index === index)
  return {
    data: [
      {
        type: "scatter",
        mode: "markers+text",
        x: vars.map((v) => get(v, "mu_star")?.value ?? 0),
        y: vars.map((v) => get(v, "sigma")?.value ?? 0),
        text: vars,
        textposition: "top center",
        error_x: {
          type: "data",
          array: vars.map((v) => get(v, "mu_star")?.conf ?? 0),
          visible: true,
        },
        marker: { color: OKABE_ITO[4], size: 9 },
        name: "Morris",
      },
    ],
    layout: baseLayout({
      xaxis: {
        title: { text: `mu* (mean absolute effect) on ${axisLabel(output)}` },
      },
      yaxis: { title: { text: "sigma (spread of effect)" } },
    }),
    config: CONFIG,
  }
}

const K = 273.15

/** Live day-2 temperature: nominal with p5-p95 band over the live draws; C0 and C1 as nominal-only reference lines. */
export function figLiveTofT(r: LiveResult): FigureSpec {
  const x = Array.from(
    { length: r.series.t_k.length },
    (_, i) => (i * 600) / 3600,
  )
  const c = (a: ArrayLike<number>) => Array.from(a, (v) => v - K)
  const data: object[] = [
    ...lineWithBand(
      "live",
      "This recipe",
      x,
      c(r.series.t_k),
      c(r.series.lo),
      c(r.series.hi),
      OKABE_ITO[1],
    ),
  ]
  const ctl = r.controls
  data.push(
    nominalLine(
      "C0",
      "C0 bare substrate",
      x,
      c(ctl.C0.t_surface_k as Float64Array),
      CONTROL_COLOR,
      "dash",
    ),
    nominalLine(
      "C1",
      "C1 commercial datasheet",
      x,
      c(ctl.C1.t_surface_k as Float64Array),
      CONTROL_COLOR,
      "dot",
    ),
  )
  return {
    data,
    layout: baseLayout({
      xaxis: { title: { text: "Hour of day 2" }, dtick: 4 },
      yaxis: {
        title: {
          text: `Surface temperature (°C), band = p5-p95 of ${r.nDraws} draws`,
        },
      },
      legend: { orientation: "h", y: -0.3 },
    }),
    config: CONFIG,
  }
}

/** Live reflectance spectrum with the p5-p95 band and the G173 reference. */
export function figLiveSpectrum(r: LiveResult, g173: Spectrum): FigureSpec {
  const x = Array.from(makeWlGrid(), (w) => w * 1000)
  return {
    data: [
      g173Trace(g173),
      ...lineWithBand(
        "live",
        "This recipe",
        x,
        r.spectrum.nominal,
        r.spectrum.lo,
        r.spectrum.hi,
        OKABE_ITO[1],
      ),
    ],
    layout: spectrumLayout(),
    config: CONFIG,
  }
}

// ---- Indonesia section (plan 04) ----

/** One row of indonesia_summary.csv (numbers as read from the file). */
export type IndonesiaSummaryRow = {
  site: string
  bin: string
  subject: string
  state: string
  t_max_c: number
  t_max_lo: number
  t_max_hi: number
  q_in_mean_w_m2: number
  q_lo: number
  q_hi: number
  dq_w_m2: number
  dq_lo: number
  dq_hi: number
}

/** What the page script receives under window.__SPANDEK__.ext.indonesia. */
export type IndonesiaData = {
  n_mc: number
  loss_lo: number
  loss_hi: number
  summary: IndonesiaSummaryRow[]
}

export const INDONESIA_SUBJECT_LABEL: Record<string, string> = {
  C0: "C0 bare aluminium",
  C1: "C1 commercial datasheet",
  card_high: "High-performing card",
  card_balanced: "Balanced card",
  card_low: "Low-cost card",
}
export const INDONESIA_BIN_LABEL: Record<string, string> = {
  hot: "hot day",
  typical: "typical day",
  overcast: "overcast day",
  weighted: "weighted",
}
export const INDONESIA_STATE_LABEL: Record<string, string> = {
  initial: "initial",
  aged: "aged (scenario ageing)",
}
export const siteLabel = (id: string): string =>
  id.charAt(0).toUpperCase() + id.slice(1)

/**
 * Heat-flux benefit against bare aluminium (C0 minus the subject, mean flux into the building) per site and day type,
 * one bar per subject with p5-p95 whiskers, for one state. The weighted view is the last group of each site.
 */
export function figIndonesiaBars(
  rows: readonly IndonesiaSummaryRow[],
  state: "initial" | "aged",
): FigureSpec {
  const subjects = ["C1", "card_high", "card_balanced", "card_low"]
  const colors = [OKABE_ITO[7], OKABE_ITO[4], OKABE_ITO[2], OKABE_ITO[5]]
  const sites = [...new Set(rows.map((r) => r.site))]
  const bins = ["hot", "typical", "overcast", "weighted"]
  const cells = sites.flatMap((s) => bins.map((b) => [s, b] as const))
  const data = subjects.map((subject, i) => {
    const pick = cells.map(([s, b]) =>
      rows.find(
        (r) =>
          r.site === s &&
          r.bin === b &&
          r.subject === subject &&
          r.state === state,
      ),
    )
    const y = pick.map((r) => r?.dq_w_m2 ?? Number.NaN)
    return {
      type: "bar",
      name: INDONESIA_SUBJECT_LABEL[subject],
      x: [
        cells.map(([s]) => siteLabel(s)),
        cells.map(([, b]) => INDONESIA_BIN_LABEL[b] ?? b),
      ],
      y,
      error_y: {
        type: "data",
        symmetric: false,
        array: pick.map((r, k) => (r ? r.dq_hi - (y[k] as number) : 0)),
        arrayminus: pick.map((r, k) => (r ? (y[k] as number) - r.dq_lo : 0)),
        thickness: 1.2,
      },
      marker: { color: colors[i] },
      meta: { kind: "predicted", id: subject },
    }
  })
  return {
    data,
    layout: baseLayout({
      barmode: "group",
      margin: { l: 64, r: 16, t: 24, b: 96 },
      xaxis: {
        title: {
          text: `Site and day type; aluminium, scenario ageing: ${INDONESIA_STATE_LABEL[state]}`,
        },
      },
      yaxis: {
        title: {
          text: "Heat-flux benefit against bare aluminium (W/m², PROXY), p5-p95 whiskers",
        },
      },
      legend: { orientation: "h", y: -0.45 },
    }),
    config: CONFIG,
  }
}

const isDark = (t: ThemeTokens): boolean => luminance(t.paper) < 0.4

/**
 * D7 (verified, spike Q3): `relayout` for every chart type, `restyleParcoords` for the parcoords trace only
 * (applied as Plotly.restyle(gd, restyleParcoords, [0])); the black axis strokes of parcoords need the CSS override in theme.css.
 */
export function themeKeys(tokens: ThemeTokens): {
  relayout: Record<string, string>
  restyleParcoords: Record<string, unknown>
} {
  return {
    relayout: {
      paper_bgcolor: tokens.paper,
      plot_bgcolor: tokens.plot,
      "font.color": tokens.font,
    },
    restyleParcoords: {
      "labelfont.color": tokens.font,
      "tickfont.color": tokens.font,
      "rangefont.color": tokens.font,
      "line.colorscale": [isDark(tokens) ? VIRIDIS_DARK : VIRIDIS_LIGHT],
    },
  }
}

/** Grid and line colours for every axis present in a layout (scatter, bar, splom); merge into `themeKeys(...).relayout`. */
export function axisThemeKeys(
  layout: object,
  tokens: ThemeTokens,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(layout))
    if (/^(x|y)axis\d*$/.test(k)) {
      out[`${k}.gridcolor`] = tokens.grid
      out[`${k}.zerolinecolor`] = tokens.grid
      out[`${k}.linecolor`] = tokens.axisStroke
    }
  return out
}
