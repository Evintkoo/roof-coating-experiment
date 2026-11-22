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

/** Molecule CSS, keyed by molecule name (sheets R4 to R13). */
export const MOLECULE_CSS = {
  proxyBadge: `
.tv-proxy{display:inline-flex;vertical-align:middle}
`,
  stat: `
.tv-stat{display:grid;gap:${t("space-1")};min-width:0}
.tv-stat p{margin:0}
.tv-stat__label{color:${t("text-muted")};font-family:${t("font-sans")};font-size:${t("size-small")}}
.tv-stat__value{display:flex;flex-wrap:wrap;align-items:baseline;gap:${t("space-2")};color:${t("text-primary")}}
.tv-stat__num{font-family:${t("font-mono")};font-size:${t("size-heading")};font-weight:${t("weight-semibold")};line-height:1.2}
.tv-stat__unit{font-family:${t("font-sans")};font-size:${t("size-small")};color:${t("text-muted")}}
.tv-stat__interval,.tv-stat__note{color:${t("text-muted")};font-family:${t("font-sans")};font-size:${t("size-small")}}
`,
  intervalBar: `
.tv-interval{display:grid;gap:${t("space-1")};min-width:0}
.tv-interval p{margin:0}
.tv-interval__track{position:relative;height:${t("space-2")};border-radius:${t("radius-pill")};background:${t("surface-raised")};margin:${t("space-2")} 0}
.tv-interval__band{position:absolute;top:0;bottom:0;min-width:${t("space-1")};border-radius:${t("radius-pill")};background:color-mix(in srgb,${t("viz-recommended")} 35%,transparent)}
.tv-interval__cap{position:absolute;top:calc(${t("space-1")} * -1);bottom:calc(${t("space-1")} * -1);width:${t("ring-width")};margin-left:calc(${t("ring-width")} / -2);background:${t("viz-recommended")}}
.tv-interval__mark{position:absolute;top:50%;width:${t("space-3")};height:${t("space-3")};margin:calc(${t("space-3")} / -2) 0 0 calc(${t("space-3")} / -2);transform:rotate(45deg);background:${t("text-primary")};border:${t("hairline")} solid ${t("surface-base")}}
.tv-interval__axis{display:flex;justify-content:space-between;color:${t("text-muted")};font-family:${t("font-sans")};font-size:${t("size-micro")}}
.tv-interval__text{color:${t("text-muted")};font-family:${t("font-sans")};font-size:${t("size-small")}}
@media print{.tv-interval__track{border:${t("hairline")} solid ${t("text-primary")};background:none}.tv-interval__mark{background:${t("text-primary")}}}
`,
  callout: `
.tv-callout{padding:${t("space-3")} ${t("space-4")};border:${t("hairline")} solid ${t("border-glass")};border-inline-start:${t("space-1")} solid ${t("border-control")};border-radius:${t("radius-panel")};background:${t("surface-glass")};color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-body")}}
.tv-callout p{margin:0 0 ${t("space-2")}}
.tv-callout p:last-child{margin-bottom:0}
.tv-callout__title{font-weight:${t("weight-semibold")}}
.tv-callout--info{border-inline-start-color:${t("border-control")}}
.tv-callout--caution{border-inline-start-color:${t("status-proxy")}}
.tv-callout--limit{border-inline-start-color:${t("status-stop")}}
@media print{.tv-callout{background:none;border-color:${t("text-primary")}}}
`,
  disclosure: `
.tv-disclosure{margin:${t("space-2")} 0;border:${t("hairline")} solid ${t("border-glass")};border-radius:${t("radius-card")};color:${t("text-primary")};font-family:${t("font-sans")}}
.tv-disclosure__summary{display:flex;align-items:center;gap:${t("space-3")};min-height:var(--tv-target-min);padding:${t("space-2")} ${t("space-4")};border-radius:${t("radius-card")};font-size:${t("size-body")};font-weight:${t("weight-semibold")};cursor:pointer;list-style:none}
.tv-disclosure__summary::-webkit-details-marker{display:none}
.tv-disclosure__summary::before{content:"";flex-shrink:0;width:${t("space-2")};height:${t("space-2")};border-right:${t("ring-width")} solid ${t("text-muted")};border-bottom:${t("ring-width")} solid ${t("text-muted")};transform:rotate(-45deg);transition:transform ${t("motion-fast")} ease}
.tv-disclosure[open]>.tv-disclosure__summary::before{transform:rotate(45deg)}
.tv-disclosure__summary:hover{background:${t("surface-glass")}}
.tv-disclosure__inner{padding:${t("space-2")} ${t("space-4")} ${t("space-4")}}
@media (prefers-reduced-motion:reduce){.tv-disclosure__summary::before{transition:none}}
@media print{.tv-disclosure::details-content{content-visibility:visible;display:block}.tv-disclosure>.tv-disclosure__inner{display:block}.tv-disclosure__summary::before{display:none}}
`,
  figureFrame: `
.tv-figure{display:flex;flex-direction:column;gap:${t("space-2")};margin:${t("space-4")} 0;padding:${t("space-4")};border:${t("hairline")} solid ${t("border-panel")};border-radius:${t("radius-panel")};color:${t("text-primary")};font-family:${t("font-sans")}}
.tv-figure__title{font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.tv-figure__box{min-width:0;overflow-x:auto}
.tv-figure__plot{min-height:calc(${t("space-16")} * 4)}
.tv-figure--short .tv-figure__plot{min-height:calc(${t("space-16")} * 4)}
.tv-figure--medium .tv-figure__plot{min-height:calc(${t("space-16")} * 5)}
.tv-figure--tall .tv-figure__plot{min-height:calc(${t("space-16")} * 6)}
.tv-figure__note{margin:0;color:${t("text-muted")};font-size:${t("size-small")}}
@media print{.tv-figure{break-inside:avoid}}
`,
  legend: `
.tv-legend{display:flex;flex-wrap:wrap;gap:${t("space-2")} ${t("space-4")};margin:${t("space-2")} 0;padding:0;list-style:none;color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-small")}}
.tv-legend__item{display:inline-flex;align-items:center;gap:${t("space-2")}}
.tv-legend__swatch{display:inline-block;flex-shrink:0;width:${t("space-6")};height:${t("space-2")};background:var(--swatch)}
.tv-legend__swatch--line{height:${t("ring-width")}}
.tv-legend__swatch--dash{height:0;background:none;border-top:${t("ring-width")} dashed var(--swatch)}
.tv-legend__swatch--dot{width:${t("space-2")};height:${t("space-2")};border-radius:${t("radius-pill")}}
.tv-legend__swatch--band{height:${t("space-3")};opacity:0.55}
@media print{.tv-legend__swatch{print-color-adjust:exact}}
`,
  tabs: `
.tv-tabs{font-family:${t("font-sans")};color:${t("text-primary")}}
.tv-tabs__list{display:flex;flex-wrap:wrap;gap:${t("space-1")};border-bottom:${t("hairline")} solid ${t("border-panel")}}
.tv-tabs__tab{min-height:var(--tv-target-min);min-width:var(--tv-target-min);padding:${t("space-2")} ${t("space-4")};border:0;border-bottom:${t("ring-width")} solid transparent;background:transparent;color:${t("text-muted")};font-family:${t("font-sans")};font-size:${t("size-label")};cursor:pointer}
.tv-tabs__tab:hover{background:${t("surface-glass")}}
.tv-tabs__tab[aria-selected="true"]{border-bottom-color:${t("link")};color:${t("text-primary")};font-weight:${t("weight-semibold")}}
.tv-tabs__panel{padding:${t("space-4")} 0}
@media print{.tv-tabs__list{display:none}.tv-tabs__panel[hidden]{display:block}.tv-tabs__panel::before{content:attr(data-label);display:block;font-weight:${t("weight-semibold")}}}
`,
} as const

/** Organism CSS, keyed by organism name (sheets R14 to R22). */
export const ORGANISM_CSS: Record<string, string> = {}

/** The CSS of every atom, in a fixed order, one rule per line. */
export function atomsCss(): string {
  return Object.values(ATOM_CSS)
    .map((s) => s.trim())
    .join("\n")
    .concat("\n")
}

/** Atoms, molecules and organisms: the stylesheet of the report and the gallery. */
export function componentsCss(): string {
  return [
    atomsCss(),
    ...Object.values(MOLECULE_CSS).map((x) => x.trim()),
    ...Object.values(ORGANISM_CSS).map((x) => x.trim()),
  ]
    .join("\n")
    .concat("\n")
}
