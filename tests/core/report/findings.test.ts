// Plan 06 Task 5 (H7, F6): the headline sentences are computed from the result files and checked against them.
import { beforeAll, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DataError } from "../../../src/core/errors"
import {
  type Finding,
  type FindingsInput,
  findings,
} from "../../../src/core/report/findings"
import { loadFindingsInput } from "../../../src/node/report/findingsInput"
import { REPORT_FIXTURE } from "../../helpers"

// plan 00 honesty list plus the plan 06 words (ranks, not measures); outline.ts exports the page-wide twin
const OVERCLAIM_PATTERN =
  /\bproven\b|\bsafe\b|guarantee|\bbest\b|\bproves?\b|\bworks\b|\brecommended\b|validated|measured in Indonesia|field[- ]tested/i
const RUN = REPORT_FIXTURE

// ---- independent recomputation: its own tiny CSV reader, no code shared with src ----
type Table = Record<string, string>[]
function table(path: string): Table {
  const lines = readFileSync(join(RUN, path), "utf8").trim().split("\n")
  const head = (lines[0] as string).split(",")
  return lines.slice(1).map((l) => {
    const c = l.split(",")
    return Object.fromEntries(head.map((h, i) => [h, c[i] as string]))
  })
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const round = (v: number, d: number) => Number(v.toFixed(d))

type Raw = {
  results: Table
  controls: Table
  refine: Table
  budget: {
    tables: {
      profile: string
      c_min: number
      c_max: number
      knee_budget: number
    }[]
  }
  ind: Table
  days: { loss_lo: number; loss_hi: number }
}
let raw: Raw
let real: FindingsInput
beforeAll(() => {
  raw = {
    results: table("results.csv"),
    controls: table("controls.csv"),
    refine: table("refine/refine_recipes.csv"),
    budget: JSON.parse(
      readFileSync(join(RUN, "refine/budget_table.json"), "utf8"),
    ),
    ind: table("indonesia/indonesia_summary.csv"),
    days: JSON.parse(
      readFileSync(join(RUN, "indonesia/indonesia_days.json"), "utf8"),
    ),
  }
  real = loadFindingsInput(RUN)
})

function independent(key: string): number {
  const p = key.split(".")
  const c0 = avg(
    raw.controls
      .filter((r) => r.control_id === "C0")
      .map((r) => Number(r.t_max_pred)),
  )
  const recipe = (role: string) => {
    const id = (
      raw.refine.find((r) => r.role === role) as Record<string, string>
    ).screened_id as string
    const rows = raw.results.filter((r) => r.candidate_id === id)
    return {
      id,
      v: c0 - avg(rows.map((r) => Number(r.t_max_pred))),
      lo: c0 - avg(rows.map((r) => Number(r.t_max_hi))),
      hi: c0 - avg(rows.map((r) => Number(r.t_max_lo))),
      cost: Number((rows[0] as Record<string, string>).cost_proxy),
    }
  }
  const roles = ["high_performing", "balanced", "low_cost"]
  if (p[0] === "verdict") {
    const r = roles.map(recipe)
    if (p[1] === "cooling_min") return Math.min(...r.map((x) => x.v))
    if (p[1] === "cooling_max") return Math.max(...r.map((x) => x.v))
    if (p[1] === "spread")
      return Math.max(...r.map((x) => x.v)) - Math.min(...r.map((x) => x.v))
    if (p[1] === "interval_lo") return Math.min(...r.map((x) => x.lo))
    if (p[1] === "interval_hi") return Math.max(...r.map((x) => x.hi))
  }
  if (p[0] === "cooling") {
    const r = recipe(p[1] as string)
    return { value: r.v, lo: r.lo, hi: r.hi }[p[2] as "value"]
  }
  if (p[0] === "cost") return recipe(p[1] as string).cost
  if (p[0] === "cost_rank") {
    const mine = recipe(p[1] as string).cost
    const costs = new Map(
      raw.results.map((r) => [r.candidate_id, Number(r.cost_proxy)]),
    )
    return 1 + [...costs.values()].filter((c) => c < mine).length
  }
  if (p[0] === "cost_n")
    return new Set(raw.results.map((r) => r.candidate_id)).size
  if (p[0] === "refined") {
    const r = raw.refine.find((x) => x.role === p[1]) as Record<string, string>
    return Number(p[2] === "t_max" ? r.t_max_pred : r.cost_proxy)
  }
  if (p[0] === "tradeoff") {
    const role = p[1] as string
    const f = raw.refine.find((x) => x.role === role) as Record<string, string>
    const r = recipe(role)
    return {
      cooling: c0 - Number(f.t_max_pred),
      refined_cost: Number(f.cost_proxy),
      cost: r.cost,
    }[p[2] as "cost"]
  }
  if (p[0] === "budget") {
    if (p[1] === "knee_share_pct") return 95
    const t = raw.budget.tables.find(
      (x) => x.profile === p[1],
    ) as (typeof raw.budget.tables)[number]
    return { knee: t.knee_budget, c_min: t.c_min, c_max: t.c_max }[
      p[2] as "knee"
    ]
  }
  if (p[0] === "indonesia") {
    if (p[1] === "loss_lo") return raw.days.loss_lo
    if (p[1] === "loss_hi") return raw.days.loss_hi
    const r = raw.ind.find(
      (x) =>
        x.subject === "card_high" &&
        x.bin === "weighted" &&
        x.state === p[1] &&
        x.site === p[2],
    ) as Record<string, string>
    return Number({ dq: r.dq_w_m2, lo: r.dq_lo, hi: r.dq_hi }[p[3] as "dq"])
  }
  throw new Error(`no independent rule for ${key}`)
}

const all = (f: Finding[]) => f.flatMap((s) => s.numbers)

test("everyNumberEqualsItsSource", () => {
  const f = findings(real)
  const nums = all(f)
  expect(nums.length).toBeGreaterThan(40)
  for (const n of nums) {
    expect(round(n.value, n.digits)).toBe(round(independent(n.key), n.digits))
    // and the sentence prints exactly that rounded number
    const s = f.find((x) => x.numbers.includes(n))?.sentence as string
    expect(s).toContain(n.value.toFixed(n.digits).replace(/^-0(\.0+)?$/, "0$1"))
  }
})

test("everyFindingNamesItsSources", () => {
  for (const s of findings(real)) {
    expect(s.sources.length).toBeGreaterThan(0)
    expect(s.sources.join(" ")).toMatch(/\.csv|\.json|BLOCKED/)
  }
})

test("theRealRunProducesTheExpectedSentences", () => {
  const f = findings(real)
  expect(f.map((x) => x.id)).toEqual([
    "verdict",
    "recipe-high_performing",
    "recipe-balanced",
    "recipe-low_cost",
    "cost-tradeoff",
    "indonesia-initial",
    "indonesia-aged",
    "budget",
    "not-modelled",
  ])
  expect(f.find((x) => x.id === "verdict")?.sentence).toContain(
    "about 13 to 14 K",
  )
  expect(f.filter((x) => x.label !== undefined).map((x) => x.label)).toEqual([
    "Highest cooling",
    "Balanced",
    "Lowest cost",
  ])
})

test("sentencesNameTheirUncertainty", () => {
  const comparative =
    /lower|cool|falls|shrinks|cheapest|dearest|stops improving|differ|benefit/i
  const named = /parameter uncertainty|nominal only|\[-?\d/
  let seen = 0
  for (const s of findings(real)) {
    if (!comparative.test(s.sentence)) continue
    seen++
    expect(s.sentence).toMatch(named)
  }
  expect(seen).toBeGreaterThanOrEqual(7)
  // the scan can fail
  expect(named.test("it lowers the temperature by 14 K")).toBe(false)
  // every recipe line carries its bracketed interval
  for (const s of findings(real).filter((x) => x.id.startsWith("recipe-")))
    expect(s.sentence).toMatch(/\[-?\d+\.\d, -?\d+\.\d\]/)
})

test("noOverclaim", () => {
  for (const s of findings(real))
    expect(s.sentence).not.toMatch(OVERCLAIM_PATTERN)
  for (const bad of [
    "the best recipe",
    "this proves it",
    "it works",
    "a guarantee",
    "a safe roof",
  ])
    expect(OVERCLAIM_PATTERN.test(bad)).toBe(true)
})

test("proxyAndScenarioAreLabelled", () => {
  const f = findings(real)
  for (const s of f.filter((x) => x.id.startsWith("recipe-")))
    expect(s.sentence).toContain("PROXY")
  const aged = f.find((x) => x.id === "indonesia-aged")?.sentence as string
  expect(aged).toContain("Scenario ageing, not a measurement")
  expect(f.find((x) => x.id === "budget")?.sentence).toContain("not rupiah")
  expect(f.find((x) => x.id === "not-modelled")?.sentence).toContain("PROXY")
})

test("coolingWordingSaysAboutNotBest", () => {
  const v = findings(real)[0] as Finding
  expect(v.sentence).toMatch(/about \d+ to \d+ K/)
  expect(v.sentence).not.toMatch(/best|strongest|winner/i)
})

test("fallbackWithoutRefineFiles", () => {
  const { refine: _r, ...rest } = real
  const f = findings(rest)
  const rec = f.filter((x) => x.id.startsWith("recipe-"))
  expect(rec.length).toBe(3)
  // roles now come from the shortlist (candidate_cards), the same three recipes in this run
  expect(rec.map((x) => x.sentence.match(/SP-\d{3}/)?.[0])).toEqual([
    "SP-075",
    "SP-031",
    "SP-046",
  ])
  for (const s of rec) expect(s.sentence).not.toContain("refined variant")
  // F2: the cost trade-off sentence needs the refine files and is omitted without them
  expect(f.some((x) => x.id === "cost-tradeoff")).toBe(false)
  expect(all(f).some((n) => n.key.startsWith("refined."))).toBe(false)
  // the cooling numbers are the same with and without refine files
  const withRefine = findings(real)
  expect(all(f).find((n) => n.key === "cooling.balanced.value")?.value).toBe(
    all(withRefine).find((n) => n.key === "cooling.balanced.value")?.value,
  )
})

test("fallbackFollowsTheShortlistNotTheRefineFile", () => {
  const { refine: _r, ...rest } = real
  const other = (real.results[0] as { candidate_id: string }).candidate_id
  const f = findings({
    ...rest,
    shortlist: { ...real.shortlist, balanced: other },
  })
  expect(f.find((x) => x.id === "recipe-balanced")?.sentence).toContain(
    `Recipe ${other} `,
  )
})

test("incompleteRefineFallsBackToTheShortlist", () => {
  const f = findings({ ...real, refine: (real.refine ?? []).slice(0, 2) })
  expect(
    f
      .filter((x) => x.id.startsWith("recipe-"))
      .every((x) => !x.sentence.includes("refined variant")),
  ).toBe(true)
})

test("emptyShortlistIsExit5", () => {
  const { refine: _r, ...rest } = real
  for (const bad of [{}, { high_performing: "SP-075" }]) {
    try {
      findings({ ...rest, shortlist: bad })
      throw new Error("expected a DataError")
    } catch (e) {
      expect(e).toBeInstanceOf(DataError)
      expect((e as DataError).code).toBe(5)
    }
  }
  expect(() =>
    findings({
      ...rest,
      shortlist: {
        high_performing: "SP-999",
        balanced: "SP-031",
        low_cost: "SP-046",
      },
    }),
  ).toThrow(DataError)
  expect(() => findings({ ...real, controls: [] })).toThrow(DataError)
})

test("absentOptionalPartsAreOmittedWithoutError", () => {
  const { refine: _a, budget: _b, indonesia: _c, ...core } = real
  const ids = findings(core).map((x) => x.id)
  expect(ids).toEqual([
    "verdict",
    "recipe-high_performing",
    "recipe-balanced",
    "recipe-low_cost",
    "not-modelled",
  ])
})

test("isPure", () => {
  expect(findings(real)).toEqual(findings(real))
})

test("costTradeoffNamesOnlyRecipesWhoseRefinedVariantIsCheaperAndCoolsAtLeastAsWell", () => {
  const t = findings(real).find((x) => x.id === "cost-tradeoff") as Finding
  // independent: which roles qualify, from the raw files
  const c0 = avg(
    raw.controls
      .filter((r) => r.control_id === "C0")
      .map((r) => Number(r.t_max_pred)),
  )
  const qualifying = raw.refine.filter((f) => {
    const rows = raw.results.filter((r) => r.candidate_id === f.screened_id)
    const lo = c0 - avg(rows.map((r) => Number(r.t_max_hi)))
    const cost = Number((rows[0] as Record<string, string>).cost_proxy)
    return (
      Number(Number(f.cost_proxy).toFixed(2)) < Number(cost.toFixed(2)) &&
      c0 - Number(f.t_max_pred) >= lo
    )
  })
  expect(qualifying.length).toBeGreaterThan(0)
  for (const f of qualifying)
    expect(t.sentence).toContain(f.screened_id as string)
  for (const f of raw.refine.filter((x) => !qualifying.includes(x)))
    expect(t.sentence).not.toContain(f.screened_id as string)
  // a refine file in which nothing is cheaper drops the sentence
  const dear = (real.refine ?? []).map((r) => ({ ...r, cost_proxy: 9 }))
  expect(
    findings({ ...real, refine: dear }).some((x) => x.id === "cost-tradeoff"),
  ).toBe(false)
})

test("indonesiaRankingSaysWhenTheTopRangesOverlap", () => {
  const initial = findings(real).find(
    (x) => x.id === "indonesia-initial",
  ) as Finding
  const rows = raw.ind
    .filter(
      (x) =>
        x.subject === "card_high" &&
        x.bin === "weighted" &&
        x.state === "initial",
    )
    .sort((a, b) => Number(b.dq_w_m2) - Number(a.dq_w_m2))
  const [top, second] = rows as [Record<string, string>, Record<string, string>]
  // independent overlap test from the raw file
  expect(Number(second.dq_hi) >= Number(top.dq_lo)).toBe(true)
  const name = (r: Record<string, string>) =>
    (r.site as string).charAt(0).toUpperCase() + (r.site as string).slice(1)
  expect(initial.sentence).toContain(
    `the ranges of ${name(top)} and ${name(second)}`,
  )
  expect(initial.sentence).toContain("not clearly separated")
  // the page still says which site has the highest estimate
  expect(initial.sentence).toContain(`point estimate, in ${name(top)}`)
  // separated ranges: no overlap sentence
  const sep = {
    ...real,
    indonesia: {
      ...(real.indonesia as NonNullable<FindingsInput["indonesia"]>),
      summary: (real.indonesia?.summary ?? []).map((x) =>
        x.subject === "card_high" &&
        x.bin === "weighted" &&
        x.state === "initial" &&
        x.site === top.site
          ? {
              ...x,
              dq_w_m2: 40,
              dq_lo: 39.9,
              dq_hi: 40.1,
            }
          : x,
      ),
    },
  }
  const s = findings(sep).find((x) => x.id === "indonesia-initial") as Finding
  expect(s.sentence).not.toContain("not clearly separated")
})
