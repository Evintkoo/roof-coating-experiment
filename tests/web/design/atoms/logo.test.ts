import { expect, test } from "bun:test"
import { SpandekError } from "../../../../src/core/errors"
import { LOGO_LABEL, logo } from "../../../../src/web/design/atoms/logo"
import { ATOM_CSS } from "../../../../src/web/design/css"
import { esc } from "../../../../src/web/design/html"
import {
  elementsOf,
  literalsIn,
  TOKEN_NAMES,
  varNames,
  vendorClasses,
  vendorTokens,
  XSS,
} from "../../../support/designAtoms"

test("logoIsOneHomeLinkWithADecorativeMarkAndTheWordmark", async () => {
  const html = logo({})
  const els = await elementsOf(html)
  expect(els[0]?.tag).toBe("a")
  expect(els[0]?.attrs.class).toBe("tv-logo")
  expect(els[0]?.attrs.href).toBe("#top")
  expect(els[0]?.attrs["aria-label"]).toBe(LOGO_LABEL)
  expect(LOGO_LABEL).toBe("Torviello home")
  const mark = els.find((e) => e.attrs.class === "tv-logo__mark")
  expect(mark?.tag).toBe("span")
  expect(mark?.attrs["aria-hidden"]).toBe("true")
  expect(els.some((e) => e.tag === "svg")).toBe(true)
  expect(html).toContain('<span class="tv-logo__wordmark">torviello</span>')
  // exactly one anchor: the lockup is a single target
  expect(els.filter((e) => e.tag === "a").length).toBe(1)
})

test("logoMarkComesFromTheVendoredBrandAssetWithoutItsComment", () => {
  const html = logo({})
  expect(html).not.toContain("<!--")
  expect(html).toContain('id="tv-mark-bar"')
  expect(html).toContain('id="tv-mark-leg"')
})

test("logoAcceptsAHrefAndALabelAndEscapesThem_F8", async () => {
  const els = await elementsOf(logo({ href: "#overview", label: XSS }))
  expect(els.filter((e) => e.tag === "img").length).toBe(0)
  expect(els[0]?.attrs.href).toBe("#overview")
  // HTMLRewriter reports attribute text as written: it is the escaped form
  expect(els[0]?.attrs["aria-label"]).toBe(esc(XSS))
  expect(() => logo({ href: "javascript:alert(1)" })).toThrow(SpandekError)
})

test("logoCssIsTokenOnlyAndMirrorsTheVendorAtom", () => {
  const css = ATOM_CSS.logo
  expect(literalsIn(css)).toEqual([])
  for (const n of varNames(css)) expect(TOKEN_NAMES.has(n), n).toBe(true)
  for (const c of vendorClasses("Logo")) expect(css, c).toContain(`.${c}`)
  for (const tok of vendorTokens("Logo"))
    expect(varNames(css).has(tok), tok).toBe(true)
  // the lockup is a 44 px target
  expect(css).toContain("min-height:var(--tv-target-min)")
  // the mark is never recoloured per section: no colour rule touches it
  expect(css).not.toMatch(/\.tv-logo__mark[^{]*\{[^}]*(color|fill|stroke)/)
})
