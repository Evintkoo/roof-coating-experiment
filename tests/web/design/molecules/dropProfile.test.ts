import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  DROP_INSIDE_Y,
  DROP_SURFACE_Y,
  dropProfile,
  dropX,
} from "../../../../src/web/design/molecules/dropProfile"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const base = {
  tSurfaceK: 331.2,
  tInsideK: 300.15,
  rTotal: 0.5,
  source: "stepper:recipe",
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R40 DropProfile", [])
})

test("tokensOnly", () => {
  expectTokenOnly(MOLECULE_CSS.dropProfile)
})

test("noPerLayerNumberH8", async () => {
  const html = dropProfile(base)
  const els = await elementsOf(html)
  // exactly two temperature numbers (surface and inside) and nothing else numeric in the text
  const texts = [...html.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(
    (m) => m[1] as string,
  )
  const temps = texts.filter(
    (t) => /-?\d+(\.\d+)? °C/.test(t) && /^(surface|inside)/.test(t),
  )
  expect(temps).toEqual(["surface 58.05 °C", "inside 27 °C"])
  expect(els.filter((e) => e.tag === "circle").length).toBe(2)
  expect(html).not.toMatch(/layer \d|primer \d|midcoat \d|topcoat \d/i)
  expect(html).not.toMatch(/gradient/i)
})

test("sourcesAndTheIllustrativeLabelH8H10H15", async () => {
  const html = dropProfile(base)
  const els = await elementsOf(html)
  expect(
    els
      .filter((e) => e.attrs["data-source"])
      .map((e) => e.attrs["data-source"]),
  ).toEqual([
    "stepper:recipe:r_total",
    "stepper:recipe:conduction_law",
    "stepper:recipe:t_k",
    "stepper:recipe:t_inside_k",
    "stepper:recipe:t_k",
    "stepper:recipe:t_inside_k",
  ])
  expect(html).toContain("Illustrative scale")
  expect(html).toContain("none per layer")
})

test("dotsMoveWithTheTemperatureOnAFixedAxis", () => {
  expect(dropX(300)).toBeLessThan(dropX(340))
  expect(dropX(0)).toBe(dropX(280)) // clamped to the drawing
  const a = dropProfile(base)
  const b = dropProfile({ ...base, tSurfaceK: 345 })
  expect(a).not.toBe(b)
  expect(DROP_INSIDE_Y).toBeGreaterThan(DROP_SURFACE_Y)
})

test("badInputIsABuildErrorAndTextIsEscapedF8F9", async () => {
  expectBuildError(() => dropProfile({ ...base, rTotal: 0 }), "DropProfile")
  expectBuildError(
    () => dropProfile({ ...base, tSurfaceK: Number.NaN }),
    "DropProfile",
  )
  expectBuildError(() => dropProfile({ ...base, source: "" }), "DropProfile")
  expect(
    (await elementsOf(dropProfile({ ...base, source: XSS }))).some(
      (e) => e.tag === "img",
    ),
  ).toBe(false)
})

test("theAxisCoversAHotBareAluminiumSurfaceAndEveryNumberDeclaresItsSourceFix", async () => {
  expect(dropX(358)).toBeGreaterThan(dropX(340)) // 85 degC is not pinned at the edge
  expect(dropX(373)).toBeLessThan(dropX(380) + 1e-9)
  const els = await elementsOf(dropProfile(base))
  for (const a of ["drop-law", "drop-surface-text", "drop-inside-text"])
    expect(
      els.find((e) => e.attrs["data-anim"] === a)?.attrs["data-source"],
      a,
    ).toMatch(/^stepper:recipe:/)
})
