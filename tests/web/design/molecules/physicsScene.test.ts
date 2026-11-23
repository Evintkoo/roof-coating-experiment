import { expect, test } from "bun:test"
import {
  type Band,
  isReflectedRay,
  rayQuota,
} from "../../../../src/core/anim/bands"
import type { Terms } from "../../../../src/core/anim/stepper"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  ARROW_KEYS,
  arrowGeometry,
  L_MAX,
  physicsScene,
  REF_W_M2,
  rayPoints,
  SURF_Y,
} from "../../../../src/web/design/molecules/physicsScene"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const bands: Band[] = [
  { id: "uv", lo_um: 0.3, hi_um: 0.4, share: 0.05, reflected: 0.2 },
  { id: "visible", lo_um: 0.4, hi_um: 0.7, share: 0.45, reflected: 0.9 },
  { id: "nir", lo_um: 0.7, hi_um: 4, share: 0.5, reflected: 0.6 },
]
const terms: Terms = {
  absorbed: 200,
  reflected: 800,
  radiated: 450,
  convected: 300,
  conducted: 40,
  stored: 10,
}
const layers = { primer: true, midcoat: true, topcoat: true }
const base = {
  pane: "recipe" as const,
  bands,
  rays: 150,
  layers,
  terms,
  tK: 330,
  source: "stepper:recipe",
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R39 PhysicsScene", ["recipe", "aluminium"])
})

test("tokensOnly", () => {
  expectTokenOnly(MOLECULE_CSS.physicsScene)
})

test("rayCountsMatchBandsH5", async () => {
  const els = await elementsOf(physicsScene(base))
  const rays = els.filter((e) => e.attrs["data-ray"] !== undefined)
  expect(rays.length).toBe(150)
  let total = 0
  for (const b of bands) {
    const mine = rays.filter((r) => r.attrs["data-band"] === b.id)
    const refl = mine.filter((r) => r.attrs["data-reflected"] === "1").length
    expect(refl).toBe(rayQuota(b, mine.length).reflected) // round(N_b R_b), within one ray of N_b R_b
    expect(Math.abs(refl - mine.length * b.reflected)).toBeLessThanOrEqual(
      0.5 + 1e-9,
    )
    expect(Math.abs(mine.length - 150 * b.share)).toBeLessThan(1)
    total += refl
  }
  // the weighted share of reflected rays is the model's r_solar to within the rounding of three bands
  const rSolar = bands.reduce((s, b) => s + b.share * b.reflected, 0)
  expect(Math.abs(total / 150 - rSolar)).toBeLessThan(2 / 150)
  expect(rays.every((r) => r.attrs["data-source"]?.startsWith("bands:"))).toBe(
    true,
  )
})

test("raysAreDeterministicAndOnlyThePositionIsJittered", () => {
  expect(physicsScene(base)).toBe(physicsScene(base))
  expect(physicsScene({ ...base, seed: 1 })).not.toBe(
    physicsScene({ ...base, seed: 2 }),
  )
  let n = 0
  for (let i = 0; i < 30; i++) if (isReflectedRay(i, 30, 12)) n++
  expect(n).toBe(12)
})

test("arrowLengthsShareOneScaleH7", () => {
  const bareTerms = { ...terms, absorbed: 640, conducted: 5 }
  for (const k of ARROW_KEYS) {
    for (const w of [10, 100, 640, -50]) {
      const g = arrowGeometry(k, w, 200)
      const len = Math.abs(g.y2 - g.y1)
      expect(len).toBeCloseTo((L_MAX * Math.abs(w)) / REF_W_M2, 9) // one constant: 60 px per 1000 W/m2
    }
  }
  // the same flux draws the same length in both panes
  const len = (html: string, k: string): number => {
    const m = new RegExp(
      `data-arrow="${k}"[^>]*><line x1="[^"]*" x2="[^"]*" y1="([^"]*)" y2="([^"]*)"`,
    ).exec(html)
    return m ? Math.abs(Number(m[2]) - Number(m[1])) : Number.NaN
  }
  const a = physicsScene(base)
  const b = physicsScene({
    ...base,
    pane: "aluminium",
    terms: {
      ...bareTerms,
      absorbed: terms.absorbed,
      conducted: terms.conducted,
    },
  })
  for (const k of ARROW_KEYS) expect(len(a, k)).toBeCloseTo(len(b, k), 6)
  expect(len(a, "absorbed")).toBeCloseTo((L_MAX * terms.absorbed) / REF_W_M2, 2)
})

