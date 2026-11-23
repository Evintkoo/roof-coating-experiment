# Live Physics Animation Implementation Plan

Part 1 is the plan (tasks, hypotheses, faults). Part 2 is the test specification (stubs). Plan 09 of `plans/01-digital/`; it builds on plan 07 (one rAF loop, day player, pool, flux, honesty rules), plan 08 (comparison lanes, tabs in the closed disclosure, `onFrame` hook) and plans 00 (live simulator), 02 and 04 (physical models, climate), 06 (design system). **It executes only after plan 08 is merged on the branch** (preflight checks this).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the reader watch the physics of the coating run live: sunlight splitting into reflected and absorbed fractions at the stack, the surface temperature integrating the heat balance in real time, the radiation, convection and conduction fluxes as arrows, side by side with bare aluminium, and all of it responding while the reader drags the sun, air and wind sliders.

**Architecture:** Three layers, all reading the repo's models and inventing nothing. (A) *Live stepper* (pure, `src/core/anim/stepper.ts`): the same single-node RK4 balance as `simulateDay` (`netFluxWM2`, dt 60 s), exposed as a resumable stepper that holds `(model time, T)` and takes new scenario parameters at any step boundary. It runs in a Web Worker at a fixed model dt, deterministic, and returns state and flux terms to the page; the first live day starts from the batch's day-1 end state, so with untouched sliders it reproduces the batch day 2 exactly. (B) *Spectral view* (pure, `bands.ts`): the model's reflectance spectrum `R(lambda)` (`LiveResult.spectrum`) and the ASTM G173 irradiance cut into UV, visible and NIR bands, giving per band the share of sunlight and the reflected fraction; the ray counts are quotas of these numbers. (C) *Scene* (one molecule plus one organism from the plan 06 design system): the stack cross-section with rays, flux arrows, a temperature readout and a drop line from the surface to the inside, for the recipe and bare aluminium (C0) side by side, ticked by the plan 07 single loop. The scene is a **fourth tab, "Live physics", inside the plan 08 closed disclosure**, so the closed page does not grow.

**Honest scope of the physics (from reading the code, to be confirmed by the Task 1 spike):** the thermal model is **lumped, one node**: `thermal.ts` and `thermalSeries.ts` solve one surface temperature `T(t)` with one areal heat capacity `c_a` and one total resistance `R_total` to the inside. There is **no temperature field through the layers or the substrate** in any model of the repo. The plan therefore does not animate a through-thickness field. It draws the two temperatures the model has (surface `T_s`, inside `T_in`) joined by the model's own conduction law `q = (T_s - T_in) / R_total` (a straight drop, labelled "Illustrative scale: the model has one surface temperature, not a temperature per layer"). A real 1D finite-difference conduction through the layers would be new physics with new material data (conductivity and heat capacity per layer, which `configs/` does not hold); it is out of scope and listed as owner decision O1. Likewise the model has `R(lambda)` for the whole stack and the solar-weighted `r_solar`, but **no absorption per layer** (the substrate is opaque aluminium, so the non-reflected part is absorbed and nothing is transmitted): the rays show reflected against absorbed, per band, and never a split of the absorbed part between layers.

**Tech Stack:** Bun 1.3.14, TypeScript 7.0.2, Web Workers, inline SVG or Canvas 2D (decided by the Task 1 spike on measured frame cost), playwright 1.65.1 with installed Chrome, as plans 07 and 08. No new runtime dependency, no animation or physics library. Versions re-verified in Task 1 (dated at the run).

**Spec:** none; derived from this conversation. The owner's request, verbatim: "and i need live animation with pysics etc". **Interpretation (stated, not assumed):** a live, continuously running physics visualisation driven by the repo's real model equations, not decorative: (1) rays that split into reflected and absorbed fractions per spectral band from `R(lambda)`, with a scattering visual in the midcoat; (2) the surface temperature and the conduction drop evolving in real time from the repo's RK4 thermal model in a worker, moving as the sun, air and wind sliders are dragged; (3) radiation, convection and conduction arrows scaled by the model's fluxes; (4) side by side with the bare-aluminium control, on plan 07's single loop. "Etc" is read as: nothing else is promised. If the owner means more (a through-thickness field, turbulence, individual photon trajectories), see O1 to O3; the pure core and the worker path stay.

**Status:** 📋 PLANNED

## What the operator does

Reader of the report (about 2 minutes, no setup):

1. Scrolls to *Watch it run* (plan 07) and opens the one closed disclosure (plan 08: "More ways to watch: screening, controls, one variable at a time"; plan 09 adds the tab and the words "live physics" to the same row, still one row). Nothing starts by itself. Picks the tab *Live physics*.
2. Sees two columns, the recipe stack and bare aluminium, each a cross-section (topcoat, midcoat, primer, aluminium, then a line to the inside) with the label "Illustrative scale: layer thicknesses are not to scale". Presses *Play* (or Space): sunlight rays fall onto both stacks. In the recipe column most rays turn back (reflected, with the UV, visible and NIR shares in their band colours) and a few are absorbed; in the aluminium column more are absorbed. Scattering marks appear inside the midcoat. The ray density follows the sun's `G(t)` over the simulated day (day 16 s at 1x, 4 s at 4x).
3. Watches arrows at the surface: absorbed solar in, radiated out, convected out, conducted in. The surface temperature number and the heat-balance residual move; the readout says "recipe minus aluminium: -7.8 K" live.
4. Drags the *sun*, *air temperature* or *wind* slider (the panel carries its own three, bound to the same live state as the live simulator, so there is one source of truth). The ray density, the arrows and the temperature follow within one frame; the surface temperature relaxes toward the new settled day and the panel says "transient after your change, not the settled day". Presses *Restart day* to begin again from the batch state.
5. Presses *Pause* any time; closing the disclosure or hiding the tab stops everything. Under reduced motion nothing moves until Play is pressed, and then it advances in steps of the step buttons only (one model hour per press) with no particle motion; the numbers and arrows still update.
6. Developers: `bun run check` (fast tier) and `bun run proof` (browser tier); `bun run qa` also drives the new controls. (Target: first frame after opening in under 1 s.)

## Logging and debugging

Same schema as plans 03, 06, 07 and 08 (`safeJson`; no filenames or raw errors at info). New events (the browser debug ring buffer receives them; `bun run qa` reads it):

| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `physics.open` | info | physics panel | `panes` (2), `renderer` (svg, canvas), `lane` (worker, inline) | per open |
| `physics.play` / `physics.pause` / `physics.restart` | info | physics panel | `source` (user, reduced, hidden, closed), `speed` | per action |
| `physics.params` | info | physics panel | `changed` (key list: irradiance, t_air, wind), `step` (model step index) | per change, coalesced to one per frame |
| `physics.step` | debug | stepper lane | `n`, `ms` | per request, debug only, capped by the loop's frame-stats window |
| `physics.late` | info | physics panel | `frames_waited` | per frame whose reply came after the frame; at most 1 per second |
| `physics.lane.failed` | error | stepper lane | `reason` (`worker_failed`, `no_worker`, `physics_range`) | per failure |
| `physics.closure` | debug | stepper lane | `residual_w_m2`, `step` | per request, debug only |
| `physics.error` | error | physics panel | `reason`, `pane` | per failure |

Production: info only, and every failure is diagnosable from info (`physics.open` then `physics.lane.failed` or `physics.error`; a stalled run shows `physics.late` repeating). Dev and staging: debug, with the literal step names above. Redaction: slider values are logged by key and step index only, never as recipe values; no filenames or raw errors. Alert rule (QA script): `physics.play` with no frame advance within `T_hang_s` (plan 07, 10 s) is a defect. Log size: the plan 07 ring buffer cap holds; per-step events are debug and not recorded in production. A test per event (browser test emits each; none carries a recipe value). Runbook: if the scene freezes, read the last `physics.*` event; `worker_failed` means the inline lane takes over (same code, same result, F4) and the panel says "single lane"; `physics_range` means a slider left a model range (a bug in the slider range, F3); repeated `physics.late` means the worker round trip exceeds a frame (Task 1 Q1 measures it; the scene then repeats the last frame and model time does not advance, so nothing drawn is ever ahead of the model).

## Scope

In scope: the pure stepper (reusing the thermal step), the spectral band split and ray quotas, the balance terms and closure, the conduction drop, one additive worker message pair, one scene molecule, one temperature-drop molecule, one organism, one panel wiring, the fourth tab, tests, proof log. Out of scope: a temperature field through layers or substrate (O1), absorption per layer (not in the model), individual photon or Mie-scattering trajectories, wind or turbulence flow simulation, radiation beyond the model's two terms (long-wave sky exchange only as `eps sigma (T^4 - T_sky^4)`), ageing, moisture, the 32-draw band in the live scene (the plan 07 fan and plan 08 lanes keep that), export as video or GIF (BLOCKED-14), any change to an existing model number, the Python or Rust code.

Platform rules: one offline HTML file, byte-identical for the same run id, no network, no new dependency, `vendor/` untouched, design-system components only (no raw colour, spacing or font literal; the plan 06 token tests cover the new components).

## Stack and versions

| Part | Choice |
|---|---|
| Runtime and tests | Bun 1.3.14, `bun test`, fast-check 4.10.3, playwright 1.65.1 (as plans 07 and 08) |
| Thermal model | `netFluxWM2`, `simulateDay`, `simulateSeriesDay` (`src/core/models/thermal.ts`, `thermalSeries.ts`): single node, RK4, dt 60 s, T0 = air temperature, 48 h with day 2 reported; one additive export of the step so the stepper shares the exact arithmetic |
| Optics | `LiveResult.spectrum` (`R(lambda)` of the stack on the 0.3 to 2.5 um grid, nominal), `solarWeighted`, the ASTM G173 spectrum in the context (`optics.ts`); R beyond 2.5 um is held constant to 4 um (documented bias, R_solar high) and the NIR band note says so |
| Scattering | `midcoatSpectrum` and `kmCoefficients` (`optics.ts`, `mie.ts`); whether their `S(lambda)` can be exposed additively is Q3 |
| Clock and loop | plan 07 `loop.ts` (one rAF chain, ticker added only while playing), `advance`, `seek` (`timeline.ts`), plan 08 `onFrame` and tabs |
| Parallelism | `src/web/worker.ts` (additive message pair), inline lane as plan 07 F5 |
| Randomness | `src/core/rng.ts` (`Xoshiro128`, `deriveSeed`) only for the visual jitter of ray start positions; no model quantity is random |
| Rendering | SVG or Canvas 2D by the Q2 rule below; text and arrows always SVG/HTML for accessibility |

## Gaps this plan closes

1. The day player replays a precomputed series: it cannot react to a slider mid-day and shows no radiative, convective or per-band picture.
2. The balance behind `t_max_c` (absorbed, radiated, convected, conducted, stored) is never shown; `flux.ts` has only incident, reflected, absorbed and conducted.
3. The spectral reflectance exists in the result but the reader only sees one number, `r_solar`.
4. The worker and loop exist but nothing integrates the physics live.

## Alternatives considered and Risks

| Option | Verdict |
|---|---|
| Replay the precomputed series faster (a new view of the same data) | Rejected as the main design: not live; a slider mid-day cannot change the future of a replay. The plan 08 lanes and plan 07 day player stay for replays. |
| Main-thread stepper, no worker | Not rejected on cost (RK4 at 60 s steps is about 360 steps per second at 4x; Q1 measures it) but the request asks for a worker and the worker keeps the main thread free for painting: worker by default, same pure code in the inline lane as fallback (F4). |
| Real 1D finite-difference conduction through the layers | Rejected: new physics, and `configs/` has no conductivity or heat capacity per layer. Offered as O1; never faked. A decorative gradient is exactly what plan 07 H10 forbids. |
| Linear drop from the surface to the inside, drawn as illustrative | Chosen: it is the model's own conduction law, uses only `T_s`, `T_in`, `R_total`, and is labelled. |
| Monte Carlo photons through the stack | Rejected: new stochastic physics, not what the model computes; the rays are deterministic quotas of model fractions. |
| Canvas for everything | Decided by Q2 on measurement, not preference: SVG if 150 rays hold `T_frame_ms` at 4x throttle, Canvas for the rays only otherwise (labels and arrows stay SVG). |
| Autoplay on open | Rejected (D9): plan 07 FR-7 allows only user-initiated or once-and-stop; opening a disclosure is not a play request. O2 asks whether the owner wants it. |
| Chosen | Pure stepper and band core, worker lane, one scene, one tab in the closed disclosure, one loop. |

### Risks (pinned by tests)

