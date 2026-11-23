import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { coerceCell, parseCsv } from "../../core/csv"
import { ConfigError, DataError } from "../../core/errors"
import { OBJECTIVE_COLUMNS } from "../../core/pipeline/tables"
import { roleText } from "../../core/report/outline"
import { callout } from "../../web/design/molecules/callout"
import { disclosure } from "../../web/design/molecules/disclosure"
import { figureFrame } from "../../web/design/molecules/figureFrame"
import { budgetPanel } from "../../web/design/organisms/budgetPanel"
import { dataTable } from "../../web/design/organisms/dataTable"
import { findingList } from "../../web/design/organisms/findingList"
import { axisLabel } from "../../web/figures"
import { fmtValue } from "../../web/fmt"
import {
  budgetRange,
  costUnitText,
  type FrontRow,
  type OptData,
  PROFILE_LABEL,
  profileSpread,
  singleFrontier,
  varLabel,
} from "../../web/optimisation"
import { type BudgetPage, budgetLookup, coolingAxis } from "../../web/recipe"
import { BUDGET_FILE, readVerifiedTable } from "../budget"
import { emit } from "../logging"
import { derive } from "./content"
import { esc, type ReportInput, type ReportSection } from "./html"
import { extraEntries, readListed } from "./manifest"

type Rec = Record<string, string>
const FILES = [
  "refine_front.csv",
  "refine_recipes.csv",
  "refine_tolerance.csv",
  "refine_robust.csv",
  BUDGET_FILE,
] as const
/** Where `refine` and `budget-table` put their files: the run directory itself or its refine/ subdirectory. */
const LOCATIONS = ["", "refine"] as const

function locate(dir: string, name: string): string | null {
  for (const sub of LOCATIONS) {
    const p = join(dir, sub, name)
    if (existsSync(p)) return p
  }
  return null
}

const num = (rec: Rec, k: string, file: string): number => {
  const v = rec[k]
  if (v === undefined) throw new ConfigError(k, `${file}: missing column ${k}`)
  return v === "" ? Number.NaN : coerceCell(k, v)
}

const CSV_FILES = FILES.filter((f) => f.endsWith(".csv"))

/**
 * S1: a refine CSV is read only when `refine` registered it in the manifest's extra[] with the same hash. A present file that is
 * not listed or was changed is refused (exit 5), and so is a listed file that has gone missing (a partial set).
 */
function table(input: ReportInput, name: string): Rec[] | null {
  const p = locate(input.dir, name)
  const listed = extraEntries(input.manifest).some(
    (e) => e.path === name || e.path === `refine/${name}`,
  )
  if (p === null) {
    if (listed) {
      emit("report.refused", "error", { code: "optimisation_input", key: name })
      throw new DataError(
        name,
        `${name} is listed in run_manifest.json but missing`,
      )
    }
    return null
  }
  return parseCsv(
    readListed(
      input.manifest,
      input.dir,
      p,
      "optimisation_input",
      "run `refine` again",
    ),
  )
}

export type Optimisation = {
  data: OptData | null
  front: Rec[] | null
  recipes: Rec[] | null
  tolerance: Rec[] | null
  robust: Rec[] | null
}

const cache = new WeakMap<ReportInput, Optimisation | null>()

/** Everything the section shows, or null when no refine output is present (an absent file is never an error; a present one is validated). */
export function loadOptimisation(input: ReportInput): Optimisation | null {
  if (cache.has(input)) return cache.get(input) ?? null
  const [front, recipes, tolerance, robust] = CSV_FILES.map((f) =>
    table(input, f),
  ) as [Rec[] | null, Rec[] | null, Rec[] | null, Rec[] | null]
  const tablePath = locate(input.dir, BUDGET_FILE)
  let data: OptData | null = null
  if (tablePath !== null) {
    const f = readVerifiedTable(tablePath)
    data = {
      cost_unit: f.cost_unit,
      objectives: f.objectives,
      vars: f.vars,
      tables: f.tables,
      front: [],
    }
  }
  if (front !== null) {
    const names = data?.objectives ?? [...OBJECTIVE_COLUMNS]
    const rows: FrontRow[] = front.map((r) => ({
      weight_id: r.weight_id ?? "",
      S: num(r, "S", "refine_front.csv"),
      objectives: names.map((n) => num(r, n, "refine_front.csv")),
      status: r.status ?? "",
    }))
    data ??= {
      cost_unit: "relative",
      objectives: [...OBJECTIVE_COLUMNS],
      vars: [],
      tables: [],
      front: [],
    }
    data.front = rows
  }
  const any = front ?? recipes ?? tolerance ?? robust ?? data
  const out: Optimisation | null =
    any === null ? null : { data, front, recipes, tolerance, robust }
  cache.set(input, out)
  if (out)
    emit("report.optimisation_found", "debug", {
      files: FILES.filter((n) => locate(input.dir, n) !== null).join(","),
    })
  return out
}

