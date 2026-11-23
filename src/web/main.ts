// Page glue (browser only). Pure logic lives in figures.ts, linking.ts, liveState.ts and fmt.ts.
// This file renders the static report: explorer figures, curves, spectra, sensitivity, theme. Sections added by later plans
// register an initialiser in `SECTION_INIT` below and read their data from window.__SPANDEK__.ext.

import {
  designsOf,
  type ScreeningData,
  screenChunk,
} from "../core/anim/screening"
import { sweepVariables } from "../core/anim/sweep"
import type { MaterialRanges, WeatherConfig } from "../core/config"
import { weatherL9 } from "../core/design"
import type { Level } from "../core/events"
import type { Spectrum } from "../core/literature"
import { contextFromJson } from "../core/pipeline/contextJson"
import type { LiveInputs, LiveResult } from "../core/pipeline/live"
import type {
  CurvesJson,
  ObjRow,
  SensRow,
  SpectraJson,
} from "../core/pipeline/tables"
import { type ComparePanel, mountComparePanel } from "./anim/comparePanel"
import { dayDataOf } from "./anim/dayData"
import {
  browserDayDeps,
  type DayPlayer,
  mountDayPlayer,
} from "./anim/dayPlayer"
import { browserLoop, type Loop, testHooksEnabled } from "./anim/loop"
import { mountScreeningPanel, type Panel } from "./anim/screeningPanel"
import { mountSweepPanel, type SweepPanel } from "./anim/sweepPanel"
import { createTweens, type Tweens } from "./anim/tween"
import { mountBudgetPanel } from "./design/organisms/budgetPanel"
import { applyPlotTheme, type PlotTheme } from "./design/plotTheme"
import {
  axisLabel,
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
  type IndonesiaData,
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
  liveLabel,
  liveValue,
  N_LIVE,
  type SliderSpec,
  sliderSpecs,
} from "./liveState"
import { figFrontier, figRefineFront } from "./optimisation"
import { inlineSweepLane } from "./pool"
import { type BudgetPage, budgetLookup } from "./recipe"

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
  /** Designs, scenarios and the batch nominal values of the 96 x 9 screening (plan 07 H7). */
  screening: ScreeningData
  workerSrc: string
  ext: Record<string, unknown>
  plotThemes: { dark: PlotTheme; light: PlotTheme }
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
    __anim?: {
      frames: () => number
      state: () => ReturnType<DayPlayer["state"]> | null
      killWorker: (id: number) => void
      tweening: () => number
      sweep: () => ReturnType<SweepPanel["state"]> | null
      sweepKill: (id: number) => void
      sweepStats: () => {
        created: number
        terminated: number
        live: number
      } | null
    }
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
/** While the browser prepares a print, the figures are drawn with the light theme (white paper). */
let printing = false

/** The figure theme shown now: the page's data-theme (light unless the toggle says dark); print is always light. */
function plotMode(): "dark" | "light" {
  if (printing) return "light"
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light"
}
const theme = (): PlotTheme => D.plotThemes[plotMode()]

/** Figures currently on the page: id, spec and whether it is the parcoords trace. */
const shown = new Map<string, { spec: FigureSpec; parcoords: boolean }>()

/** A figure inside a closed disclosure has no size yet: it is drawn when the disclosure opens (or when printing opens it). */
const hidden = (el: HTMLElement): boolean =>
  el.closest("details:not([open])") !== null

let brush: BrushState = emptyBrush()
let selected: Set<string> | undefined

