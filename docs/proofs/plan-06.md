# Plan 06 proof log (report presentation and design system)

Environment: Bun 1.3.14, TypeScript 7.0.2, Chrome (own headless instance via Playwright 1.65.1, `channel: "chrome"`), macOS, 10 cores, load average 3 to 8 from other sessions during the runs (stated per row). Code under proof: branch `feat/design-system`, Tasks 1-6 (`9a3dcaf` .. `916f47c`) plus the Task 7 commits (`df72394` neutral badge tone, `88b7a13` test strengthening, the commit that carries this file). Seed 20261121. The real run behind the full page measurements is `reports/plan-00-run` (run id `20261121T172730601-6a7a8fba`, refine re-run on a copy: `20261122T062640702-83689287`); the test pages are built from fresh 4-draw runs whose ids are in each run's own events. Every figure is the output of the models (PROXY), not a measured quantity.

Observables below were measured on 2026-11-22 by running each test file once, one at a time (`nice -n 10`, junit reporter), unless a row says otherwise.

## Thresholds

| Threshold | Value | Status |
|---|---|---|
| `T_page_px` | 9000 | frozen in Task 1, unchanged |
| `T_size_mib` | 8 | frozen |
| `T_comp` | 7 of 8 | frozen; questions and keys never edited |
| `T_contrast_text` / `T_contrast_large` | 4.5 / 3 | frozen |
| `T_tap_px` | 44 | frozen |
| `T_build_s` / `T_live_ms` | 10 / 100 (plan 00) | unchanged |
| `T_shot_phash` | **NOT frozen: awaits the author's approval of the reference screenshots** | see Screenshots |

## Hypotheses

| ID | Proving test(s) | Observable |
|---|---|---|
| H1 | `report.design.browser(.proof).test.ts` `closedPageIsAtMostT_page_px` (with a control that opens every disclosure and must exceed the limit) | test page (no climate or budget section) 7,109 px at 1280, 12 of 12 tests pass in both tiers; real run page 8,903 px at 1280 (see Page heights); limit 9000; baseline 30,240 (down 70.6 %, the plan asks at least 70 %). Mutant M8 (a 3000 px element) fails it |
| H2 | `firstScreenAnswersTheThreeQuestions`; component suite hero at 1280x800 and 1440x900 | recipe, cooling with interval, and cost with PROXY visible on the first screen at 1280x800; the next step and the limits link are in the hero (`d4ca73e`) |
| H3 | `docs/spikes/plan-06/q6_*.ts`, `tests/fixtures/comprehension.json`, `docs/proofs/plan-06-comprehension/` | see Comprehension scores: 7/8 first run (Q8 gap, fixed), 8/8 and 8/8 reruns, 1/8 negative control |
| H4 | `themes.test.ts` `allPairsMeetContrastBothThemes`, `pairTableMatchesTheIndependentSpikeTable`, `theGateCanFail`; atoms and components proof suites (computed text contrast of every state, both themes) | 144 pairs (spike table `q3-contrast.json`), min text 4.58, min graphic 3.07; browser proofs 8 of 8 (atoms) and 13 of 13 (components). Mutant M2 fails it |
| H5 | `design.test.ts` `realVendorTreeMatchesItsManifest`, `tokens.test.ts` `everyContractTokenAppearsInCss` | 65 vendor files match `vendor/manifest.sha256`; every contract token is in the CSS |
| H6 | `sizeUnderCapAndOfflineWithoutFailures` (both tiers) | test page 5,896,636 bytes (5.62 MiB), real run page 6,164,416 bytes (5.88 MiB) against 8 MiB; Chrome offline: 0 failed requests, 0 console errors, Inter 400/600 and JetBrains Mono 400 loaded from the embedded fonts, at least one plot rendered |
| H7 | `findings.test.ts` `everyNumberEqualsItsSource` (recomputed from the CSVs by independent test code), `sentencesNameTheirUncertainty`, `noOverclaim`, `coolingWordingSaysAboutNotBest` | 13 of 13 pass. Mutant M4 fails it |
| H8 | `everyIndexValueIsLabelledAndNothingOverclaims`, `honesty.test.ts`, `stat.test.ts` | every index cell of the 96-row table carries a badge (more than 90 cells), every `[data-stat]` that is not an interval carries its ProxyBadge, the forbidden-phrase scan passes and its control fails on "proven" and "the best coating". Mutants M1 and M7 fail it |
| H9 | `closedDisclosuresStillShowTheCaveats`, `heroVerdict.test.ts` | with 0 `details[open]` the visible text holds PROXY, "parameter uncertainty only", the limits link (in the hero itself) and the next-step sentence. Mutants M5 and M7 fail it |
| H10 | `noHorizontalOverflowAtThreeWidths`, `tapTargetsAreAtLeast44px`, `printHasNoDarkBackgroundAndOpensDisclosures` | scrollWidth minus innerWidth is 0 at 390, 768 and 1280 in both themes on the real page; tap targets at least 44 px at 390 and 1280; print is light and opens every disclosure. The perceptual-hash screenshot comparison is NOT implemented (see Screenshots) |
| H11 | `headingOutlineIsValidAndKeyboardReachesTheControls`; atoms and components suites (focus ring, skip link, Enter/Space on a disclosure, tabs and sort by keyboard) | one h1, no skipped heading level, landmarks and chart names present; Tab reaches rail, theme toggle, limits link and a disclosure, Enter and Space open it; focus ring 2 px `focus-ring` |
| H12 | `report.browser.proof.test.ts` (all 20 plan-00 tests, rerun on the redesigned page) | 20 of 20 pass in 51.7 s; live latency over 200 moves: median 51.0 ms, p95 92.7 ms, max 111.3 ms against `T_live_ms` 100 at load average 3-4 (the Task 6 run at lower load gave median 42.3 ms, p95 49.4 ms). The p95 has about 7 ms of headroom under load; the limit is not touched |
| H13 | `twoBuildsOfTheSameRunGiveTheSameBytes`, `gallery.test.ts` `twoBuildsGiveTheSameBytes`, `compileIsDeterministic`, `buildDesignAssetsIsByteReproducible` | two builds of one run give identical bytes; the gallery too |
| H14 | `terms.test.ts` `termsAllDefined` and 5 more | every controlled term has a glossary entry with unit and meaning; a glossary link opens its closed disclosure (components suite) |

