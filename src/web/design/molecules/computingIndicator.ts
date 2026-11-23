// Report sheet R30: says that workers are busy. A live region with words; the bar moves only while busy and not under reduced motion.
import { oneOf, tag } from "../html"

export const COMPUTING_STATES = ["idle", "busy"] as const
export type ComputingState = (typeof COMPUTING_STATES)[number]

export function computingIndicator(p: { state: ComputingState }): string {
  const state = oneOf("ComputingIndicator", COMPUTING_STATES, p.state)
  return tag(
    "span",
    {
      class: "tv-computing",
      role: "status",
      "aria-live": "polite",
      "data-anim": "computing",
      "data-state": state,
    },
    `<span class="tv-computing__bar" aria-hidden="true"></span><span class="tv-computing__text">${state === "busy" ? "Computing in your browser" : "Idle"}</span>`,
  )
}
