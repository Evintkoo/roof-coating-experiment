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
.tv-theme-toggle__state{display:inline-block;min-width:${t("space-8")};padding:0 ${t("space-2")};border:${t("hairline")} solid ${t("border-control")};border-radius:${t("radius-pill")};font-size:${t("size-small")};text-align:center}
.tv-theme-toggle[aria-pressed="true"] .tv-theme-toggle__state{background:${t("action-primary")};border-color:${t("action-primary")};color:${t("action-label")}}
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
.tv-badge--neutral{color:${t("text-primary")};border-color:${t("border-control")}}
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
  playControls: `
.tv-play{display:inline-flex;align-items:center;justify-content:center;gap:${t("space-2")};min-height:${t("target-min")};min-width:${t("target-min")};padding:${t("space-2")} ${t("space-4")};border:${t("hairline")} solid ${t("border-control")};border-radius:${t("radius-control")};background:${t("surface-glass")};color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-body")};font-weight:${t("weight-semibold")};cursor:pointer}
.tv-play:hover{background:${t("surface-raised")}}
.tv-play[data-state="playing"]{border-color:${t("link")}}
.tv-play__glyph{width:0;height:0;border-style:solid;border-width:${t("space-2")} 0 ${t("space-2")} ${t("space-3")};border-color:transparent transparent transparent ${t("text-primary")}}
.tv-play[data-state="playing"] .tv-play__glyph{width:${t("space-3")};height:${t("space-4")};border-width:0 ${t("space-1")};border-color:${t("text-primary")}}
.tv-play[data-state="ended"] .tv-play__glyph{border-left-color:${t("link")}}
.tv-scrub{flex:1 1 calc(${t("space-16")} * 2);min-width:0;min-height:${t("target-min")};accent-color:${t("action-primary")};cursor:pointer}
.tv-speed{display:inline-flex;align-items:center;gap:${t("space-2")};font-family:${t("font-sans")};font-size:${t("size-small")};color:${t("text-muted")}}
.tv-speed__select{min-height:${t("target-min")};padding:${t("space-1")} ${t("space-2")};border:${t("hairline")} solid ${t("border-control")};border-radius:${t("radius-control")};background:${t("surface-glass")};color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-body")}}
.tv-time{min-width:calc(${t("space-8")} * 2);font-family:${t("font-mono")};font-size:${t("size-body")};color:${t("text-primary")};text-align:center}
`,
  dayChart: `
.tv-daychart-frame{margin:0;min-width:0}
.tv-daychart{display:block;width:100%;height:auto;font-family:${t("font-sans")}}
.tv-daychart__grid{stroke:${t("border-panel")};stroke-width:1}
.tv-daychart__tick,.tv-daychart__axis{fill:${t("text-muted")};font-size:${t("size-small")}}
.tv-daychart__band{fill:${t("viz-3")};fill-opacity:0.18;stroke:none}
.tv-daychart__line{fill:none;stroke-width:2}
.tv-daychart__line--recipe{stroke:${t("viz-recommended")}}
.tv-daychart__line--bare{stroke:${t("viz-baseline")};stroke-dasharray:6 4}
.tv-daychart__cursor{stroke:${t("text-primary")};stroke-width:1}
.tv-daychart__dot--recipe{fill:${t("viz-recommended")};stroke:${t("surface-base")};stroke-width:1}
.tv-daychart__dot--bare{fill:${t("viz-baseline")};stroke:${t("surface-base")};stroke-width:1}
.tv-fan__line{fill:none;stroke:${t("viz-3")};stroke-width:1;stroke-opacity:0.35}
.tv-daychart__legend{display:flex;flex-wrap:wrap;gap:${t("space-3")};margin-top:${t("space-2")};color:${t("text-muted")};font-size:${t("size-small")}}
.tv-daychart__key::before{content:"";display:inline-block;width:${t("space-4")};height:0;margin-inline-end:${t("space-1")};border-top:${t("ring-width")} solid ${t("viz-recommended")};vertical-align:middle}
.tv-daychart__key--bare::before{border-top-style:dashed;border-top-color:${t("viz-baseline")}}
.tv-daychart__key--band::before{height:${t("space-2")};border-top:0;background:${t("viz-3")};opacity:0.35}
`,
  laneChart: `
.tv-lane-frame{margin:0;min-width:0}
.tv-lane{display:block;width:100%;height:auto;font-family:${t("font-sans")}}
.tv-lane__grid{stroke:${t("border-panel")};stroke-width:1}
.tv-lane__tick,.tv-lane__missing{fill:${t("text-muted")};font-size:${t("size-small")}}
.tv-lane__title{fill:${t("text-primary")};font-size:${t("size-small")};font-weight:${t("weight-semibold")}}
.tv-lane__line{fill:none;stroke-width:2}
.tv-lane__line--recipe{stroke:${t("viz-recommended")}}
.tv-lane__line--c0{stroke:${t("viz-baseline")};stroke-dasharray:6 4}
.tv-lane__line--c1{stroke:${t("viz-3")};stroke-dasharray:2 3}
.tv-lane__cursor{stroke:${t("text-primary")};stroke-width:1}
`,
  sweepChart: `
.tv-sweep-frame{margin:0;min-width:0}
.tv-sweep{display:block;width:100%;height:auto;font-family:${t("font-sans")}}
.tv-sweep__grid{stroke:${t("border-panel")};stroke-width:1}
.tv-sweep__tick,.tv-sweep__axis,.tv-sweep__missing{fill:${t("text-muted")};font-size:${t("size-small")}}
.tv-sweep__title{fill:${t("text-primary")};font-size:${t("size-small")};font-weight:${t("weight-semibold")}}
.tv-sweep__band{fill:${t("viz-3")};fill-opacity:0.18;stroke:none}
.tv-sweep__line{fill:none;stroke-width:2}
.tv-sweep__line--recipe{stroke:${t("viz-recommended")}}
.tv-sweep__line--c0{stroke:${t("viz-baseline")};stroke-dasharray:6 4}
.tv-sweep__line--c1{stroke:${t("viz-3")};stroke-dasharray:2 3}
.tv-sweep__cursor{stroke:${t("text-primary")};stroke-width:1}
.tv-sweep__dot{fill:${t("viz-recommended")};stroke:${t("surface-base")};stroke-width:1}
.tv-sweep__legend{display:flex;flex-wrap:wrap;align-items:center;gap:${t("space-2")};margin-top:${t("space-1")};color:${t("text-muted")};font-size:${t("size-small")}}
`,
  fluxSchematic: `
.tv-flux{display:block;width:100%;max-width:calc(${t("space-16")} * 4.75);justify-self:center;height:auto;font-family:${t("font-sans")}}
.tv-flux__roof{fill:${t("viz-baseline")};fill-opacity:0.5;stroke:${t("text-muted")};stroke-width:1}
.tv-flux__roof-label,.tv-flux__label{fill:${t("text-primary")};font-size:${t("size-small")}}
.tv-flux__value{fill:${t("text-muted")};font-size:${t("size-small")}}
.tv-flux__arrow line{stroke:${t("text-primary")};stroke-width:3}
.tv-flux__arrow--incident line{stroke:${t("status-proxy")}}
.tv-flux__arrow--reflected line{stroke:${t("viz-3")}}
.tv-flux__arrow--absorbed line{stroke:${t("viz-recommended")}}
.tv-flux__arrow--conducted line{stroke:${t("status-stop")}}
.tv-flux__head{fill:${t("text-primary")}}
`,
  computingIndicator: `
.tv-computing{display:inline-flex;align-items:center;gap:${t("space-2")};min-height:${t("target-min")};color:${t("text-muted")};font-family:${t("font-sans")};font-size:${t("size-small")}}
.tv-computing__bar{position:relative;display:inline-block;overflow:hidden;width:${t("space-8")};height:${t("space-1")};border-radius:${t("radius-pill")};background:${t("border-panel")}}
.tv-computing[data-state="busy"] .tv-computing__bar::after{content:"";position:absolute;inset:0;width:50%;border-radius:${t("radius-pill")};background:${t("link")};animation:tv-sweep calc(${t("motion-base")} * 5) linear infinite}
.tv-computing[data-state="idle"]{opacity:0.7}
@keyframes tv-sweep{from{transform:translateX(-100%)}to{transform:translateX(200%)}}
@media (prefers-reduced-motion:reduce){.tv-computing[data-state="busy"] .tv-computing__bar::after{animation:none;width:100%}}
`,
  laneMeter: `
.tv-lanes{display:grid;gap:${t("space-1")};margin:0;padding:0;list-style:none;min-width:0}
.tv-lane{display:grid;grid-template-columns:max-content max-content minmax(0,1fr) max-content;align-items:center;gap:${t("space-2")};font-family:${t("font-sans")};font-size:${t("size-small")};color:${t("text-primary")}}
.tv-lane__state{color:${t("text-muted")}}
.tv-lane__bar{display:block;height:${t("space-2")};border-radius:${t("radius-pill")};background:${t("border-panel")};overflow:hidden}
.tv-lane__fill{display:block;height:100%;background:${t("viz-3")}}
.tv-lane[data-state="failed"] .tv-lane__fill{background:${t("status-stop")}}
.tv-lane[data-state="failed"] .tv-lane__state{color:${t("status-stop")};font-weight:${t("weight-semibold")}}
.tv-lane__count{font-family:${t("font-mono")};color:${t("text-muted")}}
`,
  cellGrid: `
.tv-cellgrid{display:block;width:100%;height:auto;max-height:calc(${t("space-16")} * 4)}
.tv-cell{stroke:none}
.tv-cell--empty{fill:none;stroke:${t("border-panel")};stroke-width:0.5}
.tv-cell--failed{fill:${t("status-stop")}}
.tv-cell--b0{fill:${t("viz-seq-7")}}
.tv-cell--b1{fill:${t("viz-seq-6")}}
.tv-cell--b2{fill:${t("viz-seq-5")}}
.tv-cell--b3{fill:${t("viz-seq-4")}}
.tv-cell--b4{fill:${t("viz-seq-3")}}
.tv-cell--b5{fill:${t("viz-seq-2")}}
.tv-cell--b6{fill:${t("viz-seq-1")}}
`,
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
.tv-interval__track{position:relative;height:${t("space-2")};border-radius:${t("radius-pill")};background:${t("surface-raised")};margin:${t("space-1")} 0}
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
  sliderField: `
.tv-slider{display:grid;gap:${t("space-1")};font-family:${t("font-sans")};color:${t("text-primary")}}
.tv-slider__label{font-size:${t("size-label")};font-weight:${t("weight-semibold")}}
.tv-slider__unit{color:${t("text-muted")};font-size:${t("size-small")}}
.tv-slider__row{display:flex;flex-wrap:wrap;align-items:center;gap:${t("space-2")} ${t("space-4")}}
.tv-slider__range{flex:1 1 ${t("space-16")};min-width:${t("space-16")};min-height:var(--tv-target-min);accent-color:${t("link")}}
.tv-slider__number{width:${t("space-16")};min-height:var(--tv-target-min);padding:${t("space-2")} ${t("space-3")};border:${t("hairline")} solid ${t("border-control")};border-radius:${t("radius-control")};background:${t("surface-glass")};color:${t("text-primary")};font-family:${t("font-mono")};font-size:${t("size-label")}}
.tv-slider__out{min-width:${t("space-12")};font-family:${t("font-mono")};font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.tv-slider__msg{margin:0;color:${t("status-stop")};font-size:${t("size-small")}}
.tv-slider[data-state="error"] .tv-slider__number{border-color:${t("status-stop")}}
.tv-slider[data-state="disabled"]{opacity:0.6}
`,
  tableCell: `
.tv-cell{padding:${t("space-2")} ${t("space-3")};border-bottom:${t("hairline")} solid ${t("border-panel")};color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-small")};line-height:1.5;text-align:left;vertical-align:middle}
.tv-cell--number{font-family:${t("font-mono")};font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.tv-cell--index .tv-badge{margin-inline-start:${t("space-1")};font-size:${t("size-micro")}}
.tv-cell--mono{font-family:${t("font-mono")};overflow-wrap:anywhere;word-break:break-all}
.tv-cell__interval,.tv-cell--empty{color:${t("text-muted")}}
.tv-visually-hidden{position:absolute;width:${t("hairline")};height:${t("hairline")};margin:calc(${t("hairline")} * -1);padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`,
} as const

