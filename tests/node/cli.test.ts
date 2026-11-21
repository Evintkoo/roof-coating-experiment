import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DESIGN_COLUMNS } from "../../src/core/columns"
import { parseCsv, toCsv } from "../../src/core/csv"
import { copyConfigWith, events, lastEvent, repoRoot, run } from "../helpers"

const tmpOut = () => join(mkdtempSync(join(tmpdir(), "spandek-out-")), "out")
const design = (out: string, extra: string[] = [], seed = "20261121") => [
  "design",
  "--seed",
  seed,
  "--out",
  out,
  "--max-load",
  "1000",
  ...extra,
]
const noTrace = (stderr: string) => expect(stderr).not.toMatch(/(^|\n)\s+at \S/)

test("happyPathExit0AndTwoFiles", async () => {
  const out = tmpOut()
  const r = await run(design(out))
  expect(r.exitCode).toBe(0)
  const cand = parseCsv(readFileSync(join(out, "candidates.csv"), "utf8"))
  expect(cand.length).toBe(96)
  expect(cand[0]?.candidate_id).toBe("SP-001")
  expect(cand[95]?.candidate_id).toBe("SP-096")
  expect(cand[0]).toHaveProperty("feasible")
  expect(cand[0]).toHaveProperty("violations")
  expect(parseCsv(readFileSync(join(out, "weather.csv"), "utf8")).length).toBe(
    9,
  )
  expect(r.stdout).toMatch(/feasible 96 of 96/)
  expect(r.stdout).toMatch(/[0-9a-f]{64}/)
  expect(lastEvent(r, "run.complete").exit_code).toBe(0)
})

test("runtimeUnder2s", async () => {
  const t0 = performance.now()
  const r = await run(design(tmpOut()))
  expect(r.exitCode).toBe(0)
  // T_runtime_ms: the command's own clock is the T_runtime_ms proof; the outer wall bound only catches hangs and must not flake under load
  expect(Number(lastEvent(r, "run.complete").elapsed_ms)).toBeLessThan(2000)
  expect(performance.now() - t0).toBeLessThan(10000)
})

test("sameSeedSameBytesDifferentSeedDiffers", async () => {
  const a = tmpOut()
  const b = tmpOut()
  const c = tmpOut()
  await run(design(a))
  await run(design(b))
  await run(design(c, [], "7"))
  const h = (d: string) =>
    createHash("sha256")
      .update(readFileSync(join(d, "candidates.csv")))
      .digest("hex")
  expect(h(a)).toBe(h(b))
  expect(h(c)).not.toBe(h(a))
})

test("candidatesCsvMatchesFrozenHash", async () => {
  const out = tmpOut()
  await run(design(out))
  // the frozen hash covers the seven design columns; the CLI file adds feasible, violations
  const rows = parseCsv(readFileSync(join(out, "candidates.csv"), "utf8")).map(
    (r) =>
      Object.fromEntries(
        DESIGN_COLUMNS.map((c) => [
          c,
          c === "candidate_id" ? (r[c] as string) : Number(r[c]),
        ]),
      ),
  )
  const h = createHash("sha256")
    .update(toCsv(DESIGN_COLUMNS, rows))
    .digest("hex")
  expect(h).toBe(
    readFileSync(
      join(repoRoot, "tests/fixtures/expected_design_hash.txt"),
      "utf8",
    ).trim(),
  )
})

async function fault(
  r: Awaited<ReturnType<typeof run>>,
  code: number,
  phase: string,
  key?: string,
) {
  expect(r.exitCode).toBe(code)
  const e = lastEvent(r, "error.raised")
  expect(e).toMatchObject({ code, phase })
  if (key) expect(e.key).toBe(key)
  expect(Object.keys(e).sort()).toEqual(
    ["code", "event", "key", "level", "phase", "run", "ts"]
      .filter((k) => k !== "key" || "key" in e)
      .sort(),
  )
  noTrace(r.stderr)
  expect(lastEvent(r, "run.complete").exit_code).toBe(code)
}

const withCfg = async (dir: string, extra: string[] = []) =>
  run(design(tmpOut(), ["--config-dir", dir, ...extra]))

test("faultF1", async () => {
  const dir = await copyConfigWith("primer_dft_um.source", undefined)
  await fault(await withCfg(dir), 2, "config")
})

test("faultF2", async () => {
  const dir = await copyConfigWith("midcoat_pvc.min", 0.9)
  await fault(await withCfg(dir), 2, "config")
})

test("faultF3", async () => {
  const dir = await copyConfigWith("midcoat_pcv", 1)
  await fault(await withCfg(dir), 2, "config", "midcoat_pcv")
})

test("faultF4", async () => {
  const dir = await copyConfigWith("cpvc.value", 0.12)
  const r = await withCfg(dir)
  await fault(r, 3, "design")
  const inf = events(r).filter((e) => e.event === "constraint.infeasible_run")
  expect(inf.length).toBe(1)
  expect(inf[0]).toMatchObject({ feasible: 7, required: 77 })
})

test("faultF5", async () => {
  await fault(await run(design(tmpOut(), ["--n", "95"])), 2, "config", "n")
})

test("faultF6", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spandek-cfg-"))
  cpSync(join(repoRoot, "configs"), dir, { recursive: true })
  rmSync(join(dir, "weather_scenarios.yaml"))
  await fault(await withCfg(dir), 5, "data")
})

test("faultF7", async () => {
  const dir = await copyConfigWith("roof.r_total_m2k_w.value", 0)
  await fault(await withCfg(dir), 2, "config")
})

