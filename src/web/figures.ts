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
import { ROLE_LABELS } from "../core/report/outline"
import {
  colorScale,
  LIGHT_PLOT,
  type Slot,
  slotColor,
  withAlpha,
} from "./design/plotTheme"

/** The theme fields a figure needs; `PlotTheme` (design/plotTheme.ts) carries the full palette on top of these. */
export type ThemeTokens = {
  paper: string
  plot: string
  font: string
  grid: string
  axisStroke: string
  colorway: readonly string[]
  /** Sequential scale (seven steps) for pareto frequency; the light scale is used when absent. */
  seq?: readonly string[]
}
export type FigureSpec = { data: object[]; layout: object; config?: object }

/** Colours of every trace come from slots (`meta.slot`), resolved against the theme shown (applyPlotTheme). */
const L = LIGHT_PLOT
const slotHex = (s: Slot): string => slotColor(L, s)
/** The three recipes of the shortlist keep one colour on every figure: the recommended one is the brand orange, the others categorical. */
const ROLE_SLOT: Record<string, Slot> = {
  high_performing: "recommended",
  balanced: "series-3",
  low_cost: "series-1",
}
const SEQ_LIGHT = colorScale(L.seq)
export const UIREVISION = "spandek"
const CONFIG = { responsive: true, displaylogo: false, displayModeBar: false }

const HUMAN: Record<string, string> = {
  r_solar_pred: "Solar reflectance (0 to 1)",
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
  r_solar: "Solar reflectance (0 to 1)",
  t_max_c: "Peak surface temperature (°C)",
}

const INPUT_LABEL: Record<string, string> = {
  primer_gptes_molfrac: "Primer GPTES mole fraction",
  primer_dft_um: "Primer thickness",
  midcoat_pvc: "Midcoat PVC",
  midcoat_tio2_fraction: "Midcoat TiO2 share",
  midcoat_dft_um: "Midcoat thickness",
  topcoat_mtes_molfrac: "Topcoat MTES mole fraction",
  topcoat_dft_um: "Topcoat thickness",
  sol_gel_ph: "Sol-gel pH",
  irradiance_w_m2: "Peak irradiance",
  t_air_c: "Air temperature",
  wind_m_s: "Wind speed",
}

/** A model input in words (the sensitivity tables carry the code names). */
export const inputLabel = (id: string): string => INPUT_LABEL[id] ?? id

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
  colorway: [...L.colorway],
  ...extra,
})

const roleOf = (
  id: string,
  shortlist: Record<string, string>,
): string | undefined =>
  Object.entries(shortlist).find(([, v]) => v === id)?.[0]

/** Parallel coordinates of the five objectives; line colour = pareto_freq (sequential scale); `ids` carries the candidate ids. */
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
          colorscale: SEQ_LIGHT,
          cmin: 0,
          cmax: 1,
          showscale: true,
          colorbar: {
            title: { text: "Share of draws on the Pareto front" },
            thickness: 12,
          },
        },
        dimensions,
        meta: { kind: "predicted", id: "parcoords", scale: "seq" },
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
          colorscale: SEQ_LIGHT,
          cmin: 0,
          cmax: 1,
          size: rows.map((r) => (roleOf(r.candidate_id, shortlist) ? 10 : 5)),
          symbol: rows.map(
            (r) => SYMBOL[roleOf(r.candidate_id, shortlist) ?? ""] ?? "circle",
          ),
          opacity: rows.map((r) => (isSel(r.candidate_id) ? 0.95 : 0.12)),
          line: { width: 0.5, color: slotHex("baseline") },
        },
        meta: {
          kind: "predicted",
          id: "splom",
          scale: "seq",
          edge: "baseline",
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
const meta = (kind: Kind, id: string, slot?: Slot) => ({ kind, id, slot })

/** One predicted line with its p5-p95 band: lower bound (invisible), upper bound filled "tonexty", then the line. */
function lineWithBand(
  id: string,
  name: string,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  lo: ArrayLike<number>,
  hi: ArrayLike<number>,
  slot: Slot,
  extra: object = {},
): object[] {
  const X = Array.from(x)
  const color = slotHex(slot)
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
      meta: meta("band", id, slot),
      ...extra,
    },
    {
      type: "scatter",
      mode: "lines",
      x: X,
      y: Array.from(hi),
      line: { width: 0, color },
      fill: "tonexty",
      fillcolor: withAlpha(color, 0.2),
      hoverinfo: "skip",
      showlegend: false,
      legendgroup: id,
      meta: meta("band", id, slot),
      ...extra,
    },
    {
      type: "scatter",
      mode: "lines",
      x: X,
      y: Array.from(y),
      name,
      showlegend: false,
      line: { width: 2.5, color },
      legendgroup: id,
      meta: meta("predicted", id, slot),
      ...extra,
    },
  ]
}

