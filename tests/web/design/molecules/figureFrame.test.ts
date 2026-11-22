import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  FIGURE_SIZES,
  figureFrame,
} from "../../../../src/web/design/molecules/figureFrame"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R9 FigureFrame", ["short", "medium", "tall"])
})

test("messageIsTheFirstChildAndTheChartIsNamedByIt", async () => {
  expect([...FIGURE_SIZES]).toEqual(["short", "medium", "tall"])
  const html = figureFrame({
    message: "Aluminium primer runs 11 K hotter",
    size: "medium",
    note: "Shared axis",
  })("<div id=plot></div>")
  const els = await elementsOf(html)
  expect(els.map((e) => e.tag)).toEqual([
    "figure",
    "figcaption",
    "div",
    "div",
    "div",
    "p",
  ])
  expect(els[0]?.attrs["data-figure"]).toBe("")
  expect(els[0]?.attrs.class).toBe("tv-figure tv-figure--medium")
  expect(els[3]?.attrs.role).toBe("img")
  expect(els[3]?.attrs["aria-label"]).toBe("Aluminium primer runs 11 K hotter")
  expect(html.indexOf("<figcaption")).toBeLessThan(
    html.indexOf("<div id=plot>"),
  )
  expect(html).toContain(">Shared axis<")
})

test("interactiveFiguresAreGroupsAndDescribeExtendsTheName", async () => {
  const els = await elementsOf(
    figureFrame({
      message: "m",
      size: "tall",
      interactive: true,
      describe: "5 sites",
    })(""),
  )
  expect(els[3]?.attrs.role).toBe("group")
  expect(els[3]?.attrs["aria-label"]).toBe("m. 5 sites")
})

test("escapesF8AndRejectsBadInputF7", async () => {
  const els = await elementsOf(
    figureFrame({ message: XSS, size: "short", note: XSS, describe: XSS })(""),
  )
  expect(els.some((e) => e.tag === "img")).toBe(false)
  expectBuildError(
    () => figureFrame({ message: "m", size: "huge" as never }),
    "FigureFrame",
  )
  expectBuildError(
    () => figureFrame({ message: " ", size: "short" }),
    "FigureFrame",
  )
})

test("cssIsTokenOnlyAndReservesHeight", () => {
  const css = MOLECULE_CSS.figureFrame
  expectTokenOnly(css)
  for (const n of ["short", "medium", "tall"])
    expect(css).toContain(`.tv-figure--${n}`)
  expect(css).toContain("min-height")
})
