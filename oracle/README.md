# Oracle (test-only)

Independent reference implementations used to generate frozen fixtures in
`tests/fixtures/oracle/`. Nothing here ships and nothing here shares code with `src/`.

- Python 3.12 via uv: `uv run --project oracle oracle/generate.py` writes fixtures and `SHA256SUMS`;
  add `--check` to regenerate in memory and compare (the `oracleFixturesAreFresh` test does this).
- `xoshiro128starstar.c` and `f2x.c` are the public-domain reference sources fetched verbatim from
  https://prng.di.unimi.it/ (the former `#include`s the latter). `generate.py` compiles them with the
  system `cc` in a temp dir together with a tiny `main` and runs the result on the four state words
  produced by a pure-Python splitmix32 (plan decision D10).
- Fixtures are generated once and frozen; later plans append more fixtures to the same script.
