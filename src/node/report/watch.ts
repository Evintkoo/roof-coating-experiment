// The "Watch it run" section (plan 07 Task 6, D8): a 24 h day player for the live recipe against bare aluminium, and the parallel
// screening panel inside a closed disclosure. The markup is built from the same live evaluation the page runs, so before any script
// runs the picture is already the default recipe's day; the page script (src/web/main.ts) then follows the live simulator.
import { liveSimulate } from "../../core/pipeline/live"
import { dayDataOf } from "../../web/anim/dayData"
import { fluxAt, fluxRefs } from "../../web/anim/flux"
import { esc } from "../../web/design/html"
import { disclosure } from "../../web/design/molecules/disclosure"
import { watchDay } from "../../web/design/organisms/watchDay"
import { watchScreening } from "../../web/design/organisms/watchScreening"
import { defaultLiveState, LIVE_SEED, N_LIVE } from "../../web/liveState"
import { sec } from "./content"
import type { ReportInput, ReportSection } from "./html"

/** The default live recipe's day, as the page opens on it. */
function initialDay(i: ReportInput) {
  const inputs = defaultLiveState(i.ctx.ranges, i.ctx.weather).inputs
  const r = liveSimulate(inputs, i.ctx, N_LIVE, LIVE_SEED)
  return { inputs, day: dayDataOf(r, inputs, i.ctx.weather) }
}

export const watchSection: ReportSection = {
  id: "watch",
  title: "Watch it run",
  order: 35,
  render: (i) => {
    const { day } = initialDay(i)
    const nCand = new Set(i.results.map((r) => r.candidate_id)).size
    const nScen = i.results.length / nCand
    const flux = fluxAt(0, day.flux)
    const player = watchDay({
      name: "live recipe",
      data: day,
      flux,
      refs: fluxRefs(day.flux),
      labelExtra: `<label class="check page-reduce"><input type="checkbox" data-anim="reduce-motion"> Reduce motion (stops autoplay and gliding numbers)</label>`,
    })
    const screening = disclosure({
      summary: `Run the screening in my browser: ${nCand} recipes on ${nScen} weather days`,
      level: "detail",
      id: "details-screening",
    })(
      `<p class="page-hint">${esc(
        "The same models as the batch run, computed here on a pool of workers. Values are checked against the batch results embedded in this page.",
      )}</p>${watchScreening({
        candidates: nCand,
        scenarios: nScen,
        draws: 32,
      })}`,
    )
    return sec(
      "watch",
      "Watch it run",
      `<p class="page-lead">One day on the roof for the live simulator's recipe. It plays once, then waits. Model output, not a measurement.</p>
${player}
${screening}`,
    )
  },
}
