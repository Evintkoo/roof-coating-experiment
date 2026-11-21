// Pure helpers of the Optimisation section (plan 05 in the report): budget lookup view, performance-price figures. No I/O, no DOM.
import {
  type BudgetEntry,
  type BudgetTable,
  lookupBudget,
} from "../core/opt/budgetTable"
import { axisLabel, type FigureSpec, OKABE_ITO, UIREVISION } from "./figures"
import { fmtValue } from "./fmt"

export type FrontRow = {
  weight_id: string
  S: number
  objectives: number[]
  status: string
}

/** What the page script receives under window.__SPANDEK__.ext.optimisation. */
export type OptData = {
  cost_unit: "relative" | "idr_per_m2"
  objectives: string[]
  vars: string[]
  tables: BudgetTable[]
  front: FrontRow[]
}

export const PROFILE_LABEL: Record<string, string> = {
  cooling_first: "Cooling first",
  balanced: "Balanced",
  durability_first: "Durability first",
}

const VAR_LABEL: Record<string, string> = {
  p1: "Primer GPTES mole fraction",
  p2: "Primer DFT (µm)",
  m1: "Midcoat PVC",
  m2: "Midcoat TiO2 share of pigment",
  m3: "Midcoat DFT (µm)",
  t1: "Topcoat MTES mole fraction",
  t2: "Topcoat DFT (µm)",
  d_tio2_um: "TiO2 diameter (µm)",
  d_baso4_um: "BaSO4 diameter (µm)",
}
export const varLabel = (id: string): string => VAR_LABEL[id] ?? id

/** The cost axis is relative cost_proxy units unless a table says otherwise; it is never presented as IDR for relative units. */
export function costLabel(unit: OptData["cost_unit"]): string {
  return unit === "relative"
    ? "Cost budget (relative cost units, not IDR; PROXY)"
    : "Cost budget (IDR per m², PROXY)"
}
export const costUnitText = (unit: OptData["cost_unit"]): string =>
  unit === "relative" ? "relative cost units (not IDR)" : "IDR per m²"

/** Smallest and largest tabulated budget over all profiles (the slider range). */
export function budgetRange(tables: readonly BudgetTable[]): [number, number] {
  const lo = Math.min(...tables.map((t) => t.c_min))
  const hi = Math.max(...tables.map((t) => t.c_max))
  return [lo, hi]
}

export type BudgetRow = { label: string; value: number; lo: number; hi: number }
export type BudgetView =
  | {
      status: "ok"
      profile: string
      budget: number
      cost: number
      headroom: number
      knee: number
      repaired: boolean
      objectives: BudgetRow[]
      recipe: { id: string; label: string; value: number }[]
    }
  | { status: "infeasible"; profile: string; budget: number; c_min: number }

/**
 * The exact table lookup of plan 05 FR-10 (the entry of the largest tabulated budget at or below B, never interpolated),
 * as rows ready to display. Below the profile's minimum feasible cost the answer is "infeasible" with that minimum.
 */
export function budgetView(
  data: Pick<OptData, "tables" | "objectives" | "vars">,
  profile: string,
  budget: number,
): BudgetView {
  const t = data.tables.find((x) => x.profile === profile)
  if (!t) throw new RangeError(`no table for profile ${profile}`)
  const r = lookupBudget(t, budget)
  if (r.status === "infeasible")
    return { status: "infeasible", profile, budget, c_min: r.c_min }
  const e: BudgetEntry = r.entry
  return {
    status: "ok",
    profile,
    budget,
    cost: e.cost,
    headroom: r.headroom,
    knee: t.knee_budget,
    repaired: e.repaired,
    objectives: data.objectives.map((name, i) => ({
      label: axisLabel(name),
      value: e.objectives[i] as number,
      lo: e.lo[i] as number,
      hi: e.hi[i] as number,
    })),
    recipe: data.vars.map((id, i) => ({
      id,
      label: varLabel(id),
      value: e.x[i] as number,
    })),
  }
}

/** One line of the view as text: value with its p5-p95 interval. */
export const rowText = (r: BudgetRow, digits = 3): string =>
  `${fmtValue(r.value, digits)} [${fmtValue(r.lo, digits)}, ${fmtValue(r.hi, digits)}]`

type Meta = { kind: "predicted" | "band" | "marker"; id: string }

/**
 * Performance against cost for each profile: the best objective value the models reach under each budget (one line per
 * profile, p5-p95 band from the table's uncertainty draws), the knee of each profile as a marker, and the looked-up entry.
 */