| Risk | Pinned by |
|---|---|
| A moving quantity is not a model output (a drawn gradient, a made-up per-layer temperature, an invented scattering) | H8, H9, H10 (`data-source` on every element; the profile has exactly two model temperatures) |
| The live stepper drifts from the batch solver | H1 (equal to `simulateDay` and `simulateSeriesDay` day 2) |
| The balance does not close, so an arrow is wrong | H2 (residual below `T_closure_w_m2`) |
| Result depends on frame timing, worker count or the machine | H3 (replay of a request log, byte-identical) |
| A slider change makes the state jump | H4 (continuity and independent recomputation) |
| Ray counts do not match the fractions | H5, H6 |
| Two clocks | H11 (one loop; at most one extra ticker, only while playing) |
| A moving thing that cannot be stopped, or flashes | H11 |
| Frames drop on slow devices | H12 (throttled 4x is measured in this plan) |
| Page grows past 9000 px or the file past 8 MiB | H13, `closedPageStaysWithinTheFrozenHeight` |
| Earlier plans regress (live latency, screening, sweeps) | H14 |
| Wording overclaims ("best", "recommended", a through-thickness field, "real-time measurement") | H15 |
| Stale reply paints after a slider change; workers leak | H16 |
| Physics step in a worker repeats a frame so the picture lags the model | `physics.late` logged, H12 bounds it; the scene never runs ahead of computed model time (H3) |

## Requirements

FR-1 The panel MUST integrate the model's surface-temperature balance live, at a fixed model step `T_dt_s` (60 s, the batch step), for the recipe and for bare aluminium (C0) from the same code, in a Web Worker with an inline fallback. FR-2 With untouched sliders, the first live day MUST equal the batch day 2 (`t_surface_k` of the solved series, `t_max_c`, `q_in_mean_w_m2`) within `T_stepper_tol`. FR-3 A change of the sun, air temperature or wind input MUST apply at the next step boundary with the state `(time, T)` continuous, and the panel MUST say the following days are a transient, not the settled day. FR-4 The balance terms (absorbed `(1-R_solar) G`, radiated `eps sigma (T^4 - T_sky^4)`, convected `h (T - T_air)`, conducted `(T - T_in)/R_total`, stored `c_a dT/dt`) MUST be computed by the model's own `netFluxWM2` terms and shown as arrows whose lengths are proportional to the flux; the residual MUST be shown. FR-5 The rays MUST be split by band (UV 0.3 to 0.4, visible 0.4 to 0.7, NIR 0.7 to 4.0 um) with the share of sunlight and the reflected fraction of each band taken from `R(lambda)` and the G173 spectrum, so the reflected ray count per band equals the model fraction to within one ray, and the weighted sum equals `r_solar`. FR-6 The ray density MUST follow the model's incident irradiance `G(t)`; rays are drawn to show fractions, not to track photons, and the panel MUST say so. FR-7 The scattering visual in the midcoat MUST be driven by a model quantity (Q3 decides which; if none can be exposed additively, the visual is dropped, not faked) and MUST vanish when the midcoat is off. FR-8 The through-thickness drawing MUST contain only the surface and inside temperatures and the model's straight conduction law, labelled "Illustrative scale", and MUST NOT show a temperature per layer. FR-9 The panel MUST show recipe and C0 side by side with the live difference; C1 (datasheet) appears only as a number in the readout where plan 08 already shows it, never as an animated stack. FR-10 Controls: Play and Pause (Space), speed 0.5x, 1x, 2x, 4x, Restart day, step buttons (one model hour), three scenario sliders bound to the live state, and a visible "Illustrative scale" label. FR-11 Nothing MUST autoplay; every moving region has a pause control; reduced motion shows no particle motion and advances only on a press; the loop pauses with the tab hidden or the disclosure closed. FR-12 The closed page MUST be at most `T_page_px` and not taller than after plan 08 (`T_delta_px` 0). FR-13 Every figure carries "Model output, not a measurement"; PROXY badges are not needed (no proxy outcome is shown); the words "recommended", "best", "optimal" MUST NOT appear in the new components. FR-14 Components come from the plan 06 design system with sheet-first entries and token-only styling. NFR-1 Animation JS added by this plan at most `T_js09_delta_kib`, and the plan 07 `T_js_kib` 100 total still holds. NFR-2 No change to any existing number (plan 00 live latency, plan 07 H7 equality, plan 08 sweep equality). NFR-3 Per-frame main-thread work at most 8 ms median.

## Acceptance: hypotheses and proofs

