import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import fc from "fast-check"
import { DESIGN_COLUMNS } from "../../src/core/columns"
import type { MaterialRanges } from "../../src/core/config"
import { toCsv } from "../../src/core/csv"
import {
  checkConstraints,
  L9,
  lhsDesign,
  lhsUnit,
  requireMinFeasible,
  scenarioFrom,
  weatherL9,
} from "../../src/core/design"
import { InfeasibleError } from "../../src/core/errors"
import { setEventSink } from "../../src/core/events"
import { deriveSeed, shuffleInPlace, Xoshiro128 } from "../../src/core/rng"
import type { DesignRow } from "../../src/core/schema"
import { loadMaterialRanges, loadWeather } from "../../src/node/config"
import { repoRoot } from "../helpers"

const ranges = await loadMaterialRanges(
  join(repoRoot, "configs/material_ranges.yaml"),
)
const weather = await loadWeather(
  join(repoRoot, "configs/weather_scenarios.yaml"),
)
const SEED = 20261121
const NUM_COLS = DESIGN_COLUMNS.slice(1) as readonly (keyof MaterialRanges &
  (typeof DESIGN_COLUMNS)[number])[]
const RANGE_COLUMNS = NUM_COLS.map(
  (c) =>
    [c, ranges[c]] as [(typeof NUM_COLS)[number], { min: number; max: number }],
)

test("shapeAndIds", () => {
  const rows = lhsDesign(96, ranges, SEED)
  expect(rows).toHaveLength(96)
  for (const [i, r] of rows.entries()) {
    expect(r.candidate_id).toBe(`SP-${String(i + 1).padStart(3, "0")}`)
  }
  expect(Object.keys(rows[0] as object)).toEqual([...DESIGN_COLUMNS])
})

test("sameSeedIdentical", () => {
  expect(lhsDesign(96, ranges, SEED)).toEqual(lhsDesign(96, ranges, SEED))
})

test("differentSeedDiffers", () => {
  expect(lhsDesign(96, ranges, SEED)).not.toEqual(
    lhsDesign(96, ranges, SEED + 1),
  )
})

test("stratifiedOnEveryColumn", () => {
  const rows = lhsDesign(96, ranges, SEED)
  for (const [col, { min, max }] of RANGE_COLUMNS) {
    const strata = rows.map((r) =>
      Math.floor(((r[col] - min) / (max - min)) * 96),
    )
    expect(new Set(strata).size).toBe(96)
    expect(Math.min(...strata)).toBe(0)
    expect(Math.max(...strata)).toBe(95)
  }
})

test("allInsideRanges", () => {
  for (const r of lhsDesign(96, ranges, SEED)) {
    for (const [col, { min, max }] of RANGE_COLUMNS) {
      expect(r[col]).toBeGreaterThan(min)
      expect(r[col]).toBeLessThan(max)
    }
  }
})

test("lhsUnitIsStratifiedAndOpen", () => {
  const u = lhsUnit(50, 3, 7)
  expect(u).toHaveLength(50)
  for (let j = 0; j < 3; j++) {
    const s = u.map((row) => Math.floor((row[j] as number) * 50))
    expect(new Set(s).size).toBe(50)
    for (const row of u) {
      expect(row[j]).toBeGreaterThan(0)
      expect(row[j]).toBeLessThan(1)
    }
  }
})

test("jitterStaysInsideStratum", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 40 }),
      fc.integer({ min: 0, max: 0xffffffff }),
      (n, seed) => {
        const u = lhsUnit(n, 2, seed)
        for (let j = 0; j < 2; j++) {
          // independent re-derivation of the permutation from stream j (D11/D13)
          const rng = new Xoshiro128(deriveSeed(seed, j))
          const perm = Array.from({ length: n }, (_, i) => i)
          shuffleInPlace(rng, perm)
          for (let i = 0; i < n; i++) {
            const x = (u[i] as number[])[j] as number
            expect(x).toBe(
              ((perm[i] as number) + 0.001 + 0.998 * rng.next()) / n,
            )
            expect(Math.floor(x * n)).toBe(perm[i] as number)
            const frac = x * n - (perm[i] as number)
            expect(frac).toBeGreaterThanOrEqual(0.001 - 1e-9)
            expect(frac).toBeLessThanOrEqual(0.999 + 1e-9)
          }
        }
      },
    ),
    { numRuns: 100 },
  )
})

