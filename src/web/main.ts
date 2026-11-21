// Page glue (browser only). Pure logic lives in figures.ts, linking.ts, liveState.ts and fmt.ts.
// This file renders the static report: explorer figures, curves, spectra, sensitivity, theme. Sections added by later plans
// register an initialiser in `SECTION_INIT` below and read their data from window.__SPANDEK__.ext.

import type { MaterialRanges, WeatherConfig } from "../core/config"
import { weatherL9 } from "../core/design"
import type { Level } from "../core/events"
import type { Spectrum } from "../core/literature"
import type { LiveInputs, LiveResult } from "../core/pipeline/live"
import type {
  CurvesJson,
  ObjRow,
  SensRow,
  SpectraJson,
} from "../core/pipeline/tables"
import {
  axisLabel,
  axisThemeKeys,
  type FigureSpec,
  figLiveSpectrum,
  figLiveTofT,
  figMorris,
  figParcoords,
  figSobol,
  figSpectrum,
  figSplom,
  figTofT,
  type ThemeTokens,
  themeKeys,
} from "./figures"
import { fmtValue } from "./fmt"
import {
  applyBrush,
  type BrushState,
  emptyBrush,
  readBrush,
  selectByRanges,
} from "./linking"
import {
  clampInputs,
  defaultLiveState,
  N_LIVE,
  type SliderSpec,
  sliderSpecs,
} from "./liveState"
import {
  budgetRange,
  budgetView,
  costUnitText,
  figFrontier,
  figRefineFront,
  type OptData,
  rowText,
} from "./optimisation"

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
  purge(el: HTMLElement): void
  relayout(el: HTMLElement, update: object): Promise<unknown>
  restyle(el: HTMLElement, update: object, traces?: number[]): Promise<unknown>
}
declare global {
  interface Window {
    __SPANDEK__: PageData
    Plotly: Plotly
    __brushRanges?: () => Record<string, [number, number][]>
    __burst?: (n: number, ms: number) => Promise<BurstLog>
  }
}
/** Result of the burst hook (installed only under the #test fragment). */
type BurstLog = {
  shown: number[]
  requested: number
  lastInputs: LiveInputs
  finalNominal: { r_solar: number; t_max_c: number }
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

/** While the browser prepares a print, the figures are drawn with the print palette (white paper, black ink). */
let printing = false
const PRINT_TOKENS: ThemeTokens = {
  paper: "#ffffff",
  plot: "#ffffff",
  font: "#000000",
  grid: "#cccccc",
  axisStroke: "#000000",
  colorway: [],
}

function tokens(): ThemeTokens {
  if (printing) return PRINT_TOKENS
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

function draw(
  id: string,
  spec: FigureSpec,
  parcoords = false,
): Promise<unknown> {
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
  if (!parcoords) return P.react($(id), s.data, s.layout, s.config)
  // Plotly.react keeps stale brush state per axis position and, after an axis reorder, paints the held range onto a second
  // axis (seen in Chrome 157 with plotly.js 4.3.0). The parcoords figure is therefore rebuilt from the held state each time.
  const el = $(id)
  if (parcoordsDrawn) P.purge(el)
  parcoordsDrawn = true
  return P.newPlot(el, s.data, s.layout, s.config).then(() => bindBrush?.())
}
let parcoordsDrawn = false
let bindBrush: (() => void) | undefined

function redrawAll(): void {
  for (const [id, f] of [...shown]) void draw(id, f.spec, f.parcoords)
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
  void draw("fig-parcoords", figParcoords(D.pareto, D.shortlist), true)
  void draw("fig-splom", figSplom(D.pareto, D.shortlist, selected))
  bindBrush = () => {
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
      void draw("fig-splom", figSplom(D.pareto, D.shortlist, selected))
    })
  }
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
  const go = () => void draw("fig-tofT", figTofT(D.curves, sel.value))
  sel.addEventListener("change", go)
  go()
  void draw("fig-spectrum", figSpectrum(D.spectra, g173))
}

function renderSensitivity(): void {
  for (const o of D.outputs) {
    void draw(`fig-sobol-${o}`, figSobol(D.sens, o))
    void draw(`fig-morris-${o}`, figMorris(D.sens, o))
  }
}

function cellOf(tag: "td" | "th", text: string, cls?: string): HTMLElement {
  const c = document.createElement(tag)
  c.textContent = text
  if (cls) c.className = cls
  return c
}