export function figFrontier(
  data: Pick<OptData, "tables" | "objectives" | "cost_unit">,
  objectiveIndex: number,
  selected?: { profile: string; budget: number },
): FigureSpec {
  const name = data.objectives[objectiveIndex]
  if (name === undefined) throw new RangeError("unknown objective index")
  const traces: object[] = []
  const meta = (m: Meta) => m
  data.tables.forEach((t, i) => {
    const color = OKABE_ITO[[1, 5, 2][i % 3] as number] as string
    const label = PROFILE_LABEL[t.profile] ?? t.profile
    const x = t.entries.map((e) => e.cost)
    const common = { type: "scatter", legendgroup: t.profile }
    traces.push(
      {
        ...common,
        mode: "lines",
        x,
        y: t.entries.map((e) => e.lo[objectiveIndex]),
        line: { width: 0, color },
        hoverinfo: "skip",
        showlegend: false,
        meta: meta({ kind: "band", id: t.profile }),
      },
      {
        ...common,
        mode: "lines",
        x,
        y: t.entries.map((e) => e.hi[objectiveIndex]),
        line: { width: 0, color },
        fill: "tonexty",
        fillcolor: `${color}33`,
        hoverinfo: "skip",
        showlegend: false,
        meta: meta({ kind: "band", id: t.profile }),
      },
      {
        ...common,
        mode: "lines",
        x,
        y: t.entries.map((e) => e.objectives[objectiveIndex]),
        name: label,
        line: { width: 2, color },
        meta: meta({ kind: "predicted", id: t.profile }),
      },
    )
    const knee = lookupBudget(t, t.knee_budget)
    if (knee.status === "ok")
      traces.push({
        ...common,
        mode: "markers",
        x: [knee.entry.cost],
        y: [knee.entry.objectives[objectiveIndex]],
        name: `${label}: knee of the curve`,
        marker: {
          symbol: "diamond",
          size: 11,
          color,
          line: { width: 1.5, color: "#000000" },
        },
        meta: meta({ kind: "marker", id: `${t.profile}:knee` }),
      })
  })
  if (selected) {
    const t = data.tables.find((q) => q.profile === selected.profile)
    const r = t ? lookupBudget(t, selected.budget) : undefined
    if (r?.status === "ok")
      traces.push({
        type: "scatter",
        mode: "markers",
        x: [r.entry.cost],
        y: [r.entry.objectives[objectiveIndex]],
        name: "Recipe for the chosen budget",
        marker: {
          symbol: "x",
          size: 13,
          color: "#000000",
          line: { width: 2, color: "#000000" },
        },
        meta: meta({ kind: "marker", id: "selected" }),
      })
  }
  return {
    data: traces,
    layout: {
      uirevision: UIREVISION,
      margin: { l: 60, r: 16, t: 24, b: 48 },
      colorway: [...OKABE_ITO],
      xaxis: { title: { text: costLabel(data.cost_unit) } },
      yaxis: { title: { text: `${axisLabel(name)}, p5-p95 band` } },
      legend: { orientation: "h", y: -0.3 },
    },
    config: { responsive: true, displaylogo: false },
  }
}

/** The refined Pareto front: cost against solar reflectance of the non-dominated refined recipes (model optimum, PROXY). */
export function figRefineFront(
  front: readonly FrontRow[],
  objectives: readonly string[],
  cost_unit: OptData["cost_unit"],
): FigureSpec {
  const ix = objectives.indexOf("r_solar_pred")
  const ic = objectives.indexOf("cost_proxy")
  const rows = front.filter((r) => r.objectives.every(Number.isFinite))
  return {
    data: [
      {
        type: "scatter",
        mode: "markers",
        x: rows.map((r) => r.objectives[ic]),
        y: rows.map((r) => r.objectives[ix]),
        text: rows.map((r) => r.weight_id),
        hovertemplate: "%{text}<extra></extra>",
        name: "Refined recipes (nominal)",
        marker: { color: OKABE_ITO[4], size: 9, symbol: "circle" },
      },
    ],
    layout: {
      uirevision: UIREVISION,
      margin: { l: 60, r: 16, t: 24, b: 48 },
      colorway: [...OKABE_ITO],
      xaxis: {
        title: {
          text: `${axisLabel("cost_proxy")}, ${costUnitText(cost_unit)}`,
        },
      },
      yaxis: { title: { text: axisLabel("r_solar_pred") } },
    },
    config: { responsive: true, displaylogo: false },
  }
}
