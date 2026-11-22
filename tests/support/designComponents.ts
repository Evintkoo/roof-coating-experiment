// Shared checks for the molecule and organism tests: the sheet entry exists with every section, a component's CSS is token-only,
// and a build error is the typed SpandekError (exit 4, phase design.component).
import { expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SpandekError } from "../../src/core/errors"
import { repoRoot } from "../helpers"
import { literalsIn, TOKEN_NAMES, varNames } from "./designAtoms"

export { elementsOf, XSS } from "./designAtoms"

const SHEET = readFileSync(
  join(repoRoot, "docs/design/report-sheets.md"),
  "utf8",
)

/** The text of one sheet entry (`### <heading>` up to the next heading). */
export function sheetEntry(heading: string): string {
  const at = SHEET.indexOf(`### ${heading}\n`)
  expect(at, `sheet entry ${heading}`).toBeGreaterThan(-1)
  const rest = SHEET.slice(at + 4)
  const end = rest.search(/\n#{2,3} /)
  return end === -1 ? rest : rest.slice(0, end)
}

export function expectSheet(heading: string, states: readonly string[]): void {
  const s = sheetEntry(heading)
  for (const k of [
    "purpose:",
    "tokens:",
    "states",
    "contract:",
    "accessibility:",
    "do:",
  ])
    expect(s, `${heading} ${k}`).toContain(k)
  for (const st of states)
    expect(s, `${heading} state ${st}`).toContain(`\`${st}\``)
}

/** CSS rules are token-only and every var() resolves. */
export function expectTokenOnly(css: string): void {
  expect(css.trim().length).toBeGreaterThan(20)
  expect(literalsIn(css)).toEqual([])
  for (const n of varNames(css))
    expect(TOKEN_NAMES.has(n), `--tv-${n}`).toBe(true)
}

export function expectBuildError(fn: () => unknown, key: string): void {
  let err: unknown
  try {
    fn()
  } catch (e) {
    err = e
  }
  expect(err, `${key} must throw`).toBeInstanceOf(SpandekError)
  expect((err as SpandekError).code).toBe(4)
  expect((err as SpandekError).key).toBe(key)
}
