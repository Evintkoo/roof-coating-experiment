import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DESIGN_COLUMNS } from "../../src/core/columns"
import { parseCsv, toCsv } from "../../src/core/csv"
import {
  CONTROL_COLUMNS,
  PARETO_COLUMNS,
  parseControlsCsv,
  SENS_COLUMNS,
  validateCurves,
  validatePareto,
  validateSens,
  validateSpectra,
} from "../../src/core/pipeline/tables"
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

// ---- optimize (plan 03 Task 5) ----

let simmed: string | undefined
/** One real design + simulate (n_mc 4) shared by the optimize tests; each test works on its own copy. */
async function simulated(): Promise<string> {
  if (simmed === undefined) {
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
      "4",
      "--max-load",
      "1000",
    ])
    expect(r.exitCode).toBe(0)
    simmed = out
  }
  const copy = tmpOut()
  cpSync(simmed, copy, { recursive: true })
  return copy
}
const optimize = (dir: string) =>
  run(["optimize", "--in", dir, "--max-load", "1000"])

test("optimizeWritesParetoCsvWithThreeRoles", async () => {
  const dir = await simulated()
  const r = await optimize(dir)
  expect(r.exitCode).toBe(0)
  const text = readFileSync(join(dir, "pareto.csv"), "utf8")
  expect(text.split("\n")[0]).toBe(PARETO_COLUMNS.join(","))
  const rows = parseCsv(text)
  const roles = rows.map((x) => x.role).filter((x) => x !== "")
  expect([...roles].sort()).toEqual(["balanced", "high_performing", "low_cost"])
  expect(rows.some((x) => x.on_front === "true")).toBe(true)
  const typed = validatePareto(
    rows.map((x) => ({
      ...x,
      ...Object.fromEntries(
        Object.entries(x)
          .filter(
            ([k]) => k !== "candidate_id" && k !== "on_front" && k !== "role",
          )
          .map(([k, v]) => [k, Number(v)]),
      ),
      on_front: x.on_front === "true",
    })),
  )
  expect(typed.length).toBe(rows.length)
  expect(existsSync(`${join(dir, "pareto.csv")}.tmp`)).toBe(false)
  expect(lastEvent(r, "pareto.computed").n_candidates).toBe(rows.length)
  expect(events(r).filter((e) => e.event === "shortlist.chosen").length).toBe(3)
  // the --help text states that this is a screen, not a search
  const h = await run(["optimize", "--help"])
  expect(h.exitCode).toBe(0)
  expect(h.stdout).toMatch(/screen/i)
  expect(h.stdout).toMatch(/refine/)
})

test("f3BadIntervalExit2", async () => {
  const dir = await simulated()
  const path = join(dir, "results.csv")
  const lines = readFileSync(path, "utf8").split("\n")
  const header = (lines[0] as string).split(",")
  const cells = (lines[1] as string).split(",")
  const pred = header.indexOf("t_max_pred")
  const lo = header.indexOf("t_max_lo")
  cells[lo] = String(Number(cells[pred]) + 1) // lo > pred
  lines[1] = cells.join(",")
  writeFileSync(path, lines.join("\n"))
  const r = await optimize(dir)
  expect(r.exitCode).toBe(2)
  expect(lastEvent(r, "error.raised")).toMatchObject({
    code: 2,
    key: "t_max_lo",
  })
  expect(existsSync(join(dir, "pareto.csv"))).toBe(false)
  noTrace(r.stderr)
})

test("optimizeRequiresAllThreeInputFilesExit5", async () => {
  for (const f of ["run_meta.json", "results.csv", "draws.csv"]) {
    const dir = await simulated()
    rmSync(join(dir, f))
    const r = await optimize(dir)
    expect(r.exitCode).toBe(5)
    expect(lastEvent(r, "error.raised")).toMatchObject({ code: 5, key: f })
    expect(existsSync(join(dir, "pareto.csv"))).toBe(false)
  }
  const none = await run(["optimize", "--max-load", "1000"])
  expect(none.exitCode).toBe(2)
})

