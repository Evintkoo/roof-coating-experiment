import { expect, test } from "bun:test"
import { SpandekError } from "../../../../src/core/errors"
import {
  SECTION_LABEL_VARIANTS,
  sectionLabel,
} from "../../../../src/web/design/atoms/sectionLabel"
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

test("sectionLabelRendersEveryVariantAsAParagraph", async () => {
  for (const variant of SECTION_LABEL_VARIANTS) {
    const html = sectionLabel({ label: "Why it works", variant })
    const els = await elementsOf(html)
    expect(els.map((e) => e.tag)).toEqual(["p"])
    const cls = els[0]?.attrs.class ?? ""
    expect(cls.split(" ")).toContain("tv-section-label")
    expect(cls.includes("tv-section-label--accent")).toBe(variant === "accent")
    // casing is decorative: the text stays sentence case in the markup (sheet A4)
    expect(html).toContain(">Why it works</p>")
  }
})

test("sectionLabelIdIsOptionalAndEscaped_F8", async () => {
  expect(sectionLabel({ label: "x" })).not.toContain("id=")
  const els = await elementsOf(sectionLabel({ label: XSS, id: 'a"b' }))
  expect(els.map((e) => e.tag)).toEqual(["p"])
  expect(els[0]?.attrs.id).toBe("a&quot;b")
})

test("sectionLabelUnknownVariantThrowsAtBuild_F7", () => {
  try {
    sectionLabel({ label: "x", variant: "loud" as never })
    throw new Error("must throw")
  } catch (e) {
    expect(e).toBeInstanceOf(SpandekError)
    expect((e as SpandekError).code).toBe(4)
    expect((e as SpandekError).key).toBe("SectionLabel")
  }
})

test("sectionLabelCssIsTokenOnlyAndMirrorsTheVendorAtom", () => {
  const css = ATOM_CSS.sectionLabel
  expect(literalsIn(css)).toEqual([])
  for (const n of varNames(css)) expect(TOKEN_NAMES.has(n), n).toBe(true)
  for (const c of vendorClasses("SectionLabel"))
    expect(css, c).toContain(`.${c}`)
  // one documented substitution: the accent ink is `link` where the vendor uses `action-primary` (see the next test)
  for (const tok of vendorTokens("SectionLabel"))
    expect(
      varNames(css).has(tok === "action-primary" ? "link" : tok),
      tok,
    ).toBe(true)
  expect(css).toContain("letter-spacing:0.2em")
  expect(css).toContain("text-transform:uppercase")
})

test("sectionLabelAccentIsALinkInkSoItPassesContrastInBothThemes", () => {
  // the vendor accent is the brand orange (fill colour); as text on light surfaces the contract-tested `link` ink is used
  expect(ATOM_CSS.sectionLabel).toContain(
    ".tv-section-label--accent{color:var(--tv-link)",
  )
})
