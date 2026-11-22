import { expect, test } from "bun:test"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import { navRail } from "../../../../src/web/design/organisms/navRail"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const items = [
  { id: "verdict", label: "Verdict" },
  { id: "recipes", label: "Recipes" },
  { id: "limits", label: "Method and limits" },
]
const ok = {
  brand: "Spandek report",
  items,
  mainId: "main",
  current: "recipes",
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R14 NavRail", ["default", "current"])
})

test("skipLinkComesFirstThenANamedNavWithTheCurrentSection", async () => {
  const els = await elementsOf(navRail(ok))
  expect(els[0]?.tag).toBe("a")
  expect(els[0]?.attrs.class).toBe("tv-skip")
  expect(els[0]?.attrs.href).toBe("#main")
  const nav = els.find((e) => e.tag === "nav")
  expect(nav?.attrs["aria-label"]).toBe("Sections")
  const links = els.filter((e) => e.attrs.class === "tv-navlink")
  expect(links.map((e) => e.attrs.href)).toEqual([
    "#verdict",
    "#recipes",
    "#limits",
  ])
  expect(links.map((e) => e.attrs["aria-current"])).toEqual([
    undefined,
    "true",
    undefined,
  ])
  expect(
    navRail({ ...ok, current: undefined as never, label: "Contents" }),
  ).toContain('aria-label="Contents"')
})

test("noCurrentItemIsAllowed", async () => {
  const { current: _c, ...rest } = ok
  const els = await elementsOf(navRail(rest))
  expect(els.filter((e) => e.attrs["aria-current"]).length).toBe(0)
})

test("escapesF8AndRejectsBadInputF7", async () => {
  const els = await elementsOf(
    navRail({ brand: XSS, mainId: "main", items: [{ id: "a", label: XSS }] }),
  )
  expect(els.some((e) => e.tag === "img")).toBe(false)
  expectBuildError(() => navRail({ ...ok, current: "nope" }), "NavRail")
  expectBuildError(
    () => navRail({ brand: "b", mainId: "main", items: [] }),
    "NavRail",
  )
  expectBuildError(
    () =>
      navRail({
        ...ok,
        items: [items[0] as (typeof items)[0], items[0] as (typeof items)[0]],
      }),
    "NavRail",
  )
  expectBuildError(
    () => navRail({ ...ok, items: [{ id: "a b", label: "x" }] }),
    "NavRail",
  )
  expectBuildError(() => navRail({ ...ok, mainId: "#main" }), "NavRail")
})

test("cssSwitchesRailAndBarAtTheWideBreakpointAndIsTokenOnly", () => {
  const css = ORGANISM_CSS.navRail as string
  expectTokenOnly(css)
  expect(css).toContain("@media (min-width:64em)")
  expect(css).toContain(".tv-skip")
  expect(css).toMatch(/@media print\{[^]*display:none/)
})
