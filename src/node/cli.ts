import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { DESIGN_COLUMNS, DESIGN_FLAG_COLUMNS } from "../core/columns"
import { toCsv } from "../core/csv"
import {
  checkConstraints,
  lhsDesign,
  requireMinFeasible,
  weatherL9,
} from "../core/design"
import {
  ConfigError,
  DataError,
  ResourceError,
  SpandekError,
} from "../core/errors"
import type { Level } from "../core/events"
import { safeJson } from "../core/json"
import { buildControls } from "../core/pipeline/controls"
import { buildPareto, candidateObjectives } from "../core/pipeline/optimize"
import { runSensitivity } from "../core/pipeline/sensitivity"
import {
  CONTROL_COLUMNS,
  CONTROL_NAN_COLUMNS,
  PARETO_COLUMNS,
  parseDrawsCsv,
  parseParetoCsv,
  parseSensCsv,
  ROLES,
  SENS_COLUMNS,
  shortlistFromPareto,
  validatePareto,
  validateSens,
} from "../core/pipeline/tables"
import {
  type FlaggedDesignRow,
  parseResultsCsv,
  validateDesign,
} from "../core/schema"
import {
  emitQuery,
  polish,
  queryTable,
  readVerifiedTable,
  runBudgetTable,
  validateQuery,
} from "./budget"
import {
  configSha256,
  loadControls,
  loadMaterialRanges,
  loadOptimize,
  loadWeather,
} from "./config"
import { loadContext } from "./context"
import { verifyData } from "./data"
import { fetchData } from "./dataFetch"
import { configureLogging, emit, newRunId } from "./logging"
import { loadPlan3, runRefine, SCENARIO_SETS } from "./refine"
import { writeCard } from "./report/cards"
import { buildCurves, buildSpectra } from "./report/curves"
import { buildReport } from "./report/html"
import {
  MANIFEST_FILE,
  type ManifestExtraEntry,
  setReportHash,
  writeManifest,
} from "./report/manifest"
import { checkLoad, lowerPriority, runWithTimeout } from "./resources"
import { effectiveWorkers, runSimulate } from "./simulate"

const N_CANDIDATES = 96
const LEVELS: readonly string[] = ["debug", "info", "warn", "error"]

/** Parsed command line: global flags are handled by main, the rest are per-command. */
type Flags = Map<string, string | true>

type Ctx = {
  flags: Flags
  configDir: string
  dataDir: string
  runId: string
}

type Command = {
  /** One-paragraph help text printed by `<command> --help`. */
  help: string
  /** Flags (beyond the global ones) this command takes a value for. */
  valueFlags: readonly string[]
  /** Flags (beyond the global ones) that are switches. */
  switches: readonly string[]
  /** Pure command: takes none of the global flags (--config-dir, --data-dir, --max-load) and skips the load guard. */
  pure?: boolean
  run: (ctx: Ctx) => Promise<void>
}

const GLOBAL_VALUE_FLAGS = ["--config-dir", "--data-dir", "--max-load"]

function parseFlags(
  args: readonly string[],
  valueFlags: readonly string[],
  switches: readonly string[],
): Flags {
  const flags: Flags = new Map()
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const eq = a.indexOf("=")
    const name = a.startsWith("--") && eq > 0 ? a.slice(0, eq) : a
    if (switches.includes(name) && eq < 0) {
      flags.set(name, true)
    } else if (valueFlags.includes(name)) {
      const v = eq > 0 ? a.slice(eq + 1) : args[++i]
      if (v === undefined) throw new ConfigError(name, "flag needs a value")
      flags.set(name, v)
    } else {
      throw new ConfigError(
        a.startsWith("--") ? name : "argument",
        "unknown flag",
      )
    }
  }
  return flags
}

function intFlag(
  flags: Flags,
  name: string,
  required: boolean,
): number | undefined {
  const v = flags.get(name)
  if (v === undefined) {
    if (required) throw new ConfigError(name.slice(2), "flag is required")
    return undefined
  }
  if (typeof v !== "string" || !/^\d+$/.test(v))
    throw new ConfigError(name.slice(2), "must be a non-negative integer")
  return Number(v)
}

function strFlag(flags: Flags, name: string, fallback?: string): string {
  const v = flags.get(name)
  if (typeof v === "string") return v
  if (fallback !== undefined) return fallback
  throw new ConfigError(name.slice(2), "flag is required")
}

