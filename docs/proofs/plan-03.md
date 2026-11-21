# Plan 03 proof log (simulation pipeline)

Environment: Bun 1.3.14, TypeScript 7.0.2, macOS, 2 workers at priority 10. Code under proof: branch `feat/digital-bun`, commit 8e213a6 (`feat: spandek run pipeline with fault-injection proof log`) and its parents; the proof-log commit changes no code.
Observables come from the task reports (`.superpowers/sdd/03-simulation-pipeline/task-*-report.md`) and from the Task 8 runs below.

## Real runs (Task 8)

| Run id | Command | Exit | Wall-clock | Notes |
|---|---|---|---|---|
| `20261121T105206147-d7416ce3` | `bun run spandek run --seed 20261121 --out <scratch>/real2/out --max-load 1000` (nice 10, load avg about 4-5 on entry) | 0 | 22.6 s (`run.complete` elapsed_ms 22533) | the recorded run; 96 candidates, 864 result rows, n_mc 256 |
| `20261121T104458920-934ca1ee` | same, quieter machine (load avg about 3) | 0 | 17.5 s | first measurement |

T_runtime_s stays at the 30 s frozen in Task 4 (from `simulate` alone, 12.7 s); the full `run` (22.6 s under load, 17.5 s quiet) is below it, so the file was not edited. H11: 22.6 s << 900 s.

sha256 of the recorded run's outputs:

| File | sha256 |
|---|---|
| candidates.csv | 8a3448f282655902ff1b5d0354e080cd97d2fc566791ead64c43b7596b1bc40a |
| weather.csv | d90b2d8e055b139e70e66a9372054268779376fa157ba4fbda1d8ff0ecef33b6 |
| results.csv | 1840ec7a7dbbf327d84699214e0fa514147bfbb4292cc887c6ec66ead073b9d1 |
| draws.csv | dc94ccc8eeadfc665cf1e97897b912396952c77643dd70ce352d5ea3f23899bb |
| pareto.csv | 7b0d0e74fc430656990e24adb8e46e5b0fbeb281465aaaafd9c1871fa3f14887 |
| sensitivity.csv | 04729ca2a04a7184877d382476963dcea1cdd9e41765f2fa09ebb8f537cb52d6 |
| controls.csv | ad4f20f4c22dd056e72d219a4888366facf0e1da1f07ad7ed056ebfdde54fa1d |
| curves.json | deff969274930bf3136f248a36695d5f190e47850741c6463f28880e7e7186e3 |
| spectra.json | dd8fd2593e6e30c646c86e412a335030ec420a4b0d328f5e3934a2fbceb9a1c0 |
| run_meta.json | d16d203d53144a2b03e6d9c6acd2d753a18313f02fdd982f714326cbf73be4c1 (carries the run id) |
| run_manifest.json | dddcb645b2590afe7649551a85b321b19fa19f5afd8bd5775462e5f734e9b9cd (carries run id and git commit) |
| candidate_cards/high_performing_SP-075.md | cc87ff01a274e8d984293ea170ee58c86db96e39fb98d33246b0de05b446e471 (decision go) |
| candidate_cards/balanced_SP-031.md | 2dc34eab8fd0d1d16296a3586e5969bcf72a41ec41f358270357c2bd5dcd60b8 (decision go) |
| candidate_cards/low_cost_SP-046.md | 68376092991778ad5a33353ce149cde0cf1cc343e92e5ae0f869fefe8f5d3b5b (decision revise) |

Shortlist: high_performing SP-075, balanced SP-031, low_cost SP-046. Controls: 72 rows; curves: 99 series.

## Hypotheses

