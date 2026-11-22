// Report sheet R25: the time slider of the day player: a native range input (keyboard, touch and screen reader for free).
import { buildError, finite, tag } from "../html"

export type ScrubberProps = {
  /** Hour of the day, 0 to 24. */
  value: number
  label?: string
  step?: number
}

export function scrubber(p: ScrubberProps): string {
  const value = finite("Scrubber", "value", p.value)
  if (value < 0 || value > 24)
    return buildError("Scrubber", "value must lie in 0 to 24 hours")
  const step = p.step === undefined ? 0.1 : finite("Scrubber", "step", p.step)
  if (step <= 0) return buildError("Scrubber", "step must be positive")
  const label = p.label ?? "Time of day in hours"
  if (label.trim() === "")
    return buildError("Scrubber", "a scrubber needs a label")
  return tag(
    "input",
    {
      type: "range",
      class: "tv-scrub",
      min: 0,
      max: 24,
      step,
      value,
      "data-anim": "scrub",
      "aria-label": label,
    },
    undefined,
  )
}
