import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { toCsv } from "../core/csv"
import { type Scenario, weatherL9 } from "../core/design"
import { ConfigError, ResourceError, SpandekError } from "../core/errors"
import { gradient, richardsonCheck } from "../core/opt/gradient"
import { type Model, makeModel, solveQuantile } from "../core/opt/objective"
import type { OptimizeConfig } from "../core/opt/optConfig"
import { secondOrderCheck } from "../core/opt/projectedBfgs"
import {
  normalised,
  normaliseObjectives,
  OBJECTIVE_NAMES,
  trueChebyshev,
} from "../core/opt/scalarize"
import { sobolPoints } from "../core/opt/sobol"
import { type ToleranceRow, toleranceTable } from "../core/opt/tolerance"
import { fromScaled, toScaled, VARS } from "../core/opt/vars"
import type { ModelContext } from "../core/pipeline/context"
import { OBJECTIVES, paretoFront } from "../core/pipeline/optimize"
import {
  OBJECTIVE_COLUMNS,
  type ParetoRow,
  parseDrawsCsv,
  parseParetoCsv,
  ROLES,
} from "../core/pipeline/tables"
import { drawMaterials, quantile7 } from "../core/pipeline/uncertainty"
import { deriveSeed } from "../core/rng"
import { parseResultsCsv, type ResultRow } from "../core/schema"
import { emit, levelEnabled } from "./logging"
import type {
  RefineWorkerJob,
  RefineWorkerMsg,
  SolveJob,
  SolveResult,
} from "./refineWorker"
import { effectiveWorkers } from "./simulate"

type Role = (typeof ROLES)[number]

export type RefineOpts = {
  /** Output directory (the plan-3 directory `dir` is only read). */
  out: string
  cfg: OptimizeConfig
  /** Total balanced starts (default 20 = 10 Pareto + 10 Sobol, split as `--starts` says). */
  starts?: number
  workers?: number
  signal?: AbortSignal
  /** Total solver iterations per solve (D3: 60). */
  maxIter?: number
  /** Projected-gradient stop (default: cfg.t_kkt). */
  kktTol?: number
  /** Overrides cfg.robust_draws (tests only). */
  robustDraws?: number
  /** Fresh draws of the H9 comparison (default 256). */
  freshDraws?: number
  runId?: string
}

export const SCENARIO_SETS = ["generic9", "indonesia"] as const

/** The corner vectors that are run: delam_proxy is a hard constraint (FR-1), so it gets no corner of its own. */
const CONSTRAINED_OBJECTIVE = "delam_proxy"
/** Role -> the weight vector its recipe is optimised for. */
const ROLE_WEIGHT: Record<Role, string> = {
  high_performing: "corner_r_solar_pred",
  balanced: "balanced",
  low_cost: "corner_cost_proxy",
}
const VIOLATION_TOL = 1e-9
const NEVER = Number.NaN

const idCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const phaseErr = (
  code: 3 | 4 | 5 | 6,
  phase: string,
  key: string,
  msg: string,
) => new SpandekError(code, phase, key, msg)

// ---- plan-3 inputs ----

export type Plan3 = {
  seed: number
  runId: string
  results: ResultRow[]
  pareto: ParetoRow[]
}

function readIn(dir: string, name: string): string {
  const path = join(dir, name)
  if (!existsSync(path))
    throw phaseErr(
      5,
      "refine.load",
      name,
      `${name} not found in the input directory`,
    )
  return readFileSync(path, "utf8")
}

