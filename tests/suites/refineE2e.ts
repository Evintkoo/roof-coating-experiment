import { beforeAll, expect, test } from "bun:test"
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse, stringify } from "yaml"
import { parseCsv } from "../../src/core/csv"
import { lookupBudget } from "../../src/core/opt/budgetTable"
import { readVerifiedTable } from "../../src/node/budget"
import { manifestCoreHash } from "../../src/node/report/manifest"
import {
  copyConfigWith,
  events,
  lastEvent,
  type RunResult,
  repoRoot,
  run,
} from "../helpers"
import type { Tier } from "./scale"

export type RefineE2eScale = {
  tier: Tier
  /** Extra arguments of the plan-3 `run` (the proof tier keeps the default 256 draws). */
  runExtra: string[]
  /** Extra arguments of `refine` (the proof tier keeps the default 20 starts). */
  refineExtra: string[]
  /** Table size; null keeps configs/optimize.yaml (100 levels, 64 draws). */
  table: { levels: number; draws: number } | null
}

export const REFINE_E2E_PROOF: RefineE2eScale = {
  tier: "proof",
  runExtra: [],
  refineExtra: [],
  table: null,
}

/** Real chain at small size: 4 draws, 4 starts, a 3 x 4 table with 8 draws; the fault matrix is unchanged. */
export const REFINE_E2E_FAST: RefineE2eScale = {
  tier: "fast",
  runExtra: ["--n-mc", "4"],
  refineExtra: ["--starts", "4"],
  table: { levels: 4, draws: 2 },
}

const SEED = "20261121"
const LONG = 3_600_000
/** Hard limits of the plan: refine 600 s (T_nrt), budget-table 900 s (T_nrt_table). */
const T_NRT_S = 600
const T_NRT_TABLE_S = 900
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const noTrace = (stderr: string) => expect(stderr).not.toMatch(/(^|\n)\s+at \S/)

type Timed = { r: RunResult; seconds: number }
const timed = async (args: string[]): Promise<Timed> => {
  const t0 = performance.now()
  const r = await run([...args, "--max-load", "1000"])
  return { r, seconds: (performance.now() - t0) / 1000 }
}

