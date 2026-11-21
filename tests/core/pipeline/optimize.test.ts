import { afterEach, expect, test } from "bun:test"
import fc from "fast-check"
import { InfeasibleError } from "../../../src/core/errors"
import { type Level, setEventSink } from "../../../src/core/events"
import {
  buildPareto,
  candidateObjectives,
  OBJECTIVES,
  paretoFrequency,
  paretoFront,
  shortlist,
} from "../../../src/core/pipeline/optimize"
import type { ResultRow } from "../../../src/core/schema"

afterEach(() => setEventSink(null))

const SENSE = OBJECTIVES.map(([, s]) => s)
type Ev = { event: string; level: Level; fields: Record<string, unknown> }
const capture = (): Ev[] => {
  const got: Ev[] = []
  setEventSink((event, level, fields) => got.push({ event, level, fields }))
  return got
}

/** H1 reference: 6-line O(n^2) non-dominated set (NaN rows never on the front, never dominate). */
function brute(obj: number[][], sense: ("min" | "max")[]): boolean[] {
  const ok = (r: number[]) => r.every((v) => !Number.isNaN(v))
  const better = (a: number, b: number, k: number) =>
    sense[k] === "max" ? a > b : a < b
  const dom = (a: number[], b: number[]) =>
    ok(a) &&
    a.every((v, k) => !better(b[k] as number, v, k)) &&
    a.some((v, k) => better(v, b[k] as number, k))
  return obj.map((b) => ok(b) && !obj.some((a) => dom(a, b)))
}

const valueArb = fc.oneof(
  { weight: 8, arbitrary: fc.integer({ min: 0, max: 3 }) }, // small domain => many ties
  { weight: 1, arbitrary: fc.constant(Number.NaN) },
)

test("matchesBruteforceProperty", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 5 }).chain((m) =>
        fc.tuple(
          fc.array(fc.constantFrom<"min" | "max">("min", "max"), {
            minLength: m,
            maxLength: m,
          }),
          fc.array(fc.array(valueArb, { minLength: m, maxLength: m }), {
            maxLength: 25,
          }),
        ),
      ),
      ([sense, obj]) => {
        expect(paretoFront(obj, sense)).toEqual(brute(obj, sense))
      },
    ),
    { numRuns: 500 },
  )
})

test("dominatedCandidateNeverInFront", () => {
  // r_solar max, others min: B is worse on every objective than A
  const a = [0.9, 40, 0.1, 0.1, 0.3]
  const b = [0.8, 45, 0.2, 0.2, 0.4]
  expect(paretoFront([a, b], SENSE)).toEqual([true, false])
  // sign flip would put B on the front instead
  expect(paretoFront([b, a], SENSE)).toEqual([false, true])
})

test("tiesBothKept", () => {
  const a = [0.9, 40, 0.1, 0.1, 0.3]
  expect(paretoFront([a, [...a], [0.5, 60, 0.5, 0.5, 0.9]], SENSE)).toEqual([
    true,
    true,
    false,
  ])
  expect(
    paretoFront(
      [
        [1, Number.NaN],
        [1, 1],
      ],
      ["max", "min"],
    ),
  ).toEqual([false, true])
})

test("frequencyInUnitIntervalAndConsistent", () => {
  // 3 candidates x 2 draws x 1 objective (min): draw0 order a<b<c, draw1 b<a<c
  const m = new Float64Array([1, 2, 3, 2, 1, 3])
  const f = paretoFrequency(m, 2, 3, ["min"])
  expect([...f]).toEqual([0.5, 0.5, 0])
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 0, max: 1e6 }),
      (nD, nC, s) => {
        const d = new Float64Array(nD * nC * 5)
        let x = s + 1
        for (let i = 0; i < d.length; i++) {
          x = (x * 48271) % 2147483647
          d[i] = x % 4
        }
        const fr = paretoFrequency(d, nD, nC, SENSE)
        for (const v of fr) expect(v >= 0 && v <= 1).toBe(true)
        // consistency with the brute reference, draw by draw
        const expected = new Array<number>(nC).fill(0)
        for (let k = 0; k < nD; k++) {
          const rows = Array.from({ length: nC }, (_, c) => [
            ...d.slice((k * nC + c) * 5, (k * nC + c) * 5 + 5),
          ])
          brute(rows, [...SENSE]).forEach((on, c) => {
            if (on) expected[c] = (expected[c] as number) + 1 / nD
          })
        }
        expect(
          [...fr].map((v, c) => Math.abs(v - (expected[c] as number))),
        ).toSatisfy((e: number[]) => e.every((v) => v < 1e-12))
        // a single draw equals the front indicator
        const one = paretoFrequency(d.slice(0, nC * 5), 1, nC, SENSE)
        expect([...one]).toEqual(
          paretoFront(
            Array.from({ length: nC }, (_, c) => [
              ...d.slice(c * 5, c * 5 + 5),
            ]),
            SENSE,
          ).map(Number),
        )
      },
    ),
    { numRuns: 50 },
  )
  expect(() => paretoFrequency(new Float64Array(5), 2, 1, SENSE)).toThrow()
})

