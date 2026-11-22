// Browser entry for the budget panel test: mounts the real panel with the real exact-lookup of plan 05 over a small table.
import { type BudgetTable, lookupBudget } from "../../src/core/opt/budgetTable"
import {
  type BudgetLookup,
  mountBudgetPanel,
} from "../../src/web/design/organisms/budgetPanel"
import { BUDGET_TEST_TABLES, budgetRecipe } from "./budgetFixture"

const lookup: BudgetLookup = (profile, budget) => {
  const t = BUDGET_TEST_TABLES.find((x: BudgetTable) => x.profile === profile)
  if (!t) throw new RangeError("no table")
  const r = lookupBudget(t, budget)
  if (r.status === "infeasible") return { status: "infeasible", c_min: r.c_min }
  return {
    status: "ok",
    cost: r.entry.cost,
    headroom: r.headroom,
    knee: t.knee_budget,
    recipe: budgetRecipe(profile, r.entry.cost),
  }
}
const root = document.querySelector("[data-budget]") as HTMLElement
mountBudgetPanel(root, lookup)
;(window as unknown as { __ready: boolean }).__ready = true
