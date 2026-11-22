# Report design sheets

**Role:** designer
**Unit:** roof-coating-experiment, `src/web/design/`
**Format:** the vendor sheet format of `vendor/torviello-design/specifications/landing-design-sheets.md` (purpose, tokens, states, contract, accessibility, do and don't).
**Tokens:** `vendor/torviello-design/contracts/design-tokens.json` plus the report additions in `src/web/design/themes.ts` (light theme, status tokens, data visualisation palette).

The Torviello atoms (Button A1/A2, NavLink A3, SectionLabel A4, Logo A5, Icon A7) are not repeated here: their sheets are the vendor sheets, and `src/web/design/atoms/` mirrors the vendored Svelte atoms one to one (a test compares class names and consumed tokens). This file holds the atoms the report needs and the brand does not have. A sheet is written before its code; changing one is a logged change on the plan.

Components consume **semantic tokens only**; a raw value where a token exists is a review finding (FR-5, tested).

## Atoms

### R1 Badge

- purpose: the structural honesty label (plan 06 R7). `proxy` marks every index value that is a relative ranking and not a physical quantity, `scenario` marks an ageing or other what-if value, `nominal` marks a value shown without its uncertainty, `go` and `stop` carry a decision. It is the one way a caveat is attached to a value.
- tokens: text `status-proxy` / `status-go` / `status-stop` on a 14 % tint of the same token over the surface; `scenario` is outlined (`accent-secondary` text and 1px `accent-secondary` border, no fill); `nominal` is outlined with `text-muted` text and a `border-control` hairline; `radius-pill`, `space-1`/`space-2` padding, `font-family-sans` at `size-label`, `weight-semibold`, letter-spacing 0.04em
- states (closed union `tone`): `proxy`, `scenario`, `nominal`, `go`, `stop`; no hover, no focus, not interactive
- contract: one inline `<span class="tv-badge tv-badge--<tone>" data-tone="<tone>">label</span>`; the label is required and visible text (an empty label is a build error, exit 4); the tone is also in `data-tone` so a test can find every badge
- accessibility: the label carries the meaning, colour never does alone (R5); every tone passes 4.5:1 for its text on its own tint on both `surface-base` and `surface-card` in both themes (the pair table in `themes.ts`, H4); `scenario` and `nominal` are outlined because teal ink on its own tint is 4.35:1 in the light theme; print drops the tint and keeps a solid border
- do: put it next to the value it qualifies, in the same line. don't: use it as decoration, use two tones on one value, or put an index value on the page without one (FR-4)

### R2 Chip

- purpose: a short neutral qualifier or filter value ("Jakarta", "ageing scenario", "sort: cooling"). A static chip names a fact next to a heading or value; a toggle chip is a filter in the explorer bar. It never carries a caveat (that is the Badge).
- tokens: `surface-glass` fill, 1px `border-control` border, `text-primary` label, `radius-pill`, `space-2`/`space-3` padding, `font-family-sans` at `size-label`; selected: `surface-raised` fill, a `link` border and semibold weight (the pressed state is exposed to assistive technology as `aria-pressed` and shown by fill, border and weight, never colour alone)
- states (closed union `state`): `static` (a span, not interactive), `off` and `on` (a real `<button type="button">` with `aria-pressed="false"` / `"true"`); hover on a toggle raises the fill to `surface-raised`; focus-visible 2px `focus-ring` outline offset 2px
- contract: static renders `<span class="tv-chip">`; a toggle renders a button with `aria-pressed` and an optional `data-value` for the page script; the label is required text
- accessibility: a toggle is a 44px target in both axes (`target-min`); label on its fill is `text-primary` on `surface-glass` or `surface-raised` (pair table, 4.5:1 both themes); the border is `border-control` (3:1 against the surfaces); never the only carrier of a state
- do: use for filters and qualifiers. don't: put a PROXY or scenario caveat in a chip, nest chips, or use a chip as a button that navigates (that is a Button or NavLink)

### R3 CodeBlock

- purpose: exact technical text the reader may copy: a hash, a run id, a command, a file name. Set in the mono face so digits and characters line up. Related to the vendor A6 TerminalLine (same mono tokens), without a prompt, transcript or animation.
- tokens: `font-family-mono` at `size-label`; block: `surface-card` fill, 1px `border-panel` border, `radius-panel`, `space-3`/`space-4` padding, `text-primary`; inline: `surface-glass` fill, `radius-control`, `space-1`/`space-2` padding
- states (closed union `variant`): `block` (a scrollable region) and `inline` (a `<code>` inside a sentence); no hover, no focus style of its own besides the global ring
- contract: block renders `<pre class="tv-code" tabindex="0" role="region" aria-label="..."><code>text</code></pre>`; inline renders `<code class="tv-code tv-code--inline">`; the text is escaped and never interpreted; the block scrolls horizontally instead of wrapping so a hash stays one string
- accessibility: a block can overflow, so it is focusable (`tabindex="0"`) with an accessible name (`label`, default "Code") so a keyboard user can scroll it; text on its fill is `text-primary` on `surface-card` / `surface-glass` (pair table, 4.5:1 in both themes); selectable text; print wraps (`pre-wrap`), drops the fill, never clips
- do: use for values that must be copied exactly. don't: put prose in it, put unit exponents such as `W m⁻²` in it (the mono subset has no superscript minus: those are set in the UI face), or rely on colour inside it

## Molecules

Molecules compose atoms and carry the rules of the plan: an index value never appears without its caveat (FR-4), an interval is always drawn the same way (R4), detail is closed by default but never hides a caveat (R2, H9). Every molecule is a pure function returning escaped markup, a closed union per state (F7), CSS from tokens only.

### R4 ProxyBadge

- purpose: the one way a caveat is attached to a value. It wraps the Badge atom with the report's fixed wording so the same words appear everywhere: `proxy` reads "PROXY" (a relative ranking, not a measurement), `scenario` reads "scenario" (an ageing or what-if value), `nominal` reads "nominal only" (shown without its uncertainty).
- tokens: those of the Badge atom R1 (`status-proxy`, `accent-secondary`, `text-muted`, `radius-pill`); the wrapper adds only `display:inline-flex`
- states (closed union `tone`, required): `proxy`, `scenario`, `nominal`; there is no default tone, so a missing tone is a TypeScript error
- contract: `<span class="tv-proxy" data-proxy-badge="<tone>">` around one Badge; an optional `label` replaces the default wording but never the tone; an empty label is a build error (exit 4)
- accessibility: the words carry the meaning, never colour alone; contrast is the Badge's (pair table, H4); not interactive, no tab stop
- do: put it in the same line as the value. don't: pick `nominal` for a value that has an interval (use the interval instead), or hide it behind a disclosure

### R5 Stat

- purpose: one number with its meaning: label, value, unit, the caveat that goes with it and, when there is one, its interval. It is the only way a headline or index value is shown (FR-4): the caveat is a required part of the call.
- tokens: label `text-muted` at `size-small`; value `font-family-mono` at `size-heading`, `weight-semibold`, `text-primary`; unit in `font-family-sans` (the mono subset has no superscript minus) at `size-small`, `text-muted`; interval line and note `text-muted` at `size-small`; `space-1` rhythm
- states (closed union `tone`, required): `proxy`, `scenario`, `nominal` (each adds its ProxyBadge R4 to the value line and may carry an interval) and `interval` (a model prediction shown with its interval, which is then required)
- contract: `<div class="tv-stat" data-stat data-tone>` with label, value line (number set with `digits`, default 2, unit, badge), an interval line "parameter uncertainty only: lo to hi unit" (the same words everywhere, R4) and an optional note; `lo` must not exceed `hi`; a value that is not a finite number is a build error (exit 4)
- accessibility: the badge words, not colour, carry the caveat; label, value, badge and interval read in that order; contrast from the pair table
- do: pass `digits` once per quantity and keep it across the page (R8). don't: format the number outside the call, or render an index value with plain text next to it

### R6 IntervalBar

- purpose: the one way an interval is drawn (R4). A horizontal scale with the interval as a band with end caps and the value as a diamond, always followed by the words "parameter uncertainty only: lo to hi unit". Bars that compare things share one scale (`min`, `max`) so their lengths are comparable.
- tokens: track `surface-raised`; band `viz-recommended` at 35 % over the track with `viz-recommended` end caps (3:1 graphic pair); marker `text-primary`; axis labels and text `text-muted` at `size-small`; `radius-pill` track, `space-2` height, `space-1` minimum band width
- states: none (a display component); the shape carries the meaning (band, caps, diamond), never colour alone (R5)
- contract: `<div class="tv-interval" data-interval-bar>` with a `role="img"` track whose `aria-label` states the value, the interval and the scale, the drawn parts positioned in percent of the scale, a muted axis line with `min` and `max` and the unit, and the interval sentence; `min < max`, `min <= lo <= hi <= max` and `min <= value <= max` or the build fails (exit 4)
- accessibility: the label is the whole message for a screen reader; the sentence is visible text so the name "parameter uncertainty only" is always on the page; the marker is a rotated square, so the position reads without colour; print keeps the track border
- do: give every bar of a comparison the same `min` and `max`. don't: draw an interval any other way, or drop the sentence to save room

### R7 Callout

- purpose: a statement the reader must not miss: the honesty statement under the verdict, a limit beside a figure, a data caveat for a site. It is a block in the flow, not a banner and not a toast (R7: honesty is structural).
- tokens: `surface-glass` fill, `text-primary` text at `size-body`, a `space-1` start border and a `border-glass` hairline elsewhere, `radius-panel`, `space-3`/`space-4` padding; start border `border-control` (`info`), `status-proxy` (`caution`), `status-stop` (`limit`); the title in `weight-semibold`
- states (closed union `tone`): `info`, `caution`, `limit`
- contract: `<div class="tv-callout tv-callout--<tone>" role="note" data-callout="<tone>">` with a visible title (the given `title`, else the tone word "Note", "Caution" or "Limit") and one paragraph per body string; text is escaped; an empty body is a build error (exit 4)
- accessibility: `role="note"`; the tone is also a word, so the border colour is never the only signal (R5); `text-primary` on `surface-glass` is in the pair table (4.5:1, both themes); the border is a graphic pair (`border-control`, `status-*`)
- do: keep it to two or three sentences and put it where the claim it qualifies is. don't: collapse it inside a disclosure, use it for decoration, or stack more than one per section

### R8 Disclosure

- purpose: progressive disclosure (R2): detail is one click away and closed by default, so the closed page stays short (H1). It never hides a caveat (H9): what must stay visible is placed outside it by the caller, and the component tests that a closed disclosure holds only its own summary in the visible text.
- tokens: `border-glass` hairline, `radius-card`, `surface-glass` summary on hover, `text-primary` summary in `weight-semibold`, chevron from `ring-width` borders in `text-muted`, `space-4` padding, 44 px minimum summary height (`target-min`)
- states: `closed` (default) and `open` (the `open` prop, or the reader's click); one `level`, `detail` (a closed union so a second level is a deliberate change)
- contract: `disclosure({ summary, open?, level })` returns a function `(inner) => string`; native `<details class="tv-disclosure" data-level="detail"><summary>` with the inner markup in `<div class="tv-disclosure__inner">`; the inner markup is trusted (already built by components), the summary is escaped. `DISCLOSURE_SCRIPT` (inline, no dependency) opens every closed ancestor `<details>` when a link or the address targets an id inside it, so a glossary anchor is reachable from a first use
- accessibility: native element, so Enter and Space toggle and the state is exposed without ARIA; visible focus ring; 44 px target; print opens every disclosure (`::details-content` made visible) so nothing is lost on paper
- do: put the live simulator, tables of 96 rows and assumed constants inside. don't: put a PROXY statement, the interval definition or the limits link inside one

### R9 FigureFrame

- purpose: one message per chart (R3). The frame holds the message as its heading, the chart (a Plotly div or a drawn schematic) in a reserved box so the page does not jump, and a note for the source or the scale. Charts are the report's heaviest elements, so the frame fixes their height from the plan's page budget (260 to 400 px at 1280 px).
- tokens: `border-panel` hairline, `radius-panel`, `space-4` padding, title `text-primary` at `size-body` and `weight-semibold`, note `text-muted` at `size-small`; plot box minimum height as a multiple of `space-16` (`short` 4, `medium` 5, `tall` 6)
- states (closed union `size`): `short`, `medium`, `tall`; `interactive` true gives the plot area `role="group"` (the reader can operate it), otherwise `role="img"`
- contract: `<figure class="tv-figure" data-figure>` with `<figcaption>` holding the message as the first child, a plot box with `role` and `aria-label` = the message plus the optional `describe` text, and an optional `<p class="tv-figure__note">`; the inner markup is trusted; an empty message is a build error (exit 4)
- accessibility: a chart without its message as accessible name is a build error; interactive plots stay reachable by keyboard because the group does not hide them from assistive technology; the message is visible text, not only a label
- do: write the title as the finding ("Aluminium primer runs 11 K hotter"), label series directly, name units on axes. don't: use a topic title ("Temperature"), or put two messages in one frame

### R10 Legend

- purpose: names the series of a chart that has more than three (R3: three or fewer are labelled directly on the plot). Each entry pairs a swatch colour with a swatch shape and a label, so a colour-blind reader can tell entries apart (R5).
- tokens: swatch colours `viz-recommended` (the recommended recipe), `viz-baseline` (bare aluminium) and `viz-1` to `viz-6` (the validated categorical set, D6); labels `text-primary` at `size-small`; `space-2`/`space-4` gaps
- states (closed unions): `swatch` is `recommended`, `baseline`, `series-1`, `series-2`, `series-3`, `series-4`, `series-5`, `series-6`; `shape` is `line`, `dash`, `dot`, `band`
- contract: `<ul class="tv-legend" aria-label="<title>">` with one `<li>` per entry holding an `aria-hidden` swatch (`--swatch` set to the token) and the label text; at least one entry; labels must be distinct (two entries with the same label are a build error, exit 4)
- accessibility: the label is text, the swatch is decorative and repeated by shape, never colour alone; the swatches are graphic pairs of the validated set (3:1 on both plot backgrounds, Q4); not interactive, so no target size applies
- do: keep the order of the plot's series, put the recommended entry first. don't: use a legend for three or fewer series, or the brand orange for anything but the recommended recipe

### R11 Tabs

- purpose: switch between parallel views of one thing (the three recipes' layers, initial against aged state) when showing all of them at once would break the page budget. The tab labels are always visible, so what is hidden is announced.
- tokens: tab `text-muted` at `size-label`, selected tab `text-primary` with a `link` underline of `ring-width`, `border-panel` hairline under the list, panel `space-4` padding, hover `surface-glass`; 44 px targets (`target-min`)
- states: per tab `selected` (`aria-selected="true"`, roving `tabindex` 0) and `unselected` (`aria-selected="false"`, `tabindex` -1); exactly one is selected, `selected` names it (default the first)
- contract: `tabs({ id, label, tabs, selected? })` returns `(panels) => string` with one panel per tab; `<div class="tv-tabs" data-tabs>` with a `role="tablist"` of `<button role="tab">` (`aria-controls`, ids `<id>-tab-<tab>`) and `role="tabpanel"` panels (`aria-labelledby`, `tabindex="0"`, `hidden` unless selected); panels are trusted markup; at least two tabs, distinct plain-identifier ids, as many panels as tabs, else a build error (exit 4). `TABS_SCRIPT` (inline, no dependency) selects on click and on Arrow Left and Right (wrapping), Home and End, moving focus and the roving tabindex, and fires `tabs-change`
- accessibility: the WAI-ARIA tabs pattern with automatic activation; the selected state is shown by weight and underline as well as colour; print shows every panel under its tab name and hides the list
- do: use two to four tabs of the same kind. don't: hide a caveat or the only copy of an answer in an unselected panel (H9), or nest tabs

### R12 SliderField

- purpose: one numeric input the reader can drag or type, with its label, unit and current value in text (the budget in relative cost units, a model parameter in the explorer). The slider and the optional number box stay in step, so the value is never only a thumb position.
- tokens: label `text-primary` at `size-label`, unit `text-muted` at `size-small`, `accent-color` `link` for the range, number box `surface-glass` fill with a `border-control` border and `radius-control`, output in `font-family-mono`, `space-2`/`space-4` gaps; error message `status-stop` at `size-small`
- states (closed union `state`): `idle`, `disabled` (both inputs `disabled`), `error` (`aria-invalid="true"` and the message linked by `aria-describedby`)
- contract: `<div class="tv-slider" data-slider data-state>` with a `<label for>`, an `<input type="range">`, an optional `<input type="number" aria-label>` sharing `min`, `max`, `step`, and an `<output>` naming the value and unit; `min < max`, `step > 0`, `min <= value <= max`, ids plain identifiers, else a build error (exit 4). `SLIDER_SCRIPT` (inline) keeps range, number and output in step, clamps a typed value to the range on change, and fires `slider-change` (`detail.value`) on the field
- accessibility: a real label for both inputs, the unit and the value as text, the range is a native control (arrow keys, Home, End, Page keys), 44 px minimum height on every control (`target-min`), visible focus ring, error exposed with `aria-invalid` and text, the `<output>` is a polite live region
- do: show the unit next to the label and say what it is not ("not IDR"). don't: use the slider alone for a value people need to type exactly, or lose the value in a tooltip

### R13 TableCell

- purpose: one cell of a data table, so every table shows numbers the same way (R8): text left, numbers right in the mono face with a fixed number of decimals, and an index value always with its PROXY label (FR-4). Units are not repeated per cell; they live in the column header.
- tokens: `font-family-mono` and `tabular-nums` for numbers, `text-primary`, `text-muted` for the interval and the empty mark, `space-2`/`space-3` padding, `border-panel` row hairline; the compact badge uses `size-micro`
- states (closed union `kind`): `text`, `number`, `index` (needs `tone`), `empty`; `text` may be a row header (`header: true`, `<th scope="row">`)
- contract: `<td class="tv-cell tv-cell--<kind>">` carrying `data-sort` (the raw number, or the lower-cased text, empty for `empty`) so a table can sort without parsing; `number` with `interval` reads "14.4 [14.3, 14.5]" with the interval in the muted style and `lo <= hi`; `index` appends the ProxyBadge R4 and sets `data-tone`; `empty` shows an en dash with a visually hidden "no value"; a non-finite number or a missing tone is a build error (exit 4, and a TypeScript error for the tone)
- accessibility: numeric cells are right-aligned and use tabular figures so digits line up; the badge is text, so an index is labelled in the cell and not only in the header; `th scope="row"` for the row name; the empty mark has a text alternative
- do: keep `digits` the same down a column. don't: put the unit in the cell, or show an index number without its badge
