# Report Animation, Parallel Simulation and Bug Hardening Implementation Plan

Part 1 is the plan (tasks, hypotheses, faults). Part 2 is the test specification (stubs). Plan 07 of `plans/01-digital/`; it builds on plans 00 (live report), 05 and 04 (data) and 06 (design system).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the report a living simulation: a 24-hour day that plays and scrubs, the 96-candidate screening that visibly runs in parallel in the reader's browser, motion that explains the physics, and a hardened page with no known wiring or interaction bugs.

**Architecture:** Three parts. (1) *Hardening first*: a rerunnable browser QA script (`bun run qa`) and a build-time page lint turn the author's "a lot of bugs" into tested defects, fixed with one regression test each, before any new feature. (2) *Parallel engine*: a Web Worker pool (`src/web/pool.ts`) that runs the same pure models as the batch, 96 candidates by 9 weather scenarios (and the live 32 draws), with a deterministic merge so the result does not depend on the worker count and equals the batch nominal results. (3) *Animation layer*: pure timeline, easing and frame-sampling code in `src/core/anim/` (no clock, no DOM) driving small SVG/Canvas renderers in `src/web/anim/` through one `requestAnimationFrame` loop; every moving element is bound to model output, labelled as model output, pausable, and static under `prefers-reduced-motion`. The components follow the plan 06 atomic design system (sheet first, one commit each).

**Tech Stack:** Bun 1.3.14, TypeScript 7.0.2, Web Workers, SVG and Canvas 2D, plotly.js-dist-min 4.3.0 (existing figures), playwright 1.65.1 with installed Chrome (CDP CPU throttling, `page.clock`). No animation library and no new runtime dependency. Versions re-verified in Task 2 (dated 2026-11-22).

**Spec:** none; derived from this conversation (the user: there are many bugs, check the wiring; there is no animation or living, moving content and it is important to add because this is a parallel simulation). Depends on plan 06 (design system and light default theme and dark toggle) being merged; it reads plan 06's tokens, sheets and tests.

**Status:** ✅ DONE-LEAN (Tasks 1 to 7 landed; the full proof tier, an animation entry in the component gallery and a main-thread-time-per-frame measurement are not done, see `docs/proofs/plan-07.md`)

## What the operator does

1. Builds the report as before (`run`, optional `refine`, `budget-table`, `indonesia`, `report`). Nothing new to run; the animation code ships inside `report.html`.
2. Opens the report. In the section *Watch it run* a 24-hour day plays once on first view (paused and static if the system asks for reduced motion): the sun's irradiance curve, the bare aluminium roof and the recipe warming and cooling side by side, a time cursor, and heat arrows whose size follows the model's heat flux. A play/pause button, a scrubber, a speed control and a "step by hour" pair of buttons are always visible.
3. Presses *Run the screening in my browser*: 96 candidates by 9 weather scenarios (864 thermal simulations plus the optics, barrier and wetting models) run on a pool of workers, one lane per worker, a cell grid fills as results arrive, and the summary (how many pass, the cooling spread, the three picks) appears. It finishes in seconds on a laptop and its numbers equal the batch results (a check line says so, with the count of values compared).
4. Moves any live-simulator slider: numbers and bands glide to the new values instead of jumping; a small *computing* indicator shows while workers are busy.
5. Developers: `bun run qa` drives the built report in Chrome through every control and prints a list of defects (target: none), `bun run check` stays at or near 4 minutes, `bun run proof` adds the performance and throttling checks.

## Logging and debugging

Same schema as plans 03 and 06 (`safeJson`; no filenames or raw errors at info). In the browser the existing debug panel ring buffer receives the events; the QA script reads it. New events:

| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `anim.play` / `anim.pause` / `anim.seek` | info | day player | `source` (user, auto, reduced), `t_h` | per action |
| `anim.frame_stats` | info | animation loop | `frames`, `p50_ms`, `p95_ms`, `dropped` | once per second while playing |
| `pool.start` | info | pool | `workers`, `tasks` | per run |
| `pool.task.done` | debug | pool | `worker`, `task`, `ms` | per task |
| `pool.run.done` | info | pool | `workers`, `tasks`, `ms`, `speedup_est` | per run |
| `pool.run.cancelled` | info | pool | `done`, `tasks` | per cancel |
| `pool.worker.failed` | error | pool | `worker`, `code`, `phase` | per failure |
| `pool.fallback` | warn | pool | `reason` (no_worker_api, worker_failed) | per fallback |
| `page.lint.failed` | error | build | `rule`, `count`, `first_id` (an index) | per failure |
| `qa.defect` | error | QA script | `id`, `severity` | per defect |