| ID | Hypothesis (falsifiable) | Experiment and deciding observable | Falsified when |
|---|---|---|---|
| H1 | The live stepper is the batch solver | at 12 settings (recipe and C0, both the half-sine scenarios and the hourly series), stepping the day-1 state to the end of the next 24 h at dt 60 s gives the same 144 output points, `t_max_c` and `q_in_mean_w_m2` as `simulateDay` and `simulateSeriesDay` day 2 within `T_stepper_tol` (planned 1e-12, frozen from Q4) | any mismatch |
| H2 | The heat balance closes | at each step node the five terms satisfy `|absorbed - radiated - convected - conducted - c_a dT/dt| <= T_closure_w_m2` where `dT/dt` is the RK4 slope at that node (frozen from Q4 at twice the largest residual at 12 settings); an independent check recomputes the terms from raw inputs sharing no code with the panel | any step above the bound |
| H3 | The stepper is deterministic and frame-independent | replay one logged request sequence (counts and parameter changes by step index) on the worker, the inline lane, and with artificial 0, 7 and 40 ms delays: byte-identical states and flux frames | any difference |
| H4 | A live change is continuous and correct | after a slider change at step k, `T(k)` equals `T(k)` before the change exactly; the next 1,440 steps equal an independent RK4 run (written in the test from `netFluxWM2` only) from that state with the new parameters within `T_stepper_tol`; after `N_settle` further days the day-max is within `T_settle_k` of `liveSimulate`'s nominal `t_max_c` for the new settings (`N_settle` and `T_settle_k` frozen from Q5) | discontinuity, mismatch, or no convergence |
| H5 | Rays equal the model fractions | at 12 live settings, per band the reflected ray count equals `round(N_b * R_b)` within one ray and the band shares sum to 1; `sum_b w_b R_b` equals `solarWeighted(R(lambda))` within `T_band_tol` (frozen from Q3) and equals the nominal `r_solar` within the same tolerance (or the documented difference, Q3) | any outside |
| H6 | Rays come from the spectrum, not a constant | the band colours and counts change when `R(lambda)` changes (a recipe with thicker topcoat or different PVC) in the direction the model says (reflected NIR fraction and `r_solar` move together); a flat `R` of 0.5 in a test gives 50 % reflected in every band | counts do not follow `R` |
| H7 | Arrows are the model's fluxes | at 5 recipes and 24 times, each arrow's length divided by its flux is one constant per panel (the scale), and the readout number equals the flux within display precision; the arrows share one scale across the two panes | any ratio differs |
| H8 | The through-thickness drawing invents nothing | the drop element declares `data-source` pointing to `T_s`, `T_in`, `R_total`; it contains exactly two temperature numbers and no number per layer; the label "Illustrative scale" is visible; the plan states in the page text that the model has one surface temperature | any per-layer number, or a missing label |
| H9 | The scattering mark is a model quantity or absent | the mark density is monotone in the exposed quantity (Q3) across 12 recipes and zero when the midcoat is off; if Q3 found nothing exposable, the test asserts no scattering element exists | density not monotone, or marks with the layer off |
| H10 | Every moving value declares its source | each moving or numeric element carries `data-source` (model function and field, band id, or flux term); the test resolves each against the live result, the stepper frame or the band table; the container reads "Model output, not a measurement" | any unresolved source or missing label |
| H11 | Motion is controllable and there is one clock | in Chrome: no autoplay at load or on open; Pause reachable by Tab; Space toggles; reduced motion keeps the loop frame counter at 0 until a press and the particle layer absent; hidden tab freezes model time; at most 3 luminance flashes per second; the panel adds at most one ticker, only while playing, and none when paused or closed (the plan 08 `noExtraTicker` check is extended: opening the tab adds 0) | any breach |
| H12 | Frames are smooth | real Chrome, 5 s at 1x and 4x: p95 frame interval at most `T_frame_ms` (20); with CDP 4x throttle at most `T_frame_throttled_ms` (34); median main-thread time per frame at most 8 ms; worker round trip p95 at most `T_step_ms` (frozen from Q1, planned 4); `physics.late` rate at most 1 per 20 s at 1x | any bound exceeded |
| H13 | Page weight and height hold | closed height at 1280 px at most the baseline in `docs/proofs/plan-08.md` (`T_delta_px` 0) and at most `T_page_px` 9000; the open tab at most `T_open09_px` (frozen from Q6, planned at most 900); file at most `T_size_mib` 8 | any exceeded |
| H14 | Earlier plans unaffected | live latency p95 at most `T_live_ms` 100 with the panel playing and a slider being dragged (the panel's sliders and the live simulator's stay in step: moving one moves the other within one frame); plan 07 H7 (864 values) and plan 08 sweep byte-identity unchanged; plan 06 contrast in both themes for every new component; comprehension fixture 7 of 8 by two fresh readers on the final page | any regression |
| H15 | Honest wording | the honesty test scans the new components and the built page: no "recommended", "best", "optimal", "real-time measurement"; "Illustrative scale" present beside every drawing whose lengths are not to scale; "rays show fractions, not photons"; the transient note after a change; C1 named as a US datasheet product wherever shown; ageing not shown | any hit or missing label |
| H16 | Newest wins, nothing leaks | 200 slider moves with the panel playing: no stale reply paints (replies carry a version; older ones are dropped); 20 open and close cycles leave the live worker count at the pool size plus the one stepper lane while open and plus zero when closed; workers terminated within 500 ms of close | any stale paint or leak |
| H17 | Animation JS stays small | the new code adds at most `T_js09_delta_kib` (frozen after Task 5, hard cap 10) and the total stays at most `T_js_kib` 125 (plan 07, amended from 100 by the owner-delegate decision recorded in plans 07 and 08); if it would exceed, the run stops and reports, the cap is not raised | any exceeded |

Thresholds (frozen once, never edited after): `T_dt_s` 60; `T_stepper_tol` frozen from Q4 (planned 1e-12); `T_closure_w_m2` frozen from Q4; `T_band_tol` frozen from Q3; `T_step_ms` frozen from Q1; `N_settle`, `T_settle_k` frozen from Q5; `T_open09_px` frozen from Q6; `T_delta_px` 0; `T_js09_delta_kib` frozen after Task 5 (hard cap 10; own delta because plan 07's 100 total and plan 08's delta of up to 20 would otherwise let the scene eat all remaining headroom unseen). Inherited, unchanged: `T_page_px` 9000, `T_size_mib` 8, `T_js_kib` 100, `T_frame_ms` 20, `T_frame_throttled_ms` 34, `T_hang_s` 10, `T_live_ms` 100, `T_comp` 7 of 8, `T_contrast_*`, `T_tap_px` 44.

**Fault-injection matrix** (edit exactly one input; expect a phase, exit code or visible state, never a stack trace):

| ID | Edit | Expected |
|---|---|---|
| F1 | the result passed to the panel has no `spectrum.nominal` | the band rays are replaced by the text "spectrum not available"; temperature and arrows still run; `physics.open` logs it; no throw |
| F2 | spectrum and wavelength grids of unequal length | `bandSplit` throws a typed `ConfigError` (code 4, phase `physics`), the panel shows the error state; the day player and lanes are unaffected |
| F3 | a slider value outside a model range (irradiance above 2000 W/m2, air temperature outside 150 to 400 K) | the stepper throws `PhysicsRangeError`, `physics.lane.failed` `physics_range`, the panel keeps the last valid frame and says "value outside the model range"; no hang |
| F4 | `Worker` removed (`delete window.Worker`) or the stepper worker terminated mid-run through the `#test` hook | the inline lane takes over from the last good state; the result equals H3; the panel says "single lane" |
| F5 | the midcoat switched off in the live simulator | no scattering marks, the rays show only the substrate and topcoat result as the model gives, and the panel says "midcoat is off in the live simulator" (H9) |
| F6 | all layers off (recipe equals C0) | both columns identical, difference 0.0 K, no error |
| F7 | the tab hidden while playing | model time freezes (no steps are requested); on return it resumes from where it stopped |
| F8 | text containing `<img onerror>` in any new component field (label, band name) | escaped, no element created |
| F9 | an unknown band id, flux term, pane or component state passed to the new molecules | build error exit 4 (closed unions, as plan 06) |
| F10 | a negative, NaN or out-of-range speed, step count or seek passed to the stepper clock | clamped by the plan 07 pure clock; the worker never sees an invalid value |
| F11 | the context JSON truncated so the worker cannot build the stepper | error state in the panel, `physics.error`, other panels unaffected, no hang within `T_hang_s` |

**Given / When / Then:** G1 Given the report, when I open the tab and press Play, then rays fall on both stacks, split by band into reflected and absorbed, and the arrows and surface temperature move with the sun over the day (FR-1, FR-4 to FR-6, H5, H7, H10). G2 Given a playing scene, when I drag the sun slider, then the next steps use the new irradiance, the temperature stays continuous and then relaxes, and the panel marks the transient (FR-3, H4, H14). G3 Given the drop drawing, when I read it, then it shows two temperatures and says "Illustrative scale" (FR-8, H8, H15). G4 Given reduced motion, when I load the page, then nothing moves until I press a play or step button (FR-11, H11). G5 Given the midcoat switched off, when I look at the recipe column, then no scattering marks are shown (FR-7, H9, F5). G6 Given the closed page, when I measure it at 1280 px, then it is no taller than after plan 08 (FR-12, H13).

## Execution contract: one shot, nothing left open

