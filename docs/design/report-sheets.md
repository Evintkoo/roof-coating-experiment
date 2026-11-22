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
