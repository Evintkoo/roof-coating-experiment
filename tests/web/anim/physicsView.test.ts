import { beforeAll, expect, test } from "bun:test"
import { BandsError } from "../../../src/core/anim/bands"
import type { ModelContext } from "../../../src/core/pipeline/context"
import {
  type LiveInputs,
  type LiveResult,
  liveSimulate,
} from "../../../src/core/pipeline/live"
import {
  bandsOf,
  idlePane,
  physicsProps,
  RAYS_MAX,
} from "../../../src/web/anim/physicsView"
import { watchPhysics } from "../../../src/web/design/organisms/watchPhysics"
import { LIVE_SEED } from "../../../src/web/liveState"
import { testCtx } from "../../support/dayData"
import { twelveSettings } from "../../support/liveSettings"

let ctx: ModelContext
let inputs: LiveInputs
let r: LiveResult
beforeAll(async () => {
  ctx = await testCtx()
  inputs = twelveSettings(ctx)[0] as LiveInputs
  r = liveSimulate(inputs, ctx, 2, LIVE_SEED)
})
const now = () => ({
  recipe: idlePane(ctx, inputs, r, "recipe"),
  c0: idlePane(ctx, inputs, r, "c0"),
})
const opts = {
  state: "idle" as const,
  speed: 1 as const,
  reduced: false,
  lane: "worker" as const,
}

test("idlePaneIsTheSolvedSeriesFirstNodeH10", () => {
  const p = idlePane(ctx, inputs, r, "recipe")
  expect(p.tK).toBe(r.series.t_k[0] as number)
  expect(p.terms.absorbed).toBe(0) // 00:00: no sun
  expect(idlePane(ctx, inputs, r, "c0").tK).toBe(
    (r.controls.C0.t_surface_k as Float64Array)[0] as number,
  )
})

test("propsBuildTheWholePanelAndTheMarkupIsTheSameForTheSameModelState", () => {
  const p = physicsProps(ctx, inputs, r, now(), opts)
  expect(p.recipe.scene.rays).toBe(RAYS_MAX)
  expect(p.sliders.map((s) => s.id)).toEqual([
    "phys-irradiance",
    "phys-t-air",
    "phys-wind",
  ])
  expect(p.sliders.map((s) => s.value)).toEqual([
    inputs.scenario.irradiance_w_m2,
    inputs.scenario.t_air_c,
    inputs.scenario.wind_m_s,
  ])
  expect(watchPhysics(p)).toBe(
    watchPhysics(physicsProps(ctx, inputs, r, now(), opts)),
  )
  expect(p.layerOff).toBeUndefined()
})

test("aLayerThatIsOffIsNamedF5F6", () => {
  const off = { ...inputs, layers: { ...inputs.layers, midcoat: false } }
  const r2 = liveSimulate(off, ctx, 2, LIVE_SEED)
  const p = physicsProps(
    ctx,
    off,
    r2,
    {
      recipe: idlePane(ctx, off, r2, "recipe"),
      c0: idlePane(ctx, off, r2, "c0"),
    },
    opts,
  )
  expect(p.layerOff).toBe("midcoat")
  // all layers off: the recipe pane equals the bare pane (no error)
  const none = {
    ...inputs,
    layers: { primer: false, midcoat: false, topcoat: false },
  }
  const r3 = liveSimulate(none, ctx, 2, LIVE_SEED)
  expect(idlePane(ctx, none, r3, "recipe").tK).toBe(
    idlePane(ctx, none, r3, "c0").tK,
  )
})

test("noSpectrumGivesNullBandsF1AndUnequalGridsAreATypedErrorF2", () => {
  expect(bandsOf(ctx, { ...r, spectrum: undefined as never })).toBeNull()
  expect(() =>
    bandsOf(ctx, {
      ...r,
      spectrum: { ...r.spectrum, nominal: r.spectrum.nominal.slice(1) },
    }),
  ).toThrow(BandsError)
  expect(
    physicsProps(
      ctx,
      inputs,
      { ...r, spectrum: undefined as never },
      now(),
      opts,
    ).recipe.scene.bands,
  ).toBeNull()
})

test("noRaysAreShownAtNightAndAllAtThePeakFR6", async () => {
  const { raysShown } = await import("../../../src/web/anim/physicsView")
  const night = physicsProps(ctx, inputs, r, now(), opts)
  expect(night.recipe.scene.visible).toBe(0) // 00:00: G is zero, so the page before any script shows no rays
  expect(
    raysShown(
      { ...night.recipe.scene.terms, absorbed: 100, reflected: 700 },
      800,
    ),
  ).toBe(RAYS_MAX)
  expect(
    raysShown(
      { ...night.recipe.scene.terms, absorbed: 50, reflected: 350 },
      800,
    ),
  ).toBe(Math.round(RAYS_MAX / 2))
  expect(raysShown(night.recipe.scene.terms, 0)).toBe(0)
})
