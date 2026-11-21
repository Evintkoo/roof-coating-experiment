import { beforeAll, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseCsv } from "../../src/core/csv"
import { weatherL9 } from "../../src/core/design"
import { makeModel } from "../../src/core/opt/objective"
import {
  normaliseObjectives,
  OBJECTIVE_NAMES,
} from "../../src/core/opt/scalarize"
import { sobolPoints } from "../../src/core/opt/sobol"
import { toScaled } from "../../src/core/opt/vars"
import { parseResultsCsv } from "../../src/core/schema"
import { loadOptimize } from "../../src/node/config"
import { loadContext } from "../../src/node/context"
import { buildPlan3, lastEvent, repoRoot, run } from "../helpers"
import type { Tier } from "./scale"

export type RefineBaselineScale = {
  tier: Tier
  /** Draws of the plan-3 run feeding refine (plan-3 default 256 in the proof tier). */
  nMc: string
  /** `--starts` (proof tier: the default 20). */
  refineExtra: string[]
  /** refine_meta.json n_solves expected for those starts. */
  nSolves: number
}

export const REFINE_BASELINE_PROOF: RefineBaselineScale = {
  tier: "proof",
  nMc: "256",
  refineExtra: [],
  nSolves: 40,
}

/** Same 96 screened candidates and 4096 Sobol points, fewer draws and starts. */
export const REFINE_BASELINE_FAST: RefineBaselineScale = {
  tier: "fast",
  nMc: "8",
  refineExtra: ["--starts", "4"],
  nSolves: 20,
}

export function refineBaselineSuite(S: RefineBaselineScale): void {
  const LONG = 600_000
  const T_NRT_S = 600
  const cfgDir = join(repoRoot, "configs")
  let out: string
  let plan3Dir: string
  let elapsedS: number
  let r: Awaited<ReturnType<typeof run>>

  beforeAll(async () => {
    const plan3 = mkdtempSync(join(tmpdir(), "spandek-base-p3-"))
    await buildPlan3(plan3, "20261121", S.nMc)
    out = join(mkdtempSync(join(tmpdir(), "spandek-base-ref-")), "out")
    const t0 = performance.now()
    r = await run([
      "refine",
      "--in",
      plan3,
      "--out",
      out,
      "--max-load",
      "1000",
      ...S.refineExtra,
    ])
    elapsedS = (performance.now() - t0) / 1000
    plan3Dir = plan3
  }, LONG)

  test(
    "beatsSobolBaselineAndScreening",
    async () => {
      // H5: the best refined balanced scalar is no worse than the best of the 96 screened candidates and the best of 4096
      // Sobol points (feasible ones, same S, same grades), to 1e-9
      expect(r.exitCode).toBe(0)
      const plan3 = plan3Dir
      const ctx = await loadContext(
        cfgDir,
        join(repoRoot, "data", "literature"),
      )
      const cfg = await loadOptimize(join(cfgDir, "optimize.yaml"))
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
      const w = OBJECTIVE_NAMES.map(
        (n) => (cfg.weights.balanced as Record<string, number>)[n] as number,
      )
      const grades = [
        ctx.mat.tio2.diameter_um.value,
        ctx.mat.baso4.diameter_um.value,
      ]
      const seen = new Set<string>()
      let bestScreened = Number.POSITIVE_INFINITY
      for (const row of results) {
        if (!row.feasible || seen.has(row.candidate_id)) continue
        seen.add(row.candidate_id)
        const u = toScaled([
          row.primer_gptes_molfrac,
          row.primer_dft_um,
          row.midcoat_pvc,
          row.midcoat_tio2_fraction,
          row.midcoat_dft_um,
          row.topcoat_mtes_molfrac,
          row.topcoat_dft_um,
          ...grades,
        ])
        if (model.maxViolation(u) <= 0)
          bestScreened = Math.min(bestScreened, model.scalar(u, w))
      }
      expect(seen.size).toBe(96)
      let bestSobol = Number.POSITIVE_INFINITY
      let nFeasible = 0
      for (const p of sobolPoints(4096, 9, 4242)) {
        const u = Float64Array.from(p)
        if (model.maxViolation(u) > 0) continue
        nFeasible++
        bestSobol = Math.min(bestSobol, model.scalar(u, w))
      }
      expect(nFeasible).toBeGreaterThan(1000)
      const balanced = parseCsv(
        readFileSync(join(out, "refine_recipes.csv"), "utf8"),
      ).find((x) => x.role === "balanced")
      const refined = Number(balanced?.S)
      console.log(
        `H5: refined ${refined}, best screened ${bestScreened}, best of ${nFeasible} feasible Sobol ${bestSobol}`,
      )
      expect(refined).toBeLessThanOrEqual(bestScreened + 1e-9)
      expect(refined).toBeLessThanOrEqual(bestSobol + 1e-9)
    },
    LONG,
  )

  test("refineRuntimeIsWithinTheLimitAndRecorded", () => {
    // H11: the command's own clock (run.complete) and the wall clock are both inside T_nrt
    expect(Number(lastEvent(r, "run.complete").elapsed_ms) / 1000).toBeLessThan(
      T_NRT_S,
    )
    expect(elapsedS).toBeLessThan(T_NRT_S)
    console.log(
      `refine wall time ${elapsedS.toFixed(1)} s (2 workers, ${S.nSolves} solves, 32 draws)`,
    )
  })

  test("fullRunWritesTheFourCsvsAndTheMarker", () => {
    for (const f of [
      "refine_front.csv",
      "refine_recipes.csv",
      "refine_tolerance.csv",
      "refine_robust.csv",
      "refine_meta.json",
    ])
      expect(readFileSync(join(out, f), "utf8").length).toBeGreaterThan(50)
    const meta = JSON.parse(readFileSync(join(out, "refine_meta.json"), "utf8"))
    expect(meta.n_solves).toBe(S.nSolves)
    expect(meta.seed).toBe(20261121)
  })
}
