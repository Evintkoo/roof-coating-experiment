// The one-variable sweep (plan 08 FR-5 to FR-8, D4, D6, D7): the same `liveSimulate` the live simulator uses, once per sweep point,
// every other input held at the live simulator's values. A point is a pure function of (base inputs, variable, value, draws, seed),
// so the result cannot depend on which worker computed it or when. The control lines are recomputed per point (D7). Pure.

import { DESIGN_KEYS } from "../../web/liveState"
import type { MaterialRanges, WeatherConfig } from "../config"
import { PhysicsRangeError, SpandekError } from "../errors"
import { VARS } from "../opt/vars"
import type { ModelContext } from "../pipeline/context"
import {
  type LiveInputs,
  type LiveResult,
  liveSimulate,
} from "../pipeline/live"
import type { Outcome } from "../pipeline/stackProps"

export type SweepGroup = "design" | "ph" | "scenario"
export type SweepVar = {
  key: string
  group: SweepGroup
  label: string
  min: number
  max: number
  unit: string
  /** Set for the two pigment grade diameters: a material constant of the context, not a live-simulator input. */
  grade?: "tio2" | "baso4"
}
export type SweepPoint = {
  value: number
  nominal: Outcome
  bands: LiveResult["bands"]
  c0: Outcome
  c1: Outcome
}

export class SweepError extends SpandekError {
  constructor(message: string) {
    super(4, "sweep", undefined, message)
  }
}

export const SWEEP_POINTS = 41

const LABELS: Record<string, string> = {
  primer_gptes_molfrac: "Primer GPTES mole fraction",
  primer_dft_um: "Primer DFT",
  midcoat_pvc: "Midcoat PVC",
  midcoat_tio2_fraction: "Midcoat TiO2 share of pigment",
  midcoat_dft_um: "Midcoat DFT",
  topcoat_mtes_molfrac: "Topcoat MTES mole fraction",
  topcoat_dft_um: "Topcoat DFT",
  d_tio2_um: "TiO2 grade (mean particle diameter)",
  d_baso4_um: "BaSO4 grade (mean particle diameter)",
  ph: "Sol-gel pH",
  irradiance_w_m2: "Peak irradiance",
  t_air_c: "Air temperature",
  wind_m_s: "Wind speed",
}

/** The 13 sweepable variables, every range from configuration (MaterialRanges, the grade bounds of plan 05, WeatherConfig). */
export function sweepVariables(
  ranges: MaterialRanges,
  weather: WeatherConfig,
): SweepVar[] {
  const out: SweepVar[] = []
  for (const k of DESIGN_KEYS)
    out.push({
      key: k,
      group: "design",
      label: LABELS[k] as string,
      min: ranges[k].min,
      max: ranges[k].max,
      unit: ranges[k].unit,
    })
  for (const [id, grade] of [
    ["d_tio2_um", "tio2"],
    ["d_baso4_um", "baso4"],
  ] as const) {
    const g = VARS.find((v) => v.id === id)
    if (!g) throw new SweepError(`no grade range for ${id}`)
    out.push({
      key: id,
      group: "design",
      label: LABELS[id] as string,
      min: g.lo,
      max: g.hi,
      unit: "um",
      grade,
    })
  }
  out.push({
    key: "ph",
    group: "ph",
    label: LABELS.ph as string,
    min: ranges.sol_gel_ph.min,
    max: ranges.sol_gel_ph.max,
    unit: ranges.sol_gel_ph.unit,
  })
  for (const k of ["irradiance_w_m2", "t_air_c", "wind_m_s"] as const)
    out.push({
      key: k,
      group: "scenario",
      label: LABELS[k] as string,
      min: weather[k].values[0],
      max: weather[k].values[2],
      unit: weather[k].unit,
    })
  return out
}

/** F3: a zero-width (or inverted, or non-finite) range cannot be swept. */
export const isSweepable = (v: SweepVar): boolean =>
  Number.isFinite(v.min) && Number.isFinite(v.max) && v.max > v.min

/** The layer that has to be on for the variable to matter (F5), or null. */
export function layerOf(v: SweepVar): "primer" | "midcoat" | "topcoat" | null {
  if (v.key.startsWith("primer_") || v.key === "ph") return "primer"
  if (v.key.startsWith("midcoat_") || v.grade) return "midcoat"
  if (v.key.startsWith("topcoat_")) return "topcoat"
  return null
}

/**
 * `n` ascending values over the range; the interior grid point nearest the live value is replaced by it, so the live value is on the
 * grid (D6) and the sweep still runs over the whole configured range, end to end.
 */
