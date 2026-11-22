import { afterEach, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { ConfigError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import { THEMES } from "../../../src/web/design/themes"
import { compileTokens, tv } from "../../../src/web/design/tokens"
import { repoRoot } from "../../helpers"
import { literalsIn } from "../../support/designAtoms"

const contract = JSON.parse(
  readFileSync(
    join(repoRoot, "vendor/torviello-design/contracts/design-tokens.json"),
    "utf8",
  ),
)
afterEach(() => setEventSink(null))

test("everyContractTokenAppearsInCss", () => {
  const { css, names } = compileTokens(contract, THEMES)
  // the contract's semantic values are the dark theme: the `[data-theme="dark"]` rule; the theme-independent tokens are in the
  // first rule (`:root`, which is the light theme: light is the default)
  const darkStart = css.indexOf(`[data-theme="dark"]{`)
  const darkRule = css.slice(darkStart, css.indexOf("}", darkStart) + 1)
  const dark = css.slice(0, css.indexOf("}") + 1)
  for (const [k, t] of Object.entries(
    contract.semantic as Record<string, { $value: string }>,
  ))
    expect(darkRule, k).toContain(`--tv-${k}:${t.$value};`)
  for (const [k, t] of Object.entries(
    contract.color as Record<string, { $value: string }>,
  ))
    expect(dark, k).toContain(`--tv-color-${k}:${t.$value};`)
  for (const [k, t] of Object.entries(
    contract.space as Record<string, { $value: string }>,
  ))
    expect(dark, k).toContain(`--tv-space-${k}:${t.$value};`)
  for (const [k, t] of Object.entries(
    contract.radius as Record<string, { $value: string }>,
  ))
    expect(dark, k).toContain(`--tv-radius-${k}:${t.$value};`)
  const font = contract.font as Record<string, { $value: unknown }>
  expect(dark).toContain(
    `--tv-font-sans:${((font["family-sans"]?.$value ?? []) as string[]).map((f) => (f.includes(" ") ? `"${f}"` : f)).join(", ")};`,
  )
  expect(dark).toContain(`--tv-size-body:${font["size-body"]?.$value};`)
  expect(dark).toContain(
    `--tv-weight-semibold:${font["weight-semibold"]?.$value};`,
  )
  expect(names).toContain("text-primary")
  expect(names).toContain("viz-3")
  expect(new Set(names).size).toBe(names.length)
})

test("cssHasBothThemesAndLightIsTheDefaultWhateverTheSystemSays", () => {
  const { css } = compileTokens(contract, THEMES)
  // D3 amended: no system-follow rule at all; `:root` is light, dark needs data-theme="dark"
  expect(css).not.toContain("prefers-color-scheme")
  expect(css.startsWith(`:root,[data-theme="light"]{color-scheme:light;`)).toBe(
    true,
  )
  expect(css).toContain(`[data-theme="dark"]{color-scheme:dark;`)
  expect(css).toContain("--tv-link:#be3701;")
  expect(css).toContain("--tv-link:#ff683b;")
})

test("compileIsDeterministic", () => {
  expect(compileTokens(contract, THEMES).css).toBe(
    compileTokens(structuredClone(contract), THEMES).css,
  )
})

test("tvBuildsAVarReference", () => {
  expect(tv("text-primary")).toBe("var(--tv-text-primary)")
  // @ts-expect-error an unknown token name is a type error
  tv("no-such-token")
})

test("missingTokenIsExit2", () => {
  const events: { event: string; level: string; fields: object }[] = []
  setEventSink((event, level, fields) => events.push({ event, level, fields }))
  const broken = structuredClone(contract)
  delete broken.semantic["surface-base"]
  let err: unknown
  try {
    compileTokens(broken, THEMES)
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(ConfigError)
  const e = err as ConfigError
  expect(e.code).toBe(2)
  expect(e.phase).toBe("design.tokens")
  expect(e.key).toBe("surface-base")
  expect(events).toEqual([
    {
      event: "design.token.missing",
      level: "error",
      fields: { token: "surface-base" },
    },
  ])
})

test("missingTokenInEveryGroupIsNamed", () => {
  for (const [group, key] of [
    ["color", "midnight"],
    ["space", "4"],
    ["radius", "card"],
    ["font", "family-mono"],
  ] as const) {
    const broken = structuredClone(contract)
    delete broken[group][key]
    expect(() => compileTokens(broken, THEMES), `${group}.${key}`).toThrow(
      ConfigError,
    )
  }
  expect(() => compileTokens({}, THEMES)).toThrow(ConfigError)
  expect(() => compileTokens(null, THEMES)).toThrow(ConfigError)
})

test("lightThemeMissingATokenIsExit2", () => {
  const light = { ...THEMES.light }
  delete (light as Record<string, string>)["text-primary"]
  expect(() => compileTokens(contract, { ...THEMES, light })).toThrow(
    ConfigError,
  )
})

test("badValueIsRefusedNotInjectedIntoCss", () => {
  const broken = structuredClone(contract)
  broken.semantic["text-primary"].$value = "red;}body{display:none"
  expect(() => compileTokens(broken, THEMES)).toThrow(ConfigError)
})

// FR-5: the design layer consumes semantic tokens only. Colour, font-family and spacing literals live in the
// token compiler and the theme values (tokens.ts, themes.ts) and nowhere else under src/web/design.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
test("noRawLiteralsOutsideCompiler", () => {
  const root = join(repoRoot, "src/web/design")
  const files = walk(root).filter(
    (f) =>
      f.endsWith(".ts") &&
      !f.endsWith("/tokens.ts") &&
      !f.endsWith("/themes.ts"),
  )
  expect(files.length).toBeGreaterThan(0)
  const found: Record<string, string[]> = {}
  for (const f of files) {
    const hits = literalsIn(readFileSync(f, "utf8"))
    if (hits.length) found[f.slice(root.length + 1)] = hits
  }
  expect(found).toEqual({})
})

test("theLiteralScanCanFail", () => {
  expect(literalsIn("a{color:#ff683b}")).toContain("hex colour")
  expect(literalsIn("a{color:rgba(1,2,3,.4)}")).toContain(
    "rgb/hsl/oklch colour",
  )
  expect(literalsIn('a{font-family:"Inter",sans-serif}')).toContain(
    "named font family",
  )
  expect(literalsIn("a{padding:var(--tv-space-2) 13px}")).toContain(
    "spacing literal",
  )
  expect(
    literalsIn("a{padding:var(--tv-space-2);color:var(--tv-text-primary)}"),
  ).toEqual([])
})

test("printAlwaysUsesTheLightTheme", () => {
  const { css } = compileTokens(contract, THEMES)
  const print = css.slice(css.indexOf("@media print"))
  expect(print).toContain(`:root,[data-theme="dark"]`)
  expect(print).toContain("color-scheme:light")
  expect(print).toContain("--tv-surface-base:#f7f8fa;")
  expect(print).toContain("--tv-text-primary:#0b1020;")
})

test("durationTokensAreZeroUnderReducedMotion", () => {
  const { css, names } = compileTokens(contract, THEMES)
  expect(names).toContain("motion-base")
  expect(css).toContain("--tv-motion-base:240ms;")
  const reduce =
    /@media \(prefers-reduced-motion:reduce\)\{[^}]*\{([^}]*)\}/.exec(css)
  expect(reduce?.[1]).toContain("--tv-motion-base:0ms;")
  expect(reduce?.[1]).toContain("--tv-motion-fast:0ms;")
  expect(css).toContain('[data-motion="reduce"]')
})

test("sharedTokensAreCompiled", () => {
  const { css, names } = compileTokens(contract, THEMES)
  for (const n of [
    "target-min",
    "ring-width",
    "hairline",
    "motion-fast",
    "icon-size",
  ])
    expect(names).toContain(n)
  expect(css).toContain("--tv-target-min:44px;")
})
