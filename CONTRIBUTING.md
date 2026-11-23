# Contributing

## Setup

1. Install Bun 1.3.14 or newer and Chrome.
2. `bun install`
3. `bun run check` should pass on a clean checkout before you change anything. It takes about 3 to 4 minutes on a quiet machine.
   For the Python oracle (only needed to regenerate test fixtures): `uv run --project oracle oracle/generate.py --check`.

## Workflow

- Branch from `main`: `feat/<topic>`, `fix/<topic>` or `docs/<topic>`.
- Write the failing test first, then the code. Bug fixes need a regression test that fails without the fix.
- New features follow the plan format in `plans/01-digital/`: hypotheses with named thresholds, a fault-injection matrix,
  test-first tasks. Open an issue or a draft plan before large work.
- Commit with conventional messages (`feat(report): ...`, `fix(cli): ...`, `test: ...`, `docs: ...`).
- Run `bun run check` before opening a pull request, in the foreground. Browser tests are load sensitive; if one fails on
  a hook or navigation timeout, re-run that file alone and say so in the pull request.
- Do not edit `vendor/`, and do not change a frozen threshold to make a test pass.

## Pull requests

Use the template. State what changed, which hypothesis or fault it proves or fixes, the output of `bun run check`, and anything not run.
A change to wording shown in the report must keep the honesty rules in `AGENTS.md`.

## Reporting problems

Bugs: open an issue with the command, its exit code and the `run.jsonl` events (they carry no file contents). Security issues: see `SECURITY.md`.

## Licence

The code is PolyForm Strict 1.0.0 (see `LICENSE`). Outside contributions to the code need the owner's written agreement, because the licence grants no right to make or share changes. Open an issue first.