**Preflight gate.** Needed: plan 08 landed on the working branch (`src/core/anim/compare.ts`, `src/core/anim/sweep.ts`, `src/web/anim/comparePanel.ts`, `src/web/design/organisms/watchScreening.ts` with the tabs host, and `docs/proofs/plan-08.md` with status `✅ DONE-LEAN`; its frozen closed-page baseline and `T_js08_delta_kib` are read from it); plan 07 landed (`src/web/anim/loop.ts`, `dayPlayer.ts`, `docs/proofs/plan-07.md`); the committed fixture run `tests/fixtures/report-run`; `node_modules`; Chrome installed; CPU load checked before each browser step (CPU rule: one browser and one test process at a time, `nice -n 10`). A one-line script prints the missing items and stops. Nothing needs the owner's accounts, hosts, keys or a backup. **The owner decisions O1 to O3 below are not preflight blockers: each has a stated default the run uses.**

No stub, TODO, skip, xfail or placeholder. Task 1 is a spike and ends in written answers Q1 to Q6 that fix Tasks 2 to 5. By-design limits go to `docs/BLOCKED.md` with a reason and a ticket: BLOCKED-19 the thermal model is one node, so no temperature field through the layers exists and the drop drawing is illustrative (a layered conduction model needs per-layer conductivity and heat capacity data and a new model plan); BLOCKED-20 absorption is not resolved per layer (the model has the stack `R(lambda)` and an opaque substrate); BLOCKED-21 rays show fractions, not photon trajectories or Mie angular scattering. Thresholds that need a measurement are frozen once from the first real run (Task 1; `T_js09_delta_kib` after Task 5). Done means proven: every hypothesis holds on evidence (run ids in `docs/proofs/plan-09.md`) and `bun run check` is green (lean mode below). If it fails partway: stop at the failing task, leave the tree clean, report the failing proof with its log. Out of scope for the run: merge (needs the owner's go-ahead), push, prod runs.

**Lean-mode proof list (what the run actually executes; nothing else is claimed):** (1) the fast tier of every new test file, (2) `bun run check`, (3) in real Chrome with one browser at a time: H3 (worker against inline lane, three delays), H4 (one slider change), H11 (reduced motion, hidden, one ticker), H12 (1x and 4x, throttled 4x once), H13 (height, size), H14 (live latency with the panel playing), H16 (200 moves, 20 open and close cycles), (4) pure tests for H1, H2, H5 to H10, H15, H17 and F1 to F11, (5) one comprehension pass by two fresh readers on the final page. **Not run, and said so in the proof log:** the long tier (`refine.*`, `budget.baseline`, `indonesia.e2e`, `pipeline.e2e`), and a mutation run beyond the four mutants in Task 5.

## Global Constraints

`bun run check` at or near 4 minutes under load; heavy and throttled checks in `*.proof.test.ts` with a fast twin (`docs/testing.md`); one component per commit; no attribution lines in commit messages; no new runtime dependency; never edit `vendor/`; never kill processes you did not start; one browser and one test process at a time; CPU rule (check load first, `nice -n 10`, bounded wall-clock). No mocks: real worker, real models, real faults (terminated worker, removed `Worker`, out-of-range value); the fixture run is real data. The `thermal.ts` change is a pure extraction of the existing step with no change of arithmetic or order of operations; H1 and the existing thermal golden tests prove the bit-identity. Commit only; no push; no merge.

## Review Focus

(1) Any drawn or displayed value that is not a model output: a gradient through the layers, a per-layer temperature, a scattering mark without a source, a ray count that is not a quota of the spectrum. (2) The `thermal.ts` extraction: identical operation order, so the batch numbers are bit-identical. (3) A second clock, or a ticker that outlives the tab or the disclosure. (4) State continuity and version handling at a slider change (stale replies). (5) The arrow scale shared across panes and the residual honesty. (6) Wording: "recommended", "best", through-thickness claims, missing "Illustrative scale", missing transient note. (7) Closed page height after plan 08 and the open tab height, JS cap.

## Decisions (all settled, except the three owner questions O1 to O3 which carry defaults)

- D1 The stepper is the existing single-node RK4: one pure `rk4Step(state, params, g, dt)` extracted from `simulateDay` and `simulateSeriesDay` and used by both and by the stepper; no second implementation.
- D2 Fixed model step 60 s; model time advances only by computed steps; the loop's dt scales the number of steps requested (day 16 s at 1x: 5.4 steps per 16.7 ms frame at 1x, 21.6 at 4x), carrying the fractional remainder deterministically.
- D3 The first live day starts from the state at the end of the batch day 1 (the worker spins up day 1 at load of the tab in one call, a few milliseconds), so untouched sliders reproduce the batch day 2 (H1).
- D4 A slider change applies at the next step boundary: parameters swap, state is kept, no spin-up; the panel labels the following days as a transient. A *Restart day* button reseeds from the day-1 end state of the current parameters.
- D5 One request per frame (no pipelining): the worker answers `{n, version, frames}`; a reply with an old version is dropped; if the reply is late the frame repeats and model time does not advance. This keeps the log of requests sufficient to replay (H3).
- D6 Two panes, recipe and C0, from the same stepper code with their own parameters (`LiveResult.nominal` and `controls.C0`: `r_solar`, `emissivity`, `c_a`); C1 is not stepped (it is datasheet-only, plan 08 BLOCKED-17), and appears only as the plan 08 number.
- D7 Rays are deterministic quotas: per band, `N_b` rays with `round(N_b R_b)` marked reflected, chosen by a fixed low-discrepancy order, never by a random draw; only the start positions are jittered from a seeded `Xoshiro128` (`deriveSeed(seed, 900)`), for looks. The ray emission rate is proportional to `G(t)`.
- D8 Band edges: UV 0.3 to 0.4, visible 0.4 to 0.7, NIR 0.7 to 4.0 um (the G173 range the model weights over, with the held-constant note beyond 2.5 um).
- D9 Nothing autoplays; Play starts it; reduced motion removes the particle layer and moves only on a press.
- D10 The panel's three sliders and the live simulator's share one source of truth (`liveState`); no second copy of any input.
- D11 Renderer by the Q2 rule (SVG if it holds the frame budget at 150 rays under 4x throttle; Canvas for the ray layer only otherwise); text, arrows and the temperature drop stay SVG and HTML.
- D12 Own frozen threshold `T_js09_delta_kib` (hard cap 10) on top of plans 07 and 08; the run stops if the total would exceed 100.
- D13 The tab is created and its worker started only when the tab is opened; closing the disclosure or the tab stops the ticker and terminates the stepper lane (so the closed page costs nothing, as plan 08 D12).
- **O1 (default: not done)** A real layered 1D conduction model and a through-thickness temperature field: needs per-layer conductivity and heat capacity data and its own model plan (02-style). The owner decides whether to commission it. Until then the drop drawing stays illustrative.
- **O2 (default: no autoplay)** Whether the live scene may start on first view. Allowing it needs an amendment of plan 07 FR-7 (once and stop within 5 s); the default keeps the Play button.
- **O3 (default: recipe and C0 only)** Whether the owner wants a third pane for another recipe (for example the best shortlisted candidate) or C1. The panes are a list in the component, so adding one costs one test and one column, but the page text must not say "best".

## File Structure (one source file, one mirrored test)

```
docs/spikes/plan-09.md and docs/spikes/plan-09/*.ts          Task 1 spike answers and scripts
src/core/models/thermal.ts          modified: export rk4Step (pure extraction)                    tests/core/models/thermal.test.ts (extended; thermalSeries.test.ts extended)
src/core/anim/stepper.ts            pure: createStepper, stepN, setParams, balanceTerms, closure   tests/core/anim/stepper.test.ts
src/core/anim/bands.ts              pure: bandSplit, rayQuota, scatterDensity (if Q3 allows)      tests/core/anim/bands.test.ts
src/core/anim/profile.ts            pure: conductionDrop (two temperatures and R_total)           tests/core/anim/profile.test.ts
src/web/worker.ts                   modified: additive "stepper" message pair                      tests/web/worker.test.ts (extended)
src/web/stepperLane.ts              worker lane and inline lane behind one interface, versions    tests/web/stepperLane.test.ts
src/web/anim/physicsPanel.ts        wiring: loop ticker, sliders via liveState, controls          tests/web/anim/physicsPanel.test.ts
src/web/design/molecules/physicsScene.ts   stack, rays, arrows (renderer per Q2)                  tests/web/design/molecules/physicsScene.test.ts
src/web/design/molecules/dropProfile.ts    two temperatures and the labelled drop                 tests/web/design/molecules/dropProfile.test.ts
src/web/design/organisms/watchPhysics.ts   panes, controls, readout, labels                       tests/web/design/organisms/watchPhysics.test.ts
src/web/design/organisms/watchScreening.ts modified: fourth tab                                   tests/web/design/organisms/watchScreening.test.ts (extended)
tests/report.physics.browser.test.ts and .proof.test.ts      page tests, fast twin and proof
docs/proofs/plan-09.md              proof log
```

If Q2 shows the existing `dayChart` renderer helpers can draw the drop and arrows in at most about 30 changed lines, `dropProfile.ts` is that option and not a new file (the mirrored test then extends the `dayChart` test). The layout guard (1:1 source to test) extends to the new files.

## Tasks

### Task 1: Spike Q1 to Q6 (fixes Tasks 2 to 5)

**Tests:** `docs/spikes/plan-09.md` with runnable scripts under `docs/spikes/plan-09/` and a `run_all.ts` that exits 0 only when every expectation holds. **Creates:** those files. **Interfaces:** none (scripts only).
- [ ] Preflight script (plan 07 and 08 files, plan 08 proof log with its baseline, fixture) prints missing items and exits non-zero.
- [ ] Q1 Worker cost: time one RK4 step and 22 steps (4x frame) inline and as a worker round trip (Bun, then real Chrome with the Blob worker); freeze `T_step_ms`. If inline cost per frame is under 0.05 ms and the round trip exceeds one frame at p95, record it: the worker is kept (request) but the plan says in `docs/spikes/plan-09.md` that it is for isolation, not speed.
- [ ] Q2 Renderer: build a throwaway page with 150 animated rays and four arrows in SVG, then in Canvas; measure p95 frame interval and main-thread time per frame at 1x and 4x throttle; apply the rule (SVG if it holds `T_frame_ms` 20 and `T_frame_throttled_ms` 34 and median 8 ms, else Canvas for rays only); also record whether `dayChart` helpers can draw the drop and arrows (changed-line count).
- [ ] Q3 Spectral and scattering: confirm `LiveResult.spectrum.nominal` is `R(lambda)` of the whole stack on the optics grid and the G173 spectrum is in the browser context; compute band shares and check `sum w_b R_b` against `solarWeighted` and against `nominal.r_solar` (freeze `T_band_tol`; if they differ by a documented reason such as the held-constant tail beyond 2.5 um, record the number and show it in the band note); decide whether `S(lambda)` or `S * DFT` of `kmCoefficients` can be exposed additively without changing any existing output (yes: a new pure function in `optics.ts` called by `midcoatSpectrum`, with the existing outputs byte-identical; no: the scattering visual is dropped from FR-7 and H9 asserts its absence).
- [ ] Q4 Stepper equality and closure: extract `rk4Step` in a scratch copy of `thermal.ts`; confirm that `simulateDay` and `simulateSeriesDay` outputs are bit-identical after the extraction (plan 02 and 04 goldens); freeze `T_stepper_tol` and `T_closure_w_m2` (twice the largest measured residual at 12 settings); confirm which scenario fields reach the browser (`g_peak`, `t_air`, `t_sky`, `h_conv`, wind to `h = hA + hB V`, `t_inside`, `R_total`, `c_a`) and which of them the three sliders move (irradiance, air temperature, wind), and where `t_sky` and `h_conv` for the radiated and convected arrows come from for the half-sine scenarios and for the hourly series.
- [ ] Q5 Settling: how many days does the live state need to relax to the periodic solution after a slider change, for the three sliders at their extremes (time constant `c_a / (h + 4 eps sigma T^3 + 1/R_total)`); freeze `N_settle` and `T_settle_k`; decide the label text for the transient.
- [ ] Q6 Height and wiring: measure the closed page after plan 08 (baseline), add the fourth tab text to the mock of the closed row, measure again (`T_delta_px` 0 met, or what to reclaim: the tab labels, the one-line lead); measure the open tab and freeze `T_open09_px`; confirm `liveState` can drive two views of one input and which hook the panel subscribes to; confirm the plan 08 `onFrame` and the loop `add` lifecycle allow a ticker that exists only while playing.
- [ ] Commit: `docs(spike): plan 09 answers Q1 to Q6 and frozen thresholds`.

**Acceptance:** fixes `T_step_ms`, `T_stepper_tol`, `T_closure_w_m2`, `T_band_tol`, `N_settle`, `T_settle_k`, `T_open09_px`, `T_delta_px`, the renderer and the scattering decision; informs H1 to H5, H9, H12, H13.

### Task 2: Pure core: stepper, balance, bands, drop

**Tests:** `tests/core/anim/stepper.test.ts`, `bands.test.ts`, `profile.test.ts`, extended `tests/core/models/thermal.test.ts` and `thermalSeries.test.ts`. **Creates:** `src/core/anim/stepper.ts`, `bands.ts`, `profile.ts`. **Modifies:** `src/core/models/thermal.ts` (extract `rk4Step`; `thermalSeries.ts` uses it). **Interfaces:**
```ts
// thermal.ts (pure extraction, same operation order)
export function rk4Step(tK: number, tS: number, dtS: number, flux: (t: number, s: number) => number): number
// stepper.ts
export type StepperParams = { r_solar: number; emissivity: number; c_a_j_m2k: number; t_inside_k: number; r_total_m2k_w: number; forcing: (tS: number) => { g: number; t_air_k: number; t_sky_k: number; h_conv_w_m2k: number } }
export type StepFrame = { tS: number; tK: number; terms: { absorbed: number; reflected: number; radiated: number; convected: number; conducted: number; stored: number }; residual: number }
export function createStepper(p: StepperParams, t0K: number, tS0: number): Stepper
export interface Stepper { stepN(n: number): StepFrame[]; setParams(p: StepperParams): void; state(): { tS: number; tK: number } }
export function balanceTerms(tK: number, tS: number, p: StepperParams): StepFrame["terms"]    // from netFluxWM2's own terms
// bands.ts
export type BandId = "uv" | "visible" | "nir"
export type Band = { id: BandId; lo_um: number; hi_um: number; share: number; reflected: number }   // share sums to 1
export function bandSplit(wlUm: Float64Array, r: Float64Array, g173: Spectrum): Band[]              // ConfigError (code 4, phase "physics") on unequal lengths
export function rayQuota(b: Band, n: number): { reflected: number; absorbed: number }
// profile.ts
export function conductionDrop(tSurfaceK: number, tInsideK: number, rTotal: number): { qWM2: number; tSurfaceK: number; tInsideK: number }
```
- [ ] Tests first: `stepperEqualsSimulateDayH1`, `stepperEqualsSeriesDayH1`, `thermalGoldensUnchangedAfterExtraction` (bit-identical outputs), `balanceClosesH2` (independent recomputation), `stepperIsDeterministicH3`, `paramChangeIsContinuousH4`, `paramChangeEqualsIndependentRk4H4`, `relaxesToLiveSimulateH4`, `bandSharesSumToOneH5`, `bandWeightedEqualsSolarWeightedH5`, `flatRGivesFlatFractionH6`, `rayQuotaWithinOneRayH5`, `dropHasTwoTemperaturesH8`, `rejectsUnequalGridsF2`, `outOfRangeIsPhysicsRangeErrorF3`, `clampsSpeedAndStepsF10`.
- [ ] Run, expect FAIL. Implement reusing `netFluxWM2`, `solarWeighted`, `sampleSeries` (no copy of their logic). Run, expect PASS, plus every existing thermal, series and golden test.
- [ ] Commit: `feat(anim): pure live stepper, spectral bands and conduction drop`.

**Acceptance:** H1, H2, H3 (pure part), H4, H5, H6, H8 (pure part), F2, F3, F10.

### Task 3: Worker lane, versions and the loop ticker

**Tests:** `tests/web/stepperLane.test.ts`, extended `tests/web/worker.test.ts`. **Creates:** `src/web/stepperLane.ts`. **Modifies:** `src/web/worker.ts`. **Interfaces:**
```ts
// worker.ts: additive message pair
type StepperMsg = { type: "stepper"; id: number; op: "init" | "params" | "step"; version: number; payload: unknown }
// stepperLane.ts
export interface StepperLane { request(n: number, version: number): Promise<{ version: number; frames: StepFrame[] } | "stale">; setParams(p: StepperParams, version: number): void; close(): void; kind(): "worker" | "inline" }
export function openStepperLane(ctxJson: string, deps: { Worker?: typeof Worker }): StepperLane
```
- [ ] Tests first: `workerEqualsInlineH3` (byte-identical on one logged sequence, with 0, 7 and 40 ms delays), `staleReplyIsDroppedH16`, `closeTerminatesWithin500msH16`, `killedWorkerFallsBackToInlineF4`, `noWorkerUsesInlineF4`, `truncatedContextShowsErrorF11`, `sixteenMsRoundTripBudgetH12` (measures, asserts `T_step_ms`).
- [ ] Run, expect FAIL. Implement (one in-flight request, version stamp, inline lane shares the pure stepper). Run, expect PASS, plus the existing worker and pool tests (screening and sweep byte-identity unchanged).
- [ ] Commit: `feat(web): stepper lane on the worker with an inline fallback`.

**Acceptance:** H3, H12 (round trip), H16, F4, F11.

### Task 4: Components (sheet first, one commit per component)

**Tests:** one mirrored test per component. **Creates:** `physicsScene`, `dropProfile` (or the `dayChart` option, Q2), `watchPhysics`. **Modifies:** `watchScreening.ts` (fourth tab), the design sheet. **Interfaces:**
```ts
physicsScene({ pane: "recipe" | "aluminium", bands: Band[], raysPerBand: number, flux: StepFrame["terms"], scale: number, layers: Layers, scatter: number | null, renderer: "svg" | "canvas", source: string }): string
dropProfile({ tSurfaceK: number, tInsideK: number, rTotal: number, source: string }): string
watchPhysics({ state: "idle" | "playing" | "paused" | "transient" | "error", speed: 0.5 | 1 | 2 | 4, reduced: boolean, lane: "worker" | "inline", layerOff?: "midcoat" | "primer" | "topcoat", id?: string }): string
```
- [ ] Sheet entries first (design gallery, light and dark, every state), one commit per component: `feat(design): physicsScene`, `feat(design): dropProfile`, `feat(design): watchPhysics`. Each component test checks tokens only, escaping (F8), closed unions (F9), `data-source` on every moving or numeric element (H10), the labels "Illustrative scale", "Model output, not a measurement" and "rays show fractions, not photons" (H15), AA contrast in both themes, 44 px targets.
- [ ] Commit the fourth tab: `feat(design): live physics tab in the watch disclosure`.

**Acceptance:** H8, H9 (component part), H10, H15, F5, F6, F8, F9.

### Task 5: Assembly, browser proof, size freeze

**Tests:** `tests/web/anim/physicsPanel.test.ts`, `tests/report.physics.browser.test.ts` (fast twin) and `.proof.test.ts`. **Creates:** `src/web/anim/physicsPanel.ts`. **Modifies:** the page assembly, `docs/BLOCKED.md` (19 to 21). **Interfaces:**
```ts
export function mountPhysicsPanel(host: HTMLElement, deps: { loop: Loop; live: LiveStateApi; lane: StepperLane; reducedMotion: () => boolean }): { destroy(): void }
```
- [ ] Wire the panel: `loop.add` ticker only while playing; steps requested from the loop dt and the speed (D2, fractional remainder carried); frames turned into scene props through the pure functions of Task 2; sliders bound to `liveState` (D10); version bump on every slider change; destroy on tab close (D13).
- [ ] Browser tests first, expect FAIL: H4 (one slider change in Chrome, state continuous), H7 (arrow ratios at 24 times), H11 (no autoplay, Space, reduced, hidden, one ticker, none closed), H12 (1x, 4x, throttled 4x), H13 (closed baseline from plan 08, open height), H14 (live latency with the panel playing, plan 07 H7, plan 08 sweep equality), H16 (200 moves, 20 cycles), F5, F6, F7; then implement and run, expect PASS. Measure the JS delta with `Bun.build` as plans 07 and 08 did and **freeze `T_js09_delta_kib`** (hard cap 10) in `docs/spikes/plan-09.md`; pin it in a test `physicsJsStaysUnderTheFrozenDeltaH17`; if the total would exceed 100, stop and report.
- [ ] Mutation checks (commit first, mutate a scratch copy, never checkout after a mutation): M1 the parameter swap resets `T` (killed by H4); M2 the reflected quota uses the visible band for all bands (killed by H5); M3 the arrow scale differs per pane (killed by H7); M4 the drop draws a middle-layer temperature (killed by H8).
- [ ] Commit: `feat(report): live physics scene with stepper, rays and flux arrows`.

**Acceptance:** H4, H7, H9, H10, H11, H12, H13, H14, H16, H17, F5, F6, F7.

### Task 6: Proof log, review

**Tests:** the lean-mode proof list above. **Creates:** `docs/proofs/plan-09.md`. **Modifies:** this plan's status line.
- [ ] Run the lean proof list one tier at a time (one browser at a time, load checked); write each H and F with its run id, the measured heights (before and after), size, JS delta, worker round trip, frame times (1x, 4x, throttled), live latency; list explicitly what was not run.
- [ ] Two fresh readers answer the comprehension fixture on the final page (`T_comp` 7 of 8), plus one question about the drop drawing ("does the model compute a temperature inside the coating?", expected answer: no).
- [ ] Adversarial review of Review Focus items 1 to 4 by an independent reader with the code and the claim only; fix findings with a regression test each (`fix(anim): <summary>`).
- [ ] `bun run check` green; update the status line to `✅ DONE-LEAN` with the files that landed and the not-run list.
- [ ] Commit: `docs: plan 09 proof log`.

**Acceptance:** all hypotheses H1 to H17 and F1 to F11 with evidence.

## Rollout and rollback

No flag is needed: the scene lives in a closed disclosure, starts nothing until Play is pressed, and its worker exists only while the tab is open (D13). Rollback triggers (observable): closed page height above the plan 08 baseline, live latency p95 above `T_live_ms`, `physics.play` without frame advance within `T_hang_s`, any NaN text on the page, any difference of the thermal goldens. Rollback is reverting the Task 5 assembly commit; Tasks 2 to 4 are additive and harmless alone (the `rk4Step` extraction is bit-identical by test). No hand-off outside the repo.

## Part 2: test specification

Stubs (names, helpers, key assertions); implementation follows in the tasks above.

**`tests/core/anim/stepper.test.ts`** (helper `paramsAt(settings)` builds `StepperParams` from the fixture context for the recipe and C0): `stepperEqualsSimulateDayH1` (12 settings, 144 points, `t_max_c`, `q_in_mean_w_m2` within `T_stepper_tol`); `stepperEqualsSeriesDayH1`; `balanceClosesH2` (every step, terms recomputed from raw inputs by a second formula in the test); `stepperIsDeterministicH3` (same request log twice, deep equal); `paramChangeIsContinuousH4`; `paramChangeEqualsIndependentRk4H4` (reference RK4 written in the test from `netFluxWM2`); `relaxesToLiveSimulateH4` (`N_settle` days, `T_settle_k`); `clampsSpeedAndStepsF10`; `outOfRangeIsPhysicsRangeErrorF3`; fast-check: T stays inside the bracket 100 to 600 K for any slider within range.

**`tests/core/anim/bands.test.ts`**: `bandSharesSumToOneH5`; `bandWeightedEqualsSolarWeightedH5` (`T_band_tol`); `flatRGivesFlatFractionH6` (R 0.5 gives 0.5 per band); `rayQuotaWithinOneRayH5` (fast-check over `N` and `R`); `rejectsUnequalGridsF2`; `scatterDensityMonotoneH9` or `noScatterWhenNotExposedH9` (per Q3).

**`tests/core/anim/profile.test.ts`**: `dropHasTwoTemperaturesH8`, `dropFluxEqualsConductedTermH7`.

**`tests/core/models/thermal.test.ts`, `thermalSeries.test.ts`** (extended): `goldensUnchangedAfterRk4StepExtraction` (bit-equal to the committed values).

**`tests/web/stepperLane.test.ts`** (real worker, dead-port style fault: `killLane`): `workerEqualsInlineH3`, `staleReplyIsDroppedH16`, `closeTerminatesWithin500msH16`, `killedWorkerFallsBackToInlineF4`, `noWorkerUsesInlineF4`, `truncatedContextShowsErrorF11`, `roundTripWithinBudgetH12`.

**`tests/web/design/**`**: per component `tokensOnly`, `escapesTextF8`, `closedUnionsF9`, `everyMovingElementHasDataSourceH10`, `honestyAndIllustrativeLabelsH15`; `physicsScene` also `rayCountsMatchBandsH5`, `arrowLengthsShareOneScaleH7`, `noScatterWithMidcoatOffF5`; `dropProfile` also `noPerLayerNumberH8`; `watchPhysics` also `layerOffNoteF5`, `transientNoteAfterChangeH15`.

**`tests/web/anim/physicsPanel.test.ts`**: panel opens and closes without a ticker leak; `versionBumpsOnEverySliderChangeH16`; `stepsFollowLoopDtWithRemainderD2`; `reducedMotionNoParticlesUntilPressH11`; `hiddenFreezesModelTimeF7`.

**`tests/report.physics.browser.test.ts`** (fast twin on the 4-draw page) and **`.proof.test.ts`** (fixture page): `sliderChangeKeepsTemperatureContinuousH4`, `arrowRatiosAt24TimesH7`, `oneTickerWhilePlayingNoneClosedH11`, `framesAt1xAnd4xAndThrottledH12`, `closedHeightWithinPlan08BaselineH13`, `liveLatencyWithPanelPlayingH14`, `twoHundredMovesNoStalePaintH16`, `twentyOpenCloseCyclesNoLeakH16`, `noRecommendedBestOptimalH15`, `noNaNTextH10`, `closedPageStaysWithinTheFrozenHeight`.
