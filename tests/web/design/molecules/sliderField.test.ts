import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  SLIDER_SCRIPT,
  SLIDER_STATES,
  sliderField,
  snapToBounds,
} from "../../../../src/web/design/molecules/sliderField"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const ok = {
  id: "budget",
  label: "Budget",
  min: 0.2,
  max: 1,
  step: 0.01,
  value: 0.42,
  unit: "relative cost units (not IDR)",
  digits: 2,
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R12 SliderField", ["idle", "disabled", "error"])
})

test("rendersLabelledRangeNumberBoxAndOutput", async () => {
  expect([...SLIDER_STATES]).toEqual(["idle", "disabled", "error"])
  const html = sliderField({ ...ok, numberInput: true })
  const els = await elementsOf(html)
  const range = els.find((e) => e.attrs.type === "range")
  const num = els.find((e) => e.attrs.type === "number")
  expect(els.find((e) => e.tag === "label")?.attrs.for).toBe("budget")
  expect(range?.attrs.id).toBe("budget")
  expect(
    range && [
      range.attrs.min,
      range.attrs.max,
      range.attrs.step,
      range.attrs.value,
    ],
  ).toEqual(["0.2", "1", "0.01", "0.42"])
  expect(num?.attrs["aria-label"]).toBe("Budget (number)")
  expect(num?.attrs.value).toBe("0.42")
  expect(els.find((e) => e.tag === "output")?.attrs.for).toBe(
    "budget budget-num",
  )
  expect(html).toContain("relative cost units (not IDR)")
  expect(html).toContain(">0.42</output>")
  // no number box unless asked
  expect(
    (await elementsOf(sliderField(ok))).some((e) => e.attrs.type === "number"),
  ).toBe(false)
})

test("disabledAndErrorStatesExposeThemselves", async () => {
  const dis = await elementsOf(
    sliderField({ ...ok, numberInput: true, state: "disabled" }),
  )
  expect(
    dis
      .filter((e) => e.tag === "input")
      .every((e) => e.attrs.disabled !== undefined),
  ).toBe(true)
  const err = await elementsOf(
    sliderField({
      ...ok,
      state: "error",
      message: "Below the cheapest recipe",
    }),
  )
  const range = err.find((e) => e.attrs.type === "range")
  expect(range?.attrs["aria-invalid"]).toBe("true")
  expect(range?.attrs["aria-describedby"]).toContain("budget-msg")
  expect(err.find((e) => e.attrs.id === "budget-msg")?.tag).toBe("p")
  expectBuildError(() => sliderField({ ...ok, state: "error" }), "SliderField")
})

test("escapesF8AndRejectsBadInputF7", async () => {
  const els = await elementsOf(
    sliderField({ ...ok, label: XSS, unit: XSS, state: "error", message: XSS }),
  )
  expect(els.some((e) => e.tag === "img")).toBe(false)
  for (const bad of [
    { min: 1 },
    { step: 0 },
    { value: 2 },
    { value: -1 },
    { id: "a b" },
    { label: " " },
    { state: "x" as never },
    { digits: 9 },
    { max: Number.NaN },
  ])
    expectBuildError(() => sliderField({ ...ok, ...bad }), "SliderField")
})

test("scriptIsValidAndFiresSliderChange", () => {
  expect(() => new Function(SLIDER_SCRIPT)).not.toThrow()
  for (const k of ["slider-change", "data-slider", "clamp"])
    expect(SLIDER_SCRIPT).toContain(k)
})

test("cssIsTokenOnlyWith44pxControlsAndAccentFromAToken", () => {
  const css = MOLECULE_CSS.sliderField
  expectTokenOnly(css)
  expect(css).toContain("accent-color:var(--tv-link)")
  expect(css).toContain("min-height:var(--tv-target-min)")
})

test("snapToBoundsTakesTheRoundedBoundAndLeavesTheRest", () => {
  const max = 0.9254385964912281
  expect(snapToBounds(0.925438596491228, 0.3114, max)).toBe(max)
  expect(snapToBounds(0.3114 + 1e-12, 0.3114, max)).toBe(0.3114)
  expect(snapToBounds(0.5, 0.3114, max)).toBe(0.5)
  expect(snapToBounds(max - 1e-3, 0.3114, max)).toBe(max - 1e-3)
})
