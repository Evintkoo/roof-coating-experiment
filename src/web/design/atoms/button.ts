// Sheets A1 (primary) and A2 (ghost) of vendor/torviello-design/specifications/landing-design-sheets.md, mirroring the
// vendored Button.svelte: one primary action per view; ghost is the secondary pairing; `inverse` is the closing band's
// primary. With an href it renders an anchor and owns the external-link attributes; without one a real <button>.
// `error` adds a status-stop border (report addition; the vendor atom only sets data-state).
import { cls, esc, linkAttrs, oneOf, safeHref, tag } from "../html"

export const BUTTON_VARIANTS = ["primary", "ghost", "inverse"] as const
export const BUTTON_STATES = ["idle", "loading", "error", "empty"] as const
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]
export type ButtonState = (typeof BUTTON_STATES)[number]

export type ButtonProps = {
  label: string
  variant?: ButtonVariant
  state?: ButtonState
  /** When set the control is a link to this destination (the state is not shown on a link). */
  href?: string
  /** The link leaves the site: new tab, no opener. */
  external?: boolean
}

export function button(p: ButtonProps): string {
  const variant = oneOf("Button", BUTTON_VARIANTS, p.variant ?? "primary")
  const state = oneOf("Button", BUTTON_STATES, p.state ?? "idle")
  const className = cls("tv-button", `tv-button--${variant}`)
  const label = esc(p.label)
  if (p.href !== undefined)
    return tag(
      "a",
      {
        class: className,
        href: safeHref("Button", p.href),
        ...linkAttrs(p.external),
      },
      label,
    )
  return tag(
    "button",
    {
      type: "button",
      class: className,
      "aria-busy": state === "loading",
      "aria-disabled": state === "loading",
      "data-state": state,
    },
    label,
  )
}
