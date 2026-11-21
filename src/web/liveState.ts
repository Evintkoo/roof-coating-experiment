import type { MaterialRanges, WeatherConfig } from "../core/config"
import type { LiveInputs } from "../core/pipeline/live"

export type LiveState = { inputs: LiveInputs }

export const DESIGN_KEYS = [
  "primer_gptes_molfrac",
  "primer_dft_um",
  "midcoat_pvc",
  "midcoat_tio2_fraction",
  "midcoat_dft_um",
  "topcoat_mtes_molfrac",
  "topcoat_dft_um",
] as const

const mid = (r: { min: number; max: number }) => 0.5 * (r.min + r.max)
const clamp = (v: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

/** The page opens on the midpoint of every plan-01 range, all layers on, and the middle level of each weather factor. */
export function defaultLiveState(
  ranges: MaterialRanges,
  weather: WeatherConfig,
): LiveState {
  const design = {} as Record<(typeof DESIGN_KEYS)[number], number>
  for (const k of DESIGN_KEYS) design[k] = mid(ranges[k])
  return {
    inputs: {
      design,
      ph: mid(ranges.sol_gel_ph),
      layers: { primer: true, midcoat: true, topcoat: true },
      scenario: {
        irradiance_w_m2: weather.irradiance_w_m2.values[1],
        t_air_c: weather.t_air_c.values[1],
        wind_m_s: weather.wind_m_s.values[1],
      },
    },
  }
}

/** D10: every number inside its plan-01 range (design, pH) or the extremes of the weather levels (scenario); NaN falls back to the midpoint. */
export function clampInputs(
  inp: LiveInputs,
  ranges: MaterialRanges,
  weather: WeatherConfig,
): LiveInputs {
  const d = defaultLiveState(ranges, weather).inputs
  const design = {} as LiveInputs["design"]
  for (const k of DESIGN_KEYS)
    design[k] = clamp(inp.design[k], ranges[k].min, ranges[k].max, d.design[k])
  const lv = (w: { values: readonly [number, number, number] }) =>
    [w.values[0], w.values[2]] as const
  const [i0, i1] = lv(weather.irradiance_w_m2)
  const [a0, a1] = lv(weather.t_air_c)
  const [w0, w1] = lv(weather.wind_m_s)
  return {
    design,
    ph: clamp(inp.ph, ranges.sol_gel_ph.min, ranges.sol_gel_ph.max, d.ph),
    layers: { ...inp.layers },
    scenario: {
      irradiance_w_m2: clamp(
        inp.scenario.irradiance_w_m2,
        i0,
        i1,
        d.scenario.irradiance_w_m2,
      ),
      t_air_c: clamp(inp.scenario.t_air_c, a0, a1, d.scenario.t_air_c),
      wind_m_s: clamp(inp.scenario.wind_m_s, w0, w1, d.scenario.wind_m_s),
    },
  }
}

export type SliderSpec = {
  group: "design" | "ph" | "scenario"
  key: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
}

const LABELS: Record<string, string> = {
  primer_gptes_molfrac: "Primer GPTES mole fraction",
  primer_dft_um: "Primer DFT",
  midcoat_pvc: "Midcoat PVC",
  midcoat_tio2_fraction: "Midcoat TiO2 share of pigment",
  midcoat_dft_um: "Midcoat DFT",
  topcoat_mtes_molfrac: "Topcoat MTES mole fraction",
  topcoat_dft_um: "Topcoat DFT",
  ph: "Sol-gel pH",
  irradiance_w_m2: "Peak irradiance",
  t_air_c: "Air temperature",
  wind_m_s: "Wind speed",
}

/** Slider min, max, step and start value for every live input, from MaterialRanges and WeatherConfig only (never hard-coded). */
export function sliderSpecs(
  ranges: MaterialRanges,
  weather: WeatherConfig,
): SliderSpec[] {
  const start = defaultLiveState(ranges, weather).inputs
  const out: SliderSpec[] = []
  const add = (
    group: SliderSpec["group"],
    key: string,
    unit: string,
    min: number,
    max: number,
    value: number,
  ) =>
    out.push({
      group,
      key,
      label: LABELS[key] ?? key,
      unit,
      min,
      max,
      step: (max - min) / 200,
      value,
    })
  for (const k of DESIGN_KEYS)
    add(
      "design",
      k,
      ranges[k].unit,
      ranges[k].min,
      ranges[k].max,
      start.design[k],
    )
  add(
    "ph",
    "ph",
    ranges.sol_gel_ph.unit,
    ranges.sol_gel_ph.min,
    ranges.sol_gel_ph.max,
    start.ph,
  )
  for (const k of ["irradiance_w_m2", "t_air_c", "wind_m_s"] as const) {
    const w = weather[k]
    add("scenario", k, w.unit, w.values[0], w.values[2], start.scenario[k])
  }
  return out
}

/** N_LIVE draws in the browser (batch uses 256); the fixed seed keeps the bands from jittering while a slider moves. */
export const N_LIVE = 32
export const LIVE_SEED = 20261121
