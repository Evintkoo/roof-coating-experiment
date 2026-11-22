import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  DISCLOSURE_LEVELS,
  DISCLOSURE_SCRIPT,
  disclosure,
} from "../../../../src/web/design/molecules/disclosure"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R8 Disclosure", ["closed", "open", "detail"])
})

test("isNativeDetailsClosedByDefaultAndTakesTrustedInner", async () => {
  expect([...DISCLOSURE_LEVELS]).toEqual(["detail"])
  const closed = disclosure({ summary: "Live simulator", level: "detail" })(
    "<p>inner</p>",
  )
  const els = await elementsOf(closed)
  expect(els.map((e) => e.tag)).toEqual(["details", "summary", "div", "p"])
  expect(els[0]?.attrs.open).toBeUndefined()
  expect(els[0]?.attrs["data-level"]).toBe("detail")
  expect(closed).toContain("<p>inner</p>")
  const open = await elementsOf(
    disclosure({ summary: "s", level: "detail", open: true })(""),
  )
  expect(open[0]?.attrs.open).toBe("")
  const withId = await elementsOf(
    disclosure({ summary: "s", level: "detail", id: "sim" })(""),
  )
  expect(withId[0]?.attrs.id).toBe("sim")
})

test("escapesTheSummaryF8", async () => {
  const els = await elementsOf(
    disclosure({ summary: XSS, level: "detail" })("x"),
  )
  expect(els.some((e) => e.tag === "img")).toBe(false)
})

test("unknownLevelOrEmptySummaryIsABuildErrorF7", () => {
  expectBuildError(
    () => disclosure({ summary: "s", level: "summary" as never }),
    "Disclosure",
  )
  expectBuildError(
    () => disclosure({ summary: "  ", level: "detail" }),
    "Disclosure",
  )
  expectBuildError(
    () => disclosure({ summary: "s", level: "detail", id: "a b" }),
    "Disclosure",
  )
})

test("scriptIsValidJavaScriptAndOpensAncestors", () => {
  expect(() => new Function(DISCLOSURE_SCRIPT)).not.toThrow()
  for (const k of ["hashchange", "DETAILS", "getElementById"])
    expect(DISCLOSURE_SCRIPT).toContain(k)
})

test("cssIsTokenOnlyWith44pxSummaryAndPrintOpen", () => {
  const css = MOLECULE_CSS.disclosure
  expectTokenOnly(css)
  expect(css).toContain("min-height:var(--tv-target-min)")
  expect(css).toMatch(/@media print\{[\s\S]*details-content/)
})
