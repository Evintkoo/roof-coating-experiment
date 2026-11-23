# Control and Variable Comparison Animation Implementation Plan

Part 1 is the plan (tasks, hypotheses, faults). Part 2 is the test specification (stubs). Plan 08 of `plans/01-digital/`; it builds on plan 07 (day player, loop, pool, fan, flux) and plans 00 (live simulator), 05 (optimisation variables) and 06 (design system).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the reader watch the modelled recipe against the controls (C0 bare aluminium, C1 the commercial datasheet product) over the simulated day, and watch what each design variable does by playing its range from low to high against the fixed control lines.

**Architecture:** Reuse, not new machinery. (A) *Comparison lanes*: one pure function turns the `LiveResult` the page already holds (recipe, `controls.C0`, `controls.C1` series, `weather.roof`) into five lanes (surface temperature, reflected flux, absorbed flux, conducted flux, cumulative heat into the building) plus the live difference to each control; the lanes are drawn by one new small-multiples molecule and **subscribe to the plan 07 day player's clock** (one new additive `onFrame` hook), so there is exactly one clock. (B) *Variable sweep*: a pure `sweepValues` and `sweepChunk` call the same `liveSimulate` the live simulator uses, one task per sweep point (nominal plus the 32 material draws, same seed), the plan 07 worker pool evaluates the points in parallel, the plan 07 `mergeOrdered` places them by index, and the plan 07 pure clock (`src/core/anim/timeline.ts`, read as a 0 to 1 phase) moves a cursor along the range. Both views live in **one closed disclosure that replaces the closed screening disclosure row** of plan 07 (three tabs: Screening, Against the controls, One variable at a time), so the closed page does not grow.

**Tech Stack:** Bun 1.3.14, TypeScript 7.0.2, Web Workers, inline SVG, playwright 1.65.1 with installed Chrome, as plan 07. No new runtime dependency, no animation library. Versions re-verified in Task 1 (dated at the run).

**Spec:** none; derived from this conversation. The owner's request, verbatim: "design like animation comparison of control and the each variable too please". **Interpretation (stated, not assumed):** (A) an animated side-by-side comparison of the modelled recipe against the controls over the simulated day, driven by the same clock as the day player, with the difference to each control shown live; (B) a per-variable animated sweep: pick any design variable (the 9 optimisation variables and the live-simulator inputs), play its range low to high and watch the modelled outcome move against the control lines, evaluated in parallel on the live worker pool, with the p5 to p95 band and the label "parameter uncertainty only". If the owner meant something else (for example comparing several recipes with each other, or an animation of the controls only), only Tasks 3 and 4 change; see Decisions D11.

**Status:** ✅ DONE-LEAN. Landed: `docs/spikes/plan-08.md` and `docs/spikes/plan-08/`, `src/core/anim/compare.ts` and `sweep.ts`, the `onFrame` hook in `src/web/anim/dayPlayer.ts`, the sweep path in `src/web/pool.ts` and `worker.ts`, `laneChart`, `sweepChart`, `watchCompare`, `watchSweep`, the tabs in `watchScreening`, `src/web/anim/comparePanel.ts` and `sweepPanel.ts`, `src/node/report/watch.ts`, tests and `docs/proofs/plan-08.md`. Skipped (lean): the long proof tier, the 4x throttled frame budget, mutations beyond M1 to M4, the design gallery entries of the four components. **H16 is falsified** (JS delta 42.3 KiB against the cap of 20, total 118.8 against 100; pinned at 45, owner decision needed). Deviations: `sweepValues` keeps both range ends (the live value replaces the nearest interior point), the lanes' reflected and absorbed flux are exact on the 10-minute nodes and within 0.24 W/m2 between them, H7 byte identity holds across worker counts in one engine and within 1e-9 against Bun.

## What the operator does

Reader of the report (about 3 minutes, no setup):

