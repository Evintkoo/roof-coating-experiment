// Worker entry for budget-table (plan 05 FR-9, D9). One job = one priority profile: its unconstrained optimum (c_max), then
// the levels upward with continuation, then the K_b uncertainty intervals of every entry. A job depends only on its own
// input, so the merged tables do not depend on the worker count. Errors and events are posted to the parent.

import type { Materials } from "../core/config"
import type { Scenario } from "../core/design"
import { SpandekError } from "../core/errors"
import { type Level, setEventSink } from "../core/events"
import {
  type BudgetTable,
  buildBudgetTable,
  type EntryEval,
  levelBudget,
} from "../core/opt/budgetTable"
import {
  budgetSolver,
  makeModel,
  type Norm,
  solveScalar,
} from "../core/opt/objective"
import type { OptResult } from "../core/opt/projectedBfgs"
import { fromScaled } from "../core/opt/vars"
import type { ModelContext } from "../core/pipeline/context"
import { quantile7 } from "../core/pipeline/uncertainty"

export type BudgetJob = {
  profile: string
  weights: number[]
  /** Minimum-cost recipe (scaled) and its cost. */
  uMin: number[]
  cMin: number
  /** Starts of the unconstrained-optimum search (scaled, feasible). */
  starts: number[][]
  nLevels: number
}
export type BudgetWorkerJob = {
  ctx: ModelContext
  scenarios: Scenario[]
  norm: Norm
  cpvc: number
  dftCap: number
  /** The K_b material draws of the intervals (FR-12). */
  draws: Materials[]
  maxIter: number
  kktTol: number
  jobs: BudgetJob[]
  forwardDebug: boolean
}
type EventFields = Record<string, string | number | boolean>
export type BudgetWorkerMsg =
  | {
      type: "events"
      list: { event: string; level: Level; fields: EventFields }[]
    }
  | { type: "table"; index: number; table: BudgetTable }
  | { type: "done" }
  | {
      type: "error"
      error: { code?: number; phase?: string; key?: string; message: string }
    }

const w = self as unknown as {
  onmessage: ((e: MessageEvent<BudgetWorkerJob>) => void) | null
  postMessage: (m: BudgetWorkerMsg) => void
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
    const mk = (m: Materials) =>
      makeModel(job.ctx, job.scenarios, job.norm, job.cpvc, job.dftCap, m)
    const model = mk(job.ctx.mat)
    const drawModels = job.draws.map(mk)
    const opts = { maxIter: job.maxIter, kktTol: job.kktTol }
    job.jobs.forEach((j, index) => {
      const weights = j.weights
      const uMin = Float64Array.from(j.uMin)
      // c_max: the best unconstrained optimum of the profile over the starts (multi-start: the local optima differ)
      let best: OptResult | null = null
      for (const s of j.starts) {
        const r = solveScalar(model, weights, Float64Array.from(s), opts)
        if (r.status === "infeasible") continue
        if (best === null || r.f < best.f) best = r
      }
      if (best === null)
        throw new SpandekError(
          3,
          "budget.build",
          j.profile,
          "no feasible start for the unconstrained optimum",
        )
      const cMax = model.cost(best.u)
      const budgets = Array.from({ length: j.nLevels }, (_, k) =>
        levelBudget(j.cMin, cMax, k, j.nLevels),
      )
      const solve = budgetSolver(model, weights, budgets, uMin, best.u, opts)
      const evalEntry = (u: Float64Array): EntryEval => {
        const objectives = model.objectives(u)
        const perObjective: number[][] = [[], [], [], [], []]
        for (const m of drawModels) {
          const o = m.objectives(u)
          for (let i = 0; i < 5; i++)
            (perObjective[i] as number[]).push(o[i] as number)
        }
        const sorted = perObjective.map((a) => Float64Array.from(a).sort())
        return {
          cost: model.cost(u),
          x: fromScaled(u),
          objectives,
          lo: sorted.map((a) => quantile7(a, 0.05)),
          hi: sorted.map((a) => quantile7(a, 0.95)),
          scalar: model.scalar(u, weights),
        }
      }
      const table = buildBudgetTable(
        j.profile,
        solve,
        evalEntry,
        j.cMin,
        cMax,
        j.nLevels,
      )
      flush()
      w.postMessage({ type: "table", index, table })
    })
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
