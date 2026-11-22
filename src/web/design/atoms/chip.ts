// Report sheet R2 (docs/design/report-sheets.md): a neutral qualifier or filter value. `static` is a span; `off` and `on` are a
// real toggle button exposing `aria-pressed`. A chip never carries a caveat: that is the Badge.
import { SpandekError } from "../../../core/errors"
import { cls, esc, oneOf, tag } from "../html"

export const CHIP_STATES = ["static", "off", "on"] as const
export type ChipState = (typeof CHIP_STATES)[number]

export type ChipProps = {
  label: string
  state?: ChipState
  /** For a toggle: the value the page script reads. */
  value?: string
}

export function chip(p: ChipProps): string {
  const state = oneOf("Chip", CHIP_STATES, p.state ?? "static")
  if (typeof p.label !== "string" || p.label.trim() === "")
    throw new SpandekError(
      4,
      "design.component",
      "Chip",
      "a chip needs a visible label",
    )
  if (state === "static") return tag("span", { class: "tv-chip" }, esc(p.label))
  return tag(
    "button",
    {
      type: "button",
      class: cls("tv-chip", "tv-chip--toggle"),
      "aria-pressed": state === "on",
      "data-value": p.value,
    },
    esc(p.label),
  )
}