function nominalLine(
  id: string,
  name: string,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  slot: Slot,
  dash: string,
  extra: object = {},
): object {
  return {
    type: "scatter",
    mode: "lines",
    x: Array.from(x),
    y: Array.from(y),
    name: `${name} (nominal only, no interval)`,
    showlegend: false,
    line: { width: 1.5, color: slotHex(slot), dash },
    legendgroup: id,
    meta: meta("nominal_only", id, slot),
    ...extra,
  }
}

/** Moves labels apart (top to bottom order kept) until neighbours are at least `gap` apart; the values stay inside [lo, hi]. */
export function spreadLabels(
  ys: readonly number[],
  gap: number,
  lo: number,
  hi: number,
): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  const out = order.map((o) => o.y)
  for (let k = 1; k < out.length; k++)
    out[k] = Math.max(out[k] as number, (out[k - 1] as number) + gap)
  const over = (out[out.length - 1] as number) - hi
  if (over > 0)
    for (let k = 0; k < out.length; k++) out[k] = (out[k] as number) - over
  if ((out[0] as number) < lo) {
    const up = lo - (out[0] as number)
    for (let k = 0; k < out.length; k++) out[k] = (out[k] as number) + up
  }
  const res: number[] = new Array(ys.length)
  order.forEach((o, k) => {
    res[o.i] = out[k] as number
  })
  return res
}

export type EndLabel = {
  text: string
  slot: Slot
  /** Where the line ends. */
  x: number
  y: number
  yref?: "y" | "y2"
}

/** Breaks a direct label into lines of at most `max` characters at spaces (Plotly <br>), so a long name never runs off the plot. */
export function wrapLabel(text: string, max = 20): string {
  const lines: string[] = []
  let cur = ""
  for (const w of text.split(" ")) {
    if (cur !== "" && cur.length + 1 + w.length > max) {
      lines.push(cur)
      cur = w
    } else cur = cur === "" ? w : `${cur} ${w}`
  }
  if (cur !== "") lines.push(cur)
  return lines.join("<br>")
}

/** Direct labels at the right end of the lines (no legend for three series or fewer); labels of the same axis are kept apart. */
export function endLabels(
  labels: readonly EndLabel[],
  yRange: [number, number],
): object[] {
  const out: object[] = []
  for (const yref of ["y", "y2"] as const) {
    const sel = labels.filter((l) => (l.yref ?? "y") === yref)
    if (sel.length === 0) continue
    const span = yRange[1] - yRange[0] || 1
    const rows = Math.max(
      ...sel.map((l) => wrapLabel(l.text).split("<br>").length),
    )
    const ys = spreadLabels(
      sel.map((l) => l.y),
      span * 0.085 * rows,
      yRange[0],
      yRange[1],
    )
    sel.forEach((l, i) => {
      out.push({
        x: l.x,
        y: ys[i],
        xref: "x",
        yref,
        text: wrapLabel(l.text),
        showarrow: false,
        xanchor: "left",
        xshift: 8,
        align: "left",
        name: l.slot,
        font: { size: 12, color: slotHex(l.slot) },
      })
    })
  }
  return out
}

export const extent = (
  arrs: readonly (readonly number[])[],
): [number, number] => {
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const a of arrs)
    for (const v of a)
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
      }
  return lo <= hi ? [lo, hi] : [0, 1]
}

const hours = (time_s: ArrayLike<number>): number[] =>
  Array.from(time_s, (t) => t / 3600)
const DASHES = ["dash", "dot", "dashdot", "longdash"]
const CONTROL_LABEL: Record<string, string> = {
  C0: "Bare aluminium (nominal only)",
  C1: "Commercial datasheet (nominal only)",
}
const RIGHT = 150

export type CurveOpts = {
  /** role -> candidate id: the recipes keep their role colour and name. */
  shortlist?: Record<string, string>
  /** Draw only these series ids (default: all of the scenario). */
  only?: readonly string[]
}

