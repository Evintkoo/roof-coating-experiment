// Plotly layout and colours from the design tokens, for both themes (plan 06 Task 6, D6). Pure: it takes the resolved tokens of
// one theme (see tokens.ts `resolveTheme`) and returns the colours of one figure style. The brand orange belongs to the
// recommended recipe only, the aluminium baseline is neutral, categorical series come from the validated set, and heat and
// benefit use the sequential and diverging scales. Browser and Node safe; the colour literals live in themes.ts.
import { THEMES } from "./themes"

export type PlotMode = "dark" | "light"
export type TokenMap = Readonly<Record<string, string>>

/** The fixed colour roles of a figure; a trace says which role it is and the theme picks the colour (meta.slot). */
export const SLOTS = [
  "ink",
  "recommended",
  "baseline",
  "neutral",
  "series-1",
  "series-2",
  "series-3",
  "series-4",
  "series-5",
  "series-6",
] as const
export type Slot = (typeof SLOTS)[number]

export type PlotTheme = {
  mode: PlotMode
  /** Page surface behind the figure (a #rrggbb colour). */
  paper: string
  plot: string
  /** Primary text, and the font stack. */
  font: string
  fontFamily: string
  /** Secondary text (tick labels, notes). */
  muted: string
  grid: string
  /** Axis lines, ticks and the parcoords axis stroke: never black on dark. */
  axisStroke: string
  /** Hover label fill and border (surface-elevated, border-control): a label never keeps the other theme's colours. */
  hoverBg: string
  hoverBorder: string
  /** viz-1 to viz-6. */
  colorway: readonly string[]
  recommended: string
  baseline: string
  /** Seven steps, low to high, for heat and benefit. */
  seq: readonly string[]
  /** Seven steps with a neutral midpoint, for deltas. */
  div: readonly string[]
}

/** Which token each single-colour figure role is read from: the one place the chart roles are tied to tokens (docs/design/theme-mapping.md). */
export const PLOT_ROLE_TOKENS = {
  paper: "surface-base",
  plot: "surface-base",
  font: "text-primary",
  muted: "text-muted",
  grid: "border-panel",
  axisStroke: "text-muted",
  hoverBg: "surface-elevated",
  hoverBorder: "border-control",
  recommended: "viz-recommended",
  baseline: "viz-baseline",
} as const

const need = (t: TokenMap, k: string): string => {
  const v = t[k]
  if (v === undefined) throw new Error(`plotTheme: token missing: ${k}`)
  return v
}
const run = (t: TokenMap, prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => need(t, `${prefix}${i + 1}`))

/** The figure style of one theme from its resolved tokens. */
export function plotTheme(
  mode: PlotMode,
  tokens: TokenMap,
  fontFamily: string,
): PlotTheme {
  return {
    mode,
    paper: need(tokens, PLOT_ROLE_TOKENS.paper),
    plot: need(tokens, PLOT_ROLE_TOKENS.plot),
    font: need(tokens, PLOT_ROLE_TOKENS.font),
    fontFamily,
    muted: need(tokens, PLOT_ROLE_TOKENS.muted),
    grid: need(tokens, PLOT_ROLE_TOKENS.grid),
    axisStroke: need(tokens, PLOT_ROLE_TOKENS.axisStroke),
    hoverBg: need(tokens, PLOT_ROLE_TOKENS.hoverBg),
    hoverBorder: need(tokens, PLOT_ROLE_TOKENS.hoverBorder),
    colorway: run(tokens, "viz-", 6),
    recommended: need(tokens, PLOT_ROLE_TOKENS.recommended),
    baseline: need(tokens, PLOT_ROLE_TOKENS.baseline),
    seq: run(tokens, "viz-seq-", 7),
    div: run(tokens, "viz-div-", 7),
  }
}

/** The colour of a slot. `neutral` is the baseline grey (the 96 screened candidates that are not highlighted). */
export function slotColor(theme: PlotTheme, slot: Slot): string {
  if (slot === "ink") return theme.font
  if (slot === "recommended") return theme.recommended
  if (slot === "baseline" || slot === "neutral") return theme.baseline
  return theme.colorway[Number(slot.slice("series-".length)) - 1] as string
}

/** The fallback figure style while figures are built (the page replaces it by the theme actually shown). */
export const LIGHT_PLOT: PlotTheme = plotTheme("light", THEMES.light, "inherit")

