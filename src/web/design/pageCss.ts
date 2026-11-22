// Page-level CSS of the report: the reading column, section rhythm, the figure plots, the explorer and the live simulator. Token only
// like css.ts (FR-5); the components' own rules stay in css.ts. Browser and Node safe.
import { tv } from "./tokens"

const t = tv

export const PAGE_CSS = `
body{margin:0;background:${t("surface-base")};color:${t("text-primary")};font-family:${t("font-sans")};font-size:${t("size-body")};line-height:1.55}
a{color:${t("link")}}
a:hover{color:${t("link-hover")}}
code{font-family:${t("font-mono")};font-size:0.92em;overflow-wrap:anywhere}
.page{position:relative;min-width:0;padding:0 ${t("space-4")} ${t("space-16")}}
.page>*{max-width:calc(${t("space-16")} * 16)}
.page__tools{box-sizing:border-box;display:flex;align-items:center}
@media (max-width:63.99em){html{scroll-padding-top:calc(${t("target-min")} + ${t("space-2")} * 3 + ${t("hairline")})}.tv-rail__brand{margin-inline-end:${t("space-2")};font-size:${t("size-label")}}.page__tools{position:static;height:auto;justify-content:flex-end;padding:${t("space-2")} 0 0;background:none;border-bottom:0}.tv-rail{background:linear-gradient(to right,${t("surface-base")},transparent) left/${t("space-6")} 100% no-repeat local,linear-gradient(to left,${t("surface-base")},transparent) right/${t("space-6")} 100% no-repeat local,linear-gradient(to right,color-mix(in srgb,${t("text-primary")} 28%,transparent),transparent) left/${t("space-2")} 100% no-repeat scroll,linear-gradient(to left,color-mix(in srgb,${t("text-primary")} 28%,transparent),transparent) right/${t("space-2")} 100% no-repeat scroll,${t("surface-base")}}}
@media (min-width:64em){.page__tools{position:absolute;top:${t("space-3")};right:${t("space-4")};height:auto;padding:0;background:none;border-bottom:0}}
.page-section{padding:${t("space-6")} 0 ${t("space-3")};border-top:${t("hairline")} solid ${t("border-panel")}}
.page-section:first-of-type{border-top:0}
.page-section>h2{margin:0 0 ${t("space-3")};font-size:${t("size-heading")};font-weight:${t("weight-semibold")};line-height:1.2}
.page-section h3{margin:${t("space-6")} 0 ${t("space-2")};font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.page-section p,.page-section li{max-width:92ch;overflow-wrap:anywhere}
.page-lead{margin:0 0 ${t("space-3")};max-width:92ch}
.page-hint{color:${t("text-muted")};font-size:${t("size-small")}}
.page-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:${t("space-4")};margin:${t("space-4")} 0}
.page-layers{margin:${t("space-3")} 0;padding:0;list-style:none;display:grid;grid-template-columns:minmax(0,1fr);gap:${t("space-2")}}
.page-layers li{padding:${t("space-3")} ${t("space-4")};border:${t("hairline")} solid ${t("border-panel")};border-radius:${t("radius-control")}}
.page-layers strong{display:block}
.page-limits{columns:1;margin:${t("space-3")} 0;padding-inline-start:${t("space-6")}}
.page-limits li{break-inside:avoid;margin:0 0 ${t("space-2")}}
.page-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:${t("space-3")}}
.page-cards article{min-width:0}
.page-cards article{padding:0 ${t("space-4")} ${t("space-3")}}
.page-cards h4,.page-cards h5,.page-cards h6{margin:${t("space-4")} 0 ${t("space-2")}}
.page-cards .tv-cell--text{text-align:left}
.page-cards ul{padding-inline-start:${t("space-6")}}
.tv-table{max-width:100%;overflow-x:auto}
.tv-hero{padding:${t("space-4")} 0 ${t("space-2")}}
.tv-hero__verdict{max-width:32ch;font-size:calc(${t("size-display")} * 0.58);margin-bottom:${t("space-2")}}
.tv-hero .tv-hero__lead{max-width:112ch;font-size:${t("size-body")};margin-bottom:${t("space-2")}}
.tv-hero__recipes{margin:${t("space-3")} 0 ${t("space-2")};gap:${t("space-3")}}
.tv-hero .tv-recipe{gap:${t("space-2")};padding:${t("space-3")} ${t("space-4")}}
.tv-hero .tv-hero__note{max-width:132ch;margin:0 0 ${t("space-1")}}
.tv-hero__limits .tv-button{max-width:100%;white-space:normal;text-align:center}
.tv-hero__honesty{margin:${t("space-3")} 0 ${t("space-2")}}
.tv-recipe__head{flex-wrap:wrap}
.scroll{overflow-x:auto;max-width:100%}
.scroll table,.page-cards table{border-collapse:collapse;font-size:${t("size-small")}}
.scroll th,.scroll td,.page-cards th,.page-cards td{border:${t("hairline")} solid ${t("border-panel")};padding:${t("space-1")} ${t("space-2")};text-align:right;vertical-align:top}
.scroll th,.page-cards th{background:${t("surface-glass")};text-align:left}
.scroll td.txt,.page-cards td.txt,.scroll td:first-child{text-align:left}
.fig{width:100%;min-height:calc(${t("space-16")} * 4)}
.fig--wide{min-width:calc(${t("space-16")} * 9)}
.fig--tall{min-height:calc(${t("space-16")} * 6)}
.page-explore .tv-table{max-height:calc(${t("space-16")} * 8);overflow:auto}
.page-explore thead th{position:sticky;top:0;background:${t("surface-elevated")}}
.tv-datatable tr[hidden]{display:none}
.page-controls{display:flex;flex-wrap:wrap;gap:${t("space-2")} ${t("space-4")};align-items:center;margin:${t("space-2")} 0}
select,input[type="number"]:not(.tv-slider__number){font:inherit;color:${t("text-primary")};background:${t("surface-elevated")};border:${t("hairline")} solid ${t("border-control")};border-radius:${t("radius-control")};min-height:${t("target-min")};padding:${t("space-1")} ${t("space-3")};max-width:100%}
input[type="range"]{width:100%;min-height:${t("target-min")};margin:0;accent-color:${t("action-primary")}}
details#debug{margin:${t("space-3")} 0}
details#debug>summary{display:flex;align-items:center;min-height:${t("target-min")};cursor:pointer}
pre{overflow-x:auto;max-width:100%;font-family:${t("font-mono")};font-size:${t("size-small")}}
.live{display:grid;grid-template-columns:minmax(0,1fr);gap:${t("space-4")};align-items:start}
.ctl{border:${t("hairline")} solid ${t("border-panel")};border-radius:${t("radius-panel")};margin:0 0 ${t("space-3")};padding:${t("space-1")} ${t("space-3")} ${t("space-3")};min-width:0}
.ctl legend{font-weight:${t("weight-semibold")};padding:0 ${t("space-1")}}
.srow{display:grid;grid-template-columns:minmax(0,1fr) calc(${t("space-16")} * 1.6);gap:${t("space-1")} ${t("space-2")};align-items:center;margin:${t("space-2")} 0}
.srow label{grid-column:1 / -1;font-size:${t("size-small")}}
.ctl select{width:100%;margin:${t("space-2")} 0}
.check{display:flex;align-items:center;gap:${t("space-2")};min-height:${t("target-min")}}
.check input{width:${t("space-6")};height:${t("space-6")};margin:0;flex:none;accent-color:${t("action-primary")}}
.live-status--fail{margin:${t("space-2")} 0;padding:${t("space-3")} ${t("space-4")};border:${t("hairline")} solid ${t("status-stop")};border-radius:${t("radius-control")};color:${t("status-stop")};font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(calc(${t("space-16")} * 2.4),1fr));gap:${t("space-3")};margin:${t("space-2")} 0}
.tile{background:${t("surface-glass")};border:${t("hairline")} solid ${t("border-glass")};border-radius:${t("radius-card")};padding:${t("space-3")} ${t("space-4")};min-width:0}
.tile-label{font-size:${t("size-small")};color:${t("text-muted")}}
.tile-value{font-family:${t("font-mono")};font-size:${t("size-heading")};font-weight:${t("weight-semibold")};overflow-wrap:anywhere}
.tile-range{font-size:${t("size-small")};color:${t("text-muted")}}
.parcoords .axis path.domain,.parcoords .axis .tick line,.parcoords .axis line{stroke:${t("text-muted")} !important}
.tv-slider__number{width:calc(${t("space-16")} * 1.6)}
.tv-recipe--full{grid-template-columns:repeat(auto-fit,minmax(calc(${t("space-16")} * 2.6),1fr))}
.tv-recipe--full>header,.tv-recipe--full>dl,.tv-recipe--full>.tv-recipe__badges{grid-column:1 / -1}
.tv-datatable th:first-child,.tv-datatable td:first-child{min-width:calc(${t("space-16")} * 3)}
@media (min-width:48em){.page-layers{grid-template-columns:repeat(3,minmax(0,1fr))}.tv-sites__grid{grid-template-columns:repeat(auto-fit,minmax(calc(${t("space-16")} * 2.2),1fr))}.page-limits{columns:3}.page-grid--3{grid-template-columns:repeat(3,minmax(0,1fr))}column-gap:${t("space-8")}}
@media (min-width:64em){.page{padding:0 ${t("space-8")} ${t("space-16")}}.live{grid-template-columns:minmax(0,calc(${t("space-16")} * 6)) minmax(0,1fr)}}
@media print{.page__tools{display:none}.page-section{break-inside:avoid-page}.fig{min-height:0}.page-explore .tv-table{max-height:none}}
`