function candidateSlot(
  id: string,
  shortlist: Record<string, string> | undefined,
  nth: number,
): Slot {
  const role = shortlist ? roleOf(id, shortlist) : undefined
  if (role !== undefined) return ROLE_SLOT[role] ?? "series-1"
  return `series-${(nth % 3) + 1}` as Slot
}
function candidateLabel(
  id: string,
  shortlist: Record<string, string> | undefined,
): string {
  const role = shortlist ? roleOf(id, shortlist) : undefined
  return role !== undefined
    ? `${id} ${ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}`
    : id
}

/** Day-2 surface temperature (°C) of one scenario: predicted candidates with p5-p95 bands, controls as nominal-only lines, direct labels. */
export function figTofT(
  curves: CurvesJson,
  scenarioId: string,
  opts: CurveOpts = {},
): FigureSpec {
  const x = hours(curves.time_s)
  const data: object[] = []
  const labels: EndLabel[] = []
  const ys: number[][] = []
  let ci = 0
  let ki = 0
  const last = (a: ArrayLike<number>): number => a[a.length - 1] as number
  for (const s of curves.series.filter(
    (q) =>
      q.scenario_id === scenarioId &&
      (opts.only === undefined || opts.only.includes(q.id)),
  )) {
    if (s.kind === "candidate" && s.t_lo_c && s.t_hi_c) {
      const slot = candidateSlot(s.id, opts.shortlist, ci++)
      data.push(...lineWithBand(s.id, s.id, x, s.t_c, s.t_lo_c, s.t_hi_c, slot))
      ys.push(s.t_c, s.t_lo_c, s.t_hi_c)
      labels.push({
        text: candidateLabel(s.id, opts.shortlist),
        slot,
        x: last(x),
        y: last(s.t_c),
      })
    } else {
      data.push(
        nominalLine(
          s.id,
          s.id,
          x,
          s.t_c,
          "baseline",
          DASHES[ki++ % DASHES.length] as string,
        ),
      )
      ys.push(s.t_c)
      labels.push({
        text: CONTROL_LABEL[s.id] ?? `${s.id} (nominal only)`,
        slot: "baseline",
        x: last(x),
        y: last(s.t_c),
      })
    }
  }
  const range = extent(ys)
  return {
    data,
    layout: baseLayout({
      margin: { l: 64, r: RIGHT, t: 16, b: 48 },
      xaxis: { title: { text: "Hour of day 2" }, dtick: 4, range: [0, 24] },
      yaxis: { title: { text: "Surface temperature (°C)" } },
      showlegend: false,
      annotations: endLabels(labels, range),
    }),
    config: CONFIG,
  }
}

/** The ASTM G173 reference on a secondary axis (a reference spectrum, not a prediction), limited to 0.3-2.5 µm. */
function g173Trace(g173: Spectrum): { trace: object; peak: [number, number] } {
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i < g173.wl_um.length; i++) {
    const w = g173.wl_um[i] as number
    if (w >= 0.3 && w <= 2.5) {
      x.push(w * 1000)
      y.push(g173.irradiance_w_m2_um[i] as number)
    }
  }
  const top = y.indexOf(Math.max(...y))
  return {
    trace: {
      type: "scatter",
      mode: "lines",
      x,
      y,
      yaxis: "y2",
      name: "Sunlight, AM1.5G (reference, not a prediction)",
      showlegend: false,
      line: { width: 1, color: slotHex("baseline") },
      fill: "tozeroy",
      fillcolor: withAlpha(slotHex("baseline"), 0.13),
      meta: meta("reference", "G173", "baseline"),
    },
    peak: [x[top] as number, y[top] as number],
  }
}

const spectrumLayout = (annotations: object[]): object =>
  baseLayout({
    margin: { l: 64, r: 64 + RIGHT, t: 16, b: 48 },
    xaxis: { title: { text: "Wavelength (nm)" } },
    yaxis: { title: { text: "Reflectance R" }, range: [0, 1.02] },
    yaxis2: {
      title: { text: "Sunlight (W m⁻² µm⁻¹)" },
      overlaying: "y",
      side: "right",
      showgrid: false,
    },
    showlegend: false,
    annotations,
  })

