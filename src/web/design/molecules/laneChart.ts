// Report sheet R35: one lane of the comparison (plan 08 D3): the recipe, bare aluminium (C0) and, where the datasheet gives it, the commercial
// product (C1) over the 24 h day, with a time cursor. `laneChartGeometry` is the one place the geometry is computed. Every drawn series
// declares where its numbers come from.
import { LANE_IDS, type LaneId } from "../../../core/anim/compare"
import { buildError, esc, finite, oneOf, svgTag, tag } from "../html"

export const LANE_W = 320
export const LANE_H = 124
const L = 40
const R = 8
const T = 22
const B = 20
const f = (n: number): string => String(Math.round(n * 100) / 100)

export const LANE_TITLES: Record<LaneId, string> = {
  surface_c: "Surface temperature (°C)",
  reflected: "Reflected sunlight (W/m²)",
  absorbed: "Absorbed sunlight (W/m²)",
  conducted: "Heat conducted into the building (W/m²)",
  cumulative_wh: "Cumulative heat into the building (W h/m²)",
}

export type LaneChartProps = {
  lane: LaneId
  unit: string
  recipe: readonly number[]
  c0: readonly number[]
  /** null: no C1 series for this lane (shown in words, never drawn). */
  c1: readonly number[] | null
  tH: number
  /** The data-source prefix of the lane's series, e.g. `lane:surface_c`. */
  source: string
}

export type LaneGeometry = {
  x: (tH: number) => number
  y: (v: number) => number
  yMin: number
  yMax: number
}

export function laneChartGeometry(
  series: readonly ArrayLike<number>[],
): LaneGeometry {
  const all = series.flatMap((s) => Array.from(s))
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  if (!(hi > lo)) {
    lo -= 1
    hi += 1
  }
  const pad = (hi - lo) * 0.06
  const yMin = lo - pad
  const yMax = hi + pad
  return {
    yMin,
    yMax,
    x: (t) => L + (Math.min(24, Math.max(0, t)) / 24) * (LANE_W - L - R),
    y: (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (LANE_H - T - B),
  }
}

export const lanePath = (v: readonly number[], g: LaneGeometry): string =>
  v
    .map((c, i) => `${i === 0 ? "M" : "L"}${f(g.x(i / 6))} ${f(g.y(c))}`)
    .join("")

const SOURCE = /^[a-z][a-z0-9_:]*$/

export function laneChart(p: LaneChartProps): string {
  const lane = oneOf("LaneChart", LANE_IDS, p.lane)
  if (typeof p.unit !== "string" || p.unit.trim() === "")
    return buildError("LaneChart", "a lane needs a unit")
  if (typeof p.source !== "string" || !SOURCE.test(p.source))
    return buildError("LaneChart", "source must be a plain identifier")
  const tH = finite("LaneChart", "tH", p.tH)
  const n = p.recipe.length
  if (n < 2) return buildError("LaneChart", "a lane needs at least two points")
  const sets = p.c1 ? [p.recipe, p.c0, p.c1] : [p.recipe, p.c0]
  for (const s of sets) {
    if (s.length !== n)
      return buildError("LaneChart", "all series must have the same length")
    for (const v of s)
      if (!Number.isFinite(v))
        return buildError("LaneChart", "series values must be finite")
  }
  const g = laneChartGeometry(sets)
  const grid: string[] = []
  for (let h = 0; h <= 24; h += 6)
    grid.push(
      `<line class="tv-lane__grid" x1="${f(g.x(h))}" x2="${f(g.x(h))}" y1="${T}" y2="${LANE_H - B}"/><text class="tv-lane__tick" x="${f(g.x(h))}" y="${LANE_H - B + 14}" text-anchor="middle">${String(h).padStart(2, "0")}</text>`,
    )
  const ticks = [g.yMin, 0.5 * (g.yMin + g.yMax), g.yMax]
  for (const v of ticks)
    grid.push(
      `<line class="tv-lane__grid" x1="${L}" x2="${LANE_W - R}" y1="${f(g.y(v))}" y2="${f(g.y(v))}"/><text class="tv-lane__tick" x="${L - 4}" y="${f(g.y(v) + 4)}" text-anchor="end">${Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10}</text>`,
    )
  const cx = f(g.x(tH))
  const c1 = p.c1
    ? `<path class="tv-lane__line tv-lane__line--c1" data-source="${esc(p.source)}:c1" d="${lanePath(p.c1, g)}"/>`
    : `<text class="tv-lane__missing" x="${LANE_W - R}" y="${T - 8}" text-anchor="end">C1 not available</text>`
  const svg = svgTag(
    {
      class: "tv-lane",
      viewBox: `0 0 ${LANE_W} ${LANE_H}`,
      role: "img",
      "aria-label": `${LANE_TITLES[lane]} over one day: coated recipe against bare aluminium${p.c1 ? " and the commercial datasheet product" : ""}`,
      "data-lane-chart": lane,
      "data-ymin": f(g.yMin),
      "data-ymax": f(g.yMax),
    },
    `<g>${grid.join("")}</g>` +
      `<text class="tv-lane__title" x="${L}" y="${T - 8}">${esc(LANE_TITLES[lane])}</text>` +
      `<path class="tv-lane__line tv-lane__line--c0" data-source="${esc(p.source)}:c0" d="${lanePath(p.c0, g)}"/>` +
      c1 +
      `<path class="tv-lane__line tv-lane__line--recipe" data-source="${esc(p.source)}:recipe" d="${lanePath(p.recipe, g)}"/>` +
      `<line class="tv-lane__cursor" data-source="clock:t_h" data-t="${tH}" x1="${cx}" x2="${cx}" y1="${T}" y2="${LANE_H - B}"/>`,
  )
  return tag("figure", { class: "tv-lane-frame", "data-lane": lane }, svg)
}
