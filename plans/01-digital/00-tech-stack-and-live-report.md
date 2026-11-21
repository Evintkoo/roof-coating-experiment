# Tech Stack and Live Report Implementation Plan (Plan 0 of 6 (0–5))

Part 1 is the plan (decisions, evidence, tasks); Part 2 is the test specification. This document records why the stack is **Bun + TypeScript** (one pure `core` that runs in Bun and in the browser) and plans the deliverable Evint uses: one self-contained, offline HTML file with a **live simulator** (sliders recompute the models in the browser as you drag) and the static results explorer.

**Execution order.** Plans 01 → 02 → 03 run first. Tasks 2–6 of this plan run **last** because they consume plan 03's outputs. Task 1 (browser spike) may run any time after plan 01 Task 8.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** ✅ DONE (executed 2026-11-21 and 2026-11-22; see "Amendments from execution" at the end of Decisions). Landed: `src/core/pipeline/live.ts`, `src/core/pipeline/contextJson.ts`, `src/web/{figures,fmt,linking,liveState,main,optimisation,worker}.ts`, `src/web/{theme.css,template.html}`, `src/node/report/{html,cards,curves,manifest,optimisation,indonesia}.ts`, `tests/report.browser.test.ts` and `tests/report.browser.proof.test.ts` (suite `tests/suites/reportBrowser.ts`), `tests/honesty.test.ts`, `docs/proofs/plan-00.md`. (Written 2026-11-21: stack changed from Python to Bun + TypeScript after the live-simulation requirement.)

**Goal:** Deliver the experiment as one offline HTML file in which the physical models run live in the browser, next to the 96-candidate results explorer, and which can never look more certain than the models are.

**Architecture:** `src/core/` (pure TypeScript, plans 01–03 plus `core/pipeline/live.ts` from this plan) is bundled by `Bun.build` into an inline Web Worker (created from a Blob, so it works from `file://`). `src/web/main.ts` wires sliders, charts and tables; pure browser helpers (`figures.ts`, `linking.ts`, `liveState.ts`) are unit-tested in Bun. `src/node/report/html.ts` inlines bundles, Plotly, CSS, data tables and the model context into one `.html`. A real Chrome driven by Playwright is the instrument for everything the DOM does.

**Tech Stack** (npm/PyPI checked 2026-11-21): Bun 1.3.14 · TypeScript 7.0.2 · plotly.js-dist-min 4.3.0 (2026-11-10, MIT) · playwright 1.65.1 (2026-11-13) driving the installed Google Chrome · zod 4.6.7 · yaml 2.9.1 · fast-check 4.10.3 · @biomejs/biome 2.6.8. Python 3.12 (uv; scipy 1.18.1, miepython 3.3.1, SALib 1.6.0, numpy 2.5.5) exists **only** as the test oracle (plan 01 Task 5).

**Spec:** none; derived from this conversation, three research reports and the measurements below. Related: `Blueprint_Riset_Spandek_3_Fungsi.md` §5.3 (no claim without data), §6.1 (software stack, visualisation).

## What the operator does

1. Once: `bun install`. Chrome is already installed (the tests use it: no browser download).
2. `bun run spandek run --seed 20261121 --out reports/` — plan 03's pipeline, ending with `reports/report.html`. Report build ≤ 10 s.
3. Double-click `reports/report.html`. It works with Wi-Fi off. Drag the sliders: temperature curves, reflectance spectrum and the PROXY indices update live with p5–p95 bands. Share the file by attaching it.
4. Optional, **only on Evint's go-ahead**: publish the same file as a private claude.ai Artifact (single HTML, ≤ 16 MB; this plan only proves the file satisfies those limits).

## Logging and debugging

Schema, level rule, 2 KiB cap and redaction as plan 01. The build is a pure function of files; the page itself ships no telemetry.

| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `report.build_start` | info | node/report/html | input file names, sha256 of each | 1/run |
| `report.bundle_built` | debug | node/report/html | entry, bytes | 2/run |
| `report.refused` | error | node/report/html | code (`interval_order`, `missing_input`, `nonfinite_json`, `size_over_limit`), key | 0–1 |
| `report.html_written` | info | node/report/html | path, bytes, sha256 | 1/run |

In the page: a collapsible "debug" panel (hidden by default) shows the last 100 core events from a ring buffer (`core/events.ts` sink) with the last live-update timings; nothing is sent anywhere, no `console.*` in the production bundle (the build fails if `console.` appears in `src/web/**`). Runbook: **2** → fix the table named in `report.refused.key`; **5** → run the missing stage (`simulate`, `sensitivity`); size refusal → see `T_size_mb`. A test per event is in Part 2.

## Scope

In: stack decision record with evidence, live evaluation API (`core/pipeline/live.ts`), model-context JSON, pure browser modules, the inline-worker bundle, the HTML builder, theme/palette, the page glue, Chrome tests, CLI integration, proof log. Out: publishing the Artifact (outward-facing, needs go-ahead), a server, lab-data views (BLOCKED-1), maps/3D.

### Stack and versions

| Layer | Choice | Version (date) | Why |
|---|---|---|---|
| Runtime / build / test | Bun | 1.3.14 (installed; latest 1.4.5) | one tool for run, test, bundle (`Bun.build`), workers, hashing; measured byte-identical bundles |
| Language | TypeScript strict | 7.0.2 (2026-07-08) | `tsc --noEmit` passes under strict flags in the smoke test |
| Models and statistics | own pure `core` | — | runs in Bun and in the browser; Python is test-only |
| Validation / config | zod strict + yaml | 4.6.7 / 2.9.1 | strict schemas reject the YAML `no → false` trap (measured); blueprint names YAML |
| Charts | Plotly.js (browser) | plotly.js-dist-min 4.3.0 | only candidate with built-in parallel-coordinates axis brushing; 4.85 MB inline |
| Page | one HTML template + `theme.css` + bundled `main.ts`, all inlined | — | offline, deterministic, no framework |
| Live compute | inline Web Worker from a Blob | — | UI never blocks; measured below |
| Browser tests | Playwright + installed Chrome | 1.65.1 / Chrome 157 | the DOM is the thing under test |
| Property tests | fast-check | 4.10.3 | replaces hypothesis |
| Test oracle | Python (uv) scipy / miepython / SALib | see Tech Stack | independent implementations in another language |

**Gaps this plan closes:** blueprint §6.1 "Visualisasi", §5.4 card presentation, §5.3 honesty in display, and the live-simulation requirement.

