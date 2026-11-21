import {
  existsSync,
  mkdirSync,
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
import { ConfigError, SpandekError } from "../core/errors"
import type { Level } from "../core/events"
import { validateDesign } from "../core/schema"
import { configSha256, loadMaterialRanges, loadWeather } from "./config"
import { verifyData } from "./data"
import { fetchData } from "./dataFetch"
import { configureLogging, emit, newRunId } from "./logging"
import { checkLoad } from "./resources"

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
    valueFlags: ["--seed", "--out", "--n"],
    switches: ["--force"],
    run: designCommand,
  },
  "fetch-data": { valueFlags: [], switches: [], run: fetchDataCommand },
  "verify-data": { valueFlags: [], switches: [], run: verifyDataCommand },
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
