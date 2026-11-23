// Pure helpers that turn a recipe's numbers into what the page shows: the three layer descriptions and the budget lookup that
// answers a (profile, budget) pair with a RecipeCard's props. Shared by the build (first render) and the browser (live lookup),
// so both print the same recipe. No I/O, no DOM.
import { lookupBudget } from "../core/opt/budgetTable"
import type { BudgetLookup } from "./design/organisms/budgetPanel"
import type { RecipeLayers, RecipeRole } from "./design/organisms/recipeCard"
import {
  type OptData,
  PROFILE_LABEL,
  SINGLE_FRONTIER_LABEL,
} from "./optimisation"

export type Design = {
  primer_gptes_molfrac: number
  primer_dft_um: number
  midcoat_pvc: number
  midcoat_tio2_fraction: number
  midcoat_dft_um: number
  topcoat_mtes_molfrac: number
  topcoat_dft_um: number
}

const two = (x: number): string => x.toFixed(2)

/** The three layers as the candidate cards print them. */
export function layerStrings(d: Design): RecipeLayers {
  return {
    primer: `GPTES:TEOS mole fraction ${two(d.primer_gptes_molfrac)}:${two(1 - d.primer_gptes_molfrac)}, ${d.primer_dft_um.toFixed(1)} µm`,
    midcoat: `TiO2:BaSO4 volume ratio ${two(d.midcoat_tio2_fraction)}:${two(1 - d.midcoat_tio2_fraction)}, total PVC ${d.midcoat_pvc.toFixed(3)}, ${d.midcoat_dft_um.toFixed(0)} µm`,
    topcoat: `MTES:TEOS mole fraction ${two(d.topcoat_mtes_molfrac)}:${two(1 - d.topcoat_mtes_molfrac)}, ${d.topcoat_dft_um.toFixed(1)} µm`,
  }
}

const X: Record<string, keyof Design> = {
  p1: "primer_gptes_molfrac",
  p2: "primer_dft_um",
  m1: "midcoat_pvc",
  m2: "midcoat_tio2_fraction",
  m3: "midcoat_dft_um",
  t1: "topcoat_mtes_molfrac",
  t2: "topcoat_dft_um",
}

/** The design of a budget-table entry (`x` in the order of `vars`). */
export function designFromX(
  x: readonly number[],
  vars: readonly string[],
): Design {
  const d = {} as Record<keyof Design, number>
  for (const [k, name] of Object.entries(X)) {
    const i = vars.indexOf(k)
    const v = x[i]
    if (i < 0 || v === undefined || !Number.isFinite(v))
      throw new RangeError(`budget entry has no finite ${k}`)
    d[name] = v
  }
  return d
}

const PROFILE_ROLE: Record<string, RecipeRole> = {
  cooling_first: "high_performing",
  balanced: "balanced",
  durability_first: "low_cost",
}

/** What the budget panel needs besides the table: the bare-aluminium peak (nominal) and the shared cooling scale. */
export type BudgetPage = {
  opt: OptData
  c0_mean_c: number
  axis: { min: number; max: number }
}

/** The cooling axis shared by every recipe of the budget table: from 0 to the largest cooling over all entries, rounded up. */
export function coolingAxis(
  tables: OptData["tables"],
  objectives: readonly string[],
  c0: number,
): { min: number; max: number } {
  const it = objectives.indexOf("t_max_pred")
  let best = 0
  let worst = 0
  for (const t of tables)
    for (const e of t.entries) {
      best = Math.max(best, c0 - (e.lo[it] as number))
      worst = Math.min(worst, c0 - (e.hi[it] as number))
    }
  return { min: Math.floor(worst), max: Math.ceil(best) + 1 }
}

/** The exact lookup of plan 05 as a BudgetLookup: the recipe of the largest tabulated budget at or below `budget`. */
export function budgetLookup(page: BudgetPage): BudgetLookup {
  const { opt } = page
  const it = opt.objectives.indexOf("t_max_pred")
  const ir = opt.objectives.indexOf("r_solar_pred")
  const ic = opt.objectives.indexOf("corrosion_proxy")
  const id = opt.objectives.indexOf("delam_proxy")
  const ik = opt.objectives.indexOf("cost_proxy")
  return (profile, budget) => {
    const t = opt.tables.find((x) => x.profile === profile)
    if (!t) throw new RangeError(`no table for profile ${profile}`)
    const r = lookupBudget(t, budget)
    if (r.status === "infeasible")
      return { status: "infeasible", c_min: r.c_min }
    const e = r.entry
    const design = designFromX(e.x, opt.vars)
    return {
      status: "ok",
      cost: e.cost,
      headroom: r.headroom,
      knee: t.knee_budget,
      recipe: {
        role: PROFILE_ROLE[profile] ?? "balanced",
        roleLabel: opt.merged
          ? SINGLE_FRONTIER_LABEL
          : (PROFILE_LABEL[profile] ?? profile),
        name: `Level ${e.level}`,
        cooling: {
          value: page.c0_mean_c - (e.objectives[it] as number),
          lo: page.c0_mean_c - (e.hi[it] as number),
          hi: page.c0_mean_c - (e.lo[it] as number),
          min: page.axis.min,
          max: page.axis.max,
          digits: 1,
        },
        cost: { value: e.objectives[ik] as number, digits: 2 },
        layers: layerStrings(design),
        metrics: [
          {
            label: "Solar reflectance (nominal)",
            value: e.objectives[ir] as number,
            digits: 3,
            tone: "nominal",
          },
          {
            label: "Corrosion index",
            value: e.objectives[ic] as number,
            digits: 2,
            tone: "proxy",
          },
          {
            label: "Delamination index",
            value: e.objectives[id] as number,
            digits: 2,
            tone: "proxy",
          },
        ],
      },
    }
  }
}
