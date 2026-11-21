import { afterEach, beforeAll, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type Level, setEventSink } from "../../../src/core/events"
import type { ModelContext } from "../../../src/core/pipeline/context"
import {
  morrisScreen,
  runSensitivity,
  SENSITIVITY_OUTPUTS,
  SENSITIVITY_VARIABLES,
  sensitivityBounds,
  sensitivityModel,
  sobolIndices,
  sobolMatrices,
} from "../../../src/core/pipeline/sensitivity"
import { validateSens } from "../../../src/core/pipeline/tables"
import { loadContext } from "../../../src/node/context"
import { repoRoot } from "../../helpers"

afterEach(() => setEventSink(null))
type Ev = { event: string; level: Level; fields: Record<string, unknown> }
const capture = (): Ev[] => {
  const got: Ev[] = []
  setEventSink((event, level, fields) => got.push({ event, level, fields }))
  return got
}

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

const PI = Math.PI
const ishigami = (x: Float64Array) =>
  Math.sin(x[0] as number) +
  7 * Math.sin(x[1] as number) ** 2 +
  0.1 * (x[2] as number) ** 4 * Math.sin(x[0] as number)
const ISHI_BOUNDS = [
  [-PI, PI],
  [-PI, PI],
  [-PI, PI],
] as const
const ISHI_NAMES = ["x1", "x2", "x3"]
const ANALYTIC_S1 = [0.3139, 0.4424, 0]
const ANALYTIC_ST = [0.5576, 0.4424, 0.2437]
const T_SOBOL_TOL = 0.03
const T_SOBOL_FIX = 0.05
const SEED = 20261121

const fixture = JSON.parse(
  readFileSync(join(repoRoot, "tests/fixtures/oracle/sobol.json"), "utf8"),
) as {
  n: number
  versions: Record<string, string>
  scipy: { first_order: number[]; total_order: number[] }
  salib: { S1: number[]; ST: number[] }
}

test("ishigamiSobolMatchesAnalyticAndFixtures", () => {
  expect(fixture.n).toBe(2 ** 14)
  expect(fixture.versions.SALib).toBe("1.6.0")
  const r = sobolIndices(ishigami, ISHI_NAMES, ISHI_BOUNDS, 2 ** 14, SEED)
  for (let i = 0; i < 3; i++) {
    const v = r[i] as (typeof r)[number]
    expect(Math.abs(v.S1 - (ANALYTIC_S1[i] as number))).toBeLessThan(
      T_SOBOL_TOL,
    )
    expect(Math.abs(v.ST - (ANALYTIC_ST[i] as number))).toBeLessThan(
      T_SOBOL_TOL,
    )
    for (const fx of [fixture.scipy, fixture.salib]) {
      const s1 = "first_order" in fx ? fx.first_order : fx.S1
      const st = "total_order" in fx ? fx.total_order : fx.ST
      expect(Math.abs(v.S1 - (s1[i] as number))).toBeLessThan(T_SOBOL_FIX)
      expect(Math.abs(v.ST - (st[i] as number))).toBeLessThan(T_SOBOL_FIX)
    }
  }
})

test("bootstrapIntervalCoversAnalyticOnIshigami", () => {
  const r = sobolIndices(ishigami, ISHI_NAMES, ISHI_BOUNDS, 2 ** 14, SEED)
  for (let i = 0; i < 3; i++) {
    const v = r[i] as (typeof r)[number]
    expect(v.S1_conf).toBeGreaterThan(0)
    expect(v.ST_conf).toBeGreaterThan(0)
    expect(Math.abs(v.S1 - (ANALYTIC_S1[i] as number))).toBeLessThan(
      2 * v.S1_conf,
    )
    expect(Math.abs(v.ST - (ANALYTIC_ST[i] as number))).toBeLessThan(
      2 * v.ST_conf,
    )
  }
  // deterministic: same seed, same bootstrap interval
  expect(
    sobolIndices(ishigami, ISHI_NAMES, ISHI_BOUNDS, 2 ** 14, SEED),
  ).toEqual(r)
})

