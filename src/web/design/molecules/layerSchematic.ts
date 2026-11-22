// Report sheet R23: the three layers of one recipe drawn to scale from its thicknesses (a data graphic, not an illustration).
// A cross-section: aluminium at the bottom, then primer, midcoat and topcoat; labels sit in fixed slots on the right with leader
// lines so two thin layers never overlap. Colours come from classes styled with tokens in css.ts.
import { buildError, esc, finite, fixed, tag } from "../html"

export type LayerSchematicProps = {
  /** The recipe id, for the accessible name. */
  name: string
  primer_um: number
  midcoat_um: number
  topcoat_um: number
}

const C = "LayerSchematic"
const W = 260
const H = 150
const X0 = 12
const BOX = 84
const TOP = 10
const STACK = 112
const SUB = 14
const LABEL_X = 118
const MIN = 2.5

const f = (n: number): string => String(Math.round(n * 100) / 100)

export function layerSchematic(p: LayerSchematicProps): string {
  if (typeof p.name !== "string" || p.name.trim() === "")
    return buildError(C, "a schematic needs the recipe id")
  const vals = {
    primer: finite(C, "primer_um", p.primer_um),
    midcoat: finite(C, "midcoat_um", p.midcoat_um),
    topcoat: finite(C, "topcoat_um", p.topcoat_um),
  }
  for (const v of Object.values(vals))
    if (v <= 0) return buildError(C, "thicknesses must be positive")
  const total = vals.primer + vals.midcoat + vals.topcoat
  const k = (STACK - 3 * MIN) / total
  const hs = {
    topcoat: MIN + vals.topcoat * k,
    midcoat: MIN + vals.midcoat * k,
    primer: MIN + vals.primer * k,
  }
  let y = TOP
  const rows: { id: string; y: number; h: number; text: string }[] = []
  for (const id of ["topcoat", "midcoat", "primer"] as const) {
    rows.push({
      id,
      y,
      h: hs[id],
      text: `${id.charAt(0).toUpperCase()}${id.slice(1)} ${fixed(C, vals[id], 1)} µm`,
    })
    y += hs[id]
  }
  const subY = y
  rows.push({ id: "substrate", y: subY, h: SUB, text: "Bare aluminium" })
  const slots = [22, 56, 90, 124]
  const rects = rows
    .map(
      (r) =>
        `<rect class="tv-schem__${r.id}" x="${X0}" y="${f(r.y)}" width="${BOX}" height="${f(r.h)}"/>`,
    )
    .join("")
  const labels = rows
    .map((r, i) => {
      const my = r.y + r.h / 2
      const ly = slots[i] as number
      return `<polyline class="tv-schem__leader" points="${X0 + BOX},${f(my)} ${LABEL_X - 8},${f(ly)} ${LABEL_X - 4},${f(ly)}"/><text class="tv-schem__label" x="${LABEL_X}" y="${ly + 4}">${esc(r.text)}</text>`
    })
    .join("")
  const name = `${p.name}: layer thicknesses drawn to scale: topcoat ${fixed(C, vals.topcoat, 1)} µm, midcoat ${fixed(C, vals.midcoat, 1)} µm, primer ${fixed(C, vals.primer, 1)} µm, on bare aluminium`
  return tag(
    "figure",
    { class: "tv-schem", "data-layer-schematic": p.name },
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)}">${rects}${labels}</svg>` +
      tag(
        "figcaption",
        { class: "tv-schem__caption" },
        esc(`${p.name}: thickness to scale (µm)`),
      ),
  )
}
