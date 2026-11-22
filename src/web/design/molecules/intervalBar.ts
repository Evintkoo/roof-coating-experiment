// Report sheet R6: the one way an interval is drawn (R4): a band with end caps, a diamond for the value, the sentence
// "parameter uncertainty only: lo to hi unit" beneath. Bars of one comparison share min and max.
import { buildError, esc, finite, fixed, pct, tag } from "../html"

export type IntervalBarProps = {
  lo: number
  hi: number
  value: number
  /** The shared scale of the comparison. */
  min: number
  max: number
  label: string
  unit?: string | undefined
  digits?: number | undefined
}

const C = "IntervalBar"

/** "parameter uncertainty only: lo to hi unit": the one wording of an interval (R4). */
export function intervalText(
  component: string,
  iv: { lo: number; hi: number },
  digits: number | undefined,
  unit: string | undefined,
): string {
  const lo = finite(component, "interval.lo", iv.lo)
  const hi = finite(component, "interval.hi", iv.hi)
  if (lo > hi)
    return buildError(component, "interval.lo must not exceed interval.hi")
  return `parameter uncertainty only: ${fixed(component, lo, digits)} to ${fixed(component, hi, digits)}${unit ? ` ${unit}` : ""}`
}

export function intervalBar(p: IntervalBarProps): string {
  const lo = finite(C, "lo", p.lo)
  const hi = finite(C, "hi", p.hi)
  const value = finite(C, "value", p.value)
  const min = finite(C, "min", p.min)
  const max = finite(C, "max", p.max)
  if (!(min < max)) return buildError(C, "min must be below max")
  if (!(min <= lo && lo <= hi && hi <= max))
    return buildError(C, "the interval must lie on the scale, lo <= hi")
  if (value < min || value > max)
    return buildError(C, "the value must lie on the scale")
  if (typeof p.label !== "string" || p.label.trim() === "")
    return buildError(C, "an interval bar needs a label")
  const u = p.unit ? ` ${p.unit}` : ""
  const f = (v: number) => fixed(C, v, p.digits)
  const sentence = intervalText(C, { lo, hi }, p.digits, p.unit)
  const name = `${p.label}: ${f(value)}${u}, parameter uncertainty only ${f(lo)} to ${f(hi)}${u}, on a scale from ${min} to ${max}${u}`
  const at = (v: number) => pct(v, min, max)
  const span = (cls: string, style: string) =>
    tag("span", { class: cls, style }, "")
  const track = tag(
    "div",
    { class: "tv-interval__track", role: "img", "aria-label": name },
    span(
      "tv-interval__band",
      `left:${at(lo)}%;width:${String(Math.round((Number(at(hi)) - Number(at(lo))) * 10000) / 10000)}%`,
    ) +
      span("tv-interval__cap tv-interval__cap--lo", `left:${at(lo)}%`) +
      span("tv-interval__cap tv-interval__cap--hi", `left:${at(hi)}%`) +
      span("tv-interval__mark", `left:${at(value)}%`),
  )
  const axis = tag(
    "div",
    { class: "tv-interval__axis", "aria-hidden": true },
    tag("span", {}, esc(`${min}${u}`)) + tag("span", {}, esc(`${max}${u}`)),
  )
  return tag(
    "div",
    { class: "tv-interval", "data-interval-bar": true },
    track + axis + tag("p", { class: "tv-interval__text" }, esc(sentence)),
  )
}