/** --max-load value (any finite number), or undefined for the half-cores default. */
function maxLoadFlag(flags: Flags): number | undefined {
  const v = flags.get("--max-load")
  if (v === undefined) return undefined
  const max = Number(v)
  if (typeof v !== "string" || v.trim() === "" || !Number.isFinite(max))
    throw new ConfigError("max-load", "must be a number")
  return max
}

const WEATHER_COLUMNS = [
  "scenario_id",
  "irradiance_w_m2",
  "t_air_c",
  "wind_m_s",
  "h_conv_w_m2k",
  "t_sky_k",
] as const

async function designCommand(ctx: Ctx): Promise<void> {
  const { flags } = ctx
  const seed = intFlag(flags, "--seed", true) as number
  const out = strFlag(flags, "--out")
  const n = intFlag(flags, "--n", false) ?? N_CANDIDATES
  if (n !== N_CANDIDATES)
    throw new ConfigError(
      "n",
      `the design requires exactly ${N_CANDIDATES} candidates`,
    )
  const candidatesPath = join(out, "candidates.csv")
  if (existsSync(candidatesPath) && !flags.has("--force"))
    throw new ConfigError(
      "out",
      "candidates.csv exists; pass --force to overwrite",
    )

  const rangesPath = join(ctx.configDir, "material_ranges.yaml")
  const weatherPath = join(ctx.configDir, "weather_scenarios.yaml")
  const ranges = await loadMaterialRanges(rangesPath)
  const weather = await loadWeather(weatherPath)

  const rows = checkConstraints(lhsDesign(n, ranges, seed), ranges)
  const feasible = rows.filter((r) => r.feasible).length
  emit("design.generated", "info", {
    n,
    seed,
    feasible,
    infeasible: n - feasible,
  })
  requireMinFeasible(rows)

  const flagged = validateDesign(rows, true)
  const candidates = toCsv([...DESIGN_COLUMNS, ...DESIGN_FLAG_COLUMNS], flagged)
  const wx = toCsv(WEATHER_COLUMNS, weatherL9(weather))
  mkdirSync(out, { recursive: true })
  // temp names first, rename only after both writes succeed: no partial output
  const wxOut = join(out, "weather.csv")
  const tmps = [`${candidatesPath}.tmp`, `${wxOut}.tmp`]
  try {
    writeFileSync(tmps[0] as string, candidates)
    writeFileSync(tmps[1] as string, wx)
  } catch (e) {
    for (const t of tmps) rmSync(t, { force: true })
    throw e
  }
  renameSync(tmps[0] as string, candidatesPath)
  renameSync(tmps[1] as string, wxOut)
  const sha = await configSha256([rangesPath, weatherPath])
  console.log(`design: feasible ${feasible} of ${n}, config sha256 ${sha}`)
}

async function simulateCommand(ctx: Ctx): Promise<void> {
  const { flags } = ctx
  const seed = intFlag(flags, "--seed", true) as number
  const nMc = intFlag(flags, "--n-mc", false) ?? 256
  if (nMc < 1) throw new ConfigError("n-mc", "must be at least 1")
  const workers = effectiveWorkers(intFlag(flags, "--workers", false) ?? 2)
  const t = strFlag(flags, "--timeout-s", "900")
  const timeoutS = Number(t)
  if (t.trim() === "" || !Number.isFinite(timeoutS) || timeoutS <= 0)
    throw new ConfigError("timeout-s", "must be a number above 0")
  const design = strFlag(flags, "--design")
  const out = strFlag(flags, "--out")
  lowerPriority()
  await runWithTimeout(
    (signal) =>
      runSimulate({
        design,
        out,
        seed,
        nMc,
        workers,
        configDir: ctx.configDir,
        dataDir: ctx.dataDir,
        runId: ctx.runId,
        signal,
      }),
    timeoutS,
    "simulate",
  )
}

const OPTIMIZE_HELP =
  "optimize --in DIR: Pareto SCREEN of the 96 existing candidates (not a search; plan 05 `refine` is the optimiser). Reads results.csv, draws.csv and run_meta.json from DIR (all three required) and writes DIR/pareto.csv: candidate_id, the 5 objectives (r_solar_pred max; t_max_pred, corrosion_proxy, delam_proxy, cost_proxy min), t_max_worst, on_front, pareto_freq (fraction of Monte-Carlo draws in which the candidate is non-dominated) and role (high_performing, balanced, low_cost)."

