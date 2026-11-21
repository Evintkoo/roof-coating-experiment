# Plan 04 proof log (Indonesian climate simulation)

Environment: Bun 1.3.14, TypeScript 7.0.2, scipy 1.18.1 (oracle), Google Chrome (headless, `channel: "chrome"`), Node 22.21 (selection check only), macOS, 10 cores, load average 2 to 3 during the runs, 2 workers at priority 10. Code under proof: branch `feat/digital-bun`, commits `0e598dd` .. `8ff87d7` (Tasks 2 to 4), `ad40a46` (`feat(indonesia): five-site batch with ageing scenarios and benefit table`) and the Task 6 commit that carries this file. Seed 20261121. Weather: NASA POWER hourly (UTC, requested per site-year) 2015-2024 at five sites; cross-check: TMYx 2011-2025 of climate.onebuilding.org.

Every number is a model result on aluminium with scenario ageing (PROXY); the weather is modelled (reanalysis and satellite), not station measurements; the aged values are a scenario loss range of 14 to 26 % (US three-year records), not an Indonesian measurement.

> **Wording amendments to the plan (rulings R10, R11, Tasks 3 to 5; the plan text is not edited).**
> H2 compares two modelled products (NASA POWER and the free TMYx typical year, not paid IWEC2): it is a consistency check, not a validation against ground observations. `T_ghi_hard` 0.35 is the plan's; the working `T_ghi` 0.25 was frozen once from the first real run (largest monthly difference 0.201) in `tests/fixtures/frozen_t_ghi.txt`.
> H4: `t_max` under hourly forcing meets `T_RK4_HOURLY_K` 5e-3 K (frozen in Task 3), not plan 2's 1e-4 K; `q` and the 600 s series keep plan 2's `T_q_w_m2` and `T_rk4_series_k`.
> The first and last local day of each ten-year series are dropped as partial (3652 complete local days per site); an interior hole is a DataError. Fetching names `time-standard=utc` and runs one request per site-year (a UTC calendar year); local days are cut with the fixed site offset. Bandung's elevation is the API's 921.68 m. `validateSubstrate` tolerance is 1e-4 relative (not 1e-6) so the five-figure 1218.9 of `weather_scenarios.yaml` passes while steel's 1540 is rejected. F3's phase is `indonesia.verify` (the CLI maps the DataError of `verifyData`), F1, F2, F8 are `indonesia.load` and F6 is `indonesia.fetch`.

Two tiers (`docs/testing.md`): the fast files run in `bun run check` with one site, two years and 4 draws; `tests/indonesia.e2e.proof.test.ts` runs the full size (`bun run proof`). One suite body, `tests/suites/indonesiaE2e.ts`. The Indonesia tests need the weather cache (`fetch-data --indonesia`); without it they fail with a preflight message.

## Real runs

| Run id | Command | Exit | Wall-clock | Notes |
|---|---|---|---|---|
| `20261121T180828758-456c2411` | `indonesia --in reports/plan-00-run --out reports/plan-00-run/indonesia --max-load 1000` | 0 | 6.65 s | five sites, 30 scenarios, 256 draws, 6060 result rows, 200 summary rows; limit `T_nrt` 600 s |
| `20261121T180835465-87b2795f` | `report --in reports/plan-00-run --max-load 1000` | 0 | 2.1 s | Indonesia section present beside Optimisation, `extra[]` lists the four files and the budget table; `report.html` 5,879,586 bytes, sha256 `53a41c48c9d149aa1e255c519a225197324f1bc2fe147919f96038b4a1859d1b` |
| (same command again) | `report --in reports/plan-00-run` | 0 | 2.1 s | identical `report.html` sha256 (idempotent) |
| proof tier | `bun test --timeout 3600000 tests/indonesia.e2e.proof.test.ts` | pass | 40.6 s total | `run` at 256 draws, then `indonesia` in 6.7 s (limit 600 s), one-worker run byte-identical, selection identical under Node |

Copy for opening: `reports/report.html` (git-ignored, same bytes as the run above).

## Hypotheses