test("nineDistinctScenarios", () => {
  const w = weatherL9(weather)
  expect(w.map((s) => s.scenario_id)).toEqual(
    Array.from({ length: 9 }, (_, i) => `W${i + 1}`),
  )
  const keys = new Set(
    w.map((s) => `${s.irradiance_w_m2}|${s.t_air_c}|${s.wind_m_s}`),
  )
  expect(keys.size).toBe(9)
})

test("pairwiseBalance", () => {
  const w = weatherL9(weather)
  const levels = {
    irradiance_w_m2: weather.irradiance_w_m2.values,
    t_air_c: weather.t_air_c.values,
    wind_m_s: weather.wind_m_s.values,
  }
  const f = Object.keys(levels) as (keyof typeof levels)[]
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const fa = f[a] as keyof typeof levels
      const fb = f[b] as keyof typeof levels
      const counts = new Map<string, number>()
      for (const s of w) {
        const k = `${levels[fa].indexOf(s[fa])}${levels[fb].indexOf(s[fb])}`
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      expect(counts.size).toBe(9)
      for (const c of counts.values()) expect(c).toBe(1)
    }
  }
  expect(L9).toHaveLength(9)
})

test("hConvMatchesMcAdams", () => {
  const h = (v: number) => scenarioFrom(800, 32, v, weather).h_conv_w_m2k
  expect(h(1)).toBeCloseTo(9.5, 12)
  expect(h(3)).toBeCloseTo(17.1, 12)
  expect(h(6)).toBeCloseTo(28.5, 12)
  expect(h(0)).toBe(5.7)
})

test("skyTemperatureMatchesSwinbank", () => {
  const w1 = weatherL9(weather)[0]
  expect(w1?.t_air_c).toBe(28)
  const hand = 0.0552 * 301.15 * Math.sqrt(301.15)
  const got = w1?.t_sky_k as number
  expect(got).toBe(hand)
  expect(Math.abs(got - hand) / hand).toBeLessThan(1e-12)
  expect(Math.abs(got - 0.0552 * 301.15 ** 1.5) / got).toBeLessThan(1e-12)
})

test("candidatesCsvMatchesFrozenHash", () => {
  const csv = toCsv(DESIGN_COLUMNS, lhsDesign(96, ranges, SEED))
  const got = createHash("sha256").update(csv).digest("hex")
  const frozen = readFileSync(
    join(repoRoot, "tests/fixtures/expected_design_hash.txt"),
    "utf8",
  ).trim()
  expect(got).toBe(frozen)
})

// ---- constraints (D8, FR-5, H3) ----

const base = () => lhsDesign(96, ranges, SEED)
const cpvc = ranges.cpvc.value
const cap = ranges.max_total_dft_um.value

test("defaultDesignHasAtLeast77Feasible", () => {
  const flagged = checkConstraints(base(), ranges)
  const n = flagged.filter((r) => r.feasible).length
  console.log(`feasible count (seed ${SEED}): ${n} of 96`)
  expect(n).toBeGreaterThanOrEqual(77)
  expect(() => requireMinFeasible(flagged)).not.toThrow()
})

test("cpvcBinding", () => {
  const rows = base()
  const lowered = { ...ranges, cpvc: { ...ranges.cpvc, value: 0.2 } }
  const flagged = checkConstraints(rows, lowered)
  const expected = rows.filter((r) => r.midcoat_pvc > 0.2).length
  expect(expected).toBeGreaterThan(0)
  const c1 = flagged.filter((r) => r.violations.split(";").includes("C-1"))
  expect(c1).toHaveLength(expected)
  for (const r of c1) expect(r.midcoat_pvc).toBeGreaterThan(0.2)
})

test("topcoatThickerThanMidcoatFlaggedC2", () => {
  const r = {
    ...(base()[0] as DesignRow),
    midcoat_dft_um: 50,
    topcoat_dft_um: 51,
  }
  const [f] = checkConstraints([r], ranges)
  expect(f?.violations).toBe("C-2")
  expect(f?.feasible).toBe(false)
  const [ok] = checkConstraints([{ ...r, topcoat_dft_um: 50 }], ranges)
  expect(ok?.feasible).toBe(true)
})

