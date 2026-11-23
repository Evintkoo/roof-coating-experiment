// 12 deterministic live settings for the plan 08 tests (the default plus 11 moved ones; every design, pH and weather input is moved).
import type { ModelContext } from "../../src/core/pipeline/context"
import type { LiveInputs } from "../../src/core/pipeline/live"
import { defaultLiveState } from "../../src/web/liveState"

export function twelveSettings(c: ModelContext): LiveInputs[] {
  const base = defaultLiveState(c.ranges, c.weather).inputs
  const keys = Object.keys(base.design) as (keyof LiveInputs["design"])[]
  const out: LiveInputs[] = [base]
  for (let i = 1; i < 12; i++) {
    const f = (i * 0.173) % 1
    const design = { ...base.design }
    keys.forEach((k, j) => {
      const r = c.ranges[k]
      design[k] = r.min + (r.max - r.min) * ((f + j * 0.137) % 1)
    })
    const lv = (w: { values: readonly [number, number, number] }) =>
      w.values[0] + (w.values[2] - w.values[0]) * ((f * 1.7) % 1)
    out.push({
      design,
      ph:
        c.ranges.sol_gel_ph.min +
        (c.ranges.sol_gel_ph.max - c.ranges.sol_gel_ph.min) * f,
      layers: { primer: true, midcoat: true, topcoat: true },
      scenario: {
        irradiance_w_m2: lv(c.weather.irradiance_w_m2),
        t_air_c: lv(c.weather.t_air_c),
        wind_m_s: lv(c.weather.wind_m_s),
      },
    })
  }
  return out
}
