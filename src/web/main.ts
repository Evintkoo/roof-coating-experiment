// Page glue (browser only). Pure logic lives in figures.ts, linking.ts, liveState.ts and fmt.ts.
// This file renders the static report: explorer figures, curves, spectra, sensitivity, theme. Sections added by later plans
// register an initialiser in `SECTION_INIT` below and read their data from window.__SPANDEK__.ext.

import type { Spectrum } from "../core/literature"
import type {
  CurvesJson,
  ObjRow,
  SensRow,
  SpectraJson,
} from "../core/pipeline/tables"
import {
  axisThemeKeys,
  type FigureSpec,
  figMorris,
  figParcoords,
  figSobol,
  figSpectrum,
  figSplom,
  figTofT,
  type ThemeTokens,
  themeKeys,
} from "./figures"
import {
  applyBrush,
  type BrushState,
  emptyBrush,
  readBrush,
  selectByRanges,
} from "./linking"

export type PageData = {
  meta: Record<string, string | number>
  pareto: ObjRow[]
  shortlist: Record<string, string>
  curves: CurvesJson
  spectra: SpectraJson
  sens: SensRow[]
  outputs: string[]
  g173: { wl_um: number[]; irradiance_w_m2_um: number[] }
  ctxJson: string
  workerSrc: string
  ext: Record<string, unknown>
}
type Plotly = {
  newPlot(
    el: HTMLElement,
    data: object[],
    layout: object,
    config?: object,
  ): Promise<unknown>
  react(
    el: HTMLElement,
    data: object[],
    layout: object,
    config?: object,
  ): Promise<unknown>
  relayout(el: HTMLElement, update: object): Promise<unknown>
  restyle(el: HTMLElement, update: object, traces?: number[]): Promise<unknown>
}
declare global {
  interface Window {
    __SPANDEK__: PageData
    Plotly: Plotly
  }
}

const D = window.__SPANDEK__
const P = window.Plotly
const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing element ${id}`)
  return el
}
const css = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function tokens(): ThemeTokens {
  return {
    paper: css("--bg"),
    plot: css("--bg"),
    font: css("--fg"),
    grid: css("--grid"),
    axisStroke: css("--axis"),
    colorway: [],
  }
}

/** Figures currently on the page: id, spec and whether it is the parcoords trace. */
const shown = new Map<string, { spec: FigureSpec; parcoords: boolean }>()

function themed(spec: FigureSpec, t: ThemeTokens): FigureSpec {
  const base = themeKeys(t).relayout
  const layout = { ...spec.layout } as Record<string, unknown>
  layout.paper_bgcolor = base.paper_bgcolor
  layout.plot_bgcolor = base.plot_bgcolor
  layout.font = {
    ...((layout.font as object) ?? {}),
    color: base["font.color"],
  }
  for (const [k, v] of Object.entries(axisThemeKeys(layout, t))) {
    const [axis, prop] = k.split(".") as [string, string]
    layout[axis] = { ...((layout[axis] as object) ?? {}), [prop]: v }
  }
  return { ...spec, layout }
}

let brush: BrushState = emptyBrush()
let selected: Set<string> | undefined

function draw(id: string, spec: FigureSpec, parcoords = false): void {
  const t = tokens()
  shown.set(id, { spec, parcoords })
  let s = themed(spec, t)
  if (parcoords) {
    s = applyBrush(s, brush)
    const tr = s.data[0] as Record<string, unknown>
    const ts = themeKeys(t).restyleParcoords
    tr.labelfont = { color: ts["labelfont.color"] }
    tr.tickfont = { color: ts["tickfont.color"] }
    tr.rangefont = { color: ts["rangefont.color"] }
    ;(tr.line as Record<string, unknown>).colorscale = (
      ts["line.colorscale"] as unknown[]
    )[0]
  }
  void P.react($(id), s.data, s.layout, s.config)
}

function redrawAll(): void {
  for (const [id, f] of [...shown]) draw(id, f.spec, f.parcoords)
}

const g173: Spectrum = {
  wl_um: Float64Array.from(D.g173.wl_um),
  irradiance_w_m2_um: Float64Array.from(D.g173.irradiance_w_m2_um),
}

function fillSelect(sel: HTMLSelectElement, values: string[]): void {
  sel.replaceChildren(
    ...values.map((v) => {
      const o = document.createElement("option")
      o.value = v
      o.textContent = v
      return o
    }),
  )
}

function renderExplorer(): void {
  draw("fig-parcoords", figParcoords(D.pareto, D.shortlist), true)
  draw("fig-splom", figSplom(D.pareto, D.shortlist, selected))
  const gd = $("fig-parcoords") as HTMLElement & {
    on?: (ev: string, fn: () => void) => void
    data?: { dimensions: { label?: unknown; constraintrange?: unknown }[] }[]
  }
  gd.on?.("plotly_restyle", () => {
    const dims = gd.data?.[0]?.dimensions
    if (!dims) return
    brush = readBrush(dims)
    selected = selectByRanges(D.pareto, brush.ranges)
    filterTable()
    draw("fig-splom", figSplom(D.pareto, D.shortlist, selected))
  })
}

function filterTable(): void {
  const rows = document.querySelectorAll<HTMLTableRowElement>(
    "#tbl-explorer tbody tr[data-id]",
  )
  let n = 0
  for (const r of rows) {
    const on = selected === undefined || selected.has(r.dataset.id ?? "")
    r.hidden = !on
    if (on) n++
  }
  ;($("tbl-empty") as HTMLElement).hidden = n > 0
  $("tbl-count").textContent = `${n} of ${rows.length} candidates`
}

function renderCurves(): void {
  const scen = [...new Set(D.curves.series.map((s) => s.scenario_id))].sort()
  const sel = $("sel-scenario") as HTMLSelectElement
  fillSelect(sel, scen)
  const go = () => draw("fig-tofT", figTofT(D.curves, sel.value))
  sel.addEventListener("change", go)
  go()
  draw("fig-spectrum", figSpectrum(D.spectra, g173))
}

function renderSensitivity(): void {
  for (const o of D.outputs) {
    draw(`fig-sobol-${o}`, figSobol(D.sens, o))
    draw(`fig-morris-${o}`, figMorris(D.sens, o))
  }
}

/** Initialisers of optional sections (Indonesia, Optimisation): id of the section -> function of its embedded data. */
const SECTION_INIT: Record<
  string,
  (data: unknown, draw: (id: string, spec: FigureSpec) => void) => void
> = {}

function initTheme(): void {
  const root = document.documentElement
  $("theme-toggle").addEventListener("click", () => {
    const dark =
      root.dataset.theme === "dark" ||
      (root.dataset.theme !== "light" &&
        matchMedia("(prefers-color-scheme: dark)").matches)
    root.dataset.theme = dark ? "light" : "dark"
    redrawAll()
  })
  matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    redrawAll,
  )
}

initTheme()
renderExplorer()
renderCurves()
renderSensitivity()
for (const [id, init] of Object.entries(SECTION_INIT))
  if (id in D.ext) init(D.ext[id], (fid, spec) => draw(fid, spec))
