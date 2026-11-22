import { expect, test } from "bun:test"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import { glossary } from "../../../../src/web/design/organisms/glossary"
import {
  GLOSSARY,
  glossaryAnchor,
  linkTerms,
} from "../../../../src/web/design/terms"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R19 Glossary", [])
})

test("everyTermHasAnAnchorAndEveryLinkResolves", async () => {
  const html = glossary({})
  const els = await elementsOf(html)
  expect(els[0]?.attrs["data-glossary"]).toBe("")
  const dts = els.filter((e) => e.tag === "dt")
  expect(dts.length).toBe(GLOSSARY.length)
  const anchors = new Set(dts.map((e) => e.attrs.id))
  for (const g of GLOSSARY)
    expect(anchors.has(glossaryAnchor(g.id)), g.id).toBe(true)
  // links made by linkTerms from a sentence using every term resolve to an anchor
  const text = GLOSSARY.map((g) => g.matches[0]).join("; ")
  const links = (await elementsOf(linkTerms(text, new Set()))).filter(
    (e) => e.tag === "a",
  )
  expect(links.length).toBe(GLOSSARY.length)
  for (const l of links)
    expect(anchors.has((l.attrs.href ?? "").slice(1))).toBe(true)
})

test("eachEntryHasDefinitionUnitAndMeaningAndIsOrderedByLabel", async () => {
  const html = glossary({})
  expect(html.match(/Unit: /g)?.length).toBe(GLOSSARY.length)
  const labels = [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((m) =>
    (m[1] ?? "").toLowerCase(),
  )
  expect(labels).toEqual([...labels].sort())
  expect(html).toContain(GLOSSARY[0]?.definition.slice(0, 20) as string)
  expect(glossary({})).toBe(html)
})

test("escapesEveryFieldF8AndRejectsBadEntriesF7", async () => {
  const bad = {
    id: "x",
    label: XSS,
    matches: ["x"],
    definition: XSS,
    unit: XSS,
    meaning: XSS,
  }
  expect(
    (await elementsOf(glossary({ entries: [bad] }))).some(
      (e) => e.tag === "img",
    ),
  ).toBe(false)
  expectBuildError(() => glossary({ entries: [] }), "Glossary")
  expectBuildError(() => glossary({ entries: [bad, bad] }), "Glossary")
  expectBuildError(
    () => glossary({ entries: [{ ...bad, id: "a b" }] }),
    "Glossary",
  )
  expectBuildError(
    () => glossary({ entries: [{ ...bad, definition: " " }] }),
    "Glossary",
  )
})

test("cssIsTokenOnlyAndMarksTheTarget", () => {
  const css = ORGANISM_CSS.glossary as string
  expectTokenOnly(css)
  expect(css).toContain(":target")
  expect(css).toMatch(
    /\.tv-glossary__unit\{[^}]*font-family:var\(--tv-font-sans\)/,
  )
})
