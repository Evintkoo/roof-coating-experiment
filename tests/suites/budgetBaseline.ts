import { beforeAll, expect, test } from "bun:test"
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse, stringify } from "yaml"
import { weatherL9 } from "../../src/core/design"
import {
  type BudgetEntry,
  kneeBudget,
  lookupBudget,
  T_REPAIR,
} from "../../src/core/opt/budgetTable"
import { type Model, makeModel } from "../../src/core/opt/objective"
import { chebyshev, normalised } from "../../src/core/opt/scalarize"
import { sobolPoints } from "../../src/core/opt/sobol"
import { toScaled, VARS } from "../../src/core/opt/vars"
import type { ModelContext } from "../../src/core/pipeline/context"
import { deriveSeed, Xoshiro128 } from "../../src/core/rng"
import { parseResultsCsv } from "../../src/core/schema"
import {
  type BudgetFile,
  PROFILES,
  polish,
  queryTable,
  readVerifiedTable,
} from "../../src/node/budget"
import { loadOptimize } from "../../src/node/config"
import { loadContext } from "../../src/node/context"
import { events, lastEvent, repoRoot, run } from "../helpers"
import type { Tier } from "./scale"

export type BudgetScale = {
  tier: Tier
  /** Budget levels per profile (config budget_levels): 100 in the proof tier. */
  levels: number
  /** K_b interval draws (config interval_draws): 64 in the proof tier. */
  intervalDraws: number
  /** Draws of the plan-3 `run` that feeds the table. */
  nMc: string
  /** Brute-force Sobol points of H13 and the budgets of H13 (indices into the table). */
  sobol: number
  h13Levels: number[]
  /** Random budgets per profile of the H14 lookup test; budgets of the H17 polish test. */
  lookupDraws: number
  polishDraws: number
  /** Every `recipeStride`-th level is recomputed from its recipe. */
  recipeStride: number
}

export const BUDGET_PROOF: BudgetScale = {
  tier: "proof",
  levels: 100,
  intervalDraws: 64,
  nMc: "16",
  sobol: 4096,
  h13Levels: [0, 11, 22, 33, 44, 55, 66, 77, 88, 99],
  lookupDraws: 1000,
  polishDraws: 20,
  recipeStride: 9,
}

/**
 * A small real table: 3 profiles x 6 levels, 2 draws; H13 at every budget, against the 96 screened candidates only
 * (sobol 0). Against 4096 Sobol points a 3 x 12 table loses at durability_first level 3 (0.163 against 0.092): the
 * continuation between levels needs the fine spacing of the 100-level table, so the Sobol comparison of H13 is asserted in
 * the proof tier only (docs/testing.md).
 */
export const BUDGET_FAST: BudgetScale = {
  tier: "fast",
  levels: 6,
  intervalDraws: 2,
  nMc: "4",
  sobol: 0,
  h13Levels: [0, 1, 2, 3, 4, 5],
  lookupDraws: 1000,
  polishDraws: 8,
  recipeStride: 2,
}

/** A copy of configs/ whose optimize.yaml carries the scale's table size (the proof scale uses configs/ itself). */
function scaledConfig(s: BudgetScale): string {
  if (s.tier === "proof") return join(repoRoot, "configs")
  const d = mkdtempSync(join(tmpdir(), "spandek-bud-cfg-"))
  cpSync(join(repoRoot, "configs"), d, { recursive: true })
  const p = join(d, "optimize.yaml")
  const doc = parse(readFileSync(p, "utf8"))
  doc.budget_levels = s.levels
  doc.interval_draws = s.intervalDraws
  writeFileSync(p, stringify(doc))
  return d
}

