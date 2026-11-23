// Page side of the day player tests (bundled to an IIFE): mounts the player on the server-rendered markup.
import {
  browserDayDeps,
  type DayData,
  type DayPlayer,
  mountDayPlayer,
} from "../../src/web/anim/dayPlayer"
import {
  browserLoop,
  type FrameStats,
  type Loop,
} from "../../src/web/anim/loop"

type W = { P: DayPlayer; L: Loop; LOG: string[]; STATS: FrameStats[] }
const w = window as unknown as W & { A: unknown }
w.A = {
  mount(data: DayData, o: { noVisible?: boolean } = {}) {
    w.LOG = []
    w.STATS = []
    w.L = browserLoop((s) => w.STATS.push(s))
    const root = document.querySelector<HTMLElement>("[data-watch-day]")
    if (!root) throw new Error("no player markup")
    const deps = browserDayDeps(w.L, (e, f) =>
      w.LOG.push(`${e} ${JSON.stringify(f)}`),
    )
    if (o.noVisible) deps.whenVisible = () => {}
    w.P = mountDayPlayer(root, data, deps)
  },
}
