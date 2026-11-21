# Plan 02 proof log (physical models)

Environment: Bun 1.3.14, Node 22.21.1, TypeScript 7.0.2. Final gate: `bun run check` (biome, `tsc --noEmit`, `bun test`), see the end of this file.
Observables are the measured numbers from the task reports (`.superpowers/sdd/02-physical-models/task-*-report.md`) and from the Task 9 runs.

## Hypotheses

| ID | Proving test(s) | Measured observable |
|---|---|---|
| H1 | `thermal.test.ts` linearCaseMatchesClosedForm | rel. err <= 5e-7 (`T_thm_rtol`) incl. early transient at dt 5 s (Task 3 report; plan text records 6.1e-8) |
| H2 | `thermal.test.ts` steadyStateResidualZero | residual <= 1e-6 W/m2 |
| H3 | `thermal.test.ts` reflectanceMonotoneAllNineScenarios (R 0.3..0.9, 9 scenarios); `crossModel.test.ts` higherMidcoatReflectanceLowersTMaxEndToEnd (real optics -> real thermal) | end to end, 5 candidates (R_solar 0.8524, 0.8854, 0.9026, 0.9199, 0.9442) x 9 scenarios: t_max strictly falls in all 9, e.g. W1 29.70 -> 26.68 degC, W9 38.92 -> 35.43 degC |
| H4 | `mie.test.ts` matchesMiepythonFixture, largeXMatchesFixture, rayleighLimit | miepython 3.3.1 fixture, 300 points: q_ext rel 1.3e-10, q_sca rel 4.9e-12, q_abs abs 3.0e-10, g abs 3.7e-12 (limits 1e-8 / 1e-8 / 1e-7); low-x points 6.6e-7 (limit 1e-6); x up to 156 |
| H5 | `optics.test.ts` kmThickLimitClosedForm, kmZeroThicknessReturnsGround, kmSeriesAndTanhBranchesAgree | closed forms within 1e-9 (T_KM) |
| H6 | `optics.test.ts` flatRReturnsR, g173Total; `literature.test.ts` g173IntegralIs1000p37 | flat R = c within 1e-9; G173 = 1000.37 W/m2 (+-1.0) |
| H7 | `solGel.test.ts` floryStockmayerValues | f_w = 25/7, p_c = 7/18, 1/3, 1/2 within 1e-12 |
| H8 | `solGel.test.ts` closedFormMatchesOdeFixture, oracleCoverage, taylorSwitchStraddle | scipy fixture, 20 cases: h rel 1.6e-12, c rel 1.4e-10, gel time rel 2.7e-11 (limit 1e-6) |
| H9 | `wetting.test.ts` limits | r = 1 and f = 1 give theta_Y, f = 0 gives exactly 180 deg, within 1e-9 |
| H10 | `barrier.test.ts` allOutputsInUnitIntervalOverPlan1Ranges, permIncreasesWithGptes, crackIncreasesWithDft; `delamination.test.ts` delamBounds, delamIncreasesWithMtes; `wetting.test.ts` scoreBoundsAndDirection; `crossModel.test.ts` everyOutputFiniteInDomainForAll96Candidates | all proxy outputs in [0,1] over the 96-candidate LHS (seed 20261121), `proxy === true`, wetting theta in [0,180] with theta_lo <= theta_pred <= theta_hi, gel time finite or Infinity only for gel time, R in [0,1], t_max finite and < 150 degC |
| H11 | `ranges.test.ts`, `shared.test.ts`, F-matrix tests below | code 4 / phase model, event fields model, quantity, value, lo, hi |
| H12 | `tests/node/data.test.ts` verifyOk, tamperedByteExit5, missingSumsExit5, deletedAndUnlistedFilesExit5 | tampered byte -> exit 5 |
| H13 | `thermal.test.ts` matchesOracle200Cases | scipy DOP853 fixture, 200 cases: t_max <= 1.30e-5 K (limit 1e-4), q_in_mean <= 4.8e-6 W/m2 (limit 1e-3), 144-point series <= 8.3e-6 K (limit 3e-4) |