## Fault-injection matrix (one input edited, real code paths)

| ID | Test | Result |
|---|---|---|
| F1 | `design.test.ts` `missingTokenInContractCopyIsExit2AndEvent_F1`; `tokens.test.ts` `missingTokenIsExit2` | exit 2, `design.token.missing`, phase `design.tokens`, no `report.html` |
| F2 | `design.test.ts` `vendorCheckDetectsOneByte` | exit 5, `design.vendor.drift` |
| F3 | `design.test.ts` `contrastFailIsExit4NamingThePair_F3` | exit 4, `design.contrast.fail` naming the pair |
| F4 | `design.test.ts` `missingFontIsExit5PhaseDesignFonts` | exit 5, phase `design.fonts` |
| F5 | `content.test.ts` `aTamperedRefineFileIsRefusedAndAChangedControlsFileToo` | exit 5 (plan 00 behaviour kept) |
| F6 | `findings.test.ts` `fallbackWithoutRefineFiles`, `emptyShortlistIsExit5`; `content.test.ts` `recipesFallBackToTheShortlist...` | shortlist fallback, build exits 0; empty shortlist exits 5 |
| F7 | 29 tests named `*F7` in 29 files (every atom, molecule, organism) | unknown state is exit 4 at build, never rendered |
| F8 | 26 tests named `*F8` in 26 files | `<img onerror>` in every field is escaped; the DOM has no such element. Mutant M6 fails it |
| F9 | `gallery.test.ts` `unwritableDirectoryIsExit6AndLeavesNothing` | exit 6, no partial file |

All pass in the fast tier (979 tests, 130 files, 0 fail).

## Mutation checks

