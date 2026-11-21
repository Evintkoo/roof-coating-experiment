# Plan 01 proof log

## Task 1: scaffold

- Pinned versions installed as listed in the plan (zod 4.6.7, yaml 2.9.1, typescript 7.0.2, fast-check 4.10.3, biome 2.6.8, @types/bun 1.3.14, playwright 1.65.1, plotly.js-dist-min 4.3.0); Bun 1.3.14.
- `bun run check` green: biome, `tsc --noEmit`, 3 tests pass.
- Layout guard shown able to fail: a temporary `src/x.ts` without a mirror and a temporary orphan test each produced a failure; both removed.

### Deviations from plan text

- `biome.json` gained a `files.includes` entry excluding markdown, docx, `plans/`, `.superpowers/` and `bun.lock`. Biome 2.6.8 formats `.md` files by default, and `biome check --write .` rewrote the plan and blueprint markdown; those changes were reverted.
- The worker fixture is `tests/fixtures/echo.worker.ts`; with `lib: ["DOM"]` it casts `self` to `Worker` (a `declare const self` clashes with the DOM `self`).
- `tsconfig.json` additionally sets `target ES2023`, `module ESNext`, `moduleResolution bundler`, `noEmit`, `skipLibCheck`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `include: [src, tests]`.
- The guard maps `src/<p>.ts` to `tests/<p>.test.ts`; `layout.guard.test.ts` and `library.smoke.test.ts` are the only non-mirror tests.

## Task 7: constraint check

- Default design (seed 20261121, 96 candidates, cpvc 0.45, cap 332 um): **96 of 96 feasible** (required at least 77). With the shipped ranges C-1 cannot bind (`midcoat_pvc` max 0.35 < 0.45) and topcoat DFT never exceeds midcoat DFT.
- F4 at unit level: cpvc = 0.12 leaves **7 of 96** feasible (< 77), so `requireMinFeasible` throws `InfeasibleError` (code 3) and emits `constraint.infeasible_run`. (The plan text estimated about 8; the exact count for this seed is 7.)
- H3: `independentRecheck` re-derives C-1..C-3 from raw columns without calling `checkConstraints`, for cpvc 0.45 and 0.2.
- Red run observed first (missing export `requireMinFeasible`), then green.

## Task 8: CLI `design`, engine check, fault matrix

Runs (real CLI, `--max-load 1000`, logs in `<reports>/<run_id>/run.jsonl`; elapsed 32-35 ms per run):

| Run id | Command | Observable |
|---|---|---|
| 20261121T084453480-969fb803 | design seed 20261121 | exit 0, feasible 96 of 96, candidates sha256 `8a3448f2...bc40a` |
| 20261121T084453596-7ccf302c | same again | same sha256 (H1 holds) |
| 20261121T084453709-e794cdb1 | design seed 7 | sha256 `01e17a67...8202` differs (H1 not trivially true) |
| 20261121T084453883-4dfdf6e4 | F4 (`cpvc` 0.12) | exit 3, one `constraint.infeasible_run {feasible 7, required 77}`, `error.raised {code 3, phase design}` |

- **H1** reproducible: runs 1-2 identical, run 3 differs; test `sameSeedSameBytesDifferentSeedDiffers`.
- **H2, H3, H4, H5, H7**: proved by their own unit tests (Tasks 3-7); unchanged and green in the full run (108 tests).
- **H6**: `faultF1`..`faultF7`, `unknownFlagAndMissingSeedAreConfigErrors`, `maxLoadGuardRefusesWhenMachineBusy` assert exit code, `error.raised` phase (and key where named), only `code/phase/key` fields, no stack trace on stderr. F1/F2/F3/F5/F7 exit 2 (config), F4 exit 3 (design), F6 exit 5 (data).
- **H8** engine independence: `tests/fixtures/engineDesign.ts` under `bun run` and, bundled with `bun build --target=node`, under Node 22.21.1 print identical lines: candidates `8a3448f282655902ff1b5d0354e080cd97d2fc566791ead64c43b7596b1bc40a`, weather `d90b2d8e055b139e70e66a9372054268779376fa157ba4fbda1d8ff0ecef33b6`; both equal sha256 of the CLI's files.
- **H9** `coreBuildsForBrowser`: `Bun.build` target browser of `src/core/design.ts` succeeds; import/global scan is `noNodeImportsInCore` (Task 3).
- G1: 96 rows `SP-001..SP-096`, 9 weather rows. G2: F4 run above. T-DOE-2: the frozen hash `b208d20c...64d6f8` equals the sha256 of the CLI's candidates re-serialised on the seven design columns (the CLI file adds `feasible`, `violations`, so its raw hash is the different `8a3448f2...`).

### Mutation checks (copies in the scratchpad; the worktree was never mutated)

| Mutant | Result | Failing tests |
|---|---|---|
| M1 LHS jitter `(perm + r)/n * 1.001` (applied to the shipped `perm + 0.001 + 0.998 r`) | killed | stratifiedOnEveryColumn, allInsideRanges, jitterStaysInsideStratum, lhsUnitIsStratifiedAndOpen, candidatesCsvMatchesFrozenHash |
| M2 drop `.min(1)` on all three `source` fields | killed | emptySourceRejected |
| M2 per field: Sourced (line 9), levels (line 44) | killed | emptySourceRejected |
| M2 per field: RangeSchema (line 18) | **survived** | none; test strengthened (a range-shaped entry with empty source) and the mutant is now killed by emptySourceRejected |
| M3 L9 row 5 `[1,1,2]` to `[1,1,1]` | killed | pairwiseBalance |
| M4 `*` for `Math.imul` in `nextU32` only | survived, **equivalent**: products stay below 2^53 so `>>> 0` gives the same bits; not a weak test | none |
| M4 `*` for `Math.imul` in the seed expansion (fmix32, deriveSeed) | killed | matchesCReferenceBitExact, candidatesCsvMatchesFrozenHash (and faultF4 when applied everywhere) |
| M5 `safeJson` = plain `JSON.stringify` | killed | safeJsonThrowsOnNaNAndInfinityNested, safeJsonWrapsNonSerialisableAsDataError |

### Deviations

- `src/node/logging.ts` wrote `events.jsonl`; renamed to `run.jsonl` (plan text) in logging and its two tests, and gained an opt-in `mirrorStderr` so the CLI writes JSON lines to both stderr and the file as the plan says.
- Log dir is `$SPANDEK_REPORTS_DIR` (default `reports`) `/<run_id>/run.jsonl`; tests point it at a temp dir.
- `design.generated` is emitted by the CLI (plan names core/design as emitter, but only the CLI knows feasible counts).
- `--max-load`: plan 01 defines no guard; implemented as 1-minute load average above the value gives ResourceError (exit 6); no default guard.
- `--n` must equal 96 (F5); the plan has no config key for the required count.
