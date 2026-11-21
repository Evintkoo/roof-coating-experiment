import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { RESULT_COLUMNS } from "../core/columns"
import { coerceCell, parseCsv, toCsv } from "../core/csv"
import { checkConstraints, type Scenario, weatherL9 } from "../core/design"
import {
  ConfigError,
  DataError,
  InfeasibleError,
  PhysicsRangeError,
  ResourceError,
} from "../core/errors"
import type { ModelContext } from "../core/pipeline/context"
import { DRAW_COLUMNS, type DrawRow } from "../core/pipeline/tables"
import { widenInterval } from "../core/pipeline/uncertainty"
import {
  type FlaggedDesignRow,
  type ResultRow,
  validateDesign,
} from "../core/schema"
import { loadContext } from "./context"
import { emit, levelEnabled } from "./logging"
import {
  CORNERS,
  FIELDS,
  stride,
  type WorkerJob,
  type WorkerMsg,
} from "./simWorker"

export const MAX_WORKERS = 2

export type SimOutput = {
  results: ResultRow[]
  /** nDraws x nCand x 5 (r_solar, t_max, corrosion, delam, cost: scenario means), candidates in candidate_id order, NaN rows for infeasible */
  drawObjectives: Float64Array
  nStackEvals: number
  nThermalEvals: number
}

/** Requested workers, capped at 2 (NFR-2). */
export function effectiveWorkers(requested: number): number {
  if (!Number.isInteger(requested) || requested < 1)
    throw new ConfigError("workers", "must be an integer >= 1")
  return Math.min(requested, MAX_WORKERS)
}

/** Rebuild the worker's SpandekError as the same class (structured clone drops it). */
function rebuild(e: Extract<WorkerMsg, { type: "error" }>["error"]): Error {
  const key = e.key ?? ""
  switch (e.code) {
    case 2:
      return new ConfigError(key, e.message)
    case 3:
      return new InfeasibleError(e.message)
    case 4:
      return new PhysicsRangeError(key, e.message)
    case 5:
      return new DataError(key, e.message)
    case 6:
      return new ResourceError(e.message)
    default:
      return new Error(e.message)
  }
}

// outcome field order (simWorker FIELDS)
const F = {
  r: 0,
  t: 1,
  q: 2,
  cor: 3,
  ws: 4,
  wt: 5,
  del: 6,
  cost: 7,
  gel: 8,
} as const

const idCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Nominal pass plus nMc Latin-hypercube draws over every feasible candidate x scenario (plan 03 Task 4).
 * Results are sorted by (candidate_id, scenario_id); candidates are processed in candidate_id order.
 * Contiguous slices of evaluation indices go to up to 2 Bun Workers and are merged in index order,
 * so the output does not depend on the worker count.
 */
