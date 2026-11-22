// The component gallery as one document (FR-11, D9): every atom, molecule and organism in every state, built by the same
// functions the report uses, in whichever theme the reader's system or the toggle selects. Pure; the node writer supplies CSS.
import { esc } from "../html"
import { COMPONENT_SCRIPT } from "../scripts"
import { GALLERY_CSS, galleryAtoms } from "./galleryAtoms"
import { GALLERY_MOLECULES_CSS, galleryMolecules } from "./galleryMolecules"
import { GALLERY_ORGANISMS_CSS, galleryOrganisms } from "./galleryOrganisms"

export type GalleryPageProps = {
  /** Fonts, tokens and component CSS (the design assets). */
  css: string
  title?: string
}

const TOGGLE_SCRIPT = `(function(){var b=document.getElementById("theme-toggle");if(!b)return;b.addEventListener("click",function(){var r=document.documentElement;var dark=r.dataset.theme==="dark"||(r.dataset.theme!=="light"&&!matchMedia("(prefers-color-scheme: light)").matches);r.dataset.theme=dark?"light":"dark"})})();`

export function galleryDocument(p: GalleryPageProps): string {
  const title = p.title ?? "Spandek component gallery"
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${p.css}${GALLERY_CSS}${GALLERY_MOLECULES_CSS}${GALLERY_ORGANISMS_CSS}body{margin:0;padding:var(--tv-space-8);background:var(--tv-surface-base);color:var(--tv-text-primary);font-family:var(--tv-font-sans)}.gallery-bar{display:flex;gap:var(--tv-space-4);align-items:center;justify-content:space-between;margin-bottom:var(--tv-space-6)}</style>
</head>
<body>
<main id="main">
<div class="gallery-bar"><h1>${esc(title)}</h1><button type="button" id="theme-toggle" class="tv-button tv-button--ghost" aria-label="Switch between light and dark theme">Theme</button></div>
<p>Every atom, molecule and organism in every state, built by the functions the report uses. Follows the system theme; the button switches it.</p>
${galleryAtoms()}
${galleryMolecules()}
${galleryOrganisms()}
</main>
<script>${COMPONENT_SCRIPT}</script>
<script>${TOGGLE_SCRIPT}</script>
</body>
</html>
`
}
