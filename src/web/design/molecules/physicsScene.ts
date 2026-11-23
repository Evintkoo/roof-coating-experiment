// Report sheet R39: one pane of the live physics scene (plan 09): the stack cross-section, sunlight rays split by band into reflected and
// absorbed, and four flux arrows. Every number is a model output: ray counts are quotas of the band fractions of R(lambda) and the G173
// spectrum, arrow lengths are fluxes of the stepper at one shared scale. Markup only; src/web/anim/physicsPanel.ts moves it.
import {
  allocateRays,
  type Band,
  isReflectedRay,
  rayQuota,
} from "../../../core/anim/bands"
import type { Terms } from "../../../core/anim/stepper"
import { deriveSeed, Xoshiro128 } from "../../../core/rng"
import { buildError, esc, finite, oneOf, svgTag } from "../html"

export const SCENE_W = 380
export const SCENE_H = 292
export const SURF_Y = 124
export const TOP_Y = 14
/** One scale for every arrow of both panes: 60 px stand for 1000 W/m2. */
export const L_MAX = 60
export const REF_W_M2 = 1000
export const SCENE_PANES = ["recipe", "aluminium"] as const
export type ScenePane = (typeof SCENE_PANES)[number]
export const ARROW_KEYS = [
  "absorbed",
  "radiated",
  "convected",
  "conducted",
] as const
export type ArrowKey = (typeof ARROW_KEYS)[number]
export type SceneLayers = {
  primer: boolean
  midcoat: boolean
  topcoat: boolean
}
const LAYER_H = { topcoat: 8, midcoat: 28, primer: 8, aluminium: 30 } as const
const ARROW_X: Record<ArrowKey, number> = {
  absorbed: 262,
  radiated: 300,
  convected: 338,
  conducted: 300,
}
const LABEL: Record<ArrowKey, string> = {
  absorbed: "Absorbed",
  radiated: "Radiated",
  convected: "Convected",
  conducted: "Conducted",
}
const f = (n: number): string => String(Math.round(n * 100) / 100)

/** Y of the bottom of the stack: the conduction arrow starts here. */
export function stackBottom(layers: SceneLayers, pane: ScenePane): number {
  if (pane === "aluminium") return SURF_Y + LAYER_H.aluminium
  return (
    SURF_Y +
    LAYER_H.aluminium +
    (layers.topcoat ? LAYER_H.topcoat : 0) +
    (layers.midcoat ? LAYER_H.midcoat : 0) +
    (layers.primer ? LAYER_H.primer : 0)
  )
}

/** Arrow from the surface (or the stack bottom for conducted): absorbed and conducted point inward, radiated and convected outward; a negative flux flips it. */
export function arrowGeometry(
  key: ArrowKey,
  w: number,
  bottom: number,
): { x: number; y1: number; y2: number } {
  const len = Number.isFinite(w) ? (L_MAX * w) / REF_W_M2 : 0
  const x = ARROW_X[key]
  if (key === "absorbed") return { x, y1: SURF_Y - len, y2: SURF_Y }
  if (key === "conducted") return { x, y1: bottom, y2: bottom + len }
  return { x, y1: SURF_Y, y2: SURF_Y - len }
}

/** One ray at phase u in [0, 1): the head falls to the surface in the first half; a reflected ray then leaves, an absorbed one is gone. */
export function rayPoints(
  x: number,
  reflected: boolean,
  u: number,
): { x1: number; y1: number; x2: number; y2: number; on: boolean } {
  const span = SURF_Y - TOP_Y
  const tail = 0.18
  if (u < 0.5) {
    const v = u / 0.5
    const h = Math.min(1, v)
    const t = Math.max(0, v - tail)
    return {
      x1: x - 24 + 24 * t,
      y1: TOP_Y + span * t,
      x2: x - 24 + 24 * h,
      y2: TOP_Y + span * h,
      on: true,
    }
  }
  if (!reflected) return { x1: x, y1: SURF_Y, x2: x, y2: SURF_Y, on: false }
  const v = (u - 0.5) / 0.5
  const h = Math.min(1, v)
  const t = Math.max(0, v - tail)
  return {
    x1: x + 24 * t,
    y1: SURF_Y - span * t,
    x2: x + 24 * h,
    y2: SURF_Y - span * h,
    on: true,
  }
}

export type PhysicsSceneProps = {
  pane: ScenePane
  /** null: the spectrum is not available (F1); the scene then draws no rays and says so. */
  bands: readonly Band[] | null
  /** Rays drawn at full sunlight (the panel shows a share of them proportional to G(t)). */
  rays: number
  layers: SceneLayers
  terms: Terms
  tK: number
  /** The data-source prefix of the moving values, e.g. "stepper:recipe". */
  source: string
  seed?: number
}

