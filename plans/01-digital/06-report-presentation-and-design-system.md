# Report Presentation and Design System Implementation Plan

Part 1 is the plan (tasks, hypotheses, faults). Part 2 is the test specification (stubs). Plan 06 of `plans/01-digital/`; it reworks the report that plans 00, 04 and 05 built.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the report understandable at first read by a person who is not the author (answer first, plain language, progressive detail) and give it a real design system: Torviello tokens and components applied atomically, one component per commit.

**Architecture:** Two layers, both pure and framework-free so the report stays one offline, byte-reproducible HTML file. (1) A *design layer* `src/web/design/`: CSS generated from the vendored Torviello token contract (plus a derived light theme and a data-visualisation palette, both contract-tested), and atoms, molecules, organisms and templates written as pure TypeScript functions that return escaped HTML strings and mirror the vendored Svelte atoms and design sheets one to one. (2) A *content layer* that rewrites the report as a reading path (Verdict, Recipes, Why, Climate, Budget, Explore, Method and limits, Provenance) whose headline sentences are computed from the result files by a pure function and checked against them. Plotly figures are themed from the same tokens.

**Tech Stack:** Bun 1.3.14, TypeScript 7.0.2, plotly.js-dist-min 4.3.0, playwright 1.65.1 (installed Chrome), biome 2.6.8 (as plan 00). Fonts: Inter and JetBrains Mono, subset and embedded as base64 woff2 if the Task 1 size budget holds. No Svelte, Vite or new runtime dependency in the report. Versions re-verified in Task 1 (dated 2026-11-22).

**Spec:** none; derived from this conversation (the user: the data is good, rework the presentation to data-presentation best practice so the author and any human can understand it easily, and rework the design atomically with the Torviello design components). Inputs: `vendor/torviello-design/` (tokens `contracts/design-tokens.json`, brand assets, design sheets `specifications/landing-design-sheets.md` and `landing-functional-design.md`) and `vendor/torviello-landing-ui/` (the only component code: Svelte 5 atoms, `tokens.css`, `base.css`), recorded in `vendor/VENDORED.md`.

**Status:** 📋 PLANNED

## What the operator does

1. `bun run spandek run`, then optionally `refine`, `budget-table`, `indonesia`, then `report` (unchanged commands). `report` writes the same `report.html`, now redesigned. Build under 10 s (T_build_s of plan 00).
2. Opens `reports/report.html`. The first screen shows the verdict, the three recommended recipes with their headline numbers and uncertainty, and a one-line honesty statement. Nothing else is needed to answer "which coating, how much better, how sure".
3. Everything else is behind clearly labelled sections and closed-by-default details. Reading the whole page top to bottom takes about 10 minutes; the first screen takes 30 seconds.
4. Reviewing the design: `bun run spandek design-gallery --out reports/components.html` writes a gallery of every atom, molecule and organism in both themes and every state (a built, offline file; the same builders the report uses).

## Logging and debugging

Same schema as plan 03 (`safeJson`, no filenames or raw errors in info). New events only:

| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `design.build.start` | info | report builder | `theme_count`, `component_count` | once |
| `design.build.done` | info | report builder | `css_bytes`, `font_bytes`, `html_bytes`, `ms` | once |
| `design.token.missing` | error | token compiler | `token` (a token name, never a path) | per failure |
| `design.vendor.drift` | error | vendor check | `file_count`, `first_id` (an index into the manifest) | per failure |
| `design.contrast.fail` | error | contrast check | `pair` (token names), `ratio`, `needed` | per failure |
| `report.findings.done` | info | findings builder | `n_findings`, `n_numbers_checked` | once |

Production runs at info only; every failure is diagnosable from these (token name, pair, count). `debug` adds one line per component rendered, literal names (`design.render.StatTile`). A test per event. A runbook line each: missing token means the contract and `themes.ts` disagree (rerun `vendor-check`); drift means `vendor/` differs from `VENDORED.md` hashes (re-copy or re-record deliberately, never edit in place); contrast fail names the pair to change.

## Scope

**Scope.** Presentation and design of the existing report only. No change to any model, number, seed or result file (the numbers the page shows must equal the files they come from; plans 00, 04, 05 hypotheses H9/H12/H18 keep passing). Substrate stays bare aluminium; every PROXY and scenario-ageing label survives the rewrite. Out of scope: new analyses, new data, a hosted site, translating to Indonesian (recorded as BLOCKED-12 in Task 5: the glossary is structured so a translation is data, not code).

