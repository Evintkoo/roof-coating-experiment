// The atoms part of the component gallery (FR-11, D9): every atom in every state, built by the same functions the report uses.
// A fragment, not a page: the gallery page template (Task 6) and the Chrome test wrap it. Browser and Node safe.
import { BADGE_TONES, badge } from "../atoms/badge"
import { BUTTON_STATES, BUTTON_VARIANTS, button } from "../atoms/button"
import { CHIP_STATES, chip } from "../atoms/chip"
import { CODE_VARIANTS, codeBlock } from "../atoms/codeBlock"
import { ICON_NAMES, icon } from "../atoms/icon"
import { logo } from "../atoms/logo"
import { NAVLINK_STATES, navLink } from "../atoms/navLink"
import { SECTION_LABEL_VARIANTS, sectionLabel } from "../atoms/sectionLabel"
import { esc } from "../html"
import { tv } from "../tokens"

export type GalleryCell = {
  atom: string
  state: string
  /** Whether the sample is a keyboard target (it must be at least `target-min` square). */
  interactive: boolean
  html: string
}

const t = tv
export const GALLERY_CSS = `
.tv-gallery{color:${t("text-primary")};font-family:${t("font-sans")}}
.tv-gallery__atom{margin:0 0 ${t("space-8")}}
.tv-gallery__title{margin:0 0 ${t("space-4")};font-size:${t("size-body")};font-weight:${t("weight-semibold")}}
.tv-gallery__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${t("space-16")},1fr));gap:${t("space-4")}}
.tv-gallery__cell{margin:0;padding:${t("space-3")};border:${t("hairline")} solid ${t("border-panel")};border-radius:${t("radius-panel")};background:${t("surface-card")}}
.tv-gallery__sample{display:flex;align-items:center;min-height:${t("target-min")};margin:0 0 ${t("space-2")}}
.tv-gallery__cap{margin:0;color:${t("text-muted")};font-size:${t("size-small")}}
`

const INTERACTIVE = new Set(["Button", "NavLink"])

/** Every atom in every state: the single list the gallery, its tests and the Chrome test are built from. */
export function galleryAtomCells(): GalleryCell[] {
  const cells: GalleryCell[] = []
  const add = (
    atom: string,
    state: string,
    html: string,
    interactive = INTERACTIVE.has(atom),
  ) => cells.push({ atom, state, interactive, html })
  for (const variant of BUTTON_VARIANTS)
    for (const state of BUTTON_STATES)
      add(
        "Button",
        `${variant} ${state}`,
        button({ label: "Run", variant, state }),
      )
  add("Button", "link", button({ label: "Limits", href: "#limits" }))
  add(
    "Button",
    "link external",
    button({
      label: "Docs",
      href: "https://example.org",
      external: true,
      variant: "ghost",
    }),
  )
  add("Button", "icon", button({ label: "Next", icon: "arrow-right" }))
  for (const name of ICON_NAMES) add("Icon", name, icon({ name }), false)
  add("Logo", "default", logo({}), true)
  for (const state of NAVLINK_STATES)
    add(
      "NavLink",
      state,
      navLink({ label: "Verdict", href: "#verdict", state }),
    )
  for (const variant of SECTION_LABEL_VARIANTS)
    add(
      "SectionLabel",
      variant,
      sectionLabel({ label: "How the layers work", variant }),
      false,
    )
  for (const tone of BADGE_TONES)
    add(
      "Badge",
      tone,
      badge({ tone, label: tone === "proxy" ? "PROXY" : tone }),
      false,
    )
  for (const state of CHIP_STATES)
    add("Chip", state, chip({ label: "Jakarta", state }), state !== "static")
  for (const variant of CODE_VARIANTS)
    add(
      "CodeBlock",
      variant,
      codeBlock({ code: "run 20261121-a1b2c3d4", label: "Run id", variant }),
      false,
    )
  return cells
}

const ORDER = [
  "Button",
  "Icon",
  "Logo",
  "NavLink",
  "SectionLabel",
  "Badge",
  "Chip",
  "CodeBlock",
]

export function galleryAtoms(): string {
  const cells = galleryAtomCells()
  const sections = ORDER.map((atom) => {
    const mine = cells.filter((c) => c.atom === atom)
    const figs = mine
      .map(
        (c) =>
          `<figure class="tv-gallery__cell" data-atom="${esc(c.atom)}" data-state="${esc(c.state)}"><div class="tv-gallery__sample"${c.interactive ? ' data-interactive="true"' : ""}>${c.html}</div><figcaption class="tv-gallery__cap">${esc(c.state)}</figcaption></figure>`,
      )
      .join("")
    return `<section class="tv-gallery__atom" aria-labelledby="gallery-${esc(atom)}"><h3 class="tv-gallery__title" id="gallery-${esc(atom)}">${esc(atom)}</h3><div class="tv-gallery__grid">${figs}</div></section>`
  }).join("\n")
  return `<section class="tv-gallery" aria-labelledby="gallery-atoms"><h2 id="gallery-atoms">Atoms</h2>\n${sections}\n</section>\n`
}
