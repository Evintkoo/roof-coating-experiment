import { afterEach, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { ConfigError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import { THEMES } from "../../../src/web/design/themes"
import { compileTokens, tv } from "../../../src/web/design/tokens"
import { repoRoot } from "../../helpers"

const contract = JSON.parse(
  readFileSync(
    join(repoRoot, "vendor/torviello-design/contracts/design-tokens.json"),
    "utf8",
  ),
)
afterEach(() => setEventSink(null))

test("everyContractTokenAppearsInCss", () => {
  const { css, names } = compileTokens(contract, THEMES)
  // dark theme is the default block: the first :root rule
  const dark = css.slice(0, css.indexOf("}") + 1)
  for (const [k, t] of Object.entries(
    contract.semantic as Record<string, { $value: string }>,
  ))
    expect(dark, k).toContain(`--tv-${k}:${t.$value};`)
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

test("cssHasBothThemesAndFollowsTheSystem", () => {
  const { css } = compileTokens(contract, THEMES)
  expect(css).toContain("@media (prefers-color-scheme:light)")
  expect(css).toContain(`:root:not([data-theme="dark"])`)
  expect(css).toContain(`:root[data-theme="light"]`)
  expect(css).toContain("color-scheme:dark")
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
export const LITERAL_PATTERNS: [string, RegExp][] = [
  ["hex colour", /#[0-9a-fA-F]{3,8}\b/],
  ["rgb/hsl/oklch colour", /\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/],
  [
    "named font family",
    /\b(Inter|JetBrains|Arial|Helvetica|Consolas|monospace|sans-serif|serif|SFMono)\b/,
  ],
  [
    "spacing literal",
    /\b(padding|margin|gap)[a-z-]*\s*:[^;{}]*\d(px|rem|em)\b/,
  ],
]
export function literalsIn(source: string): string[] {
  // strip comments
  const s = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
  return LITERAL_PATTERNS.filter(([, re]) => re.test(s)).map(([n]) => n)
}
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
