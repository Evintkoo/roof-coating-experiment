// Report sheet R37: the comparison panel (plan 08 FR-1 to FR-4): five lanes of the recipe against bare aluminium (C0) and the commercial
// datasheet product (C1) over the day, and under each lane the difference at the cursor. Markup only; src/web/anim/comparePanel.ts wires
// it to the day player's clock. It owns no clock and no controls.
import { LANE_IDS, type LaneId } from "../../../core/anim/compare"
import { badge } from "../atoms/badge"
import { buildError, esc, finite, oneOf, tag } from "../html"
import { laneChart } from "../molecules/laneChart"
import { HONESTY_LABEL } from "./watchDay"

export type CompareLane = {
  id: LaneId
  unit: string
  recipe: readonly number[]
  c0: readonly number[]
  c1: readonly number[] | null
}
export type CompareDiff = Record<LaneId, { c0: number; c1: number | null }>

export const C1_NOTE =
  "C1 is a commercial datasheet product made in the US (initial values from its brochure, thermal quantities only, not an Indonesian datasheet)."
export const COMPARE_NOTE =
  "Reflected and absorbed sunlight follow the day's irradiance and each line's solar reflectance; conducted heat follows the solved surface temperature; the cumulative lane adds the conducted heat up. Initial values only: ageing is not shown."

/** The unit of a difference: a temperature difference is in K, everything else keeps the lane's unit. */
export const diffUnit = (unit: string): string => (unit === "°C" ? "K" : unit)

/** A signed difference as text, one decimal, with a real minus sign. */
export function formatDiff(v: number, unit: string): string {
  const r = Math.round(v * 10) / 10
  const sign = r > 0 ? "+" : r < 0 ? "−" : ""
  return `${sign}${Math.abs(r).toFixed(1)} ${diffUnit(unit)}`
}

const SHORT: Record<LaneId, string> = {
  surface_c: "Surface temperature",
  reflected: "Reflected sunlight",
  absorbed: "Absorbed sunlight",
  conducted: "Conducted heat",
  cumulative_wh: "Cumulative heat",
}

export type WatchCompareProps = {
  lanes: readonly CompareLane[]
  diff: CompareDiff
  tH: number
  id?: string
}

export function watchCompare(p: WatchCompareProps): string {
  const tH = finite("WatchCompare", "tH", p.tH)
  if (p.lanes.length !== LANE_IDS.length)
    return buildError("WatchCompare", "the comparison needs the five lanes")
  const cells = p.lanes.map((l) => {
    const id = oneOf("WatchCompare", LANE_IDS, l.id)
    const d = p.diff[id]
    if (!d || !Number.isFinite(d.c0))
      return buildError("WatchCompare", `lane ${id} has no finite difference`)
    const out = (k: "c0" | "c1", label: string, v: number | null): string =>
      v === null
        ? `<span class="tv-watchcompare__none">${esc(label)}: not available</span>`
        : `<span>${esc(label)} <output data-anim="diff" data-lane="${id}" data-control="${k}" data-value="${v}">${esc(formatDiff(v, l.unit))}</output></span>`
    return tag(
      "div",
      {
        class: "tv-watchcompare__lane",
        "data-anim": "lane-slot",
        "data-lane": id,
      },
      `<div data-anim="lane-fig">${laneChart({ lane: id, unit: l.unit, recipe: l.recipe, c0: l.c0, c1: l.c1, tH, source: `lane:${id}` })}</div>` +
        `<p class="tv-watchcompare__diff" aria-label="${esc(SHORT[id])}, recipe minus the controls at the cursor">${out("c0", "Recipe minus C0", d.c0)}${out("c1", "minus C1", d.c1)}</p>`,
    )
  })
  return tag(
    "div",
    {
      class: "tv-watchcompare",
      id: p.id,
      role: "group",
      "aria-label": "The recipe against the controls over one day",
      "data-watch-compare": true,
    },
    `<div class="tv-watchcompare__label">${badge({ tone: "neutral", label: HONESTY_LABEL })}` +
      `<span class="tv-watchcompare__key tv-watchcompare__key--recipe">Recipe</span>` +
      `<span class="tv-watchcompare__key tv-watchcompare__key--c0">C0 bare aluminium</span>` +
      `<span class="tv-watchcompare__key tv-watchcompare__key--c1">C1 commercial datasheet product</span>` +
      `<output class="tv-watchcompare__time" data-anim="compare-time" data-value="${tH}"></output></div>` +
      `<div class="tv-watchcompare__grid">${cells.join("")}</div>` +
      `<p class="page-hint" data-anim="compare-note">${esc(COMPARE_NOTE)} ${esc(C1_NOTE)} Move the day player above to move the cursor in every lane.</p>`,
  )
}