function readInput(dir: string, name: string): string {
  const path = join(dir, name)
  if (!existsSync(path))
    throw new DataError(name, `${name} not found in the input directory`)
  return readFileSync(path, "utf8")
}

async function optimizeCommand(ctx: Ctx): Promise<void> {
  const dir = strFlag(ctx.flags, "--in")
  // run_meta.json is written last by simulate: it is the completion marker, so all three files are required
  const metaText = readInput(dir, "run_meta.json")
  const resultsText = readInput(dir, "results.csv")
  const drawsText = readInput(dir, "draws.csv")
  let meta: unknown
  try {
    meta = JSON.parse(metaText)
  } catch {
    throw new ConfigError("run_meta.json", "not valid JSON")
  }
  const nMc = (meta as { n_mc?: unknown } | null)?.n_mc
  if (typeof nMc !== "number" || !Number.isInteger(nMc) || nMc < 1)
    throw new ConfigError("n_mc", "run_meta.json needs an integer n_mc >= 1")
  const results = parseResultsCsv(resultsText)
  const draws = parseDrawsCsv(drawsText)
  const c1 = (await loadControls(join(ctx.configDir, "controls.yaml")))
    .c1_r_solar.value

  const ids = candidateObjectives(results).map((o) => o.candidate_id)
  const col = new Map(ids.map((id, i) => [id, i]))
  if (draws.length !== nMc * ids.length)
    throw new DataError(
      "draws.csv",
      `expected ${nMc * ids.length} draw rows (n_mc x feasible candidates), found ${draws.length}`,
    )
  const filled = new Uint8Array(nMc * ids.length)
  const obj = new Float64Array(nMc * ids.length * 5)
  for (const r of draws) {
    const c = col.get(r.candidate_id)
    if (c === undefined || r.draw >= nMc)
      throw new DataError("draws.csv", "draw row does not match results.csv")
    const cell = r.draw * ids.length + c
    if (filled[cell]) throw new DataError("draws.csv", "duplicate draw row")
    filled[cell] = 1
    obj.set(
      [
        r.r_solar_pred,
        r.t_max_pred,
        r.corrosion_proxy,
        r.delam_proxy,
        r.cost_proxy,
      ],
      cell * 5,
    )
  }
  const rows = validatePareto(buildPareto(results, obj, nMc, c1))
  const path = join(dir, "pareto.csv")
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, toCsv(PARETO_COLUMNS, rows))
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, path)
  console.log(
    `optimize: ${rows.length} candidates, ${rows.filter((r) => r.on_front).length} on the front`,
  )
}

const SENSITIVITY_HELP =
  "sensitivity --in DIR [--n 1024] [--seed N]: global sensitivity of the full C4 stack over 11 variables (7 design variables, sol-gel pH, irradiance, air temperature, wind): Morris screening (20 trajectories) and Sobol indices (Saltelli 2010 first order, Jansen total; n x 13 evaluations) for t_max_c, r_solar, corrosion_risk and gel_time_rel. Reads run_meta.json, results.csv and draws.csv from DIR (all three required; the seed defaults to run_meta.json's) and writes DIR/sensitivity.csv: output, method, variable, index (S1, ST, mu_star, sigma), value, conf (95 % half-width; 0 for sigma)."

async function sensitivityCommand(ctx: Ctx): Promise<void> {
  const dir = strFlag(ctx.flags, "--in")
  const n = intFlag(ctx.flags, "--n", false) ?? 1024
  if (n < 2) throw new ConfigError("n", "must be at least 2")
  const metaText = readInput(dir, "run_meta.json")
  // results.csv and draws.csv are completion evidence only: they must exist and parse, the analysis re-evaluates the models
  parseResultsCsv(readInput(dir, "results.csv"))
  parseDrawsCsv(readInput(dir, "draws.csv"))
  let meta: unknown
  try {
    meta = JSON.parse(metaText)
  } catch {
    throw new ConfigError("run_meta.json", "not valid JSON")
  }
  const metaSeed = (meta as { seed?: unknown } | null)?.seed
  const seed = intFlag(ctx.flags, "--seed", false) ?? metaSeed
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0)
    throw new ConfigError(
      "seed",
      "run_meta.json needs an integer seed (or pass --seed)",
    )
  lowerPriority()
  const mctx = await loadContext(ctx.configDir, ctx.dataDir)
  const rows = validateSens(runSensitivity(mctx, seed, n))
  const path = join(dir, "sensitivity.csv")
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, toCsv(SENS_COLUMNS, rows))
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, path)
  console.log(`sensitivity: ${rows.length} rows, n = ${n}, seed ${seed}`)
}

