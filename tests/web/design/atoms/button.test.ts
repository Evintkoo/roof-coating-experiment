import { expect, test } from "bun:test"
import { SpandekError } from "../../../../src/core/errors"
import {
  BUTTON_STATES,
  BUTTON_VARIANTS,
  button,
} from "../../../../src/web/design/atoms/button"
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

test("buttonRendersEveryVariantAndStateAsARealButton", async () => {
  for (const variant of BUTTON_VARIANTS)
    for (const state of BUTTON_STATES) {
      const html = button({ label: "Run", variant, state })
      const [el, ...rest] = await elementsOf(html)
      expect(rest).toEqual([])
      expect(el?.tag).toBe("button")
      expect(el?.attrs.type).toBe("button")
      expect(el?.attrs.class).toBe(`tv-button tv-button--${variant}`)
      expect(el?.attrs["data-state"]).toBe(state)
      const loading = state === "loading"
      expect(el?.attrs["aria-busy"]).toBe(String(loading))
      expect(el?.attrs["aria-disabled"]).toBe(String(loading))
      expect(html).toContain(">Run</button>")
    }
})

test("buttonDefaultsToPrimaryIdle", () => {
  expect(button({ label: "Go" })).toContain("tv-button--primary")
  expect(button({ label: "Go" })).toContain('data-state="idle"')
})

test("buttonWithHrefIsAnAnchorAndOwnsExternalAttributes", async () => {
  const internal = (
    await elementsOf(button({ label: "Limits", href: "#limits" }))
  )[0]
  expect(internal?.tag).toBe("a")
  expect(internal?.attrs.href).toBe("#limits")
  expect(internal?.attrs.target).toBeUndefined()
  const ext = (
    await elementsOf(
      button({
        label: "Docs",
        href: "https://example.org",
        external: true,
        variant: "ghost",
      }),
    )
  )[0]
  expect(ext?.attrs.target).toBe("_blank")
  expect(ext?.attrs.rel).toBe("noopener noreferrer")
  expect(ext?.attrs.type).toBeUndefined()
})

test("buttonEscapesLabelAndHref_F8", async () => {
  const els = await elementsOf(button({ label: XSS }))
  expect(els.map((e) => e.tag)).toEqual(["button"])
  const link = await elementsOf(
    button({ label: XSS, href: `#a"onmouseover="x` }),
  )
  expect(link.map((e) => e.tag)).toEqual(["a"])
  expect(link[0]?.attrs.onmouseover).toBeUndefined()
  expect(() => button({ label: "x", href: "javascript:alert(1)" })).toThrow(
    SpandekError,
  )
})

test("buttonUnknownVariantOrStateThrowsAtBuild_F7", () => {
  for (const bad of [
    { variant: "danger" },
    { state: "hover" },
    { variant: "" },
  ]) {
    try {
      button({ label: "x", ...(bad as object) })
      throw new Error("must throw")
    } catch (e) {
      expect(e).toBeInstanceOf(SpandekError)
      expect((e as SpandekError).code).toBe(4)
      expect((e as SpandekError).key).toBe("Button")
    }
  }
})

test("buttonCssIsTokenOnlyAndMirrorsTheVendorAtom", () => {
  const css = ATOM_CSS.button
  expect(literalsIn(css)).toEqual([])
  for (const n of varNames(css)) expect(TOKEN_NAMES.has(n), n).toBe(true)
  // one to one with Button.svelte: every vendor class and every vendor token is styled here too
  for (const c of vendorClasses("Button"))
    if (c !== "tv-icon") expect(css, c).toContain(`.${c}`)
  for (const tok of vendorTokens("Button"))
    expect(varNames(css).has(tok), tok).toBe(true)
})

test("buttonA11yContract", () => {
  const css = ATOM_CSS.button
  // 44 px target through the token, not a literal
  expect(css).toContain("min-height:var(--tv-target-min)")
  expect(css).toContain("min-width:var(--tv-target-min)")
  // labels never wrap
  expect(css).toContain("white-space:nowrap")
  // the focus ring is global (base) and never switched off here
  expect(ATOM_CSS.base).toMatch(
    /:focus-visible\{outline:var\(--tv-ring-width\) solid var\(--tv-focus-ring\)/,
  )
  expect(css).not.toMatch(/outline:\s*(none|0)/)
  // loading looks disabled; pressed feedback exists
  expect(css).toContain('.tv-button[aria-disabled="true"]')
  expect(css).toContain(".tv-button:active")
})

test("buttonPrintRule", () => {
  expect(ATOM_CSS.button).toMatch(
    /@media print\{\.tv-button\{background:none;box-shadow:none/,
  )
})
