# AGENTS.md

Instructions for AI coding agents (and a quick orientation for humans). `CLAUDE.md` points here. Read this file first, then the
plan that covers the area you change (`plans/01-digital/`).

## What this repository is

The digital half of a roof-coating experiment: models, simulation, optimisation and a single-file offline HTML report. Read
`README.md` for the map. The report's honesty rules are part of the product, see "Hard rules".

## Commands

```sh
bun install
bun run check                  # biome + tsc + fast tests (the gate); foreground only
bun test path/to/file.test.ts  # one file, while iterating
bun run proof                  # long proof tier; quiet machine only
bun run qa <report.html>       # browser QA script against a built report
bun run spandek <command> --help
```

Bun is the runtime and test runner (>= 1.3.14), TypeScript is strict, Biome formats and lints. There is no Node build step.

## Layout rules (enforced by tests)

- `src/core` is pure: no `node:*`, `Bun`, `process`, `window`, `document` or `fetch`. I/O lives in `src/node`, browser glue in `src/web`.
- One source file has one mirrored test file under `tests/` (`tests/layout.guard.test.ts` checks it). A new cross-cutting test must be
  registered there.
- `vendor/` is read-only input. Never edit it; changes come from re-vendoring, recorded in `vendor/VENDORED.md`.
- Every constant a model uses lives in `configs/*.yaml` with its source. No magic numbers in code.

## Hard rules

1. **Work test-first.** Write the failing test, see it fail, implement, see it pass. A check that cannot fail proves nothing.
2. **No mocks, no skips.** No `test.skip`, `xfail`, stubs or in-memory fakes of services; use the real CLI, real Chrome, real workers.
   A test that cannot pass is a finding to report, not something to disable.
3. **Frozen thresholds stay frozen.** Named thresholds (`T_*` in the plans: for example `T_page_px` 9000, `T_size_mib` 8,
   `T_live_ms` 100, `T_js_kib`) are measured once and written into the plan. Never edit one to make a test pass. A change needs the
   owner's decision, written into a plan amendment with the reason.
4. **Honest wording.** Everything shown is a model output, not a measurement. Corrosion and delamination are labelled proxies,
   cost is "relative cost units (not IDR)", intervals say "parameter uncertainty only", and the words "recommended", "best" and
   "proven" are not used for model outputs. Every animated or live value must trace to a model output (`data-source`).
5. **No invented physics.** If the model has no through-thickness temperature field or per-layer absorption, the page does not draw
   one as if it did. Illustrations are labelled "Illustrative scale".
6. **Exit codes and logs are contract.** Failures use the documented exit codes. Production logs are info only; each event has a
   test. Never log raw errors, file contents or user paths.
7. **Plans come first for new features.** Follow the plan format used in `plans/01-digital/` (hypotheses, fault-injection matrix,
   preflight, tasks with exact commits). Small fixes and bug fixes need no plan, but need a regression test.

## Working on a shared machine

- Browser and e2e tests are load sensitive. Check `uptime`; the CLI itself refuses to start above half the core count in load.
- Run `bun run check` in the foreground, once, at the end of a task. Iterate with single files.
- If a browser test fails with "Target page, context or browser has been closed" or a hook timeout, re-run that file alone before
  treating it as a regression, and report both results. Do not raise a timeout or threshold to make it green.
- Never kill processes you did not start. Never run tests that spawn the CLI from a detached background job.

## Git

- Conventional commits (`feat(scope):`, `fix(scope):`, `test:`, `docs:`, `chore:`), one logical change per commit, the plan's exact
  message when a plan names one.
- Work on a branch, not on `main`. Worktrees live only under `.claude/worktrees/<name>` and are removed when the task ends.
- Do not push, force-push, merge or delete branches without the owner's go-ahead.
- The code is under the Spandek Source-Available License 1.0 (`LICENSE`, `NOTICE`): do not add dependencies, copied code or data whose terms conflict, and list any new third-party material in `NOTICE`. Do not change the licence.
- Do not commit `reports/`, `data/indonesia/raw`, `data/indonesia/tmyx`, secrets, or `.env` files.

## Where to look

| Question | File |
|---|---|
| Why is it built this way? | `plans/01-digital/NN-*.md` (hypotheses, decisions, faults) |
| What was proven and how? | `docs/proofs/plan-NN.md` |
| What is known broken or blocked? | `docs/BLOCKED.md`, `docs/qa/bugs.md`, `docs/qa/triage.md` |
| How do the tests behave under load? | `docs/testing.md` |
| What does a component look like? | `docs/design/report-sheets.md`, `bun run spandek design-gallery --out gallery.html` |
| How are light and dark themes mapped? | `docs/design/theme-mapping.md` (generated from `src/web/design/themeMapping.ts`) |