Production (the shipped file) emits at info only; `debug` adds `pool.task.done` and one line per animation state change with literal names. Redaction: never user-entered text, never file paths. Runbook lines: `pool.worker.failed` then check `pool.fallback`; the page continues on the remaining workers or one inline lane and says so in the lane panel. A test per event; the event table is also checked against the emitters by a catalogue test (as plan 00).

## Scope

**In scope.** Bug hardening of the existing report (wiring, interactions, robustness); the day player; the parallel screening with lanes; the layer and heat-flux schematic with moving rays; the uncertainty fan (the 32 draws as lines); value tweening and the computing indicator; a motion token set and reduced-motion behaviour; a build-time page lint. **Out of scope.** New physics, new data, a hosted site, sound, 3D, video export (an animated GIF/MP4 export is recorded as BLOCKED-14: needs an encoder dependency and a size budget decision, owner Evint). Substrate stays bare aluminium; every PROXY and scenario-ageing label and every honesty rule of plans 00, 04, 05 and 06 stays.

**Standalone rules.** One offline HTML file; workers are created from an inlined Blob URL (as plan 00); no network; `src/core` pure (no clock, no `window`, no DOM, no `Math.random`); animation renderers live in `src/web`; time enters the core only as a number argument.

## Stack and versions

| Layer | Choice |
|---|---|
| Frame loop | one `requestAnimationFrame` loop in `src/web/anim/loop.ts`; pauses when the page is hidden; reads time from the rAF timestamp |
| Timeline math | `src/core/anim/{timeline,ease,frames}.ts` (pure): clock position, speed, loop modes, easing, series sampling with linear interpolation |
| Renderers | SVG for schematics and cursors (accessible, themeable by tokens), Canvas 2D only for the cell grid and the particle-like fan if SVG node count would exceed 1500 (Task 2 measures) |
| Parallel | `src/web/pool.ts` over the existing worker script; size `min(hardwareConcurrency − 1, 6)`, at least 1; fallback to one inline lane if `Worker` is unavailable |
| Charts | the existing Plotly figures; the day chart's moving cursor and the fan are overlays drawn by the renderers, not Plotly transitions, so the build stays simple |
| Motion tokens | durations and easings added to the plan 06 token set (`motion-fast`, `motion-base`, `motion-slow`, `ease-standard`), zeroed under reduced motion by the token compiler |
| Tests | bun:test, playwright (real Chrome, `page.clock`, CDP throttling), fast-check for the pure timeline code |

## Gaps this plan closes

Measured and observed on the plan 06 report: nothing moves; the live simulator re-renders figures instantly and tiles jump; a day of heating is shown only as a static line chart although the solver produces a full 24 h trace (144 points per scenario, with p5 to p95 bands and reference traces for bare aluminium and the datasheet control); the browser runs one worker and 32 draws, so the report cannot show that the screening is a parallel computation; the author reports many bugs and wiring problems that no test found (the existing tests check what was thought of, not what a user does); anchors, ids and control labels are not linted at build time.

## Alternatives considered and Risks

| Option | Decision |
|---|---|
| A video or animated GIF embedded in the report | Rejected: not live, not tied to the reader's inputs, large, and can lie about numbers; the user wants simulation, not a recording |
| Plotly animation frames and transitions for everything | Rejected for the cursor, fan and schematic: heavy, theme coupling, hard to pause and test; kept only where Plotly already draws the static chart |
| A JS animation library (GSAP, anime.js) | Rejected: a runtime dependency for what a 150-line loop and pure easing functions do; size and licence |
| SVG for every animated element | Chosen by default (accessible, token-themed); Canvas only where measured necessary (Task 2) |
| Run the full screening only in the batch, animate a recorded replay | Rejected: the user's point is that this is a parallel simulation; the browser can run the same models (864 solves take well under a second of CPU per core), so show it running for real and check it equals the batch |
| Decorative idle motion | Rejected: every moving element must carry data, be pausable, and be absent under reduced motion |

### Risks (pinned by tests)

| Risk | Pinned by |
|---|---|
| Motion makes the page inaccessible or nauseating | H5 reduced motion, H6 pause and 5-second rule; no parallax, no flashing above 3 per second |
| Animation shows something the models did not compute | H10 provenance of every moving value; H3 data-bound cursor; H11 fan equals the band |
| Parallel results depend on the worker count or arrival order | H7 byte-identical results for 1, 2, 4 workers and equality with the batch |
| Stale results painted after a newer run or a cancel | H8 newest-wins, no leaked workers |
| A dead or slow worker hangs the page silently | H9 failure visible, recovery or fallback, hang timeout |
| Jank on slow machines | H4 frame budget at 1× and 4× throttle; work stays off the main thread |
| Page grows beyond its budget | H12 height and size caps |
| A fix for one bug breaks another | one regression test per bug (H1), and `bun run qa` rerun in the gate |
| Plan 06 hypotheses regress (theme, contrast, comprehension) | H12 reruns; both themes tested for every new component |

