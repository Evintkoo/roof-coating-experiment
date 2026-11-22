# Testing: two tiers

| Tier | Command | What runs | Wall time (this machine, 10 cores) | When |
|---|---|---|---|---|
| fast | `bun run check` | biome, `tsc --noEmit`, every `*.test.ts` except `*.proof.test.ts` (3 files in parallel) | 155 s measured (679 tests in 78 files; was about 17 min before tiering) | every commit, every push |
| proof | `bun run proof` | the nine `*.proof.test.ts` files (`budget.baseline`, `refine.baseline`, `refine.e2e`, `pipeline.e2e`, `indonesia.e2e`, `report.browser`, `report.design.browser`, `design.atoms.browser`, `design.components.browser`), one after the other | 878 s (14.6 min) measured, the sum of the eight files run one at a time (table below) | before a release or a merge that touches the optimiser, the budget table, the pipeline or the models; after changing a frozen threshold's inputs; on demand or nightly in CI |

Measured proof wall times (2026-11-22, one file at a time, `nice -n 10`, load average about 3 from another session):

| Proof file | Wall time |
|---|---|
| `refine.e2e.proof.test.ts` | 357 s |
| `budget.baseline.proof.test.ts` | 331 s |
| `pipeline.e2e.proof.test.ts` | 56 s |
| `refine.baseline.proof.test.ts` | 41 s |
| `report.browser.proof.test.ts` | 40 s |
| `indonesia.e2e.proof.test.ts` | 40 s |
| `design.atoms.browser.proof.test.ts` | 6 s |
| `design.components.browser.proof.test.ts` | 7 s |
| total | 878 s |

Plan 06 measurement (2026-11-22, one process at a time, `nice -n 10`, other sessions active): `bun run check` took 283.7 s (979 tests in 130 files, exit 0) at load average 3.8 to 8.4; the idle 155 s baseline above is for 679 tests and was not reproducible under that load. Per-file times from the junit reporter (summed 286 s): `node/refine.test.ts` 68 s, `oracle.fixtures.test.ts` 41 s, `core/opt/objective.test.ts` 26 s, `report.browser.test.ts` 26 s, `budget.baseline.test.ts` 17 s, `node/cli.test.ts` 15 s, `report.design.browser.test.ts` 14.6 s, `design.components.browser.test.ts` 5 s. The plan-06 files together are about 21 s (7 %); none depends on a sample size or a wall-clock limit, so none was moved to the proof tier. Plan-06 proof files, run once each: `report.design.browser.proof` 12.5 s, `design.atoms.browser.proof` 1.8 s, `design.components.browser.proof` 4.5 s, `report.browser.proof` 51.7 s (live latency p95 92.7 ms against 100 ms at load 3 to 4).

`bun run test` is the fast tier without biome and tsc. `bun run proof` runs the proof files serially on purpose: they assert wall-clock limits (plan 05 `T_nrt` 600 s, `T_nrt_table` 900 s, plan 03 frozen runtime), so they must not compete with each other for cores.

## The rule

A slow test is never moved out of the gate. It is split: the same assertions run at small size in the fast tier and at the full size, with the original thresholds, in the proof tier.

- `X.test.ts` is the fast file; `X.proof.test.ts` is its full-size twin, in the same directory. The layout guard (`tests/layout.guard.test.ts`, `proofFilesPairWithAFastTwin`) fails when a proof file has no fast twin; a proof file is judged as its twin (a mirror of a source file or on the cross-cutting whitelist).
- Both files call one suite body in `tests/suites/*.ts` with a scale object (`*_FAST`, `*_PROOF`). One body means a fast test cannot drift away from its proof test: only the sample sizes differ.
- The default `bun test` ignores proof files with `--path-ignore-patterns '**/*.proof.test.ts'`; `bun run proof` selects them with the path filter `.proof.test.ts` (bun 1.3.14 semantics: a positional argument is a substring filter on the path).
- Frozen thresholds and fixtures (`tests/fixtures/frozen_*.txt`, the oracle files, `T_nrt`, `T_nrt_table`, `T_REPAIR`) are read by both tiers and never edited by a tier change.

