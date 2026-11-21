import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import fc from "fast-check"
import {
  minimise,
  type OptResult,
  secondOrderCheck,
  symmetricEigenvalues,
} from "../../../src/core/opt/projectedBfgs"
import { repoRoot } from "../../helpers"

type Fn = (u: Float64Array) => number
type Con =
  | { kind: "linear"; a: number[]; b: number }
  | { kind: "ball"; r2: number }
type Problem = {
  id: string
  kind: "quad" | "rosenbrock" | "sqdist" | "neg_sum"
  params: Record<string, number[] | number[][]>
  cons: Con[]
  u0: number[]
  ustar: number[]
  fstar: number
  active_bounds?: number[]
  scipy: { method: string; u: number[]; f: number; dist_to_known: number }
}
const problems = (
  JSON.parse(
    readFileSync(
      join(repoRoot, "tests/fixtures/oracle/optimisation.json"),
      "utf8",
    ),
  ) as { problems: Problem[] }
).problems

const dist = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0
  for (let i = 0; i < a.length; i++)
    s += ((a[i] as number) - (b[i] as number)) ** 2
  return Math.sqrt(s)
}

// the objective and gradient of each benchmark are re-implemented here from its parameters
function build(p: Problem): {
  f: Fn
  g: (u: Float64Array) => Float64Array
  cons: Fn[]
} {
  const n = p.u0.length
  let f: Fn
  let g: (u: Float64Array) => Float64Array
  if (p.kind === "quad") {
    const A = p.params.A as number[][]
    const c = p.params.c as number[]
    const Ad = (u: Float64Array) =>
      Float64Array.from({ length: n }, (_, i) => {
        let s = 0
        for (let j = 0; j < n; j++)
          s +=
            ((A[i] as number[])[j] as number) *
            ((u[j] as number) - (c[j] as number))
        return s
      })
    f = (u) => {
      const v = Ad(u)
      let s = 0
      for (let i = 0; i < n; i++)
        s += 0.5 * ((u[i] as number) - (c[i] as number)) * (v[i] as number)
      return s
    }
    g = Ad
  } else if (p.kind === "rosenbrock") {
    const lo = p.params.lo as number[]
    const hi = p.params.hi as number[]
    const x = (u: Float64Array) =>
      [0, 1].map(
        (i) =>
          (lo[i] as number) +
          ((hi[i] as number) - (lo[i] as number)) * (u[i] as number),
      )
    f = (u) => {
      const [a, b] = x(u) as [number, number]
      return 100 * (b - a * a) ** 2 + (1 - a) ** 2
    }
    g = (u) => {
      const [a, b] = x(u) as [number, number]
      return Float64Array.of(
        (-400 * a * (b - a * a) - 2 * (1 - a)) *
          ((hi[0] as number) - (lo[0] as number)),
        200 * (b - a * a) * ((hi[1] as number) - (lo[1] as number)),
      )
    }
  } else if (p.kind === "sqdist") {
    const c = p.params.c as number[]
    f = (u) => c.reduce((s, ci, i) => s + ((u[i] as number) - ci) ** 2, 0)
    g = (u) => Float64Array.from(c, (ci, i) => 2 * ((u[i] as number) - ci))
  } else {
    f = (u) => -((u[0] as number) + (u[1] as number))
    g = () => Float64Array.of(-1, -1)
  }
  const cons: Fn[] = p.cons.map((c) =>
    c.kind === "linear"
      ? (u: Float64Array) =>
          c.a.reduce((s, ai, i) => s + ai * (u[i] as number), 0) - c.b
      : (u: Float64Array) => u.reduce((s, v) => s + v * v, 0) - c.r2,
  )
  return { f, g, cons }
}

const run = (p: Problem, opts = {}) => {
  const { f, g, cons } = build(p)
  return { r: minimise(f, g, Float64Array.from(p.u0), cons, opts), f, g, cons }
}

test("benchmarksReachKnownOptimum", () => {
  expect(problems.length).toBe(6)
  const worst: Record<string, number> = {}
  for (const p of problems) {
    const { r, f, cons } = run(p)
    worst[p.id] = dist(r.u, p.ustar)
    expect(dist(r.u, p.ustar)).toBeLessThan(1e-6) // T_conv
    expect(dist(r.u, p.scipy.u)).toBeLessThan(2e-6) // the independent second witness
    expect(r.status).toBe("converged")
    expect(r.iters).toBeLessThanOrEqual(60)
    expect(f(r.u)).toBeLessThan(p.fstar + 1e-9)
    for (const c of cons) expect(c(r.u)).toBeLessThanOrEqual(1e-9)
  }
  console.log(
    "benchmark distances to the known optimum:",
    JSON.stringify(worst),
  )
})