/** Build a minimal results table: one row per (candidate, scenario) with given objective means. */
function results(
  cands: { id: string; v: number[]; feasible?: boolean }[],
): ResultRow[] {
  const rows: ResultRow[] = []
  for (const c of cands)
    for (const [si, sc] of ["S1", "S2"].entries()) {
      const d = si === 0 ? -1 : 1 // scenarios average back to v; t_max_worst = v + 1
      const nan = c.feasible === false
      const o = (x: number) => (nan ? Number.NaN : x)
      rows.push({
        candidate_id: c.id,
        scenario_id: sc,
        feasible: c.feasible !== false,
        r_solar_pred: o(c.v[0] as number),
        t_max_pred: o((c.v[1] as number) + d),
        corrosion_proxy: o(c.v[2] as number),
        delam_proxy: o(c.v[3] as number),
        cost_proxy: o(c.v[4] as number),
      } as unknown as ResultRow)
    }
  return rows
}

const four = [
  { id: "SP-001", v: [0.9, 50, 0.5, 0.5, 0.9] }, // best r_solar, costly
  { id: "SP-002", v: [0.7, 40, 0.3, 0.3, 0.5] }, // balanced-ish
  { id: "SP-003", v: [0.6, 60, 0.9, 0.9, 0.1] }, // cheapest
  { id: "SP-004", v: [0.5, 70, 0.95, 0.95, 0.95] }, // dominated
]

test("shortlistThreeDistinct", () => {
  const objs = candidateObjectives(results(four))
  expect(objs.map((o) => o.candidate_id)).toEqual([
    "SP-001",
    "SP-002",
    "SP-003",
    "SP-004",
  ])
  expect(objs[0]?.values).toEqual([0.9, 50, 0.5, 0.5, 0.9])
  expect(objs[0]?.t_max_worst).toBe(51)
  const got = capture()
  const s = shortlist(objs, new Float64Array(4), 0.55)
  expect(s.high_performing).toBe("SP-001")
  expect(s.low_cost).toBe("SP-003")
  expect(s.balanced).toBe("SP-002")
  expect(new Set(Object.values(s)).size).toBe(3)
  expect(got.filter((e) => e.event === "shortlist.chosen").length).toBe(3)
  expect(got.some((e) => e.event === "shortlist.low_cost_fallback")).toBe(false)
})

test("shortlistTiedCandidatesStillDistinct", () => {
  // Review Focus 1: identical objectives -> both on the front, roles still distinct
  const tied = [
    { id: "SP-001", v: [0.9, 40, 0.1, 0.1, 0.1] },
    { id: "SP-002", v: [0.9, 40, 0.1, 0.1, 0.1] },
    { id: "SP-003", v: [0.9, 40, 0.1, 0.1, 0.1] },
  ]
  const objs = candidateObjectives(results(tied))
  expect(
    paretoFront(
      objs.map((o) => o.values),
      SENSE,
    ),
  ).toEqual([true, true, true])
  const s = shortlist(objs, new Float64Array(3), 0.5)
  expect(Object.values(s)).toEqual(["SP-001", "SP-002", "SP-003"])
})

test("shortlistFewerThanThreeFeasibleExit3", () => {
  const two = results([
    ...four.slice(0, 2),
    { id: "SP-003", v: [0, 0, 0, 0, 0], feasible: false },
  ])
  const objs = candidateObjectives(two)
  expect(objs.length).toBe(2)
  expect(() => shortlist(objs, new Float64Array(2), 0.5)).toThrow(
    InfeasibleError,
  )
  try {
    shortlist(objs, new Float64Array(2), 0.5)
  } catch (e) {
    expect((e as InfeasibleError).code).toBe(3)
    expect((e as Error).message).toContain("at least 3")
  }
})

