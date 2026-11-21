import { afterEach, beforeAll, expect, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DESIGN_COLUMNS,
  DESIGN_FLAG_COLUMNS,
  RESULT_COLUMNS,
} from "../../src/core/columns"
import { toCsv } from "../../src/core/csv"
import { checkConstraints, lhsDesign, weatherL9 } from "../../src/core/design"
import { ConfigError, PhysicsRangeError } from "../../src/core/errors"
import type { ModelContext } from "../../src/core/pipeline/context"
import { CONTROL_LAYERS, evaluate } from "../../src/core/pipeline/stackProps"
import { parseDrawsCsv } from "../../src/core/pipeline/tables"
import { drawMaterials, quantile7 } from "../../src/core/pipeline/uncertainty"
import { deriveSeed } from "../../src/core/rng"
import {
  type FlaggedDesignRow,
  parseResultsCsv,
  validateResults,
} from "../../src/core/schema"
import { loadContext } from "../../src/node/context"
import { configureLogging, newRunId } from "../../src/node/logging"
import { effectiveWorkers, simulateAll } from "../../src/node/simulate"
import { events, lastEvent, repoRoot, run } from "../helpers"

let ctx: ModelContext
let full: FlaggedDesignRow[]
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
  full = checkConstraints(lhsDesign(96, ctx.ranges, 20261121), ctx.ranges)
})
afterEach(() => configureLogging({ runId: "x", level: "error" }))