/** Reads and validates the four plan-3 files (run_meta.json is simulate's completion marker); missing or bad: exit 5. */
export function loadPlan3(dir: string): Plan3 {
  const metaText = readIn(dir, "run_meta.json")
  const resultsText = readIn(dir, "results.csv")
  const drawsText = readIn(dir, "draws.csv")
  const paretoText = readIn(dir, "pareto.csv")
  let meta: Record<string, unknown>
  try {
    meta = JSON.parse(metaText) as Record<string, unknown>
  } catch {
    throw phaseErr(5, "refine.load", "run_meta.json", "not valid JSON")
  }
  const seed = meta.seed
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0)
    throw phaseErr(5, "refine.load", "run_meta.json", "needs an integer seed")
  try {
    parseDrawsCsv(drawsText)
    return {
      seed,
      runId: typeof meta.run_id === "string" ? meta.run_id : "",
      results: parseResultsCsv(resultsText),
      pareto: parseParetoCsv(paretoText),
    }
  } catch (e) {
    if (e instanceof SpandekError && e.code === 5) throw e
    throw phaseErr(5, "refine.load", "plan-3 files", (e as Error).message)
  }
}

// ---- worker pool ----

type Common = Omit<RefineWorkerJob, "jobs" | "forwardDebug">

/** Contiguous slices of the jobs go to up to `nW` workers; results are returned in job order (D9). */
async function runSolves(
  jobs: SolveJob[],
  common: Common,
  nW: number,
  signal: AbortSignal | undefined,
  onSolved: (r: SolveResult) => void,
): Promise<SolveResult[]> {
  const out = new Array<SolveResult>(jobs.length)
  if (jobs.length === 0) return out
  const workers = Math.min(nW, jobs.length)
  const size = Math.ceil(jobs.length / workers)
  const pool: Worker[] = []
  const stop = () => {
    for (const w of pool) w.terminate()
  }
  const forwardDebug = levelEnabled("debug")
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
      if (signal?.aborted) return fail(new ResourceError("time limit exceeded"))
      signal?.addEventListener(
        "abort",
        () => fail(new ResourceError("time limit exceeded")),
        { once: true },
      )
      for (let i = 0; i < workers; i++) {
        const lo = i * size
        const hi = Math.min(jobs.length, lo + size)
        if (lo >= hi) continue
        pending++
        const w = new Worker(new URL("./refineWorker.ts", import.meta.url).href)
        pool.push(w)
        w.onmessage = (e: MessageEvent<RefineWorkerMsg>) => {
          const m = e.data
          if (m.type === "events") {
            for (const ev of m.list) emit(ev.event, ev.level, ev.fields)
          } else if (m.type === "solved") {
            out[m.result.id] = m.result
            onSolved(m.result)
          } else if (m.type === "done") {
            w.terminate()
            if (--pending === 0 && !failed) resolve()
          } else {
            const er = m.error
            fail(
              er.code === 3 || er.code === 4 || er.code === 5 || er.code === 6
                ? phaseErr(
                    er.code,
                    er.phase ?? "refine.run",
                    er.key ?? "",
                    er.message,
                  )
                : new Error(er.message),
            )
          }
        }
        w.onerror = (ev) => fail(new Error(ev.message || "worker crashed"))
        const job: RefineWorkerJob = {
          ...common,
          jobs: jobs.slice(lo, hi),
          forwardDebug,
        }
        w.postMessage(job)
      }
      if (pending === 0) resolve()
    })
  } finally {
    stop()
  }
  return out
}

// ---- helpers ----

const weightVector = (cfg: OptimizeConfig, id: string): number[] => {
  const w = cfg.weights[id]
  if (!w) throw new ConfigError(`weights.${id}`, "weight vector missing")
  return OBJECTIVE_NAMES.map((n) => w[n] as number)
}

/** FR-3: move an infeasible point toward the reference by bisection to the last feasible point of the segment. */
function toFeasible(
  model: Model,
  u: Float64Array,
  ref: Float64Array,
): Float64Array {
  if (model.maxViolation(u) <= 0) return u
  let lo = 0
  let hi = 1
  const at = (t: number) =>
    Float64Array.from(ref, (v, i) => v + t * ((u[i] as number) - v))
  for (let k = 0; k < 60; k++) {
    const t = 0.5 * (lo + hi)
    if (model.maxViolation(at(t)) <= 0) lo = t
    else hi = t
  }
  return at(lo)
}