## Research evidence

Sources: PyPI/npm registry JSON for versions and dates; three read-only research agents (visualization libraries, compute stack, delivery format). **Their toy builds and benchmarks could not run (read-only sandbox), so every number below was measured by the coordinator on 2026-11-21** (macOS arm64, Bun 1.3.14, Node 22 V8, Chrome 157, `nice 10`).

| Claim | Result | How |
|---|---|---|
| TypeScript Mie vs miepython | absorbing sphere (n = 2.7, k = 0.001, d = 0.25 µm) equal to 8 digits at 0.3/0.4/0.55/1/2 µm; Rayleigh error 7.06e-6; first attempt had the opposite sign convention (Bohren–Huffman `n + ik` vs miepython `n − ik`) | Bohren–Huffman port vs `miepython.efficiencies` |
| Mie cost | 0.53 ms (Bun) / 0.84 ms (V8) per 2-pigment × 221-wavelength stack; miepython ≈ 7.9 ms per pigment call | timing loops |
| Thermal (RK4, dt 60 s, 48 h) | 0.53 ms/case Bun, 1.49 ms V8; 864 cases 0.33 s Bun / 1.28 s V8; t_max 36.318245 vs scipy DOP853 36.318250 °C | port vs scipy |
| LSODA unsegmented at rtol 1e-9 | up to 5.17 K error at the 06:00/18:00 irradiance kink; segmented DOP853 ≈ 1e-6 K | scipy |
| Live loop in Chrome 157 (offline, `file://`, Blob worker, Plotly.react) | 200 slider updates: worker compute 6.4 ms (1 candidate × 9 scenarios, no draws), Plotly.react 4.7 ms, round trip 6.5 ms; 0 console errors, 0 failed requests; file 4,845,745 B | Playwright + `Bun.build` + inlined HTML |
| Sobol on Ishigami, N = 2¹⁴ | scipy S1 (0.3139, 0.4423, −0.0001), ST (0.5576, 0.4424, 0.2441); SALib S1 (0.3139, 0.4437, −0.0001), ST (0.5574, 0.4424, 0.2436) | both libraries |
| Tooling smoke test | `tsc` 7.0.2 strict passes; `bun test` runs fast-check (200 runs) and a Bun Worker round trip; strict zod rejects YAML `value: no`; `Bun.build` byte-identical across runs; `os.setPriority(pid, 10)` works; `JSON.stringify({a: NaN})` writes `null` silently (so `safeJson` exists) | scratchpad project |
| Plotly inline / Vega-Lite inline (Python-built toys, earlier) | 4,845,220 B / 938,780 B, both byte-identical across runs, 0 network-loading tags | earlier toy builds |
| Chromium for tests | Google Chrome 157.0.8103.80 installed; `chromium.launch({channel:"chrome"})` works with Playwright 1.65.1 and no download (another Chrome from the Playwright MCP may already be running; the tests start only their own) | review run |
| Parcoords brushing (reviewer, real mouse drags in headless Chrome 157, plotly.min.js 4.3.0, 96×5) | each drag fires exactly one `plotly_restyle` on mouse-up; payload for one range is nested `[{"dimensions[1].constraintrange":[[lo,hi]]},[0]]` while the property `gd.data[0].dimensions[1].constraintrange` is flat `[lo,hi]`; two ranges on one axis are nested in both; clearing fires `…constraintrange: null` (property `undefined`); reordering an axis fires key `dimensions` with the whole array; programmatic `restyle` also fires the event; brush rectangles must be located through `.axis-brush rect.background`; `Plotly.react` with a fresh spec **clears** the brush unless `uirevision` is set; 0 console errors | review spike |
| Plotly retheming via `Plotly.relayout` (reviewer) | scatter, bar and splom: `paper_bgcolor`, `plot_bgcolor`, `font.color`, `*axis.gridcolor` work; parcoords: only `paper_bgcolor` and `font.color`; `labelfont/tickfont/rangefont.color` and `line.colorscale` need `Plotly.restyle(gd, {...}, [0])`; the hard-coded black axis/tick strokes need a CSS override (`.parcoords .axis path.domain, .tick line {stroke: … !important}`) | review spike |
| Live loop with N_LIVE = 32 (reviewer; 33 stack evaluations per request, Blob worker in Chrome 157, machine at load average 16–25 on 10 cores, so pessimistic) | one scenario per draw: mean 50.0 ms, p95 53.6 ms, max 61 ms; **all 9 scenarios per draw: mean 265.7 ms, p95 284 ms (fails 100 ms)**; `Plotly.react` bar chart 4.5 ms | review spike |
| Burst of 50 inputs in 100 ms with a literal "show only the newest id" rule | sent ids [1,12,21,30,39,47,50], shown only [50]: correct final state but nothing drawn during the drag → the rule is "show any result newer than the one shown" | review spike |
| Bundles | `Bun.build` browser IIFE with zod 4 + yaml: 929 KB unminified / 499 KB minified; output byte-identical across API runs, CLI vs API and different working directories; plotly.min.js 4.3.0 contains no `</script` and no `<script`, 13 `</` all inside string literals (the `</` → `<\/` escape is safe) | review spike |
| `bun test` | default per-test timeout 5 s; `bunfig.toml` `timeout`/`testTimeout` keys are ignored in 1.3.14; `bun test --timeout 30000` works | review spike |

Not measured: Plotly parcoords brushing events in a real browser (Task 1), Vega-Lite parcoords, Pyodide (not pursued: miepython needs numba and the runtime is large — both unverified), marimo WASM from `file://`, Artifact CDN allow-list, Safari/Firefox behaviour.

## Alternatives considered

| Option | Verdict |
|---|---|
| Python batch + TypeScript port for the live view | Rejected: two implementations drift; Python stays as oracle only. |
| Python server (FastAPI + WebSocket) for live simulation | Rejected: needs a running server, not shareable as a file, adds latency. |
| Rust → WebAssembly core | Rejected: TypeScript already needs ≈ 6 ms per live update (measured); no gain for a new toolchain. |
| Pyodide (Python in the browser) | Not pursued (see above). |
| Vega-Lite (npm, in the browser) | Rejected for the explorer: no native parcoords axis brushing; fallback if the Task 1 re-run fails. |
| Hand-built SVG/Canvas parcoords | Rejected for now (≈ 400 lines to own); fallback if Plotly size or events fail. |
| Bokeh, HoloViews/Panel, pyecharts, mpld3, Streamlit, Dash, Quarto, marimo, Observable Framework, Evidence | Rejected: Python-only or server/Node runtimes, no native parcoords, or unverified offline determinism (details in the research reports). |