// ---- random convex quadratics for the property tests ----
type Quad = { n: number; A: number[][]; c: number[]; u0: Float64Array }
const convexQuadratic = fc.integer({ min: 2, max: 6 }).chain((n) =>
  fc
    .record({
      m: fc.array(fc.double({ min: -1, max: 1, noNaN: true }), {
        minLength: n * n,
        maxLength: n * n,
      }),
      c: fc.array(fc.double({ min: -0.5, max: 1.5, noNaN: true }), {
        minLength: n,
        maxLength: n,
      }),
      u0: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
        minLength: n,
        maxLength: n,
      }),
    })
    .map(({ m, c, u0 }): Quad => {
      // A = M M^T + 0.1 I is symmetric positive definite
      const A = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
          let s = i === j ? 0.1 : 0
          for (let k = 0; k < n; k++)
            s += (m[i * n + k] as number) * (m[j * n + k] as number)
          return s
        }),
      )
      return { n, A, c, u0: Float64Array.from(u0) }
    }),
)
const quadFns = (q: Quad) => {
  const grad = (u: Float64Array) =>
    Float64Array.from({ length: q.n }, (_, i) => {
      let s = 0
      for (let j = 0; j < q.n; j++)
        s +=
          ((q.A[i] as number[])[j] as number) *
          ((u[j] as number) - (q.c[j] as number))
      return s
    })
  const f: Fn = (u) => {
    const v = grad(u)
    let s = 0
    for (let i = 0; i < q.n; i++)
      s += 0.5 * ((u[i] as number) - (q.c[i] as number)) * (v[i] as number)
    return s
  }
  return { f, g: grad }
}

const nonIncreasing = (t: readonly number[], from = 0, to = t.length) => {
  for (let i = from + 1; i < to; i++)
    if ((t[i] as number) > (t[i - 1] as number)) return false
  return true
}

test("traceIsMonotone", () => {
  fc.assert(
    fc.property(convexQuadratic, (q) => {
      const { f, g } = quadFns(q)
      const r = minimise(f, g, q.u0, [])
      expect(nonIncreasing(r.trace)).toBe(true)
      expect(r.rounds.length).toBe(1)
    }),
    { numRuns: 200 },
  )
})

test("traceIsMonotoneWithinEachPenaltyRound", () => {
  // H4 with constraints: S (the merit) never increases within a round (mu fixed); at a round boundary the merit is
  // re-evaluated with the larger mu and the updated multipliers, which can only raise it (checked below), and the
  // iterates of every round still descend.
  fc.assert(
    fc.property(
      convexQuadratic,
      fc.array(fc.double({ min: 0.2, max: 1, noNaN: true }), {
        minLength: 6,
        maxLength: 6,
      }),
      (q, w) => {
        const { f, g } = quadFns(q)
        const a = Array.from({ length: q.n }, (_, i) => w[i] as number)
        const lhs = (u: Float64Array) =>
          a.reduce((s, ai, i) => s + ai * (u[i] as number), 0)
        const b = lhs(q.u0) + 0.05 // the start is feasible
        const r = minimise(f, g, q.u0, [(u) => lhs(u) - b])
        for (let k = 0; k < r.rounds.length; k++) {
          const from = (r.rounds[k] as { start: number }).start
          const to =
            k + 1 < r.rounds.length
              ? (r.rounds[k + 1] as { start: number }).start
              : r.trace.length
          expect(nonIncreasing(r.trace, from, to)).toBe(true)
          if (k > 0)
            expect(r.trace[from] as number).toBeGreaterThanOrEqual(
              (r.trace[from - 1] as number) - 1e-12,
            )
        }
        expect(r.maxViolation).toBeLessThanOrEqual(1e-9)
      },
    ),
    { numRuns: 100 },
  )
})

test("activeBoundsStayOnBound", () => {
  for (const p of problems.filter((x) => x.active_bounds)) {
    const { r } = run(p)
    for (const i of p.active_bounds as number[])
      expect([0, 1]).toContain(r.u[i] as number)
    for (const v of r.u) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  }
  const act = problems.find((x) => x.id === "rosenbrock_box_active") as Problem
  expect(run(act).r.u[0]).toBe(1)
  const lin = problems.find(
    (x) => x.id === "linear_constraint_with_bound",
  ) as Problem
  expect(run(lin).r.u[2]).toBe(0)
})