const REPORT_HELP =
  "report --in DIR: candidate cards, controls, curve data, run manifest and the live HTML report from a finished run. Requires run_meta.json, results.csv, draws.csv, pareto.csv and sensitivity.csv in DIR (missing: exit 5) and writes into DIR: candidate_cards/<role>_<id>.md (seven fields, decision by the plan 03 D6 rule), controls.csv (C0, C1 per scenario; C2, C3 per shortlisted candidate and scenario; nominal only), curves.json and spectra.json (nominal plus p5-p95 band for the shortlist), run_manifest.json (hashes of config, data and every output; entries registered in extra[] by `budget-table` are kept) and report.html (one offline file: live simulator, explorer, cards, sensitivity, limits; the Optimisation section appears when refine and budget-table outputs are in DIR or DIR/refine; report_sha256 is the manifest's last field). Safe to run again: re-run it after `refine` or `budget-table` to include their results. A refused input (interval order: exit 2, size limit: exit 2) writes no report.html."

function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, text)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, path)
}

async function reportCommand(ctx: Ctx): Promise<void> {
  const dir = strFlag(ctx.flags, "--in")
  // every input must exist before anything is written; run_meta.json is simulate's completion marker
  const metaText = readInput(dir, "run_meta.json")
  const resultsText = readInput(dir, "results.csv")
  readInput(dir, "draws.csv")
  const paretoText = readInput(dir, "pareto.csv")
  const sensText = readInput(dir, "sensitivity.csv")
  let meta: Record<string, unknown>
  try {
    meta = JSON.parse(metaText) as Record<string, unknown>
  } catch {
    throw new ConfigError("run_meta.json", "not valid JSON")
  }
  const { seed, n_mc: nMc, run_id: runId } = meta
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0)
    throw new ConfigError("seed", "run_meta.json needs an integer seed")
  if (typeof nMc !== "number" || !Number.isInteger(nMc) || nMc < 1)
    throw new ConfigError("n_mc", "run_meta.json needs an integer n_mc >= 1")
  if (typeof runId !== "string" || runId === "")
    throw new ConfigError("run_id", "run_meta.json needs a run_id")
  let results: ReturnType<typeof parseResultsCsv>
  let pareto: ReturnType<typeof parseParetoCsv>
  try {
    results = parseResultsCsv(resultsText)
    parseDrawsCsv(readInput(dir, "draws.csv"))
    pareto = parseParetoCsv(paretoText)
    parseSensCsv(sensText)
  } catch (e) {
    // the page builder's refusal event, for the same input faults caught one step earlier (plan 00 F1)
    if (e instanceof SpandekError && e.code === 2)
      emit("report.refused", "error", {
        code: /_(lo|hi)$/.test(e.key ?? "")
          ? "interval_order"
          : "invalid_input",
        key: e.key ?? "",
      })
    throw e
  }

  const shortlist = shortlistFromPareto(pareto)

  lowerPriority()
  const mctx = await loadContext(ctx.configDir, ctx.dataDir)
  const seen = new Set<string>()
  const design: FlaggedDesignRow[] = []
  for (const r of results) {
    if (seen.has(r.candidate_id)) continue
    seen.add(r.candidate_id)
    design.push({
      candidate_id: r.candidate_id,
      primer_gptes_molfrac: r.primer_gptes_molfrac,
      primer_dft_um: r.primer_dft_um,
      midcoat_pvc: r.midcoat_pvc,
      midcoat_tio2_fraction: r.midcoat_tio2_fraction,
      midcoat_dft_um: r.midcoat_dft_um,
      topcoat_mtes_molfrac: r.topcoat_mtes_molfrac,
      topcoat_dft_um: r.topcoat_dft_um,
      feasible: r.feasible,
      violations: "",
    })
  }
  const weather = weatherL9(mctx.weather)
  const controls = buildControls(shortlist, design, weather, mctx)
  const curves = buildCurves(
    results,
    shortlist,
    design,
    weather,
    mctx,
    nMc,
    seed,
  )
  const spectra = buildSpectra(shortlist, design, mctx, nMc, seed)
  const controlsCsv = toCsv(CONTROL_COLUMNS, controls, {
    nanColumns: CONTROL_NAN_COLUMNS,
  })
  const curvesJson = `${safeJson(curves, 2)}\n`
  const spectraJson = `${safeJson(spectra, 2)}\n`

  writeAtomic(join(dir, "controls.csv"), controlsCsv)
  writeAtomic(join(dir, "curves.json"), curvesJson)
  writeAtomic(join(dir, "spectra.json"), spectraJson)
  const files = [
    "run_meta.json",
    "results.csv",
    "draws.csv",
    "pareto.csv",
    "sensitivity.csv",
    "controls.csv",
    "curves.json",
    "spectra.json",
  ]
  const keep = keptExtra(dir)
  // the design step's files, when the output directory holds them (always after `run`)
  for (const f of ["candidates.csv", "weather.csv"])
    if (existsSync(join(dir, f))) files.push(f)
  for (const role of ROLES) {
    const id = shortlist[role] as string
    const freq = pareto.find((p) => p.candidate_id === id)
      ?.pareto_freq as number
    const path = await writeCard(id, role, results, controls, mctx, dir, freq)
    files.push(`candidate_cards/${path.split("/").pop()}`)
  }
  // a report.html from an earlier run must never sit next to a manifest that no longer records its hash
  rmSync(join(dir, REPORT_FILE), { force: true })
  await writeManifest(
    dir,
    mctx,
    seed,
    nMc,
    files,
    { runId, configDir: ctx.configDir, dataDir: ctx.dataDir },
    keep,
  )
  const digest = await buildReport(dir, join(dir, REPORT_FILE), {
    runId,
    configDir: ctx.configDir,
    dataDir: ctx.dataDir,
  })
  setReportHash(dir, digest)
  console.log(
    `report: 3 cards, ${controls.length} control rows, ${curves.series.length} curve series, manifest written, ${REPORT_FILE} ${statSync(join(dir, REPORT_FILE)).size} bytes sha256 ${digest}`,
  )
}

