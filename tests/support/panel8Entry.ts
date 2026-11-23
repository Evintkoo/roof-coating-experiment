// Page side of the plan 08 panel tests (bundled to an IIFE): mounts the day player, the comparison panel and the sweep panel on the
// server-rendered markup, with the real worker pool, from the real context. Everything the tests drive is on `window`.

import { sweepVariables } from "../../src/core/anim/sweep"
import { contextFromJson } from "../../src/core/pipeline/contextJson"
import { type LiveInputs, liveSimulate } from "../../src/core/pipeline/live"
import {
  type ComparePanel,
  mountComparePanel,
} from "../../src/web/anim/comparePanel"
import { dayDataOf } from "../../src/web/anim/dayData"
import {
  browserDayDeps,
  type DayPlayer,
  mountDayPlayer,
} from "../../src/web/anim/dayPlayer"
import { browserLoop, type Loop } from "../../src/web/anim/loop"
import { mountSweepPanel, type SweepPanel } from "../../src/web/anim/sweepPanel"
import { defaultLiveState, LIVE_SEED, N_LIVE } from "../../src/web/liveState"
import { inlineSweepLane } from "../../src/web/pool"

type W = {
  A8: unknown
  P: DayPlayer
  L: Loop
  CP: ComparePanel
  SP: SweepPanel
  LOG: string[]
  LIVE: LiveInputs
  CTX: ReturnType<typeof contextFromJson>
  RESULT: ReturnType<typeof liveSimulate>
}
const w = window as unknown as W
w.A8 = {
  mount(workerSrc: string, ctxJson: string, o: { reduced?: boolean } = {}) {
    w.LOG = []
    const ctx = contextFromJson(ctxJson)
    w.CTX = ctx
    w.LIVE = defaultLiveState(ctx.ranges, ctx.weather).inputs
    const r = liveSimulate(w.LIVE, ctx, N_LIVE, LIVE_SEED)
    w.RESULT = r
    w.L = browserLoop()
    const log = (e: string, l: string, f: unknown) =>
      w.LOG.push(`${l} ${e} ${JSON.stringify(f)}`)
    const dayRoot = document.querySelector<HTMLElement>("[data-watch-day]")
    if (!dayRoot) throw new Error("no day markup")
    const deps = browserDayDeps(w.L)
    deps.whenVisible = () => {}
    if (o.reduced) deps.reduced = () => true
    w.P = mountDayPlayer(dayRoot, dayDataOf(r, w.LIVE, ctx.weather), deps)
    const cRoot = document.querySelector<HTMLElement>("[data-watch-compare]")
    if (cRoot) {
      w.CP = mountComparePanel(cRoot, w.P, {
        log: (e, l, f) => log(e, l, f),
      })
      w.CP.update(r, w.LIVE, ctx.weather)
    }
    const sRoot = document.querySelector<HTMLElement>("[data-watch-sweep]")
    if (sRoot)
      w.SP = mountSweepPanel(sRoot, {
        ctx,
        ctxJson,
        workerUrl: URL.createObjectURL(
          new Blob([workerSrc], { type: "text/javascript" }),
        ),
        variables: sweepVariables(ctx.ranges, ctx.weather),
        live: () => w.LIVE,
        loop: w.L,
        inline: inlineSweepLane,
        log: (e, l, f) => log(e, l, f),
      })
  },
  /** A new live result, as the page does after a slider move. */
  setLive(inputs: LiveInputs) {
    w.LIVE = inputs
    const r = liveSimulate(inputs, w.CTX, N_LIVE, LIVE_SEED)
    w.RESULT = r
    w.P.setData(dayDataOf(r, inputs, w.CTX.weather))
    w.CP?.update(r, inputs, w.CTX.weather)
    w.SP?.liveChanged()
  },
}
