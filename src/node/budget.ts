import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { z } from "zod"
import { type Scenario, weatherL9 } from "../core/design"
import { ConfigError, ResourceError, SpandekError } from "../core/errors"
import { safeJson } from "../core/json"
import {
  type BudgetEntry,
  type BudgetTable,
  lookupBudget,
} from "../core/opt/budgetTable"
import {
  makeModel,
  restoreToward,
  solveMinCost,
  solveUnderBudget,
} from "../core/opt/objective"
import type { OptimizeConfig } from "../core/opt/optConfig"
import { normaliseObjectives, OBJECTIVE_NAMES } from "../core/opt/scalarize"
import { sobolPoints } from "../core/opt/sobol"
import { fromScaled, toScaled, VARS } from "../core/opt/vars"
import type { ModelContext } from "../core/pipeline/context"
import { drawMaterials } from "../core/pipeline/uncertainty"
import { deriveSeed } from "../core/rng"
import type {
  BudgetJob,
  BudgetWorkerJob,
  BudgetWorkerMsg,
} from "./budgetWorker"
import { emit, levelEnabled } from "./logging"
import { loadPlan3 } from "./refine"
import { MANIFEST_FILE, manifestCoreHash } from "./report/manifest"
import { effectiveWorkers } from "./simulate"

export const PROFILES = [
  "cooling_first",
  "balanced",
  "durability_first",
] as const
export const BUDGET_FILE = "budget_table.json"
/** The stream of the Sobol starts of c_min / c_max (300 refine starts, 301 robust, 302 fresh, 303 intervals). */
const STREAM_STARTS = 304
const STREAM_INTERVALS = 303
const VIOLATION_TOL = 1e-9
/** Rounding allowance of the cost re-check after the recipe went through physical units and back. */
const COST_ROUNDTRIP = 1e-12

const phaseErr = (
  code: 3 | 4 | 5 | 6,
  phase: string,
  key: string,
  msg: string,
) => new SpandekError(code, phase, key, msg)

const sha256 = (b: Uint8Array | string) =>
  createHash("sha256").update(b).digest("hex")

// ---- file format ----

const OBJECTIVES_COUNT = OBJECTIVE_NAMES.length
const NumArr = (n: number) => z.array(z.number().finite()).length(n)
const EntrySchema = z.strictObject({
  level: z.number().int().min(0),
  budget: z.number().finite(),
  cost: z.number().finite(),
  x: NumArr(VARS.length),
  objectives: NumArr(OBJECTIVES_COUNT),
  lo: NumArr(OBJECTIVES_COUNT),
  hi: NumArr(OBJECTIVES_COUNT),
  scalar: z.number().finite(),
  repaired: z.boolean(),
})
const TableSchema = z.strictObject({
  profile: z.string(),
  cost_unit: z.enum(["relative", "idr_per_m2"]),
  c_min: z.number().finite(),
  c_max: z.number().finite(),
  knee_budget: z.number().finite(),
  entries: z.array(EntrySchema).min(2),
})
const FileSchema = z.strictObject({
  version: z.literal(1),
  seed: z.number().int(),
  run_id: z.string(),
  cost_unit: z.enum(["relative", "idr_per_m2"]),
  objectives: z.array(z.string()).length(OBJECTIVES_COUNT),
  vars: z.array(z.string()).length(VARS.length),
  norm: z.strictObject({
    lo: NumArr(OBJECTIVES_COUNT),
    hi: NumArr(OBJECTIVES_COUNT),
  }),
  interval_draws: z.number().int(),
  weights: z.record(z.string(), NumArr(OBJECTIVES_COUNT)),
  tables: z.array(TableSchema).length(PROFILES.length),
  note: z.string(),
})
export type BudgetFile = z.infer<typeof FileSchema>

// ---- build ----

export type BudgetOpts = {
  /** Output directory; it must lie inside the plan-3 directory, whose run_manifest.json lists the table (D11). */
  out: string
  cfg: OptimizeConfig
  workers?: number
  signal?: AbortSignal
  /** Levels per profile (default cfg.budget_levels = 100); tests use fewer. */
  levels?: number
  /** K_b (default cfg.interval_draws = 64). */
  intervalDraws?: number
  maxIter?: number
  kktTol?: number
  runId?: string
}

type Common = Omit<BudgetWorkerJob, "jobs" | "forwardDebug">

