// Plan 09 Layer A: the live stepper. The same single-node RK4 balance as simulateDay (netFluxWM2 and rk4Step of thermal.ts, dt 60 s),
// resumable: it holds (model time, T) and takes new parameters at any step boundary. Pure: no clock, no I/O, no randomness. The only
// physics here is the repo's; nothing is added (the balance terms are the terms netFluxWM2 sums).

import { scenarioFrom } from "../design"
import { PhysicsRangeError } from "../errors"
import { requireIn } from "../models/ranges"
import {
  halfSine,
  netFluxWM2,
  rk4Step,
  SIGMA,
  type ThermalInputs,
  validateThermalInputs,
} from "../models/thermal"
import type { ModelContext } from "../pipeline/context"
import type { LiveInputs } from "../pipeline/live"
import { CONTROL_LAYERS, stackProps } from "../pipeline/stackProps"
import { HOURS_PER_SECOND } from "./timeline"

/** Fixed model step (plan 09 `T_dt_s`, the batch step). */
export const DT_S = 60
export const DAY_STEPS = 1440
/** A request never asks for more than a day of steps (F10). */
export const MAX_STEPS_PER_REQUEST = DAY_STEPS
/** Model steps per real second at speed 1x: a day in 16 s is 90 steps per second. */
export const STEPS_PER_SECOND = (HOURS_PER_SECOND * 3600) / DT_S

export type Forcing = {
  g: number
  t_air_k: number
  t_sky_k: number
  h_conv_w_m2k: number
}
/** `thermal` carries the static part (r_solar, emissivity, c_a, t_inside, R_total) and the scenario constants; `forcing` is what varies with time. */
export type StepperParams = {
  thermal: ThermalInputs
  forcing: (tS: number) => Forcing
}
export type Terms = {
  absorbed: number
  reflected: number
  radiated: number
  convected: number
  conducted: number
  stored: number
}
/** The step that leaves the node (tS, tK): terms at the node; `stored` is c_a times the step's mean RK4 slope; residual = the five terms' imbalance. */
export type StepFrame = {
  tS: number
  tK: number
  terms: Terms
  residual: number
}
export interface Stepper {
  stepN(n: number): StepFrame[]
  setParams(p: StepperParams): void
  state(): { tS: number; tK: number }
}

const clampSteps = (n: number): number =>
  Number.isFinite(n) && n > 0
    ? Math.min(MAX_STEPS_PER_REQUEST, Math.floor(n))
    : 0

/** D2: the whole steps owed for dtMs of real time at `speed`, with the fractional remainder carried. Invalid input owes nothing and keeps the carry. */
export function stepsFor(
  dtMs: number,
  speed: number,
  carry: number,
): { n: number; carry: number } {
  if (
    !(
      Number.isFinite(dtMs) &&
      Number.isFinite(speed) &&
      Number.isFinite(carry)
    ) ||
    dtMs <= 0 ||
    speed <= 0
  )
    return { n: 0, carry }
  const x = carry + (dtMs / 1000) * speed * STEPS_PER_SECOND
  const whole = Math.floor(x)
  return { n: Math.min(MAX_STEPS_PER_REQUEST, whole), carry: x - whole }
}

/** The five terms of the balance at (tK, tS), as netFluxWM2 sums them; `stored` here is the instantaneous c_a dT/dt (= the net flux). */
export function balanceTerms(tK: number, tS: number, p: StepperParams): Terms {
  const f = p.forcing(tS)
  const t = p.thermal
  const absorbed = (1 - t.r_solar) * f.g
  const radiated = t.emissivity * SIGMA * (tK ** 4 - f.t_sky_k ** 4)
  const convected = f.h_conv_w_m2k * (tK - f.t_air_k)
  const conducted = (tK - t.t_inside_k) / t.r_total_m2k_w
  return {
    absorbed,
    reflected: t.r_solar * f.g,
    radiated,
    convected,
    conducted,
    stored: absorbed - radiated - convected - conducted,
  }
}

/** Throws a PhysicsRangeError when the parameters or the forcing at tS leave a model range. */
export function checkParams(p: StepperParams, tS: number): Forcing {
  validateThermalInputs(p.thermal)
  const f = p.forcing(tS)
  const m = "stepper"
  requireIn(m, "g", f.g, 0, 2000)
  requireIn(m, "t_air_k", f.t_air_k, 150, 400)
  requireIn(m, "t_sky_k", f.t_sky_k, 150, 400)
  requireIn(m, "h_conv_w_m2k", f.h_conv_w_m2k, 0, 1000)
  return f
}