function tableOf(head: string[], rows: string[][]): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "scroll"
  const t = document.createElement("table")
  const h = t.createTHead().insertRow()
  for (const x of head) h.append(cellOf("th", x))
  const b = t.createTBody()
  for (const r of rows)
    b.insertRow().append(
      ...r.map((x, i) => cellOf("td", x, i === 0 ? "txt" : undefined)),
    )
  wrap.append(t)
  return wrap
}

/** Optimisation section: refined front, and the budget slider that reads the precomputed table with the exact lookup (no model runs). */
function initOptimisation(raw: unknown, drawFig: Draw): void {
  const d = raw as OptData | null
  if (!d) return
  if (d.front.length > 0)
    drawFig(
      "fig-refine-front",
      figRefineFront(d.front, d.objectives, d.cost_unit),
    )
  if (d.tables.length === 0) return
  const profile = $("opt-profile") as HTMLSelectElement
  const budget = $("opt-budget") as HTMLInputElement
  const range = $("opt-budget-range") as HTMLInputElement
  const objective = $("opt-objective") as HTMLSelectElement
  const out = $("opt-result")
  const [lo, hi] = budgetRange(d.tables)
  for (const el of [budget, range]) {
    el.min = String(lo)
    el.max = String(hi)
  }
  range.step = String((hi - lo) / 1000)
  if ([...profile.options].some((o) => o.value === "balanced"))
    profile.value = "balanced"
  const start = d.tables.find((t) => t.profile === profile.value)
  // rounded up to six places so the number box is readable and the lookup still lands on the knee entry
  budget.value = String(Math.ceil((start?.knee_budget ?? lo) * 1e6) / 1e6)
  range.value = budget.value
  const unit = costUnitText(d.cost_unit)

  const update = (): void => {
    const b = Number(budget.value)
    out.replaceChildren()
    if (!Number.isFinite(b)) {
      const p = document.createElement("p")
      p.textContent = "Enter a budget as a number."
      out.append(p)
      return
    }
    const v = budgetView(d, profile.value, b)
    if (v.status === "infeasible") {
      const p = document.createElement("p")
      p.textContent = `No recipe fits this budget: the minimum feasible cost for this profile is ${fmtValue(v.c_min, 4)} ${unit}.`
      out.append(p)
    } else {
      const p = document.createElement("p")
      p.textContent = `Recipe of the tabulated budget at or below ${fmtValue(b, 4)}: cost ${fmtValue(v.cost, 4)} ${unit}, unspent headroom ${fmtValue(v.headroom, 4)}; knee of the curve at ${fmtValue(v.knee, 4)}.${v.repaired ? " This entry repeats the previous recipe (a monotone repair)." : ""} Intervals are p5 to p95 over the table's uncertainty draws.`
      out.append(
        p,
        tableOf(
          ["Objective", "Value [p5, p95]"],
          v.objectives.map((r) => [r.label, rowText(r)]),
        ),
        tableOf(
          ["Ingredient", "Recipe value"],
          v.recipe.map((r) => [r.label, fmtValue(r.value, 4)]),
        ),
      )
    }
    drawFig(
      "fig-frontier",
      figFrontier(d, Number(objective.value), {
        profile: profile.value,
        budget: b,
      }),
    )
  }
  budget.addEventListener("input", () => {
    range.value = budget.value
    update()
  })
  range.addEventListener("input", () => {
    budget.value = range.value
    update()
  })
  profile.addEventListener("change", update)
  objective.addEventListener("change", update)
  update()
}

/** Initialisers of optional sections (Indonesia, Optimisation): id of the section -> function of its embedded data. */
type Draw = (id: string, spec: FigureSpec) => void
const SECTION_INIT: Record<string, (data: unknown, draw: Draw) => void> = {
  optimisation: initOptimisation,
}

// ---- live simulator (plan 00 D2, D3, D10): sliders -> worker -> tiles and charts ----

type WorkerEvent = {
  event: string
  level: Level
  fields: Record<string, string | number | boolean>
}
type FromWorker =
  | { type: "ready" }
  | { type: "events"; list: WorkerEvent[] }
  | { type: "result"; id: number; result: LiveResult; ms: number }
  | {
      type: "error"
      id: number
      error: { code: number; phase: string; key: string }
    }

