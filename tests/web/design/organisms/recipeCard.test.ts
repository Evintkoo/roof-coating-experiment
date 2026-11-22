import { expect, test } from "bun:test"
import { componentsCss, ORGANISM_CSS } from "../../../../src/web/design/css"
import {
  RECIPE_ROLES,
  RECIPE_VARIANTS,
  recipeCard,
} from "../../../../src/web/design/organisms/recipeCard"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const base = {
  role: "balanced" as const,
  name: "SP-031",
  cooling: { value: 13.6, lo: 13.4, hi: 13.8, min: 0, max: 20, digits: 1 },
  cost: { value: 0.59, digits: 2 },
}
const layers = {
  primer: "GPTES:TEOS mole fraction 0.73:0.27",
  midcoat: "TiO2:BaSO4 volume ratio 0.76:0.24, total PVC 0.310",
  topcoat: "MTES:TEOS mole fraction 0.62:0.38",
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R16 RecipeCard", [
    "summary",
    "full",
    "high_performing",
    "balanced",
    "low_cost",
  ])
})

test("summaryShowsRoleCoolingWithIntervalAndCostWithProxy", async () => {
  expect([...RECIPE_ROLES]).toEqual(["high_performing", "balanced", "low_cost"])
  expect([...RECIPE_VARIANTS]).toEqual(["summary", "full"])
  const html = recipeCard({ ...base, variant: "summary" })
  const els = await elementsOf(html)
  expect(els[0]?.tag).toBe("article")
  expect(els[0]?.attrs["data-role"]).toBe("balanced")
  expect(els.find((e) => e.tag === "h3")).toBeDefined()
  expect(html).toContain(">Balanced</h3>")
  expect(html).toContain(">SP-031</code>")
  expect(html).toContain("data-interval-bar")
  expect(html).toContain('data-proxy-badge="proxy"')
  expect(html).not.toContain("tv-recipe__layers")
  const order = [
    "tv-recipe__head",
    "Cooler than bare aluminium",
    "Cost position",
  ].map((k) => html.indexOf(k))
  expect([...order].sort((a, b) => a - b)).toEqual(order)
})

test("fullAddsMetricsBadgesAndLayersInOrderFromTheMetal", async () => {
  const html = recipeCard({
    ...base,
    variant: "full",
    layers,
    badges: [{ tone: "scenario", label: "ageing scenario" }],
    metrics: [
      { label: "Corrosion index", value: 0.701, tone: "proxy" },
      { label: "Delamination index", value: 0.382, tone: "proxy" },
    ],
  })
  expect(html.match(/data-proxy-badge="proxy"/g)?.length).toBe(3)
  expect(html).toContain(">ageing scenario<")
  const dts = [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((m) => m[1])
  expect(dts).toEqual(["Primer", "Midcoat", "Topcoat"])
  expect(html).toContain("TiO2:BaSO4 volume ratio 0.76:0.24")
  const els = await elementsOf(html)
  expect(els.some((e) => e.tag === "dl")).toBe(true)
})

test("recommendedAndHeadingLevel", async () => {
  const html = recipeCard({ ...base, recommended: true, headingLevel: 2 })
  expect(html).toContain("tv-recipe--recommended")
  expect(html).toContain(">Shown in the climate section<")
  expect(html).toContain("<h2")
  expect(recipeCard(base)).not.toContain("Shown in the climate section")
})

test("escapesEveryFieldF8", async () => {
  const html = recipeCard({
    ...base,
    name: XSS,
    variant: "full",
    layers: { primer: XSS, midcoat: XSS, topcoat: XSS },
    badges: [{ tone: "scenario", label: XSS }],
    metrics: [{ label: XSS, value: 1, tone: "proxy" }],
  })
  expect((await elementsOf(html)).some((e) => e.tag === "img")).toBe(false)
})

test("badInputIsABuildErrorF7", () => {
  expectBuildError(
    () => recipeCard({ ...base, role: "best" as never }),
    "RecipeCard",
  )
  expectBuildError(
    () => recipeCard({ ...base, variant: "wide" as never }),
    "RecipeCard",
  )
  expectBuildError(() => recipeCard({ ...base, variant: "full" }), "RecipeCard")
  expectBuildError(
    () => recipeCard({ ...base, headingLevel: 5 as never }),
    "RecipeCard",
  )
  expectBuildError(() => recipeCard({ ...base, name: " " }), "RecipeCard")
  expectBuildError(
    () => recipeCard({ ...base, cooling: { ...base.cooling, hi: 99 } }),
    "IntervalBar",
  )
})

test("cssIsTokenOnlyAndPrintAvoidsBreaks", () => {
  const css = ORGANISM_CSS.recipeCard as string
  expectTokenOnly(css)
  expect(componentsCss()).toContain(".tv-recipe--recommended")
  expect(css).toContain("break-inside:avoid")
})
