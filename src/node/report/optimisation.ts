import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { coerceCell, parseCsv } from "../../core/csv"
import { ConfigError } from "../../core/errors"
import { OBJECTIVE_COLUMNS } from "../../core/pipeline/tables"
import { axisLabel } from "../../web/figures"
import { fmtValue } from "../../web/fmt"
import {
  costUnitText,
  type FrontRow,
  type OptData,
  PROFILE_LABEL,
  varLabel,
} from "../../web/optimisation"
import { BUDGET_FILE, readVerifiedTable } from "../budget"
import { emit } from "../logging"
import { esc, type ReportInput, type ReportSection } from "./html"

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

function table(dir: string, name: string): Rec[] | null {
  const p = locate(dir, name)
  return p === null ? null : parseCsv(readFileSync(p, "utf8"))
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
  const front = table(input.dir, "refine_front.csv")
  const recipes = table(input.dir, "refine_recipes.csv")
  const tolerance = table(input.dir, "refine_tolerance.csv")
  const robust = table(input.dir, "refine_robust.csv")
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

const cell = (v: string | undefined, digits = 4): string => {
  if (v === undefined || v === "") return "–"
  const n = Number(v)
  return Number.isNaN(n) ? esc(v) : fmtValue(n, digits)
}

const th = (labels: readonly string[]): string =>
  `<thead><tr>${labels.map((l) => `<th scope="col">${esc(l)}</th>`).join("")}</tr></thead>`

function recipesTable(rows: Rec[]): string {
  const cols = [...OBJECTIVE_COLUMNS]
  return `<h3>Three refined recipes</h3>
<p class="hint">Best recipes of the models for three priorities, found by derivative-based search from the screened candidates. Model optima, not measured optima (PROXY).</p>
<div class="scroll"><table>${th(["Role", "Refined from", "Scalar S (lower is better)", ...cols.map(axisLabel), "Solver status"])}<tbody>
${rows.map((r) => `<tr><td class="txt">${esc(r.role ?? "")}</td><td class="txt">${esc(r.screened_id ?? "")}</td><td>${cell(r.S)}</td>${cols.map((c) => `<td>${cell(r[c])}</td>`).join("")}<td class="txt">${esc(r.status ?? "")}</td></tr>`).join("\n")}
</tbody></table></div>`
}

function toleranceTable(rows: Rec[]): string {
  return `<h3>Dosing tolerance</h3>
<p class="hint">How far each ingredient may move below (lower) or above (upper) the recipe before the scalar objective worsens by the tolerance (relative loss at the edge shown). "Limited by the box" means the allowed range ended first.</p>
<div class="scroll"><table>${th(["Role", "Ingredient", "Recipe value", "Lower tolerance", "Upper tolerance", "Relative loss at the edge", "Limited by the box"])}<tbody>
${rows.map((r) => `<tr><td class="txt">${esc(r.role ?? "")}</td><td class="txt">${esc(varLabel(r.variable ?? ""))}</td><td>${cell(r.x_star)}</td><td>${cell(r.tol_lo)}</td><td>${cell(r.tol_hi)}</td><td>${cell(r.loss_edge, 5)}</td><td class="txt">${r.clipped === "true" ? "yes" : "no"}</td></tr>`).join("\n")}
</tbody></table></div>`
}

function robustTable(rows: Rec[]): string {
  const dist = rows.filter((r) => r.kind === "distribution")
  const byName = (kind: string, name: string) =>
    rows.find((r) => r.kind === kind && r.name === name)
  const fresh = rows.filter((r) => r.kind === "fresh")
  return `<h3>Robust optimum</h3>
<p class="hint">The recipe that stays best across the uncertainty draws, next to the nominal one, and how the optimal level of each ingredient is spread over the draws (p5, median, p95).</p>
<div class="scroll"><table>${th(["Ingredient", "Nominal optimum", "Robust optimum", "p5 over draws", "Median", "p95 over draws"])}<tbody>
${dist.map((r) => `<tr><td class="txt">${esc(varLabel(r.name ?? ""))}</td><td>${cell(byName("nominal", r.name ?? "")?.value)}</td><td>${cell(byName("robust", r.name ?? "")?.value)}</td><td>${cell(r.p05)}</td><td>${cell(r.p50)}</td><td>${cell(r.p95)}</td></tr>`).join("\n")}
</tbody></table></div>
${fresh.length ? `<ul>${fresh.map((r) => `<li>${esc((r.name ?? "").replaceAll("_", " "))}: ${cell(r.value, 5)}</li>`).join("")}</ul>` : ""}`
}

function budgetControls(d: OptData): string {
  const unit = costUnitText(d.cost_unit)
  return `<h3>Recipe for a cost budget</h3>
<p>Pick a profile and a budget in ${esc(unit)}. The recipe shown is the tabulated one with the largest cost at or below the budget (exact lookup, no interpolation); cost is the relative cost index of the model (PROXY), not a price.</p>
<div class="controls">
<label for="opt-profile">Priority profile</label>
<select id="opt-profile">${d.tables.map((t) => `<option value="${esc(t.profile)}">${esc(PROFILE_LABEL[t.profile] ?? t.profile)}</option>`).join("")}</select>
<label for="opt-budget">Budget (${esc(unit)})</label>
<input id="opt-budget" type="number" step="any" inputmode="decimal">
<input id="opt-budget-range" type="range" aria-label="Budget slider (${esc(unit)})">
<label for="opt-objective">Chart objective</label>
<select id="opt-objective">${d.objectives.map((o, i) => `<option value="${i}">${esc(axisLabel(o))}</option>`).join("")}</select>
</div>
<div id="opt-result" aria-live="polite"></div>
<div id="fig-frontier" class="fig tall" role="img" aria-label="Performance against cost for each priority profile with p5 to p95 bands"></div>`
}

export const optimisationSection: ReportSection = {
  id: "optimisation",
  title: "Optimisation",
  order: 70,
  render: (input) => {
    const o = loadOptimisation(input)
    if (o === null) return null
    const parts: string[] = []
    parts.push(
      `<p><strong>Optimum of the models, not a measured optimum (PROXY).</strong> Costs are ${esc(costUnitText(o.data?.cost_unit ?? "relative"))}. Intervals are parameter uncertainty only.</p>`,
    )
    if (o.recipes) parts.push(recipesTable(o.recipes))
    if (o.data && o.data.front.length > 0)
      parts.push(
        `<h3>Refined Pareto front</h3>\n<div id="fig-refine-front" class="fig" role="img" aria-label="Refined Pareto front: cost against solar reflectance"></div>`,
      )
    if (o.tolerance) parts.push(toleranceTable(o.tolerance))
    if (o.robust) parts.push(robustTable(o.robust))
    if (o.data && o.data.tables.length > 0) parts.push(budgetControls(o.data))
    return `<section id="optimisation" aria-labelledby="h-optimisation">\n<h2 id="h-optimisation">Optimisation</h2>\n${parts.join("\n")}\n</section>`
  },
  data: (input) => {
    const d = loadOptimisation(input)?.data
    return d ?? null
  },
}