| ID | Proof | Observable |
|---|---|---|
| H1 | `days.test.ts` `localDayCutUsesSiteOffset` and `boundaryPartialDaysDroppedInteriorHoleIsError`; `indonesia.crosscheck.test.ts` `realSiteYearIsCleanAndPeaksNearSolarNoon` (two real Jakarta years) | 24 points per local day, no -999, RH in [0, 100]; clear days (above the 80th percentile) peak within 3 h of solar noon on under 5 % (limit) of days. Mutant M1 (UTC cut) fails 4 tests, among them the real-data one |
| H2 | `indonesia.crosscheck.test.ts` `crossCheckAgainstTmyx`, `crossCheckCanFail` | 60 site-months; largest monthly difference NASA minus TMYx: Jakarta 0.169, Surabaya 0.124, Medan 0.113, Makassar 0.201, Bandung 0.111; all at most `T_ghi` 0.25 and `T_ghi_hard` 0.35. Jakarta, Surabaya and Medan read lower than TMYx, Makassar higher. With the TMYx irradiance of Jakarta scaled by 1.6 the check exceeds 0.35 (it can fail). Both products are modelled, so this is consistency, not accuracy |
| H3 | Task 4 `pickDaysMatchesBruteForce` (200 fast-check runs) | exact agreement with a value-threshold brute force |
| H4 | `thermalSeries.test.ts` (20 seeded days, Task 3) and `indonesia.test.ts` `matchesOracleOnRealDays` (20 real days, `tests/fixtures/oracle/thermalSeriesReal.json`, scipy DOP853 segmented at every hour, frozen once) | real days: max `t_max` error 1.84e-4 K (limit `T_RK4_HOURLY_K` 5e-3), `q` 2.3e-6 W/m² (1e-3), series 9.7e-6 K (3e-4) |
| H5, H6 | `thermalSeries.test.ts` constantSeriesEqualsPlan2, lowerReflectanceIsHotter (Task 3) | pass |
| H7 | `indonesia.test.ts` `agedNeverCoolerThanInitial`, `c1AgedUsesDatasheetValues` | every row except C1: aged `t_max` and `q` at least the initial ones (over 540 pairs); C1 aged uses 0.77 and 0.90 and a degenerate interval |
| H8 | `indonesia.test.ts` `noSteelConstantsInContext`, `steelContextIsRefusedBeforeAnyWork`; `series.test.ts` | context value 1218.9 within 1e-4 of 2730 x 893 x 0.0005; 1540 and four other wrong values rejected. Mutant M2 fails 5 tests, among them F9 |
| H9 | `tests/node/report/indonesia.test.ts` `indonesiaSectionNumbersEqualCsv` (read through `data-site/bin/subject/state/col` attributes), `benefitBarsInChromeEqualTheCsvForBothStates` (real Chrome: plotted values and whiskers of both states, the table cell) | 28 cells equal `fmtValue` of the CSV numbers; 16 bars per state equal the CSV |
| H10 | `indonesia.test.ts` `sameCsvOneAndTwoWorkers` (fast), `indonesia.e2e` suite `sameCsvOneAndTwoWorkers` (both tiers), `daySelectionIsIdenticalUnderBunAndNode` | four output files byte-identical for 1 and 2 workers at both sizes; `pickDays` bundled for Node gives the same days as Bun for the sites of the tier (five sites in the proof tier) |
| H11 | `indonesia.e2e` suite `e2eRunsUnderBudget` (all subprocesses `--max-load 1000`) | full size 6.7 s against 600 s |
| FR-1..FR-7 | `rowCountMatchesScenarios` (D9 order, 6 x 101 x 2 rows for one site; 6060 at full size), `lossAppliesToCoatingOnly`, `siteWithNoDryMonthsReported`, `weightedBenefitHandComputed` | hand-computed 5.9 W/m² (shares 0.25, 0.75), interval one W/m² each side; renormalised without shares (5.6) and without a season (5.0) |

## Fault-injection matrix (real edits, real CLI; `indonesia.e2e.test.ts` `faultMatrixF1toF9`; exit code, `error.raised` phase, no stack trace)

