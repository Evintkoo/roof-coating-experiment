import { expect, test } from "bun:test"
import { galleryAtomCells } from "../../../../src/web/design/templates/galleryAtoms"
import { galleryMoleculeCells } from "../../../../src/web/design/templates/galleryMolecules"
import { galleryOrganismCells } from "../../../../src/web/design/templates/galleryOrganisms"
import { galleryDocument } from "../../../../src/web/design/templates/galleryPage"
import { elementsOf } from "../../../support/designComponents"

test("everyCellOfEveryLevelIsInTheDocumentOnce", async () => {
  const html = galleryDocument({ css: "" })
  const els = await elementsOf(html)
  const cells = els.filter((e) => e.attrs.class === "tv-gallery__cell")
  const want =
    galleryAtomCells().length +
    galleryMoleculeCells().length +
    galleryOrganismCells().length
  expect(cells.length).toBe(want)
  const ids = els.map((e) => e.attrs.id).filter(Boolean) as string[]
  expect(new Set(ids).size).toBe(ids.length)
  expect(els.find((e) => e.tag === "h1")?.tag).toBe("h1")
})

test("sameInputsSameBytesAndNoNetwork", () => {
  const a = galleryDocument({ css: "a{}" })
  expect(galleryDocument({ css: "a{}" })).toBe(a)
  expect(a).not.toMatch(
    /<link\b|<script[^>]*\ssrc=|@import|https?:\/\/(?!example\.org|www\.w3\.org)/,
  )
})

test("hasAThemeToggleAndTheTitleIsEscaped", () => {
  const html = galleryDocument({ css: "", title: "<img onerror=x>" })
  expect(html).toContain('id="theme-toggle"')
  expect(html).not.toContain("<img onerror")
})

test("opensLightAppliesTheStoredThemeFirstAndShowsBothThemesSideBySide", async () => {
  const html = galleryDocument({ css: "" })
  expect(html).toContain('<html lang="en" data-theme="light">')
  expect(html.indexOf("localStorage")).toBeLessThan(html.indexOf("<style>"))
  expect(html).toContain('aria-pressed="false"')
  expect(html).not.toContain("prefers-color-scheme")
  const els = await elementsOf(html)
  expect(
    els.filter((e) => e.attrs["data-pane"]).map((e) => e.attrs["data-theme"]),
  ).toEqual(["light", "dark"])
})