function draw(
  id: string,
  spec: FigureSpec,
  parcoords = false,
): Promise<unknown> {
  const t = theme()
  shown.set(id, { spec, parcoords })
  if (hidden($(id))) return Promise.resolve()
  let s = applyPlotTheme(spec, t)
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

/** Draws the figures of a disclosure that has just opened. */
document.addEventListener(
  "toggle",
  (e) => {
    const d = e.target as HTMLDetailsElement
    if (!(d instanceof HTMLDetailsElement) || !d.open) return
    for (const [id, f] of [...shown])
      if (d.contains($(id)) && !hidden($(id)))
        void draw(id, f.spec, f.parcoords)
  },
  true,
)

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
  const go = () =>
    void draw(
      "fig-tofT",
      figTofT(D.curves, sel.value, { shortlist: D.shortlist }),
    )
  sel.addEventListener("change", go)
  go()
  void draw(
    "fig-spectrum",
    figSpectrum(D.spectra, g173, { shortlist: D.shortlist }),
  )
  const why = D.ext.why as
    | { scenario: string; only: string[]; shortlist: Record<string, string> }
    | undefined
  if (why)
    void draw(
      "fig-why-tofT",
      figTofT(D.curves, why.scenario, {
        shortlist: why.shortlist,
        only: why.only,
      }),
    )
}

function renderSensitivity(): void {
  for (const o of D.outputs) {
    void draw(`fig-sobol-${o}`, figSobol(D.sens, o))
    void draw(`fig-morris-${o}`, figMorris(D.sens, o))
  }
}

/** Budget section: the panel (profile chips, slider, exact lookup, no model runs) and the performance-against-cost figure. */
function initBudget(raw: unknown, drawFig: Draw): void {
  const page = raw as BudgetPage | null
  if (!page) return
  const d = page.opt
  if (d.front.length > 0)
    drawFig(
      "fig-refine-front",
      figRefineFront(d.front, d.objectives, d.cost_unit),
    )
  if (d.tables.length === 0) return
  const root = $("budget-panel")
  mountBudgetPanel(root, budgetLookup(page))
  const objective = $("opt-objective") as HTMLSelectElement
  const range = root.querySelector('input[type="range"]') as HTMLInputElement
  const update = (): void =>
    drawFig(
      "fig-frontier",
      figFrontier(d, Number(objective.value), {
        profile: root.dataset.profile ?? "",
        budget: Number(range.value),
      }),
    )
  root.addEventListener("slider-change", update)
  root.addEventListener("click", () => queueMicrotask(update))
  objective.addEventListener("change", update)
  update()
}

/** Initialisers of optional sections (Indonesia, Optimisation): id of the section -> function of its embedded data. */
type Draw = (id: string, spec: FigureSpec) => void
/** Indonesia section: benefit bars with p5-p95 whiskers for the chosen state (the data is the summary CSV, no model runs). */
function initIndonesia(raw: unknown, drawFig: Draw): void {
  const d = raw as IndonesiaData | null
  if (!d) return
  const state = $("sel-indonesia-state") as HTMLSelectElement
  const update = (): void =>
    drawFig(
      "fig-indonesia-bars",
      figIndonesiaBars(d.summary, state.value === "aged" ? "aged" : "initial"),
    )
  state.addEventListener("change", update)
  update()
}

const SECTION_INIT: Record<string, (data: unknown, draw: Draw) => void> = {
  budget: initBudget,
  climate: initIndonesia,
}

// ---- watch it run (plan 07): the day player follows the live simulator, the screening runs on the worker pool ----

type Watch = {
  loop: Loop
  tweens: Tweens
  /** Called with every live result that is shown; the day player (mounted on the first one) follows it. */
  onResult(r: LiveResult, inputs: LiveInputs, weather: WeatherConfig): void
  /** The live worker could not start or died: the day player says it is unavailable. */
  onFail(text: string): void
  /** Drop the running glide of `key` (or all): a value written directly must not be overwritten by it. */
  stopGlide(key?: string): void
  /** Glide a tile number to its new value (jumps under reduced motion); the last value is exactly the result. */
  glide(key: string, target: number, apply: (v: number) => void): void
  player(): DayPlayer | null
  panel: Panel | null
  sweep(): SweepPanel | null
}

function ringNote(line: string): void {
  ring.push(line)
  if (ring.length > RING) ring.shift()
  const dbg = document.getElementById("debug") as HTMLDetailsElement | null
  if (dbg?.open) $("debug-events").textContent = ring.join("\n")
}