const physical = (u: Float64Array): number[] => fromScaled(u)

type Solution = {
  weightId: string
  startId: number
  origin: string
  u: Float64Array
  S: number
  trueCheb: number
  f0: number
  iters: number
  kkt: number
  status: string
  maxViolation: number
  obj: number[]
}

const VAR_IDS = VARS.map((v) => v.id)
const FRONT_COLUMNS = [
  "weight_id",
  "start_id",
  "origin",
  "S",
  "cheb_true",
  ...VAR_IDS,
  ...OBJECTIVE_COLUMNS,
  "max_violation",
  "kkt",
  "status",
] as const

const tolCols = VAR_IDS.flatMap((v) => [
  `tol_lo_${v}`,
  `tol_hi_${v}`,
  `tol_clipped_${v}`,
])
const elastCols = OBJECTIVE_COLUMNS.flatMap((o) =>
  VAR_IDS.map((v) => `elast_${o}_${v}`),
)
const RECIPE_COLUMNS = [
  "role",
  "weight_id",
  "start_id",
  "screened_id",
  "S",
  "cheb_true",
  ...VAR_IDS,
  ...OBJECTIVE_COLUMNS,
  "above_c1",
  "max_violation",
  "saddle",
  "min_eig",
  "kkt",
  "status",
  ...tolCols,
  ...elastCols,
] as const
const TOLERANCE_COLUMNS = [
  "role",
  "variable",
  "x_star",
  "tol_lo",
  "tol_hi",
  "tol_lo_scaled",
  "tol_hi_scaled",
  "loss_lo",
  "loss_hi",
  "loss_edge",
  "clipped",
  "grows",
] as const
const ROBUST_COLUMNS = [
  "kind",
  "name",
  "value",
  "p05",
  "p50",
  "p95",
  "min",
  "max",
] as const
const ROBUST_NAN = new Set(["p05", "p50", "p95", "min", "max"])

/** Validates the rows about to be written: constraints hold to 1e-9, the box holds, and the three roles are present once. */
function validateOutputs(
  front: readonly Record<string, string | number | boolean>[],
  recipes: readonly Record<string, string | number | boolean>[],
): void {
  for (const r of [...front, ...recipes]) {
    if (
      (r.max_violation as number | undefined) !== undefined &&
      (r.max_violation as number) > VIOLATION_TOL
    )
      throw phaseErr(
        4,
        "refine.validate",
        "max_violation",
        "an output violates a constraint",
      )
    VARS.forEach((v) => {
      const x = r[v.id] as number
      if (!(x >= v.lo - 1e-12 && x <= v.hi + 1e-12))
        throw phaseErr(
          4,
          "refine.validate",
          v.id,
          "an output is outside the box",
        )
    })
  }
  const roles = recipes.map((r) => r.role as string).sort()
  if (roles.join() !== [...ROLES].sort().join())
    throw phaseErr(
      4,
      "refine.validate",
      "role",
      "recipes need exactly the three roles",
    )
}

/** Richardson check at u: exit 4 (phase refine.gradcheck) when any variable exceeds the frozen bound. */
export function gradcheckOrThrow(
  f: (u: Float64Array) => number,
  u: Float64Array,
  h: readonly number[],
  ids: readonly string[],
  bound: number,
): number[] {
  const diffs = richardsonCheck(f, u, h)
  let bad = ""
  diffs.forEach((d, i) => {
    emit("refine.gradcheck", "info", {
      variable: ids[i] as string,
      step_h: h[i] as number,
      rich_diff_rel: d,
    })
    if (!(d <= bound) && bad === "") bad = ids[i] as string
  })
  if (bad !== "")
    throw phaseErr(
      4,
      "refine.gradcheck",
      bad,
      `the gradient of ${bad} is not smooth enough (Richardson difference above the bound)`,
    )
  return diffs
}

const checkAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new ResourceError("time limit exceeded")
}

