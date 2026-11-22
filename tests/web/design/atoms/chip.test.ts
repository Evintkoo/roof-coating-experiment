import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SpandekError } from "../../../../src/core/errors"
import { CHIP_STATES, chip } from "../../../../src/web/design/atoms/chip"
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
  const i = sheet.indexOf("### R2 Chip")
  expect(i).toBeGreaterThan(sheet.indexOf("### R1 Badge"))
  for (const k of [
    "purpose:",
    "tokens:",
    "states",
    "contract:",
    "accessibility:",
    "do:",
  ])
    expect(sheet.slice(i)).toContain(k)
  for (const s of CHIP_STATES) expect(sheet).toContain(`\`${s}\``)
})

test("chipRendersEveryState", async () => {
  expect([...CHIP_STATES]).toEqual(["static", "off", "on"])
  const s = await elementsOf(chip({ label: "Jakarta", state: "static" }))
  expect(s.map((e) => e.tag)).toEqual(["span"])
  expect(s[0]?.attrs.class).toBe("tv-chip")
  expect(s[0]?.attrs["aria-pressed"]).toBeUndefined()
  for (const [state, pressed] of [
    ["off", "false"],
    ["on", "true"],
  ] as const) {
    const html = chip({ label: "Jakarta", state, value: "jkt" })
    const els = await elementsOf(html)
    expect(els.map((e) => e.tag)).toEqual(["button"])
    expect(els[0]?.attrs.type).toBe("button")
    expect(els[0]?.attrs["aria-pressed"]).toBe(pressed)
    expect(els[0]?.attrs["data-value"]).toBe("jkt")
    expect(els[0]?.attrs.class).toBe("tv-chip tv-chip--toggle")
    expect(html).toContain(">Jakarta</button>")
  }
})

test("chipDefaultsToStatic", async () => {
  expect((await elementsOf(chip({ label: "x" })))[0]?.tag).toBe("span")
})

test("chipEscapesLabelAndValue_F8", async () => {
  for (const state of CHIP_STATES) {
    const els = await elementsOf(chip({ label: XSS, state, value: XSS }))
    expect(els.length).toBe(1)
    expect(els[0]?.attrs.onerror).toBeUndefined()
  }
})

test("chipNeedsALabelAndAKnownState_F7", () => {
  for (const bad of [
    { label: "x", state: "pressed" },
    { label: "", state: "off" },
  ]) {
    try {
      chip(bad as never)
      throw new Error("must throw")
    } catch (e) {
      expect(e).toBeInstanceOf(SpandekError)
      expect((e as SpandekError).code).toBe(4)
      expect((e as SpandekError).key).toBe("Chip")
    }
  }
})

test("chipCssIsTokenOnlyAndToggleIsA44pxTarget", () => {
  const css = ATOM_CSS.chip
  expect(literalsIn(css)).toEqual([])
  for (const n of varNames(css)) expect(TOKEN_NAMES.has(n), n).toBe(true)
  expect(css).toMatch(
    /\.tv-chip--toggle\{[^}]*min-height:var\(--tv-target-min\)/,
  )
  expect(css).toMatch(
    /\.tv-chip--toggle\{[^}]*min-width:var\(--tv-target-min\)/,
  )
  expect(css).toContain('.tv-chip[aria-pressed="true"]')
  expect(css).toContain(".tv-chip--toggle:hover")
  expect(css).not.toMatch(/outline:\s*(none|0)/)
  expect(css).toMatch(
    /prefers-reduced-motion:reduce\)\{\.tv-chip--toggle\{transition:none/,
  )
  expect(css).toMatch(/@media print\{\.tv-chip\{/)
})
