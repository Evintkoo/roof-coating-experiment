import { expect, test } from "bun:test"
import { RECIPE_VARIANTS } from "../../../../src/web/design/organisms/recipeCard"
import {
  GALLERY_ORGANISMS_CSS,
  galleryOrganismCells,
  galleryOrganisms,
} from "../../../../src/web/design/templates/galleryOrganisms"
import { elementsOf, expectTokenOnly } from "../../../support/designComponents"

const states = (o: string) =>
  galleryOrganismCells()
    .filter((c) => c.atom === o)
    .map((c) => c.state)

test("everyStateOfEveryOrganismIsInTheGalleryOnce", () => {
  expect(states("NavRail")).toEqual(["current section", "no current section"])
  expect(states("HeroVerdict")).toEqual(["default", "one recommended"])
  for (const v of RECIPE_VARIANTS)
    expect(states("RecipeCard").some((s) => s.startsWith(v))).toBe(true)
  expect(states("RecipeCard").length).toBe(4)
  expect(states("DataTable")).toEqual(["plain", "sortable"])
  expect(states("Provenance")).toEqual(["with extra files", "no extra files"])
  expect(states("SiteBenefitPanel")).toEqual(["with caveats", "no caveats"])
  expect(states("BudgetPanel")).toEqual(["ok", "infeasible"])
  for (const o of ["FindingList", "Glossary"])
    expect(states(o)).toEqual(["default"])
  const keys = galleryOrganismCells().map((c) => `${c.atom}/${c.state}`)
  expect(new Set(keys).size).toBe(keys.length)
})

test("fragmentIsDeterministicAndEveryIdIsUniqueSoAnchorsResolve", async () => {
  const a = galleryOrganisms()
  expect(galleryOrganisms()).toBe(a)
  const els = await elementsOf(a)
  expect(els.filter((e) => e.attrs.class === "tv-gallery__cell").length).toBe(
    galleryOrganismCells().length,
  )
  const ids = els.map((e) => e.attrs.id).filter(Boolean) as string[]
  expect(new Set(ids).size).toBe(ids.length)
  for (const href of els
    .filter((e) => e.tag === "a" && (e.attrs.href ?? "").startsWith("#"))
    .map((e) => (e.attrs.href as string).slice(1)))
    if (href.startsWith("glossary-")) expect(ids, href).toContain(href)
  expect(els.some((e) => e.tag === "script")).toBe(false)
})

test("galleryCssIsTokenOnly", () => {
  expectTokenOnly(GALLERY_ORGANISMS_CSS)
})
