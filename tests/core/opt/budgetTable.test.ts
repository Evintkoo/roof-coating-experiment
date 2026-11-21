import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import fc from "fast-check"
import { SpandekError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import {
  type BudgetEntry,
  type BudgetTable,
  buildBudgetTable,
  type EntryEval,
  kneeBudget,
  levelBudget,
  lookupBudget,
  T_REPAIR,
} from "../../../src/core/opt/budgetTable"
import type { OptResult } from "../../../src/core/opt/projectedBfgs"
import { repoRoot } from "../../helpers"

const C_MIN = 0.3
const C_MAX = 0.5
const N = 100

/** A synthetic one-variable problem: u = [cost], scalar = (1 - t)^2 with t the share of the cost range spent. */
const scalarOf = (cost: number) => ((C_MAX - cost) / (C_MAX - C_MIN)) ** 2
const evalEntry = (u: Float64Array): EntryEval => ({
  cost: u[0] as number,
  x: [u[0] as number],
  objectives: [0, 0, 0, 0, u[0] as number],
  lo: [0, 0, 0, 0, 0],
  hi: [1, 1, 1, 1, 1],
  scalar: scalarOf(u[0] as number),
})
const result = (cost: number): OptResult => ({
  u: Float64Array.of(cost),
  f: scalarOf(cost),
  iters: 1,
  kkt: 0,
  status: "converged",
  trace: [scalarOf(cost)],
  rounds: [],
  maxViolation: 0,
})
/** A solver that spends the whole budget, except at the levels in `bad`, where it returns a worse point (cost lower by 40 %). */
const solver =
  (bad: ReadonlySet<number> = new Set()) =>
  (budget: number) => {
    const k = Math.round(((budget - C_MIN) / (C_MAX - C_MIN)) * (N - 1))
    return result(bad.has(k) ? C_MIN + 0.6 * (budget - C_MIN) : budget)
  }
const build = (bad?: ReadonlySet<number>): BudgetTable =>
  buildBudgetTable("balanced", solver(bad), evalEntry, C_MIN, C_MAX, N)

const good = build()

/** The definition in FR-10, by a plain scan. */
function bruteForce(t: BudgetTable, b: number): BudgetEntry | undefined {
  let hit: BudgetEntry | undefined
  for (const e of t.entries) if (e.budget <= b) hit = e
  return hit
}

test("levelsRunFromCMinToCMaxInclusive", () => {
  expect(good.entries.length).toBe(N)
  expect(levelBudget(C_MIN, C_MAX, 0, N)).toBe(C_MIN)
  expect(levelBudget(C_MIN, C_MAX, N - 1, N)).toBe(C_MAX)
  expect(good.entries[1]?.budget).toBeCloseTo(C_MIN + (C_MAX - C_MIN) / 99, 15)
  expect(good.c_min).toBe(C_MIN)
  expect(good.c_max).toBe(C_MAX)
  expect(good.cost_unit).toBe("relative")
})

test("lookupIsLargestBudgetNotAbove", () => {
  // exactly on a level, just below it, between levels, and above c_max
  for (const e of good.entries) {
    const on = lookupBudget(good, e.budget)
    expect(on.status === "ok" && on.entry.level).toBe(e.level)
  }
  const e5 = good.entries[5] as BudgetEntry
  const e6 = good.entries[6] as BudgetEntry
  const mid = lookupBudget(good, 0.5 * (e5.budget + e6.budget))
  expect(mid.status === "ok" && mid.entry.level).toBe(5)
  if (mid.status === "ok")
    expect(mid.headroom).toBeCloseTo(
      0.5 * (e5.budget + e6.budget) - e5.cost,
      15,
    )
  const below = lookupBudget(good, e6.budget - 1e-12)
  expect(below.status === "ok" && below.entry.level).toBe(5)
  const above = lookupBudget(good, 10)
  expect(above.status === "ok" && above.entry.level).toBe(N - 1)
  // exact content, never interpolated: the returned object is the stored entry
  expect(above.status === "ok" ? above.entry : null).toBe(
    good.entries[N - 1] as BudgetEntry,
  )
})

test("lookupNeverExceedsBudget", () => {
  // H14: 1000 random budgets in [0, 1.1 c_max]. fc.double alone is biased toward 0 and special values and rarely lands
  // between two levels (the mutant M4 survived it), so the budgets are drawn uniformly on a fine grid as well.
  const check = (b: number) => {
    const r = lookupBudget(good, b)
    if (r.status === "ok") {
      expect(r.entry.cost).toBeLessThanOrEqual(b + 1e-12)
      expect(r.entry).toBe(bruteForce(good, b) as BudgetEntry)
      expect(r.headroom).toBeGreaterThanOrEqual(-1e-12)
    } else {
      expect(b).toBeLessThan(good.c_min)
      expect(r.c_min).toBe(good.c_min)
    }
  }
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 1.1 * good.c_max, noNaN: true }),
      check,
    ),
    { numRuns: 1000 },
  )
  fc.assert(
    fc.property(
      fc
        .integer({ min: 0, max: 1_000_000 })
        .map((i) => (1.1 * good.c_max * i) / 1e6),
      check,
    ),
    { numRuns: 1000 },
  )
})

