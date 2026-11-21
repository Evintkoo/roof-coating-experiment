# Testing: two tiers

| Tier | Command | What runs | Wall time (this machine, 10 cores) | When |
|---|---|---|---|---|
| fast | `bun run check` | biome, `tsc --noEmit`, every `*.test.ts` except `*.proof.test.ts` (3 files in parallel) | about 2.2 min (was about 17 min) | every commit, every push |
| proof | `bun run proof` | the four `*.proof.test.ts` files, one after the other | about 13 min | before a release or a merge that touches the optimiser, the budget table, the pipeline or the models; after changing a frozen threshold's inputs; on demand or nightly in CI |

`bun run test` is the fast tier without biome and tsc. `bun run proof` runs the proof files serially on purpose: they assert wall-clock limits (plan 05 `T_nrt` 600 s, `T_nrt_table` 900 s, plan 03 frozen runtime), so they must not compete with each other for cores.

## The rule

A slow test is never moved out of the gate. It is split: the same assertions run at small size in the fast tier and at the full size, with the original thresholds, in the proof tier.

- `X.test.ts` is the fast file; `X.proof.test.ts` is its full-size twin, in the same directory. The layout guard (`tests/layout.guard.test.ts`, `proofFilesPairWithAFastTwin`) fails when a proof file has no fast twin; a proof file is judged as its twin (a mirror of a source file or on the cross-cutting whitelist).
- Both files call one suite body in `tests/suites/*.ts` with a scale object (`*_FAST`, `*_PROOF`). One body means a fast test cannot drift away from its proof test: only the sample sizes differ.
- The default `bun test` ignores proof files with `--path-ignore-patterns '**/*.proof.test.ts'`; `bun run proof` selects them with the path filter `.proof.test.ts` (bun 1.3.14 semantics: a positional argument is a substring filter on the path).
- Frozen thresholds and fixtures (`tests/fixtures/frozen_*.txt`, the oracle files, `T_nrt`, `T_nrt_table`, `T_REPAIR`) are read by both tiers and never edited by a tier change.

## What is small in the fast tier and what stays full

| File (fast) | Fast scale | Proof twin and full scale |
|---|---|---|
| `budget.baseline.test.ts` | 3 profiles x 6 levels, 2 draws, plan 3 with 4 draws; lookup 1000 random budgets per profile, 8 polish budgets | `budget.baseline.proof.test.ts`: 3 x 100 levels, 64 draws, 4096 Sobol points, 10 budgets per profile (H13), 20 polish budgets (H17), runtime limit (H11) |
| `refine.e2e.test.ts` | real CLI chain `run` (4 draws) then `refine --starts 4` then `budget-table` (3 x 4 levels, 2 draws), then `report` again (the Optimisation section appears, `extra[]` survives, same bytes on a second run); fault matrix F1..F13 | `refine.e2e.proof.test.ts`: `run` 256 draws, `refine` 20 starts, `budget-table` 3 x 100 levels, 64 draws; the limits of H11; the same fault matrix |
| `refine.baseline.test.ts` | plan 3 with 8 draws, `refine --starts 4` (20 solves); H5 against the same 96 screened candidates and 4096 Sobol points | `refine.baseline.proof.test.ts`: 256 draws, default 20 starts (40 solves), runtime limit |
| `pipeline.e2e.test.ts` | three real `run`s with 4 draws (artifacts, same-seed hash, different-seed hash), debug events at 4 draws, fault matrix F1..F9 | `pipeline.e2e.proof.test.ts`: three real `run`s at 256 draws against the frozen runtime, debug events at 16 draws |
| `report.browser.test.ts` | real Chrome (headless, own instance, `channel: "chrome"`): offline load with zero failed requests and console errors, two-axis brush equals a plain filter (table and scatter matrix), clear restores all 96, dark scheme (background, Plotly paper, parcoords stroke, toggle), 390 px width without horizontal overflow, `#test` hooks absent without the fragment; about 11 s including the real 4-draw `run` the page is built from | `report.browser.proof.test.ts`: the rest of plan 00 Task 5 (axis reorder, brush survives a redraw, no-match row, scenario change keeps the selection, live equals `liveSimulate` in Bun for five input states, 200-move latency with `T_live_ms` 100, newest wins under a 50-event burst, layers off, 300-event hold, clamping, keyboard to the Limits link, print palette, debug panel); about 40 s. The suite body is `tests/suites/reportBrowser.ts`; the proof file registers every test, the fast file the subset |
| `node/budget.test.ts` | 3 x 3 table, 2 draws (one and two workers, byte-identical) | none: it was already a small table; its size was cut from 3 x 12 / 8 draws |
| `node/refine.test.ts` | one and two workers at 2 starts for the byte-equality and event tests; every mutation-killing case unchanged at 4 starts | none |

The mutation-killing cases found in earlier reviews stay in the fast tier at their original size: `activeConstraintIsSolvedNotJustRespected` (4 starts, cpvc 0.2), `delaminationCapActiveIsSolvedNotJustRespected`, `hessianEstimateIsTheFirstBracketProbe`, the lookup property of `budgetTable.test.ts`, and the lookup property on the real table (1000 random budgets per profile).

### What the proof tier alone proves

- **H13, the Sobol part.** The fast tier compares the table with the 96 screened candidates only. Against 4096 Sobol points a 3 x 12 table loses at one budget (durability_first level 3: 0.163 against 0.092): the continuation between levels needs the fine spacing of 100 levels to stay in the best basin. This is a property of the table size, so the Sobol comparison is asserted only on the 100-level table. See the report of the tiering commit.
- **H11, the runtime limits** (`T_nrt` 600 s, `T_nrt_table` 900 s, the frozen plan 03 runtime): they only mean something at full size. The fast files still assert them, but at small size they cannot fail.
- **H13 non-vacuity at 27 of 30.** The proof tier asserts at least 27 of 30 budgets have a brute-force point to beat; the fast tier asserts the same shape (every budget but the level-0 budget of each profile).

## CI

There is no CI configuration in this repository yet. When one is added:

```yaml
# .github/workflows/test.yml (suggested)
on:
  push:
  schedule: [{ cron: "0 18 * * *" }]   # nightly proof
  workflow_dispatch:
jobs:
  check:
    if: github.event_name != 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.3.14 }
      - run: bun install --frozen-lockfile
      - run: bun run check
  proof:
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.3.14 }
      - run: bun install --frozen-lockfile
      - run: bun run proof
```

## Plan 04 tests need the weather cache

The Indonesia tests read the real NASA POWER cache and the TMYx files under `data/indonesia/` (git-ignored, not redistributed, listed in the committed `data/indonesia/SHA256SUMS`). Run `bun run spandek fetch-data --indonesia` once (about 3 minutes, network); without the cache these tests fail with a preflight message that names the command, they are never skipped. The fast tier uses one site and two years with 4 draws; the proof tier (`indonesia.e2e.proof.test.ts`) the five sites, ten years and 256 draws.

## Adding a slow test

1. Write the suite body in `tests/suites/<name>.ts` taking a scale object.
2. Add `tests/<name>.test.ts` (fast scale) and `tests/<name>.proof.test.ts` (full scale), each three lines.
3. If the fast scale cannot keep a hypothesis (as with H13 above), say so in the proof file and in this document; never lower a threshold to make the small size pass.
