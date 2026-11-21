# Digital Foundation and DoE Implementation Plan (Plan 1 of 6 (0–5), Bun + TypeScript)

Part 1 is the plan; Part 2 is the test specification. Plan 0 (`plans/01-digital/00-tech-stack-and-live-report.md`) records why the stack is Bun + TypeScript and builds the live report; plans 2 (physical models) and 3 (pipeline) build on this one.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** 📋 PLANNED (rewritten 2026-11-21 from the Python version after the live-simulation requirement; the Python version survives only as the test oracle, see Task 5)

**Goal:** Stand up the Bun + TypeScript project in which one pure `core` library runs unchanged in Bun and in the browser, with sourced-constant config, the data contract, a seeded PRNG, the 96-candidate Latin Hypercube design plus 9 weather scenarios, and a Python oracle that independently checks the numbers.

**Architecture:** `src/core/` is pure TypeScript (no Node/Bun/DOM imports) and is the single source of truth for all models and statistics; `src/node/` holds Bun-only I/O (YAML, files, CLI, workers, hashing); `src/web/` holds browser code (plan 0). Every physical constant lives in YAML and is parsed into a `Sourced` value (value + unit + source + status) by a strict zod schema, so no number enters a simulation without provenance. Failures are typed errors that map to one exit code and one named phase. `oracle/` is a small Python (uv) project that is **test-only**: it produces JSON fixtures from scipy/miepython/SALib that the Bun tests compare against.

**Tech Stack** (npm and PyPI checked 2026-11-21): Bun 1.3.14 (installed; latest 1.4.5, no upgrade required) · TypeScript 7.0.2 (`tsc --noEmit`) · zod 4.6.7 · yaml 2.9.1 · fast-check 4.10.3 · @biomejs/biome 2.6.8 · @types/bun 1.3.14. Used by plan 0: plotly.js-dist-min 4.3.0, playwright 1.65.1 (with the installed Google Chrome). Oracle (Python 3.12 via uv, test-only): numpy 2.5.5 · scipy 1.18.1 · miepython 3.3.1 · SALib 1.6.0, plus the system C compiler (`cc`, Apple clang 21 found) that builds the public-domain xoshiro128** reference source from prng.di.unimi.it.

**Spec:** `Blueprint_Riset_Spandek_3_Fungsi.md` §04 (architecture), §05 (input matrix, DoE), §06 (software, data contract, quality gates; config stays YAML as the blueprint says).

## What the operator does

1. `bun install` (≤ 1 min, once).
2. `bun run spandek design --seed 20261121 --out reports/design/` — writes `candidates.csv` (96 rows) and `weather.csv` (9 rows). Target ≤ 2 s.
3. Read the printed summary (feasible count, config hash). Exit 0 = good; any other code → see runbook below.

## Logging and debugging

Local tool, no service. Logs are JSON lines on stderr and appended to `reports/<run_id>/run.jsonl`. Level comes from `SPANDEK_LOG_LEVEL` (default `info`); no code path changes behaviour with level. Info alone must make every failure diagnosable: each failure logs `error.raised` with `code`, `phase`, and the offending config key or column name. Logs never contain file contents or raw error text, only ids, numbers, config key paths and hashes. Size cap: one event ≤ 2 KiB, enforced in the formatter (truncate fields, set `truncated: true`). Numbers in logs are always finite (`safeJson`, Task 2).

| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `run.start` | info | cli | run_id, command, seed, config_sha256 | 1/run |
| `config.loaded` | info | node/config | path, n_constants, sha256 | ≤ 4/run (one per YAML file) |
| `design.generated` | info | core/design | n, seed, feasible, infeasible | 1/run |
| `constraint.violated` | info | core/design | candidate_id, rule | ≤ 96/run |
| `constraint.infeasible_run` | error | core/design | feasible, required | 0–1 |
| `candidate.sampled` | debug | core/design | candidate_id, strata | 96/run |
| `error.raised` | error | cli | code, phase, key | 0–1 |
| `run.complete` | info | cli | run_id, exit_code, elapsed_ms | 1/run |

Runbook (exit code → action): **2** config invalid → fix the YAML key named in `error.raised.key`; **3** too few feasible candidates → loosen a range or the constraint named in `constraint.violated.rule`; **4** a model got an out-of-domain input (plans 2–3); **5** data missing or hash mismatch → plan 2 data task; **6** machine busy or timeout (plan 3). Alerts: none (no service); the exit code is the alert. A test per event is in Part 2.

## Scope

In: project scaffold, errors/logging, config + provenance gate, data contract, PRNG, LHS design (P1–T2), L9 weather design, constraints, CLI `design`, oracle scaffolding with the PRNG fixture. Out: physics (plan 2), simulation/optimization/reports (plan 3), the live simulator (plan 0), lab calibration (BLOCKED-1). Standalone: no network at runtime.

### Stack and versions

Verified 2026-11-21 (npm registry / PyPI JSON). Smoke-tested in the scratchpad: `tsc` 7.0.2 strict passes, `bun test` runs fast-check properties, strict zod rejects YAML `value: no`, Bun `Worker` round-trips, `Bun.build` output is byte-identical across runs, `os.setPriority` works.

