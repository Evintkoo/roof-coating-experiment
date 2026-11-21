import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import fc from "fast-check"
import { simulateDay } from "../../../src/core/models/thermal"
import {
  gradient,
  hessian,
  richardsonCheck,
} from "../../../src/core/opt/gradient"
import { VARS } from "../../../src/core/opt/vars"
import { repoRoot } from "../../helpers"

const fx = (name: string) =>
  JSON.parse(
    readFileSync(join(repoRoot, "tests/fixtures/oracle", name), "utf8"),
  )
const H = VARS.map((v) => v.h)

// T_grad_rel: frozen once from the first real run (tests/fixtures/frozen_t_grad_rel.txt), hard bound 1e-3.
const T_GRAD_REL = Number(
  readFileSync(
    join(repoRoot, "tests/fixtures/frozen_t_grad_rel.txt"),
    "utf8",
  ).trim(),
)
const HARD_BOUND = 1e-3

type GradCase = {
  u: number[]
  center: number
  stencil: Record<string, number>
  ref: number[]
  richardson_ref: number[]
}

/** Lookup closure keyed on the stencil offset: the model values come from the fixture, never recomputed. */
function stencilFn(c: GradCase, h: readonly number[]) {
  const centre = Float64Array.from(c.u)
  return (u: Float64Array): number => {
    let hit = -1
    for (let i = 0; i < u.length; i++)
      if (u[i] !== centre[i]) {
        if (hit >= 0) throw new Error("query moves two coordinates")
        hit = i
      }
    if (hit < 0) return c.center
    const step = (h[hit] as number) / 2
    const m = Math.round(((u[hit] as number) - (centre[hit] as number)) / step)
    if (u[hit] !== (centre[hit] as number) + m * step)
      throw new Error(`query ${hit} is not on the stencil`)
    const v = c.stencil[`${hit}:${m}`]
    if (v === undefined) throw new Error(`offset ${hit}:${m} not in fixture`)
    return v
  }
}

const rel = (a: number, ref: number, floor = 1e-12) =>
  Math.abs(a - ref) / Math.max(Math.abs(ref), floor)

test("frozenBoundIsWithinHardBound", () => {
  expect(T_GRAD_REL).toBeGreaterThan(0)
  expect(T_GRAD_REL).toBeLessThanOrEqual(HARD_BOUND)
})

test("gradientMatchesMpmathOracle", () => {
  const d = fx("gradient.json")
  expect(d.h).toEqual(H)
  expect(d.cases.length).toBe(30)
  let n = 0
  for (const c of d.cases as GradCase[]) {
    n += Object.keys(c.stencil).length + 1
    const g = gradient(stencilFn(c, H), Float64Array.from(c.u), H)
    for (let i = 0; i < 9; i++)
      expect(rel(g[i] as number, c.ref[i] as number)).toBeLessThan(T_GRAD_REL)
  }
  expect(n).toBeGreaterThanOrEqual(3800)
})

test("richardsonAgreementWithinFrozenBound", () => {
  const d = fx("gradient.json")
  for (const c of d.cases as GradCase[]) {
    const r = richardsonCheck(stencilFn(c, H), Float64Array.from(c.u), H)
    for (let i = 0; i < 9; i++) {
      expect(r[i] as number).toBeLessThanOrEqual(T_GRAD_REL)
      // the 60-digit value of the same quantity: double rounding of D(h) - D(h/2) is far below the bound
      expect(
        Math.abs((r[i] as number) - (c.richardson_ref[i] as number)),
      ).toBeLessThan(1e-8)
    }
  }
})

test("richardsonCheckCanFail", () => {
  // a kink inside the stencil: |u - 0.5| differs between h and h/2 differences
  const f = (u: Float64Array) => Math.abs((u[0] as number) - 0.5000004)
  const r = richardsonCheck(f, Float64Array.of(0.5), [1e-3])
  expect(r[0] as number).toBeGreaterThan(T_GRAD_REL)
})

