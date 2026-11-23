// The one place markup is written: every component builds its HTML through these helpers, and every value that comes from
// data goes through `esc` (F8). Browser and Node safe.
import { SpandekError } from "../../core/errors"

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/** Escape the five HTML-significant characters (text and quoted attribute values). */
export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c] as string)
}

export type AttrValue = string | number | boolean | undefined
const NAME = /^[a-z][a-z0-9-]*$/

/** ` k="v"` pairs, values escaped. `undefined` drops the attribute, `true` is a bare attribute (`="true"` on aria-*), `false` is dropped except on aria-* (`="false"`). */
export function attrs(a: Record<string, AttrValue>): string {
  let out = ""
  for (const [k, v] of Object.entries(a)) {
    if (!NAME.test(k)) throw new Error("design: invalid attribute name")
    if (v === undefined) continue
    if (v === true) out += k.startsWith("aria-") ? ` ${k}="true"` : ` ${k}`
    else if (v === false) {
      if (k.startsWith("aria-")) out += ` ${k}="false"`
    } else out += ` ${k}="${esc(String(v))}"`
  }
  return out
}

const SVG_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/

/** `<svg attrs>inner</svg>`: like `tag`, but attribute names may be camelCase (`viewBox`), which HTML names may not. Values are escaped. */
export function svgTag(a: Record<string, AttrValue>, inner: string): string {
  let out = ""
  for (const [k, v] of Object.entries(a)) {
    if (!SVG_NAME.test(k)) throw new Error("design: invalid attribute name")
    if (v === undefined || v === false) continue
    out += v === true ? ` ${k}` : ` ${k}="${esc(String(v))}"`
  }
  return `<svg${out}>${inner}</svg>`
}

const VOID = new Set(["br", "hr", "img", "input", "meta", "link"])

/** `<name attrs>inner</name>`. `inner` is trusted markup (already escaped by the caller); void elements take none. */
export function tag(
  name: string,
  a: Record<string, AttrValue>,
  inner: string | undefined,
): string {
  if (!NAME.test(name)) throw new Error("design: invalid tag name")
  if (VOID.has(name)) return `<${name}${attrs(a)}>`
  return `<${name}${attrs(a)}>${inner ?? ""}</${name}>`
}

/** Join class names, skipping empty ones. */
export const cls = (...c: (string | false | undefined)[]): string =>
  c.filter(Boolean).join(" ")

/** D7 / F7: an unknown component state is a build error (exit 4), never rendered. Typed `never` so a missing case fails tsc. */
export function failState(component: string, _state: never): never {
  throw new SpandekError(
    4,
    "design.component",
    component,
    `unknown state for component ${component}`,
  )
}

/** A value of a closed union: anything else is a build error (F7). Returns the value typed. */
export function oneOf<T extends string>(
  component: string,
  allowed: readonly T[],
  value: unknown,
): T {
  if (
    typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
  )
    return value as T
  return failState(component, value as never)
}

/** A link target that cannot run script: a fragment, a relative path, http(s) or mailto. Anything else is a build error. */
export function safeHref(component: string, href: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters hide a scheme
  if (/[\u0000-\u001f\u007f\s]/.test(href))
    throw new SpandekError(
      4,
      "design.component",
      component,
      "unsafe link target",
    )
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)
  if (
    scheme &&
    !["http", "https", "mailto"].includes((scheme[1] as string).toLowerCase())
  )
    throw new SpandekError(
      4,
      "design.component",
      component,
      "unsafe link target",
    )
  return href
}

/** The one owner of external-link attributes (vendor lib/link.ts): new tab, no opener (F-03). */
export function linkAttrs(
  external: boolean | undefined,
): Record<string, string> {
  return external ? { target: "_blank", rel: "noopener noreferrer" } : {}
}

/** A build error of a component (F7): exit 4, phase design.component, key = the component name. */
export function buildError(component: string, message: string): never {
  throw new SpandekError(4, "design.component", component, message)
}

/** A finite number, or a build error. */
export function finite(component: string, name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    return buildError(component, `${name} must be a finite number`)
  return v
}

/** Fixed-point text with a plain minus-free zero (`-0.00` prints as `0.00`); the one number formatter of the design layer. */
export function fixed(
  component: string,
  v: number,
  digits: number | undefined,
): string {
  const d = digits ?? 2
  if (!Number.isInteger(d) || d < 0 || d > 6)
    return buildError(component, "digits must be an integer from 0 to 6")
  const s = finite(component, "value", v).toFixed(d)
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s
}

/** Position of `v` on an axis as a percentage with four decimals (deterministic text), clamped to 0..100. */
export function pct(v: number, min: number, max: number): string {
  const p = ((v - min) / (max - min)) * 100
  return String(Math.round(Math.min(100, Math.max(0, p)) * 10000) / 10000)
}
