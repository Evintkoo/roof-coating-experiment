// Report sheet R27: the clock of the day player as text ("14:30"), with the exact hour in data-value for tests and scripts.
import { finite, tag } from "../html"

/** Hours (0 to 24) as HH:MM, rounded down to the minute; 24 prints 24:00. */
export function clockText(tH: number): string {
  const t = Number.isFinite(tH) ? Math.min(24, Math.max(0, tH)) : 0
  const total = Math.floor(t * 60 + 1e-9)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

export function timeReadout(p: { tH: number }): string {
  const t = finite("TimeReadout", "tH", p.tH)
  return tag(
    "output",
    {
      class: "tv-time",
      "data-anim": "time",
      "data-value": t,
      "aria-live": "off",
    },
    clockText(t),
  )
}