function initWatch(): Watch {
  const root = document.documentElement
  const mq = matchMedia("(prefers-reduced-motion: reduce)")
  const reduced = (): boolean => mq.matches || root.dataset.motion === "reduce"
  const loop = browserLoop((s) =>
    ringNote(`debug anim.frame_stats ${JSON.stringify(s)}`),
  )
  const tweens = createTweens(reduced)
  let offTween: (() => void) | null = null
  const motionMs = (): number =>
    Number.parseFloat(
      getComputedStyle(root).getPropertyValue("--tv-motion-base"),
    ) || 0
  const log = (e: string, f: Record<string, string | number | boolean>): void =>
    ringNote(`info ${e} ${JSON.stringify(f)}`)
  const debugOn = testHooksEnabled(location.hash)
  /** Production keeps info and error only; per-point and per-frame events are debug and are recorded under #test. */
  const wlog = (
    e: string,
    l: "debug" | "info" | "error",
    f: Record<string, string | number | boolean>,
  ): void => {
    if (l === "debug" && !debugOn) return
    ringNote(`${l} ${e} ${JSON.stringify(f)}`)
  }
  const detailsEl = document.getElementById(
    "details-screening",
  ) as HTMLDetailsElement | null
  const tabsEl = document.getElementById("watch-tabs")
  const tabNow = (): string =>
    tabsEl
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.getAttribute("data-tab") ?? "screening"
  const ensureSweep = (): void => {
    const root = document.querySelector<HTMLElement>("[data-watch-sweep]")
    if (sweep || !root) return
    const ctx = contextFromJson(D.ctxJson)
    sweep = mountSweepPanel(root, {
      ctx,
      ctxJson: D.ctxJson,
      workerUrl: URL.createObjectURL(
        new Blob([D.workerSrc], { type: "text/javascript" }),
      ),
      variables: sweepVariables(ctx.ranges, ctx.weather),
      live: () =>
        lastInputs ?? defaultLiveState(ctx.ranges, ctx.weather).inputs,
      loop,
      inline: inlineSweepLane,
      log: wlog,
    })
  }
  /** The comparison and the sweep work only while their tab is on screen (plan 08 D12). */
  const syncOpen = (): void => {
    const open = detailsEl?.open === true
    const tab = tabNow()
    compare?.setOpen(open && tab === "compare")
    if (open && tab === "sweep") ensureSweep()
    sweep?.setOpen(open && tab === "sweep")
  }
  detailsEl?.addEventListener("toggle", syncOpen)
  tabsEl?.addEventListener("tabs-change", syncOpen)

  let player: DayPlayer | null = null
  let compare: ComparePanel | null = null
  let sweep: SweepPanel | null = null
  let lastInputs: LiveInputs | null = null
  let lastKey = ""
  const dayRoot = document.querySelector<HTMLElement>("[data-watch-day]")
  const sw = document.querySelector<HTMLInputElement>(
    '[data-anim="reduce-motion"]',
  )
  const w: Watch = {
    loop,
    tweens,
    panel: null,
    sweep: () => sweep,
    player: () => player,
    stopGlide: (key) => tweens.stop(key),
    glide(key, target, apply) {
      tweens.to(key, target, apply, motionMs())
      if (tweens.active() > 0 && offTween === null)
        offTween = loop.add((_dt, now) => {
          tweens.tick(now)
          if (tweens.active() === 0) {
            offTween?.()
            offTween = null
          }
        })
    },
    onResult(r, inputs, weather) {
      if (!dayRoot) return
      const data = dayDataOf(r, inputs, weather)
      if (player) player.setData(data)
      else {
        const deps = browserDayDeps(loop, log)
        deps.reduced = reduced
        deps.onReducedChange = (cb) => {
          mq.addEventListener("change", cb)
          sw?.addEventListener("change", cb)
        }
        player = mountDayPlayer(dayRoot, data, deps)
      }
      // plan 08: the lanes follow the day player's clock; a changed live input cancels and marks the sweep stale
      const compareRoot = document.querySelector<HTMLElement>(
        "[data-watch-compare]",
      )
      if (player && compareRoot && !compare) {
        compare = mountComparePanel(compareRoot, player, { log: wlog })
        syncOpen()
      }
      compare?.update(r, inputs, weather)
      lastInputs = inputs
      const k = JSON.stringify(inputs)
      if (k !== lastKey) {
        lastKey = k
        sweep?.liveChanged()
      }
    },
    onFail(text) {
      if (!dayRoot) return
      dayRoot.dataset.state = "unavailable"
      let note = dayRoot.querySelector<HTMLElement>('[data-anim="day-status"]')
      if (!note) {
        note = mk("p", "page-hint")
        note.dataset.anim = "day-status"
        note.setAttribute("role", "alert")
        dayRoot.append(note)
      }
      note.textContent = `${text} The day player needs the live simulator.`
      for (const e of dayRoot.querySelectorAll("button,input,select"))
        (e as HTMLInputElement).disabled = true
    },
  }
  sw?.addEventListener("change", () => {
    if (sw.checked) root.dataset.motion = "reduce"
    else root.removeAttribute("data-motion")
  })

  const screenRoot = document.querySelector<HTMLElement>(
    "[data-watch-screening]",
  )
  if (screenRoot) {
    w.panel = mountScreeningPanel(screenRoot, {
      data: D.screening,
      ctxJson: D.ctxJson,
      workerUrl: URL.createObjectURL(
        new Blob([D.workerSrc], { type: "text/javascript" }),
      ),
      draws: 32,
      inline: (c, d, draws) => {
        const ctx = contextFromJson(c)
        const designs = designsOf(d)
        return (tasks) => screenChunk(ctx, designs, d.scenarios, tasks, draws)
      },
      log: wlog,
    })
  }
  return w
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

function initLive(watch: Watch): LiveApi {
  const root = $("live-root")
  let cfg: { ranges: MaterialRanges; weather: WeatherConfig }
  try {
    cfg = JSON.parse(D.ctxJson) as typeof cfg
  } catch {
    // an unreadable model context (F7): say so, show no numbers, and let the rest of the page work
    const text =
      "The live simulator could not start because its model data is unreadable. The static results below still work."
    const st = $("live-status")
    st.textContent = text
    st.setAttribute("role", "alert")
    watch.onFail(text)
    return {
      burst: () => Promise.reject(new Error("live simulator unavailable")),
    }
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

  // a worker that cannot start or has died: say so loudly, turn the controls off, and show no stale numbers
  const fail = (text: string): void => {
    watch.onFail(text)
    watch.stopGlide()
    worker = null
    inFlight = null
    pending = null
    busy()
    status.textContent = text
    status.className = "live-status--fail"
    status.setAttribute("role", "alert")
    for (const e of $("live-controls").querySelectorAll("input,select"))
      (e as HTMLInputElement).disabled = true
    for (const e of tiles.querySelectorAll(".tile-value"))
      e.textContent = "unavailable"
    for (const e of tiles.querySelectorAll(".tile-range"))
      e.textContent = "the live simulator is not running"
  }

  // ---- scheduler (D3): one request in flight, one pending (the newest), results shown only when newer ----
  let requested = 0
  let shownId = 0
  let doneId = 0
  let inFlight: { id: number; t: number; inputs: LiveInputs } | null = null
  let pending: { id: number; inputs: LiveInputs; t: number } | null = null
  let frame = 0
  let lastInputs: LiveInputs = structuredClone(inputs)
  const shownLog: number[] = []
  let worker: Worker | null = null

  const busy = (): void => {
    const el = document.getElementById("live-computing")
    if (!el) return
    const on = worker !== null && (inFlight !== null || pending !== null)
    el.dataset.state = on ? "busy" : "idle"
    const txt = el.querySelector(".tv-computing__text")
    if (txt) txt.textContent = on ? "Computing in your browser" : "Idle"
  }
  const pump = (): void => {
    if (worker === null || inFlight !== null || pending === null) return
    const p = pending
    pending = null
    inFlight = { id: p.id, t: p.t, inputs: p.inputs }
    busy()
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
    busy()
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
    const val = e.querySelector(".tile-value") as HTMLElement
    val.dataset.tween = ""
    if (Number.isFinite(nom))
      watch.glide(`tile-${t.id}`, nom, (v) => {
        val.textContent = fmtValue(v, t.digits)
      })
    else {
      watch.stopGlide(`tile-${t.id}`)
      val.textContent = fmtValue(nom, t.digits)
    }
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
    sent: LiveInputs | undefined,
  ): void => {
    shownId = m.id
    if (sent) watch.onResult(m.result, sent, cfg.weather)
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
      if (m.id > shownId) show(m, sent?.t ?? performance.now(), sent?.inputs)
      busy()
      schedule()
    } else {
      inFlight = null
      busy()
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
    const lab = mk("label", undefined, liveLabel(s))
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
    nb.step = String(s.step)
    nb.value = liveValue(s.step, s.value)
    rangeEls.set(s.key, rg)
    numEls.set(s.key, nb)
    const after = (src: "range" | "box"): void => {
      commit()
      const v = String(get(s))
      if (src === "range") nb.value = liveValue(s.step, get(s))
      rg.value = v
      if (s.group === "scenario") preset.value = "custom"
      request()
    }
    const typed = (): number | null => {
      const v = Number.parseFloat(nb.value)
      return nb.value.trim() !== "" &&
        Number.isFinite(v) &&
        v >= s.min &&
        v <= s.max
        ? v
        : null
    }
    rg.addEventListener("input", () => {
      put(s, Number(rg.value))
      after("range")
    })
    // an empty, minus or out-of-range entry leaves the previous result on screen and marks the box; blur restores a valid value
    nb.addEventListener("input", () => {
      const v = typed()
      if (v === null) {
        nb.setAttribute("aria-invalid", "true")
        return
      }
      nb.removeAttribute("aria-invalid")
      put(s, v)
      after("box")
    })
    nb.addEventListener("change", () => {
      nb.removeAttribute("aria-invalid")
      const v = Number.parseFloat(nb.value)
      if (Number.isFinite(v)) put(s, v)
      commit()
      nb.value = liveValue(s.step, get(s))
      rg.value = String(get(s))
      request()
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
      ;(numEls.get(s.key) as HTMLInputElement).value = liveValue(s.step, get(s))
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
    worker.onerror = () =>
      fail("The live simulator stopped. The static results below still work.")
    worker.postMessage({ type: "init", ctxJson: D.ctxJson })
  } catch {
    fail(
      "This browser cannot start the live simulator. The static results below still work.",
    )
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
  // the toggle button itself (click, data-theme, storage, aria-pressed) is in the component script; the figures redraw on its event
  document.addEventListener("spandek-theme", redrawAll)
  const opened: HTMLDetailsElement[] = []
  window.addEventListener("beforeprint", () => {
    printing = true
    for (const d of document.querySelectorAll("details:not([open])")) {
      ;(d as HTMLDetailsElement).open = true
      opened.push(d as HTMLDetailsElement)
    }
    redrawAll()
  })
  window.addEventListener("afterprint", () => {
    printing = false
    for (const d of opened.splice(0)) d.open = false
    redrawAll()
  })
}

initTheme()
renderExplorer()
renderCurves()
renderSensitivity()
for (const [id, init] of Object.entries(SECTION_INIT))
  if (id in D.ext) init(D.ext[id], (fid, spec) => void draw(fid, spec))
const watch = initWatch()
const live = initLive(watch)
if (location.hash === "#test") installTestHooks(live)
if (testHooksEnabled(location.hash))
  window.__anim = {
    frames: () => watch.loop.frames(),
    state: () => watch.player()?.state() ?? null,
    killWorker: (id) => watch.panel?.killLane(id),
    tweening: () => watch.tweens.active(),
    sweep: () => watch.sweep()?.state() ?? null,
    sweepKill: (id) => watch.sweep()?.killLane(id),
    sweepStats: () => watch.sweep()?.poolStats() ?? null,
  }