export async function simulateAll(
  design: readonly FlaggedDesignRow[],
  weather: readonly Scenario[],
  ctx: ModelContext,
  nMc: number,
  seed: number,
  workers = MAX_WORKERS,
  signal?: AbortSignal,
): Promise<SimOutput> {
  if (!Number.isInteger(nMc) || nMc < 1)
    throw new ConfigError("n_mc", "must be an integer >= 1")
  const cands = [...design].sort((a, b) =>
    idCmp(a.candidate_id, b.candidate_id),
  )
  const scens = [...weather].sort((a, b) => idCmp(a.scenario_id, b.scenario_id))
  const feas = cands.filter((c) => c.feasible)
  const nF = feas.length
  const S = scens.length
  const nEval = nMc + 1
  const nW = Math.min(effectiveWorkers(workers), nEval)
  emit("sim.start", "info", {
    n_candidates: cands.length,
    n_scenarios: S,
    n_mc: nMc,
    workers: nW,
  })

  const st = stride(S)
  const all = new Float64Array(nEval * nF * st)
  let nStack = 0
  let nThermal = 0
  let done = 0
  let progressSent = 0
  const forwardDebug = levelEnabled("debug")
  const size = Math.ceil(nEval / nW)
  const pool: Worker[] = []
  const stop = () => {
    for (const w of pool) w.terminate()
  }
  const onProgress = () => {
    while (
      progressSent < 10 &&
      done >= Math.ceil(((progressSent + 1) * nEval) / 10)
    ) {
      progressSent++
      emit("sim.progress", "info", { done, total: nEval })
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      let pending = 0
      let failed = false
      const fail = (e: Error) => {
        if (failed) return
        failed = true
        stop()
        reject(e)
      }
      if (signal?.aborted) return fail(new Error("aborted"))
      signal?.addEventListener("abort", () => fail(new Error("aborted")), {
        once: true,
      })
      for (let i = 0; i < nW; i++) {
        const lo = i * size
        const hi = Math.min(nEval, lo + size)
        if (lo >= hi) continue
        pending++
        const w = new Worker(new URL("./simWorker.ts", import.meta.url).href)
        pool.push(w)
        w.onmessage = (e: MessageEvent<WorkerMsg>) => {
          const m = e.data
          if (m.type === "events") {
            for (const ev of m.list) emit(ev.event, ev.level, ev.fields)
          } else if (m.type === "eval") {
            emit("sim.draw_complete", "debug", {
              draw: m.idx - 1,
              elapsed_ms: m.ms,
            })
            done++
            onProgress()
          } else if (m.type === "done") {
            all.set(m.data, lo * nF * st)
            nStack += m.nStack
            nThermal += m.nThermal
            w.terminate()
            if (--pending === 0 && !failed) resolve()
          } else {
            fail(rebuild(m.error))
          }
        }
        w.onerror = (ev) => fail(new Error(ev.message || "worker crashed"))
        const job: WorkerJob = {
          ctx,
          cands: feas,
          scenarios: [...scens],
          nMc,
          seed,
          lo,
          hi,
          forwardDebug,
        }
        w.postMessage(job)
      }
      if (pending === 0) resolve()
    })
  } finally {
    stop()
  }

  const at = (ev: number, c: number, s: number, f: number): number =>
    all[(ev * nF + c) * st + CORNERS + s * FIELDS + f] as number
  const corner = (c: number, k: number): number => all[c * st + k] as number // nominal (evaluation 0)
  const scratch = new Float64Array(nMc)
  const band = (c: number, s: number, f: number, pred: number) => {
    for (let d = 0; d < nMc; d++) scratch[d] = at(d + 1, c, s, f)
    return widenInterval(pred, scratch)
  }

  const results: ResultRow[] = []
  let fi = 0
  for (const cand of cands) {
    const base = {
      candidate_id: cand.candidate_id,
      primer_gptes_molfrac: cand.primer_gptes_molfrac,
      primer_dft_um: cand.primer_dft_um,
      midcoat_pvc: cand.midcoat_pvc,
      midcoat_tio2_fraction: cand.midcoat_tio2_fraction,
      midcoat_dft_um: cand.midcoat_dft_um,
      topcoat_mtes_molfrac: cand.topcoat_mtes_molfrac,
      topcoat_dft_um: cand.topcoat_dft_um,
      feasible: cand.feasible,
    }
    const c = fi
    if (cand.feasible) fi++
    scens.forEach((sc, s) => {
      const nan = Number.NaN
      const row: Record<string, string | number | boolean> = {
        ...base,
        scenario_id: sc.scenario_id,
      }
      for (const col of RESULT_COLUMNS) if (!(col in row)) row[col] = nan
      if (cand.feasible) {
        const nom = (f: number) => at(0, c, s, f)
        const put = (
          pred: string,
          lo: string,
          hi: string,
          f: number,
          extra?: [number, number],
        ) => {
          const p = nom(f)
          const w = band(c, s, f, p)
          row[pred] = p
          row[lo] = extra ? Math.min(w.lo, extra[0]) : w.lo
          row[hi] = extra ? Math.max(w.hi, extra[1]) : w.hi
        }
        put("r_solar_pred", "r_solar_lo", "r_solar_hi", F.r)
        put("t_max_pred", "t_max_lo", "t_max_hi", F.t)
        put(
          "corrosion_proxy",
          "corrosion_proxy_lo",
          "corrosion_proxy_hi",
          F.cor,
        )
        put("wetting_proxy", "wetting_proxy_lo", "wetting_proxy_hi", F.ws, [
          corner(c, 0),
          corner(c, 1),
        ])
        put(
          "wetting_theta_pred",
          "wetting_theta_lo",
          "wetting_theta_hi",
          F.wt,
          [corner(c, 2), corner(c, 3)],
        )
        put("q_in_mean_w_m2", "q_in_mean_w_m2_lo", "q_in_mean_w_m2_hi", F.q)
        put("delam_proxy", "delam_proxy_lo", "delam_proxy_hi", F.del)
        row.cost_proxy = nom(F.cost)
        row.gel_time_rel = nom(F.gel)
      }
      results.push(row as ResultRow)
    })
  }

  const nCand = cands.length
  const obj = new Float64Array(nMc * nCand * 5).fill(Number.NaN)
  const order = [F.r, F.t, F.cor, F.del, F.cost]
  for (let d = 0; d < nMc; d++) {
    let c = 0
    cands.forEach((cand, ci) => {
      if (!cand.feasible) return
      order.forEach((f, k) => {
        let sum = 0
        for (let s = 0; s < S; s++) sum += at(d + 1, c, s, f)
        obj[(d * nCand + ci) * 5 + k] = sum / S
      })
      c++
    })
  }
  return {
    results,
    drawObjectives: obj,
    nStackEvals: nStack,
    nThermalEvals: nThermal,
  }
}

