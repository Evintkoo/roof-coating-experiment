// Report sheet R40: the temperature drop from the surface to the inside (plan 09 FR-8). It holds exactly what the model has: the surface
// temperature, the inside temperature and the straight line of the model's own conduction law. There is no temperature per layer in any
// model of the repo, so none is drawn; the label says so. Markup only; src/web/anim/physicsPanel.ts moves the two dots.
import { buildError, esc, finite, svgTag } from "../html"
import { SCENE_H, SURF_Y } from "./physicsScene"

export const DROP_W = 150
export const DROP_SURFACE_Y = SURF_Y
export const DROP_INSIDE_Y = SURF_Y + 76
const T_LO_K = 280
const T_HI_K = 380
const X_LO = 24
const X_HI = 126
const f = (n: number): string => String(Math.round(n * 100) / 100)

/** x of a temperature on the fixed 280 to 360 K axis (clamped to the drawing); a straight line joins the two dots. */
export const dropX = (tK: number): number =>
  Math.min(
    X_HI,
    Math.max(X_LO, X_LO + ((tK - T_LO_K) / (T_HI_K - T_LO_K)) * (X_HI - X_LO)),
  )

export type DropProfileProps = {
  tSurfaceK: number
  tInsideK: number
  rTotal: number
  /** The data-source prefix, e.g. "stepper:recipe". */
  source: string
}

const C = "DropProfile"
export function dropProfile(p: DropProfileProps): string {
  const ts = finite(C, "tSurfaceK", p.tSurfaceK)
  const ti = finite(C, "tInsideK", p.tInsideK)
  const r = finite(C, "rTotal", p.rTotal)
  if (!(r > 0)) return buildError(C, "R_total must be positive")
  if (typeof p.source !== "string" || p.source.trim() === "")
    return buildError(C, "a drop needs a data source")
  const xs = dropX(ts)
  const xi = dropX(ti)
  const s = esc(p.source)
  return svgTag(
    {
      class: "tv-drop",
      viewBox: `0 0 ${DROP_W} ${SCENE_H}`,
      role: "img",
      "aria-label":
        "Temperature at the surface and inside, joined by the model's straight conduction law. Illustrative scale: the model has one surface temperature, not a temperature per layer.",
      "data-drop-profile": true,
      "data-r-total": f(r),
      "data-source": `${s}:r_total`,
    },
    `<line class="tv-drop__axis" x1="${X_LO}" x2="${X_HI}" y1="${DROP_INSIDE_Y + 32}" y2="${DROP_INSIDE_Y + 32}"/>` +
      `<text class="tv-drop__note" x="${X_LO}" y="${DROP_INSIDE_Y + 44}">${T_LO_K - 273} to ${T_HI_K - 273} °C</text>` +
      `<line class="tv-drop__law" data-anim="drop-law" data-source="${s}:conduction_law" x1="${f(xs)}" y1="${DROP_SURFACE_Y}" x2="${f(xi)}" y2="${DROP_INSIDE_Y}"/>` +
      `<circle class="tv-drop__dot" data-anim="drop-surface" data-source="${s}:t_k" data-value="${f(ts)}" cx="${f(xs)}" cy="${DROP_SURFACE_Y}" r="5"/>` +
      `<circle class="tv-drop__dot" data-anim="drop-inside" data-source="${s}:t_inside_k" data-value="${f(ti)}" cx="${f(xi)}" cy="${DROP_INSIDE_Y}" r="5"/>` +
      `<text class="tv-drop__value" data-anim="drop-surface-text" data-source="${s}:t_k" x="${X_LO}" y="${DROP_SURFACE_Y - 12}">surface ${f(ts - 273.15)} °C</text>` +
      `<text class="tv-drop__value" data-anim="drop-inside-text" data-source="${s}:t_inside_k" x="${X_LO}" y="${DROP_INSIDE_Y + 22}">inside ${f(ti - 273.15)} °C</text>` +
      `<text class="tv-drop__note" x="${X_LO}" y="58">straight line:</text><text class="tv-drop__note" x="${X_LO}" y="72">conduction law</text>` +
      `<text class="tv-drop__note" x="${X_LO}" y="14">Illustrative scale: one</text><text class="tv-drop__note" x="${X_LO}" y="28">surface temperature,</text><text class="tv-drop__note" x="${X_LO}" y="42">none per layer</text>`,
  )
}
