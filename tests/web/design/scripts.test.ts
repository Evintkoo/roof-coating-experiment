import { expect, test } from "bun:test"
import { DISCLOSURE_SCRIPT } from "../../../src/web/design/molecules/disclosure"
import { SLIDER_SCRIPT } from "../../../src/web/design/molecules/sliderField"
import { TABS_SCRIPT } from "../../../src/web/design/molecules/tabs"
import { TABLE_SORT_SCRIPT } from "../../../src/web/design/organisms/dataTable"
import { COMPONENT_SCRIPT } from "../../../src/web/design/scripts"

test("bundleHoldsEveryScriptOnceAndIsValidJavaScript", () => {
  for (const s of [
    TABLE_SORT_SCRIPT,
    TABS_SCRIPT,
    SLIDER_SCRIPT,
    DISCLOSURE_SCRIPT,
  ])
    expect(COMPONENT_SCRIPT.split(s).length - 1).toBe(1)
  expect(() => new Function(COMPONENT_SCRIPT)).not.toThrow()
})

test("bundleHasNoNetworkAccessAndNoEval", () => {
  for (const bad of [
    "fetch(",
    "XMLHttpRequest",
    "eval(",
    "http:",
    "https:",
    "import(",
  ])
    expect(COMPONENT_SCRIPT).not.toContain(bad)
})
