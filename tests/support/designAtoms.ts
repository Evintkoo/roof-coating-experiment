// Helpers for the atom string-contract tests: a real HTML parse (Bun's HTMLRewriter), the compiled token names, and the
// vendored Svelte sources the atoms mirror.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { THEMES } from "../../src/web/design/themes"
import { compileTokens } from "../../src/web/design/tokens"
import { repoRoot } from "../helpers"

export type El = { tag: string; attrs: Record<string, string> }

/** Every element of `html` as the parser sees it (so an injected `<img onerror>` would show up here). */
export async function elementsOf(html: string): Promise<El[]> {
  const out: El[] = []
  await new HTMLRewriter()
    .on("*", {
      element(e) {
        out.push({ tag: e.tagName, attrs: Object.fromEntries(e.attributes) })
      },
    })
    .transform(new Response(html))
    .text()
  return out
}

const contract = JSON.parse(
  readFileSync(
    join(repoRoot, "vendor/torviello-design/contracts/design-tokens.json"),
    "utf8",
  ),
)
export const TOKEN_NAMES: ReadonlySet<string> = new Set(
  compileTokens(contract, THEMES).names,
)

/** Names used in `var(--tv-<name>)` references of a CSS string. */
export function varNames(css: string): Set<string> {
  return new Set(
    [...css.matchAll(/var\(--tv-([a-z0-9-]+)\)/g)].map((m) => m[1] as string),
  )
}

export function vendorSvelte(name: string): string {
  return readFileSync(
    join(
      repoRoot,
      "vendor/torviello-landing-ui/components/ui",
      `${name}.svelte`,
    ),
    "utf8",
  )
}
/** The `<style>` block of a vendored component. */
export const vendorStyle = (name: string): string =>
  /<style>([\s\S]*)<\/style>/.exec(vendorSvelte(name))?.[1] ?? ""

/** `tv-*` class names a vendored component styles. */
export function vendorClasses(name: string): Set<string> {
  return new Set(
    [...vendorStyle(name).matchAll(/\.(tv-[a-z0-9_-]+)/g)].map(
      (m) => m[1] as string,
    ),
  )
}
/** Semantic token names (`--tv-<name>`) a vendored component's style consumes (primitives included). */
export function vendorTokens(name: string): Set<string> {
  return varNames(vendorStyle(name))
}

export const XSS = `<img src=x onerror=alert(1)>"'&`

// FR-5 scan: the literals the design layer must not contain outside tokens.ts and themes.ts.
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
