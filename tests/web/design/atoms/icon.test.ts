import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SpandekError } from "../../../../src/core/errors"
import { button } from "../../../../src/web/design/atoms/button"
import { ICON_NAMES, icon } from "../../../../src/web/design/atoms/icon"
import { ATOM_CSS } from "../../../../src/web/design/css"
import { repoRoot } from "../../../helpers"
import {
  elementsOf,
  literalsIn,
  TOKEN_NAMES,
  varNames,
  vendorClasses,
  vendorTokens,
} from "../../../support/designAtoms"

test("iconSetIsExactlyTheVendoredSet", () => {
  const svgs = readdirSvg()
  expect([...ICON_NAMES].sort() as string[]).toEqual(svgs.sort())
  expect(ICON_NAMES.length).toBe(9)
})
const readdirSvg = () =>
  readFileSync(join(repoRoot, "vendor/torviello-design/brand/icons.ts"), "utf8")
    .split("\n")
    .map((l) => /^\s+"([a-z-]+)": '/.exec(l)?.[1])
    .filter((x): x is string => x !== undefined)

test("everyIconIsADecorativeSvgInASpan", async () => {
  for (const name of ICON_NAMES) {
    const html = icon({ name })
    const els = await elementsOf(html)
    expect(els[0]?.tag).toBe("span")
    expect(els[0]?.attrs.class).toBe("tv-icon")
    expect(els[0]?.attrs["aria-hidden"]).toBe("true")
    expect(els[1]?.tag).toBe("svg")
    expect(els[1]?.attrs.focusable).toBe("false")
    expect(els[1]?.attrs.viewbox).toBe("0 0 24 24")
    // the glyph takes its colour from the consumer, never a literal
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb/)
    expect(html).not.toContain("<script")
    expect(html).not.toContain("<title")
  }
})

test("iconUnknownNameThrowsAtBuild_F7", () => {
  for (const bad of ["nope", "", "__proto__", "constructor", "toString"]) {
    try {
      icon({ name: bad as never })
      throw new Error("must throw")
    } catch (e) {
      expect(e).toBeInstanceOf(SpandekError)
      expect((e as SpandekError).code).toBe(4)
      expect((e as SpandekError).key).toBe("Icon")
    }
  }
})

test("iconCssIsTokenOnlyAndMirrorsTheVendorAtom", () => {
  const css = ATOM_CSS.icon
  expect(literalsIn(css)).toEqual([])
  for (const n of varNames(css)) expect(TOKEN_NAMES.has(n), n).toBe(true)
  for (const c of vendorClasses("Icon")) expect(css, c).toContain(`.${c}`)
  expect(css).toContain("width:var(--tv-icon-size)")
  expect(vendorTokens("Icon").size).toBe(0)
})

test("buttonPairsAnIconWithTheLabelAndStaysDecorative", async () => {
  const html = button({ label: "Next", icon: "arrow-right" })
  const els = await elementsOf(html)
  expect(els.map((e) => e.tag).slice(0, 3)).toEqual(["button", "span", "svg"])
  expect(els[1]?.attrs["aria-hidden"]).toBe("true")
  expect(html.indexOf("tv-icon")).toBeLessThan(html.indexOf("Next"))
  const link = button({ label: "Docs", href: "#d", icon: "book-open" })
  expect(link).toContain('class="tv-icon"')
  expect(() => button({ label: "x", icon: "nope" as never })).toThrow(
    SpandekError,
  )
  // the nudge toward the label's direction exists and is suppressed under reduced motion (house rule 8)
  expect(ATOM_CSS.button).toContain(".tv-button:hover .tv-icon")
  expect(ATOM_CSS.button).toMatch(
    /prefers-reduced-motion:reduce\)\{[^@]*\.tv-button:hover \.tv-icon[^@]*transform:none/,
  )
})
