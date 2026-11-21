# Plan 00 proof log (live HTML report)

Environment: Bun 1.3.14, TypeScript 7.0.2, plotly.js-dist-min 4.3.0, playwright 1.65.1, Google Chrome 157 (headless, `channel: "chrome"`, one instance per test file, closed in `afterAll`), macOS, load average 3.6 to 5 on 10 cores during the runs. Code under proof: branch `feat/digital-bun`, the Task 5 commit (`feat: live simulator and explorer page with real-browser proofs`) plus the Task 6 commit that contains this file. Test counts: `bun run check` 632 passed, 0 failed, 74 files, 2 min 40 s wall.

Two tiers (see `docs/testing.md`): `tests/report.browser.test.ts` (fast, in `bun run check`, 6 tests, about 11 s) and `tests/report.browser.proof.test.ts` (every test of plan 00 Task 5, 20 tests, about 41 s). One suite body, `tests/suites/reportBrowser.ts`.

## Real run (the sample report)

All with the defaults of the plan 03 and plan 05 commands, one after the other, never overlapping, `reports/plan-00-run` (git-ignored).

| Run id | Command | Exit | Wall-clock | Notes |
|---|---|---|---|---|
| `20261121T172730601-6a7a8fba` | `bun run spandek run --seed 20261121 --out reports/plan-00-run` | 0 | 17.4 s | 256 draws, ends with `report.html` (5,610,665 bytes) |
| `20261121T172756012-a4f1d5e7` | `bun run spandek refine --in reports/plan-00-run --out reports/plan-00-run/refine` | 0 | 23.2 s | 40 solves, 16 on the front; prints the "run report" line and logs `report.stale` |
| `20261121T172824753-2a7e403a` | `bun run spandek budget-table --in reports/plan-00-run --out reports/plan-00-run/refine` | 0 | 334.8 s | 3 profiles x 100 levels; table sha256 `1198dc94...82c6`; prints the same line and logs `report.stale` |
| `20261121T173511300-83c654e0` | `bun run spandek report --in reports/plan-00-run` | 0 | 2.3 s | Optimisation section present, `extra[]` kept, `report.html` 5,779,050 bytes |
| `20261121T175043027-99a1994a` | the same `report` again | 0 | 2.3 s | identical `report.html` sha256 `5b97dabe824144a0a3d3b1d865edd19735e5bd13467b8733f7464e05dc8671d5` (idempotent) |

