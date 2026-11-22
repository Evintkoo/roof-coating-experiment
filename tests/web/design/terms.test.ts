// Plan 06 Task 5 (H14, BLOCKED-12/13).
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { findings } from "../../../src/core/report/findings"
import { loadFindingsInput } from "../../../src/node/report/findingsInput"
import {
  GLOSSARY,
  glossaryAnchor,
  glossaryEntry,
  glossaryLink,
  termsIn,
} from "../../../src/web/design/terms"
import { repoRoot } from "../../helpers"

test("termsAllDefined", () => {
  const f = findings(
    loadFindingsInput(join(repoRoot, "reports", "plan-00-run")),
  )
  const verdictAndRecipes = f.filter(
    (x) => x.id === "verdict" || x.id.startsWith("recipe-"),
  )
  expect(verdictAndRecipes.length).toBe(4)
  const used = new Set<string>()
  for (const s of verdictAndRecipes) {
    const ids = termsIn(s.sentence)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      used.add(id)
      expect(glossaryEntry(id).definition.length).toBeGreaterThan(20)
      expect(glossaryLink(id)).toBe(`#glossary-${id}`)
    }
  }
  for (const must of [
    "peak-surface-temperature",
    "bare-aluminium",
    "parameter-uncertainty",
    "proxy-index",
    "relative-cost-units",
    "nominal-only",
  ])
    expect(used.has(must)).toBe(true)
  // the lookup can fail
  expect(() => glossaryLink("not-a-term")).toThrow()
})

test("glossaryEntriesHaveUnitsAndMeaning", () => {
  expect(new Set(GLOSSARY.map((g) => g.id)).size).toBe(GLOSSARY.length)
  for (const g of GLOSSARY) {
    expect(g.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
    expect(g.label.length).toBeGreaterThan(2)
    expect(g.matches.length).toBeGreaterThan(0)
    for (const m of g.matches) expect(m).toBe(m.toLowerCase())
    expect(g.definition.length).toBeGreaterThan(30)
    expect(g.unit.length).toBeGreaterThan(3)
    expect(g.meaning.length).toBeGreaterThan(30)
    expect(glossaryAnchor(g.id)).toBe(`glossary-${g.id}`)
  }
  const required = [
    "solar-reflectance",
    "peak-surface-temperature",
    "proxy-index",
    "parameter-uncertainty",
    "scenario-ageing",
    "shortlist",
    "pareto",
    "dft-thickness",
    "relative-cost-units",
    "weather-data",
  ]
  for (const r of required) expect(GLOSSARY.some((g) => g.id === r)).toBe(true)
})

test("termsInFindsTermsInOrderWithWordBoundaries", () => {
  expect(termsIn("A PROXY index of the peak surface temperature")).toEqual([
    "proxy-index",
    "peak-surface-temperature",
  ])
  expect(termsIn("nothing to see here")).toEqual([])
  expect(termsIn("proxying")).toEqual([])
  expect(termsIn("DFT of 5 um")).toEqual(["dft-thickness"])
})

test("glossaryIsDataNotCode", () => {
  for (const g of GLOSSARY) expect(JSON.parse(JSON.stringify(g))).toEqual(g)
})

test("blockedEntriesPresent", () => {
  const text = readFileSync(join(repoRoot, "docs", "BLOCKED.md"), "utf8")
  const ids = [...text.matchAll(/^## BLOCKED-(\d+):/gm)].map((m) =>
    Number(m[1]),
  )
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids).toEqual([...ids].sort((a, b) => a - b))
  for (const id of [12, 13]) {
    expect(ids).toContain(id)
    const body = new RegExp(`## BLOCKED-${id}:[\\s\\S]*?(?=\\n## |$)`).exec(
      text,
    )?.[0] as string
    for (const field of ["- Reason:", "- Owner: Evint", "- Unblock condition:"])
      expect(body).toContain(field)
  }
  expect(text).toMatch(/BLOCKED-12: Indonesian-language/)
  expect(text).toMatch(/BLOCKED-13: Light theme/)
})
