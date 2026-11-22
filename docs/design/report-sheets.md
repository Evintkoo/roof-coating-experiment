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
