import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import {
  checkConstraints,
  lhsDesign,
  weatherL9,
} from "../../../src/core/design"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { buildControls, decide } from "../../../src/core/pipeline/controls"
import {
  CONTROL_LAYERS,
  evaluate,
  unmodelledColumns,
} from "../../../src/core/pipeline/stackProps"
import { validateControls } from "../../../src/core/pipeline/tables"
import { loadContext } from "../../../src/node/context"
import { repoRoot } from "../../helpers"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

const design = () => checkConstraints(lhsDesign(10, ctx.ranges, 7), ctx.ranges)
const SHORT = {
  high_performing: "SP-001",
  balanced: "SP-004",
  low_cost: "SP-007",
}

// ---- decide (D6): the table below is the rule, written out independently ----
const base = {
  feasible: true,
  r_solar_hi: 0.9,
  pareto_freq: 0.6,
  r_solar_pred_mean: 0.85,
  delam_proxy: 0.4,
}
test("decideFollowsRuleD6", () => {
  const c1 = 0.8
  const sub = 0.65
  expect(decide(base, c1, sub)).toBe("go")
  expect(decide({ ...base, feasible: false }, c1, sub)).toBe("reject")
  expect(decide({ ...base, r_solar_hi: 0.6 }, c1, sub)).toBe("reject")
  // reject wins over a go-looking row; hi == substrate is not below it
  expect(
    decide({ ...base, r_solar_hi: 0.65, r_solar_pred_mean: 0.6 }, c1, sub),
  ).toBe("revise")
  expect(decide({ ...base, pareto_freq: 0.49 }, c1, sub)).toBe("revise")
  expect(decide({ ...base, pareto_freq: 0.5 }, c1, sub)).toBe("go")
  expect(decide({ ...base, r_solar_pred_mean: 0.8 }, c1, sub)).toBe("revise")
  expect(decide({ ...base, delam_proxy: 0.5 }, c1, sub)).toBe("go")
  expect(decide({ ...base, delam_proxy: 0.51 }, c1, sub)).toBe("revise")
  // NaN never promotes a candidate
  expect(decide({ ...base, delam_proxy: Number.NaN }, c1, sub)).toBe("revise")
  expect(
    decide({ ...base, feasible: false, r_solar_hi: Number.NaN }, c1, sub),
  ).toBe("reject")
})

test("controlsRowsC0C1C2C3", () => {
  const w = weatherL9(ctx.weather)
  const rows = buildControls(SHORT, design(), w, ctx)
  // C0 and C1 once per scenario, C2 and C3 once per shortlisted candidate and scenario
  expect(rows.length).toBe(9 * 2 + 3 * 9 * 2)
  const count = (id: string) => rows.filter((r) => r.control_id === id).length
  expect([count("C0"), count("C1"), count("C2"), count("C3")]).toEqual([
    9, 9, 27, 27,
  ])
  expect(
    new Set(
      rows
        .filter((r) => r.control_id === "C0" || r.control_id === "C1")
        .map((r) => r.for_candidate),
    ),
  ).toEqual(new Set(["-"]))
  expect(
    new Set(
      rows.filter((r) => r.control_id === "C2").map((r) => r.for_candidate),
    ),
  ).toEqual(new Set(Object.values(SHORT)))
  expect(rows.some((r) => r.control_id === "C4")).toBe(false)
  // validator accepts the rows (NaN only where listed) and unmodelled matches the layer set
  expect(validateControls(rows as never).length).toBe(rows.length)
  const un = (id: string) =>
    (rows.find((r) => r.control_id === id) as { unmodelled: string }).unmodelled
  expect(un("C0")).toBe(unmodelledColumns(CONTROL_LAYERS.C0).join(";"))
  expect(un("C1")).toBe(unmodelledColumns(CONTROL_LAYERS.C0, true).join(";"))
  expect(un("C2")).toBe(unmodelledColumns(CONTROL_LAYERS.C2).join(";"))
  expect(un("C3")).toBe(unmodelledColumns(CONTROL_LAYERS.C3).join(";"))
  // values equal a direct evaluate() of the same layers; C0 is the substrate constant
  const d = design()
  const c = d.find((r) => r.candidate_id === "SP-004") as (typeof d)[number]
  const s = w[3] as (typeof w)[number]
  const c3 = rows.find(
    (r) =>
      r.control_id === "C3" &&
      r.for_candidate === "SP-004" &&
      r.scenario_id === s.scenario_id,
  )
  const o = evaluate(c, s, CONTROL_LAYERS.C3, ctx)
  expect(c3?.t_max_pred).toBe(o.t_max_c)
  expect(c3?.r_solar_pred).toBe(o.r_solar)
  const c0 = rows.find((r) => r.control_id === "C0")
  expect(c0?.r_solar_pred).toBe(ctx.mat.substrate.r_solar.value)
  const c1 = rows.find((r) => r.control_id === "C1")
  expect(c1?.r_solar_pred).toBe(ctx.controls.c1_r_solar.value)
  // deterministic order and content
  expect(buildControls(SHORT, design(), w, ctx)).toEqual(rows)
})

test("controlsRejectUnknownOrInfeasibleShortlistCandidate", () => {
  const w = weatherL9(ctx.weather)
  expect(() =>
    buildControls({ ...SHORT, balanced: "SP-099" }, design(), w, ctx),
  ).toThrow()
})
