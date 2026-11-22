import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import { TABS_SCRIPT, tabs } from "../../../../src/web/design/molecules/tabs"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const T = [
  { id: "initial", label: "Initial" },
  { id: "aged", label: "Aged (scenario)" },
]

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R11 Tabs", ["selected", "unselected"])
})

test("rendersTheAriaTabsPatternWithOneSelectedTab", async () => {
  const html = tabs({ id: "state", label: "Ageing state", tabs: T })([
    "<p>a</p>",
    "<p>b</p>",
  ])
  const els = await elementsOf(html)
  const tabEls = els.filter((e) => e.attrs.role === "tab")
  const panels = els.filter((e) => e.attrs.role === "tabpanel")
  expect(els.find((e) => e.attrs.role === "tablist")?.attrs["aria-label"]).toBe(
    "Ageing state",
  )
  expect(tabEls.map((e) => e.attrs["aria-selected"])).toEqual(["true", "false"])
  expect(tabEls.map((e) => e.attrs.tabindex)).toEqual(["0", "-1"])
  expect(tabEls[0]?.attrs["aria-controls"]).toBe("state-panel-initial")
  expect(panels[0]?.attrs["aria-labelledby"]).toBe("state-tab-initial")
  expect(panels.map((e) => e.attrs.hidden)).toEqual([undefined, ""])
  expect(panels.every((e) => e.attrs.tabindex === "0")).toBe(true)
  const second = await elementsOf(
    tabs({ id: "s", label: "l", tabs: T, selected: "aged" })(["a", "b"]),
  )
  expect(
    second
      .filter((e) => e.attrs.role === "tab")
      .map((e) => e.attrs["aria-selected"]),
  ).toEqual(["false", "true"])
})

test("escapesLabelsF8AndRejectsBadInputF7", async () => {
  const els = await elementsOf(
    tabs({
      id: "s",
      label: XSS,
      tabs: [
        { id: "a", label: XSS },
        { id: "b", label: "b" },
      ],
    })(["x", "y"]),
  )
  expect(els.some((e) => e.tag === "img")).toBe(false)
  const ok = { id: "s", label: "l", tabs: T }
  expectBuildError(() => tabs({ ...ok, tabs: [T[0] as (typeof T)[0]] }), "Tabs")
  expectBuildError(
    () => tabs({ ...ok, tabs: [T[0] as (typeof T)[0], T[0] as (typeof T)[0]] }),
    "Tabs",
  )
  expectBuildError(() => tabs({ ...ok, selected: "nope" }), "Tabs")
  expectBuildError(() => tabs({ ...ok, id: "a b" }), "Tabs")
  expectBuildError(
    () =>
      tabs({
        ...ok,
        tabs: [
          { id: "a b", label: "x" },
          { id: "b", label: "y" },
        ],
      }),
    "Tabs",
  )
  expectBuildError(() => tabs(ok)(["only one"]), "Tabs")
})

test("scriptIsValidAndHandlesTheKeys", () => {
  expect(() => new Function(TABS_SCRIPT)).not.toThrow()
  for (const k of [
    "ArrowRight",
    "ArrowLeft",
    "Home",
    "End",
    "tabs-change",
    "aria-selected",
  ])
    expect(TABS_SCRIPT).toContain(k)
})

test("cssIsTokenOnlyWith44pxTabsAndPrintShowsEveryPanel", () => {
  const css = MOLECULE_CSS.tabs
  expectTokenOnly(css)
  expect(css).toContain("min-height:var(--tv-target-min)")
  expect(css).toMatch(
    /@media print\{[\s\S]*\.tv-tabs__panel\[hidden\]\{display:block/,
  )
})
