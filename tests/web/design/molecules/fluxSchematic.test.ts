import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  arrowGeometry,
  fluxSchematic,
  L_MAX,
} from "../../../../src/web/design/molecules/fluxSchematic"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R29 FluxSchematic", [])
})

test("fourArrowsEachWithASourceAndItsScale", async () => {
  const flux = {
    incident: 800,
    reflected: 705.36,
    absorbed: 94.64,
    conducted: 3.5,
  }
  const refs = {
    incident: 800,
    reflected: 705.36,
    absorbed: 94.64,
    conducted: 7,
  }
  const els = await elementsOf(fluxSchematic({ name: "SP-001", flux, refs }))
  const arrows = els.filter((e) => e.attrs["data-flux"])
  expect(arrows.map((a) => a.attrs["data-source"])).toEqual([
    "flux:incident",
    "flux:reflected",
    "flux:absorbed",
    "flux:conducted",
  ])
  expect(arrows.map((a) => Number(a.attrs["data-w"]))).toEqual([
    800, 705.36, 94.64, 3.5,
  ])
})

test("lengthScalesWithTheFluxAndNegativeFluxPointsTheOtherWay", () => {
  expect(arrowGeometry("incident", 800, 800)).toEqual({
    x: 62,
    y1: 14,
    y2: 14 + L_MAX,
  })
  const half = arrowGeometry("incident", 400, 800)
  expect(half.y2 - half.y1).toBeCloseTo(L_MAX / 2, 9)
  const out = arrowGeometry("conducted", -2, 4)
  expect(out.y2).toBeLessThan(out.y1)
  expect(arrowGeometry("reflected", 100, 100).y2).toBeLessThan(
    arrowGeometry("reflected", 100, 100).y1,
  )
  expect(arrowGeometry("incident", 5, 0).y2).toBe(
    arrowGeometry("incident", 5, 0).y1,
  )
})

test("badInputIsABuildErrorAndNamesAreEscaped", async () => {
  expectBuildError(() => fluxSchematic({ name: "" }), "FluxSchematic")
  expectBuildError(
    () =>
      fluxSchematic({
        name: "x",
        flux: { incident: Number.NaN, reflected: 0, absorbed: 0, conducted: 0 },
      }),
    "FluxSchematic",
  )
  expect(
    (await elementsOf(fluxSchematic({ name: XSS }))).some(
      (e) => e.tag === "img",
    ),
  ).toBe(false)
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(MOLECULE_CSS.fluxSchematic)
})
