# Plan 05 proof log (derivative-based optimisation and budget frontier), non-web part

Environment: Bun 1.3.14, TypeScript 7.0.2, macOS, 2 workers at priority 10, load average 2-5 on 10 cores. Code under proof: branch `feat/digital-bun`, commits d3601a4 .. ba3b149 (Tasks 1-5) and ce43a6d (`feat(refine): precomputed budget frontier tables with exact lookup`) plus the Task 7 commit that carries this file. Seed 20261121 everywhere.
Observables come from the task reports (`.superpowers/sdd/05-derivative-optimization/task-*-report.md`) and from the runs below. Every figure is the optimum of the models (PROXY), not a measured optimum.

**DEFERRED until plan 00 exists: report pieces H12 (Optimisation section equals the CSVs), H18 (budget slider equals the table), the figures (refined vs screened front, recipe cards, performance-price curve with the knee, budget slider) and FR-8 labelling in the report. They need `src/web/*` and `src/node/report.ts`, which plan 00 creates. No code or test for them exists yet; nothing here claims them.**

## Real runs

| Run id | Command | Exit | Wall-clock | Notes |
|---|---|---|---|---|
| `20261121T144340008-ee76619c` | `run --seed 20261121 --out <tmp>/out --max-load 1000` (e2e suite) | 0 | 17.2 s | plan-3 inputs with n_mc 256 and `run_manifest.json` |
| `20261121T144357192-2802bc0e` | `refine --in <tmp>/out --out <tmp>/out/refine --max-load 1000` | 0 | 22.8 s | limit `T_nrt` 600 s |
| `20261121T144419967-e159ee31` | `budget-table --in <tmp>/out --out <tmp>/out/refine --max-load 1000` | 0 | 310.8 s | limit `T_nrt_table` 900 s; 3 profiles x 100 levels, 64 draws |

Table facts of that run: `c_min` 0.31140 (relative cost_proxy), `c_max` 0.92544; knee budgets (D13) cooling_first 0.8138, balanced 0.4230, durability_first 0.3362; 0 repaired entries in every profile; largest unspent headroom 1.8e-7 relative. The plan's estimate for `budget-table` was about 200 s; the measured 311 s is 1.5 times that and 35 % of the limit. The extra time is the downward sweep and the tightening passes that make the table reach the high-budget basin (see "Deviations" in `task-6-7-report.md`).

## Hypotheses