| ID | Proving test(s) | Measured observable |
|---|---|---|
| H1 | `optimize.test.ts` matchesBruteforceProperty (500 cases, ties, NaN rows, reference loop inside the test), dominatedCandidateNeverInFront, tiesBothKept | no case differs (Task 5); independent recomputation of the real run's Pareto, frequencies and roles matched in the Task 5 review. Real run: 26 of 96 candidates on the front (run 104458920) |
| H2 | `sensitivity.test.ts` ishigamiSobolMatchesAnalyticAndFixtures, bootstrapIntervalCoversAnalyticOnIshigami, variableOrderPreserved, zeroVarianceGuardIsScaleInvariant | Ishigami N = 2^14 seed 20261121 within `T_sobol_tol` 0.03 of analytic and `T_sobol_fix` 0.05 of both fixtures (scipy S1 0.3141, 0.4424, 0.0000; ST 0.5576, 0.4424, 0.2437; SALib 1.6.0 S1 0.3140, 0.4426, 0.0000); bootstrap interval covers analytic within 2 conf for all six values (Task 6). Seed frozen at the first seed tried |
| H3 | `sensitivity.test.ts` morrisLinearExact, morrisQuadraticAnalytic | linear mu* = (1, 10, 0) to 1e-9; quadratic mu*(x3) within 0.05 of 0.5 at 200 trajectories (Task 6) |
| H4 | `stackProps.test.ts` ablationPropertiesTenCandidates, c4EqualsFullCandidate (FR-1), c0UsesSubstrateConstants, missingPrimerGivesBaselineCorrosionRisk | 10 candidates: r_solar(C2) >= r_solar(C4); corrosion_risk(C3) = baseline > corrosion_risk(C4); C0 = substrate constants (Task 2) |
| H5 | `uncertainty.test.ts` quantile7MatchesKnownValues, intervalContainsPred, doubledUncertaintyWidensRealModelOutputs, zeroUncertaintyGivesIdenticalMaterials; `simulate.test.ts` intervalsContainNominalAndMatchIndependentDraws, has864RowsAndValidSchema | zero unc.* gives lo = pred = hi (wetting columns equal the model's roughness corners); doubled unc.* widens every interval and one strictly (Tasks 3, 4); intervals re-derived independently from `drawMaterials` + `evaluate` |
| H6 | `simulate.test.ts` sameSeedIdenticalCsvOneAndTwoWorkers; `pipeline.e2e.proof.test.ts` (full size) and `pipeline.e2e.test.ts` (n_mc 4) runTwiceSameSeedSameResultsHash, differentSeedDifferentHash | real data: 1 worker (24.9 s) and 2 workers (12.7 s) give identical sha256 of results.csv and draws.csv (Task 4). End to end: two `run`s with seed 20261121 give identical sha256 for results.csv, draws.csv, pareto.csv, sensitivity.csv, controls.csv, curves.json; manifest differs only in `run_id`, `core_sha256` and the `run_meta.json` file entry (R6); seed 7 gives different results.csv and draws.csv |
| H7 | `cards.test.ts` decisionRederivedIndependently (independent D6 written from the plan), rejectUsesMinimumUpperBoundOverScenarios, cardHasSevenFields | decisions re-derived independently for the real shortlist and forced variants covering go, revise (frequency), revise (delam), reject (upper bound), reject (infeasible); reject uses the minimum over scenarios of `r_solar_hi` (commit c34210f) |
| H8 | `cards.test.ts` noForbiddenPhrasesAndAllPredictionsHaveIntervals, limitsListScenarioConstantsAndStaticLimits, missingControlSaysNotComputed | no forbidden phrase; every predicted number has its interval and every proxy is labelled PROXY (Task 7) |
| H9 | `resources.test.ts` checkLoadZeroLimitThrowsCode6, nanLimitFailsClosed, priorityIsLowered, timeoutThrowsCode6; `simulate.test.ts` loadGuardRunsFirst; `pipeline.e2e.test.ts` faultF1ToF9 F4 | `--max-load 0` exits 6 with `resource.load_high` before anything is read; priority 10 |
| H10 | `manifest.test.ts` manifestHashesMatchFiles, manifestChangesWhenConfigConstantEdited, manifestCoreHashExcludesReportField; `pipeline.e2e.test.ts` runEndToEndArtifactsExist | the manifest of a real run lists every file (all outputs but itself, including candidates.csv and weather.csv) and every listed hash is recomputed true; editing one config constant changes the hash |
| H11 | `pipeline.e2e.proof.test.ts` runtimeBelowFrozenThreshold; real runs above | 22.6 s and 17.5 s against 900 s hard limit and the frozen 30 s regression threshold; the three runs of the e2e suite are all below 30 s |

## Fault-injection matrix (Task 8: `pipeline.e2e.test.ts` faultF1ToF9, real data, stepwise command, exit code, `error.raised` phase, no stack trace)

| ID | Single edit | Command | Exit | Phase | Observed |
|---|---|---|---|---|---|
| F1 | delete `controls.yaml` from a config copy | simulate | 5 | data | pass |
| F2 | C1 `r_solar` = 1.4 | simulate | 2 | config | pass |
| F3 | `results.csv` row 1 `t_max_lo` = `t_max_pred` + 5 | optimize | 2 | config | pass |
| F4 | `--max-load 0` | simulate | 6 | resource | pass, `resource.load_high` present |
| F5 | `--n-mc 0` | simulate | 2 | config | pass |
| F6 | `unc.diameter_rel.value` = -0.1 | simulate | 2 | config | pass |
| F7 | one candidate `midcoat_dft_um` = 5 (with `topcoat_dft_um` = 4 so C-1..C-3 still pass and the flag stays consistent) | simulate | 4 | model | pass |
| F8 | `--design` directory missing | simulate | 5 | data | pass |
| F9 | one candidate `midcoat_pvc` = 1.3, `feasible` stays true | simulate | 2 | config | pass |

Given/When/Then: G1 `simulate.test.ts` has864RowsAndValidSchema (864 rows) and `runEndToEndArtifactsExist` (864 rows from `run`); G2 `cards.test.ts` decisionRederivedIndependently; G3 F4 above (exit 6 and `resource.load_high`).

Event catalogue: `pipeline.e2e.test.ts` allPlan3EventsPresentInRunJsonl runs `run --n-mc 16` with `SPANDEK_LOG_LEVEL=debug` and finds `sim.start`, `sim.progress`, `sim.draw_complete` (17 events = n_mc + 1), `pareto.computed`, `shortlist.chosen`, `sensitivity.done`, `card.written`, `manifest.written`, `thermal.solved`, `mie.cache_stats`. The conditional events (`shortlist.low_cost_fallback`, `resource.load_high`, `resource.timeout`) are pinned by their own unit and CLI tests. Log size: that debug run's run.jsonl is 7 128 131 bytes (7.1 MB) at n_mc 16; the info-level run at n_mc 256 is 14 282 bytes. A debug run at the full n_mc 256 would be roughly 16 times larger (about 100 MB), debug only.

## Mutation checks (copy of the repo under the scratchpad `mutants-plan03/repo`, worktree never mutated; each mutant applied to a fresh copy of src and tests; suite run: `tests/core/pipeline`, `tests/node/simulate.test.ts`, `tests/node/report`)

| ID | Mutation | Killed by |
|---|---|---|
| M1 | one objective's sense flipped (`r_solar_pred` "max" becomes "min") | buildParetoRowsCarryFrontFrequencyRole, dominatedCandidateNeverInFront, lowCostFallbackLogged, lowCostPrefersEligibleMemberOverCheaperIneligible, shortlistThreeDistinct, tiesBothKept (6 failures) |
| M2 | NaN-row masking dropped in `paretoFront` | matchesBruteforceProperty, tiesBothKept |
| M3 | Sobol `S1` and `ST` outputs swapped | ishigamiSobolMatchesAnalyticAndFixtures, bootstrapIntervalCoversAnalyticOnIshigami |
| M4 | widening-to-nominal removed from `widenInterval` | intervalContainsPred |
| M5 | `go` threshold `T_GO_PARETO_FREQ` 0.5 changed to 0.4 | decideFollowsRuleD6 |
| M6 | `stackProps` computed inside the scenario loop (and counted per scenario) | opticsOncePerCandidatePerDraw |

All six mutants were killed on the first pass; no test was strengthened and no mutant survived.

## Runbook notes

- A debug-level `run.jsonl` at `n_mc` 256 is about 100 MB (dev only; production logs are info only).
- `runtimeBelowFrozenThreshold` has only about 25 % margin on a loaded machine (22.6 s against the frozen 30 s at load 4-5); the frozen file is not edited, and a failure on a busy machine means wait for the load to fall and rerun, not edit.
- Test subprocess runs write their run logs to a temp reports dir (`SPANDEK_REPORTS_DIR` in `tests/helpers.ts` `run()`), so the repo `reports/` directory does not grow from the test suite.

## Final gate

`bun run check` (biome, `tsc --noEmit`, `bun test --timeout 30000`): exit 0, 365 pass, 0 fail (70 214 expect calls, 43 files, 112 s), biome pre-existing warnings only. 349 tests before Task 8, plus 2 in the minors commit (scenario-min reject rule, scale-invariant variance guard) and 14 in `pipeline.e2e.test.ts`.
