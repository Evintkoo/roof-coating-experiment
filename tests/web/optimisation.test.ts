import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { safeJson } from "../../src/core/json"
import type { BudgetTable } from "../../src/core/opt/budgetTable"
import {
  budgetRange,
  budgetView,
  costLabel,
  figFrontier,
  figRefineFront,
  type OptData,
  rowText,
  varLabel,
} from "../../src/web/optimisation"
import { repoRoot } from "../helpers"

// a real budget table captured from the real `budget-table` command (3 profiles x 3 levels)
const file = JSON.parse(
  readFileSync(
    join(repoRoot, "tests/fixtures/report/refine/budget_table.json"),
    "utf8",
  ),
) as {
  cost_unit: "relative"
  objectives: string[]
  vars: string[]
  tables: BudgetTable[]
}
const data: OptData = { ...file, front: [] }

/** The oracle: a plain scan, written without lookupBudget. */
function scan(t: BudgetTable, b: number) {
  let best: (typeof t.entries)[number] | undefined
  for (const e of t.entries)
    if (e.budget <= b && (!best || e.budget > best.budget)) best = e
  return best
}

test("budgetViewIsTheExactLookup", () => {
  for (const t of data.tables) {
    const probes = [
      ...t.entries.map((e) => e.budget),
      ...t.entries.map((e) => e.budget + 1e-9),
      ...t.entries.map((e) => e.budget + 0.3 * (t.c_max - t.c_min)),
      t.c_max + 5,
    ]
    for (const b of probes) {
      const v = budgetView(data, t.profile, b)
      const want = scan(t, b)
      expect(v.status).toBe("ok")
      if (v.status !== "ok" || !want) throw new Error("expected a recipe")
      expect(v.cost).toBe(want.cost)
      expect(v.cost).toBeLessThanOrEqual(b) // the post-condition: never over budget
      expect(v.headroom).toBeCloseTo(b - want.cost, 12)
      expect(v.recipe.map((r) => r.value)).toEqual(want.x)
      expect(v.objectives.map((o) => o.value)).toEqual(want.objectives)
      expect(v.objectives.map((o) => o.lo)).toEqual(want.lo)
      expect(v.knee).toBe(t.knee_budget)
    }
  }
})

test("belowMinimumBudgetIsInfeasibleWithTheMinimum", () => {
  for (const t of data.tables) {
    const v = budgetView(data, t.profile, t.c_min - 1e-6)
    expect(v).toEqual({
      status: "infeasible",
      profile: t.profile,
      budget: t.c_min - 1e-6,
      c_min: t.c_min,
    })
    expect(budgetView(data, t.profile, Number.NaN).status).toBe("infeasible")
  }
  expect(() => budgetView(data, "nope", 1)).toThrow()
})

test("labelsAndRanges", () => {
  const [lo, hi] = budgetRange(data.tables)
  expect(lo).toBe(Math.min(...data.tables.map((t) => t.c_min)))
  expect(hi).toBe(Math.max(...data.tables.map((t) => t.c_max)))
  expect(costLabel("relative")).toContain("relative cost units, not IDR")
  expect(costLabel("idr_per_m2")).not.toContain("not IDR")
  const v = budgetView(data, "balanced", hi)
  if (v.status !== "ok") throw new Error("expected ok")
  const proxy = v.objectives.filter((o) =>
    /Corrosion|Delamination|Cost/.test(o.label),
  )
  expect(proxy.length).toBe(3)
  for (const o of proxy) expect(o.label).toContain("(PROXY)")
  expect(rowText(v.objectives[0] as never, 3)).toMatch(
    /^[\d.]+ \[[\d.]+, [\d.]+\]$/,
  )
  expect(varLabel("m3")).toContain("DFT")
  expect(varLabel("zz")).toBe("zz")
})

test("frontierHasBandPerLineKneeAndSelection", () => {
  for (let k = 0; k < data.objectives.length; k++) {
    const f = figFrontier(data, k, { profile: "balanced", budget: 0.5 })
    expect(() => safeJson(f)).not.toThrow()
    const t = f.data as {
      meta: { kind: string; id: string }
      fill?: string
      y: number[]
      name?: string
    }[]
    const lines = t.filter((x) => x.meta.kind === "predicted")
    expect(lines.length).toBe(3)
    for (const l of lines) {
      const bands = t.filter(
        (x) => x.meta.kind === "band" && x.meta.id === l.meta.id,
      )
      expect(bands.length).toBe(2)
      expect(bands.some((b) => b.fill === "tonexty")).toBe(true)
    }
    expect(t.filter((x) => x.meta.kind === "marker").length).toBe(4) // three knees and the selection
    expect((f.layout as { uirevision: string }).uirevision).toBe("spandek")
    const xTitle = (f.layout as { xaxis: { title: { text: string } } }).xaxis
      .title.text
    expect(xTitle).toContain("relative cost units, not IDR")
  }
  // no selection marker without a selection
  expect(
    (figFrontier(data, 0).data as { meta: { id: string } }[]).some(
      (x) => x.meta.id === "selected",
    ),
  ).toBe(false)
  expect(() => figFrontier(data, 99)).toThrow()
})

test("refineFrontDropsNonFiniteAndLabelsAxes", () => {
  const front = [
    {
      weight_id: "a",
      S: 0.1,
      objectives: [0.9, 30, 0.2, 0.1, 0.3],
      status: "converged",
    },
    {
      weight_id: "b",
      S: 0.1,
      objectives: [Number.NaN, 30, 0.2, 0.1, 0.3],
      status: "converged",
    },
  ]
  const f = figRefineFront(front, data.objectives, "relative")
  const tr = f.data[0] as { x: number[]; y: number[] }
  expect(tr.x.length).toBe(1)
  expect(() => safeJson(f)).not.toThrow()
  expect(
    (f.layout as { xaxis: { title: { text: string } } }).xaxis.title.text,
  ).toContain("not IDR")
  expect(
    (f.layout as { xaxis: { title: { text: string } } }).xaxis.title.text,
  ).toContain("PROXY")
})
