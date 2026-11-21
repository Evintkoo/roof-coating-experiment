import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
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
import { ConfigError, DataError, SpandekError } from "../core/errors"
import type { Level } from "../core/events"
import { buildPareto, candidateObjectives } from "../core/pipeline/optimize"
import {
  PARETO_COLUMNS,
  parseDrawsCsv,
  validatePareto,
} from "../core/pipeline/tables"
import { parseResultsCsv, validateDesign } from "../core/schema"
import {
  configSha256,
  loadControls,
  loadMaterialRanges,
  loadWeather,
} from "./config"
import { verifyData } from "./data"
import { fetchData } from "./dataFetch"
import { configureLogging, emit, newRunId } from "./logging"
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
      [...GLOBAL_VALUE_FLAGS, ...cmd.valueFlags],
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
    checkLoad(maxLoadFlag(flags))
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
