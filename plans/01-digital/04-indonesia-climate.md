# Indonesian Climate Simulation Implementation Plan (Plan 4 of 6 (0–5), Bun + TypeScript)

Part 1 is the plan; Part 2 is the test specification. Depends on plans 1, 2 and 3 being done and green. It replaces the generic 9-scenario weather (E1–E3 of the blueprint) with satellite/reanalysis-derived Indonesian weather (modelled, not station measurements) for aluminium spandek, and adds aged-reflectance scenarios for a humid tropical site.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** 📋 PLANNED (written 2026-11-21 after the user asked for an Indonesia-specific simulation and fixed the substrate to aluminium)

**Goal:** For five Indonesian sites, simulate the shortlisted coating systems and controls on a bare-aluminium spandek under real hourly weather (representative wet-season and dry-season days), initial and aged, and report surface temperature and heat flux benefit with intervals.

**Architecture:** A new pure model `core/models/thermalSeries.ts` integrates the plan-2 heat balance (same RK4, dt = 60 s) driven by hourly arrays (irradiance, air temperature, wind, sky temperature from modelled downward longwave). `core/indonesia/days.ts` selects representative days from ten years of hourly data. `node/power.ts` fetches and caches NASA POWER data; `node/epw.ts` reads IWEC2 files as an independent cross-check. The batch reuses plan-3 `stackProps`, so no optics, wetting or barrier code changes. Nominal runs cover all 96 candidates; uncertainty draws (plan 3 D4) cover the 3 shortlisted candidates and the controls only, to keep the run near one minute.

**Tech Stack:** as plan 1 (Bun 1.3.14, TypeScript 7.0.2, zod 4.6.7, fast-check 4.10.3); oracle fixtures from scipy 1.18.1 (test-only). Data: NASA POWER hourly point API (`https://power.larc.nasa.gov/api/temporal/hourly/point`, OpenAPI at `.../hourly/openapi.json`); ASHRAE IWEC2 EPW files from climate.onebuilding.org (Jakarta `IDN_JAKARTA-SOEKARNO-HA_967490_IW2`, Surabaya `IDN_SURABAYA-JUANDA_969350_IW2`, both unconfirmed as current until spike Q2). Versions verified 2026-11-21.

**Spec:** `Blueprint_Riset_Spandek_3_Fungsi.md` §4.3 (thermal balance), §5.1 (E1–E3 environments), §3.4 (failure mechanisms); user scope decisions of 2026-11-21 (aluminium only, Indonesian climate). Interfaces from plans 1–3.

