import { beforeAll, expect, test } from "bun:test"
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseCsv } from "../../src/core/csv"
import { weatherL9 } from "../../src/core/design"
import { SpandekError } from "../../src/core/errors"
import { delaminationProxy } from "../../src/core/models/delamination"
import { gradient } from "../../src/core/opt/gradient"
import { makeModel } from "../../src/core/opt/objective"
import { minimise } from "../../src/core/opt/projectedBfgs"
import {
  normaliseObjectives,
  OBJECTIVE_NAMES,
} from "../../src/core/opt/scalarize"
import { toScaled, VARS } from "../../src/core/opt/vars"
import type { ModelContext } from "../../src/core/pipeline/context"
import { shortlistFromPareto } from "../../src/core/pipeline/tables"
import { parseResultsCsv } from "../../src/core/schema"
import { loadOptimize } from "../../src/node/config"
import { loadContext } from "../../src/node/context"
import { configureLogging } from "../../src/node/logging"
import { gradcheckOrThrow, loadPlan3, runRefine } from "../../src/node/refine"
import {
  buildPlan3,
  copyConfigWith,
  events,
  lastEvent,
  repoRoot,
  run,
} from "../helpers"

const T_KKT = Number(
  readFileSync(
    join(repoRoot, "tests/fixtures/frozen_t_kkt.txt"),
    "utf8",
  ).trim(),
)
const SEED = 20261121
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const CSVS = [
  "refine_front.csv",
  "refine_recipes.csv",
  "refine_tolerance.csv",
  "refine_robust.csv",
]
const cfgDir = join(repoRoot, "configs")
const dataDir = join(repoRoot, "data", "literature")
const LONG = 300_000

let plan3: string
let ctx: ModelContext
let outA: string // two workers
let outB: string // one worker
let logA: { runDir: string }
let cfg: Awaited<ReturnType<typeof loadOptimize>>
const rows = (dir: string, name: string) =>
  parseCsv(readFileSync(join(dir, name), "utf8"))
const num = (r: Record<string, string>, k: string) => Number(r[k])

const OPTS = { starts: 4 }
/** Starts of the two-worker / one-worker pair (H10 byte equality and the event catalogue): the pair is the expensive part. */
const PAIR = { starts: 2 }
/** Critical topcoat thickness (um) of the delam-active case: small enough that the 0.5 delamination cap binds. */
const DELAM_PROBE_H_C0 = 7
/** |delam_proxy - cap| below which the cap counts as active at the optimum. */
const DELAM_ACTIVE_TOL = 1e-6

beforeAll(async () => {
  plan3 = tmp("spandek-p3-")
  await buildPlan3(plan3)
  ctx = await loadContext(cfgDir, dataDir)
  cfg = await loadOptimize(join(cfgDir, "optimize.yaml"))
  const shortlist = shortlistFromPareto(loadPlan3(plan3).pareto)
  const logDir = tmp("spandek-reflog-")
  configureLogging({ runId: "refine-test", level: "info", runDir: logDir })
  logA = { runDir: logDir }
  outA = join(tmp("spandek-refA-"), "out")
  await runRefine(ctx, shortlist, SEED, plan3, {
    out: outA,
    cfg,
    workers: 2,
    ...PAIR,
  })
  outB = join(tmp("spandek-refB-"), "out")
  await runRefine(ctx, shortlist, SEED, plan3, {
    out: outB,
    cfg,
    workers: 1,
    ...PAIR,
  })
}, LONG)

test("frozenKktBoundMatchesTheConfigAndIsWithinTheHardBound", () => {
  expect(cfg.t_kkt).toBe(T_KKT)
  expect(T_KKT).toBeLessThanOrEqual(1e-4)
  expect(cfg.t_grad_rel).toBe(
    Number(
      readFileSync(
        join(repoRoot, "tests/fixtures/frozen_t_grad_rel.txt"),
        "utf8",
      ),
    ),
  )
})