/** A piecewise colour scale (0..1) from an evenly spaced list of colours. */
export function colorScale(colors: readonly string[]): [number, string][] {
  const n = colors.length - 1
  return colors.map((c, i) => [n === 0 ? 0 : i / n, c])
}

const ALPHA = (hex: string, a: number): string =>
  /^#[0-9a-f]{6}$/i.test(hex)
    ? `${hex}${Math.round(a * 255)
        .toString(16)
        .padStart(2, "0")}`
    : hex

/** Colour with an opacity (8-digit hex when the colour is #rrggbb): the p5 to p95 band fill. */
export const withAlpha = ALPHA

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/**
 * Applies a theme to a figure spec built with `meta.slot` on its traces and `name: <slot>` on its annotations: paper, plot, font
 * (colour and family), every axis (grid, line, ticks), annotations, and each slotted trace's line, marker, fill and error bars.
 * The spec is not changed in place.
 */
export function applyPlotTheme<
  S extends { data: object[]; layout: object; config?: object },
>(spec: S, theme: PlotTheme): S {
  const layout: Rec = { ...(spec.layout as Rec) }
  layout.paper_bgcolor = theme.paper
  layout.plot_bgcolor = theme.plot
  layout.colorway = [...theme.colorway]
  layout.hoverlabel = {
    ...(isRec(layout.hoverlabel) ? layout.hoverlabel : {}),
    bgcolor: theme.hoverBg,
    bordercolor: theme.hoverBorder,
    font: { color: theme.font, family: theme.fontFamily },
  }
  layout.modebar = {
    bgcolor: "transparent",
    color: theme.muted,
    activecolor: theme.font,
  }
  layout.font = {
    ...(isRec(layout.font) ? layout.font : {}),
    color: theme.font,
    family: theme.fontFamily,
  }
  for (const k of Object.keys(layout))
    if (/^(x|y)axis\d*$/.test(k)) {
      const ax: Rec = isRec(layout[k]) ? (layout[k] as Rec) : {}
      layout[k] = {
        ...ax,
        gridcolor: theme.grid,
        zerolinecolor: theme.grid,
        linecolor: theme.axisStroke,
        tickcolor: theme.axisStroke,
        tickfont: { color: theme.muted },
      }
    }
  if (isRec(layout.legend))
    layout.legend = { ...layout.legend, font: { color: theme.font } }
  if (Array.isArray(layout.annotations))
    layout.annotations = layout.annotations.map((a) => {
      const an = a as Rec
      const slot = SLOTS.find((s) => s === an.name)
      return {
        ...an,
        font: {
          ...(isRec(an.font) ? an.font : {}),
          color: slot ? slotColor(theme, slot) : theme.muted,
        },
      }
    })
  const data = spec.data.map((tr) => {
    const t = tr as Rec
    const m = isRec(t.meta) ? t.meta : undefined
    const scale = m?.scale === "seq" ? colorScale(theme.seq) : undefined
    const slot = m ? SLOTS.find((s) => s === m.slot) : undefined
    if (slot === undefined && scale === undefined) return tr
    if (slot === undefined && scale !== undefined) {
      // a trace coloured by a sequential scale (pareto frequency): the scale and the marker outline come from the theme
      const o: Rec = { ...t }
      const edge = SLOTS.find((s) => s === m?.edge)
      for (const k of ["marker", "line"] as const) {
        const part = t[k]
        if (!isRec(part) || part.colorscale === undefined) continue
        const next: Rec = { ...part, colorscale: scale }
        if (k === "marker" && edge && isRec(part.line))
          next.line = { ...part.line, color: slotColor(theme, edge) }
        o[k] = next
      }
      return o
    }
    const c = slotColor(theme, slot as Slot)
    const out: Rec = { ...t }
    if (isRec(t.line)) out.line = { ...t.line, color: c }
    if (isRec(t.marker))
      out.marker = {
        ...t.marker,
        color: c,
        ...(isRec(t.marker.line)
          ? { line: { ...t.marker.line, color: c } }
          : {}),
      }
    if (typeof t.fillcolor === "string") out.fillcolor = withAlpha(c, 0.2)
    if (isRec(t.error_y)) out.error_y = { ...t.error_y, color: c }
    if (isRec(t.error_x)) out.error_x = { ...t.error_x, color: c }
    if (isRec(t.textfont)) out.textfont = { ...t.textfont, color: c }
    return out
  })
  return { ...spec, layout, data } as S
}
