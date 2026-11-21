"""Oracle fixture generator (test-only). Shares no code with src/.

Usage: uv run --project oracle oracle/generate.py [--check]
  (no flag)  write the fixtures and SHA256SUMS
  --check    regenerate in memory and compare with the committed files
"""

import hashlib
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp

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
    return {
        "xoshiro.json": json.dumps(doc, separators=(",", ":")) + "\n",
        "thermal.json": json.dumps(thermal_fixture(), separators=(",", ":")) + "\n",
    }


# ---- thermal oracle: single-node roof heat balance (blueprint 4.3), plan 02 D1 -------------------
SIGMA = 5.670374419e-8
H = 3600.0
THERMAL_SEED = 20261121
THERMAL_CASES = 200
THERMAL_SERIES_CASES = 20
M64 = 0xFFFFFFFFFFFFFFFF
RANGES = (  # name, lo, hi (plan 02 Task 3)
    ("r_solar", 0.1, 0.9),
    ("emissivity", 0.1, 0.95),
    ("g_peak_w_m2", 600.0, 1000.0),
    ("t_air_k", 301.15, 309.15),
    ("h_conv_w_m2k", 9.5, 28.5),
    ("r_total_m2k_w", 0.1, 0.6),
    ("c_a_j_m2k", 1.5e3, 2.5e3),
)


class SplitMix64:
    """Own generator for the parameter draws (not numpy's RNG, not the TypeScript xoshiro)."""

    def __init__(self, seed: int) -> None:
        self.state = seed & M64

    def next_u64(self) -> int:
        self.state = (self.state + 0x9E3779B97F4A7C15) & M64
        z = self.state
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M64
        return z ^ (z >> 31)

    def uniform(self) -> float:
        return (self.next_u64() >> 11) / float(1 << 53)


def draw_thermal_params(rng: SplitMix64) -> dict[str, float]:
    p = {name: lo + (hi - lo) * rng.uniform() for name, lo, hi in RANGES}
    p["t_sky_k"] = 0.0552 * p["t_air_k"] ** 1.5  # Swinbank, passed explicitly like plan 1
    p["t_inside_k"] = 298.0 + 10.0 * rng.uniform()  # independent of t_air_k, 298-308 K
    return p


def solve_two_days(p: dict[str, float]):
    """DOP853 rtol = atol = 1e-11, segment by segment between the irradiance kinks."""
    alpha = 1.0 - p["r_solar"]

    def g(t: float) -> float:
        return p["g_peak_w_m2"] * math.sin(math.pi * (t - 6 * H) / (12 * H))

    def rhs(t: float, y, forced: bool) -> list[float]:
        T = y[0]
        flux = (
            (alpha * g(t) if forced else 0.0)
            - p["emissivity"] * SIGMA * (T**4 - p["t_sky_k"] ** 4)
            - p["h_conv_w_m2k"] * (T - p["t_air_k"])
            - (T - p["t_inside_k"]) / p["r_total_m2k_w"]
        )
        return [flux / p["c_a_j_m2k"]]

    bounds = [0.0, 6 * H, 18 * H, 30 * H, 42 * H, 48 * H]
    forced = [False, True, False, True, False]  # day-1/day-2 night, day, night, day, night
    y = [p["t_air_k"]]
    sols = []
    for (a, b), f in zip(zip(bounds, bounds[1:]), forced):
        sol = solve_ivp(
            rhs, (a, b), y, method="DOP853", rtol=1e-11, atol=1e-11, dense_output=True, args=(f,)
        )
        assert sol.success
        sols.append((a, b, sol.sol))
        y = [float(sol.y[0, -1])]

    def temp(t: float) -> float:
        for a, b, s in sols:
            if a <= t <= b:
                return float(s(t)[0])
        raise ValueError(t)

    return temp


def thermal_fixture() -> dict:
    rng = SplitMix64(THERMAL_SEED)
    cases = []
    for i in range(THERMAL_CASES):
        p = draw_thermal_params(rng)
        temp = solve_two_days(p)
        nodes = [temp(24 * H + 60.0 * k) for k in range(1440)]  # day-2 step nodes, dt = 60 s
        case = {
            "inputs": p,
            "t_max_c": max(nodes) - 273.15,
            "q_in_mean_w_m2": float(
                np.mean([(t - p["t_inside_k"]) / p["r_total_m2k_w"] for t in nodes])
            ),
        }
        if i < THERMAL_SERIES_CASES:
            case["t_surface_k"] = nodes[::10]
        cases.append(case)
    return {
        "seed": THERMAL_SEED,
        "scipy": __import__("scipy").__version__,
        "method": "DOP853 rtol=atol=1e-11, segmented at 06:00/18:00/30:00/42:00",
        "cases": cases,
    }


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
