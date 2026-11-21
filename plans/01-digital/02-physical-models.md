# Physical Models Implementation Plan (Plan 2 of 6 (0–5), Bun + TypeScript)

Part 1 is the plan; Part 2 is the test specification. Depends on plan 1 (`01-foundation-and-doe.md`) being done. Plan 3 and the live simulator (plan 0) consume the interfaces defined here. Every model lives in `src/core/models/` and runs unchanged in Bun and in the browser.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** 📋 PLANNED (rewritten 2026-11-21 for Bun + TypeScript)

**Goal:** Implement the six blueprint §4.2 modules (sol-gel kinetics, midcoat optics, roof heat balance, topcoat wetting, barrier, interface) as pure, independently proven TypeScript functions with sourced constants, so plan 3 can assemble and optimise them and plan 0 can run them live in the browser.

**Architecture:** Each model is a pure function module that takes plain numbers/typed arrays plus a parsed `Materials` object and returns numbers/typed arrays. Physics that is exact (energy balance, Mie, Kubelka–Munk, Flory–Stockmayer, Cassie/Wenzel, first-order kinetics) is checked two ways: against closed-form limits and against **fixtures produced by independent Python libraries** (scipy DOP853 ODE solutions, miepython Mie efficiencies). Everything that is not first-principles is a named PROXY whose constants are labelled `scenario`.

**Tech Stack:** as plan 1 (Bun 1.3.14, TypeScript 7.0.2, zod 4.6.7, yaml 2.9.1, fast-check 4.10.3). Oracle (test-only): scipy 1.18.1, miepython 3.3.1, numpy 2.5.5. Versions verified 2026-11-21.

**Spec:** `Blueprint_Riset_Spandek_3_Fungsi.md` §3.4, §4.1–4.3, §6.4. Constants D3–D5 from plan 1.

## What the operator does

1. `bun run spandek fetch-data` — once, needs network, ≤ 1 min; downloads the three literature datasets and writes `data/literature/SHA256SUMS`.
2. `bun run spandek verify-data` — offline, ≤ 1 s; exit 0 or 5.
3. Nothing else: the models are libraries, exercised by plan 3, plan 0 and `bun test`.

## Logging and debugging

Same schema, level rule, size cap and redaction as plan 1 (JSON lines, `SPANDEK_LOG_LEVEL`, ids and numbers only). Core code emits through `core/events.ts` (a pure sink set by the host: Bun logs to stderr/file, the browser keeps a ring buffer for the "debug" panel).

| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `data.fetched` | info | node/dataFetch | name, bytes, sha256 | 3/run |
| `data.verified` | info | node/data | name, sha256 | 3/run |
| `data.mismatch` | error | node/data | name, expected_sha256, actual_sha256 | 0–1 |
| `model.out_of_range` | error | models/ranges | model, quantity, value, lo, hi | 0–1 |
| `model.degenerate` | warn | models/* | model, reason (e.g. `gel_not_reached`) | ≤ per-candidate |
| `mie.cache_stats` | debug | optics | hits, misses | 1/batch |
| `thermal.solved` | debug | thermal | scenario_id, t_max_c, n_steps | per evaluation |

Production runs at info: a failure is diagnosable from `data.mismatch` or `model.out_of_range` (names the model and the quantity). Dev runs at debug add the per-evaluation lines. Runbook: exit 5 → rerun `fetch-data`, then compare `SHA256SUMS` to git; exit 4 → the named model got an input outside its physical range, check the config constant named in the event. A test per event is in Part 2.

## Scope

In: data acquisition and integrity, `materials.yaml`, six models, range guard, Python oracle fixtures for Mie/thermal/sol-gel, cross-model sanity tests. Out: assembling layers, uncertainty, optimisation, reports (plan 3); the live UI (plan 0). By-design limits (in `docs/BLOCKED.md`): **BLOCKED-1** lab calibration; **BLOCKED-2** two-node thermal model (no layer conductivities; single node is the blueprint MVP, §4.3); **BLOCKED-3** polydisperse PSD (monodisperse diameters are scenario inputs).

### Stack and versions

| Item | Pinned value |
|---|---|
| Runtime and libs | exactly as plan 1 "Stack and versions" |
| Optics convention | public API takes `(n, k)` with `k ≥ 0`; no complex sign is exposed. Internally Bohren–Huffman uses `m = n + ik` (miepython's own documented convention is `n − ik`, and it silently conjugates a wrong sign — measured; our API makes the mistake unrepresentable). |
| Spectrum | ASTM G173-03 AM1.5 global tilt, 280–4000 nm; optics grid 300–2500 nm at 10 nm (221 points), last value held out to 4000 nm |
| Thermal integrator | RK4, dt = 60 s; `dtS` must divide 600 (the output grid), which also puts the irradiance kinks (hours 6, 18, 30, 42) on step boundaries; 48 h, day 2 reported |
| Kinetics | closed-form first-order hydrolysis and condensation integral (no ODE solver) |
| Data files | `data/literature/{astm_g173.csv, tio2_rutile_nk.csv, baso4_nk.csv}` + `SOURCES.md` + `SHA256SUMS` |
| Oracle fixtures | `tests/fixtures/oracle/{mie,thermal,solgel}.json` + `SHA256SUMS` (frozen once, regenerated only by `oracle/generate.py`) |

**Measured on this machine (2026-11-21, Bun 1.3.14 / Node 22 V8, one process; thermal time constants τ = C/(h + 1/R) span 39–224 s over the planned parameter ranges):** Mie for 2 pigments × 221 wavelengths ≈ 0.5 ms (Bun) · 48 h RK4 thermal case ≈ 0.53 ms (Bun), 1.5 ms (V8) · TypeScript thermal max vs scipy DOP853 reference: 36.318245 vs 36.318250 °C (5e-6 K) · TypeScript Mie vs miepython: equal to 8 digits at 5 wavelengths (absorbing sphere), Rayleigh error 7.06e-6.

**Gaps this plan closes:** blueprint §4.2 rows 1–6, §4.3 energy balance, §6.4 unit/sanity/model-checking gates.

## Alternatives considered

| Option | Verdict |
|---|---|
| Full radiative transfer instead of two-flux KM | Rejected for MVP: blueprint allows Kubelka–Munk; two-flux is closed-form and testable. |
| Full Fickian PDE for the barrier | Rejected: no diffusivity data; a Bruggeman effective-diffusion proxy is honest about that. |
| LSODA/ODE solver ports for sol-gel | Rejected: the two kinetic equations integrate in closed form; a closed form plus bisection is exact, faster and has an oracle check. |
| Calling Python (miepython/scipy) at runtime | Rejected: breaks the live-in-browser requirement; Python is test-only. |
| Mocks for Mie/thermal | Rejected: the Python oracle is real, independent, and already agrees to 8 digits (Mie) and 5e-6 K (thermal) in the spike. |

## Risks (each pinned by a test)

| Risk | Test |
|---|---|
| Wrong Mie convention (`n+ik` vs `n−ik`) silently gives a different answer | T-MIE-5 (API takes `k ≥ 0`, rejects `k < 0` with code 4; absorbing-sphere values match the miepython fixture) |
| Downward-recurrence start too short for large `x` (measured with a +16 margin: 5.9e-5 relative error at x = 100, m = 3) | T-MIE-1 (the fixture grid includes x ≈ 105) |
| `gel_time_rel` silently independent of water ratio in the blueprint range (hydrolysis cap `min(1, r_w)` = 1 for r_w ≥ 1) | T-SOL-9 documents it; the water ratio is not a sensitivity or live variable |
| KM S/K mapping wrong by a constant factor | T-OPT-6 (spike Q1 answer pinned as a numeric test) |
| Spectrum weighting normalised over the wrong range | T-OPT-8 |
| Barrier "optimum" read as physical evidence | T-BAR-5 asserts outputs are tagged `proxy: true` |
| Sol-gel never gels inside the time window → NaN | T-SOL-5 (returns `Infinity` + `model.degenerate`) |
| Thermal integrator wrong at the irradiance kink (a plain adaptive solver was off by 5.17 K in the research spike; a t_max-only fixture cannot catch a missed kink, so the 20 full day-2 series are compared too) | T-THM-9 (fixture from a segmented DOP853 at rtol 1e-11) and T-THM-11 (dt not dividing 600 is rejected) |
| Silent clipping hides bad inputs | T-RGN-1..3 |
| Browser/engine differences in `Math.exp`/`Math.pow` | all oracle tolerances are ≥ 100× the measured engine difference; T-X-5 runs the model suite under Node as well |

## Requirements

FR-1 `verifyData` MUST fail with `DataError` (code 5) on any hash mismatch. FR-2 `thermal` MUST satisfy `α = 1 − R` and the energy balance of blueprint §4.3. FR-3 `optics` MUST integrate over ASTM G173 and MUST return R ∈ [0, 1]. FR-4 `solGel` MUST expose the weight-average functionality `f_w = Σf²N/ΣfN` and the Flory–Stockmayer gel-point conversion `p_c = 1/(f_w − 1)`. FR-5 `wetting` MUST implement Young, Wenzel, Cassie–Baxter. FR-6 `barrier` and `delamination` MUST return indices in [0, 1] and be named PROXY in doc comments and in the output tag. FR-7 Every model MUST throw `PhysicsRangeError` (code 4) on inputs outside its stated domain. FR-8 All of `src/core/models/**` MUST obey FR-7 of plan 1 (pure) and build for the browser. NFR-1 One midcoat optics evaluation (2 pigments, 221 wavelengths) ≤ `T_eval_ms` = 5 ms; one 48 h thermal case ≤ `T_thermal_ms` = 3 ms (both on Bun and Node). NFR-2 No model imports another model except `optics` → `mie`; the only shared imports are `models/ranges.ts` and `models/shared.ts`.

## Acceptance: hypotheses and proofs

| ID | Falsifiable hypothesis | Experiment / deciding observable | Falsified if |
|---|---|---|---|
| H1 | The integrator reproduces the exact linear case | ε = 0, constant G = 1000 W/m², dt = 5 s, over the worst-case corner (C = 1500, h = 28.5, R = 0.1, α = 0.9, T0 = T_air): compare `simulateDay` with `T_ss + (T0−T_ss)·exp(−t/τ)`; error relative to the absolute temperature in K | rel. err > `T_thm_rtol` = 5e-7 (measured 6.1e-8) |
| H2 | Steady state satisfies the balance | residual of `netFluxWM2` at `steadyStateTempK` | \|residual\| > 1e-6 W/m² |
| H3 | Higher reflectance always cools | sweep R 0.3→0.9 for all 9 scenarios (real thermal model) | any `t_max` non-decreasing in R |
| H4 | Mie matches an independent implementation | fixture grid (n, k, d, λ, n_medium) from miepython incl. absorbing cases, x up to ≈ 105 and `g`; plus Rayleigh limit x = 0.01 | `q_ext`, `q_sca` relative error > 1e-8; `q_abs` absolute error > 1e-8·`q_ext` + 1e-12; `g` absolute error > 1e-7; for π·d·√(n²+k²)/λ < 0.1 (that is \|m\|x with m = (n+ik)/n_medium and x = π·d·n_medium/λ; where miepython switches to a low-x series, measured error up to 5.5e-8 absolute; Task 4 confirms the switch condition in its source) `q_ext` relative > 1e-6 and `q_abs` absolute > 1e-6·`q_ext` + 1e-12 (Task 4 confirmed miepython switches to the small-sphere series exactly when `m.real > 0 and |m|·x < 0.1`; the series error leaks into `q_abs = q_ext − q_sca` of the fixture, and a 40-digit mpmath Mie shows the TypeScript is the exact side to 1e-14); the Mie guard also requires x ≥ 1e-3 because `g` is lost to cancellation below it; or Rayleigh > 1 % |
| H5 | KM matches closed forms | thick limit `R∞ = 1 + K/S − √((K/S)²+2K/S)`; thin limit R(X→0) = R_g | err > 1e-9 |
| H6 | Solar weighting is correct | flat R = c returns c; G173 integral = 1000.37 W/m² | \|err\| > 1.0 W/m² or R ≠ c by > 1e-9 |
| H7 | Flory–Stockmayer values | x = 0.5 (50 mol % f=3, 50 mol % f=4) → `f_w = 25/7`, `p_c = 7/18`; x = 0 → 1/3; x = 1 → 1/2 | mismatch > 1e-12 |
| H8 | Closed-form kinetics equal numerical integration | 20 random (k_h, k_c, r_w) cases vs scipy `solve_ivp` fixture; `h`, `c`, gel time | rel. err > 1e-6 |
| H9 | Wetting limits | r = 1 → θ_Y; f = 1 → θ_Y; f = 0 → 180° exactly | mismatch > 1e-9° |
| H10 | Proxies are bounded and directional | grid over the plan-1 ranges: all in [0,1]; perm index ↑ in x_GPTES; crack ↑ in DFT | any violation |
| H11 | Guard rejects bad inputs | F-matrix below | wrong error/code or silent output |
| H12 | Data integrity gate works | tamper one byte | `verifyData` passes |
| H13 | Thermal integrator equals an independent solver | 200 random cases vs scipy fixture (day-2 `t_max_c` and `q_in_mean_w_m2`; 20 with the full 144-point day-2 series) | `t_max_c` difference > `T_rk4_k` = 1e-4 K, `q_in_mean_w_m2` difference > `T_q_w_m2` = 1e-3 W/m² (a mean error of 3e-5 K over `R_total` ≥ 0.1 gives 3e-4 W/m²), or any series point > `T_rk4_series_k` = 3e-4 K (measured: `t_max` ≤ 3.4e-5 K, worst series point 1.12e-4 K) |

Named thresholds: `T_rk4_k = 1e-4`, `T_rk4_series_k = 3e-4`, `T_q_w_m2 = 1e-3`, `T_thm_rtol = 5e-7`, `T_mie_rel = 1e-8`, `T_mie_abs = 1e-8`, `T_mie_g_abs = 1e-7`, `T_g173_w_m2 = 1000.37 ± 1.0`, `T_eval_ms = 5`, `T_thermal_ms = 3`.

**Fault-injection matrix** (edit exactly one input; expect named phase, status, code):

| ID | Single edit | Phase | Exit/exception |
|---|---|---|---|
| F1 | flip one byte in `astm_g173.csv` | data | `verify-data` exit 5 |
| F2 | `tio2.diameter_um` = −0.2 in `materials.yaml` | config | exit 2 |
| F3 | a negative `k` row in `baso4_nk.csv` (hash updated) | data | `DataError` 5 |
| F4 | `roof.r_total_m2k_w` = 0 in `weather_scenarios.yaml` (plan 1 validates > 0; run via `design`) | config | exit 2 |
| F5 | PVC 1.3 passed to `midcoatSpectrum` | model | `PhysicsRangeError` 4 |
| F6 | `waterRatio` = 0 passed to `gelTimeRel` | model | `PhysicsRangeError` 4 |
| F7 | remove `SHA256SUMS` | data | `verify-data` exit 5 |
| F8 | `k` = −0.01 passed to `mieEfficiencies` | model | `PhysicsRangeError` 4 |
| F9 | `dtS` = 70 (does not divide 600) passed to `simulateDay` | model | `PhysicsRangeError` 4 |

Principle: H1, H5, H7, H9 use closed forms derived independently of the implementation; H4, H8, H13 use fixtures from other libraries in another language; H3 runs the real models end to end, so a shared bug in two models cannot hide.

## Execution contract: one shot, nothing left open

**Preflight gate** (print and stop if missing): (1) plan 1 is done and green; (2) Evint approves network access for `fetch-data` to the public sources recorded by spike Q4; (3) the substrate scenario is **bare aluminium roofing sheet** (user decision 2026-11-21; no steel or Zn–Al); (4) `uv` available for oracle regeneration.

No stub/TODO/skip/xfail. Spikes Q1–Q4 end in written answers in `docs/spikes/plan-02.md` that fix constants, with citations; a constant with no citable source gets `status: scenario` and a one-line reason, never a silent guess. Thresholds frozen once from the first real run: none (all thresholds above were set from the spike measurements). Done = H1–H13 proven with run ids in `docs/proofs/plan-02.md`, `bun run check` green. If a task fails: stop, leave tree clean, report the failing proof with its log. Out of scope: merge, push, plans 0 and 3.

## Global Constraints

Inherited from plan 1 (pure core, SI-named fields, no mocks, sourced constants, explicit seeds, `safeJson`). Plus: wavelengths in µm everywhere; angles in degrees only at the wetting API boundary; arrays are `Float64Array`; every PROXY function's doc comment starts with `PROXY:`; no model imports another (NFR-2).

## Review Focus

1. PVC = 0 or TiO2 fraction = 0 or 1 → finite R (pure binder / single pigment), not NaN.
2. DFT at the exact range edges (100 and 300 µm) → valid, no off-by-one in the guard.
3. TiO2 fraction 0 with a missing BaSO4 `k` column → clear `DataError`, not `undefined`.
4. Thermal solve with `G = 0` and all temperatures equal → stays constant (no drift).
5. MTES fraction exactly 0.2 / 0.8 and pH exactly 3.5 / 5.0 → accepted; 3.49 → code 4.

## Decisions (all settled)

- **D1** Thermal: single node, `C_A = c_substrate + Σ ρc·DFT` (plan 1 D5); `T_sky` from plan 1; `G(t) = G_peak·max(0, sin(π(t−6h)/12h))`; start `T0 = T_air`; 48 h simulated, day 2 reported (periodic regime); outputs `t_max_c`, `q_in_mean_w_m2 = mean((T_s − T_inside)/R_total)`, and the day-2 series every 600 s. Integrator: RK4 with dt = 60 s (`dtS` must divide 600). The fixture generator passes `t_sky_k` as an explicit parameter computed with the same Swinbank form as plan 1.
- **D2** Optics: Mie for each pigment, independent scattering, `σ_s = 1.5·φ·Q_sca/d`, `σ_a = 1.5·φ·Q_abs/d`; two-flux KM with `K = 2σ_a` and `S = ¾(1−g)σ_s − σ_a/4` (Eddington/diffusion closure, accurate for opaque films; spike Q1 + its adversarial check, ruling R1 in the ledger; the thin-film alternative `S = (1−g)σ_s` (hemispheric closure, equal to `2Bσ_s` for Henyey–Greenstein) is selectable through `closure: "eddington" | "hemispheric"` and pinned by tests: σ_s = 1, σ_a = 0, g = 0 gives S = 0.75 or 1; σ_s = 5, σ_a = 0.1, g = 0.5 gives K = 0.2 and S = 1.85 (Eddington); σ_s = 1, σ_a = 0.01, g = 0 gives R∞ = 0.7939 against exact transport 0.7955); layer on a flat-spectrum ground `r_ground = substrate.r_solar`. Known limits, repeated in every card: independent scattering ignores dependent scattering at PVC up to 0.35; the binder has no NIR absorption and R is held constant outside 300–2500 nm, so R_solar is biased high.
- **D3** Topcoat optics: Beer–Lambert, `R_eff(λ) = R_mid(λ)·exp(−2·μ·DFT)` (two passes), μ constant scenario.
- **D4** Sol-gel: acid-catalysed hydrolysis `k_h = k_H·10^(−pH)`, `h(t) = min(1 − e^(−k_h t), h_cap)` with `h_cap = min(1, r_w)`; condensation `c(t) = 1 − exp(−k_c·I(t))` with `I(t) = ∫₀ᵗ h`, in closed form (`I = t − (1−e^(−k_h t))/k_h` before the cap, `I(t*) + h_cap·(t−t*)` after, `t* = −ln(1−h_cap)/k_h` when `h_cap < 1`; implemented with `expm1` because `t − (1−e^(−kt))/k` loses ≈ 3e-5 relative accuracy at kt = 1e-6); bond conversion `p = c·h`; gel when `p ≥ p_c`; gel time by bisection on `[0, t_end_s]`; outputs are **relative** to the reference condition `ref` (plan 3: range midpoints pH 4.25, r_w 3.0, x = 0.5). Flory–Stockmayer for a monomer mixture needs the weight-average `f_w`, not the number average. **Known limits (repeated in every card):** (i) in the blueprint range r_w ∈ [1, 5] the hydrolysis cap is 1, so `gel_time_rel` does **not** depend on the water ratio (the cap branch only acts below stoichiometry and ignores water released by condensation); (ii) `k_c` is pH-independent, so the trend of gel time with pH comes only from `k_h` and may be wrong in direction for real silica sols; `gel_time_rel` is a relative PROXY, not a pot-life prediction.
- **D5** Barrier PROXY: `ρ_net = 1 − x_GPTES`; `ε = ε_lo + (ε_hi − ε_lo)·x_GPTES`; `D_eff = ε^1.5` (Bruggeman, normalised); `t_ing = L²/(6·D_eff)`; `perm = 1/(1 + t_ing/t_ref)`; `h_c = h_c0·ρ_net^(−p)`; `crack = 1 − exp(−(L/h_c)²)`; `corrosion_risk = 1 − (1−perm)(1−crack)`. This **encodes** blueprint H1's shape by assumption; it is not evidence for it.
- **D6** Wetting: `θ_Y(y) = θ_silica + (θ_mtes − θ_silica)·y`; nominal = Young (smooth film); interval from corners `r ∈ [1, r_max]`, `f ∈ [f_min, 1]`; `wetting_score = clip((θ − 90°)/60°, 0, 1)` (higher = more hydrophobic; opposite sense to the risk indices).
- **D7** Delamination PROXY: `delam = 1 − (1 − y²)(1 − crack_top)`, where `crack_top` uses `h_c0_top` and `ρ_net_top = 1 − y`. Module name `delamination.ts` (`interface` is a reserved word in TypeScript).
- **D8** Nothing here reads files: `core/literature.ts` parses CSV text; `node/data.ts` reads and verifies files.
- **D9** Domain table (each violation is a `ConfigError` at load, so F2/F6 of plans 2–3 work; the model guards use the same limits): pigment diameters `0 < d ≤ 50 µm`; `binder.n ≥ 1`; `substrate.r_solar ∈ [0, 1]`; emissivities `∈ (0, 1]`; `topcoat.mu_per_um ≥ 0`; `wetting.theta_* ∈ [0, 180]`; `wetting.r_max ≥ 1`; `wetting.f_solid_min ∈ (0, 1]`; `barrier.eps_lo, eps_hi ∈ (0, 1)` with `eps_lo < eps_hi`; `h_c0_*_um > 0`; `crack_exponent > 0`; `t_ref_rel > 0`; `sol_gel.k_h, k_c, t_end_s > 0`; `cost.rc_* ≥ 0`; `baseline_corrosion_risk ∈ [0, 1]`; `unc.*_rel ≥ 0`, `unc.substrate_r_abs ≥ 0`, `unc.theta_deg ≥ 0`. Layer domains enforced by the models: primer DFT 2–12 µm, midcoat 100–300 µm, topcoat 3–20 µm (blueprint §3.3), pH 3.5–5.0, water ratio 1–5, GPTES/MTES fraction 0.2–0.8 (guards use the plan-1 ranges; the models are never called outside them).
- **D10** Spike Q1 decision rule: the D2 mapping stands unless the spike finds a source that contradicts it; then the plan is amended **before** Task 5 starts (the pinned numeric test in Task 5 is the check). This is a settled rule, not an open item.
- **D11** Rollout and rollback: local library, no flag; rollback = `git revert` of the commit range; no hand-offs outside the repo.

## File Structure

| Source | Test |
|---|---|
| `src/core/events.ts` (sink; added in plan 1 Task 2) | `tests/core/events.test.ts` |
| `src/core/literature.ts` (`parseG173`, `parseNk`, `nkAt`) | `tests/core/literature.test.ts` |
| `src/node/data.ts` (`verifyData`, hashing) | `tests/node/data.test.ts` |
| `src/node/dataFetch.ts` | `tests/node/dataFetch.test.ts` |
| `src/core/models/ranges.ts` | `tests/core/models/ranges.test.ts` |
| `src/core/models/shared.ts` | `tests/core/models/shared.test.ts` |
| `src/core/models/thermal.ts` | `tests/core/models/thermal.test.ts` |
| `src/core/models/mie.ts` | `tests/core/models/mie.test.ts` |
| `src/core/models/optics.ts` | `tests/core/models/optics.test.ts` |
| `src/core/models/solGel.ts` | `tests/core/models/solGel.test.ts` |
| `src/core/models/barrier.ts` | `tests/core/models/barrier.test.ts` |
| `src/core/models/wetting.ts` | `tests/core/models/wetting.test.ts` |
| `src/core/models/delamination.ts` | `tests/core/models/delamination.test.ts` |
| `configs/materials.yaml` (+ `MaterialsSchema` in `core/config.ts`) | `tests/core/config.test.ts` (extended) |
| `oracle/generate.py` (extended) | `tests/oracle.fixtures.test.ts` (extended) |
| cross-model | `tests/crossModel.test.ts` — the only test allowed to import several models |

## Tasks

### Task 1: Spikes Q1–Q4, data acquisition, `materials.yaml`

**Tests:** `tests/core/literature.test.ts`, `tests/node/data.test.ts`, `tests/node/dataFetch.test.ts`, `tests/core/config.test.ts`. **Creates:** `src/core/literature.ts`, `src/node/data.ts`, `src/node/dataFetch.ts`, `configs/materials.yaml`, `docs/spikes/plan-02.md`, `data/literature/*`. **Modifies:** `src/core/config.ts` (+`MaterialsSchema`), `src/node/config.ts` (+`loadMaterials`), `src/node/cli.ts` (+`fetch-data`, `verify-data`).
**Interfaces:**
```ts
export type Spectrum = { wl_um: Float64Array; irradiance_w_m2_um: Float64Array }
export type NKTable = { wl_um: Float64Array; n: Float64Array; k: Float64Array }
export function parseG173(csv: string): Spectrum; export function parseNk(csv: string): NKTable   // validate k >= 0, n > 0, strictly increasing wl; DataError otherwise
export function nkAt(t: NKTable, wl_um: Float64Array): { n: Float64Array; k: Float64Array }      // linear interpolation, clamps outside the table
export function verifyData(dir: string): Promise<void>        // DataError(5) on mismatch / missing SHA256SUMS; emits data.verified / data.mismatch
export function fetchTo(url: string, dest: string): Promise<string>   // returns sha256; emits data.fetched
export const MaterialsSchema: z.ZodObject                    // every field Sourced; strict
export type Materials = z.infer<typeof MaterialsSchema>
```
Spikes (run with `researcher` agents on sonnet; each answer is then attacked by an `adversarial-reviewer` that must fail to refute it):
- **Q1** Mie→KM mapping (`S`, `K`) with two independent literature sources. **Q2** Values + citations for every key of `materials.yaml` (listed in the test `materialsKeysExact`): `tio2.diameter_um, baso4.diameter_um, binder.n, substrate.r_solar, substrate.emissivity (bare mill-finish aluminium sheet; searches found no citable CRRC/ASTM value for mill-finish aluminium, so Q2 first looks in the CRRC directory; BLOCKED-8 already exists (plan 1 Task 1), and Q2 updates its unblock condition if a citable value is found, otherwise the value stays a `scenario` to be measured on a blank coupon with the lab reflectometer and emissometer; bare Galvalume values from manufacturer sheets (0.58–0.78 solar reflectance, 0.06–0.08 emittance) must NOT be used for it), substrate.c_j_m2k (ρ·c_p·thickness), coating.emissivity, topcoat.mu_per_um, wetting.{theta_silica_deg,theta_mtes_deg,theta_binder_deg,r_max,f_solid_min}, barrier.{eps_lo,eps_hi,h_c0_primer_um,h_c0_top_um,crack_exponent,t_ref_rel}, sol_gel.{k_h,k_c,t_end_s}, cost.{rc_primer,rc_mid,rc_top}, baseline_corrosion_risk, unc.{diameter_rel,n_rel,mu_rel,eps_rel,h_c0_rel,substrate_r_abs,theta_deg}` (cost and `unc.*` are `scenario` status, used by plan 3). Corrosion note: the corrosion proxy models pitting/crevice attack of aluminium under chloride (barrier plus GPTES primer adhesion through Al–O–Si bonds), not zinc loss; the literature found covers AA2024/AA6xxx and none was found for AA3003, so the proxy stays a relative index. **Q3** Order-of-magnitude acid-catalysed hydrolysis/condensation constants for TEOS/GPTES. **Q4** Public URLs, licences and file formats for ASTM G173, rutile TiO2 n,k, BaSO4 n,k; if no tabulated BaSO4 k exists, use constant n with k = 0, `status: scenario`, and say so.

- [ ] Run the spikes; write answers Q1–Q4 into `docs/spikes/plan-02.md`; put each constant into `materials.yaml` with `source` and `status`.
- [ ] Tests: `dataFetchedEvent` (a real local HTTP server on an ephemeral port serves a file; `fetchTo` emits `data.fetched` with the right sha256 — no mock), `verifyOk`, `tamperedByteExit5` (F1/H12, a real copy of the file), `missingSumsExit5` (F7), `negativeKIsDataError` (F3), `nkAtInterpolatesAndClamps`, `g173IntegralIs1000p37` (H6 part), `materialsKeysExact`, `negativeDiameterConfigError` (F2). Run → FAIL.
- [ ] Implement the modules and the two CLI subcommands; run `bun run spandek fetch-data`, then commit `SHA256SUMS` (frozen once, never edited). Run tests → PASS.
- [ ] Commit: `feat: literature data with hash gate and materials.yaml with provenance`

**Acceptance:** H6 (G173 part), H12; F1, F2, F3, F7.

### Task 2: Range guard and shared helper

**Tests:** `tests/core/models/ranges.test.ts`, `tests/core/models/shared.test.ts`. **Creates:** `src/core/models/ranges.ts`, `src/core/models/shared.ts`.
**Interfaces:**
```ts
export function requireIn(model: string, quantity: string, value: number, lo: number, hi: number): number   // inclusive edges; else emit model.out_of_range and throw PhysicsRangeError
export function requireArrayIn(model: string, quantity: string, a: Float64Array, lo: number, hi: number): Float64Array
export function crackIndex(rhoNet: number, dftUm: number, hC0Um: number, exponent: number): number         // h_c = h_c0·ρ_net^(−p); 1 − exp(−(L/h_c)²); used by barrier and delamination
```
- [ ] Tests: `edgesInclusive` (Review Focus 2/5), `outsideThrowsCode4PhaseModel`, `eventEmittedWithFields`, `nanRejected`, `crackIndexLimits` (DFT → 0 gives 0; `L = h_c` gives `1 − e^(−1)`; monotone in DFT; fast-check). Run → FAIL. Implement. Run → PASS.
- [ ] Commit: `feat: physical-range guard and shared crack index`

**Acceptance:** H11, F5/F6 mechanism.

### Task 3: Thermal model and oracle fixture

**Tests:** `tests/core/models/thermal.test.ts`, `tests/oracle.fixtures.test.ts`. **Creates:** `src/core/models/thermal.ts`. **Modifies:** `oracle/generate.py` (+ thermal fixture), `tests/fixtures/oracle/thermal.json`.
**Interfaces:**
```ts
export type ThermalInputs = { r_solar: number; emissivity: number; g_peak_w_m2: number; t_air_k: number; t_sky_k: number;
  h_conv_w_m2k: number; t_inside_k: number; r_total_m2k_w: number; c_a_j_m2k: number }
export type DiurnalResult = { t_max_c: number; q_in_mean_w_m2: number; t_surface_k: Float64Array /* day 2, every 600 s, 144 points */ }
export function netFluxWM2(tK: number, gWM2: number, p: ThermalInputs): number                  // RHS of the §4.3 balance, W/m²
export function steadyStateTempK(p: ThermalInputs, gWM2: number): number                        // bisection on netFluxWM2
export function simulateDay(p: ThermalInputs, opts?: { dtS?: number; gProfile?: (tS: number) => number }): DiurnalResult   // D1; dtS must divide 600
```
`oracle/generate.py` thermal fixture: a seeded pure-Python draw (own splitmix, not numpy RNG) of 200 parameter sets over physical ranges (`r_solar` 0.1–0.9, `emissivity` 0.1–0.95, `g_peak` 600–1000, `t_air_k` 301.15–309.15, `h` 9.5–28.5, `r_total` 0.1–0.6, `c_a` 1.5e3–2.5e3), each solved with scipy `solve_ivp` DOP853 at rtol = atol = 1e-11 **segment by segment between 06:00, 18:00, 30:00, 42:00 h**; stores inputs, day-2 `t_max_c`, `q_in_mean_w_m2`, and the 144-point series for the first 20.
- [ ] Generate and freeze the fixture. Tests: `linearCaseMatchesClosedForm` (H1: ε = 0, constant `gProfile`, dtS = 5, worst-case corner, `T_thm_rtol`), `steadyStateResidualZero` (H2), `alphaIsOneMinusR` (hand-computed flux at R = 0.8), `zeroForcingStaysConstant` (Review Focus 4), `energyClosure` (∫ net flux dt = C_A·ΔT within 1e-6 relative on a short run), `reflectanceMonotoneAllNineScenarios` (H3, scenarios from plan 1 `weatherL9`), `matchesOracle200Cases` (T-THM-9, H13: `t_max_c` ≤ `T_rk4_k`, `q_in_mean_w_m2` ≤ `T_q_w_m2`, the full 144-point series for 20 cases ≤ `T_rk4_series_k`), `dtNotDividing600Rejected` (T-THM-11, F9), `thermalSolvedEventAtDebug`, `zeroRTotalRejected` (guard), `runtimeUnder3ms` (`T_thermal_ms`). Run → FAIL.
- [ ] Implement RK4 (state: one float; irradiance evaluated at stage times; guard inputs with `requireIn`); emit `thermal.solved` at debug. Run → PASS.
- [ ] Commit: `feat: single-node roof heat balance verified against closed forms and scipy`

**Acceptance:** H1, H2, H3 (thermal part), H13, F9.

### Task 4: Mie scattering and oracle fixture

**Tests:** `tests/core/models/mie.test.ts`. **Creates:** `src/core/models/mie.ts`. **Modifies:** `oracle/generate.py` (+ mie fixture), `tests/fixtures/oracle/mie.json`.
**Interfaces:**
```ts
export type MieResult = { q_sca: Float64Array; q_abs: Float64Array; g: Float64Array }
export function mieEfficiencies(n: number, k: number, dUm: number, wlUm: Float64Array, nMedium: number): MieResult
    // k >= 0 required (PhysicsRangeError otherwise); relative index m = (n + i·k)/n_medium; x = π·d·n_medium/λ; Bohren-Huffman a_n, b_n with downward-recurrence D_n; g from the Bohren & Huffman asymmetry-parameter sum, `g = (4/(x²·Q_sca))·[Σ n(n+2)/(n+1)·Re(a_n a*_{n+1} + b_n b*_{n+1}) + Σ (2n+1)/(n(n+1))·Re(a_n b*_n)]` (divide by `Q_sca`, not by `x²` alone; cited by section, not equation number)
