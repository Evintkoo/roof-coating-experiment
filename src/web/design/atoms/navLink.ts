// Sheet A3: a top navigation item. States: default and current section (`aria-current`, orange underline). The vendored
// NavLink.svelte takes `current: boolean`; here it is the closed union `state` so an unknown value is a build error (F7).
import { esc, linkAttrs, oneOf, safeHref, tag } from "../html"

export const NAVLINK_STATES = ["default", "current"] as const
export type NavLinkState = (typeof NAVLINK_STATES)[number]

export type NavLinkProps = {
  label: string
  href: string
  state?: NavLinkState
  /** The link leaves the site: new tab, no opener. */
  external?: boolean
}

export function navLink(p: NavLinkProps): string {
  const state = oneOf("NavLink", NAVLINK_STATES, p.state ?? "default")
  return tag(
    "a",
    {
      class: "tv-navlink",
      href: safeHref("NavLink", p.href),
      "aria-current": state === "current" ? "true" : undefined,
      ...linkAttrs(p.external),
    },
    esc(p.label),
  )
}