test("totalDftFlaggedC3", () => {
  const r = {
    ...(base()[0] as DesignRow),
    midcoat_pvc: 0.2,
    primer_dft_um: 12,
    midcoat_dft_um: 300,
    topcoat_dft_um: 20,
  }
  expect(checkConstraints([r], ranges)[0]?.feasible).toBe(true) // exactly at the cap
  const [f] = checkConstraints([{ ...r, primer_dft_um: 12.5 }], ranges)
  expect(f?.violations).toBe("C-3")
})

test("independentRecheck", () => {
  const rows = base()
  const lowered = { ...ranges, cpvc: { ...ranges.cpvc, value: 0.2 } }
  for (const rg of [ranges, lowered]) {
    const flagged = checkConstraints(rows, rg)
    flagged.forEach((f, i) => {
      const r = rows[i] as DesignRow
      const ids: string[] = []
      if (r.midcoat_pvc > rg.cpvc.value) ids.push("C-1")
      if (r.topcoat_dft_um > r.midcoat_dft_um) ids.push("C-2")
      if (r.primer_dft_um + r.midcoat_dft_um + r.topcoat_dft_um > 332)
        ids.push("C-3")
      expect(f.violations).toBe(ids.join(";"))
      expect(f.feasible).toBe(ids.length === 0)
    })
  }
  expect(cap).toBe(332)
  expect(cpvc).toBe(0.45)
})

test("requireMinFeasibleThrowsCode3", () => {
  const events: string[] = []
  const fields: Record<string, string | number | boolean>[] = []
  setEventSink((e, _l, f) => {
    events.push(e)
    if (e === "constraint.infeasible_run") fields.push(f)
  })
  try {
    const low = { ...ranges, cpvc: { ...ranges.cpvc, value: 0.12 } }
    const flagged = checkConstraints(base(), low)
    expect(flagged.filter((r) => r.feasible).length).toBeLessThan(77)
    let err: unknown
    try {
      requireMinFeasible(flagged)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(InfeasibleError)
    expect((err as InfeasibleError).code).toBe(3)
    expect(events).toContain("constraint.violated")
    expect(events).toContain("constraint.infeasible_run")
    expect(fields).toEqual([
      { feasible: flagged.filter((r) => r.feasible).length, required: 77 },
    ])
  } finally {
    setEventSink(null)
  }
})

test("infeasibleRowsKept", () => {
  const rows = base()
  const low = { ...ranges, cpvc: { ...ranges.cpvc, value: 0.12 } }
  const flagged = checkConstraints(rows, low)
  expect(flagged).toHaveLength(rows.length)
  flagged.forEach((f, i) => {
    expect(f.candidate_id).toBe((rows[i] as DesignRow).candidate_id)
  })
  expect(flagged.some((r) => !r.feasible)).toBe(true)
})

test("constraintViolatedEmitsOneEventPerRule", () => {
  const evs: Record<string, string | number | boolean>[] = []
  setEventSink((e, _l, f) => {
    if (e === "constraint.violated") evs.push(f)
  })
  try {
    const r = {
      ...(base()[0] as DesignRow),
      midcoat_pvc: 0.4,
      midcoat_dft_um: 10,
      topcoat_dft_um: 20,
    }
    const low = { ...ranges, cpvc: { ...ranges.cpvc, value: 0.2 } }
    checkConstraints([r], low)
    expect(evs).toEqual([
      { candidate_id: r.candidate_id, rule: "C-1" },
      { candidate_id: r.candidate_id, rule: "C-2" },
    ])
  } finally {
    setEventSink(null)
  }
})

test("requireMinFeasibleBoundary", () => {
  const rows = checkConstraints(base(), ranges)
  const withFeasible = (k: number) =>
    rows.map((r, i) => ({ ...r, feasible: i < k }))
  expect(() => requireMinFeasible(withFeasible(77))).not.toThrow()
  expect(() => requireMinFeasible(withFeasible(76))).toThrow(InfeasibleError)
  try {
    requireMinFeasible(withFeasible(76))
  } catch (e) {
    expect((e as InfeasibleError).code).toBe(3)
  }
})
