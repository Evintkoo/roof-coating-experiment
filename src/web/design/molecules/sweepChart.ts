// Report sheet R36: one outcome of the one-variable sweep (plan 08 FR-7): the modelled curve over the swept range, its p5 to p95 band
// (parameter uncertainty only), the control lines and a cursor. A control line is drawn only where the models give one; where they do not
// (C1 for corrosion, delamination and cost: datasheet, not modelled) the chart says so in words. Every series declares its data source.
import { buildError, esc, finite, oneOf, svgTag, tag } from "../html"
import { proxyBadge } from "./proxyBadge"

export const SWEEP_W = 320
export const SWEEP_H = 150
const L = 44
const R = 10
const T = 24
const B = 34
const f = (n: number): string => String(Math.round(n * 100) / 100)

export const SWEEP_OUTCOMES = [
  "t_max_c",
  "r_solar",
  "corrosion_risk",
  "delam_proxy",
  "cost_proxy",
] as const
export type SweepOutcome = (typeof SWEEP_OUTCOMES)[number]
export const CONTROL_KINDS = ["flat", "curve"] as const
export type ControlKind = (typeof CONTROL_KINDS)[number]

export const OUTCOME_INFO: Record<
  SweepOutcome,
  { title: string; proxy: boolean }
> = {
  t_max_c: { title: "Peak surface temperature (°C)", proxy: false },
  r_solar: { title: "Solar reflectance (0 to 1)", proxy: false },
  corrosion_risk: { title: "Corrosion risk (0 to 1)", proxy: true },
  delam_proxy: { title: "Delamination risk (0 to 1)", proxy: true },
  cost_proxy: { title: "Cost (relative cost units)", proxy: true },
}
export const BAND_LEGEND = "p5 to p95 band, parameter uncertainty only"
export const NO_C1_TEXT = "C1: datasheet, not modelled"
export const NO_C0_TEXT = "Bare aluminium: not modelled"
export const LAYER_OFF_TEXT = "Not modelled while this layer is off"

export type SweepChartProps = {
  outcome: SweepOutcome
  /** The swept values (ascending, at least two). */
  xs: readonly number[]
  nominal: readonly number[]
  lo: readonly number[] | null
  hi: readonly number[] | null
  c0: readonly number[]
  c1: readonly number[] | null
  controlKind: ControlKind
  /** The cursor position in the units of `xs`. */
  cursor: number
  unit: string
  xLabel: string
}

export type SweepGeometry = {
  x: (v: number) => number
  y: (v: number) => number
  x0: number
  x1: number
  yMin: number
  yMax: number
}

const finiteOnly = (v: readonly number[]): number[] =>
  v.filter((x) => Number.isFinite(x))