## What is small in the fast tier and what stays full

| File (fast) | Fast scale | Proof twin and full scale |
|---|---|---|
| `budget.baseline.test.ts` | 3 profiles x 6 levels, 2 draws, plan 3 with 4 draws; lookup 1000 random budgets per profile, 8 polish budgets | `budget.baseline.proof.test.ts`: 3 x 100 levels, 64 draws, 4096 Sobol points, 10 budgets per profile (H13), 20 polish budgets (H17), runtime limit (H11) |
| `refine.e2e.test.ts` | real CLI chain `run` (4 draws) then `refine --starts 4` then `budget-table` (3 x 4 levels, 2 draws), then `report` again (the Optimisation section appears, `extra[]` survives, same bytes on a second run); fault matrix F1..F13 | `refine.e2e.proof.test.ts`: `run` 256 draws, `refine` 20 starts, `budget-table` 3 x 100 levels, 64 draws; the limits of H11; the same fault matrix |
| `refine.baseline.test.ts` | plan 3 with 8 draws, `refine --starts 4` (20 solves); H5 against the same 96 screened candidates and 4096 Sobol points | `refine.baseline.proof.test.ts`: 256 draws, default 20 starts (40 solves), runtime limit |
| `pipeline.e2e.test.ts` | three real `run`s with 4 draws (artifacts, same-seed hash, different-seed hash), debug events at 4 draws, fault matrix F1..F9 | `pipeline.e2e.proof.test.ts`: three real `run`s at 256 draws against the frozen runtime, debug events at 16 draws |
| `report.browser.test.ts` | real Chrome (headless, own instance, `channel: "chrome"`), 11 tests, about 21 s including the real 4-draw `run` the page is built from: offline load with zero failed requests and console errors, two-axis brush equals a plain filter (table and scatter matrix), clear restores all 96, dark scheme (background, Plotly paper, parcoords stroke, toggle), 390 px width without horizontal overflow, `#test` hooks absent without the fragment, and the five size-independent proofs `axisReorderKeepsBrush`, `brushSurvivesPlotlyReact`, `scenarioChangeKeepsSelection`, `noMatchShowsExplicitRow`, `liveMatchesCoreInBun` (five input states; they do not depend on a sample size or a wall-clock limit, and cost about 10 s together) | `report.browser.proof.test.ts`: all 20 tests of plan 00 Task 5, the fast ones included, plus the ones that stay out of the gate because they assert a wall-clock limit or hold the page for a long time: 200-move latency with `T_live_ms` 100, newest wins under a 50-event burst, layers off, 300-event hold, clamping, keyboard to the Limits link, print palette, no console errors during live use, debug panel. The suite body is `tests/suites/reportBrowser.ts`; the proof file registers every test, the fast file the subset |
| `design.atoms.browser.test.ts` | real Chrome (own instance, `channel: "chrome"`): every atom state of the gallery in both themes with no console errors or failed requests and the embedded fonts loaded, 44 px target sizes, the focus ring colour and width, reduced motion, 390 px width, `data-theme` over the system scheme; about 3 s | `design.atoms.browser.proof.test.ts`: the fast subset plus the computed text contrast (4.5:1) of every state in both themes and the print palette under a dark system scheme. Suite body `tests/suites/designAtomsBrowser.ts` |
| `report.design.browser.test.ts` | real Chrome on the redesigned page built from a real 4-draw run plus the refine fixtures: H1 closed height at 1280 against `T_page_px` 9000 (with a control that opens every disclosure and must exceed it), H2 first screen at 1280x800, H6 size and offline with the embedded fonts, H8 every index labelled and the page-wide forbidden-phrase scan (with the checks that it can fail), H9 closed disclosures still show PROXY, the interval definition and the limits link, H10 three widths without overflow, tap targets of 44 px and print, H11 heading outline, landmarks, chart names, Tab path and Enter/Space on a disclosure, H13 two builds same bytes, figures following the theme toggle, the budget panel answering from the table; about 15 s | `report.design.browser.proof.test.ts`: the same suite body at proof size. Suite body `tests/suites/designReportBrowser.ts` |
| `design.components.browser.test.ts` | real Chrome: the molecule and organism gallery in both themes (every state, no console errors or failed requests), 44 px targets, a phone width without overflow, the skip link as first Tab stop and the focus ring, the nav rail (left, sticky) against the top bar, the first screen of the hero at 1280x800 and 1440x900, tabs by keyboard, the table sort by keyboard with `aria-sort`, a glossary link opening its closed disclosure, the budget panel live region driven by the slider, number box and chips (real exact lookup, bundled for the browser), print opening disclosures and tab panels with a control that shows the check can fail; about 4 s | `design.components.browser.proof.test.ts`: the fast subset plus the computed text contrast (4.5:1) of every text element of every state in both themes (disabled controls and the primary button gradient excepted, as in the atoms suite) and the print palette. Suite body `tests/suites/designComponentsBrowser.ts` |
| `node/report/indonesia.test.ts`, `node/report/optimisation.test.ts`, `honesty.test.ts` | one real Jakarta site, two years, 4 draws (Indonesia); the page checks of the report in real Chrome, including both themes for the Indonesia bar series (computed colours at least 3:1 against the plot background) and the refused edit of one refine CSV cell | none (the five-site proof is `indonesia.e2e.proof.test.ts`) |
| `node/budget.test.ts` | 3 x 3 table, 2 draws (one and two workers, byte-identical) | none: it was already a small table; its size was cut from 3 x 12 / 8 draws |
| `node/refine.test.ts` | one and two workers at 2 starts for the byte-equality and event tests; every mutation-killing case unchanged at 4 starts | none |

