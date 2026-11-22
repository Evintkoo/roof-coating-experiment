import { expect, test } from "bun:test"
import { ROLE_NAMES } from "../../../src/core/report/findings"
import {
  ALLOWED_LABELS,
  HONESTY_STATEMENT,
  LAYERS,
  LIMITS_HREF,
  LIMITS_LINK_TEXT,
  OUTLINE,
  OVERCLAIM_PATTERN,
  ROLE_BLURBS,
  ROLE_LABELS,
  withoutAllowedLabels,
} from "../../../src/core/report/outline"
import { GLOSSARY, termsIn } from "../../../src/web/design/terms"

test("outlineFollowsFr2InOrder", () => {
  expect(OUTLINE.map((s) => s.title)).toEqual([
    "Verdict",
    "Recipes",
    "Why it works",
    "Indonesian climate",
    "Budget",
    "Explore all 96",
    "Method and limits",
    "Provenance",
  ])
  expect(new Set(OUTLINE.map((s) => s.id)).size).toBe(OUTLINE.length)
  expect(OUTLINE.filter((s) => s.optional).map((s) => s.id)).toEqual([
    "climate",
    "budget",
  ])
  for (const s of OUTLINE) expect(s.question.endsWith("?")).toBe(true)
})

test("roleLabelsMatchTheFindings", () => {
  expect(JSON.stringify(ROLE_LABELS)).toBe(JSON.stringify(ROLE_NAMES))
  expect(Object.keys(ROLE_BLURBS)).toEqual(Object.keys(ROLE_LABELS))
})

test("threeLayersAreExplainedInOneSentenceEach", () => {
  expect(LAYERS.map((l) => l.id)).toEqual(["primer", "midcoat", "topcoat"])
  for (const l of LAYERS) {
    expect(l.why.length).toBeGreaterThan(40)
    expect(l.why.match(/\./g)?.length).toBe(1)
  }
})

test("honestyStatementCarriesTheStructuralCaveats", () => {
  for (const needle of [
    "PROXY",
    "parameter uncertainty only",
    "not a laboratory result",
    "scenario",
    "Next step: make small coated aluminium samples (a coupon test) of a recipe and test them in a laboratory; these numbers only rank which recipes are worth that test.",
  ])
    expect(HONESTY_STATEMENT).toContain(needle)
  expect(LIMITS_LINK_TEXT).toBe("Limits")
  expect(LIMITS_HREF).toBe("#limits")
})

test("bodyTextIsFreeOfOverclaimAndOnlyTwoLabelsAreAllowed", () => {
  const body = [
    HONESTY_STATEMENT,
    ...LAYERS.map((l) => l.why),
    ...Object.values(ROLE_BLURBS),
    ...OUTLINE.map((s) => s.question),
    ...GLOSSARY.flatMap((g) => [g.definition, g.meaning, g.unit]),
  ]
  for (const t of body) expect(t).not.toMatch(OVERCLAIM_PATTERN)
  const labels = [...OUTLINE.map((s) => s.title), ...Object.values(ROLE_LABELS)]
  const flagged = labels.filter((l) => OVERCLAIM_PATTERN.test(l))
  expect(flagged.sort()).toEqual([...ALLOWED_LABELS].sort())
  for (const l of labels)
    expect(withoutAllowedLabels(l)).not.toMatch(OVERCLAIM_PATTERN)
  expect(withoutAllowedLabels("Why it works and a best guess")).toMatch(
    OVERCLAIM_PATTERN,
  )
})

test("layerAndHonestyTextUseOnlyDefinedTerms", () => {
  const ids = new Set(GLOSSARY.map((g) => g.id))
  for (const t of [HONESTY_STATEMENT, ...LAYERS.map((l) => l.why)])
    for (const id of termsIn(t)) expect(ids.has(id)).toBe(true)
  expect(termsIn(HONESTY_STATEMENT)).toContain("proxy-index")
})
