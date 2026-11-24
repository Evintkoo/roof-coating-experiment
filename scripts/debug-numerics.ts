// TEMPORARY (branch debug/linux-numerics only): dumps intermediate values so macOS and Linux runs can be diffed.
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { HourlySeries } from "../src/core/indonesia/series"
import { simulateDay, type ThermalInputs } from "../src/core/models/thermal"
import {
  type SeriesParams,
  simulateSeriesDay,
} from "../src/core/models/thermalSeries"

const root = join(import.meta.dir, "..")
const out = process.argv[2] ?? ".dbg/out"
mkdirSync(out, { recursive: true })
const buf = new DataView(new ArrayBuffer(8))
const bits = (x: number) => {
  buf.setFloat64(0, x)
  return buf.getBigUint64(0).toString(16).padStart(16, "0")
}
let s = 12345
const rnd = () => {
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0
  return s / 4294967296
}
const N = 20000
const xs = Array.from({ length: N }, () => rnd())
const probe: Record<string, string[]> = {
  sinDay: Array.from({ length: 2881 }, (_, k) =>
    bits(Math.sin((Math.PI * (k * 60 - 21600)) / 43200)),
  ),
  sin: xs.map((x) => bits(Math.sin(x * 20))),
  cos: xs.map((x) => bits(Math.cos(x * 20))),
  exp: xs.map((x) => bits(Math.exp(-x * 30))),
  expm1: xs.map((x) => bits(Math.expm1(-x * 5))),
  log: xs.map((x) => bits(Math.log(x * 10 + 1e-3))),
  pow15: xs.map((x) => bits(x ** 1.5)),
  pow025: xs.map((x) => bits((x * 1000) ** 0.25)),
  pow13: xs.map((x) => bits((x * 100) ** (1 / 3))),
  pow10: xs.map((x) => bits(10 ** -(x * 8))),
  powNeg: xs.map((x) => bits((x + 0.5) ** -0.7)),
  pow4: xs.map((x) => bits((x * 400) ** 4)),
}
writeFileSync(join(out, "probe.json"), JSON.stringify(probe))

type R = { t_max_c: number; q_in_mean_w_m2: number; t_surface_k: Float64Array }
const row = (r: R) => [
  bits(r.t_max_c),
  bits(r.q_in_mean_w_m2),
  ...Array.from(r.t_surface_k, bits),
]
const th = (await Bun.file(
  join(root, "tests/fixtures/oracle/thermal.json"),
).json()) as { cases: { inputs: ThermalInputs }[] }
const se = (await Bun.file(
  join(root, "tests/fixtures/oracle/thermalSeries.json"),
).json()) as {
  h_a: number
  h_b: number
  cases: {
    params: SeriesParams
    series: Record<keyof HourlySeries, number[]>
  }[]
}
writeFileSync(
  join(out, "rk4.json"),
  JSON.stringify({
    day: th.cases.map((c) => row(simulateDay(c.inputs))),
    series: se.cases.map((c) => {
      const hs = Object.fromEntries(
        Object.entries(c.series).map(([k, v]) => [k, Float64Array.from(v)]),
      ) as unknown as HourlySeries
      return row(simulateSeriesDay(c.params, hs, se.h_a, se.h_b))
    }),
  }),
)
console.log("probe + rk4 written", out)
