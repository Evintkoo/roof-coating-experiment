// Sheet A5: the brand mark and the "torviello" wordmark as one home link. The mark is the canonical ribbon-T from the vendored
// brand asset (vendor/torviello-design/brand/logo-mark.ts, drift-checked), decorative and aria-hidden; the link's name is its
// aria-label. The mark is never recoloured per section.
import { logoMark } from "../../../../vendor/torviello-design/brand/logo-mark"
import { attrs, esc, safeHref } from "../html"

export const LOGO_LABEL = "Torviello home"

export type LogoProps = { href?: string; label?: string }

// the asset's provenance comment is not page content
const MARK = logoMark.replace(/<!--[\s\S]*?-->\s*/g, "").trim()

export function logo(p: LogoProps): string {
  const a = attrs({
    class: "tv-logo",
    href: safeHref("Logo", p.href ?? "#top"),
    "aria-label": p.label ?? LOGO_LABEL,
  })
  return `<a${a}><span class="tv-logo__mark" aria-hidden="true">${MARK}</span><span class="tv-logo__wordmark">${esc("torviello")}</span></a>`
}
