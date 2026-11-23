import { expect, test } from "bun:test"
import { scrubber } from "../../../../src/web/design/atoms/scrubber"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R25 Scrubber", [])
})

test("isANativeRangeFromZeroTo24WithALabel", async () => {
  const [el, ...rest] = await elementsOf(scrubber({ value: 6.5 }))
  expect(rest).toEqual([])
  expect(el?.tag).toBe("input")
  expect(el?.attrs).toMatchObject({
    type: "range",
    min: "0",
    max: "24",
    value: "6.5",
    "data-anim": "scrub",
    "aria-label": "Time of day in hours",
  })
})

test("outOfRangeNonFiniteAndBadStepAreBuildErrorsF11", () => {
  for (const value of [-0.1, 24.1, Number.NaN, Number.POSITIVE_INFINITY])
    expectBuildError(() => scrubber({ value }), "Scrubber")
  expectBuildError(() => scrubber({ value: 1, step: 0 }), "Scrubber")
  expectBuildError(() => scrubber({ value: 1, label: " " }), "Scrubber")
})

test("aLabelWithMarkupIsEscapedF10", async () => {
  const html = scrubber({ value: 1, label: XSS })
  const els = await elementsOf(html)
  expect(els.length).toBe(1)
  expect(html).not.toContain("<img")
})