/** Contiguous slices of the profile jobs go to up to `nW` workers; tables return in job order (D9). */
async function runTables(
  jobs: BudgetJob[],
  common: Common,
  nW: number,
  signal: AbortSignal | undefined,
): Promise<BudgetTable[]> {
  const out = new Map<string, BudgetTable>()
  const workers = Math.min(nW, jobs.length)
  const size = Math.ceil(jobs.length / workers)
  const pool: Worker[] = []
  const stop = () => {
    for (const w of pool) w.terminate()
  }
  const forwardDebug = levelEnabled("debug")
  try {
    await new Promise<void>((resolveAll, reject) => {
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
        const w = new Worker(new URL("./budgetWorker.ts", import.meta.url).href)
        pool.push(w)
        w.onmessage = (e: MessageEvent<BudgetWorkerMsg>) => {
          const m = e.data
          if (m.type === "events") {
            for (const ev of m.list) emit(ev.event, ev.level, ev.fields)
          } else if (m.type === "table") {
            out.set(m.table.profile, m.table)
            console.log(
              `budget-table: ${m.table.profile} done, c_min ${m.table.c_min.toFixed(4)}, c_max ${m.table.c_max.toFixed(4)}, knee ${m.table.knee_budget.toFixed(4)}`,
            )
          } else if (m.type === "done") {
            w.terminate()
            if (--pending === 0 && !failed) resolveAll()
          } else {
            const er = m.error
            fail(
              er.code === 3 || er.code === 4 || er.code === 5 || er.code === 6
                ? phaseErr(
                    er.code,
                    er.phase ?? "budget.build",
                    er.key ?? "",
                    er.message,
                  )
                : new Error(er.message),
            )
          }
        }
        w.onerror = (ev) => fail(new Error(ev.message || "worker crashed"))
        const job: BudgetWorkerJob = {
          ...common,
          jobs: jobs.slice(lo, hi),
          forwardDebug,
        }
        w.postMessage(job)
      }
      if (pending === 0) resolveAll()
    })
  } finally {
    stop()
  }
  return jobs.map((j) => {
    const t = out.get(j.profile)
    if (!t)
      throw phaseErr(
        4,
        "budget.build",
        j.profile,
        "a worker returned no table for the profile",
      )
    return t
  })
}

const posix = (p: string) => p.split("\\").join("/")

/** Path of the table relative to the directory that holds the manifest, or null when the table lies outside it. */
function relativeInside(dir: string, file: string): string | null {
  const rel = relative(resolve(dir), resolve(file))
  return rel === "" || rel.startsWith("..") || isAbsolute(rel)
    ? null
    : posix(rel)
}

type ManifestExtra = {
  path: string
  sha256: string
  bytes: number
  kind: string
}

/** D11/FR-12: appends (or replaces) the table's hash in extra[] of the manifest and rewrites the core hash. */
export function registerInManifest(
  manifestPath: string,
  extra: ManifestExtra,
): void {
  const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    unknown
  >
  const list = (Array.isArray(m.extra) ? m.extra : []) as ManifestExtra[]
  m.extra = [...list.filter((e) => e.path !== extra.path), extra].sort(
    (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  )
  m.core_sha256 = manifestCoreHash(m)
  const tmp = `${manifestPath}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(m, null, 2)}\n`)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, manifestPath)
}

/** FR-9..FR-12: the three tables, built on up to two workers; writes budget_table.json and registers its hash. */
export async function runBudgetTable(
  ctx: ModelContext,
  seed: number,
  dir: string,
  opts: BudgetOpts,
): Promise<string> {
  try {
    return await runBudgetTableInner(ctx, seed, dir, opts)
  } catch (e) {
    if (e instanceof SpandekError)
      emit("refine.failed", "error", { phase: e.phase, code: e.code })
    throw e
  }
}

const checkAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new ResourceError("time limit exceeded")
}