test("optimaSatisfyAllConstraints", () => {
  // H6: recomputed from the written levels, not from the optimiser's own violation column
  const cpvc = ctx.ranges.cpvc.value
  const cap = ctx.ranges.max_total_dft_um.value
  const all = [
    ...rows(outA, "refine_front.csv"),
    ...rows(outA, "refine_recipes.csv"),
  ]
  expect(all.length).toBeGreaterThan(3)
  for (const r of all) {
    VARS.forEach((v) => {
      expect(num(r, v.id)).toBeGreaterThanOrEqual(v.lo - 1e-12)
      expect(num(r, v.id)).toBeLessThanOrEqual(v.hi + 1e-12)
    })
    expect(num(r, "m1")).toBeLessThanOrEqual(cpvc + 1e-9)
    expect(num(r, "p2") + num(r, "m3") + num(r, "t2")).toBeLessThanOrEqual(
      cap + 1e-9,
    )
    expect(
      delaminationProxy(num(r, "t1"), num(r, "t2"), ctx.mat),
    ).toBeLessThanOrEqual(0.5 + 1e-9)
    expect(num(r, "max_violation")).toBeLessThanOrEqual(1e-9)
  }
})

test("multiStartSpreadReported", () => {
  // H7: the spread of the balanced solves is reported (event and meta), recipes carry kkt and the saddle flag
  const ev = lastEvent(logA, "refine.front.done")
  expect(ev.s_best as number).toBeLessThanOrEqual(ev.s_worst as number)
  expect(ev.s_spread as number).toBeCloseTo(
    (ev.s_worst as number) - (ev.s_best as number),
    12,
  )
  const meta = JSON.parse(readFileSync(join(outA, "refine_meta.json"), "utf8"))
  expect(meta.s_balanced.spread).toBe(ev.s_spread as number)
  expect(meta.n_starts).toBe(PAIR.starts)
  for (const r of rows(outA, "refine_recipes.csv")) {
    expect(r.saddle === "true").toBe(num(r, "min_eig") < -T_KKT)
    if (r.status === "converged")
      expect(num(r, "kkt")).toBeLessThanOrEqual(T_KKT)
  }
})

test(
  "toleranceEdgesVerifiedByDirectEvaluation",
  async () => {
    // H8: every edge re-evaluated by a fresh model (not by toleranceTable) lands on 1 % +- 1e-6; the loss at 1.5 x the
    // tolerance exceeds 1 %; at least 7 of 9 variables have a confirmed edge. Edges at an active bound (tol 0) or never
    // reaching 1 % inside the box are clipped, not confirmed.
    const results = parseResultsCsv(
      readFileSync(join(plan3, "results.csv"), "utf8"),
    )
    const model = makeModel(
      ctx,
      weatherL9(ctx.weather),
      normaliseObjectives(results),
      ctx.ranges.cpvc.value,
      ctx.ranges.max_total_dft_um.value,
    )
    const recipes = rows(outA, "refine_recipes.csv")
    const tol = rows(outA, "refine_tolerance.csv")
    for (const rec of recipes) {
      const w = OBJECTIVE_NAMES.map(
        (n) =>
          (cfg.weights[rec.weight_id as string] as Record<string, number>)[
            n
          ] as number,
      )
      expect(w.length).toBe(5)
      const f = (u: Float64Array) => model.scalar(u, w)
      const u = toScaled(VARS.map((v) => num(rec, v.id)))
      const fStar = f(u)
      let confirmed = 0
      for (const t of tol.filter((x) => x.role === rec.role)) {
        const i = VARS.findIndex((v) => v.id === t.variable)
        let ok = false
        for (const [side, d] of [
          [-1, num(t, "tol_lo_scaled")],
          [1, num(t, "tol_hi_scaled")],
        ] as const) {
          if (d <= 0) continue
          const at = (k: number) => {
            const x = Float64Array.from(u)
            x[i] = Math.min(1, Math.max(0, (x[i] as number) + side * k * d))
            return (f(x) - fStar) / Math.abs(fStar)
          }
          const loss = at(1)
          const clippedEdge = (side < 0 ? u[i] : 1 - (u[i] as number)) as number
          if (
            Math.abs(d - clippedEdge) < 1e-12 &&
            Math.abs(loss - cfg.tol_loss) > 1e-6
          )
            continue // clipped by the box
          expect(Math.abs(loss - cfg.tol_loss)).toBeLessThan(1e-6)
          expect(at(1.5)).toBeGreaterThan(cfg.tol_loss)
          ok = true
        }
        if (ok) confirmed++
      }
      expect(confirmed).toBeGreaterThanOrEqual(7)
    }
  },
  LONG,
)