// ---- the command ----

export async function runRefine(
  ctx: ModelContext,
  shortlist: Record<string, string>,
  seed: number,
  dir: string,
  opts: RefineOpts,
): Promise<void> {
  try {
    await runRefineInner(ctx, shortlist, seed, dir, opts)
  } catch (e) {
    if (e instanceof SpandekError)
      emit("refine.failed", "error", { phase: e.phase, code: e.code })
    throw e
  }
}

async function runRefineInner(
  ctx: ModelContext,
  shortlist: Record<string, string>,
  seed: number,
  dir: string,
  opts: RefineOpts,
): Promise<void> {
  const t0 = performance.now()
  const { cfg, signal } = opts
  const nW = effectiveWorkers(opts.workers ?? 2)
  const maxIter = opts.maxIter ?? cfg.max_iter
  const kktTol = opts.kktTol ?? cfg.t_kkt
  const hs = VARS.map((v) => v.h)
  const p3 = loadPlan3(dir)
  checkAbort(signal)

  const scenarios: Scenario[] = weatherL9(ctx.weather)
  const cpvc = ctx.ranges.cpvc.value
  const cap = ctx.ranges.max_total_dft_um.value
  const nStarts = opts.starts ?? cfg.starts.pareto + cfg.starts.sobol
  if (!Number.isInteger(nStarts) || nStarts < 1)
    throw new ConfigError("starts", "must be an integer >= 1")
  if ((VARS[2] as (typeof VARS)[number]).lo > cpvc)
    throw phaseErr(
      3,
      "refine.feasible",
      "cpvc",
      `cpvc ${cpvc} is below the lowest PVC ${(VARS[2] as (typeof VARS)[number]).lo}: no feasible recipe`,
    )

  const norm = normaliseObjectives(p3.results)
  const model = makeModel(ctx, scenarios, norm, cpvc, cap)
  const wBal = weightVector(cfg, "balanced")

  // screened candidates (design columns of results.csv, nominal grades) under the same S
  const nomGrades = [
    Math.min(
      Math.max(
        ctx.mat.tio2.diameter_um.value,
        (VARS[7] as (typeof VARS)[number]).lo,
      ),
      (VARS[7] as (typeof VARS)[number]).hi,
    ),
    Math.min(
      Math.max(
        ctx.mat.baso4.diameter_um.value,
        (VARS[8] as (typeof VARS)[number]).lo,
      ),
      (VARS[8] as (typeof VARS)[number]).hi,
    ),
  ]
  const uOfCand = new Map<string, Float64Array>()
  for (const r of p3.results) {
    if (!r.feasible || uOfCand.has(r.candidate_id)) continue
    uOfCand.set(
      r.candidate_id,
      toScaled([
        r.primer_gptes_molfrac,
        r.primer_dft_um,
        r.midcoat_pvc,
        r.midcoat_tio2_fraction,
        r.midcoat_dft_um,
        r.topcoat_mtes_molfrac,
        r.topcoat_dft_um,
        ...nomGrades,
      ]),
    )
  }
  const screened = [...uOfCand.keys()].sort(idCmp).map((id) => {
    const u = uOfCand.get(id) as Float64Array
    return { id, u, S: model.scalar(u, wBal), ok: model.maxViolation(u) <= 0 }
  })
  const okScreened = screened.filter((s) => s.ok)
  if (okScreened.length === 0)
    throw phaseErr(
      3,
      "refine.feasible",
      "constraints",
      "no screened candidate satisfies the constraints",
    )
  const best = okScreened.reduce((a, b) => (b.S < a.S ? b : a))
  const uRef = best.u
  emit("refine.screened.best", "info", { candidate_id: best.id, S: best.S })
  checkAbort(signal)

  // D1: Richardson check at the best screened point
  gradcheckOrThrow(
    (u) => model.scalar(u, wBal),
    uRef,
    hs,
    VAR_IDS,
    cfg.t_grad_rel,
  )

  // FR-3 starts: the top Pareto candidates by pareto_freq, then Sobol points (stream 300), all moved to feasibility
  const nPareto = Math.min(
    cfg.starts.pareto,
    Math.ceil(nStarts / 2),
    p3.pareto.length,
  )
  const nSobol = nStarts - nPareto
  const byFreq = [...p3.pareto]
    .filter((p) => uOfCand.has(p.candidate_id))
    .sort(
      (a, b) =>
        b.pareto_freq - a.pareto_freq || idCmp(a.candidate_id, b.candidate_id),
    )
  const starts: { id: number; origin: string; u0: Float64Array }[] = []
  for (const p of byFreq.slice(0, nPareto))
    starts.push({
      id: starts.length,
      origin: p.candidate_id,
      u0: toFeasible(model, uOfCand.get(p.candidate_id) as Float64Array, uRef),
    })
  sobolPoints(nSobol, VARS.length, deriveSeed(seed, 300)).forEach((row, i) => {
    starts.push({
      id: starts.length,
      origin: `sobol-${i}`,
      u0: toFeasible(model, Float64Array.from(row), uRef),
    })
  })
  cfg.extra_starts.forEach((x, i) => {
    starts.push({
      id: starts.length,
      origin: `extra-${i}`,
      u0: toFeasible(model, toScaled(x), uRef),
    })
  })
  checkAbort(signal)

  const common: Common = {
    ctx,
    scenarios,
    norm,
    cpvc,
    dftCap: cap,
    draws: [],
    maxIter,
    kktTol,
  }
  const solutions: Solution[] = []
  const mkSolution = (
    weightId: string,
    startId: number,
    origin: string,
    r: SolveResult,
  ): Solution => {
    const u = Float64Array.from(r.u)
    const w = weightVector(cfg, weightId)
    const obj = model.objectives(u)
    return {
      weightId,
      startId,
      origin,
      u,
      S: r.f,
      trueCheb: trueChebyshev(normalised(obj, norm), w),
      f0: r.f0,
      iters: r.iters,
      kkt: r.kkt,
      status: r.status,
      maxViolation: r.maxViolation,
      obj,
    }
  }
  // phase 1: balanced weights from every start
  const jobs1: SolveJob[] = starts.map((s, i) => ({
    id: i,
    weights: wBal,
    u0: Array.from(s.u0),
    draw: -1,
  }))
  const res1 = await runSolves(jobs1, common, nW, signal, (r) => {
    const s = starts[r.id] as (typeof starts)[number]
    emit("refine.start.done", "info", {
      start_id: s.id,
      weight_id: "balanced",
      iters: r.iters,
      f0: r.f0,
      f_final: r.f,
      kkt: r.kkt,
      status: r.status,
    })
    console.log(
      `refine: start ${s.id + 1}/${starts.length} balanced S ${r.f0.toFixed(5)} -> ${r.f.toFixed(5)} (${r.status}, ${r.iters} it)`,
    )
  })
  starts.forEach((s, i) => {
    solutions.push(
      mkSolution("balanced", s.id, s.origin, res1[i] as SolveResult),
    )
  })
  checkAbort(signal)

  // phase 2: corner vectors for the best starts, warm-started
  const corners = Object.keys(cfg.weights)
    .filter(
      (k) => k.startsWith("corner_") && k !== `corner_${CONSTRAINED_OBJECTIVE}`,
    )
    .sort(idCmp)
  const bestStarts = [...solutions]
    .sort((a, b) => a.S - b.S || a.startId - b.startId)
    .slice(0, Math.min(cfg.starts.corner, solutions.length))
  const cornerPlan = corners.flatMap((c) => bestStarts.map((s) => ({ c, s })))
  const jobs2: SolveJob[] = cornerPlan.map(({ c, s }, i) => ({
    id: i,
    weights: weightVector(cfg, c),
    u0: Array.from(s.u),
    draw: -1,
  }))
  const res2 = await runSolves(jobs2, common, nW, signal, (r) => {
    const { c, s } = cornerPlan[r.id] as (typeof cornerPlan)[number]
    emit("refine.start.done", "info", {
      start_id: s.startId,
      weight_id: c,
      iters: r.iters,
      f0: r.f0,
      f_final: r.f,
      kkt: r.kkt,
      status: r.status,
    })
    console.log(
      `refine: start ${s.startId} ${c} S ${r.f0.toFixed(5)} -> ${r.f.toFixed(5)} (${r.status}, ${r.iters} it)`,
    )
  })
  cornerPlan.forEach(({ c, s }, i) => {
    solutions.push(mkSolution(c, s.startId, s.origin, res2[i] as SolveResult))
  })
  checkAbort(signal)
  solutions.sort(
    (a, b) => idCmp(a.weightId, b.weightId) || a.startId - b.startId,
  )

  // refined front: non-dominated solutions over the five objectives
  const sense = OBJECTIVES.map(([, s]) => s)
  const onFront = paretoFront(
    solutions.map((s) => s.obj),
    sense,
  )
  const frontSolutions = solutions.filter((_, i) => onFront[i])
  const nRemoved = solutions.length - frontSolutions.length
  const balancedS = solutions
    .filter((s) => s.weightId === "balanced")
    .map((s) => s.S)
  const sBest = Math.min(...balancedS)
  const sWorst = Math.max(...balancedS)
  emit("refine.front.done", "info", {
    n_points: frontSolutions.length,
    n_dominated_removed: nRemoved,
    s_best: sBest,
    s_worst: sWorst,
    s_spread: sWorst - sBest,
    n_screened_better: screened.filter((s) => s.ok && s.S < sBest).length,
  })

  // recipes: for each role the best solve of its weight vector (the high-performing and low-cost ones under the
  // corner vector of r_solar and cost); low cost must also beat the datasheet C1 reflectance when any solve does
  const c1 = ctx.controls.c1_r_solar.value
  const pickRole = (role: Role): Solution => {
    const pool = solutions
      .filter((s) => s.weightId === ROLE_WEIGHT[role])
      .sort((a, b) => a.S - b.S || a.startId - b.startId)
    const pick =
      role === "low_cost"
        ? (pool.find((s) => (s.obj[0] as number) > c1) ?? pool[0])
        : pool[0]
    if (!pick)
      throw phaseErr(3, "refine.feasible", role, `no solve for role ${role}`)
    return pick
  }
  const recipeSol = Object.fromEntries(
    ROLES.map((r) => [r, pickRole(r)]),
  ) as Record<Role, Solution>
  const recipeRows: Record<string, string | number | boolean>[] = []
  const tolRows: Record<string, string | number | boolean>[] = []
  const tolByRole = new Map<Role, ToleranceRow[]>()
  const roleSaddle = new Map<Role, boolean>()
  for (const role of ROLES) {
    checkAbort(signal)
    const sol = recipeSol[role]
    const w = weightVector(cfg, ROLE_WEIGHT[role])
    const f = (u: Float64Array) => model.scalar(u, w)
    const so = secondOrderCheck(f, sol.u, hs, kktTol)
    roleSaddle.set(role, so.saddle)
    const tol = toleranceTable(f, sol.u, hs, cfg.tol_loss, { role })
    tolByRole.set(role, tol)
    const x = physical(sol.u)
    const row: Record<string, string | number | boolean> = {
      role,
      weight_id: sol.weightId,
      start_id: sol.startId,
      screened_id: shortlist[role] ?? "",
      S: sol.S,
      cheb_true: sol.trueCheb,
      above_c1: (sol.obj[0] as number) > c1,
      saddle: so.saddle,
      min_eig: so.minEig,
      kkt: sol.kkt,
      status: sol.status,
      max_violation: sol.maxViolation,
    }
    VARS.forEach((v, i) => {
      row[v.id] = x[i] as number
    })
    OBJECTIVE_COLUMNS.forEach((o, j) => {
      row[o] = sol.obj[j] as number
    })
    tol.forEach((t, i) => {
      const v = VARS[i] as (typeof VARS)[number]
      const range = v.hi - v.lo
      row[`tol_lo_${v.id}`] = t.tol_lo * range
      row[`tol_hi_${v.id}`] = t.tol_hi * range
      row[`tol_clipped_${v.id}`] = t.clipped
      tolRows.push({
        role,
        variable: v.id,
        x_star: x[i] as number,
        tol_lo: t.tol_lo * range,
        tol_hi: t.tol_hi * range,
        tol_lo_scaled: t.tol_lo,
        tol_hi_scaled: t.tol_hi,
        loss_lo: t.loss_lo,
        loss_hi: t.loss_hi,
        loss_edge: t.loss_edge,
        clipped: t.clipped,
        grows: t.grows,
      })
    })
    // FR-7 local elasticities d ln f / d ln x of each objective, from the scaled gradients
    OBJECTIVE_COLUMNS.forEach((o, j) => {
      const g = gradient((u) => model.objectives(u)[j] as number, sol.u, hs)
      const fj = sol.obj[j] as number
      VARS.forEach((v, i) => {
        const dfdx = (g[i] as number) / (v.hi - v.lo)
        row[`elast_${o}_${v.id}`] =
          Math.abs(fj) < 1e-12 ? 0 : (dfdx * (x[i] as number)) / fj
      })
    })
    recipeRows.push(row)
  }
  checkAbort(signal)

  // FR-5 robust: K draws (stream 301); each draw's own optimum warm-started at the balanced optimum, then the p90 optimum
  const K = opts.robustDraws ?? cfg.robust_draws
  const uNom = (recipeSol.balanced as Solution).u
  const draws = drawMaterials(ctx.mat, K, deriveSeed(seed, 301))
  const jobs3: SolveJob[] = draws.map((_, k) => ({
    id: k,
    weights: wBal,
    u0: Array.from(uNom),
    draw: k,
  }))
  const res3 = await runSolves(
    jobs3,
    { ...common, draws },
    nW,
    signal,
    () => {},
  )
  checkAbort(signal)
  const drawModels = draws.map((m) =>
    makeModel(ctx, scenarios, norm, cpvc, cap, m),
  )
  const sol90 = solveQuantile(drawModels, model, wBal, uNom, 0.9, {
    maxIter,
    kktTol,
  })
  const uRob = sol90.u
  const quant = (vals: number[], p: number) =>
    quantile7(Float64Array.from(vals).sort(), p)

  // H9: nominal vs robust recipe on fresh draws (stream 302); regret is against the better of the two recipes per draw
  const nFresh = opts.freshDraws ?? 256
  const fresh = drawMaterials(ctx.mat, nFresh, deriveSeed(seed, 302))
  const sNom: number[] = []
  const sRob: number[] = []
  for (const m of fresh) {
    const mm = makeModel(ctx, scenarios, norm, cpvc, cap, m)
    sNom.push(mm.scalar(uNom, wBal))
    sRob.push(mm.scalar(uRob, wBal))
  }
  const regret = (a: number[], b: number[]) =>
    a.map((v, k) => v - Math.min(v, b[k] as number))
  const trainNom = quant(
    drawModels.map((m) => m.scalar(uNom, wBal)),
    0.9,
  )
  const trainRob = quant(
    drawModels.map((m) => m.scalar(uRob, wBal)),
    0.9,
  )
  const robustRows: Record<string, string | number | boolean>[] = []
  const xNom = physical(uNom)
  const xRob = physical(uRob)
  VARS.forEach((v, i) => {
    robustRows.push({
      kind: "nominal",
      name: v.id,
      value: xNom[i] as number,
      p05: NEVER,
      p50: NEVER,
      p95: NEVER,
      min: NEVER,
      max: NEVER,
    })
    robustRows.push({
      kind: "robust",
      name: v.id,
      value: xRob[i] as number,
      p05: NEVER,
      p50: NEVER,
      p95: NEVER,
      min: NEVER,
      max: NEVER,
    })
    const lv = res3.map((r) => physical(Float64Array.from(r.u))[i] as number)
    robustRows.push({
      kind: "distribution",
      name: v.id,
      value: lv.reduce((a, b) => a + b, 0) / lv.length,
      p05: quant(lv, 0.05),
      p50: quant(lv, 0.5),
      p95: quant(lv, 0.95),
      min: Math.min(...lv),
      max: Math.max(...lv),
    })
  })
  const fr = (name: string, value: number) =>
    robustRows.push({
      kind: "fresh",
      name,
      value,
      p05: NEVER,
      p50: NEVER,
      p95: NEVER,
      min: NEVER,
      max: NEVER,
    })
  fr("s_p90_train_nominal", trainNom)
  fr("s_p90_train_robust", trainRob)
  fr("s_p95_fresh_nominal", quant(sNom, 0.95))
  fr("s_p95_fresh_robust", quant(sRob, 0.95))
  fr("regret_p95_nominal", quant(regret(sNom, sRob), 0.95))
  fr("regret_p95_robust", quant(regret(sRob, sNom), 0.95))

  // outputs: validated, written to temp names and renamed, run_meta-compatible completion marker last
  const frontRows = frontSolutions.map((s) => {
    const x = physical(s.u)
    const row: Record<string, string | number | boolean> = {
      weight_id: s.weightId,
      start_id: s.startId,
      origin: s.origin,
      S: s.S,
      cheb_true: s.trueCheb,
      max_violation: s.maxViolation,
      kkt: s.kkt,
      status: s.status,
    }
    VARS.forEach((v, i) => {
      row[v.id] = x[i] as number
    })
    OBJECTIVE_COLUMNS.forEach((o, j) => {
      row[o] = s.obj[j] as number
    })
    return row
  })
  validateOutputs(frontRows, recipeRows)
  mkdirSync(opts.out, { recursive: true })
  const files: [string, string][] = [
    ["refine_front.csv", toCsv(FRONT_COLUMNS, frontRows)],
    ["refine_recipes.csv", toCsv(RECIPE_COLUMNS, recipeRows)],
    ["refine_tolerance.csv", toCsv(TOLERANCE_COLUMNS, tolRows)],
    [
      "refine_robust.csv",
      toCsv(ROBUST_COLUMNS, robustRows, { nanColumns: ROBUST_NAN }),
    ],
    [
      "refine_meta.json",
      `${JSON.stringify(
        {
          seed,
          run_id: opts.runId ?? p3.runId,
          scenarios: "generic9",
          n_starts: starts.length,
          n_solves: solutions.length,
          n_front: frontSolutions.length,
          n_dominated_removed: nRemoved,
          s_balanced: { best: sBest, worst: sWorst, spread: sWorst - sBest },
          best_screened: { candidate_id: best.id, S: best.S },
          saddles: ROLES.filter((r) => roleSaddle.get(r)),
          robust_draws: K,
          fresh_draws: nFresh,
          note: "optimum of the models, not a measured optimum (PROXY)",
        },
        null,
        2,
      )}\n`,
    ],
  ]
  const tmps = files.map(([n]) => join(opts.out, `${n}.tmp`))
  try {
    for (const [i, [, text]] of files.entries())
      writeFileSync(tmps[i] as string, text)
  } catch (e) {
    for (const t of tmps) rmSync(t, { force: true })
    throw e
  }
  for (const [i, [n]] of files.entries())
    renameSync(tmps[i] as string, join(opts.out, n))
  console.log(
    `refine: ${solutions.length} solves, ${frontSolutions.length} on the front, best balanced S ${sBest.toFixed(6)} (best screened ${best.S.toFixed(6)}), ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  )
}
