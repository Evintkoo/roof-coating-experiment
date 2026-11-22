# Theme mapping: light and dark

Generated from `src/web/design/themeMapping.ts` and the resolved themes by `tests/web/design/themeMapping.test.ts`, which fails when this file and the code differ. Regenerate with `bun run tests/support/writeThemeMapping.ts`.

The report and the gallery open in the light theme whatever the system colour scheme says (D3, amended). The Dark mode button sets `data-theme` on `<html>` and stores the choice under `spandek:theme`. Print is always light. `:root` carries the light values and the theme-independent tokens; `[data-theme="dark"]` carries the dark values; `color-scheme` is set per theme so native controls follow.

A role reads the same token in both themes; only the value differs. The last two columns are the WCAG contrast ratio of the token on the page surface (`surface-base`) in that theme, for roles that are ink or graphics.

## Roles

| Group | Role | Token | Light | Dark | Where | Ratio light | Ratio dark |
|---|---|---|---|---|---|---|---|
| Surface | Page background | `surface-base` | `#f7f8fa` | `#0b1020` | body, .page, figure paper and plot, tools bar | - | - |
| Surface | Sunken canvas | `surface-canvas` | `#edf0f5` | `#080d14` | shell backdrop | - | - |
| Surface | Card surface | `surface-card` | `#ffffff` | `#09111b` | recipe cards, gallery cells, panels | - | - |
| Surface | Elevated surface | `surface-elevated` | `#ffffff` | `#101827` | inputs, selects, sticky table head, hover label | - | - |
| Surface | Glass tint | `surface-glass` | `rgba(11, 16, 32, 0.04)` | `rgba(247, 248, 250, 0.06)` | tiles, table header cells, ghost hover | - | - |
| Surface | Raised tint | `surface-raised` | `rgba(11, 16, 32, 0.07)` | `rgba(247, 248, 250, 0.10)` | disabled controls, interval track | - | - |
| Text | Body text | `text-primary` | `#0b1020` | `#f7f8fa` | body, headings, figure font, interval value mark | 17.82 | 17.82 |
| Text | Muted text | `text-muted` | `rgba(11, 16, 32, 0.72)` | `rgba(247, 248, 250, 0.72)` | hints, captions, tile labels, tick labels, axis strokes | 7.46 | 9.44 |
| Text | Link | `link` | `#be3701` | `#ff683b` | a | 5.29 | 6.58 |
| Text | Link hover | `link-hover` | `#a62f01` | `#ff855f` | a:hover | 6.53 | 7.91 |
| Text | Secondary accent text | `accent-secondary` | `#01746c` | `#22d3c5` | scenario badge | 5.32 | 10.09 |
| Border | Glass border | `border-glass` | `rgba(11, 16, 32, 0.14)` | `rgba(247, 248, 250, 0.14)` | tiles, ghost button | - | - |
| Border | Panel border | `border-panel` | `rgba(11, 16, 32, 0.10)` | `rgba(169, 185, 209, 0.12)` | section rules, tables, figure grid lines | - | - |
| Border | Strong panel border | `border-panel-strong` | `rgba(11, 16, 32, 0.18)` | `rgba(169, 185, 209, 0.23)` | emphasised panels, gallery panes | - | - |
| Border | Control border | `border-control` | `rgba(11, 16, 32, 0.47)` | `rgba(247, 248, 250, 0.36)` | inputs, nominal and neutral badge, info callout, hover label border | 3.20 | 3.20 |
| Focus | Focus ring | `focus-ring` | `#049389` | `#22d3c5` | :focus-visible outline | 3.57 | 10.09 |
| Action | Primary action | `action-primary` | `#ff683b` | `#ff683b` | primary button, slider accent, selection tint, toggle state | - | - |
| Action | Primary action hover | `action-primary-hover` | `#ff855f` | `#ff855f` | primary button hover | - | - |
| Action | Action label | `action-label` | `#0b1020` | `#0b1020` | text on the primary action | - | - |
| Action | Orange highlight light | `accent-orange-light` | `#ff8a5b` | `#ff8a5b` | primary button gradient start | - | - |
| Action | Orange highlight dark | `accent-orange-dark` | `#d94824` | `#d94824` | brand accent (contract) | - | - |
| Action | Orange glow | `glow-orange` | `rgba(255, 104, 59, 0.32)` | `rgba(255, 104, 59, 0.32)` | brand glow (contract) | - | - |
| Status | Go | `status-go` | `#02665f` | `#22d3c5` | go badge, pass text | 6.44 | 10.09 |
| Status | Stop | `status-stop` | `#b10a1e` | `#ff726b` | stop badge, limit callout bar, error border | 6.74 | 7.10 |
| Status | Caution / PROXY | `status-proxy` | `#7b5201` | `#f9ac22` | proxy badge, caution callout bar | 6.48 | 9.87 |
| Chart | Recommended recipe | `viz-recommended` | `#e65121` | `#ff683b` | recommended series, interval band and caps | 3.55 | 6.58 |
| Chart | Aluminium baseline | `viz-baseline` | `#5e636f` | `#b0b6c3` | baseline and neutral series, substrate layer | 5.66 | 9.31 |
| Chart | Categorical series 1 | `viz-1` | `#008300` | `#0ca30c` | series 1, topcoat layer | 4.65 | 5.64 |
| Chart | Categorical series 2 | `viz-2` | `#c95f89` | `#d55181` | series 2 | 3.61 | 4.80 |
| Chart | Categorical series 3 | `viz-3` | `#2a78d6` | `#3987e5` | series 3, primer layer | 4.16 | 5.20 |
| Chart | Categorical series 4 | `viz-4` | `#b17702` | `#c98500` | series 4 | 3.59 | 6.17 |
| Chart | Categorical series 5 | `viz-5` | `#019465` | `#199e70` | series 5 | 3.64 | 5.56 |
| Chart | Categorical series 6 | `viz-6` | `#6250d6` | `#9085e9` | series 6 | 5.43 | 6.06 |
| Chart | Sequential step 1 | `viz-seq-1` | `#74a6e7` | `#295894` | heat and frequency scales (low to high) | - | - |
| Chart | Sequential step 2 | `viz-seq-2` | `#5b91d7` | `#386db0` | heat and frequency scales (low to high) | - | - |
| Chart | Sequential step 3 | `viz-seq-3` | `#427cc7` | `#4781cc` | heat and frequency scales (low to high) | - | - |
| Chart | Sequential step 4 | `viz-seq-4` | `#2868b6` | `#5797e9` | heat and frequency scales (low to high) | - | - |
| Chart | Sequential step 5 | `viz-seq-5` | `#1a559c` | `#71adfb` | heat and frequency scales (low to high) | - | - |
| Chart | Sequential step 6 | `viz-seq-6` | `#0a4382` | `#97c4ff` | heat and frequency scales (low to high) | - | - |
| Chart | Sequential step 7 | `viz-seq-7` | `#003167` | `#bedaff` | heat and frequency scales (low to high) | - | - |
| Chart | Diverging step 1 | `viz-div-1` | `#2963ab` | `#71adfb` | benefit and delta scales (neutral at step 4) | - | - |
| Chart | Diverging step 2 | `viz-div-2` | `#538ed9` | `#4781cc` | benefit and delta scales (neutral at step 4) | - | - |
| Chart | Diverging step 3 | `viz-div-3` | `#86baff` | `#1c579e` | benefit and delta scales (neutral at step 4) | - | - |
| Chart | Diverging step 4 | `viz-div-4` | `#e2e5ea` | `#32353c` | benefit and delta scales (neutral at step 4) | - | - |
| Chart | Diverging step 5 | `viz-div-5` | `#ff987a` | `#963212` | benefit and delta scales (neutral at step 4) | - | - |
| Chart | Diverging step 6 | `viz-div-6` | `#d2694b` | `#c55d3f` | benefit and delta scales (neutral at step 4) | - | - |
| Chart | Diverging step 7 | `viz-div-7` | `#a33f20` | `#f58869` | benefit and delta scales (neutral at step 4) | - | - |