**Standalone rules.** One offline HTML file (no network request, no external URL except in Plotly's own strings); `src/core` stays pure; the design layer is browser-safe and Node-safe (no `node:*` in `src/web/design/`; fonts and tokens are read by the build in `src/node/`).

## Stack and versions

| Layer | Choice |
|---|---|
| Tokens | `vendor/torviello-design/contracts/design-tokens.json` (W3C DTCG draft), compiled to CSS custom properties by `src/web/design/tokens.ts` |
| Themes | dark = Torviello brand as shipped; light = derived (the brand is dark-only), both contrast-tested; default follows `prefers-color-scheme`, toggle kept |
| Type | Inter (UI), JetBrains Mono (numbers, hashes), embedded subsets; fallbacks as in `tokens.css` |
| Components | pure functions in `src/web/design/{atoms,molecules,organisms,templates}/` returning HTML strings |
| Charts | Plotly, themed from tokens by `src/web/design/plotTheme.ts` |
| Parity | `vendor/VENDORED.md` plus a hash manifest, checked by test |

## Gaps this plan closes

**Gaps this plan closes** (measured on the plan-00 report, `reports/report.html`, 1280 px wide): the page is 30,240 px tall (cards 9,366, explorer 4,950, Indonesia 4,736, optimisation 3,679, live 1,289); a top navigation of ten undifferentiated links; the first screen is a caveat, a run id and a 64-character hash, not the finding; generic blue-on-grey styling unrelated to the brand; numbers carry jargon (`r_solar`, `t_max`, PROXY indices) with no plain-language gloss; every chart sits at the same visual weight; the reading path follows the pipeline, not the reader's questions.

## Best-practice rules applied (each becomes a test or a checked decision)

R1 *Answer first.* The first screen states the verdict and the recommended recipes (inverted pyramid). R2 *Progressive disclosure.* Detail is one click away and closed by default; the reader never meets all 96 cards unprompted. R3 *One message per chart,* with the message as the heading ("Aluminium primer runs 11 K hotter than the coated roof"), direct labels instead of legends where there are three or fewer series, a shared baseline and units on every axis. R4 *Uncertainty is shown the same way everywhere* (the interval is always a drawn band or whisker and always named "parameter uncertainty only"), never only as a number in brackets. R5 *Colour carries meaning only:* one accent for the recommended recipe, neutral for the rest, a fixed colour per role across the whole page; never colour alone (shape or label too); palette validated colour-blind safe. R6 *Plain language:* a term is defined at first use and in a glossary; jargon names appear only in the Details level. R7 *Honesty is structural,* not a banner: PROXY is a badge component attached to every index value, ageing is a labelled scenario chip. R8 *Consistent placement:* the same fact lives in the same place on every card. R9 *Reading width and rhythm:* body text 60 to 75 characters, a spacing scale from the tokens, no section taller than two viewports before a break or disclosure. R10 *Accessible by default:* AA contrast, keyboard operable, visible focus, reduced motion respected, print works.

## Alternatives considered and Risks

| Option | Decision |
|---|---|
| Rebuild the report in Svelte 5 + Vite (the landing stack, so components copy as-is) | Rejected: adds a framework and build chain to a file whose value is being one reproducible offline artifact; Task 1 measures the bundle and the byte-reproducibility risk to confirm; the live worker and builders would be rewritten for no reader benefit |
| Keep the current CSS and only restyle | Rejected: the problems are structure and reading path, not paint |
| Pure TS component functions mirroring the vendor atoms and sheets | **Chosen**: same atomic structure and tokens, zero runtime, testable as strings and in Chrome |
| Link `torviello-design` by path alias (the monorepo rule GOV-12.07) | Rejected here: different repository; a pinned copy with a drift check gives the same guarantee without a cross-repo build dependency |
| Hosted fonts (Google Fonts) | Rejected: the report must work offline |
| Human usability study | Cannot be run by the agent; replaced by a blind comprehension test (H3) plus the author's sign-off as the final gate |


### Risks (pinned by tests)

| Risk | Pinned by |
|---|---|
| Light theme drifts from the brand or fails contrast | H4 contrast tests on every text and surface pair, both themes |
| Redesign changes a number or drops a PROXY label | H7 numbers equal files; H8 labels; plan 00/04/05 report tests kept green |
| Embedded fonts blow the size budget | Task 1 spike Q2; H6 size cap; fallback fonts specified |
| Vendor copy goes stale or is edited | H5 drift manifest test |
| Computed headline sentences state something the data does not | H7 each sentence is generated from named fields; a test recomputes every number independently from the CSV |
| Collapsed content hides a caveat | H9 every PROXY value is visible without opening anything; limits link visible on the first screen |
| Visual regressions slip past string tests | H10 browser layout metrics plus reference screenshots reviewed by the author (never auto-accepted) |
| Page becomes slow | H12 live latency unchanged; build time cap |

## Requirements

FR-1 The first screen (1280×800, scroll 0) MUST contain the verdict sentence, the three recommended recipes (role name, headline cooling number with interval, cost position), the honesty statement and a visible "limits" link. FR-2 The report MUST be organised as: Verdict, Recipes, Why it works (the three layers explained), Indonesian climate, Budget, Explore all 96, Method and limits, Provenance; the sections absent from the run (refine, budget, indonesia) are omitted without error. FR-3 Headline sentences MUST be generated by a pure `findings()` from the result files; every number in them MUST equal the source value at the displayed precision. FR-4 Every index value MUST render through the `ProxyBadge` or `Stat` molecule so the label cannot be omitted. FR-5 The design layer MUST consume semantic tokens only; a raw colour, font or spacing literal outside the token compiler is a test failure. FR-6 Both themes MUST pass AA (4.5:1 text, 3:1 large text and graphics). FR-7 The page with all disclosures closed MUST be at most `T_page_px` tall at 1280 px. FR-8 A glossary MUST define every domain term used in Verdict and Recipes and be reachable from each first use. FR-9 The report MUST remain one offline file, byte-identical for the same run id, and at most `T_size_mib`. FR-10 Plan 00 live behaviour (latency, newest-wins, brush re-inject, `#test` hook rules) MUST be unchanged. FR-11 `design-gallery` MUST render every component in every state and both themes from the same builders. NFR-1 Build ≤ T_build_s. NFR-2 No dependency added to the report's runtime. NFR-3 The vendor copy is read-only; changes go through a recorded re-sync.

## Acceptance: hypotheses and proofs

| ID | Hypothesis (falsifiable) | Experiment and deciding observable | Falsified when |
|---|---|---|---|
| H1 | Closed-by-default page height at least 70 % lower than the 30,240 px baseline | Chrome 1280 wide, all `details` closed, `scrollHeight` | height > `T_page_px` (9000) |
| H2 | The first screen answers which recipe, how much better, how sure | Chrome 1280×800 at scroll 0: verdict element, three recipe elements with numbers, honesty text and limits link all intersect the viewport | any missing |
| H3 | A reader who has only the page text can answer eight set questions | A fresh read-only reviewer agent given only the page's visible text (no repo, no files) answers 8 questions written beforehand in `tests/fixtures/comprehension.json` with answer keys derived from the CSV (which recipe is the cooling pick, its cooling number, whether it is a measurement, what PROXY means, what the budget tells you, which site benefits most, what is not modelled, what to do next); scored by exact-key match, run twice | fewer than `T_comp` (7 of 8) correct in either run |
| H4 | Both themes pass contrast | Compute ratios for every text token on every surface token it is used on (from the token pairs table) and for chart colours on plot backgrounds | any pair below 4.5 (text) or 3 (graphics, large) |
| H5 | Vendor copy equals its record | `vendor-check` hashes every file against the manifest; also token parity: every semantic token in the contract appears in the compiled CSS with the same value (dark theme) | any hash or value differs |
| H6 | Size and offline | `report.html` ≤ `T_size_mib`; Chrome offline: 0 failed requests, 0 console errors; fonts load from the file | any exceeded |
| H7 | Numbers on the page equal the files | Recompute each `findings()` number and 30 sampled table and tile values from the CSV and JSON in the test (independent code path), compare at displayed precision | any differs |
| H8 | Honesty survives | Every index value is inside a `ProxyBadge` or labelled; "scenario" chip on every aged value; forbidden-phrase scan page-wide (plan 00 list); aluminium-only text present | any missing or any forbidden phrase |
| H9 | Collapsing hides no caveat | With all `details` closed the visible text still contains the PROXY statement, the interval definition and the limits link | any missing |
| H10 | Layout holds at three widths and in print | Chrome at 390, 768, 1280: no horizontal overflow, tap targets ≥ 44 px, headings never orphaned at page end; print media: no dark background, details open; reference screenshots written to `reports/shots/` and compared to the committed set by a perceptual hash with a tolerance, a changed shot fails until the author re-approves | any breach |
| H11 | Keyboard and screen reader basics | Tab order reaches nav, theme toggle, each disclosure, slider, limits; each disclosure toggles with Enter/Space; landmarks and headings form a valid outline (one h1, no skipped level); `aria-label` on charts with the chart's message | any breach |
| H12 | Live simulator unchanged | Plan 00 H9 and H10 tests rerun | p95 > 100 ms or any plan 00 test fails |
| H13 | Deterministic | two builds of the same run, same bytes; gallery too | any byte differs |
| H14 | Glossary complete | every term in the controlled term list (`src/web/design/terms.ts`) used in visible text of Verdict and Recipes has a glossary entry and a link at first use | any missing |

Thresholds (frozen once, never edited after): `T_page_px` 9000, `T_size_mib` 8, `T_comp` 7 of 8, `T_contrast_text` 4.5, `T_contrast_large` 3, `T_tap_px` 44, `T_build_s` 10 (plan 00), `T_live_ms` 100 (plan 00), `T_shot_phash` frozen from the first approved set in Task 7. Anything that needs a measurement is frozen from the Task 1 spike, not guessed.

**Fault-injection matrix** (edit exactly one input; expect phase, exit code, no stack trace, no partial file):

| ID | Edit | Expected |
|---|---|---|
| F1 | delete one semantic token from a copy of the contract | exit 2, `design.token.missing`, phase `design.tokens`, no `report.html` written |
| F2 | change one byte in a vendored file | `vendor-check` exit 5, `design.vendor.drift` |
| F3 | a themes override that drops a pair below 4.5:1 | exit 4, `design.contrast.fail` naming the pair |
| F4 | remove the embedded font file | exit 5, phase `design.fonts` |
| F5 | a result CSV cell changed after the manifest was written | `report` exit 5 (plan 00 behaviour kept) |
| F6 | `findings()` given a result set with no refine files | the Recipes section falls back to the plan-03 shortlist; the build exits 0; an empty shortlist exits 5 |
| F7 | an unknown component state passed to a molecule | exit 4 at build (a typed state union, tested through a cast), never rendered |
| F8 | a text value containing `<img onerror>` in any data field | escaped in every component; test proves the DOM has no such element |
| F9 | `design-gallery` into an unwritable directory | exit 6, no partial file |

**Given / When / Then** (traced): G1 Given a finished run, when I open the report, then the verdict and three recipes fill the first screen (FR-1, H2). G2 Given a lay reader, when they read the page text, then they answer 7 of 8 questions (FR-8, H3). G3 Given dark or light system theme, when the page opens, then it follows it and both pass AA (FR-6, H4). G4 Given a phone, when I scroll, then nothing overflows and controls are tappable (H10). G5 Given a closed disclosure, when I look at an index value, then it is still labelled PROXY (FR-4, H9).

## Execution contract: one shot, nothing left open

**Preflight gate.** Needed and already present: the vendored copy under `vendor/` (copied 2026-11-22 from the user's repository; the user chose copy); a finished run in `reports/` with `refine`, `budget-table`, `indonesia` outputs (present: `reports/report.html` and `reports/plan-00-run/`); `node_modules` (`bun install`) and `oracle/.venv` only if an oracle is touched (it is not); Chrome installed. If any is missing, print the list and stop.

No stub, TODO, skip, xfail or "decide later". The Task 1 spike ends in written answers that fix Tasks 2 to 7. A by-design limit is recorded in `docs/BLOCKED.md` with reason, owner and unblock condition (BLOCKED-12: Indonesian-language edition needs a reviewed translation, owner Evint; BLOCKED-13: the dark-only brand has no official light theme, the derived one needs the brand owner's approval). Thresholds that need a measurement are frozen once from the first real run. Done means proven: every hypothesis holds with a run id in `docs/proofs/plan-06.md`, `bun run check` and the touched proof files green. If a task fails partway: stop at it, leave the tree clean, report the failing proof with its log. Out of scope for the run: merge and push (the user's go-ahead), publishing the report anywhere.

## Global Constraints

**Global constraints.** Plan 00, 04, 05 hypotheses keep passing. `bun run check` stays at or under about 3 minutes (the heavy checks go in `*.proof.test.ts` with fast twins, `docs/testing.md`). One component per commit from Task 3 on. No attribution lines in commit messages. No Svelte, Vite or other runtime dependency in the report. Never edit `vendor/` in place. CPU rule: one test process at a time; never kill processes you did not start.

## Review Focus

**Review Focus** (attack first): (1) a changed number or a lost PROXY or scenario label; (2) contrast in the light theme and in chart colours on both plots; (3) `findings()` sentences that overstate (for example "best" without the interval, "works" instead of "ranks"); (4) closed disclosures hiding a caveat; (5) the first screen on a 1280×800 laptop and on a 390 phone; (6) vendor drift and any raw colour literal; (7) the comprehension test being gameable (answer keys leaked into the page text as labels rather than earned from content).

## Decisions (all settled)

- D1 Vendor by copy, pinned and drift-checked; the unit has no component code, so the Svelte atoms from `torviello-landing` are the reference for atoms and the design sheets for tokens and states.
- D2 Pure TS component functions, not Svelte (alternatives table).
- D3 Default theme is LIGHT regardless of the operating system's colour-scheme setting; a visible "Dark mode" toggle (aria-pressed, remembered in localStorage inside try/catch, applied before first paint) switches to the Torviello dark brand and back; print is always light. The light theme is derived (the brand is dark-only) and documented as BLOCKED-13. Amended 2026-11-22 (was: follow `prefers-color-scheme`).
- D4 Fonts: embed subsets if within budget (Task 1), else system fallback stacks from the tokens; never a network font.
- D5 Report levels: *Summary* (what the page opens on) and *Details* (disclosures and the explorer); the live simulator and explorer are Details and stay fully functional.
- D6 The chart palette: the brand orange for the recommended recipe and the aluminium baseline in neutral; categorical series from a colour-blind-safe set validated in Task 2; sequential and diverging scales for heat and benefit validated for both themes.
- D7 Component states are typed unions; an unknown state is a build error (F7).
- D8 Section order and names in FR-2; "Why it works" explains the three layers in plain language with one labelled schematic figure drawn from data (layer thicknesses of the recipe), not a decorative image.
- D9 The gallery command is part of the product, built from the same builders.

## File Structure (one source file, one mirrored test)

```
vendor/                                  read-only inputs (+ vendor/manifest.sha256, VENDORED.md)
src/web/design/tokens.ts                 contract -> CSS custom properties (dark brand + derived light + dataviz)
src/web/design/themes.ts                 light-theme and dataviz token values, token pair table for contrast
src/web/design/css.ts                    component CSS assembled from tokens (no literals)
src/web/design/fonts.ts                  @font-face from embedded base64 (data supplied by src/node)
src/web/design/html.ts                   escape + tag helper used by all components
src/web/design/terms.ts                  controlled terms + glossary data
src/web/design/atoms/{button,icon,logo,navLink,sectionLabel,badge,chip,codeBlock,spinner}.ts
src/web/design/molecules/{stat,proxyBadge,intervalBar,callout,disclosure,figureFrame,legend,tabs,sliderField,tableCell}.ts
src/web/design/organisms/{navRail,heroVerdict,recipeCard,findingList,dataTable,glossary,provenance,siteBenefitPanel,budgetPanel}.ts
src/web/design/templates/{reportPage,galleryPage}.ts
src/web/design/plotTheme.ts              Plotly layout/colour from tokens
src/core/report/findings.ts              pure: result files -> headline sentences with their source fields
src/node/report/design.ts                reads fonts and vendor files, builds the CSS, vendor-check, gallery
src/node/report/html.ts, indonesia.ts, optimisation.ts, cards.ts   modified to use organisms
tests/web/design/**, tests/core/report/findings.test.ts, tests/node/report/design.test.ts, tests/report.design.browser(.proof).test.ts, tests/fixtures/comprehension.json
```

The layout guard from plan 01 is extended so every `src/web/design` file maps to a test file under `tests/web/design`.

## Tasks

### Task 1: Spike Q1 to Q6 (fixes everything after)

**Tests:** `docs/spikes/plan-06.md` with runnable scripts under `docs/spikes/plan-06/`; the script exits 0 only if each expectation holds. **Creates:** the spike notes, `vendor/manifest.sha256`, the vendor-check function stub as a working script.
- [ ] Q1 Page budget: render the current report, measure each section's height; propose the closed-by-default structure and confirm `T_page_px` 9000 is reachable (mock the section skeletons with real content lengths). Freeze `T_page_px` here.
- [ ] Q2 Fonts: obtain Inter and JetBrains Mono under their open licences (record licence and source version), subset to the characters the report uses (Latin, digits, units, symbols), produce woff2, measure the base64 size; pass if total ≤ 300 KB, else choose the system-fallback decision and record it (D4). Check reproducible output.
- [ ] Q3 Light theme: derive the light tokens from the brand (orange stays the accent; surfaces `#f7f8fa`-based; text from midnight), compute all contrast pairs, record the pair table.
- [ ] Q4 Dataviz palette: validate a colour-blind-safe categorical set and sequential/diverging scales on both plot backgrounds with simulated deficiency (deuteranopia, protanopia, tritanopia) and the minimum distance; use the `dataviz` skill's method.
- [ ] Q5 Svelte alternative measured: build a one-component Svelte 5 + Vite single-file build in the scratchpad, record size, build steps and byte-reproducibility; confirm D2 or reverse it with evidence.
- [ ] Q6 Comprehension harness: write the eight questions and answer keys and prove the harness can fail (give the reviewer a page with the key facts removed; it must score below 7).
- [ ] Add `vendor/manifest.sha256` and a working `vendor-check` script; commit: `docs: spike answers for report design system`

**Acceptance:** fixes D2, D4, D6 and the thresholds; no hypothesis closed yet.

### Task 2: Tokens, themes and the contract tests

**Tests:** `tests/web/design/tokens.test.ts`, `themes.test.ts`, `tests/node/report/design.test.ts` (vendor-check). **Creates:** `src/web/design/{tokens,themes,html}.ts`, `src/node/report/design.ts` (vendor and font loading).
**Interfaces:**
```ts
export function compileTokens(contract: unknown, themes: Themes): { css: string; names: readonly string[] }   // F1: a missing token throws ConfigError (exit 2)
export const TOKEN_PAIRS: readonly { fg: string; bg: string; kind: "text" | "large" | "graphic"; theme: "dark" | "light" }[]
export function contrastRatio(fg: string, bg: string): number            // WCAG 2.x relative luminance; alpha blended over bg first
export function esc(s: string): string                                    // all five characters; every component uses it
export function vendorCheck(root: string): { ok: true } | { ok: false; first: number; count: number }
```
- [ ] Tests first: `everyContractTokenAppearsInCss` (H5 parity), `missingTokenIsExit2` (F1), `allPairsMeetContrastBothThemes` (H4), `contrastMatchesKnownValues` (white on black is 21, the contract's stated 6.58 for orange on midnight within 0.01 — independent check of the instrument), `vendorCheckDetectsOneByte` (F2), `escEscapesAllFive`, `noRawLiteralsOutsideCompiler` (FR-5: scan `src/web/design/**` except `tokens.ts` and `themes.ts` for colour literals).
- [ ] Run, expect FAIL, implement, PASS, commit: `feat(design): token compiler, light theme and contrast contract`

**Acceptance:** H4, H5, F1, F2, F3.

### Task 3: Atoms (one commit per atom)

**Tests:** `tests/web/design/atoms/*.test.ts` (string contract) and one browser test of the rendered gallery states. **Creates:** `src/web/design/atoms/{button,icon,logo,navLink,sectionLabel,badge,chip,codeBlock}.ts`, `src/web/design/css.ts` (atoms part), `tests/web/design/atoms/`.
**Interfaces:** each atom is `(props) => string`, props a typed object with a closed `state` union per the vendor sheet; for example `button({ label, variant: "primary" | "ghost" | "inverse", state: "idle" | "loading" | "error" | "empty", icon?, href?, external? })`. `badge({ tone: "proxy" | "scenario" | "nominal" | "go" | "stop", label })` and `chip` are the report-specific atoms, designed to the same sheet format and added to `docs/design/report-sheets.md` (purpose, tokens, states, contract, accessibility, do and don't) before code.
- [ ] For each atom, in this order Button, Icon, Logo, NavLink, SectionLabel, Badge, Chip, CodeBlock: (a) write its sheet entry (report atoms) or cite the vendor sheet entry (Torviello atoms); (b) tests first covering every state, escaping (F8), focus-visible, target size ≥ 44 px, token-only styling; (c) implement; (d) commit alone: `feat(design): <Atom> atom`.
- [ ] Gallery fragment for atoms; Chrome test: each state renders, no console errors.

**Acceptance:** H4, H11 (atom level), F7, F8.

### Task 4: Molecules and organisms (one commit per component)

**Tests:** `tests/web/design/molecules/*.test.ts`, `organisms/*.test.ts`. **Creates:** the molecule and organism files listed above.
**Interfaces (the ones later tasks depend on):**
```ts
stat({ label, value, unit?, interval?: [number, number], proxy?: boolean, scenario?: boolean, note? }): string   // FR-4: an index value without proxy/scenario/nominal tone is a type error
intervalBar({ lo, hi, value, min, max, label }): string                                                         // R4: the one way an interval is drawn
disclosure({ summary, open?: boolean, level: "detail" }): (inner: string) => string                              // native <details>, keyboard by default
heroVerdict({ verdict, recipes: Recipe3[], honesty, limitsHref }): string
recipeCard({ role, name, cooling, cost, layers, badges }): string
dataTable({ columns, rows, caption }): string                                                                    // sortable headers only if tested; numeric columns right-aligned, units in headers
```
- [ ] Order (each with sheet entry first, tests first, own commit `feat(design): <Name>`): proxyBadge, stat, intervalBar, callout, disclosure, figureFrame, legend, tabs, sliderField, tableCell, then navRail, heroVerdict, recipeCard, findingList, dataTable, glossary, provenance, siteBenefitPanel, budgetPanel.
- [ ] Tests assert: escape, state unions, no raw literals, a11y (labels, roles), print rules, and that every index value passes through `stat` or `proxyBadge`.

**Acceptance:** H4, H8, H9 (component level), H11, F7, F8.

### Task 5: Content and information architecture

**Tests:** `tests/core/report/findings.test.ts`, `tests/web/design/terms.test.ts`, `tests/node/report/design.test.ts` (page structure). **Creates:** `src/core/report/findings.ts`, `src/web/design/terms.ts`, glossary data, `docs/BLOCKED.md` entries 12 and 13.
**Interfaces:**
```ts
export function findings(input: { shortlist: Shortlist; results: ResultRow[]; refine?: RefineRecipes; budget?: BudgetTable; indonesia?: IndonesiaSummary }): { id: string; sentence: string; sources: string[]; numbers: { key: string; value: number; digits: number }[] }[]
```
- [ ] Tests first: `everyNumberEqualsItsSource` (H7, recomputed from the CSV by independent test code), `sentencesNameTheirUncertainty` (every comparative sentence carries its interval or says "nominal only"), `noOverclaim` (no "best", "proves", "works"; ranks not measures), `fallbackWithoutRefineFiles` (F6), `termsAllDefined` (H14), `blockedEntriesPresent` (ids 12 and 13 exist, ids unique, no count asserted).
- [ ] Write the reading path of FR-2 as the page's outline (verdict wording, recipe roles in plain language: "Best cooling", "Balanced", "Lowest cost", the three-layer explainer, glossary).
- [ ] Run, FAIL, implement, PASS; commits: `feat(report): computed findings`, `feat(report): glossary and plain-language terms`.

**Acceptance:** H7, H14, F6.

### Task 6: Figures and page assembly

**Tests:** `tests/web/design/plotTheme.test.ts`, `tests/web/design/templates/reportPage.test.ts`, `tests/report.design.browser.test.ts` (fast subset) and `tests/report.design.browser.proof.test.ts` (full). **Creates:** `src/web/design/plotTheme.ts`, `templates/{reportPage,galleryPage}.ts`; **Modifies:** `src/web/figures.ts`, `src/node/report/{html,indonesia,optimisation,cards}.ts`, `src/node/cli.ts` (`design-gallery`).
- [ ] Figures: each figure gets its message title, direct labels, shared axes in small multiples where compared (Indonesia benefit by site; recipes against the baseline), `intervalBar` semantics for intervals, colours from D6, theme from tokens (parcoords axis stroke, paper and plot colours from tokens, no black on dark), aria-labels carrying the message.
- [ ] Assembly: the page template composes navRail (sections as a left rail on wide screens, a top bar on phones), heroVerdict, recipe cards, disclosures for Details, the live simulator and explorer inside Details with their plan-00 behaviour intact, provenance last; the cards section becomes a sortable table with a card view per row on demand, replacing 96 expanded cards.
- [ ] Tests first: H1, H2, H6, H8, H9, H10, H11, H12, H13 as listed above, plus every plan-00, 04 and 05 report test kept green; fix the page, never the test.
- [ ] Commits: `feat(design): themed figures`, `feat(report): page template on the design system`, `feat(design): component gallery command`.

**Acceptance:** H1, H2, H6, H8, H9, H10, H11, H12, H13, F9.

### Task 7: Comprehension test, review, proof log

**Tests:** the harness from Task 1 run for real; mutation checks.
- [ ] Build the report from the real run; extract the visible text; run the H3 comprehension test twice with a fresh read-only reviewer agent (sonnet, given only the text and the eight questions); record answers and score in the proof log. A score below 7 means the page is revised and the test rerun; the questions and keys are never edited afterwards.
- [ ] Reference screenshots at 390, 768 and 1280 in both themes saved to `reports/shots/` and shown to the author for approval; freeze `T_shot_phash` from the approved set.
- [ ] Mutation checks (commit first, copy to the scratchpad, never mutate the tree): M1 drop the PROXY badge from `stat` → H8 fails; M2 set the light text token to a low-contrast value → H4 fails; M3 put a raw colour in a molecule → FR-5 test fails; M4 let `findings()` round a number differently → H7 fails; M5 close the limits link inside a disclosure → H9 fails; M6 remove `escape` from one component → F8 fails. A surviving mutant means the test is strengthened first.
- [ ] `docs/proofs/plan-06.md`: run ids and observables for H1 to H14, the F table, the mutation table, the measured page height before and after, the comprehension scores; `bun run check` and each touched proof file once, one at a time.
- [ ] One adversarial review, one fix wave. Commit: `test(design): comprehension test, mutation checks and proof log`.

**Acceptance:** H3, H1 to H14 together, F1 to F9.

## Rollout and rollback

No flag: `report` writes the new design; the previous builder stays in git history. Rollback is `git revert` of the plan-06 commit range; results and manifests are unaffected because no result file changes. The author's sign-off on the screenshots and the comprehension score are the go or no-go before merge. Hand-offs outside the repo: none (the brand owner approving the derived light theme is BLOCKED-13, owner Evint).

## Part 2: test specification

```ts
// tests/web/design/themes.test.ts
test("allPairsMeetContrastBothThemes", () => {
  for (const p of TOKEN_PAIRS) {
    const r = contrastRatio(resolve(p.fg, p.theme), resolve(p.bg, p.theme))
    expect(r).toBeGreaterThanOrEqual(p.kind === "text" ? T_CONTRAST_TEXT : T_CONTRAST_LARGE)
  }
})
test("contrastMatchesKnownValues", () => {
  expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 2)
  expect(contrastRatio("#ff683b", "#0b1020")).toBeCloseTo(6.58, 1)   // the contract's own stated value
})

// tests/web/design/molecules/stat.test.ts
test("indexValueWithoutToneIsATypeError", () => {
  // @ts-expect-error an index stat must say proxy, scenario or nominal
  stat({ label: "Corrosion index", value: 0.73 })
})
test("statEscapesEveryField", () => {
  const html = stat({ label: "<img onerror=x>", value: 1, tone: "proxy" })
  expect(html).not.toContain("<img")
})

// tests/core/report/findings.test.ts
test("everyNumberEqualsItsSource", async () => {
  const f = findings(await loadRealRun())
  for (const s of f) for (const n of s.numbers)
    expect(Number(n.value.toFixed(n.digits))).toBe(independentFromCsv(n.key, n.digits))
})
test("noOverclaim", async () => {
  for (const s of findings(await loadRealRun())) expect(s.sentence).not.toMatch(/\b(best|proves?|works|guarantee)/i)
})

// tests/report.design.browser.proof.test.ts
test("closedPageIsAtMostT_page_px", async () => {
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  expect(h).toBeLessThanOrEqual(T_PAGE_PX)
})
test("firstScreenAnswersTheThreeQuestions", async () => {
  for (const sel of ["[data-hero-verdict]", "[data-recipe]:nth-of-type(3)", "[data-honesty]", "a[href='#limits']"])
    expect(await inViewport(page, sel)).toBe(true)     // 1280x800, scroll 0
})
test("closedDisclosuresHideNoCaveat", async () => {
  const text = await visibleText(page)                 // all <details> closed
  for (const needle of ["PROXY", "parameter uncertainty only", "Limits"]) expect(text).toContain(needle)
})
test("noHorizontalOverflowAtThreeWidths", async () => {
  for (const w of [390, 768, 1280]) { await page.setViewportSize({ width: w, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
})

// tests/node/report/design.test.ts
test("vendorCheckDetectsOneByte", () => {
  const copy = copyVendorTo(tmp); flipOneByte(join(copy, "torviello-design/contracts/design-tokens.json"))
  expect(vendorCheck(copy)).toMatchObject({ ok: false })
})
test("missingTokenIsExit2NoFileWritten", async () => {
  const r = await runCli(["report", "--in", dir, "--contract", contractWithoutToken("surface-base")])
  expect(r.code).toBe(2); expect(existsSync(join(dir, "report.html"))).toBe(false)
})
```
