// The role map of the two themes: every colour token, the role it plays, and its value in each theme. The same role always reads
// the same token in both themes (only the value differs), so a component written once for one theme is right in the other.
// docs/design/theme-mapping.md is generated from this table and a test fails when the file and the code differ. Browser and Node safe.
import { PLOT_ROLE_TOKENS } from "./plotTheme"
import { contrastRatio, resolveOpaque } from "./themes"

export type RoleRow = {
  group: string
  role: string
  token: string
  /** Where the role is drawn (components and CSS selectors). */
  use: string
  /** true: the role is ink or a graphic drawn on the page surface, so its contrast on surface-base is listed. */
  ink?: boolean
}

const r = (
  group: string,
  role: string,
  token: string,
  use: string,
  ink = false,
): RoleRow => ({ group, role, token, use, ink })

export const ROLE_ROWS: readonly RoleRow[] = [
  r(
    "Surface",
    "Page background",
    "surface-base",
    "body, .page, figure paper and plot, tools bar",
  ),
  r("Surface", "Sunken canvas", "surface-canvas", "shell backdrop"),
  r(
    "Surface",
    "Card surface",
    "surface-card",
    "recipe cards, gallery cells, panels",
  ),
  r(
    "Surface",
    "Elevated surface",
    "surface-elevated",
    "inputs, selects, sticky table head, hover label",
  ),
  r(
    "Surface",
    "Glass tint",
    "surface-glass",
    "tiles, table header cells, ghost hover",
  ),
  r(
    "Surface",
    "Raised tint",
    "surface-raised",
    "disabled controls, interval track",
  ),
  r(
    "Text",
    "Body text",
    "text-primary",
    "body, headings, figure font, interval value mark",
    true,
  ),
  r(
    "Text",
    "Muted text",
    "text-muted",
    "hints, captions, tile labels, tick labels, axis strokes",
    true,
  ),
  r("Text", "Link", "link", "a", true),
  r("Text", "Link hover", "link-hover", "a:hover", true),
  r(
    "Text",
    "Secondary accent text",
    "accent-secondary",
    "scenario badge",
    true,
  ),
  r("Border", "Glass border", "border-glass", "tiles, ghost button"),
  r(
    "Border",
    "Panel border",
    "border-panel",
    "section rules, tables, figure grid lines",
  ),
  r(
    "Border",
    "Strong panel border",
    "border-panel-strong",
    "emphasised panels, gallery panes",
  ),
  r(
    "Border",
    "Control border",
    "border-control",
    "inputs, nominal and neutral badge, info callout, hover label border",
    true,
  ),
  r("Focus", "Focus ring", "focus-ring", ":focus-visible outline", true),
  r(
    "Action",
    "Primary action",
    "action-primary",
    "primary button, slider accent, selection tint, toggle state",
  ),
  r(
    "Action",
    "Primary action hover",
    "action-primary-hover",
    "primary button hover",
  ),
  r("Action", "Action label", "action-label", "text on the primary action"),
  r(
    "Action",
    "Orange highlight light",
    "accent-orange-light",
    "primary button gradient start",
  ),
  r(
    "Action",
    "Orange highlight dark",
    "accent-orange-dark",
    "brand accent (contract)",
  ),
  r("Action", "Orange glow", "glow-orange", "brand glow (contract)"),
  r("Status", "Go", "status-go", "go badge, pass text", true),
  r(
    "Status",
    "Stop",
    "status-stop",
    "stop badge, limit callout bar, error border",
    true,
  ),
  r(
    "Status",
    "Caution / PROXY",
    "status-proxy",
    "proxy badge, caution callout bar",
    true,
  ),
  r(
    "Chart",
    "Recommended recipe",
    "viz-recommended",
    "recommended series, interval band and caps",
    true,
  ),
  r(
    "Chart",
    "Aluminium baseline",
    "viz-baseline",
    "baseline and neutral series, substrate layer",
    true,
  ),
  ...[1, 2, 3, 4, 5, 6].map((i) =>
    r(
      "Chart",
      `Categorical series ${i}`,
      `viz-${i}`,
      i === 1
        ? "series 1, topcoat layer"
        : i === 3
          ? "series 3, primer layer"
          : `series ${i}`,
      true,
    ),
  ),
  ...[1, 2, 3, 4, 5, 6, 7].map((i) =>
    r(
      "Chart",
      `Sequential step ${i}`,
      `viz-seq-${i}`,
      "heat and frequency scales (low to high)",
    ),
  ),
  ...[1, 2, 3, 4, 5, 6, 7].map((i) =>
    r(
      "Chart",
      `Diverging step ${i}`,
      `viz-div-${i}`,
      "benefit and delta scales (neutral at step 4)",
    ),
  ),
]

/** Figure roles (plotTheme.ts) with the token each reads. */
export const PLOT_ROLE_ROWS: readonly { role: string; token: string }[] =
  Object.entries(PLOT_ROLE_TOKENS).map(([role, token]) => ({ role, token }))

const ratio = (
  tokens: Readonly<Record<string, string>>,
  name: string,
): string =>
  contrastRatio(
    tokens[name] as string,
    resolveOpaque(tokens, "surface-base"),
  ).toFixed(2)

/** The markdown of docs/design/theme-mapping.md for two resolved themes (see tokens.ts `resolveTheme`). */
export function mappingMarkdown(
  light: Readonly<Record<string, string>>,
  dark: Readonly<Record<string, string>>,
): string {
  const out: string[] = [
    "# Theme mapping: light and dark",
    "",
    "Generated from `src/web/design/themeMapping.ts` and the resolved themes by `tests/web/design/themeMapping.test.ts`, which fails when this file and the code differ. Regenerate with `bun run tests/support/writeThemeMapping.ts`.",
    "",
    'The report and the gallery open in the light theme whatever the system colour scheme says (D3, amended). The Dark mode button sets `data-theme` on `<html>` and stores the choice under `spandek:theme`. Print is always light. `:root` carries the light values and the theme-independent tokens; `[data-theme="dark"]` carries the dark values; `color-scheme` is set per theme so native controls follow.',
    "",
    "A role reads the same token in both themes; only the value differs. The last two columns are the WCAG contrast ratio of the token on the page surface (`surface-base`) in that theme, for roles that are ink or graphics.",
    "",
    "## Roles",
    "",
    "| Group | Role | Token | Light | Dark | Where | Ratio light | Ratio dark |",
    "|---|---|---|---|---|---|---|---|",
  ]
  for (const row of ROLE_ROWS)
    out.push(
      `| ${row.group} | ${row.role} | \`${row.token}\` | \`${light[row.token]}\` | \`${dark[row.token]}\` | ${row.use} | ${row.ink ? ratio(light, row.token) : "-"} | ${row.ink ? ratio(dark, row.token) : "-"} |`,
    )
  out.push(
    "",
    "## Figure roles",
    "",
    "| Figure role | Token | Light | Dark |",
    "|---|---|---|---|",
  )
  for (const row of PLOT_ROLE_ROWS)
    out.push(
      `| \`${row.role}\` | \`${row.token}\` | \`${light[row.token]}\` | \`${dark[row.token]}\` |`,
    )
  out.push(
    "",
    "## Theme-independent tokens",
    "",
    "Brand primitives (`color-*`), type, space, radius, tap target, ring geometry and motion are the same in both themes. The only colour primitives the components use are `color-warm-white` (the highlight edge of the primary button) and `color-canvas` (the shadow of the inverse button): both are shadows or highlights, never text or surfaces.",
    "",
  )
  return `${out.join("\n")}`
}
