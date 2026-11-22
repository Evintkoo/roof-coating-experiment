import { expect, test } from "bun:test"
import { SpandekError } from "../../../../src/core/errors"
import {
  NAVLINK_STATES,
  navLink,
} from "../../../../src/web/design/atoms/navLink"
import { ATOM_CSS } from "../../../../src/web/design/css"
import {
  elementsOf,
  literalsIn,
  TOKEN_NAMES,
  varNames,
  vendorClasses,
  vendorTokens,
  XSS,
} from "../../../support/designAtoms"

test("navLinkRendersEveryStateAsAnAnchor", async () => {
  for (const state of NAVLINK_STATES) {
    const html = navLink({ label: "Verdict", href: "#verdict", state })
    const els = await elementsOf(html)
    expect(els.map((e) => e.tag)).toEqual(["a"])
    expect(els[0]?.attrs.class).toBe("tv-navlink")
    expect(els[0]?.attrs.href).toBe("#verdict")
    // current section is conveyed by aria-current (sheet A3), never by styling alone
    expect(els[0]?.attrs["aria-current"]).toBe(
      state === "current" ? "true" : undefined,
    )
    expect(html).toContain(">Verdict</a>")
  }
})

test("navLinkDefaultsToDefaultAndOwnsExternalAttributes", async () => {
  const d = (await elementsOf(navLink({ label: "A", href: "#a" })))[0]
  expect(d?.attrs["aria-current"]).toBeUndefined()
  const e = (
    await elementsOf(
      navLink({ label: "A", href: "https://example.org", external: true }),
    )
  )[0]
  expect(e?.attrs.target).toBe("_blank")
  expect(e?.attrs.rel).toBe("noopener noreferrer")
})

test("navLinkEscapesAndRefusesUnsafeHrefs_F8", async () => {
  const els = await elementsOf(navLink({ label: XSS, href: "#x" }))
  expect(els.map((e) => e.tag)).toEqual(["a"])
  expect(() => navLink({ label: "x", href: "javascript:alert(1)" })).toThrow(
    SpandekError,
  )
})

test("navLinkUnknownStateThrowsAtBuild_F7", () => {
  expect(() =>
    navLink({ label: "x", href: "#x", state: "active" as never }),
  ).toThrow(SpandekError)
  try {
    navLink({ label: "x", href: "#x", state: "" as never })
  } catch (e) {
    expect((e as SpandekError).code).toBe(4)
    expect((e as SpandekError).key).toBe("NavLink")
  }
})

test("navLinkCssIsTokenOnlyMirrorsVendorAndIsA44pxTarget", () => {
  const css = ATOM_CSS.navLink
  expect(literalsIn(css)).toEqual([])
  for (const n of varNames(css)) expect(TOKEN_NAMES.has(n), n).toBe(true)
  for (const c of vendorClasses("NavLink")) expect(css, c).toContain(`.${c}`)
  for (const tok of vendorTokens("NavLink"))
    expect(varNames(css).has(tok), tok).toBe(true)
  expect(css).toContain("min-height:var(--tv-target-min)")
  expect(css).toContain("min-width:var(--tv-target-min)")
  expect(css).toContain('.tv-navlink[aria-current="true"]')
  // hover and current share the orange underline; the focus ring is the global one and is never removed
  expect(css).toContain("text-decoration-color:var(--tv-action-primary)")
  expect(css).not.toMatch(/outline:\s*(none|0)/)
})