type Tile = {
  id: string
  label: string
  digits: number
  nominal: (r: LiveResult) => number
  band?: (r: LiveResult) => { lo: number; hi: number }
}
const TILES: Tile[] = [
  {
    id: "r_solar",
    label: axisLabel("r_solar_pred"),
    digits: 3,
    nominal: (r) => r.nominal.r_solar,
    band: (r) => r.bands.r_solar,
  },
  {
    id: "t_max",
    label: axisLabel("t_max_pred"),
    digits: 1,
    nominal: (r) => r.nominal.t_max_c,
    band: (r) => r.bands.t_max_c,
  },
  {
    id: "corrosion",
    label: axisLabel("corrosion_risk"),
    digits: 3,
    nominal: (r) => r.nominal.corrosion_risk,
    band: (r) => r.bands.corrosion_risk,
  },
  {
    id: "wetting",
    label: axisLabel("wetting_proxy"),
    digits: 3,
    nominal: (r) => r.nominal.wetting_score,
    band: (r) => r.bands.wetting_score,
  },
  {
    id: "delam",
    label: axisLabel("delam_proxy"),
    digits: 3,
    nominal: (r) => r.nominal.delam_proxy,
    band: (r) => r.bands.delam_proxy,
  },
  {
    id: "cost",
    label: axisLabel("cost_proxy"),
    digits: 3,
    nominal: (r) => r.nominal.cost_proxy,
  },
  {
    id: "gel",
    label: axisLabel("gel_time_rel"),
    digits: 2,
    nominal: (r) => r.nominal.gel_time_rel,
  },
]

const LAYERS = ["primer", "midcoat", "topcoat"] as const
const RING = 100
const ring: string[] = []

function mk<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

type LiveApi = {
  burst: (n: number, ms: number) => Promise<BurstLog>
}

