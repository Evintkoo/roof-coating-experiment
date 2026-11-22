// Page side of the screening panel tests: mounts the panel on the server-rendered markup with the real worker and an inline lane.
import {
  designsOf,
  type ScreeningData,
  screenChunk,
} from "../../src/core/anim/screening"
import { contextFromJson } from "../../src/core/pipeline/contextJson"
import {
  mountScreeningPanel,
  type Panel,
} from "../../src/web/anim/screeningPanel"

const w = window as unknown as { A: unknown; PANEL: Panel; LOG: string[] }
w.A = {
  mount(workerSrc: string, ctxJson: string, data: ScreeningData) {
    w.LOG = []
    const root = document.querySelector<HTMLElement>("[data-watch-screening]")
    if (!root) throw new Error("no panel markup")
    w.PANEL = mountScreeningPanel(root, {
      data,
      ctxJson,
      workerUrl: URL.createObjectURL(
        new Blob([workerSrc], { type: "text/javascript" }),
      ),
      draws: 32,
      inline: (c, d, draws) => {
        const ctx = contextFromJson(c)
        const designs = designsOf(d)
        return (tasks) => screenChunk(ctx, designs, d.scenarios, tasks, draws)
      },
      log: (e, l, f) => w.LOG.push(`${l} ${e} ${JSON.stringify(f)}`),
    })
  },
}
