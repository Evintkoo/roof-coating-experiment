// Report sheet R34: the parallel screening panel. One button runs the 96 x 9 screening in this browser on a pool of workers: a lane
// per worker, a cell grid that fills as results arrive, the summary, and a check line that says the values equal the batch. The
// machine's measured time is shown and labelled as such. Markup only; src/web/anim/screeningPanel.ts wires it.
import { badge } from "../atoms/badge"
import { button } from "../atoms/button"
import { buildError, esc, finite, tag } from "../html"
import { cellGrid } from "../molecules/cellGrid"
import { computingIndicator } from "../molecules/computingIndicator"
import { laneMeter } from "../molecules/laneMeter"
import { tabs } from "../molecules/tabs"
import { HONESTY_LABEL } from "./watchDay"

export const WORKER_CHOICES = ["auto", "1", "2", "4"] as const
export type WorkerChoice = (typeof WORKER_CHOICES)[number]

export type WatchScreeningProps = {
  candidates: number
  scenarios: number
  draws: number
  id?: string
  /** Plan 08 D2: when given, the panel is the first of three tabs (Screening, Against the controls, One variable at a time). */
  tabsHost?: { id: string; compare: string; sweep: string }
}

export const TAB_LABELS = {
  screening: "Screening",
  compare: "Against the controls",
  sweep: "One variable at a time",
} as const

export function watchScreening(p: WatchScreeningProps): string {
  const screen = watchScreeningPanel(p)
  if (!p.tabsHost) return screen
  const h = p.tabsHost
  return tabs({
    id: h.id,
    label: "More ways to watch",
    tabs: [
      { id: "screening", label: TAB_LABELS.screening },
      { id: "compare", label: TAB_LABELS.compare },
      { id: "sweep", label: TAB_LABELS.sweep },
    ],
  })([screen, h.compare, h.sweep])
}

function watchScreeningPanel(p: WatchScreeningProps): string {
  const nc = finite("WatchScreening", "candidates", p.candidates)
  const ns = finite("WatchScreening", "scenarios", p.scenarios)
  const draws = finite("WatchScreening", "draws", p.draws)
  if (draws < 1 || !Number.isInteger(draws))
    return buildError("WatchScreening", "draws must be a positive integer")
  const workers = WORKER_CHOICES.map(
    (w) =>
      `<option value="${w}">${w === "auto" ? "Automatic" : `${w} worker${w === "1" ? "" : "s"}`}</option>`,
  ).join("")
  return tag(
    "div",
    {
      class: "tv-watchscreen",
      id: p.id,
      role: "group",
      "aria-label": "Run the screening in your browser",
      "data-watch-screening": true,
      "data-candidates": nc,
      "data-scenarios": ns,
      "data-draws": draws,
    },
    `<div class="tv-watchscreen__label">${badge({ tone: "neutral", label: HONESTY_LABEL })}</div>` +
      `<div class="tv-watchscreen__controls">${button({ label: "Run the screening in my browser", variant: "primary" }).replace("<button ", '<button data-anim="screen-start" ')}` +
      `<label class="tv-speed"><span class="tv-speed__label">Workers</span><select class="tv-speed__select" data-anim="workers">${workers}</select></label>` +
      `<label class="tv-watchscreen__draws"><input type="checkbox" data-anim="draws"> With uncertainty draws (${draws} per cell, slower)</label>` +
      `${computingIndicator({ state: "idle" })}</div>` +
      `<div class="tv-watchscreen__stage">${laneMeter({ lanes: [], total: nc * ns })}${cellGrid({ candidates: nc, scenarios: ns })}</div>` +
      `<p class="tv-watchscreen__summary" role="status" aria-live="polite" data-anim="summary"></p>` +
      `<p class="tv-watchscreen__check" data-anim="check">${esc("The check line appears when a run finishes.")}</p>`,
  )
}