## What the operator does
1. `bun run spandek fetch-data --indonesia` (network, about 5–10 min for 5 sites × 10 years; resumable per site-year; prints one line per site-year) — writes the raw cache to `data/indonesia/raw/` (gitignored) and `data/indonesia/SHA256SUMS`.
2. `bun run spandek indonesia --in reports/ --out reports/indonesia/` (about 1–2 min after plan 3's `run`) — writes `indonesia_days.json`, `indonesia_results.csv`, `indonesia_summary.csv`, and an "Indonesia" section in `reports/report.html`.
3. Read the section: per site, `t_max` and mean heat flux for C0 (bare aluminium), C1 and the three cards (each card is its full C4 system), initial and aged. Exit 0 = good; otherwise the exit code table of plan 3.

## Logging and debugging
Events (production = info only; every failure diagnosable from info):

| Event | Level | Emitter | Fields | Rate |
|---|---|---|---|---|
| `indonesia.fetch.done` | info | `node/power.ts` | site, year, rows, sha256 (first 12) | 50 per fetch |
| `indonesia.fetch.failed` | error | `node/power.ts` | site, year, http_status or `refused` | on failure |
| `indonesia.days.selected` | info | `core/indonesia/days.ts` | site, season, bin, local_date, daily_ghi_kwh_m2 | 30 per run |
| `indonesia.series.rejected` | error | `core/models/thermalSeries.ts` | site, column, hour_index, reason | on failure |
| `indonesia.epw.crosscheck` | info | `node/indonesia.ts` | site, month, ghi_rel_diff | 24 per run |
| `thermal.series.step` | debug | `thermalSeries.ts` | literal step names `interp`, `rk4`, `day2.extract` | dev only |

Redaction: no URLs with keys (none are used), no raw HTTP bodies, no file contents; paths relative to `reports/`. Alert rules: none (batch); exit codes are the alert. Runbook: **5** data (fill value −999, missing hour, bad hash) → delete the named site-year cache file and re-run `fetch-data`; **6** network refused → retry later; **2** bad `sites.yaml` / `indonesia.yaml` key in `error.raised.key`. A test per event (plan 1 `events` guard). Log schema and size cap as plan 1 (one JSON object per line, ≤ 2 KiB per line).

## Scope
In: five sites; wet and dry season; three day types; initial and aged reflectance; heat-flux benefit; cross-check against IWEC2 for two sites. Out: building energy simulation, rain/chloride deposition modelling (BLOCKED-10), field soiling (BLOCKED-9), a two-node thermal model (BLOCKED-2), any steel substrate. Standalone: no change to plan-2 models; plan 3's `stackProps` is consumed as is.

## Stack and versions

| Item | Choice | Version / status |
|---|---|---|
| Runtime and language | Bun, TypeScript | 1.3.14, 7.0.2 |
| Weather source | NASA POWER hourly point API | parameters `ALLSKY_SFC_SW_DWN`, `ALLSKY_SFC_LW_DWN`, `T2M`, `RH2M`, `WS2M`, `PRECTOTCORR`; units and time standard confirmed by spike Q1 |
| Cross-check | IWEC2 EPW | Jakarta, Surabaya; licence confirmed by spike Q2 |
| Independent solver | scipy `solve_ivp` DOP853 | 1.18.1, segmented at hourly kinks |

**Sites** (`configs/sites.yaml`, status `literature` for coordinates: public city coordinates; offsets fixed): Jakarta (−6.20, 106.85, WIB +7, coastal lowland), Surabaya (−7.25, 112.75, WIB +7, coastal), Medan (3.59, 98.67, WIB +7), Makassar (−5.15, 119.43, WITA +8, coastal), Bandung (−6.91, 107.61, 768 m, WIB +7, highland). Spike Q1 re-checks each coordinate against the API's returned grid point and records the elevation it returns.

**Gaps this plan closes:** blueprint E1–E3 are generic (600–1000 W/m², 28–36 °C, three wind levels) and ignore humidity, cloud, season and ageing; this plan uses satellite/reanalysis-derived hourly weather and CRRC-style initial/aged reflectance.

## Alternatives considered
| Alternative | Why not |
|---|---|
| Typical meteorological year (EPW) as the only source | Only two Indonesian IWEC2 sites confirmed; kept as cross-check |
| Full 8760 h run per candidate | 96 × 5 sites × 8760 h is hours of compute for no extra decision value; representative days answer the question |
| Clear-sky model (Haurwitz, Ineichen) instead of data | Tropical cloud dominates; all-sky data (modelled from satellite and reanalysis) is closer to what the roof sees |
| Modelling rain-wash recovery of reflectance | No Indonesian data (BLOCKED-9); the NTU Singapore study (soot −15.6 %, rain recovers 5.5 %) is a different mechanism and only motivates the scenario range |

## Risks (each pinned by a test)
| Risk | Test |
|---|---|
| NASA hourly time stamps in an unconfirmed time standard (UTC vs local solar time) so the local-day cut is off by up to 7 h; Q1 gates the `time-standard` request parameter, the request always names it explicitly, and local solar time is converted with the site longitude if only that exists | `localDayCutUsesSiteOffset` (H1) |
| Fill value −999 read as an irradiance | `fillValueRejected` (F1) |
| Hourly kinks straddled by an RK4 step | `stepNeverStraddlesHourKink` (H4) |
| Satellite irradiance biased against ground data | `crossCheckAgainstIwec2` (H2) |
| Aged result better than initial | `agedNeverCoolerThanInitial` (H7) |
| Aluminium treated with steel constants | `noSteelConstantsInContext` (H8) |

## Requirements
- **FR-1** The system MUST select, per site and season, three representative days (bins by daily GHI: above the 80th percentile = `hot`, 20th–80th = `typical`, below the 20th = `overcast`) from 2015–2024 hourly data (30 scenarios in total).
- **FR-2** `thermalSeries` MUST integrate the plan-2 balance with RK4 dt = 60 s driven by hourly series, linearly interpolated, 48 h (the selected day repeated twice, day 2 reported).
- **FR-3** Sky temperature MUST come from the dataset's downward longwave (a modelled field): `T_sky = (LW_down / σ)^¼`; the Swinbank value is reported for comparison only.
- **FR-4** Aged scenarios MUST apply `r_aged = r_initial · (1 − loss)` to the effective reflectance of coated stacks only (candidates and cards; C1 uses its datasheet weathered values; C0 bare aluminium is unchanged), `loss ∈ [0.14, 0.26]` (D3), sampled uniformly in the draws; the initial case uses loss 0.
- **FR-5** Weighted benefit per site: `Δq = Σ w_bin · (q_in_mean(C0) − q_in_mean(x))` with weights 0.2, 0.6, 0.2 (bin shares), then season shares from the data (days per season / total).
- **FR-6** Results MUST carry the same intervals as plan 3 for the shortlist and controls; all 96 candidates are nominal-only and labelled so.
- **FR-7** Substrate constants MUST be aluminium (plan 1 D5 and plan 2 Q2); steel constants are rejected at load (H8).
- **NFR-1** `indonesia` MUST finish within 600 s on the reference machine with 2 workers and be byte-identical for one and two workers.
- **NFR-2** The raw cache MUST be verified against `SHA256SUMS` before use.

## Acceptance: hypotheses and proofs
Thresholds table: `T_rk4_k = 1e-4` (plan 2), `T_ghi_hard = 0.35` (monthly mean daily GHI, NASA vs IWEC2, relative; the working value `T_ghi` is frozen once from the first real run and never edited), `T_nrt = 600 s`.

| ID | Hypothesis | Experiment | Falsified when |
|---|---|---|---|
| H1 | Local-day cut and data integrity are correct | one real site-year; check 24 points per local day, no −999, RH ∈ [0, 100], on clear days (daily GHI above the site's 80th percentile) the GHI peak is within ±3 h of solar noon | any day ≠ 24 points, any fill value, or a clear day whose GHI peak is more than 3 h from solar noon on ≥ 5 % of clear days |
| H2 | NASA hourly data agrees with an independent typical-year dataset (IWEC2, derived from station observations) | Jakarta and Surabaya: monthly mean daily GHI vs IWEC2 | any month's relative difference > `T_ghi_hard` |
| H3 | Representative-day selection matches a brute-force definition | property test: random year of daily sums; chosen day's rank equals the bin's median rank ±1 | rank off by more than 1 |
| H4 | Series integrator equals an independent solver | 20 real days vs scipy DOP853 segmented at every hour: `t_max_c`, `q_in_mean_w_m2`, full day-2 series | difference > `T_rk4_k`, `T_q_w_m2`, `T_rk4_series_k` (plan 2) |
| H5 | Equal inputs give plan-2 results | constant series (G, T, wind) equals plan-2 `simulateDay` with constant `gProfile` | relative difference > `T_thm_rtol` |
| H6 | Monotone physics | for all 30 scenarios, lowering `r_solar` raises `t_max` | any violation |
| H7 | Ageing never helps | for every row except C1, `t_max(aged) ≥ t_max(initial)` and `q(aged) ≥ q(initial)` (C1 uses its own datasheet values, checked by `c1AgedUsesDatasheetValues`) | any violation |
| H8 | Aluminium, not steel | context substrate `c_j_m2k` equals ρ·c_p·t of plan 1 D5; any config whose `c_j_m2k` differs from ρ·c_p·t by more than 1e-6 relative is rejected (the steel value 1540 is one case among all wrong values) | accepted |
| H9 | Report equals data | numbers in the Indonesia section equal `indonesia_summary.csv` (plan 0 honesty guard style, reading cells by `data-` attributes) | any mismatch |
| H10 | Deterministic | CSV hashes identical across 1 and 2 workers and Bun and Node for the selection step | any hash differs |
| H11 | Runtime | `indonesia` after `run` completes within `T_nrt` | exceeds |

**Fault-injection matrix** (edit exactly one input; expect phase, status, exit):

| ID | Single edit | Phase | Exit |
|---|---|---|---|
| F1 | one irradiance value = −999 in a raw file | `indonesia.load` | 5 |
| F2 | one hour removed from a day | `indonesia.load` | 5 |
| F3 | one byte changed in a raw file (hash) | `indonesia.verify` | 5 |
| F4 | a site without `lat` in `sites.yaml` | `config` | 2 |
| F5 | `loss_lo > loss_hi` | `config` | 2 |
| F6 | `fetch-data` against a dead port (real refused connection, no mock) | `indonesia.fetch` | 6 |
| F7 | `--site Atlantis` | `config` | 2 |
| F8 | RH = 140 in one hour | `indonesia.load` | 5 |
| F9 | `substrate.c_j_m2k` set to any wrong value (1540, the steel figure, is used) | `config` | 2 |

Acceptance as Given/When/Then: Given the cache for five sites and a plan-3 run directory, when `indonesia` runs, then 30 scenarios × (96 nominal + 5 uncertain) × {initial, aged} = 6060 rows are written (H1–H11, FR-1..7); Given F1–F9, each yields its phase and exit.

## Execution contract: one shot, nothing left open
**Preflight gate** (print and stop if missing): (1) plans 1–3 done, green, with a `reports/run_meta.json`; (2) Evint approves read-only HTTP GET to `power.larc.nasa.gov` and `climate.onebuilding.org`; (3) 2 workers at priority 10 (plan 3 preflight already granted); (4) the plan-2 Q2 aluminium constants are sourced or the coupon measurement (BLOCKED-8) is recorded; (5) free disk ≥ 200 MB for the raw cache. No stub, TODO, skip, xfail, placeholder or deferred spike; spike Q1–Q4 end in written answers. By-design limits (BLOCKED-9, -10) are tickets in `docs/BLOCKED.md`. `T_ghi` is frozen once from the first real run. Done means every hypothesis holds on evidence with run ids in `docs/proof-log-indonesia.md`, and lint, typecheck and tests are green. If a task fails: stop at that task, leave the tree clean, report the failing proof with its log. Out of scope for the run: merge, prod, publishing.

## Global Constraints
Plans 1–3 constraints apply. Core files import no Node/Bun/DOM modules; `node/power.ts` and `node/epw.ts` hold all I/O. No mocks; the dead-port test uses a real refused connection. No steel or Galvalume constants anywhere.

## Review Focus
1. A day that is cut in UTC instead of local time (shifts the sunrise by 7 h).
2. The −999 fill value read as a number.
3. Missing or duplicated hours at daylight-saving-free but leap-year boundaries (29 Feb).
4. Reflectance aged on the substrate as well as on the coating.
5. Report cells hand-typed instead of read from the CSV.

## Decisions (all settled)
- **D1** Sites and offsets as listed; days are cut at local midnight using the fixed offset (Indonesia has no daylight saving).
- **D2** Seasons are data-defined: a month is `wet` if its ten-year mean `PRECTOTCORR` total exceeds 150 mm, otherwise `dry`; `configs/indonesia.yaml` holds the 150 mm value as `scenario`.
- **D3** Ageing scenario range `loss ∈ [0.14, 0.26]`, status `literature` from the three CRRC initial/3-year pairs read from manufacturer literature: Sikalastic-515 AC 0.83 → 0.69 (−16.9 %), APOC 248 0.88 → 0.65 (−26.1 %), APOC 252 0.90 → 0.77 (−14.4 %). These are US-site 3-year values; the humid tropics may be worse (LBNL: biological growth can dominate soiling in humid climates), so the report states "scenario, not an Indonesian measurement" (BLOCKED-9).
- **D4** C1 control default: APOC 252 Sunwhite, solar reflectance 0.90 initial / 0.77 weathered, thermal emittance 0.87 initial / 0.90 weathered (brochure CRRC table; both columns print the product id 0646-0005 so the id is not trusted). Sikalastic-515 AC (0.83/0.69, emittance 0.90/0.91, 26 mil DFT) is recorded as a cross-check; its figures came from a model summary of the page and are marked unverified. Evint may override with a local Indonesian product.
- **D5** Interior film 0.162 m²K/W and exterior film 0.030 m²K/W from the ASHRAE defaults as printed in WAC 51-11C-61013 §A101.3 (0.92 and 0.17 hr·ft²·°F/Btu); the convective `h` still comes from plan 1 `h = a + b·V` with hourly `WS2M`.
- **D6** CPVC stays the plan-1 `scenario` 0.45: searches found no published CPVC for TiO2/BaSO4 in acrylic; the value needs measurement (oil absorption).
- **D7** The corrosion exposure of a site is reported as time-of-wetness hours per year (hours with RH > 80 % and T > 0 °C) beside the unchanged relative corrosion proxy; no site multiplier is applied to the proxy (no calibration data).
- **D8** Uncertainty draws: plan 3 D4 plus `loss` for aged rows; stream `deriveSeed(seed, 400)` (plan 1 D13 registry); uncertainty only for the five uncertain subjects of D9.
- **D9** Output ordering: site (Jakarta, Surabaya, Medan, Makassar, Bandung), season (wet, dry), bin (hot, typical, overcast), subject (the five uncertain subjects C0, C1, card_high, card_balanced, card_low, where each card is its C4 system per plan 3 FR-1; then the 96 nominal candidates), state (initial, aged).

## File Structure
| Source | Test |
|---|---|
| `src/core/models/thermalSeries.ts` | `tests/core/models/thermalSeries.test.ts` |
| `src/core/indonesia/days.ts` (selection, local-day cut, TOW) | `tests/core/indonesia/days.test.ts` |
| `src/core/indonesia/series.ts` (types, validators) | `tests/core/indonesia/series.test.ts` |
| `src/node/power.ts` (fetch, cache, hashes) | `tests/node/power.test.ts` |
| `src/node/epw.ts` (EPW parser) | `tests/node/epw.test.ts` |
| `src/node/indonesia.ts` (batch, outputs) | `tests/node/indonesia.test.ts` |
| `src/node/siteConfig.ts` (loaders for `configs/sites.yaml`, `configs/indonesia.yaml`) | `tests/node/siteConfig.test.ts` |

Whitelisted extra tests (plan 1 layout guard): `tests/indonesia.e2e.test.ts`, `tests/indonesia.crosscheck.test.ts`.

## Tasks

### Task 1: Spike — data sources
**Tests:** none (written answers). **Creates:** `docs/spike-indonesia.md`. **Interfaces:** none.
- [ ] Q1: from the OpenAPI and one real request for Jakarta 2023 (`parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_LW_DWN,T2M,RH2M,WS2M,PRECTOTCORR`, `community=RE`, `format=JSON`): units of irradiance (W/m² or Wh/m²), time standard (UTC or LST) and how to select it, fill value, maximum request span (chunk by year if needed), returned grid point and elevation per site. Q2: confirm the two IWEC2 files exist on climate.onebuilding.org and read their licence. Q3: confirm that hourly series with RH, wind and LW are present for 2015–2024 at all five sites. Q4: confirm the CRRC pair values of D3 against the manufacturers' pages (the Sikalastic page figures were an unverified summary).
- [ ] If a Q fails (an API parameter is missing), stop and report; no fallback is built on a guess.
- [ ] Commit: `docs: spike answers for Indonesian weather data`
**Acceptance:** spike: Q1–Q4 answered in writing; later H/F ids are proved in Tasks 2–6.

### Task 2: Config, series types, validators
**Tests:** `tests/core/indonesia/series.test.ts`, `tests/node/siteConfig.test.ts`. **Creates:** `configs/sites.yaml`, `configs/indonesia.yaml`, `src/core/indonesia/series.ts`, `src/node/siteConfig.ts` (`loadSites`, `loadIndonesiaConfig`, zod strictObject like plan 1). **Modifies:** `tests/layout.guard.test.ts` (plan 1 file: add `indonesia.e2e`, `indonesia.crosscheck` to the whitelist; test `guardAcceptsPlan4Files`).
**Interfaces:**
```ts
export type HourRecord = { utc_ms: number; g_w_m2: number; lw_down_w_m2: number; t_air_c: number; rh_pct: number; wind_m_s: number; precip_mm: number }
export type IndonesiaRow = { site: string; season: "wet" | "dry"; bin: "hot" | "typical" | "overcast"; subject: string; state: "initial" | "aged"; r_solar_eff: number; t_max_c: number; t_max_lo: number; t_max_hi: number; q_in_mean_w_m2: number; q_lo: number; q_hi: number; tow_hours: number; nominal_only: boolean }
export type HourlySeries = { g_w_m2: Float64Array; t_air_c: Float64Array; rh_pct: Float64Array; wind_m_s: Float64Array; lw_down_w_m2: Float64Array }   // 24 points, local day
export type SiteConfig = { id: string; lat: number; lon: number; utc_offset_h: number; elevation_m: number }
export function validateSubstrate(c_j_m2k: number): void              // ConfigError(key = "substrate.c_j_m2k") unless equal to rho·c_p·t for t in {0.5, 0.7} mm within 1e-6 relative
export function validateLossRange(lo: number, hi: number): void       // ConfigError unless 0 <= lo <= hi < 1
export function validateSeries(s: HourlySeries, site: string): void   // ConfigError(key = column) for length ≠ 24, non-finite, g < 0, RH ∉ [0,100], wind < 0; DataError exit 5 variant for fill values
export function skyTempK(lwDownWM2: number): number                     // (LW/σ)^(1/4), σ = 5.670374419e-8
```
- [ ] Append BLOCKED-9 (field soiling/biological growth in Indonesia: replaced by the labelled loss range D3) and BLOCKED-10 (wind-driven rain and chloride deposition) to `docs/BLOCKED.md` with reason, owner (Evint) and unblock condition (field exposure data), and test `blockedRegisterHasTenEntriesAfterPlan4`.
- [ ] Tests first (`fillValueRejected`, `shortDayRejected`, `rhOutOfRangeRejected`, `skyTempFromLwMatchesHandValue`, `lossRangeInvertedRejected`, `steelConstantRejected`) → run, expect FAIL → implement → PASS.
- [ ] Commit: `feat(indonesia): site config and hourly series validation`
**Acceptance:** F1, F2, F4, F5, F8, F9, H1 (validation part), H8.

### Task 3: Series thermal model
**Tests:** `tests/core/models/thermalSeries.test.ts`, `tests/oracle.fixtures.test.ts` (add fixture). **Creates:** `src/core/models/thermalSeries.ts`. **Modifies:** `oracle/generate.py` (series fixture), `tests/fixtures/oracle/thermalSeries.json`.
**Interfaces:**
```ts
export function simulateSeriesDay(p: Omit<ThermalInputs, "g_peak_w_m2" | "t_air_k" | "t_sky_k" | "h_conv_w_m2k">,
  s: HourlySeries, hA: number, hB: number): DiurnalResult   // day repeated twice, day 2 reported, linear interpolation, dt = 60 s
```
- [ ] Fixture: real days are not available until Task 4, so Task 3 generates 20 seeded physically plausible 24-point days (own splitmix, ranges from the spike) solved with scipy DOP853 segmented at every hour. Tests: `matchesOracleTwentyDays` (H4), `constantSeriesEqualsPlan2` (H5), `stepNeverStraddlesHourKink` (H4), `lowerReflectanceIsHotter` (H6, on 10 seeded days), `energyClosure`.
- [ ] Run, expect FAIL → implement → PASS.
- [ ] Commit: `feat(indonesia): hourly-driven heat balance verified against scipy`
**Acceptance:** H4, H5, H6.

### Task 4: Days, fetching, EPW cross-check data
**Tests:** `tests/core/indonesia/days.test.ts`, `tests/node/power.test.ts`, `tests/node/epw.test.ts`. **Creates:** `src/core/indonesia/days.ts`, `src/node/power.ts`, `src/node/epw.ts`.
**Interfaces:**
```ts
export function localDays(utcHours: readonly HourRecord[], utcOffsetH: number): { date: string; series: HourlySeries; precip_mm: number }[]   // complete local days only; an incomplete day is a DataError
export function pickDays(dailyGhi: readonly number[], months: readonly number[], monthlyPrecipMm: readonly number[]): { season: "wet"|"dry"; bin: "hot"|"typical"|"overcast"; index: number }[]   // FR-1, D2; a season with no month for a site is dropped (a site with no dry month yields fewer than 30 scenarios in total)
export function timeOfWetnessHours(rh: Float64Array, tC: Float64Array): number                   // RH > 80 and T > 0
export async function fetchSiteYear(site: SiteConfig, year: number, dir: string, baseUrl?: string): Promise<{ rows: number; sha256: string }>
export function parseEpw(text: string): { ghi: Float64Array; month: Uint8Array }   // 8760 rows
```
- [ ] Tests first: `localDayCutUsesSiteOffset` (H1), `leapDayHandled`, `pickDaysMatchesBruteForce` (H3, fast-check), `towCountsOnlyWetAndWarmHours`, `fetchWritesHashedFile` (real local HTTP server serving a recorded real response fixture; no in-memory fake of the client), `deadPortIsExit6` (F6), `hashMismatchIsExit5` (F3), `parseEpw8760Rows`. Run, expect FAIL → implement → PASS.
- [ ] Commit: `feat(indonesia): representative days, NASA POWER fetch and EPW reader`
**Acceptance:** H1, H3, F3, F6.

### Task 5: Batch, outputs, cross-check
**Tests:** `tests/node/indonesia.test.ts`, `tests/indonesia.crosscheck.test.ts`. **Creates:** `src/node/indonesia.ts`. **Modifies:** `src/node/cli.ts` (`fetch-data --indonesia`, `indonesia --in --out [--site]`).
**Interfaces:**
```ts
export const INDONESIA_COLUMNS: readonly string[]   // site, season, bin, subject, state, r_solar_eff, t_max_c, t_max_lo, t_max_hi, q_in_mean_w_m2, q_lo, q_hi, tow_hours, nominal_only
export function runIndonesia(ctx: ModelContext, shortlist: Record<string,string>, seed: number, nMc: number, dir: string): Promise<void>
export function weightedBenefit(rows: readonly IndonesiaRow[]): { site: string; subject: string; state: string; dq_w_m2: number; dq_lo: number; dq_hi: number }[]   // FR-5
```
- [ ] Export the 20 first selected real days (from the Task 4 cache) to `tests/fixtures/oracle/thermalSeriesReal.json` via `oracle/generate.py` (scipy segmented at every hour) and test `matchesOracleOnRealDays` (H4 on real data, `T_rk4_k`, `T_q_w_m2`, `T_rk4_series_k`); also `siteWithNoDryMonthsReported` (a season with no month is dropped and logged).
- [ ] Tests first: `rowCountMatchesScenarios` (G/T/W: `nScenarios × (96 + 5) × 2`), `c1AgedUsesDatasheetValues` (aged C1 uses 0.77 and 0.90, not the loss draw), `lossAppliesToCoatingOnly` (C0 bare aluminium is unchanged by ageing: no substrate ageing is modelled, BLOCKED-9), `agedNeverCoolerThanInitial` (H7), `noSteelConstantsInContext` (H8), `crossCheckAgainstIwec2` (H2; freeze `T_ghi` from the first run), `sameCsvOneAndTwoWorkers` (H10), `weightedBenefitHandComputed` (FR-5), `unknownSiteIsExit2` (F7). Run, expect FAIL → implement (reuse `thermalOutcomes` machinery, plan 3 workers, CSV via `toCsv`) → PASS.
- [ ] Commit: `feat(indonesia): five-site batch with ageing scenarios and benefit table`
**Acceptance:** H2, H4 (real days), H7, H8, H10, F7.

### Task 6: Report section, end-to-end, proof log
**Tests:** `tests/indonesia.e2e.test.ts`, `tests/report.browser.test.ts` (add Indonesia section checks), `tests/honesty.test.ts` (forbidden phrases extended to the new section). **Modifies:** `src/web/figures.ts` (site/day-type bars with intervals; PROXY and "aluminium, scenario ageing" labels), `src/node/report.ts`.
- [ ] Tests first: `indonesiaSectionNumbersEqualCsv` (H9), `labelsAgedAsScenario`, `e2eRunsUnderBudget` (H11, all subprocesses with `--max-load 1000`), `faultMatrixF1toF9`. Run, expect FAIL → implement → PASS → full suite, lint, typecheck green.
- [ ] Mutation checks (commit first, copy to the scratchpad, never checkout after a mutation): M1 cut days in UTC → H1 must fail; M2 drop the aluminium→steel guard → H8/F9 must fail; M3 apply loss to the substrate too → a dedicated `lossAppliesToCoatingOnly` test must fail.
- [ ] Write `docs/proof-log-indonesia.md` with run ids; commit: `test(indonesia): end-to-end, fault matrix and proof log`
**Acceptance:** H9, H10, H11, F1–F9.

## Rollout and rollback
Separate subcommand, no flag; the existing `run` and report are unchanged when `indonesia` is not run. Rollback: `git revert` the commit range; delete `data/indonesia/`. No hand-offs outside the repo.

## Part 2: Test specification
```ts
// tests/core/models/thermalSeries.test.ts
test("constantSeriesEqualsPlan2", () => {
  const s = constantSeries({ g: 800, tC: 32, rh: 70, wind: 2, lw: 420 })
  const a = simulateSeriesDay(base, s, 5.7, 3.8)   // compare relative to absolute K, like plan 2 `T_thm_rtol`
  const b = simulateDay({ ...base, g_peak_w_m2: 800, t_air_k: 305.15, t_sky_k: skyTempK(420), h_conv_w_m2k: 5.7 + 3.8 * 2 }, { gProfile: () => 800 })
  expect(Math.abs(a.t_max_c - b.t_max_c) / (b.t_max_c + 273.15)).toBeLessThan(5e-7)   // T_thm_rtol
})
test("lowerReflectanceIsHotter", () => {
  for (const day of realDays) expect(sim(day, 0.5).t_max_c).toBeGreaterThan(sim(day, 0.7).t_max_c)
})
// tests/core/indonesia/series.test.ts
test("fillValueRejected", () => expect(() => validateSeries({ ...ok, g_w_m2: withAt(ok.g_w_m2, 5, -999) }, "jakarta")).toThrow(/g_w_m2/))
// tests/core/indonesia/days.test.ts
test("pickDaysMatchesBruteForce", () => fc.assert(fc.property(dailySums(365), (d) => sameRanks(pickDays(d, months), bruteForce(d)))))
test("localDayCutUsesSiteOffset", () => { /* UTC 17:00 of day D at +7 is local 00:00 of D+1 */ })
// tests/node/indonesia.test.ts
test("agedNeverCoolerThanInitial", () => { for (const [i, a] of pairs(rows)) { expect(a.t_max_c).toBeGreaterThanOrEqual(i.t_max_c) } })
test("rowCountMatchesScenarios", () => expect(rows.length).toBe(scenarios.length * (96 + 5) * 2))
test("noSteelConstantsInContext", () => expect(ctx.mat.substrate.c_j_m2k).toBeCloseTo(2730 * 893 * 0.0005, 6))
```
