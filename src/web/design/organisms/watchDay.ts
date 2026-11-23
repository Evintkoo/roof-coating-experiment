// Report sheet R33: the day player. A play and pause button, step by hour, a scrubber, the clock and a speed select; the day chart
// with the cursor; the heat arrows; the readouts at the cursor. All of it carries the honesty label; nothing here moves until the
// script (src/web/anim/dayPlayer.ts) is told to, and it never moves under reduced motion unless the reader presses play.

import type { Flux } from "../../anim/flux"
import { badge } from "../atoms/badge"
import { type PlayState, playButton } from "../atoms/playButton"
import { scrubber } from "../atoms/scrubber"
import { type Speed, speedSelect } from "../atoms/speedSelect"
import { timeReadout } from "../atoms/timeReadout"
import { buildError, esc, tag } from "../html"
import { type DayChartData, dayChart } from "../molecules/dayChart"
import { fluxSchematic } from "../molecules/fluxSchematic"

export const HONESTY_LABEL = "Model output, not a measurement"

export type WatchDayProps = {
  /** The recipe's name (an id such as SP-075). */
  name: string
  data: DayChartData
  flux?: Flux
  refs?: Flux
  tH?: number
  state?: PlayState
  speed?: Speed
  id?: string
  /** Trusted markup shown beside the honesty label (the page's reduce-motion switch). */
  labelExtra?: string
}

const READ = [
  ["recipe", "Coated recipe"],
  ["bare", "Bare aluminium"],
  ["lo", "Band, low edge"],
  ["hi", "Band, high edge"],
] as const

export function watchDay(p: WatchDayProps): string {
  if (typeof p.name !== "string" || p.name.trim() === "")
    return buildError("WatchDay", "the day player needs the recipe name")
  const tH = p.tH ?? 0
  const step = (dir: "back" | "fwd") =>
    tag(
      "button",
      {
        type: "button",
        class: "tv-play tv-play--step",
        "data-anim": `step-${dir}`,
        "aria-label": dir === "back" ? "Back one hour" : "Forward one hour",
      },
      dir === "back" ? "−1 h" : "+1 h",
    )
  const readouts = READ.map(
    ([k, label]) =>
      `<div class="tv-watchday__read"><dt>${esc(label)}</dt><dd><output data-anim="read" data-read="${k}" data-value="">–</output> °C</dd></div>`,
  ).join("")
  return tag(
    "div",
    {
      class: "tv-watchday",
      id: p.id,
      role: "group",
      "aria-label": "Watch it run: one day on the roof",
      "data-watch-day": true,
    },
    `<div class="tv-watchday__label">${badge({ tone: "neutral", label: HONESTY_LABEL })}${p.labelExtra ?? ""}</div>` +
      `<div class="tv-watchday__controls">${playButton({ state: p.state ?? "paused" })}${step("back")}${scrubber({ value: tH })}${timeReadout({ tH })}${step("fwd")}${speedSelect({ value: p.speed ?? 1 })}</div>` +
      `<div class="tv-watchday__stage">${dayChart({ name: p.name, data: p.data, tH })}${fluxSchematic({ name: p.name, ...(p.flux ? { flux: p.flux } : {}), ...(p.refs ? { refs: p.refs } : {}) })}</div>` +
      `<dl class="tv-watchday__readouts">${readouts}</dl>`,
  )
}
