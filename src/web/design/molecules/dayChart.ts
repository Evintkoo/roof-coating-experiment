// Report sheet R28: the 24 h day as an SVG chart of the solved surface-temperature series (recipe, bare aluminium, the p5 to p95
// band) with a time cursor and two dots. Every moving element declares its data source. `dayChartPaths` is the one place the
// geometry is computed, used at build time and by the day player when the recipe changes.
import { buildError, esc, svgTag, tag } from "../html"

export type DayChartData = {
  /** Surface temperature in degrees C, nodes at i / 6 h (144 for a day at 600 s). */
  recipeC: readonly number[]
  bareC: readonly number[]
  loC: readonly number[]
  hiC: readonly number[]
}
export const DAY_W = 640
export const DAY_H = 210
const L = 52
const R = 16
const T = 12
const B = 34
const f = (n: number): string => String(Math.round(n * 100) / 100)

export type DayGeometry = {
  x: (tH: number) => number
  y: (c: number) => number
  yMin: number
  yMax: number
}

export function checkDayData(d: DayChartData): void {
  const n = d.recipeC.length
  if (n < 2) buildError("DayChart", "a day needs at least two points")
  for (const s of [d.recipeC, d.bareC, d.loC, d.hiC]) {
    if (s.length !== n)
      buildError("DayChart", "all series must have the same length")
    for (const v of s)
      if (!Number.isFinite(v))
        buildError("DayChart", "series values must be finite")
  }
}

export function dayGeometry(d: DayChartData): DayGeometry {
  checkDayData(d)
  const all = [...d.recipeC, ...d.bareC, ...d.loC, ...d.hiC]
  const yMin = Math.floor((Math.min(...all) - 1) / 5) * 5
  const yMax = Math.ceil((Math.max(...all) + 1) / 5) * 5
  return {
    yMin,
    yMax,
    x: (t) => L + (Math.min(24, Math.max(0, t)) / 24) * (DAY_W - L - R),
    y: (c) => T + (1 - (c - yMin) / (yMax - yMin)) * (DAY_H - T - B),
  }
}

const line = (v: readonly number[], g: DayGeometry): string =>
  v
    .map((c, i) => `${i === 0 ? "M" : "L"}${f(g.x(i / 6))} ${f(g.y(c))}`)
    .join("")

export function dayChartPaths(d: DayChartData): {
  recipe: string
  bare: string
  band: string
  geometry: DayGeometry
} {
  const g = dayGeometry(d)
  const up = d.hiC
    .map((c, i) => `${i === 0 ? "M" : "L"}${f(g.x(i / 6))} ${f(g.y(c))}`)
    .join("")
  const down = [...d.loC]
    .map((c, i) => `L${f(g.x(i / 6))} ${f(g.y(c))}`)
    .reverse()
    .join("")
  return {
    recipe: line(d.recipeC, g),
    bare: line(d.bareC, g),
    band: `${up}${down}Z`,
    geometry: g,
  }
}

export function dayChart(p: {
  name: string
  data: DayChartData
  tH?: number
}): string {
  if (typeof p.name !== "string" || p.name.trim() === "")
    return buildError("DayChart", "a day chart needs a name")
  const paths = dayChartPaths(p.data)
  const g = paths.geometry
  const tH = p.tH ?? 0
  if (!Number.isFinite(tH)) return buildError("DayChart", "tH must be finite")
  const grid: string[] = []
  for (let h = 0; h <= 24; h += 6)
    grid.push(
      `<line class="tv-daychart__grid" x1="${f(g.x(h))}" x2="${f(g.x(h))}" y1="${T}" y2="${DAY_H - B}"/><text class="tv-daychart__tick" x="${f(g.x(h))}" y="${DAY_H - B + 18}" text-anchor="middle">${String(h).padStart(2, "0")}:00</text>`,
    )
  for (let c = g.yMin; c <= g.yMax; c += 10)
    grid.push(
      `<line class="tv-daychart__grid" x1="${L}" x2="${DAY_W - R}" y1="${f(g.y(c))}" y2="${f(g.y(c))}"/><text class="tv-daychart__tick" x="${L - 6}" y="${f(g.y(c) + 4)}" text-anchor="end">${c}</text>`,
    )
  const cx = f(g.x(tH))
  const svg = svgTag(
    {
      class: "tv-daychart",
      viewBox: `0 0 ${DAY_W} ${DAY_H}`,
      role: "img",
      "aria-label": `${p.name}: surface temperature over one day, coated recipe against bare aluminium, with its uncertainty band`,
      "data-daychart": true,
      "data-ymin": g.yMin,
      "data-ymax": g.yMax,
    },
    `<g>${grid.join("")}</g>` +
      `<text class="tv-daychart__axis" x="${L}" y="${T - 2}">Surface temperature, °C</text>` +
      `<path class="tv-daychart__band" data-source="band:t_surface" d="${paths.band}"/>` +
      `<g class="tv-daychart__fan" data-fan></g>` +
      `<path class="tv-daychart__line tv-daychart__line--bare" data-source="series:bare" d="${paths.bare}"/>` +
      `<path class="tv-daychart__line tv-daychart__line--recipe" data-source="series:recipe" d="${paths.recipe}"/>` +
      `<line class="tv-daychart__cursor" data-source="clock:t_h" x1="${cx}" x2="${cx}" y1="${T}" y2="${DAY_H - B}"/>` +
      `<circle class="tv-daychart__dot tv-daychart__dot--bare" data-source="series:bare@t" r="4" cx="${cx}" cy="${f(g.y(p.data.bareC[0] as number))}"/>` +
      `<circle class="tv-daychart__dot tv-daychart__dot--recipe" data-source="series:recipe@t" r="4" cx="${cx}" cy="${f(g.y(p.data.recipeC[0] as number))}"/>`,
  )
  return tag(
    "figure",
    { class: "tv-daychart-frame" },
    svg +
      `<figcaption class="tv-daychart__legend"><span class="tv-daychart__key tv-daychart__key--recipe">${esc(p.name)}</span><span class="tv-daychart__key tv-daychart__key--bare">Bare aluminium</span><span class="tv-daychart__key tv-daychart__key--band">p5 to p95 band</span></figcaption>`,
  )
}
