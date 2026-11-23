// Pure helpers of the Optimisation section (plan 05 in the report): budget lookup view, performance-price figures. No I/O, no DOM.
import {
  type BudgetEntry,
  type BudgetTable,
  lookupBudget,
} from "../core/opt/budgetTable"
import { LIGHT_PLOT, type Slot, slotColor, withAlpha } from "./design/plotTheme"
import {
  axisLabel,
  type EndLabel,
  endLabels,
  extent,
  type FigureSpec,
  UIREVISION,
} from "./figures"
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
  /** Set by `singleFrontier`: the profiles were merged into one table, so no profile name is shown. */
  merged?: true
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
 * How far apart the priority profiles are: the largest difference of any objective between two profiles at the same tabulated
 * budget, in units of the p5-p95 half-width of that objective there (an objective with no band must match to 1e-6, else
 * Infinity). Below 1 the profiles cannot be told apart by the models' own uncertainty. Tables of different budgets differ (Infinity).
 */
export function profileSpread(d: Pick<OptData, "tables">): number {
  const [first, ...rest] = d.tables
  if (!first) return 0
  let worst = 0
  for (const t of rest) {
    if (t.entries.length !== first.entries.length)
      return Number.POSITIVE_INFINITY
    t.entries.forEach((e, i) => {
      const a = first.entries[i] as (typeof first.entries)[number]
      if (Math.abs(a.budget - e.budget) > 1e-9) worst = Number.POSITIVE_INFINITY
      a.objectives.forEach((v, j) => {
        const dv = Math.abs(v - (e.objectives[j] as number))
        const hw =
          Math.max(
            (a.hi[j] as number) - (a.lo[j] as number),
            (e.hi[j] as number) - (e.lo[j] as number),
          ) / 2
        const r = hw > 0 ? dv / hw : dv <= 1e-6 ? 0 : Number.POSITIVE_INFINITY
        if (r > worst) worst = r
      })
    })
  }
  return worst
}

/**
 * One frontier when the priority profiles are indistinguishable (`profileSpread` below 1): the balanced table (the first when
 * there is none); the other tables stay in the file and the manifest. When the profiles do differ, all of them are kept.
 */
export function singleFrontier(d: OptData): OptData {
  if (d.tables.length < 2 || profileSpread(d) >= 1) return d
  const t = d.tables.find((x) => x.profile === "balanced") ?? d.tables[0]
  return { ...d, tables: t ? [t] : [], merged: true }
}

/** The one line's name when only one profile is drawn. */
export const SINGLE_FRONTIER_LABEL = "Modelled recipe for each budget"

/** One colour role per priority profile; the brand orange stays with the recommended recipe. */
const PROFILE_SLOT: readonly Slot[] = ["series-3", "series-1", "series-4"]

/**
 * Performance against cost for each profile: the best objective value the models reach under each budget (one line per
 * profile, p5-p95 band from the table's uncertainty draws), the knee of each profile as a marker, and the looked-up entry.
 */
export function figFrontier(
  data: Pick<OptData, "tables" | "objectives" | "cost_unit" | "merged">,
  objectiveIndex: number,
  selected?: { profile: string; budget: number },
): FigureSpec {
  const name = data.objectives[objectiveIndex]
  if (name === undefined) throw new RangeError("unknown objective index")
  const traces: object[] = []
  const meta = (m: Meta, slot: Slot) => ({ ...m, slot })
  const labels: EndLabel[] = []
  const all: number[][] = []
  data.tables.forEach((t, i) => {
    const slot = PROFILE_SLOT[i % PROFILE_SLOT.length] as Slot
    const color = slotColor(LIGHT_PLOT, slot)
    const label =
      "merged" in data && data.merged
        ? SINGLE_FRONTIER_LABEL
        : (PROFILE_LABEL[t.profile] ?? t.profile)
    const x = t.entries.map((e) => e.cost)
    const common = { type: "scatter", legendgroup: t.profile }
    const lo = t.entries.map((e) => e.lo[objectiveIndex] as number)
    const hi = t.entries.map((e) => e.hi[objectiveIndex] as number)
    const y = t.entries.map((e) => e.objectives[objectiveIndex] as number)
    all.push(lo, hi, y)
    traces.push(
      {
        ...common,
        mode: "lines",
        x,
        y: lo,
        line: { width: 0, color },
        hoverinfo: "skip",
        showlegend: false,
        meta: meta({ kind: "band", id: t.profile }, slot),
      },
      {
        ...common,
        mode: "lines",
        x,
        y: hi,
        line: { width: 0, color },
        fill: "tonexty",
        fillcolor: withAlpha(color, 0.2),
        hoverinfo: "skip",
        showlegend: false,
        meta: meta({ kind: "band", id: t.profile }, slot),
      },
      {
        ...common,
        mode: "lines",
        x,
        y,
        name: label,
        showlegend: false,
        line: { width: 2.5, color },
        meta: meta({ kind: "predicted", id: t.profile }, slot),
      },
    )
    labels.push({
      text: label,
      slot,
      x: x[x.length - 1] as number,
      y: y[y.length - 1] as number,
    })
    const knee = lookupBudget(t, t.knee_budget)
    if (knee.status === "ok")
      traces.push({
        ...common,
        mode: "markers",
        x: [knee.entry.cost],
        y: [knee.entry.objectives[objectiveIndex]],
        name: `${label}: knee of the curve`,
        showlegend: false,
        marker: { symbol: "diamond", size: 11, color },
        meta: meta({ kind: "marker", id: `${t.profile}:knee` }, slot),
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
        showlegend: false,
        marker: {
          symbol: "x",
          size: 13,
          color: slotColor(LIGHT_PLOT, "ink"),
          line: { width: 2, color: slotColor(LIGHT_PLOT, "ink") },
        },
        meta: meta({ kind: "marker", id: "selected" }, "ink"),
      })
  }
  return {
    data: traces,
    layout: {
      uirevision: UIREVISION,
      margin: { l: 64, r: 150, t: 24, b: 48 },
      colorway: [...LIGHT_PLOT.colorway],
      xaxis: { title: { text: costLabel(data.cost_unit) } },
      yaxis: { title: { text: `${axisLabel(name)}, p5-p95 band` } },
      showlegend: false,
      annotations: endLabels(labels, extent(all)),
    },
    config: { responsive: true, displaylogo: false, displayModeBar: false },
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
        marker: {
          color: slotColor(LIGHT_PLOT, "series-3"),
          size: 9,
          symbol: "circle",
        },
        showlegend: false,
        meta: { kind: "predicted", id: "refined", slot: "series-3" },
      },
    ],
    layout: {
      uirevision: UIREVISION,
      margin: { l: 60, r: 16, t: 24, b: 48 },
      colorway: [...LIGHT_PLOT.colorway],
      showlegend: false,
      xaxis: {
        title: {
          text: `${axisLabel("cost_proxy")}, ${costUnitText(cost_unit)}`,
        },
      },
      yaxis: { title: { text: axisLabel("r_solar_pred") } },
    },
    config: { responsive: true, displaylogo: false, displayModeBar: false },
  }
}