The mutation-killing cases found in earlier reviews stay in the fast tier at their original size: `activeConstraintIsSolvedNotJustRespected` (4 starts, cpvc 0.2), `delaminationCapActiveIsSolvedNotJustRespected`, `hessianEstimateIsTheFirstBracketProbe`, the lookup property of `budgetTable.test.ts`, and the lookup property on the real table (1000 random budgets per profile).

### What the proof tier alone proves

- **H13, the Sobol part.** The fast tier compares the table with the 96 screened candidates only. Against 4096 Sobol points a 3 x 12 table loses at one budget (durability_first level 3: 0.163 against 0.092): the continuation between levels needs the fine spacing of 100 levels to stay in the best basin. This is a property of the table size, so the Sobol comparison is asserted only on the 100-level table. See the report of the tiering commit.
- **H11, the runtime limits** (`T_nrt` 600 s, `T_nrt_table` 900 s, the frozen plan 03 runtime): they only mean something at full size. The fast files still assert them, but at small size they cannot fail.
- **H13 non-vacuity at 27 of 30.** The proof tier asserts at least 27 of 30 budgets have a brute-force point to beat; the fast tier asserts the same shape (every budget but the level-0 budget of each profile).

## CI

There is no CI configuration in this repository yet. When one is added:

```yaml
# .github/workflows/test.yml (suggested)
on:
  push:
  schedule: [{ cron: "0 18 * * *" }]   # nightly proof
  workflow_dispatch:
jobs:
  check:
    if: github.event_name != 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.3.14 }
      - run: bun install --frozen-lockfile
      - run: bun run check
  proof:
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.3.14 }
      - run: bun install --frozen-lockfile
      - run: bun run proof
```

## Plan 04 tests need the weather cache

The Indonesia tests read the real NASA POWER cache and the TMYx files under `data/indonesia/` (git-ignored, not redistributed, listed in the committed `data/indonesia/SHA256SUMS`). Run `bun run spandek fetch-data --indonesia` once (about 3 minutes, network); without the cache these tests fail with a preflight message that names the command, they are never skipped. The fast tier uses one site and two years with 4 draws; the proof tier (`indonesia.e2e.proof.test.ts`) the five sites, ten years and 256 draws.

## Adding a slow test

1. Write the suite body in `tests/suites/<name>.ts` taking a scale object.
2. Add `tests/<name>.test.ts` (fast scale) and `tests/<name>.proof.test.ts` (full scale), each three lines.
3. If the fast scale cannot keep a hypothesis (as with H13 above), say so in the proof file and in this document; never lower a threshold to make the small size pass.
