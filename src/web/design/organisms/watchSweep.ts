// Report sheet R38: the one-variable sweep (plan 08 FR-5 to FR-11): choose a variable, play its range from low to high and watch five
// outcomes move against the control lines. Markup only; src/web/anim/sweepPanel.ts evaluates the points on the worker pool and moves the
// cursor. Nothing here moves until the script is told to, and never under reduced motion unless the reader presses play.
import { isSweepable, type SweepVar } from "../../../core/anim/sweep"
import { unitText } from "../../liveState"
import { badge } from "../atoms/badge"
import { button } from "../atoms/button"
import { scrubber } from "../atoms/scrubber"
import { type Speed, speedSelect } from "../atoms/speedSelect"
import { buildError, esc, oneOf, tag } from "../html"
import { computingIndicator } from "../molecules/computingIndicator"
import { SWEEP_OUTCOMES } from "../molecules/sweepChart"
import { HONESTY_LABEL } from "./watchDay"

export const SWEEP_STATES = [
  "idle",
  "running",
  "ready",
  "stale",
  "error",
] as const
export type SweepState = (typeof SWEEP_STATES)[number]

export const STATE_WORDS: Record<SweepState, string> = {
  idle: "Choose a variable and press Play range. The range is computed in your browser first, then played.",
  running: "Computing the range in your browser.",
  ready: "The range is computed. Playing only moves the cursor.",
  stale:
    "The live settings changed, so this range is out of date. Press Play range to compute it again.",
  error:
    "The range could not be computed. The static results on this page are unaffected.",
}
export const LAYER_OFF_NOTE =
  "This layer is off in the live simulator, so this variable has no effect on the curves."
export const SWEEP_NOTE =
  "Every other input is held at the live simulator's values; one variable at a time, so interactions between variables are not shown. Initial values only: ageing is not shown. Cost is in relative cost units. Bands are parameter uncertainty only."

export type WatchSweepProps = {
  variables: readonly SweepVar[]
  selected: string
  state: SweepState
  layerOff?: boolean
  speed?: Speed
  id?: string
}

export const optionText = (v: SweepVar): string => {
  const u = unitText(v.unit)
  return `${v.label}${u ? ` (${u})` : ""}${isSweepable(v) ? "" : ", fixed in this configuration"}`
}

export function watchSweep(p: WatchSweepProps): string {
  const state = oneOf("WatchSweep", SWEEP_STATES, p.state)
  if (p.variables.length === 0)
    return buildError("WatchSweep", "a sweep needs at least one variable")
  if (!p.variables.some((v) => v.key === p.selected))
    return buildError("WatchSweep", "the selected variable is not in the list")
  const keys = new Set<string>()
  for (const v of p.variables) {
    if (!/^[a-z][a-z0-9_]*$/.test(v.key) || keys.has(v.key))
      return buildError(
        "WatchSweep",
        "variable keys must be distinct plain identifiers",
      )
    keys.add(v.key)
  }
  const opts = p.variables
    .map((v) =>
      tag(
        "option",
        {
          value: v.key,
          selected: v.key === p.selected,
          disabled: !isSweepable(v),
        },
        esc(optionText(v)),
      ),
    )
    .join("")
  const play = button({ label: "Play range", variant: "primary" }).replace(
    "<button ",
    '<button data-anim="sweep-play" ',
  )
  const slots = SWEEP_OUTCOMES.map(
    (o) =>
      `<div class="tv-watchsweep__chart" data-anim="sweep-chart" data-outcome="${o}"></div>`,
  ).join("")
  return tag(
    "div",
    {
      class: "tv-watchsweep",
      id: p.id,
      role: "group",
      "aria-label": "One variable at a time against the controls",
      "data-watch-sweep": true,
      "data-state": state,
    },
    `<div class="tv-watchsweep__label">${badge({ tone: "neutral", label: HONESTY_LABEL })}</div>` +
      `<div class="tv-watchsweep__controls">` +
      `<label class="tv-speed"><span class="tv-speed__label">Variable</span><select class="tv-speed__select" data-anim="sweep-var">${opts}</select></label>` +
      `${play}${scrubber({ value: 0, label: "Position along the range, low to high" }).replace('data-anim="scrub"', 'data-anim="sweep-scrub"')}` +
      `<label class="tv-speed"><span class="tv-speed__label">Value</span><input class="tv-speed__select tv-watchsweep__value" type="number" step="any" data-anim="sweep-value" aria-label="Value of the variable at the cursor"></label>` +
      `${speedSelect({ value: p.speed ?? 1 }).replace('data-anim="speed"', 'data-anim="sweep-speed"')}${computingIndicator({ state: state === "running" ? "busy" : "idle" }).replace('data-anim="computing"', 'data-anim="sweep-computing"')}</div>` +
      `<p class="page-hint" data-anim="layer-off"${p.layerOff ? "" : " hidden"}>${esc(LAYER_OFF_NOTE)}</p>` +
      `<p class="tv-watchsweep__status" role="status" aria-live="polite" data-anim="sweep-status">${esc(STATE_WORDS[state])}</p>` +
      `<div class="tv-watchsweep__charts">${slots}</div>` +
      `<p class="tv-watchsweep__readout" data-anim="sweep-readout"></p>` +
      `<p class="page-hint">${esc(SWEEP_NOTE)}</p>`,
  )
}
