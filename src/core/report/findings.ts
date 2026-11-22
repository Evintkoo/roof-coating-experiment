// Plan 06 Task 5: the headline sentences of the report, computed from the result files by a pure function.
// Every number in a sentence is registered in `numbers` (key, value, digits) and printed from that value, so a test can
// recompute each one from the raw files. Wording ranks, it does not measure: no superlatives without an interval, and
// "nominal only" where no interval exists.
import { DataError } from "../errors"
import { KNEE_SHARE } from "../opt/budgetTable"
import type { ResultRow } from "../schema"

export type Shortlist = Readonly<Record<string, string>>
export type ControlRow = {
  control_id: string
  scenario_id: string
  t_max_pred: number
}
/** One row of refine_recipes.csv (only the fields the sentences use). */
export type RefineRecipe = {
  role: string
  screened_id: string
  r_solar_pred: number
  t_max_pred: number
  cost_proxy: number
  status: string
}
export type RefineRecipes = readonly RefineRecipe[]
/** budget_table.json, reduced to what the sentences use. */
export type BudgetTables = {
  cost_unit: string
  tables: readonly {
    profile: string
    c_min: number
    c_max: number
    knee_budget: number
  }[]
}
export type IndonesiaSummaryRow = {
  site: string
  bin: string
  subject: string
  state: string
  dq_w_m2: number
  dq_lo: number
  dq_hi: number
}
export type IndonesiaSummary = {
  loss_lo: number
  loss_hi: number
  summary: readonly IndonesiaSummaryRow[]
}

export type FindingsInput = {
  shortlist: Shortlist
  results: readonly ResultRow[]
  controls: readonly ControlRow[]
  refine?: RefineRecipes
  budget?: BudgetTables
  indonesia?: IndonesiaSummary
}
export type FindingNumber = { key: string; value: number; digits: number }
export type Finding = {
  id: string
  /** Plain-language role name for the recipe lines ("Best cooling", "Balanced", "Lowest cost"); absent elsewhere. */
  label?: string
  sentence: string
  sources: string[]
  numbers: FindingNumber[]
}

export const ROLES = ["high_performing", "balanced", "low_cost"] as const
type Role = (typeof ROLES)[number]
export const ROLE_NAMES: Record<Role, string> = {
  high_performing: "Best cooling",
  balanced: "Balanced",
  low_cost: "Lowest cost",
}
const SUBJECT: Record<Role, string> = {
  high_performing: "card_high",
  balanced: "card_balanced",
  low_cost: "card_low",
}
const PROFILE_WORDS: Record<string, string> = {
  cooling_first: "cooling-first",
  balanced: "balanced",
  durability_first: "durability-first",
}

export const mean = (xs: readonly number[]): number =>
  xs.reduce((a, b) => a + b, 0) / xs.length

function fmt(value: number, digits: number): string {
  const s = value.toFixed(digits)
  return Number(s) === 0 ? s.replace("-", "") : s
}

/** Collects the numbers of one sentence and prints each from its registered value. */
class Nums {
  readonly list: FindingNumber[] = []
  n(key: string, value: number, digits: number): string {
    if (!Number.isFinite(value))
      throw new DataError(key, `findings: ${key} is not a finite number`)
    this.list.push({ key, value, digits })
    return fmt(value, digits)
  }
}

export type Cooling = {
  value: number
  lo: number
  hi: number
  cost: number
  rank: number
  n: number
}

export function coolingOf(
  id: string,
  results: readonly ResultRow[],
  c0Mean: number,
): Cooling {
  const rows = results.filter((r) => r.candidate_id === id)
  if (rows.length === 0)
    throw new DataError(
      "shortlist",
      `shortlisted recipe ${id} is not in results`,
    )
  const cost = (rows[0] as ResultRow).cost_proxy
  const byId = new Map<string, number>()
  for (const r of results)
    if (!byId.has(r.candidate_id)) byId.set(r.candidate_id, r.cost_proxy)
  let cheaper = 0
  for (const c of byId.values()) if (c < cost) cheaper++
  return {
    value: c0Mean - mean(rows.map((r) => r.t_max_pred)),
    lo: c0Mean - mean(rows.map((r) => r.t_max_hi)),
    hi: c0Mean - mean(rows.map((r) => r.t_max_lo)),
    cost,
    rank: cheaper + 1,
    n: byId.size,
  }
}

/** Roles from the plan-05 refine recipes when all three are present, else from the plan-03 shortlist (F6). */
export function recipeIds(i: FindingsInput): {
  ids: Record<Role, string>
  refined: Partial<Record<Role, RefineRecipe>>
} {
  const refined: Partial<Record<Role, RefineRecipe>> = {}
  for (const r of i.refine ?? [])
    if ((ROLES as readonly string[]).includes(r.role))
      refined[r.role as Role] = r
  if (ROLES.every((r) => refined[r] !== undefined)) {
    const ids = {} as Record<Role, string>
    for (const r of ROLES) ids[r] = (refined[r] as RefineRecipe).screened_id
    return { ids, refined }
  }
  const ids = {} as Record<Role, string>
  for (const r of ROLES) {
    const id = i.shortlist[r]
    if (id === undefined || id === "")
      throw new DataError(
        "shortlist",
        `the shortlist has no recipe for role ${r}`,
      )
    ids[r] = id
  }
  return { ids, refined: {} }
}