F1, F2 and F8 edit one raw site-year and rewrite `SHA256SUMS` (otherwise the hash check would fire first and the loader's own check would not be tested); F3 changes one byte and leaves the sums alone.

| ID | Single edit | Exit | Phase | Observed |
|---|---|---|---|---|
| F1 | one irradiance value = -999 | 5 | `indonesia.load` | pass |
| F2 | one hour removed (from all six parameters) | 5 | `indonesia.load` | pass |
| F3 | one byte of a raw file | 5 | `indonesia.verify` | pass |
| F4 | a site without `lat` | 2 | `config` | pass |
| F5 | `loss_lo` 0.3 above `loss_hi` | 2 | `config`, key `ageing.loss_lo` | pass |
| F6 | `fetch-data --indonesia` against a dead port | 6 | `indonesia.fetch` | pass (also `epw.test.ts`) |
| F7 | `--site Atlantis` | 2 | `config`, key `site` | pass |
| F8 | RH = 140 in one hour | 5 | `indonesia.load` | pass |
| F9 | `roof.c_substrate_j_m2k` = 1540 | 2 | `config`, key `substrate.c_j_m2k` | pass |

## Mutation checks (in a copy under the scratchpad, `mut/`; the worktree was never mutated)

| ID | Mutation | Expected | Killed by | Result |
|---|---|---|---|---|
| M1 | cut local days in UTC (offset 0) | H1 fails | `localDayCutUsesSiteOffset`, `boundaryPartialDaysDroppedInteriorHoleIsError`, `leapDayHandled`, `realSiteYearIsCleanAndPeaksNearSolarNoon` | killed, 4 of 44 tests fail; the unmutated copy passes 44 of 44 |
| M2 | `validateSubstrate` accepts anything | H8, F9 fail | `noSteelConstantsInContext`, `steelContextIsRefusedBeforeAnyWork`, `steelConstantRejected`, `anyWrongSubstrateConstantRejected`, `faultMatrixF1toF9` (F9) | killed, 5 of 50 fail |
| M3 | apply the loss to the bare substrate too | `lossAppliesToCoatingOnly` fails | `lossAppliesToCoatingOnly` only (`agedNeverCoolerThanInitial` cannot see it: a lower reflectance still makes the roof hotter) | killed, 1 of 16 fails |

## Headline results (256 draws, weighted, mean heat flux into the building)

Benefit = C0 bare aluminium minus the subject, W/m², nominal [p5, p95]; the weighting is 0.2 hot, 0.6 typical, 0.2 overcast and the data season shares. Sensitive to the ageing scenario: the aged coatings keep 65 to 70 % of their initial benefit. Time of wetness (hours per year, RH above 80 % and air above 0 °C, ten-year mean): Jakarta 5647, Surabaya 4475, Medan 6120, Makassar 5077, Bandung 6559. Bandung's weighted mean flux for bare aluminium is already negative (-10.04 W/m², highland), so its benefit is measured from a lower base than the lowland sites (+2.3 to +7.8 W/m²).

| Site | C1 initial | High card initial | High card aged | Balanced card initial | Balanced card aged | Low card aged |
|---|---|---|---|---|---|---|
| Jakarta | 14.20 [12.74, 15.67] | 15.36 [13.83, 16.89] | 10.43 [7.63, 13.21] | 14.73 [13.10, 16.36] | 9.93 [7.20, 12.65] | 9.79 [7.06, 12.53] |
| Surabaya | 14.40 [12.93, 15.88] | 15.58 [14.04, 17.13] | 10.56 [7.72, 13.38] | 14.94 [13.30, 16.58] | 10.05 [7.29, 12.80] | 9.91 [7.15, 12.68] |
| Medan | 17.95 [16.05, 19.86] | 19.39 [17.40, 21.38] | 13.29 [9.74, 16.83] | 18.60 [16.49, 20.72] | 12.68 [9.22, 16.13] | 12.51 [9.05, 15.98] |
| Makassar | 17.22 [15.37, 19.08] | 18.66 [16.72, 20.61] | 12.55 [9.04, 16.04] | 17.88 [15.82, 19.94] | 11.93 [8.52, 15.35] | 11.76 [8.35, 15.20] |
| Bandung | 15.13 [13.28, 16.99] | 16.55 [14.61, 18.49] | 10.52 [7.03, 13.98] | 15.78 [13.72, 17.83] | 9.91 [6.51, 13.30] | 9.74 [6.35, 13.15] |

C1 aged (datasheet weathered values) is 11.0 to 14.0 W/m² and in every site at or above the aged cards. This is not a result about which product ages better: aged C1 uses its own datasheet loss (0.90 to 0.77, about 14 %) while the cards use the midpoint of the scenario loss range (about 20 %), so the order of aged C1 against the cards is driven by the assumed loss, and the intervals overlap. Only the initial ordering (cards ahead of C1 when new) does not depend on the ageing scenario.

## Gate

`bunx biome check` (no errors; the 26 warnings are pre-existing files and a docs spike) and `tsc --noEmit` are clean. The fast tier passed in two batches on a machine loaded (load average 5 to 7) by another session: every fast file except the Indonesia ones and `epw.test.ts` (606 tests, 0 fail, 256 s) and the Indonesia files plus the four heavy plan 3 and 5 files and the browser file (229 s, 0 fail). A single `bun run check` invocation stalled three times under that load in `bun test --parallel=3` (one idle worker, 0 % CPU, no output for minutes) and was stopped by hand; see the report, it was not reproduced in either batch.

## Notes

- Uncertainty intervals of a benefit subtract the interval of the subject from the interval of C0 without pairing the draws, so they are an outer bound (wider than a paired interval), not a [p5, p95] of the benefit; the report labels them "outer bound". Intervals of weighted values are weighted sums of the per-scenario bounds. The temperature column of the report is the weighted mean of the day peaks, not a peak of the weighted series.
- The ageing scenario (loss range and nominal) is recorded in `indonesia_days.json` (`loss_lo`, `loss_hi`, `loss_nominal`); `indonesia_results.csv` does not carry it.
- Weather caveats shown in the report: the NASA grid-cell elevation (Bandung 921.68 m, so temperatures may read 1 to 2 K cool; Medan and Makassar may read cool), Medan's missing dry season, and the 150 mm wet/dry threshold (Bandung's June, 151 mm, sits on it).
- C1 has no uncertain input in the model (datasheet values), so its interval is the single run; only C0's substrate reflectance, the material draws of the recipes and the ageing loss are sampled.
- `fetch-data --indonesia` keeps the committed `data/indonesia/SHA256SUMS` authoritative: downloaded bytes that differ from it are refused (exit 5, phase `indonesia.verify`) and the list is restored.
- The seed stream of the ageing-loss draws is 400 (plan 04 D8).
