// Report sheet R32: the 96 x 9 screening grid, one SVG rect per candidate and scenario cell, filled as results arrive. The colour is
// a bin of the cell's value on a sequential scale (class `tv-cell--b<k>`), plus a failed state; empty cells are outlined.
import { buildError, finite, oneOf, svgTag, tag } from "../html"

export const CELL_STATES = ["empty", "filled", "failed"] as const
export type CellState = (typeof CELL_STATES)[number]
export const GRID_BINS = 7
const CW = 9
const CH = 9
const GAP = 1

/** Bin 0..6 of a value on [min, max] (clamped); the one mapping the page uses. */
export function cellBin(v: number, min: number, max: number): number {
  if (!Number.isFinite(v) || !(max > min)) return 0
  const x = (v - min) / (max - min)
  return Math.min(GRID_BINS - 1, Math.max(0, Math.floor(x * GRID_BINS)))
}

export function cellClass(state: CellState, bin = 0): string {
  const s = oneOf("CellGrid", CELL_STATES, state)
  return s === "filled" ? `tv-cell tv-cell--b${bin}` : `tv-cell tv-cell--${s}`
}

export function cellGrid(p: {
  candidates: number
  scenarios: number
  label?: string
}): string {
  const nc = finite("CellGrid", "candidates", p.candidates)
  const ns = finite("CellGrid", "scenarios", p.scenarios)
  if (!Number.isInteger(nc) || !Number.isInteger(ns) || nc < 1 || ns < 1)
    return buildError(
      "CellGrid",
      "candidates and scenarios must be positive integers",
    )
  let rects = ""
  for (let c = 0; c < nc; c++)
    for (let s = 0; s < ns; s++)
      rects += `<rect class="${cellClass("empty")}" data-cell="${c * ns + s}" x="${s * (CW + GAP)}" y="${c * (CH + GAP)}" width="${CW}" height="${CH}"/>`
  return svgTag(
    {
      class: "tv-cellgrid",
      viewBox: `0 0 ${ns * (CW + GAP)} ${nc * (CH + GAP)}`,
      role: "img",
      "aria-label":
        p.label ??
        `Screening grid: ${nc} candidates by ${ns} weather scenarios, filled as results arrive`,
      "data-anim": "grid",
      "data-source": "screening:t_max",
      "data-cols": ns,
    },
    rects,
  )
}