// ---- analytic benchmarks: independent of the model and of the oracle's stencil (the real gate, 1e-7) ----
type Bench = {
  name: string
  params: Record<string, unknown>
  points: number[][]
  f: number[]
  grad: number[][]
}
const mat = (p: unknown) => p as number[][]
const BENCH_FN: Record<string, (b: Bench) => (u: Float64Array) => number> = {
  quadratic: (b) => {
    const A = mat(b.params.A)
    const bb = b.params.b as number[]
    return (u) => {
      let s = 0
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++)
          s +=
            (u[i] as number) *
            ((A[i] as number[])[j] as number) *
            (u[j] as number)
        s -= 2 * (bb[i] as number) * (u[i] as number)
      }
      return s / 2
    }
  },
  rosenbrock4_x2u: () => (u) => {
    let s = 0
    for (let i = 0; i < 3; i++) {
      const a = 2 * (u[i] as number)
      const c = 2 * (u[i + 1] as number)
      s += 100 * (c - a * a) ** 2 + (1 - a) ** 2
    }
    return s
  },
  logsumexp: (b) => {
    const a = mat(b.params.a)
    return (u) =>
      Math.log(
        a.reduce(
          (t, row) =>
            t + Math.exp(row.reduce((q, v, j) => q + v * (u[j] as number), 0)),
          0,
        ),
      )
  },
  trig_ring: () => (u) => {
    let s = 0
    for (let i = 0; i < 3; i++)
      s +=
        Math.sin(3 * (u[i] as number)) *
        Math.cos(2 * (u[(i + 1) % 3] as number))
    return s
  },
  rastrigin5: () => (u) => {
    let s = 0
    for (const v of u) s += v * v - 0.1 * Math.cos(5 * Math.PI * v)
    return s
  },
  exp_product: () => (u) => {
    const [a, b, c] = u as unknown as [number, number, number]
    return Math.exp(a * b) + c ** 4 + (a * c) / (1 + b * b)
  },
}

test("gradientMatchesAnalyticBenchmarks", () => {
  const d = fx("benchmarks.json")
  expect(d.functions.length).toBe(6)
  for (const b of d.functions as Bench[]) {
    const f = (BENCH_FN[b.name] as (b: Bench) => (u: Float64Array) => number)(b)
    b.points.forEach((p, k) => {
      const u = Float64Array.from(p)
      expect(rel(f(u), b.f[k] as number, 1e-3)).toBeLessThan(1e-12)
      const g = gradient(f, u, new Array(p.length).fill(1e-5))
      for (let i = 0; i < p.length; i++)
        expect(
          Math.abs((g[i] as number) - ((b.grad[k] as number[])[i] as number)) /
            Math.max(Math.abs((b.grad[k] as number[])[i] as number), 1e-2),
        ).toBeLessThan(1e-7)
    })
  }
})

// ---- H2: linear thermal case, closed form ----
test("linearThermalClosedForm", () => {
  // eps -> 1e-300 and constant G: the model is linear, day 2 sits at its steady state
  // T_ss = ((1-r) G + h T_air + T_in / R) / (h + 1 / R), so dT_max/dr = -G / (h + 1 / R).
  const G = 800
  const tAir = 303.15
  const tIn = 298.15
  const hc = 15
  const R = 0.3
  const base = {
    emissivity: 1e-300,
    g_peak_w_m2: G,
    t_air_k: tAir,
    t_sky_k: 280,
    h_conv_w_m2k: hc,
    t_inside_k: tIn,
    r_total_m2k_w: R,
    c_a_j_m2k: 2000,
  }
  const f = (u: Float64Array) =>
    simulateDay({ ...base, r_solar: u[0] as number }, { gProfile: () => G })
      .t_max_c
  const lam = hc + 1 / R
  const slope = -G / lam
  for (const r of [0.25, 0.4, 0.55]) {
    const g = gradient(f, Float64Array.of(r), [1e-3])[0] as number
    expect(Math.abs(g - slope) / Math.abs(slope)).toBeLessThan(1e-6)
    const tss = ((1 - r) * G + hc * tAir + tIn / R) / lam - 273.15
    expect(Math.abs(f(Float64Array.of(r)) - tss)).toBeLessThan(1e-6)
  }
})

// ---- one-sided differences at a bound ----
test("oneSidedAtBound", () => {
  const seen: number[] = []
  const f = (u: Float64Array) => {
    for (const v of u) seen.push(v)
    return (
      3 * (u[0] as number) ** 2 -
      2 * (u[0] as number) +
      (u[1] as number) ** 2 +
      4 * (u[1] as number)
    )
  }
  for (const [x, ex, ey] of [
    [0, -2, 4],
    [1, 4, 6],
  ] as const) {
    seen.length = 0
    const g = gradient(f, Float64Array.of(x, x), [1e-3, 1e-3])
    // second-order one-sided formulas are exact for quadratics
    expect(Math.abs((g[0] as number) - ex)).toBeLessThan(1e-8)
    expect(Math.abs((g[1] as number) - ey)).toBeLessThan(1e-8)
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...seen)).toBeLessThanOrEqual(1)
  }
  // a cubic: the error of the one-sided formula is h^2 f'''/3 (order 2), far below first order
  const cubic = (u: Float64Array) => (u[0] as number) ** 3
  const h = 1e-2
  const e = Math.abs(
    (gradient(cubic, Float64Array.of(0), [h])[0] as number) - 0,
  )
  expect(e).toBeLessThan(1e-3)
  expect(Math.abs(e - (h * h * 6) / 3)).toBeLessThan(1e-9)
})