test("lowCostFallbackLogged", () => {
  const objs = candidateObjectives(results(four))
  const got = capture()
  // C1 reflects more than every candidate: no member beats it, so low_cost falls back to min cost overall
  const s = shortlist(objs, new Float64Array(4), 0.99)
  expect(s.low_cost).toBe("SP-003")
  const fb = got.filter((e) => e.event === "shortlist.low_cost_fallback")
  expect(fb.length).toBe(1)
  expect(fb[0]?.level).toBe("warn")
  expect(fb[0]?.fields).toMatchObject({ candidate_id: "SP-003" })
})

test("lowCostPrefersEligibleMemberOverCheaperIneligible", () => {
  // C1 = 0.7: only A and B (Pareto members) clear it. C is the cheapest member overall but does not clear C1,
  // so low_cost must be the eligible B (not C), and with an eligible member available no fallback is logged.
  const objs = candidateObjectives(
    results([
      { id: "SP-001", v: [0.9, 50, 0.5, 0.5, 0.9] }, // A: best r_solar
      { id: "SP-002", v: [0.75, 55, 0.6, 0.6, 0.6] }, // B: eligible, cheaper than A
      { id: "SP-003", v: [0.6, 54, 0.55, 0.55, 0.05] }, // C: cheapest, ineligible
      { id: "SP-004", v: [0.68, 45, 0.25, 0.25, 0.4] }, // D: balanced, ineligible
    ]),
  )
  expect(
    paretoFront(
      objs.map((o) => o.values),
      SENSE,
    ),
  ).toEqual([true, true, true, true])
  const got = capture()
  const s = shortlist(objs, new Float64Array(4), 0.7)
  expect(s).toEqual({
    high_performing: "SP-001",
    balanced: "SP-004",
    low_cost: "SP-002",
  })
  expect(got.some((e) => e.event === "shortlist.low_cost_fallback")).toBe(false)
  // C1 = 0.8: A is the only eligible member and high_performing already took it, so low_cost falls
  // back to the cheapest remaining member (C) and says so
  const got2 = capture()
  const t = shortlist(objs, new Float64Array(4), 0.8)
  expect(t.low_cost).toBe("SP-003")
  expect(
    got2.filter((e) => e.event === "shortlist.low_cost_fallback").length,
  ).toBe(1)
})

test("shortlistDeterministic", () => {
  const objs = candidateObjectives(results(four))
  const a = shortlist(objs, new Float64Array(4), 0.55)
  const b = shortlist([...objs].reverse(), new Float64Array(4), 0.55)
  expect(b).toEqual(a)
  const t = candidateObjectives(
    results([
      { id: "SP-009", v: [0.9, 40, 0.1, 0.1, 0.1] },
      { id: "SP-002", v: [0.9, 40, 0.1, 0.1, 0.1] },
      { id: "SP-005", v: [0.9, 40, 0.1, 0.1, 0.1] },
    ]),
  )
  expect(shortlist(t, new Float64Array(3), 0.5)).toEqual({
    high_performing: "SP-002",
    balanced: "SP-005",
    low_cost: "SP-009",
  })
})

test("buildParetoRowsCarryFrontFrequencyRole", () => {
  const got = capture()
  const objs = candidateObjectives(results(four))
  // draws identical to the nominal values, 3 draws
  const d = new Float64Array(3 * 4 * 5)
  for (let k = 0; k < 3; k++)
    objs.forEach((o, c) => {
      d.set(o.values, (k * 4 + c) * 5)
    })
  const rows = buildPareto(results(four), d, 3, 0.55)
  expect(rows.map((r) => r.on_front)).toEqual([true, true, true, false])
  expect(rows.map((r) => r.pareto_freq)).toEqual([1, 1, 1, 0])
  expect(rows.map((r) => r.role)).toEqual([
    "high_performing",
    "balanced",
    "low_cost",
    "",
  ])
  expect(got.find((e) => e.event === "pareto.computed")?.fields).toEqual({
    n_candidates: 4,
    n_front: 3,
  })
})