| Item | Pinned value |
|---|---|
| Runtime | Bun 1.3.14 (`package.json` `"engines": {"bun": ">=1.3.14"}`) |
| Language | TypeScript 7.0.2, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noEmit`; Bun runs `.ts` directly |
| Validation / config | zod 4.6.7 (`strictObject`), yaml 2.9.1 |
| Tests | `bun:test` run as `bun test --timeout 30000` (measured: the 5 s default applies and `bunfig.toml` timeout keys are ignored in 1.3.14); fast-check 4.10.3 (replaces hypothesis); browser tests set per-test timeouts of 60 s |
| Lint / format | @biomejs/biome 2.6.8 (minimal config verified: `{"formatter":{"indentStyle":"space","indentWidth":2},"javascript":{"formatter":{"semicolons":"asNeeded"}}}`; recommended rules on by default) |
| Browser (plan 0) | plotly.js-dist-min 4.3.0; playwright 1.65.1 driving installed Google Chrome (`channel: "chrome"`, no browser download) |
| Oracle (test-only) | Python 3.12 (uv, `.python-version` in `oracle/`), numpy 2.5.5, scipy 1.18.1, miepython 3.3.1, SALib 1.6.0 |
| Randomness | own xoshiro128** (`core/rng.ts`), state expansion by a stateful splitmix32; the oracle checks it against the **official C reference** compiled with `cc` |
| Output format | CSV + JSON only (Parquet dropped: ≤ 56 k rows, no reader needed) |

**Gaps this plan closes:** blueprint §6.2 folder structure, §6.3 data contract, §5.2 steps 1–3 (LHS, weather scenarios, constraint checks); the live-simulation requirement (core is browser-safe).

## Alternatives considered

| Option | Verdict |
|---|---|
| Python core + TS port for the browser | Rejected: two implementations drift. Python stays as test oracle only. |
| Rust → WASM core | Rejected: TypeScript already runs a full candidate × 9 scenarios in ≈ 5–15 ms (measured, plan 0); WASM adds a toolchain without a gain. |
| 27-run full factorial weather (3×3×3) | Rejected: blueprint §5.2 says nine scenarios; a 3-level L9 orthogonal array covers E1–E3 in 9 runs with pairwise balance. |
| Reject-and-resample infeasible LHS points | Rejected: breaks stratification and reproducibility; infeasible points are kept and flagged. |
| `Math.random`/seedrandom | Rejected: not seedable (`Math.random`) / unmaintained since 2019 (seedrandom 3.0.5); a 15-line xoshiro128** with an independent Python reference is safer. |
| TOML instead of YAML | Rejected: the blueprint names YAML; strict zod removes the YAML implicit-typing trap. |

## Risks (each pinned by a test)

| Risk | Test |
|---|---|
| Unsourced constant slips in | T-CFG-2 |
| YAML implicit typing (`no` → false) | T-CFG-3 |
| PRNG implemented wrongly | T-RNG-1 (bit-exact against the Python reference) |
| Design not reproducible | T-DOE-2 (hash frozen after first run) |
| Design differs between JS engines (`Math.pow` can differ by 1 ulp between JavaScriptCore and V8, so the formulas avoid it) | T-DOE-5 (same bytes under Bun and Node) |
| LHS loses stratification after rescaling | T-DOE-3 |
| Weather design unbalanced | T-WX-1 |
| Constraints silently non-binding | T-CON-3 (fault-injected CPVC) |
| `NaN`/`Infinity` silently becomes `null` in JSON | T-LOG-6 (`safeJson` throws) |
| Locale changes number formatting | T-CLI-9 |

## Requirements

FR-1 The system MUST generate exactly 96 candidates over the seven variables P1, P2, M1, M2, M3, T1, T2 by Latin Hypercube Sampling with a fixed seed. FR-2 Every candidate MUST lie inside the ranges of `configs/material_ranges.yaml`. FR-3 Weather scenarios MUST be 9, built from an L9 array over E1, E2, E3. FR-4 Every numeric constant MUST carry a non-empty `source` and a `status` in `{literature, vendor, scenario}`, including the three level lists of the weather file. FR-5 Infeasible candidates MUST be flagged, not dropped; the run MUST fail (exit 3) if feasible < 77 (0.80 × 96). FR-6 Same seed + same config MUST give byte-identical `candidates.csv`, on Bun and on Node. FR-7 `src/core/**` MUST NOT import `node:*`, `bun*`, or DOM globals. NFR-1 `design` MUST finish in ≤ 2 s. NFR-2 Each expected failure MUST map to exactly one exit code ∈ {2, 3, 4, 5, 6}; an internal bug (any non-`SpandekError`) exits 1 with the message on stderr and is never silent.

## Acceptance: hypotheses and proofs

| ID | Falsifiable hypothesis | Experiment / deciding observable | Falsified if |
|---|---|---|---|
| H1 | Design is reproducible | Run `design` twice, same seed; sha256 of `candidates.csv` | hashes differ, or different seeds give identical hashes |
| H2 | LHS is stratified on all 7 variables | For each column, `floor((x-min)/(max-min)*96)` over 96 rows | any stratum index missing or repeated |
| H3 | Every feasible row respects every constraint | Independent re-check in the test (separate code path) | any row flagged feasible violates a rule |
| H4 | Weather array is pairwise balanced | For each factor pair, each of 9 level pairs appears once | any pair count ≠ 1 |
| H5 | Provenance gate works | YAML with one empty `source`; YAML with `value: no` | loader accepts either |
| H6 | Exit codes are distinct and correct | Fault matrix F1–F7 via subprocess | wrong code, wrong phase, or stack trace on stderr |
| H7 | PRNG equals an independent implementation | first 1 000 `uint32` for seeds 1, 20261121, 4294967295 vs Python reference fixture | any value differs |
| H8 | Design bytes do not depend on the JS engine | `tests/fixtures/engineDesign.ts` (imports `lhsDesign`, `weatherL9`, `toCsv`; uses only `process.argv`, `node:fs` and `node:crypto`; the config directory comes in as `argv[2]` and the YAML is parsed by the same `yaml` package, which bundles for Node) run with `bun run` and, after `bun build --target=node`, with `node`: sha256 of both CSV texts | hashes differ |
| H9 | `core` is environment-free | scan of `src/core/**` imports + build with `Bun.build({target:"browser"})` | a forbidden import, or the browser build fails |

Thresholds: `T_n_candidates = 96`, `T_min_feasible_frac = 0.80`, `T_runtime_ms = 2000`, `T_event_bytes = 2048`, `T_rng_vectors = 1000`.

**Fault-injection matrix** (edit exactly one input of a copy of the config; run `bun run spandek design --config-dir <copy>`):

| ID | Single edit | Expected phase | Exit |
|---|---|---|---|
| F1 | delete `source` of `primer_dft_um` | config | 2 |
| F2 | set `midcoat_pvc.min` > `.max` | config | 2 |
| F3 | unknown key `midcoat_pcv` | config | 2 |
| F4 | `cpvc` = 0.12 (below most PVC samples: about 8 of 96 stay feasible, fewer than the required 77) | design | 3 |
| F5 | `--n 95` flag with config requiring 96 | config | 2 |
| F6 | missing `weather_scenarios.yaml` | data | 5 |
| F7 | `roof.r_total_m2k_w` = 0 in `weather_scenarios.yaml` | config | 2 |

Given/When/Then: G1 *Given* seed S, *When* `design` runs, *Then* `candidates.csv` has 96 rows and ids `SP-001..SP-096` (FR-1, T-DOE-1). G2 *Given* F4, *When* run, *Then* exit 3 and one `constraint.infeasible_run` event (FR-5, T-CLI-3). G3 *Given* the default config, *Then* `weather.csv` has 9 distinct scenarios (FR-3, T-WX-1).

Principle: stratification and balance checks (H2, H4) recompute from raw columns with no import of `core/design`; the PRNG is checked against code in another language; the engine check runs the real artefact under a second engine.

## Execution contract: one shot, nothing left open

**Preflight gate** (print the list and stop if any item is missing): (1) Evint confirms Bun ≥ 1.3.14, Node ≥ 22 (22.21.1 found; used only for the engine check) and that `bun install` may fetch the npm packages above; (2) Evint confirms `uv` may create `oracle/.venv` and that `cc` may compile the xoshiro reference (test-only; skip → H7 cannot be proven, so the run stops); (3) Evint confirms the weather constants in Decisions D3–D5; (4) Evint confirms or overrides the CPVC value 0.45 (D6, status `scenario`); (5) the repo has an initial commit or Evint approves the scaffold being the first commit. Nothing is built on a guess.

No stub, TODO, skip, xfail or "decide later" at the end. Thresholds that need a measurement (`T_hash`) are frozen once from the first real run and never edited. Done means: H1–H9 hold with run ids in `docs/proofs/plan-01.md`, and `bun run check` (biome + `tsc --noEmit` + `bun test`) is green. If a task fails: stop at that task, leave the tree clean, report the failing proof with its log. Out of scope: merge, push (needs Evint's go-ahead), plans 0, 2, 3. By-design limits (in `docs/BLOCKED.md`, Task 1): BLOCKED-1 lab calibration, BLOCKED-2 two-node thermal model, BLOCKED-3 polydisperse PSD, BLOCKED-4 real cost prices.

## Global Constraints

- Bun + TypeScript only in the product; Python only under `oracle/` and only for fixtures.
- `src/core/**` is pure (FR-7): no `node:*`, `Bun`, `process`, `window`, `document`, `fetch`.
- SI-named fields: `_um`, `_c`, `_k`, `_w_m2`, `_m_s`; fractions are 0..1, never percent.
- No mocks; real YAML, real subprocess CLI runs, real oracle fixtures.
- Every constant in YAML has `source` and `status`; `scenario` status means "no measured data" and propagates to outputs as PROXY (plan 3).
- Seeds are explicit arguments; no `Math.random`.
- JSON that leaves the program goes through `safeJson` (throws on `NaN`/`±Infinity`; `JSON.stringify` would silently write `null`).
- Never write outside the repo; `reports/` is git-ignored.

## Review Focus

1. Seed supplied as negative, fractional, or > 2³² − 1 → exit 2, not a silent wrap.
2. `--out` directory already contains a `candidates.csv` → refuse to overwrite without `--force` (exit 2).
3. Config with a range given as `[0.2, 0.8]` instead of `{min,max}` → named-key error, not a zod stack trace.
4. Locale `de_DE` (decimal comma) → CSV still uses `.` (JS `String(number)`, never `toLocaleString`).
5. Two runs in the same millisecond → distinct `run_id` (`crypto.randomUUID` suffix), no log clobbering.

## Decisions (all settled)

- **D1** Bun + TypeScript; package name `spandek`; script `bun run spandek <command>` → `src/node/cli.ts`.
- **D2** Layout: `src/core/` pure, `src/node/` Bun I/O, `src/web/` browser, `oracle/` Python test-only, `tests/fixtures/oracle/*.json` committed fixtures with `SHA256SUMS`.
- **D3** Weather levels: E1 peak irradiance 600/800/1000 W/m² (half-sine 06:00–18:00); E2 air temperature 28/32/36 °C held constant; E3 wind 1/3/6 m/s, `h_conv = 5.7 + 3.8·v` W/m²K (McAdams, status `literature`; cited in YAML). The correlation is usually quoted for v ≲ 5 m/s, so 6 m/s is a slight extrapolation: recorded in the YAML `source` string and in every card's Limit/risk.
- **D4** Sky temperature by Swinbank: `T_sky = 0.0552·T_air^1.5` (K), status `literature`, implemented as `0.0552·T·Math.sqrt(T)` (no `Math.pow`, so every engine gives the same bits).
- **D5** Roof assembly (status `scenario`): substrate heat capacity 1.22 kJ/m²K (0.5 mm aluminium sheet, AA3003-type: ρ 2730 kg/m³ × c_p 893 J/kg·K × 0.0005 m; handbook values, plan 2 Q2 attaches the citation; 0.7 mm gives 1.71 kJ/m²K), coating volumetric ρc = 1.8 MJ/m³K, `R_total = 0.30 m²K/W`, `T_inside = 30 °C`. Used by plan 2. **Substrate scope (user decision 2026-11-21): the experiment uses bare aluminium roofing sheet only; Galvalume/Zincalume, galvanised and prepainted steel are out of scope everywhere in plans 0–4.** The interior film of the roof assembly is 0.162 m²K/W (ASHRAE default 0.92 hr·ft²·°F/Btu, heat flow down, as printed in WAC 51-11C-61013 §A101.3; the exterior film there is 0.17 → 0.030 m²K/W), a component of `R_total`.
- **D6** Midcoat `cpvc` = 0.45 in `material_ranges.yaml`, status `scenario` (design assumption for TiO2/BaSO4 in an acrylic binder, not measured; Evint may override with a vendor value at preflight). The whole PVC range (0.10–0.35) lies below 0.45, so the constraint is non-binding by default and is exercised by F4. Constraint: `pvc ≤ cpvc`.
- **D7** Sol-gel conditions are not in the LHS; main runs use the midpoints of `sol_gel_ph` (3.5–5.0 → 4.25) and `sol_gel_water_ratio` (1–5 → 3.0); plan 3 sensitivity sweeps pH only (the model gives the water ratio zero effect in 1–5, plan 2 D4), and the live view has a pH slider only.
- **D8** Constraints: C-1 `pvc ≤ cpvc`; C-2 `topcoat_dft_um ≤ midcoat_dft_um`; C-3 total DFT ≤ `max_total_dft_um` (default 332 = the sum of the range maxima 12+300+20 so the all-maximum corner stays feasible, status `scenario`).
- **D9** L9 array rows over columns 1–3 (levels 0..2): `000 011 022 101 112 120 202 210 221`.
- **D10** PRNG: xoshiro128** exactly as the reference C source `xoshiro128starstar.c` (`result = rotl(s[1]·5, 7)·9; t = s[1] << 9; s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11)`, with `Math.imul` for the multiplies). Seed expansion by a **stateful** splitmix32: `state = seed; repeat 4×: state = (state + 0x9E3779B9) >>> 0; z = state; z = imul(z ^ (z >>> 16), 0x85EBCA6B); z = imul(z ^ (z >>> 13), 0xC2B2AE35); word = (z ^ (z >>> 16)) >>> 0` (murmur3 fmix32 finaliser). The additive Weyl constant makes the four inputs distinct and the finaliser is a bijection that maps 0 to 0, so at most one word can be 0: an all-zero state is impossible for every seed in [0, 2³²−1], including 0. `next()` = `u32 / 2³²` in [0, 1). Per-stream seeds `deriveSeed(seed, j) = fmix32((seed + Math.imul(j + 1, 0x9E3779B9)) >>> 0)`; any `uint32` is a valid seed for `Xoshiro128`.
- **D11** LHS: for dimension j, a Fisher–Yates permutation of `0..n−1` from stream j; sample i takes stratum `perm[i]` and a jitter in the central 99.8 % of the stratum: `u = (perm[i] + 0.001 + 0.998·r)/n`, `x = min + u·(max − min)`. Only `+ − × ÷` and `Math.floor` are used, so results are bit-identical on every IEEE-754 engine.
- **D12** Candidate ids `SP-001…` are row order.
- **D13** Stream roles (so no two consumers share a stream): design dimensions use `deriveSeed(seed, 0..6)`; plan 3 uses `deriveSeed(seed, 100)` for uncertainty draws, `200`/`201` for the Saltelli matrices A/B, plan 4 uses `400` (aged-row draws), plan 5 uses `300` (Sobol starts), `301` (robust draws), `302` (fresh evaluation draws) and `303` (budget-table draws); `202` for Morris, `203` for the bootstrap; plan 0's live view calls `liveSimulate(inp, ctx, nDraws, 20261121)`, which derives the draw stream as `deriveSeed(seed, 100)` exactly like the batch, so the live and batch draws coincide when `nDraws` and the seed match.
- **D14** Rollout and rollback: this is a local research tool; there is no flag and no deployment. Rollback = `git revert` of the commit range; the only hand-off outside the repo is the optional Artifact publish in plan 0 (owner Evint, exact content: `reports/report.html` and its manifest hash).

## File Structure

| Source | Test |
|---|---|
| `src/core/errors.ts` | `tests/core/errors.test.ts` |
| `src/core/json.ts` (`safeJson`) | `tests/core/json.test.ts` |
| `src/core/events.ts` (pure event sink) | `tests/core/events.test.ts` |
| `src/core/rng.ts` | `tests/core/rng.test.ts` |
| `src/core/config.ts` (zod schemas, pure) | `tests/core/config.test.ts` |
| `src/core/csv.ts` | `tests/core/csv.test.ts` |
| `src/core/schema.ts` | `tests/core/schema.test.ts` |
| `src/core/design.ts` (LHS, L9, `scenarioFrom`, constraints) | `tests/core/design.test.ts` |
| `src/node/logging.ts` | `tests/node/logging.test.ts` |
| `src/node/config.ts` (YAML loaders) | `tests/node/config.test.ts` |
| `src/node/cli.ts` | `tests/node/cli.test.ts` |
| `configs/material_ranges.yaml`, `configs/weather_scenarios.yaml` | covered by `tests/node/config.test.ts` |
| `oracle/generate.py` | fixture check in `tests/oracle.fixtures.test.ts` |
| `tests/fixtures/engineDesign.ts` (helper script, not a test) | used by `tests/determinism.test.ts` |
| (guard) | `tests/layout.guard.test.ts` — scans only `tests/**/*.test.ts` (so `tests/helpers.ts` and `tests/fixtures/*` are not tests); path mirror: every `src/<dir>/<name>.ts` has exactly one `tests/<dir>/<name>.test.ts` (so `src/core/config.ts` ↔ `tests/core/config.test.ts` and `src/node/config.ts` ↔ `tests/node/config.test.ts` are distinct), except `src/web/main.ts`, `src/web/worker.ts` (DOM glue, proven by browser tests) and `src/node/simWorker.ts` (worker entry, proven by `simulate.test.ts`); every test file maps to a source file except the cross-cutting whitelist `{layout.guard, library.smoke, oracle.fixtures, crossModel, determinism, pipeline.e2e, report.browser, honesty}.test.ts` (later ones arrive in plans 0, 2, 3, 4, 5: `indonesia.e2e`, `indonesia.crosscheck`, `refine.e2e`, `refine.baseline`, `budget.baseline`); the exclusion list also gains `src/web/budget.ts` (plan 5, DOM glue proven by browser tests) |

## Tasks

### Task 1: Scaffold, guard test, BLOCKED register

**Tests:** `tests/layout.guard.test.ts`, `tests/library.smoke.test.ts`. **Creates:** `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`, `tests/helpers.ts` (grown by later tasks), `.gitignore`, `docs/BLOCKED.md`, `docs/proofs/.gitkeep`.
**Interfaces:** `package.json` scripts: `spandek` (`bun run src/node/cli.ts`), `check` (`biome check . && tsc --noEmit && bun test --timeout 30000`), `test` (`bun test --timeout 30000`); dependencies installed by `bun add zod@4.6.7 yaml@2.9.1` and `bun add -d typescript@7.0.2 fast-check@4.10.3 @biomejs/biome@2.6.8 @types/bun@1.3.14 playwright@1.65.1 plotly.js-dist-min@4.3.0` (the last two are used by plan 0; `plotly.js-dist-min` is a dev dependency because the build inlines it).

- [ ] Write `layout.guard.test.ts::everySourceFileHasOneMirror` and `::noOrphanTests`, and `library.smoke.test.ts::apiSurfaces` (imports and calls: strict zod object parse of `value: no` rejected; `yaml.parse`; fast-check `fc.assert`; `new Worker(new URL(..., import.meta.url))` round-trip; `Bun.build({target:"browser"})` of a 1-line module twice, byte-identical; `os.setPriority(process.pid, 10)`; `Bun.CryptoHasher("sha256")` of `"abc"` = `ba7816bf…`; `Bun.version` ≥ `1.3.14`, since `engines` in `package.json` is documentation only and Bun does not enforce it). Run `bun test` → FAIL (no project).
- [ ] Create the files: `tsconfig.json` with the strict flags above, `"types": ["bun"]`, `"lib": ["ES2023","DOM"]`; `.gitignore` (`reports/`, `node_modules/`, `oracle/.venv/`); `docs/BLOCKED.md` with eight entries (BLOCKED-1..8; plan 4 Task 2 appends 9–10 and plan 5 Task 6 appends 11, so the register totals 11), each with reason, owner (Evint) and unblock condition: **BLOCKED-1** lab calibration (needs coupon measurements, blueprint §7; unblocks when `validation/coupon_results.csv` exists); **BLOCKED-2** two-node thermal model (no layer conductivities or film thermal data); **BLOCKED-3** polydisperse particle-size distribution (no measured PSD); **BLOCKED-4** real cost prices (cost stays a relative scenario index until vendor prices go into `materials.yaml`); **BLOCKED-5** blueprint §3.4 failure mechanisms not modelled (soiling, abrasion/UV loss of hydrophobicity, edge and scratch corrosion) and §5.2 step 4 abrasion limit — no data; **BLOCKED-6** §5.2 step 3 constraints on substrate compatibility and viscosity/pot life — need vendor data; **BLOCKED-7** blueprint WP-B route B2 (TiO2@SiO2) and the WP-C flexibiliser level — advanced routes, lab-gated; **BLOCKED-8** optical and thermal constants of bare mill-finish aluminium sheet (solar reflectance, emittance): no citable value found, so a blank-coupon measurement is needed; plan 4 adds **BLOCKED-9** (field soiling/biological-growth loss measured in Indonesia, replaced by a labelled scenario range) and **BLOCKED-10** (site-specific wind-driven rain and chloride deposition). Blueprint §8.1 (contact angle > 110°, adhesion ≥ 4B), §7.4 (n ≥ 3 coupons per condition) and roadmap phases 3–5 (§8.3) are lab-side; these plans cover phases 0–2 and the digital part of 1–2.
- [ ] Run `bun install`, then `bun test` → PASS. If a library API differs from the pin, fix the test to the real API and record it in `docs/proofs/plan-01.md`.
- [ ] Commit: `chore: scaffold Bun TypeScript project with layout guard and API smoke test`

**Acceptance:** supports H1–H9 by providing the harness; proves the layout guard.

### Task 2: Errors, `safeJson`, logging

**Tests:** `tests/core/errors.test.ts`, `tests/core/json.test.ts`, `tests/core/events.test.ts`, `tests/node/logging.test.ts`. **Creates:** `src/core/errors.ts`, `src/core/json.ts`, `src/core/events.ts`, `src/node/logging.ts`.
**Interfaces:**
```ts
export type ExitCode = 2 | 3 | 4 | 5 | 6
export class SpandekError extends Error { constructor(readonly code: ExitCode, readonly phase: string, readonly key: string | undefined, message: string) }
export class ConfigError extends SpandekError { constructor(key: string, message: string) }       // 2, "config"
export class InfeasibleError extends SpandekError { constructor(message: string) }                // 3, "design"
export class PhysicsRangeError extends SpandekError { constructor(key: string, message: string) } // 4, "model"
export class DataError extends SpandekError { constructor(key: string, message: string) }         // 5, "data"
export class ResourceError extends SpandekError { constructor(message: string) }                  // 6, "resource"
export function safeJson(value: unknown, space?: number): string   // throws DataError(key="json") on NaN/±Infinity anywhere in the value
// src/core/events.ts (pure; core code emits through this, hosts install a sink)
export type Level = "debug" | "info" | "warn" | "error"
export type EventSink = (event: string, level: Level, fields: Record<string, string | number | boolean>) => void
export function setEventSink(sink: EventSink | null): void
export function emitEvent(event: string, level: Level, fields: Record<string, string | number | boolean>): void   // no-op when no sink; the browser installs a ring buffer
// src/node/logging.ts   (log fields that are non-finite numbers are written as the strings "NaN"/"Infinity"/"-Infinity"; `safeJson` is for data files, not logs)
export function newRunId(): string                                  // "YYYYMMDDTHHMMSSmmm-<8 hex from crypto.randomUUID>"
export function configureLogging(opts: { runId: string; level: Level; runDir?: string }): void   // installs the node sink
export function emit(event: string, level: Level, fields: Record<string, string | number | boolean>): void  // one JSON line; ≤ 2048 bytes
```
- [ ] Tests: `codesAndPhasesAreDistinct`, `safeJsonThrowsOnNaNAndInfinityNested` (T-LOG-6), `runIdsUniqueWithinOneMillisecond` (1000 ids), `emitIsSingleJsonLine`, `emitTruncatesOver2048BytesAndSetsTruncated`, `errorRaisedAcceptsOnlyCodePhaseKey` (no free-text field can be emitted for `error.raised`), `emitStringifiesNonFiniteNumbersAndNeverThrows` (W5: `emit("model.out_of_range", …, {value: NaN})` writes `"NaN"`, so a `PhysicsRangeError` is never masked by a logging error), `levelFilterDropsDebugAtInfo`, `emitEventIsNoopWithoutSink`, `emitEventReachesInstalledSink` (core/events). Run → FAIL.
- [ ] Implement. Run → PASS.
- [ ] Commit: `feat: typed errors, safeJson and structured logging`

**Acceptance:** H6 (distinct codes); T-LOG-1..7.

### Task 3: Sourced config schemas, YAML loaders and the YAML files

**Tests:** `tests/core/config.test.ts`, `tests/node/config.test.ts`. **Creates:** `src/core/config.ts`, `src/node/config.ts`, `configs/material_ranges.yaml`, `configs/weather_scenarios.yaml`.
**Interfaces:**
```ts
export const Sourced: z.ZodObject   // strictObject: value:number (finite), unit:string, source:string.min(1), status: "literature"|"vendor"|"scenario"
export const RangeSchema: z.ZodObject   // strictObject: min, max (min < max by refine), unit, source (min 1), status
export const MaterialRangesSchema       // keys: primer_gptes_molfrac, primer_dft_um, midcoat_pvc, midcoat_tio2_fraction, midcoat_dft_um,
                                        //       topcoat_mtes_molfrac, topcoat_dft_um, sol_gel_ph, sol_gel_water_ratio (Range), cpvc, max_total_dft_um (Sourced)
export const LevelsSchema               // strictObject: values: number[3] (finite, ascending), unit, source (min 1), status
export const WeatherSchema              // irradiance_w_m2, t_air_c, wind_m_s: LevelsSchema, h_conv_a, h_conv_b: Sourced, roof: {c_substrate_j_m2k, rho_c_coating_j_m3k, r_total_m2k_w, t_inside_c: Sourced} (every roof value > 0)
export type MaterialRanges = z.infer<typeof MaterialRangesSchema>; export type WeatherConfig = z.infer<typeof WeatherSchema>
export function parseMaterialRanges(raw: unknown): MaterialRanges   // ConfigError(key = dotted path of the first issue)
export function parseWeather(raw: unknown): WeatherConfig
// node:
export function loadMaterialRanges(path: string): Promise<MaterialRanges>; export function loadWeather(path: string): Promise<WeatherConfig>
    // missing file → DataError; yaml syntax error → ConfigError; emits config.loaded
export function configSha256(paths: readonly string[]): Promise<string>
```
- [ ] Tests: `defaultFilesLoad` (T-CFG-1), `emptySourceRejected` (T-CFG-2, H5), `yamlNoIsRejectedNotFalse` (T-CFG-3), `minGeMaxRejected` (F2), `unknownKeyRejected` (F3), `missingFileIsDataError` (F6), `flatListRangeGivesNamedKeyError` (Review Focus 3), `nonPositiveRoofConstantRejected` (F7), `blueprintValuesExact`: the 7 ranges equal blueprint §5.1 (`0.20–0.80`, `2–12`, `0.10–0.35`, `0.20–0.80`, `100–300`, `0.20–0.80`, `3–20`) and the 2 sol-gel ranges equal blueprint WP-A (`3.5–5.0`, `1–5`), `noNodeImportsInCore` (H9 part: scan only the `import … from "…"` and `import("…")` lines of `src/core/**` for `node:` and `bun` specifiers, and the code (comments stripped) for `process.`, `Bun.`, `window`, `document`, `fetch(`), `unknownKeyErrorNamesTheKey` (F3: the translated `ConfigError.key` is `midcoat_pcv`; zod reports unrecognised keys with the parent path and puts the name in `issue.keys`, so the translator appends `issue.keys[0]`), `rootLevelErrorUsesRootKey` (a scalar or array document gives key `(root)`). Run → FAIL.
- [ ] Implement with zod 4 (`z.strictObject`, `.refine`, `.superRefine` for finite numbers); translate `ZodError` issues into `ConfigError` with the dotted path (`issue.path.join(".")`, plus `issue.keys[0]` for `unrecognized_keys`, `(root)` when empty). zod 4 `z.number()` already rejects `NaN`/`Infinity`. Write both YAML files with D3–D8 values and a literature citation string in each `source`. Run → PASS.
- [ ] Commit: `feat: sourced-constant config schemas with provenance gate`

**Acceptance:** H5, H9 (part); F1, F2, F3, F6, F7 at unit level.

### Task 4: CSV and data contract

**Tests:** `tests/core/csv.test.ts`, `tests/core/schema.test.ts`. **Creates:** `src/core/csv.ts`, `src/core/schema.ts`.
**Interfaces:**
```ts
export type CsvOpts = { nanColumns?: ReadonlySet<string>; infColumns?: ReadonlySet<string> }   // defaults: nanColumns = RESULT_NAN_COLUMNS, infColumns = {"gel_time_rel"}
export const RESULT_NAN_COLUMNS: ReadonlySet<string>   // every non-design column of RESULT_COLUMNS except "scenario_id" and "feasible"
export function toCsv(columns: readonly string[], rows: readonly Record<string, string|number|boolean>[], opts?: CsvOpts): string   // "\n" line ends; numbers via String(x) (shortest round-trip); NaN → empty cell (only in opts.nanColumns), +Infinity → "inf" (only in opts.infColumns); any other non-finite throws DataError. Plan 3 passes its own sets for controls.csv; pareto.csv and draws.csv contain only feasible candidates and need none
export function parseCsv(text: string): Record<string, string>[]                                                  // RFC-4180 subset: no quotes needed for our columns; throws DataError on ragged rows
export function coerceCell(column: string, text: string, opts?: CsvOpts): number    // "" → NaN (opts.nanColumns only), "inf" → +Infinity (opts.infColumns only), else Number(text) which must be finite; DataError(key = column) otherwise
export const DESIGN_COLUMNS: readonly ["candidate_id","primer_gptes_molfrac","primer_dft_um","midcoat_pvc","midcoat_tio2_fraction","midcoat_dft_um","topcoat_mtes_molfrac","topcoat_dft_um"]
export const DESIGN_FLAG_COLUMNS: readonly ["feasible","violations"]
export const RESULT_COLUMNS: readonly [...DESIGN_COLUMNS, "scenario_id","r_solar_pred","r_solar_lo","r_solar_hi","t_max_pred","t_max_lo","t_max_hi",
    "corrosion_proxy","corrosion_proxy_lo","corrosion_proxy_hi","wetting_proxy","wetting_proxy_lo","wetting_proxy_hi",
    "wetting_theta_pred","wetting_theta_lo","wetting_theta_hi","q_in_mean_w_m2","q_in_mean_w_m2_lo","q_in_mean_w_m2_hi","delam_proxy","delam_proxy_lo","delam_proxy_hi","cost_proxy","gel_time_rel","feasible"]
export type DesignRow = { candidate_id: string; primer_gptes_molfrac: number; /* … one number per DESIGN_COLUMNS entry */ }
export type FlaggedDesignRow = DesignRow & { feasible: boolean; violations: string }
export type ResultRow = /* one field per RESULT_COLUMNS entry */
export function validateDesign(rows: readonly Record<string, unknown>[], withFlags = false): DesignRow[] | FlaggedDesignRow[]   // ConfigError(key=<column>) on missing/extra/type/ID pattern ^SP-\d{3}$/duplicate id
export function parseResultsCsv(text: string): ResultRow[]    // parseCsv + coerceCell + validateResults
export function validateResults(rows: readonly Record<string, unknown>[]): ResultRow[]
    // Throws ConfigError(key = column) (exit 2). Triples checked lo <= pred <= hi: r_solar, t_max, corrosion_proxy, wetting_proxy, wetting_theta, q_in_mean_w_m2, delam_proxy. Bounds: corrosion_proxy, wetting_proxy, delam_proxy, cost_proxy in [0,1] (named explicitly); wetting_theta_* in [0,180] degrees; r_solar_* in [0,1]. NaN outcomes allowed only where feasible is false; gel_time_rel may be +Infinity (never gels) but never NaN on feasible rows
