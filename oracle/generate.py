"""Oracle fixture generator (test-only). Shares no code with src/.

Usage: uv run --project oracle oracle/generate.py [--check]
  (no flag)  write the fixtures and SHA256SUMS
  --check    regenerate in memory and compare with the committed files
"""

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "tests" / "fixtures" / "oracle"
M32 = 0xFFFFFFFF
SEEDS = (1, 20261121, 4294967295)
N_VALUES = 1000

HARNESS = r"""
#include <stdio.h>
#include <stdlib.h>
#include "xoshiro128starstar.c"
int main(int argc, char **argv) {
    if (argc != 6) return 2;
    for (int i = 0; i < 4; i++) s[i] = (uint32_t)strtoul(argv[i + 1], 0, 10);
    long n = strtol(argv[5], 0, 10);
    for (long i = 0; i < n; i++) printf("%u\n", (unsigned)next());
    return 0;
}
"""


def splitmix32_words(seed: int) -> list[int]:
    """Stateful splitmix32 (murmur3 fmix32 finaliser), 4 words, explicit masks."""
    state = seed & M32
    words = []
    for _ in range(4):
        state = (state + 0x9E3779B9) & M32
        z = state
        z ^= z >> 16
        z = (z * 0x85EBCA6B) & M32
        z ^= z >> 13
        z = (z * 0xC2B2AE35) & M32
        z ^= z >> 16
        words.append(z & M32)
    return words


def build_reference(workdir: Path) -> Path:
    (workdir / "main.c").write_text(HARNESS)
    exe = workdir / "ref"
    subprocess.run(
        ["cc", "-O2", "-w", f"-I{HERE}", str(workdir / "main.c"), "-o", str(exe)],
        check=True,
    )
    return exe


def run_reference(exe: Path, words: list[int], n: int) -> list[int]:
    out = subprocess.run(
        [str(exe), *map(str, words), str(n)],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout.split()
    values = [int(x) for x in out]
    assert len(values) == n
    return values


def build_fixtures() -> dict[str, str]:
    with tempfile.TemporaryDirectory(prefix="spandek-oracle-") as d:
        exe = build_reference(Path(d))
        doc = [
            {"seed": seed, "first1000": run_reference(exe, splitmix32_words(seed), N_VALUES)}
            for seed in SEEDS
        ]
    return {"xoshiro.json": json.dumps(doc, separators=(",", ":")) + "\n"}


def sums_text(files: dict[str, str]) -> str:
    return "".join(
        f"{hashlib.sha256(text.encode()).hexdigest()}  {name}\n"
        for name, text in sorted(files.items())
    )


def main() -> int:
    files = build_fixtures()
    sums = sums_text(files)
    if "--check" in sys.argv[1:]:
        for name, text in files.items():
            if (FIXTURES / name).read_text() != text:
                print(f"STALE: {name} differs from regenerated oracle output")
                return 1
        if (FIXTURES / "SHA256SUMS").read_text() != sums:
            print("STALE: SHA256SUMS differs from regenerated oracle output")
            return 1
        print("oracle fixtures fresh")
        return 0
    FIXTURES.mkdir(parents=True, exist_ok=True)
    for name, text in files.items():
        (FIXTURES / name).write_text(text)
    (FIXTURES / "SHA256SUMS").write_text(sums)
    print(f"wrote {', '.join(files)} and SHA256SUMS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