export function refineE2eSuite(S: RefineE2eScale): void {
  let dir: string
  let refineOut: string
  let tablePath: string
  let chain: { run: Timed; refine: Timed; table: Timed }

  beforeAll(async () => {
    // the whole chain by the real CLI, sequentially (the machine-load rule forbids overlapping heavy runs)
    dir = join(tmp("spandek-e2e5-"), "out")
    refineOut = join(dir, "refine")
    const a = await timed(["run", "--seed", SEED, "--out", dir, ...S.runExtra])
    if (a.r.exitCode !== 0) throw new Error(`run failed: ${a.r.stderr}`)
    const b = await timed([
      "refine",
      "--in",
      dir,
      "--out",
      refineOut,
      ...S.refineExtra,
    ])
    if (b.r.exitCode !== 0) throw new Error(`refine failed: ${b.r.stderr}`)
    const c = await timed([
      "budget-table",
      "--in",
      dir,
      "--out",
      refineOut,
      ...(S.table
        ? [
            "--config-dir",
            optimizeCopy((d) => {
              d.budget_levels = S.table?.levels
              d.interval_draws = S.table?.draws
            }),
          ]
        : []),
    ])
    if (c.r.exitCode !== 0)
      throw new Error(`budget-table failed: ${c.r.stderr}`)
    chain = { run: a, refine: b, table: c }
    tablePath = join(refineOut, "budget_table.json")
  }, LONG)

  test("e2eUnderBudget", () => {
    // H11: each stage inside its limit, by the stage's own clock (run.complete) and by the wall clock
    const own = (t: Timed) =>
      Number(lastEvent(t.r, "run.complete").elapsed_ms) / 1000
    expect(own(chain.refine)).toBeLessThan(T_NRT_S)
    expect(chain.refine.seconds).toBeLessThan(T_NRT_S)
    expect(own(chain.table)).toBeLessThan(T_NRT_TABLE_S)
    expect(chain.table.seconds).toBeLessThan(T_NRT_TABLE_S)
    // plan 3's own measured limit for the whole `run` (frozen from its first real run)
    const frozen = Number(
      readFileSync(join(repoRoot, "tests/fixtures/frozen_runtime.txt"), "utf8"),
    )
    expect(chain.run.seconds).toBeLessThan(Math.max(frozen, 60))
    const id = (t: Timed) => lastEvent(t.r, "run.complete").run_id
    console.log(
      `e2e run ids: run ${id(chain.run)}, refine ${id(chain.refine)}, budget-table ${id(chain.table)}`,
    )
    console.log(
      `e2e wall times: run ${chain.run.seconds.toFixed(1)} s, refine ${chain.refine.seconds.toFixed(1)} s (limit ${T_NRT_S}), budget-table ${chain.table.seconds.toFixed(1)} s (limit ${T_NRT_TABLE_S})`,
    )
  })

  test("chainOutputsAreConsistent", () => {
    const recipes = parseCsv(
      readFileSync(join(refineOut, "refine_recipes.csv"), "utf8"),
    )
    const f = readVerifiedTable(tablePath)
    expect(f.tables.length).toBe(3)
    // the table's c_min is the cheapest feasible recipe: no refined recipe is cheaper
    for (const t of f.tables)
      for (const r of recipes)
        expect(Number(r.cost_proxy)).toBeGreaterThanOrEqual(t.c_min - 1e-9)
    // the manifest of the plan-3 run lists the table and its core hash is consistent
    const m = JSON.parse(readFileSync(join(dir, "run_manifest.json"), "utf8"))
    expect(m.extra.map((e: { path: string }) => e.path)).toEqual([
      "refine/budget_table.json",
    ])
    expect(m.core_sha256).toBe(manifestCoreHash(m))
    // a budget equal to each refined recipe's cost finds an entry of every profile that is within it
    for (const r of recipes)
      for (const t of f.tables) {
        const q = lookupBudget(t, Number(r.cost_proxy))
        expect(q.status).toBe("ok")
        if (q.status === "ok")
          expect(q.entry.cost).toBeLessThanOrEqual(Number(r.cost_proxy))
      }
  })

  test("budgetLookupsThroughTheCli", async () => {
    const f = readVerifiedTable(tablePath)
    for (const t of f.tables) {
      const knee = await run([
        "budget",
        "--table",
        tablePath,
        "--amount",
        String(t.knee_budget),
        "--profile",
        t.profile,
      ])
      expect(knee.exitCode).toBe(0)
      const out = JSON.parse(knee.stdout)
      expect(out.profile).toBe(t.profile)
      expect(out.cost).toBeLessThanOrEqual(t.knee_budget)
      expect(out.knee_budget).toBe(t.knee_budget)
      const top = await run([
        "budget",
        "--table",
        tablePath,
        "--amount",
        String(2 * t.c_max),
        "--profile",
        t.profile,
      ])
      expect(top.exitCode).toBe(0)
      expect(JSON.parse(top.stdout).entry_budget).toBe(t.c_max)
    }
  })

  // ---- the fault matrix F1..F13, each one real edit through the real CLI ----

  const raised = (r: RunResult) =>
    events(r).find((e) => e.event === "error.raised") as
      | Record<string, unknown>
      | undefined

  function expectFault(r: RunResult, exit: number, phase: string): void {
    expect(r.exitCode).toBe(exit)
    const e = raised(r)
    expect(e?.phase).toBe(phase)
    expect(e?.code).toBe(exit)
    noTrace(r.stderr)
  }

  /** A copy of configs/ with optimize.yaml edited by `edit`. */
  function optimizeCopy(edit: (doc: Record<string, unknown>) => void): string {
    const d = tmp("spandek-optcfg-")
    cpSync(join(repoRoot, "configs"), d, { recursive: true })
    const p = join(d, "optimize.yaml")
    const doc = parse(readFileSync(p, "utf8")) as Record<string, unknown>
    edit(doc)
    writeFileSync(p, stringify(doc))
    return d
  }

  const refineArgs = (
    inDir: string,
    extra: string[] = [],
    out = join(tmp("spandek-fout-"), "o"),
  ) => ["refine", "--in", inDir, "--out", out, "--max-load", "1000", ...extra]

  test(
    "faultMatrixF1toF13",
    async () => {
      // F1: weights do not sum to 1
      expectFault(
        await run(
          refineArgs(dir, [
            "--config-dir",
            optimizeCopy((d) => {
              const w = (d.weights as Record<string, Record<string, number>>)
                .balanced as Record<string, number>
              w.r_solar_pred = 0.5
            }),
          ]),
        ),
        2,
        "config",
      )
      // F2: a variable with lo > hi
      expectFault(
        await run(
          refineArgs(dir, [
            "--config-dir",
            optimizeCopy((d) => {
              const v = (d.vars as Record<string, number>[])[0] as Record<
                string,
                number
              >
              v.lo = 0.9
            }),
          ]),
        ),
        2,
        "config",
      )
      // F3: --starts 0
      expectFault(await run(refineArgs(dir, ["--starts", "0"])), 2, "config")
      // F4: cpvc below the lowest PVC
      expectFault(
        await run(
          refineArgs(dir, [
            "--config-dir",
            await copyConfigWith("cpvc.value", 0.05),
          ]),
        ),
        3,
        "refine.feasible",
      )
      // F5: a NaN refractive index. Through the CLI the materials schema rejects it first (exit 2, phase config); exit 4 at
      // refine.model is proved at the runRefine level (tests/node/refine.test.ts nanRefractiveIndexIsExit4)
      const nanCfg = tmp("spandek-nancfg-")
      cpSync(join(repoRoot, "configs"), nanCfg, { recursive: true })
      const mp = join(nanCfg, "materials.yaml")
      writeFileSync(
        mp,
        readFileSync(mp, "utf8").replace(
          /(binder:\s*\n\s*n:\s*\n\s*value:)\s*[\d.]+/,
          "$1 .nan",
        ),
      )
      expect(readFileSync(mp, "utf8")).toContain(".nan")
      expectFault(
        await run(refineArgs(dir, ["--config-dir", nanCfg])),
        2,
        "config",
      )
      // F6 (a discontinuity injected into the corrosion model) needs a mutation copy of the sources: it is run in the
      // mutation copy and recorded in docs/proofs/plan-05.md, not here.
      // F7: results.csv missing from --in
      const noResults = tmp("spandek-noresults-")
      for (const f of readdirSync(dir))
        if (f !== "results.csv" && f !== "refine" && f !== "candidate_cards")
          copyFileSync(join(dir, f), join(noResults, f))
      expectFault(await run(refineArgs(noResults)), 5, "refine.load")
      // F8: time limit
      expectFault(
        await run(refineArgs(dir, ["--time-limit-s", "0.001"])),
        6,
        "refine.run",
      )
      // F9: a start point outside the box
      expectFault(
        await run(
          refineArgs(dir, [
            "--config-dir",
            optimizeCopy((d) => {
              d.extra_starts = [[0.5, 7, 0.25, 0.5, 200, 0.5, 10, 0.3, 9.0]]
            }),
          ]),
        ),
        2,
        "config",
      )
      // F10: amount below c_min
      const f = readVerifiedTable(tablePath)
      const cMin = (f.tables[1] as { c_min: number }).c_min
      const f10 = await run([
        "budget",
        "--table",
        tablePath,
        "--amount",
        String(0.9 * cMin),
        "--profile",
        "balanced",
      ])
      expectFault(f10, 3, "budget.lookup")
      expect(f10.stderr).toContain(`c_min = ${cMin}`)
      // F11: negative amount; unknown profile
      expectFault(
        await run([
          "budget",
          "--table",
          tablePath,
          "--amount",
          "-5",
          "--profile",
          "balanced",
        ]),
        2,
        "config",
      )
      expectFault(
        await run([
          "budget",
          "--table",
          tablePath,
          "--amount",
          "0.5",
          "--profile",
          "luxury",
        ]),
        2,
        "config",
      )
      // F12: one byte of budget_table.json changed
      const copy = tmp("spandek-f12-")
      cpSync(dir, copy, { recursive: true })
      const p = join(copy, "refine", "budget_table.json")
      const bytes = readFileSync(p)
      const hit = /"cost": 0\.(\d)/.exec(bytes.toString("utf8"))
      expect(hit).not.toBeNull()
      const at =
        (hit as RegExpExecArray).index + (hit as RegExpExecArray)[0].length - 1
      bytes[at] = bytes[at] === 0x39 ? 0x38 : (bytes[at] as number) + 1
      writeFileSync(p, bytes)
      expectFault(
        await run([
          "budget",
          "--table",
          p,
          "--amount",
          "0.5",
          "--profile",
          "balanced",
        ]),
        5,
        "budget.verify",
      )
      // F13: time limit on budget-table
      expectFault(
        await run([
          "budget-table",
          "--in",
          dir,
          "--out",
          join(dir, "refine-f13"),
          "--time-limit-s",
          "0.001",
          "--max-load",
          "1000",
        ]),
        6,
        "budget.build",
      )
    },
    LONG,
  )
}
