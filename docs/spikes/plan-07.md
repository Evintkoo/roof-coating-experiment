# Plan 07 spike: answers Q1 to Q6 (2026-11-22)

Scripts live in `docs/spikes/plan-07/`; `bun docs/spikes/plan-07/run_all.ts` runs them one after the other and exits 0 only when every expectation of every script holds (last run: 4 of 4 scripts pass). Data is the committed fixture run (`tests/fixtures/report-run`: 96 candidates, 9 scenarios, 864 result rows). The machine was shared and loaded (load average 6.5 to 8 on 10 cores), headless Chrome without GPU: timings are indicative, and the frozen thresholds below are deliberately loose for that reason.

| Script | Answers |
|---|---|
| `q1_cost_and_merge.ts` (+ `q1_worker.ts`) | Q1 in Bun: cost per cell, ordered merge on 1, 2, 4 Bun workers, equality with the batch |
| `q1_q2_q4_chrome.ts` (+ `q1_chrome_worker.ts`) | Q1 in real Chrome with an inlined Blob worker, Q2 frame budget, Q4 reduced motion and clock |
| `q3_height.ts` | Q3 closed height and headroom |
| `q5_q6_data_and_rays.ts` | Q5 data inventory, Q6 ray and arrow mapping with a hand calculation |

## Frozen values (never edited afterwards)