const weather = () => weatherL9(ctx.weather)
const withLog = (level: "info" | "debug" = "info") => {
  const runDir = mkdtempSync(join(tmpdir(), "spandek-sim-"))
  configureLogging({ runId: newRunId(), level, runDir })
  return () =>
    readFileSync(join(runDir, "run.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>)
}
/** First n candidates, with row `bad` (if given) made infeasible by C-1 and flags recomputed. */
const subset = (n: number, bad?: number): FlaggedDesignRow[] => {
  const rows = full
    .slice(0, n)
    .map(({ feasible: _f, violations: _v, ...r }) => r)
  if (bad !== undefined)
    (rows[bad] as { midcoat_pvc: number }).midcoat_pvc = 1.3
  return checkConstraints(rows, ctx.ranges)
}
const tmp = () => mkdtempSync(join(tmpdir(), "spandek-simcli-"))
const writeDesign = (rows: FlaggedDesignRow[]): string => {
  const dir = tmp()
  writeFileSync(
    join(dir, "candidates.csv"),
    toCsv([...DESIGN_COLUMNS, ...DESIGN_FLAG_COLUMNS], rows),
  )
  return dir
}
const sim = (design: string, out: string, extra: string[] = []) =>
  run([
    "simulate",
    "--design",
    design,
    "--out",
    out,
    "--seed",
    "20261121",
    "--max-load",
    "1000",
    ...extra,
  ])
const outDir = () => join(tmp(), "out")

test("has864RowsAndValidSchema", async () => {
  const r = await simulateAll(full, weather(), ctx, 2, 20261121, 2)
  expect(r.results.length).toBe(864)
  expect(validateResults(r.results as never).length).toBe(864)
  expect(parseResultsCsv(toCsv(RESULT_COLUMNS, r.results)).length).toBe(864)
  const keys = r.results.map((x) => `${x.candidate_id}/${x.scenario_id}`)
  expect(keys).toEqual([...keys].sort())
  expect(r.results[0]?.candidate_id).toBe("SP-001")
  expect(r.results[0]?.scenario_id).toBe("W1")
})

test("sameSeedIdenticalCsvOneAndTwoWorkers", async () => {
  const d = subset(10, 3)
  const a = await simulateAll(d, weather(), ctx, 16, 1, 1)
  const b = await simulateAll(d, weather(), ctx, 16, 1, 2)
  expect(toCsv(RESULT_COLUMNS, a.results)).toBe(
    toCsv(RESULT_COLUMNS, b.results),
  )
  expect(Array.from(a.drawObjectives)).toEqual(Array.from(b.drawObjectives))
  const c = await simulateAll(d, weather(), ctx, 16, 2, 2)
  expect(toCsv(RESULT_COLUMNS, c.results)).not.toBe(
    toCsv(RESULT_COLUMNS, a.results),
  )
})

test("workersCappedAtTwo", async () => {
  expect(effectiveWorkers(1)).toBe(1)
  expect(effectiveWorkers(2)).toBe(2)
  expect(effectiveWorkers(9)).toBe(2)
  for (const bad of [0, -1, 1.5, Number.NaN])
    expect(() => effectiveWorkers(bad)).toThrow(ConfigError)
  const read = withLog()
  await simulateAll(subset(3), weather(), ctx, 3, 1, 8)
  const start = read().find((e) => e.event === "sim.start")
  expect(start).toMatchObject({
    n_candidates: 3,
    n_scenarios: 9,
    n_mc: 3,
    workers: 2,
  })
})

test("opticsOncePerCandidatePerDraw", async () => {
  const d = subset(8, 2) // 7 feasible
  const r = await simulateAll(d, weather(), ctx, 5, 1, 2)
  expect(r.nStackEvals).toBe((5 + 1) * 7)
  expect(r.nThermalEvals).toBe(r.nStackEvals * 9)
  expect(r.drawObjectives.length).toBe(5 * 8 * 5)
})

test("infeasibleCarriedAsNaNAndExcludedFromDrawObjectives", async () => {
  const d = subset(6, 1)
  const r = await simulateAll(d, weather(), ctx, 4, 1, 1)
  const bad = r.results.filter((x) => x.candidate_id === "SP-002")
  expect(bad.length).toBe(9)
  for (const x of bad) {
    expect(x.feasible).toBe(false)
    expect(x.midcoat_pvc).toBe(1.3)
    expect(Number.isNaN(x.r_solar_pred)).toBe(true)
    expect(Number.isNaN(x.t_max_hi)).toBe(true)
    expect(Number.isNaN(x.cost_proxy)).toBe(true)
  }
  for (let dr = 0; dr < 4; dr++)
    for (let c = 0; c < 6; c++)
      for (let k = 0; k < 5; k++)
        expect(
          Number.isNaN(r.drawObjectives[(dr * 6 + c) * 5 + k] as number),
        ).toBe(c === 1)
  expect(() => toCsv(RESULT_COLUMNS, r.results)).not.toThrow()
})

test("intervalsContainNominalAndMatchIndependentDraws", async () => {
  const d = subset(2)
  const n = 24
  const seed = 7
  const r = await simulateAll(d, weather(), ctx, n, seed, 2)
  validateResults(r.results as never)
  let widths = 0
  for (const x of r.results) {
    expect(x.r_solar_lo).toBeLessThanOrEqual(x.r_solar_pred)
    expect(x.r_solar_hi).toBeGreaterThanOrEqual(x.r_solar_pred)
    expect(x.t_max_lo).toBeLessThanOrEqual(x.t_max_pred)
    expect(x.t_max_hi).toBeGreaterThanOrEqual(x.t_max_pred)
    if (x.t_max_hi > x.t_max_lo) widths++
  }
  expect(widths).toBeGreaterThan(0)
  // independent re-derivation for one candidate-scenario
  const row = r.results.find(
    (x) => x.candidate_id === "SP-002" && x.scenario_id === "W4",
  )
  const {
    candidate_id: _i,
    feasible: _f,
    violations: _v,
    ...c
  } = d[1] as FlaggedDesignRow
  const s = weather()[3] as ReturnType<typeof weather>[number]
  const nominal = evaluate(c, s, CONTROL_LAYERS.C4, ctx)
  expect(row?.t_max_pred).toBe(nominal.t_max_c)
  expect(row?.q_in_mean_w_m2).toBe(nominal.q_in_mean_w_m2)
  const mats = drawMaterials(ctx.mat, n, deriveSeed(seed, 100))
  const t = Float64Array.from(
    mats.map((m) => evaluate(c, s, CONTROL_LAYERS.C4, ctx, m).t_max_c),
  ).sort()
  expect(row?.t_max_lo).toBeCloseTo(
    Math.min(nominal.t_max_c, quantile7(t, 0.05)),
    9,
  )
  expect(row?.t_max_hi).toBeCloseTo(
    Math.max(nominal.t_max_c, quantile7(t, 0.95)),
    9,
  )
  // cost and gel are nominal-only: no interval columns exist for them
  expect(row?.cost_proxy).toBe(nominal.cost_proxy)
  expect(row?.gel_time_rel).toBe(nominal.gel_time_rel)
})

test("progressEventsTen", async () => {
  const read = withLog()
  await simulateAll(subset(2), weather(), ctx, 16, 1, 2)
  const p = read().filter((e) => e.event === "sim.progress")
  expect(p.length).toBe(10)
  expect(p[9]).toMatchObject({ done: 17, total: 17 })
  const dones = p.map((e) => e.done as number)
  expect(dones).toEqual([...dones].sort((a, b) => a - b))
})

test("drawCompleteDebugEventsOnePerEvaluation", async () => {
  const read = withLog("debug")
  await simulateAll(subset(2), weather(), ctx, 5, 1, 2)
  expect(read().filter((e) => e.event === "sim.draw_complete").length).toBe(6)
})

const badMidcoat = (): FlaggedDesignRow[] => {
  const rows = subset(4).map(({ feasible: _f, violations: _v, ...r }) => r)
  const bad = rows[2] as { midcoat_dft_um: number; topcoat_dft_um: number }
  bad.midcoat_dft_um = 5
  bad.topcoat_dft_um = 4
  const out = checkConstraints(rows, ctx.ranges)
  expect(out[2]?.feasible).toBe(true) // constraints still pass: only the optics domain is violated
  return out
}

test("workerErrorKeepsCodePhaseKey", async () => {
  for (const w of [1, 2]) {
    let err: unknown
    try {
      await simulateAll(badMidcoat(), weather(), ctx, 3, 1, w)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(PhysicsRangeError)
    expect(err).toMatchObject({
      code: 4,
      phase: "model",
      key: "midcoat_dft_um",
    })
  }
})

test("workerEventsReplayedInParent", async () => {
  const read = withLog()
  await simulateAll(badMidcoat(), weather(), ctx, 3, 1, 2).catch(() => {})
  const ev = read().find((e) => e.event === "model.out_of_range")
  expect(ev).toMatchObject({
    level: "error",
    quantity: "midcoat_dft_um",
    value: 5,
  })
})

test("nMcMustBePositiveInteger", async () => {
  for (const n of [0, -1, 2.5])
    await expect(
      simulateAll(subset(1), weather(), ctx, n, 1, 1),
    ).rejects.toThrow(ConfigError)
})

// ---- CLI ----

test("noPartialOutputOnFailure", async () => {
  const out = outDir()
  const r = await sim(writeDesign(badMidcoat()), out, ["--n-mc", "3"])
  expect(r.exitCode).toBe(4)
  expect(lastEvent(r, "error.raised")).toMatchObject({
    code: 4,
    phase: "model",
    key: "midcoat_dft_um",
  })
  expect(existsSync(join(out, "results.csv"))).toBe(false)
  expect(existsSync(join(out, "draws.csv"))).toBe(false)
  expect(existsSync(join(out, "run_meta.json"))).toBe(false)
  // the worker's model.out_of_range event reached the parent's run.jsonl
  expect(events(r).some((e) => e.event === "model.out_of_range")).toBe(true)
})

test("staleFeasibleFlagExit2", async () => {
  const rows = subset(4)
  const stale = rows.map((r, i) => (i === 1 ? { ...r, midcoat_pvc: 1.3 } : r)) // flag stays true
  expect(stale[1]?.feasible).toBe(true)
  const r = await sim(writeDesign(stale), outDir(), ["--n-mc", "2"])
  expect(r.exitCode).toBe(2)
  expect(lastEvent(r, "error.raised")).toMatchObject({
    code: 2,
    phase: "config",
    key: "feasible",
  })
})

test("writesResultsDrawsAndRunMeta", async () => {
  const rows = subset(5, 3) // 4 feasible
  const out = outDir()
  const r = await sim(writeDesign(rows), out, ["--n-mc", "256"])
  expect(r.exitCode).toBe(0)
  const res = parseResultsCsv(readFileSync(join(out, "results.csv"), "utf8"))
  expect(res.length).toBe(45)
  const draws = parseDrawsCsv(readFileSync(join(out, "draws.csv"), "utf8"))
  expect(draws.length).toBe(256 * 4)
  expect(new Set(draws.map((d) => d.candidate_id)).size).toBe(4)
  expect(draws.some((d) => d.candidate_id === "SP-004")).toBe(false)
  expect(Math.max(...draws.map((d) => d.draw))).toBe(255)
  const meta = JSON.parse(readFileSync(join(out, "run_meta.json"), "utf8"))
  expect(meta).toEqual({
    seed: 20261121,
    n_mc: 256,
    run_id: lastEvent(r, "run.start").run_id,
  })
  expect(existsSync(`${join(out, "results.csv")}.tmp`)).toBe(false)
})

test("f8MissingDesignDirExit5", async () => {
  const r = await sim(join(tmp(), "nope"), outDir())
  expect(r.exitCode).toBe(5)
  expect(lastEvent(r, "error.raised")).toMatchObject({ code: 5, phase: "data" })
})

test("f5NMcZeroExit2", async () => {
  const dir = writeDesign(subset(2))
  for (const n of ["0", "-3"]) {
    const r = await sim(dir, outDir(), ["--n-mc", n])
    expect(r.exitCode).toBe(2)
    expect(lastEvent(r, "error.raised")).toMatchObject({
      code: 2,
      phase: "config",
    })
  }
})

test("loadGuardRunsFirst", async () => {
  // F4: the design dir is missing too; the guard must fire before anything reads it
  const r = await run([
    "simulate",
    "--design",
    join(tmp(), "nope"),
    "--out",
    outDir(),
    "--seed",
    "1",
    "--max-load",
    "0",
  ])
  expect(r.exitCode).toBe(6)
  expect(events(r).some((e) => e.event === "resource.load_high")).toBe(true)
  expect(lastEvent(r, "error.raised")).toMatchObject({
    code: 6,
    phase: "resource",
  })
  expect(events(r).some((e) => e.event === "sim.start")).toBe(false)
})

test("timeoutExit6", async () => {
  const out = outDir()
  mkdirSync(out, { recursive: true })
  const r = await sim(writeDesign(subset(30)), out, [
    "--n-mc",
    "256",
    "--timeout-s",
    "0.5",
  ])
  expect(r.exitCode).toBe(6)
  expect(events(r).some((e) => e.event === "resource.timeout")).toBe(true)
  expect(existsSync(join(out, "results.csv"))).toBe(false)
})