test("robustRegretNotWorseThanNominal", () => {
  // H9: robust vs nominal on 256 fresh draws (stream 302): p95 regret (against the better of the two recipes per draw)
  // and p95 of the scalar itself
  const fresh = new Map(
    rows(outA, "refine_robust.csv")
      .filter((r) => r.kind === "fresh")
      .map((r) => [r.name as string, num(r, "value")]),
  )
  expect(fresh.size).toBe(6)
  expect(fresh.get("regret_p95_robust") as number).toBeLessThanOrEqual(
    fresh.get("regret_p95_nominal") as number,
  )
  expect(fresh.get("s_p95_fresh_robust") as number).toBeLessThanOrEqual(
    fresh.get("s_p95_fresh_nominal") as number,
  )
  expect(fresh.get("s_p90_train_robust") as number).toBeLessThanOrEqual(
    (fresh.get("s_p90_train_nominal") as number) + 1e-12,
  )
  const dist = rows(outA, "refine_robust.csv").filter(
    (r) => r.kind === "distribution",
  )
  expect(dist.map((r) => r.name)).toEqual(VARS.map((v) => v.id))
  for (const r of dist) expect(num(r, "min")).toBeLessThanOrEqual(num(r, "max"))
})

test("sameCsvOneAndTwoWorkers", () => {
  // H10
  for (const f of CSVS)
    expect(readFileSync(join(outA, f), "utf8")).toBe(
      readFileSync(join(outB, f), "utf8"),
    )
})

test("threeRolesWithBothFilesConsistent", () => {
  const rec = rows(outA, "refine_recipes.csv")
  expect(rec.map((r) => r.role).sort()).toEqual([
    "balanced",
    "high_performing",
    "low_cost",
  ])
  const tol = rows(outA, "refine_tolerance.csv")
  expect(tol.length).toBe(27)
  for (const r of rec)
    for (const v of VARS) expect(r[`tol_lo_${v.id}`]).toBeDefined()
})

test("everyEventIsEmittedWithItsFields", () => {
  const ev = events(logA)
  const by = (n: string) => ev.filter((e) => e.event === n)
  expect(by("refine.gradcheck").length).toBe(9 * 2) // one start set per run, two runs in this log
  for (const e of by("refine.gradcheck")) {
    expect(typeof e.variable).toBe("string")
    expect(e.step_h as number).toBeGreaterThan(0)
    expect(e.rich_diff_rel as number).toBeLessThanOrEqual(cfg.t_grad_rel)
  }
  const starts = by("refine.start.done")
  // 2 balanced + 4 corner vectors x 2 best starts, per run
  expect(starts.length).toBe(2 * (2 + 4 * 2))
  for (const e of starts) {
    for (const k of [
      "start_id",
      "weight_id",
      "iters",
      "f0",
      "f_final",
      "kkt",
      "status",
    ])
      expect(e).toHaveProperty(k)
    expect(e.f_final as number).toBeLessThanOrEqual((e.f0 as number) + 1e-12)
    expect(["converged", "max_iter", "stalled", "infeasible"]).toContain(
      e.status as string,
    )
  }
  expect(by("refine.front.done").length).toBe(2)
  expect(by("refine.front.done")[0]).toHaveProperty("n_dominated_removed")
  expect(by("refine.tolerance.done").length).toBe(2 * 27)
  for (const e of by("refine.tolerance.done"))
    for (const k of ["variable", "tol_lo", "tol_hi", "loss_pct"])
      expect(e).toHaveProperty(k)
  expect(by("refine.screened.best").length).toBe(2)
})