test("unknownFlagAndMissingSeedAreConfigErrors", async () => {
  await fault(
    await run(design(tmpOut(), ["--bogus", "1"])),
    2,
    "config",
    "--bogus",
  )
  await fault(
    await run(["design", "--out", tmpOut(), "--max-load", "1000"]),
    2,
    "config",
    "seed",
  )
  await fault(await run(["nope", "--max-load", "1000"]), 2, "config", "command")
})

test("maxLoadGuardRefusesWhenMachineBusy", async () => {
  const r = await run([
    "design",
    "--seed",
    "1",
    "--out",
    tmpOut(),
    "--max-load",
    "-1", // load average is never negative, so this can never pass
  ])
  await fault(r, 6, "resource")
})

test("invalidLogLevelIsConfigError", async () => {
  const r = await run(design(tmpOut()), { SPANDEK_LOG_LEVEL: "verbose" })
  expect(r.exitCode).toBe(2)
  expect(r.stderr).toContain("SPANDEK_LOG_LEVEL")
  noTrace(r.stderr)
})

test("failureBetweenWritesLeavesNoOutputFiles", async () => {
  const out = tmpOut()
  mkdirSync(join(out, "weather.csv.tmp"), { recursive: true }) // real fault: a directory where the temp file goes
  const r = await run(design(out))
  expect(r.exitCode).toBe(1)
  noTrace(r.stderr)
  expect(existsSync(join(out, "candidates.csv"))).toBe(false)
  expect(existsSync(join(out, "candidates.csv.tmp"))).toBe(false)
  expect(existsSync(join(out, "weather.csv"))).toBe(false)
})

test("refusesOverwriteWithoutForce", async () => {
  const out = tmpOut()
  expect((await run(design(out))).exitCode).toBe(0)
  const before = readFileSync(join(out, "candidates.csv"), "utf8")
  const r = await run(design(out, [], "5"))
  await fault(r, 2, "config", "out")
  expect(readFileSync(join(out, "candidates.csv"), "utf8")).toBe(before)
  expect((await run(design(out, ["--force"], "5"))).exitCode).toBe(0)
  expect(readFileSync(join(out, "candidates.csv"), "utf8")).not.toBe(before)
})

test("csvUsesDotDecimalUnderCommaLocale", async () => {
  const a = tmpOut()
  const b = tmpOut()
  await run(design(a))
  const r = await run(design(b), { LC_ALL: "de_DE.UTF-8", LANG: "de_DE.UTF-8" })
  expect(r.exitCode).toBe(0)
  const text = readFileSync(join(b, "candidates.csv"), "utf8")
  expect(text).toBe(readFileSync(join(a, "candidates.csv"), "utf8"))
  expect(text.split("\n")[1]).toMatch(/^SP-001,\d+\.\d+,/)
})

test("eventsEmitted", async () => {
  const seen = new Map<string, Record<string, unknown>>()
  const collect = (r: Awaited<ReturnType<typeof run>>) => {
    for (const e of events(r)) seen.set(String(e.event), e)
    expect(existsSync(join(r.runDir, "run.jsonl"))).toBe(true)
  }
  const near = await copyConfigWith("cpvc.value", 0.34)
  const r1 = await withCfg(near)
  expect(r1.exitCode).toBe(0)
  collect(r1)
  const r2 = await withCfg(await copyConfigWith("cpvc.value", 0.12))
  collect(r2)
  for (const name of [
    "run.start",
    "config.loaded",
    "design.generated",
    "constraint.violated",
    "constraint.infeasible_run",
    "error.raised",
    "run.complete",
  ])
    expect(seen.has(name)).toBe(true)
  expect(seen.get("run.start")).toMatchObject({
    command: "design",
    seed: 20261121,
  })
  expect(String(seen.get("run.start")?.config_sha256)).toMatch(/^[0-9a-f]{64}$/)
  expect(seen.get("design.generated")).toMatchObject({ n: 96, seed: 20261121 })
  expect(seen.get("constraint.violated")).toMatchObject({ rule: "C-1" })
  expect(String(seen.get("constraint.violated")?.candidate_id)).toMatch(
    /^SP-\d{3}$/,
  )
  const loaded = events(r1).filter((e) => e.event === "config.loaded")
  expect(loaded.map((e) => e.path)).toEqual([
    "material_ranges.yaml",
    "weather_scenarios.yaml",
  ])
  expect(loaded[0]?.n_constants).toBe(11)
  expect(loaded[1]?.n_constants).toBe(6)
  for (const e of loaded) expect(String(e.sha256)).toMatch(/^[0-9a-f]{64}$/)
  // info-level logs also reach stderr as JSON lines
  expect(r1.stderr).toContain('"event":"run.start"')
})

test("simulateRegisteredReadsDesignOutputAndRejectsUnknownFlag", async () => {
  const dir = tmpOut()
  expect((await run(design(dir))).exitCode).toBe(0)
  const out = tmpOut()
  const r = await run([
    "simulate",
    "--design",
    dir,
    "--out",
    out,
    "--seed",
    "20261121",
    "--n-mc",
    "2",
    "--max-load",
    "1000",
  ])
  expect(r.exitCode).toBe(0)
  expect(parseCsv(readFileSync(join(out, "results.csv"), "utf8")).length).toBe(
    864,
  )
  expect(lastEvent(r, "sim.start")).toMatchObject({ n_mc: 2, workers: 2 })
  const bad = await run(["simulate", "--bogus", "1", "--max-load", "1000"])
  expect(bad.exitCode).toBe(2)
})