/** Reflectance spectra: predicted candidates with p5-p95 bands, controls nominal only, G173 as reference, direct labels. */
export function figSpectrum(
  spec: SpectraJson,
  g173: Spectrum,
  opts: CurveOpts = {},
): FigureSpec {
  const x = spec.wl_um.map((w) => w * 1000)
  const ref = g173Trace(g173)
  const data: object[] = [ref.trace]
  const labels: EndLabel[] = []
  let ci = 0
  let ki = 0
  const xEnd = x[x.length - 1] as number
  for (const s of spec.series) {
    if (opts.only !== undefined && !opts.only.includes(s.id)) continue
    if (s.kind === "candidate" && s.r_lo && s.r_hi) {
      const slot = candidateSlot(s.id, opts.shortlist, ci++)
      data.push(...lineWithBand(s.id, s.id, x, s.r, s.r_lo, s.r_hi, slot))
      labels.push({
        text: candidateLabel(s.id, opts.shortlist),
        slot,
        x: xEnd,
        y: s.r[s.r.length - 1] as number,
      })
    } else {
      data.push(
        nominalLine(
          s.id,
          s.id,
          x,
          s.r,
          "baseline",
          DASHES[ki++ % DASHES.length] as string,
        ),
      )
      labels.push({
        text: CONTROL_LABEL[s.id] ?? `${s.id} (nominal only)`,
        slot: "baseline",
        x: xEnd,
        y: s.r[s.r.length - 1] as number,
      })
    }
  }
  const notes = endLabels(labels, [0, 1])
  notes.push({
    x: ref.peak[0],
    y: ref.peak[1],
    xref: "x",
    yref: "y2",
    text: "Sunlight (right axis)",
    showarrow: false,
    xanchor: "left",
    xshift: 6,
    yshift: 6,
    name: "baseline",
    font: { size: 12, color: slotHex("baseline") },
  })
  return { data, layout: spectrumLayout(notes), config: CONFIG }
}

const sensRows = (
  sens: readonly SensRow[],
  output: string,
  method: SensRow["method"],
): SensRow[] => sens.filter((s) => s.output === output && s.method === method)

/** Sobol S1 and ST bars per variable; the error bars are the stored confidence half-widths. Two series: labelled in the plot, no legend. */
export function figSobol(sens: readonly SensRow[], output: string): FigureSpec {
  const rows = sensRows(sens, output, "sobol")
  const vars = [...new Set(rows.map((r) => r.variable))]
  const bar = (index: "S1" | "ST", slot: Slot, name: string) => {
    const by = new Map(
      rows.filter((r) => r.index === index).map((r) => [r.variable, r]),
    )
    return {
      type: "bar",
      name,
      x: vars.map(inputLabel),
      y: vars.map((v) => by.get(v)?.value ?? 0),
      showlegend: false,
      error_y: {
        type: "data",
        array: vars.map((v) => by.get(v)?.conf ?? 0),
        visible: true,
      },
      marker: { color: slotHex(slot) },
      meta: { kind: "predicted", id: index, slot },
    }
  }
  const key = (text: string, slot: Slot, x: number) => ({
    x,
    y: 1.1,
    xref: "paper",
    yref: "paper",
    text,
    showarrow: false,
    xanchor: "left",
    name: slot,
    font: { size: 12, color: slotHex(slot) },
  })
  return {
    data: [
      bar("S1", "series-3", "S1 (first order)"),
      bar("ST", "series-4", "ST (total)"),
    ],
    layout: baseLayout({
      barmode: "group",
      xaxis: { title: { text: "Input variable" }, tickangle: -35 },
      yaxis: { title: { text: `Sobol index of ${axisLabel(output)}` } },
      margin: { l: 56, r: 16, t: 40, b: 110 },
      showlegend: false,
      annotations: [
        key("S1: first-order effect", "series-3", 0),
        key("ST: total effect", "series-4", 0.3),
      ],
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
        text: vars.map(inputLabel),
        textposition: "top center",
        textfont: { color: slotHex("series-3") },
        error_x: {
          type: "data",
          array: vars.map((v) => get(v, "mu_star")?.conf ?? 0),
          visible: true,
        },
        marker: { color: slotHex("series-3"), size: 9 },
        name: "Morris",
        showlegend: false,
        meta: { kind: "predicted", id: "morris", slot: "series-3" },
      },
    ],
    layout: baseLayout({
      xaxis: {
        title: { text: `mu* (mean absolute effect) on ${axisLabel(output)}` },
      },
      yaxis: { title: { text: "sigma (spread of effect)" } },
      showlegend: false,
    }),
    config: CONFIG,
  }
}