```
`oracle/generate.py` mie fixture: ~60 cases covering `n` ∈ {1.3, 1.5, 1.64, 2.0, 2.7}, `k` ∈ {0, 1e-3, 0.05, 0.5}, `d` ∈ {0.05, 0.25, 0.8, 2.0, 10.0} µm, 5 wavelengths in 0.3–2.5 µm (so x reaches ≈ 105 at n_medium = 1.0 and ≈ 156 at 1.49), `n_medium` ∈ {1.0, 1.49}; values `q_sca`, `q_abs`, `g` from `miepython.efficiencies` using `m = n − i·k` (its documented convention).
- [ ] Tests: `matchesMiepythonFixture` (H4/T-MIE-1: the tolerance rule of H4 per case), `rayleighLimit` (x = 0.01, m = 1.5: 1 %), `nonAbsorbingConservesEnergy` (k = 0 → `q_abs` < 1e-9; T-MIE-2), `tio2AbsorbsInUv` (T-MIE-3: `q_abs` at 350 nm > 0.1 for d = 0.25 µm, n = 2.7, k = 0.05), `largeXMatchesFixture` (T-MIE-4: the x ≈ 105 cases pass the H4 rule), `negativeKRejected` (T-MIE-5, F8), `runtime221Wavelengths` (< 2 ms), `mieCacheStatsEvent`. Run → FAIL.
- [ ] Implement per Bohren & Huffman with `nmax = ⌊x + 4x^(1/3) + 2⌋` and `nmx = max(nmax, ⌈1.1·|m·x|⌉) + 15` for the downward recurrence (the spike's `+16` margin on `⌈|mx|⌉` was **measured too short**: 5.9e-5 relative error at x = 100, m = 3; the reviewer's `1.1·|mx| + 15` rule gave ≤ 1.7e-11 over m ∈ {1.3…3.0}, k ∈ {0, 1e-3}, x ∈ {5…100}); pure real/imag arithmetic on `number`s (no complex library). Run → PASS.
- [ ] Commit: `feat: Mie scattering verified against miepython`

**Acceptance:** H4; F8.

### Task 5: Optics core and composition

**Tests:** `tests/core/models/optics.test.ts`. **Creates:** `src/core/models/optics.ts`.
**Interfaces:**
```ts
export function kmCoefficients(layers: readonly { mie: MieResult; dUm: number; phi: number }[]): { s: Float64Array; k: Float64Array }   // D2 mapping per spike Q1; 1/µm; phi = volume fraction of total solids
export function kmLayerReflectance(s: Float64Array, k: Float64Array, dftUm: number, rGround: number): Float64Array
export function solarWeighted(wlUm: Float64Array, r: Float64Array, g173: Spectrum): number   // trapezoid; holds last r beyond the grid to 4000 nm
export function midcoatSpectrum(pvc: number, tio2Fraction: number, dftUm: number, mat: Materials, tio2: NKTable, baso4: NKTable, wlUm: Float64Array): Float64Array
export function applyTopcoat(rMid: Float64Array, dftUm: number, muPerUm: number): Float64Array  // D3
export function rSolarStack(r: Float64Array, wlUm: Float64Array, g173: Spectrum): number
```
- [ ] Tests: `kmThickLimitClosedForm` and `kmZeroThicknessReturnsGround` (H5), `kmMappingPinnedToSpikeQ1` (T-OPT-6: numeric S/K for a documented single-pigment case), `flatRReturnsR` and `g173Total` (H6), `pvcZeroGivesBinderOnlyFinite` (Review Focus 1), `pvcOutOfRangeCode4` (F5), `edges100And300UmValid` (Review Focus 2), `dftOutsideDomainCode4` (D9: midcoat 5 µm and 301 µm rejected; F7 of plan 3), `missingBaso4KColumnIsDataError` (Review Focus 3), `singlePigmentFractionsFinite` (TiO2 fraction 0 and 1), `thickerNeverLessReflective`, `topcoatNeverIncreasesR` (D3), `topcoatZeroDftIdentity`, `evalUnder5ms` (`T_eval_ms`, warm). Run → FAIL.
- [ ] Implement (reuse Mie results across calls for identical `(n, k, d, wl)` via a small `Map` keyed on a numeric tuple; emit `mie.cache_stats` at debug). Run → PASS.
- [ ] Commit: `feat: Kubelka-Munk midcoat optics, topcoat attenuation and ASTM G173 weighting`

**Acceptance:** H5, H6, H3 (optics part), F5.

### Task 6: Sol-gel kinetics and functionality

**Tests:** `tests/core/models/solGel.test.ts`. **Creates:** `src/core/models/solGel.ts`. **Modifies:** `oracle/generate.py` (+ solgel fixture), `tests/fixtures/oracle/solgel.json`.
**Interfaces:**
```ts
export function weightAverageFunctionality(xOrgano: number, fOrgano = 3, fTeos = 4): number   // (fTeos²(1−x) + fOrgano²·x) / (fTeos(1−x) + fOrgano·x)
export function gelPointConversion(fW: number): number                                          // 1/(fW − 1)
export type SolResult = { h_end: number; c_end: number; gel_time_s: number }                    // Infinity if not gelled
export function hydrolysis(tS: number, kH: number, waterRatio: number): number                  // D4 closed form
export function condensation(tS: number, kH: number, kC: number, waterRatio: number): number    // D4 closed form
export function simulateSol(ph: number, waterRatio: number, xOrgano: number, kHCoeff: number, kC: number, tEndS: number): SolResult
export function gelTimeRel(ph: number, waterRatio: number, xOrgano: number, mat: Materials, ref: readonly [number, number, number]): number
```
`oracle/generate.py` solgel fixture: 20 seeded (k_h, k_c, r_w) cases; scipy `solve_ivp` (DOP853, rtol 1e-11) of `dh/dt = k_h(1−h)` capped at `h_cap`, `dc/dt = k_c·h·(1−c)`, plus the gel time by event detection for `p_c = 7/18`.
- [ ] Tests: `floryStockmayerValues` (H7: x = 0, 0.5, 1; independent hand values), `closedFormMatchesOdeFixture` (H8), `waterLimitedHydrolysis` (`waterRatio = 0.5` → `h_end ≤ 0.5`), `lowerPhHydrolysesFasterIn3p5To5`, `neverGelsReturnsInfinityAndLogsDegenerate` (T-SOL-5), `waterRatioAboveOneHasNoEffectOnGelTime` (T-SOL-9: documents limit (i) of D4), `smallKtIsAccurate` (kt = 1e-6 within 1e-9 relative using `expm1`), `phEdgesInclusiveAndOutsideRejected` (Review Focus 5), `waterRatioZeroCode4` (F6), `referenceConditionIsOne` (`gelTimeRel(...ref, mat, ref) === 1`). Run → FAIL.
- [ ] Implement (bisection for the gel time, 80 iterations). Run → PASS.
- [ ] Commit: `feat: closed-form sol-gel kinetics with Flory-Stockmayer gel point`

**Acceptance:** H7, H8, F6.

### Task 7: Wetting

**Tests:** `tests/core/models/wetting.test.ts`. **Creates:** `src/core/models/wetting.ts`.
**Interfaces:**
```ts
export function youngAngleDeg(yMtes: number, thetaSilicaDeg: number, thetaMtesDeg: number): number
export function wenzelAngleDeg(thetaYDeg: number, r: number): number
export function cassieBaxterAngleDeg(thetaYDeg: number, fSolid: number): number
export type WettingResult = { theta_pred: number; theta_lo: number; theta_hi: number; score: number; score_lo: number; score_hi: number }
export function wetting(yMtes: number, mat: Materials): WettingResult
export function wettingBinder(mat: Materials): WettingResult          // no topcoat: Young angle = `wetting.theta_binder_deg`, same corner interval; used by plan 3 for stacks without topcoat
```
- [ ] Tests: `limits` (H9: r = 1, f = 1, and `cassieBaxterAngleDeg(θ, 0)` = 180° exactly; the config `f_solid_min` is > 0, so the model function must accept f = 0), `intervalContainsNominal`, `scoreBoundsAndDirection` (score ↑ with y), `wenzelAmplifiesBothSides` (θ_Y < 90 decreases, > 90 increases), `yEdgesValid`, `binderOnlyUsesBinderAngle`. Run → FAIL. Implement (cosine forms, clamp `cos` to [−1, 1]). Run → PASS.
- [ ] Commit: `feat: Young/Wenzel/Cassie-Baxter wetting model`

**Acceptance:** H9, H10 (wetting part).

### Task 8: Barrier and delamination PROXIES

**Tests:** `tests/core/models/barrier.test.ts`, `tests/core/models/delamination.test.ts`. **Creates:** `barrier.ts`, `delamination.ts`.
**Interfaces:**
```ts
export type BarrierResult = { perm_index: number; crack_index: number; corrosion_risk: number; proxy: true }
export function barrier(xGptes: number, dftUm: number, mat: Materials): BarrierResult
export function delaminationProxy(yMtes: number, topDftUm: number, mat: Materials): number
```
- [ ] Tests: `allOutputsInUnitIntervalOverPlan1Ranges` (H10, fast-check over the ranges), `permIncreasesWithGptes`, `crackIncreasesWithDft`, `interiorOptimumExistsInX` (documents the by-construction shape; T-BAR-5 also asserts `proxy === true` and that the doc comment starts with `PROXY:`), `delamIncreasesWithMtes` (blueprint H3 direction), `delamBounds`. Run → FAIL. Implement per D5/D7 (import `crackIndex` from `shared`). Run → PASS.
- [ ] Commit: `feat: barrier and delamination proxy indices`

**Acceptance:** H10, FR-6.

### Task 9: Cross-model sanity and full gate

**Tests:** `tests/crossModel.test.ts`. **Creates:** that file only (no src).
- [ ] Tests: `higherMidcoatReflectanceLowersTMaxEndToEnd` (real optics → real thermal over 5 candidates × 9 scenarios; H3), `topcoatOpticalPenaltyRaisesTMaxOrEqual`, `noModelImportsAnother` (regex scan of the `import` lines of `src/core/models/*.ts`; allowed targets: `ranges`, `shared`, and `mie` only from `optics`; NFR-2), `modelsBuildForBrowser` (`Bun.build` target browser on each model; FR-8), `everyOutputFiniteInDomainForAll96Candidates` (design from plan 1 `lhsDesign`; every model output finite and in its domain), `suiteIsIdenticalUnderNode` (T-X-5: build the model test inputs to a Node bundle and compare 20 numbers with the Bun run to 1e-9).
- [ ] This task is verification-only (tests over code that already exists), so red-first does not apply; the mutants below prove the tests can fail. Run → expect PASS. If it FAILS, a model is wrong: go back to that task, do not weaken the test.
- [ ] Run `bun run check`; record run ids for H1–H13 in `docs/proofs/plan-02.md`; run the mutation checks below.
- [ ] Commit: `test: cross-model sanity and plan-2 proof log`

**Acceptance:** H3, H11, NFR-2, FR-8.

## Part 2: Test specification

| File | IDs | Key assertions |
|---|---|---|
| `tests/core/literature.test.ts`, `tests/node/data.test.ts`, `dataFetch.test.ts` | T-DAT-1..7 | hash gate, F1/F3/F7, G173 = 1000.37 ± 1.0 |
| `tests/core/models/ranges.test.ts`, `shared.test.ts` | T-RGN-1..4, T-SHR-1 | inclusive edges, code 4, event fields, crack limits |
| `tests/core/models/thermal.test.ts` | T-THM-1..11 | closed form 1e-7, residual, closure, monotone R, oracle ≤ 1e-4 K on 200 cases, dt guard, runtime |
| `tests/core/models/mie.test.ts` | T-MIE-1..6 | miepython fixture under the H4 tolerance rule, Rayleigh 1 %, large x ≈ 105, `k < 0` rejected |
| `tests/core/models/optics.test.ts` | T-OPT-1..11 | KM limits, pinned KM mapping, finite edge cases, topcoat attenuation, runtime |
| `tests/core/models/solGel.test.ts` | T-SOL-1..8 | p_c = 7/18, closed form vs ODE fixture, `Infinity` + degenerate event |
| `tests/core/models/wetting.test.ts` | T-WET-1..5 | limits, interval, direction |
| `tests/core/models/barrier.test.ts`, `delamination.test.ts` | T-BAR-1..5, T-IFC-1..3 | bounds, directions, `proxy === true` |
| `tests/crossModel.test.ts` | T-X-1..5 | end-to-end monotone cooling, import isolation, browser builds, 96-candidate domain check, Node = Bun |

Mutation checks (commit first; mutate a copy in the scratchpad; never `git checkout` after a mutation): (M1) `S = ¾σ_s` without `(1−g)` → T-OPT-6 must fail; (M2) swap `n` and `k` roles in `mieEfficiencies` (use `m = n − ik`) → T-MIE-1 (fixture) must fail; (M3) drop the factor 2 in `exp(−2μ·DFT)` → topcoat test must fail; (M4) `p_c = 1/f_w` → H7 must fail; (M5) swap `T_sky` and `T_air` → H1/H3 must fail; (M6) allow `dtS = 70` and integrate across the kink → T-THM-9/11 must fail; (M7) shorten the Mie recurrence start back to `⌈|mx|⌉ + 16` → T-MIE-4 must fail. A surviving mutant means a weak test: strengthen the test.

### Test stubs (helpers and key assertions)

Helpers (`tests/helpers.ts`, extended): `loadFixture<T>(name: "xoshiro" | "mie" | "thermal" | "solgel" | "sobol"): T` (reads `tests/fixtures/oracle/<name>.json` and verifies its sha256 against `SHA256SUMS`), `randomThermalInputs(rng: Xoshiro128): ThermalInputs` (ranges of Task 3), `relErr(a: number, b: number): number`.

```ts
// tests/core/models/mie.test.ts — H4 (oracle = miepython in another language)
test("matchesMiepythonFixture", () => {
  for (const c of loadFixture<MieCase[]>("mie")) {
    const r = mieEfficiencies(c.n, c.k, c.dUm, new Float64Array([c.wlUm]), c.nMedium)
    const x = (Math.PI * c.dUm * c.nMedium) / c.wlUm, qExt = c.q_sca + c.q_abs
    if (Math.hypot(c.n, c.k) * Math.PI * c.dUm / c.wlUm < 0.1) { expect(relErr(r.q_sca[0]! + r.q_abs[0]!, qExt)).toBeLessThan(1e-6); continue }
    expect(relErr(r.q_sca[0]!, c.q_sca)).toBeLessThan(1e-8)
    expect(Math.abs(r.q_abs[0]! - c.q_abs)).toBeLessThanOrEqual(1e-8 * qExt + 1e-12)
    expect(Math.abs(r.g[0]! - c.g)).toBeLessThan(1e-7)
  }
})
// tests/core/models/thermal.test.ts — H13 (kink included: 20 full series)
test("matchesOracle200Cases", () => {
  for (const c of loadFixture<ThermalCase[]>("thermal")) {
    const out = simulateDay(c.inputs)
    expect(Math.abs(out.t_max_c - c.t_max_c)).toBeLessThanOrEqual(1e-4)
    expect(Math.abs(out.q_in_mean_w_m2 - c.q_in_mean_w_m2)).toBeLessThanOrEqual(1e-3)
    if (c.series) for (let i = 0; i < 144; i++) expect(Math.abs(out.t_surface_k[i]! - c.series[i]!)).toBeLessThanOrEqual(3e-4)
  }
})
// tests/core/models/solGel.test.ts — H8
test("closedFormMatchesOdeFixture", () => {
  for (const c of loadFixture<SolCase[]>("solgel")) {
    expect(relErr(hydrolysis(c.tS, c.kH, c.waterRatio), c.h)).toBeLessThan(1e-6)
    expect(relErr(condensation(c.tS, c.kH, c.kC, c.waterRatio), c.c)).toBeLessThan(1e-6)
    expect(relErr(simulateSol(c.ph, c.waterRatio, c.x, c.kHCoeff, c.kC, c.tEndS).gel_time_s, c.gel_time_s)).toBeLessThan(1e-6)
  }
})
```
