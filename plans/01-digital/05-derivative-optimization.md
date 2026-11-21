# Derivative-Based Formulation Optimisation and Budget Frontier Implementation Plan (Plan 5 of 6 (0–5), Bun + TypeScript)

Part 1 is the plan; Part 2 is the test specification. Depends on plans 1–3 being done and green; plan 4 is optional (it only adds a second scenario set). It turns the 96-candidate screening of plan 3 into a precise optimum: gradients of the models with respect to every ingredient, a constrained gradient search from the best screened candidates, robust re-optimisation under model uncertainty, a tolerance table saying how precisely each ingredient must be dosed, and a precomputed budget table (the performance–price frontier, "PPF") that answers "what is the best recipe for budget B" by direct lookup.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** 📋 PLANNED (written 2026-11-21 at the user's request: "search derivatives and optimizations to get the best and most precise ingredients", extended the same day with "budget search and a precalculated table ... best PPF model ... best combination for any budget"; PPF is read as performance–price frontier)

**Goal:** Find, for the aluminium spandek three-layer system, the ingredient levels (layer thicknesses, sol-gel fractions, pigment volume concentration, pigment mix and pigment grade sizes) that give the best trade-off of the five objectives, report them with their dosing tolerances, prove the result beats random and grid search, and precompute, for each of three priority profiles, the best recipe at 100 budget levels so any budget finds its best combination instantly.

**Architecture:** `core/opt/` is pure TypeScript: a bound-aware central finite-difference gradient (step chosen by a convergence study, Richardson-checked), a projected BFGS search with Armijo backtracking and an exterior penalty for the nonlinear constraints, Chebyshev scalarisation of the five objectives, and Hessian-based tolerance regions. `core/opt/budgetTable.ts` (pure, also runs in the browser) builds the table by an ε-constraint sweep over the cost budget with continuation (each level warm-started from the previous one) and answers queries exactly: the entry with the largest tabulated budget not above the requested budget, so the answer always costs no more than the budget. `node/refine.ts` runs multi-start searches from the plan-3 Pareto set, re-optimises across uncertainty draws, writes CSV and JSON, and reuses plan-3 `evaluate`/`thermalOutcomes` unchanged. Independent proof: scipy optimisers in the test-only oracle share no code with the TypeScript; mpmath checks the finite-difference arithmetic (not the model) at 60 digits, and analytic benchmark functions with exact gradients share no code with the model either.

**Tech Stack:** as plan 1 (Bun 1.3.14, TypeScript 7.0.2, zod 4.6.7, fast-check 4.10.3; versions verified 2026-11-21); oracle: scipy 1.18.1 (existing) plus mpmath, added in Task 3 and pinned in `oracle/uv.lock` (its version is recorded in the proof log, not assumed here). No new TypeScript dependency.

**Spec:** `Blueprint_Riset_Spandek_3_Fungsi.md` §5.1 (ranges), §5.2 (constraints), §5.3–5.4 (objectives, Pareto); user scope decisions of 2026-11-21 (aluminium only; Indonesian climate optional via plan 4). Interfaces from plans 1–3.

## What the operator does
1. `bun run spandek run --seed 20261121 --out reports/` (plan 3, about 2–3 min).
2. `bun run spandek refine --in reports/ --out reports/refine/ [--scenarios generic9|indonesia]` (about 3–8 min: 20 starts, 2 workers; prints one progress line per start).
3. `bun run spandek budget-table --in reports/ --out reports/refine/` (about 3–5 min, once; writes `budget_table.json`), then `bun run spandek budget --table reports/refine/budget_table.json --amount 0.42 --profile balanced [--polish]` prints the best recipe for that budget in under a second (exit 3 with the minimum feasible budget if the amount is too low). The same lookup runs in the report as a budget slider.
4. Open the "Optimisation" section of `reports/report.html`: refined Pareto front vs the screened one, three recipes (high-performing, balanced, low-cost) with dosing tolerances, elasticity table, robust-vs-nominal comparison. Exit 0 = good; exit 3 = no feasible optimum or budget below the minimum feasible cost, 4 = model not smooth enough for gradients, 5 = missing plan-3 inputs, 6 = time limit.

## Logging and debugging
| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `refine.gradcheck` | info | `core/opt/gradient.ts` | variable, step_h, rich_diff_rel | 9 per start set |
| `refine.start.done` | info | `node/refine.ts` | start_id, weight_id, iters, f0, f_final, kkt, status | 40 per run |
| `refine.front.done` | info | `node/refine.ts` | n_points, n_dominated_removed | 1 |
| `refine.tolerance.done` | info | `core/opt/tolerance.ts` | variable, tol_lo, tol_hi, loss_pct | 9 |
| `refine.budget.done` | info | `core/opt/budgetTable.ts` | profile, n_levels, cmin, cmax, knee_budget | 3 per table |
| `refine.budget.query` | info | `node/refine.ts` | profile, budget, entry_budget, polished | per query |
| `refine.failed` | error | `node/refine.ts` | phase, code | on failure |
| `opt.iter` | debug | `projectedBfgs.ts` | literal step names `grad`, `direction`, `linesearch`, `project`, `update` | dev only |

Production = info only and every failure diagnosable from info (`refine.start.done` carries status `converged|max_iter|stalled|infeasible`). Redaction: ids, numbers, relative paths only. Alert rules: none (batch); exit codes are the alert. Runbook: **4** → read `refine.gradcheck` (`rich_diff_rel` large means a non-smooth variable: see Task 1 answers); **3** → the constraint set is empty (check `cpvc`, total DFT cap); **6** → raise `--time-limit-s` or lower `--starts`. A test per event via the plan-1 events guard. Log schema and size cap as plan 1.

## Scope
In: gradients and Hessians of the five objectives and the constraint functions with respect to nine continuous ingredient variables; multi-start constrained search; Chebyshev front refinement; robust re-optimisation; tolerance table; elasticities. Out: discrete ingredient choice (precursor families, binder type), mass-based recipes (BLOCKED-11), lab calibration (BLOCKED-1), real vendor prices (the budget unit is the plan-3 relative `cost_proxy` until BLOCKED-4 and BLOCKED-11 are resolved; the table is rebuilt in currency automatically once `materials.yaml` carries per-m² prices), and any claim that the optimum is the real-world optimum: it is the optimum of the models, labelled PROXY like plan 3.

## Stack and versions
| Item | Choice | Version / status |
|---|---|---|
| Runtime and language | Bun, TypeScript | 1.3.14, 7.0.2 |
| Gradient method | central finite differences, per-variable step, Richardson check | own code, no dependency |
| Local optimiser | projected BFGS + Armijo + exterior penalty | own code |
| Oracle for gradients | mpmath high-precision numerical differentiation | pinned by Task 3 |
| Oracle for optimiser | scipy `minimize` (L-BFGS-B, SLSQP) on analytic benchmarks | 1.18.1 |

**Variables (`configs/optimize.yaml`, ranges from blueprint §5.1 unless stated):** `p1` primer GPTES fraction 0.20–0.80; `p2` primer DFT 2–12 µm; `m1` midcoat PVC 0.10–0.35 (≤ `cpvc`); `m2` TiO2 share of pigment 0.20–0.80; `m3` midcoat DFT 100–300 µm; `t1` topcoat MTES fraction 0.20–0.80; `t2` topcoat DFT 3–20 µm; `d_tio2_um` TiO2 grade size 0.15–0.40 (status `scenario`: pigment grades are an ingredient choice; the spike Q2 confirms available grades); `d_baso4_um` BaSO4 grade size 0.30–3.0 (`scenario`). pH 3.5–5.0 stays at the plan-1 midpoint (its effect is only on gel time and is reported by plan 3 sensitivity). Scaled coordinates `u = (x − lo)/(hi − lo) ∈ [0,1]⁹` are used inside the optimiser so one step size means the same relative change everywhere.

**Gaps this plan closes:** plan 3 only picks the best of 96 sampled points and says nothing about how precisely an ingredient must be dosed; blueprint §5.4 asks for "best" candidates and the lab needs tolerances.

## Alternatives considered
| Alternative | Why not |
|---|---|
| Forward-mode automatic differentiation | Needs a dual-number Mie implementation; the Mie series is complex-valued and ripple-prone; finite differences are verified against an independent high-precision oracle instead |
| Complex-step derivative | Mie already uses complex arithmetic, so it cannot carry the step |
| Evolutionary / CMA-ES search | No dependency-free implementation worth owning; objectives cost ms, gradients cost 19 evals, so multi-start gradients are cheaper and give KKT and Hessian evidence |
| Surrogate model (Gaussian process) | The model is already fast; a surrogate adds error with no benefit |
| Dense grid | 9 variables; kept only as a baseline (4096 Sobol points) that the optimiser must beat |

## Risks (each pinned by a test)
| Risk | Test |
|---|---|
| Mie ripples make finite-difference gradients noisy | `gradientMatchesMpmathOracle` (H1), `richardsonAgreementWithinFrozenBound` (H1) |
| Optimiser ends worse than random search | `beatsSobolBaselineAndScreening` (H5) |
| Optimum violates a constraint by rounding | `optimaSatisfyAllConstraints` (H6) |
| Local optimum reported as global | `multiStartSpreadReported` (H7), baseline H5 |
| Tolerance table overstates precision | `toleranceEdgesVerifiedByDirectEvaluation` (H8) |
| Nominal optimum is fragile under model uncertainty | `robustRegretNotWorseThanNominal` (H9) |
| Non-determinism from worker order | `sameCsvOneAndTwoWorkers` (H10) |

## Requirements
- **FR-1** Gradients MUST be computed for the five objective functions and the constraints (`m1 ≤ cpvc`, `p2 + m3 + t2 ≤ 332 µm`, `delam_proxy ≤ 0.5`) in scaled coordinates with bound-aware steps (one-sided at a bound).
- **FR-2** The scalar objective MUST be the smooth Chebyshev form `S(x) = (1/β)·ln Σ_i exp(β·w_i·g_i(x)) + ρ·Σ_i w_i·g_i(x)` over the five objectives normalised to [0,1] by the screened ranges (plan 3 `results.csv`), `β = 20`, `ρ = 0.05` (log-sum-exp is C^∞, so gradients, KKT and Hessians are meaningful; the true Chebyshev maximum differs from `S` by at most `ln(5)/β = 0.08` and is reported beside it; every baseline in H5 and H13 uses the same `S`). The five objectives are the entries of plan 3 `OBJECTIVES` in that order, read at run time (never re-typed); `delam_proxy` is a constraint (FR-1), not an objective. Weights: the `balanced` vector for the 20 starts, then the 4 `corner` vectors (one objective weighted 0.7, the others 0.075) for the 5 best starts (warm-started): 40 solves per run.
- **FR-3** The search MUST start from the plan-3 Pareto candidates (top 10 by `pareto_freq`) and 10 Sobol points (`deriveSeed(seed, 300)`) moved to feasibility by bisection toward the best screened feasible candidate; every start is feasible, and the search MUST never return a point worse than its start.
- **FR-4** Constraints: box by projection, linear and nonlinear by exterior penalty with an escalating weight; every reported optimum MUST satisfy all constraints to 1e-9.
- **FR-5** Robust optimisation MUST re-solve the balanced weight vector for K = 32 uncertainty draws (plan 3 D4 stream `deriveSeed(seed, 301)`) and report the distribution of optimal ingredient levels and the robust optimum (minimising the 90th-percentile objective over the draws).
- **FR-6** The tolerance table MUST list, per ingredient, the largest symmetric dose change that keeps the scalar objective within 1 % (config `tol_loss`) of the optimum, from the Hessian and then verified by direct evaluation (H8).
- **FR-7** Elasticities `∂ln f/∂ln x` at each recipe MUST be reported beside the plan-3 global indices (local vs global).
- **FR-8** Outputs are PROXY-labelled like plan 3: "optimum of the models, not a measured optimum".
- **FR-9** `budget-table` MUST, for each priority profile (`cooling_first`, `balanced`, `durability_first`; weight vectors over the four non-cost objectives fixed in `configs/optimize.yaml`), solve `min Chebyshev scalar s.t. cost ≤ B_k` for 100 budgets `B_k = c_min + (c_max − c_min)·k/99`, where `c_min` is the minimum feasible cost (cost minimised under the constraints) and `c_max` the cost of the unconstrained-budget optimum of that profile; levels run upward with continuation.
- **FR-10** `lookupBudget(table, B)` MUST return the entry with the largest `B_k ≤ B`, plus the unspent headroom `B − cost`; for `B < c_min` it MUST return `infeasible` with `c_min`; the answer MUST be exact table content, never interpolated.
- **FR-11** The table MUST be monotone: performance (the profile's scalar, lower is better) is non-increasing in budget, after a monotone repair step that replaces an entry by the previous one's recipe if the solver returned a worse point (the repair is counted and logged, and capped at 5 % of entries or the build fails).
- **FR-12** Each entry MUST carry recipe, cost, the five objectives nominal, intervals from K_b = 64 draws (`deriveSeed(seed, 303)`), and the profile scalar; the file MUST carry the knee budget (the smallest budget reaching 95 % of the total improvement from `c_min` to `c_max`) and a SHA-256 in `run_manifest.json`.
- **FR-13** `--polish` MUST re-solve the exact requested budget warm-started from the table entry (one solve, nominal) and never return a worse scalar than the entry.
- **NFR-1** `refine` MUST finish within 600 s (2 workers) and be byte-identical for 1 and 2 workers; `budget-table` MUST finish within 900 s and be byte-identical for 1 and 2 workers; `budget` (lookup) MUST answer within 1 s.

## Runtime budget
One evaluation = `stackProps` 0.5 ms + 9 thermal runs × 0.53 ms ≈ 5.3 ms; one gradient = 19 evaluations ≈ 100 ms; one solve ≤ 60 iterations ≈ ≤ 6 s (continuation solves ≈ 10 iterations ≈ 1 s).

| Job | Solves × time | One core | Two workers |
|---|---|---|---|
| `refine` multi-start (FR-2, FR-3) | 40 × ≤ 6 s | ≤ 240 s | ≤ 120 s |
| robust re-optimisation (32 draws, warm) | 32 × ≈ 1 s | ≈ 32 s | ≈ 16 s |
| Hessian and tolerance bisection | 9 × 9 + 2 × 9 × 30 evals | ≈ 3 s | ≈ 3 s |
| `budget-table` solves (3 × 100 levels + c_min, c_max) | ≈ 306 × ≈ 1 s | ≈ 306 s | ≈ 150 s (profiles in parallel, levels sequential) |
| `budget-table` intervals (300 entries × 64 draws × 5.3 ms) | 102 s | 102 s | 51 s |

Totals: `refine` ≈ 140 s, `budget-table` ≈ 200 s on two workers, both inside their limits (600 s, 900 s) with margin for the load guard.

## Acceptance: hypotheses and proofs
Thresholds: `T_grad_rel` (finite-difference vs mpmath relative error; hard bound 1e-3, working value frozen once from the first real run), `T_kkt` (projected-gradient sup-norm at interior optima; frozen once, hard bound 1e-4), `T_conv = 1e-6` (benchmark optimum distance), `T_nrt = 600 s`, `T_nrt_table = 900 s`, `tol_loss = 0.01`, `T_repair = 0.05`.

| ID | Hypothesis | Experiment | Falsified when |
|---|---|---|---|
| H1 | Finite-difference gradients are correct | (a) a fixture of real model values at the ±h stencil offsets around 30 random feasible points (generated by the TypeScript model, stored as JSON, looked up by a closure keyed on the offset) differenced at 60 digits by mpmath with Richardson extrapolation to 1e-12 gives the reference; (b) six analytic functions with exact gradients share no code with the model. It checks the finite-difference arithmetic and the step choice, not the model itself | any relative error > `T_grad_rel` in (a) or > 1e-7 in (b) |
| H2 | Closed-form derivative of the thermal model | linear case (ε = 0, constant G): `∂T_max/∂r` equals the analytic value | difference > 1e-6 relative |
| H3 | Optimiser is correct on known problems | 6 analytic benchmarks (box-constrained quadratic with active bounds, Rosenbrock in a box, a linearly constrained problem) vs scipy L-BFGS-B/SLSQP and the known optimum | distance to the known optimum > `T_conv` |
| H4 | Monotone descent | every start: `S` is non-increasing along the iterates within a penalty round (μ fixed); across rounds the penalised merit is non-increasing | any increase |
| H5 | The search beats naive search | best scalar over all starts vs best of the 96 screened candidates and vs best of 4096 Sobol points under the same weights | optimiser worse than either baseline by more than 1e-9 |
| H6 | Constraints hold | every reported optimum: box, `m1 ≤ cpvc`, DFT cap, `delam_proxy ≤ 0.5` | any violation > 1e-9 |
| H7 | First-order optimality | at interior optima the scaled projected gradient ≤ `T_kkt`; Hessian eigenvalues ≥ −`T_kkt` | exceeded, or a non-PSD optimum not flagged `saddle` |
| H8 | Tolerance table is honest | each edge is bisected on direct evaluation to loss `1 % ± 1e-6` (the Hessian value only brackets the bisection); for unclipped variables, the loss at 1.5 × the tolerance exceeds 1 % | an edge loss outside `1 % ± 1e-6`, or fewer than 7 unclipped variables confirmed |
| H9 | Robust beats nominal under uncertainty | evaluate nominal and robust recipes on 256 fresh draws (`deriveSeed(seed, 302)`): p95 regret of robust ≤ p95 regret of nominal | robust worse |
| H10 | Deterministic | CSV/JSON hashes of `refine` and of `budget-table` are equal for 1 and 2 workers | any hash differs |
| H11 | Runtime | `refine` within `T_nrt`, `budget-table` within `T_nrt_table` (cost table in "Runtime budget") | exceeds |
| H13 | Budget table optimum is correct | at 10 chosen budgets per profile the table scalar is no worse than the best of 4096 Sobol points restricted to cost ≤ B and no worse than the best feasible plan-3 candidate with cost ≤ B (both by brute force) | table worse by more than 1e-9 |
| H14 | Lookup is exact and safe | for 1000 random budgets: returned cost ≤ budget; returned entry is the largest tabulated budget ≤ B (brute-force scan); below `c_min` returns `infeasible` | any cost above budget, wrong entry, or a feasible budget refused |
| H15 | Table is monotone | scalar non-increasing in budget for every profile; repairs ≤ `T_repair` of entries | any increase, or repairs above `T_repair` |
| H16 | Budget constraint is active when it should be | for non-repaired entries with budget below the unconstrained-optimum cost, cost = budget within 1e-4 relative (the budget is spent) | an entry leaves more than 1e-4 relative headroom while a cheaper-than-unconstrained optimum is in force |
| H17 | Polish never loses | `--polish` result scalar ≤ table entry scalar at 20 random budgets, cost ≤ budget | worse or over budget |
| H18 | Report budget slider equals the table | for 5 slider positions the card's recipe and numbers equal `budget_table.json` (read by `data-` attributes) | any mismatch |
| H12 | Report equals data | numbers in the Optimisation section equal `refine_*.csv` (plan 0 honesty style) | any mismatch |

**Fault-injection matrix** (edit one input; expect phase, status, exit):

| ID | Single edit | Phase | Exit |
|---|---|---|---|
| F1 | weights do not sum to 1 | `config` | 2 |
| F2 | a variable with `lo > hi` | `config` | 2 |
| F3 | `--starts 0` | `config` | 2 |
| F4 | `cpvc` = 0.05 (below the PVC lower bound 0.10) | `refine.feasible` | 3 |
| F5 | a material refractive index = NaN | `refine.model` | 4 |
| F6 | a discontinuity injected into the corrosion model (mutation copy) | `refine.gradcheck` | 4 |
| F7 | plan-3 `results.csv` missing in `--in` | `refine.load` | 5 |
| F8 | `--time-limit-s 0.001` | `refine.run` | 6 |
| F9 | start point outside the box | `config` | 2 |
| F10 | `--amount` below `c_min` | `budget.lookup` | 3 |
| F11 | `--amount -5` or `--profile luxury` | `config` | 2 |
| F12 | one byte changed in `budget_table.json` (manifest hash) | `budget.verify` | 5 |
| F13 | `--time-limit-s 0.001` on `budget-table` | `budget.build` | 6 |

Acceptance as Given/When/Then: Given a plan-3 run directory, when `refine` runs, then `refine_front.csv`, `refine_recipes.csv`, `refine_tolerance.csv`, `refine_robust.csv` exist and H1–H12 hold (FR-1..8); then when `budget-table` has run, a table of 3 × 100 entries exists, and a query for any budget returns the best tabulated recipe at or below it (H13–H18, FR-9..13); given F1–F13, each yields its phase and exit.

## Execution contract: one shot, nothing left open
**Preflight gate** (print and stop if missing): (1) plans 1–3 done and green with a `reports/run_meta.json`; (2) `uv` may add `mpmath` to the oracle environment; (3) 2 workers at priority 10 (plan 3); No stub, TODO, skip, xfail, placeholder or "decide later"; the spike ends in written answers Q1–Q4. By-design limits are tickets (BLOCKED-11 mass recipes, needs sourced densities and binder solids). `T_grad_rel` and `T_kkt` are frozen once from the first real run and never edited afterwards. Done means every hypothesis holds on evidence with run ids in `docs/proof-log-refine.md` and lint, typecheck and tests are green. If a task fails: stop at it, leave the tree clean, report the failing proof with its log. Out of scope for the run: merge, prod, publishing.

## Global Constraints
Plans 1–3 constraints apply. `core/opt/` imports no Node/Bun/DOM modules. No mocks: the objective in tests is the real plan-3 model; analytic benchmarks are real functions with known optima. Aluminium substrate constants only. Every tolerance comes from the config, never a literal.

## Review Focus
1. A step size so small that rounding noise dominates the gradient (or so large that Mie ripples are averaged away).
2. Optimising in physical units so one variable dominates the step.
3. A recipe reported at a bound while labelled "interior".
4. Constraint penalties so strong that the line search stalls.
5. A tolerance computed from the curvature alone for a variable at an active bound.

## Decisions (all settled)
- **D1** Central differences in scaled coordinates, step `h_i` chosen per variable in Task 1 from the convergence study and written to `configs/optimize.yaml`; one-sided second-order differences at a bound; Richardson check `|G(h) − G(h/2)|/|G(h/2)|` must be ≤ the frozen bound or the run exits 4.
- **D2** Objective names and order come from plan 3 `OBJECTIVES`; profile weights (D12) are keyed by objective name and the test `objectivesAreTheFivePlan3Names` pins them. Normalisation of objectives uses the min and max of plan-3 `results.csv` over feasible rows (nominal); maximised objectives are flipped so every `g_i` is minimised.
- **D3** Local search on the smooth `S`: projected BFGS in scaled coordinates, Armijo constant 1e-4, backtracking factor 0.5, maximum 60 iterations in total over all penalty rounds, stop at scaled projected gradient ≤ `T_kkt` or relative decrease < 1e-10 over 5 iterations (`stalled`).
- **D4** Constraints: `c_j(x) ≤ 0` handled by penalty `μ·Σ max(0, c_j)²` with μ = 10, 100, 1000 in three outer rounds; after the rounds, **feasibility restoration**: if the final iterate violates any constraint by more than 1e-9, bisect on the segment toward the last feasible iterate (constraints are continuous) until every `c_j ≤ 1e-9`; `cost ≤ B` is a hard post-condition checked before any table entry is written, and a violating entry is a build failure, not a repair.
- **D5** Hessian: central second differences with the D1 steps; tolerance `δ_i = sqrt(2·tol_loss·f*/H_ii)` clipped to the box and to the distance to the nearest active bound; checked directly (H8).
- **D6** Robust objective is the 90th percentile of the scalar objective over the K = 32 draws, minimised by the same search warm-started at the nominal optimum.
- **D7** Scenario set `generic9` (plan 1 L9) by default; `indonesia` uses the 10 `typical`-bin days of plan 4 (5 sites × 2 seasons, equal weights) at the aged state with loss 0.20, which costs the same as `generic9` (10 vs 9 thermal runs per evaluation); both are settled, not open.
- **D8** `d_tio2_um` and `d_baso4_um` are treated as ingredient grades: they enter the models through the `mat` override of `evaluate` and are never edited in `materials.yaml`.
- **D10** Budget answers come from the table (exact step lookup); the browser has no solver, so there is no browser polish. `--polish` exists only in the CLI.
- **D11** Budget unit = `cost_proxy` (plan 3, relative); the table column `cost_unit` says `relative` now and `idr_per_m2` once vendor prices are loaded; changing the unit requires rebuilding the table (the manifest hash guards stale tables). Spike Q4 searches public Indonesian price pages for TiO2, BaSO4, GPTES, TEOS, MTES and acrylic binder; found prices are recorded with status `scenario` (indicative) and still need BLOCKED-11 mass conversion before they enter `materials.yaml`.
- **D12** Profiles: `cooling_first` weights (r_solar 0.4, t_max 0.4, corrosion 0.1, wetting 0.1), `balanced` (0.25 each), `durability_first` (r_solar 0.1, t_max 0.1, corrosion 0.4, wetting 0.4); the cost objective is replaced by the budget constraint in the table.
- **D13** The knee is the smallest tabulated budget whose profile scalar achieves 95 % of the improvement from `c_min` to `c_max`; reported as "recommended budget" with the marginal-return curve.
- **D9** Output ordering: weight id ascending, then start id ascending; every CSV is written with `toCsv` and validated like plan 3.

## File Structure
| Source | Test |
|---|---|
| `src/core/opt/vars.ts` (variables, scaling, constraints) | `tests/core/opt/vars.test.ts` |
| `src/core/opt/scalarize.ts` (normalisation, Chebyshev) | `tests/core/opt/scalarize.test.ts` |
| `src/core/opt/gradient.ts` (gradient, Hessian, step study) | `tests/core/opt/gradient.test.ts` |
| `src/core/opt/projectedBfgs.ts` | `tests/core/opt/projectedBfgs.test.ts` |
| `src/core/opt/tolerance.ts` | `tests/core/opt/tolerance.test.ts` |
| `src/core/opt/budgetTable.ts` (build, lookup, knee, repair) | `tests/core/opt/budgetTable.test.ts` |
| `src/web/budget.ts` (slider glue only) | covered by `tests/report.browser.test.ts` |
| `src/node/refine.ts` (multi-start, robust, outputs) | `tests/node/refine.test.ts` |
| `configs/optimize.yaml` | covered by `tests/node/refine.test.ts` |

Whitelisted extra tests (plan 1 layout guard): `tests/refine.e2e.test.ts`, `tests/refine.baseline.test.ts`, `tests/budget.baseline.test.ts`. `src/web/budget.ts` joins the layout-guard exclusion list with `src/web/main.ts`.

## Tasks

### Task 1: Spike: smoothness and step study
**Tests:** none (written answers). **Creates:** `docs/spike-refine.md`. **Interfaces:** none.
- [ ] Q1: for each of the nine variables at 20 random feasible points, tabulate the central-difference gradient of the five objectives for `h ∈ {1e-1 … 1e-8}` (scaled); choose `h_i` where the gradient plateaus, record the plateau width and the Richardson difference; report any variable whose gradient never plateaus (Mie ripple in `d_tio2_um`, for example). Q2: available TiO2 and BaSO4 grades (D8 ranges) from public technical data sheets, status `scenario` if none found. Q4: public Indonesian price pages for the six ingredients (D11), recording URL, date, unit and status `scenario` (indicative); if none is found the table stays in relative units and this is the written answer. Q3: confirm the plan-3 objective is continuous across the wetting `r_max`/`f_solid_min` switch and the delamination crack-exponent kink; if a kink exists, replace it by a C¹ smoothing recorded as a decision, not a TODO.
- [ ] If Q1 finds a non-plateau variable that cannot be smoothed, stop and report (exit-4 path); no fallback is built on a guess.
- [ ] Commit: `docs: spike answers for gradient step sizes and smoothness`
**Acceptance:** spike: Q1–Q4 answered in writing; later H/F ids are proved in Tasks 2–7.

### Task 2: Variables, scaling, scalarisation
**Tests:** `tests/core/opt/vars.test.ts`, `tests/core/opt/scalarize.test.ts`. **Creates:** `configs/optimize.yaml`, `src/core/opt/vars.ts`, `src/core/opt/scalarize.ts`.
**Interfaces:**
```ts
export const VARS: readonly { id: string; lo: number; hi: number; h: number }[]   // 9 entries, order fixed
export function toScaled(x: readonly number[]): Float64Array
export function fromScaled(u: Float64Array): number[]
export function constraints(x: readonly number[], cpvc: number, dftCap: number, delam: number): number[]   // c_j <= 0 feasible
export function chebyshev(g: readonly number[], w: readonly number[], rho?: number): number              // FR-2
export function normaliseObjectives(results: readonly ResultRow[]): { lo: number[]; hi: number[] }
```
- [ ] Edit `tests/layout.guard.test.ts` (plan 1 file): add `refine.e2e`, `refine.baseline`, `budget.baseline` to the whitelist and `src/web/budget.ts` to the exclusion list; test `guardAcceptsPlan5Files`.
- [ ] Tests first: `objectivesAreTheFivePlan3Names`, `scaledRoundTrip`, `configRejectsLoGreaterThanHi` (F2), `weightsMustSumToOne` (F1), `startOutsideBoxRejected` (F9), `chebyshevHandComputed`, `maximisedObjectivesFlipped`. Run, expect FAIL → implement → PASS.
- [ ] Commit: `feat(refine): ingredient variables, scaling and Chebyshev scalarisation`
**Acceptance:** F1, F2, F9.

### Task 3: Gradients and Hessians with oracle
**Tests:** `tests/core/opt/gradient.test.ts`, `tests/oracle.fixtures.test.ts` (new fixture). **Creates:** `src/core/opt/gradient.ts`. **Modifies:** `oracle/generate.py` (+ mpmath gradient fixture), `tests/fixtures/oracle/gradient.json`.
**Interfaces:**
```ts
export function gradient(f: (u: Float64Array) => number, u: Float64Array, h: readonly number[]): Float64Array   // central; one-sided at bounds
export function hessian(f: (u: Float64Array) => number, u: Float64Array, h: readonly number[]): Float64Array[]
export function richardsonCheck(f: (u: Float64Array) => number, u: Float64Array, h: readonly number[]): number[]   // relative differences per variable
```
- [ ] The fixture stores 4000 real model values on a stencil around 30 points (generated by the TypeScript model, written to JSON) and the mpmath 60-digit derivative of the interpolating function over that stencil as the reference; a second fixture holds 6 analytic benchmark functions with exact gradients. Tests: `gradientMatchesMpmathOracle` (H1), `richardsonAgreementWithinFrozenBound` (H1; freeze `T_grad_rel` from the first run), `linearThermalClosedForm` (H2), `oneSidedAtBound`, `hessianSymmetric`, `fastCheckQuadraticExact`. Run, expect FAIL → implement → PASS.
- [ ] Commit: `feat(refine): verified finite-difference gradients and Hessians`
**Acceptance:** H1, H2.

### Task 4: Optimiser
**Tests:** `tests/core/opt/projectedBfgs.test.ts`. **Creates:** `src/core/opt/projectedBfgs.ts`. **Modifies:** `oracle/generate.py` (scipy benchmark fixture).
**Interfaces:**
```ts
export type OptResult = { u: Float64Array; f: number; iters: number; kkt: number; status: "converged" | "max_iter" | "stalled" | "infeasible"; trace: number[] }
export function minimise(f: (u: Float64Array) => number, g: (u: Float64Array) => Float64Array, u0: Float64Array,
  cons: readonly ((u: Float64Array) => number)[], opts?: { maxIter?: number; kktTol?: number }): OptResult
```
- [ ] Tests first: `benchmarksReachKnownOptimum` (H3, 6 problems vs scipy L-BFGS-B/SLSQP outputs and known optima, `T_conv`), `traceIsMonotone` (H4, fast-check on random convex quadratics), `activeBoundsStayOnBound`, `penaltyEscalationKeepsFeasibility` (H6), `neverWorseThanStart` (FR-3), `saddleIsFlagged` (H7). Run, expect FAIL → implement → PASS.
- [ ] Commit: `feat(refine): projected BFGS with Armijo line search and penalties`
**Acceptance:** H3, H4, H6, H7.

### Task 5: Pipeline, robust optimum, tolerances
**Tests:** `tests/node/refine.test.ts`, `tests/core/opt/tolerance.test.ts`, `tests/refine.baseline.test.ts`. **Creates:** `src/core/opt/tolerance.ts`, `src/node/refine.ts`. **Modifies:** `src/node/cli.ts` (`refine --in --out [--scenarios] [--starts] [--time-limit-s] [--max-load]`).
**Interfaces:**
```ts
export function runRefine(ctx: ModelContext, shortlist: Record<string,string>, seed: number, dir: string, opts: RefineOpts): Promise<void>
export function toleranceTable(f: (u: Float64Array) => number, uStar: Float64Array, h: readonly number[], tolLoss: number): { id: string; tol_lo: number; tol_hi: number; loss_edge: number; clipped: boolean }[]
```
- [ ] Tests first: `beatsSobolBaselineAndScreening` (H5), `optimaSatisfyAllConstraints` (H6), `multiStartSpreadReported` (H7), `toleranceEdgesVerifiedByDirectEvaluation` (H8), `robustRegretNotWorseThanNominal` (H9), `sameCsvOneAndTwoWorkers` (H10), `infeasibleCpvcIsExit3` (F4), `nanRefractiveIndexIsExit4` (F5), `missingResultsIsExit5` (F7), `timeLimitIsExit6` (F8). Run, expect FAIL → implement (workers as plan 3, deterministic ordering D9) → PASS.
- [ ] Commit: `feat(refine): multi-start search, robust optimum and tolerance table`
**Acceptance:** H5–H10, F4, F5, F7, F8.

### Task 6: Budget table and lookup
**Tests:** `tests/core/opt/budgetTable.test.ts`, `tests/budget.baseline.test.ts`. **Creates:** `src/core/opt/budgetTable.ts`. **Modifies:** `src/node/refine.ts`, `src/node/cli.ts` (`budget-table`, `budget`), `configs/optimize.yaml` (profiles D12).
**Interfaces:**
```ts
export type BudgetEntry = { level: number; budget: number; cost: number; x: number[]; objectives: number[]; lo: number[]; hi: number[]; scalar: number; repaired: boolean }
export type BudgetTable = { profile: string; cost_unit: "relative" | "idr_per_m2"; c_min: number; c_max: number; knee_budget: number; entries: BudgetEntry[] }
export function buildBudgetTable(profile: string, solve: (budget: number, warm: Float64Array | null) => OptResult,
  evalEntry: (u: Float64Array) => Omit<BudgetEntry, "level" | "budget" | "repaired">, cMin: number, cMax: number, nLevels: number): BudgetTable
export function lookupBudget(t: BudgetTable, budget: number): { status: "ok"; entry: BudgetEntry; headroom: number } | { status: "infeasible"; c_min: number }
export function kneeBudget(entries: readonly BudgetEntry[]): number                       // D13
```
- [ ] Tests first: `lookupIsLargestBudgetNotAbove` and `lookupNeverExceedsBudget` (H14, fast-check against a brute-force scan), `belowCMinIsInfeasible` (F10), `tableMonotoneAfterRepair` and `repairCountCapped` (H15), `budgetIsSpentWhenBinding` (H16), `kneeHandComputed` (D13 on a synthetic convex curve), `beatsSobolAndScreenedUnderBudget` (H13, real model, 10 budgets × 3 profiles), `polishNeverLoses` (H17), `tamperedTableIsExit5` (F12), `budgetTimeLimitIsExit6` (F13), `negativeBudgetIsExit2` (F11). Run, expect FAIL → implement (cMin by minimising cost under the constraints with the Task-4 solver; continuation upward; 3 profiles on 2 workers; deterministic ordering) → PASS.
- [ ] Append BLOCKED-11 (mass-based recipes and currency prices: needs sourced densities and binder solids) to `docs/BLOCKED.md` with reason, owner (Evint) and unblock condition, and test `blockedRegisterHasElevenEntries`.
- [ ] Commit: `feat(refine): precomputed budget frontier tables with exact lookup`
**Acceptance:** H13–H17, F10–F13.

### Task 7: Report, end-to-end, mutation checks, proof log
**Tests:** `tests/refine.e2e.test.ts`, `tests/report.browser.test.ts` (Optimisation section), `tests/honesty.test.ts` (PROXY wording extended). **Creates:** `src/web/budget.ts`. **Modifies:** `src/web/figures.ts` (refined vs screened front, recipe cards with tolerance bars and elasticities, the performance–price frontier curve with the knee marked, budget slider card with profile selector), `src/node/report.ts` (embeds the three tables as JSON through `safeJson`; no extra network).
- [ ] Tests first: `optimisationNumbersEqualCsv` (H12), `labelsOptimumAsModelOptimum` (FR-8), `e2eUnderBudget` (H11; all subprocess tests pass `--max-load 1000`), `budgetSliderEqualsTable` (H18), `faultMatrixF1toF13`. Run, expect FAIL → implement → PASS → full suite, lint, typecheck green.
- [ ] Mutation checks (commit first, copy to the scratchpad, never checkout after a mutation): M1 flip the sign of one gradient component → H3/H4 must fail; M2 drop the penalty → H6 must fail; M3 compute the tolerance without the Hessian factor 2 → H8 must fail; M4 make `lookupBudget` return the smallest budget ≥ B → H14 must fail; M5 skip the monotone repair → H15 must fail.
- [ ] Write `docs/proof-log-refine.md` with run ids; commit: `test(refine): end-to-end, fault matrix, mutation checks and proof log`
**Acceptance:** H11, H12, H18, F1–F13 (the fault-matrix test covers all; F10–F13 are individually proved in Task 6).

## Rollout and rollback
Separate subcommand, no flag; plan-3 outputs are untouched when `refine` is not run. Rollback: `git revert` the commit range. Hand-off outside the repo: none. The lab recipe sheet lists volume-based levels only; mass conversion needs sourced densities and binder solids (BLOCKED-11, owner Evint, unblock condition: a datasheet density for each ingredient).

## Part 2: Test specification
```ts
// tests/core/opt/projectedBfgs.test.ts
test("benchmarksReachKnownOptimum", () => {
  for (const b of loadFixture<Bench[]>("benchmarks")) {
    const r = minimise(b.f, b.g, b.u0, b.cons)
    expect(dist(r.u, b.uStar)).toBeLessThan(1e-6)   // T_conv
  }
})
test("traceIsMonotone", () => fc.assert(fc.property(convexQuadratic(), (q) => isNonIncreasing(minimise(q.f, q.g, q.u0, []).trace))))
// tests/core/opt/gradient.test.ts
test("gradientMatchesMpmathOracle", () => {
  for (const c of loadFixture<GradCase[]>("gradient")) {
    const g = gradient(c.f, c.u, VARS.map(v => v.h))
    for (let i = 0; i < 9; i++) expect(Math.abs(g[i]! - c.ref[i]!) / Math.max(Math.abs(c.ref[i]!), 1e-12)).toBeLessThan(T_GRAD_REL)
  }
})
// tests/refine.baseline.test.ts
test("beatsSobolBaselineAndScreening", async () => {
  const best = await bestOfRefine(dir)
  expect(best).toBeLessThanOrEqual(Math.min(bestOfScreened(dir), bestOfSobol(4096, seed)) + 1e-9)
})
// tests/core/opt/budgetTable.test.ts
test("lookupNeverExceedsBudget", () => fc.assert(fc.property(fc.double({ min: 0, max: 1.1 * table.c_max, noNaN: true }), (b) => {
  const r = lookupBudget(table, b)
  if (r.status === "ok") { expect(r.entry.cost).toBeLessThanOrEqual(b + 1e-12); expect(r.entry).toBe(bruteForceLargestNotAbove(table, b)) }
  else expect(b).toBeLessThan(table.c_min)
})))
test("tableMonotoneAfterRepair", () => {
  for (const t of tables) for (let k = 1; k < t.entries.length; k++) expect(t.entries[k]!.scalar).toBeLessThanOrEqual(t.entries[k - 1]!.scalar + 1e-12)
  expect(t.entries.filter(e => e.repaired).length / t.entries.length).toBeLessThanOrEqual(0.05)   // T_repair
})
// tests/core/opt/tolerance.test.ts
test("toleranceEdgesVerifiedByDirectEvaluation", () => {
  let confirmed = 0
  for (const row of toleranceTable(f, uStar, h, 0.01)) {
    for (const edge of [row.tol_lo, row.tol_hi]) expect(Math.abs(directLoss(f, uStar, row.id, edge) - 0.01)).toBeLessThanOrEqual(1e-6)
    if (!row.clipped && directLoss(f, uStar, row.id, row.tol_hi * 1.5) > 0.01) confirmed++
  }
  expect(confirmed).toBeGreaterThanOrEqual(7)
})
```