## Requirements

FR-1 A rerunnable QA script MUST exercise every interactive control of the built report in Chrome and fail on any console error, page error, unhandled rejection, failed request, dead anchor, duplicate id, unnamed control, stale value or NaN text. FR-2 The page build MUST lint the generated HTML (anchors resolve, ids unique, every interactive element has an accessible name, every `data-hook` has a handler registered) and exit 4 on a violation. FR-3 The *Watch it run* section MUST play a 24 h day for the live recipe against bare aluminium from the model's solved series, with play, pause, scrub, step and speed (0.5×, 1×, 2×, 4×), keyboard operable. FR-4 The screening MUST run the same models as the batch for all 96 candidates and 9 scenarios on a worker pool, show one lane per worker and a cell grid, support cancel, and report its result with a visible equality check against the embedded batch results. FR-5 Results MUST be independent of worker count and arrival order. FR-6 Value changes MUST tween over `motion-base` and MUST NOT tween when reduced motion is requested. FR-7 Every moving element MUST be labelled "model output, not a measurement" at its container and MUST have a pause control reachable by keyboard; auto-play MUST be user-initiated or run once and stop within 5 s, and MUST be off under reduced motion. FR-8 All new components MUST pass the plan 06 rules (tokens only, both themes, AA contrast, 44 px targets, escaping, closed state unions, sheet first). FR-9 The closed page MUST stay at most `T_page_px` (9000) tall at 1280 px and the file at most `T_size_mib` (8). FR-10 Plan 00, 04, 05 and 06 hypotheses MUST keep passing, in particular live latency p95 at most `T_live_ms` (100). NFR-1 Main-thread work per animation frame at most 8 ms median. NFR-2 No new runtime dependency. NFR-3 Deterministic build (same bytes twice).

## Acceptance: hypotheses and proofs

| ID | Hypothesis (falsifiable) | Experiment and deciding observable | Falsified when |
|---|---|---|---|
| H1 | The built report has no known defect after hardening | `bun run qa` on the built report: counts of console errors, page errors, rejections, failed requests, dead anchors, duplicate ids, unnamed controls, NaN or `undefined` text, stale values after 50-event bursts; every bug from the Task 1 list has a regression test that fails on the pre-fix code (checked by running the test against the pre-fix commit in a scratch copy) | any count > 0, or a regression test that passes on the pre-fix code |
| H2 | The page lint can fail | seed each defect (dead anchor, duplicate id, unlabeled button, unregistered `data-hook`) into a copy of the template | the build still exits 0 for any seed |
| H3 | The day player is data-bound | at 24 scrub positions the displayed temperature values equal the solved series at that time (bare aluminium, recipe, band edges) within 1e-9; the time cursor position equals the scrub value | any mismatch |
| H4 | Frames are smooth | real Chrome, 5 s of playback at 1× speed: p95 frame interval ≤ `T_frame_ms` (20); with CDP CPU throttling 4×: p95 ≤ `T_frame_throttled_ms` (34); median main-thread time per frame ≤ 8 ms | any bound exceeded |
| H5 | Reduced motion is respected | `emulateMedia({reducedMotion:'reduce'})`: no autoplay, loop frame counter stays 0 until the user presses play, computed `transition-duration` is 0 on tweened elements, tiles jump instead of tween; all controls still work and the static frame shows the full day | any motion at load, any non-zero transition |
| H6 | Motion is controllable | every moving region contains a visible pause control reachable by Tab; Space toggles it; autoplay (when allowed) stops within 5 s or on first interaction; when the page is hidden the loop frame counter does not advance (`visibilitychange`); at most 3 luminance flashes per second anywhere | any breach |
| H7 | Parallel results are deterministic and equal the batch | the full screening on pools of 1, 2 and 4 workers returns byte-identical JSON; its nominal columns equal the embedded batch `results.csv` values within 1e-9 for all 864 cells; speedup of 4 workers over 1 worker ≥ `T_speedup` (frozen from the first measurement, hard floor 1.5) and a full screening takes at most `T_screen_s` on 4 workers (frozen from the spike) | any inequality, or speedup under the floor |
| H8 | Newest wins, nothing leaks | start a run and cancel after 150 ms, start another: no cell of the cancelled run is painted afterwards, all its workers are terminated within 500 ms; after 20 start/cancel cycles the live worker count equals the pool size | any stale paint or leaked worker |
| H9 | A worker failure is visible and survivable | terminate one worker mid-run through the `#test` hook: the lane shows failed, `pool.worker.failed` is logged, the remaining workers (or the inline lane) finish the run with the same result as H7, or the run ends with a visible error within `T_hang_s` (10); never a silent hang | silent hang, wrong result, or no message |
| H10 | Every moving value comes from the models | static check: each animated element declares its data source (`data-source`: series, outcome field, draw index) and the test resolves every declaration against the live result; the ray fractions equal `r_solar` and the arrow lengths scale with `q_in_mean_w_m2` (and absorbed/reflected shares) at 5 recipes within display precision; the container label text is present | any element without a resolvable source or any mismatch |
| H11 | The fan is the real ensemble | the 32 drawn lines are the draw series from `liveSimulate`; their pointwise p5 and p95 widened to the nominal equal the plan 00 band within 1e-9 | any difference |
| H12 | Earlier plans unaffected | rerun: plan 00 live latency (p95 ≤ 100 ms) and newest-wins, plan 06 H1 (closed height ≤ 9000 at 1280), H4 contrast in both themes for every new component, H6 size ≤ 8 MiB and offline, H13 determinism, comprehension fixture score ≥ 7 of 8 by two fresh readers on the final page | any regression |
| H13 | Tweening is correct and bounded | pure tests: easing endpoints (0 → 0, 1 → 1), monotone for the standard curve, tween never overshoots a bound, interrupted tween restarts from the current value (fast-check); a Chrome test sees tile values pass through intermediate values within `motion-base` and end exactly at the result | any overshoot or wrong end value |
| H14 | Page weight and height hold | closed height at 1280 ≤ 9000, with the *Watch it run* section included; file ≤ 8 MiB; animation JS adds at most `T_js_kib` (frozen after Task 3 from the measured size, hard cap 150) | any exceeded |