const REPORT_FILE = "report.html"

/**
 * Entries `budget-table` registered in the manifest's extra[], kept when `report` writes the manifest again: only entries whose
 * file is still present with the recorded hash. A missing or changed file is dropped and reported (report.extra_dropped).
 */
function keptExtra(dir: string): ManifestExtraEntry[] {
  const path = join(dir, MANIFEST_FILE)
  if (!existsSync(path)) return []
  let m: { extra?: unknown }
  try {
    m = JSON.parse(readFileSync(path, "utf8")) as { extra?: unknown }
  } catch {
    return []
  }
  const kept: ManifestExtraEntry[] = []
  for (const e of Array.isArray(m.extra)
    ? (m.extra as ManifestExtraEntry[])
    : []) {
    const file = join(dir, e.path)
    const same =
      existsSync(file) &&
      createHash("sha256").update(readFileSync(file)).digest("hex") === e.sha256
    if (same) kept.push(e)
    else emit("report.extra_dropped", "warn", { path: e.path })
  }
  return kept
}

/** Tell the user that report.html does not yet contain a later command's output (it is rebuilt by `report`). */
function reportHint(dir: string, what: string): void {
  emit("report.stale", "warn", { reason: what })
  console.log(
    `${what}: report.html does not include this yet; run \`bun run spandek report --in ${dir}\` to rebuild it (outputs in ${dir} or ${dir}/refine are included)`,
  )
}

const RUN_HELP =
  "run --seed N --out DIR [--n-mc N] [--force]: the whole pipeline, design, simulate, optimize, sensitivity, report (which ends with report.html, the live HTML report), in one directory with one run id and one manifest (run_meta.json is the completion marker of simulate; run_manifest.json lists every output). --force overwrites an existing candidates.csv."