test("optimizeTruncatedDrawsCsvExit5", async () => {
  const dir = await simulated()
  const path = join(dir, "draws.csv")
  const lines = readFileSync(path, "utf8").split("\n")
  // header + all but the last 3 data rows: n_mc x feasible candidates no longer matches
  writeFileSync(path, `${lines.slice(0, -4).join("\n")}\n`)
  const r = await optimize(dir)
  expect(r.exitCode).toBe(5)
  expect(lastEvent(r, "error.raised")).toMatchObject({
    code: 5,
    key: "draws.csv",
  })
  expect(existsSync(join(dir, "pareto.csv"))).toBe(false)
})

// ---- sensitivity (plan 03 Task 6) ----
const sensitivity = (dir: string, extra: string[] = ["--n", "8"]) =>
  run(["sensitivity", "--in", dir, "--max-load", "1000", ...extra])

test("sensitivityWritesValidatedCsvAtomically", async () => {
  const dir = await simulated()
  const r = await sensitivity(dir)
  expect(r.exitCode).toBe(0)
  const text = readFileSync(join(dir, "sensitivity.csv"), "utf8")
  expect(text.split("\n")[0]).toBe(SENS_COLUMNS.join(","))
  const rows = parseCsv(text)
  expect(rows.length).toBe(4 * 11 * 4)
  const typed = validateSens(
    rows.map((x) => ({ ...x, value: Number(x.value), conf: Number(x.conf) })),
  )
  expect(typed.length).toBe(rows.length)
  expect(existsSync(`${join(dir, "sensitivity.csv")}.tmp`)).toBe(false)
  expect(events(r).filter((e) => e.event === "sensitivity.done").length).toBe(8)
  // same inputs, same bytes
  const again = await sensitivity(dir)
  expect(again.exitCode).toBe(0)
  expect(readFileSync(join(dir, "sensitivity.csv"), "utf8")).toBe(text)
  const h = await run(["sensitivity", "--help"])
  expect(h.stdout).toMatch(/Morris/)
})

test("sensitivityRequiresAllThreeInputFilesExit5", async () => {
  for (const f of ["run_meta.json", "results.csv", "draws.csv"]) {
    const dir = await simulated()
    rmSync(join(dir, f))
    const r = await sensitivity(dir)
    expect(r.exitCode).toBe(5)
    expect(lastEvent(r, "error.raised")).toMatchObject({ code: 5, key: f })
    expect(existsSync(join(dir, "sensitivity.csv"))).toBe(false)
  }
  expect((await run(["sensitivity", "--max-load", "1000"])).exitCode).toBe(2)
  const dir = await simulated()
  expect((await sensitivity(dir, ["--n", "1"])).exitCode).toBe(2)
})

test("sensitivityAppliesGlobalLoadGuardExit6", async () => {
  const dir = await simulated()
  const r = await run(["sensitivity", "--in", dir, "--max-load", "-1"])
  expect(r.exitCode).toBe(6)
  expect(existsSync(join(dir, "sensitivity.csv"))).toBe(false)
})

// ---- report (plan 03 Task 7) ----
let prepped: string | undefined
/** simulate + optimize + sensitivity once (tiny n); each test works on its own copy. */
async function readyForReport(): Promise<string> {
  if (prepped === undefined) {
    const dir = await simulated()
    expect((await optimize(dir)).exitCode).toBe(0)
    expect((await sensitivity(dir)).exitCode).toBe(0)
    prepped = dir
  }
  const copy = tmpOut()
  cpSync(prepped, copy, { recursive: true })
  return copy
}
const report = (dir: string) =>
  run(["report", "--in", dir, "--max-load", "1000"])
const sha = (p: string) =>
  createHash("sha256").update(readFileSync(p)).digest("hex")

