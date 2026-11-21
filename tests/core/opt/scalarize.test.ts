import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"
import { InfeasibleError } from "../../../src/core/errors"
import {
  BETA,
  chebyshev,
  normalised,
  normaliseObjectives,
  OBJECTIVE_NAMES,
  RHO,
  trueChebyshev,
} from "../../../src/core/opt/scalarize"
import { OBJECTIVES } from "../../../src/core/pipeline/optimize"
import type { ResultRow } from "../../../src/core/schema"
import { repoRoot } from "../../helpers"

const cfg = parse(
  readFileSync(join(repoRoot, "configs", "optimize.yaml"), "utf8"),
)

test("objectivesAreTheFivePlan3Names", () => {
  expect(OBJECTIVE_NAMES).toEqual([
    "r_solar_pred",
    "t_max_pred",
    "corrosion_proxy",
    "delam_proxy",
    "cost_proxy",
  ])
  expect(OBJECTIVE_NAMES).toEqual(OBJECTIVES.map(([c]) => c))
  for (const w of [
    ...Object.values(cfg.weights),
    ...Object.values(cfg.profiles),
  ])
    expect(Object.keys(w as object).sort()).toEqual([...OBJECTIVE_NAMES].sort())
  expect(cfg.scalarisation).toEqual({ beta: BETA, rho: RHO })
})

test("chebyshevHandComputed", () => {
  // g = (0.2, 0.5), w = (0.5, 0.5), beta 20, rho 0.05:
  // wg = (0.1, 0.25); lse = ln(e^2 + e^5)/20 = 0.25 + ln(1 + e^-3)/20; plus 0.05 * 0.35
  const expected = 0.25 + Math.log(1 + Math.exp(-3)) / 20 + 0.05 * 0.35
  expect(chebyshev([0.2, 0.5], [0.5, 0.5])).toBeCloseTo(expected, 14)
  expect(expected).toBeCloseTo(0.269929, 5)
  // rho = 0: pure log-sum-exp
  expect(chebyshev([0.2, 0.5], [0.5, 0.5], 0)).toBeCloseTo(
    0.25 + Math.log(1 + Math.exp(-3)) / 20,
    14,
  )
  // single objective: (1/beta) ln e^(beta w g) = w g
  expect(chebyshev([0.8], [1], 0)).toBeCloseTo(0.8, 14)
})

test("smoothFormIsWithinLnNOverBetaOfTrueChebyshev", () => {
  const g = [0.1, 0.9, 0.4, 0.0, 0.7]
  const w = [0.2, 0.2, 0.2, 0.2, 0.2]
  const s = chebyshev(g, w, 0)
  const m = trueChebyshev(g, w)
  expect(m).toBeCloseTo(0.18, 14)
  expect(s).toBeGreaterThanOrEqual(m)
  expect(s - m).toBeLessThanOrEqual(Math.log(5) / BETA + 1e-12)
})

test("chebyshevIsStableForLargeArguments", () => {
  const v = chebyshev([1e6, 0], [1, 1], 0)
  expect(Number.isFinite(v)).toBe(true)
  expect(v).toBeCloseTo(1e6, 6)
})

test("chebyshevIsC1MonotoneInEachObjective", () => {
  const w = [0.3, 0.7]
  const f = (a: number) => chebyshev([a, 0.4], w)
  const h = 1e-6
  const d = (f(0.5 + h) - f(0.5 - h)) / (2 * h)
  expect(d).toBeGreaterThan(0)
  expect(f(0.6)).toBeGreaterThan(f(0.5))
})

test("chebyshevRejectsLengthMismatch", () => {
  expect(() => chebyshev([1, 2], [1])).toThrow(RangeError)
})

function row(
  id: string,
  scen: string,
  feasible: boolean,
  v: number[],
): ResultRow {
  const r: Record<string, unknown> = {
    candidate_id: id,
    scenario_id: scen,
    feasible,
  }
  OBJECTIVE_NAMES.forEach((n, i) => {
    r[n] = v[i]
  })
  return r as unknown as ResultRow
}

test("normaliseObjectivesUsesFeasibleRowsOnly", () => {
  const rows = [
    row("SP-001", "W1", true, [0.6, 50, 0.1, 0.2, 0.3]),
    row("SP-001", "W2", true, [0.7, 60, 0.1, 0.2, 0.3]),
    row("SP-002", "W1", true, [0.8, 70, 0.4, 0.6, 0.9]),
    row("SP-003", "W1", false, [0.99, 999, 9, 9, 9]), // infeasible: ignored
  ]
  const n = normaliseObjectives(rows)
  expect(n.lo).toEqual([0.6, 50, 0.1, 0.2, 0.3])
  expect(n.hi).toEqual([0.8, 70, 0.4, 0.6, 0.9])
})

test("normaliseObjectivesRejectsNoFeasibleRowsAndDegenerateRange", () => {
  expect(() =>
    normaliseObjectives([row("SP-001", "W1", false, [1, 1, 1, 1, 1])]),
  ).toThrow(InfeasibleError)
  expect(() =>
    normaliseObjectives([
      row("SP-001", "W1", true, [0.6, 50, 0.1, 0.2, 0.3]),
      row("SP-002", "W1", true, [0.6, 60, 0.2, 0.3, 0.4]),
    ]),
  ).toThrow(InfeasibleError)
})

test("maximisedObjectivesFlipped", () => {
  const norm = { lo: [0.5, 40, 0, 0, 0], hi: [0.9, 80, 1, 1, 1] }
  // r_solar is the only maximised objective: best (0.9) maps to 0, worst (0.5) to 1
  expect(normalised([0.9, 40, 0, 0, 0], norm)).toEqual([0, 0, 0, 0, 0])
  expect(normalised([0.5, 80, 1, 1, 1], norm)).toEqual([1, 1, 1, 1, 1])
  const mid = normalised([0.7, 60, 0.5, 0.5, 0.5], norm)
  for (const g of mid) expect(g).toBeCloseTo(0.5, 14)
  // a higher reflectance lowers g_0; a higher t_max raises g_1
  expect((normalised([0.8, 60, 0.5, 0.5, 0.5], norm)[0] as number) < 0.5).toBe(
    true,
  )
  expect((normalised([0.7, 70, 0.5, 0.5, 0.5], norm)[1] as number) > 0.5).toBe(
    true,
  )
  expect(OBJECTIVES.map(([, s]) => s)).toEqual([
    "max",
    "min",
    "min",
    "min",
    "min",
  ])
})
