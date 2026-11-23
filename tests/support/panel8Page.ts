// Shared by the plan 08 panel tests: one real-Chrome fixture, the bundled page entry and the markup of the three components.

import { join } from "node:path"
import type { Page } from "playwright"
import { laneSeries } from "../../src/core/anim/compare"
import { sweepVariables } from "../../src/core/anim/sweep"
import type { ModelContext } from "../../src/core/pipeline/context"
import { contextToJson } from "../../src/core/pipeline/contextJson"
import { type LiveInputs, liveSimulate } from "../../src/core/pipeline/live"
import { loadContext } from "../../src/node/context"
import type { ComparePanel } from "../../src/web/anim/comparePanel"
import { toCompareProps } from "../../src/web/anim/comparePanel"
import type { DayPlayer } from "../../src/web/anim/dayPlayer"
import type { Loop } from "../../src/web/anim/loop"
import type { SweepPanel } from "../../src/web/anim/sweepPanel"
import { watchCompare } from "../../src/web/design/organisms/watchCompare"
import { watchDay } from "../../src/web/design/organisms/watchDay"
import { watchSweep } from "../../src/web/design/organisms/watchSweep"
import { defaultLiveState, LIVE_SEED, N_LIVE } from "../../src/web/liveState"
import { repoRoot } from "../helpers"
import { BrowserFixture } from "./browserFixture"
import { loadDay } from "./dayData"

declare global {
  interface Window {
    P: DayPlayer
    L: Loop
    CP: ComparePanel
    SP: SweepPanel
    LOG: string[]
    LIVE: LiveInputs
    CTX: ModelContext
    RESULT: ReturnType<typeof liveSimulate>
    A8: {
      mount(w: string, c: string, o?: { reduced?: boolean }): void
      setLive(i: LiveInputs): void
    }
  }
}

export type Panel8 = {
  fx: BrowserFixture
  ctx: ModelContext
  live: LiveInputs
  result: ReturnType<typeof liveSimulate>
  open(o?: { reduced?: boolean; scheme?: "light" | "dark" }): Promise<Page>
  close(): Promise<void>
}

export async function startPanel8(): Promise<Panel8> {
  const ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
  const ctxJson = contextToJson(ctx)
  const live = defaultLiveState(ctx.ranges, ctx.weather).inputs
  const result = liveSimulate(live, ctx, N_LIVE, LIVE_SEED)
  const bundle = async (entry: string): Promise<string> => {
    const out = await Bun.build({
      entrypoints: [join(repoRoot, entry)],
      target: "browser",
      format: "iife",
      minify: false,
      root: repoRoot,
    })
    if (!out.success) throw new Error(`bundle ${entry} failed`)
    return (out.outputs[0] as Blob).text()
  }
  const [workerSrc, entry, day] = await Promise.all([
    bundle("src/web/worker.ts"),
    bundle("tests/support/panel8Entry.ts"),
    loadDay(7, "W5"),
  ])
  const markup =
    watchDay({ name: "live recipe", data: day }) +
    watchCompare(toCompareProps(laneSeries(result, live, ctx.weather), 0)) +
    watchSweep({
      variables: sweepVariables(ctx.ranges, ctx.weather),
      selected: "midcoat_dft_um",
      state: "idle",
    })
  const fx = new BrowserFixture()
  await fx.start()
  return {
    fx,
    ctx,
    live,
    result,
    async open(o = {}) {
      const page = await fx.open(markup, [], {
        ...(o.reduced ? { reducedMotion: true } : {}),
        ...(o.scheme ? { scheme: o.scheme } : {}),
      })
      await page.addScriptTag({ content: entry })
      await page.evaluate(
        ([w, c, r]) => window.A8.mount(w, c, { reduced: r }),
        [workerSrc, ctxJson, o.reduced ?? false] as const,
      )
      return page
    },
    close: () => fx.stop(),
  }
}
