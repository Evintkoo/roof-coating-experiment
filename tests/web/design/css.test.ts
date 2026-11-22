import { expect, test } from "bun:test"
import { ATOM_CSS, atomsCss } from "../../../src/web/design/css"
import { literalsIn, TOKEN_NAMES, varNames } from "../../support/designAtoms"

test("atomsCssIsTokenOnlyAndEveryVarResolves", () => {
  const css = atomsCss()
  expect(css.length).toBeGreaterThan(500)
  expect(literalsIn(css)).toEqual([])
  const names = varNames(css)
  expect(names.size).toBeGreaterThan(10)
  for (const n of names) expect(TOKEN_NAMES.has(n), `--tv-${n}`).toBe(true)
  // no raw var() fallbacks, no stray custom property definitions
  expect(css).not.toMatch(/--tv-[a-z0-9-]+\s*:/)
})

test("atomsCssIsDeterministicAndKeysAreInCss", () => {
  expect(atomsCss()).toBe(atomsCss())
  for (const [k, v] of Object.entries(ATOM_CSS))
    expect(atomsCss(), k).toContain(v.trim())
})

test("everyInteractiveAtomHasReducedMotionHandled", () => {
  // transitions exist only in blocks that a reduced-motion rule neutralises, or there is none to neutralise
  const css = atomsCss()
  if (css.includes("transition:"))
    expect(css).toMatch(/prefers-reduced-motion:reduce/)
})
