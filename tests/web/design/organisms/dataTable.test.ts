import { expect, test } from "bun:test"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import {
  dataTable,
  TABLE_SORT_SCRIPT,
} from "../../../../src/web/design/organisms/dataTable"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const columns = [
  { key: "name", label: "Recipe", kind: "text" as const, rowHeader: true },
  {
    key: "cool",
    label: "Cooling vs bare Al",
    unit: "K",
    kind: "number" as const,
    digits: 1,
    sortable: true,
  },
  {
    key: "corr",
    label: "Corrosion",
    kind: "index" as const,
    tone: "proxy" as const,
    digits: 2,
    sortable: true,
  },
]
const rows = [
  { name: "SP-075", cool: { value: 14.4, lo: 14.3, hi: 14.5 }, corr: 0.701 },
  { name: "SP-031", cool: 13.6, corr: 0.55 },
  { name: "SP-046", cool: null, corr: undefined },
]
const ok = { id: "recipes-table", caption: "The three recipes", columns, rows }

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R18 DataTable", ["none", "ascending", "descending"])
})

test("hasCaptionUnitsInHeadersRowHeadersAndProxyOnEveryIndexCell", async () => {
  const html = dataTable(ok)
  const els = await elementsOf(html)
  expect(els[0]?.attrs.role).toBe("region")
  expect(els[0]?.attrs["aria-label"]).toBe("The three recipes")
  expect(els[0]?.attrs.tabindex).toBe("0")
  expect(els.find((e) => e.tag === "table")?.attrs.id).toBe("recipes-table")
  expect(els.some((e) => e.tag === "caption")).toBe(true)
  expect(html).toContain("Cooling vs bare Al (K)")
  expect(
    els.filter((e) => e.tag === "th" && e.attrs.scope === "col").length,
  ).toBe(3)
  expect(
    els.filter((e) => e.tag === "th" && e.attrs.scope === "row").length,
  ).toBe(3)
  expect(els.filter((e) => e.tag === "tr").length).toBe(4)
  // two index values, each with its badge; the empty one has none
  expect(html.match(/data-proxy-badge="proxy"/g)?.length).toBe(2)
  expect(html).toContain("[14.3, 14.5]")
  expect(html).toContain("no value")
  // numeric headers align with their cells
  expect(html).toMatch(/<th[^>]*class="[^"]*tv-cell--number[^"]*"[^>]*>/)
})

test("sortableHeadersAreButtonsWithAriaSortNoneAndRowsKeepTheirOrderIndex", async () => {
  const els = await elementsOf(dataTable(ok))
  const sortable = els.filter(
    (e) => e.tag === "th" && e.attrs["aria-sort"] !== undefined,
  )
  expect(sortable.map((e) => e.attrs["aria-sort"])).toEqual(["none", "none"])
  expect(
    els
      .filter((e) => e.attrs.class === "tv-table__sort")
      .every((e) => e.tag === "button" && e.attrs.type === "button"),
  ).toBe(true)
  expect(
    els
      .filter((e) => e.tag === "tr" && e.attrs["data-row"] !== undefined)
      .map((e) => e.attrs["data-row"]),
  ).toEqual(["0", "1", "2"])
  // no sortable column, no sort buttons, no aria-sort
  const plain = dataTable({
    ...ok,
    columns: columns.map((c) => ({ ...c, sortable: false })),
  })
  expect(plain).not.toContain("aria-sort")
  expect(plain).not.toContain("tv-table__sort")
})

test("escapesEveryFieldF8", async () => {
  const html = dataTable({
    id: "t",
    caption: XSS,
    columns: [{ key: "a", label: XSS, unit: XSS, kind: "text" }],
    rows: [{ a: XSS }],
  })
  expect((await elementsOf(html)).some((e) => e.tag === "img")).toBe(false)
})

test("badInputIsABuildErrorF7", () => {
  expectBuildError(() => dataTable({ ...ok, id: "a b" }), "DataTable")
  expectBuildError(() => dataTable({ ...ok, caption: " " }), "DataTable")
  expectBuildError(() => dataTable({ ...ok, columns: [] }), "DataTable")
  expectBuildError(
    () =>
      dataTable({
        ...ok,
        columns: [
          columns[0] as (typeof columns)[0],
          columns[0] as (typeof columns)[0],
        ],
      }),
    "DataTable",
  )
  expectBuildError(
    () =>
      dataTable({
        ...ok,
        columns: [{ key: "x", label: "x", kind: "index" } as never],
      }),
    "DataTable",
  )
  expectBuildError(
    () =>
      dataTable({
        ...ok,
        columns: [{ key: "x", label: "x", kind: "bar" } as never],
      }),
    "DataTable",
  )
  expectBuildError(
    () => dataTable({ ...ok, rows: [{ name: 5, cool: 1, corr: 1 }] }),
    "DataTable",
  )
  expectBuildError(
    () => dataTable({ ...ok, rows: [{ name: "a", cool: "x", corr: 1 }] }),
    "DataTable",
  )
})

test("scriptIsValidAndCssIsTokenOnly", () => {
  expect(() => new Function(TABLE_SORT_SCRIPT)).not.toThrow()
  for (const k of [
    "aria-sort",
    "data-sort",
    "data-row",
    "ascending",
    "descending",
  ])
    expect(TABLE_SORT_SCRIPT).toContain(k)
  const css = ORGANISM_CSS.dataTable as string
  expectTokenOnly(css)
  expect(css).toContain("min-height:var(--tv-target-min)")
})

test("monoTextColumnsRenderMonoCells", () => {
  const html = dataTable({
    id: "t",
    caption: "c",
    columns: [{ key: "h", label: "Hash", kind: "text", mono: true }],
    rows: [{ h: "ab12" }],
  })
  expect(html).toContain("tv-cell--mono")
})
