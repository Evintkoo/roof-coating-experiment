# Plan 08 spike: answers Q1 to Q6 (2026-11-23)

Scripts live in `docs/spikes/plan-08/`; `bun docs/spikes/plan-08/run_all.ts` runs them one after the other and exits 0 only when every expectation of every script holds (last run: 6 of 6 scripts pass). The machine was shared (load average 2.6 to 3 on 10 cores); timings are indicative and the frozen thresholds are deliberately loose. Preflight (`preflight.ts`) prints missing items and exits non-zero; nothing was missing.

## Frozen values (never edited afterwards)

| Item | Value | Basis |
|---|---|---|
| `T_sweep_s` | **2** (the cap, equal to `T_screen_s`) | 41 points with 32 draws: 1 worker 1,266 ms, 2 workers 687 ms, 4 workers 422 ms (Bun workers) |
| `T_speedup` | **1.5** (floor, inherited) | 4 over 1 workers measured 3.00x |
| `T_open_px` | **900** (the plan's planned maximum) | the open screening disclosure measures 321 px today; the two new tabs must open at most 900 px (checked on the real page in Task 4) |
| `T_delta_px` | **0** | baseline closed height **8,950 px** at 1280; with the shorter tabs summary in the same row the page measures 8,950 px, so 0 is met without reclaiming anything |
| `T_heat_tol` | **0.06 W h/m2** | Q5: largest difference 2.95e-2 W h/m2 over 12 settings x 3 outcomes, times 2, rounded up |
| `T_js08_delta_kib` | frozen after Task 4 from the measured size (below, hard cap 20) | |
| Inherited, unchanged | `T_page_px` 9000, `T_size_mib` 8, `T_js_kib` 100, `T_hang_s` 10, `T_live_ms` 100 | |

Baseline closed height frozen for H12 / `closedHeightWithinBaselineH12`: **8950** px.

## Q1 Cost
One `liveSimulate` (33 thermal solves) takes about 31 ms. The 41-point sweep takes 1,270 ms on the main thread (so the pool is needed), 1,266 ms on 1 worker, 687 ms on 2 and 422 ms on 4: speedup 3.00x against the 1.5 floor; results of 1, 2 and 4 workers equal the sequential values exactly. 41 points with 32 draws fit under `T_sweep_s` 2, so the **full 32-draw band is used and the fewer-draws fallback is not needed** (the owner approved it only as a fallback). Chrome with the Blob worker is measured by the page proof in `docs/proofs/plan-08.md`.

## Q2 Height
Closed page 8,950 px at 1280 (file size in the proof log). The closed row is one `<summary>` of 44 px both with the old text and with the tabs text "More ways to watch: screening, controls, one variable at a time", so the closed page does not grow. Nothing to reclaim. The open screening disclosure is 321 px.

## Q3 Chart reuse
No: see `docs/spikes/plan-08/q3_chart.md`. `laneChart` and `sweepChart` are separate molecules (so `sweepChart.ts` and its mirrored test exist).

## Q4 Controls over the sweeps
13 variables (7 design, the two grade diameters, pH, 3 weather), all with configured ranges (`MaterialRanges`, `WeatherConfig`, and the grade bounds of `src/core/opt/vars.ts`, pinned to `configs/optimize.yaml` by the plan 05 tests); all 41 points of every variable run without a `PhysicsRangeError`. C0 and C1 `t_max_c` are flat to exactly 0 for the 10 design, grade and pH variables and move for the 3 weather variables (C0 spread 6.6, 6.8, 12 K; C1 1.5, 7.5, 0.42 K for irradiance, air temperature, wind). C1 corrosion, delamination, wetting and cost are NaN at every point (datasheet only). The grade diameters are not live-simulator inputs; they are material constants (`ctx.mat.tio2.diameter_um` 0.25 um, `baso4` 1.0 um), so the sweep sets them on a copy of the context and the live value is the context's. With a layer off, its DFT is inert (t_max identical at both ends of the range) for primer, midcoat and topcoat; with the primer off the corrosion outcome is the baseline value (1), not NaN, and the gel time is NaN.

## Q5 Cumulative heat
The trapezoid of the conducted flux `(T_surface - T_inside) / R_total` over the 144 nodes (23.833 h) misses the model's `q_in_mean_w_m2 * 24` by up to 2.70 W h/m2 because the last 10 minutes are missing; closing the day periodically (the interval from the last node to 24 h at the mean of the last and the first node, as the day is periodic) leaves 2.95e-2 W h/m2 as the largest difference over 12 settings and recipe, C0 and C1. The lane is the trapezoid with that closing interval; `T_heat_tol` 0.06 W h/m2. The C1 flux uses the solved C1 surface series (datasheet r_solar 0.90 and emissivity 0.87), and the reflected flux of C1 is `G(t) * 0.90`.

## Q6 Wiring
`dayPlayer.ts` defines `render()` once and every path (play, pause, seek, step, setData, tick) ends in it; the only `loop.add` is in `play()`. One `onFrame` call from `render()` is therefore complete, and opening a tab adds no ticker. The plan 07 clock reads as a phase (`tH / 24`) without change; a sweep at 1x ends after 16 s in `once` mode.

## Frozen after Task 4 (2026-11-23, never edited afterwards)

`T_js08_delta_kib` = **45**. Measured with `Bun.build` as the page bundles it (`minify: false`, IIFE), as plan 07 did: the plan 07 entry (`tests/support/sizeEntry.ts`: loop, tweens, day player, screening panel, pool, inline lane) is **76.4 KiB**; with the comparison panel, the sweep panel, the chart molecules and the sweep inline lane (`tests/support/sizeEntry08.ts`) it is **118.8 KiB**: a delta of **42.4 KiB** unminified (25.6 KiB minified, 39.3 to 64.9). **This breaches the plan text on two counts**: the plan's hard cap for the delta is 20 KiB, and the total with the inline lane must stay at most `T_js_kib` 100. The largest parts are `sweepPanel.ts` 13 KiB, `sweepChart.ts` 7 KiB, `laneChart.ts` + `comparePanel.ts` + `watchCompare.ts` 10 KiB, `compare.ts` + `sweep.ts` 6 KiB and the model code the sweep inline lane needs (`live.ts`, `vars.ts`) 3 KiB. The plan 07 entry alone is still under 100 (`animationJsStaysUnderTheFrozenSizeH14`). H16 is therefore reported as **falsified** (not met), and the owner must decide between raising the cap and cutting features; the test `sweepAndCompareJsStaysUnderTheFrozenDeltaH16` pins the measured delta (45 KiB) so it cannot grow. The page file is 6.15 MiB against 8.