/** Organism CSS, keyed by organism name (sheets R14 to R22). */
export const ORGANISM_CSS: Record<string, string> = {
  watchDay: `
.tv-watchday,.tv-watchscreen{display:grid;gap:${t("space-3")};min-width:0;color:${t("text-primary")};font-family:${t("font-sans")}}
.tv-watchday__label{display:flex;flex-wrap:wrap;align-items:center;gap:${t("space-4")}}
.tv-watchday__controls,.tv-watchscreen__controls{display:flex;flex-wrap:wrap;align-items:center;gap:${t("space-2")}}
.tv-watchday__stage{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:${t("space-4")};align-items:start}
.tv-watchday__readouts{display:grid;grid-template-columns:repeat(auto-fit,minmax(calc(${t("space-16")} * 2),1fr));gap:${t("space-2")};margin:0}
.tv-watchday__read dt{color:${t("text-muted")};font-size:${t("size-small")}}
.tv-watchday__read dd{margin:0;font-family:${t("font-mono")}}
@media (max-width:640px){.tv-watchday__stage{grid-template-columns:minmax(0,1fr)}}
`,
  watchScreening: `
.tv-watchscreen__stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:${t("space-4")};align-items:start}
.tv-watchscreen__draws input{width:${t("target-min")};height:${t("target-min")};margin:0;flex:none;accent-color:${t("action-primary")}}
.tv-watchscreen__draws{display:inline-flex;align-items:center;gap:${t("space-2")};min-height:${t("target-min")};font-size:${t("size-small")};color:${t("text-muted")}}
.tv-watchscreen__summary,.tv-watchscreen__check{max-width:92ch;margin:0;font-size:${t("size-small")}}
.tv-watchscreen__check{color:${t("text-muted")}}
@media (max-width:640px){.tv-watchscreen__stage{grid-template-columns:minmax(0,1fr)}}
`,
  navRail: `
.tv-skip{position:absolute;min-height:var(--tv-target-min);display:inline-flex;align-items:center;inset-inline-start:${t("space-4")};top:${t("space-2")};z-index:3;padding:${t("space-2")} ${t("space-4")};border-radius:${t("radius-control")};background:${t("action-primary")};color:${t("action-label")};font-family:${t("font-sans")};font-weight:${t("weight-semibold")};text-decoration:none;transform:translateY(-300%)}
.tv-skip:focus{transform:none}
.tv-rail{position:sticky;top:0;z-index:1;display:flex;flex-direction:row;align-items:center;gap:${t("space-2")};overflow-x:auto;padding:${t("space-2")} ${t("space-4")};border-bottom:${t("hairline")} solid ${t("border-panel")};background:${t("surface-base")};font-family:${t("font-sans")}}
.tv-rail__brand{flex-shrink:0;margin-inline-end:${t("space-4")};color:${t("text-primary")};font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.tv-rail .tv-navlink{flex-shrink:0;justify-content:flex-start}
@media (min-width:64em){
.tv-shell{display:grid;grid-template-columns:calc(${t("space-16")} * 3.25) minmax(0,1fr);align-items:start}
.tv-rail{flex-direction:column;align-items:stretch;align-self:start;height:100vh;overflow-x:visible;overflow-y:auto;padding:${t("space-8")} ${t("space-4")};border-bottom:0;border-inline-end:${t("hairline")} solid ${t("border-panel")}}
.tv-rail__brand{margin:0 0 ${t("space-4")}}
}
@media print{.tv-rail,.tv-skip{display:none}.tv-shell{display:block}}
`,
  heroVerdict: `
.tv-hero{padding:${t("space-8")} 0;color:${t("text-primary")};font-family:${t("font-sans")}}
.tv-hero__verdict{max-width:24ch;margin:0 0 ${t("space-4")};font-size:${t("size-display")};font-weight:${t("weight-semibold")};line-height:1.15}
.tv-hero__lead{max-width:70ch;margin:0 0 ${t("space-3")};font-size:${t("size-body")}}
.tv-hero__recipes{display:grid;grid-template-columns:minmax(0,1fr);gap:${t("space-4")};margin:${t("space-6")} 0}
.tv-hero__note{max-width:70ch;margin:0 0 ${t("space-2")};color:${t("text-muted")};font-size:${t("size-small")}}
.tv-hero__honesty{margin:${t("space-4")} 0}
.tv-hero__limits{margin:0}
@media (min-width:64em){.tv-hero__recipes{grid-template-columns:repeat(3,minmax(0,1fr))}}
`,
  recipeCard: `
.tv-recipe{display:grid;gap:${t("space-3")};align-content:start;min-width:0;padding:${t("space-4")};border:${t("hairline")} solid ${t("border-glass")};border-radius:${t("radius-card")};background:${t("surface-glass")}}
.tv-recipe--recommended{border-color:${t("viz-recommended")}}
.tv-recipe__head{display:flex;flex-wrap:wrap;align-items:center;gap:${t("space-2")}}
.tv-recipe__role{margin:0;font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.tv-recipe__head .tv-code{margin-inline-start:auto}
.tv-recipe__badges{display:flex;flex-wrap:wrap;gap:${t("space-2")};margin:0}
@media print{.tv-recipe{background:none;border-color:${t("text-primary")};break-inside:avoid}}
`,
  findingList: `
.tv-findings{display:grid;gap:${t("space-3")};margin:${t("space-4")} 0;padding-inline-start:${t("space-6")};color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-body")}}
.tv-finding{max-width:92ch;padding-inline-start:${t("space-2")}}
.tv-finding__label{font-weight:${t("weight-semibold")}}
.tv-finding__src{display:block;margin-top:${t("space-1")};color:${t("text-muted")};font-family:${t("font-mono")};font-size:${t("size-small")};overflow-wrap:anywhere}
.tv-term{color:${t("link")}}
.tv-term:hover{color:${t("link-hover")}}
`,
  dataTable: `
.tv-table{position:relative;max-width:100%;overflow-x:auto;margin:${t("space-4")} 0}
.tv-datatable{width:100%;border-collapse:collapse;font-family:${t("font-sans")}}
.tv-datatable__caption{padding:${t("space-2")} ${t("space-3")};color:${t("text-primary")};font-size:${t("size-body")};font-weight:${t("weight-semibold")};text-align:left}
.tv-table__head{background:${t("surface-base")};color:${t("text-muted")};font-size:${t("size-label")};font-weight:${t("weight-semibold")};font-family:${t("font-sans")}}
.tv-table__head.tv-cell--number{font-family:${t("font-sans")}}
.tv-table__sort{display:inline-flex;align-items:center;gap:${t("space-2")};min-height:var(--tv-target-min);min-width:var(--tv-target-min);padding:${t("space-1")} ${t("space-2")};border:0;border-radius:${t("radius-control")};background:transparent;color:inherit;font:inherit;cursor:pointer}
.tv-table__sort:hover{background:${t("surface-glass")}}
.tv-table__sort::after{content:"";width:${t("space-2")};height:${t("space-2")};border-right:${t("ring-width")} solid ${t("text-muted")};border-bottom:${t("ring-width")} solid ${t("text-muted")};transform:rotate(45deg);opacity:0.5}
[aria-sort="ascending"] .tv-table__sort::after{border-color:${t("link")};transform:rotate(-135deg);opacity:1}
[aria-sort="descending"] .tv-table__sort::after{border-color:${t("link")};opacity:1}
@media print{.tv-table{overflow:visible}.tv-table__sort::after{display:none}}
`,
  glossary: `
.tv-glossary{color:${t("text-primary")};font-family:${t("font-sans")}}
.tv-glossary__list{display:grid;margin:0}
.tv-glossary__entry{padding:${t("space-3")} ${t("space-2")};border-bottom:${t("hairline")} solid ${t("border-panel")}}
.tv-glossary__entry:target,.tv-glossary__entry:has(dt:target){background:${t("surface-raised")};border-inline-start:${t("space-1")} solid ${t("link")}}
.tv-glossary dt{font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.tv-glossary dd{max-width:70ch;margin:${t("space-1")} 0 0;font-size:${t("size-small")}}
.tv-glossary dd p{margin:0 0 ${t("space-1")}}
.tv-glossary__unit{color:${t("text-muted")};font-family:${t("font-sans")}}
`,
  provenance: `
.tv-provenance{color:${t("text-primary")};font-family:${t("font-sans")}}
.tv-provenance__title{margin:${t("space-4")} 0 ${t("space-2")};font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.tv-provenance__licence{margin:0 0 ${t("space-4")};white-space:pre-wrap;overflow-wrap:anywhere;font-family:${t("font-mono")};font-size:${t("size-small")};color:${t("text-muted")}}
.tv-provenance__note,.tv-provenance__none{max-width:92ch;margin:0 0 ${t("space-2")};color:${t("text-muted")};font-size:${t("size-small")};overflow-wrap:anywhere}
`,
  siteBenefitPanel: `
.tv-sites{color:${t("text-primary")};font-family:${t("font-sans")}}
.tv-sites__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(calc(${t("space-16")} * 3),1fr));gap:${t("space-4")};margin:${t("space-4")} 0}
.tv-site{display:grid;gap:${t("space-3")};align-content:start;min-width:0;padding:${t("space-4")};border:${t("hairline")} solid ${t("border-glass")};border-radius:${t("radius-card")};background:${t("surface-glass")}}
.tv-site__name{margin:0;font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.tv-site__scenario{margin:0}
.tv-sites__loss{max-width:92ch;margin:${t("space-2")} 0 ${t("space-4")};color:${t("text-muted")};font-size:${t("size-small")}}
.tv-sites__caveats{display:grid;gap:${t("space-3")}}
@media print{.tv-site{background:none;border-color:${t("text-primary")};break-inside:avoid}}
`,
  budgetPanel: `
.tv-budget{display:grid;gap:${t("space-4")};color:${t("text-primary")};font-family:${t("font-sans")}}
.tv-budget__profiles{margin:0;padding:0;border:0}
.tv-budget__profiles legend{padding:0;margin:0 0 ${t("space-2")};font-size:${t("size-label")};font-weight:${t("weight-semibold")}}
.tv-budget__chips{display:flex;flex-wrap:wrap;gap:${t("space-2")}}
.tv-budget__result{display:grid;gap:${t("space-3")};padding:${t("space-4")};border:${t("hairline")} solid ${t("border-glass")};border-radius:${t("radius-card")};background:${t("surface-glass")}}
.tv-budget__sentence{max-width:92ch;margin:0;font-size:${t("size-body")}}
@media print{.tv-budget__result{background:none;border-color:${t("text-primary")}}}
`,
}

export const SCHEMATIC_CSS = `
.tv-schem{margin:0;display:grid;gap:${t("space-2")};min-width:0;font-family:${t("font-sans")}}
.tv-schem svg{width:100%;height:auto;max-width:calc(${t("space-16")} * 4.5)}
.tv-schem__topcoat{fill:${t("viz-1")}}
.tv-schem__midcoat{fill:${t("text-primary")};fill-opacity:0.22;stroke:${t("text-muted")};stroke-width:1}
.tv-schem__primer{fill:${t("viz-3")}}
.tv-schem__substrate{fill:${t("viz-baseline")}}
.tv-schem__leader{fill:none;stroke:${t("text-muted")};stroke-width:1}
.tv-schem__label{fill:${t("text-primary")}}
.tv-schem__caption{color:${t("text-muted")};font-size:${t("size-small")}}
`

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
    SCHEMATIC_CSS.trim(),
    ...Object.values(ORGANISM_CSS).map((x) => x.trim()),
  ]
    .join("\n")
    .concat("\n")
}
