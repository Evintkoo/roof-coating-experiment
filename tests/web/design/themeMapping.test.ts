// The theme mapping audit (plan 06 D3 amended): both themes define the same tokens, the compiled CSS carries every one of them in
// both themes, the role table covers every colour token, docs/design/theme-mapping.md is the code's own output, light is the
// default whatever the system says, and the head script applies the stored theme (or light when storage is empty or throws).
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PLOT_ROLE_TOKENS, plotTheme } from "../../../src/web/design/plotTheme"
import {
  mappingMarkdown,
  PLOT_ROLE_ROWS,
  ROLE_ROWS,
} from "../../../src/web/design/themeMapping"
import { THEMES } from "../../../src/web/design/themes"
import { compileTokens, resolveTheme } from "../../../src/web/design/tokens"
import { repoRoot } from "../../helpers"

const contract = JSON.parse(
  readFileSync(
    join(repoRoot, "vendor/torviello-design/contracts/design-tokens.json"),
    "utf8",
  ),
)
const light = resolveTheme(contract, THEMES, "light")
const dark = resolveTheme(contract, THEMES, "dark")
const { css } = compileTokens(contract, THEMES)

/** The `--tv-` names declared in the rule that starts with `selector`. */
function declared(selector: string): Map<string, string> {
  const at = css.indexOf(selector)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  const body = css.slice(at + selector.length, css.indexOf("}", at))
  return new Map(
    [...body.matchAll(/--tv-([a-z0-9-]+):([^;]+);/g)].map((m) => [
      m[1] as string,
      m[2] as string,
    ]),
  )
}

test("noTokenAsymmetry", () => {
  expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort())
  expect(Object.keys(light).length).toBeGreaterThan(40)
  const lightRule = declared(`:root,[data-theme="light"]{color-scheme:light;`)
  const darkRule = declared(`[data-theme="dark"]{color-scheme:dark;`)
  const colourNames = Object.keys(dark)
  for (const k of colourNames) {
    expect(lightRule.get(k), `light ${k}`).toBe(light[k] as string)
    expect(darkRule.get(k), `dark ${k}`).toBe(dark[k] as string)
  }
  // the dark rule holds colours only; nothing the light rule lacks
  expect([...darkRule.keys()].sort()).toEqual([...colourNames].sort())
  for (const k of colourNames) expect(lightRule.has(k)).toBe(true)
  // the print rule is the light theme complete
  const printRule = declared(
    `@media print{:root,[data-theme="dark"]{color-scheme:light;`,
  )
  for (const k of colourNames)
    expect(printRule.get(k), `print ${k}`).toBe(light[k] as string)
})

test("asymmetryCanFail", () => {
  const light2 = { ...THEMES.light } as Record<string, string>
  delete light2["viz-3"]
  expect(() => compileTokens(contract, { ...THEMES, light: light2 })).toThrow(
    "light theme",
  )
  // a token only light has is refused too
  expect(() =>
    compileTokens(contract, {
      ...THEMES,
      light: { ...THEMES.light, "only-light": "#123456" },
    }),
  ).toThrow("dark theme")
})

test("everyColourTokenHasExactlyOneRoleAndRolesNameRealTokens", () => {
  const roleTokens = ROLE_ROWS.map((r) => r.token)
  expect(new Set(roleTokens).size).toBe(roleTokens.length)
  expect([...roleTokens].sort()).toEqual(Object.keys(dark).sort())
  for (const r of PLOT_ROLE_ROWS) {
    expect(dark[r.token], r.role).toBeDefined()
    expect(light[r.token], r.role).toBeDefined()
  }
  // the figure roles are the ones plotTheme reads, in both themes
  for (const [name, t] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    const p = plotTheme(name, t, "x") as unknown as Record<string, string>
    for (const [role, token] of Object.entries(PLOT_ROLE_TOKENS))
      expect(p[role], `${name} ${role}`).toBe(t[token] as string)
  }
})

test("mappingDocMatchesCode", () => {
  const file = readFileSync(
    join(repoRoot, "docs/design/theme-mapping.md"),
    "utf8",
  )
  expect(file).toBe(mappingMarkdown(light, dark))
  // the check can fail
  expect(file).not.toBe(
    mappingMarkdown(light, { ...dark, "text-primary": "#000000" }),
  )
})

test("lightIsTheDefaultAndNothingFollowsTheSystem", () => {
  expect(css).not.toContain("prefers-color-scheme")
  expect(css.split("\n")[0]).toContain(`:root,[data-theme="light"]`)
})
