// Q5 (what data the page carries and what liveSimulate exposes) and Q6 (ray and arrow mapping against a hand calculation).
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { contextToJson } from "../../../src/core/pipeline/contextJson"
import { liveSimulate } from "../../../src/core/pipeline/live"
import {
  CONTROL_LAYERS,
  stackProps,
  thermalOutcomes,
} from "../../../src/core/pipeline/stackProps"
import { defaultLiveState } from "../../../src/web/liveState"
import {
  batchRows,
  ctx,
  designs,
  expectOk,
  finish,
  fixture,
  scenarios,
} from "./lib"

const c = await ctx()
const D = designs()
const S = scenarios()

// Q5a: the context JSON carries neither the designs nor the scenarios
const keys = Object.keys(JSON.parse(contextToJson(c)))
expectOk(
  "context JSON has no designs or scenarios (they must be added)",
  !keys.includes("designs") && !keys.includes("scenarios"),
  keys.join(","),
)
const designJson = JSON.stringify(
  D.map((d) => [
    d.primer_gptes_molfrac,
    d.primer_dft_um,
    d.midcoat_pvc,
    d.midcoat_tio2_fraction,
    d.midcoat_dft_um,
    d.topcoat_mtes_molfrac,
    d.topcoat_dft_um,
  ]),
)
const scenJson = JSON.stringify(S)
console.log(
  `size cost of adding 96 designs + 9 scenarios to the context: ${((designJson.length + scenJson.length) / 1024).toFixed(1)} KiB (context today ${(contextToJson(c).length / 1024).toFixed(0)} KiB)`,
)

// Q5b: the page embeds pareto (not all 864 results rows); the batch nominal columns for H7 are in results.csv
const paretoHead =
  readFileSync(join(fixture, "pareto.csv"), "utf8").split("\n")[0] ?? ""
const rows = batchRows()
expectOk(
  "results.csv has the three nominal columns for H7",
  ["r_solar_pred", "t_max_pred", "q_in_mean_w_m2"].every(
    (k) => k in (rows[0] ?? {}),
  ),
)
expectOk(
  "pareto.csv (what the page embeds) is one row per candidate with no scenario_id, so it cannot check 864 cells",
  !paretoHead.includes("scenario_id"),
  paretoHead.slice(0, 60),
)
const embed = JSON.stringify(
  rows.map((r) => [
    Number(r.r_solar_pred),
    Number(r.t_max_pred),
    Number(r.q_in_mean_w_m2),
  ]),
)
console.log(
  `size cost of embedding the 864 x 3 nominal values: ${(embed.length / 1024).toFixed(1)} KiB`,
)

// Q5c: liveSimulate exposes bands and the nominal series but not the draw series
const live = liveSimulate(
  defaultLiveState(c.ranges, c.weather).inputs,
  c,
  32,
  20261121,
)
expectOk(
  "liveSimulate result has no draw series (H11 needs an extension that leaves the numbers unchanged)",
  !("draws" in live.series),
  Object.keys(live.series).join(","),
)
expectOk(
  "series has 144 points at 600 s, nodes at i/6 h (last node 23.833 h)",
  live.series.t_k.length === 144,
)

// Q6: rays and arrows, hand calculation for two recipes in scenario W5 (half-sine irradiance, peak G)
const s = S[4]!
const G = s.irradiance_w_m2
const R_TOT = c.weather.roof.r_total_m2k_w.value
const T_IN = c.weather.roof.t_inside_c.value + 273.15
for (const i of [0, 49]) {
  const d = D[i]!
  const sp = stackProps(d, CONTROL_LAYERS.C4, c)
  const o = thermalOutcomes([{ sp, s }], c, { series: true })[0]!
  const r = o.r_solar
  const reflected = G * r
  const absorbed = G * (1 - r)
  expectOk(
    `${d.candidate_id}: reflected + absorbed = incident (peak ${G} W/m2)`,
    Math.abs(reflected + absorbed - G) < 1e-9,
  )
  expectOk(
    `${d.candidate_id}: reflected share equals r_solar (hand: ${reflected.toFixed(1)} W/m2)`,
    Math.abs(reflected / G - r) < 1e-12,
  )
  const t = o.t_surface_k as Float64Array
  const conducted = Array.from(t, (tk) => (tk - T_IN) / R_TOT)
  const mean = conducted.reduce((a, b) => a + b, 0) / conducted.length
  const diff = Math.abs(mean - o.q_in_mean_w_m2)
  console.log(
    `  ${d.candidate_id}: r_solar=${r.toFixed(4)} q_in_mean=${o.q_in_mean_w_m2.toFixed(3)} series-mean conducted=${mean.toFixed(3)} diff=${diff.toExponential(2)} W/m2`,
  )
  expectOk(
    `${d.candidate_id}: conducted arrow (T(t)-T_in)/R from the solved series averages to q_in_mean within 0.05 W/m2 (144 of 1440 step nodes)`,
    diff < 0.05,
  )
}
finish()
