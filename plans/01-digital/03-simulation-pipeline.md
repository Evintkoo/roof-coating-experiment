# Simulation Pipeline Implementation Plan (Plan 3 of 6 (0–5), Bun + TypeScript)

Part 1 is the plan; Part 2 is the test specification. Depends on plans 1 and 2 being done and green. This plan ends in the artefacts blueprint §5.4/§6.2 asks for (`results.csv`, `draws.csv`, `pareto.csv`, `candidate_cards/`, `controls.csv`, `sensitivity.csv`, `curves.json`, `spectra.json`, `run_manifest.json`); plan 0 turns them into the live HTML report.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** 📋 PLANNED (rewritten 2026-11-21 for Bun + TypeScript)

**Goal:** Run the 96-candidate × 9-scenario digital experiment through the plan-2 models with parameter uncertainty, find the Pareto set and its robustness, quantify sensitivity, and emit lab-ready candidate cards that never claim more than the models can support.

**Architecture:** `core/pipeline/stackProps.ts` composes the models into an `Outcome` for any layer subset (a candidate or a control) in two steps: scenario-independent `stackProps` (optics, barrier, wetting, cost, C_A) and scenario-dependent `thermalOutcomes`. A batch runner on two Bun Workers evaluates a nominal pass plus 256 Latin-Hypercube material-parameter draws, from which come intervals and Pareto frequency. `optimize`, `sensitivity` and the report builders are pure consumers of the result tables. The same `core` code is what the live simulator (plan 0) runs in the browser.

**Tech Stack:** as plan 1 (Bun 1.3.14, TypeScript 7.0.2, zod 4.6.7, fast-check 4.10.3); Oracle fixtures from scipy 1.18.1 / SALib 1.6.0 (test-only). Versions verified 2026-11-21.

**Spec:** `Blueprint_Riset_Spandek_3_Fungsi.md` §4.1 steps 03–06, §5.2–5.4, §6.1, §6.4, §8.1 (decisions). Interfaces from plans 1 and 2.

## What the operator does

