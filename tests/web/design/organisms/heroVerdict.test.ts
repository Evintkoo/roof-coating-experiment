import { expect, test } from "bun:test"
import { ROLE_LABELS } from "../../../../src/core/report/outline"
import { componentsCss, ORGANISM_CSS } from "../../../../src/web/design/css"
import {
  type HeroRecipe,
  heroVerdict,
} from "../../../../src/web/design/organisms/heroVerdict"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const rec = (
  role: HeroRecipe["role"],
  name: string,
  v: number,
  cost: number,
): HeroRecipe => ({
  role,
  name,
  cooling: { value: v, lo: v - 0.1, hi: v + 0.1, min: 0, max: 20, digits: 1 },
  cost: { value: cost, digits: 2 },
})
const recipes = [
  rec("high_performing", "SP-075", 14.4, 0.64),
  rec("balanced", "SP-031", 13.6, 0.59),
  rec("low_cost", "SP-046", 13.4, 0.34),
] as const
const ok = {
  verdict:
    "Three coatings cool aluminium by 13.4 to 14.4 K in the models; none is measured yet",
  lead: "Best cooling: SP-075 lowers the peak surface temperature.",
  recipes,
  honesty: "PROXY results. Intervals show parameter uncertainty only.",
  limitsHref: "#limits",
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R15 HeroVerdict", [
    "high_performing",
    "balanced",
    "low_cost",
    "recommended",
  ])
})

test("answersWhichHowMuchAndHowSureWithEverythingVisible", async () => {
  const html = heroVerdict(ok)
  const els = await elementsOf(html)
  expect(els[0]?.tag).toBe("section")
  expect(els[0]?.attrs["data-hero"]).toBe("")
  expect(els[0]?.attrs.id).toBe("verdict")
  expect(els.filter((e) => e.tag === "h1").length).toBe(1)
  expect(els.find((e) => e.tag === "h1")?.attrs["data-hero-verdict"]).toBe("")
  const cards = els.filter((e) => e.attrs["data-recipe"] !== undefined)
  expect(cards.map((e) => e.attrs["data-role"])).toEqual([
    "high_performing",
    "balanced",
    "low_cost",
  ])
  for (const label of Object.values(ROLE_LABELS))
    expect(html).toContain(`>${label}</h2>`)
  expect(els.filter((e) => e.tag === "h2").length).toBe(3)
  // interval drawn three times, cost badge three times, honesty and limits link present, nothing collapsed
  expect(
    els.filter((e) => e.attrs["data-interval-bar"] !== undefined).length,
  ).toBe(3)
  expect(
    els.filter((e) => e.attrs["data-proxy-badge"] === "proxy").length,
  ).toBe(3)
  expect(els.some((e) => e.attrs["data-honesty"] !== undefined)).toBe(true)
  expect(html).toContain("Intervals show parameter uncertainty only.")
  const limits = els.find((e) => e.tag === "a" && e.attrs.href === "#limits")
  expect(limits).toBeDefined()
  expect(html).toContain("Limits")
  expect(els.some((e) => e.tag === "details")).toBe(false)
  expect(html).toContain("parameter uncertainty only: 14.3 to 14.5 K")
})

test("atMostOneRecipeIsRecommended", async () => {
  const one = [
    { ...recipes[0], recommended: true },
    recipes[1],
    recipes[2],
  ] as const
  const els = await elementsOf(heroVerdict({ ...ok, recipes: one }))
  expect(
    els.filter((e) => (e.attrs.class ?? "").includes("tv-recipe--recommended"))
      .length,
  ).toBe(1)
  const two = [
    { ...recipes[0], recommended: true },
    { ...recipes[1], recommended: true },
    recipes[2],
  ] as const
  expectBuildError(() => heroVerdict({ ...ok, recipes: two }), "HeroVerdict")
})

test("escapesEveryFieldF8", async () => {
  const x = { ...recipes[0], name: XSS }
  const els = await elementsOf(
    heroVerdict({
      ...ok,
      verdict: XSS,
      lead: XSS,
      honesty: XSS,
      eyebrow: XSS,
      limitsText: XSS,
      recipes: [x, recipes[1], recipes[2]],
    }),
  )
  expect(els.some((e) => e.tag === "img")).toBe(false)
})

test("badRolesTextOrLinkAreBuildErrorsF7", () => {
  expectBuildError(
    () =>
      heroVerdict({
        ...ok,
        recipes: [recipes[0], recipes[0], recipes[2]] as never,
      }),
    "HeroVerdict",
  )
  expectBuildError(
    () => heroVerdict({ ...ok, recipes: [recipes[0], recipes[1]] as never }),
    "HeroVerdict",
  )
  expectBuildError(() => heroVerdict({ ...ok, verdict: " " }), "HeroVerdict")
  expectBuildError(() => heroVerdict({ ...ok, honesty: "" }), "HeroVerdict")
  expectBuildError(
    () => heroVerdict({ ...ok, limitsHref: "javascript:alert(1)" }),
    "Button",
  )
  expectBuildError(
    () =>
      heroVerdict({
        ...ok,
        recipes: [
          { ...recipes[0], role: "best" as never },
          recipes[1],
          recipes[2],
        ] as never,
      }),
    "HeroVerdict",
  )
})

test("cssStacksOnPhonesAndIsTokenOnly", () => {
  const css = ORGANISM_CSS.heroVerdict as string
  expectTokenOnly(css)
  expect(css).toContain("@media (min-width:64em)")
  expect(css).toContain("repeat(3,minmax(0,1fr))")
  expect(componentsCss()).toContain(".tv-recipe--recommended")
})
