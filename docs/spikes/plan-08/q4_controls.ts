// Q4: the 13 variables over 41 points: configured ranges exist, no PhysicsRangeError, which control outcomes move (C0, C1), which are NaN,
// and which variables are inert when their layer is off.
import { VARS } from "../../../src/core/opt/vars"
import { type LiveInputs, liveSimulate } from "../../../src/core/pipeline/live"
import { defaultLiveState } from "../../../src/web/liveState"
import { ctx, expectOk, finish } from "./lib"

const c = await ctx()
const base = defaultLiveState(c.ranges, c.weather).inputs
type V = {
  key: string
  min: number
  max: number
  set: (
    i: LiveInputs,
    c: typeof ctx extends () => Promise<infer X> ? X : never,
    v: number,
  ) => [LiveInputs, typeof c]
}
const design = (
  [
    "primer_gptes_molfrac",
    "primer_dft_um",
    "midcoat_pvc",
    "midcoat_tio2_fraction",
    "midcoat_dft_um",
    "topcoat_mtes_molfrac",
    "topcoat_dft_um",
  ] as const
).map(
  (k): V => ({
    key: k,
    min: c.ranges[k].min,
    max: c.ranges[k].max,
    set: (i, cc, v) => [{ ...i, design: { ...i.design, [k]: v } }, cc],
  }),
)
const grades = (["tio2", "baso4"] as const).map((m): V => {
  const g = VARS.find((x) => x.id === `d_${m}_um`)!
  return {
    key: g.id,
    min: g.lo,
    max: g.hi,
    set: (i, cc, v) => [
      i,
      {
        ...cc,
        mat: {
          ...cc.mat,
          [m]: {
            ...cc.mat[m],
            diameter_um: { ...cc.mat[m].diameter_um, value: v },
          },
        },
      },
    ],
  }
})
const ph: V = {
  key: "ph",
  min: c.ranges.sol_gel_ph.min,
  max: c.ranges.sol_gel_ph.max,
  set: (i, cc, v) => [{ ...i, ph: v }, cc],
}
const wx = (["irradiance_w_m2", "t_air_c", "wind_m_s"] as const).map(
  (k): V => ({
    key: k,
    min: c.weather[k].values[0],
    max: c.weather[k].values[2],
    set: (i, cc, v) => [{ ...i, scenario: { ...i.scenario, [k]: v } }, cc],
  }),
)
const all = [...design, ...grades, ph, ...wx]
expectOk(
  "13 variables with configured ranges",
  all.length === 13 && all.every((v) => v.max > v.min),
)
const spread = (a: number[]) => Math.max(...a) - Math.min(...a)
for (const v of all) {
  const rows: ReturnType<typeof liveSimulate>[] = []
  let threw = ""
  try {
    for (let i = 0; i < 41; i++) {
      const [inp, cc] = v.set(base, c, v.min + ((v.max - v.min) * i) / 40)
      rows.push(liveSimulate(inp, cc, 4, 20261121))
    }
  } catch (e) {
    threw = (e as Error).message
  }
  const c0 = spread(rows.map((r) => r.controls.C0.t_max_c))
  const c1 = spread(rows.map((r) => r.controls.C1.t_max_c))
  const nan1 = [
    "corrosion_risk",
    "delam_proxy",
    "wetting_score",
    "cost_proxy",
  ].map((k) => Number.isNaN((rows[0]!.controls.C1 as any)[k]))
  console.log(
    `${v.key.padEnd(24)} C0 spread ${c0.toExponential(1)} C1 spread ${c1.toExponential(1)} C1 NaN(corr,delam,wet,cost)=${nan1.join(",")} ${threw ? `THREW ${threw}` : ""}`,
  )
  expectOk(`${v.key}: 41 points without PhysicsRangeError`, threw === "")
  const weather = wx.includes(v)
  expectOk(
    `${v.key}: controls ${weather ? "move" : "are flat"}`,
    weather ? c0 > 1e-3 && c1 > 1e-3 : c0 < 1e-12 && c1 < 1e-12,
  )
}
// inert when the layer is off
for (const [layer, key] of [
  ["primer", "primer_dft_um"],
  ["topcoat", "topcoat_dft_um"],
  ["midcoat", "midcoat_dft_um"],
] as const) {
  const v = all.find((x) => x.key === key)!
  const off = { ...base, layers: { ...base.layers, [layer]: false } }
  const a = liveSimulate(v.set(off, c, v.min)[0], c, 4, 20261121).nominal
    .t_max_c
  const b = liveSimulate(v.set(off, c, v.max)[0], c, 4, 20261121).nominal
    .t_max_c
  expectOk(`${key} is inert with ${layer} off`, a === b)
}
const NaNs = liveSimulate(
  { ...base, layers: { primer: false, midcoat: true, topcoat: true } },
  c,
  4,
  20261121,
)
console.log(
  `primer off: corrosion nominal ${NaNs.nominal.corrosion_risk} (baseline, not NaN); gel_time ${NaNs.nominal.gel_time_rel}`,
)
finish()
