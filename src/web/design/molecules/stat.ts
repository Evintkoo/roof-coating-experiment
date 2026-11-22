// Report sheet R5: one number with its meaning. The caveat tone is required (FR-4): an index value cannot be rendered without
// its ProxyBadge, and a model prediction is rendered with its interval.
import { buildError, esc, finite, fixed, oneOf, tag } from "../html"
import { intervalBar, intervalText } from "./intervalBar"
import { type ProxyTone, proxyBadge } from "./proxyBadge"

export const STAT_TONES = ["proxy", "scenario", "nominal", "interval"] as const
export type StatTone = (typeof STAT_TONES)[number]
export type StatInterval = { lo: number; hi: number }

type Common = {
  label: string
  value: number
  unit?: string
  /** Decimals of the value and of the interval (default 2). */
  digits?: number
  note?: string
  interval?: StatInterval
  /** With an interval: draw it as an IntervalBar on this shared scale (R4) instead of the sentence alone. */
  axis?: { min: number; max: number }
}
export type StatProps = Common &
  ({ tone: ProxyTone } | { tone: "interval"; interval: StatInterval })

export function stat(p: StatProps): string {
  const tone = oneOf("Stat", STAT_TONES, p.tone)
  if (typeof p.label !== "string" || p.label.trim() === "")
    return buildError("Stat", "a stat needs a visible label")
  if (tone === "interval" && p.interval === undefined)
    return buildError("Stat", "the interval tone needs an interval")
  const num = fixed("Stat", p.value, p.digits)
  const unit = p.unit
    ? tag("span", { class: "tv-stat__unit" }, esc(p.unit))
    : ""
  const badge = tone === "interval" ? "" : proxyBadge({ tone })
  const iv =
    p.interval === undefined
      ? ""
      : p.axis !== undefined
        ? intervalBar({
            ...p.interval,
            value: p.value,
            ...p.axis,
            label: p.label,
            unit: p.unit,
            digits: p.digits,
          })
        : tag(
            "p",
            { class: "tv-stat__interval" },
            esc(intervalText("Stat", p.interval, p.digits, p.unit)),
          )
  return tag(
    "div",
    { class: "tv-stat", "data-stat": true, "data-tone": tone },
    tag("p", { class: "tv-stat__label" }, esc(p.label)) +
      tag(
        "p",
        { class: "tv-stat__value" },
        tag("span", { class: "tv-stat__num" }, esc(num)) + unit + badge,
      ) +
      iv +
      (p.note ? tag("p", { class: "tv-stat__note" }, esc(p.note)) : ""),
  )
}
