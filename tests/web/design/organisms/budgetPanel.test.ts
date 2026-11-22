import { expect, test } from "bun:test"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import {
  type BudgetLookup,
  type BudgetLookupResult,
  budgetPanel,
  budgetResult,
} from "../../../../src/web/design/organisms/budgetPanel"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const recipe = {
  role: "balanced" as const,
  name: "SP-031",
  cooling: { value: 13.6, lo: 13.4, hi: 13.8, min: 0, max: 20, digits: 1 },
  cost: { value: 0.42, digits: 2 },
  layers: {
    primer: "GPTES:TEOS 0.73:0.27",
    midcoat: "TiO2:BaSO4 0.76:0.24",
    topcoat: "MTES:TEOS 0.62:0.38",
  },
}
const calls: [string, number][] = []
const lookup: BudgetLookup = (profile, budget) => {
  calls.push([profile, budget])
  if (budget < 0.3) return { status: "infeasible", c_min: 0.3 }
  return {
    status: "ok",
    cost: 0.42,
    headroom: Math.round((budget - 0.42) * 1e4) / 1e4,
    knee: 0.55,
    recipe,
  }
}
const ok = {
  id: "budget",
  profiles: [
    { id: "cooling", label: "Cooling first" },
    { id: "balanced", label: "Balanced" },
  ],
  profile: "balanced",
  budget: { min: 0.2, max: 1, step: 0.01, value: 0.5 },
  lookup,
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R22 BudgetPanel", ["ok", "infeasible", "on", "off"])
})

test("rendersChipsSliderWithNumberBoxUnitAndALiveResultRegionFromTheLookup", async () => {
  calls.length = 0
  const html = budgetPanel(ok)
  const els = await elementsOf(html)
  expect(calls).toEqual([["balanced", 0.5]])
  expect(els[0]?.attrs["data-budget"]).toBe("")
  expect(els[0]?.attrs["data-profile"]).toBe("balanced")
  expect(els.find((e) => e.tag === "legend")).toBeDefined()
  const chips = els.filter((e) => e.attrs.class === "tv-chip tv-chip--toggle")
  expect(chips.map((e) => e.attrs["aria-pressed"])).toEqual(["false", "true"])
  expect(chips.map((e) => e.attrs["data-value"])).toEqual([
    "cooling",
    "balanced",
  ])
  expect(els.some((e) => e.attrs.type === "range")).toBe(true)
  expect(els.some((e) => e.attrs.type === "number")).toBe(true)
  expect(html).toContain("relative cost units (not IDR)")
  const live = els.find((e) => e.attrs["data-budget-result"] !== undefined)
  expect(live?.attrs.role).toBe("status")
  expect(live?.attrs["aria-live"]).toBe("polite")
  expect(live?.attrs["aria-atomic"]).toBe("true")
  expect(html).toContain("data-recipe")
  expect(html).toContain("Cost position")
  expect(html).toContain("unspent headroom 0.08")
})

test("resultSentenceNamesCostHeadroomAndKneeAndInfeasibleNamesTheCheapest", () => {
  const okRes = budgetResult(
    { status: "ok", cost: 0.42, headroom: 0.08, knee: 0.55, recipe },
    { digits: 2 },
  )
  expect(okRes).toContain("cost 0.42 relative cost units (not IDR)")
  expect(okRes).toContain("unspent headroom 0.08")
  expect(okRes).toContain("knee of the curve at 0.55")
  expect(okRes).toContain("tv-recipe--full")
  const noKnee = budgetResult(
    { status: "ok", cost: 0.42, headroom: 0, recipe },
    { digits: 2 },
  )
  expect(noKnee).not.toContain("knee")
  const bad = budgetResult({ status: "infeasible", c_min: 0.3 }, { digits: 2 })
  expect(bad).toContain("data-callout")
  expect(bad).toContain(
    "cheapest tabulated recipe costs 0.30 relative cost units (not IDR)",
  )
  expect(bad).not.toContain("data-recipe")
})

test("panelOfAnInfeasibleBudgetShowsTheCallout", () => {
  expect(
    budgetPanel({ ...ok, budget: { ...ok.budget, value: 0.25 } }),
  ).toContain("cheapest tabulated recipe")
})

test("escapesEveryFieldF8", async () => {
  const xss: BudgetLookup = () => ({
    status: "ok",
    cost: 1,
    headroom: 0,
    recipe: {
      ...recipe,
      name: XSS,
      layers: { primer: XSS, midcoat: XSS, topcoat: XSS },
    },
  })
  const html = budgetPanel({
    ...ok,
    lookup: xss,
    profiles: [{ id: "balanced", label: XSS }],
  })
  expect((await elementsOf(html)).some((e) => e.tag === "img")).toBe(false)
})

test("badInputIsABuildErrorF7", () => {
  expectBuildError(() => budgetPanel({ ...ok, id: "a b" }), "BudgetPanel")
  expectBuildError(
    () => budgetPanel({ ...ok, profile: "durability" }),
    "BudgetPanel",
  )
  expectBuildError(() => budgetPanel({ ...ok, profiles: [] }), "BudgetPanel")
  expectBuildError(
    () =>
      budgetPanel({
        ...ok,
        profiles: [
          { id: "a", label: "A" },
          { id: "a", label: "B" },
        ],
        profile: "a",
      }),
    "BudgetPanel",
  )
  expectBuildError(
    () => budgetPanel({ ...ok, budget: { ...ok.budget, value: 2 } }),
    "SliderField",
  )
  expectBuildError(
    () =>
      budgetPanel({ ...ok, lookup: (() => ({ status: "weird" })) as never }),
    "BudgetPanel",
  )
  expectBuildError(
    () =>
      budgetResult(
        { status: "ok", cost: Number.NaN, headroom: 0, recipe },
        { digits: 2 },
      ),
    "BudgetPanel",
  )
  expectBuildError(
    () =>
      budgetResult({ status: "infeasible", c_min: -1 } as BudgetLookupResult, {
        digits: 2,
      }),
    "BudgetPanel",
  )
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(ORGANISM_CSS.budgetPanel as string)
})