Thresholds (frozen once, never edited after): `T_frame_ms` 20, `T_frame_throttled_ms` 34, `T_speedup` frozen from the first measurement (floor 1.5), `T_screen_s` frozen from Task 2, `T_hang_s` 10, `T_js_kib` frozen after Task 3 (cap 150); inherited: `T_page_px` 9000, `T_size_mib` 8, `T_live_ms` 100, `T_comp` 7 of 8, `T_contrast_*`, `T_tap_px` 44.

**Fault-injection matrix** (edit exactly one input; expect phase, exit code or visible state, no stack trace):

| ID | Edit | Expected |
|---|---|---|
| F1 | a template with a dead `href="#nowhere"` | build exit 4, `page.lint.failed` rule `anchor` |
| F2 | two elements with the same id | exit 4, rule `duplicate_id` |
| F3 | a button with no text and no `aria-label` | exit 4, rule `control_name` |
| F4 | a `data-hook` with no registered handler | exit 4, rule `hook` |
| F5 | `Worker` constructor removed (`delete window.Worker`) before load | the screening runs on the inline lane, `pool.fallback` logged, same result as H7, lane panel says "single lane" |
| F6 | one worker terminated mid-run | H9 behaviour |
| F7 | the context JSON truncated | the worker errors, the page shows the error state in the lane panel and the live section, exit-free, no hang |
| F8 | the screening started with the tab hidden | the run proceeds (workers are not throttled for correctness) and the animation loop stays paused; results still correct |
| F9 | an unknown component state passed to a new molecule | build error exit 4 (closed union, as plan 06) |
| F10 | text containing `<img onerror>` in any new component field | escaped, no element created |
| F11 | a negative or NaN speed, or a seek outside 0 to 24 h | clamped at the pure layer; the loop never sees an invalid value |

**Given / When / Then:** G1 Given the report, when it first scrolls the day section into view, then a day plays once and stops, or is static under reduced motion (FR-3, FR-7, H5, H6). G2 Given the screening button, when I press it, then lanes and cells fill, it completes, and the check line says all 864 values match the batch (FR-4, H7). G3 Given a slider move, when values change, then they glide and the indicator shows computing (FR-6, H13). G4 Given a hidden tab, when I return, then playback resumed from where it paused (H6). G5 Given a broken anchor in a template, when I build, then the build fails (FR-2, H2).

## Execution contract: one shot, nothing left open

**Preflight gate.** Needed: plan 06 merged (design system, light default theme and toggle); a finished run in `reports/` with refine, budget-table and indonesia outputs, or the committed fixture run from plan 06; `node_modules`; Chrome installed. If any is missing, print the list and stop. The QA bug list from the plan 07 bug hunt (`docs/qa/bugs.md`, produced before Task 1 by the author's request and committed with this plan's first commit) is an input; Task 1 triages it.