const C = "PhysicsScene"
const LAYERS_DRAWN = ["topcoat", "midcoat", "primer"] as const

export function physicsScene(p: PhysicsSceneProps): string {
  const pane = oneOf(C, SCENE_PANES, p.pane)
  if (typeof p.source !== "string" || p.source.trim() === "")
    return buildError(C, "a scene needs a data source")
  const rays = Math.max(0, Math.floor(finite(C, "rays", p.rays)))
  const tK = finite(C, "tK", p.tK)
  for (const k of [
    "absorbed",
    "radiated",
    "convected",
    "conducted",
    "reflected",
    "stored",
  ] as const)
    finite(C, k, p.terms[k])
  const layers =
    pane === "recipe"
      ? p.layers
      : { primer: false, midcoat: false, topcoat: false }
  const bottom = stackBottom(layers, pane)
  const rng = new Xoshiro128(deriveSeed(p.seed ?? 20261123, 900))

  let rayMarkup = ""
  if (p.bands !== null) {
    const counts = allocateRays(p.bands, rays)
    let i = 0
    p.bands.forEach((b, bi) => {
      const n = counts[bi] as number
      const q = rayQuota(b, n)
      for (let j = 0; j < n; j++) {
        const refl = isReflectedRay(j, n, q.reflected)
        const x =
          20 + 210 * ((0.5 + i * 0.6180339887498949 + 0.04 * rng.next()) % 1)
        const u0 = (i * 0.37) % 1
        const g = rayPoints(x, refl, u0 * 0.5)
        rayMarkup += `<line class="tv-scene__ray tv-scene__ray--${b.id}${refl ? " tv-scene__ray--reflected" : ""}" data-ray="${i}" data-band="${b.id}" data-reflected="${refl ? 1 : 0}" data-x="${f(x)}" data-source="bands:${b.id}" x1="${f(g.x1)}" y1="${f(g.y1)}" x2="${f(g.x2)}" y2="${f(g.y2)}"/>`
        i++
      }
    })
  }
  const layerRects = (): string => {
    let y = SURF_Y
    let out = ""
    for (const k of LAYERS_DRAWN)
      if (layers[k]) {
        out += `<rect class="tv-scene__layer tv-scene__layer--${k}" data-layer="${k}" x="20" y="${y}" width="210" height="${LAYER_H[k]}"><title>${k}</title></rect>`
        y += LAYER_H[k]
      }
    return `${out}<rect class="tv-scene__layer tv-scene__layer--aluminium" data-layer="aluminium" x="20" y="${y}" width="210" height="${LAYER_H.aluminium}"><title>aluminium</title></rect>`
  }
  const arrows = ARROW_KEYS.map((k) => {
    const w = p.terms[k]
    const g = arrowGeometry(k, w, bottom)
    const ty = k === "conducted" ? bottom + 78 : 20
    return (
      `<g class="tv-scene__arrow tv-scene__arrow--${k}" data-arrow="${k}" data-source="${esc(p.source)}:${k}" data-w="${f(w)}">` +
      `<line x1="${g.x}" x2="${g.x}" y1="${f(g.y1)}" y2="${f(g.y2)}" marker-end="url(#tv-scene-head)"/>` +
      `<text class="tv-scene__label" x="${g.x}" y="${ty}" text-anchor="middle">${LABEL[k]}</text>` +
      `<text class="tv-scene__value" x="${g.x}" y="${ty + 14}" text-anchor="middle" data-flux-text="${k}">${f(w)} W/m²</text></g>`
    )
  }).join("")
  const name = pane === "recipe" ? "Coated recipe" : "Bare aluminium"
  return svgTag(
    {
      class: `tv-scene tv-scene--${pane}`,
      viewBox: `0 0 ${SCENE_W} ${SCENE_H}`,
      role: "img",
      "aria-label": `${name}: sunlight rays split into reflected and absorbed, and the heat arrows at the surface. Illustrative scale.`,
      "data-physics-scene": pane,
      "data-bottom": bottom,
    },
    `<defs><marker id="tv-scene-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" class="tv-scene__head"/></marker></defs>` +
      `<text class="tv-scene__title" x="20" y="12">${name}</text>` +
      `<g data-layer-group="rays" class="tv-scene__rays">${rayMarkup}</g>` +
      layerRects() +
      `<text class="tv-scene__note" x="20" y="${bottom + 16}">Illustrative scale: layers are not to scale</text>` +
      (p.bands === null
        ? `<text class="tv-scene__note" x="20" y="${TOP_Y + 40}" data-anim="no-spectrum">spectrum not available</text>`
        : "") +
      `<text class="tv-scene__temp" x="20" y="${bottom + 40}" data-anim="phys-temp" data-source="${esc(p.source)}:t_k" data-value="${f(tK)}">${f(tK - 273.15)} °C</text>` +
      arrows,
  )
}
