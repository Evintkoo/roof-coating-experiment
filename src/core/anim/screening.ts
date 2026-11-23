// Task list and ordered merge for the 96 x 9 screening (plan 07 D4): results are placed by
// task index, never by arrival, so the output cannot depend on worker count or timing.
import type { Scenario } from "../design"
import { ConfigError } from "../errors"
import type { ModelContext } from "../pipeline/context"
import {
  CONTROL_LAYERS,
  type StackProps,
  stackProps,
  thermalOutcomes,
} from "../pipeline/stackProps"
import { drawMaterials, widenInterval } from "../pipeline/uncertainty"
import { deriveSeed } from "../rng"
import {
  DESIGN_COLUMNS,
  type FlaggedDesignRow,
  type ResultRow,
} from "../schema"

export type ScreeningTask = {
  readonly index: number
  readonly candidate: number
  readonly scenario: number
}

/** Row-major: index = candidate * nScenarios + scenario. */
export function screeningTasks(
  nCandidates: number,
  nScenarios: number,
): ScreeningTask[] {
  for (const n of [nCandidates, nScenarios])
    if (!Number.isInteger(n) || n < 0)
      throw new ConfigError("screening", "sizes must be non-negative integers")
  const out: ScreeningTask[] = []
  for (let c = 0; c < nCandidates; c++)
    for (let s = 0; s < nScenarios; s++)
      out.push({ index: c * nScenarios + s, candidate: c, scenario: s })
  return out
}

/** Place each part at its index; throws on an out-of-range, missing or duplicate index. */
export function mergeOrdered<T>(
  parts: readonly { index: number; value: T }[],
  n: number,
): T[] {
  const out = new Array<T>(n)
  const seen = new Uint8Array(n)
  for (const p of parts) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index >= n)
      throw new ConfigError("merge", `index ${p.index} outside 0..${n - 1}`)
    if (seen[p.index] === 1)
      throw new ConfigError("merge", `duplicate index ${p.index}`)
    seen[p.index] = 1
    out[p.index] = p.value
  }
  for (let i = 0; i < n; i++)
    if (seen[i] !== 1) throw new ConfigError("merge", `missing index ${i}`)
  return out
}

// ---- page data and the evaluator shared by the batch check, the worker and the inline lane (plan 07 Task 4, spike Q5) ----

/** Draws per cell in the optional "with uncertainty" screening (spike option b); same stream as the live simulator. */
export const SCREEN_DRAWS = 32
export const SCREEN_SEED = 20261121

type NumCol = Exclude<(typeof DESIGN_COLUMNS)[number], "candidate_id">
const NUM_COLS = DESIGN_COLUMNS.filter((c) => c !== "candidate_id") as NumCol[]

/** What the report embeds for the screening: designs, scenarios and the batch nominal values (the H7 reference). */
export type ScreeningData = {
  candidates: string[]
  cols: string[]
  designs: number[][]
  scenarios: Scenario[]
  /** per task index: [r_solar, t_max_c, q_in_mean_w_m2] from the batch results.csv. */
  nominal: [number, number, number][]
}

/** Nominal [r, t, q] and, when draws are on, the p5 to p95 band of t_max widened to the nominal. */
export type ScreenValue =
  | readonly [number, number, number]
  | readonly [number, number, number, number, number]

/** Row-major results (candidate-major, scenario-minor, the batch order) become the page data; anything else is refused. */
export function buildScreeningData(
  results: readonly ResultRow[],
  scenarios: readonly Scenario[],
): ScreeningData {
  const nS = scenarios.length
  if (nS === 0 || results.length === 0 || results.length % nS !== 0)
    throw new ConfigError("screening", "results do not tile the scenarios")
  const candidates: string[] = []
  const designs: number[][] = []
  const nominal: [number, number, number][] = []
  results.forEach((r, i) => {
    const s = scenarios[i % nS] as Scenario
    if (r.scenario_id !== s.scenario_id)
      throw new ConfigError(
        "screening",
        `row ${i} is not scenario ${s.scenario_id}`,
      )
    if (i % nS === 0) {
      candidates.push(r.candidate_id)
      designs.push(NUM_COLS.map((c) => r[c]))
    } else if (r.candidate_id !== candidates[candidates.length - 1])
      throw new ConfigError(
        "screening",
        `row ${i} breaks candidate-major order`,
      )
    nominal.push([r.r_solar_pred, r.t_max_pred, r.q_in_mean_w_m2])
  })
  return {
    candidates,
    cols: [...NUM_COLS],
    designs,
    scenarios: [...scenarios],
    nominal,
  }
}

export function designsOf(d: ScreeningData): FlaggedDesignRow[] {
  return d.designs.map((row, i) => {
    const o: Record<string, unknown> = {
      candidate_id: d.candidates[i],
      feasible: true,
      violations: "",
    }
    d.cols.forEach((c, k) => {
      o[c] = row[k]
    })
    return o as FlaggedDesignRow
  })
}

/**
 * Evaluate tasks through the same pure functions as the batch (stackProps with the C4 layers, thermalOutcomes). With `nDraws` the
 * material draws are the live simulator's stream; the nominal values do not depend on it. Tasks of one candidate share their
 * stackProps, so a chunk of one candidate is the cheap unit (spike Q1).
 */
export function screenChunk(
  ctx: ModelContext,
  designs: readonly FlaggedDesignRow[],
  scenarios: readonly Scenario[],
  tasks: readonly { index: number; candidate: number; scenario: number }[],
  nDraws: number | null,
): { index: number; value: ScreenValue }[] {
  const mats =
    nDraws === null
      ? []
      : drawMaterials(ctx.mat, nDraws, deriveSeed(SCREEN_SEED, 100))
  let cand = -1
  let props: StackProps[] = []
  return tasks.map((t) => {
    if (cand !== t.candidate) {
      const d = designs[t.candidate] as FlaggedDesignRow
      props = [
        stackProps(d, CONTROL_LAYERS.C4, ctx),
        ...mats.map((m) => stackProps(d, CONTROL_LAYERS.C4, ctx, m)),
      ]
      cand = t.candidate
    }
    const s = scenarios[t.scenario] as Scenario
    const outs = thermalOutcomes(
      props.map((sp) => ({ sp, s })),
      ctx,
    )
    const n = outs[0]
    if (n === undefined) throw new ConfigError("screening", "no outcome")
    if (nDraws === null)
      return {
        index: t.index,
        value: [n.r_solar, n.t_max_c, n.q_in_mean_w_m2] as const,
      }
    const w = widenInterval(
      n.t_max_c,
      Float64Array.from(outs.slice(1), (o) => o.t_max_c),
    )
    return {
      index: t.index,
      value: [n.r_solar, n.t_max_c, n.q_in_mean_w_m2, w.lo, w.hi] as const,
    }
  })
}
