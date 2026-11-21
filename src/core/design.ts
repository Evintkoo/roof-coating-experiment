import { DESIGN_COLUMNS } from "./columns"
import type { MaterialRanges, WeatherConfig } from "./config"
import { deriveSeed, shuffleInPlace, Xoshiro128 } from "./rng"
import type { DesignRow } from "./schema"

/** n x d Latin hypercube in (0,1) (D11): stream j = deriveSeed(seed, j). */
export function lhsUnit(n: number, d: number, seed: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(d))
  for (let j = 0; j < d; j++) {
    const rng = new Xoshiro128(deriveSeed(seed, j))
    const perm = Array.from({ length: n }, (_, i) => i)
    shuffleInPlace(rng, perm)
    for (let i = 0; i < n; i++) {
      const r = rng.next()
      ;(out[i] as number[])[j] = ((perm[i] as number) + 0.001 + 0.998 * r) / n
    }
  }
  return out
}

const NUM_COLS = DESIGN_COLUMNS.slice(1) as readonly Exclude<
  (typeof DESIGN_COLUMNS)[number],
  "candidate_id"
>[]

export function lhsDesign(
  n: number,
  ranges: MaterialRanges,
  seed: number,
): DesignRow[] {
  const u = lhsUnit(n, NUM_COLS.length, seed)
  return u.map((row, i) => {
    const out: Record<string, string | number> = {
      candidate_id: `SP-${String(i + 1).padStart(3, "0")}`,
    }
    NUM_COLS.forEach((c, j) => {
      const { min, max } = ranges[c]
      out[c] = min + (row[j] as number) * (max - min)
    })
    return out as DesignRow
  })
}

/** D9: L9 orthogonal array rows over (irradiance, air temperature, wind). */
export const L9: readonly (readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2])[] = [
  [0, 0, 0],
  [0, 1, 1],
  [0, 2, 2],
  [1, 0, 1],
  [1, 1, 2],
  [1, 2, 0],
  [2, 0, 2],
  [2, 1, 0],
  [2, 2, 1],
]

export type Scenario = {
  scenario_id: string
  irradiance_w_m2: number
  t_air_c: number
  wind_m_s: number
  h_conv_w_m2k: number
  t_sky_k: number
}

/** Single source of McAdams h = a + b v and Swinbank T_sky = 0.0552 T_air^1.5 (K). */
export function scenarioFrom(
  irradiance_w_m2: number,
  t_air_c: number,
  wind_m_s: number,
  w: WeatherConfig,
): Omit<Scenario, "scenario_id"> {
  return {
    irradiance_w_m2,
    t_air_c,
    wind_m_s,
    h_conv_w_m2k: w.h_conv_a.value + w.h_conv_b.value * wind_m_s,
    t_sky_k: 0.0552 * (t_air_c + 273.15) ** 1.5,
  }
}

export function weatherL9(w: WeatherConfig): Scenario[] {
  return L9.map(([e1, e2, e3], i) => ({
    scenario_id: `W${i + 1}`,
    ...scenarioFrom(
      w.irradiance_w_m2.values[e1],
      w.t_air_c.values[e2],
      w.wind_m_s.values[e3],
      w,
    ),
  }))
}