export function sweepValues(v: SweepVar, live: number, n: number): number[] {
  if (!isSweepable(v))
    throw new SweepError(`${v.key} is fixed in this configuration`)
  if (!Number.isInteger(n) || n < 3)
    throw new SweepError("a sweep needs at least three points")
  const xs = Array.from({ length: n }, (_, i) =>
    i === n - 1 ? v.max : v.min + ((v.max - v.min) * i) / (n - 1),
  )
  if (
    Number.isFinite(live) &&
    live >= v.min &&
    live <= v.max &&
    !xs.includes(live)
  ) {
    let at = 1
    for (let i = 2; i < n - 1; i++)
      if (
        Math.abs((xs[i] as number) - live) < Math.abs((xs[at] as number) - live)
      )
        at = i
    xs[at] = live
  }
  return xs
}

/** The live inputs with the variable set to `value` (a grade variable leaves the inputs alone: see sweepContext). */
export function sweepInputs(
  base: LiveInputs,
  v: SweepVar,
  value: number,
): LiveInputs {
  if (v.grade) return base
  if (v.key === "ph") return { ...base, ph: value }
  if (v.group === "scenario")
    return { ...base, scenario: { ...base.scenario, [v.key]: value } }
  return { ...base, design: { ...base.design, [v.key]: value } }
}

/** The context with a grade diameter set to `value`; any other variable returns the context itself. */
export function sweepContext(
  ctx: ModelContext,
  v: SweepVar,
  value: number,
): ModelContext {
  const g = v.grade
  if (!g) return ctx
  const m = ctx.mat[g]
  return {
    ...ctx,
    mat: {
      ...ctx.mat,
      [g]: { ...m, diameter_um: { ...m.diameter_um, value } },
    },
  }
}

/** The live value of a variable: the live input, or the context constant for a grade. */
export function liveValueOf(
  v: SweepVar,
  base: LiveInputs,
  ctx: ModelContext,
): number {
  if (v.grade) return ctx.mat[v.grade].diameter_um.value
  if (v.key === "ph") return base.ph
  if (v.group === "scenario")
    return base.scenario[v.key as keyof LiveInputs["scenario"]]
  return base.design[v.key as keyof LiveInputs["design"]]
}

const plain = (o: Outcome): Outcome => {
  const { t_surface_k: _drop, ...rest } = o
  return rest
}

/** Evaluate the sweep points `idx` (indices into `values`): one `liveSimulate` each, same draws and seed as the live simulator. */
export function sweepChunk(
  ctx: ModelContext,
  base: LiveInputs,
  v: SweepVar,
  values: readonly number[],
  idx: readonly number[],
  nDraws: number,
  seed: number,
): { index: number; point: SweepPoint }[] {
  return idx.map((index) => {
    const value = values[index]
    if (value === undefined)
      throw new SweepError(`point ${index} is outside the sweep`)
    const r = liveSimulate(
      sweepInputs(base, v, value),
      sweepContext(ctx, v, value),
      nDraws,
      seed,
    )
    return {
      index,
      point: {
        value,
        nominal: plain(r.nominal),
        bands: r.bands,
        c0: plain(r.controls.C0),
        c1: plain(r.controls.C1),
      },
    }
  })
}

/** A point the model refused (a value outside a model range, F3): reported, never drawn, never a hang. */
export type SweepFailure = {
  failed: true
  value: number
  reason: "physics_range"
}
export type SweepOutcome = SweepPoint | SweepFailure
export const isFailure = (o: SweepOutcome): o is SweepFailure =>
  (o as SweepFailure).failed === true

/** `sweepChunk` one point at a time, so a `PhysicsRangeError` fails that point only (F3). Any other error still throws. */
export function sweepChunkSafe(
  ctx: ModelContext,
  base: LiveInputs,
  v: SweepVar,
  values: readonly number[],
  idx: readonly number[],
  nDraws: number,
  seed: number,
): { index: number; value: SweepOutcome }[] {
  return idx.map((index) => {
    try {
      const o = sweepChunk(ctx, base, v, values, [index], nDraws, seed)[0]
      return { index, value: (o as { point: SweepPoint }).point }
    } catch (e) {
      if (e instanceof PhysicsRangeError)
        return {
          index,
          value: {
            failed: true as const,
            value: values[index] as number,
            reason: "physics_range" as const,
          },
        }
      throw e
    }
  })
}

// ---- the panel states and their words (shared by the markup and the panel; kept here so the panel need not import the markup) ----
export const SWEEP_STATES = [
  "idle",
  "running",
  "ready",
  "stale",
  "error",
] as const
export type SweepState = (typeof SWEEP_STATES)[number]

export const STATE_WORDS: Record<SweepState, string> = {
  idle: "Choose a variable and press Play range. The range is computed in your browser first, then played.",
  running: "Computing the range in your browser.",
  ready: "The range is computed. Playing only moves the cursor.",
  stale:
    "The live settings changed, so this range is out of date. Press Play range to compute it again.",
  error:
    "The range could not be computed. The static results on this page are unaffected.",
}