// Direction: corrosion_proxy, delam_proxy, cost_proxy are risks/costs (lower is better); wetting_proxy is a hydrophobicity score (higher is better)
```
- [ ] Tests: `designOk`, `missingColumnNamesColumn`, `duplicateIdRejected`, `badIdPatternRejected`, `withFlagsRequiresFlagColumns`, `thetaBoundedInDegreesNotUnitInterval`, `validateResultsThrowsConfigErrorWithColumnKey` (F3 of plan 3), `resultsIntervalOrderEnforced`, `proxyOutsideUnitIntervalRejected`, `nanAllowedOnlyWhenInfeasible`, `infGelTimeAllowedOnFeasible`, `emptyCellRoundTripsToNaNOnlyInAllowedColumns`, `infCellRoundTripsOnlyForGelTime`, `csvUsesDotDecimalRegardlessOfLocale` (T-CLI-9 unit part), `csvRoundTripExact` (fast-check: random finite doubles survive `toCsv`→`parseCsv`→`Number`). Run → FAIL.
- [ ] Implement. Run → PASS.
- [ ] Commit: `feat: CSV I/O and candidate/result data contract`

**Acceptance:** supports H3, FR-1; plan 3 consumes `RESULT_COLUMNS`.

### Task 5: Seeded PRNG and the Python oracle scaffold

**Tests:** `tests/core/rng.test.ts`, `tests/oracle.fixtures.test.ts`. **Creates:** `src/core/rng.ts`, `oracle/pyproject.toml`, `oracle/.python-version`, `oracle/generate.py`, `oracle/xoshiro128starstar.c` (verbatim public-domain reference from prng.di.unimi.it, with its header comment), `oracle/README.md`, `tests/fixtures/oracle/xoshiro.json`, `tests/fixtures/oracle/SHA256SUMS`.
**Interfaces:**
```ts
export class Xoshiro128 { constructor(seed: number); nextU32(): number; next(): number }   // seed: integer in [0, 2**32-1] else ConfigError("seed"); expansion per D10
export function fmix32(x: number): number                                                  // murmur3 finaliser
export function deriveSeed(seed: number, stream: number): number                           // D10
export function shuffleInPlace<T>(rng: Xoshiro128, a: T[]): void                           // Fisher-Yates, j = floor(next()*(i+1))
```
`oracle/generate.py` (Python, test-only, `uv run`): expands each seed to four state words with a pure-Python stateful splitmix32 (explicit 32-bit masks), then **compiles `oracle/xoshiro128starstar.c` with `cc` and runs it** on those words (the reference code shares nothing with the TS but the specification); writes `xoshiro.json` = `{seed, first1000: uint32[]}` for seeds 1, 20261121, 4294967295; later plans append more fixtures (mie, thermal, solgel, sobol) to the same script and `SHA256SUMS`.
- [ ] Write the tests: `matchesCReferenceBitExact` (T-RNG-1, H7: 3 seeds × 1000 values), `sameSeedSameSequence`, `differentSeedsDiffer`, `next01IsInHalfOpenUnitInterval` (fast-check), `invalidSeedsRejected` (−1, 1.5, 2³²; Review Focus 1), `shuffleIsPermutation` (fast-check), `oracleFixtureHashesMatchSums` (T-ORA-1: recompute sha256 of every fixture, compare to `SHA256SUMS`), `oracleFixturesAreFresh` (T-ORA-2: if `uv` is on PATH run `uv run --project oracle generate.py --check` which regenerates in memory and compares; else the test fails with the message "uv missing: oracle freshness unproven"). Run → FAIL.
- [ ] Write `oracle/generate.py` and run `uv run --project oracle oracle/generate.py` to create the fixture; commit it (frozen once). Implement `rng.ts` (use `Math.imul` and `>>> 0`). Run → PASS.
- [ ] Commit: `feat: xoshiro128** PRNG verified against an independent Python reference`

**Acceptance:** H7; FR-6 (basis).

### Task 6: LHS design, L9 weather, `scenarioFrom`

**Tests:** `tests/core/design.test.ts`. **Creates:** `src/core/design.ts`.
**Interfaces:**
```ts
export function lhsUnit(n: number, d: number, seed: number): number[][]                            // D10–D11: n rows × d columns in (0,1), stratified per column; also used by plan 3 for uncertainty draws
export function lhsDesign(n: number, ranges: MaterialRanges, seed: number): DesignRow[]            // scales lhsUnit over the 7 design ranges
export const L9: readonly (readonly [0|1|2, 0|1|2, 0|1|2])[]                                        // D9
export type Scenario = { scenario_id: string; irradiance_w_m2: number; t_air_c: number; wind_m_s: number; h_conv_w_m2k: number; t_sky_k: number }
export function scenarioFrom(irradiance_w_m2: number, t_air_c: number, wind_m_s: number, w: WeatherConfig): Omit<Scenario, "scenario_id">
    // the single source of the McAdams h = a + b·v and Swinbank T_sky = 0.0552·(T_air + 273.15)^1.5 formulas
