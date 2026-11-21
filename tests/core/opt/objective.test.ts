import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { weatherL9 } from "../../../src/core/design"
import { PhysicsRangeError } from "../../../src/core/errors"
import {
  makeModel,
  solveQuantile,
  solveScalar,
} from "../../../src/core/opt/objective"
import { chebyshev, normalised } from "../../../src/core/opt/scalarize"
import { fromScaled, toScaled, VARS } from "../../../src/core/opt/vars"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { CONTROL_LAYERS, evaluate } from "../../../src/core/pipeline/stackProps"
import { drawMaterials } from "../../../src/core/pipeline/uncertainty"
import { loadContext } from "../../../src/node/context"
import { repoRoot } from "../../helpers"

let ctx: ModelContext
const NORM = {
  lo: [0.5, 25, 0.1, 0, 0],
  hi: [1, 60, 1, 1, 1],
}
const W = [0.2, 0.2, 0.2, 0.2, 0.2]
// a feasible interior recipe
const X0 = [0.5, 7, 0.25, 0.5, 200, 0.5, 10, 0.3, 1.0]
const U0 = () => toScaled(X0)

beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

const model = (mat = ctx?.mat) =>
  makeModel(
    ctx,
    weatherL9(ctx.weather),
    NORM,
    ctx.ranges.cpvc.value,
    ctx.ranges.max_total_dft_um.value,
    mat,
  )

test("objectivesEqualThePlan3EvaluateMeansWithTheGradeOverride", () => {
  const sc = weatherL9(ctx.weather)
  const mat = structuredClone(ctx.mat)
  mat.tio2.diameter_um.value = X0[7] as number
  mat.baso4.diameter_um.value = X0[8] as number
  const outs = sc.map((s) =>
    evaluate(
      {
        primer_gptes_molfrac: 0.5,
        primer_dft_um: 7,
        midcoat_pvc: 0.25,
        midcoat_tio2_fraction: 0.5,
        midcoat_dft_um: 200,
        topcoat_mtes_molfrac: 0.5,
        topcoat_dft_um: 10,
      },
      s,
      CONTROL_LAYERS.C4,
      ctx,
      mat,
    ),
  )
  const mean = (f: (o: (typeof outs)[number]) => number) =>
    outs.reduce((a, o) => a + f(o), 0) / outs.length
  const got = model().objectives(U0())
  const want = [
    mean((o) => o.r_solar),
    mean((o) => o.t_max_c),
    mean((o) => o.corrosion_risk),
    mean((o) => o.delam_proxy),
    mean((o) => o.cost_proxy),
  ]
  got.forEach((v, i) => {
    expect(v).toBeCloseTo(want[i] as number, 12)
  })
  // and the grades really enter: a different TiO2 grade changes the reflectance
  const u2 = U0()
  u2[7] = 0.9
  expect(model().objectives(u2)[0]).not.toBeCloseTo(got[0] as number, 4)
  // ctx.mat is never edited
  expect(ctx.mat.tio2.diameter_um.value).not.toBe(X0[7])
})

test("scalarIsTheChebyshevOfTheNormalisedObjectives", () => {
  const m = model()
  const u = U0()
  expect(m.scalar(u, W)).toBe(chebyshev(normalised(m.objectives(u), NORM), W))
})

test("constraintsMatchTheirDefinitions", () => {
  const m = model()
  const u = U0()
  const x = fromScaled(u)
  expect(m.constraint(u, 0)).toBeCloseTo(
    (x[2] as number) - ctx.ranges.cpvc.value,
    12,
  )
  expect(m.constraint(u, 1)).toBeCloseTo(
    ((x[1] as number) + (x[4] as number) + (x[6] as number) - 332) / 332,
    12,
  )
  expect(m.constraint(u, 2)).toBeCloseTo(m.delam(u) - 0.5, 12)
  expect(m.maxViolation(u)).toBe(
    Math.max(m.constraint(u, 0), m.constraint(u, 1), m.constraint(u, 2)),
  )
  const hi = new Float64Array(VARS.length).fill(1)
  expect(m.maxViolation(hi)).toBeGreaterThan(0) // 12 + 300 + 20 = 332 is on the cap, PVC 0.35 below cpvc: delam decides
})

test("nonFiniteModelOutputIsExit4", () => {
  const bad = structuredClone(ctx.mat)
  bad.binder.n.value = Number.NaN
  expect(() => model(bad).objectives(U0())).toThrow(PhysicsRangeError)
})

test("solveNeverReturnsAWorsePointAndStaysFeasible", () => {
  const m = model()
  const u0 = U0()
  const f0 = m.scalar(u0, W)
  const r = solveScalar(m, W, u0, { maxIter: 15 })
  expect(r.f).toBeLessThanOrEqual(f0)
  expect(r.maxViolation).toBeLessThanOrEqual(1e-9)
})

test("quantileSolveOverIdenticalDrawsEqualsTheNominalValue", () => {
  const m = model()
  const u0 = U0()
  const r = solveQuantile([m, m, m, m], m, W, u0, 0.9, { maxIter: 8 })
  expect(r.trace[0]).toBeCloseTo(m.scalar(u0, W), 12)
  expect(r.f).toBeLessThanOrEqual(m.scalar(u0, W))
})

test("gradeOfADrawKeepsItsRelativePerturbation", () => {
  const [d] = drawMaterials(ctx.mat, 1, 5)
  const m = model(d)
  const u = U0()
  const nominal = model().objectives(u)[0] as number
  expect(m.objectives(u)[0]).not.toBe(nominal)
})