export function budgetBaselineSuite(S: BudgetScale): void {
  const LONG = 1_800_000
  const T_NRT_TABLE_S = 900
  const cfgDir = scaledConfig(S)
  const last = S.levels - 1
  const dataDir = join(repoRoot, "data", "literature")
  const SEED = "20261121"
  /** Seed of the 4096 brute-force Sobol points of H13 (a test stream, not one of the plan 01 D13 pipeline streams). */
  const H13_SOBOL_SEED = 4242
  /** Stream index of the 1000 random budgets per profile of the H14 lookup test (test-only, outside 0-6 and 100-304). */
  const H14_BUDGET_STREAM = 9014
  /** Stream index of the random budgets of the H17 polish test (test-only). */
  const H17_BUDGET_STREAM = 9017

  let plan3: string
  let tablePath: string
  let file: BudgetFile
  let ctx: ModelContext
  let model: Model
  let cfg: Awaited<ReturnType<typeof loadOptimize>>
  let buildS: number
  let buildRun: Awaited<ReturnType<typeof run>>

  beforeAll(async () => {
    plan3 = mkdtempSync(join(tmpdir(), "spandek-bud-p3-"))
    const r = await run([
      "run",
      "--seed",
      SEED,
      "--out",
      plan3,
      "--n-mc",
      S.nMc,
      "--max-load",
      "1000",
    ])
    if (r.exitCode !== 0) throw new Error(`run failed: ${r.stderr}`)
    const t0 = performance.now()
    buildRun = await run([
      "budget-table",
      "--in",
      plan3,
      "--out",
      join(plan3, "refine"),
      "--config-dir",
      cfgDir,
      "--max-load",
      "1000",
    ])
    buildS = (performance.now() - t0) / 1000
    if (buildRun.exitCode !== 0)
      throw new Error(`budget-table failed: ${buildRun.stderr}`)
    tablePath = join(plan3, "refine", "budget_table.json")
    file = readVerifiedTable(tablePath)
    ctx = await loadContext(cfgDir, dataDir)
    cfg = await loadOptimize(join(cfgDir, "optimize.yaml"))
    const results = parseResultsCsv(
      readFileSync(join(plan3, "results.csv"), "utf8"),
    )
    void results
    model = makeModel(
      ctx,
      weatherL9(ctx.weather),
      file.norm,
      ctx.ranges.cpvc.value,
      ctx.ranges.max_total_dft_um.value,
    )
  }, LONG)

  const table = (p: string) => {
    const t = file.tables.find((x) => x.profile === p)
    if (!t) throw new Error(`no table ${p}`)
    return t
  }

  test("tableHasThreeProfilesOfTheScaledLevels", () => {
    expect(file.tables.map((t) => t.profile)).toEqual([...PROFILES])
    for (const t of file.tables) {
      expect(t.entries.length).toBe(S.levels)
      expect(t.entries[0]?.budget).toBe(t.c_min)
      expect(t.entries[last]?.budget).toBe(t.c_max)
      expect(t.knee_budget).toBe(kneeBudget(t.entries))
      expect(t.knee_budget).toBeGreaterThanOrEqual(t.c_min)
      expect(t.knee_budget).toBeLessThanOrEqual(t.c_max)
      for (const e of t.entries) {
        expect(e.cost).toBeLessThanOrEqual(e.budget) // the hard post-condition, on the written file
        expect(e.lo.every((v, i) => v <= (e.hi[i] as number))).toBe(true)
      }
    }
    const knees = file.tables.map(
      (t) => `${t.profile} ${t.knee_budget.toFixed(4)}`,
    )
    console.log(
      `knee budgets: ${knees.join(", ")}; c_min ${table("balanced").c_min}, c_max ${table("balanced").c_max}`,
    )
  })

  test("budgetTableRuntimeIsWithinTheLimitAndRecorded", () => {
    // H11
    expect(
      Number(lastEvent(buildRun, "run.complete").elapsed_ms) / 1000,
    ).toBeLessThan(T_NRT_TABLE_S)
    expect(buildS).toBeLessThan(T_NRT_TABLE_S)
    console.log(
      `budget-table wall time ${buildS.toFixed(1)} s (2 workers, 3 x ${S.levels} levels, ${S.intervalDraws} draws)`,
    )
  })

  test("tableMonotoneAndRepairsCappedOnRealData", () => {
    // H15
    for (const t of file.tables) {
      for (let k = 1; k < t.entries.length; k++)
        expect((t.entries[k] as BudgetEntry).scalar).toBeLessThanOrEqual(
          (t.entries[k - 1] as BudgetEntry).scalar + 1e-12,
        )
      const repaired = t.entries.filter((e) => e.repaired).length
      expect(repaired / t.entries.length).toBeLessThanOrEqual(T_REPAIR)
      console.log(`${t.profile}: ${repaired} repaired entries`)
    }
  })

  test("budgetIsSpentWhenBinding", () => {
    // H16: for non-repaired entries below the cost of the unconstrained optimum the budget is spent (1e-4 relative)
    let worst = 0
    for (const t of file.tables)
      for (const e of t.entries) {
        if (e.repaired || e.budget >= t.c_max) continue
        const slack = (e.budget - e.cost) / e.budget
        worst = Math.max(worst, slack)
        expect(slack).toBeLessThan(1e-4)
      }
    console.log(`H16 largest relative headroom ${worst.toExponential(2)}`)
  })

  test("everyEntryRecomputesFromItsRecipe", () => {
    // the stored numbers are the model's, not the optimiser's bookkeeping
    const w = (p: string) => file.weights[p] as number[]
    for (const t of file.tables)
      for (const e of t.entries.filter((x) => x.level % S.recipeStride === 0)) {
        const u = toScaled(e.x)
        expect(Math.abs(model.scalar(u, w(t.profile)) - e.scalar)).toBeLessThan(
          1e-9,
        )
        expect(Math.abs(model.cost(u) - e.cost)).toBeLessThan(1e-9)
        const o = model.objectives(u)
        for (let i = 0; i < o.length; i++)
          expect(
            Math.abs((e.objectives[i] as number) - (o[i] as number)),
          ).toBeLessThan(1e-9)
        expect(model.maxViolation(u)).toBeLessThanOrEqual(1e-9)
      }
  })

  test(
    "beatsSobolAndScreenedUnderBudget",
    () => {
      // H13: at 10 chosen budgets per profile the table scalar is no worse than the best of 4096 Sobol points and the best
      // plan-3 candidate whose cost is within the budget (brute force, same model, same scalar, nominal grades for plan 3)
      const results = parseResultsCsv(
        readFileSync(join(plan3, "results.csv"), "utf8"),
      )
      const grades = [
        ctx.mat.tio2.diameter_um.value,
        ctx.mat.baso4.diameter_um.value,
      ]
      const screened: Float64Array[] = []
      const seen = new Set<string>()
      for (const r of results) {
        if (!r.feasible || seen.has(r.candidate_id)) continue
        seen.add(r.candidate_id)
        screened.push(
          toScaled([
            r.primer_gptes_molfrac,
            r.primer_dft_um,
            r.midcoat_pvc,
            r.midcoat_tio2_fraction,
            r.midcoat_dft_um,
            r.topcoat_mtes_molfrac,
            r.topcoat_dft_um,
            ...grades,
          ]),
        )
      }
      expect(screened.length).toBe(96)
      const sobol = sobolPoints(S.sobol, 9, H13_SOBOL_SEED).map((p) =>
        Float64Array.from(p),
      )
      // objectives are shared by the three profiles: evaluate every point once
      const pts = [...screened, ...sobol]
        .filter((u) => model.maxViolation(u) <= 0)
        .map((u) => {
          const o = model.objectives(u)
          return {
            cost: model.cost(u),
            g: normalised(o, file.norm),
            screened: false,
          }
        })
      expect(pts.length).toBeGreaterThan(S.sobol > 0 ? 1000 : 10)
      const levels = S.h13Levels
      const margins: string[] = []
      let compared = 0
      let strictlyBetter = 0
      for (const p of PROFILES) {
        const w = file.weights[p] as number[]
        const sc = pts.map((q) => ({ cost: q.cost, s: chebyshev(q.g, w) }))
        for (const k of levels) {
          const e = table(p).entries[k] as BudgetEntry
          const cand = sc.filter((q) => q.cost <= e.budget)
          const best =
            cand.length === 0
              ? Number.POSITIVE_INFINITY
              : Math.min(...cand.map((q) => q.s))
          if (Number.isFinite(best)) {
            compared++
            if (e.scalar < best - 1e-9) strictlyBetter++
          }
          expect(e.scalar).toBeLessThanOrEqual(best + 1e-9)
          margins.push(
            `${p}[${k}] ${e.scalar.toFixed(4)} vs ${Number.isFinite(best) ? best.toFixed(4) : "none"} (${cand.length})`,
          )
        }
      }
      // non-vacuous: all but the level-0 budget of each profile (= c_min, no brute-force point is cheap enough) have a
      // brute-force point to beat: at least 27 of 30 in the proof tier, 12 of 15 in the fast tier
      expect(compared).toBeGreaterThanOrEqual(
        levels.length * PROFILES.length - 3,
      )
      // the proof log says "better" at every compared budget: strictly, by more than the 1e-9 equality allowance
      expect(strictlyBetter).toBe(compared)
      console.log(
        `H13 table vs best brute force: ${strictlyBetter} of ${compared} compared budgets strictly better\n${margins.join("\n")}`,
      )
    },
    LONG,
  )

  test("lookupOnTheRealTableIsExactAndSafe", () => {
    // H14 on real data: 1000 random budgets against a brute-force scan
    const rng = new Xoshiro128(deriveSeed(Number(SEED), H14_BUDGET_STREAM))
    for (const p of PROFILES) {
      const t = table(p)
      for (let i = 0; i < S.lookupDraws; i++) {
        const b = 1.1 * t.c_max * rng.next()
        const r = lookupBudget(t, b)
        let hit: BudgetEntry | undefined
        for (const e of t.entries) if (e.budget <= b) hit = e
        if (hit === undefined) {
          expect(r.status).toBe("infeasible")
          expect(b).toBeLessThan(t.c_min)
        } else {
          expect(r.status === "ok" ? r.entry : null).toBe(hit)
          expect(hit.cost).toBeLessThanOrEqual(b)
        }
      }
    }
  })

  test(
    "polishNeverLoses",
    () => {
      // H17: 20 random budgets (profiles in rotation): the polished scalar is no worse than the table entry's, cost <= budget
      const rng = new Xoshiro128(deriveSeed(Number(SEED), H17_BUDGET_STREAM))
      let improved = 0
      for (let i = 0; i < S.polishDraws; i++) {
        const p = PROFILES[i % 3] as string
        const t = table(p)
        const b = t.c_min + (1.05 * t.c_max - t.c_min) * rng.next()
        const q = queryTable(file, p, b)
        const r = polish(ctx, cfg, file, q, b)
        expect(r.scalar).toBeLessThanOrEqual(q.entry.scalar)
        expect(r.cost).toBeLessThanOrEqual(b)
        if (r.polished) {
          improved++
          const u = toScaled(VARS.map((v) => r.recipe[v.id] as number))
          expect(model.maxViolation(u)).toBeLessThanOrEqual(1e-9)
          expect(
            model.scalar(u, file.weights[p] as number[]),
          ).toBeLessThanOrEqual(q.entry.scalar)
        }
      }
      console.log(`polish improved ${improved} of ${S.polishDraws} budgets`)
    },
    LONG,
  )

  const budgetArgs = (table: string, extra: string[]) => [
    "budget",
    "--table",
    table,
    ...extra,
  ]

  test("budgetCliPrintsTheExactEntryAndLogsTheQuery", async () => {
    const t = table("balanced")
    const k = Math.floor(0.4 * S.levels)
    const b =
      0.5 *
      ((t.entries[k]?.budget as number) + (t.entries[k + 1]?.budget as number))
    const r = await run(
      budgetArgs(tablePath, ["--amount", String(b), "--profile", "balanced"]),
    )
    expect(r.exitCode).toBe(0)
    const out = JSON.parse(r.stdout)
    const e = t.entries[k] as BudgetEntry
    expect(out.entry_budget).toBe(e.budget)
    expect(out.cost).toBe(e.cost)
    expect(out.headroom).toBeCloseTo(b - e.cost, 12)
    expect(out.recipe.m3).toBe(e.x[4])
    expect(out.polished).toBe(false)
    expect(out.knee_budget).toBe(t.knee_budget)
    expect(lastEvent(r, "refine.budget.query")).toMatchObject({
      profile: "balanced",
      budget: b,
      entry_budget: e.budget,
      polished: false,
    })
  })

  test("budgetCliPolishFlagRunsTheSolverAndNeverLoses", async () => {
    const t = table("cooling_first")
    const k = Math.floor(0.3 * S.levels)
    const b =
      (t.entries[k] as BudgetEntry).budget +
      0.4 *
        ((t.entries[k + 1] as BudgetEntry).budget -
          (t.entries[k] as BudgetEntry).budget)
    const r = await run(
      budgetArgs(tablePath, [
        "--amount",
        String(b),
        "--profile",
        "cooling_first",
        "--polish",
      ]),
    )
    expect(r.exitCode).toBe(0)
    const out = JSON.parse(r.stdout)
    expect(out.scalar).toBeLessThanOrEqual((t.entries[k] as BudgetEntry).scalar)
    expect(out.cost).toBeLessThanOrEqual(b)
  })

  test("belowCMinIsExit3", async () => {
    // F10
    const t = table("balanced")
    const r = await run(
      budgetArgs(tablePath, [
        "--amount",
        String(t.c_min * 0.99),
        "--profile",
        "balanced",
      ]),
    )
    expect(r.exitCode).toBe(3)
    expect(r.stderr).toContain(`c_min = ${t.c_min}`)
    expect(
      events(r).some(
        (e) =>
          e.event === "error.raised" &&
          e.phase === "budget.lookup" &&
          e.code === 3,
      ),
    ).toBe(true)
    expect(r.stderr).not.toMatch(/(^|\n)\s+at \S/)
  })

  test("negativeBudgetOrUnknownProfileIsExit2", async () => {
    // F11
    for (const args of [
      ["--amount", "-5", "--profile", "balanced"],
      ["--amount", "0.5", "--profile", "luxury"],
      ["--amount", "abc", "--profile", "balanced"],
    ]) {
      const r = await run(budgetArgs(tablePath, args))
      expect(r.exitCode).toBe(2)
      expect(
        events(r).some(
          (e) => e.event === "error.raised" && e.phase === "config",
        ),
      ).toBe(true)
    }
  })

  test("budgetTakesNeitherConfigDirNorMaxLoad", async () => {
    for (const flag of ["--config-dir", "--max-load"]) {
      const r = await run(
        budgetArgs(tablePath, [
          "--amount",
          "0.5",
          "--profile",
          "balanced",
          flag,
          "x",
        ]),
      )
      expect(r.exitCode).toBe(2)
    }
  })

  test("tamperedTableIsExit5", async () => {
    // F12: one byte of budget_table.json changed (a digit inside a number), the manifest hash catches it
    const copy = mkdtempSync(join(tmpdir(), "spandek-bud-tamper-"))
    cpSync(plan3, copy, { recursive: true })
    const p = join(copy, "refine", "budget_table.json")
    const good = readFileSync(p)
    const ok = await run(
      budgetArgs(p, ["--amount", "0.5", "--profile", "balanced"]),
    )
    expect(ok.exitCode).toBe(0)
    const hit = /"scalar": 0\.(\d)/.exec(good.toString("utf8"))
    expect(hit).not.toBeNull()
    const at =
      (hit as RegExpExecArray).index + (hit as RegExpExecArray)[0].length - 1
    const bad = Buffer.from(good)
    bad[at] = (bad[at] as number) === 0x39 ? 0x38 : (bad[at] as number) + 1
    expect(bad.equals(good)).toBe(false)
    writeFileSync(p, bad)
    const r = await run(
      budgetArgs(p, ["--amount", "0.5", "--profile", "balanced"]),
    )
    expect(r.exitCode).toBe(5)
    expect(
      events(r).some(
        (e) =>
          e.event === "error.raised" &&
          e.phase === "budget.verify" &&
          e.code === 5,
      ),
    ).toBe(true)
    // the manifest itself edited: its own core hash catches that
    writeFileSync(p, good)
    const mp = join(copy, "run_manifest.json")
    const m = readFileSync(mp, "utf8")
    writeFileSync(mp, m.replace(/"seed": \d+/, '"seed": 1'))
    const r2 = await run(
      budgetArgs(p, ["--amount", "0.5", "--profile", "balanced"]),
    )
    expect(r2.exitCode).toBe(5)
  })

  test("budgetTimeLimitIsExit6", async () => {
    // F13
    const r = await run([
      "budget-table",
      "--in",
      plan3,
      "--out",
      join(plan3, "refine-timeout"),
      "--config-dir",
      cfgDir,
      "--time-limit-s",
      "0.001",
      "--max-load",
      "1000",
    ])
    expect(r.exitCode).toBe(6)
    expect(lastEvent(r, "resource.timeout")).toMatchObject({
      command: "budget-table",
    })
    expect(
      events(r).some(
        (e) =>
          e.event === "error.raised" &&
          e.phase === "budget.build" &&
          e.code === 6,
      ),
    ).toBe(true)
    expect(r.stderr).not.toMatch(/(^|\n)\s+at \S/)
  })
}
