import { InfeasibleError } from "../errors"
import { emitEvent } from "../events"
import type { ResultRow } from "../schema"
import { OBJECTIVE_COLUMNS, type ParetoRow, ROLES } from "./tables"

type Sense = "min" | "max"
type Role = (typeof ROLES)[number]

/** FR-4: maximise scenario-mean solar reflectance, minimise the other four (same order as the draws.csv columns). */
export const OBJECTIVES: readonly (readonly [string, Sense])[] =
  OBJECTIVE_COLUMNS.map((c) => [c, c === "r_solar_pred" ? "max" : "min"])

export type CandObjectives = {
  candidate_id: string
  values: number[]
  t_max_worst: number
}

const idCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Per feasible candidate (candidate_id order): scenario means of the five objectives and the worst-scenario t_max_pred (D5). */
export function candidateObjectives(
  results: readonly ResultRow[],
): CandObjectives[] {
  const by = new Map<string, ResultRow[]>()
  for (const r of results) {
    if (!r.feasible) continue
    const l = by.get(r.candidate_id)
    if (l) l.push(r)
    else by.set(r.candidate_id, [r])
  }
  return [...by.keys()].sort(idCmp).map((id) => {
    const rows = by.get(id) as ResultRow[]
    const values = OBJECTIVES.map(([c]) => {
      let s = 0
      for (const r of rows) s += r[c as (typeof OBJECTIVE_COLUMNS)[number]]
      return s / rows.length
    })
    return {
      candidate_id: id,
      values,
      t_max_worst: Math.max(...rows.map((r) => r.t_max_pred)),
    }
  })
}

/** True where the row is non-dominated. Ties are both kept; NaN rows are never on the front and never dominate. */
export function paretoFront(
  obj: readonly (readonly number[])[],
  sense: readonly Sense[],
): boolean[] {
  const m = sense.length
  // minimisation form: negate the maximised objectives
  const sign = sense.map((s) => (s === "max" ? -1 : 1))
  const valid = obj.map((r) => r.every((v) => !Number.isNaN(v)))
  const dominates = (a: readonly number[], b: readonly number[]): boolean => {
    let strict = false
    for (let k = 0; k < m; k++) {
      const x = (a[k] as number) * (sign[k] as number)
      const y = (b[k] as number) * (sign[k] as number)
      if (x > y) return false
      if (x < y) strict = true
    }
    return strict
  }
  return obj.map((b, j) => {
    if (!valid[j]) return false
    for (let i = 0; i < obj.length; i++)
      if (i !== j && valid[i] && dominates(obj[i] as number[], b)) return false
    return true
  })
}

/** drawObj is nDraws x nCand x nObj flattened (SimOutput.drawObjectives). Result: fraction of draws in which each candidate is non-dominated. */
export function paretoFrequency(
  drawObj: Float64Array,
  nDraws: number,
  nCand: number,
  sense: readonly Sense[],
): Float64Array {
  const m = sense.length
  if (drawObj.length !== nDraws * nCand * m)
    throw new RangeError("drawObj length must be nDraws * nCand * objectives")
  const freq = new Float64Array(nCand)
  if (nDraws === 0) return freq
  for (let d = 0; d < nDraws; d++) {
    const rows: number[][] = []
    for (let c = 0; c < nCand; c++) {
      const o = (d * nCand + c) * m
      rows.push(Array.from(drawObj.subarray(o, o + m)))
    }
    paretoFront(rows, sense).forEach((on, c) => {
      if (on) freq[c] = (freq[c] as number) + 1
    })
  }
  for (let c = 0; c < nCand; c++) freq[c] = (freq[c] as number) / nDraws
  return freq
}

/**
 * D7 roles. Each role ranks Pareto members first (then the rest, only when a role would otherwise repeat a chosen candidate),
 * ties broken by higher pareto frequency then candidate_id. A role that picks an already-chosen candidate takes its next best.
 */
