// Report sheet R26: playback speed, a native select over a closed set (0.5x, 1x, 2x, 4x).
import { buildError, tag } from "../html"

export const SPEEDS = [0.5, 1, 2, 4] as const
export type Speed = (typeof SPEEDS)[number]
export const speedText = (s: Speed): string => `${s}×`

export function speedSelect(p: { value: Speed }): string {
  if (!(SPEEDS as readonly number[]).includes(p.value))
    return buildError("SpeedSelect", "speed must be 0.5, 1, 2 or 4")
  const opts = SPEEDS.map((s) =>
    tag("option", { value: String(s), selected: s === p.value }, speedText(s)),
  ).join("")
  return tag(
    "label",
    { class: "tv-speed" },
    `<span class="tv-speed__label">Speed</span>${tag("select", { class: "tv-speed__select", "data-anim": "speed" }, opts)}`,
  )
}
/** The speed a select value stands for; anything outside the closed set is a build error. */
export function parseSpeed(v: string): Speed {
  const n = Number(v)
  if (!(SPEEDS as readonly number[]).includes(n))
    return buildError("SpeedSelect", "speed must be 0.5, 1, 2 or 4")
  return n as Speed
}