test(
  "activeConstraintIsSolvedNotJustRespected",
  async () => {
    // Mutation M2 (penalty dropped) survived every pipeline test: with the shipped cpvc no constraint is active at the
    // optimum, and the final feasibility restoration alone keeps outputs feasible. With cpvc = 0.2 the PVC constraint
    // m1 <= cpvc is active (m1 wants its upper bound 0.35), so the penalty does real work. Measured once on this
    // data (seed 20261121, 4 starts): m1 = 0.2 and balanced S = 0.11248; without the penalty S = 0.1360. The bound 0.12
    // is that measurement plus about 7 %, frozen here.
    const tight = structuredClone(ctx)
    tight.ranges.cpvc.value = 0.2
    const out = join(tmp("spandek-refcpvc-"), "out")
    await runRefine(
      tight,
      shortlistFromPareto(loadPlan3(plan3).pareto),
      SEED,
      plan3,
      { out, cfg, workers: 2, ...OPTS },
    )
    const balanced = rows(out, "refine_recipes.csv").find(
      (r) => r.role === "balanced",
    ) as Record<string, string>
    expect(num(balanced, "m1")).toBeGreaterThan(0.2 - 1e-6)
    expect(num(balanced, "m1")).toBeLessThanOrEqual(0.2 + 1e-9)
    expect(num(balanced, "S")).toBeLessThan(0.12)
  },
  LONG,
)

test(
  "delaminationCapActiveIsSolvedNotJustRespected",
  () => {
    // H6 on the third constraint. The shipped objectives never push the topcoat toward the cap (measured: r_solar_pred, t_max_pred,
    // corrosion_proxy and cost_proxy are flat or worse with a thicker topcoat, delamination itself wants it thin), so a scalarised
    // solve under any weight vector leaves a flat direction and where it ends is decided by last-place noise: the earlier probe
    // (weights 0.1/0.1/0.8) ended at the cap on macOS arm64 with status "stalled" (f 0.07667) and in the interior (c -0.108, f 0.07625,
    // a better point) on Linux x86-64, and a 1e-16 relative change of the normalisation flipped it on macOS too (docs/testing.md).
    // Here the cap is the only thing that stops the solver: the REAL constraints (stackProps, delaminationProxy, h_c0_top 7 um)
    // with an objective that strictly prefers a thicker topcoat (f = 1 - t2). The optimum is unique and on the cap; measured c = +1e-9
    // (the feasibility tolerance) from starts 0, 0.2 and 0.5 on macOS, and a 1e-12 relative change of h_c0 moves t2 by 1e-10 only.
    const tight = structuredClone(ctx)
    tight.mat.barrier.h_c0_top_um.value = DELAM_PROBE_H_C0
    const results = parseResultsCsv(
      readFileSync(join(plan3, "results.csv"), "utf8"),
    )
    const model = makeModel(
      tight,
      weatherL9(tight.weather),
      normaliseObjectives(results),
      tight.ranges.cpvc.value,
      tight.ranges.max_total_dft_um.value,
      tight.mat,
    )
    const T2 = VARS.findIndex((v) => v.id === "t2")
    const hs = VARS.map((v) => v.h)
    const f = (u: Float64Array) => 1 - (u[T2] as number)
    const g = (u: Float64Array) => gradient(f, u, hs)
    const cons = ([0, 1, 2] as const).map(
      (j) => (u: Float64Array) => model.constraint(u, j),
    )
    for (const start of [0.5, 0.2]) {
      const o = minimise(f, g, new Float64Array(VARS.length).fill(start), cons)
      const d = model.delam(o.u)
      const c = model.constraint(o.u, 2)
      console.log(
        `delam-active case (start ${start}): delam_proxy ${d}, constraint ${c}, t2 ${o.u[T2]}`,
      )
      expect(o.status).toBe("converged")
      expect(model.maxViolation(o.u)).toBeLessThanOrEqual(1e-9)
      expect(c).toBeLessThanOrEqual(1e-9)
      expect(c).toBeGreaterThan(-DELAM_ACTIVE_TOL)
      // an interior topcoat (not on a box bound): the cap, not the box, stopped it
      expect(o.u[T2]).toBeGreaterThan(0.1)
      expect(o.u[T2]).toBeLessThan(0.9)
    }
  },
  LONG,
)

test("gradcheckFailsOnAKinkWithExit4AndPassesOnASmoothFunction", () => {
  const h = VARS.map((v) => v.h)
  const ids = VARS.map((v) => v.id)
  const u = new Float64Array(VARS.length).fill(0.5)
  expect(() =>
    gradcheckOrThrow((x) => (x[3] as number) ** 2, u, h, ids, 1e-5),
  ).not.toThrow()
  try {
    gradcheckOrThrow(
      (x) => Math.abs((x[3] as number) - 0.5 - 7.5e-5),
      u,
      h,
      ids,
      1e-5,
    )
    throw new Error("expected a throw")
  } catch (e) {
    expect(e).toBeInstanceOf(SpandekError)
    expect((e as SpandekError).code).toBe(4)
    expect((e as SpandekError).phase).toBe("refine.gradcheck")
    expect((e as SpandekError).key).toBe("m2")
  }
})