## Figure roles

| Figure role | Token | Light | Dark |
|---|---|---|---|
| `paper` | `surface-base` | `#f7f8fa` | `#0b1020` |
| `plot` | `surface-base` | `#f7f8fa` | `#0b1020` |
| `font` | `text-primary` | `#0b1020` | `#f7f8fa` |
| `muted` | `text-muted` | `rgba(11, 16, 32, 0.72)` | `rgba(247, 248, 250, 0.72)` |
| `grid` | `border-panel` | `rgba(11, 16, 32, 0.10)` | `rgba(169, 185, 209, 0.12)` |
| `axisStroke` | `text-muted` | `rgba(11, 16, 32, 0.72)` | `rgba(247, 248, 250, 0.72)` |
| `hoverBg` | `surface-elevated` | `#ffffff` | `#101827` |
| `hoverBorder` | `border-control` | `rgba(11, 16, 32, 0.47)` | `rgba(247, 248, 250, 0.36)` |
| `recommended` | `viz-recommended` | `#e65121` | `#ff683b` |
| `baseline` | `viz-baseline` | `#5e636f` | `#b0b6c3` |

## Theme-independent tokens

Brand primitives (`color-*`), type, space, radius, tap target, ring geometry and motion are the same in both themes. The only colour primitives the components use are `color-warm-white` (the highlight edge of the primary button) and `color-canvas` (the shadow of the inverse button): both are shadows or highlights, never text or surfaces.