const FRESH_LABEL: Record<string, { quantity: string; basis: string }> = {
  s_p90_train_nominal: {
    quantity: "Scalar objective S",
    basis: "nominal recipe, p90 over the training draws",
  },
  s_p90_train_robust: {
    quantity: "Scalar objective S",
    basis: "robust recipe, p90 over the training draws",
  },
  s_p95_fresh_nominal: {
    quantity: "Scalar objective S",
    basis: "nominal recipe, p95 over fresh draws",
  },
  s_p95_fresh_robust: {
    quantity: "Scalar objective S",
    basis: "robust recipe, p95 over fresh draws",
  },
  regret_p95_nominal: {
    quantity: "Regret against the better of the two recipes",
    basis: "nominal recipe, p95 over fresh draws",
  },
  regret_p95_robust: {
    quantity: "Regret against the better of the two recipes",
    basis: "robust recipe, p95 over fresh draws",
  },
}

const cell = (v: string | undefined, digits = 4): string => {
  if (v === undefined || v === "") return "–"
  const n = Number(v)
  return Number.isNaN(n) ? esc(v) : fmtValue(n, digits)
}

const th = (labels: readonly string[]): string =>
  `<thead><tr>${labels.map((l) => `<th scope="col">${esc(l)}</th>`).join("")}</tr></thead>`

function recipesTable(rows: Rec[]): string {
  const cols = [...OBJECTIVE_COLUMNS]
  return `<p class="page-hint">Recipes the models rank highest for three priorities, found by derivative-based search from the screened candidates. Model optima, not measured optima (PROXY).</p>
<div class="scroll"><table>${th(["Role", "Refined from", "Scalar S (lower is better)", ...cols.map(axisLabel), "Solver status"])}<tbody>
${rows.map((r) => `<tr><td class="txt">${esc(roleText(r.role ?? ""))}</td><td class="txt">${esc(r.screened_id ?? "")}</td><td>${cell(r.S)}</td>${cols.map((c) => `<td>${cell(r[c])}</td>`).join("")}<td class="txt">${esc(r.status ?? "")}</td></tr>`).join("\n")}
</tbody></table></div>`
}

function toleranceTable(rows: Rec[]): string {
  return `<p class="page-hint">How far each ingredient may move below (lower) or above (upper) the recipe before the scalar objective worsens by the tolerance (relative loss at the edge shown). "Limited by the box" means the allowed range ended first.</p>
<div class="scroll"><table>${th(["Role", "Ingredient", "Recipe value", "Lower tolerance", "Upper tolerance", "Relative loss at the edge", "Limited by the box"])}<tbody>
${rows.map((r) => `<tr><td class="txt">${esc(roleText(r.role ?? ""))}</td><td class="txt">${esc(varLabel(r.variable ?? ""))}</td><td>${cell(r.x_star)}</td><td>${cell(r.tol_lo)}</td><td>${cell(r.tol_hi)}</td><td>${cell(r.loss_edge, 5)}</td><td class="txt">${r.clipped === "true" ? "yes" : "no"}</td></tr>`).join("\n")}
</tbody></table></div>`
}

function freshTable(fresh: Rec[]): string {
  return dataTable({
    id: "tbl-robust-checks",
    caption: "How the nominal and the robust recipe compare over the draws",
    columns: [
      { key: "quantity", label: "Quantity", kind: "text", rowHeader: true },
      { key: "value", label: "Value", kind: "number", digits: 5 },
      { key: "basis", label: "Basis", kind: "text" },
    ],
    rows: fresh.map((r) => {
      const name = r.name ?? ""
      const l = FRESH_LABEL[name] ?? {
        quantity: name.replaceAll("_", " "),
        basis: "",
      }
      const v = Number(r.value)
      return {
        quantity: l.quantity,
        value:
          r.value === undefined || r.value === "" || Number.isNaN(v) ? null : v,
        basis: l.basis,
      }
    }),
  })
}

function robustTable(rows: Rec[]): string {
  const dist = rows.filter((r) => r.kind === "distribution")
  const byName = (kind: string, name: string) =>
    rows.find((r) => r.kind === kind && r.name === name)
  const fresh = rows.filter((r) => r.kind === "fresh")
  return `<p class="page-hint">The recipe that holds up across the uncertainty draws, next to the nominal one, and how the optimal level of each ingredient is spread over the draws (p5, median, p95).</p>
<div class="scroll"><table>${th(["Ingredient", "Nominal optimum", "Robust optimum", "p5 over draws", "Median", "p95 over draws"])}<tbody>
${dist.map((r) => `<tr><td class="txt">${esc(varLabel(r.name ?? ""))}</td><td>${cell(byName("nominal", r.name ?? "")?.value)}</td><td>${cell(byName("robust", r.name ?? "")?.value)}</td><td>${cell(r.p05)}</td><td>${cell(r.p50)}</td><td>${cell(r.p95)}</td></tr>`).join("\n")}
</tbody></table></div>
${fresh.length ? freshTable(fresh) : ""}`
}

