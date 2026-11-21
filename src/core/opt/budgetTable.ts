import { SpandekError } from "../errors"
import { emitEvent } from "../events"
import type { OptResult } from "./projectedBfgs"

/**
 * Plan 05 FR-9..FR-13: the precomputed performance-price frontier of one priority profile. Pure: the solver and the model
 * evaluation come in as callbacks, so the table logic (levels, continuation, post-condition, monotone repair, knee,
 * exact lookup) is tested without a model.
 */
export type BudgetEntry = {
  level: number
  budget: number
  /** cost_proxy of the recipe; always <= budget (the hard post-condition). */
  cost: number
  /** The recipe in physical units, in VARS order. */
  x: number[]
  /** The five plan-3 objectives of the recipe, nominal, OBJECTIVES order. */
  objectives: number[]
  /** p05 and p95 of the five objectives over the K_b uncertainty draws (FR-12). */
  lo: number[]
  hi: number[]
  /** The profile's Chebyshev scalar (lower is better). */
  scalar: number
  /** True when the solver's point was worse than the previous level and the previous recipe was kept (FR-11). */
  repaired: boolean
}

export type BudgetTable = {
  profile: string
  cost_unit: "relative" | "idr_per_m2"
  c_min: number
  c_max: number
  knee_budget: number
  entries: BudgetEntry[]
}

export type EntryEval = Omit<BudgetEntry, "level" | "budget" | "repaired">

/** T_repair: at most this share of the entries may be repaired, or the build fails. */
export const T_REPAIR = 0.05
/** Slack of the monotone comparison (solver noise below this is not a repair). */
export const MONOTONE_EPS = 1e-12
/** D13: share of the improvement from c_min to c_max that defines the knee. */
export const KNEE_SHARE = 0.95

const fail = (key: string, message: string) =>
  new SpandekError(4, "budget.build", key, message)

/** Budget of level k of n: c_min + (c_max - c_min) k / (n - 1). The last level is exactly c_max. */
export function levelBudget(
  cMin: number,
  cMax: number,
  k: number,
  n: number,
): number {
  return k === n - 1 ? cMax : cMin + ((cMax - cMin) * k) / (n - 1)
}

/**
 * FR-9: one solve per level, upward, each warm-started from the previous level's recipe (continuation). `solve(budget, warm)`
 * receives warm = null at level 0 (the caller knows the minimum-cost point) and must return a feasible OptResult;
 * `evalEntry(u)` evaluates a recipe. The hard post-condition cost <= budget is checked on every entry before it is kept; an
 * entry that violates it, or whose scalar is worse than the previous level's (FR-11), is replaced by the previous recipe
 * (counted as repaired). More than 5 % repaired entries fail the build (exit 4, phase budget.build).
 */
export function buildBudgetTable(
  profile: string,
  solve: (budget: number, warm: Float64Array | null) => OptResult,
  evalEntry: (u: Float64Array) => EntryEval,
  cMin: number,
  cMax: number,
  nLevels: number,
  costUnit: BudgetTable["cost_unit"] = "relative",
): BudgetTable {
  if (!Number.isInteger(nLevels) || nLevels < 2)
    throw fail("n_levels", "a table needs at least 2 levels")
  if (!(Number.isFinite(cMin) && Number.isFinite(cMax) && cMax > cMin))
    throw fail("c_max", `c_max ${cMax} must exceed c_min ${cMin}`)
  const entries: BudgetEntry[] = []
  let prevU: Float64Array | null = null
  let repairs = 0
  for (let k = 0; k < nLevels; k++) {
    const budget = levelBudget(cMin, cMax, k, nLevels)
    const r = solve(budget, prevU)
    const ev = evalEntry(r.u)
    const prev = entries[k - 1]
    const costOk = ev.cost <= budget
    const worse = prev !== undefined && ev.scalar > prev.scalar + MONOTONE_EPS
    if (prev === undefined || prevU === null) {
      if (!costOk)
        throw fail(
          "cost",
          `level 0 recipe costs ${ev.cost}, above its budget ${budget}`,
        )
      entries.push({ level: k, budget, ...ev, repaired: false })
      prevU = Float64Array.from(r.u)
      continue
    }
    if (costOk && !worse) {
      entries.push({ level: k, budget, ...ev, repaired: false })
      prevU = Float64Array.from(r.u)
    } else {
      repairs++
      entries.push({
        level: k,
        budget,
        cost: prev.cost,
        x: [...prev.x],
        objectives: [...prev.objectives],
        lo: [...prev.lo],
        hi: [...prev.hi],
        scalar: prev.scalar,
        repaired: true,
      })
    }
  }
  if (repairs / nLevels > T_REPAIR)
    throw fail(
      "repairs",
      `${repairs} of ${nLevels} entries needed the monotone repair, above ${T_REPAIR * 100} %`,
    )
  const knee = kneeBudget(entries)
  emitEvent("refine.budget.done", "info", {
    profile,
    n_levels: nLevels,
    cmin: cMin,
    cmax: cMax,
    knee_budget: knee,
    repaired: repairs,
  })
  return {
    profile,
    cost_unit: costUnit,
    c_min: cMin,
    c_max: cMax,
    knee_budget: knee,
    entries,
  }
}

/**
 * FR-10: the entry with the largest tabulated budget <= B, plus the unspent headroom B - cost; below the first budget
 * (= c_min) the answer is infeasible with c_min. Never interpolated.
 */
export function lookupBudget(
  t: BudgetTable,
  budget: number,
):
  | { status: "ok"; entry: BudgetEntry; headroom: number }
  | { status: "infeasible"; c_min: number } {
  const first = t.entries[0]
  if (first === undefined || !(budget >= first.budget))
    return { status: "infeasible", c_min: t.c_min }
  let lo = 0
  let hi = t.entries.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((t.entries[mid] as BudgetEntry).budget <= budget) lo = mid
    else hi = mid - 1
  }
  const entry = t.entries[lo] as BudgetEntry
  return { status: "ok", entry, headroom: budget - entry.cost }
}

/**
 * D13: the smallest tabulated budget whose scalar achieves 95 % of the improvement from the first entry (c_min) to the last
 * (c_max). A flat curve has its knee at c_min.
 */
export function kneeBudget(entries: readonly BudgetEntry[]): number {
  const first = entries[0]
  const last = entries[entries.length - 1]
  if (first === undefined || last === undefined)
    throw new RangeError("a table needs entries")
  const improvement = first.scalar - last.scalar
  if (!(improvement > 0)) return first.budget
  const target = first.scalar - KNEE_SHARE * improvement
  const hit = entries.find((e) => e.scalar <= target)
  return (hit ?? last).budget
}
