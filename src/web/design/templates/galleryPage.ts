// The component gallery as one document (FR-11, D9): every atom, molecule and organism in every state, built by the same
// functions the report uses, in light by default, in dark when the toggle says so, and both themes side by side at the top. Pure; the node writer supplies CSS.
import { badge } from "../atoms/badge"
import { button } from "../atoms/button"
import { esc } from "../html"
import { callout } from "../molecules/callout"
import { intervalBar } from "../molecules/intervalBar"
import { COMPONENT_SCRIPT } from "../scripts"
import { THEME_INIT_SCRIPT, themeToggle } from "../theme"
import { GALLERY_CSS, galleryAtoms } from "./galleryAtoms"
import { GALLERY_MOLECULES_CSS, galleryMolecules } from "./galleryMolecules"
import { GALLERY_ORGANISMS_CSS, galleryOrganisms } from "./galleryOrganisms"

export type GalleryPageProps = {
  /** Fonts, tokens and component CSS (the design assets). */
  css: string
  title?: string
}

/** One theme pane: a sample of the roles (text, muted, link, status, badges, callouts, an interval bar, buttons) in the theme asked for. */
function themePane(theme: "light" | "dark"): string {
  return `<div class="gallery-pane" data-theme="${theme}" data-pane="${theme}"><h3>${theme === "light" ? "Light" : "Dark"} theme</h3><p>Body text on the page surface. <span class="gallery-muted">Muted text.</span> <a href="#main">A link</a>.</p><p><span class="gallery-go">Go</span> <span class="gallery-stop">Stop</span> <span class="gallery-caution">Caution</span></p><p>${badge({ tone: "proxy", label: "PROXY" })} ${badge({ tone: "scenario", label: "Scenario" })} ${badge({ tone: "nominal", label: "Nominal" })} ${badge({ tone: "go", label: "Pass" })} ${badge({ tone: "stop", label: "Fail" })}</p>${callout({ tone: "info", body: "A note in this theme." })}${callout({ tone: "caution", body: "A caution in this theme." })}${intervalBar({ lo: 4, hi: 9, value: 6, min: 0, max: 20, label: "Sample interval" })}<p>${button({ label: "Primary" })} ${button({ label: "Ghost", variant: "ghost" })}</p></div>`
}

export const GALLERY_PAGE_CSS = `a{color:var(--tv-link)}a:hover{color:var(--tv-link-hover)}body{margin:0;padding:var(--tv-space-8);background:var(--tv-surface-base);color:var(--tv-text-primary);font-family:var(--tv-font-sans)}.gallery-bar{display:flex;gap:var(--tv-space-4);align-items:center;justify-content:space-between;margin-bottom:var(--tv-space-6)}.gallery-compare{display:grid;grid-template-columns:repeat(auto-fit,minmax(calc(var(--tv-space-16) * 4),1fr));gap:var(--tv-space-4);margin:0 0 var(--tv-space-8)}.gallery-pane{background:var(--tv-surface-base);color:var(--tv-text-primary);border:var(--tv-hairline) solid var(--tv-border-panel-strong);border-radius:var(--tv-radius-panel);padding:var(--tv-space-4)}.gallery-muted{color:var(--tv-text-muted)}.gallery-go{color:var(--tv-status-go)}.gallery-stop{color:var(--tv-status-stop)}.gallery-caution{color:var(--tv-status-proxy)}`

export function galleryDocument(p: GalleryPageProps): string {
  const title = p.title ?? "Spandek component gallery"
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>${THEME_INIT_SCRIPT}</script>
<title>${esc(title)}</title>
<style>${p.css}${GALLERY_CSS}${GALLERY_MOLECULES_CSS}${GALLERY_ORGANISMS_CSS}${GALLERY_PAGE_CSS}</style>
</head>
<body>
<main id="main">
<div class="gallery-bar"><h1>${esc(title)}</h1>${themeToggle()}</div>
<p>Every atom, molecule and organism in every state, built by the functions the report uses. Opens in the light theme whatever the system says; the Dark mode button switches it and remembers the choice. Both themes side by side:</p>
<section class="gallery-compare" aria-label="Light and dark theme side by side">${themePane("light")}${themePane("dark")}</section>
${galleryAtoms()}
${galleryMolecules()}
${galleryOrganisms()}
</main>
<script>${COMPONENT_SCRIPT}</script>
</body>
</html>
`
}
