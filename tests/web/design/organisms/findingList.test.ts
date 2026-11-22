import { expect, test } from "bun:test"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import { findingList } from "../../../../src/web/design/organisms/findingList"
import { glossaryLink } from "../../../../src/web/design/terms"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const items = [
  {
    id: "verdict",
    sentence:
      "Three coatings lower the peak surface temperature by 13.4 to 14.4 K against bare aluminium (parameter uncertainty only).",
    sources: ["refine_recipes.csv", "controls.csv"],
  },
  {
    id: "recipe-balanced",
    label: "Balanced",
    sentence:
      "SP-031 has a PROXY index for cost of 0.59; the peak surface temperature is lower.",
    sources: [],
  },
]

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R17 FindingList", [])
})

test("rendersAnOrderedListWithLabelsAndSources", async () => {
  const html = findingList({ items })
  const els = await elementsOf(html)
  expect(els[0]?.tag).toBe("ol")
  expect(els[0]?.attrs["data-findings"]).toBe("")
  const lis = els.filter((e) => e.tag === "li")
  expect(lis.map((e) => e.attrs["data-finding"])).toEqual([
    "verdict",
    "recipe-balanced",
  ])
  expect(lis.map((e) => e.attrs.id)).toEqual([
    "finding-verdict",
    "finding-recipe-balanced",
  ])
  expect(html).toContain(">Balanced</strong>")
  expect(html).toContain("Source: refine_recipes.csv, controls.csv")
  expect(html.match(/Source:/g)?.length).toBe(1)
})

test("firstUseOfATermLinksToTheGlossaryOnlyOnce", async () => {
  const seen = new Set<string>()
  const html = findingList({ items, seen })
  const links = (await elementsOf(html)).filter((e) => e.tag === "a")
  const hrefs = links.map((e) => e.attrs.href)
  expect(hrefs).toContain(glossaryLink("peak-surface-temperature"))
  expect(hrefs).toContain(glossaryLink("bare-aluminium"))
  expect(hrefs).toContain(glossaryLink("proxy-index"))
  expect(new Set(hrefs).size).toBe(hrefs.length)
  expect(seen.has("proxy-index")).toBe(true)
  // a second list on the same page, same seen set: nothing links again
  const again = findingList({ items, seen })
  expect(again).not.toContain("<a ")
  expect(again).toContain("peak surface temperature")
})

test("escapesEverythingIncludingTextAroundLinksF8", async () => {
  const html = findingList({
    items: [
      {
        id: "x",
        label: XSS,
        sentence: `${XSS} peak surface temperature ${XSS}`,
        sources: [XSS],
      },
    ],
  })
  expect((await elementsOf(html)).some((e) => e.tag === "img")).toBe(false)
})

test("badInputIsABuildErrorF7", () => {
  expectBuildError(() => findingList({ items: [] }), "FindingList")
  expectBuildError(
    () =>
      findingList({
        items: [items[0] as (typeof items)[0], items[0] as (typeof items)[0]],
      }),
    "FindingList",
  )
  expectBuildError(
    () => findingList({ items: [{ id: "a b", sentence: "s" }] }),
    "FindingList",
  )
  expectBuildError(
    () => findingList({ items: [{ id: "a", sentence: " " }] }),
    "FindingList",
  )
})

test("cssIsTokenOnlyAndLinesAreCapped", () => {
  const css = ORGANISM_CSS.findingList as string
  expectTokenOnly(css)
  expect(css).toContain("max-width:70ch")
})
