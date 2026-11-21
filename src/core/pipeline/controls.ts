import type { Scenario } from "../design"
import { ConfigError } from "../errors"
import type { FlaggedDesignRow } from "../schema"
import type { ModelContext } from "./context"
import {
  CONTROL_LAYERS,
  evaluateC1,
  type Layers,
  type Outcome,
  stackProps,
  thermalOutcomes,
  unmodelledColumns,
} from "./stackProps"
import type { ControlRow } from "./tables"

export type Decision = "go" | "revise" | "reject"

/** T_go_pareto_freq and T_delam_max (plan 03 thresholds). */
export const T_GO_PARETO_FREQ = 0.5
export const T_DELAM_MAX = 0.5

/**
 * D6. reject: infeasible, or the upper bound of r_solar is below the substrate's (initial values; aged values are plan 4).
 * go: pareto_freq >= 0.5, mean predicted r_solar above C1's and delam_proxy <= 0.5. Otherwise revise.
 * "go" means worth a coupon test, never "works". A NaN never satisfies a comparison, so it can reject or revise but never promote.
 */
export function decide(
  row: {
    feasible: boolean
    r_solar_hi: number
    pareto_freq: number
    r_solar_pred_mean: number
    delam_proxy: number
  },
  c1RSolar: number,
  substrateRSolar: number,
): Decision {
  if (!row.feasible || row.r_solar_hi < substrateRSolar) return "reject"
  if (
    row.pareto_freq >= T_GO_PARETO_FREQ &&
    row.r_solar_pred_mean > c1RSolar &&
    row.delam_proxy <= T_DELAM_MAX
  )
    return "go"
  return "revise"
}

function toRow(
  control_id: string,
  for_candidate: string,
  scenario_id: string,
  o: Outcome,
  layers: Layers,
  isC1: boolean,
): ControlRow {
  return {
    control_id,
    for_candidate,
    scenario_id,
    r_solar_pred: o.r_solar,
    t_max_pred: o.t_max_c,
    q_in_mean_w_m2: o.q_in_mean_w_m2,
    corrosion_proxy: o.corrosion_risk,
    wetting_proxy: o.wetting_score,
    wetting_theta_pred: o.wetting_theta_deg,
    delam_proxy: o.delam_proxy,
    cost_proxy: o.cost_proxy,
    gel_time_rel: o.gel_time_rel,
    unmodelled: unmodelledColumns(layers, isC1).join(";"),
  }
}

const idCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * D2 controls, nominal only (no intervals), one row per scenario (day-2 thermal outcomes depend on the weather):
 * C0 bare substrate and C1 datasheet (for_candidate "-"), C2 (primer + midcoat) and C3 (midcoat + topcoat) for each
 * shortlisted candidate. C4 is the candidate itself and is not repeated. Order: control, candidate id, scenario id.
 */
export function buildControls(
  shortlist: Record<string, string>,
  design: readonly FlaggedDesignRow[],
  weather: readonly Scenario[],
  ctx: ModelContext,
): ControlRow[] {
  const ids = [...new Set(Object.values(shortlist))].sort(idCmp)
  const byId = new Map(design.map((r) => [r.candidate_id, r]))
  const cands = ids.map((id) => {
    const c = byId.get(id)
    if (c === undefined)
      throw new ConfigError("shortlist", `${id} is not in the design`)
    if (!c.feasible) throw new ConfigError("shortlist", `${id} is infeasible`)
    return c
  })
  const scens = [...weather].sort((a, b) => idCmp(a.scenario_id, b.scenario_id))
  const rows: ControlRow[] = []
  const stack = (c: FlaggedDesignRow, layers: Layers) =>
    stackProps(c, layers, ctx)
  // C0 ignores every layer dimension, any candidate row serves as the (unused) input
  const sp0 = stack(cands[0] as FlaggedDesignRow, CONTROL_LAYERS.C0)
  const o0 = thermalOutcomes(
    scens.map((s) => ({ sp: sp0, s })),
    ctx,
  )
  for (const [i, s] of scens.entries())
    rows.push(
      toRow(
        "C0",
        "-",
        s.scenario_id,
        o0[i] as Outcome,
        CONTROL_LAYERS.C0,
        false,
      ),
    )
  for (const s of scens)
    rows.push(
      toRow(
        "C1",
        "-",
        s.scenario_id,
        evaluateC1(s, ctx),
        CONTROL_LAYERS.C0,
        true,
      ),
    )
  for (const id of ["C2", "C3"] as const)
    for (const c of cands) {
      const layers = CONTROL_LAYERS[id]
      const sp = stack(c, layers)
      const o = thermalOutcomes(
        scens.map((s) => ({ sp, s })),
        ctx,
      )
      for (const [i, s] of scens.entries())
        rows.push(
          toRow(
            id,
            c.candidate_id,
            s.scenario_id,
            o[i] as Outcome,
            layers,
            false,
          ),
        )
    }
  return rows
}
