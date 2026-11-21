// Plan 05 Task 3: real model values on a finite-difference stencil (input of oracle/generate.py's gradient fixture).
// Run: nice -n 10 bun run oracle/gradient_stencil.ts   (writes oracle/gradient_stencil.input.json; deterministic)
// The scalar is the plan-05 smooth Chebyshev S of the five scenario-mean objectives with fixed normalisation and
// equal weights, evaluated on the nine scaled ingredient variables.
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Materials } from "../src/core/config"
import { lhsUnit, weatherL9 } from "../src/core/design"
import { OBJECTIVES } from "../src/core/pipeline/optimize"
import { stackProps, thermalOutcomes } from "../src/core/pipeline/stackProps"
import { chebyshev, normalised } from "../src/core/opt/scalarize"
import { fromScaled, VARS } from "../src/core/opt/vars"
import { loadContext } from "../src/node/context"

const root = join(import.meta.dir, "..")
const ctx = await loadContext(
  join(root, "configs"),
  join(root, "data/literature"),
)
const scen = weatherL9(ctx.weather)
const FULL = { primer: true, midcoat: true, topcoat: true }

function objectives(x: readonly number[]): number[] {
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

// fixed normalisation (screened-range style) and equal weights
const NORM = {
  lo: [0.3, 40, 0, 0, 0],
  hi: [0.95, 80, 1, 1, 1],
}
const W = [0.2, 0.2, 0.2, 0.2, 0.2]
const f = (u: readonly number[]): number =>
  chebyshev(normalised(objectives(fromScaled(Float64Array.from(u))), NORM), W)

const cpvc = ctx.ranges.cpvc.value
const cap = ctx.ranges.max_total_dft_um.value
const feasible = (u: number[]) => {
  const x = fromScaled(Float64Array.from(u))
  return (
    (x[2] as number) <= cpvc &&
    (x[1] as number) + (x[4] as number) + (x[6] as number) <= cap &&
    (objectives(x)[3] as number) <= 0.5
  )
}

const pts: number[][] = []
for (const r of lhsUnit(400, 9, 20261121)) {
  const u = r.map((v) => 0.12 + 0.76 * v)
  if (feasible(u)) pts.push(u)
  if (pts.length === 30) break
}
if (pts.length < 30) throw new Error(`only ${pts.length} feasible points`)

// offsets m in units of h/2: +-1 (h/2) and +-2k (k h), k = 1..6
const M = [1, 2, 4, 6, 8, 10, 12].flatMap((m) => [m, -m]).sort((a, b) => a - b)
const h = VARS.map((v) => v.h)
const cases = pts.map((c) => {
  const center = f(c)
  const stencil: Record<string, number> = {}
  for (let i = 0; i < 9; i++)
    for (const m of M) {
      const u = c.slice()
      u[i] = (c[i] as number) + m * ((h[i] as number) / 2)
      stencil[`${i}:${m}`] = f(u)
    }
  return { u: c, center, stencil }
})
const out = { h, offsets_in_half_h: M, weights: W, norm: NORM, cases }
writeFileSync(
  join(root, "oracle/gradient_stencil.input.json"),
  `${JSON.stringify(out)}\n`,
)
console.log(`wrote ${cases.length} cases, ${cases.length * (1 + 9 * M.length)} values`)
