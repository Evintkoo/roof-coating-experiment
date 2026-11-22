// The report page on the design system: the shell (rail, tools, sections) and the document around it. Pure string building; the
// node builder supplies the sections, the stylesheet and the scripts. Browser and Node safe.
import { SpandekError } from "../../../core/errors"
import { buildError, esc, tag } from "../html"
import { navRail } from "../organisms/navRail"
import { THEME_INIT_SCRIPT, themeToggle } from "../theme"

export type PageSection = {
  id: string
  label: string
  html: string
  /** false: the section has no link in the rail. */
  nav?: boolean
}

export type ReportPageProps = {
  title: string
  /** The manifest core hash the page was built against (verify-report reads it from the meta tag). */
  core: string
  /** Font faces, tokens, component CSS and page CSS, in that order. */
  css: string
  brand: string
  sections: readonly PageSection[]
  /** Script blocks in order: data, plotly, page script (each already safe for a script element). */
  scripts: readonly [string, string, string]
}

const C = "ReportPage"

/** The rail items, the tools row and the sections inside `.tv-shell`. */
export function reportBody(
  p: Pick<ReportPageProps, "brand" | "sections">,
): string {
  if (p.sections.length === 0) return buildError(C, "a page needs sections")
  const rail = navRail({
    brand: p.brand,
    items: p.sections
      .filter((s) => s.nav !== false)
      .map((s) => ({ id: s.id, label: s.label })),
    mainId: "main",
  })
  const tools = tag("div", { class: "page__tools" }, themeToggle())
  return tag(
    "div",
    { class: "tv-shell" },
    rail +
      tag(
        "main",
        { id: "main", class: "page", tabindex: -1 },
        tools + p.sections.map((s) => s.html).join("\n"),
      ),
  )
}

export function reportDocument(p: ReportPageProps): string {
  if (!/^[0-9a-f]{64}$/.test(p.core))
    throw new SpandekError(
      4,
      "design.component",
      C,
      "the core hash is 64 lower-case hex characters",
    )
  const [data, plotly, main] = p.scripts
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>${THEME_INIT_SCRIPT}</script>
<meta name="spandek-core-sha256" content="${p.core}">
<title>${esc(p.title)}</title>
<style>${p.css}</style>
</head>
<body>
${reportBody(p)}
<script>${data}</script>
<script>${plotly}</script>
<script>${main}</script>
</body>
</html>
`
}