// ---- faults (real edits, real CLI) ----

const refineArgs = (inDir: string, extra: string[] = []) => [
  "refine",
  "--in",
  inDir,
  "--out",
  join(tmp("spandek-refout-"), "out"),
  "--max-load",
  "1000",
  ...extra,
]

test("infeasibleCpvcIsExit3", async () => {
  // F4: cpvc 0.05 is below the lowest PVC 0.10
  const cfgCopy = await copyConfigWith("cpvc.value", 0.05)
  const r = await run(refineArgs(plan3, ["--config-dir", cfgCopy]))
  expect(r.exitCode).toBe(3)
  expect(lastEvent(r, "refine.failed")).toMatchObject({
    phase: "refine.feasible",
    code: 3,
  })
  expect(r.stderr).not.toMatch(/(^|\n)\s+at \S/)
})

test("nanRefractiveIndexIsExit4", async () => {
  // F5: a NaN binder refractive index in a materials copy of the loaded context reaches the model: exit 4, phase refine.model
  const bad = structuredClone(ctx)
  bad.mat.binder.n.value = Number.NaN
  try {
    await runRefine(
      bad,
      shortlistFromPareto(loadPlan3(plan3).pareto),
      SEED,
      plan3,
      {
        out: join(tmp("spandek-refnan-"), "out"),
        cfg,
        ...OPTS,
      },
    )
    throw new Error("expected a throw")
  } catch (e) {
    expect(e).toBeInstanceOf(SpandekError)
    expect((e as SpandekError).code).toBe(4)
  }
  // through the CLI the same edit is caught earlier, by the materials schema (exit 2): pinned so the order stays known
  const fs = await import("node:fs")
  const copy = tmp("spandek-cfgnan-")
  cpSync(cfgDir, copy, { recursive: true })
  const p = join(copy, "materials.yaml")
  const text = fs.readFileSync(p, "utf8")
  fs.writeFileSync(
    p,
    text.replace(/(binder:\s*\n\s*n:\s*\n\s*value:)\s*[\d.]+/, "$1 .nan"),
  )
  expect(fs.readFileSync(p, "utf8")).toContain(".nan")
  const r = await run(refineArgs(plan3, ["--config-dir", copy]))
  expect(r.exitCode).toBe(2)
})

test("missingResultsIsExit5", async () => {
  // F7 (and the other three inputs)
  for (const missing of [
    "results.csv",
    "draws.csv",
    "pareto.csv",
    "run_meta.json",
  ]) {
    const d = tmp("spandek-p3m-")
    for (const f of readdirSync(plan3))
      if (f !== missing) copyFileSync(join(plan3, f), join(d, f))
    const r = await run(refineArgs(d))
    expect(r.exitCode).toBe(5)
  }
})

test("timeLimitIsExit6", async () => {
  // F8
  const r = await run(refineArgs(plan3, ["--time-limit-s", "0.001"]))
  expect(r.exitCode).toBe(6)
  expect(lastEvent(r, "resource.timeout")).toMatchObject({ command: "refine" })
})

test("configFaultsAreExit2", async () => {
  expect((await run(refineArgs(plan3, ["--starts", "0"]))).exitCode).toBe(2) // F3
  const ind = await run(refineArgs(plan3, ["--scenarios", "indonesia"]))
  expect(ind.exitCode).toBe(2)
  expect(
    events(ind).some(
      (e) => e.event === "error.raised" && e.key === "scenarios",
    ),
  ).toBe(true)
  expect((await run(refineArgs(plan3, ["--scenarios", "mars"]))).exitCode).toBe(
    2,
  )
})

test("loadPlan3ReadsTheSeedAndTheFourFiles", () => {
  const p = loadPlan3(plan3)
  expect(p.seed).toBe(SEED)
  expect(p.results.length).toBe(96 * 9)
  expect(p.pareto.length).toBe(96)
})