async function runBudgetTableInner(
  ctx: ModelContext,
  seed: number,
  dir: string,
  opts: BudgetOpts,
): Promise<string> {
  const t0 = performance.now()
  const { cfg, signal } = opts
  const nW = effectiveWorkers(opts.workers ?? 2)
  const maxIter = opts.maxIter ?? cfg.max_iter
  const kktTol = opts.kktTol ?? cfg.t_kkt
  const nLevels = opts.levels ?? cfg.budget_levels
  const nDraws = opts.intervalDraws ?? cfg.interval_draws
  const p3 = loadPlan3(dir)
  const manifestPath = join(dir, MANIFEST_FILE)
  const tablePath = join(opts.out, BUDGET_FILE)
  const relTable = relativeInside(dir, tablePath)
  if (relTable === null)
    throw new ConfigError(
      "out",
      "the output directory must lie inside the --in directory (its run_manifest.json lists the table)",
    )
  if (!existsSync(manifestPath))
    throw phaseErr(
      5,
      "budget.load",
      MANIFEST_FILE,
      "run_manifest.json not found in the input directory (run `report` first)",
    )
  checkAbort(signal)

  const scenarios: Scenario[] = weatherL9(ctx.weather)
  const cpvc = ctx.ranges.cpvc.value
  const cap = ctx.ranges.max_total_dft_um.value
  const norm = normaliseObjectives(p3.results)
  const model = makeModel(ctx, scenarios, norm, cpvc, cap)
  const vlo = (VARS[2] as (typeof VARS)[number]).lo
  if (vlo > cpvc)
    throw phaseErr(
      3,
      "budget.build",
      "cpvc",
      `cpvc ${cpvc} is below the lowest PVC ${vlo}: no feasible recipe`,
    )

  // feasible screened candidates (plan-3 design columns, nominal grades), as in refine
  const grade = (i: 7 | 8, v: number) => {
    const b = VARS[i] as (typeof VARS)[number]
    return Math.min(Math.max(v, b.lo), b.hi)
  }
  const grades = [
    grade(7, ctx.mat.tio2.diameter_um.value),
    grade(8, ctx.mat.baso4.diameter_um.value),
  ]
  const seen = new Set<string>()
  const screened: { id: string; u: Float64Array }[] = []
  for (const r of p3.results) {
    if (!r.feasible || seen.has(r.candidate_id)) continue
    seen.add(r.candidate_id)
    const u = toScaled([
      r.primer_gptes_molfrac,
      r.primer_dft_um,
      r.midcoat_pvc,
      r.midcoat_tio2_fraction,
      r.midcoat_dft_um,
      r.topcoat_mtes_molfrac,
      r.topcoat_dft_um,
      ...grades,
    ])
    if (model.maxViolation(u) <= 0) screened.push({ id: r.candidate_id, u })
  }
  screened.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (screened.length === 0)
    throw phaseErr(
      3,
      "budget.build",
      "constraints",
      "no screened candidate satisfies the constraints",
    )
  const uRef = screened.reduce((a, b) =>
    model.cost(b.u) < model.cost(a.u) ? b : a,
  ).u
  const feasible = (u: Float64Array) => model.maxViolation(u) <= 0
  const sobol = sobolPoints(
    3,
    VARS.length,
    deriveSeed(seed, STREAM_STARTS),
  ).map((row) => restoreToward(feasible, Float64Array.from(row), uRef))

  // c_min: the cheapest feasible recipe, best of the starts (the minimum-cost recipe is also level 0's start)
  let uMin: Float64Array | null = null
  let cMin = Number.POSITIVE_INFINITY
  for (const u0 of [uRef, ...sobol]) {
    checkAbort(signal)
    const r = solveMinCost(model, u0, { maxIter, kktTol })
    const c = model.cost(r.u)
    if (
      r.status !== "infeasible" &&
      model.maxViolation(r.u) <= VIOLATION_TOL &&
      c < cMin
    ) {
      cMin = c
      uMin = r.u
    }
  }
  if (uMin === null)
    throw phaseErr(
      3,
      "budget.build",
      "c_min",
      "no feasible minimum-cost recipe",
    )
  emit("refine.budget.cmin", "info", { cmin: cMin })

  const jobs: BudgetJob[] = PROFILES.map((p) => {
    const w = OBJECTIVE_NAMES.map(
      (n) => (cfg.profiles[p] as Record<string, number>)[n] as number,
    )
    const top = screened
      .map((s) => ({ s, f: model.scalar(s.u, w) }))
      .sort((a, b) => a.f - b.f || (a.s.id < b.s.id ? -1 : 1))
      .slice(0, 3)
      .map((x) => x.s.u)
    return {
      profile: p,
      weights: w,
      uMin: Array.from(uMin as Float64Array),
      cMin,
      starts: [...top, ...sobol, uMin as Float64Array].map((u) =>
        Array.from(u),
      ),
      nLevels,
    }
  })
  checkAbort(signal)
  const draws = drawMaterials(
    ctx.mat,
    nDraws,
    deriveSeed(seed, STREAM_INTERVALS),
  )
  const tables = await runTables(
    jobs,
    { ctx, scenarios, norm, cpvc, dftCap: cap, draws, maxIter, kktTol },
    nW,
    signal,
  )
  checkAbort(signal)

  // hard post-conditions on every entry, recomputed from the written recipe before anything is written
  for (const t of tables)
    for (const e of t.entries) {
      const u = toScaled(e.x)
      if (!(e.cost <= e.budget))
        throw phaseErr(
          4,
          "budget.validate",
          t.profile,
          "an entry costs more than its budget",
        )
      if (!(model.cost(u) <= e.budget + COST_ROUNDTRIP))
        throw phaseErr(
          4,
          "budget.validate",
          t.profile,
          "a recomputed entry cost exceeds its budget",
        )
      if (!(model.maxViolation(u) <= VIOLATION_TOL))
        throw phaseErr(
          4,
          "budget.validate",
          t.profile,
          "an entry violates a constraint",
        )
      VARS.forEach((v, i) => {
        const xi = e.x[i] as number
        if (!(xi >= v.lo - 1e-12 && xi <= v.hi + 1e-12))
          throw phaseErr(
            4,
            "budget.validate",
            v.id,
            "an entry is outside the box",
          )
      })
    }

  const file: BudgetFile = {
    version: 1,
    seed,
    run_id: opts.runId ?? p3.runId,
    cost_unit: "relative",
    objectives: [...OBJECTIVE_NAMES],
    vars: VARS.map((v) => v.id),
    norm: { lo: [...norm.lo], hi: [...norm.hi] },
    interval_draws: nDraws,
    weights: Object.fromEntries(jobs.map((j) => [j.profile, j.weights])),
    tables,
    note: "best recipes of the models under a cost budget, not measured optima (PROXY); cost is the relative cost_proxy",
  }
  const text = `${safeJson(file, 2)}\n`
  mkdirSync(opts.out, { recursive: true })
  const tmp = `${tablePath}.tmp`
  try {
    writeFileSync(tmp, text)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, tablePath)
  try {
    registerInManifest(manifestPath, {
      path: relTable,
      sha256: sha256(text),
      bytes: Buffer.byteLength(text),
      kind: "budget_table",
    })
  } catch (e) {
    rmSync(tablePath, { force: true })
    throw e
  }
  console.log(
    `budget-table: ${tables.length} profiles x ${nLevels} levels, c_min ${cMin.toFixed(4)}, ${((performance.now() - t0) / 1000).toFixed(1)} s, sha256 ${sha256(text)}`,
  )
  return tablePath
}

