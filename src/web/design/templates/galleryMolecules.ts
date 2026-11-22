// The molecules part of the component gallery (FR-11, D9): every molecule in every state, built by the same functions the report
// uses. A fragment, not a page. Browser and Node safe.
import { esc } from "../html"
import { CALLOUT_TONES, callout } from "../molecules/callout"
import { disclosure } from "../molecules/disclosure"
import { FIGURE_SIZES, figureFrame } from "../molecules/figureFrame"
import { intervalBar } from "../molecules/intervalBar"
import { layerSchematic } from "../molecules/layerSchematic"
import { LEGEND_SHAPES, legend } from "../molecules/legend"
import { PROXY_TONES, proxyBadge } from "../molecules/proxyBadge"
import { SLIDER_STATES, sliderField } from "../molecules/sliderField"
import { stat } from "../molecules/stat"
import { tableCell } from "../molecules/tableCell"
import { tabs } from "../molecules/tabs"
import { tv } from "../tokens"
import type { GalleryCell } from "./galleryAtoms"

const t = tv
export const GALLERY_MOLECULES_CSS = `
.tv-gallery--molecules .tv-gallery__grid{grid-template-columns:repeat(auto-fill,minmax(calc(${t("space-16")} * 4),1fr))}
.tv-gallery__sample--block{display:block}
.tv-gallery__table{border-collapse:collapse}
`

const INTERACTIVE = new Set(["Disclosure", "Tabs", "SliderField"])
const plot = `<p class="tv-gallery__cap">plot area</p>`

const IV = {
  lo: 14.3,
  hi: 14.5,
  value: 14.4,
  min: 0,
  max: 20,
  label: "Cooling",
  unit: "K",
  digits: 1,
}