async function runCommand(ctx: Ctx): Promise<void> {
  const { flags } = ctx
  const seed = strFlag(flags, "--seed")
  const out = strFlag(flags, "--out")
  const step = (extra: [string, string | true][]): Ctx => ({
    ...ctx,
    flags: new Map<string, string | true>([
      ...[...flags].filter(([k]) =>
        ["--max-load", "--config-dir", "--data-dir"].includes(k),
      ),
      ...extra,
    ]),
  })
  const design: [string, string | true][] = [
    ["--seed", seed],
    ["--out", out],
  ]
  if (flags.has("--force")) design.push(["--force", true])
  await designCommand(step(design))
  const sim: [string, string | true][] = [
    ["--design", out],
    ["--out", out],
    ["--seed", seed],
  ]
  for (const k of ["--n-mc", "--workers", "--timeout-s"]) {
    const v = flags.get(k)
    if (v !== undefined) sim.push([k, v])
  }
  await simulateCommand(step(sim))
  const inDir: [string, string | true][] = [["--in", out]]
  await optimizeCommand(step(inDir))
  await sensitivityCommand(step(inDir))
  await reportCommand(step(inDir))
  console.log(`run: complete, run id ${ctx.runId}, outputs in ${out}`)
}

const REFINE_HELP =
  "refine --in DIR --out DIR [--scenarios generic9] [--starts N] [--workers N] [--time-limit-s S] [--seed N]: derivative-based refinement of the screened candidates (plan 05). Reads run_meta.json, results.csv, draws.csv and pareto.csv from the plan-3 DIR (all four required: exit 5) and writes into the output DIR refine_front.csv (non-dominated refined solutions), refine_recipes.csv (high_performing, balanced and low_cost recipes with levels, objectives, dosing tolerances, elasticities, saddle flag), refine_tolerance.csv, refine_robust.csv (distribution of optimal levels over the uncertainty draws, robust optimum) and refine_meta.json. Optimum of the models, not a measured optimum (PROXY). --scenarios indonesia needs plan 04 (exit 2). Exit 3 no feasible optimum, 4 model not smooth enough, 5 missing input, 6 time limit."

async function refineCommand(ctx: Ctx): Promise<void> {
  const { flags } = ctx
  const dir = strFlag(flags, "--in")
  const out = strFlag(flags, "--out")
  const scenarios = strFlag(flags, "--scenarios", "generic9")
  if (!(SCENARIO_SETS as readonly string[]).includes(scenarios))
    throw new ConfigError("scenarios", "must be generic9 or indonesia")
  if (scenarios === "indonesia")
    throw new ConfigError(
      "scenarios",
      "the indonesia scenario set requires plan 04, which is not available yet",
    )
  const starts = intFlag(flags, "--starts", false)
  if (starts !== undefined && starts < 1)
    throw new ConfigError("starts", "must be at least 1")
  const workers = effectiveWorkers(intFlag(flags, "--workers", false) ?? 2)
  const t = strFlag(flags, "--time-limit-s", "600")
  const limitS = Number(t)
  if (t.trim() === "" || !Number.isFinite(limitS) || limitS <= 0)
    throw new ConfigError("time-limit-s", "must be a number above 0")
  const cfg = await loadOptimize(join(ctx.configDir, "optimize.yaml"))
  const p3 = loadPlan3(dir)
  const seed = intFlag(flags, "--seed", false) ?? p3.seed
  lowerPriority()
  try {
    await runWithTimeout(
      async (signal) => {
        const mctx = await loadContext(ctx.configDir, ctx.dataDir)
        await runRefine(mctx, shortlistFromPareto(p3.pareto), seed, dir, {
          out,
          cfg,
          ...(starts !== undefined ? { starts } : {}),
          workers,
          signal,
          runId: ctx.runId,
        })
      },
      limitS,
      "refine",
    )
  } catch (e) {
    // F8: the plan names phase refine.run for a time limit
    if (e instanceof ResourceError)
      throw new SpandekError(6, "refine.run", "time_limit", e.message)
    throw e
  }
  reportHint(dir, "refine")
}

const BUDGET_TABLE_HELP =
  "budget-table --in DIR --out DIR [--workers N] [--time-limit-s S]: the performance-price frontier (plan 05 FR-9..FR-13). For each priority profile (cooling_first, balanced, durability_first) solves min Chebyshev scalar s.t. cost <= B for 100 budgets from the minimum feasible cost c_min to the cost c_max of the profile's unconstrained optimum, each level warm-started from the previous, with uncertainty intervals from 64 draws. Reads the plan-3 DIR (run_manifest.json from `report` is required: exit 5) and writes budget_table.json into the output DIR, which must lie inside --in; the SHA-256 of the table is registered in DIR/run_manifest.json extra[]. Optimum of the models, not a measured optimum (PROXY). Exit 3 no feasible recipe, 4 build failed, 5 missing input, 6 time limit (default 900 s)."

