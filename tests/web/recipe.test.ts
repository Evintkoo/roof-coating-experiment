import { expect, test } from "bun:test"
import type { BudgetEntry, BudgetTable } from "../../src/core/opt/budgetTable"
import type { OptData } from "../../src/web/optimisation"
import {
  budgetLookup,
  coolingAxis,
  designFromX,
  layerStrings,
} from "../../src/web/recipe"

const VARS = [
  "p1",
  "p2",
  "m1",
  "m2",
  "m3",
  "t1",
  "t2",
  "d_tio2_um",
  "d_baso4_um",
]
const OBJ = [
  "r_solar_pred",
  "t_max_pred",
  "corrosion_proxy",
  "delam_proxy",
  "cost_proxy",
]
const entry = (level: number, budget: number, t: number): BudgetEntry => ({
  level,
  budget,
  cost: budget - 0.01,
  x: [0.8, 12, 0.35, 0.8, 128, 0.2, 3, 0.3, 0.7],
  objectives: [0.93 + level / 100, t, 0.5, 0.04, budget - 0.01],
  lo: [0.9, t - 0.5, 0.4, 0.03, budget - 0.01],
  hi: [0.95, t + 0.5, 0.6, 0.05, budget - 0.01],
  scalar: 1 - level,
  repaired: false,
})
const table: BudgetTable = {
  profile: "balanced",
  cost_unit: "relative",
  c_min: 0.3,
  c_max: 0.9,
  knee_budget: 0.6,
  entries: [entry(0, 0.3, 33), entry(1, 0.6, 31.5), entry(2, 0.9, 31)],
}
const opt: OptData = {
  cost_unit: "relative",
  objectives: OBJ,
  vars: VARS,
  tables: [table],
  front: [],
}
const page = { opt, c0_mean_c: 45.6, axis: coolingAxis([table], OBJ, 45.6) }

test("layerStringsMatchTheCardWording", () => {
  const l = layerStrings(designFromX(table.entries[1]?.x as number[], VARS))
  expect(l.primer).toBe("GPTES:TEOS mole fraction 0.80:0.20, 12.0 µm")
  expect(l.midcoat).toBe(
    "TiO2:BaSO4 volume ratio 0.80:0.20, total PVC 0.350, 128 µm",
  )
  expect(l.topcoat).toBe("MTES:TEOS mole fraction 0.20:0.80, 3.0 µm")
})

test("aMissingVariableIsAnError", () => {
  expect(() => designFromX([1], VARS)).toThrow("no finite")
  expect(() => designFromX(table.entries[0]?.x as number[], ["p1"])).toThrow()
})

test("coolingAxisCoversEveryEntryWithItsInterval", () => {
  const a = page.axis
  expect(a.min).toBeLessThanOrEqual(0)
  expect(a.max).toBeGreaterThanOrEqual(Math.ceil(45.6 - 30.5))
})

test("lookupIsTheExactTableEntryAtOrBelowTheBudget", () => {
  const f = budgetLookup(page)
  const r = f("balanced", 0.75)
  if (r.status !== "ok") throw new Error("expected a recipe")
  // the entry of budget 0.6, never interpolated
  expect(r.cost).toBeCloseTo(0.59, 12)
  expect(r.headroom).toBeCloseTo(0.75 - 0.59, 12)
  expect(r.knee).toBe(0.6)
  expect(r.recipe.cooling.value).toBeCloseTo(45.6 - 31.5, 12)
  expect(r.recipe.cooling.lo).toBeCloseTo(45.6 - 32, 12)
  expect(r.recipe.cooling.hi).toBeCloseTo(45.6 - 31, 12)
  expect(r.recipe.roleLabel).toBe("Balanced")
  expect(r.recipe.name).toBe("Level 1")
  expect(f("balanced", 0.2)).toEqual({ status: "infeasible", c_min: 0.3 })
  expect(() => f("nope", 0.5)).toThrow("no table")
})
