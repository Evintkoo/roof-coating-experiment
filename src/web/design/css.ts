// Component CSS, assembled from tokens only (FR-5): every value is `tv(name)`, a unitless number or a keyword; the compiler in
// tokens.ts is the only place a colour, font or spacing value is written. One section per atom (the vendor sheets A1 to A7 and
// the report sheets in docs/design/report-sheets.md), keyed by atom name so a test can read one section. Browser and Node safe.
import { tv } from "./tokens"

const t = tv

const BASE = `
*,*::before,*::after{box-sizing:border-box}
:focus-visible{outline:${t("ring-width")} solid ${t("focus-ring")};outline-offset:${t("ring-offset")}}
::selection{background:color-mix(in srgb,${t("action-primary")} 32%,transparent);color:${t("text-primary")}}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
`

const BUTTON = `
.tv-button{display:inline-flex;align-items:center;justify-content:center;gap:${t("space-2")};min-height:${t("target-min")};min-width:${t("target-min")};padding:${t("space-2")} ${t("space-4")};border:${t("hairline")} solid transparent;border-radius:${t("radius-control")};font-family:${t("font-sans")};font-size:${t("size-body")};font-weight:${t("weight-semibold")};text-decoration:none;cursor:pointer;white-space:nowrap;transition:background-color ${t("motion-fast")} ease,border-color ${t("motion-fast")} ease,transform ${t("motion-fast")} ease}
.tv-button:active:not([aria-disabled="true"]){transform:scale(0.98)}
.tv-button[aria-disabled="true"]{cursor:default}
.tv-button--primary{background:linear-gradient(135deg,${t("accent-orange-light")},${t("action-primary")} 55%);color:${t("action-label")};box-shadow:0 1px 0 color-mix(in srgb,${t("color-warm-white")} 28%,transparent) inset,0 10px 30px color-mix(in srgb,${t("action-primary")} 22%,transparent)}
.tv-button--primary:hover:not([aria-disabled="true"]){background:linear-gradient(135deg,${t("accent-orange-light")},${t("action-primary-hover")} 55%);box-shadow:0 1px 0 color-mix(in srgb,${t("color-warm-white")} 28%,transparent) inset,0 14px 40px color-mix(in srgb,${t("action-primary")} 32%,transparent)}
.tv-button--ghost{background:transparent;border-color:${t("border-glass")};color:${t("text-primary")}}
.tv-button--ghost:hover:not([aria-disabled="true"]){background:${t("surface-glass")};border-color:color-mix(in srgb,${t("action-primary")} 45%,transparent)}
.tv-button--inverse{background:${t("surface-base")};color:${t("text-primary")};box-shadow:0 12px 32px color-mix(in srgb,${t("color-canvas")} 45%,transparent)}
.tv-button--inverse:hover:not([aria-disabled="true"]){background:${t("surface-elevated")};box-shadow:0 16px 44px color-mix(in srgb,${t("color-canvas")} 55%,transparent)}
.tv-button[aria-disabled="true"],.tv-button[data-state="loading"]{background:${t("surface-raised")};border-color:${t("border-glass")};color:${t("text-muted")};box-shadow:none}
.tv-button[data-state="error"]{border-color:${t("status-stop")}}
.tv-button .tv-icon{transition:transform ${t("motion-fast")} ease}
.tv-button:hover .tv-icon,.tv-button:focus-visible .tv-icon{transform:translateX(${t("nudge")})}
@media (prefers-reduced-motion:reduce){.tv-button .tv-icon{transition:none}.tv-button:hover .tv-icon,.tv-button:focus-visible .tv-icon{transform:none}.tv-button{transition:none}.tv-button:active:not([aria-disabled="true"]){transform:none}}
@media print{.tv-button{background:none;box-shadow:none;color:${t("text-primary")};border-color:${t("border-control")};transition:none}}
`

const ICON = `
.tv-icon{display:inline-flex;flex-shrink:0;width:${t("icon-size")};height:${t("icon-size")}}
.tv-icon svg{width:100%;height:100%}
`

const LOGO = `
.tv-logo{display:inline-flex;align-items:center;gap:${t("space-2")};min-height:${t("target-min")};text-decoration:none}
.tv-logo__mark{display:inline-flex;width:${t("mark-size")};height:${t("mark-size")}}
.tv-logo__mark svg{width:100%;height:100%}
.tv-logo__wordmark{color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
@media print{.tv-logo__wordmark{color:${t("text-primary")}}}
`