// ---- the simulate command ----

export type SimulateOptions = {
  design: string
  out: string
  seed: number
  nMc: number
  workers: number
  configDir: string
  dataDir: string
  runId: string
  signal?: AbortSignal
}

/** candidates.csv (design command output) into validated, flagged rows. */
function readDesign(dir: string): FlaggedDesignRow[] {
  const path = join(dir, "candidates.csv")
  if (!existsSync(path))
    throw new DataError(
      "design",
      "candidates.csv not found in the design directory",
    )
  let rows: FlaggedDesignRow[]
  try {
    const raw = parseCsv(readFileSync(path, "utf8")).map((rec) => {
      const o: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(rec)) {
        if (k === "candidate_id" || k === "violations") o[k] = v
        else if (k === "feasible") {
          if (v !== "true" && v !== "false")
            throw new ConfigError("feasible", "feasible must be true or false")
          o[k] = v === "true"
        } else o[k] = coerceCell(k, v)
      }
      return o
    })
    rows = validateDesign(raw, true)
  } catch (e) {
    if (e instanceof DataError)
      throw new ConfigError(e.key ?? "design", e.message)
    throw e
  }
  return rows
}

export async function runSimulate(o: SimulateOptions): Promise<void> {
  const design = readDesign(o.design)
  const ctx = await loadContext(o.configDir, o.dataDir)
  // D11: the feasible flag must agree with the recomputed constraints
  const flagged = checkConstraints(design, ctx.ranges)
  design.forEach((r, i) => {
    if (r.feasible !== (flagged[i] as FlaggedDesignRow).feasible)
      throw new ConfigError(
        "feasible",
        `${r.candidate_id}: feasible flag disagrees with the recomputed constraints`,
      )
  })
  const sim = await simulateAll(
    design,
    weatherL9(ctx.weather),
    ctx,
    o.nMc,
    o.seed,
    o.workers,
    o.signal,
  )

  const nCand = design.length
  const sorted = [...design].sort((a, b) =>
    idCmp(a.candidate_id, b.candidate_id),
  )
  const draws: DrawRow[] = []
  for (let d = 0; d < o.nMc; d++)
    sorted.forEach((c, ci) => {
      if (!c.feasible) return
      const v = (k: number) =>
        sim.drawObjectives[(d * nCand + ci) * 5 + k] as number
      draws.push({
        draw: d,
        candidate_id: c.candidate_id,
        r_solar_pred: v(0),
        t_max_pred: v(1),
        corrosion_proxy: v(2),
        delam_proxy: v(3),
        cost_proxy: v(4),
      })
    })
  const files: [string, string][] = [
    ["results.csv", toCsv(RESULT_COLUMNS, sim.results)],
    ["draws.csv", toCsv(DRAW_COLUMNS, draws)],
    [
      "run_meta.json",
      `${JSON.stringify({ seed: o.seed, n_mc: o.nMc, run_id: o.runId }, null, 2)}\n`,
    ],
  ]
  // temp names first, rename only after every write succeeded: no partial output
  mkdirSync(o.out, { recursive: true })
  const tmps = files.map(([n]) => join(o.out, `${n}.tmp`))
  try {
    for (const [i, [, text]] of files.entries())
      writeFileSync(tmps[i] as string, text)
  } catch (e) {
    for (const t of tmps) rmSync(t, { force: true })
    throw e
  }
  for (const [i, [n]] of files.entries())
    renameSync(tmps[i] as string, join(o.out, n))
  console.log(
    `simulate: ${sim.results.length} result rows, ${draws.length} draw rows, ${sim.nStackEvals} stack and ${sim.nThermalEvals} thermal evaluations`,
  )
}
