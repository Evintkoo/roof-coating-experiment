// A small real budget table (plan 05 types) and the recipe each entry shows, shared by the build-time render and the browser entry.
import type { BudgetEntry, BudgetTable } from "../../src/core/opt/budgetTable"
import type { RecipeCardProps } from "../../src/web/design/organisms/recipeCard"

const entry = (
  level: number,
  budget: number,
  cost: number,
  scalar: number,
): BudgetEntry => ({
  level,
  budget,
  cost,
  x: [],
  objectives: [],
  lo: [],
  hi: [],
  scalar,
  repaired: false,
})
const table = (profile: string, shift: number): BudgetTable => ({
  profile,
  cost_unit: "relative",
  c_min: 0.3,
  c_max: 0.9,
  knee_budget: 0.6,
  entries: [
    entry(0, 0.3, 0.3, 1 - shift),
    entry(1, 0.5, 0.48, 0.6 - shift),
    entry(2, 0.7, 0.66, 0.4 - shift),
    entry(3, 0.9, 0.9, 0.38 - shift),
  ],
})
export const BUDGET_TEST_TABLES: BudgetTable[] = [
  table("cooling", 0),
  table("balanced", 0.05),
]

export function budgetRecipe(profile: string, cost: number): RecipeCardProps {
  const cool = profile === "cooling" ? 14.4 : 13.6
  return {
    role: profile === "cooling" ? "high_performing" : "balanced",
    name: `SP-${Math.round(cost * 100)}`,
    cooling: {
      value: cool,
      lo: cool - 0.2,
      hi: cool + 0.2,
      min: 0,
      max: 20,
      digits: 1,
    },
    cost: { value: cost, digits: 2 },
    layers: {
      primer: "GPTES:TEOS 0.62:0.38",
      midcoat: "TiO2:BaSO4 0.78:0.22",
      topcoat: "MTES:TEOS 0.62:0.38",
    },
  }
}