export function createStepper(
  p0: StepperParams,
  t0K: number,
  tS0: number,
): Stepper {
  let p = p0
  let tK = t0K
  let tS = tS0
  checkParams(p, tS)
  const scratch: ThermalInputs = { ...p.thermal }
  const slope = (t: number, s: number): number => {
    const f = p.forcing(s)
    scratch.t_air_k = f.t_air_k
    scratch.t_sky_k = f.t_sky_k
    scratch.h_conv_w_m2k = f.h_conv_w_m2k
    return netFluxWM2(t, f.g, scratch) / scratch.c_a_j_m2k
  }
  const load = (): void => {
    Object.assign(scratch, p.thermal)
  }
  return {
    stepN(n) {
      const count = clampSteps(n)
      const out: StepFrame[] = []
      load()
      for (let i = 0; i < count; i++) {
        checkParams(p, tS)
        const terms = balanceTerms(tK, tS, p)
        const next = rk4Step(tK, tS, DT_S, slope)
        if (!Number.isFinite(next))
          throw new PhysicsRangeError(
            "t_surface_k",
            "stepper: integration diverged",
          )
        terms.stored = (p.thermal.c_a_j_m2k * (next - tK)) / DT_S
        const residual =
          terms.absorbed -
          terms.radiated -
          terms.convected -
          terms.conducted -
          terms.stored
        out.push({ tS, tK, terms, residual })
        tK = next
        tS += DT_S
      }
      return out
    },
    setParams(next) {
      checkParams(next, tS) // throws before anything changes: the last valid state and parameters stay
      p = next
      load()
    },
    state: () => ({ tS, tK }),
  }
}

/** D3: a stepper started like the batch (T0 = air temperature at t = 0) and run through day 1, so it stands at the start of day 2. */
export function startLive(p: StepperParams): Stepper {
  const s = createStepper(p, p.thermal.t_air_k, 0)
  s.stepN(DAY_STEPS)
  return s
}

/** The parameters of the recipe or of bare aluminium (C0) for a live setting, built from the same stackProps and scenarioFrom the batch uses. */
export function paramsFromInputs(
  ctx: ModelContext,
  inp: LiveInputs,
  which: "recipe" | "c0",
): StepperParams {
  const s = scenarioFrom(
    inp.scenario.irradiance_w_m2,
    inp.scenario.t_air_c,
    inp.scenario.wind_m_s,
    ctx.weather,
  )
  const sp = stackProps(
    { ...inp.design, ph: inp.ph },
    which === "recipe" ? inp.layers : CONTROL_LAYERS.C0,
    ctx,
  )
  const roof = ctx.weather.roof
  const thermal: ThermalInputs = {
    r_solar: sp.r_solar,
    emissivity: sp.emissivity,
    g_peak_w_m2: s.irradiance_w_m2,
    t_air_k: s.t_air_c + 273.15,
    t_sky_k: s.t_sky_k,
    h_conv_w_m2k: s.h_conv_w_m2k,
    t_inside_k: roof.t_inside_c.value + 273.15,
    r_total_m2k_w: roof.r_total_m2k_w.value,
    c_a_j_m2k: sp.c_a_j_m2k,
  }
  const g = halfSine(thermal.g_peak_w_m2)
  return {
    thermal,
    forcing: (tS) => ({
      g: g(tS),
      t_air_k: thermal.t_air_k,
      t_sky_k: thermal.t_sky_k,
      h_conv_w_m2k: thermal.h_conv_w_m2k,
    }),
  }
}

export type PaneFrames = { recipe: StepFrame[]; c0: StepFrame[] }
/** The two panes (recipe and bare aluminium C0) stepped together from the same code (D6), swapped together or not at all. */
export interface Pair {
  stepN(n: number): PaneFrames
  setParams(inputs: LiveInputs): void
  state(): { recipe: { tS: number; tK: number }; c0: { tS: number; tK: number } }
}
export function createPair(ctx: ModelContext, inputs: LiveInputs): Pair {
  const recipe = startLive(paramsFromInputs(ctx, inputs, "recipe"))
  const c0 = startLive(paramsFromInputs(ctx, inputs, "c0"))
  return {
    stepN: (n) => ({ recipe: recipe.stepN(n), c0: c0.stepN(n) }),
    setParams(next) {
      const pr = paramsFromInputs(ctx, next, "recipe")
      const pc = paramsFromInputs(ctx, next, "c0")
      checkParams(pr, recipe.state().tS) // both checked before either changes
      checkParams(pc, c0.state().tS)
      recipe.setParams(pr)
      c0.setParams(pc)
    },
    state: () => ({ recipe: recipe.state(), c0: c0.state() }),
  }
}