const NAVLINK = `
.tv-navlink{display:inline-flex;align-items:center;min-height:${t("target-min")};min-width:${t("target-min")};justify-content:center;padding:${t("space-2")} ${t("space-3")};border-radius:${t("radius-control")};color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-label")};text-decoration:none}
.tv-navlink:hover,.tv-navlink[aria-current="true"]{text-decoration:underline;text-decoration-color:${t("action-primary")};text-underline-offset:${t("space-1")}}
`

const SECTION_LABEL = `
.tv-section-label{margin:0 0 ${t("space-3")};color:${t("text-muted")};font-family:${t("font-sans")};font-size:${t("size-label")};font-weight:${t("weight-semibold")};letter-spacing:0.2em;text-transform:uppercase}
.tv-section-label--accent{color:${t("link")}}
`

const BADGE = `
.tv-badge{display:inline-flex;align-items:center;padding:${t("space-1")} ${t("space-2")};border:${t("hairline")} solid transparent;border-radius:${t("radius-pill")};font-family:${t("font-sans")};font-size:${t("size-label")};font-weight:${t("weight-semibold")};letter-spacing:0.04em;line-height:1.2;white-space:nowrap;vertical-align:middle}
.tv-badge--proxy{color:${t("status-proxy")};background:color-mix(in srgb,${t("status-proxy")} 14%,transparent)}
.tv-badge--go{color:${t("status-go")};background:color-mix(in srgb,${t("status-go")} 14%,transparent)}
.tv-badge--stop{color:${t("status-stop")};background:color-mix(in srgb,${t("status-stop")} 14%,transparent)}
.tv-badge--scenario{color:${t("accent-secondary")};border-color:${t("accent-secondary")}}
.tv-badge--nominal{color:${t("text-muted")};border-color:${t("border-control")}}
@media print{.tv-badge{background:none;border-color:${t("text-primary")}}}
`

const CHIP = `
.tv-chip{display:inline-flex;align-items:center;justify-content:center;padding:${t("space-2")} ${t("space-3")};border:${t("hairline")} solid ${t("border-control")};border-radius:${t("radius-pill")};background:${t("surface-glass")};color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-label")};line-height:1.2}
.tv-chip--toggle{min-height:${t("target-min")};min-width:${t("target-min")};cursor:pointer;transition:background-color ${t("motion-fast")} ease,border-color ${t("motion-fast")} ease}
.tv-chip--toggle:hover{background:${t("surface-raised")}}
.tv-chip[aria-pressed="true"]{background:${t("surface-raised")};border-color:${t("link")};font-weight:${t("weight-semibold")}}
@media (prefers-reduced-motion:reduce){.tv-chip--toggle{transition:none}}
@media print{.tv-chip{background:none;border-color:${t("text-primary")}}}
`

const CODE_BLOCK = `
.tv-code{margin:0;padding:${t("space-3")} ${t("space-4")};overflow-x:auto;white-space:pre;border:${t("hairline")} solid ${t("border-panel")};border-radius:${t("radius-panel")};background:${t("surface-card")};color:${t("text-primary")};font-family:${t("font-mono")};font-size:${t("size-label")};line-height:1.5}
.tv-code code{font:inherit}
.tv-code--inline{display:inline;padding:${t("space-1")} ${t("space-2")};overflow:visible;white-space:normal;overflow-wrap:anywhere;border:0;border-radius:${t("radius-control")};background:${t("surface-glass")}}
@media print{.tv-code{overflow:visible;white-space:pre-wrap;overflow-wrap:anywhere;background:none}}
`

export const ATOM_CSS = {
  base: BASE,
  button: BUTTON,
  icon: ICON,
  logo: LOGO,
  navLink: NAVLINK,
  sectionLabel: SECTION_LABEL,
  badge: BADGE,
  chip: CHIP,
  codeBlock: CODE_BLOCK,
} as const

export type AtomCssName = keyof typeof ATOM_CSS

/** The CSS of every atom, in a fixed order, one rule per line. */
export function atomsCss(): string {
  return Object.values(ATOM_CSS)
    .map((s) => s.trim())
    .join("\n")
    .concat("\n")
}
