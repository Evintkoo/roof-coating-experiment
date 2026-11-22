# Vendored Torviello design material

Copied (not cloned) on 2026-11-22 from the user's own repository
https://github.com/Evintkoo/torch-inference (MIT licence, root LICENSE; commercial terms in COMMERCIAL_LICENSE.md cover Torviello Engine, not this brand material), at commit 89956a1119dc27868917cf86b710d04a45007633.
Read-only reference inputs for plan 06; never edited in place. Plan 06 Task 1 adds a sync check
(hash manifest) so drift from the source is visible.

| Path here | Source | What it is |
|---|---|---|
| vendor/torviello-design/ | torviello-design/ (whole unit, no __pycache__) | design tokens (contracts/design-tokens.json), brand assets (brand/), design sheets (specifications/), unit tests |
| vendor/torviello-landing-ui/components/ui/ | torviello-landing/web/src/components/ui/*.svelte | the only component code that exists: Svelte 5 atoms (Button, Icon, Logo, NavLink, SectionLabel, Terminal*) |
| vendor/torviello-landing-ui/styles/ | torviello-landing/web/src/styles/ | tokens.css and base.css generated from the tokens |
| vendor/torviello-landing-ui/lib/ | torviello-landing/web/src/lib/{brand,icons,link}.ts | helpers the atoms import |

Note: torviello-design itself has no component code (its src/ is empty); components live in torviello-landing.
