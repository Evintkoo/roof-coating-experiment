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