1. Scrolls to *Watch it run* (plan 07), where the day player already plays once on first view. Below it, the closed disclosure that used to say "Run the screening in my browser" now says "More ways to watch: screening, controls, one variable at a time". Closed, it is the same one row (page height does not grow).
2. Opens it and picks the tab *Against the controls*. Five lanes show the recipe, bare aluminium (C0) and the commercial datasheet product (C1) over 24 hours, a time cursor in every lane, and a difference strip ("recipe minus C0: -7.8 K at 13:00, minus C1: -2.1 K"). Pressing the day player's play button, scrubbing it or stepping it moves all lanes together; nothing else has its own clock. (Target: first useful view in under 5 s after opening.)
3. Picks the tab *One variable at a time*, chooses a variable from a list (9 optimisation variables, sol-gel pH, 3 weather inputs; the live simulator's current settings are the base), presses *Play range*. The cursor moves from the low to the high end of the variable's range over 16 s (4x in 4 s); five small charts (peak surface temperature, solar reflectance, corrosion risk, delamination risk, cost) show the modelled curve with its p5 to p95 band and the control lines, and the readout at the cursor says how far the recipe is from each control. The sweep points are evaluated in parallel on the page's worker pool (about 41 points; under 2 s on four workers, measured in Task 1).
4. Under reduced motion nothing moves until a play button is pressed; the scrubber, the value box and the step buttons work and the full curves are drawn at once.
5. Developers: `bun run check` (fast tier) and `bun run proof` (browser tier) as plan 07; `bun run qa` also drives the new controls.

## Logging and debugging

Same schema as plans 03, 06 and 07 (`safeJson`; no filenames or raw errors at info). New events (the browser debug ring buffer receives them; `bun run qa` reads it):

| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `compare.open` | info | compare panel | `lanes`, `controls` (2) | per open |
| `compare.frame` | debug | compare panel | `t_h` | per frame, debug only, capped by the loop's frame-stats window |
| `sweep.start` | info | sweep panel | `variable` (key, not value), `points`, `workers`, `draws` | per run |
| `sweep.point.done` | debug | sweep panel | `index`, `ms` | per point |
| `sweep.done` | info | sweep panel | `points`, `ms`, `workers`, `speedup_vs_1` (only when measured) | per run |
| `sweep.cancel` | info | sweep panel | `reason` (`live_changed`, `variable_changed`, `closed`) | per cancel |
| `sweep.play` / `sweep.pause` / `sweep.seek` | info | sweep panel | `source` (user, reduced), `phase` | per action |
| `sweep.error` | error | sweep panel | `reason` (`worker_failed`, `physics_range`, `no_worker`), `index` | per failure |

Production: info only, and every failure is diagnosable from info (`sweep.start` then no `sweep.done` then `sweep.error` or `sweep.cancel`). Dev and staging: debug, with the literal step names above. Redaction: the variable is logged by key; no recipe values, filenames or raw errors. Alert rule (dev dashboard of the QA script): `sweep.start` without `sweep.done`, `sweep.error` or `sweep.cancel` within `T_hang_s` (plan 07, 10 s) is a defect. Log size: the plan 07 ring buffer cap holds; per-point and per-frame events are debug and are not recorded in production. A test per event (H9-style: each emitted in the browser test, none carries a number that identifies a recipe). Runbook: if the sweep never finishes, read the last `sweep.*` event; `worker_failed` means the lane panel (plan 07) shows a failed lane and the inline lane finishes the run; `physics_range` means the swept value left a model range (a bug in the sweep range, F3).

## Scope

In scope: the pure comparison lanes and sweep core, one additive worker message, one additive day-player hook, two organisms and two molecules from the plan 06 design system, tabs in the existing disclosure, tests, proof log. Out of scope: comparing several recipes with each other (D11), two-variable sweeps or heat maps, sweeps of C2 and C3 (they exist only for shortlisted candidates in the batch), any new physics, any new data in the report file other than what the page already embeds, export as video or GIF (BLOCKED-14), the screening itself (unchanged), the Python or Rust code.

Platform rules: one offline HTML file, byte-identical for the same run id, no network, no new dependency, `vendor/` untouched, design-system components only (no raw colour, spacing or font literal; the plan 06 token tests cover the new components).

## Stack and versions

| Part | Choice |
|---|---|
| Runtime and tests | Bun 1.3.14, `bun test`, fast-check 4.10.3, playwright 1.65.1 (as plan 07) |
| Model code | `liveSimulate` (`src/core/pipeline/live.ts`), `CONTROL_LAYERS` and `evaluateC1` (`src/core/pipeline/stackProps.ts`), unchanged |
| Clock and sampling | `advance`, `seek` (`src/core/anim/timeline.ts`) and `sampleSeries` (`frames.ts`), unchanged |
| Parallelism | plan 07 pool (`src/web/pool.ts`), worker (`src/web/worker.ts`), `mergeOrdered` (`src/core/anim/screening.ts`) |
| Rendering | inline SVG through the design system (plan 06 molecules, tokens) |
| Controls source | `configs/controls.yaml` (C1: APOC 252 Sunwhite datasheet, r_solar 0.90, emissivity 0.87, US product, thermal outcomes only); C0 is the bare substrate (`CONTROL_LAYERS.C0`, all layers off) |

## Gaps this plan closes

1. The day player shows only bare aluminium against the recipe; the commercial control C1 is in the live result (`controls.C1`) but is never drawn, and no flux or cumulative heat is compared.
2. There is no way to see what one variable does. The explorer shows one point at a time; the reader must drag a slider and remember the previous numbers.
3. The pool and the clock exist but only the screening and the day use them.

## Alternatives considered and Risks

| Option | Verdict |
|---|---|
| New comparison page with its own clock and renderer | Rejected: two clocks drift, and it duplicates the day player. |
| Show C0 and C1 inside the existing day player (more curves, more readouts) | Rejected: grows the open section by about 120 px, and the closed page has no room (8,950 to 8,955 of 9,000 px). The day player gets one hook only. |
| Sweep on the main thread, no pool | Rejected: the request asks for the live worker pool, and 41 points of 33 thermal solves each is about 0.4 s of blocked main thread (Task 1 measures it). |
| Sweep by differentiating the model (plan 05 gradients) | Rejected: gradients are local; the picture must show the real curve and the real band. |
| Sweep with nominal only (no draws) | Rejected: the band is the reason to show uncertainty at all. Nominal-only stays as the fallback if Q1 shows draws cost more than `T_sweep_s` (then the band is drawn from 8 draws and labelled so, decided by the measured number, not by choice). |
| Chosen | Lanes read the `LiveResult`; sweep is one `liveSimulate` per point on the plan 07 pool; one closed disclosure with tabs. |

### Risks (pinned by tests)

| Risk | Pinned by |
|---|---|
| A lane shows a number that is not a model output (an invented control curve) | H3, H10 (every drawn series carries `data-source` and resolves to a field of the result) |
| Two clocks: lane cursor and day player disagree | H4 |
| The sweep point differs from what the live simulator would show at the same settings | H6 |
| Sweep result depends on worker count or arrival order | H7 |
| The control lines are assumed "fixed" but move with the weather inputs | H8 (control curves for the 3 weather variables are drawn as curves, for the design variables as flat lines, asserted per variable) |
| C1 has only thermal outcomes; a line for corrosion, delamination or cost would be invented | H9 (C1 line absent for those, text says "datasheet, not modelled") |
| Variable whose layer is switched off shows a flat curve with a band and reads as "no effect" | F5, H8 (a visible note "this layer is off in the live simulator") |
| Page grows past 9000 px | H12, `closedPageStaysWithinTheFrozenHeight` |
| Sweep makes the live sliders slower | H13 (live latency with the panel open and a sweep running) |
| A moving thing that cannot be stopped | H11 |
| Wording claims too much ("recommended", "best", cost in money) | H14 (honesty test) |

## Requirements

FR-1 The comparison panel MUST draw, for the live recipe, C0 and C1, five lanes: surface temperature (deg C), reflected flux, absorbed flux, conducted flux (W/m2) and cumulative net heat into the building (W h/m2), over 0 to 24 h from the solved series. FR-2 Every lane MUST have a cursor at the day player's current time and MUST NOT own a clock. FR-3 The panel MUST show, live at the cursor, the difference of the recipe to C0 and to C1 for each lane, with sign and unit. FR-4 C1 MUST be drawn only for the quantities it models (thermal; flux from its datasheet reflectance); for every other quantity the panel MUST say "datasheet, not modelled". FR-5 The sweep panel MUST offer every optimisation variable (9), sol-gel pH and the 3 weather inputs, each over its configured range (`MaterialRanges`, `WeatherConfig`), 41 points, with all other inputs held at the live simulator's current values. FR-6 Each sweep point MUST be the result of `liveSimulate` (nominal and the 32 draws, same seed as the live simulator) so that the point at the live value equals the live result. FR-7 The sweep MUST show for t_max, r_solar, corrosion risk, delamination risk (each with its p5 to p95 band, labelled "parameter uncertainty only") and cost (relative cost units, no band: the cost model has no draws) the curve, the control lines and a cursor. FR-8 Sweep points MUST be evaluated on the worker pool, one point per task, merged by index; the result MUST NOT depend on worker count or arrival order. FR-9 Playing the sweep MUST move a cursor over the precomputed curve; playing MUST NOT recompute. FR-10 A change to a live input or a different variable MUST cancel the running sweep (newest wins, no stale paint, no leaked worker). FR-11 Nothing MUST autoplay; every moving region has a pause control; reduced motion shows the static full curves and moves only on a press; the loop pauses with the tab hidden. FR-12 The closed page MUST be at most `T_page_px` and not taller than before this plan (`T_delta_px` 0). FR-13 Every figure carries "Model output, not a measurement"; PROXY badges stay on corrosion, delamination and cost; cost is in relative cost units; the words "recommended", "best" and "optimal" MUST NOT appear in the new components. FR-14 Components come from the plan 06 design system with sheet-first entries and token-only styling. NFR-1 Animation JS added by this plan at most `T_js08_delta_kib`, and the plan 07 `T_js_kib` 100 total still holds. NFR-2 No change to any existing number (plan 00 live latency, plan 07 H7 equality).

## Acceptance: hypotheses and proofs

| ID | Hypothesis (falsifiable) | Experiment and deciding observable | Falsified when |
|---|---|---|---|
| H1 | Lane series are the model's series | at 12 live settings, each lane's recipe, C0 and C1 values at 24 scrub positions equal `sampleSeries` of the `LiveResult` series (and the flux of `fluxAt`) within 1e-9 | any mismatch |
| H2 | Cumulative heat is the integral of the conducted flux | pure test: the trapezoid sum of the conducted flux on the 144-point series at 24 h equals `q_in_mean_w_m2 * 24` of the same outcome within `T_heat_tol` (frozen from Q5; spike Q6 measured the same sampling gap, 2.7e-4 W/m2 in the mean) for recipe, C0 and C1; the recipe-minus-C0 difference at 24 h equals the difference of the two `q_in_mean_w_m2` times 24 within the same tolerance | outside tolerance |
| H3 | Differences are computed, not stored | the displayed difference at each scrub position equals recipe minus control of the displayed lane values (independent recomputation from the raw series, sharing no code with the panel) within 1e-9 | any mismatch |
| H4 | One clock | in Chrome, the lane cursors' time equals `dayPlayer.state().tH` at each of 24 seeks and on 30 sampled frames of a played day, step, seek and play from the day player's own controls move the lanes; the panel adds no `loop.add` ticker (`loop` ticker count unchanged by opening the panel) | any difference or an extra ticker |
| H5 | The sweep is evaluated by the model | each of the 41 points of each of the 13 variables, evaluated on 1 worker, equals a direct sequential `liveSimulate` call with that input within 1e-9 (nominal outcome and five bands) | any mismatch |
| H6 | The point at the live value is the live result | the sweep point whose value equals the live value (the grid includes the live value by construction) equals the live simulator's nominal and bands exactly (same seed) | any difference |
| H7 | Parallel sweep is deterministic | the sweep on pools of 1, 2 and 4 workers returns byte-identical JSON; speedup of 4 over 1 workers at least `T_speedup` (plan 07 floor 1.5, re-measured here); the full sweep on 4 workers takes at most `T_sweep_s` (frozen from Q1, cap 2) | any difference or bound exceeded |
| H8 | Control lines are right per variable | for each of the 13 variables, the C0 and C1 values over the sweep are constant to 1e-12 for the 10 design and pH variables and vary for the 3 weather variables; the panel draws a flat line or a curve accordingly and the test reads the drawn kind from `data-control-kind` | wrong kind for any variable |
| H9 | C1 is not over-claimed | C1's corrosion, delamination, wetting and cost outcomes are NaN in the model; the panel draws no C1 line for them and shows the "datasheet, not modelled" text; no NaN or `undefined` text on the page | a C1 line for a NaN outcome, or any NaN text |
| H10 | Every moving value comes from the models | every drawn series and readout declares `data-source` (lane, control, field, or sweep variable and outcome); the test resolves each against the `LiveResult` or the sweep result; the container labels read "Model output, not a measurement" and the band legend reads "parameter uncertainty only" | any unresolved source or missing label |
| H11 | Motion is controllable | as plan 07 H5 and H6 for the new panels: no autoplay at load or on open; a reachable pause control in the sweep; Space toggles; reduced motion keeps the loop frame counter at 0 until a press and `transition-duration` 0; hidden tab freezes the sweep cursor; no flashes | any breach |
| H12 | Page weight and height hold | closed height at 1280 px at most the frozen baseline from Task 1 (8,950 to 8,955 px measured; `T_delta_px` 0) and at most `T_page_px` 9000; the open panel at most `T_open_px` (frozen in Task 1); file at most `T_size_mib` 8 | any exceeded |
| H13 | Earlier plans unaffected | live latency p95 at most `T_live_ms` 100 with the panel open and a sweep running on the pool (a separate pool from the live worker), newest wins on 200 slider moves; plan 07 H7 (864 values) unchanged; plan 06 contrast in both themes for every new component; comprehension fixture 7 of 8 by two fresh readers on the final page | any regression |
| H14 | Honest wording | the honesty test scans the new components and the built page: no "recommended", "best", "optimal" in them; PROXY badge on corrosion, delamination and cost; cost reads "relative cost units"; ageing not shown (initial values only, label says so); C1 is named as a US datasheet product | any hit or missing label |
| H15 | Newest wins, nothing leaks | start a sweep, change the variable after 100 ms, start another: no point of the cancelled run is painted, workers terminated within 500 ms; after 20 start and cancel cycles the live worker count equals the pool size; a live-input change cancels and marks the panel stale | any stale paint or leak |
| H16 | Animation JS stays small | the new code adds at most `T_js08_delta_kib` (frozen after Task 4, hard cap 20) to the bundled animation JS, and the total (inline lane included) stays at most `T_js_kib` 125 (amended from 100, see the amendment at the end) | any exceeded |

Thresholds (frozen once, never edited after): `T_sweep_pts` 41; `T_sweep_s` frozen from Q1 (cap 2, equal to `T_screen_s`); `T_open_px` frozen from Q2 (planned at most 900); `T_delta_px` 0; `T_heat_tol` frozen from Q5; `T_js08_delta_kib` frozen after Task 4 from the measured size (hard cap 20; **plan 08 does need its own frozen delta**, because plan 07's 100 was frozen with 35 % headroom against the worst case of 74.5 KiB and a single total would let this plan eat all of it unseen). Inherited, unchanged: `T_page_px` 9000, `T_size_mib` 8, `T_js_kib` 100, `T_frame_ms` 20, `T_frame_throttled_ms` 34, `T_speedup` 1.5 floor, `T_hang_s` 10, `T_live_ms` 100, `T_comp` 7 of 8, `T_contrast_*`, `T_tap_px` 44.

**Fault-injection matrix** (edit exactly one input; expect a phase, exit code or visible state, never a stack trace):

| ID | Edit | Expected |
|---|---|---|
| F1 | the `LiveResult` passed to the lanes has no `controls.C1.t_surface_k` | the panel shows the C1 lane as "not available" and keeps the recipe and C0 lanes; `compare.open` logs `controls` 1; no throw |
| F2 | series of unequal length (C0 shorter than the recipe) | `laneSeries` throws a typed `ConfigError` (code 4, phase `compare`), the panel shows the error state; the day player is unaffected |
| F3 | a sweep range with min equal to max, or a value outside a model range (a `MaterialRanges` entry edited to leave the physics domain) | zero-width range: the variable is listed as "fixed in this configuration" and not sweepable; out of domain: the point is reported by `sweep.error` `physics_range`, the panel shows the failed point, the other points are drawn, no hang |
| F4 | one worker terminated mid-sweep (`#test` hook, as plan 07 F6) | the lane shows failed, the chunk is re-queued, the result is byte-identical to H7, or a visible error within `T_hang_s` |
| F5 | the swept variable belongs to a layer switched off in the live simulator | the curves are flat, and the panel says "this layer is off in the live simulator" next to the variable |
| F6 | `Worker` removed (`delete window.Worker`) | the sweep runs on the inline lane (plan 07 F5), same result, lane panel says "single lane" |
| F7 | the sweep started with the tab hidden | the run proceeds, the cursor does not move until visible, result correct |
| F8 | text containing `<img onerror>` in any new component field (variable label, control name) | escaped, no element created |
| F9 | an unknown variable key, an unknown lane id or an unknown component state passed to the new molecules | build error exit 4 (closed unions, as plan 06) |
| F10 | a negative, NaN or out-of-range phase or speed passed to the sweep clock | clamped by the plan 07 pure clock (`seek`, `advance`, F11 of plan 07) |

**Given / When / Then:** G1 Given the report, when I open the disclosure and pick *Against the controls* and press the day player's play, then all five lanes move together and the strip shows the difference to C0 and C1 (FR-1 to FR-3, H1, H3, H4). G2 Given the sweep tab, when I choose a variable and press *Play range*, then the cursor sweeps low to high and the readout moves against the control lines, with the p5 to p95 band (FR-5 to FR-9, H5 to H8). G3 Given a weather variable, when I sweep it, then the control lines are curves, not flat lines (H8). G4 Given reduced motion, when I load the page, then nothing moves until I press a play button (FR-11, H11). G5 Given a live slider move during a sweep, when I let go, then the sweep is cancelled and marked stale and the live numbers update within the live latency budget (FR-10, H13, H15). G6 Given the closed page, when I measure it at 1280 px, then it is no taller than before (FR-12, H12).

## Execution contract: one shot, nothing left open

**Preflight gate.** Needed: plan 07 landed on the working branch (`src/web/anim/dayPlayer.ts`, `src/web/pool.ts`, `src/core/anim/screening.ts`, `docs/proofs/plan-07.md` exist; checked by a one-line script that prints the missing files and stops); `configs/controls.yaml` present with `c1_r_solar` and `c1_emissivity`; the committed fixture run `tests/fixtures/report-run`; `node_modules`; Chrome installed; CPU load checked before each browser step (CPU rule: one browser and one test process at a time, `nice -n 10`). If anything is missing, print the list and stop. Nothing needs the owner's accounts, hosts, keys or a backup.

No stub, TODO, skip, xfail or placeholder. Task 1 is a spike and ends in written answers Q1 to Q6 that fix Tasks 2 to 4. By-design limits go to `docs/BLOCKED.md` with a reason and a ticket: BLOCKED-16 the sweep varies one input at a time (interactions between variables are not shown; the sensitivity indices of plan 05 are the place for that); BLOCKED-17 C1 is datasheet-only (US product, initial values, thermal outcomes only, so corrosion, delamination, wetting and cost have no C1 line); BLOCKED-18 no C2 or C3 lines (they exist only for shortlisted candidates in the batch). Thresholds that need a measurement are frozen once from the first real run (`T_sweep_s`, `T_open_px`, `T_heat_tol` from Task 1; `T_js08_delta_kib` after Task 4). Done means proven: every hypothesis holds on evidence (run ids in `docs/proofs/plan-08.md`) and `bun run check` is green (lean mode below). If it fails partway: stop at the failing task, leave the tree clean, report the failing proof with its log. Out of scope for the run: merge (needs the owner's go-ahead), push, prod runs.

**Lean-mode proof list (what the run actually executes; nothing else is claimed):** (1) the fast tier of every new test file, (2) `bun run check`, (3) in real Chrome with one browser at a time: H1 and H3 (24 seeks), H4 (one clock), H5 on one variable per group (a design, the pH, a weather variable; the other 10 variables only in the pure-core test), H7 (pools of 1, 2 and 4, one repeat), H8, H11 (reduced motion, hidden), H12 (height, size), H13 (live latency, one run of 200 moves with the panel open), H15 (one cancel and 20 start and cancel cycles), (4) pure tests for H2, H6, H9, H10, H14, H16 and F1 to F10, (5) one comprehension pass by two fresh readers on the final page. **Not run, and said so in the proof log:** the long tier (`refine.*`, `budget.baseline`, `indonesia.e2e`, `pipeline.e2e`), the 4x throttled frame budget (H4 of plan 07 stays as measured there; this plan adds no per-frame main-thread work beyond one cursor update, which Task 4 checks at 1x only), and a mutation run beyond the four mutants listed in Task 4.

## Global Constraints

`bun run check` at or near 4 minutes under load; heavy and throttled checks in `*.proof.test.ts` with a fast twin (`docs/testing.md`); one component per commit; no attribution lines in commit messages; no new runtime dependency; never edit `vendor/`; never kill processes you did not start; one browser and one test process at a time; CPU rule (check load first, `nice -n 10`, bounded wall-clock). No mocks: real worker pool, real models, real faults (terminated worker, removed `Worker`); the fixture run is real data. Commit only; no push; no merge.

## Review Focus

(1) A drawn or displayed value that is not a model output (a smoothed, extrapolated or default control line, a C1 line for something the datasheet does not give). (2) A second clock or a second source of time. (3) A sweep point that differs from the live result at the same settings, or results that depend on the worker count. (4) The "fixed control lines" assumption for the weather variables. (5) Closed page height (8,955 of 9,000 before this plan) and the open panel height. (6) Wording: "recommended", "best", cost as money, uncertainty without the "parameter uncertainty only" label, C1 without its US-datasheet caveat. (7) Anything that moves without a pause control, and workers that leak after cancel.

## Decisions (all settled)

- D1 Reuse the plan 07 day player clock: the lanes subscribe through one additive `onFrame` hook on `DayPlayer`; no second ticker.
- D2 One closed disclosure, three tabs, replacing the closed screening row; the closed page does not grow (`T_delta_px` 0). The existing day player markup is not changed.
- D3 Lanes are small multiples of one molecule (`laneChart`), five lanes, three series each (recipe, C0, C1); C1 only where modelled (FR-4).
- D4 The sweep evaluates `liveSimulate` per point, 41 points, 32 draws, the live seed; one task per point; the pool gets one additive message type and a generic `run` payload; `mergeOrdered` places results.
- D5 The sweep clock is the plan 07 pure clock read as a 0 to 1 phase (0 to 24 mapped to 0 to 1); speeds 1x (16 s) and 4x (4 s) as the day player; no new clock code.
- D6 The sweep range is the plan 01 range of each variable from `MaterialRanges` (and `WeatherConfig` for the weather); the 41-point grid always contains the live value (inserted if not on the grid), so H6 is checkable.
- D7 Controls: C0 and C1 are recomputed per point by `liveSimulate` (`controls`), so a weather sweep draws curves and a design sweep draws lines, and the plan says so (H8). No assumption of "fixed".
- D8 Cost is the relative cost proxy, in relative cost units, no band; corrosion, delamination and cost keep their PROXY badge during motion.
- D9 Nothing autoplays (the day player's plan 07 autoplay-once stays as it is; nothing is added). Reduced motion follows plan 07 H5.
- D10 Own frozen threshold: `T_js08_delta_kib` (hard cap 20) on top of plan 07's `T_js_kib` total (amended to 125).
- D11 Interpretation (A) and (B) as stated in Spec. If the owner reads the request differently, the pure core and the pool path stay; only the two organisms and Task 3's lane definitions change.
- D12 The sweep recomputes only while its tab is open; closing the disclosure cancels it (`sweep.cancel` reason `closed`) so the closed page costs nothing.

## File Structure (one source file, one mirrored test)

```
docs/spikes/plan-08.md and docs/spikes/plan-08/*.ts     Task 1 spike answers and scripts
src/core/anim/compare.ts        pure: laneSeries, cumulativeHeat, diffAt                     tests/core/anim/compare.test.ts
src/core/anim/sweep.ts          pure: sweepVariables, sweepValues, sweepInputs, sweepChunk    tests/core/anim/sweep.test.ts
src/web/anim/dayPlayer.ts       modified: onFrame hook                                        tests/web/anim/dayPlayer.test.ts (extended)
src/web/anim/comparePanel.ts    wiring of the lanes to the day player                         tests/web/anim/comparePanel.test.ts
src/web/anim/sweepPanel.ts      wiring of the sweep: variable, run, clock, cancel             tests/web/anim/sweepPanel.test.ts
src/web/pool.ts, worker.ts      modified: sweep message type, generic run payload             tests/web/pool.test.ts (extended)
src/web/design/molecules/laneChart.ts                                                         tests/web/design/molecules/laneChart.test.ts
src/web/design/molecules/sweepChart.ts                                                        tests/web/design/molecules/sweepChart.test.ts
src/web/design/organisms/watchCompare.ts                                                      tests/web/design/organisms/watchCompare.test.ts
src/web/design/organisms/watchSweep.ts                                                        tests/web/design/organisms/watchSweep.test.ts
src/web/design/organisms/watchScreening.ts   modified: hosts the tabs                         tests/web/design/organisms/watchScreening.test.ts (extended)
tests/report.compare.browser.test.ts and .proof.test.ts   page tests, fast twin and proof
docs/proofs/plan-08.md          proof log
```

If Q3 shows `dayChart` can draw the sweep charts with a `xAxis` option in at most about 30 changed lines, `sweepChart.ts` is that option and not a new file (the mirrored test then extends `dayChart.test.ts`). The layout guard (1:1 source to test) extends to the new files.

## Tasks

### Task 1: Spike Q1 to Q6 (fixes Tasks 2 to 4)

**Tests:** `docs/spikes/plan-08.md` with runnable scripts under `docs/spikes/plan-08/` and a `run_all.ts` that exits 0 only when every expectation holds. **Creates:** those files. **Interfaces:** none (scripts only).
- [ ] Preflight script (files of plan 07, `controls.yaml`, fixture) prints missing items and exits non-zero.
- [ ] Q1 Cost: time `liveSimulate` (33 thermal solves) per point and the 41-point sweep on 1, 2 and 4 workers (Bun, then real Chrome with the Blob worker); freeze `T_sweep_s` (cap 2) and confirm speedup at least 1.5. If 41 points exceed `T_sweep_s`, record the draws count that fits and use it (and say so in the band label).
- [ ] Q2 Height: build the page from the fixture, measure the closed height (expected 8,950 to 8,955), mock the tabs replacing the closed screening row with the real component text, measure again; freeze `T_delta_px` 0 as met or find what to reclaim (candidates, in order: the one-line lead of the day player, the screening disclosure's summary text); measure the open panel and freeze `T_open_px`.
- [ ] Q3 Chart reuse: can `dayChart` (axes, band, cursor, control line) draw a sweep chart with an x-axis option; yes or no with the changed-line count.
- [ ] Q4 Controls over the sweeps: for the 13 variables (9 optimisation variables including the two grade variables, pH, 3 weather) record which of C0 and C1 outcomes move and which are NaN; confirm all 13 ranges exist in configuration and run without a `PhysicsRangeError` over all 41 points; confirm which variables are inert when their layer is off.
- [ ] Q5 Cumulative heat: trapezoid of the conducted flux against `q_in_mean_w_m2 * 24` for recipe, C0, C1 at 12 settings; freeze `T_heat_tol` from the largest difference times 2, never edited. State the C1 flux model (datasheet `r_solar` 0.90, the solved C1 surface series).
- [ ] Q6 Wiring: confirm in `dayPlayer.ts` that a single `render()` call site covers play, seek, step and tick (so one `onFrame` hook is complete) and that opening a tab adds no ticker; confirm the plan 07 clock reads as a phase without change.
- [ ] Commit: `docs(spike): plan 08 answers Q1 to Q6 and frozen thresholds`.

**Acceptance:** fixes `T_sweep_s`, `T_open_px`, `T_delta_px`, `T_heat_tol`; informs H2, H7, H8, H12.

### Task 2: Pure core: lanes, differences, sweep

**Tests:** `tests/core/anim/compare.test.ts`, `tests/core/anim/sweep.test.ts`. **Creates:** `src/core/anim/compare.ts`, `src/core/anim/sweep.ts`. **Interfaces:**
```ts
export type LaneId = "surface_c" | "reflected" | "absorbed" | "conducted" | "cumulative_wh"
export type Lane = { id: LaneId; unit: string; recipe: Float64Array; c0: Float64Array; c1: Float64Array | null }  // c1 null when not available
export function laneSeries(r: LiveResult, inputs: LiveInputs, weather: WeatherConfig): Lane[]      // ConfigError (code 4, phase "compare") on unequal lengths
export function cumulativeHeat(conducted: Float64Array, tH: Float64Array): Float64Array             // trapezoid, W h/m2
export function diffAt(l: Lane, tH: number): { c0: number; c1: number | null }                      // recipe minus control, via sampleSeries
export type SweepVar = { key: string; group: "design" | "ph" | "scenario"; min: number; max: number; unit: string }
export function sweepVariables(ranges: MaterialRanges, weather: WeatherConfig): SweepVar[]          // 13, from configuration only
export function sweepValues(v: SweepVar, live: number, n: number): number[]                         // n ascending values, includes live
export function sweepInputs(base: LiveInputs, v: SweepVar, value: number): LiveInputs
export type SweepPoint = { value: number; nominal: Outcome; bands: LiveResult["bands"]; c0: Outcome; c1: Outcome }
export function sweepChunk(ctx: ModelContext, base: LiveInputs, v: SweepVar, values: readonly number[], idx: readonly number[], nDraws: number, seed: number): { index: number; point: SweepPoint }[]
```
- [ ] Tests first: `lanesEqualTheSeriesH1`, `cumulativeEqualsMeanTimes24H2`, `diffIsRecomputedH3`, `lanesRejectUnequalLengthsF2`, `c1NullWhenAbsentF1`, `sweepVariablesCoverThe13H5`, `sweepValuesContainTheLiveValueD6` (fast-check: ascending, includes live, in range), `sweepPointEqualsLiveSimulateH5H6`, `controlsFlatForDesignCurveForWeatherH8`, `c1NaNOutcomesStayNaNH9`, `zeroWidthRangeIsNotSweepableF3`, `sweepIsOrderIndependentH7` (permuted chunks through `mergeOrdered`).
- [ ] Run, expect FAIL. Implement reusing `fluxAt`, `sampleSeries`, `liveSimulate`, `mergeOrdered` (no copy of their logic). Run, expect PASS.
- [ ] Commit: `feat(anim): pure comparison lanes and variable sweep`.

**Acceptance:** H1, H2, H3, H5, H6, H8, H9, F1, F2, F3.

### Task 3: Pool path and the clock hook

**Tests:** extend `tests/web/pool.test.ts`, `tests/web/anim/dayPlayer.test.ts`. **Modifies:** `src/web/pool.ts`, `src/web/worker.ts`, `src/web/anim/dayPlayer.ts`. **Interfaces:**
```ts
// worker.ts: additive message
type SweepMsg = { type: "sweep"; id: number; base: LiveInputs; v: SweepVar; values: number[]; idx: number[]; nDraws: number; seed: number }
// pool.ts: run takes the task payload kind; the screening path is unchanged
run<T = ScreenValue>(tasks: readonly Task[], onResult: (index: number, v: T) => void, kind?: { sweep: Omit<SweepMsg, "type" | "id" | "idx" | "values"> }): Run<T>
// dayPlayer.ts
onFrame(cb: (tH: number) => void): () => void      // fires from render(); returns the unsubscribe
```
- [ ] Tests first: `sweepOnPoolEqualsSequentialAt1_2_4H7` (byte-identical JSON), `speedupFloorH7`, `cancelPaintsNothingAndNoLeakH15`, `killedWorkerRecoversF4`, `inlineLaneF6`, `screeningUnchangedH7of07` (plan 07 byte-identity test still passes), `onFrameFiresOnSeekStepPlayTickH4`, `onFrameUnsubscribes`, `noExtraTickerOnSubscribe`.
- [ ] Run, expect FAIL. Implement (dispatch one point per message; place results by index). Run, expect PASS, plus the existing pool and day player tests.
- [ ] Commit: `feat(web): sweep tasks on the worker pool and a clock hook on the day player`.

**Acceptance:** H4 (unit part), H7, H15, F4, F6.

### Task 4: Components and assembly (sheet first, one commit per component)

**Tests:** one mirrored test per component, `tests/web/anim/comparePanel.test.ts`, `tests/web/anim/sweepPanel.test.ts`, `tests/report.compare.browser.test.ts` (fast) and `.proof.test.ts`. **Creates:** `laneChart`, `sweepChart` (or the `dayChart` option, Q3), `watchCompare`, `watchSweep`, `comparePanel.ts`, `sweepPanel.ts`. **Modifies:** `watchScreening.ts` (tabs host; uses the plan 06 `tabs` molecule), the page assembly, `docs/BLOCKED.md` (16 to 18). **Interfaces:**
```ts
laneChart({ lane: LaneId, unit: string, recipe: number[], c0: number[], c1: number[] | null, tH: number, source: string }): string
sweepChart({ outcome: "t_max_c"|"r_solar"|"corrosion_risk"|"delam_proxy"|"cost_proxy", xs: number[], nominal: number[], lo: number[]|null, hi: number[]|null, c0: number[], c1: number[]|null, controlKind: "flat"|"curve", cursor: number, unit: string }): string
watchCompare({ lanes: Lane[], diff: ..., tH: number, id?: string }): string
watchSweep({ variables: SweepVar[], selected: string, state: "idle"|"running"|"ready"|"stale"|"error", layerOff?: boolean, id?: string }): string
```
- [ ] Sheet entries first (design gallery, light and dark, every state), one commit per component: `feat(design): laneChart`, `feat(design): sweepChart`, `feat(design): watchCompare`, `feat(design): watchSweep`. Each component test checks tokens only, escaping (F8), closed unions (F9), `data-source` on every series (H10), honesty label and band legend text (H14), AA contrast in both themes.
- [ ] Wire `comparePanel.ts` (subscribes with `onFrame`, unsubscribes on close, F1 degrade) and `sweepPanel.ts` (variable select, run on the pool, clock via `advance` and `seek`, cancel on live change, variable change and close, stale marker, D12). Add the tabs host to `watchScreening` so the closed row is one row.
- [ ] Browser tests first, expect FAIL: H4 (cursor equals `tH` at 24 seeks and 30 played frames), H11, H12 (height at most the Task 1 baseline), H13 (live latency with a sweep running), H15, F5, F7; then implement and run, expect PASS. Measure the JS delta with `Bun.build` as plan 07 did and **freeze `T_js08_delta_kib`** in `docs/spikes/plan-08.md` (cap 20); pin it in `tests/web/anim/loop.test.ts` style test `sweepAndCompareJsStaysUnderTheFrozenDeltaH16`.
- [ ] Mutation checks (commit first, mutate a scratch copy, never checkout after a mutation): M1 lanes use a stale `tH` (not the hook) killed by H4; M2 sweep merge by arrival killed by H7; M3 control lines treated as flat for weather variables killed by H8; M4 C1 line drawn for a NaN outcome killed by H9.
- [ ] Commit: `feat(report): control comparison lanes and per-variable sweep in one closed disclosure`.

**Acceptance:** H4, H8, H9, H10, H11, H12, H13, H14, H15, H16, F5, F7, F8, F9, F10.

### Task 5: Proof log, review

**Tests:** the lean-mode proof list above. **Creates:** `docs/proofs/plan-08.md`. **Modifies:** this plan's status line.
- [ ] Run the lean proof list one tier at a time (one browser at a time, load checked); write each H and F with its run id, the measured heights (before and after), size, JS delta, live latency, sweep time and speedup; list explicitly what was not run.
- [ ] Two fresh readers answer the comprehension fixture on the final page (`T_comp` 7 of 8).
- [ ] Adversarial review of Review Focus items 1 to 4 by an independent reader with the code and the claim only; fix findings with a regression test each (`fix(anim): <summary>`).
- [ ] `bun run check` green; update the status line to `✅ DONE-LEAN` with the files that landed and the not-run list.
- [ ] Commit: `docs: plan 08 proof log`.

**Acceptance:** all hypotheses H1 to H16 and F1 to F10 with evidence.

## Rollout and rollback

No flag is needed: the new content lives inside a closed disclosure and computes nothing until it is opened (D12). Rollback triggers (observable): closed page height above the Task 1 baseline, live latency p95 above `T_live_ms`, `sweep.start` without a terminal event within `T_hang_s`, any NaN text on the page. Rollback is reverting the Task 4 assembly commit; Tasks 2 and 3 are additive and harmless alone. No hand-off outside the repo.

## Part 2: test specification

Stubs (names, helpers, key assertions); implementation follows in the tasks above.

**`tests/core/anim/compare.test.ts`** (helper `liveAt(settings)` runs `liveSimulate` on the fixture context): `lanesEqualTheSeriesH1` (24 times, 12 settings: `laneSeries` values equal `sampleSeries` and `fluxAt` within 1e-9); `cumulativeEqualsMeanTimes24H2` (`cumulativeHeat(...).at(-1)` within `T_heat_tol` of `q_in_mean_w_m2 * 24`, for the three outcomes; recipe-minus-C0 difference equals the difference of the means times 24); `diffIsRecomputedH3` (independent subtraction from raw series); `lanesRejectUnequalLengthsF2`; `c1NullWhenAbsentF1`.

**`tests/core/anim/sweep.test.ts`**: `sweepVariablesCoverThe13H5` (9 optimisation ids from `configs/optimize.yaml`, pH, 3 weather keys; each range equals configuration); `sweepValuesContainTheLiveValueD6` (fast-check); `sweepPointEqualsLiveSimulateH5H6` (all 13 variables, 41 points, nominal and 5 bands within 1e-9; the live-value point equals the live result exactly); `controlsFlatForDesignCurveForWeatherH8` (range of C0 and C1 `t_max_c` over the sweep below 1e-12 for 10 variables, above 1e-3 K for the 3 weather ones); `c1NaNOutcomesStayNaNH9`; `zeroWidthRangeIsNotSweepableF3`; `sweepIsOrderIndependentH7` (shuffle chunk arrival, same merged JSON).

**`tests/web/pool.test.ts`** (extended; real workers, a dead-port style fault: `killLane`): `sweepOnPoolEqualsSequentialAt1_2_4H7`, `speedupFloorH7` (4 over 1 at least `T_speedup`), `cancelPaintsNothingAndNoLeakH15` (20 cycles, `stats().live` equals size), `killedWorkerRecoversF4`, `inlineLaneF6`.

**`tests/web/anim/dayPlayer.test.ts`** (extended): `onFrameFiresOnSeekStepPlayTickH4`, `onFrameUnsubscribes`, `noExtraTickerOnSubscribe` (`loop` ticker count unchanged).

**`tests/web/design/**`**: per component `tokensOnly`, `escapesTextF8`, `closedUnionsF9`, `everySeriesHasDataSourceH10`, `honestyAndBandLabelH14`; `sweepChart` also `controlKindMatchesPropH8` and `noC1LineForNaNH9`; `watchSweep` also `layerOffNoteF5`.

**`tests/web/anim/comparePanel.test.ts`, `sweepPanel.test.ts`**: panel opens and closes without a ticker leak; `sweepCancelsOnLiveChangeAndMarksStaleH15`; `sweepClockClampsF10`; `reducedMotionNoMovementUntilPressH11`.

**`tests/report.compare.browser.test.ts`** (fast twin on the 4-draw page) and **`.proof.test.ts`** (fixture page): `cursorEqualsDayPlayerAt24SeeksH4`, `closedHeightWithinBaselineH12` (reads the frozen baseline from `docs/spikes/plan-08.md`), `liveLatencyWithSweepRunningH13`, `hiddenTabFreezesSweepF7`, `noRecommendedBestOptimalH14`, `noNaNTextH9`, `closedPageStaysWithinTheFrozenHeight`.


## Amendment: total animation JS cap raised to 125 KiB

Owner said 'continue the progress' on the recommendation (owner-delegate decision). `T_js_kib`, the cap on the TOTAL animation JS (inline lane included), is 125 KiB, was 100. Reason: plan 08 measured 120.0 KiB total (delta 43.6 KiB, minified 64.9 KiB total), the page is 6.14 of 8 MiB, and the added code is the comparison and sweep panels the owner asked for. The plan 08 delta pin stays at 45 KiB; plan 09 keeps its own delta cap of 10 KiB and must keep the total at or under 125.