| Item | Value | Basis |
|---|---|---|
| `T_speedup` | **1.5** (the plan's hard floor) | measured 4 workers over 1: 2.65x to 2.85x total, 3.06x compute only (Bun and Chrome); the floor is kept because the machine is loaded |
| `T_screen_s` | **2** | measured 0.073 to 0.087 s for all 864 cells on 4 workers, 0.22 s on 1 worker; 2 s leaves a 25x margin for throttled CPUs and phones |
| `T_js_kib` | **100** (frozen after Task 5, see below; originally "not frozen yet") | the pure core (`src/core/anim`) is 2.1 KiB minified; the renderers and loop do not exist until Task 5, so the plan's "freeze after Task 3" cannot be done honestly; freeze after Task 5 (cap 150 stays) |
| `T_page_px`, `T_size_mib`, `T_frame_ms` and the others | unchanged | inherited or fixed by the plan |

## Q1 Cost of the models in the browser

One cell (stackProps plus one 48 h RK4 day) costs 0.25 to 0.31 ms. The whole 864-cell screening is **0.22 s on one thread** and about 0.07 s on four. Chrome, Blob worker, per-candidate chunks: 1 worker 209 to 223 ms, 2 workers 111 to 123 ms, 4 workers 73 to 79 ms, 6 workers 73 ms (start and context parse 5 to 9 ms per pool). The pool beats one worker by 2.8x (4 workers), so the 1.5x floor holds; 6 workers add nothing at this size, so the plan's `min(hardwareConcurrency - 1, 6)` is more than needed (cap at 4 is enough, recorded for Task 4 but D10 is left as written).

Consequences for Task 4:
- **Chunking.** Dispatch one candidate (9 cells) per message, not one cell: it reuses `stackProps` across the 9 scenarios and halves the total cost (Bun, 1 worker: 229 ms against 388 ms; 4 workers 87 ms against 240 ms). Results are still placed by cell index (D4), so the chunk size changes no number (byte-identical JSON checked for per-cell and per-candidate chunking, 1, 2, 4 and 6 workers).
- **Order independence is observed, not assumed.** In Chrome the arrival order of chunks differed from the index order at 2, 4 and 6 workers, and the merged JSON was still byte-identical to the 1-worker result and equal to the batch `results.csv` nominal columns (2592 values, max difference 5.7e-14 in Chrome, 0 in Bun; H7 tolerance 1e-9).
- **Open design problem (needs the author's decision before Task 5, not settled here).** The plan's operator text says the screening "finishes in seconds" and "visibly runs" with a filling cell grid. The real nominal screening takes under 0.1 s: the grid would fill in about 5 frames and the lanes would be invisible. Honest options: (a) show the real run and then a labelled slow-motion replay of the recorded per-task schedule (lane, start, end), or (b) make the screening include the 32 uncertainty draws per cell (864 x 33 solves, about 7 s on one thread and about 2.5 s on four), which is real work that finishes in seconds and gives bands, while the H7 equality check still compares the nominal evaluation. Recommendation: (b) as an option next to the fast nominal run, with the measured time shown. Not implemented in this commit.

## Q2 Frame budget

Prototypes in real Chrome (headless, no GPU, CDP throttle 1x and 4x, 120 frames each): an SVG day player (144-point path, moving cursor), an 864-rect SVG grid recolouring 20 cells per frame, and an 864-cell Canvas fully redrawn each frame. All three held a p50 of 16.7 ms and a p95 of 16.7 to 16.8 ms at both 1x and 4x throttle (limits: 20 ms and 34 ms). Measured script work per frame: SVG about 0 ms, Canvas 0.3 ms (1x) and 1.4 to 1.5 ms (4x); style, layout and paint cost is not in that number but the frame interval shows it fits. **Decision (D2 confirmed): SVG for everything, including the 864-cell grid; Canvas is not needed.** Caveat: headless without GPU on a loaded machine; the real H4 check (Task 6) uses the real page.

## Q3 Placement and height

The plan 06 report built from the fixture measures **8,679 px closed at 1280 px** (cap 9,000) and 5.80 MiB (cap 8): verdict 803, recipes 1287, why 1122, climate 1687, sites 788, budget 1182 + 512, explore 960, limits 1039, provenance 535 + 440. The section at full D8 sizes (360 + 420 + two headings, about 940 px) does **not** fit (headroom 321 px). **D8 fallback applies:** the screening stays collapsed to its button (about 100 px), the day player is at most 300 px, so the section is about 480 px and 159 px must still be reclaimed; D8 names the layer-flux schematic going to Details, which frees part of the *how the layers work* section (1,122 px); Task 6 must measure the rest, Verdict keeps priority, the cap is never raised. File size has about 2.2 MiB of room, the animation code is far below it.

## Q4 Reduced motion, visibility, deterministic time

`emulateMedia({reducedMotion})` is seen by the page as `matchMedia('(prefers-reduced-motion: reduce)').matches` and switches back live. A headless page reports `document.hidden === false`; Chrome cannot be asked to hide it, so the loop reads `document.hidden` plus the `visibilitychange` event and tests drive it by overriding `document.hidden` and dispatching the event (this tests our handler, not Chrome's scheduling; rAF is not delivered to a truly hidden tab, which the real loop must not rely on for correctness). `page.clock.install()` plus `runFor(1000)` drives `requestAnimationFrame` at exact 16 ms steps; the first timestamp and the frame count (62 or 63) depend on where the shared context clock stands, so tests assert the steps and a count window, never absolute stamps.

## Q5 Data available

- The batch nominal columns for H7 (`r_solar_pred`, `t_max_pred`, `q_in_mean_w_m2`, 864 rows) exist in `results.csv`, in candidate-major, scenario-minor order, so the task index equals the row index. **The page does not embed them**: it embeds `pareto` (one row per candidate, no scenario). Task 4 must embed the 864 x 3 nominal values: **49.2 KiB**.
- The context JSON carries the materials, weather configuration, ranges, spectra and controls (42 KiB) but **not the 96 designs or the 9 scenarios**; adding them costs **13.7 KiB**.
- `liveSimulate` returns the nominal series and the lo/hi band but **not the 32 draw series**; H11 needs an additive extension that leaves every existing number unchanged (a `draws` field).
- The series has 144 points at 600 s, node `i` at `i/6` h, so the last node is 23.833 h; `sampleSeries` clamps beyond it, and the day player treats 24 h as the last node (the day is not extrapolated).

## Q6 Ray and arrow mapping

At a time `t` in a scenario with peak irradiance G (half-sine over 6 to 18 h, from the thermal model): incident `G(t)`; reflected `G(t) * r_solar`; absorbed `G(t) * (1 - r_solar)`; conducted into the building `(T_surface(t) - T_inside) / R_total` taken from the solved series with the roof constants of the weather config. Check against a hand calculation for SP-001 and SP-050 in W5 (G = 800 W/m2): reflected 705.4 and 718.1 W/m2 equal `800 * r_solar` (0.8817 and 0.8976), reflected plus absorbed equals incident to 1e-9, and the series-mean of the conducted arrow equals the model's `q_in_mean_w_m2` within 2.7e-4 W/m2 (3.592 and 3.231 W/m2; the series has 144 of the 1,440 step nodes). Every arrow therefore comes from the models, none is invented (H10).

## Pure-core choices fixed by Task 3 (for Tasks 4 to 6)

Clock: `HOURS_PER_SECOND = 1.5` at speed 1x (a day in 16 s; 4x in 4 s, inside the 5 s autoplay rule of D6); modes `once` (stops, `playing` false), `loop` (wraps), `hold` (stays at 24 h); invalid dt or speed moves nothing (F11).

## Frozen after Task 5 (2026-11-22, never edited afterwards)

`T_js_kib` = **100**. Measured with `Bun.build` as the page bundles it (`minify: false`, IIFE): loop, tweens, day player, screening panel, pool and the design constants they import come to **43.9 KiB** (22.7 KiB minified, 9.3 KiB gzip); with the inline lane (the model code the single-lane fallback pulls into the page, F5) **74.5 KiB**. 100 leaves about 35 % headroom over the worst case for the Task 6 wiring; the plan's hard cap of 150 stays. Pinned by `animationJsStaysUnderTheFrozenSizeH14` in `tests/web/anim/loop.test.ts`.

Task 4 and 5 measurements on the same loaded machine: speedup 4 over 1 workers 3.23x (1 worker 224 ms, 4 workers 69 ms, best of 3), above the 1.5 floor; 4 workers finish the 864 cells in 0.07 s against `T_screen_s` 2.
