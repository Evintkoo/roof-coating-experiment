// Plan 05 Task 1 spike, Q1 and Q3: finite-difference step study and smoothness scan.
// Run: nice -n 10 bun run docs/spikes/plan-05/gradient-study.ts > /path/out.json
import { join } from "node:path"
import type { Materials } from "../../../src/core/config"
import { lhsUnit, weatherL9 } from "../../../src/core/design"
import { OBJECTIVES } from "../../../src/core/pipeline/optimize"
import {
  stackProps,
  thermalOutcomes,
} from "../../../src/core/pipeline/stackProps"
import { loadContext } from "../../../src/node/context"

const root = join(import.meta.dir, "../../..")
const ctx = await loadContext(
  join(root, "configs"),
  join(root, "data/literature"),
)
const scen = weatherL9(ctx.weather)
const FULL = { primer: true, midcoat: true, topcoat: true }

export const VARS = [
  ["p1", 0.2, 0.8],
  ["p2", 2, 12],
  ["m1", 0.1, 0.35],
  ["m2", 0.2, 0.8],
  ["m3", 100, 300],
  ["t1", 0.2, 0.8],
  ["t2", 3, 20],
  ["d_tio2_um", 0.15, 0.4],
  ["d_baso4_um", 0.3, 3.0],
] as const

type Obj = number[]
function objectives(x: readonly number[]): Obj {
  const [p1, p2, m1, m2, m3, t1, t2, dT, dB] = x as number[]
  const mat: Materials = structuredClone(ctx.mat)
  mat.tio2.diameter_um.value = dT as number
  mat.baso4.diameter_um.value = dB as number
  const sp = stackProps(
    {
      primer_gptes_molfrac: p1 as number,
      primer_dft_um: p2 as number,
      midcoat_pvc: m1 as number,
      midcoat_tio2_fraction: m2 as number,
      midcoat_dft_um: m3 as number,
      topcoat_mtes_molfrac: t1 as number,
      topcoat_dft_um: t2 as number,
    },
    FULL,
    ctx,
    mat,
  )
  const outs = thermalOutcomes(
    scen.map((s) => ({ sp, s })),
    ctx,
  )
  const get = (c: string, o: (typeof outs)[number]) =>
    c === "r_solar_pred"
      ? o.r_solar
      : c === "t_max_pred"
        ? o.t_max_c
        : c === "corrosion_proxy"
          ? o.corrosion_risk
          : c === "delam_proxy"
            ? o.delam_proxy
            : o.cost_proxy
  return OBJECTIVES.map(
    ([c]) => outs.reduce((a, o) => a + get(c, o), 0) / outs.length,
  )
}
const xOf = (u: readonly number[]) =>
  VARS.map(([, lo, hi], i) => lo + (u[i] as number) * (hi - lo))
const f = (u: readonly number[]) => objectives(xOf(u))

const cpvc = ctx.ranges.cpvc.value
const cap = ctx.ranges.max_total_dft_um.value
const feasible = (x: number[]) =>
  (x[2] as number) <= cpvc &&
  (x[1] as number) + (x[4] as number) + (x[6] as number) <= cap &&
  (objectives(x)[3] as number) <= 0.5

// 20 feasible points, interior (u in [0.12,0.88] so h up to 0.1 stays in the box)
const raw = lhsUnit(400, 9, 20261121)
const pts: number[][] = []
for (const r of raw) {
  const u = r.map((v) => 0.12 + 0.76 * v)
  if (feasible(xOf(u))) pts.push(u)
  if (pts.length === 20) break
}
if (pts.length < 20) throw new Error(`only ${pts.length} feasible points`)

