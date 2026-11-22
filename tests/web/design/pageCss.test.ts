import { expect, test } from "bun:test"
import { PAGE_CSS } from "../../../src/web/design/pageCss"
import { expectTokenOnly } from "../../support/designComponents"

test("pageCssIsTokenOnlyAndEveryVarResolves", () => {
  expectTokenOnly(PAGE_CSS)
})

test("printHidesTheToolsAndTheRowCapOfTheExplorer", () => {
  const print = PAGE_CSS.slice(PAGE_CSS.indexOf("@media print"))
  expect(print).toContain(".page__tools{display:none}")
  expect(print).toContain("max-height:none")
})

test("parcoordsAxisStrokeFollowsTheTextTokenNeverBlack", () => {
  expect(PAGE_CSS).toContain(".parcoords .axis path.domain")
  expect(PAGE_CSS).toContain("stroke:var(--tv-text-muted) !important")
})