Method: the committed tree was copied to the scratchpad (`mutants-plan06/`, no `node_modules`, symlinked; the worktree is never mutated), one mutation applied to the copy, then `bun test` on `tests/web/design`, `tests/core/report`, `tests/node/report/design.test.ts`, `tests/honesty.test.ts`, and `tests/report.design.browser.test.ts` (real Chrome), one process at a time. Baseline of the copy: all green.

| ID | Mutation | Killed by | Result |
|---|---|---|---|
| M1 | `stat` drops its ProxyBadge | unit: `everyToneRendersItsCaveatNextToTheValue` and 4 more (card, hero, site panel); browser: initially SURVIVED the H8 browser test, strengthened in `88b7a13` (every `[data-stat]` carries its badge), then killed by `everyIndexValueIsLabelledAndNothingOverclaims` | killed |
| M2 | light `text-primary` set to `#9aa3b5` (low contrast) | `allPairsMeetContrastBothThemes`, `pairTableMatchesTheIndependentSpikeTable`, `theGateCanFail` and 12 more; browser build refuses with `design.contrast.fail` (F3) | killed |
| M3 | raw colour literal (`style="color:#ff0000"`) in the Callout molecule | `tokens.test.ts` `noRawLiteralsOutsideCompiler` (FR-5) | killed |
| M4 | `findings()` rounds by truncation instead of `toFixed` | `findings.test.ts` `everyNumberEqualsItsSource` (H7) | killed |
| M5 | the hero limits link moved inside a closed `details` | unit `answersWhichHowMuchAndHowSureWithEverythingVisible`; browser: initially `tapTargetsAreAtLeast44px` and `headingOutline...` but NOT the H9 test; strengthened in `88b7a13` (the limits link and honesty callout must be visible inside `.tv-hero`), then `closedDisclosuresStillShowTheCaveats` kills it | killed |
| M6 | `esc` removed from the Callout title | `callout.test.ts` `escapesTitleAndBodyF8` | killed |
| M7 | `heroVerdict` drops the lead (next step) and the honesty callout | unit `pageStatesProxyAndIntervalsUpFront`, `answersWhichHowMuch...`; browser `everyIndexValueIsLabelled...` and `closedDisclosuresStillShowTheCaveats` | killed |
| M8 | a 3000 px element appended to the page | browser `closedPageIsAtMostT_page_px` (H1); no unit test is expected to see a layout change | killed |

8 of 8 killed. Two mutants (M1, M5) survived the browser-tier H8 and H9 tests that the plan names, although unit tests killed them; the browser tests were strengthened first (`88b7a13`) and both mutants then rerun and killed.

## Page heights (1280 px wide, every disclosure closed, scrollHeight in px)

Before (plan 00 page, the 30,240 baseline): overview 528, live 1289, summary 356, explorer 4950, cards 9366, sensitivity 2888, optimisation 3679, indonesia 4736, limits 1750, manifest 597 (30,240 in total).

After (real run page rebuilt on 2026-11-22, report 6,164,416 bytes, both themes give identical heights, 0 disclosures open, horizontal overflow 0):

| Section | 1280 | 768 | 390 |
|---|---|---|---|
| verdict | 806 | 1,401 | 1,749 |
| recipes | 1,345 | 1,420 | 2,179 |
| why it works | 1,101 | 1,162 | 2,116 |
| climate (includes sites 846 / 1,411 / 2,674) | 1,744 | 2,309 | 4,056 |
| budget (includes the panel 612 / 684 / 965) | 1,266 | 1,338 | 1,864 |
| explore all 96 | 964 | 964 | 1,100 |
| limits | 1,113 | 1,237 | 2,037 |
| provenance | 498 | 474 | 720 |
| **total** | **8,903** | **10,481** | **15,998** |

H1 is defined at 1280: 8,903 against 9,000 (headroom 97 px, 70.6 % below 30,240). The phone page is 15,998 px: the plan sets no phone limit and the spike skeleton's 9,660 estimate for 390 was too low; this is stated, not hidden. The test fixture page (no climate or budget section) is 7,109 px at 1280.

## Comprehension scores (H3)

