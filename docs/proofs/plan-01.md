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