No stub, TODO, skip or xfail. Task 2 is a spike and ends in written answers that fix Tasks 3 to 6. By-design limits go to `docs/BLOCKED.md` (BLOCKED-14 export of the animation as video/GIF; BLOCKED-15 screening on a phone: the pool is capped at 2 workers on narrow-core devices and the time is reported, not promised). Thresholds needing a measurement are frozen once from the first real run. Done means proven: every hypothesis holds with a run id in `docs/proofs/plan-07.md`, `bun run check` and the touched proof files green. If a task fails partway: stop, leave the tree clean, report the failing proof with its log. Out of scope for the run: merge and push (the user's go-ahead).

## Global Constraints

**Global constraints.** `bun run check` at or near 4 minutes under load; heavy and throttled checks in `*.proof.test.ts` with a fast twin (docs/testing.md); one component per commit; no attribution lines in commit messages; no new runtime dependency; never edit `vendor/`; never kill processes you did not start; one browser and one test process at a time; CPU rule.

## Review Focus

(1) A moving value that is not from the models (a pretty but invented animation). (2) Reduced-motion and pause behaviour: anything that moves without a way to stop it. (3) Results that differ between 1 and N workers, or from the batch, or arrive out of order. (4) Workers that leak, hang or fail silently. (5) Jank: main-thread work in the frame loop, layout thrash, an SVG with thousands of nodes. (6) Both themes for every new element, including Canvas drawing (colours read from tokens at draw time, redrawn on theme toggle). (7) Page height and file size creep past the caps. (8) Regressions in plan 00 behaviour (newest-wins, brush, latency).

## Decisions (all settled)

- D1 Hardening before features: Task 1 closes the bug list so new code is not built on defects.
- D2 No animation library; one rAF loop, pure timeline code, SVG first, Canvas only for the cell grid (864 cells) and the fan if measured needed.
- D3 The day player's data is the solved series the models already produce (24 h at 600 s, nominal, band, bare aluminium and the control); the player interpolates linearly between points and never invents values.
- D4 The pool runs the same worker script and the same pure functions as the batch; each task is one candidate by one scenario (or one live draw); results are placed by task index, never by arrival, so output is order-independent; size and chunking are not allowed to change a number.
- D5 Motion is explanatory only: the day (heat over time), rays and arrows (what is reflected, absorbed, conducted), lanes (what runs in parallel), tweens (what changed). No decoration, no idle loops.
- D6 Autoplay: once, when the section first enters the viewport, user-initiated alternatives always present; off under reduced motion; stops within 5 s; loop pauses when the tab is hidden.
- D7 Honesty labels: every animated container carries "model output, not a measurement" and PROXY values stay badged during motion; ageing scenarios stay labelled.
- D8 Placement: a new section *Watch it run* between *How the layers work* and *Indonesian climate*, compact (the day player at most 360 px tall and the screening at most 420 px at 1280, both closed height counted), with the screening panel inside a disclosure that opens with the button; if Task 2 shows the 9000 px cap cannot hold, the Verdict section keeps priority and the layer-flux schematic is dropped to Details, never the cap raised.
- D9 The batch equality check compares to embedded batch nominal values (the report already embeds results for the explorer); the check line states the count compared and the tolerance (1e-9).
- D10 Pool size `min(hardwareConcurrency − 1, 6)`, floor 1; a "workers" control lets the reader choose 1, 2, 4 or auto, which also demonstrates the parallel speedup (the measured speedup is displayed, labelled as this machine's measurement).

## File Structure (one source file, one mirrored test)

```
docs/qa/bugs.md                          the bug hunt list (input) and docs/qa/triage.md (Task 1 output)
src/node/report/lint.ts                  page lint (anchors, ids, names, hooks)
src/core/anim/{timeline,ease,frames}.ts  pure timeline, easing, series sampling
src/core/anim/screening.ts               pure task list and ordered merge for the 96 x 9 screening
src/web/anim/{loop,dayPlayer,fan,flux,tween}.ts   frame loop and renderers
src/web/pool.ts                          worker pool (size, cancel, failure, fallback)
src/web/design/atoms/{playButton,scrubber,speedSelect,timeReadout}.ts
src/web/design/molecules/{dayChart,laneMeter,cellGrid,fluxSchematic,computingIndicator}.ts
src/web/design/organisms/{watchDay,watchScreening}.ts
scripts/qa.ts (or src/node/qa.ts)        the browser QA driver behind `bun run qa`
tests/** mirrored one to one; tests/qa/regression/*.test.ts one file per fixed bug
```

The layout guard extends to `src/core/anim`, `src/web/anim` and the new design files.

## Tasks

### Task 1: Hardening: triage the bug list, fix with regression tests, add lint and `bun run qa`

**Tests:** `tests/node/report/lint.test.ts`, `tests/qa/regression/<bug-id>.test.ts` per bug, `tests/qa/qa.proof.test.ts`. **Creates:** `src/node/report/lint.ts`, `src/node/qa.ts`, `docs/qa/triage.md`. **Modifies:** the files each bug points to; `package.json` (`qa` script).
**Interfaces:**
```ts
export type LintRule = "anchor" | "duplicate_id" | "control_name" | "hook"
export function lintPage(html: string, hooks: readonly string[]): { rule: LintRule; id: string }[]   // empty = clean; build exits 4 on any entry
export async function runQa(htmlPath: string, opts: { cpuThrottle?: number }): Promise<QaReport>      // drives every control; QaReport lists defects with id, severity, repro steps
```
- [ ] Read `docs/qa/bugs.md` (the bug hunt output: 22 bugs, 0 blockers, 5 major) and write `docs/qa/triage.md`. One finding is a data question, not a UI bug, and must be decided here with evidence: the three budget priority profiles (cooling first, balanced, durability first) return effectively the same recipes at every budget (checked in `refine/budget_table.json`: 7 of 9 variables sit on the same bounds, only the scalar differs), so the priority chips change nothing. Decide and implement one of: show a single frontier and drop the chips, or keep the profiles only if a real trade-off can be shown with evidence, and record the decision (and a plan 05 text amendment) in the triage. Each bug gets: each bug with id, severity, verdict (fix, wontfix with reason, duplicate), and the test that will pin it.
- [ ] Tests first: `lintFailsOnSeededDefects` (F1 to F4, H2), `lintCleanOnRealPage`, one regression test per bug marked fix (it must fail on the pre-fix commit; record the commit hash in the test header and check it in the proof run), `qaFindsNothingOnFixedPage` (H1, proof tier; fast twin runs the QA on the small fixture page with a reduced control set).
- [ ] Run, expect FAIL, implement fixes and lint, run, PASS. Commit per bug group: `fix(report): <summary>`; then `feat(report): page lint at build and a browser QA script`.

**Acceptance:** H1, H2, F1 to F4.

### Task 2: Spike Q1 to Q6 (fixes Tasks 3 to 6)

**Tests:** `docs/spikes/plan-07.md` with runnable scripts under `docs/spikes/plan-07/` that exit 0 only when every expectation holds.
- [ ] Q1 Cost of the models in the browser: time the 864-cell screening on 1, 2, 4, 6 workers (real Chrome, this machine) and per-cell cost; freeze `T_screen_s` and `T_speedup`; confirm the pool beats one worker by at least 1.5× or record why not and what chunking fixes it.
- [ ] Q2 Frame budget: a prototype of the day player (SVG) and the cell grid (SVG versus Canvas at 864 cells) with p50 and p95 frame times at 1× and 4× throttle; choose SVG or Canvas per element (D2).
- [ ] Q3 Placement and height: build the section skeleton at the real sizes inside the plan 06 page and measure closed height; confirm ≤ 9000 or apply D8; record the height numbers per section.
- [ ] Q4 Reduced motion and visibility semantics in Chrome: how `prefers-reduced-motion` and `visibilitychange` are observed; the `page.clock` approach for deterministic tests.
- [ ] Q5 Data available: confirm the embedded batch results contain the nominal columns needed for H7's equality, the context JSON carries all 96 designs and the 9 scenarios (add them if not, with the size cost), and that `liveSimulate` exposes the 32 draw series for the fan (H11), else extend it without changing numbers.
- [ ] Q6 Ray and arrow semantics: write the mapping from model outputs to ray fractions and arrow lengths (reflected = `r_solar`, absorbed = `1 − r_solar`, conducted share from `q_in`), checked against a hand calculation for two recipes.
- [ ] Commit: `docs: spike answers for report animation and parallel simulation`

**Acceptance:** fixes D2, D8, D10 and the frozen thresholds.

### Task 3: Pure timeline, easing, frames and screening core

**Tests:** `tests/core/anim/{timeline,ease,frames,screening}.test.ts`. **Creates:** `src/core/anim/*`.
**Interfaces:**
```ts
export function advance(s: ClockState, dtMs: number, speed: number): ClockState        // loop modes: once, loop, hold; clamps; no clock inside
export function seek(s: ClockState, tH: number): ClockState                               // clamps to 0..24 (F11)
export function easeStandard(x: number): number                                           // 0 -> 0, 1 -> 1, monotone, no overshoot
export function tween(from: number, to: number, elapsedMs: number, durMs: number): number
export function sampleSeries(t: Float64Array, v: Float64Array, tH: number): number       // linear, clamped
export function screeningTasks(nCandidates: number, nScenarios: number): { index: number; candidate: number; scenario: number }[]
export function mergeOrdered<T>(parts: { index: number; value: T }[], n: number): T[]    // places by index, throws on a missing or duplicate index
```
- [ ] Tests first: `advanceNeverEmitsInvalidTime` (fast-check over speeds, dt, modes), `seekClampsF11`, `easeIsMonotoneAndHitsEndpoints`, `tweenNeverOvershoots` (H13), `interruptedTweenRestartsFromCurrent`, `sampleSeriesMatchesExactAtNodes`, `mergeIsOrderIndependent` (shuffle arrival, same result), `mergeRejectsMissingAndDuplicate`.
- [ ] Run, FAIL, implement, PASS; freeze `T_js_kib` after measuring the bundle size. Commit: `feat(anim): pure timeline, easing and ordered merge`

**Acceptance:** H13 (pure part), supports H7.

### Task 4: Worker pool and the live screening engine

**Tests:** `tests/web/pool.test.ts` (fast, real Workers in Chrome through the page test harness), `tests/core/anim/screening.test.ts` (equality with batch in Bun), `tests/pool.proof.test.ts`. **Creates:** `src/web/pool.ts`; **Modifies:** `src/web/worker.ts` (a `screen` message that evaluates one task through the same pure functions as the batch), `src/core/pipeline/contextJson.ts` only if Q5 requires.
**Interfaces:**
```ts
export type Pool = {
  size: number
  run<T>(tasks: readonly Task[], onResult: (index: number, v: T) => void): Run<T>   // Run: { done: Promise<T[]>; cancel(): void }
  terminate(): void
}
export function createPool(size: number | "auto", workerUrl: string, ctxJson: string): Promise<Pool>   // falls back to one inline lane when Worker is missing (F5)
```
- [ ] Tests first: `screeningEqualsBatchNominalIn1e9` (H7, in Bun, all 864 cells against `results.csv`), `sameBytesForOneTwoFourWorkers` (H7, browser), `speedupAtLeastFloor` (proof tier), `cancelPaintsNothingAndTerminates` (H8), `noWorkerLeakAfter20Cycles` (H8), `killedWorkerIsVisibleAndRecovers` (H9, F6), `missingWorkerApiFallsBackToOneLane` (F5), `truncatedContextShowsErrorState` (F7), `hiddenTabStillCorrect` (F8).
- [ ] Run, FAIL, implement, PASS. Commit: `feat(pool): deterministic worker pool and live screening`

**Acceptance:** H7, H8, H9, F5 to F8.

### Task 5: Animation components (sheet first, one commit per component)

**Tests:** `tests/web/design/atoms/*.test.ts`, `molecules/*.test.ts`, `organisms/*.test.ts`, `tests/web/anim/*.test.ts` (loop, tween, day player, fan, flux). **Creates:** the files in the File Structure section; sheet entries in `docs/design/report-sheets.md` written first for each component (purpose, tokens, states, contract, accessibility, motion rule, do and don't).
- [ ] Order: motion tokens in the token compiler (zeroed under reduced motion), then playButton, scrubber, speedSelect, timeReadout, computingIndicator, laneMeter, cellGrid, dayChart (SVG with `data-source` attributes), fluxSchematic (rays and arrows from Q6 mapping, `data-source`), fan, then organisms watchDay, watchScreening. Each: sheet entry, tests first (every state, escaping F10, closed unions F9, both themes, 44 px, keyboard, reduced motion), implement, own commit `feat(design): <Name>`.
- [ ] The loop (`src/web/anim/loop.ts`) is its own commit: one rAF, visibility pause, frame stats event, deterministic under `page.clock`, `#test` hooks only with the fragment.
- [ ] Tests: `dayPlayerIsDataBound` (H3), `ragraysAndArrowsMatchModelOutputs` (H10), `fanLinesAreTheDrawsAndMatchTheBand` (H11), `everyAnimatedElementDeclaresASource` (H10), `reducedMotionNoAutoplayNoTween` (H5), `pauseControlsAndVisibilityPause` (H6), `noMoreThanThreeFlashesPerSecond` (H6).

**Acceptance:** H3, H5, H6, H10, H11, H13, F9, F10, F11.

### Task 6: Assembly, tweening, honesty and performance

**Tests:** `tests/web/design/templates/reportPage.test.ts` (updated), `tests/report.animation.browser.test.ts` (fast) and `.proof.test.ts` (throttled), `tests/node/report/lint.test.ts` (page includes the new section). **Modifies:** `src/web/design/templates/reportPage.ts`, `src/node/report/{html,content}.ts`, `src/web/main.ts` (tweened tiles and the computing indicator, theme toggle redraws of Canvas and SVG from tokens), `src/web/figures.ts`.
- [ ] Place *Watch it run* per D8, keep the page lint clean and the closed height ≤ 9000.
- [ ] Tests first: `frameBudgetAt1xAnd4xThrottle` (H4), `tilesGlideAndEndExactly` (H13), `watchItRunKeepsClosedHeightUnder9000` (H14), `bothThemesRedrawCanvasAndSvg`, `honestyLabelOnEveryMovingContainer` (H10, plan 06 H8 scan extended), plan 00 and 06 suites unchanged and green (H12).
- [ ] Rebuild `reports/report.html`, `reports/components.html` and the screenshots (a still frame per animation in both themes, plus a short frame sequence strip) and view them; fix visible defects.
- [ ] Commits: `feat(report): watch-it-run section with day player and parallel screening`, `feat(report): value tweening and computing indicator`.

**Acceptance:** H4, H12, H13, H14.

### Task 7: Proof, review

**Tests:** mutation checks and the proof log.
- [ ] Mutations (commit first, copy to the scratchpad, never mutate the tree): M1 merge by arrival order instead of index → H7 fails; M2 drop the visibility pause → H6 fails; M3 autoplay ignores reduced motion → H5 fails; M4 fan draws a different seed → H11 fails; M5 an arrow length uses a constant → H10 fails; M6 skip worker termination on cancel → H8 fails; M7 tween overshoots → H13 fails; M8 `lintPage` ignores duplicate ids → H2 fails. A surviving mutant means strengthen the test first.
- [ ] `docs/proofs/plan-07.md`: run ids and observables for H1 to H14, F1 to F11, the mutation table, measured speedup, frame statistics, heights before and after, the bug list with test names, and the comprehension rerun result on the final page (two fresh readers, at least 7 of 8; the fixture is not edited).
- [ ] `bun run check` and each touched proof file once, one at a time. One adversarial review and one fix wave. Commit: `test(anim): mutation checks and proof log for plan 07`.

**Acceptance:** H1 to H14, F1 to F11.

## Rollout and rollback

No flag; the animation ships inside the report. A reader who prefers no motion gets it from the operating system setting, and the page also offers a visible "Reduce motion" switch in the section header that sets the same state (tested). Rollback: `git revert` of the plan 07 range; results and manifests are unaffected. Observable rollback triggers: any H12 regression, p95 live latency above 100 ms, closed height above 9000, a leaked worker in the QA script. Hand-offs outside the repo: none (BLOCKED-14 and BLOCKED-15 owner Evint).

## Part 2: test specification

```ts
// tests/core/anim/frames.test.ts
test("mergeIsOrderIndependent", () => {
  const parts = tasks.map((t) => ({ index: t.index, value: evaluate(t) }))
  for (const seed of [1, 2, 3]) expect(mergeOrdered(shuffle(parts, seed), tasks.length)).toEqual(mergeOrdered(parts, tasks.length))
})
test("seekClampsF11", () => {
  expect(seek(initial, -5).tH).toBe(0); expect(seek(initial, 99).tH).toBe(24); expect(seek(initial, Number.NaN).tH).toBe(0)
})

// tests/core/anim/screening.test.ts
test("screeningEqualsBatchNominalIn1e9", async () => {
  const cells = await screenAllInBun(ctx)               // 864 cells through the same pure functions
  for (const c of cells) expect(Math.abs(c.t_max_c - batch(c.candidate, c.scenario).t_max_c)).toBeLessThan(1e-9)
})

// tests/web/pool.test.ts (real Chrome)
test("sameBytesForOneTwoFourWorkers", async () => {
  const a = await runScreening(page, 1), b = await runScreening(page, 2), c = await runScreening(page, 4)
  expect(b).toBe(a); expect(c).toBe(a)                  // JSON strings
})
test("killedWorkerIsVisibleAndRecovers", async () => {
  const run = startScreening(page, 4); await page.evaluate(() => window.__killWorker(1))
  await expect(page.locator("[data-lane='1'][data-state='failed']")).toBeVisible()
  expect(await run.result()).toBe(await runScreening(page, 1))   // same bytes
})

// tests/report.animation.browser.proof.test.ts
test("frameBudgetAt1xAnd4xThrottle", async () => {
  for (const [throttle, limit] of [[1, T_FRAME_MS], [4, T_FRAME_THROTTLED_MS]] as const) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
    const stats = await playFor(page, 5_000)
    expect(stats.p95).toBeLessThanOrEqual(limit)
  }
})
test("reducedMotionNoAutoplayNoTween", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await openReport(page)
  expect(await page.evaluate(() => window.__anim.frames)).toBe(0)
  expect(await computedTransitionDuration(page, "[data-tween]")).toBe("0s")
})

// tests/node/report/lint.test.ts
test("lintFailsOnSeededDefects", () => {
  for (const [rule, html] of seededDefects()) expect(lintPage(html, HOOKS).map((d) => d.rule)).toContain(rule)
})
```