test("penaltyEscalationKeepsFeasibility", () => {
  // every constrained benchmark, from several budgets: reported optimum feasible to 1e-9
  for (const p of problems.filter((x) => x.cons.length > 0))
    for (const maxIter of [1, 2, 5, 10, 60]) {
      const { r, cons } = run(p, { maxIter })
      expect(r.status).not.toBe("infeasible")
      for (const c of cons) expect(c(r.u)).toBeLessThanOrEqual(1e-9)
      expect(r.maxViolation).toBeLessThanOrEqual(1e-9)
      expect(r.rounds.map((x) => x.mu).slice(0, 3)).toEqual(
        [10, 100, 1000].slice(0, r.rounds.length),
      )
    }
  // the escalation is real: the full run uses all three rounds on the active constraint
  const lin = problems.find(
    (x) => x.id === "linear_constraint_with_bound",
  ) as Problem
  expect(run(lin).r.rounds.map((x) => x.mu)).toEqual([10, 100, 1000])
  // random strongly active linear constraints
  fc.assert(
    fc.property(convexQuadratic, (q) => {
      const { f, g } = quadFns(q)
      const lhs = (u: Float64Array) => u.reduce((s, v) => s + v, 0)
      const b = lhs(q.u0) * 0.5 + 0.1
      const start = Float64Array.from(q.u0, (v) => v * 0.1)
      const cons = [(u: Float64Array) => lhs(u) - b]
      const r = minimise(f, g, start, cons)
      expect(cons[0]?.(r.u) as number).toBeLessThanOrEqual(1e-9)
    }),
    { numRuns: 100 },
  )
  // restoration: one iteration that overshoots the constraint is bisected back to the feasible start side
  const over = [(u: Float64Array) => u.reduce((s, v) => s + v, 0) - 1]
  const start = Float64Array.of(0.3, 0.3, 0.3)
  const rr = minimise(
    (u) => -1000 * u.reduce((s, v) => s + v, 0),
    () => Float64Array.of(-1000, -1000, -1000),
    start,
    over,
    { maxIter: 1 },
  )
  expect(rr.iters).toBe(1)
  expect(over[0]?.(rr.u) as number).toBeLessThanOrEqual(1e-9)
  expect(over[0]?.(rr.u) as number).toBeGreaterThan(-1e-6) // pushed to the boundary, not left at the start
  expect(rr.f).toBeLessThan(-1000 * 0.9)
  // a genuinely infeasible problem is reported, not hidden
  const bad = minimise(
    (u) => u[0] as number,
    () => Float64Array.of(1),
    Float64Array.of(0.5),
    [(u) => (u[0] as number) + 1],
  )
  expect(bad.status).toBe("infeasible")
})

test("neverWorseThanStart", () => {
  fc.assert(
    fc.property(
      convexQuadratic,
      fc.integer({ min: 1, max: 8 }),
      (q, maxIter) => {
        const { f, g } = quadFns(q)
        const r = minimise(f, g, q.u0, [], { maxIter })
        expect(r.f).toBeLessThanOrEqual(f(q.u0))
        // a wrong gradient (sign flipped) cannot make the answer worse than the start either
        const bad: OptResult = minimise(
          f,
          (u) => g(u).map((v) => -v),
          q.u0,
          [],
          { maxIter },
        )
        expect(bad.f).toBeLessThanOrEqual(f(q.u0))
      },
    ),
    { numRuns: 100 },
  )
  // constrained: the feasible start is the fallback
  const lin = problems.find(
    (x) => x.id === "linear_constraint_with_bound",
  ) as Problem
  const { f, g, cons } = build(lin)
  const r = minimise(
    f,
    (u) => g(u).map((v) => -v),
    Float64Array.from(lin.u0),
    cons,
  )
  expect(r.f).toBeLessThanOrEqual(f(Float64Array.from(lin.u0)))
})

test("saddleIsFlagged", () => {
  const h = [1e-4, 1e-4, 1e-4]
  // stationary at (0.5, 0.5, 0.3) but a saddle: the gradient test alone would call it optimal
  const f: Fn = (u) =>
    ((u[0] as number) - 0.5) ** 2 -
    ((u[1] as number) - 0.5) ** 2 +
    ((u[2] as number) - 0.3) ** 2
  const g = (u: Float64Array) =>
    Float64Array.of(
      2 * ((u[0] as number) - 0.5),
      -2 * ((u[1] as number) - 0.5),
      2 * ((u[2] as number) - 0.3),
    )
  const r = minimise(f, g, Float64Array.of(0.5, 0.5, 0.3), [])
  expect(r.status).toBe("converged")
  expect(r.kkt).toBeLessThan(1e-12)
  const sc = secondOrderCheck(f, r.u, h, 1e-4)
  expect(sc.saddle).toBe(true)
  expect(sc.minEig).toBeCloseTo(-2, 3)
  // a true minimum is not flagged
  const q = Float64Array.of(0.5, 0.5, 0.3)
  const fMin: Fn = (u) => f(u) + 2 * ((u[1] as number) - 0.5) ** 2
  expect(secondOrderCheck(fMin, q, h, 1e-4).saddle).toBe(false)
  // a minimum on a bound: the pinned variable is excluded from the check
  const onBound = Float64Array.of(0, 0.5, 0.3)
  expect(secondOrderCheck(fMin, onBound, h, 1e-4).saddle).toBe(false)
  // started off the saddle, the optimiser leaves it (it ends on the box, with f below the saddle value)
  const off = minimise(f, g, Float64Array.of(0.5, 0.52, 0.3), [])
  expect(off.f).toBeLessThan(f(q) - 0.2)
})

test("symmetricEigenvaluesMatchKnownMatrix", () => {
  // eigenvalues of [[2,1],[1,2]] are 1 and 3; of diag(5,-1,2) are -1,2,5
  const e = symmetricEigenvalues([Float64Array.of(2, 1), Float64Array.of(1, 2)])
  expect(e[0]).toBeCloseTo(1, 12)
  expect(e[1]).toBeCloseTo(3, 12)
  const d = symmetricEigenvalues([
    Float64Array.of(5, 0, 0),
    Float64Array.of(0, -1, 0),
    Float64Array.of(0, 0, 2),
  ])
  expect(d.map((v) => Math.round(v))).toEqual([-1, 2, 5])
})