1. `bun run spandek run --seed 20261121 --out reports/` — the whole pipeline, ≈ 2–3 min on 2 workers (estimate from measured unit costs: Mie ≈ 0.5–0.84 ms per stack, thermal ≈ 0.38–0.53 ms per case on Bun; single-process arithmetic: 257×864×0.53 ms ≈ 118 s thermal + 257×96×0.6 ms ≈ 15 s optics + 13 312×1.2 ms ≈ 16 s sensitivity; `T_runtime_s` is frozen after the first real run). It does `design → simulate → optimize → sensitivity → report`.
2. Or stepwise (each reads the previous step's files from `--out`): `simulate` (≈ 1–2 min), `optimize` (≤ 1 s), `sensitivity` (≈ 20 s), `report` (≤ 15 s including curves; plan 0 adds the HTML). Global flags: `--config-dir`, `--data-dir`, `--max-load`; `--seed` and `--n-mc` exist only on `design`, `simulate` and `run`: `simulate` writes `run_meta.json` into its output directory and `optimize`, `sensitivity` and `report` read the seed, `n_mc` and run id from it (`--in DIR`).
3. Open `reports/candidate_cards/` (three cards: high-performing, balanced, low-cost) and `reports/report.html` (plan 0). Check `reports/run_manifest.json` for hashes. Exit 0 = good; otherwise use the runbook.

Before a run the tool checks machine load and refuses to start above the limit (Evint's CPU rule): at most half the cores (`os.cpus().length / 2`), 2 workers, process priority `nice 10` via `os.setPriority`, hard timeout 900 s per command.

## Logging and debugging

Same schema, level rule, 2 KiB cap and redaction as plan 1. Info alone must diagnose any failure; debug adds per-draw lines.

| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `sim.start` | info | node/simulate | n_candidates, n_scenarios, n_mc, workers | 1/run |
| `sim.progress` | info | node/simulate | done, total | 10/run |
| `sim.draw_complete` | debug | node/simulate | draw, elapsed_ms | n_mc+1 |
| `resource.load_high` | error | node/resources | load1, limit | 0–1 |
| `resource.timeout` | error | node/resources | command, limit_s | 0–1 |
| `pareto.computed` | info | pipeline/optimize | n_candidates, n_front | 1/run |
| `shortlist.chosen` | info | pipeline/optimize | role, candidate_id | 3/run |
| `shortlist.low_cost_fallback` | warn | pipeline/optimize | candidate_id, c1_r_solar | 0–1/run |
| `sensitivity.done` | info | pipeline/sensitivity | method, output, n_evals | ≤ 8/run |
| `card.written` | info | report/cards | candidate_id, role, decision | 3/run |
| `manifest.written` | info | report/manifest | path, config_sha256 | 1/run |

Redaction: only ids, numbers, hashes, paths relative to `reports/`. Alert rules: none (batch); exit codes are the alert. Runbook: **2** bad config/input table → fix the key in `error.raised.key`; **3** too few feasible → plan 1 runbook; **4** a model got an out-of-domain input → see `model.out_of_range`; **5** missing data/controls → rerun `fetch-data` or supply `configs/controls.yaml`; **6** machine busy or timeout → wait for load to fall, never kill other processes. A test per event is in Part 2.

## Scope

In: layer composition, control variants, cost proxy, uncertainty draws, worker-parallel batch runner, Pareto + frequency + shortlist, Morris/Sobol sensitivity (own estimators), cards, controls table, curves/spectra data for the report, manifest, CLI `simulate|optimize|sensitivity|report|run`. Out: lab work, calibration (BLOCKED-1), two-node thermal (BLOCKED-2), PSD (BLOCKED-3), real prices (BLOCKED-4: cost is a relative scenario index; owner Evint; unblocks when `materials.yaml` cost keys get vendor-sourced values), the HTML/live UI (plan 0).

### Stack and versions

| Item | Pinned value |
|---|---|
| Libraries | exactly as plan 1 "Stack and versions" |
| Parallelism | 2 Bun `Worker`s (`src/node/simWorker.ts`), ordered `Promise.all` over draw slices; process priority 10 |
| Uncertainty sampling | `lhsUnit(256, 11, deriveSeed(seed, 100))` from plan 1 `core/design.ts` (stratified, seeded, its own stream; with n = 32 the live view's columns are noticeably correlated — measured mean largest pairwise \|corr\| 0.44 vs 0.16 at n = 256 — so live bands are labelled "32 draws") |
| Sensitivity | own Morris (20 trajectories, 4 levels, Δ = 2/3, on the unit hypercube so μ* is per unit of normalised input; 20×(D+1) = 240 evaluations) then own Saltelli-2010 first order + Jansen total order (N = 1024, N×(D+2) = 13 312 evaluations for D = 11, no second order; A and B from separate streams, D13 of plan 1), bootstrap 100 resamples for 95 % intervals |
| Outputs | `results.csv`, `draws.csv` (draw, candidate_id, the 5 objectives: 256 × n_feasible rows; feasible candidates only), `run_meta.json` (seed, n_mc, run_id: read by the later steps), `pareto.csv` (feasible candidates only), `controls.csv`, `sensitivity.csv`, `curves.json`, `spectra.json`, `run_manifest.json`, `candidate_cards/*.md` |

**Gaps this plan closes:** blueprint §4.1 steps 03–06, §5.2 steps 2, 4, 5, §5.3 (proxy labels + intervals), §5.4 (cards).

## Alternatives considered

| Option | Verdict |
|---|---|
| Per-candidate independent MC draws | Rejected: model error is systematic (a wrong pigment size is wrong for every candidate), so one draw perturbs all candidates together; Pareto frequency then measures rank robustness. |
| Full Sobol with second order on 11 variables | Rejected: second order doubles the cost for indices that stay noisy; Morris screens, Sobol first/total confirms. |
| NSGA-II optimisation | Rejected (YAGNI): the design is a fixed 96-point sample; non-dominated sorting is exact. |
| Importing SALib/scipy | Rejected: Python is test-only; the estimators are ≈ 150 lines and are proven against analytic Ishigami values and scipy/SALib fixtures. |
| Single thread, no workers | Possible (≈ 2 min) but 2 workers halve the wall-clock inside the CPU rule; the worker path is also what proves the determinism guarantee. |
| Cards as PDF/HTML | Rejected: Markdown diffs in git; the HTML report (plan 0) embeds them. |

## Risks (each pinned by a test)

| Risk | Test |
|---|---|
| Pareto code wrong on ties / duplicates | T-PAR-1 (fast-check property vs brute force) |
| Sensitivity estimators mislabel variables or are biased | T-SEN-1/2 (Ishigami analytic + oracle fixtures), T-SEN-3 (linear Morris exact) |
| Intervals decorative (always zero width) | T-UNC-2 (zero uncertainty ⇒ zero width; doubled ⇒ wider) |
| Cards overclaim | T-CRD-4 (forbidden phrases, unlabelled numbers) |
| Nondeterministic parallel order | T-SIM-5 (same seed ⇒ identical CSV, 1 vs 2 workers) |
| Controls modelled with unsupported physics | T-SIM-3 (each control row lists its intentionally-NaN columns in `unmodelled`, and the validator allows NaN only there) |
| Machine overloaded by a run | T-RES-1 |
| Pareto objective sign flipped | T-PAR-2 (a dominated candidate never in the front) |
| Optics recomputed per scenario (cost × 9) | T-SIM-6 (`n_stack_evals == (n_mc + 1) × n_feasible`) |
| Worker crash leaves partial output | T-SIM-7 |

## Requirements

FR-1 `evaluate` MUST return the same `Outcome` for a full candidate and for control C4 with the same parameters. FR-2 Results MUST contain 96 × 9 rows with `RESULT_COLUMNS` and valid intervals (`lo ≤ pred ≤ hi`). FR-3 Intervals MUST come from the 256-draw ensemble (type-7 quantiles p5/p95), widened to include the nominal value. FR-4 Pareto objectives MUST be: maximise `r_solar_pred` (scenario mean), minimise `t_max_pred` (scenario mean), minimise `corrosion_proxy`, `delam_proxy`, `cost_proxy`. FR-5 The shortlist MUST contain exactly three distinct candidates (roles `high_performing`, `balanced`, `low_cost`). FR-6 Each card MUST carry the seven §5.4 fields and a decision in `{go, revise, reject}` computed by the rule in D6. FR-7 Every proxy number in any report MUST be labelled PROXY and every predicted number that depends on uncertain inputs MUST show its interval; only `cost_proxy` and `gel_time_rel` have no uncertain inputs and are labelled "nominal only (no interval)" (`q_in_mean_w_m2` depends on `r_solar`, so it has an interval). FR-8 `run_manifest.json` MUST record git commit, config/data sha256, seed, `n_mc`, Bun version and the `bun.lock` hash, the sha256 of every output file, and (added by plan 0 after the HTML is built, as the last field) `report_sha256`; its `core_sha256` = sha256 of the manifest without `report_sha256`. NFR-1 Full `run` ≤ 900 s hard limit; the regression threshold `T_runtime_s` is frozen once from the first real run (1.5 × measured, rounded up to 30 s). NFR-2 Workers ≤ 2, priority 10.

## Acceptance: hypotheses and proofs

| ID | Falsifiable hypothesis | Experiment / deciding observable | Falsified if |
|---|---|---|---|
| H1 | `paretoFront` equals the brute-force non-dominated set | fast-check property test, 500 cases incl. ties, 1–5 objectives, NaN rows; the reference is a 6-line O(n²) loop inside the test | any case differs |
| H2 | The Sobol estimator is right | Ishigami (a = 7, b = 0.1), N = 2¹⁴, fixed seed (frozen after the first pass): analytic S1 = (0.3139, 0.4424, 0), ST = (0.5576, 0.4424, 0.2437); the scipy and SALib fixture values | any index off by > `T_sobol_tol` = 0.03 from analytic (measured sampling sd ≈ 0.011 for S1, 0.010 for ST, so ≈ 1 % of seeds exceed it), or > `T_sobol_fix` = 0.05 from either fixture (two independent N = 2¹⁴ estimates differ by more than 0.02 in 56 % of pairs) |
| H3 | The Morris estimator is right | on the unit cube `f = x1 + 10·x2 + 0·x3` gives μ* = (1, 10, 0) to 1e-9 (every elementary effect equals the slope); `f = x1 + 10·x2 + 0.5·x3²` with 200 trajectories gives μ*(x3) = 1/2 ± 0.05 (analytic: with levels {0, ⅓, ⅔, 1} and Δ = ⅔ the only upward pairs are 0→⅔ (EE = ⅓) and ⅓→1 (EE = ⅔), mean ½; verified by simulation, sd of the mean ≈ 0.012 at 200 trajectories) | any mismatch |
| H4 | Layer ablation behaves | for 10 candidates: `r_solar(C2) ≥ r_solar(C4)`; `corrosion_risk(C3) = baseline > corrosion_risk(C4)`; C0 equals substrate constants | any violated |
| H5 | Intervals are real | all `unc.*` = 0 ⇒ lo = pred = hi exactly for every interval column **except** `wetting_proxy`/`wetting_theta`, whose interval also carries the model's own roughness corners (checked equal to `[score_lo, score_hi]` and `[theta_lo, theta_hi]`); doubled `unc.*` ⇒ every width ≥ the original, at least one strictly | zero-uncertainty width ≠ 0 (other columns), or no widening |
| H6 | Pipeline is reproducible | two runs, same seed: sha256 of `results.csv`; also 1 worker vs 2 workers | hashes differ, or different seeds give the same hash |
| H7 | Cards are faithful | independent re-derivation of the decision from `results.csv` + `controls.csv` | any decision differs, or a field is missing |
| H8 | Reports do not overclaim | scan cards for forbidden phrases and unlabelled predictions | any hit |
| H9 | Resource guard works | `--max-load 0` | run starts |
| H10 | Manifest is truthful | recompute hashes of listed files; edit one config constant and re-hash | mismatch, or hash unchanged after the edit |
| H11 | Runtime inside the limit | wall-clock of the first full `run` | > 900 s |

Thresholds: `T_sobol_tol = 0.03`, `T_sobol_fix = 0.05`, `T_go_pareto_freq = 0.5`, `T_delam_max = 0.5`, `T_runtime_s` (frozen after the first real run), `N_MC = 256`, `N_SOBOL = 1024`, `N_MORRIS = 20`.

**Fault-injection matrix** (edit exactly one input; every row is run through the stepwise command that reads that input, e.g. `simulate`, `optimize`, `report`; `run` is covered by the happy path):

| ID | Single edit | Phase | Exit |
|---|---|---|---|
| F1 | delete `configs/controls.yaml` | data | 5 |
| F2 | `controls.yaml` C1 `r_solar` = 1.4 | config | 2 |
| F3 | `results.csv` row with `t_max_lo > t_max_pred` fed to `optimize` | config | 2 |
| F4 | `--max-load 0` | resource | 6 |
| F5 | `--n-mc 0` | config | 2 |
| F6 | any `unc.*.value` = −0.1 | config | 2 |
| F7 | `candidates.csv`: one candidate's `midcoat_dft_um` set to 5 (constraints still pass, flags consistent; below the optics domain 100–300 µm) | model | 4 |
| F8 | `--design` directory missing | data | 5 |
| F9 | `candidates.csv`: `midcoat_pvc` = 1.3 while `feasible` stays `true` (stale flag) | config | 2 |

Given/When/Then: G1 *Given* the default design, *When* `simulate` runs, *Then* `results.csv` has 864 rows and valid intervals (FR-2, T-SIM-4). G2 *Given* results, *When* `report` runs, *Then* three cards exist with decisions matching the D6 rule (FR-5, FR-6, T-CRD-1..3). G3 *Given* F4, *Then* exit 6 and `resource.load_high` (NFR-2, T-RES-1).

Principle: H1 and H3 use reference implementations written inside the test; H2 uses published analytic answers plus two other libraries' numbers, so the estimator cannot validate itself.

## Execution contract: one shot, nothing left open

**Preflight gate** (print and stop if missing): (1) plans 1–2 done and green; (2) **Evint supplies control C1**: a commercial reflective roof coating's name and datasheet initial solar reflectance and thermal emittance (or names a CRRC-listed product so the researcher agent can cite it) — it goes in `configs/controls.yaml` with `source`; (3) Evint approves 2 workers at priority 10 and the 900 s limit, and understands that the load guard (half the cores) can make a run wait on a busy machine (measured load average 7.3 on 10 cores earlier today); (4) Evint accepts that cost is a relative scenario index (BLOCKED-4).

No stub/TODO/skip. Done = H1–H11 proven with run ids in `docs/proofs/plan-03.md`, `bun run check` green, one full real `run` completed, manifest written. If a task fails partway: stop, leave the tree clean, report the failing proof with its log. Out of scope: merge, push, lab work, later recurring runs, plan 0.

## Global Constraints

Inherited from plans 1–2. Plus: labelling rule (FR-7): fields named `*_proxy`, `corrosion_risk`, `delam`, `cost` print as `PROXY`; predicted `r_solar`, `t_max` print with `[lo, hi]`; report text never uses "proven", "safe", "guaranteed", or a percentage safety/self-cleaning claim (blueprint §5.3, §1 definition of success).

## Review Focus

1. Two candidates with identical objectives (ties) → both kept on the front; shortlist roles still distinct.
2. All candidates infeasible except fewer than three → shortlist raises exit 3 with a clear message, not an index error.
3. A draw where gel never occurs (`Infinity`) → `gel_time_rel` keeps `Infinity` in CSV (`inf`); sensitivity excludes it from variance with a logged `model.degenerate`.
4. Worker crash mid-run → exit non-zero, no partial `results.csv` left behind (write to a temp name, rename at the end).
5. Candidate id present in results but missing in controls → card says "control not computed", never blank.

## Decisions (all settled)

- **D1** Unprotected reference: `corrosion_risk = baseline_corrosion_risk = 1.0` (convention; index is relative), used when the primer is absent. Without a topcoat but with a midcoat: wetting uses `wettingBinder(mat)` (`wetting.theta_binder_deg`); with neither (C0, bare aluminium spandek) wetting fields are NaN (listed in the row's `unmodelled` column of `controls.csv`; no substrate contact-angle constant exists). Absent layers make dependent indices undefined by construction: no topcoat ⇒ `delam_proxy` NaN; no primer ⇒ `gel_time_rel` NaN (corrosion keeps the baseline value of D1); these are listed in `unmodelled` for control rows and never occur in candidate rows (all candidates have all layers).
- **D2** Layer sets: C0 `(F,F,F)`, C2 `(T,T,F)`, C3 `(F,T,T)`, C4 `(T,T,T)`; C1 is datasheet-only: thermal from its `r_solar` and `emissivity`, all other fields NaN with `unmodelled` = those columns. C2 and C3 are per-shortlisted-candidate ablations; C0, C1 are shared.
- **D3** Cost proxy: `Σ rc_i·DFT_i / Σ rc_i·DFT_i,max` over the layers present, `rc_i` relative per-µm costs (scenario) from `materials.yaml`.
- **D4** Uncertainty: per draw, perturb uniformly within ± `unc.*` (or ± `unc.substrate_r_abs`) of 11 parameters: `tio2.diameter_um`, `baso4.diameter_um`, `binder.n`, `substrate.r_solar`, `topcoat.mu_per_um`, `barrier.eps_lo`, `barrier.eps_hi`, `barrier.h_c0_primer_um`, `barrier.h_c0_top_um`, `wetting.theta_silica_deg`, `wetting.theta_mtes_deg` (dimension taken from the list length; stream `deriveSeed(seed, 100)`). Intervals are **parameter-uncertainty** p5–p95 only: they exclude model-form error and are not prediction intervals for the real roof (stated in every card). Intervals = type-7 p5–p95 over draws, widened to include the nominal value; the wetting interval is additionally united with the model's own roughness interval `[score_lo, score_hi]`.
- **D5** Scenario mean for objectives; the worst-case scenario value is also reported (`t_max_worst`) in `pareto.csv`.
- **D6** Decision rule: `reject` if infeasible (plan 1 flag) or `r_solar_hi < substrate r_solar` (a coating that reflects less than mill-finish aluminium is useless; the rule uses initial values, plan 4 reports aged values separately; `optimize` is a Pareto screen of the 96 candidates, the real search is plan 5 `refine`); else `go` if `pareto_freq ≥ 0.5` and `r_solar_pred_mean > C1 r_solar` and `delam_proxy ≤ 0.5`; else `revise`. "go" means "worth a coupon test", never "works".
- **D7** Shortlist roles: `high_performing` = Pareto member with max `r_solar_pred_mean`; `low_cost` = Pareto member with min `cost_proxy` among those with `r_solar_pred_mean > C1 r_solar` (fallback: min cost overall, logged); `balanced` = Pareto member minimising Euclidean distance to the utopia point in min–max-normalised objectives. If a role picks an already-chosen candidate, take that role's next best.
- **D8** Sensitivity variables (11): P1, P2, M1, M2, M3, T1, T2 (plan 1 ranges), pH (plan 1 `sol_gel_ph` range), irradiance 600–1000, air temperature 28–36, wind 1–6 m/s. The water ratio is **not** a variable: in the blueprint range 1–5 the model gives it exactly zero effect (plan 2 D4 limit (i)), and the report says so. Outputs analysed: `t_max_c`, `r_solar`, `corrosion_risk`, `gel_time_rel` (one evaluation yields all four).
- **D9** Results are CSV: NaN is an empty cell and only in the columns named by `CsvOpts.nanColumns` (infeasible rows of `results.csv`; the `unmodelled` fields of `controls.csv`), `inf` only in `gel_time_rel` (plan 1 Task 4 rules); `curves.json` and `spectra.json` go through `safeJson`.
- **D10** Outcome → column mapping: `r_solar→r_solar_pred`, `t_max_c→t_max_pred`, `corrosion_risk→corrosion_proxy`, `wetting_score→wetting_proxy`, `wetting_theta_deg→wetting_theta_pred` (with `_lo/_hi` from the draws united with the model's roughness corners), other names unchanged; the card states whether the nominal contact angle reaches the blueprint §8.1 target of 110° (the smooth-film model usually cannot: Young angle ≤ θ_mtes) and that contact angle and sliding are lab-verified; `delam_proxy` and `q_in_mean_w_m2` get `_lo/_hi` from the draws; `cost_proxy` and `gel_time_rel` are nominal-only (no uncertain inputs). `unmodelled` exists only in `controls.csv`; `t_max_worst` only in `pareto.csv`.
- **D11** Before any work `simulate` reads `candidates.csv` with `validateDesign(rows, true)` and recomputes `checkConstraints`; a `feasible` column that disagrees with the recomputation is a `ConfigError` (F9).
- **D12** `curves.json` = for each of the three shortlisted candidates and all 9 scenarios: day-2 series every 600 s as nominal + p5 + p95 (from the 256 draws: 3 × 257 × 9 ≈ 6.9 k thermal cases ≈ 3–4 s); controls C0, C1 (flat datasheet thermal), C2, C3 (per shortlisted candidate) are **nominal only** (no band; labelled "nominal, no interval"); `spectra.json` = R(λ) nominal + p5 + p95 for the shortlisted candidates, nominal only for C2, C3 and C0 (substrate constant), C1 omitted (datasheet-only).
- **D13** Pipeline stream roles: see plan 1 D13 (uncertainty 100, Saltelli A/B 200/201, Morris 202, bootstrap 203). `draws.csv` columns: `draw, candidate_id, r_solar_pred, t_max_pred, corrosion_proxy, delam_proxy, cost_proxy` (scenario means per draw); `optimize` reads it to compute `pareto_freq`.
- **D14** Rollout and rollback: local tool, no flag; rollback = `git revert` of the commit range; no hand-offs outside the repo.
- **D15** Worker error and event marshalling: a `SpandekError` thrown in a worker is posted as `{error: {code, phase, key, message}}` and rethrown in the parent as the same class; `emitEvent` calls inside a worker are posted as `{event, level, fields}` and replayed into the parent's sink (structured clone strips class fields and the sink is per realm).

## File Structure

| Source | Test |
|---|---|
| `src/node/resources.ts` | `tests/node/resources.test.ts` |
| `src/core/pipeline/context.ts` (`ModelContext`, `makeWlGrid`) | `tests/core/pipeline/context.test.ts` |
| `src/node/context.ts` (`loadContext`) | `tests/node/context.test.ts` |
| `src/core/pipeline/stackProps.ts` | `tests/core/pipeline/stackProps.test.ts` |
| `src/core/pipeline/uncertainty.ts` | `tests/core/pipeline/uncertainty.test.ts` |
| `src/node/simulate.ts` | `tests/node/simulate.test.ts` |
| `src/node/simWorker.ts` (worker entry; covered by simulate tests; excluded from the mirror rule in plan 1) | — |
| `src/core/pipeline/tables.ts` (`PARETO_COLUMNS`, `CONTROL_COLUMNS`, `SENS_COLUMNS`, `DRAW_COLUMNS`, row types `ObjRow`/`ParetoRow`, `ControlRow`, `SensRow`, `DrawRow`, `CurvesJson`, `SpectraJson`, validators) | `tests/core/pipeline/tables.test.ts` |
| `src/core/pipeline/optimize.ts` | `tests/core/pipeline/optimize.test.ts` |
| `src/core/pipeline/sensitivity.ts` | `tests/core/pipeline/sensitivity.test.ts` |
| `src/core/pipeline/controls.ts` (`buildControls`, `decide`) | `tests/core/pipeline/controls.test.ts` |
| `src/node/report/cards.ts` | `tests/node/report/cards.test.ts` |
| `src/node/report/curves.ts` (`buildCurves`, `buildSpectra`) | `tests/node/report/curves.test.ts` |
| `src/node/report/manifest.ts` | `tests/node/report/manifest.test.ts` |
| `configs/controls.yaml` | `tests/node/config.test.ts` (extended) |
| `src/node/cli.ts` (extended) | `tests/node/cli.test.ts` (extended); `tests/pipeline.e2e.test.ts` (cross-cutting, only for `run`) |

## Tasks

### Task 1: Resources, context, controls config

**Tests:** `tests/node/resources.test.ts`, `tests/core/pipeline/context.test.ts`, `tests/node/context.test.ts`, `tests/node/config.test.ts`. **Creates:** `src/node/resources.ts`, `src/core/pipeline/context.ts`, `src/node/context.ts`, `configs/controls.yaml`. **Modifies:** `src/core/config.ts` (+`ControlsSchema`), `src/node/config.ts` (+`loadControls`).
**Interfaces:**
```ts
export function checkLoad(maxLoad?: number): void                          // default os.cpus().length / 2; ResourceError(6) + resource.load_high
export function lowerPriority(): void                                       // os.setPriority(process.pid, 10)
export function runWithTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, limitS: number): Promise<T>   // ResourceError(6) + resource.timeout
export const ControlsSchema: z.ZodObject                                    // c1_name: string, c1_r_solar, c1_emissivity: Sourced
export type ModelContext = { mat: Materials; weather: WeatherConfig; ranges: MaterialRanges; g173: Spectrum; tio2: NKTable; baso4: NKTable; wlUm: Float64Array; controls: Controls }
export function makeWlGrid(): Float64Array                                  // 300..2500 nm step 10 nm in µm, 221 points
export function loadContext(configDir: string, dataDir: string): Promise<ModelContext>   // runs verifyData first
```
- [ ] Tests: `checkLoadZeroLimitThrowsCode6` (H9/F4), `defaultLimitIsHalfCores`, `priorityIsLowered` (`os.getPriority` = 10 afterwards), `timeoutThrowsCode6`, `wlGridHas221PointsAndEndpoints`, `contextLoadsRealFiles`, `missingControlsIsDataError` (F1), `c1ReflectanceAboveOneRejected` (F2). Run → FAIL.
- [ ] Write `controls.yaml` from the preflight answer (C1 name, datasheet values, source). Implement. Run → PASS.
- [ ] Commit: `feat: resource guard, model context, control datasheet config`

**Acceptance:** H9; F1, F2; G3.

### Task 2: `evaluate` and layer variants

**Tests:** `tests/core/pipeline/stackProps.test.ts`. **Creates:** `src/core/pipeline/stackProps.ts`.
**Interfaces:**
```ts
export type Layers = { primer: boolean; midcoat: boolean; topcoat: boolean }
export const CONTROL_LAYERS: { C0: Layers; C2: Layers; C3: Layers; C4: Layers }         // D2
export type StackProps = { r_solar: number; emissivity: number; c_a_j_m2k: number; corrosion_risk: number; wetting_score: number; wetting_theta_deg: number;
  wetting_score_corners: { lo: number; hi: number }; wetting_theta_corners: { lo: number; hi: number };
  delam_proxy: number; cost_proxy: number; gel_time_rel: number; spectrum: Float64Array | null }   // everything that does not depend on the weather scenario
export type Outcome = { r_solar: number; t_max_c: number; q_in_mean_w_m2: number; corrosion_risk: number; wetting_score: number; wetting_theta_deg: number;
  delam_proxy: number; cost_proxy: number; gel_time_rel: number; t_surface_k?: Float64Array }
export function stackProps(c: Omit<DesignRow, "candidate_id"> & Partial<{ ph: number }>, layers: Layers, ctx: ModelContext, mat?: Materials): StackProps
    // c: DESIGN_COLUMNS names without the id, plus optional ph (default: midpoint of ctx.ranges.sol_gel_ph; the water ratio is fixed at the midpoint of its range); mat overrides ctx.mat (uncertainty draws)
export function thermalOutcomes(cases: readonly { sp: StackProps; s: Omit<Scenario, "scenario_id"> }[], ctx: ModelContext, opts?: { series?: boolean }): Outcome[]   // batch of simulateDay
export function evaluate(c: Parameters<typeof stackProps>[0], s: Omit<Scenario, "scenario_id">, layers: Layers, ctx: ModelContext, mat?: Materials): Outcome   // = thermalOutcomes([{stackProps(...), s}])[0]
export function evaluateC1(s: Omit<Scenario, "scenario_id">, ctx: ModelContext): Outcome   // datasheet-only; non-thermal fields NaN
```
- [ ] Tests: `c4EqualsFullCandidate` (FR-1), `ablationPropertiesTenCandidates` (H4), `c0UsesSubstrateConstants`, `c1UnmodelledListMatchesNaNColumns` (T-SIM-3), `costProxyInUnitIntervalAndMonotoneInDft`, `missingPrimerGivesBaselineCorrosionRisk` (D1), `pvcOutOfDomainCode4` (F5 at function level), `pureFunctionSameInputSameOutput`, `optionalPhOverrideChangesGelTimeOnly`, `noTopcoatUsesBinderAngle` and `bareStackHasNaNWettingAndListsItAsUnmodelled` (D1), `stackPropsDoesNotDependOnScenario` (call twice with different scenarios via `evaluate`; `r_solar` identical). Run → FAIL.
- [ ] Implement composition (`gel_time_rel` uses `ref` = midpoints of `ctx.ranges.sol_gel_ph`, `sol_gel_water_ratio`, `primer_gptes_molfrac`; the water ratio itself is fixed at its midpoint): primer → `barrier`, `solGel.gelTimeRel`; midcoat → `optics.midcoatSpectrum`; topcoat → `applyTopcoat`, `wetting`, `delaminationProxy`; stack R → `rSolarStack`; `ThermalInputs` from plan 1 D5 constants with `C_A = c_substrate + Σ ρc·DFT` (computed in `stackProps`, so optics and `C_A` are computed once per candidate per draw, never per scenario); coating emissivity when any coating is present, substrate emissivity otherwise. Run → PASS.
- [ ] Commit: `feat: evaluate() composing models for any layer subset`

**Acceptance:** H4; FR-1.

### Task 3: Uncertainty draws

**Tests:** `tests/core/pipeline/uncertainty.test.ts`. **Creates:** `src/core/pipeline/uncertainty.ts`. **Modifies:** `src/core/design.ts` only if `lhsUnit` is not yet exported (plan 1 Task 6 exports it).
**Interfaces:**
```ts
export function drawMaterials(mat: Materials, n: number, seed: number): Materials[]   // D4, lhsUnit(n, 11, seed)
export function quantile7(sorted: Float64Array, p: number): number                    // type-7 (R default) linear interpolation
export function widenInterval(pred: number, draws: Float64Array): { lo: number; hi: number }   // p5/p95 widened to include pred
```
- [ ] Tests: `zeroUncertaintyGivesIdenticalMaterials` (H5 part), `drawsInsideBounds`, `sameSeedSameDraws`, `nZeroOrNegativeRejectedCode2` (F5), `quantile7MatchesKnownValues` (hand values for [1..10], p = 0.05/0.5/0.95), `intervalContainsPred`, `doubledUncertaintyWidensRealModelOutputs` (H5: `evaluate` on one candidate, real models), `negativeUncertaintyRejected` (F6, schema-level in `MaterialsSchema`). Run → FAIL. Implement. Run → PASS.
- [ ] Commit: `feat: Latin Hypercube material-parameter uncertainty draws`

**Acceptance:** H5; F5, F6.

### Task 4: Batch runner and `simulate` command

**Tests:** `tests/node/simulate.test.ts`, `tests/node/cli.test.ts`. **Creates:** `src/node/simulate.ts`, `src/node/simWorker.ts`, `src/core/pipeline/tables.ts` (the column constants and row types of File Structure; its tests are written in this task: `paretoRowValidates`, `controlRowAllowsNaNOnlyInUnmodelledColumns`, `drawRowValidates`, `sensRowHasIndexField` with `index ∈ {S1, ST, mu_star, sigma}`; `type ObjRow = ParetoRow`). **Modifies:** `src/node/cli.ts`, `src/core/csv.ts` is **not** modified (controls pass `CsvOpts`).
**Interfaces:**
```ts
export type SimOutput = { results: ResultRow[]; drawObjectives: Float64Array /* (nDraws × nCand × 5), NaN rows for infeasible */; nStackEvals: number; nThermalEvals: number }
export function simulateAll(design: readonly FlaggedDesignRow[], weather: readonly Scenario[], ctx: ModelContext, nMc: number, seed: number, workers?: number): Promise<SimOutput>
// CLI: simulate --design DIR --out DIR --seed INT --n-mc 256 --workers 2 --max-load FLOAT --timeout-s 900   (plus the global --config-dir/--data-dir of plan 1)
```
Before any work `simulate` applies D11. Results = `RESULT_COLUMNS`, sorted by `(candidate_id, scenario_id)`; `simulate` also writes `draws.csv` (D13) and records both in the manifest; infeasible candidates are carried with NaN outcomes and `feasible = false` and excluded from `drawObjectives`. Each worker receives a contiguous slice of draw indices plus the structured-cloned context and returns per-draw arrays; the parent merges in index order.
- [ ] Tests: `has864RowsAndValidSchema` (G1; `validateResults`), `sameSeedIdenticalCsvOneAndTwoWorkers` (H6/T-SIM-5), `workersCappedAtTwo`, `opticsOncePerCandidatePerDraw` (T-SIM-6: `nStackEvals == (n_mc + 1) × n_feasible`, `nThermalEvals == nStackEvals × 9`), `noPartialOutputOnFailure` (Review Focus 4: F7 → exit 4, no `results.csv`), `staleFeasibleFlagExit2` (F9), `progressEventsTen`, `workerErrorKeepsCodePhaseKey` (D15: F7 inside a worker still exits 4 with `phase: "model"`), `workerEventsReplayedInParent` (a `model.out_of_range` emitted in a worker appears in `run.jsonl`), `writesDrawsCsv` (256 × n_feasible rows, no NaN) and `writesRunMeta` (seed, n_mc, run_id), `f8MissingDesignDirExit5`, `f5NMcZeroExit2`, `loadGuardRunsFirst` (F4), `intervalsContainNominal` (FR-3).
- [ ] Run → FAIL. Implement: `lowerPriority()`; spawn `workers` Bun Workers; temp file + atomic rename for outputs. Run → PASS.
- [ ] Run once for real on the full design: record wall-clock; freeze `T_runtime_s` into `tests/fixtures/frozen_runtime.txt` (1.5 × measured, rounded up to 30 s), never edit afterwards. If measured > 900 s: stop and report (do not raise the limit).
- [ ] Commit: `feat: worker-parallel batch simulation with uncertainty ensemble and simulate command`

**Acceptance:** H6, H11; G1; F4, F5, F7, F8, F9. Every subprocess test of plans 1–3 and plan 0 (CLI, e2e, report) passes `--max-load 1000` (the half-cores guard would otherwise make them flaky on a busy machine); only the F4 test passes `--max-load 0`.

### Task 5: Pareto, frequency, shortlist

**Tests:** `tests/core/pipeline/optimize.test.ts`. **Creates:** `src/core/pipeline/optimize.ts`.
**Interfaces:**
```ts
export const OBJECTIVES: readonly (readonly [string, "min" | "max"])[]      // FR-4 order
export function candidateObjectives(results: readonly ResultRow[]): { candidate_id: string; values: number[]; t_max_worst: number }[]
export function paretoFront(obj: readonly (readonly number[])[], sense: readonly ("min" | "max")[]): boolean[]   // ties kept; NaN rows false
export function paretoFrequency(drawObj: Float64Array, nDraws: number, nCand: number, sense: readonly ("min" | "max")[]): Float64Array
export function shortlist(objs: ReturnType<typeof candidateObjectives>, freq: Float64Array, c1RSolar: number): Record<"high_performing" | "balanced" | "low_cost", string>   // D7
```
- [ ] Tests: `matchesBruteforceProperty` (H1: fast-check, 500 cases, ties, 1–5 objectives, NaN rows), `dominatedCandidateNeverInFront` (T-PAR-2), `tiesBothKept` (Review Focus 1), `frequencyInUnitIntervalAndConsistent`, `shortlistThreeDistinct`, `shortlistFewerThanThreeFeasibleExit3` (Review Focus 2), `lowCostFallbackLogged`, `shortlistDeterministic`. Run → FAIL. Implement. Run → PASS.
- [ ] Add CLI `optimize --in DIR` (reads `results.csv` and `draws.csv`) writing `pareto.csv` (columns: candidate_id, the 5 objectives, `t_max_worst`, `on_front`, `pareto_freq`, `role`). Test `f3BadIntervalExit2`.
- [ ] Commit: `feat: Pareto front, robustness frequency and shortlist`

**Acceptance:** H1; F3; FR-4, FR-5.

### Task 6: Sensitivity

**Tests:** `tests/core/pipeline/sensitivity.test.ts`, `tests/oracle.fixtures.test.ts`. **Creates:** `src/core/pipeline/sensitivity.ts`. **Modifies:** `oracle/generate.py` (+ sobol fixture), `tests/fixtures/oracle/sobol.json`.
**Interfaces:**
```ts
export type Bounds = readonly (readonly [number, number])[]
export function sobolIndices(f: (x: Float64Array) => number, names: readonly string[], bounds: Bounds, n: number, seed: number, bootstrap?: number):
  { variable: string; S1: number; S1_conf: number; ST: number; ST_conf: number }[]            // Saltelli-2010 first order, Jansen total; A, B from xoshiro uniforms
export function morrisScreen(f: (x: Float64Array) => number, names: readonly string[], bounds: Bounds, trajectories: number, seed: number):
  { variable: string; mu_star: number; sigma: number }[]                                       // 4 levels, Δ = 2/3
export function runSensitivity(ctx: ModelContext, seed: number, n?: number): { output: string; method: "morris" | "sobol"; variable: string; value: number; conf: number }[]   // D8; one evaluation yields all four outputs
```
`oracle/generate.py` fixtures: Ishigami (a = 7, b = 0.1) with `scipy.stats.sobol_indices` (N = 2¹⁴) and `SALib` Sobol (N = 2¹⁴, first/total) — numbers stored with the library versions. (No Morris fixture: with 20 trajectories the μ* order on Ishigami is unstable — six different orders over 500 random designs — so Morris is proven analytically.)
- [ ] Tests: `ishigamiSobolMatchesAnalyticAndFixtures` (H2, N = 2¹⁴, `T_sobol_tol` vs analytic, `T_sobol_fix` vs fixtures), `morrisLinearExact` (H3: μ* = (1, 10, 0) to 1e-9) and `morrisQuadraticAnalytic` (H3: μ*(x3) = 1/2 ± 0.05 at 200 trajectories), `separateStreamsForAAndB` (A and B differ and are not shifted copies), `variableOrderPreserved` (swap bounds order → labels follow), `degenerateOutputsExcludedAndLogged` (Review Focus 3: `gel_time_rel = Infinity` rows dropped, `model.degenerate`), `realModelsSmoke` (n = 16, 11 variables, 4 outputs, all finite or `Infinity` only in `gel_time_rel`), `sensitivityDoneEvents`, `bootstrapIntervalCoversAnalyticOnIshigami` (conf > 0 and analytic value inside S ± 2·conf for N = 2¹⁴). Run → FAIL. Implement. Run → PASS.
- [ ] Add CLI `sensitivity --in DIR --n 1024` writing `sensitivity.csv` (`SENS_COLUMNS`: output, method, variable, index, value, conf). Commit: `feat: Morris and Saltelli/Jansen sensitivity proven on Ishigami and against scipy and SALib`

**Acceptance:** H2, H3.

### Task 7: Controls, cards, curves, manifest

**Tests:** `tests/core/pipeline/controls.test.ts`, `tests/node/report/cards.test.ts`, `curves.test.ts`, `manifest.test.ts`. **Creates:** `src/core/pipeline/controls.ts`, `src/node/report/{cards,curves,manifest}.ts`.
**Interfaces:**
```ts
export function decide(row: { feasible: boolean; r_solar_hi: number; pareto_freq: number; r_solar_pred_mean: number; delam_proxy: number }, c1RSolar: number, substrateRSolar: number): "go" | "revise" | "reject"   // D6
export function buildControls(shortlist: Record<string, string>, design: readonly FlaggedDesignRow[], weather: readonly Scenario[], ctx: ModelContext): ControlRow[]
    // control_id (C0, C1, C2, C3), for_candidate (id or "-"), outcome columns, `unmodelled` (";"-joined column names that are intentionally NaN; "" if none)
export function writeCard(candidateId: string, role: string, results: readonly ResultRow[], controls: readonly ControlRow[], ctx: ModelContext, outDir: string): Promise<string>
export function buildCurves(results: readonly ResultRow[], shortlist: Record<string, string>, design: readonly FlaggedDesignRow[], weather: readonly Scenario[], ctx: ModelContext, nMc: number, seed: number): CurvesJson     // D12
export function buildSpectra(shortlist: Record<string, string>, design: readonly FlaggedDesignRow[], ctx: ModelContext, nMc: number, seed: number): SpectraJson   // D12; both serialised by the caller with safeJson
export function writeManifest(outDir: string, ctx: ModelContext, seed: number, nMc: number, files: readonly string[]): Promise<string>
```
- [ ] Tests: `cardHasSevenFields` (H7), `decisionRederivedIndependently` (H7: the test recomputes D6 from the CSVs), `limitsListScenarioConstantsAndStaticLimits` (the Limit/risk field names every constant used with `status: scenario`, plus the static model limits: independent scattering, no NIR binder absorption / R held outside 300–2500 nm, wind 6 m/s beyond the usual McAdams range, proxies uncalibrated, intervals are parameter-uncertainty only, water ratio has no effect in 1–5, condensation pH-independence, contact angle is lab-verified and the smooth-film model rarely reaches 110°), `noForbiddenPhrasesAndAllPredictionsHaveIntervals` (H8, regex `proven|safe|guaranteed|\d+\s*%\s*(safe|aman|self-clean)`), `missingControlSaysNotComputed` (Review Focus 5), `controlsRowsC0C1C2C3` (T-CRD-2), `curvesHaveNominalAndBands` (shortlisted series have `t_lo ≤ t ≤ t_hi`; controls are flagged nominal-only), `reportCurvesUnder5s` (D12 budget), `curvesJsonHasNoNaN` (safeJson), `manifestHashesMatchFiles`, `manifestCoreHashExcludesReportField` and `manifestChangesWhenConfigConstantEdited` (H10). Run → FAIL.
- [ ] Implement. Cards follow blueprint §5.4 field names: Candidate ID, Primer chemistry, Midcoat, Topcoat, Predictive outcome, Limit / risk, Decision. Add CLI `report --in DIR` (cards, controls, curves, spectra, manifest). Run → PASS.
- [ ] Commit: `feat: candidate cards, controls table, curve data and run manifest`

**Acceptance:** H7, H8, H10; G2.

### Task 8: End-to-end `run`, fault matrix, proof log

**Tests:** `tests/pipeline.e2e.test.ts`. **Modifies:** `src/node/cli.ts`.
- [ ] Tests (real subprocess, full data, temp dir): `runEndToEndArtifactsExist` (all outputs listed in the stack table), `runTwiceSameSeedSameResultsHash` and `differentSeedDifferentHash` (H6), `runtimeBelowFrozenThreshold` (`frozen_runtime.txt`), `faultF1ToF9` (parametrised over the stepwise command that reads the edited input; assert code, `error.raised.phase`, no stack trace), `allPlan3EventsPresentInRunJsonl` (run with `SPANDEK_LOG_LEVEL=debug` so the debug events `sim.draw_complete` and the plan-2 `thermal.solved`/`mie.cache_stats` are included). Run → FAIL.
- [ ] Implement `run` = `design → simulate → optimize → sensitivity → report` sharing one `run_id` and one manifest. Run → PASS.
- [ ] Full gate: `bun run check`; one real `run`; write run ids and observables for H1–H11 into `docs/proofs/plan-03.md`; run the mutation checks.
- [ ] Commit: `feat: spandek run pipeline with fault-injection proof log`

**Acceptance:** H6, H11; F1–F9; G1–G3.

## Part 2: Test specification

| File | IDs | Key assertions |
|---|---|---|
| `tests/node/resources.test.ts` | T-RES-1..4 | `--max-load 0` ⇒ code 6; priority 10; timeout ⇒ code 6 |
| `tests/core/pipeline/context.test.ts`, `tests/node/context.test.ts` | T-CTX-1..4 | 221-point grid; real files load; missing controls ⇒ 5 |
| `tests/core/pipeline/stackProps.test.ts` | T-SIM-1..3, T-SIM-8 | C4 = candidate; ablation order; C1 NaN fields; scenario independence |
| `tests/core/pipeline/uncertainty.test.ts` | T-UNC-1..6 | zero uncertainty ⇒ zero width; doubled ⇒ wider; quantile hand values |
| `tests/node/simulate.test.ts` | T-SIM-4..7 | 864 rows; identical CSV for 1 vs 2 workers; optics once per candidate per draw; no partial output |
| `tests/core/pipeline/tables.test.ts`, `optimize.test.ts` | T-TAB-1..3, T-PAR-1..8 | table validators; property test vs brute force; ties; three distinct roles |
| `tests/core/pipeline/sensitivity.test.ts` | T-SEN-1..8 | Ishigami within 0.03 of analytic, 0.05 of fixtures; Morris exact and quadratic analytic; label order; separate A/B streams; bootstrap coverage |
| `tests/core/pipeline/controls.test.ts`, `tests/node/report/*.test.ts` | T-CRD-1..6, T-CUR-1..3, T-MAN-1..3 | seven fields; decision re-derived; forbidden phrases; curve bands; manifest hashes |
| `tests/pipeline.e2e.test.ts` | T-E2E-1..5 | artifacts, reproducibility, runtime, F1–F9 via stepwise commands, event catalogue |

Mutation checks (commit first; mutate a copy in the scratchpad; never `git checkout` after a mutation): (M1) flip one objective's sense → T-PAR-2 must fail; (M2) drop NaN-row masking → T-PAR-1 must fail; (M3) swap the Sobol `S1`/`ST` outputs → T-SEN-1 must fail; (M4) remove widening-to-nominal → T-UNC interval test or FR-2 validation must fail; (M5) change the `go` threshold to `≥ 0.4` → T-CRD-2 must fail; (M6) compute `stackProps` inside the scenario loop → T-SIM-6 must fail. A surviving mutant means a weak test: strengthen the test, not the code.

### Test stubs (helpers and key assertions)

Helpers (`tests/helpers.ts`, extended): `smallContext(): Promise<ModelContext>` (real files via `loadContext`), `bruteForceFront(obj: number[][], sense: ("min" | "max")[]): boolean[]` (the 6-line O(n²) reference, written inside the test file), `ishigami(x: Float64Array): number` (a = 7, b = 0.1).

```ts
// tests/core/pipeline/optimize.test.ts — H1
test("matchesBruteforceProperty", () => {
  fc.assert(
    fc.property(
      fc.array(fc.array(fc.oneof(fc.integer({ min: 0, max: 4 }), fc.constant(NaN)), { minLength: 3, maxLength: 3 }), { minLength: 1, maxLength: 40 }),
      (obj) => expect(paretoFront(obj, ["max", "min", "min"])).toEqual(bruteForceFront(obj, ["max", "min", "min"])),
    ),
    { numRuns: 500 },
  )
})
// tests/core/pipeline/sensitivity.test.ts — H2
test("ishigamiSobolMatchesAnalyticAndFixtures", () => {
  const r = sobolIndices(ishigami, ["x1", "x2", "x3"], [[-Math.PI, Math.PI], [-Math.PI, Math.PI], [-Math.PI, Math.PI]], 2 ** 14, 20261121)
  const S1 = [0.3139, 0.4424, 0], ST = [0.5576, 0.4424, 0.2437]
  r.forEach((v, i) => { expect(Math.abs(v.S1 - S1[i]!)).toBeLessThan(0.03); expect(Math.abs(v.ST - ST[i]!)).toBeLessThan(0.03) })
  for (const f of loadFixture<SobolFixture[]>("sobol")) r.forEach((v, i) => expect(Math.abs(v.S1 - f.S1[i]!)).toBeLessThan(0.05))
})
// tests/node/simulate.test.ts — H6
test("sameSeedIdenticalCsvOneAndTwoWorkers", async () => {
  const a = await simulateAll(design, weather, ctx, 16, 1, 1), b = await simulateAll(design, weather, ctx, 16, 1, 2)
  expect(toCsv(RESULT_COLUMNS, a.results)).toBe(toCsv(RESULT_COLUMNS, b.results))
})
```