export function shortlist(
  objs: readonly CandObjectives[],
  freq: Float64Array,
  c1RSolar: number,
): Record<Role, string> {
  if (objs.length < 3)
    throw new InfeasibleError(
      `shortlist needs at least 3 feasible candidates, got ${objs.length}`,
    )
  const sense = OBJECTIVES.map(([, s]) => s)
  const idx = objs
    .map((_, i) => i)
    .sort((a, b) =>
      idCmp(
        (objs[a] as CandObjectives).candidate_id,
        (objs[b] as CandObjectives).candidate_id,
      ),
    )
  const front = paretoFront(
    objs.map((o) => o.values),
    sense,
  )
  const id = (i: number) => (objs[i] as CandObjectives).candidate_id
  const val = (i: number, k: number) =>
    (objs[i] as CandObjectives).values[k] as number
  const fr = (i: number) => freq[i] ?? 0
  const m = sense.length
  const lo = Array.from({ length: m }, (_, k) =>
    Math.min(...objs.map((o) => o.values[k] as number)),
  )
  const hi = Array.from({ length: m }, (_, k) =>
    Math.max(...objs.map((o) => o.values[k] as number)),
  )
  // distance to the utopia point in min-max normalised objectives (0 = best on every objective).
  // The normalisation bounds lo/hi run over ALL feasible candidates, not over the front members only (plan 03 D7: the
  // utopia point is the best of the whole feasible set); only the ranking pool is restricted to front members.
  const dist = (i: number) => {
    let s = 0
    for (let k = 0; k < m; k++) {
      const range = (hi[k] as number) - (lo[k] as number)
      const z =
        range === 0
          ? 0
          : sense[k] === "max"
            ? ((hi[k] as number) - val(i, k)) / range
            : (val(i, k) - (lo[k] as number)) / range
      s += z * z
    }
    return Math.sqrt(s)
  }
  const rank = (
    key: (i: number) => number,
    pool: (i: number) => boolean,
  ): number[] =>
    idx
      .filter(pool)
      .sort((a, b) => key(a) - key(b) || fr(b) - fr(a) || idCmp(id(a), id(b)))
  const members = (i: number) => front[i] as boolean
  const ordered = (
    key: (i: number) => number,
    first: (i: number) => boolean,
  ): number[] => [
    ...rank(key, first),
    ...rank(key, (i) => members(i) && !first(i)),
    ...rank(key, (i) => !members(i) && !first(i)),
  ]
  // r_solar is objective 0 and is maximised; cost is the last objective
  const eligible = (i: number) => members(i) && val(i, 0) > c1RSolar
  const ranked: Record<Role, number[]> = {
    high_performing: ordered((i) => -val(i, 0), members),
    balanced: ordered(dist, members),
    low_cost: ordered((i) => val(i, m - 1), eligible),
  }
  const chosen = new Set<number>()
  const out = {} as Record<Role, string>
  for (const role of ROLES) {
    const pick = (ranked[role] as number[]).find(
      (i) => !chosen.has(i),
    ) as number
    chosen.add(pick)
    out[role] = id(pick)
    if (role === "low_cost" && !eligible(pick))
      emitEvent("shortlist.low_cost_fallback", "warn", {
        candidate_id: id(pick),
        c1_r_solar: c1RSolar,
      })
    emitEvent("shortlist.chosen", "info", { role, candidate_id: id(pick) })
  }
  return out
}

/** pareto.csv rows for the feasible candidates: nominal objectives, front flag, robustness frequency, shortlist role. */
export function buildPareto(
  results: readonly ResultRow[],
  drawObj: Float64Array,
  nDraws: number,
  c1RSolar: number,
): ParetoRow[] {
  const objs = candidateObjectives(results)
  const sense = OBJECTIVES.map(([, s]) => s)
  const front = paretoFront(
    objs.map((o) => o.values),
    sense,
  )
  const freq = paretoFrequency(drawObj, nDraws, objs.length, sense)
  emitEvent("pareto.computed", "info", {
    n_candidates: objs.length,
    n_front: front.filter(Boolean).length,
  })
  const roles = shortlist(objs, freq, c1RSolar)
  const roleOf = new Map<string, Role>(ROLES.map((r) => [roles[r], r] as const))
  return objs.map((o, i) => {
    const v = (k: number) => o.values[k] as number
    return {
      candidate_id: o.candidate_id,
      r_solar_pred: v(0),
      t_max_pred: v(1),
      corrosion_proxy: v(2),
      delam_proxy: v(3),
      cost_proxy: v(4),
      t_max_worst: o.t_max_worst,
      on_front: front[i] as boolean,
      pareto_freq: freq[i] as number,
      role: roleOf.get(o.candidate_id) ?? "",
    }
  })
}
