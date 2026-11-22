import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  LEGEND_SHAPES,
  LEGEND_SWATCHES,
  legend,
} from "../../../../src/web/design/molecules/legend"
import { TOKEN_NAMES } from "../../../support/designAtoms"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R10 Legend", [...LEGEND_SWATCHES, ...LEGEND_SHAPES])
})

test("listsEntriesWithSwatchShapeAndTextAndEverySwatchIsAToken", async () => {
  const html = legend({
    title: "Recipes",
    items: [
      { label: "SP-075", swatch: "recommended", shape: "line" },
      { label: "Bare aluminium", swatch: "baseline", shape: "dash" },
      { label: "SP-031", swatch: "series-1", shape: "dot" },
    ],
  })
  const els = await elementsOf(html)
  expect(els.map((e) => e.tag)).toEqual([
    "ul",
    "li",
    "span",
    "li",
    "span",
    "li",
    "span",
  ])
  expect(els[0]?.attrs["aria-label"]).toBe("Recipes")
  expect(els[2]?.attrs["aria-hidden"]).toBe("true")
  expect(html).toContain("--swatch:var(--tv-viz-recommended)")
  expect(html).toContain("tv-legend__swatch--dash")
  for (const sw of LEGEND_SWATCHES) {
    const token =
      sw === "recommended"
        ? "viz-recommended"
        : sw === "baseline"
          ? "viz-baseline"
          : sw.replace("series-", "viz-")
    expect(TOKEN_NAMES.has(token), token).toBe(true)
  }
})

test("escapesF8AndRejectsBadInputF7", async () => {
  const els = await elementsOf(
    legend({
      title: XSS,
      items: [{ label: XSS, swatch: "series-2", shape: "band" }],
    }),
  )
  expect(els.some((e) => e.tag === "img")).toBe(false)
  const one = {
    label: "a",
    swatch: "series-1" as const,
    shape: "line" as const,
  }
  expectBuildError(() => legend({ title: "t", items: [] }), "Legend")
  expectBuildError(() => legend({ title: "t", items: [one, one] }), "Legend")
  expectBuildError(
    () =>
      legend({ title: "t", items: [{ ...one, swatch: "series-9" as never }] }),
    "Legend",
  )
  expectBuildError(
    () => legend({ title: "t", items: [{ ...one, shape: "star" as never }] }),
    "Legend",
  )
})

test("cssIsTokenOnlyWithEveryShapeAndPrintKeepsShapes", () => {
  expectTokenOnly(MOLECULE_CSS.legend)
  for (const s of LEGEND_SHAPES)
    expect(MOLECULE_CSS.legend).toContain(`.tv-legend__swatch--${s}`)
})