test("belowCMinIsInfeasible", () => {
  // F10 (library level): below c_min the answer is infeasible with c_min, never a nearby entry
  for (const b of [0, 0.1, C_MIN - 1e-9, C_MIN - 1e-15]) {
    const r = lookupBudget(good, b)
    expect(r).toEqual({ status: "infeasible", c_min: C_MIN })
  }
  expect(lookupBudget(good, C_MIN).status).toBe("ok")
  expect(lookupBudget(good, Number.NaN).status).toBe("infeasible")
})

test("tableMonotoneAfterRepair", () => {
  // H15: a solver that returns worse points at four levels; the repair keeps the previous recipe, flags it, and the
  // scalar never increases. Without the repair the same solver gives an increase (the mutation M5 is exactly that).
  const bad = new Set([20, 40, 60, 80])
  const t = build(bad)
  for (let k = 1; k < t.entries.length; k++)
    expect((t.entries[k] as BudgetEntry).scalar).toBeLessThanOrEqual(
      (t.entries[k - 1] as BudgetEntry).scalar + 1e-12,
    )
  expect(t.entries.filter((e) => e.repaired).map((e) => e.level)).toEqual([
    20, 40, 60, 80,
  ])
  const k = 40
  expect((t.entries[k] as BudgetEntry).x).toEqual(
    (t.entries[k - 1] as BudgetEntry).x,
  )
  expect((t.entries[k] as BudgetEntry).budget).toBeGreaterThan(
    (t.entries[k - 1] as BudgetEntry).budget,
  )
  // the raw solver output really was worse there, so a table that kept it would not be monotone
  const raw = bad.has(k)
    ? evalEntry(solver(bad)(levelBudget(C_MIN, C_MAX, k, N)).u)
    : null
  expect(raw?.scalar).toBeGreaterThan((t.entries[k - 1] as BudgetEntry).scalar)
  // the next level continues from the repaired recipe
  expect((t.entries[k + 1] as BudgetEntry).repaired).toBe(false)
})

test("repairCountCapped", () => {
  // H15 / T_repair: 5 repairs of 100 are allowed, 6 fail the build with exit 4 (phase budget.build)
  expect(T_REPAIR).toBe(0.05)
  const five = build(new Set([10, 30, 50, 70, 90]))
  expect(five.entries.filter((e) => e.repaired).length / N).toBeLessThanOrEqual(
    T_REPAIR,
  )
  try {
    build(new Set([10, 30, 50, 70, 90, 95]))
    throw new Error("expected a throw")
  } catch (e) {
    expect(e).toBeInstanceOf(SpandekError)
    expect((e as SpandekError).code).toBe(4)
    expect((e as SpandekError).phase).toBe("budget.build")
    expect((e as SpandekError).key).toBe("repairs")
  }
})