export function sweepChartGeometry(
  xs: readonly number[],
  series: readonly (readonly number[])[],
): SweepGeometry {
  const x0 = xs[0] as number
  const x1 = xs[xs.length - 1] as number
  const all = series.flatMap(finiteOnly)
  let lo = all.length ? Math.min(...all) : 0
  let hi = all.length ? Math.max(...all) : 1
  if (!(hi > lo)) {
    lo -= 0.5
    hi += 0.5
  }
  const pad = (hi - lo) * 0.08
  const yMin = lo - pad
  const yMax = hi + pad
  return {
    x0,
    x1,
    yMin,
    yMax,
    x: (v) => L + ((v - x0) / (x1 - x0)) * (SWEEP_W - L - R),
    y: (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (SWEEP_H - T - B),
  }
}

/** A polyline that lifts the pen at every gap (a failed or unmodelled point is a gap, never interpolated). */
export function sweepPath(
  xs: readonly number[],
  v: readonly number[],
  g: SweepGeometry,
): string {
  let out = ""
  let pen = false
  v.forEach((y, i) => {
    if (!Number.isFinite(y)) {
      pen = false
      return
    }
    out += `${pen ? "L" : "M"}${f(g.x(xs[i] as number))} ${f(g.y(y))}`
    pen = true
  })
  return out
}

function bandPath(
  xs: readonly number[],
  lo: readonly number[],
  hi: readonly number[],
  g: SweepGeometry,
): string {
  const ok = xs
    .map((_, i) => i)
    .filter((i) => Number.isFinite(lo[i]) && Number.isFinite(hi[i]))
  if (ok.length < 2) return ""
  const up = ok
    .map(
      (i, k) =>
        `${k === 0 ? "M" : "L"}${f(g.x(xs[i] as number))} ${f(g.y(hi[i] as number))}`,
    )
    .join("")
  const down = [...ok]
    .reverse()
    .map((i) => `L${f(g.x(xs[i] as number))} ${f(g.y(lo[i] as number))}`)
    .join("")
  return `${up}${down}Z`
}

const tick = (v: number): string => String(Number(v.toPrecision(3)))

export function sweepChart(p: SweepChartProps): string {
  const outcome = oneOf("SweepChart", SWEEP_OUTCOMES, p.outcome)
  const kind = oneOf("SweepChart", CONTROL_KINDS, p.controlKind)
  const n = p.xs.length
  if (n < 2)
    return buildError("SweepChart", "a sweep needs at least two points")
  for (const x of p.xs)
    if (!Number.isFinite(x))
      return buildError("SweepChart", "swept values must be finite")
  for (let i = 1; i < n; i++)
    if (!((p.xs[i] as number) > (p.xs[i - 1] as number)))
      return buildError("SweepChart", "swept values must ascend")
  if (
    typeof p.unit !== "string" ||
    typeof p.xLabel !== "string" ||
    p.xLabel.trim() === ""
  )
    return buildError("SweepChart", "a sweep chart needs a unit and an x label")
  const cursor = finite("SweepChart", "cursor", p.cursor)
  if ((p.lo === null) !== (p.hi === null))
    return buildError("SweepChart", "the band needs both edges or none")
  const sets = [
    p.nominal,
    p.c0,
    ...(p.c1 ? [p.c1] : []),
    ...(p.lo && p.hi ? [p.lo, p.hi] : []),
  ]
  for (const s of sets)
    if (s.length !== n)
      return buildError("SweepChart", "all series must match the swept values")
  // the control kind is a claim about the data (H8): a flat line must be flat
  for (const c of [p.c0, p.c1]) {
    if (!c || kind !== "flat") continue
    const v = finiteOnly(c)
    if (v.length > 0 && Math.max(...v) - Math.min(...v) > 1e-9)
      return buildError("SweepChart", "a flat control line must not vary")
  }
  const hasNominal = finiteOnly(p.nominal).length > 0
  const hasC0 = finiteOnly(p.c0).length > 0
  const hasC1 = p.c1 !== null && finiteOnly(p.c1).length > 0
  const g = sweepChartGeometry(p.xs, [
    p.nominal,
    ...(hasC0 ? [p.c0] : []),
    ...(hasC1 && p.c1 ? [p.c1] : []),
    ...(p.lo && p.hi ? [p.lo, p.hi] : []),
  ])
  const info = OUTCOME_INFO[outcome]
  const src = `sweep:${outcome}`
  const grid: string[] = []
  for (const v of [g.x0, 0.5 * (g.x0 + g.x1), g.x1])
    grid.push(
      `<line class="tv-sweep__grid" x1="${f(g.x(v))}" x2="${f(g.x(v))}" y1="${T}" y2="${SWEEP_H - B}"/><text class="tv-sweep__tick" x="${f(g.x(v))}" y="${SWEEP_H - B + 14}" text-anchor="middle">${tick(v)}</text>`,
    )
  for (const v of [g.yMin, 0.5 * (g.yMin + g.yMax), g.yMax])
    grid.push(
      `<line class="tv-sweep__grid" x1="${L}" x2="${SWEEP_W - R}" y1="${f(g.y(v))}" y2="${f(g.y(v))}"/><text class="tv-sweep__tick" x="${L - 4}" y="${f(g.y(v) + 4)}" text-anchor="end">${tick(v)}</text>`,
    )
  const band = p.lo && p.hi ? bandPath(p.xs, p.lo, p.hi, g) : ""
  const cx = f(g.x(Math.min(g.x1, Math.max(g.x0, cursor))))
  const svg = svgTag(
    {
      class: "tv-sweep",
      viewBox: `0 0 ${SWEEP_W} ${SWEEP_H}`,
      role: "img",
      "aria-label": `${info.title} against ${p.xLabel}${p.unit ? ` (${p.unit})` : ""}: the modelled curve${band ? " with its p5 to p95 band" : ""} and the control lines`,
      "data-sweep-chart": outcome,
      "data-x0": g.x0,
      "data-x1": g.x1,
      "data-ymin": f(g.yMin),
      "data-ymax": f(g.yMax),
    },
    `<g>${grid.join("")}</g>` +
      `<text class="tv-sweep__title" x="${L}" y="${T - 10}">${esc(info.title)}</text>` +
      `<text class="tv-sweep__axis" x="${f(0.5 * (L + SWEEP_W - R))}" y="${SWEEP_H - 6}" text-anchor="middle">${esc(p.xLabel)}${p.unit ? ` (${esc(p.unit)})` : ""}</text>` +
      (band
        ? `<path class="tv-sweep__band" data-source="${src}:band" d="${band}"/>`
        : "") +
      (hasC0
        ? `<path class="tv-sweep__line tv-sweep__line--c0" data-source="${src}:c0" data-control-kind="${kind}" d="${sweepPath(p.xs, p.c0, g)}"/>`
        : "") +
      (hasC1 && p.c1
        ? `<path class="tv-sweep__line tv-sweep__line--c1" data-source="${src}:c1" data-control-kind="${kind}" d="${sweepPath(p.xs, p.c1, g)}"/>`
        : "") +
      (hasNominal
        ? `<path class="tv-sweep__line tv-sweep__line--recipe" data-source="${src}:nominal" d="${sweepPath(p.xs, p.nominal, g)}"/>`
        : `<text class="tv-sweep__missing" x="${f(0.5 * (L + SWEEP_W - R))}" y="${f(0.5 * (T + SWEEP_H - B))}" text-anchor="middle">${esc(LAYER_OFF_TEXT)}</text>`) +
      `<line class="tv-sweep__cursor" data-source="clock:sweep" x1="${cx}" x2="${cx}" y1="${T}" y2="${SWEEP_H - B}"/>` +
      (hasNominal
        ? `<circle class="tv-sweep__dot" data-source="${src}:nominal@x" r="4" cx="${cx}" cy="${f(g.y(finiteOnly(p.nominal)[0] as number))}"/>`
        : ""),
  )
  const notes: string[] = []
  if (band) notes.push(BAND_LEGEND)
  else if (outcome === "cost_proxy")
    notes.push("no band: the cost model has no uncertainty draws")
  if (!hasC1) notes.push(NO_C1_TEXT)
  if (!hasC0) notes.push(NO_C0_TEXT)
  const badge = info.proxy ? proxyBadge({ tone: "proxy" }) : ""
  return tag(
    "figure",
    { class: "tv-sweep-frame", "data-outcome": outcome },
    svg +
      tag(
        "figcaption",
        { class: "tv-sweep__legend" },
        `${badge}${notes.map((x) => `<span class="tv-sweep__note">${esc(x)}</span>`).join("")}`,
      ),
  )
}
