# Triage of docs/qa/bugs.md (plan 07 Task 1)

Pre-fix commit: `041ab2d` (main). Every bug has a regression test in `tests/qa/regression/` (one file per bug; the header names the bug and the pre-fix commit). The tests were run against a scratch copy of `041ab2d` (git archive plus the new test files); the last column says whether each test failed there (all did, except `m10`, which pins a toggle that main already had). The run used `git archive 041ab2d` into a scratch directory, the new test files copied in, one `bun test` per file.

| Bug | Sev | Verdict | Fix (summary) | Regression test | Fails on pre-fix |
|---|---|---|---|---|---|
| M1 skip link under the rail | major | fix | `.tv-skip` z-index 3 (rail 1, tools 2) | `M1-skip-link.test.ts` | yes |
| M2 headings under the sticky bar on a phone | major | fix | `html{scroll-padding-top}` below 64em | `M2-phone-anchors.test.ts` | yes |
| M3 Theme button covers the nav | major | fix | `.page__tools` in flow below 64em, rail margin removed | `M3-theme-button.test.ts` | yes |
| M4 charts unusable on phone, legends overprint, SP-075 clipped | major | fix | wide figures scroll inside their box (`fig--wide`), direct labels only for the recipes and C0/C1 (the 8 ablation lines are named on hover), two-line axis titles, `tickformat` | `M4-charts.test.ts` | yes |
| M5 budget slider cannot reach the dearest recipe | major | fix | `snapToBounds` in the slider script and in the budget mount | `M5-budget-max.test.ts` (+ unit test in `sliderField.test.ts`) | yes |
| m1 number box and simulated value disagree | minor | fix | invalid entry keeps the previous result, marks `aria-invalid`; blur restores and re-requests | `m1-number-box.test.ts` | yes |
| m2 arrow keys on fractional boxes | minor | fix | box `step` is the slider step | `m2-arrow-keys.test.ts` | yes |
| m3 failed or crashed live worker | minor | fix | `fail()`: role alert, body-size message, controls disabled, tiles "unavailable", `onerror` clears in-flight. The crash case is simulated (a worker subclass that dies on its second run); a genuine crash was not provoked | `m3-worker-failure.test.ts` | yes |
| m4 "hottest day" W8 contradiction | minor | fix | wording scoped to bare aluminium; the cards name the recipes' own hottest scenario | `m4-hottest-day.test.ts` | yes |
| m5 priority chips change nothing | minor | fix (data decision below) | one frontier, no chips | `m5-profiles.test.ts` | yes |
| m6 no current-section marker | minor | fix | `NAV_SPY_SCRIPT` sets `aria-current` on the section being read | `m6-scroll-spy.test.ts` | yes |
| m7 sort caption vs two unsortable columns | minor | fix | "On the Pareto front" and "Shortlist role" sortable (the third, Pareto frequency, was already fixed on main) | `m7-explorer-sort.test.ts` | yes |
| m8 320 px sideways scroll | minor | fix | hero Limits button wraps | `m8-overflow-320.test.ts` | yes |
| m9 heading outline and raw ids | minor | fix | card headings h4/h5 under "Full cards"; `r_solar`, `t_max_c` and the eleven inputs get words | `m9-headings.test.ts` | yes |
| m10 theme toggle state and persistence | minor | already fixed on main (plan 06 toggle: `aria-pressed`, stored choice); pinned | `m10-theme-toggle.test.ts` | passes (pin only, by design) |
| c1 SPLOM titles overprint | cosmetic | fix | two-line short titles, margins | `c1-splom-titles.test.ts` | yes |
| c2 Indonesia bars legend, subtitle, whiskers | cosmetic | fix | legend and subtitle shifted up, subtitle says "scenario ageing" once, whiskers get the neutral baseline colour | `c2-indonesia-bars.test.ts` | yes |
| c3 live temperature y title clipped | cosmetic | fix | title shortened, band stated in the figure note | `c3-live-title.test.ts` | yes |
| c4 live control labels | cosmetic | fix | `unitText`, `liveLabel`, `liveValue` (pure, unit-tested) | `c4-live-labels.test.ts` | yes |
| c5 raw ids in user text | cosmetic | fix | role codes shown as words (cards at display time; the card files are unchanged), robust-optimum names explained | `c5-raw-ids.test.ts` | yes |
| c6 parcoords ticks, title clip, dark SPLOM, checkboxes, debug font | cosmetic | fix for ticks, title clip and debug font; the dark SPLOM is not reproducible on the current build (the dark theme remaps the colour scale: 0 maps to `#295894`, 1 to `#bedaff`); the 44 px checkboxes are wontfix: plan 06 `T_tap_px` (frozen) measures the input itself, so a smaller box would break `tapTargetsAreAtLeast44px` | `c6-chart-details.test.ts` | yes |
| c7 "to scale" drawings differ per recipe | cosmetic | fix (it was a defect: the same stack height for 205 and 104 um) | one shared scale across the three recipes, caption says so | `c7-layer-scale.test.ts` | yes |

