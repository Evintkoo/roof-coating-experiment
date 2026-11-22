import { expect, test } from "bun:test"
import fc from "fast-check"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  CELL_STATES,
  cellBin,
  cellClass,
  cellGrid,
  GRID_BINS,
} from "../../../../src/web/design/molecules/cellGrid"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R32 CellGrid", CELL_STATES)
})

test("has864EmptyCellsIndexedRowMajor", async () => {
  const els = await elementsOf(cellGrid({ candidates: 96, scenarios: 9 }))
  const cells = els.filter((e) => e.attrs["data-cell"] !== undefined)
  expect(cells.length).toBe(864)
  expect(cells.every((c) => c.attrs.class === "tv-cell tv-cell--empty")).toBe(
    true,
  )
  expect(cells.map((c) => Number(c.attrs["data-cell"]))).toEqual(
    Array.from({ length: 864 }, (_, i) => i),
  )
  expect(cells[10]?.attrs.x).toBe(String(1 * 10)) // candidate 1, scenario 1
  expect(els[0]?.attrs["data-source"]).toBe("screening:t_max")
})

test("binIsMonotoneInRangeAndHitsBothEnds", () => {
  expect(cellBin(0, 0, 1)).toBe(0)
  expect(cellBin(1, 0, 1)).toBe(GRID_BINS - 1)
  expect(cellBin(Number.NaN, 0, 1)).toBe(0)
  expect(cellBin(5, 1, 1)).toBe(0)
  fc.assert(
    fc.property(
      fc.double({ min: -10, max: 10, noNaN: true }),
      fc.double({ min: -10, max: 10, noNaN: true }),
      (a, b) => {
        const [x, y] = a <= b ? [a, b] : [b, a]
        const ba = cellBin(x, -10, 10)
        const bb = cellBin(y, -10, 10)
        return ba >= 0 && bb < GRID_BINS && ba <= bb
      },
    ),
  )
})

test("unknownStateOrSizeIsABuildErrorF9", () => {
  expectBuildError(() => cellClass("half" as never), "CellGrid")
  expectBuildError(() => cellGrid({ candidates: 0, scenarios: 9 }), "CellGrid")
  expectBuildError(
    () => cellGrid({ candidates: 1.5, scenarios: 9 }),
    "CellGrid",
  )
})

test("cssIsTokenOnlyAndEveryBinHasAFill", () => {
  expectTokenOnly(MOLECULE_CSS.cellGrid)
  for (let b = 0; b < GRID_BINS; b++)
    expect(MOLECULE_CSS.cellGrid).toContain(`.tv-cell--b${b}{`)
})
