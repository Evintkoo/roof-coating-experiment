import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"
import { ConfigError } from "../../../src/core/errors"
import { parseOptimize } from "../../../src/core/opt/optConfig"
import { VARS } from "../../../src/core/opt/vars"
import { repoRoot } from "../../helpers"

const text = readFileSync(join(repoRoot, "configs", "optimize.yaml"), "utf8")
const fresh = () => parse(text) as Record<string, any>

test("realConfigParsesAndMatchesVars", () => {
  const c = parseOptimize(fresh())
  expect(c.vars.map((v) => ({ id: v.id, lo: v.lo, hi: v.hi, h: v.h }))).toEqual(
    VARS.map((v) => ({ id: v.id, lo: v.lo, hi: v.hi, h: v.h })),
  )
  expect(c.tol_loss).toBe(0.01)
  expect(c.robust_draws).toBe(32)
  expect(c.interval_draws).toBe(64)
  expect(c.budget_levels).toBe(100)
  expect(Object.keys(c.profiles).sort()).toEqual(
    ["cooling_first", "balanced", "durability_first"].sort(),
  )
})

test("gradeSizeBoundsCarryProvenance", () => {
  const c = parseOptimize(fresh())
  for (const id of ["d_tio2_um", "d_baso4_um"]) {
    const v = c.vars.find((x) => x.id === id)
    expect(v?.status).toBe("scenario")
    expect(v?.source.length).toBeGreaterThan(20)
    expect(v?.unit).toBe("um")
  }
  const raw = fresh()
  raw.vars[7].source = ""
  expect(() => parseOptimize(raw)).toThrow(ConfigError)
})

test("weightsMustSumToOne", () => {
  const raw = fresh()
  raw.weights.balanced.r_solar_pred = 0.3 // sums to 1.1
  expect(() => parseOptimize(raw)).toThrow(ConfigError)
  const p = fresh()
  p.profiles.cooling_first.cost_proxy = 0.1
  expect(() => parseOptimize(p)).toThrow(ConfigError)
  try {
    parseOptimize(raw)
  } catch (e) {
    expect((e as ConfigError).code).toBe(2)
    expect((e as ConfigError).message).toContain("sum")
  }
})

test("weightsRejectNegativeAndUnknownObjective", () => {
  const raw = fresh()
  raw.weights.balanced.r_solar_pred = -0.2
  raw.weights.balanced.t_max_pred = 0.6
  expect(() => parseOptimize(raw)).toThrow(ConfigError)
  const u = fresh()
  u.profiles.balanced.wetting = 0
  expect(() => parseOptimize(u)).toThrow(ConfigError)
  const m = fresh()
  delete m.profiles.balanced.cost_proxy
  expect(() => parseOptimize(m)).toThrow(ConfigError)
})

test("configRejectsLoGreaterThanHi", () => {
  const raw = fresh()
  raw.vars[1].lo = 13
  expect(() => parseOptimize(raw)).toThrow(ConfigError)
  const eq = fresh()
  eq.vars[1].lo = eq.vars[1].hi
  expect(() => parseOptimize(eq)).toThrow(ConfigError)
})

test("configRejectsWrongVariableOrderCountOrStep", () => {
  const swap = fresh()
  ;[swap.vars[0], swap.vars[1]] = [swap.vars[1], swap.vars[0]]
  expect(() => parseOptimize(swap)).toThrow(ConfigError)
  const short = fresh()
  short.vars.pop()
  expect(() => parseOptimize(short)).toThrow(ConfigError)
  const h = fresh()
  h.vars[0].h = 0
  expect(() => parseOptimize(h)).toThrow(ConfigError)
  const big = fresh()
  big.vars[0].h = 0.6
  expect(() => parseOptimize(big)).toThrow(ConfigError)
})

test("startOutsideBoxRejected", () => {
  const ok = fresh()
  ok.extra_starts = [VARS.map((v) => 0.5 * (v.lo + v.hi))]
  expect(parseOptimize(ok).extra_starts).toHaveLength(1)
  const raw = fresh()
  const x = VARS.map((v) => 0.5 * (v.lo + v.hi))
  x[1] = 13 // primer DFT above 12 um
  raw.extra_starts = [x]
  expect(() => parseOptimize(raw)).toThrow(ConfigError)
  const short = fresh()
  short.extra_starts = [[1, 2, 3]]
  expect(() => parseOptimize(short)).toThrow(ConfigError)
})

test("strictKeysAndScalarisationParameters", () => {
  const extra = fresh()
  extra.surprise = 1
  expect(() => parseOptimize(extra)).toThrow(ConfigError)
  const b = fresh()
  b.scalarisation.beta = 0
  expect(() => parseOptimize(b)).toThrow(ConfigError)
  const t = fresh()
  t.tol_loss = 0
  expect(() => parseOptimize(t)).toThrow(ConfigError)
  const s = fresh()
  s.starts.pareto = 0
  expect(() => parseOptimize(s)).toThrow(ConfigError)
})
