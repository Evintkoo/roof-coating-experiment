import type {
  Controls,
  MaterialRanges,
  Materials,
  WeatherConfig,
} from "../config"
import type { NKTable, Spectrum } from "../literature"

/** Everything the simulation reads, loaded once (plan 03 Task 1). Structured-cloneable for workers. */
export type ModelContext = {
  mat: Materials
  weather: WeatherConfig
  ranges: MaterialRanges
  g173: Spectrum
  tio2: NKTable
  baso4: NKTable
  wlUm: Float64Array
  controls: Controls
}

export const WL_POINTS = 221

/** 300..2500 nm in 10 nm steps, in micrometres; computed from integer nm so the endpoints are exactly 0.3 and 2.5. */
export function makeWlGrid(): Float64Array {
  const g = new Float64Array(WL_POINTS)
  for (let i = 0; i < WL_POINTS; i++) g[i] = (300 + 10 * i) / 1000
  return g
}
