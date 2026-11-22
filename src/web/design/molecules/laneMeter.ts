// Report sheet R31: one lane per worker: its state in words, the cells it has computed and a bar. `laneItems` is the one renderer,
// used at build time and by the screening panel on every lane event.
import { buildError, esc, finite, oneOf, tag } from "../html"

export const LANE_STATES = ["idle", "busy", "failed", "done"] as const
export type LaneViewState = (typeof LANE_STATES)[number]
export type LaneView = {
  id: number
  state: LaneViewState
  tasks: number
  inline?: boolean
}

const WORD: Record<LaneViewState, string> = {
  idle: "waiting",
  busy: "computing",
  failed: "failed",
  done: "done",
}

export function laneItems(lanes: readonly LaneView[], total: number): string {
  const t = finite("LaneMeter", "total", total)
  if (t <= 0) return buildError("LaneMeter", "total must be positive")
  return lanes
    .map((l) => {
      const state = oneOf("LaneMeter", LANE_STATES, l.state)
      const n = finite("LaneMeter", "tasks", l.tasks)
      const share = Math.min(100, Math.max(0, (100 * n) / t))
      const name = l.inline ? "Single lane" : `Worker ${l.id + 1}`
      return tag(
        "li",
        { class: "tv-lane", "data-lane": l.id, "data-state": state },
        `<span class="tv-lane__name">${esc(name)}</span><span class="tv-lane__state">${WORD[state]}</span><span class="tv-lane__bar" aria-hidden="true"><span class="tv-lane__fill" style="width:${Math.round(share * 100) / 100}%"></span></span><span class="tv-lane__count">${n} cells</span>`,
      )
    })
    .join("")
}

export function laneMeter(p: {
  lanes: readonly LaneView[]
  total: number
}): string {
  return tag(
    "ol",
    { class: "tv-lanes", "aria-label": "Worker lanes", "data-anim": "lanes" },
    laneItems(p.lanes, p.total),
  )
}
