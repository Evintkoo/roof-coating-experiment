// Report sheet R9: one message per chart. The message is the heading and the accessible name of the plot.
import { buildError, esc, oneOf, tag } from "../html"

export const FIGURE_SIZES = ["short", "medium", "tall"] as const
export type FigureSize = (typeof FIGURE_SIZES)[number]

export type FigureFrameProps = {
  message: string
  size: FigureSize
  interactive?: boolean
  /** Added to the accessible name after the message. */
  describe?: string
  note?: string
}

export function figureFrame(p: FigureFrameProps): (inner: string) => string {
  const size = oneOf("FigureFrame", FIGURE_SIZES, p.size)
  if (typeof p.message !== "string" || p.message.trim() === "")
    return buildError("FigureFrame", "a figure needs its message as the title")
  const name = p.describe ? `${p.message}. ${p.describe}` : p.message
  return (inner: string) =>
    tag(
      "figure",
      { class: `tv-figure tv-figure--${size}`, "data-figure": true },
      tag("figcaption", { class: "tv-figure__title" }, esc(p.message)) +
        tag(
          "div",
          { class: "tv-figure__box" },
          tag(
            "div",
            {
              class: "tv-figure__plot",
              role: p.interactive ? "group" : "img",
              "aria-label": name,
            },
            inner,
          ),
        ) +
        (p.note ? tag("p", { class: "tv-figure__note" }, esc(p.note)) : ""),
    )
}