test("gradientIsCentralInsideAndNeverMutatesU", () => {
  const u = Float64Array.of(0.3, 0.7)
  const f = (v: Float64Array) => Math.sin(v[0] as number) * (v[1] as number)
  const g = gradient(f, u, [1e-5, 1e-5])
  expect(Array.from(u)).toEqual([0.3, 0.7])
  expect(Math.abs((g[0] as number) - Math.cos(0.3) * 0.7)).toBeLessThan(1e-9)
  expect(() => gradient(f, Float64Array.of(1.2, 0.5), [1e-5, 1e-5])).toThrow(
    RangeError,
  )
  expect(() => gradient(f, u, [1e-5])).toThrow(RangeError)
})

test("hessianSymmetric", () => {
  const f = (u: Float64Array) =>
    Math.exp((u[0] as number) * (u[1] as number)) +
    (u[2] as number) ** 3 * (u[0] as number) +
    Math.sin((u[1] as number) + 2 * (u[2] as number))
  const H3 = hessian(f, Float64Array.of(0.4, 0.6, 0.5), [1e-3, 1e-3, 1e-3])
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      expect((H3[i] as Float64Array)[j]).toBe((H3[j] as Float64Array)[i])
  // analytic spot values
  const [a, b, c] = [0.4, 0.6, 0.5]
  const e = Math.exp(a * b)
  expect(
    Math.abs(((H3[0] as Float64Array)[0] as number) - b * b * e),
  ).toBeLessThan(1e-4)
  expect(
    Math.abs(((H3[0] as Float64Array)[1] as number) - (e + a * b * e)),
  ).toBeLessThan(1e-4)
  expect(
    Math.abs(((H3[0] as Float64Array)[2] as number) - 3 * c * c),
  ).toBeLessThan(1e-4)
  expect(
    Math.abs(
      ((H3[2] as Float64Array)[2] as number) -
        (6 * c * a - 4 * Math.sin(b + 2 * c)),
    ),
  ).toBeLessThan(1e-4)
})

test("hessianAtBoundStaysInsideBox", () => {
  let lo = 1
  let hi = 0
  const f = (u: Float64Array) => {
    for (const v of u) {
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    return (u[0] as number) ** 2 + 2 * (u[0] as number) * (u[1] as number)
  }
  const H2 = hessian(f, Float64Array.of(0, 1), [1e-3, 1e-3])
  expect(lo).toBeGreaterThanOrEqual(0)
  expect(hi).toBeLessThanOrEqual(1)
  expect(Math.abs(((H2[0] as Float64Array)[0] as number) - 2)).toBeLessThan(
    1e-6,
  )
  expect(Math.abs(((H2[0] as Float64Array)[1] as number) - 2)).toBeLessThan(
    1e-6,
  )
})

test("fastCheckQuadraticExact", () => {
  const quad = fc.integer({ min: 2, max: 6 }).chain((n) =>
    fc.record({
      n: fc.constant(n),
      m: fc.array(fc.double({ min: -2, max: 2, noNaN: true }), {
        minLength: n * n,
        maxLength: n * n,
      }),
      b: fc.array(fc.double({ min: -2, max: 2, noNaN: true }), {
        minLength: n,
        maxLength: n,
      }),
      u: fc.array(fc.double({ min: 0.05, max: 0.95, noNaN: true }), {
        minLength: n,
        maxLength: n,
      }),
    }),
  )
  fc.assert(
    fc.property(quad, ({ n, m, b, u }) => {
      const A = Array.from({ length: n }, (_, i) =>
        Array.from(
          { length: n },
          (_, j) => ((m[i * n + j] as number) + (m[j * n + i] as number)) / 2,
        ),
      )
      const f = (v: Float64Array) => {
        let s = 0
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++)
            s +=
              0.5 *
              (v[i] as number) *
              ((A[i] as number[])[j] as number) *
              (v[j] as number)
          s -= (b[i] as number) * (v[i] as number)
        }
        return s
      }
      const x = Float64Array.from(u)
      const h = new Array<number>(n).fill(1e-3)
      const g = gradient(f, x, h)
      const Hs = hessian(f, x, h)
      for (let i = 0; i < n; i++) {
        let ex = -(b[i] as number)
        for (let j = 0; j < n; j++)
          ex += ((A[i] as number[])[j] as number) * (x[j] as number)
        expect(Math.abs((g[i] as number) - ex)).toBeLessThan(1e-8)
        for (let j = 0; j < n; j++)
          expect(
            Math.abs(
              ((Hs[i] as Float64Array)[j] as number) -
                ((A[i] as number[])[j] as number),
            ),
          ).toBeLessThan(1e-5)
      }
    }),
    { numRuns: 100 },
  )
})
