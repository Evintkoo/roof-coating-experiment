// Report sheet R10: names the series of a chart with more than three series. Colour plus shape plus text (R5).
import { buildError, esc, oneOf, tag } from "../html"

export const LEGEND_SWATCHES = [
  "recommended",
  "baseline",
  "series-1",
  "series-2",
  "series-3",
  "series-4",
  "series-5",
  "series-6",
] as const
export const LEGEND_SHAPES = ["line", "dash", "dot", "band"] as const
export type LegendSwatch = (typeof LEGEND_SWATCHES)[number]
export type LegendShape = (typeof LEGEND_SHAPES)[number]

export type LegendProps = {
  title: string
  items: readonly { label: string; swatch: LegendSwatch; shape: LegendShape }[]
}

const TOKEN: Record<LegendSwatch, string> = {
  recommended: "viz-recommended",
  baseline: "viz-baseline",
  "series-1": "viz-1",
  "series-2": "viz-2",
  "series-3": "viz-3",
  "series-4": "viz-4",
  "series-5": "viz-5",
  "series-6": "viz-6",
}

export function legend(p: LegendProps): string {
  if (typeof p.title !== "string" || p.title.trim() === "")
    return buildError("Legend", "a legend needs a title")
  if (p.items.length === 0)
    return buildError("Legend", "a legend needs entries")
  const seen = new Set<string>()
  const lis = p.items.map((it) => {
    const swatch = oneOf("Legend", LEGEND_SWATCHES, it.swatch)
    const shape = oneOf("Legend", LEGEND_SHAPES, it.shape)
    if (
      typeof it.label !== "string" ||
      it.label.trim() === "" ||
      seen.has(it.label)
    )
      return buildError("Legend", "labels must be non-empty and distinct")
    seen.add(it.label)
    return tag(
      "li",
      { class: "tv-legend__item" },
      tag(
        "span",
        {
          class: `tv-legend__swatch tv-legend__swatch--${shape}`,
          style: `--swatch:var(--tv-${TOKEN[swatch]})`,
          "aria-hidden": true,
        },
        "",
      ) + esc(it.label),
    )
  })
  return tag("ul", { class: "tv-legend", "aria-label": p.title }, lis.join(""))
}
