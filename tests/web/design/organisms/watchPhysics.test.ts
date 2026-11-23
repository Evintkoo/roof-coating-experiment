import { expect, test } from "bun:test"
import type { Band } from "../../../../src/core/anim/bands"
import type { Terms } from "../../../../src/core/anim/stepper"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import { esc } from "../../../../src/web/design/html"
import { HONESTY_LABEL } from "../../../../src/web/design/organisms/watchDay"
import {
  PHYSICS_NOTES,
  PHYSICS_STATES,
  type PhysicsSlider,
  RANGE_NOTE,
  TRANSIENT_NOTE,
  type WatchPhysicsProps,
  watchPhysics,
} from "../../../../src/web/design/organisms/watchPhysics"
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
const pane = {
  scene: { bands, rays: 60, layers, terms, tK: 330 },
  drop: { tSurfaceK: 330, tInsideK: 300, rTotal: 0.5 },
}
const sliders: PhysicsSlider[] = [
  {
    id: "phys-irradiance",
    label: "Peak irradiance",
    unit: "W/m²",
    min: 600,
    max: 1100,
    step: 2.5,
    value: 850,
  },
  {
    id: "phys-t-air",
    label: "Air temperature",
    unit: "°C",
    min: 24,
    max: 38,
    step: 0.07,
    value: 31,
  },
  {
    id: "phys-wind",
    label: "Wind speed",
    unit: "m/s",
    min: 0.5,
    max: 5,
    step: 0.02,
    value: 2,
  },
]
const props = (o: Partial<WatchPhysicsProps> = {}): WatchPhysicsProps => ({
  state: "idle",
  speed: 1,
  reduced: false,
  lane: "worker",
  recipe: pane,
  aluminium: { ...pane, scene: { ...pane.scene, layers } },
  sliders,
  ...o,
})

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R41 WatchPhysics", [...PHYSICS_STATES])
})

test("tokensOnly", () => {
  expectTokenOnly(ORGANISM_CSS.watchPhysics as string)
})

test("hasEveryControlTwoPanesAndTheLabelsH10H15", async () => {
  const html = watchPhysics(props())
  const els = await elementsOf(html)
  const anim = els.map((e) => e.attrs["data-anim"]).filter(Boolean)
  for (const k of [
    "phys-play",
    "phys-step",
    "phys-restart",
    "phys-speed",
    "phys-time",
    "phys-status",
    "phys-diff",
    "phys-residual",
  ])
    expect(anim, k).toContain(k)
  expect(
    els.filter((e) => e.attrs["data-pane"]).map((e) => e.attrs["data-pane"]),
  ).toEqual(["recipe", "aluminium"])
  expect(
    els.filter((e) => e.tag === "input" && e.attrs["type"] === "range").length,
  ).toBe(3)
  expect(html).toContain(HONESTY_LABEL)
  expect(html).toContain("Illustrative scale")
  expect(html).toContain(
    "rays show fractions, not photons".replace("rays", "Rays"),
  )
  expect(html).toContain(esc(PHYSICS_NOTES.drop))
  expect(html).toContain("ageing is not shown")
  // every moving value of the readouts names its source
  for (const e of els.filter(
    (x) =>
      x.attrs["data-anim"] === "phys-diff" ||
      x.attrs["data-anim"] === "phys-residual",
  ))
    expect(e.attrs["data-source"]).toMatch(/^stepper:/)
})

test("nothingAutoplaysTheIdleButtonIsPlayH11", async () => {
  const els = await elementsOf(watchPhysics(props()))
  const play = els.find((e) => e.attrs["data-anim"] === "phys-play")
  expect(play?.attrs["data-state"]).toBe("paused")
  expect(watchPhysics(props({ state: "playing" }))).toContain(
    'data-state="playing"',
  )
})

test("transientNoteAfterAChangeH15", () => {
  expect(watchPhysics(props({ state: "idle" }))).not.toContain(TRANSIENT_NOTE)
  expect(watchPhysics(props({ state: "transient" }))).toContain(TRANSIENT_NOTE)
})

test("layerOffNoteF5", async () => {
  const off = watchPhysics(props({ layerOff: "midcoat" }))
  expect(off).toContain("Midcoat is off in the live simulator")
  const els = await elementsOf(off)
  expect(
    els.find((e) => e.attrs["data-anim"] === "phys-layer-off")?.attrs["hidden"],
  ).toBeUndefined()
  const on = await elementsOf(watchPhysics(props()))
  expect(
    on.find((e) => e.attrs["data-anim"] === "phys-layer-off")?.attrs["hidden"],
  ).toBeDefined()
})

test("inlineLaneSaysSingleLaneF4", async () => {
  const els = await elementsOf(watchPhysics(props({ lane: "inline" })))
  expect(
    els.find((e) => e.attrs["data-anim"] === "phys-lane")?.attrs["hidden"],
  ).toBeUndefined()
  expect(RANGE_NOTE).toBe("value outside the model range")
})

test("noForbiddenWordsAndNoScatterH15", () => {
  const html = watchPhysics(props({ state: "transient", layerOff: "primer" }))
  expect(html).not.toMatch(
    /recommended|\bbest\b|optimal|real-time measurement|scatter/i,
  )
})

test("closedUnionsAndBuildErrorsF8F9", async () => {
  expectBuildError(
    () => watchPhysics(props({ state: "weird" as never })),
    "WatchPhysics",
  )
  expectBuildError(
    () => watchPhysics(props({ lane: "gpu" as never })),
    "WatchPhysics",
  )
  expectBuildError(
    () => watchPhysics(props({ layerOff: "x" as never })),
    "WatchPhysics",
  )
  expectBuildError(
    () => watchPhysics(props({ speed: 3 as never })),
    "WatchPhysics",
  )
  expectBuildError(
    () => watchPhysics(props({ sliders: sliders.slice(0, 2) })),
    "WatchPhysics",
  )
  const bad = [...sliders]
  bad[0] = { ...sliders[0], label: XSS } as PhysicsSlider
  expect(
    (await elementsOf(watchPhysics(props({ sliders: bad })))).some(
      (e) => e.tag === "img",
    ),
  ).toBe(false)
})
