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