Found by `bun run qa`, not in the hunt list: with every disclosure open, the full candidate cards made the page 14 px wider than 320 px (a grid item with `min-width:auto`). Fixed (`.page-cards` single `minmax(0,1fr)` column), test `n1-cards-overflow-320.test.ts`.

Not fixed, with the reason: the UNCERTAIN notes at the end of the hunt (mie cache never hits, ~440 debug lines per update, bare-aluminium interval with all layers off, page height growth while figures draw, 13 captionless tables) are not among the 22 bugs and are performance or content questions for the animation tasks (Task 4 touches the live engine); none was changed here.

## The three budget profiles (m5): decision and evidence

Question: do the priority chips (cooling first, balanced, durability first) change the recipe? Method: read `refine/budget_table.json` of the committed fixture run (3 tables x 100 budget levels, identical budgets, real solver output), compare each pair of profiles at the same budget, objective by objective, and measure the difference against the p5 to p95 half-width of that objective at that budget (K_b = 64 draws, `lo`/`hi` in the table).

| Pair | max difference r_solar | max dT (K) | max d corrosion | max d delamination | cost | levels where any objective differs by more than the half-width |
|---|---|---|---|---|---|---|
| cooling vs balanced | 0.00011 | 0.0035 | 0.0466 | 0 | 0 | 0 of 100 |
| cooling vs durability | 0.00011 | 0.0035 | 0.0466 | 0 | 0 | 0 of 100 |
| balanced vs durability | 0.00003 | 0.0009 | 0.0001 | 0 | 0 | 0 of 100 |

Largest ratio of a difference to the half-width: 0.597 (corrosion index at one level, level 0, the cheapest budget where the recipe sits on a face of the box); temperature and reflectance: 0.052; median difference 0 for every objective. At every one of the 100 levels five of the nine variables (primer GPTES fraction, midcoat PVC, midcoat TiO2 share, topcoat MTES fraction, topcoat thickness) are identical between the three profiles; primer and midcoat thickness differ by at most 1 um at 3 levels (0, 2 and 3, the cheapest budgets) and by less than 0.01 um elsewhere between balanced and durability; the two particle diameters differ by at most 0.04 and 0.08 um. The weights differ (cooling 0.4/0.4/0.1/0.1, balanced 0.25 each, durability 0.1/0.1/0.4/0.4), so the scalar and the knee budget differ (0.81, 0.42, 0.34); the recipe does not.

Decision: the profiles cannot be told apart by the models' own uncertainty, so a priority choice would give the reader a control that changes nothing. The report shows one frontier (the balanced table), drops the chips, names the single recipe card "Modelled recipe for each budget", and says in one sentence why there is one table. A trade-off could only be shown if a profile differed by at least one half-width somewhere; `profileSpread` computes that number from the table, and `singleFrontier` brings all profiles (and the chips) back when it reaches 1. The three tables stay in the run (FR-9 to FR-13 unchanged); the plan 05 text amendment is at the end of `plans/01-digital/05-derivative-optimization.md`.