// ---- lookup ----

/** F12: reads the table, checks its hash against the manifest's extra[] (and the manifest against its own core hash). */
export function readVerifiedTable(path: string): BudgetFile {
  const phase = "budget.verify"
  if (!existsSync(path))
    throw phaseErr(
      5,
      phase,
      BUDGET_FILE,
      "the budget table file does not exist",
    )
  const bytes = readFileSync(path)
  const dirs = [dirname(resolve(path)), dirname(dirname(resolve(path)))]
  let found = false
  for (const d of dirs) {
    const mp = join(d, MANIFEST_FILE)
    if (!existsSync(mp)) continue
    found = true
    let m: Record<string, unknown>
    try {
      m = JSON.parse(readFileSync(mp, "utf8")) as Record<string, unknown>
    } catch {
      throw phaseErr(5, phase, MANIFEST_FILE, "the manifest is not valid JSON")
    }
    const rel = relativeInside(d, path)
    const entry = (
      Array.isArray(m.extra) ? (m.extra as ManifestExtra[]) : []
    ).find((e) => e.path === rel)
    if (!entry) continue
    if (manifestCoreHash(m) !== m.core_sha256)
      throw phaseErr(
        5,
        phase,
        MANIFEST_FILE,
        "the manifest does not match its own core hash",
      )
    if (sha256(bytes) !== entry.sha256)
      throw phaseErr(
        5,
        phase,
        BUDGET_FILE,
        "the budget table does not match the hash in run_manifest.json",
      )
    try {
      return FileSchema.parse(JSON.parse(bytes.toString("utf8")))
    } catch {
      throw phaseErr(5, phase, BUDGET_FILE, "the budget table is not valid")
    }
  }
  throw phaseErr(
    5,
    phase,
    BUDGET_FILE,
    found
      ? "the budget table is not listed in run_manifest.json"
      : "no run_manifest.json found next to the budget table",
  )
}

