// Worker entry for refine (plan 05 D9). Runs a contiguous slice of independent constrained solves; every solve depends
// only on its own job, so the merged result does not depend on the worker count. Errors and events are posted to the
// parent, which rethrows and replays them.

import type { Materials } from "../core/config"
import type { Scenario } from "../core/design"
import { SpandekError } from "../core/errors"
import { type Level, setEventSink } from "../core/events"
import {
  type Model,
  makeModel,
  type Norm,
  solveScalar,
} from "../core/opt/objective"
import type { OptStatus } from "../core/opt/projectedBfgs"
import type { ModelContext } from "../core/pipeline/context"

export type SolveJob = {
  id: number
  weights: number[]
  u0: number[]
  /** Index into `draws` (the material set to solve under), or -1 for the nominal materials. */
  draw: number
}
export type SolveResult = {
  id: number
  u: number[]
  f: number
  f0: number
  iters: number
  kkt: number
  status: OptStatus
  maxViolation: number
}
export type RefineWorkerJob = {
  ctx: ModelContext
  scenarios: Scenario[]
  norm: Norm
  cpvc: number
  dftCap: number
  draws: Materials[]
  jobs: SolveJob[]
  maxIter: number
  kktTol: number
  forwardDebug: boolean
}
type EventFields = Record<string, string | number | boolean>
export type RefineWorkerMsg =
  | {
      type: "events"
      list: { event: string; level: Level; fields: EventFields }[]
    }
  | { type: "solved"; result: SolveResult }
  | { type: "done" }
  | {
      type: "error"
      error: { code?: number; phase?: string; key?: string; message: string }
    }

const w = self as unknown as {
  onmessage: ((e: MessageEvent<RefineWorkerJob>) => void) | null
  postMessage: (m: RefineWorkerMsg) => void
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
    const models = new Map<number, Model>()
    const modelFor = (draw: number): Model => {
      let m = models.get(draw)
      if (!m) {
        m = makeModel(
          job.ctx,
          job.scenarios,
          job.norm,
          job.cpvc,
          job.dftCap,
          draw < 0 ? job.ctx.mat : (job.draws[draw] as Materials),
        )
        models.set(draw, m)
      }
      return m
    }
    for (const j of job.jobs) {
      const r = solveScalar(
        modelFor(j.draw),
        j.weights,
        Float64Array.from(j.u0),
        { maxIter: job.maxIter, kktTol: job.kktTol },
      )
      flush()
      w.postMessage({
        type: "solved",
        result: {
          id: j.id,
          u: Array.from(r.u),
          f: r.f,
          f0: r.trace[0] as number,
          iters: r.iters,
          kkt: r.kkt,
          status: r.status,
          maxViolation: r.maxViolation,
        },
      })
    }
    flush()
    w.postMessage({ type: "done" })
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