export function weatherL9(w: WeatherConfig): Scenario[]                                             // ids W1..W9
```
- [ ] Tests: `shapeAndIds` (96 rows, `SP-001..SP-096`; T-DOE-1), `sameSeedIdentical` and `differentSeedDiffers` (T-DOE-2, H1), `stratifiedOnEveryColumn` (T-DOE-3, H2: recomputes strata from raw values), `allInsideRanges`, `jitterStaysInsideStratum` (fast-check: stratum index equals `perm`), `nineDistinctScenarios` (G3), `pairwiseBalance` (T-WX-1, H4: recomputed from raw columns), `hConvMatchesMcAdams` (`5.7 + 3.8·v` hand values), `skyTemperatureMatchesSwinbank` (hand value for W1 = 28 °C: `0.0552·301.15·√301.15`, within 1e-12 relative of `0.0552·301.15^1.5`).
- [ ] Run → FAIL. Implement. Run → PASS.
- [ ] Freeze `T_hash`: run once with seed 20261121, write the sha256 of the generated CSV into `tests/fixtures/expected_design_hash.txt`, commit, never edit afterwards.
- [ ] Commit: `feat: Latin Hypercube design and nine-scenario L9 weather`

**Acceptance:** H1, H2, H4; FR-1, FR-2, FR-3.

### Task 7: Constraint check

**Tests:** `tests/core/design.test.ts` (constraints section). **Modifies:** `src/core/design.ts`.
**Interfaces:**
```ts
export function checkConstraints(rows: readonly DesignRow[], ranges: MaterialRanges): FlaggedDesignRow[]   // feasible + violations ("" or ";"-joined C-1..C-3); emits constraint.violated
export function requireMinFeasible(rows: readonly FlaggedDesignRow[], frac = 0.80): void                   // InfeasibleError (code 3) + constraint.infeasible_run
```
- [ ] Tests: `defaultDesignHasAtLeast77Feasible` (records the exact count in `docs/proofs/plan-01.md`), `cpvcBinding` (T-CON-3: `cpvc` below sample values → rows flagged `C-1`), `topcoatThickerThanMidcoatFlaggedC2`, `totalDftFlaggedC3`, `independentRecheck` (H3: the test re-derives all three rules from raw columns), `requireMinFeasibleThrowsCode3`, `infeasibleRowsKept`. Run → FAIL. Implement. Run → PASS.
- [ ] Commit: `feat: design constraint checks (PVC/CPVC, topcoat vs midcoat, total DFT)`

**Acceptance:** H3; FR-5; F4 at unit level.

### Task 8: CLI `design`, engine check and fault matrix

**Tests:** `tests/node/cli.test.ts`, `tests/determinism.test.ts`. **Creates:** `src/node/cli.ts`.
**Interfaces:** `export async function main(argv: readonly string[]): Promise<number>`; every subcommand accepts the global flags `--config-dir DIR` (default `configs`), `--data-dir DIR` (default `data/literature`), `--max-load FLOAT` (plan 3); subcommand `design --seed INT --out DIR [--n INT] [--force]`; plans 3–5 register further subcommands in the same `main` (plan 3: `simulate`, `optimize` (a Pareto screen of the existing candidates, not a search), `sensitivity`, `report`, `run`; plan 4: `fetch-data --indonesia`, `indonesia --in --out [--site]`; plan 5: `refine --in --out [--scenarios] [--starts] [--time-limit-s]`, `budget-table --in --out [--time-limit-s]`, `budget --table --amount --profile [--polish]`); `--time-limit-s` is a per-command flag, and `budget` is a pure lookup that accepts neither `--config-dir` nor `--max-load`; writes `candidates.csv` (all rows plus `feasible`, `violations`; validated with `validateDesign(rows, true)`) and `weather.csv`. `if (import.meta.main) process.exit(await main(Bun.argv.slice(2)))`.
- [ ] Tests (all via `Bun.spawn(["bun","run","src/node/cli.ts", …])` with real files in a temp dir): `happyPathExit0AndTwoFiles` (G1), `runtimeUnder2s` (NFR-1), `faultF1` … `faultF7` (assert exit code, the `error.raised` line's `phase`, and no "at " stack-trace lines on stderr), `refusesOverwriteWithoutForce` (Review Focus 2), `csvUsesDotDecimalUnderCommaLocale` (`LC_ALL=de_DE.UTF-8`; T-CLI-9), `eventsEmitted` (every event of this plan appears in `run.jsonl`: `run.start`, `config.loaded`, `design.generated`, `constraint.violated` via a near-miss config, `constraint.infeasible_run` via F4, `error.raised`, `run.complete`), `designBytesIdenticalUnderBunAndNode` (T-DOE-5, H8: run `tests/fixtures/engineDesign.ts` with `bun run`, then `bun build tests/fixtures/engineDesign.ts --target=node --outfile <tmp>/e.mjs` and run it with `node`; compare the printed sha256 of the `candidates.csv` text and the `weather.csv` text; the CLI itself is Bun-only), `coreBuildsForBrowser` (H9: `Bun.build({entrypoints:["src/core/design.ts"], target:"browser"})` succeeds), `candidatesCsvMatchesFrozenHash` (T-DOE-2).
- [ ] Run → FAIL. Implement `main` (hand-rolled flag parser; catch `SpandekError` → emit `error.raised`, return `code`; catch nothing else; any other error exits 1 with the message on stderr, never silently). Run → PASS.
- [ ] Run the full gate: `bun run check`; write run ids and observables for H1–H9 into `docs/proofs/plan-01.md`.
- [ ] Commit: `feat: spandek design command with fault-injection and engine checks`

**Acceptance:** H1, H6, H8, H9; F1–F7; G1, G2.

## Part 2: Test specification

| File | IDs | Key assertions |
|---|---|---|
| `tests/layout.guard.test.ts` | T-GUARD-1..2 | `src` ↔ `tests` 1:1 (web DOM glue excluded); no orphan tests beyond the whitelist |
| `tests/library.smoke.test.ts` | T-LIB-1 | zod strict, yaml, fast-check, Worker, `Bun.build`, `os.setPriority`, `CryptoHasher` all work |
| `tests/core/errors.test.ts`, `json.test.ts` | T-ERR-1..2, T-LOG-6 | `{2,3,4,5,6}` distinct with phases; `safeJson` throws on non-finite |
| `tests/node/logging.test.ts` | T-LOG-1..5, 7 | one JSON object per line; ≤ 2048 B; `truncated`; level filter; no free-text errors |
| `tests/core/config.test.ts`, `tests/node/config.test.ts` | T-CFG-1..8 | provenance gate, YAML `no` trap, range order, strict keys, blueprint values exact, core has no Node imports |
| `tests/core/csv.test.ts`, `schema.test.ts` | T-CSV-1..3, T-SCH-1..8 | locale-free numbers, round trip, column set, id pattern, interval order, proxy bounds |
| `tests/core/rng.test.ts`, `tests/oracle.fixtures.test.ts` | T-RNG-1..6, T-ORA-1..2 | bit-exact vs Python; seed validation; fixture hashes and freshness |
| `tests/core/design.test.ts` | T-DOE-1..4, T-WX-1..3, T-CON-1..7 | 96 rows, strata exactly once, pairwise balance, McAdams/Swinbank values, independent constraint recheck |
| `tests/node/cli.test.ts`, `tests/determinism.test.ts` | T-CLI-1..11, T-DOE-5 | F1–F7, overwrite refusal, locale, event catalogue, runtime, Bun = Node bytes, core builds for browser |

Mutation checks (after Task 8, commit first, copy the repo to the scratchpad, never `git checkout` after a mutation): (M1) change the LHS jitter to `u = (perm + r)/n·1.001` → H2/FR-2 tests must fail; (M2) drop the `source` `.min(1)` → T-CFG-2 must fail; (M3) change L9 row 5 → T-WX-1 must fail; (M4) replace `Math.imul` by `*` in xoshiro → T-RNG-1 must fail; (M5) make `safeJson` call `JSON.stringify` directly → T-LOG-6 must fail. A mutant that survives means a weak test: strengthen the test, not the code.

### Test stubs (helpers and key assertions)

Helpers (`tests/helpers.ts`, created in Task 1): `RANGE_COLUMNS: [string, {min: number; max: number}][]` (read from the real YAML), `copyConfigWith(dotKey: string, value: unknown): Promise<string>` (copies `configs/` to a temp dir and edits exactly one key), `run(args: string[], env?: Record<string, string>): Promise<{exitCode: number; stdout: string; stderr: string}>` (`Bun.spawn`), `lastEvent(r, name): Record<string, unknown>` (parses `run.jsonl`).

```ts
// tests/core/design.test.ts — H2, written without importing anything from core/design's internals
test("stratifiedOnEveryColumn", () => {
  const rows = lhsDesign(96, ranges, 20261121)
  for (const [col, { min, max }] of RANGE_COLUMNS) {
    const strata = rows.map((r) => Math.floor(((r[col] - min) / (max - min)) * 96))
    expect(new Set(strata).size).toBe(96)           // every stratum exactly once
    expect(Math.min(...strata)).toBe(0); expect(Math.max(...strata)).toBe(95)
  }
})
// tests/oracle.fixtures.test.ts — H7 (fixture produced by the compiled official C reference)
test("matchesCReferenceBitExact", () => {
  for (const { seed, first1000 } of xoshiroFixture) {
    const g = new Xoshiro128(seed)
    for (const v of first1000) expect(g.nextU32()).toBe(v)
  }
})
// tests/node/cli.test.ts — F4
test("faultF4", async () => {
  const dir = await copyConfigWith("cpvc.value", 0.12)
  const r = await run(["design", "--seed", "1", "--out", tmp, "--config-dir", dir, "--max-load", "1000"])
  expect(r.exitCode).toBe(3)
  expect(await lastEvent(r, "error.raised")).toMatchObject({ code: 3, phase: "design" })
  expect(r.stderr).not.toMatch(/\n\s+at /)        // no stack trace
})
```