async function budgetTableCommand(ctx: Ctx): Promise<void> {
  const { flags } = ctx
  const dir = strFlag(flags, "--in")
  const out = strFlag(flags, "--out")
  const workers = effectiveWorkers(intFlag(flags, "--workers", false) ?? 2)
  const t = strFlag(flags, "--time-limit-s", "900")
  const limitS = Number(t)
  if (t.trim() === "" || !Number.isFinite(limitS) || limitS <= 0)
    throw new ConfigError("time-limit-s", "must be a number above 0")
  const cfg = await loadOptimize(join(ctx.configDir, "optimize.yaml"))
  const p3 = loadPlan3(dir)
  lowerPriority()
  try {
    await runWithTimeout(
      async (signal) => {
        const mctx = await loadContext(ctx.configDir, ctx.dataDir)
        await runBudgetTable(mctx, p3.seed, dir, {
          out,
          cfg,
          workers,
          signal,
          runId: ctx.runId,
        })
      },
      limitS,
      "budget-table",
    )
  } catch (e) {
    if (e instanceof ResourceError)
      throw new SpandekError(6, "budget.build", "time_limit", e.message)
    throw e
  }
  reportHint(dir, "budget-table")
}

const BUDGET_HELP =
  "budget --table FILE --amount B --profile P [--polish]: pure lookup in a budget_table.json built by `budget-table`: the recipe of the largest tabulated budget <= B with its cost, headroom, objectives, uncertainty intervals and the knee budget, printed as JSON. P is cooling_first, balanced or durability_first; B is in the table's cost unit (relative cost_proxy). The table's SHA-256 is checked against the run_manifest.json beside it (exit 5). B below the minimum feasible cost: exit 3 and the minimum is printed. Takes neither --config-dir nor --max-load. --polish additionally re-solves the exact budget warm-started from the entry and keeps the result only when it is better; it loads the models from the default configs/ and data/literature directories of the working directory."

async function budgetCommand(ctx: Ctx): Promise<void> {
  const { flags } = ctx
  const amount = validateQuery(
    strFlag(flags, "--amount"),
    strFlag(flags, "--profile"),
  )
  const profile = strFlag(flags, "--profile")
  const file = readVerifiedTable(strFlag(flags, "--table"))
  const q = queryTable(file, profile, amount)
  let result = q.result
  if (flags.has("--polish")) {
    lowerPriority()
    const cfg = await loadOptimize(join(ctx.configDir, "optimize.yaml"))
    const mctx = await loadContext(ctx.configDir, ctx.dataDir)
    result = polish(mctx, cfg, file, q, amount)
  }
  emitQuery(result)
  console.log(safeJson(result, 2))
}

async function fetchDataCommand(ctx: Ctx): Promise<void> {
  await fetchData(ctx.dataDir)
  await verifyData(ctx.dataDir)
  console.log(`fetch-data: wrote and verified ${ctx.dataDir}`)
}

async function verifyDataCommand(ctx: Ctx): Promise<void> {
  await verifyData(ctx.dataDir)
  console.log(`verify-data: ${ctx.dataDir} matches SHA256SUMS`)
}