| ID | Proving test(s) | Measured observable |
|---|---|---|
| H1 | `gradient.test.ts` gradientMatchesMpmathOracle, richardsonAgreementWithinFrozenBound, gradientMatchesAnalyticBenchmarks | `T_grad_rel` frozen 1e-5; observed max 7.2e-6 (d_tio2_um, Mie resonance truncation); Richardson check max 3.3e-7; six analytic functions within 1e-7 (Task 3). Mutation M1 fails 7 of these |
| H2 | `gradient.test.ts` linearThermalClosedForm | dT_max/dr = -G/(h + 1/R) within 1e-6 relative; T_max = T_ss within 1e-6 K (Task 3) |
| H3 | `projectedBfgs.test.ts` benchmarksReachKnownOptimum | six problems, distance to the known optimum 2.3e-9, 5.1e-10, 5.5e-12, 0, 1.6e-7, 3.8e-8 against `T_conv` 1e-6 (Task 4) |
| H4 | `projectedBfgs.test.ts` traceIsMonotone (200 cases), traceIsMonotoneWithinEachPenaltyRound | non-increasing within each penalty round; the plan wording "across rounds" is amended in the Task 3-4 report (multiplier shift) |
| H5 | `refine.baseline.test.ts` beatsSobolBaselineAndScreening | refined balanced S 0.107084 against best of 96 screened 0.154422 and best of 3449 feasible Sobol points 0.122578 |
| H6 | `refine.test.ts` optimaSatisfyAllConstraints, `projectedBfgs.test.ts` penaltyEscalationKeepsFeasibility; activeConstraintIsSolvedNotJustRespected (cpvc 0.2: m1 = 0.2 to 1e-6, S 0.11248 < 0.12) | every reported optimum within 1e-9 of every constraint; the active-constraint case was added after M2 survived the pipeline tests (below) |
| H7 | `refine.test.ts` multiStartSpreadReported | no saddle at the three recipes (min Hessian eigenvalue 0.001-0.005); kkt 1.9e-9 to 3.9e-8 against `T_kkt` 1e-7; balanced spread over 20 starts S in [0.107084, 0.129385] |
| H8 | `refine.test.ts` toleranceEdgesVerifiedByDirectEvaluation, `tolerance.test.ts` quadraticEdgesMatchTheClosedForm, hessianEstimateIsTheFirstBracketProbe | every edge within 1e-6 of 1 % loss by a fresh model; 8 of 9 variables have a confirmed edge (7 of 9 are on a bound); the probe test was added after M3 survived (below) |
| H9 | `refine.test.ts` robustRegretNotWorseThanNominal | p95 regret robust 3.2e-5 against nominal 3.4e-5; p95 S fresh 0.124354 against 0.124372 (the gain is tiny: 7 of 9 variables on bounds) |
| H10 | `refine.test.ts` sameCsvOneAndTwoWorkers; `budget.test.ts` sameTableOneAndTwoWorkers | the four refine CSVs and a 3 x 12 budget table (8 draws) are byte-identical for 1 and 2 workers |
| H11 | `refine.baseline.test.ts` refineRuntimeIsWithinTheLimitAndRecorded, `budget.baseline.test.ts` budgetTableRuntimeIsWithinTheLimitAndRecorded, `refine.e2e.test.ts` e2eUnderBudget | refine 22.8-27.3 s (600 s); budget-table 310.2-310.8 s (900 s); `run` 17.2 s. Measured limits are the plan's `T_nrt` and `T_nrt_table`; both were frozen from the plan, not edited |
| H12 | DEFERRED until plan 00 exists | not built |
| H13 | `budget.baseline.test.ts` beatsSobolAndScreenedUnderBudget | 10 budgets per profile (levels 0, 11, ..., 99) against the best of 4096 Sobol points and 96 screened candidates with cost within the budget: the table is better at all 27 budgets where a brute-force point exists. Examples: balanced level 11 0.1177 vs 0.1586, level 33 0.1151 vs 0.1273, level 99 0.1117 vs 0.1273; cooling_first level 99 0.1555 vs 0.1696; durability_first level 99 0.0803 vs 0.0923. At level 0 (budget = `c_min`) no Sobol or screened point is cheap enough, the comparison is vacuous |
| H14 | `budgetTable.test.ts` lookupIsLargestBudgetNotAbove, lookupNeverExceedsBudget, belowCMinIsInfeasible; `budget.baseline.test.ts` lookupOnTheRealTableIsExactAndSafe | 2000 random budgets on the synthetic table and 3000 on the real one against a brute-force scan: cost <= budget, largest tabulated budget, infeasible below `c_min`. Mutation M4 fails it |
| H15 | `budgetTable.test.ts` tableMonotoneAfterRepair, repairCountCapped; `budget.baseline.test.ts` tableMonotoneAndRepairsCappedOnRealData | real tables: scalar non-increasing, 0 repairs of 100 in each profile (cap 5); the synthetic solver with 4 bad levels is repaired and with 6 fails exit 4. Mutation M5 fails both unit tests |
| H16 | `budget.baseline.test.ts` budgetIsSpentWhenBinding | largest relative headroom of a non-repaired entry below `c_max` is 1.8e-7 (limit 1e-4) |
| H17 | `budget.baseline.test.ts` polishNeverLoses; `budget.test.ts` polishKeepsTheEntryOrImprovesIt | 20 random budgets over the three profiles: polished scalar <= entry scalar and cost <= budget in all 20; polish improved 18 of 20 |
| H18 | DEFERRED until plan 00 exists | not built |

## Fault-injection matrix (real edits, real CLI; `refine.e2e.test.ts` faultMatrixF1toF13: exit code, `error.raised` phase, no stack trace)

