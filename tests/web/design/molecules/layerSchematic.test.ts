import { expect, test } from "bun:test"
import { SCHEMATIC_CSS } from "../../../../src/web/design/css"
import { layerSchematic } from "../../../../src/web/design/molecules/layerSchematic"
import {
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const P = { name: "SP-075", primer_um: 10, midcoat_um: 200, topcoat_um: 10 }

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R23 LayerSchematic", [])
})

test("heightsAreProportionalToThickness", () => {
  const h = (html: string, cls: string): number =>
    Number(
      new RegExp(
        `tv-schem__${cls}" x="[^"]*" y="[^"]*" width="[^"]*" height="([^"]*)"`,
      ).exec(html)?.[1],
    )
  const html = layerSchematic(P)
  // (height - minimum visible) is linear in thickness
  const mid = h(html, "midcoat") - 2.5
  const top = h(html, "topcoat") - 2.5
  expect(mid / top).toBeCloseTo(20, 1)
  expect(
    h(layerSchematic({ ...P, midcoat_um: 400 }), "midcoat"),
  ).toBeGreaterThan(h(html, "midcoat"))
})

test("accessibleNameCarriesTheThicknesses", () => {
  const html = layerSchematic(P)
  expect(html).toContain('role="img"')
  expect(html).toContain("midcoat 200.0 µm")
  expect(html).toContain("primer 10.0 µm")
  expect(html).toContain('data-layer-schematic="SP-075"')
})

test("badInputsAreBuildErrors", () => {
  expectBuildError(
    () => layerSchematic({ ...P, primer_um: 0 }),
    "LayerSchematic",
  )
  expectBuildError(
    () => layerSchematic({ ...P, midcoat_um: Number.NaN }),
    "LayerSchematic",
  )
  expectBuildError(() => layerSchematic({ ...P, name: " " }), "LayerSchematic")
})

test("escapesTheName", () => {
  expect(layerSchematic({ ...P, name: XSS })).not.toContain("<img")
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(SCHEMATIC_CSS)
})