const K = 273.15

/** Live day-2 temperature: nominal with p5-p95 band over the live draws; C0 and C1 as nominal-only reference lines; direct labels. */
export function figLiveTofT(r: LiveResult): FigureSpec {
  const x = Array.from(
    { length: r.series.t_k.length },
    (_, i) => (i * 600) / 3600,
  )
  const c = (a: ArrayLike<number>) => Array.from(a, (v) => v - K)
  const t = c(r.series.t_k)
  const lo = c(r.series.lo)
  const hi = c(r.series.hi)
  const data: object[] = [
    ...lineWithBand("live", "This recipe", x, t, lo, hi, "series-3"),
  ]
  const ctl = r.controls
  const c0 = c(ctl.C0.t_surface_k as Float64Array)
  const c1 = c(ctl.C1.t_surface_k as Float64Array)
  data.push(
    nominalLine("C0", "C0 bare substrate", x, c0, "baseline", "dash"),
    nominalLine("C1", "C1 commercial datasheet", x, c1, "baseline", "dot"),
  )
  const xe = x[x.length - 1] as number
  const range = extent([t, lo, hi, c0, c1])
  return {
    data,
    layout: baseLayout({
      margin: { l: 64, r: RIGHT, t: 16, b: 48 },
      xaxis: { title: { text: "Hour of day 2" }, dtick: 4, range: [0, 24] },
      yaxis: {
        title: {
          text: `Surface temperature (°C), band = p5-p95 of ${r.nDraws} draws`,
        },
      },
      showlegend: false,
      annotations: endLabels(
        [
          {
            text: "This recipe",
            slot: "series-3",
            x: xe,
            y: t[t.length - 1] as number,
          },
          {
            text: "Bare aluminium (nominal)",
            slot: "baseline",
            x: xe,
            y: c0[c0.length - 1] as number,
          },
          {
            text: "Datasheet control (nominal)",
            slot: "baseline",
            x: xe,
            y: c1[c1.length - 1] as number,
          },
        ],
        range,
      ),
    }),
    config: CONFIG,
  }
}