/** Subcommand registry: plans 3-5 add their commands here. */
const COMMANDS: Record<string, Command> = {
  design: {
    help: "design --seed N --out DIR: Latin-Hypercube design of 96 candidates plus the L9 weather table.",
    valueFlags: ["--seed", "--out", "--n"],
    switches: ["--force"],
    run: designCommand,
  },
  optimize: {
    help: OPTIMIZE_HELP,
    valueFlags: ["--in"],
    switches: [],
    run: optimizeCommand,
  },
  sensitivity: {
    help: SENSITIVITY_HELP,
    valueFlags: ["--in", "--n", "--seed"],
    switches: [],
    run: sensitivityCommand,
  },
  report: {
    help: REPORT_HELP,
    valueFlags: ["--in"],
    switches: [],
    run: reportCommand,
  },
  run: {
    help: RUN_HELP,
    valueFlags: ["--seed", "--out", "--n-mc", "--workers", "--timeout-s"],
    switches: ["--force"],
    run: runCommand,
  },
  simulate: {
    help: "simulate --design DIR --out DIR --seed N [--n-mc N]: run the candidates through the models with parameter uncertainty.",
    valueFlags: [
      "--design",
      "--out",
      "--seed",
      "--n-mc",
      "--workers",
      "--timeout-s",
    ],
    switches: [],
    run: simulateCommand,
  },
  refine: {
    help: REFINE_HELP,
    valueFlags: [
      "--in",
      "--out",
      "--scenarios",
      "--starts",
      "--workers",
      "--time-limit-s",
      "--seed",
    ],
    switches: [],
    run: refineCommand,
  },
  "budget-table": {
    help: BUDGET_TABLE_HELP,
    valueFlags: ["--in", "--out", "--workers", "--time-limit-s"],
    switches: [],
    run: budgetTableCommand,
  },
  budget: {
    help: BUDGET_HELP,
    valueFlags: ["--table", "--amount", "--profile"],
    switches: ["--polish"],
    pure: true,
    run: budgetCommand,
  },
  "fetch-data": {
    help: "fetch-data: download and verify the literature data.",
    valueFlags: [],
    switches: [],
    run: fetchDataCommand,
  },
  "verify-data": {
    help: "verify-data: check the literature data against SHA256SUMS.",
    valueFlags: [],
    switches: [],
    run: verifyDataCommand,
  },
}

export async function main(argv: readonly string[]): Promise<number> {
  const t0 = performance.now()
  const runId = newRunId()
  let command = "none"
  let seed = -1
  let exitCode = 0
  let logging = false
  try {
    const reports = process.env.SPANDEK_REPORTS_DIR ?? "reports"
    const runDir = join(reports, runId)
    mkdirSync(runDir, { recursive: true })
    const level = process.env.SPANDEK_LOG_LEVEL ?? "info"
    if (!LEVELS.includes(level))
      throw new ConfigError("SPANDEK_LOG_LEVEL", "invalid level")
    configureLogging({
      runId,
      level: level as Level,
      runDir,
      mirrorStderr: true,
    })
    logging = true
    const name = argv[0]
    const cmd = name === undefined ? undefined : COMMANDS[name]
    if (name === undefined || cmd === undefined)
      throw new ConfigError("command", "unknown or missing subcommand")
    command = name
    if (argv.slice(1).includes("--help")) {
      console.log(cmd.help)
      return 0
    }
    const flags = parseFlags(
      argv.slice(1),
      cmd.pure ? cmd.valueFlags : [...GLOBAL_VALUE_FLAGS, ...cmd.valueFlags],
      cmd.switches,
    )
    const s = flags.get("--seed")
    if (typeof s === "string" && /^\d+$/.test(s)) seed = Number(s)
    const ctx: Ctx = {
      flags,
      configDir: strFlag(flags, "--config-dir", "configs"),
      dataDir: strFlag(flags, "--data-dir", "data/literature"),
      runId,
    }
    let sha = "unavailable"
    try {
      sha = await configSha256([
        join(ctx.configDir, "material_ranges.yaml"),
        join(ctx.configDir, "weather_scenarios.yaml"),
      ])
    } catch {
      // a missing file is reported by the loader with its own code
    }
    emit("run.start", "info", {
      run_id: runId,
      command,
      seed,
      config_sha256: sha,
    })
    if (!cmd.pure) checkLoad(maxLoadFlag(flags))
    await cmd.run(ctx)
  } catch (e) {
    if (e instanceof SpandekError) {
      exitCode = e.code
      const f: Record<string, string | number> = {
        code: e.code,
        phase: e.phase,
      }
      if (e.key !== undefined) f.key = e.key
      if (logging) emit("error.raised", "error", f)
      else
        process.stderr.write(
          `${JSON.stringify({ event: "error.raised", ...f })}\n`,
        )
    } else {
      exitCode = 1
      process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
    }
  }
  if (logging)
    emit("run.complete", "info", {
      run_id: runId,
      exit_code: exitCode,
      elapsed_ms: Math.round(performance.now() - t0),
    })
  return exitCode
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)))