| ID | Single edit | Command | Exit | Phase | Observed |
|---|---|---|---|---|---|
| F1 | `weights.balanced` does not sum to 1 | refine | 2 | config | pass |
| F2 | variable 0 `lo` 0.9 > `hi` | refine | 2 | config | pass |
| F3 | `--starts 0` | refine | 2 | config | pass |
| F4 | `cpvc` 0.05 | refine | 3 | refine.feasible | pass |
| F5 | binder refractive index `.nan` | refine | 2 | config | pass. Deviation: the plan says exit 4, phase refine.model. Through the CLI the materials schema rejects NaN first; exit 4 at runRefine level is proved by `refine.test.ts` nanRefractiveIndexIsExit4 |
| F6 | a discontinuity (0.02 sin(5e4 x_gptes)) added to `corrosion_risk` in a mutation copy | refine | 4 | refine.gradcheck | pass, key p1, no output directory written; run in the copy, not in the suite |
| F7 | `results.csv` missing in `--in` | refine | 5 | refine.load | pass |
| F8 | `--time-limit-s 0.001` | refine | 6 | refine.run | pass (the CLI wraps the resource error so the phase is the plan's; `resource.timeout` event present) |
| F9 | start point outside the box (`extra_starts`) | refine | 2 | config | pass |
| F10 | `--amount` 0.9 x `c_min` | budget | 3 | budget.lookup | pass, stderr names `c_min` |
| F11 | `--amount -5`; `--profile luxury` | budget | 2 | config | pass both |
| F12 | one digit of `budget_table.json` changed | budget | 5 | budget.verify | pass (also: manifest edited, its core hash catches it) |
| F13 | `--time-limit-s 0.001` | budget-table | 6 | budget.build | pass |

## Mutation checks (in a copy under the scratchpad, `mutants-plan05/`; the worktree was never mutated)

| ID | Mutation | Expected | Killed by | Result |
|---|---|---|---|---|
| M1 | flip the sign of gradient component 0 | H3/H4 (and H1) fail | `benchmarksReachKnownOptimum`, `activeBoundsStayOnBound` (H3); `gradientMatchesMpmathOracle`, `gradientMatchesAnalyticBenchmarks`, `linearThermalClosedForm`, `oneSidedAtBound`, `gradientIsCentralInsideAndNeverMutatesU`, `fastCheckQuadraticExact` (H1, H2) | killed, 8 of 19 tests fail. `traceIsMonotone` (H4) does not fail: it uses the exact gradient passed by the test and the flip only touches the finite-difference constraint gradients |
| M2 | drop the penalty (constraint excess forced to 0 in the merit) | H6 fails | `benchmarksReachKnownOptimum`, `activeBoundsStayOnBound`, `penaltyEscalationKeepsFeasibility` | killed at the optimiser level. SURVIVED the pipeline tests: with the shipped cpvc 0.45 no constraint is active at the optimum, and the final feasibility restoration alone keeps outputs feasible (refined S stayed 0.107084). Strengthened: `activeConstraintIsSolvedNotJustRespected` (cpvc 0.2, m1 = 0.2 active) fails the mutant with S 0.1360 against 0.1125 |
| M3 | tolerance estimate without the factor 2 in sqrt(2 tol f / H) | H8 fails | `hessianEstimateIsTheFirstBracketProbe` | SURVIVED every result test (the Hessian only brackets the edge; the bisection on direct evaluation finds the same edge). Strengthened: the first probe after the box check must sit on the 1 % edge of an exact quadratic; the mutant now fails it |
| M4 | `lookupBudget` returns the smallest budget >= B | H14 fails | `lookupIsLargestBudgetNotAbove`, `lookupNeverExceedsBudget` | killed. `lookupNeverExceedsBudget` alone SURVIVED at first: `fc.double` is biased to 0 and special values and rarely lands between two levels. Strengthened with a second property on a uniform grid; the mutant now fails it |
| M5 | skip the monotone repair | H15 fails | `tableMonotoneAfterRepair`, `repairCountCapped` | killed |

All five mutants are killed after the strengthening; the three strengthened tests are in the commit.
