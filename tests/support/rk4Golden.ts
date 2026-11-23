// Digest of every RK4 output the oracle cases produce, bit for bit: t_max_c, q_in_mean_w_m2 and the 144 day-2 points of simulateDay and
// simulateSeriesDay. `tests/fixtures/rk4_golden.json` was written from the code BEFORE the plan 09 extraction of rk4Step; the test
// goldensUnchangedAfterRk4StepExtraction recomputes it, so any change of arithmetic or operation order fails.
import { createHash } from "node:crypto"
import { join } from "node:path"
import type { HourlySeries } from "../../src/core/indonesia/series"
import { simulateDay, type ThermalInputs } from "../../src/core/models/thermal"
import {
  type SeriesParams,
  simulateSeriesDay,
} from "../../src/core/models/thermalSeries"
import { repoRoot } from "../helpers"

type R = { t_max_c: number; q_in_mean_w_m2: number; t_surface_k: Float64Array }
const digest = (rs: R[]): string => {
  const h = createHash("sha256")
  for (const r of rs) {
    h.update(Float64Array.of(r.t_max_c, r.q_in_mean_w_m2))
    h.update(r.t_surface_k)
  }
  return h.digest("hex")
}
export async function rk4Digests(): Promise<{
  day: string
  series: string
  cases: number
}> {
  const th = (await Bun.file(
    join(repoRoot, "tests/fixtures/oracle/thermal.json"),
  ).json()) as { cases: { inputs: ThermalInputs }[] }
  const se = (await Bun.file(
    join(repoRoot, "tests/fixtures/oracle/thermalSeries.json"),
  ).json()) as {
    h_a: number
    h_b: number
    cases: {
      params: SeriesParams
      series: Record<keyof HourlySeries, number[]>
    }[]
  }
  const day = th.cases.map((c) => simulateDay(c.inputs))
  const series = se.cases.map((c) => {
    const s = Object.fromEntries(
      Object.entries(c.series).map(([k, v]) => [k, Float64Array.from(v)]),
    ) as unknown as HourlySeries
    return simulateSeriesDay(c.params, s, se.h_a, se.h_b)
  })
  return {
    day: digest(day),
    series: digest(series),
    cases: day.length + series.length,
  }
}