export function galleryMoleculeCells(): GalleryCell[] {
  const cells: GalleryCell[] = []
  const add = (molecule: string, state: string, html: string) =>
    cells.push({
      atom: molecule,
      state,
      interactive: INTERACTIVE.has(molecule),
      html,
    })
  for (const tone of PROXY_TONES) add("ProxyBadge", tone, proxyBadge({ tone }))
  add(
    "Stat",
    "proxy",
    stat({ label: "Corrosion index", value: 0.7013, tone: "proxy" }),
  )
  add(
    "Stat",
    "scenario",
    stat({
      label: "Aged benefit",
      value: 15.1,
      unit: "W/m²",
      digits: 1,
      tone: "scenario",
      interval: { lo: 14.2, hi: 16 },
    }),
  )
  add(
    "Stat",
    "nominal",
    stat({
      label: "Delamination index",
      value: 0.382,
      tone: "nominal",
      note: "Shown without its uncertainty.",
    }),
  )
  add(
    "Stat",
    "interval",
    stat({
      label: "Cooling",
      value: 14.4,
      unit: "K",
      digits: 1,
      tone: "interval",
      interval: { lo: 14.3, hi: 14.5 },
    }),
  )
  add(
    "Stat",
    "interval with bar",
    stat({
      label: "Cooling",
      value: 14.4,
      unit: "K",
      digits: 1,
      tone: "interval",
      interval: { lo: 14.3, hi: 14.5 },
      axis: { min: 0, max: 20 },
    }),
  )
  add(
    "LayerSchematic",
    "three layers",
    layerSchematic({
      name: "SP-075",
      primer_um: 11.6,
      midcoat_um: 175,
      topcoat_um: 9.7,
    }),
  )
  add(
    "LayerSchematic",
    "thin midcoat",
    layerSchematic({
      name: "SP-031",
      primer_um: 40,
      midcoat_um: 60,
      topcoat_um: 40,
    }),
  )
  add("IntervalBar", "narrow", intervalBar(IV))
  add("IntervalBar", "wide", intervalBar({ ...IV, lo: 4, hi: 17, value: 11 }))
  add(
    "IntervalBar",
    "at the scale edges",
    intervalBar({ ...IV, lo: 0, hi: 20, value: 0 }),
  )
  for (const tone of CALLOUT_TONES)
    add(
      "Callout",
      tone,
      callout({
        tone,
        body: "Intervals show parameter uncertainty only; they leave out model-form error.",
      }),
    )
  add(
    "Disclosure",
    "closed",
    disclosure({ summary: "Live simulator", level: "detail" })(
      "<p>Closed by default.</p>",
    ),
  )
  add(
    "Disclosure",
    "open",
    disclosure({ summary: "Assumed constants", level: "detail", open: true })(
      "<p>Shown on request.</p>",
    ),
  )
  for (const size of FIGURE_SIZES)
    add(
      "FigureFrame",
      size,
      figureFrame({
        message: "Aluminium primer runs 11 K hotter than the coated roof",
        size,
        note: "Shared axis, kelvin",
      })(plot),
    )
  add(
    "FigureFrame",
    "interactive",
    figureFrame({
      message: "Drag an axis to select candidates",
      size: "short",
      interactive: true,
    })(plot),
  )
  for (const shape of LEGEND_SHAPES)
    add(
      "Legend",
      shape,
      legend({
        title: `Recipes (${shape})`,
        items: [
          { label: "SP-075", swatch: "recommended", shape },
          { label: "Bare aluminium", swatch: "baseline", shape },
          { label: "SP-031", swatch: "series-1", shape },
        ],
      }),
    )
  add(
    "Legend",
    "every swatch",
    legend({
      title: "Series",
      items: [
        "recommended",
        "baseline",
        "series-1",
        "series-2",
        "series-3",
        "series-4",
        "series-5",
        "series-6",
      ].map((s) => ({
        label: s,
        swatch: s as "series-1",
        shape: "line" as const,
      })),
    }),
  )
  const T = [
    { id: "initial", label: "Initial" },
    { id: "aged", label: "Aged (scenario)" },
  ]
  add(
    "Tabs",
    "first selected",
    tabs({ id: "g-tabs-a", label: "Ageing state", tabs: T })([
      "<p>Initial values.</p>",
      "<p>Aged values.</p>",
    ]),
  )
  add(
    "Tabs",
    "second selected",
    tabs({ id: "g-tabs-b", label: "Ageing state", tabs: T, selected: "aged" })([
      "<p>Initial values.</p>",
      "<p>Aged values.</p>",
    ]),
  )
  const S = {
    min: 0.2,
    max: 1,
    step: 0.01,
    value: 0.42,
    unit: "relative cost units (not IDR)",
    digits: 2,
    numberInput: true,
  }
  add(
    "SliderField",
    "idle",
    sliderField({ ...S, id: "g-slider-a", label: "Budget" }),
  )
  add(
    "SliderField",
    "disabled",
    sliderField({ ...S, id: "g-slider-b", label: "Budget", state: "disabled" }),
  )
  add(
    "SliderField",
    "error",
    sliderField({
      ...S,
      id: "g-slider-c",
      label: "Budget",
      state: "error",
      message: "Below the cheapest tabulated recipe.",
    }),
  )
  const row = (c: string) =>
    `<table class="tv-gallery__table"><tbody><tr>${c}</tr></tbody></table>`
  add("TableCell", "text", row(tableCell({ kind: "text", value: "SP-075" })))
  add(
    "TableCell",
    "row header",
    row(tableCell({ kind: "text", value: "Highest cooling", header: true })),
  )
  add(
    "TableCell",
    "mono text",
    row(tableCell({ kind: "text", value: "44f8b9df7f91bcf2", mono: true })),
  )
  add(
    "TableCell",
    "number",
    row(tableCell({ kind: "number", value: 14.449, digits: 1 })),
  )
  add(
    "TableCell",
    "number with interval",
    row(
      tableCell({
        kind: "number",
        value: 14.4,
        digits: 1,
        interval: { lo: 14.3, hi: 14.5 },
      }),
    ),
  )
  add(
    "TableCell",
    "index",
    row(tableCell({ kind: "index", value: 0.7013, tone: "proxy" })),
  )
  add("TableCell", "empty", row(tableCell({ kind: "empty" })))
  return cells
}

const ORDER = [
  "ProxyBadge",
  "Stat",
  "IntervalBar",
  "LayerSchematic",
  "Callout",
  "Disclosure",
  "FigureFrame",
  "Legend",
  "Tabs",
  "SliderField",
  "TableCell",
]

export function galleryMolecules(): string {
  const cells = galleryMoleculeCells()
  const sections = ORDER.map((m) => {
    const figs = cells
      .filter((c) => c.atom === m)
      .map(
        (c) =>
          `<figure class="tv-gallery__cell" data-atom="${esc(c.atom)}" data-state="${esc(c.state)}"><div class="tv-gallery__sample tv-gallery__sample--block"${c.interactive ? ' data-interactive="true"' : ""}>${c.html}</div><figcaption class="tv-gallery__cap">${esc(c.state)}</figcaption></figure>`,
      )
      .join("")
    return `<section class="tv-gallery__atom" aria-labelledby="gallery-${esc(m)}"><h3 class="tv-gallery__title" id="gallery-${esc(m)}">${esc(m)}</h3><div class="tv-gallery__grid">${figs}</div></section>`
  }).join("\n")
  return `<section class="tv-gallery tv-gallery--molecules" aria-labelledby="gallery-molecules"><h2 id="gallery-molecules">Molecules</h2>\n${sections}\n</section>\n`
}