Other Task 9 proofs: NFR-2 `noModelImportsAnother` (every `import` of the nine model files; `./ranges`, `./shared`, and `./mie` only in `optics.ts`; no bare, node or web imports; the scanner is shown able to fail on a synthetic bad source); FR-8 `modelsBuildForBrowser` (`Bun.build` target browser succeeds for each model file); T-X-5 `suiteIsIdenticalUnderNode` (Bun.build target node bundle of the model functions, run under Node 22 and Bun, 20 numbers equal to 1e-9, plus the in-process model call equal to the bundle's t_max); `topcoatOpticalPenaltyRaisesTMaxOrEqual` (R_with = R_without * exp(-2 mu d) to 1e-12, t_max with topcoat >= without).

## Fault-injection matrix

| ID | Test | Observable |
|---|---|---|
| F1 | `cli.test.ts` faultF1; `data.test.ts` tamperedByteExit5 | exit 5 |
| F2 | `cli.test.ts` faultF2; `config.test.ts` negativeDiameterConfigError | exit 2 |
| F3 | `cli.test.ts` faultF3; `literature.test.ts` negativeKIsDataError | DataError, exit 5 |
| F4 | `cli.test.ts` faultF4 | exit 2 |
| F5 | `optics.test.ts` pvcOutOfRangeCode4 | PhysicsRangeError, code 4 |
| F6 | `solGel.test.ts` waterRatioZeroCode4 | code 4 |
| F7 | `cli.test.ts` faultF7; `data.test.ts` missingSumsExit5 | exit 5 |
| F8 | `mie.test.ts` negativeKRejected | code 4 |
| F9 | `thermal.test.ts` dtNotDividing600Rejected | code 4 |

## Mutation checks (scratch copy under the session scratchpad, worktree never mutated)

Baseline in the copy: 224 pass, 0 fail (218 earlier + 6 cross-model). Table below is from the final test set.

| Mutant | Edit | Tests that failed |
|---|---|---|
| M1 | Eddington S = 3/4 sigma_s - sigma_a/4 (the (1-g) factor dropped; ruling R1) | kmMappingPinnedToSpikeQ1, singlePigmentSKRPinnedT_OPT_6, midcoatWiringPinnedToIndependentMie, midcoatAsymmetricFractionsPinned, defaultMidcoatIsReflective, edges100And300UmValid |
| M2 | Mie refractive index m = n - ik (sign of the imaginary part flipped) | matchesMiepythonFixture, largeXMatchesFixture, tio2AbsorbsInUv, singlePigmentSKRPinnedT_OPT_6, midcoatWiringPinnedToIndependentMie, midcoatAsymmetricFractionsPinned, defaultMidcoatIsReflective, edges100And300UmValid |
| M3 | topcoat `exp(-mu d)` instead of `exp(-2 mu d)` | topcoatNeverIncreasesR, topcoatOpticalPenaltyRaisesTMaxOrEqual (both strengthened in Task 9, see below) |
| M4 | p_c = 1/f_w instead of 1/(f_w - 1) | floryStockmayerValues (H7), closedFormMatchesOdeFixture, spikeQ3GelTimesPinned |
| M5 | T_sky and T_air swapped in the radiative term | alphaIsOneMinusR, matchesOracle200Cases |
| M6 | `dtS` guard no longer requires `600 % dtS === 0` (dt 70 accepted, integrates across the kink) | dtNotDividing600Rejected |
| M7 | Mie recurrence start `ceil(|mx|) + 16` instead of `max(nmax, ceil(1.1 |mx|)) + 15` | matchesMiepythonFixture, largeXMatchesFixture |

Survivors on the first pass and strengthening (tests changed in the worktree, code untouched):
- M3 survived every optics and thermal test (its only failure was an incidental sanity assertion in the new Node test, which was then replaced). Cause: `topcoatNeverIncreasesR` pinned the factor at `r[0]` (0.3 um), where the TiO2 midcoat reflectance is about 0, so `toBeCloseTo(.., 14)` was vacuous. Fixes: the pin now uses the wavelength of maximum reflectance (R > 0.5), and `topcoatOpticalPenaltyRaisesTMaxOrEqual` asserts `R_with = R_without * exp(-2 mu d)` to 1e-12. Rerun: M3 killed by both.
- M5 is not caught by `higherMidcoatReflectanceLowersTMaxEndToEnd` (monotonicity in R survives a swapped sky temperature); it is caught by the thermal unit tests (H1/H13 oracle and the hand-computed flux).

## Final gate

`bun run check`: biome clean, `tsc --noEmit` clean, 224 pass / 0 fail (53066 expect calls), exit 0.