test("arrowDirectionsAndNegativeFluxFlip", () => {
  expect(arrowGeometry("absorbed", 500, 200).y2).toBe(SURF_Y) // into the surface
  expect(arrowGeometry("radiated", 500, 200).y2).toBeLessThan(SURF_Y) // out
  expect(arrowGeometry("radiated", -500, 200).y2).toBeGreaterThan(SURF_Y) // net radiation in at night
  expect(arrowGeometry("conducted", 100, 200).y2).toBeGreaterThan(200)
  expect(arrowGeometry("conducted", Number.NaN, 200)).toEqual({
    x: 300,
    y1: 200,
    y2: 200,
  })
})

test("rayPointsFallThenReflectOrVanish", () => {
  const down = rayPoints(100, true, 0.25)
  expect(down.on).toBe(true)
  expect(down.y2).toBeLessThan(SURF_Y)
  expect(rayPoints(100, false, 0.75).on).toBe(false) // absorbed: gone at the surface
  const up = rayPoints(100, true, 0.75)
  expect(up.on).toBe(true)
  expect(up.y2).toBeLessThan(SURF_Y)
  expect(up.x2).toBeGreaterThan(100) // the reflected ray leaves on the other side
})

test("everyMovingElementHasADataSourceH10", async () => {
  const els = await elementsOf(physicsScene(base))
  for (const e of els.filter(
    (x) =>
      x.attrs["data-ray"] !== undefined ||
      x.attrs["data-arrow"] !== undefined ||
      x.attrs["data-anim"] === "phys-temp",
  ))
    expect(e.attrs["data-source"], JSON.stringify(e.attrs)).toBeTruthy()
})

test("noScatterAndNoPerLayerTemperatureH9H8", async () => {
  const html = physicsScene(base)
  expect(html).not.toMatch(/scatter/i)
  const els = await elementsOf(html)
  // exactly one temperature number in the pane, none per layer
  expect(els.filter((e) => e.attrs["data-anim"] === "phys-temp").length).toBe(1)
  for (const m of html.matchAll(/<title>([^<]*)<\/title>/g))
    expect(m[1]).toMatch(/^[a-z]+$/) // a layer's only text is its name
})

test("midcoatOffDrawsNoMidcoatLayerF5", async () => {
  const els = await elementsOf(
    physicsScene({ ...base, layers: { ...layers, midcoat: false } }),
  )
  expect(els.some((e) => e.attrs["data-layer"] === "midcoat")).toBe(false)
  expect(els.some((e) => e.attrs["data-layer"] === "topcoat")).toBe(true)
})

test("bareAluminiumDrawsOnlyTheMetal", async () => {
  const els = await elementsOf(physicsScene({ ...base, pane: "aluminium" }))
  expect(
    els.filter((e) => e.attrs["data-layer"]).map((e) => e.attrs["data-layer"]),
  ).toEqual(["aluminium"])
})

test("noSpectrumSaysSoAndDrawsNoRaysF1", async () => {
  const els = await elementsOf(physicsScene({ ...base, bands: null }))
  expect(els.some((e) => e.attrs["data-ray"] !== undefined)).toBe(false)
  expect(els.some((e) => e.attrs["data-anim"] === "no-spectrum")).toBe(true)
  expect(els.filter((e) => e.attrs["data-arrow"]).length).toBe(4) // temperature and arrows still run
})

test("illustrativeScaleLabelIsInsideTheDrawingH15", () => {
  expect(physicsScene(base)).toContain("Illustrative scale")
})

test("badInputIsABuildErrorUnknownPaneAndTextIsEscapedF8F9", async () => {
  expectBuildError(
    () => physicsScene({ ...base, pane: "third" as never }),
    "PhysicsScene",
  )
  expectBuildError(
    () => physicsScene({ ...base, tK: Number.NaN }),
    "PhysicsScene",
  )
  expectBuildError(() => physicsScene({ ...base, source: "" }), "PhysicsScene")
  expectBuildError(
    () => physicsScene({ ...base, terms: { ...terms, radiated: Number.NaN } }),
    "PhysicsScene",
  )
  expect(
    (await elementsOf(physicsScene({ ...base, source: XSS }))).some(
      (e) => e.tag === "img",
    ),
  ).toBe(false)
})
