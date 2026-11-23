// The comparison panel (plan 08 FR-1 to FR-3, D1, D12): binds the five lanes of WatchCompare to the day player's clock through its
// `onFrame` hook. It owns no clock and adds no ticker: every cursor and every difference at the cursor is recomputed from the lane
// series each time the day player renders. The lanes are built (and the work done) only while the panel is shown.
import { diffAt, type Lane, laneSeries } from "../../core/anim/compare"
import type { WeatherConfig } from "../../core/config"
import { SpandekError } from "../../core/errors"
import type { LiveInputs, LiveResult } from "../../core/pipeline/live"
import { clockText } from "../design/atoms/timeReadout"
import {
  type LaneGeometry,
  laneChartGeometry,
} from "../design/molecules/laneChart"
import {
  type CompareDiff,
  formatDiff,
  watchCompare,
} from "../design/organisms/watchCompare"
import type { DayPlayer } from "./dayPlayer"

type Fields = Record<string, string | number | boolean>
export type ComparePanelDeps = {
  log?: (event: string, level: "debug" | "info" | "error", f: Fields) => void
}
export type ComparePanel = {
  /** A new live result: the lanes follow it (drawn at once when the panel is open). */
  update(r: LiveResult, inputs: LiveInputs, weather: WeatherConfig): void
  /** The panel is on screen (its disclosure is open and its tab selected). */
  setOpen(open: boolean): void
  destroy(): void
}

const arr = (a: Float64Array | null): number[] | null =>
  a ? Array.from(a) : null

export function toCompareProps(lanes: readonly Lane[], tH: number) {
  const diff = {} as CompareDiff
  for (const l of lanes) diff[l.id] = diffAt(l, tH)
  return {
    lanes: lanes.map((l) => ({
      id: l.id,
      unit: l.unit,
      recipe: Array.from(l.recipe),
      c0: Array.from(l.c0),
      c1: arr(l.c1),
    })),
    diff,
    tH,
  }
}

export function mountComparePanel(
  root: HTMLElement,
  player: Pick<DayPlayer, "onFrame" | "state">,
  deps: ComparePanelDeps = {},
): ComparePanel {
  let latest: {
    r: LiveResult
    inputs: LiveInputs
    weather: WeatherConfig
  } | null = null
  let open = false
  let drawn = false
  let lanes: Lane[] = []
  let geo = new Map<string, LaneGeometry>()

  const q = <T extends Element>(sel: string): T | null =>
    root.querySelector<T>(sel)
  const showError = (text: string): void => {
    root.dataset.state = "error"
    let note = q<HTMLElement>('[data-anim="compare-status"]')
    if (!note) {
      note = document.createElement("p")
      note.className = "page-hint"
      note.dataset.anim = "compare-status"
      note.setAttribute("role", "alert")
      root.append(note)
    }
    note.textContent = text
  }

  const frame = (tH: number): void => {
    if (!open || !drawn) return
    const t = q<HTMLElement>('[data-anim="compare-time"]')
    if (t) {
      t.dataset.value = String(tH)
      t.textContent = clockText(tH)
    }
    for (const l of lanes) {
      const g = geo.get(l.id) as LaneGeometry
      const cur = root.querySelector<SVGLineElement>(
        `[data-lane="${l.id}"] [data-source="clock:t_h"]`,
      )
      if (cur) {
        const x = String(Math.round(g.x(tH) * 100) / 100)
        cur.setAttribute("x1", x)
        cur.setAttribute("x2", x)
        cur.setAttribute("data-t", String(tH))
      }
      const d = diffAt(l, tH)
      for (const k of ["c0", "c1"] as const) {
        const v = d[k]
        const out = root.querySelector<HTMLElement>(
          `[data-anim="diff"][data-lane="${l.id}"][data-control="${k}"]`,
        )
        if (out && v !== null) {
          out.dataset.value = String(v)
          out.textContent = formatDiff(v, l.unit)
        }
      }
    }
  }

  const draw = (): void => {
    if (!latest) return
    try {
      const next = laneSeries(latest.r, latest.inputs, latest.weather)
      const tH = player.state().tH
      const tmp = document.createElement("div")
      tmp.innerHTML = watchCompare(toCompareProps(next, tH))
      const fresh = tmp.firstElementChild as HTMLElement
      root.replaceChildren(...fresh.childNodes)
      lanes = next
      geo = new Map(
        lanes.map((l) => [
          l.id,
          laneChartGeometry(l.c1 ? [l.recipe, l.c0, l.c1] : [l.recipe, l.c0]),
        ]),
      )
      delete root.dataset.state
      drawn = true
      deps.log?.("compare.open", "info", {
        lanes: lanes.length,
        controls: lanes.every((l) => l.c1) ? 2 : 1,
      })
      frame(tH)
    } catch (e) {
      drawn = false
      showError(
        "The comparison could not be drawn. The day player is unaffected.",
      )
      deps.log?.("compare.error", "error", {
        reason: e instanceof SpandekError ? e.phase : "unknown",
      })
    }
  }

  const off = player.onFrame(frame)
  return {
    update(r, inputs, weather) {
      latest = { r, inputs, weather }
      if (open) draw()
      else drawn = false
    },
    setOpen(o) {
      const was = open
      open = o
      if (o && !was && !drawn) draw()
      else if (o && !was) frame(player.state().tH)
    },
    destroy() {
      off()
    },
  }
}