/** Live reflectance spectrum with the p5-p95 band and the G173 reference. */
export function figLiveSpectrum(r: LiveResult, g173: Spectrum): FigureSpec {
  const x = Array.from(makeWlGrid(), (w) => w * 1000)
  const ref = g173Trace(g173)
  const nom = r.spectrum.nominal
  const notes = endLabels(
    [
      {
        text: "This recipe",
        slot: "series-3",
        x: x[x.length - 1] as number,
        y: nom[nom.length - 1] as number,
      },
    ],
    [0, 1],
  )
  notes.push({
    x: ref.peak[0],
    y: ref.peak[1],
    xref: "x",
    yref: "y2",
    text: "Sunlight (right axis)",
    showarrow: false,
    xanchor: "left",
    xshift: 6,
    yshift: 6,
    name: "baseline",
    font: { size: 12, color: slotHex("baseline") },
  })
  return {
    data: [
      ref.trace,
      ...lineWithBand(
        "live",
        "This recipe",
        x,
        nom,
        r.spectrum.lo,
        r.spectrum.hi,
        "series-3",
      ),
    ],
    layout: spectrumLayout(notes),
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
  card_high: "Highest cooling recipe",
  card_balanced: "Balanced recipe",
  card_low: "Lowest cost recipe",
}
export const INDONESIA_BIN_LABEL: Record<string, string> = {
  hot: "hot day",
  typical: "typical day",
  overcast: "overcast day",
  weighted: "weighted",
}
/** The colour role of each subject of the Indonesia bars: the datasheet control is the neutral baseline, the recipes keep their role colours. */
export const INDONESIA_SUBJECT_SLOT: Record<string, Slot> = {
  C1: "baseline",
  card_high: "recommended",
  card_balanced: "series-3",
  card_low: "series-1",
}

export const INDONESIA_STATE_LABEL: Record<string, string> = {
  initial: "initial",
  aged: "aged (scenario ageing)",
}
export const siteLabel = (id: string): string =>
  id.charAt(0).toUpperCase() + id.slice(1)

/**
 * Heat-flux benefit against bare aluminium (C0 minus the subject, mean flux into the building) per day type, one panel per site
 * on one shared y axis, one bar per subject with whiskers to the outer bound of the benefit interval (not a p5-p95 of the
 * benefit), for one state. The weighted view is the last group of each panel.
 */
export function figIndonesiaBars(
  rows: readonly IndonesiaSummaryRow[],
  state: "initial" | "aged",
): FigureSpec {
  const subjects = ["C1", "card_high", "card_balanced", "card_low"]
  const sites = [...new Set(rows.map((r) => r.site))]
  const bins = ["hot", "typical", "overcast", "weighted"]
  const cols = Math.min(3, Math.max(1, sites.length))
  const nrows = Math.ceil(sites.length / cols)
  const gapX = 0.03
  const gapY = 0.2
  const data: object[] = []
  const layout: Record<string, unknown> = {}
  const notes: object[] = []
  sites.forEach((site, si) => {
    const col = si % cols
    const row = Math.floor(si / cols)
    const ax = si === 0 ? "" : String(si + 1)
    const w = (1 - gapX * (cols - 1)) / cols
    const h = (1 - gapY * (nrows - 1)) / nrows
    const x0 = col * (w + gapX)
    const y1 = 1 - row * (h + gapY)
    layout[`xaxis${ax}`] = {
      domain: [x0, x0 + w],
      anchor: `y${ax}`,
      tickangle: -40,
    }
    layout[`yaxis${ax}`] = {
      domain: [y1 - h, y1],
      anchor: `x${ax}`,
      ...(si === 0 ? {} : { matches: "y" }),
      ...(col === 0
        ? { title: { text: "Benefit, W/m² (PROXY)", standoff: 8 } }
        : { showticklabels: false }),
      automargin: true,
    }
    notes.push({
      x: x0 + w / 2,
      y: y1,
      xref: "paper",
      yref: "paper",
      text: siteLabel(site),
      showarrow: false,
      yanchor: "bottom",
      font: { size: 13 },
    })
    for (const subject of subjects) {
      const pick = bins.map((b) =>
        rows.find(
          (r) =>
            r.site === site &&
            r.bin === b &&
            r.subject === subject &&
            r.state === state,
        ),
      )
      const y = pick.map((r) => r?.dq_w_m2 ?? Number.NaN)
      const slot = INDONESIA_SUBJECT_SLOT[subject] as Slot
      data.push({
        type: "bar",
        name: INDONESIA_SUBJECT_LABEL[subject],
        x: bins.map((b) => INDONESIA_BIN_LABEL[b] ?? b),
        y,
        xaxis: `x${ax}`,
        yaxis: `y${ax}`,
        legendgroup: subject,
        showlegend: si === 0,
        error_y: {
          type: "data",
          symmetric: false,
          array: pick.map((r, k) => (r ? r.dq_hi - (y[k] as number) : 0)),
          arrayminus: pick.map((r, k) => (r ? (y[k] as number) - r.dq_lo : 0)),
          thickness: 1.5,
          color: slotHex("baseline"),
        },
        marker: { color: slotHex(slot) },
        meta: { kind: "predicted", id: subject, slot, site },
      })
    }
  })
  return {
    data,
    layout: baseLayout({
      ...layout,
      barmode: "group",
      margin: { l: 72, r: 16, t: 104, b: 96 },
      height: 300 * nrows + 150,
      annotations: [
        ...notes,
        {
          x: 0,
          y: 1.0,
          xref: "paper",
          yref: "paper",
          yshift: 80,
          text: `Aluminium roof, state: ${INDONESIA_STATE_LABEL[state]}; whiskers: outer bound of the benefit interval`,
          showarrow: false,
          xanchor: "left",
          font: { size: 12 },
        },
      ],
      legend: { orientation: "h", x: 0, y: 1.0, yanchor: "bottom", yshift: 34 },
    }),
    config: CONFIG,
  }
}

/**
 * D7 (verified, spike Q3): `relayout` for every chart type, `restyleParcoords` for the parcoords trace only
 * (applied as Plotly.restyle(gd, restyleParcoords, [0])); the black axis strokes of parcoords need the CSS override in the page CSS.
 */
export function themeKeys(tokens: ThemeTokens): {
  relayout: Record<string, string>
  restyleParcoords: Record<string, unknown>
} {
  const seq = tokens.seq ?? L.seq
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
      "line.colorscale": [colorScale(seq)],
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