function initLive(): LiveApi {
  const root = $("live-root")
  const cfg = JSON.parse(D.ctxJson) as {
    ranges: MaterialRanges
    weather: WeatherConfig
  }
  const specs = sliderSpecs(cfg.ranges, cfg.weather)
  let inputs: LiveInputs = defaultLiveState(cfg.ranges, cfg.weather).inputs
  const rangeEls = new Map<string, HTMLInputElement>()
  const numEls = new Map<string, HTMLInputElement>()
  const layerEls = new Map<string, HTMLInputElement>()
  const status = $("live-status")
  const debug = $("debug") as HTMLDetailsElement

  const note = (line: string): void => {
    ring.push(line)
    if (ring.length > RING) ring.shift()
    if (debug.open) $("debug-events").textContent = ring.join("\n")
  }
  debug.addEventListener("toggle", () => {
    $("debug-events").textContent = ring.join("\n")
  })

  const get = (s: SliderSpec): number =>
    s.group === "ph"
      ? inputs.ph
      : ((inputs[s.group] as unknown as Record<string, number>)[
          s.key
        ] as number)
  const put = (s: SliderSpec, v: number): void => {
    if (s.group === "ph") inputs.ph = v
    else (inputs[s.group] as unknown as Record<string, number>)[s.key] = v
  }
  const commit = (): void => {
    inputs = clampInputs(inputs, cfg.ranges, cfg.weather)
  }

  // ---- scheduler (D3): one request in flight, one pending (the newest), results shown only when newer ----
  let requested = 0
  let shownId = 0
  let doneId = 0
  let inFlight: { id: number; t: number } | null = null
  let pending: { id: number; inputs: LiveInputs; t: number } | null = null
  let frame = 0
  let lastInputs: LiveInputs = structuredClone(inputs)
  const shownLog: number[] = []
  let worker: Worker | null = null

  const pump = (): void => {
    if (worker === null || inFlight !== null || pending === null) return
    const p = pending
    pending = null
    inFlight = { id: p.id, t: p.t }
    worker.postMessage({ type: "run", id: p.id, inputs: p.inputs })
  }
  const schedule = (): void => {
    if (frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      pump()
    })
  }
  const request = (): void => {
    const id = ++requested
    lastInputs = structuredClone(inputs)
    pending = { id, inputs: lastInputs, t: performance.now() }
    root.dataset.requested = String(id)
    schedule()
  }

  const tileEls = new Map<string, HTMLElement>()
  const tiles = $("live-tiles")
  for (const t of TILES) {
    const e = mk("div", "tile")
    e.id = `tile-${t.id}`
    e.append(mk("div", "tile-label", t.label), mk("div", "tile-value"))
    e.append(mk("div", "tile-range"))
    tiles.append(e)
    tileEls.set(t.id, e)
  }
  const setTile = (t: Tile, r: LiveResult): void => {
    const e = tileEls.get(t.id) as HTMLElement
    const nom = t.nominal(r)
    const b = t.band?.(r)
    e.dataset.nominal = String(nom)
    e.dataset.lo = String(b ? b.lo : "")
    e.dataset.hi = String(b ? b.hi : "")
    ;(e.querySelector(".tile-value") as HTMLElement).textContent = fmtValue(
      nom,
      t.digits,
    )
    const rng = e.querySelector(".tile-range") as HTMLElement
    if (!b) rng.textContent = "nominal only, no interval"
    else if (Number.isNaN(nom))
      rng.textContent = "not modelled without this layer"
    else
      rng.textContent = `[${fmtValue(b.lo, t.digits)}, ${fmtValue(b.hi, t.digits)}] p5 to p95 of ${N_LIVE} draws`
  }

  const show = (
    m: Extract<FromWorker, { type: "result" }>,
    t0: number,
  ): void => {
    shownId = m.id
    shownLog.push(m.id)
    if (shownLog.length > 2000) shownLog.shift()
    for (const t of TILES) setTile(t, m.result)
    status.textContent = ""
    Promise.all([
      draw("fig-live-tofT", figLiveTofT(m.result)),
      draw("fig-live-spectrum", figLiveSpectrum(m.result, g173)),
    ]).then(
      () => {
        if (m.id > doneId) {
          doneId = m.id
          root.dataset.shown = String(m.id)
        }
        const total = performance.now() - t0
        $("debug-timing").textContent =
          `Last live update: models ${m.ms.toFixed(1)} ms in the worker, input to charts ${total.toFixed(1)} ms (update ${m.id}).`
        note(
          `info live.update ${JSON.stringify({ id: m.id, worker_ms: Math.round(m.ms * 10) / 10, total_ms: Math.round(total * 10) / 10 })}`,
        )
      },
      () => {
        status.textContent = "A chart could not be drawn."
      },
    )
  }

  const onMessage = (m: FromWorker): void => {
    if (m.type === "ready") {
      note("info live.worker_ready {}")
    } else if (m.type === "events") {
      for (const e of m.list)
        note(`${e.level} ${e.event} ${JSON.stringify(e.fields)}`)
    } else if (m.type === "result") {
      const sent = inFlight
      inFlight = null
      if (m.id > shownId) show(m, sent?.t ?? performance.now())
      schedule()
    } else {
      inFlight = null
      if (m.id > shownId) {
        shownId = m.id
        doneId = Math.max(doneId, m.id)
        root.dataset.shown = String(m.id)
        status.textContent = `These inputs cannot be evaluated (code ${m.error.code}, phase ${m.error.phase}${m.error.key ? `, ${m.error.key}` : ""}). The previous result stays on screen.`
        note(`error live.error ${JSON.stringify(m.error)}`)
      }
      schedule()
    }
  }

  // ---- controls ----
  const controls = $("live-controls")
  const L9 = weatherL9(cfg.weather)
  const preset = mk("select")
  preset.id = "live-scenario"
  preset.setAttribute("aria-label", "Weather scenario preset")
  const custom = mk("option", undefined, "Custom values")
  custom.value = "custom"
  preset.append(custom)
  for (const s of L9) {
    const o = mk(
      "option",
      undefined,
      `${s.scenario_id}: ${s.irradiance_w_m2} W/m², ${s.t_air_c} °C, ${s.wind_m_s} m/s`,
    )
    o.value = s.scenario_id
    preset.append(o)
  }
  preset.value = "custom"

  const group = (title: string): HTMLElement => {
    const f = mk("fieldset", "ctl")
    f.append(mk("legend", undefined, title))
    controls.append(f)
    return f
  }
  const groups: Record<SliderSpec["group"], HTMLElement> = {
    design: group("Coating recipe"),
    ph: group("Sol-gel"),
    scenario: group("Weather"),
  }
  groups.scenario.append(preset)
  for (const s of specs) {
    const row = mk("div", "srow")
    const lab = mk("label", undefined, `${s.label} (${s.unit})`)
    lab.htmlFor = `live-num-${s.key}`
    const rg = mk("input")
    rg.type = "range"
    rg.id = `live-range-${s.key}`
    rg.min = String(s.min)
    rg.max = String(s.max)
    rg.step = String(s.step)
    rg.value = String(s.value)
    rg.setAttribute("aria-label", `${s.label} slider`)
    const nb = mk("input")
    nb.type = "number"
    nb.id = `live-num-${s.key}`
    nb.min = String(s.min)
    nb.max = String(s.max)
    nb.step = "any"
    nb.value = String(s.value)
    rangeEls.set(s.key, rg)
    numEls.set(s.key, nb)
    const after = (src: "range" | "box"): void => {
      commit()
      const v = String(get(s))
      if (src === "range") nb.value = v
      rg.value = v
      if (s.group === "scenario") preset.value = "custom"
      request()
    }
    rg.addEventListener("input", () => {
      put(s, Number(rg.value))
      after("range")
    })
    nb.addEventListener("input", () => {
      put(s, Number.parseFloat(nb.value))
      after("box")
    })
    nb.addEventListener("change", () => {
      put(s, Number.parseFloat(nb.value))
      commit()
      nb.value = String(get(s))
      rg.value = nb.value
    })
    row.append(lab, rg, nb)
    groups[s.group].append(row)
  }
  preset.addEventListener("change", () => {
    const sc = L9.find((x) => x.scenario_id === preset.value)
    if (!sc) return
    inputs.scenario = {
      irradiance_w_m2: sc.irradiance_w_m2,
      t_air_c: sc.t_air_c,
      wind_m_s: sc.wind_m_s,
    }
    commit()
    for (const s of specs.filter((x) => x.group === "scenario")) {
      const v = String(get(s))
      ;(numEls.get(s.key) as HTMLInputElement).value = v
      ;(rangeEls.get(s.key) as HTMLInputElement).value = v
    }
    request()
  })
  const lay = group("Layers")
  for (const name of LAYERS) {
    const lab = mk("label", "check")
    const cb = mk("input")
    cb.type = "checkbox"
    cb.id = `live-layer-${name}`
    cb.checked = inputs.layers[name]
    cb.addEventListener("change", () => {
      inputs.layers[name] = cb.checked
      request()
    })
    layerEls.set(name, cb)
    lab.append(cb, ` ${name} on`)
    lay.append(lab)
  }

  try {
    const url = URL.createObjectURL(
      new Blob([D.workerSrc], { type: "text/javascript" }),
    )
    worker = new Worker(url)
    worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data)
    worker.onerror = () => {
      status.textContent =
        "The live simulator stopped. The static results below still work."
    }
    worker.postMessage({ type: "init", ctxJson: D.ctxJson })
  } catch {
    status.textContent =
      "This browser cannot start the live simulator. The static results below still work."
  }
  request()

  const waitDone = (): Promise<void> =>
    new Promise((resolve) => {
      const check = (): void => {
        if (doneId >= requested) resolve()
        else setTimeout(check, 5)
      }
      check()
    })
  return {
    burst: async (n, ms) => {
      const spec = specs.find(
        (s) => s.key === "midcoat_tio2_fraction",
      ) as SliderSpec
      const rg = rangeEls.get(spec.key) as HTMLInputElement
      const first = shownLog.length
      await new Promise<void>((resolve) => {
        for (let i = 0; i < n; i++)
          setTimeout(
            () => {
              rg.value = String(
                spec.min + ((spec.max - spec.min) * (i + 1)) / n,
              )
              rg.dispatchEvent(new Event("input", { bubbles: true }))
              if (i === n - 1) resolve()
            },
            (i * ms) / n,
          )
      })
      await waitDone()
      const num = (id: string): number =>
        Number((tileEls.get(id) as HTMLElement).dataset.nominal)
      return {
        shown: shownLog.slice(first),
        requested,
        lastInputs,
        finalNominal: { r_solar: num("r_solar"), t_max_c: num("t_max") },
      }
    },
  }
}

/** Hooks for the browser tests; installed only when the page was opened with the fragment #test. */
function installTestHooks(live: LiveApi): void {
  window.__brushRanges = () => {
    const gd = $("fig-parcoords") as HTMLElement & {
      data?: { dimensions: { label?: unknown; constraintrange?: unknown }[] }[]
    }
    return readBrush(gd.data?.[0]?.dimensions ?? []).ranges
  }
  window.__burst = live.burst
}

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
  window.addEventListener("beforeprint", () => {
    printing = true
    redrawAll()
  })
  window.addEventListener("afterprint", () => {
    printing = false
    redrawAll()
  })
}

initTheme()
renderExplorer()
renderCurves()
renderSensitivity()
for (const [id, init] of Object.entries(SECTION_INIT))
  if (id in D.ext) init(D.ext[id], (fid, spec) => void draw(fid, spec))
const live = initLive()
if (location.hash === "#test") installTestHooks(live)