## Risks (each pinned by a test)

| Risk | Test |
|---|---|
| Parcoords brush events differ from what the script expects | T-BRW-3 (real drag in Chrome vs a filter computed in the test) |
| Page or worker touches the network | T-BRW-1 (offline context, zero failed requests) + T-HTM-2 (static scan) |
| Live numbers differ from batch numbers | T-LIV-3 (same inputs ⇒ same outputs, core vs `results.csv` row) and T-BRW-5 (page vs `core` in Bun) |
| Slider changes arrive faster than compute (stale results shown, or nothing shown during a drag) | T-BRW-7 (newest-wins with intermediate frames) |
| `Plotly.react` clears the active brush (measured: `uirevision` does not keep it in plotly 4.3.0) | T-BRW-4 (brush held in app state; the parcoords figure is rebuilt with `purge` + `newPlot` from the held ranges; real drag, reorder, redraw in Chrome) |
| Live view silently evaluates all 9 scenarios per draw (≈ 266 ms) | T-LIV-5 (`nThermalCases === nDraws + 1`) |
| zod/yaml bundled into the browser worker | T-HTM-13 (worker bundle contains no zod) |
| Report looks more certain than the model | T-HON-1..4 |
| Non-deterministic bytes (timestamps, random ids, bundle ordering) | T-HTM-3 |
| `NaN`/`Infinity` leaks into embedded JSON (`JSON.stringify` writes `null`) | T-HTM-5 (`safeJson`) |
| Low contrast, colour-only encoding, phone overflow | T-A11Y-1..4 |
| Bundle growth breaks the 16 MB Artifact limit | T-HTM-6 (`T_size_mb` = 8) |
| Engine differences (V8 vs JavaScriptCore) in `Math.exp`/`Math.pow` | oracle tolerances ≥ 100× measured differences; T-X-5 (plan 02) runs the model suite under Node as well; T-BRW-5 compares Chrome to Bun at 1e-6 |
| Live window exceeds model domain (PhysicsRangeError in the UI) | T-LIV-4 (sliders clamped to plan-01 ranges; fault F8) |

## Requirements

FR-1 The report MUST be one `.html` file with no network request at view time. FR-2 It MUST contain: banner (PROXY statement, run id, manifest core hash), live simulator, summary of the three shortlisted candidates with intervals, explorer (parcoords + scatter matrix + table + scenario selector), candidate cards, sensitivity, methods and limits, manifest. FR-3 Moving any simulator input MUST recompute the models in the browser (one thermal case per uncertainty draw plus the nominal, never all nine scenarios per draw) and update charts and tiles; the p95 latency from input event to updated DOM MUST be ≤ `T_live_ms` = 100. FR-4 Live results for a given input MUST equal `core` results computed in Bun (≤ 1e-6 relative) and, at `nDraws = 256`, the corresponding row of `results.csv`. FR-5 Selecting a range on a parcoords axis MUST update table and scatter matrix to exactly the matching candidates. FR-6 Every predicted value MUST show its interval and every `*_proxy`/risk/cost quantity MUST carry the word PROXY in its axis title or column header. FR-7 Same inputs and the same run id ⇒ byte-identical file (the run id contains a time stamp and a UUID, so two separate `run` invocations differ only there). FR-8 Light and dark themes, colour-blind-safe categorical colours, ≥ 4.5:1 text contrast, no horizontal scroll at 390 px. FR-9 The build MUST refuse (exit 2/5) on invalid inputs rather than render them. NFR-1 Build ≤ `T_build_s` = 10. NFR-2 File ≤ `T_size_mb` = 8.

## Acceptance: hypotheses and proofs

| ID | Falsifiable hypothesis | Experiment / deciding observable | Falsified if |
|---|---|---|---|
| H1 | The report is fully offline | Chrome context with `offline: true`; load file; count failed requests and console errors | any failed request or error |
| H2 | Output is deterministic | build twice, `sha256`; change one input cell, build again | equal hashes after an input change, or different hashes without one |
| H3 | Brushing selects exactly the right candidates | drag-brush two ranges on two axes; compare page selection with a filter computed in the test from `pareto.csv` | any id differs |
| H4 | Nothing is shown without uncertainty or a label | scan figure specs and page text (T-HON) | a predicted series without band/interval, a proxy axis without PROXY, a forbidden phrase |
| H5 | Numbers shown equal numbers computed | table cell text vs CSV values, 96 rows × all columns | any mismatch beyond formatted rounding |
| H6 | Theme and layout hold | dark-scheme emulation; 390×844 viewport; contrast computed from CSS tokens | contrast < 4.5, horizontal overflow, background unchanged in dark |
| H7 | Size within limit | file bytes | > `T_size_mb` or > 16 MB |
| H8 | Live equals batch | for 5 fixed (candidate, scenario) pairs: page values vs `core` in Bun (1e-6) and vs the `results.csv` row at `nDraws = 256` (1e-9 in Bun) | any difference above tolerance |
| H9 | Live latency | 200 programmatic slider moves in Chrome; p95 of (input event → DOM updated) | p95 > `T_live_ms` |
| H10 | Newest wins and the page keeps drawing | fire 50 input events in 100 ms; the displayed result ids are strictly increasing, at least 2 intermediate frames are drawn, and the final DOM equals the result for the last input | an older result shown after a newer one, no intermediate frame, or a wrong final state |
| H11 | `core` is browser-clean | `Bun.build` browser target for the bundle succeeds and the page loads with zero console errors | any error |

