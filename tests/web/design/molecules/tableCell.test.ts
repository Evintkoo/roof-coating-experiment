import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  CELL_KINDS,
  tableCell,
} from "../../../../src/web/design/molecules/tableCell"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R13 TableCell", ["text", "number", "index", "empty"])
})

test("everyKindRendersASortableCell", async () => {
  expect([...CELL_KINDS]).toEqual(["text", "number", "index", "empty"])
  const text = await elementsOf(tableCell({ kind: "text", value: "SP-075" }))
  expect(text[0]?.tag).toBe("td")
  expect(text[0]?.attrs["data-sort"]).toBe("sp-075")
  const head = await elementsOf(
    tableCell({ kind: "text", value: "Best cooling", header: true }),
  )
  expect(head[0]?.tag).toBe("th")
  expect(head[0]?.attrs.scope).toBe("row")
  const num = tableCell({ kind: "number", value: 14.449, digits: 1 })
  expect(num).toContain(">14.4<")
  expect(num).toContain('data-sort="14.449"')
  expect(num).toContain("tv-cell--number")
  const iv = tableCell({
    kind: "number",
    value: 14.4,
    digits: 1,
    interval: { lo: 14.3, hi: 14.5 },
  })
  expect(iv).toContain("14.4")
  expect(iv).toContain("[14.3, 14.5]")
  const idx = tableCell({ kind: "index", value: 0.7013, tone: "proxy" })
  expect(idx).toContain(">0.70 <span")
  expect(idx).toContain('data-proxy-badge="proxy"')
  expect(idx).toContain('data-tone="proxy"')
  const empty = tableCell({ kind: "empty" })
  expect(empty).toContain("–")
  expect(empty).toContain("no value")
  expect(empty).toContain('data-sort=""')
})

test("indexWithoutToneIsATypeErrorAndABuildError", () => {
  expectBuildError(
    // @ts-expect-error an index cell must carry its tone
    () => tableCell({ kind: "index", value: 0.5 }),
    "TableCell",
  )
})

test("escapesF8AndRejectsBadInputF7", async () => {
  const els = await elementsOf(tableCell({ kind: "text", value: XSS }))
  expect(els.some((e) => e.tag === "img")).toBe(false)
  expectBuildError(() => tableCell({ kind: "bar" as never }), "TableCell")
  expectBuildError(
    () => tableCell({ kind: "number", value: Number.NaN }),
    "TableCell",
  )
  expectBuildError(
    () => tableCell({ kind: "number", value: 1, interval: { lo: 2, hi: 1 } }),
    "TableCell",
  )
  expectBuildError(
    () => tableCell({ kind: "index", value: 1, tone: "x" as never }),
    "TableCell",
  )
  expectBuildError(
    () => tableCell({ kind: "text", value: 3 as never }),
    "TableCell",
  )
})

test("cssRightAlignsNumbersAndIsTokenOnly", () => {
  const css = MOLECULE_CSS.tableCell
  expectTokenOnly(css)
  expect(css).toMatch(/\.tv-cell--number\{[^}]*text-align:right/)
  expect(css).toContain("tabular-nums")
})
