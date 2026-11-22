// Token compiler: the vendored Torviello contract (W3C DTCG draft) plus the derived light theme and the dataviz palette
// (themes.ts) become CSS custom properties, `--tv-<name>`, the same names as the vendored tokens.css. Components consume
// `tv(name)` only. A token the contract should have but does not is ConfigError (exit 2, phase design.tokens, F1); the
// event carries the token name and nothing else. Browser and Node safe (the caller reads the file).
import { ConfigError } from "../../core/errors"
import { emitEvent } from "../../core/events"
import type { ExtraTokenName, ThemeName, Themes } from "./themes"

const PRIMITIVES = [
  "midnight",
  "orange",
  "warm-white",
  "signal-teal",
  "orange-hover",
  "orange-light",
  "orange-dark",
  "canvas",
  "deep",
  "elevated",
] as const
const SEMANTIC = [
  "surface-base",
  "surface-glass",
  "surface-raised",
  "border-glass",
  "text-primary",
  "text-muted",
  "action-primary",
  "action-primary-hover",
  "action-label",
  "accent-secondary",
  "surface-canvas",
  "surface-elevated",
  "surface-card",
  "accent-orange-light",
  "accent-orange-dark",
  "border-panel",
  "border-panel-strong",
  "glow-orange",
  "focus-ring",
] as const
const FONT_FAMILY = ["family-sans", "family-mono"] as const
const FONT_SCALAR = [
  "size-display",
  "size-heading",
  "size-body",
  "size-label",
  "size-small",
  "size-micro",
  "weight-semibold",
  "weight-regular",
] as const
const SPACE = ["1", "2", "3", "4", "6", "8", "12", "16"] as const
const RADIUS = ["control", "panel", "card", "glass"] as const

export type TokenName =
  | (typeof SEMANTIC)[number]
  | ExtraTokenName
  | `color-${(typeof PRIMITIVES)[number]}`
  | `font-${"sans" | "mono"}`
  | (typeof FONT_SCALAR)[number]
  | `space-${(typeof SPACE)[number]}`
  | `radius-${(typeof RADIUS)[number]}`

/** `var(--tv-<name>)`: the only way component CSS refers to a design value. */
export const tv = (name: TokenName): string => `var(--tv-${name})`

const SAFE = /^[#A-Za-z0-9 ().,%/-]+$/

function missing(token: string, why: string): never {
  emitEvent("design.token.missing", "error", { token })
  throw new ConfigError(token, `design token ${why}`, "design.tokens")
}

type Group = Record<string, unknown>
const isObj = (v: unknown): v is Group =>
  typeof v === "object" && v !== null && !Array.isArray(v)

function value(group: unknown, key: string, name: string): string | number {
  const t = isObj(group) ? group[key] : undefined
  if (!isObj(t)) return missing(name, "is missing from the contract")
  const v = t.$value
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === "string" ? x : ""))
    if (parts.length === 0 || parts.some((p) => !SAFE.test(p)))
      return missing(name, "has an unusable value")
    return parts.map((p) => (p.includes(" ") ? `"${p}"` : p)).join(", ")
  }
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v !== "string" || !SAFE.test(v))
    return missing(name, "has an unusable value")
  return v
}

type Resolved = {
  /** `--tv-` names (without the prefix) to values, in a fixed order, theme independent. */
  fixed: [string, string | number][]
  /** The contract's dark semantic values. */
  semantic: Record<string, string>
}

function readContract(contract: unknown): Resolved {
  const c = isObj(contract) ? contract : {}
  const fixed: [string, string | number][] = []
  const semantic: Record<string, string> = {}
  for (const k of PRIMITIVES)
    fixed.push([`color-${k}`, value(c.color, k, `color-${k}`)])
  for (const k of SEMANTIC) semantic[k] = String(value(c.semantic, k, k))
  for (const k of FONT_FAMILY)
    fixed.push([
      `font-${k.slice("family-".length)}`,
      value(c.font, k, `font-${k.slice("family-".length)}`),
    ])
  for (const k of FONT_SCALAR) fixed.push([k, value(c.font, k, k)])
  for (const k of SPACE)
    fixed.push([`space-${k}`, value(c.space, k, `space-${k}`)])
  for (const k of RADIUS)
    fixed.push([`radius-${k}`, value(c.radius, k, `radius-${k}`)])
  return { fixed, semantic }
}

function checkValues(group: Readonly<Record<string, string>>, token: string) {
  for (const [k, v] of Object.entries(group))
    if (!SAFE.test(v)) missing(k, `has an unusable value (${token})`)
}

/** Every colour token of a theme, by name: the contract's semantic set (dark) plus the theme's additions. */
export function resolveTheme(
  contract: unknown,
  themes: Themes,
  theme: ThemeName,
): Record<string, string> {
  const { semantic } = readContract(contract)
  if (theme === "dark") return { ...semantic, ...themes.dark }
  return { ...themes.light }
}

function decls(entries: Iterable<[string, string | number]>): string {
  let out = ""
  for (const [k, v] of entries) out += `--tv-${k}:${v};`
  return out
}

export function compileTokens(
  contract: unknown,
  themes: Themes,
): { css: string; names: readonly string[] } {
  const { fixed, semantic } = readContract(contract)
  checkValues(themes.dark, "dark")
  checkValues(themes.light, "light")
  checkValues(themes.shared, "shared")
  const dark: Record<string, string> = { ...semantic, ...themes.dark }
  // the light theme must carry every colour token of the dark theme, or a component would silently fall back to dark
  for (const k of Object.keys(dark))
    if (themes.light[k] === undefined)
      missing(k, "is missing from the light theme")
  const light: [string, string][] = Object.keys(dark).map((k) => [
    k,
    themes.light[k] as string,
  ])
  const shared = Object.entries(themes.shared)
  const darkEntries: [string, string | number][] = [
    ...fixed,
    ...shared,
    ...Object.entries(dark),
  ]
  const lightBlock = `color-scheme:light;${decls(light)}`
  const css = [
    `:root{color-scheme:dark;${decls(darkEntries)}}`,
    `@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){${lightBlock}}}`,
    `:root[data-theme="light"]{${lightBlock}}`,
    `:root[data-theme="dark"]{color-scheme:dark;${decls(Object.entries(dark))}}`,
    // paper is white: print always uses the light theme, whatever the screen theme is
    `@media print{:root,:root[data-theme="dark"]{${lightBlock}}}`,
  ].join("\n")
  return { css: `${css}\n`, names: darkEntries.map(([k]) => k) }
}