Thresholds: `T_size_mb = 8`, `T_build_s = 10` (HTML build only; plan 03's `report` budget covers curves), `T_contrast = 4.5`, `T_phone_px = 390`, `T_live_ms = 100` (measured by the reviewer at 32 draws, one scenario per draw: mean 50.0 ms, p95 53.6 ms on a machine at load 16–25; an arithmetic estimate from Bun unit costs gave ≈ 80 ms; the limit leaves ≥ 1.2× headroom in the worst estimate and ≈ 1.9× on the measurement; frozen), `N_LIVE = 32`.

**Fault-injection matrix** (edit exactly one input of a copy of the results; run `bun run spandek report`):

| ID | Single edit | Expected | Exit |
|---|---|---|---|
| F1 | one row `t_max_lo > t_max_pred` | `report.refused` `interval_order`, no file written | 2 |
| F2 | delete `sensitivity.csv` | `missing_input` | 5 |
| F3 | one candidate infeasible with NaN outcomes | row shown as "not evaluated", absent from plots, no `NaN` token in HTML | 0 |
| F4 | `gel_time_rel` = `inf` | page shows "never gels"; embedded JSON stays valid (T-HTM-5) | 0 |
| F5 | remove the "Limits" section from the template | T-HON-3 fails | test fails (build still 0) |
| F6 | add a build timestamp to the template | T-HTM-3 fails | test fails |
| F7 | oversize: embed a 20 MB blob | `size_over_limit` | 2 |
| F8 | set a slider's value beyond its range through the DOM | value clamped, no error toast, no `PhysicsRangeError` | 0 |

Given/When/Then: G1 *Given* plan-03 outputs, *When* `report` runs, *Then* `report.html` exists and the manifest lists its sha256 (FR-1, FR-7, T-CLI-R1). G2 *Given* the page in Chrome offline, *When* two parcoords ranges are brushed, *Then* the table row set equals the test's filter (FR-5, T-BRW-3). G3 *Given* the page, *When* the TiO2-fraction slider moves, *Then* the reflectance tile and temperature curve change within `T_live_ms` and equal `core` values (FR-3, FR-4, T-BRW-5/6).

Principle: the brushing oracle is a plain filter in the test; the live oracle is the same `core` in Bun plus the batch CSV (integration across engines and the worker path), while physical correctness is established below it by the plan-02 oracles (Python libraries, closed forms).

## Execution contract: one shot, nothing left open

**Preflight gate** (print and stop if missing): (1) plans 01–03 done and green, including a full real `run`; (2) Google Chrome is installed (checked: `/Applications/Google Chrome.app`, version 157) and Evint approves running one headless Chrome during the gate (CPU rule: one browser, priority 10); (3) Evint confirms the report language is **English** (the blueprint is Indonesian; "Indonesian" switches the template strings only); (4) Evint confirms publishing to Artifact is out of the run; (5) if the Task 1 re-run shows that brush ranges are no longer readable, Evint's go-ahead is needed before switching to the recorded fallback (otherwise the task stops).

No stub/TODO/skip/xfail. Task 1 is a spike and ends in written answers Q1–Q3 in `docs/spikes/plan-00.md`; if brushing events cannot be read reliably, stop and switch to the recorded fallback only with Evint's go-ahead, never degrade silently. Done = H1–H11 proven with run ids in `docs/proofs/plan-00.md`, `bun run check` green (browser tests included), one real `run` producing `report.html`. If a task fails: stop, leave the tree clean, report the failing proof with its log. Out of scope: merge, push, publish.

## Global Constraints

Inherited from plans 01–03, plus: no CDN, no web fonts (system font stack only), no external images; JSON embedded with `safeJson`; the production bundle contains no `console.`; every `.css`/`.html` template under `src/web/` is read at build time and inlined; the page script has no framework; colours come only from `theme.css` tokens and the Okabe–Ito palette; copy rules from plan 03 (no "proven", "safe", "guaranteed", no percent safety claims).

## Review Focus

1. A candidate id or cell containing `</script>` or HTML (the contract allows only `SP-\d{3}`, but a bad CSV must not inject script) → escaped.
2. Zero brush selection (no candidate matches) → table shows an explicit "no candidates match" row, not an empty page.
3. Scenario selector change while a brush is active → selection persists, bands update.
4. Print/PDF of the page → no dark background, no clipped charts (`@media print`).
5. 11-variable sensitivity labels and long card text at 390 px → wraps, no overflow.
6. All three layer toggles off in the live simulator → shows the bare-spandek (C0) result, not an error.
7. User drags a slider to its extreme and holds → no error, no growing queue (requests coalesce).

## Decisions (all settled)

- **D1** One `core`, three hosts: Bun (CLI, tests, batch), Chrome (live worker), Node (engine check only). `core` obeys plan 01 FR-7.
- **D2** Live API in `core/pipeline/live.ts`: `liveSimulate(inp, ctx, nDraws, seed)` = `stackProps` for the nominal + `nDraws` draws from `drawMaterials(mat, nDraws, deriveSeed(seed, 100))` (the same stream role as the batch; fixed seed 20261121 in the page, so the bands do not jitter), one `thermalOutcomes` batch for the selected scenario (exactly `nDraws + 1` thermal cases: measured 266 ms if all nine scenarios were run per draw), plus controls C0 (bare) and C1 (datasheet) as reference lines. `N_LIVE = 32`; the batch uses 256; intervals in the live view are labelled "32 draws".
- **D3** Worker protocol: `{id, inputs}` in, `{id, result, ms}` out; the main thread keeps one request in flight plus one pending (the newest inputs) and schedules sends with `requestAnimationFrame`; it **displays any result whose id is newer than the one shown** (older ones are dropped), so a long drag keeps drawing and the final state is always the last input's result.
- **D4** The model context is embedded as JSON (`contextToJson`/`contextFromJson`, typed arrays as plain arrays) in `window.__SPANDEK__`; the worker receives it once at start.
- **D5** Charts: Plotly figures are plain specs from pure functions in `web/figures.ts` (`{data, layout}`), rendered with `Plotly.react` (live) / `Plotly.newPlot` (static); every figure has a fixed element id (`fig-<name>`).
- **D6** Palette: Okabe–Ito (`#E69F00 #56B4E9 #009E73 #F0E442 #0072B2 #D55E00 #CC79A7 #000000`) for categories; Viridis for `pareto_freq`; intervals are lighter fills of the same hue plus an outline.
- **D7** Theme by CSS variables on `:root`, `@media (prefers-color-scheme: dark)` plus a session-only toggle; Plotly colours are set from the same tokens at load and on scheme change by the pure `themeKeys(tokens)` (verified keys: `Plotly.relayout` for `paper_bgcolor`, `plot_bgcolor`, `font.color`, `*axis.gridcolor` on scatter/bar/splom; for parcoords only `paper_bgcolor` and `font.color` via relayout and `labelfont/tickfont/rangefont.color` + `line.colorscale` via `Plotly.restyle(gd, {…}, [0])`, plus one CSS rule overriding the hard-coded black axis and tick strokes). Figures still set `uirevision: "spandek"`, but that does not keep the parcoords brush (plotly 4.3.0, spike Q1): the brush is held in app state and re-injected as `constraintrange` when the parcoords figure is rebuilt (see Amendments).
- **D8** Page order and sticky anchor bar: Overview (banner, "what this is and is not") → Live simulator → Summary (3 shortlisted) → Explorer → Cards → Sensitivity → (optional, present only when their commands have run: Indonesia (plan 4), Optimisation with the budget slider (plan 5)) → Methods and limits → Manifest. `report` is the only command that writes `report.html`: `refine`, `budget-table` and `indonesia` do not regenerate it; they register their output files with hashes under `manifest.extra[]` and print a `report.stale` hint, and `report` then rebuilds the page and rewrites `report_sha256`. Every extra file the page reads (`budget_table.json`, the four `refine_*.csv`, the four `indonesia_*` files) is verified against `extra[]`; a changed, unlisted or missing file is refused (exit 5). "Limits" is reachable from the top bar at all times.
- **D9** Explorer state is one `Set` of candidate ids in `web/linking.ts` (`selectByRanges(rows, ranges)` pure); views: Plotly `parcoords`, `splom` (non-selected dimmed), an HTML table (`hidden` attribute). **Brush reading (verified):** on every `plotly_restyle` re-read `gd.data[0].dimensions[i].constraintrange` for all dimensions (the event payload alone is insufficient because a reorder fires key `dimensions`), and pass the raw values through `normaliseRanges(raw)` which accepts `undefined`, a flat `[lo, hi]` and a nested `[[lo, hi], …]`. The held ranges are written back as `constraintrange` whenever the parcoords figure is drawn.
- **D10** Live inputs and clamps: the seven design variables within their plan-01 ranges and pH within its range (no water-ratio slider: the model gives it zero effect in 1–5, see plan 2 D4), scenario = a W1–W9 selector **or** custom irradiance/air-temperature/wind sliders within the plan-01 level extremes, three layer toggles. The sliders' `min/max/step` come from `MaterialRanges`, never hard-coded.
- **D11** Language English; one `fmtValue(x, digits)` helper formats every number (`Infinity` → "never gels", NaN → "not evaluated").
- **D12** Determinism: no timestamps or random ids in the HTML other than the run id passed in; the banner shows the manifest **core** hash (`core_sha256`, the manifest without its `report_sha256` field), so the HTML does not depend on its own hash (the manifest records `report_sha256` afterwards, as its last field); bundles from `Bun.build` (measured byte-identical); data embedded in sorted key order.
- **D13** The build writes atomically (temp + rename) and refuses on `size_over_limit` before writing.

### Amendments from execution (2026-11-22)

- **D7 / D9 / T-BRW-4 (brush):** `uirevision` does not keep the parcoords brush in plotly.js 4.3.0 (spike Q1, measured), and after an axis reorder `Plotly.react` painted the held ranges onto a second axis. The brush is therefore held in application state, re-injected as `constraintrange` on every draw, and the parcoords figure is rebuilt (`Plotly.purge` then `Plotly.newPlot`, brush handlers bound again) instead of reacted. The other figures use `Plotly.react`. Proofs: `axisReorderKeepsBrush`, `brushSurvivesPlotlyReact`, `scenarioChangeKeepsSelection` (now in the fast tier).
- **D8 (regeneration):** `refine`, `budget-table` and `indonesia` do not rebuild `report.html`. They register their outputs in `extra[]` (which changes `core_sha256`) and print a `report.stale` hint; `report` rebuilds. The report refuses any extra file that is changed, unlisted or (for a registered set) missing. `verify-report --in DIR` flags a page whose embedded core hash (`<meta name="spandek-core-sha256">`) no longer matches the manifest (exit 5, code `stale`); `report` names the page it replaces. The manifest table on the page lists `extra[]` entries with their hashes.
- **D12 / FR-8:** `report.html` is not in `files[]` (its hash would change the page that shows the manifest); the manifest's last field is `report_sha256`, excluded from the core hash.
- **Biome:** `biome.json` excludes `plans`, `.superpowers`, `docs/spikes/plan-04`, `src/web/template.html` and `tests/fixtures/report` (generated or prose files).
- **Theme (series colours):** categorical series that would be invisible on one background carry a light and a dark colour (`meta.palette`, applied by `themeSeries` at every draw), each at least 3:1 against the plot background (tested on computed colours). The Indonesia bars use `INDONESIA_SERIES_COLORS`; the datasheet control is no longer black on the dark plot.
- **Page wording:** the Overview says the main results are the initial, as-applied state and that ageing appears only as a labelled scenario in the Indonesia section (aluminium, scenario loss range), never as a measurement; the honesty test scans the page for contradictions.
- **Tiers:** the five size-independent browser proofs (`axisReorderKeepsBrush`, `brushSurvivesPlotlyReact`, `noMatchShowsExplicitRow`, `scenarioChangeKeepsSelection`, `liveMatchesCoreInBun`) run in the fast tier; latency, burst, layers-off, extreme hold, clamping, keyboard, print, console and debug-panel proofs stay in the proof tier (wall-clock bound or long holds).

## File Structure

| Source | Test |
|---|---|
| `src/core/pipeline/contextJson.ts` | `tests/core/pipeline/contextJson.test.ts` |
| `src/core/pipeline/live.ts` | `tests/core/pipeline/live.test.ts` |
| `src/web/figures.ts` | `tests/web/figures.test.ts` |
| `src/web/linking.ts` | `tests/web/linking.test.ts` |
| `src/web/liveState.ts` | `tests/web/liveState.test.ts` |
| `src/web/fmt.ts` (`fmtValue`, `contrastRatio`) | `tests/web/fmt.test.ts` |
| `src/node/report/html.ts` | `tests/node/report/html.test.ts` |
| `src/web/main.ts`, `src/web/worker.ts` (DOM and worker glue) | `tests/report.browser.test.ts` (cross-cutting) |
| `src/web/theme.css`, `src/web/template.html` | covered by `html.test.ts`, `report.browser.test.ts`, `honesty.test.ts` |
| (cross-cutting) | `tests/honesty.test.ts` (T-HON), `tests/report.browser.test.ts` (browser), `tests/determinism.test.ts` (plan 01) |

## Tasks

### Task 1: Browser spike Q1–Q3

**Tests:** spike script `docs/spikes/plan-00/spike.ts` (kept; run with `bun run docs/spikes/plan-00/spike.ts`). **Creates:** `docs/spikes/plan-00.md`.
- [ ] Build a toy page (96×5 parcoords + splom + table + `<select>`) with Plotly inline and fixed element ids, Bun-bundled; drive it in Chrome (Playwright `channel: "chrome"`): drag on two axes; record which events fire (`plotly_restyle` payload shape for `constraintrange`, single and multiple ranges, clearing a range, axis reorder).
- [ ] Answers (pre-verified once by the independent review on 2026-11-21; this task re-runs them inside the repo and records the results, because the page depends on them): **Q1** brush/clear/reorder events and payloads and the reading procedure — see the Research evidence row and D9; **Q2** Plotly with fixed ids plus a `Bun.build` bundle gives byte-identical HTML on two builds; **Q3** the retheming keys of D7, including the CSS override for parcoords axis strokes. If Q1 no longer holds (ranges unreadable), stop and report; do not improvise.
- [ ] Commit: `docs: browser spike for parcoords brushing and theming`

**Acceptance:** de-risks H3, H2, H6.

### Task 2: Context JSON and the live evaluation API

**Tests:** `tests/core/pipeline/contextJson.test.ts`, `tests/core/pipeline/live.test.ts`. **Creates:** `src/core/pipeline/contextJson.ts`, `src/core/pipeline/live.ts`.
**Interfaces:**
```ts
export function contextToJson(ctx: ModelContext): string        // safeJson, sorted keys, typed arrays → number[]
export function contextFromJson(text: string): ModelContext
export type LiveInputs = { design: Omit<DesignRow, "candidate_id">; ph: number; layers: Layers;
  scenario: { irradiance_w_m2: number; t_air_c: number; wind_m_s: number } }
export type Band = { lo: number; hi: number }
export type LiveResult = { nThermalCases: number; nominal: Outcome; bands: { r_solar: Band; t_max_c: Band; corrosion_risk: Band; wetting_score: Band; delam_proxy: Band };
  series: { t_k: Float64Array; lo: Float64Array; hi: Float64Array }; spectrum: { nominal: Float64Array; lo: Float64Array; hi: Float64Array };
  controls: { C0: Outcome; C1: Outcome }; nDraws: number }
export function liveSimulate(inp: LiveInputs, ctx: ModelContext, nDraws: number, seed: number): LiveResult
```
- [ ] Tests: `contextRoundTripExact` (every array equal), `contextJsonIsDeterministic`, `liveEqualsBatchRowAtN256` (T-LIV-3/H8: take plan-03 `results.csv` row for SP-017/W3, build `LiveInputs` from the same design row and scenario, `nDraws = 256`, the same run seed passed to `liveSimulate`, which derives stream 100 internally like the batch: `r_solar_pred`, `t_max_pred`, `_lo`, `_hi` equal within 1e-9), `bandsContainNominal`, `allLayersOffEqualsC0` (Review Focus 6), `outOfDomainInputThrowsCode4` (F8 at core level), `liveRunsOneThermalCasePerDraw` (T-LIV-5: the result exposes `nThermalCases === nDraws + 1`), `workerBundleHasNoZod` (T-HTM-13: the worker bundle text contains no `ZodError`; `live.ts`, `stackProps.ts`, `contextJson.ts` and the models use `import type` for config types), `liveUnder100msForN32` (`T_live_ms` on Bun; informational headroom), `seedFixedBandsDoNotJitter` (two calls identical). Run → FAIL.
- [ ] Implement. Run → PASS.
- [ ] Commit: `feat: live evaluation API and model-context JSON`

**Acceptance:** H8 (core part); FR-4.

### Task 3: Pure browser modules

**Tests:** `tests/web/figures.test.ts`, `linking.test.ts`, `liveState.test.ts`, `fmt.test.ts`, `tests/honesty.test.ts` (figure part). **Creates:** `src/web/figures.ts`, `linking.ts`, `liveState.ts`, `fmt.ts`.
**Interfaces:**
```ts
// Row and file types (ObjRow, CurvesJson, SpectraJson, SensRow, ControlRow) come from plan 03 `core/pipeline/tables.ts`.
export type ThemeTokens = { paper: string; plot: string; font: string; grid: string; axisStroke: string; colorway: readonly string[] }
export type FigureSpec = { data: object[]; layout: object; config?: object }
export function figParcoords(obj: readonly ObjRow[], shortlist: Record<string, string>): FigureSpec    // 5 dimensions; colour = pareto_freq
export function figSplom(obj: readonly ObjRow[], shortlist: Record<string, string>): FigureSpec
export function figTofT(curves: CurvesJson, scenarioId: string): FigureSpec         // line + p5–p95 band (fill "tonexty") per series
export function figSpectrum(spec: SpectraJson, g173: Spectrum): FigureSpec
export function figSobol(sens: readonly SensRow[], output: string): FigureSpec       // S1/ST bars with error_y = conf
export function figMorris(sens: readonly SensRow[], output: string): FigureSpec
export function figLiveTofT(r: LiveResult): FigureSpec; export function figLiveSpectrum(r: LiveResult, g173: Spectrum): FigureSpec
export function themeKeys(tokens: ThemeTokens): { relayout: object; restyleParcoords: object }   // D7, pure
export function normaliseRanges(raw: unknown): [number, number][]                       // undefined → [], flat [lo,hi] → [[lo,hi]], nested as is; throws on anything else
export function axisLabel(column: string): string                                    // appends " (PROXY)" for *_proxy, corrosion_risk, delam, cost
export function selectByRanges(rows: readonly ObjRow[], ranges: Record<string, readonly [number, number][]>): Set<string>   // AND across axes, OR across ranges on one axis
export type LiveState = { inputs: LiveInputs }; export function defaultLiveState(ranges: MaterialRanges, weather: WeatherConfig): LiveState
export function clampInputs(inp: LiveInputs, ranges: MaterialRanges, weather: WeatherConfig): LiveInputs          // D10
export function fmtValue(x: number, digits?: number): string; export function contrastRatio(fgHex: string, bgHex: string): number   // WCAG formula
```
- [ ] Tests: `parcoordsHasFiveDimensionsAndIds`, `everyLineHasBandTrace` (T-HON-1: a `fill: "tonexty"` trace per line in `figTofT`, `figLiveTofT`, `figSpectrum`), `sobolErrorBarsEqualConf`, `axisLabelsMarkProxy` (T-HON-2), `infeasibleRowsAbsentFromFigures` (F3), `noNonFiniteInFigureSpecs` (T-HTM-5: `safeJson` of every spec), `everyFigureSetsUirevision` (T-FIG-9), `themeKeysCoverEachChartType` (parcoords keys use restyle, others relayout), `normaliseRangesHandlesAllThreeShapes` (T-LNK-5/6), `selectByRangesMatchesPlainFilter` (fast-check vs a naive implementation in the test; AND/OR semantics), `emptySelectionIsEmptySet`, `clampInputsKeepsInsideRanges` (fast-check, F8), `defaultLiveStateInsideRanges`, `fmtValueInfinityAndNaN` (D11), `contrastRatioKnownValues` (black/white = 21, same colour = 1). Run → FAIL.
- [ ] Implement. Run → PASS.
- [ ] Commit: `feat: pure browser modules with uncertainty bands and PROXY labels`

**Acceptance:** H4 (figure part), H5; F3, F4, F8.

### Task 4: Theme, template and the HTML builder

**Tests:** `tests/node/report/html.test.ts`, `tests/honesty.test.ts`. **Creates:** `src/web/theme.css`, `src/web/template.html`, `src/node/report/html.ts`.
**Interfaces:**
```ts
export function buildReport(inDir: string, outPath: string, opts: { runId: string; configDir: string; dataDir: string }): Promise<string>   // refuses with SpandekError (2/5/…); atomic write; returns sha256
```
The builder: validates inputs (`validateResults`, interval order), runs `Bun.build` for `src/web/main.ts` and `src/web/worker.ts` (`target: "browser"`, `format: "iife"`, `minify: false`), reads `plotly.min.js` from `node_modules/plotly.js-dist-min`, embeds `window.__SPANDEK__ = {meta, tables, curves, spectra, cards, ctx}` through `safeJson`, substitutes `{{…}}` placeholders (HTML-escaped; `</` → `<\/` inside script blocks), refuses over `T_size_mb`.
- [ ] Tests: `singleFileNoNetworkTags` (T-HTM-2: no `src=`/`href=`/`@import url(`/`fetch(`/`XMLHttpRequest` pointing at `http`), `sameInputsSameBytesAndInputChangeChangesBytes` (H2), `nonFiniteNeverReachesJson`, `sizeWithinLimit` (H7), `scriptTagInCellIsEscaped` (Review Focus 1), `limitsSectionAndNavLinkPresent` (T-HON-3, F5), `forbiddenPhrasesAbsent` (T-HON-4; regex from plan 03 H8 over the full page text), `everyProxyColumnHeaderSaysProxy`, `tableValuesEqualCsv` (H5), `contrastTokensPassBothThemes` (T-A11Y-1: `contrastRatio` ≥ `T_contrast` for every text/background token pair in light and dark), `productionBundleHasNoConsole`, `refuseIntervalOrderF1`, `missingSensitivityF2`, `oversizeRefusedF7`, `noTimestampInTemplate` (F6).
- [ ] Run → FAIL. Implement per D5–D8, D11–D13: sections per D8; `theme.css` tokens, dark and print media, system font stack, 16 px side gutters; the template holds the layout only (no data). Run → PASS.
- [ ] Commit: `feat: single-file HTML report builder with honesty guards`

**Acceptance:** H2, H4, H5, H6 (token part), H7; F1, F2, F5, F6, F7.

### Task 5: Page glue and browser tests (tests first)

**Tests:** `tests/report.browser.test.ts` (Playwright library inside `bun:test`; `chromium.launch({channel: "chrome", headless: true})`; the tests start and close only their own Chrome; per-test timeout 60 s on top of `bun test --timeout 30000`). A real report is built from the plan-03 default run into a temp dir. **Creates:** `src/web/main.ts`, `src/web/worker.ts` (excluded from the mirror rule in plan 01).
- [ ] Tests: `offlineZeroFailedRequestsAndNoConsoleErrors` (H1/T-BRW-1: `newContext({offline: true})`), `brushTwoAxesMatchesFilter` (H3/G2: drag-brush on two axes located through `.axis-brush rect.background`; read table rows and splom selection; compare with `selectByRanges` computed from `pareto.csv` in the test), `brushClearRestoresAll96`, `axisReorderKeepsBrush` (reorder fires key `dimensions`; selection unchanged), `brushSurvivesPlotlyReact` (T-BRW-4: change the scenario, then check `constraintrange` still set), `noMatchShowsExplicitRow` (Review Focus 2), `scenarioChangeKeepsSelection` (Review Focus 3), `liveMatchesCoreInBun` (T-BRW-5/H8: five input states; tile values and curve max vs `liveSimulate` run in the Bun test process, 1e-6), `sliderMoveUpdatesWithinLimit` (H9/T-BRW-6: 200 programmatic input events; p95 ≤ `T_live_ms`; also record the median), `newestWinsUnderBurst` (H10/T-BRW-7: 50 events in 100 ms; displayed ids strictly increasing, ≥ 2 intermediate frames, final state equals the last input's result), `layersOffShowsBareSpandek` (Review Focus 6), `extremeSliderHoldNoErrors` (Review Focus 7), `outOfRangeValueIsClamped` (F8), `darkSchemeBackgroundAndPlotlyColours` (H6: `emulateMedia({colorScheme: "dark"})`; computed `body` background luminance < 0.2, the Plotly paper colour equals the CSS token, and the parcoords axis stroke is not black), `phoneViewportNoHorizontalOverflow` (`T_phone_px`, 390×844, `scrollWidth <= innerWidth`), `keyboardReachesLimitsLink` (T-A11Y-3), `printMediaNoDarkBackground` (Review Focus 4), `noConsoleErrorsDuringLiveUse` (H11), `debugPanelShowsEventsAndTimings`.
- [ ] Run → FAIL (no page glue yet).
- [ ] Implement `worker.ts`: receive `ctx` once (`contextFromJson`), then answer `{id, inputs}` with `liveSimulate(inputs, ctx, N_LIVE, 20261121)`, posting `{id, result, ms}`; post `{id, error: {code, phase, key}}` for a `SpandekError` and forward `emitEvent` calls as messages (same marshalling as plan 03 D15). Implement `main.ts`: sliders from `MaterialRanges`/`WeatherConfig` (D10); the D3 scheduler; tiles (value `[lo, hi]`, PROXY labels, "nominal only" labels), `figLiveTofT`, `figLiveSpectrum` via `Plotly.react`; explorer (D9); theme toggle (D7); debug panel (ring buffer). No `console.*`. The test hooks `window.__brushRanges()` and `window.__burst(n, ms)` are installed only when the page URL has the fragment `#test` (never in a normal open), and a test asserts they are absent without it.
- [ ] Run → PASS. If any test fails, fix the page, never the test.
- [ ] Commit: `feat: live simulator and explorer page with real-browser proofs`

**Acceptance:** H1, H3, H6, H8–H11; G2, G3; F8.

### Task 6: CLI integration, plan 03 test updates, mutation checks, proof log

**Tests:** `tests/node/cli.test.ts` (extended), `tests/pipeline.e2e.test.ts` (updated). **Modifies:** `src/node/cli.ts` (`report` builds cards + curves + `report.html`, requires `sensitivity.csv`; `run` ends with it; `run_manifest.json` gets `report_sha256` as its last field), and the plan-03 tests that predate this behaviour: the `report` tests in `tests/node/cli.test.ts` now run on a directory that contains `sensitivity.csv` and assert `report.html`; the output list in `tests/pipeline.e2e.test.ts` gains `report.html` and the `report_sha256` manifest field.
- [ ] Tests: `reportHtmlWrittenAndInManifest` (G1; `report_sha256` equals the file's sha256 and `core_sha256` excludes it), `f1ExitCode2NoFileWritten`, `f2ExitCode5`, `buildUnder10s` (`T_build_s`), `reportEventCataloguePresent`, `sameRunIdSameBytes` (FR-7).
- [ ] Run → FAIL. Implement. Run → PASS.
- [ ] Full gate: `bun run check` (browser tests included, one Chrome started by the tests); one real `bun run spandek run`; write run ids and observables for H1–H11 to `docs/proofs/plan-00.md`; run the mutation checks below.
- [ ] Commit: `feat: live HTML report in the spandek run pipeline with proof log`

**Acceptance:** H1–H11; G1, G3; F1, F2, F7.

## Rollout and rollback

Local tool: no flag, no deployment. Rollback = `git revert` of the commit range. The only hand-off outside the repo is the **optional** Artifact publish, which is out of the run: owner Evint; exact content: `reports/report.html` (single file, ≤ 16 MB) and its `report_sha256`; undo = delete the artifact.

## Part 2: Test specification

| File | IDs | Key assertions |
|---|---|---|
| `tests/core/pipeline/contextJson.test.ts`, `live.test.ts` | T-CTX-5..6, T-LIV-1..6 | exact JSON round trip; live = batch row at N = 256 (1e-9); bands contain nominal; layers off = C0 |
| `tests/web/figures.test.ts` | T-FIG-1..9 | band per line; error bars = conf; PROXY labels; finite specs; infeasible absent; `uirevision` on every figure; `themeKeys` per chart type |
| `tests/web/linking.test.ts`, `liveState.test.ts`, `fmt.test.ts` | T-LNK-1..6, T-LST-1..4, T-FMT-1..4 | selection = plain filter; `normaliseRanges` accepts undefined/flat/nested; clamps; `Infinity`/NaN text; contrast formula |
| `tests/node/report/html.test.ts` | T-HTM-1..12 | no network tags; deterministic bytes; escaping; size; table = CSV; contrast tokens; refusals |
| `tests/honesty.test.ts` | T-HON-1..4 | intervals everywhere, PROXY words, Limits section + nav link, forbidden phrases |
| `tests/report.browser.test.ts` | T-BRW-1..17, T-A11Y-2..4 | offline; brushing equals filter and survives react/reorder; live = core; latency p95; newest wins with intermediate frames; dark; 390 px; keyboard; print |
| `tests/node/cli.test.ts` (additions) | T-CLI-R1..5 | file written and in manifest; F1 exit 2 without file; F2 exit 5; ≤ 10 s |

Mutation checks (commit first; mutate a copy in the scratchpad; never `git checkout` after a mutation): (M1) drop the `tonexty` band from `figLiveTofT` → T-HON-1/T-FIG band test must fail; (M2) add `new Date()` to the template → T-HTM-3/F6 must fail; (M3) make `selectByRanges` use OR across axes → T-LNK and T-BRW-3 must fail; (M4) set a light-theme text token to `#888888` on white → T-A11Y-1 must fail; (M5) remove `(PROXY)` from `axisLabel` → T-FIG-5/T-HON-2 must fail; (M6) display only the newest id at the end of a burst (the literal "latest wins" rule) → T-BRW-7 must fail; (M7) use a different seed in the worker than in the batch → T-LIV-3 must fail. A surviving mutant means a weak test: strengthen the test.

### Test stubs (helpers and key assertions)

Helpers (`tests/helpers.ts`, extended): `buildTestReport(): Promise<{ path: string; paretoRows: ObjRow[] }>` (real plan-03 outputs into a temp dir), `openPage(path: string, opts?: { offline?: boolean; colorScheme?: "light" | "dark"; viewport?: { width: number; height: number } }): Promise<Page>` (own Chrome, closed in `afterAll`), `dragBrush(page: Page, axisIndex: number, fromFrac: number, toFrac: number): Promise<void>` (locates `.axis-brush rect.background` and uses `page.mouse`), `shownRows(page: Page): Promise<string[]>` (visible table ids).

```ts
// tests/report.browser.test.ts — H3 / G2 (oracle: a plain filter computed in the test)
test("brushTwoAxesMatchesFilter", async () => {
  const { path, paretoRows } = await buildTestReport(); const page = await openPage(path, { offline: true })
  await dragBrush(page, 0, 0.3, 0.8); await dragBrush(page, 2, 0.1, 0.6)
  const ranges = await page.evaluate(() => window.__brushRanges())          // normalised by normaliseRanges
  const expected = paretoRows.filter((r) => inRange(r, ranges)).map((r) => r.candidate_id).sort()
  expect((await shownRows(page)).sort()).toEqual(expected)
})
// H10 — newest wins and the page keeps drawing
test("newestWinsUnderBurst", async () => {
  const page = await openPage(path); const log = await page.evaluate(() => window.__burst(50, 100)) // returns displayed ids in order
  expect(log.shown).toEqual([...log.shown].sort((a, b) => a - b)); expect(log.shown.length).toBeGreaterThanOrEqual(2)
  expect(log.finalDomValue).toBeCloseTo(log.expectedFinalValue, 6)
})
```