Manifest of the final directory: `core_sha256` `9adaaba0679f8ad166aa7d57db61f6acb9e039e27d09c8cf4a3f728c96b2de71` (the value on the page), `extra[]` = `refine/budget_table.json`, last key `report_sha256` = the sha256 above (checked equal to the file's hash). The core hash excludes `report_sha256`.

Copy for opening: `reports/report.html` (git-ignored, same bytes).

## Hypotheses

| ID | Proof | Observable |
|---|---|---|
| H1 offline | `offlineZeroFailedRequestsAndNoConsoleErrors` (fast and proof); real report in an offline context | 0 failed requests, 0 console errors, at least 10 Plotly figures, live tiles filled; the real report (with Optimisation) also 0 and 0 |
| H2 deterministic | `html.test.ts` `sameInputsSameBytesAndInputChangeChangesBytes`; `cli.test.ts` `sameRunIdSameBytes` (same directory twice and in a copy); `refine.e2e` `reportRebuilt...` (second `report` gives identical bytes); the real directory twice | `report.html` sha256 identical both times: `5b97dabe...71d5`; changes when one card sentence changes |
| H3 brushing | `brushTwoAxesMatchesFilter`, `brushClearRestoresAll96`, `axisReorderKeepsBrush`, `brushSurvivesPlotlyReact`, `noMatchShowsExplicitRow`, `scenarioChangeKeepsSelection`; real report | real report: brushes on r_solar and corrosion index, plain filter 39 ids, table 39 ids, equal, of 96; scatter matrix selection equals the filter in the test run; clear restores 96 of 96 |
| H4 honesty | `figures.test.ts`, `honesty.test.ts` (bands on every line, PROXY labels, forbidden phrases, Limits link) | pass; mutants M1 and M5 killed |
| H5 numbers = CSV | `html.test.ts` `tableValuesEqualCsv` (96 rows x all columns) | pass |
| H6 theme and layout | `darkSchemeBackgroundAndPlotlyColours`, `phoneViewportNoHorizontalOverflow`, `printMediaNoDarkBackground`, `contrastTokensPassBothThemes`; real report | dark: body `rgb(18, 22, 27)`, Plotly paper = the `--bg` token on four figures, parcoords axis stroke `rgb(195, 204, 214)` (not black); 390 px: `scrollWidth` 390 = `innerWidth` 390; print: white background, figures redrawn with the print palette on `beforeprint`; contrast of every token pair at least 4.5 (mutant M4 killed) |
| H7 size | `sizeWithinLimit`, `buildUnder10s` | real report 5,779,050 bytes (5.51 MiB) against `T_size_mb` 8 and the 16 MB artifact limit |
| H8 live = core = batch | `liveMatchesCoreInBun` (five input states: defaults, both corners of every range, two interior points; tiles, bands, the whole T(t) series and the spectrum, 1e-6 relative); `live.test.ts` `liveEqualsBatchRowAtN256` (1e-9) | pass; mutants M7a and M7b killed |
| H9 latency | `sliderMoveUpdatesWithinLimit`: 200 programmatic input events, each timed from `dispatchEvent` to the `data-shown` attribute (after both live figures are drawn) | test report: median 43.1 ms, p95 50.6 ms, max 53.1 ms; real report: median 46.7 ms, p95 53.2 ms, max 64.8 ms; `T_live_ms` = 100 (frozen in the plan, not edited) |
| H10 newest wins | `newestWinsUnderBurst` (50 events in 100 ms), `extremeSliderHoldNoErrors` (300 events in 60 ms) | displayed ids strictly increasing, at least 2 frames, last frame = last request, final tiles equal `liveSimulate` of the last inputs (1e-6); real report: 4 frames for 50 events (last id 251 = requested); the 300-event hold shows under 60 frames; mutant M6 killed |
| H11 browser-clean | `Bun.build` browser target for main and worker in every report build; `noConsoleErrorsDuringLiveUse` | build succeeds, no `console.` in either bundle, no `ZodError` in the worker, 0 console errors while moving every control, the preset, the layer toggles and the theme |

Fault matrix of Task 6: F1 `f1ExitCode2NoFileWritten` (exit 2, `report.refused` `interval_order` with key `t_max_hi`, no `report.html`), F2 `f2ExitCode5` (exit 5, key `sensitivity.csv`, no `report.html`), F7 `oversizeRefusedF7` (Task 4), F8 `outOfRangeValueIsClamped` (1e9 and -1e9 in a number box, the wind box beyond its extremes: clamped to the plan 01 range, no error text, no console error).

Hook absence: `testHooksOnlyWithTheFragment` (and the real report): `window.__brushRanges` and `window.__burst` are `undefined` without `#test`, functions with it.

## Mutation checks

Each mutant is applied to a fresh copy of the tree under the session scratchpad (the worktree is never mutated), then the named tests run. All killed.

| ID | Mutation | Failing tests |
|---|---|---|
| M1 | live T(t) figure: band fill `none` | `everyLineHasBandTrace` |
| M2 | `new Date()` text in the template | `noTimestampInTemplate` |
| M3 | `selectByRanges`: OR across axes | `selectByRangesMatchesPlainFilter`, `selectionSemantics`, `brushTwoAxesMatchesFilter`, `brushClearRestoresAll96` |
| M4 | light `--muted` token `#888888` | `contrastTokensPassBothThemes` |
| M5 | `axisLabel` without `(PROXY)` | `axisLabelsMarkProxy`, `proxyAxesSaySoInEveryExplorerFigure` |
| M6 | show a result only when its id is the newest request ("latest wins" read literally) | `newestWinsUnderBurst` |
| M7a | page seed 20261122 instead of 20261121 | `liveMatchesCoreInBun`, `layersOffShowsBareSpandek` (the core test cannot see the page's seed, the browser tests can) |
| M7b | live draws from stream 101 instead of 100 | `liveEqualsBatchRowAtN256` |
| M8 | parcoords redraw without re-injecting the held ranges (`structuredClone` instead of `applyBrush`) | `brushSurvivesPlotlyReact`, `axisReorderKeepsBrush` |

A first version of M8 (replace `applyBrush` by the unchanged spec) survived: Plotly writes the brush into the very trace objects the app keeps, so passing them again keeps the brush by aliasing. That is an equivalent mutant, not a weak test; the cloned-spec variant is the faithful "no re-injection" and is killed.

## Proof tier runs (one at a time)

| File | Result | Time |
|---|---|---|
| `tests/report.browser.proof.test.ts` | 20 pass | 41 s |
| `tests/pipeline.e2e.proof.test.ts` | 5 pass (three real 256-draw `run`s now end with `report.html`) | 56 s |
| `tests/refine.e2e.proof.test.ts` | 5 pass (`run` 17.2 s, `refine` 22.8 s, `budget-table` 311.2 s, then `report` includes the Optimisation section and keeps the table) | 357 s |

## Findings recorded while building (plan text to correct, not edited here)

1. D7, D9, Risks and T-BRW-4: `uirevision` does not keep the parcoords brush (spike Q1). The page holds the ranges and the axis order, re-injects `constraintrange` before each draw, and rebuilds the parcoords figure with `Plotly.purge` and `Plotly.newPlot` instead of `Plotly.react`: after an axis reorder, `Plotly.react` painted the held range onto a second axis (Chrome 157, plotly.js 4.3.0; `axisReorderKeepsBrush` pins it).
2. T-BRW-4 changes the scenario, which redraws only the T(t) figure; the test also redraws the parcoords figure through the theme toggle, which is where the brush is at risk.
3. Task 5 Tests: the latency is measured from the input event to the `data-shown` attribute, set after `Plotly.react` has finished for both live figures; no test hook is needed for it. `window.__burst(n, ms)` is under `#test` as planned.
4. D8: the Live section is in the page and the nav now; `report` writes `report.html` at its end, so `indonesia` and `refine` do not rebuild it themselves: `refine` and `budget-table` tell the user (stdout line and a `report.stale` warn event) to run `report` again, which keeps the table registered in `extra[]` and rebuilds the page. The plan text says they regenerate it.
5. `report.html` is not listed in `files[]` of the manifest; its hash is `report_sha256`, the last field (the page shows the manifest, so listing it would make the page depend on its own hash).
6. Event catalogue additions: `report.extra_dropped` (warn, a registered `extra[]` file that is missing or changed), `report.stale` (warn, reason `refine` or `budget-table`), `report.optimisation_found` (debug, Task 4).
