import { expect, test } from "bun:test"
import { setEventSink } from "../../../src/core/events"
import { toleranceTable } from "../../../src/core/opt/tolerance"
import { VARS } from "../../../src/core/opt/vars"

const H = VARS.map((v) => v.h)
const N = VARS.length
const centre = () => new Float64Array(N).fill(0.5)

/** f = F0 + sum a_i (u_i - c_i)^2: the loss (f - F0)/F0 of a step d in coordinate i is a_i d^2 / F0. */
const quad =
  (a: number[], c: Float64Array, f0 = 1) =>
  (u: Float64Array) => {
    let s = f0
    for (let i = 0; i < N; i++)
      s += (a[i] as number) * ((u[i] as number) - (c[i] as number)) ** 2
    return s
  }

test("quadraticEdgesMatchTheClosedForm", () => {
  const a = Array.from({ length: N }, (_, i) => 1 + i)
  const u = centre()
  const rows = toleranceTable(quad(a, u), u, H, 0.01)
  rows.forEach((r, i) => {
    const want = Math.sqrt(0.01 / (a[i] as number))
    expect(r.tol_lo).toBeCloseTo(want, 6)
    expect(r.tol_hi).toBeCloseTo(want, 6)
    expect(Math.abs(r.loss_lo - 0.01)).toBeLessThan(1e-6)
    expect(Math.abs(r.loss_hi - 0.01)).toBeLessThan(1e-6)
    expect(r.clipped).toBe(false)
    expect(r.grows).toBe(true)
    expect(r.id).toBe((VARS[i] as (typeof VARS)[number]).id)
  })
})

test("hessianEstimateIsTheFirstBracketProbe", () => {
  // The Hessian estimate only brackets the edge, so the final answer cannot show a wrong estimate (the mutant M3, without
  // the factor 2 of sqrt(2 tol f* / H), survived every test of the result). The probe sequence does: for an exact
  // quadratic the first probe after the box-edge check must already sit on the 1 % edge.
  const a = Array.from({ length: N }, (_, i) => 1 + i)
  const u = centre()
  const probes: number[] = []
  const f = (x: Float64Array) => {
    const moved = [...x].map((v, i) => [i, Math.abs(v - 0.5)] as const)
    const only = moved.filter(([, d]) => d > 1e-3)
    if (only.length === 1 && (only[0] as readonly [number, number])[0] === 0)
      probes.push((only[0] as readonly [number, number])[1])
    return quad(a, u)(x)
  }
  toleranceTable(f, u, H, 0.01)
  // probes of variable 0, lower edge first: the room check (0.5), then the Hessian estimate, then the bisection
  expect(probes[0]).toBeCloseTo(0.5, 12)
  expect(Math.abs((probes[1] as number) - Math.sqrt(0.01 / 1))).toBeLessThan(
    1e-6,
  )
})

test("edgesAreFoundByDirectEvaluationNotTheHessianEstimate", () => {
  // quartic in coordinate 0: the Hessian is 0 there (the estimate is infinite) but the edge still lands on 1 %
  const u = centre()
  const f = (x: Float64Array) => 1 + 50 * ((x[0] as number) - 0.5) ** 4
  const r = toleranceTable(f, u, H, 0.01)[0]
  expect(r?.tol_lo).toBeCloseTo((0.01 / 50) ** 0.25, 6)
  expect(Math.abs((r?.loss_hi ?? 0) - 0.01)).toBeLessThan(1e-6)
})

test("boundSideHasZeroToleranceAndIsClipped", () => {
  const u = centre()
  u[2] = 0 // active lower bound, loss rises linearly into the box
  const f = (x: Float64Array) => 1 + 3 * (x[2] as number)
  const r = toleranceTable(f, u, H, 0.01)[2]
  expect(r?.tol_lo).toBe(0)
  expect(r?.clipped).toBe(true)
  expect(r?.tol_hi).toBeCloseTo(0.01 / 3, 6)
  expect(Math.abs((r?.loss_hi ?? 0) - 0.01)).toBeLessThan(1e-6)
})

test("flatVariableReportsTheDistanceToTheBoundAsClipped", () => {
  const u = Float64Array.from(new Array(N).fill(0.5))
  u[4] = 0.3
  const f = (x: Float64Array) => 1 + 100 * ((x[0] as number) - 0.5) ** 2
  const r = toleranceTable(f, u, H, 0.01)[4]
  expect(r?.clipped).toBe(true)
  expect(r?.tol_lo).toBeCloseTo(0.3, 12)
  expect(r?.tol_hi).toBeCloseTo(0.7, 12)
  expect(r?.loss_edge).toBe(0)
})

test("emitsOneToleranceEventPerVariable", () => {
  const seen: Record<string, unknown>[] = []
  setEventSink((event, _l, fields) => {
    if (event === "refine.tolerance.done") seen.push(fields)
  })
  try {
    const u = centre()
    toleranceTable(quad(new Array(N).fill(2), u), u, H, 0.01, { role: "x" })
  } finally {
    setEventSink(null)
  }
  expect(seen.map((e) => e.variable)).toEqual(VARS.map((v) => v.id))
  for (const e of seen) {
    expect(e.role).toBe("x")
    expect(Math.abs((e.loss_pct as number) - 1)).toBeLessThan(1e-4)
  }
})

test("badToleranceThrows", () => {
  const u = centre()
  expect(() => toleranceTable(quad(new Array(N).fill(1), u), u, H, 0)).toThrow(
    RangeError,
  )
  expect(() => toleranceTable(quad(new Array(N).fill(1), u), u, H, 1)).toThrow(
    RangeError,
  )
})
