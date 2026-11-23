// Plan 09: the props of the live physics panel from the model: the band split of the live spectrum, the pane numbers of a stepper frame,
// the slider specs of the three scenario inputs. Pure and shared by the report build (the first picture) and the page script (every
// redraw), so the page before any script runs is the same drawing the script then keeps current.
import { type Band, bandSplit } from "../../core/anim/bands"
import {
  balanceTerms,
  paramsFromInputs,
  type Terms,
} from "../../core/anim/stepper"
import type { ModelContext } from "../../core/pipeline/context"
import type { LiveInputs, LiveResult } from "../../core/pipeline/live"
import type { Speed } from "../design/atoms/speedSelect"
import type {
  PhysicsSlider,
  PhysicsState,
  WatchPhysicsProps,
} from "../design/organisms/watchPhysics"
import { sliderSpecs } from "../liveState"

/** Rays drawn at full sunlight; the panel shows a share of them proportional to G(t). */
export const RAYS_MAX = 150
export type PaneNow = { tK: number; terms: Terms }

/** The bands of the live spectrum, or null when the result carries none (F1). A bad grid throws a BandsError (F2). */
export function bandsOf(ctx: ModelContext, r: LiveResult): Band[] | null {
  const s = r.spectrum?.nominal
  return s ? bandSplit(ctx.wlUm, s, ctx.g173) : null
}

/** The pane at the start of the batch day 2 (00:00): the solved series' first node, with the balance terms of that node. */
export function idlePane(
  ctx: ModelContext,
  inputs: LiveInputs,
  r: LiveResult,
  which: "recipe" | "c0",
): PaneNow {
  const tK = (
    which === "recipe"
      ? r.series.t_k
      : (r.controls.C0.t_surface_k as Float64Array)
  )[0] as number
  return {
    tK,
    terms: balanceTerms(tK, 86400, paramsFromInputs(ctx, inputs, which)),
  }
}

export function physicsSliders(
  ctx: ModelContext,
  inputs: LiveInputs,
): PhysicsSlider[] {
  const ids: Record<string, string> = {
    irradiance_w_m2: "phys-irradiance",
    t_air_c: "phys-t-air",
    wind_m_s: "phys-wind",
  }
  return sliderSpecs(ctx.ranges, ctx.weather)
    .filter((s) => s.group === "scenario")
    .map((s) => ({
      id: ids[s.key] as string,
      label: s.label,
      unit: s.unit.replace(/^W\/m2 .*$/, "W/m²").replace(/^degC .*$/, "°C"),
      min: s.min,
      max: s.max,
      step: s.step,
      value: inputs.scenario[s.key as keyof LiveInputs["scenario"]],
    }))
}

export function physicsProps(
  ctx: ModelContext,
  inputs: LiveInputs,
  r: LiveResult,
  now: { recipe: PaneNow; c0: PaneNow },
  o: {
    state: PhysicsState
    speed: Speed
    reduced: boolean
    lane: "worker" | "inline"
  },
): WatchPhysicsProps {
  const bands = bandsOf(ctx, r)
  const roof = ctx.weather.roof
  const drop = (p: PaneNow) => ({
    tSurfaceK: p.tK,
    tInsideK: roof.t_inside_c.value + 273.15,
    rTotal: roof.r_total_m2k_w.value,
  })
  const off = (["midcoat", "primer", "topcoat"] as const).find(
    (l) => !inputs.layers[l],
  )
  return {
    state: o.state,
    speed: o.speed,
    reduced: o.reduced,
    lane: o.lane,
    ...(off ? { layerOff: off } : {}),
    recipe: {
      scene: {
        bands,
        rays: RAYS_MAX,
        layers: inputs.layers,
        terms: now.recipe.terms,
        tK: now.recipe.tK,
      },
      drop: drop(now.recipe),
    },
    aluminium: {
      scene: {
        bands,
        rays: RAYS_MAX,
        layers: { primer: false, midcoat: false, topcoat: false },
        terms: now.c0.terms,
        tK: now.c0.tK,
      },
      drop: drop(now.c0),
    },
    sliders: physicsSliders(ctx, inputs),
  }
}
