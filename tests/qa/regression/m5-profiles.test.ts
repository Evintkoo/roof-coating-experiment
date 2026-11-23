// Regression for docs/qa/bugs.md m5 and its decision (docs/qa/triage.md): the three priority profiles select the same recipes within
// the models' own p5-p95 uncertainty, so the page shows one frontier and no priority chips. The decision is data-driven: if a
// profile ever differs by a full half-width somewhere, `singleFrontier` keeps all profiles and the chips come back.
// Pre-fix commit 041ab2d: three chips that changed nothing and a chart of three coincident lines.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { OptData } from "../../../src/web/optimisation"
import { profileSpread, singleFrontier } from "../../../src/web/optimisation"
import { REPORT_FIXTURE } from "../../helpers"
import { type QaBrowser, startQa } from "../../support/qaPage"

const table = JSON.parse(
  readFileSync(join(REPORT_FIXTURE, "refine", "budget_table.json"), "utf8"),
) as OptData

test("theThreeProfilesAreIndistinguishableOnTheRealTable", () => {
  expect(table.tables.map((t) => t.profile).sort()).toEqual([
    "balanced",
    "cooling_first",
    "durability_first",
  ])
  const spread = profileSpread(table)
  // measured 0.597 (corrosion index, one level); the bound of 1 is the definition of "within the uncertainty band"
  expect(spread).toBeGreaterThan(0)
  expect(spread).toBeLessThan(1)
  expect(singleFrontier(table).tables.map((t) => t.profile)).toEqual([
    "balanced",
  ])
})

test("theCollapseCanFailWhenAProfileReallyDiffers", () => {
  const moved = structuredClone(table)
  const t = moved.tables[0]
  const e = t?.entries[50]
  if (!e) throw new Error("no entry")
  e.objectives[1] = (e.objectives[1] as number) + 1 // 1 K, about 15 half-widths of the temperature band
  expect(profileSpread(moved)).toBeGreaterThanOrEqual(1)
  expect(singleFrontier(moved).tables.length).toBe(3)
  // a table with different budgets is a different table
  const other = structuredClone(table)
  const o = other.tables[1]
  if (!o) throw new Error("no table")
  o.entries = o.entries.slice(1)
  expect(profileSpread(other)).toBe(Number.POSITIVE_INFINITY)
})

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close(), 120_000)

test("theBudgetSectionHasNoPriorityChipsAndOneLine", async () => {
  const page = await qa.open()
  await page.evaluate(() => {
    ;(document.querySelector("#budget details") as HTMLDetailsElement).open =
      true
  })
  const r = await page.evaluate(async () => {
    const gd = document.getElementById("fig-frontier") as HTMLElement & {
      data?: { meta?: { kind?: string } }[]
    }
    const lines = (gd.data ?? []).filter(
      (t) => t.meta?.kind === "predicted",
    ).length
    return {
      chips: document.querySelectorAll("#budget-panel .tv-chip--toggle").length,
      lines,
      text: document.getElementById("budget")?.textContent ?? "",
    }
  })
  expect(r.chips).toBe(0)
  expect(r.lines).toBe(1)
  expect(r.text).toContain("One table, not three")
  expect(r.text).not.toContain("Durability first")
}, 60_000)
