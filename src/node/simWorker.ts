// Worker entry for simulateAll (plan 03 D15). Evaluates a contiguous slice of evaluation indices:
// index 0 is the nominal pass, index i >= 1 is uncertainty draw i - 1. No logic of its own beyond
// marshalling: errors and events are posted to the parent, which rethrows and replays them.

import type { Scenario } from "../core/design"
import { SpandekError } from "../core/errors"
import { type Level, setEventSink } from "../core/events"
import type { ModelContext } from "../core/pipeline/context"
import {
  CONTROL_LAYERS,
  stackProps,
  thermalOutcomes,
} from "../core/pipeline/stackProps"
import { drawMaterials } from "../core/pipeline/uncertainty"
import { deriveSeed } from "../core/rng"
import type { FlaggedDesignRow } from "../core/schema"

export type WorkerJob = {
  ctx: ModelContext
  cands: FlaggedDesignRow[]
  scenarios: Scenario[]
  nMc: number
  seed: number
  lo: number
  hi: number
  forwardDebug: boolean
}
type EventFields = Record<string, string | number | boolean>
export type WorkerMsg =
  | {
      type: "events"
      list: { event: string; level: Level; fields: EventFields }[]
    }
  | { type: "eval"; idx: number; ms: number }
  | { type: "done"; data: Float64Array; nStack: number; nThermal: number }
  | {
      type: "error"
      error: { code?: number; phase?: string; key?: string; message: string }
    }

/** Per (evaluation, candidate): 4 wetting roughness corners, then per scenario the 9 outcome fields. */
export const FIELDS = 9
export const CORNERS = 4
export const stride = (nScenarios: number): number =>
  CORNERS + nScenarios * FIELDS

const w = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerJob>) => void) | null
  postMessage: (m: WorkerMsg, transfer?: Transferable[]) => void
}

w.onmessage = (e) => {
  const job = e.data
  let buffered: { event: string; level: Level; fields: EventFields }[] = []
  const flush = () => {
    if (buffered.length === 0) return
    w.postMessage({ type: "events", list: buffered })
    buffered = []
  }
  setEventSink((event, level, fields) => {
    if (level === "debug" && !job.forwardDebug) return
    buffered.push({ event, level, fields })
  })
  try {
    const { ctx, cands, scenarios, lo, hi } = job
    const mats = drawMaterials(ctx.mat, job.nMc, deriveSeed(job.seed, 100))
    const nC = cands.length
    const S = scenarios.length
    const st = stride(S)
    const data = new Float64Array((hi - lo) * nC * st)
    let nStack = 0
    let nThermal = 0
    for (let idx = lo; idx < hi; idx++) {
      const t0 = performance.now()
      const mat = idx === 0 ? ctx.mat : mats[idx - 1]
      for (let c = 0; c < nC; c++) {
        const sp = stackProps(
          cands[c] as FlaggedDesignRow,
          CONTROL_LAYERS.C4,
          ctx,
          mat,
        )
        nStack++
        const outs = thermalOutcomes(
          scenarios.map((s) => ({ sp, s })),
          ctx,
        )
        nThermal += S
        let o = ((idx - lo) * nC + c) * st
        data[o++] = sp.wetting_score_corners.lo
        data[o++] = sp.wetting_score_corners.hi
        data[o++] = sp.wetting_theta_corners.lo
        data[o++] = sp.wetting_theta_corners.hi
        for (const r of outs) {
          data[o++] = r.r_solar
          data[o++] = r.t_max_c
          data[o++] = r.q_in_mean_w_m2
          data[o++] = r.corrosion_risk
          data[o++] = r.wetting_score
          data[o++] = r.wetting_theta_deg
          data[o++] = r.delam_proxy
          data[o++] = r.cost_proxy
          data[o++] = r.gel_time_rel
        }
      }
      flush()
      w.postMessage({
        type: "eval",
        idx,
        ms: Math.round(performance.now() - t0),
      })
    }
    flush()
    w.postMessage({ type: "done", data, nStack, nThermal }, [data.buffer])
  } catch (err) {
    flush()
    w.postMessage({
      type: "error",
      error:
        err instanceof SpandekError
          ? {
              code: err.code,
              phase: err.phase,
              ...(err.key !== undefined ? { key: err.key } : {}),
              message: err.message,
            }
          : { message: err instanceof Error ? err.message : String(err) },
    })
  }
}