const RESULT_SRC =
  "results.csv: candidate_id, t_max_pred, t_max_lo, t_max_hi, cost_proxy"
const CONTROL_SRC = "controls.csv: control_id (C0), t_max_pred"

export function findings(input: FindingsInput): Finding[] {
  const { ids, refined } = recipeIds(input)
  const c0 = input.controls
    .filter((c) => c.control_id === "C0")
    .map((c) => c.t_max_pred)
  if (c0.length === 0)
    throw new DataError(
      "controls.csv",
      "the bare aluminium control C0 is missing",
    )
  const c0Mean = mean(c0)
  const cool = {} as Record<Role, Cooling>
  for (const r of ROLES) cool[r] = coolingOf(ids[r], input.results, c0Mean)
  const out: Finding[] = []

  // ---- verdict ----
  {
    const k = new Nums()
    const vals = ROLES.map((r) => cool[r].value)
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const ivLo = Math.min(...ROLES.map((r) => cool[r].lo))
    const ivHi = Math.max(...ROLES.map((r) => cool[r].hi))
    const a = k.n("verdict.cooling_min", lo, 0)
    const b = k.n("verdict.cooling_max", hi, 0)
    const span = a === b ? `about ${a} K` : `about ${a} to ${b} K`
    const spread = k.n("verdict.spread", hi - lo, 1)
    const iv = `${k.n("verdict.interval_lo", ivLo, 1)} to ${k.n("verdict.interval_hi", ivHi, 1)} K`
    const sep =
      hi - lo < 1
        ? `the three differ by only ${spread} K, so cooling hardly separates them and cost and the PROXY indices decide between them`
        : `the three differ by ${spread} K in cooling`
    out.push({
      id: "verdict",
      sentence: `In the models, three recipes (${ROLES.map((r) => ids[r]).join(", ")}) lower the peak surface temperature of an aluminium roof by ${span} compared with bare aluminium (${iv} when parameter uncertainty only is counted); ${sep}. These are predictions for the freshly applied coating from uncalibrated models, not measurements.`,
      sources: [RESULT_SRC, CONTROL_SRC],
      numbers: k.list,
    })
  }

  // ---- per-role recipe lines ----
  const phrase: Record<Role, string> = {
    high_performing: "is the cooling-priority recipe",
    balanced: "balances cooling, durability and cost",
    low_cost: "is the cost-priority recipe",
  }
  for (const r of ROLES) {
    const k = new Nums()
    const c = cool[r]
    let s = `Recipe ${ids[r]} ${phrase[r]} in the models: it lowers the peak surface temperature by ${k.n(`cooling.${r}.value`, c.value, 1)} K [${k.n(`cooling.${r}.lo`, c.lo, 1)}, ${k.n(`cooling.${r}.hi`, c.hi, 1)}] against bare aluminium (scenario mean; parameter uncertainty only, the bare aluminium reference is nominal only), at a relative cost index of ${k.n(`cost.${r}`, c.cost, 2)} (PROXY, relative cost units, rank ${k.n(`cost_rank.${r}`, c.rank, 0)} of ${k.n(`cost_n.${r}`, c.n, 0)}, 1 = cheapest).`
    const sources = [RESULT_SRC, CONTROL_SRC]
    const f = refined[r]
    if (f !== undefined) {
      s += ` Its refined variant from the optimiser is predicted at ${k.n(`refined.${r}.t_max`, f.t_max_pred, 1)} °C peak with cost index ${k.n(`refined.${r}.cost`, f.cost_proxy, 2)} (an optimum of the models, nominal only).`
      sources.push(
        "refine_recipes.csv: role, screened_id, t_max_pred, cost_proxy",
      )
    }
    out.push({
      id: `recipe-${r}`,
      label: ROLE_NAMES[r],
      sentence: s,
      sources,
      numbers: k.list,
    })
  }

  // ---- Indonesia ----
  const ind = input.indonesia
  if (ind !== undefined) {
    const subject = SUBJECT.high_performing
    const rows = (state: string) =>
      ind.summary.filter(
        (x) =>
          x.subject === subject && x.state === state && x.bin === "weighted",
      )
    const initial = rows("initial")
    const aged = rows("aged")
    if (initial.length > 0 && aged.length > 0) {
      const ranked = [...initial].sort((p, q) => q.dq_w_m2 - p.dq_w_m2)
      const top = ranked[0] as IndonesiaSummaryRow
      const bottom = ranked[ranked.length - 1] as IndonesiaSummaryRow
      const agedOf = (site: string): IndonesiaSummaryRow => {
        const x = aged.find((a) => a.site === site)
        if (x === undefined)
          throw new DataError(
            "indonesia_summary.csv",
            `no aged row for ${site}`,
          )
        return x
      }
      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
      const src = [
        "indonesia_summary.csv: site, bin (weighted), subject (card_high), state, dq_w_m2, dq_lo, dq_hi",
      ]
      {
        const k = new Nums()
        const show = (state: string, x: IndonesiaSummaryRow) =>
          `${k.n(`indonesia.${state}.${x.site}.dq`, x.dq_w_m2, 1)} W/m² [${k.n(`indonesia.${state}.${x.site}.lo`, x.dq_lo, 1)}, ${k.n(`indonesia.${state}.${x.site}.hi`, x.dq_hi, 1)}]`
        out.push({
          id: "indonesia-initial",
          sentence: `Across the five Indonesian sites the modelled heat flux into the building falls by the most in ${cap(top.site)} (${show("initial", top)}) and by the least in ${cap(bottom.site)} (${show("initial", bottom)}) for the cooling-priority recipe against bare aluminium, in the initial state, weighted over typical, hot and overcast days (parameter uncertainty only; weather is a model and not a station record).`,
          sources: src,
          numbers: k.list,
        })
      }
      {
        const k = new Nums()
        const show = (x: IndonesiaSummaryRow) =>
          `${k.n(`indonesia.aged.${x.site}.dq`, x.dq_w_m2, 1)} W/m² [${k.n(`indonesia.aged.${x.site}.lo`, x.dq_lo, 1)}, ${k.n(`indonesia.aged.${x.site}.hi`, x.dq_hi, 1)}]`
        out.push({
          id: "indonesia-aged",
          sentence: `Scenario ageing, not a measurement: if the coating loses ${k.n("indonesia.loss_lo", ind.loss_lo, 2)} to ${k.n("indonesia.loss_hi", ind.loss_hi, 2)} of its solar reflectance (a range taken from US three-year pairs, never measured on an Indonesian roof), the same benefit shrinks to ${show(agedOf(top.site))} in ${cap(top.site)} and ${show(agedOf(bottom.site))} in ${cap(bottom.site)} (parameter uncertainty only).`,
          sources: [
            ...src,
            "indonesia_days.json: loss_lo, loss_hi (scenario range)",
          ],
          numbers: k.list,
        })
      }
    }
  }

  // ---- budget ----
  const tables = input.budget?.tables ?? []
  if (tables.length > 0) {
    const k = new Nums()
    const order = ["balanced", "cooling_first", "durability_first"]
    const sorted = [...tables].sort(
      (a, b) =>
        (order.indexOf(a.profile) + 1 || 99) -
        (order.indexOf(b.profile) + 1 || 99),
    )
    const first = sorted[0] as (typeof sorted)[number]
    const word = (p: string) => PROFILE_WORDS[p] ?? p.replaceAll("_", " ")
    const rest = sorted
      .slice(1)
      .map(
        (t) =>
          `${word(t.profile)} ${k.n(`budget.${t.profile}.knee`, t.knee_budget, 2)}`,
      )
    const lead = `For the ${word(first.profile)} priority the modelled recipe stops improving much at a budget of about ${k.n(`budget.${first.profile}.knee`, first.knee_budget, 2)} (the knee, where ${k.n("budget.knee_share_pct", KNEE_SHARE * 100, 0)} % of the gain between the cheapest recipe at ${k.n(`budget.${first.profile}.c_min`, first.c_min, 2)} and the dearest at ${k.n(`budget.${first.profile}.c_max`, first.c_max, 2)} is reached)`
    out.push({
      id: "budget",
      sentence: `${lead}${rest.length > 0 ? `; the other knees are ${rest.join(" and ")}` : ""}. Budgets are in relative cost units (a PROXY index, not rupiah) and the knee is nominal only; the budget curve draws the parameter uncertainty band.`,
      sources: [
        "budget_table.json: tables[].profile, c_min, c_max, knee_budget, cost_unit",
      ],
      numbers: k.list,
    })
  }

  // ---- what is not modelled ----
  out.push({
    id: "not-modelled",
    sentence:
      "Not modelled: weathering and ageing beyond the labelled scenario, adhesion, soiling and biological growth, wind-driven rain and chloride deposition. The bare aluminium reference uses a nominal scenario value, because the sheet itself was never measured. Every PROXY index is an uncalibrated relative ranking, not a measurement or a probability.",
    sources: [
      "docs/BLOCKED.md: BLOCKED-8, BLOCKED-9, BLOCKED-10",
      "results.csv: *_proxy columns",
    ],
    numbers: [],
  })
  return out
}
