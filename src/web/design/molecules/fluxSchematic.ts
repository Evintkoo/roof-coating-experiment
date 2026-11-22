// Report sheet R29: the heat arrows of the day player: sunlight arriving, the share reflected, the share absorbed, the heat
// conducted into the building. Lengths are set by the player from `fluxAt` (model outputs); this builds the frame, the labels and
// the data-source of every arrow.
import {
  arrowLength,
  FLUX_KEYS,
  type Flux,
  type FluxKey,
} from "../../anim/flux"
import { buildError, finite, svgTag, tag } from "../html"

export const FLUX_W = 340
export const FLUX_H = 228
/** The longest an arrow may be, in px. */
export const L_MAX = 70
const ROOF_Y = 92
const ROOF_H = 22

const SPEC: Record<
  FluxKey,
  { x: number; y0: number; sign: 1 | -1; label: string; source: string }
> = {
  incident: {
    x: 62,
    y0: 14,
    sign: 1,
    label: "Sunlight",
    source: "flux:incident",
  },
  reflected: {
    x: 140,
    y0: ROOF_Y,
    sign: -1,
    label: "Reflected",
    source: "flux:reflected",
  },
  absorbed: {
    x: 220,
    y0: ROOF_Y,
    sign: 1,
    label: "Absorbed",
    source: "flux:absorbed",
  },
  conducted: {
    x: 300,
    y0: ROOF_Y + ROOF_H,
    sign: 1,
    label: "Conducted",
    source: "flux:conducted",
  },
}
const f = (n: number): string => String(Math.round(n * 100) / 100)

/** Geometry of one arrow for a flux value: start point fixed, end point from the signed length. */
export function arrowGeometry(
  key: FluxKey,
  w: number,
  wRef: number,
): { x: number; y1: number; y2: number } {
  const s = SPEC[key]
  return { x: s.x, y1: s.y0, y2: s.y0 + s.sign * arrowLength(w, wRef, L_MAX) }
}

export type FluxSchematicProps = {
  name: string
  /** Initial values and the references they are scaled against (defaults: all zero, drawn as dots). */
  flux?: Flux
  refs?: Flux
}

export function fluxSchematic(p: FluxSchematicProps): string {
  if (typeof p.name !== "string" || p.name.trim() === "")
    return buildError("FluxSchematic", "a flux schematic needs a name")
  const flux = p.flux ?? {
    incident: 0,
    reflected: 0,
    absorbed: 0,
    conducted: 0,
  }
  const refs = p.refs ?? {
    incident: 1,
    reflected: 1,
    absorbed: 1,
    conducted: 1,
  }
  const arrows = FLUX_KEYS.map((k) => {
    const w = finite("FluxSchematic", k, flux[k])
    const ref = finite("FluxSchematic", `${k} ref`, refs[k])
    const g = arrowGeometry(k, w, ref)
    const s = SPEC[k]
    return (
      `<g class="tv-flux__arrow tv-flux__arrow--${k}" data-source="${s.source}" data-flux="${k}" data-w="${w}" data-wref="${ref}">` +
      `<line x1="${g.x}" x2="${g.x}" y1="${g.y1}" y2="${f(g.y2)}" marker-end="url(#tv-flux-head)"/>` +
      `<text class="tv-flux__label" x="${g.x}" y="${FLUX_H - 24}" text-anchor="middle">${s.label}</text>` +
      `<text class="tv-flux__value" x="${g.x}" y="${FLUX_H - 8}" text-anchor="middle" data-flux-text="${k}">${f(w)} W/m²</text></g>`
    )
  }).join("")
  return svgTag(
    {
      class: "tv-flux",
      viewBox: `0 0 ${FLUX_W} ${FLUX_H}`,
      role: "img",
      "aria-label": `${p.name}: heat arrows for the coated roof. Sunlight arrives, part is reflected, part is absorbed, part is conducted into the building.`,
      "data-flux-schematic": true,
    },
    `<defs><marker id="tv-flux-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" class="tv-flux__head"/></marker></defs>` +
      `<rect class="tv-flux__roof" x="20" y="${ROOF_Y}" width="${FLUX_W - 40}" height="${ROOF_H}"/>` +
      `<text class="tv-flux__roof-label" x="${FLUX_W / 2}" y="${ROOF_Y + 15}" text-anchor="middle">Coated aluminium roof</text>` +
      arrows,
  )
}