test("costAboveBudgetIsNeverKept", () => {
  // the post-condition cost <= budget is checked before an entry is stored: an over-budget point is replaced
  const over = (budget: number) =>
    result(budget > 0.4 && budget < 0.41 ? budget + 1e-6 : budget)
  const t = buildBudgetTable("balanced", over, evalEntry, C_MIN, C_MAX, N)
  expect(t.entries.every((e) => e.cost <= e.budget)).toBe(true)
  expect(t.entries.some((e) => e.repaired)).toBe(true)
  // at level 0 there is nothing to fall back on
  expect(() =>
    buildBudgetTable(
      "balanced",
      () => result(C_MIN + 1e-6),
      evalEntry,
      C_MIN,
      C_MAX,
      N,
    ),
  ).toThrow(SpandekError)
})

test("buildRejectsADegenerateRange", () => {
  expect(() => buildBudgetTable("p", solver(), evalEntry, 0.5, 0.5, N)).toThrow(
    SpandekError,
  )
  expect(() => buildBudgetTable("p", solver(), evalEntry, 0.3, 0.5, 1)).toThrow(
    SpandekError,
  )
})

test("budgetIsSpentWhenBinding", () => {
  // H16 on the synthetic problem (the real-model proof is in budget.baseline.test.ts): for every non-repaired entry
  // below c_max the cost equals the budget within 1e-4 relative
  for (const e of good.entries.slice(0, -1))
    expect(Math.abs(e.cost - e.budget) / e.budget).toBeLessThan(1e-4)
})

test("kneeHandComputed", () => {
  // D13: scalar = (1 - t)^2 at t = k/10; 95 % of the improvement 1 -> 0 means scalar <= 0.05, i.e. t >= 1 - sqrt(0.05)
  // = 0.7764, so the first level is k = 8 (scalar 0.04); k = 7 has 0.09
  const entries: BudgetEntry[] = Array.from({ length: 11 }, (_, k) => ({
    level: k,
    budget: 1 + k,
    cost: 1 + k,
    x: [],
    objectives: [],
    lo: [],
    hi: [],
    scalar: (1 - k / 10) ** 2,
    repaired: false,
  }))
  expect(kneeBudget(entries)).toBe(9)
  // a linear curve reaches 95 % at the 95 % level
  const lin = entries.map((e, k) => ({ ...e, scalar: 1 - k / 10 }))
  expect(kneeBudget(lin)).toBe(11) // level 10 (scalar 0 <= 0.05; level 9 has 0.1)
  // a flat curve has its knee at c_min
  expect(kneeBudget(entries.map((e) => ({ ...e, scalar: 0.3 })))).toBe(1)
  // and the built table carries it
  expect(good.knee_budget).toBe(kneeBudget(good.entries))
  expect(() => kneeBudget([])).toThrow(RangeError)
})

test("buildEmitsTheBudgetDoneEvent", () => {
  const seen: Record<string, string | number | boolean>[] = []
  setEventSink((event, level, fields) => {
    if (event === "refine.budget.done") {
      expect(level).toBe("info")
      seen.push(fields)
    }
  })
  try {
    build()
  } finally {
    setEventSink(null)
  }
  expect(seen.length).toBe(1)
  expect(seen[0]).toMatchObject({
    profile: "balanced",
    n_levels: N,
    cmin: C_MIN,
    cmax: C_MAX,
    knee_budget: good.knee_budget,
  })
})

test("blockedRegisterHasBlocked11AndUniqueIds", () => {
  const text = readFileSync(join(repoRoot, "docs", "BLOCKED.md"), "utf8")
  const ids = [...text.matchAll(/^## (BLOCKED-\d+):/gm)].map((m) => m[1])
  expect(ids).toContain("BLOCKED-11")
  expect(new Set(ids).size).toBe(ids.length)
  const section = text.split("## BLOCKED-11:")[1] ?? ""
  expect(section).toMatch(/Owner: Evint/)
  expect(section).toMatch(/Unblock condition:/)
  expect(section).toMatch(/density/i)
})
