# Spandek: digital part of the roof-coating experiment

A three-layer coating on bare aluminium roofing for the Indonesian climate: a sol-gel primer, a TiO2/BaSO4 reflective midcoat and
a silica hydrophobic topcoat. This repository is the computational half of the experiment: physical models, a Monte-Carlo
simulation, multi-objective optimisation, Indonesian climate runs, and a single-file offline report with a live simulator.

**Everything here is a model, not a measurement.** The models are uncalibrated until coupon tests exist (see
[`docs/BLOCKED.md`](docs/BLOCKED.md), BLOCKED-1). Corrosion and delamination are proxies. Costs are relative cost units, not IDR.
Intervals reflect parameter uncertainty only. The report says so in the places it shows numbers.

## Quick start

Requires [Bun](https://bun.sh) 1.3.14 or newer and a Chrome install (the browser tests drive it through Playwright).

```sh
bun install
bun run spandek run --seed 1 --out reports/run-1     # design, simulate, optimise (256 Monte-Carlo draws by default)
bun run spandek sensitivity --in reports/run-1
bun run spandek report --in reports/run-1            # writes reports/run-1/report.html (one offline file)
```

Open `report.html` in any browser. No server and no network are needed.

| Command | Purpose |
|---|---|
| `design`, `simulate`, `optimize`, `sensitivity` | the pipeline stages (`run` chains them) |
| `refine`, `budget-table`, `budget` | derivative-based optimisation, the budget table, and a budget lookup |
| `fetch-data`, `indonesia` | NASA POWER hourly data for five sites, ten years, and the climate runs |
| `report`, `verify-report`, `design-gallery` | the offline report, its staleness check, the component gallery |

Every command documents itself: `bun run spandek <command> --help`. Exit codes are part of the contract (2 input refused,
4 model out of range, 5 missing or tampered input, 6 time or resource limit).

## Repository map

| Path | What |
|---|---|
| `src/core/` | pure code: models, optimisation, pipeline, report content, animation timeline. No I/O, no clock, no `window`. |
| `src/node/` | I/O: the CLI, config and data loading, report assembly. |
| `src/web/` | browser code shipped inside the report: live simulator, worker pool, design system, animation. |
| `configs/` | every constant the models use, in YAML, with provenance. |
| `data/literature/` | committed reference data (ASTM G173, TiO2 optical constants), hash-checked. |
| `oracle/` | independent Python reference implementations used only to generate test fixtures. |
| `plans/01-digital/` | the numbered plans (00 to 09): hypotheses, proofs, fault matrices, decisions. Start here to know why. |
| `docs/` | `testing.md` (tiers and timings), `BLOCKED.md` (what cannot be done digitally), `design/`, `proofs/`, `qa/`, `spikes/`. |
| `vendor/` | read-only copy of the Torviello design tokens and atoms. Never edited in place, see `vendor/VENDORED.md`. |

## Checks

```sh
bun run check   # biome, tsc, and every fast test; about 3 to 4 minutes on a quiet machine
bun run proof   # the long proof tier (real runs at full size); run on a quiet machine, see docs/testing.md
bun run qa reports/run-1/report.html   # drive every control of a built report in Chrome
```

The test suite uses no mocks: tests call the real CLI, real Chrome and real worker threads. Several browser tests are
sensitive to machine load; [`docs/testing.md`](docs/testing.md) says which and how to read a failure.

## Status

Plans 00 to 09 are built (lean mode where noted in their proof logs). Open work and the reasons it is open are in
[`docs/BLOCKED.md`](docs/BLOCKED.md): lab calibration, an Indonesian-language edition, a reviewed brand light theme,
Indonesian prices, and measured reflectance of mill-finish aluminium.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Agents working in this repository must also read [`AGENTS.md`](AGENTS.md).
Licence: [Spandek Source-Available License 1.0](LICENSE.md). Anyone may read and run the unmodified code for noncommercial purposes (personal study, research, education, nonprofits); modifying it, sharing it (including built reports) and any commercial use need the owner's written permission. This is source-available, not open source. What is and is not allowed, in plain terms: [`LICENSING.md`](LICENSING.md). Third-party material keeps its own terms, see [`NOTICE`](NOTICE).