test("reportWritesCardsControlsCurvesSpectraManifest", async () => {
  const dir = await readyForReport()
  const r = await report(dir)
  expect(r.exitCode).toBe(0)
  const roles = parseCsv(readFileSync(join(dir, "pareto.csv"), "utf8")).filter(
    (x) => x.role !== "",
  )
  const cards = roles.map((x) =>
    join(dir, "candidate_cards", `${x.role}_${x.candidate_id}.md`),
  )
  expect(cards.length).toBe(3)
  for (const c of cards)
    expect(readFileSync(c, "utf8")).toContain("### Decision")
  // controls: C0, C1 once per scenario, C2 and C3 per shortlisted candidate and scenario
  const ctl = parseControlsCsv(readFileSync(join(dir, "controls.csv"), "utf8"))
  expect(ctl.length).toBe(9 * 2 + 3 * 9 * 2)
  expect(readFileSync(join(dir, "controls.csv"), "utf8").split("\n")[0]).toBe(
    CONTROL_COLUMNS.join(","),
  )
  const curves = validateCurves(
    JSON.parse(readFileSync(join(dir, "curves.json"), "utf8")),
  )
  expect(curves.n_mc).toBe(4)
  expect(curves.series.length).toBe(99)
  const spectra = validateSpectra(
    JSON.parse(readFileSync(join(dir, "spectra.json"), "utf8")),
  )
  expect(spectra.wl_um.length).toBe(221)
  // manifest: every listed file exists with the right hash; the run id comes from run_meta.json
  const man = JSON.parse(
    readFileSync(join(dir, "run_manifest.json"), "utf8"),
  ) as { run_id: string; files: { path: string; sha256: string }[] }
  const meta = JSON.parse(readFileSync(join(dir, "run_meta.json"), "utf8"))
  expect(man.run_id).toBe(meta.run_id)
  const paths = man.files.map((f) => f.path)
  for (const want of [
    "results.csv",
    "draws.csv",
    "pareto.csv",
    "sensitivity.csv",
    "controls.csv",
    "curves.json",
    "spectra.json",
    "run_meta.json",
    ...cards.map((c) => `candidate_cards/${c.split("/").pop()}`),
  ])
    expect(paths).toContain(want)
  for (const f of man.files) expect(f.sha256).toBe(sha(join(dir, f.path)))
  expect(listTmp(dir)).toEqual([])
  expect(events(r).filter((e) => e.event === "card.written").length).toBe(3)
  expect(events(r).filter((e) => e.event === "manifest.written").length).toBe(1)
  const h = await run(["report", "--help"])
  expect(h.stdout).toMatch(/candidate_cards/)
})

function listTmp(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".tmp"))
}

test("reportSameInputsSameBytes", async () => {
  const a = await readyForReport()
  expect((await report(a)).exitCode).toBe(0)
  const first = [
    "curves.json",
    "spectra.json",
    "controls.csv",
    "run_manifest.json",
  ].map((f) => sha(join(a, f)))
  expect((await report(a)).exitCode).toBe(0)
  expect(
    ["curves.json", "spectra.json", "controls.csv", "run_manifest.json"].map(
      (f) => sha(join(a, f)),
    ),
  ).toEqual(first)
})

test("reportMissingInputExit5AndWritesNothing", async () => {
  for (const f of [
    "run_meta.json",
    "results.csv",
    "draws.csv",
    "pareto.csv",
    "sensitivity.csv",
  ]) {
    const dir = await readyForReport()
    rmSync(join(dir, f))
    const r = await report(dir)
    expect(r.exitCode).toBe(5)
    expect(lastEvent(r, "error.raised")).toMatchObject({ code: 5, key: f })
    noTrace(r.stderr)
    expect(existsSync(join(dir, "run_manifest.json"))).toBe(false)
    expect(existsSync(join(dir, "candidate_cards"))).toBe(false)
    expect(existsSync(join(dir, "controls.csv"))).toBe(false)
  }
})

test("reportRejectsCorruptTableExit2OrFive", async () => {
  const dir = await readyForReport()
  writeFileSync(join(dir, "pareto.csv"), "candidate_id\nSP-001\n")
  const r = await report(dir)
  expect([2, 5]).toContain(r.exitCode)
  expect(existsSync(join(dir, "run_manifest.json"))).toBe(false)
})

test("reportAppliesGlobalLoadGuardExit6", async () => {
  const dir = await readyForReport()
  const r = await run(["report", "--in", dir, "--max-load", "-1"])
  expect(r.exitCode).toBe(6)
  expect(existsSync(join(dir, "run_manifest.json"))).toBe(false)
})
