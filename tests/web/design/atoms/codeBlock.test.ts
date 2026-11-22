import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SpandekError } from "../../../../src/core/errors"
import {
  CODE_VARIANTS,
  codeBlock,
} from "../../../../src/web/design/atoms/codeBlock"
import { ATOM_CSS } from "../../../../src/web/design/css"
import { repoRoot } from "../../../helpers"
import {
  elementsOf,
  literalsIn,
  TOKEN_NAMES,
  varNames,
  XSS,
} from "../../../support/designAtoms"

test("sheetEntryExistsBeforeTheCode", () => {
  const sheet = readFileSync(
    join(repoRoot, "docs/design/report-sheets.md"),
    "utf8",
  )
  const i = sheet.indexOf("### R3 CodeBlock")
  expect(i).toBeGreaterThan(sheet.indexOf("### R2 Chip"))
  for (const k of [
    "purpose:",
    "tokens:",
    "states",
    "contract:",
    "accessibility:",
    "do:",
  ])
    expect(sheet.slice(i)).toContain(k)
  for (const v of CODE_VARIANTS) expect(sheet).toContain(`\`${v}\``)
})

test("blockIsAFocusableNamedScrollRegion", async () => {
  const html = codeBlock({
    code: "sha256 0123abcd",
    label: "Run hash",
    variant: "block",
  })
  const els = await elementsOf(html)
  expect(els.map((e) => e.tag)).toEqual(["pre", "code"])
  expect(els[0]?.attrs.class).toBe("tv-code")
  expect(els[0]?.attrs.tabindex).toBe("0")
  expect(els[0]?.attrs.role).toBe("region")
  expect(els[0]?.attrs["aria-label"]).toBe("Run hash")
  expect(html).toContain("<code>sha256 0123abcd</code>")
})

test("blockDefaultsAndLabelDefault", async () => {
  const els = await elementsOf(codeBlock({ code: "x" }))
  expect(els[0]?.tag).toBe("pre")
  expect(els[0]?.attrs["aria-label"]).toBe("Code")
})

test("inlineIsACodeElementInASentence", async () => {
  const els = await elementsOf(codeBlock({ code: "run-1", variant: "inline" }))
  expect(els.map((e) => e.tag)).toEqual(["code"])
  expect(els[0]?.attrs.class).toBe("tv-code tv-code--inline")
  expect(els[0]?.attrs.tabindex).toBeUndefined()
})

test("codeBlockEscapesEverything_F8", async () => {
  for (const variant of CODE_VARIANTS) {
    const els = await elementsOf(codeBlock({ code: XSS, label: XSS, variant }))
    expect(els.some((e) => e.tag === "img")).toBe(false)
    expect(els.every((e) => e.attrs.onerror === undefined)).toBe(true)
  }
})

test("codeBlockUnknownVariantThrowsAtBuild_F7", () => {
  try {
    codeBlock({ code: "x", variant: "terminal" as never })
    throw new Error("must throw")
  } catch (e) {
    expect(e).toBeInstanceOf(SpandekError)
    expect((e as SpandekError).code).toBe(4)
    expect((e as SpandekError).key).toBe("CodeBlock")
  }
})

test("codeBlockCssIsTokenOnly", () => {
  const css = ATOM_CSS.codeBlock
  expect(literalsIn(css)).toEqual([])
  for (const n of varNames(css)) expect(TOKEN_NAMES.has(n), n).toBe(true)
  expect(css).toContain("font-family:var(--tv-font-mono)")
  expect(css).toContain("overflow-x:auto")
  expect(css).toContain("white-space:pre")
  expect(css).toMatch(/@media print\{\.tv-code\{[^}]*white-space:pre-wrap/)
  expect(css).not.toMatch(/outline:\s*(none|0)/)
})