if (process.argv[2] === "scan") {
  // Q3: slope-jump scan. For each variable, 3 interior base points, N samples across the FULL scaled range [0,1].
  // Jump ratio at sample j = |d_{j+1} - d_j| / median of the same quantity over the 6 neighbours;
  // a smooth function gives ratios near 1, a kink gives a large isolated ratio.
  const N = 1000
  const res: unknown[] = []
  for (let i = 0; i < 9; i++) {
    for (const bp of [0, 7, 13]) {
      const base = pts[bp] as number[]
      const F: Obj[] = []
      for (let j = 0; j <= N; j++) {
        const u = base.slice()
        u[i] = j / N
        F.push(f(u))
      }
      const row: Record<string, unknown> = { id: VARS[i]?.[0], point: bp }
      OBJECTIVES.forEach(([c], k) => {
        const d1 = F.slice(1).map(
          (v, j) => (v[k] as number) - ((F[j] as Obj)[k] as number),
        )
        const d2 = d1.slice(1).map((v, j) => Math.abs(v - (d1[j] as number)))
        const scale = Math.max(...d2)
        let worst = 0
        let at = -1
        for (let j = 3; j < d2.length - 3; j++) {
          const nb = [-3, -2, -1, 1, 2, 3]
            .map((o) => d2[j + o] as number)
            .sort((a, b) => a - b)
          const m = Math.max(
            ((nb[2] as number) + (nb[3] as number)) / 2,
            1e-12 * Math.max(scale, 1e-300),
            1e-14,
          )
          const r = (d2[j] as number) / m
          if (r > worst) {
            worst = r
            at = j
          }
        }
        row[c] = { worst_ratio: worst, at_u: (at + 1) / N, max_d2: scale }
      })
      res.push(row)
    }
  }
  console.log(JSON.stringify(res))
  process.exit(0)
}

if (process.argv[2] === "zoom") {
  // Q3 follow-up: repeatedly zoom (x/12) on the worst slope jump of objective 0 (r_solar). A kink keeps its slope jump
  // |d2|/step as the step shrinks; a sharp but smooth feature loses it in proportion to the step.
  const [vi, bp, c0, w0] = process.argv.slice(3).map(Number) as [
    number,
    number,
    number,
    number,
  ]
  const base = pts[bp] as number[]
  let c = c0
  let w = w0
  for (let level = 0; level < 5; level++) {
    const N = 1200
    const F: number[] = []
    for (let j = 0; j <= N; j++) {
      const u = base.slice()
      u[vi] = c - w + (2 * w * j) / N
      F.push(f(u)[0] as number)
    }
    const step = (2 * w) / N
    const d1 = F.slice(1).map((v, j) => (v - (F[j] as number)) / step)
    const dd = d1.slice(1).map((v, j) => Math.abs(v - (d1[j] as number)))
    let at = 0
    for (let j = 1; j < dd.length; j++)
      if ((dd[j] as number) > (dd[at] as number)) at = j
    const sorted = [...dd].sort((x, y) => x - y)
    console.log(
      `level ${level} window=+-${w.toExponential(1)} step_u=${step.toExponential(1)} max_slope_change=${(dd[at] as number).toExponential(2)} at u=${(c - w + step * (at + 1)).toFixed(7)} median_slope_change=${(sorted[sorted.length >> 1] as number).toExponential(2)} slope=${(d1[at] as number).toExponential(3)}`,
    )
    c = c - w + step * (at + 1)
    w = step * 6
  }
  process.exit(0)
}

if (process.argv[2] === "pt") {
  console.log(JSON.stringify(xOf(pts[Number(process.argv[3])] as number[])))
  process.exit(0)
}

const HS = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8]
function grad(u: number[], i: number, h: number): Obj {
  const a = u.slice()
  const b = u.slice()
  a[i] = (a[i] as number) + h
  b[i] = (b[i] as number) - h
  const fa = f(a)
  const fb = f(b)
  return fa.map((v, k) => (v - (fb[k] as number)) / (2 * h))
}

const out: unknown[] = []
for (let i = 0; i < 9; i++) {
  // table[h][k] = per-point arrays
  const G: Obj[][] = HS.map(() => [])
  const G2: Obj[][] = HS.map(() => [])
  for (const u of pts) {
    HS.forEach((h, j) => {
      ;(G[j] as Obj[]).push(grad(u, i, h))
      ;(G2[j] as Obj[]).push(grad(u, i, h / 2))
    })
  }
  out.push({ id: VARS[i]?.[0], G, G2 })
}
console.log(
  JSON.stringify({
    objectives: OBJECTIVES.map(([c]) => c),
    hs: HS,
    pts,
    data: out,
  }),
)
