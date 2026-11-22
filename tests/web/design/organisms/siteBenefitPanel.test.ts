import { expect, test } from "bun:test"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import { siteBenefitPanel } from "../../../../src/web/design/organisms/siteBenefitPanel"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const est = (v: number) => ({ value: v, lo: v - 1, hi: v + 1 })
const ok = {
  sites: [
    { id: "medan", name: "Medan", initial: est(19.4), aged: est(15.1) },
    { id: "bandung", name: "Bandung", initial: est(12.2), aged: est(9.8) },
  ],
  axis: { min: 0, max: 30 },
  scenario: "Ageing scenario",
  loss: { lo: 18, hi: 26 },
  caveats: [
    {
      id: "medan",
      site: "medan",
      text: "The weather for Medan is modelled, not measured.",
    },
    {
      id: "tmyx",
      text: "The TMYx typical-year files agree to within the stated tolerance.",
    },
  ],
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R21 SiteBenefitPanel", [])
})

test("oneCardPerSiteWithInitialProxyAndAgedScenarioOnASharedAxis", async () => {
  const html = siteBenefitPanel(ok)
  const els = await elementsOf(html)
  expect(els[0]?.attrs["data-site-panel"]).toBe("")
  const sites = els.filter((e) => e.tag === "article")
  expect(sites.map((e) => e.attrs["data-site"])).toEqual(["medan", "bandung"])
  expect(els.filter((e) => e.tag === "h3").length).toBe(2)
  expect(
    els.filter((e) => e.attrs["data-interval-bar"] !== undefined).length,
  ).toBe(4)
  expect(
    els.filter((e) => e.attrs["data-proxy-badge"] === "proxy").length,
  ).toBe(2)
  // two aged values (scenario badge) plus the loss sentence's own badge
  expect(
    els.filter((e) => e.attrs["data-proxy-badge"] === "scenario").length,
  ).toBe(3)
  expect(els.filter((e) => (e.attrs.class ?? "") === "tv-chip").length).toBe(2)
  expect(html).toContain("Ageing scenario")
  // shared axis: every bar's scale labels are 0 and 30 W/m²
  expect(html.match(/>0 W\/m²</g)?.length).toBe(4)
  expect(html.match(/>30 W\/m²</g)?.length).toBe(4)
  expect(html).toContain("loses 18 to 26 % of its initial benefit")
})

test("caveatsAreCalloutsNamedBySiteOrDataNote", async () => {
  const html = siteBenefitPanel(ok)
  const els = await elementsOf(html)
  expect(els.some((e) => e.attrs["data-caveats"] !== undefined)).toBe(true)
  expect(els.filter((e) => e.attrs["data-callout"] === "caution").length).toBe(
    2,
  )
  expect(html).toContain(">Medan</p>")
  expect(html).toContain(">Data note</p>")
  const { caveats: _c, ...none } = ok
  expect(siteBenefitPanel(none)).not.toContain("data-caveats")
})

test("escapesEveryFieldF8", async () => {
  const html = siteBenefitPanel({
    ...ok,
    scenario: XSS,
    unit: XSS,
    sites: [{ id: "a", name: XSS, initial: est(10), aged: est(8) }],
    caveats: [{ id: "c", text: XSS }],
  })
  expect((await elementsOf(html)).some((e) => e.tag === "img")).toBe(false)
})

test("badInputIsABuildErrorF7", () => {
  expectBuildError(
    () => siteBenefitPanel({ ...ok, sites: [] }),
    "SiteBenefitPanel",
  )
  expectBuildError(
    () =>
      siteBenefitPanel({
        ...ok,
        sites: [
          ok.sites[0] as (typeof ok.sites)[0],
          ok.sites[0] as (typeof ok.sites)[0],
        ],
      }),
    "SiteBenefitPanel",
  )
  expectBuildError(
    () => siteBenefitPanel({ ...ok, loss: { lo: 30, hi: 20 } }),
    "SiteBenefitPanel",
  )
  expectBuildError(
    () => siteBenefitPanel({ ...ok, loss: { lo: -1, hi: 20 } }),
    "SiteBenefitPanel",
  )
  expectBuildError(
    () => siteBenefitPanel({ ...ok, loss: { lo: 1, hi: 101 } }),
    "SiteBenefitPanel",
  )
  expectBuildError(
    () =>
      siteBenefitPanel({
        ...ok,
        caveats: [{ id: "x", site: "nowhere", text: "t" }],
      }),
    "SiteBenefitPanel",
  )
  expectBuildError(
    () => siteBenefitPanel({ ...ok, scenario: " " }),
    "SiteBenefitPanel",
  )
  expectBuildError(
    () => siteBenefitPanel({ ...ok, axis: { min: 0, max: 15 } }),
    "IntervalBar",
  )
  expectBuildError(
    () => siteBenefitPanel({ ...ok, headingLevel: 2 as never }),
    "SiteBenefitPanel",
  )
})

test("cssIsTokenOnlyAndGridCollapsesOnPhones", () => {
  const css = ORGANISM_CSS.siteBenefitPanel as string
  expectTokenOnly(css)
  expect(css).toContain("repeat(auto-fit")
  expect(css).toContain("break-inside:avoid")
})