test("morrisLinearExact", () => {
  const r = morrisScreen(
    (x) => (x[0] as number) + 10 * (x[1] as number) + 0 * (x[2] as number),
    ["a", "b", "c"],
    [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    20,
    SEED,
  )
  expect(r.map((v) => v.variable)).toEqual(["a", "b", "c"])
  for (const [i, want] of [1, 10, 0].entries()) {
    expect(Math.abs((r[i] as (typeof r)[number]).mu_star - want)).toBeLessThan(
      1e-9,
    )
    expect((r[i] as (typeof r)[number]).sigma).toBeLessThan(1e-9)
  }
})

test("morrisQuadraticAnalytic", () => {
  const r = morrisScreen(
    (x) =>
      (x[0] as number) +
      10 * (x[1] as number) +
      0.5 * (x[2] as number) * (x[2] as number),
    ["a", "b", "c"],
    [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    200,
    SEED,
  )
  expect(Math.abs((r[2] as (typeof r)[number]).mu_star - 0.5)).toBeLessThan(
    0.05,
  )
  expect((r[2] as (typeof r)[number]).sigma).toBeGreaterThan(0)
})

test("separateStreamsForAAndB", () => {
  const n = 512
  const d = 4
  const { A, B } = sobolMatrices(d, n, SEED)
  expect(A.length).toBe(n * d)
  expect(B.length).toBe(n * d)
  let same = 0
  for (let i = 0; i < A.length; i++) if (A[i] === B[i]) same++
  expect(same).toBe(0)
  // B is not A read at an offset (a shifted copy of one stream)
  for (let k = 1; k < 64; k++) {
    let eq = 0
    for (let i = 0; i + k < A.length; i++) if (B[i] === A[i + k]) eq++
    expect(eq).toBe(0)
    eq = 0
    for (let i = 0; i + k < A.length; i++) if (A[i] === B[i + k]) eq++
    expect(eq).toBe(0)
  }
  // all in [0, 1)
  for (const v of [...A, ...B]) {
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  }
  // seed changes both
  const other = sobolMatrices(d, n, SEED + 1)
  expect(other.A).not.toEqual(A)
})

test("variableOrderPreserved", () => {
  const f1 = (x: Float64Array) => (x[0] as number) + 10 * (x[1] as number)
  const f2 = (x: Float64Array) => 10 * (x[0] as number) + (x[1] as number)
  const a = sobolIndices(
    f1,
    ["small", "big"],
    [
      [0, 1],
      [0, 1],
    ],
    2 ** 14,
    SEED,
  )
  const b = sobolIndices(
    f2,
    ["big", "small"],
    [
      [0, 1],
      [0, 1],
    ],
    2 ** 14,
    SEED,
  )
  expect(a.map((v) => v.variable)).toEqual(["small", "big"])
  expect(b.map((v) => v.variable)).toEqual(["big", "small"])
  // analytic S1: 1/101 and 100/101 whichever column carries the variable
  for (const r of [a, b]) {
    const byName = Object.fromEntries(r.map((v) => [v.variable, v.S1]))
    expect(Math.abs((byName.big as number) - 100 / 101)).toBeLessThan(0.03)
    expect(Math.abs((byName.small as number) - 1 / 101)).toBeLessThan(0.03)
  }
  // a different bound per column: the labels follow the bounds, not the position
  const c = sobolIndices(
    (x) => x[0] as number,
    ["wide", "narrow"],
    [
      [0, 100],
      [0, 1],
    ],
    1024,
    SEED,
  )
  expect(c[0]?.variable).toBe("wide")
  expect(c[0]?.S1).toBeGreaterThan(0.9)
  expect(Math.abs(c[1]?.ST as number)).toBeLessThan(0.05)
})

test("degenerateOutputsExcludedAndLogged", () => {
  const got = capture()
  const f = (x: Float64Array) =>
    (x[1] as number) > 0.9 ? Number.POSITIVE_INFINITY : (x[0] as number)
  const r = sobolIndices(
    f,
    ["a", "b"],
    [
      [0, 1],
      [0, 1],
    ],
    2048,
    SEED,
  )
  for (const v of r)
    for (const k of ["S1", "ST", "S1_conf", "ST_conf"] as const)
      expect(Number.isFinite(v[k])).toBe(true)
  const dg = got.filter((e) => e.event === "model.degenerate")
  expect(dg.length).toBe(1)
  expect(dg[0]?.level).toBe("warn")
  expect(dg[0]?.fields.n_dropped as number).toBeGreaterThan(0)
  // Morris skips the infinite elementary effects and logs too
  const g2 = capture()
  const m = morrisScreen(
    f,
    ["a", "b"],
    [
      [0, 1],
      [0, 1],
    ],
    40,
    SEED,
  )
  for (const v of m) {
    expect(Number.isFinite(v.mu_star)).toBe(true)
    expect(Number.isFinite(v.sigma)).toBe(true)
  }
  expect(g2.some((e) => e.event === "model.degenerate")).toBe(true)
})

test("realModelsSmoke", () => {
  const f = sensitivityModel(ctx)
  const bounds = sensitivityBounds(ctx)
  expect(SENSITIVITY_VARIABLES.length).toBe(11)
  expect(bounds.length).toBe(11)
  expect(SENSITIVITY_OUTPUTS.length).toBe(4)
  // corners and midpoint of the box: 4 outputs, finite except possibly gel_time_rel
  const x = new Float64Array(11)
  for (const t of [0, 0.5, 1]) {
    bounds.forEach(([lo, hi], j) => {
      x[j] = lo + t * (hi - lo)
    })
    const y = f(x)
    expect(y.length).toBe(4)
    for (const [o, v] of y.entries())
      if (SENSITIVITY_OUTPUTS[o] !== "gel_time_rel")
        expect(Number.isFinite(v)).toBe(true)
      else expect(Number.isNaN(v)).toBe(false)
  }
  const rows = runSensitivity(ctx, SEED, 16)
  expect(validateSens(rows as never).length).toBe(rows.length)
  expect(rows.length).toBe(4 * 11 * 4)
  expect(new Set(rows.map((r) => r.output))).toEqual(
    new Set(SENSITIVITY_OUTPUTS),
  )
  expect(new Set(rows.map((r) => r.variable))).toEqual(
    new Set(SENSITIVITY_VARIABLES),
  )
  expect(new Set(rows.map((r) => r.index))).toEqual(
    new Set(["S1", "ST", "mu_star", "sigma"]),
  )
})

test("sensitivityDoneEvents", () => {
  const got = capture()
  runSensitivity(ctx, SEED, 16)
  const done = got.filter((e) => e.event === "sensitivity.done")
  expect(done.length).toBe(8)
  for (const e of done) expect(e.level).toBe("info")
  const sob = done.filter((e) => e.fields.method === "sobol")
  const mor = done.filter((e) => e.fields.method === "morris")
  expect(sob.map((e) => e.fields.output)).toEqual([...SENSITIVITY_OUTPUTS])
  expect(sob.every((e) => e.fields.n_evals === 16 * 13)).toBe(true)
  expect(mor.every((e) => e.fields.n_evals === 20 * 12)).toBe(true)
})

test("runSensitivityDeterministic", () => {
  expect(runSensitivity(ctx, SEED, 8)).toEqual(runSensitivity(ctx, SEED, 8))
  expect(runSensitivity(ctx, SEED + 1, 8)).not.toEqual(
    runSensitivity(ctx, SEED, 8),
  )
})
