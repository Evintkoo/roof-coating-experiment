import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  COMPUTING_STATES,
  computingIndicator,
} from "../../../../src/web/design/molecules/computingIndicator"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R30 ComputingIndicator", COMPUTING_STATES)
})

test("isAPoliteLiveRegionWithWordsForBothStates", async () => {
  for (const state of COMPUTING_STATES) {
    const html = computingIndicator({ state })
    const [el] = await elementsOf(html)
    expect(el?.attrs).toMatchObject({
      role: "status",
      "aria-live": "polite",
      "data-state": state,
    })
    expect(html).toContain(
      state === "busy" ? "Computing in your browser" : "Idle",
    )
  }
})

test("anUnknownStateIsABuildErrorF9", () => {
  expectBuildError(
    () => computingIndicator({ state: "spinning" as never }),
    "ComputingIndicator",
  )
})

test("cssMovesOnlyWhileBusyAndNotUnderReducedMotion", () => {
  expectTokenOnly(MOLECULE_CSS.computingIndicator)
  const css = MOLECULE_CSS.computingIndicator
  expect(css).toContain('[data-state="busy"]')
  expect(css).toMatch(/prefers-reduced-motion:reduce\)\{[^}]*animation:none/)
  expect(css).toContain("var(--tv-motion-base)")
})