The reviewer saw only the visible text of the closed page and the eight questions (`tests/fixtures/comprehension.json`, keys SP-075, 14.4 K, C, A, 0.42, medan, D, B, never edited). Answers and scorer outputs: `docs/proofs/plan-06-comprehension/`, scorer `bun docs/spikes/plan-06/q6_score.ts <answers.json>` (rerun on 2026-11-22, all four reproduce).

| Run | Text | Score | Notes |
|---|---|---|---|
| first run | `page-closed.txt` before `d4ca73e` | 7 of 8 | Q8 (the next step) unanswered: the page did not state it on the first screen. Page revised (`d4ca73e`), not the question |
| rerun A | `page-closed.txt` | 8 of 8 | fresh reviewer |
| rerun B | `page-closed.txt` | 8 of 8 | fresh reviewer |
| negative control | `page-closed-stripped.txt` (key facts removed, 40,299 of 64,901 characters kept) | 1 of 8 | only Q3 (guessable, C) correct; the harness can fail |
| harness self-test | `docs/spikes/plan-06/q6_selftest.ts` | exit 0 | perfect sheet 8, two wrong 6 (below 7), one wrong 7, scorer exits 0/1/2 correctly, the stripper removes every key-fact match |

Caveat stated in the Task 1 report holds: Q3, Q4, Q7 and Q8 are multiple choice and partly guessable (the control got Q3), which is why the control must stay below 7; it did (1).

## Screenshots

Saved in `reports/shots/` (gitignored, not committed): `page-{dark,light}-{390,768,1280}.png` (full page), `first-{dark,light}-{390,768,1280}.png` (first screen), `sec-{verdict,recipes,why,climate,budget,explore,limits,provenance}-dark-1280.png` and `sec-*-light-390.png`, `gallery-1280.png`. Taken after the Task 6 fixes; the neutral badge tone of `df72394` changes one badge on the recipe card, so the author approves the shots after regenerating them.

**T_shot_phash NOT frozen: awaits the author's approval of the reference screenshots.** The perceptual-hash comparison of H10 is not implemented: the repository has no hash function, no stored reference hashes and no `approve-shots` command, and none is claimed. H10 is proven today by layout metrics (overflow, tap targets, print), not by image comparison. Manual steps until then: (1) regenerate the shots; (2) the author looks at `page-*`, `first-*` and `sec-*` in both themes at 390, 768 and 1280; (3) on approval, a follow-up task adds the hash helper, stores the hashes under `tests/fixtures/` with the approved date, freezes `T_shot_phash` from the first approved set and enables the comparison test. Until step 3 nothing in the suite depends on it.

## BLOCKED

BLOCKED-13 (`docs/BLOCKED.md`): the Torviello brand is dark-only. The light theme is derived (warm-white surfaces, midnight text, hue-preserving darker inks; 144 pairs pass AA) and awaits the brand owner's approval (owner Evint). The page defaults to the system scheme; the dark theme is the brand. BLOCKED-12 (Indonesian-language edition) is also recorded.

## Test cost

`bun run check` (biome, tsc, 979 tests in 130 files) took 283.7 s wall at load average 3.8 to 8.4 (another session active), exit 0; a second run with the junit reporter took 268 s for the test phase. The idle baseline in `docs/testing.md` is 155 s for 679 tests. The slowest files are older ones: `node/refine.test.ts` 68 s, `oracle.fixtures.test.ts` 41 s, `core/opt/objective.test.ts` 26 s, `report.browser.test.ts` 26 s. All plan-06 test files together are about 21 s of the 286 s of summed file time (7 %); the largest, `report.design.browser.test.ts`, takes 14.6 s and `design.components.browser.test.ts` 5 s, none is size-dependent, so nothing was moved to the proof tier. See `docs/testing.md`.

Proof-tier files run once each, one at a time: `report.design.browser.proof` 12 of 12 (12.5 s), `design.atoms.browser.proof` 8 of 8 (1.8 s), `design.components.browser.proof` 13 of 13 (4.5 s), `report.browser.proof` 20 of 20 (51.7 s). Fast twins: 12 of 12, 6 of 6, 11 of 11, 11 of 11.