export function validateQuery(amount: string, profile: string): number {
  const b = Number(amount)
  if (amount.trim() === "" || !Number.isFinite(b) || b < 0)
    throw new ConfigError("amount", "must be a number >= 0")
  if (!(PROFILES as readonly string[]).includes(profile))
    throw new ConfigError("profile", `must be one of ${PROFILES.join(", ")}`)
  return b
}

export type QueryResult = {
  profile: string
  cost_unit: string
  budget: number
  entry_budget: number
  cost: number
  headroom: number
  knee_budget: number
  c_min: number
  c_max: number
  scalar: number
  repaired: boolean
  polished: boolean
  recipe: Record<string, number>
  objectives: Record<string, number>
  lo: Record<string, number> | null
  hi: Record<string, number> | null
  note: string
}

const byName = (names: readonly string[], v: readonly number[]) =>
  Object.fromEntries(names.map((n, i) => [n, v[i] as number]))

/** FR-10 lookup (exact table content); below c_min: stderr says c_min, exit 3 (F10). */
export function queryTable(
  file: BudgetFile,
  profile: string,
  amount: number,
): {
  result: QueryResult
  entry: BudgetEntry
  table: BudgetTable
} {
  const table = file.tables.find((t) => t.profile === profile)
  if (!table)
    throw phaseErr(5, "budget.verify", profile, "the table has no such profile")
  const r = lookupBudget(table, amount)
  if (r.status === "infeasible") {
    console.error(
      `budget: ${amount} is below the minimum feasible budget c_min = ${r.c_min} (${table.cost_unit})`,
    )
    throw phaseErr(
      3,
      "budget.lookup",
      "amount",
      "budget below the minimum feasible cost",
    )
  }
  const e = r.entry
  return {
    entry: e,
    table,
    result: {
      profile,
      cost_unit: table.cost_unit,
      budget: amount,
      entry_budget: e.budget,
      cost: e.cost,
      headroom: r.headroom,
      knee_budget: table.knee_budget,
      c_min: table.c_min,
      c_max: table.c_max,
      scalar: e.scalar,
      repaired: e.repaired,
      polished: false,
      recipe: byName(file.vars, e.x),
      objectives: byName(file.objectives, e.objectives),
      lo: byName(file.objectives, e.lo),
      hi: byName(file.objectives, e.hi),
      note: file.note,
    },
  }
}

/**
 * FR-13: one solve at the exact requested budget, warm-started from the table entry (nominal). Returns the polished
 * recipe only when its scalar is strictly better than the entry's and it stays inside the budget and the constraints;
 * otherwise the entry itself.
 */
export function polish(
  ctx: ModelContext,
  cfg: OptimizeConfig,
  file: BudgetFile,
  q: ReturnType<typeof queryTable>,
  amount: number,
): QueryResult {
  const model = makeModel(
    ctx,
    weatherL9(ctx.weather),
    file.norm,
    ctx.ranges.cpvc.value,
    ctx.ranges.max_total_dft_um.value,
  )
  const w = file.weights[q.table.profile] as number[]
  const u0 = toScaled(q.entry.x)
  const r = solveUnderBudget(model, w, amount, u0, {
    maxIter: cfg.max_iter,
    kktTol: cfg.t_kkt,
  })
  const cost = model.cost(r.u)
  const better =
    r.f < q.entry.scalar &&
    cost <= amount &&
    model.maxViolation(r.u) <= VIOLATION_TOL
  if (!better) return q.result
  return {
    ...q.result,
    cost,
    headroom: amount - cost,
    scalar: r.f,
    polished: true,
    recipe: byName(file.vars, fromScaled(r.u)),
    objectives: byName(file.objectives, model.objectives(r.u)),
    lo: null,
    hi: null,
  }
}

export function emitQuery(r: QueryResult): void {
  emit("refine.budget.query", "info", {
    profile: r.profile,
    budget: r.budget,
    entry_budget: r.entry_budget,
    polished: r.polished,
  })
}
