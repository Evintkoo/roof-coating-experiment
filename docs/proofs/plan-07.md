# Plan 07 proof log (lean)

Machine: shared, load average 5 to 40 from other sessions; Chrome headless (Playwright, `channel: "chrome"`), Bun 1.3.14. Page measured from the committed fixture run `20261121T172730601-6a7a8fba` (96 candidates x 9 scenarios, refine and Indonesia included). Commits: `f1d5f72` section, `19920ea` tweening and indicator, `1e1e013` and `862e8aa` fixes (one from the adversarial review), plus this log.

## Heights and size (H14, T_page_px 9000, T_size_mib 8)

| Page | Before | After |
|---|---|---|
| Fixture page, closed, 1280 px | 8,679 px | **8,955 px** (limit 9000) |
| 4-draw test page (no climate or budget), 1280 px | 7,109 px | 7,267 px |
| File | 5.80 MiB | 6.04 MiB |

The new section first measured 810 px (9,488 px page). Reclaimed per D8: the three to-scale layer drawings moved into a closed Details inside "How the layers work" (1,122 to 826 px), and the day player was compacted (flux schematic and chart shorter, one-line lead, Reduce motion switch beside the honesty label): section 572 px. Thresholds untouched.

## Hypotheses

| ID | Evidence |
|---|---|
| H1 | `bun run qa reports/plan-07-run/report.html`: 0 defects (44 controls, 23 anchors, 4 widths, 50-event burst). The 22 Task 1 regression tests pass. |
| H2 | `lintFailsOnSeededDefects` etc.; mutant M8 (duplicate ids ignored) killed |
| H3 | `dayPlayerIsDataBoundAt24ScrubPositionsH3` |
| H4 | `report.animation.browser.proof.test.ts` `frameBudgetAt1xAnd4xThrottle`: 1x n=301 p50 16.7 ms p95 16.7 ms (limit 20); 4x n=302 p50 16.7 p95 16.7 (limit 34). Headless, no GPU; main-thread time per frame was not separately measured (spike Q2: about 0 to 1.5 ms). |
| H5 | `reducedMotionNoAutoplayNoTween` (page: frames 0, transition-duration 0s, `--tv-motion-base` 0ms, tiles jump) and unit twin; Reduce motion switch test; mutant M3 killed |
| H6 | autoplay once and stop (4.0 s wall), control use ends it, Space toggles, visibility pause (frames frozen while hidden), flashes test; mutant M2 killed |
| H7 | pool tests (1, 2, 4 workers byte-identical, equal to batch within 1e-9, max diff 5.7e-14 in the page, 2592 values); speedup 4 over 1 workers 2.61x (223 vs 85 ms) against floor 1.5, `T_screen_s` 2 held; mutant M1 killed |
| H8 | `cancelPaintsNothingAndTerminates`, `noWorkerLeakAfter20Cycles`; mutant M6 killed |
| H9 | `killedWorkerIsVisibleAndRecovers`, page test F6 (lane failed visible, check line still passes) |
| H10 | `raysAndArrowsMatch...H10`, `everyAnimatedElementDeclaresASource...`, page test (every `data-source` known, 32 draw lines, honesty label on both containers); mutant M5 killed |
| H11 | `fanLinesAreTheDrawsAndMatchTheBandH11`; mutant M4 killed |
| H12 | `report.design.browser.proof` 24 of 24 (height 7,267); plan 00 `report.browser.proof` 20 of 20, live latency over 200 moves median 82.6 ms, p95 92.0 ms, max 141.6 ms against `T_live_ms` 100 (loaded machine, 8 ms headroom); honesty and qa regression files pass. Comprehension rerun: two fresh readers, 8 of 8 and 8 of 8 (`docs/proofs/plan-07-comprehension/`, scorer `docs/spikes/plan-06/q6_score.ts` exit 0), fixture not edited. |
| H13 | `tween.test.ts` (fast-check), page `tilesGlideAndEndExactly`: 32.4 to 32.8 through 5 distinct values over 91 frames, ends exactly on `data-nominal`; mutant M7 killed |
| H14 | heights above; animation JS under frozen `T_js_kib` 125 (amended from 100) (`animationJsStaysUnderTheFrozenSizeH14`) |

Faults: F1 to F4 lint tests; F5 page test (`delete window.Worker`, single lane, check passes); F6 above; F7 page test (truncated context: live status, day-status alert, screening failure message, no hang); F8 `hiddenTabStillCorrect`; F9 and F10 component tests (closed unions, escaping); F11 `seekClampsF11`.

Mutation table: M1 to M8 all killed (run on a scratch copy of the committed tree, 8 of 8).

## Skipped or open

- Long proof tier not run in full: `refine.*`, `budget.baseline`, `indonesia.e2e`, `pipeline.e2e` proofs (unrelated code, 5 to 15 minutes each).
- `components.html` gallery has no entries for the animation components (not built in Task 5); the rebuilt gallery is unchanged.
- Tweens already running when Reduce motion is switched on finish (at most one motion-base).
- `bun run check` flakes under load are listed in the task report.
