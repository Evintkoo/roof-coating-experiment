# Plan 09 spike: answers Q1 to Q6 (2026-11-23)

Scripts live in `docs/spikes/plan-09/`; `bun docs/spikes/plan-09/run_all.ts` runs them one after the other and exits 0 only when every expectation of every script holds. The machine was shared (load average 2.5 to 3.6 on 10 cores). Preflight (`preflight.ts`) prints missing items and exits non-zero; nothing was missing.

## Frozen values (never edited afterwards)

| Item | Value | Basis |
|---|---|---|
| `T_dt_s` | **60** | the batch step |
| `T_stepper_tol` | **1e-12** (the plan's planned value) | Q4: a scratch copy of the extracted RK4 reproduces the 144 day-2 points of `simulateDay` with a maximum difference of exactly **0** at 12 settings x recipe and C0 (24 runs): same operation order, so bit-identical |
| `T_closure_w_m2` | **1.0** | Q4: the five terms at the step node against `c_a` times the step's mean RK4 slope close to at most **0.511 W/m2** over 12 settings x 2 panes x 1,440 steps (twice, rounded up: 1.0). The residual is a real discretisation effect (largest at the sunrise and sunset kinks), not a bug, and the panel shows it |
| `T_band_tol` | **1e-9** | Q3: the band-weighted sum differs from `solarWeighted` and from the nominal `r_solar` by at most 3.1e-15 at 12 settings, because every trapezoid segment of the G173 grid is assigned to exactly one band by its midpoint |
| `T_step_ms` | **4** (the plan's planned value) | Q1: inline 0.09 us per step, 1.4 us for 22 steps (a 4x frame); Bun worker round trip for 6 steps p95 0.022 ms. Chrome round trip is measured by the page proof |
| `N_settle` | **3** days | Q5: after each of the six slider extremes the day maximum is within 0.05 K of `liveSimulate`'s nominal after at most 2 days |
| `T_settle_k` | **0.05** K | Q5 |
| `T_open09_px` | **900** (the plan's planned maximum) | Q6: the open tab is checked on the real page in Task 5 |
| `T_delta_px` | **0**, baseline **8950** px | Q6: the closed page measures 8,950 px at 1280, the summary row stays one 44 px row |
| `T_js09_delta_kib` | frozen after Task 5 (hard cap 10) | |
| Inherited, unchanged | `T_page_px` 9000, `T_size_mib` 8, `T_js_kib` **125** (amended from 100, plans 07 and 08), `T_frame_ms` 20, `T_frame_throttled_ms` 34, `T_hang_s` 10, `T_live_ms` 100 | |

## Q1 Worker cost
One RK4 step is 0.09 us and 22 steps (a 4x frame) 1.4 us inline: far below the 0.05 ms rule, so the worker is kept because the request asked for it, **for isolation, not for speed**. Note a correction to the plan text (D2): at 1x the day takes 16 s, so the model advances 1.5 steps (90 steps per second) per 16.7 ms frame and 6 steps at 4x; the plan's "5.4 and 21.6" counted something else. The pure clock constant (`HOURS_PER_SECOND` 1.5) is the authority.

## Q2 Renderer
SVG and Canvas were measured with 150 animated rays and four arrows (`q2_q6_chrome.ts`). Median main-thread time per frame: SVG 0.20 ms at 1x and 0.80 ms at 4x CPU throttle, Canvas 0.00 and 0.10 ms. The frame **interval** was 33.3 ms for both renderers (and would be for an empty page): this run's headless Chrome on a loaded host ran at 30 Hz, so the interval cannot discriminate (plan 07 saw 16.7 ms on a calmer machine). The rule is applied on main-thread time: SVG is within the 8 ms bound at 4x by a factor of 10, so **SVG for everything** (rays, arrows, drop). Whether `dayChart` helpers draw the drop: not needed, `dropProfile` is a new small molecule.

## Q3 Spectral and scattering
`LiveResult.spectrum.nominal` is `R(lambda)` of the whole stack on `ctx.wlUm`; the G173 spectrum is `ctx.g173`; both are in the browser context (`contextFromJson`). Band edges UV below 0.4 um, visible 0.4 to 0.7, NIR 0.7 um upward (the G173 range, tail held constant beyond 2.5 um as in `solarWeighted`). Weighted band sum equals `solarWeighted` and `nominal.r_solar` to 3.1e-15. **Scattering:** `S(lambda)` exists only inside `midcoatSpectrum` (Mie on the grid then `kmCoefficients`); exposing it additively is possible but needs a Mie evaluation per slider move on the stepper lane and more page JS. **Decision (lean mode): the scattering visual is dropped** (FR-7 allows it when not exposed); H9 asserts that no scattering element exists. Listed as skipped in the proof log.

## Q4 Stepper equality and closure
See the frozen table. Fields that reach the browser: the context (`ctxJson`) holds `weather` (h = hA + hB V, T_sky = 0.0552 T^1.5 through `scenarioFrom`), the roof (`t_inside_c`, `r_total_m2k_w`, `c_substrate_j_m2k`, `rho_c_coating_j_m3k`), the materials (emissivities) and the optics. The three sliders move irradiance, air temperature and wind; `t_sky` and `h_conv` are functions of the last two (`scenarioFrom`), so the radiated and convected arrows follow them. The page only runs the half-sine scenario live (the hourly Indonesia series are batch only), so the stepper's forcing is the half sine; the forcing is a function in `StepperParams`, so the hourly series is covered by a test that passes the series as forcing.

## Q5 Settling
At most 2 days at every slider extreme: `N_settle` 3, `T_settle_k` 0.05. Transient label: "Transient after your change, not the settled day."

## Q6 Height and wiring
Closed page 8,950 px at 1280, the baseline; the fourth tab sits inside the already closed disclosure, whose summary text is kept at one row. `liveState`'s inputs are the single source of truth: the live simulator's sliders are `#live` controls and the panel's three sliders write the same fields through the page's `applyInputs` (D10). The `loop.add` ticker exists only while playing, as `dayPlayer.ts` does.