/** Budget panel and its lookup page data: the exact table lookup, the bare-aluminium peak (nominal) and the shared cooling scale. */
function budgetPage(input: ReportInput, d: OptData): BudgetPage {
  const c0 = derive(input).c0Mean
  const one = singleFrontier(d)
  return {
    opt: one,
    c0_mean_c: c0,
    axis: coolingAxis(one.tables, one.objectives, c0),
  }
}

function budgetPanelHtml(input: ReportInput, d: OptData): string {
  const page = budgetPage(input, d)
  const tables = page.opt.tables
  const [lo, hi] = budgetRange(tables)
  const profile = (tables[0] as OptData["tables"][number]).profile
  const start = tables[0]
  // rounded up to six places so the number box is readable and the lookup still lands on the knee entry
  const value = Math.min(
    hi,
    Math.max(lo, Math.ceil((start?.knee_budget ?? lo) * 1e6) / 1e6),
  )
  return budgetPanel({
    id: "budget-panel",
    profiles: tables.map((t) => ({
      id: t.profile,
      label: PROFILE_LABEL[t.profile] ?? t.profile,
    })),
    profile,
    budget: { min: lo, max: hi, step: (hi - lo) / 1000, value },
    lookup: budgetLookup(page),
    unit: costUnitText(d.cost_unit),
    digits: 2,
  })
}

export const optimisationSection: ReportSection = {
  id: "budget",
  title: "Budget",
  order: 50,
  render: (input) => {
    const o = loadOptimisation(input)
    if (o === null) return null
    const d = derive(input)
    const detail = (summary: string, inner: string) =>
      disclosure({ summary, level: "detail" })(inner)
    const parts: string[] = []
    parts.push(
      callout({
        tone: "caution",
        title: "An optimum of the models, not a measured optimum (PROXY)",
        body: `Costs are ${costUnitText(o.data?.cost_unit ?? "relative")}, a relative index and not a price. The recipe shown for a budget is the tabulated one with the largest cost at or below it (exact lookup, no interpolation). Intervals are parameter uncertainty only.`,
      }),
    )
    const sentence = d.findings.find((f) => f.id === "budget")
    if (sentence)
      parts.push(
        findingList({
          items: [{ id: sentence.id, sentence: sentence.sentence }],
          seen: d.seen,
        }),
      )
    if (o.data && o.data.tables.length > 0) {
      parts.push(budgetPanelHtml(input, o.data))
      if (singleFrontier(o.data).tables.length < o.data.tables.length)
        parts.push(
          `<p class="page-hint">One table, not three: the cooling-first, balanced and durability-first weightings select the same recipes at every budget to within the p5 to p95 uncertainty (the largest difference in any objective is ${Math.round(profileSpread(o.data) * 100)} % of that band's half-width), so a priority choice would change only where the weighted score stops improving.</p>`,
        )
    }
    if (o.data && o.data.tables.length > 0)
      parts.push(
        detail(
          "Performance against cost",
          `<div class="page-controls"><label for="opt-objective">Objective</label><select id="opt-objective">${o.data.objectives.map((ob, i) => `<option value="${i}"${ob === "t_max_pred" ? " selected" : ""}>${esc(axisLabel(ob))}</option>`).join("")}</select></div>
${figureFrame({ message: "What the modelled recipe reaches as the budget grows, with its knee marked", size: "tall", describe: "Performance against cost with a p5 to p95 band", note: "Bands: p5 to p95, parameter uncertainty only. Cost in relative cost units, not IDR." })('<div id="fig-frontier" class="fig fig--wide fig--tall"></div>')}`,
        ),
      )
    if (o.recipes)
      parts.push(
        detail("Three refined recipes (model optima)", recipesTable(o.recipes)),
      )
    if (o.data && o.data.front.length > 0)
      parts.push(
        detail(
          "Refined Pareto front",
          figureFrame({
            message: "Reflectance rises with cost along the refined front",
            size: "medium",
            describe: "Refined Pareto front: cost against solar reflectance",
            note: "Model optima, nominal only (PROXY).",
          })('<div id="fig-refine-front" class="fig"></div>'),
        ),
      )
    if (o.tolerance)
      parts.push(detail("Dosing tolerance", toleranceTable(o.tolerance)))
    if (o.robust) parts.push(detail("Robust optimum", robustTable(o.robust)))
    return `<section id="budget" class="page-section" aria-labelledby="h-budget">\n<h2 id="h-budget">Budget</h2>\n${parts.join("\n")}\n</section>`
  },
  data: (input) => {
    const d = loadOptimisation(input)?.data
    return d ? budgetPage(input, d) : null
  },
}
