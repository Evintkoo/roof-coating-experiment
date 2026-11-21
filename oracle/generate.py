"""Oracle fixture generator (test-only). Shares no code with src/.

Usage: uv run --project oracle oracle/generate.py [--check]
  (no flag)  write the fixtures and SHA256SUMS
  --check    regenerate in memory and compare with the committed files
"""

import hashlib
import importlib.metadata
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import miepython
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
        "mie.json": json.dumps(mie_fixture(), separators=(",", ":")) + "\n",
        "solgel.json": json.dumps(solgel_fixture(), separators=(",", ":")) + "\n",
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


# ---- Mie oracle: miepython 3.3.1, plan 02 Task 4 (H4) ---------------------------------------------
MIE_SEED = 20261121
MIE_CASES = 60
MIE_N = (1.3, 1.5, 1.64, 2.0, 2.7)
MIE_K = (0.0, 1e-3, 0.05, 0.5)
MIE_D_UM = (0.05, 0.25, 0.8, 2.0, 10.0)
MIE_WL_UM = (0.3, 0.55, 1.0, 1.6, 2.5)
MIE_NMED = (1.0, 1.49)
MIE_FORCED = (  # (n, k, d, n_medium): guarantee x = 105 (n_medium 1) and x = 156 (1.49)
    (1.5, 0.0, 10.0, 1.0),
    (2.7, 0.05, 10.0, 1.0),
    (1.64, 1e-3, 10.0, 1.49),
    (2.0, 0.5, 10.0, 1.49),
)


def mie_fixture() -> dict:
    """Each case: one (n, k, d, n_medium) and 5 wavelengths. miepython takes m = n - ik (its convention)."""
    grid = [
        (n, k, d, nm) for n in MIE_N for k in MIE_K for d in MIE_D_UM for nm in MIE_NMED
    ]
    rng = SplitMix64(MIE_SEED)
    pool = [c for c in grid if c not in MIE_FORCED]
    for i in range(len(pool) - 1, 0, -1):  # Fisher-Yates with the own splitmix64
        j = int(rng.uniform() * (i + 1))
        pool[i], pool[j] = pool[j], pool[i]
    chosen = list(MIE_FORCED) + pool[: MIE_CASES - len(MIE_FORCED)]
    cases = []
    for n, k, d, nm in chosen:
        q_ext, q_sca, g = [], [], []
        for wl in MIE_WL_UM:
            qe, qs, _qb, gg = miepython.efficiencies(complex(n, -k), d, wl, nm)
            q_ext.append(float(qe))
            q_sca.append(float(qs))
            g.append(float(gg))
        cases.append(
            {
                "n": n,
                "k": k,
                "d_um": d,
                "n_medium": nm,
                "wl_um": list(MIE_WL_UM),
                "q_ext": q_ext,
                "q_sca": q_sca,
                "q_abs": [e - s for e, s in zip(q_ext, q_sca)],
                "g": g,
            }
        )
    return {
        "seed": MIE_SEED,
        "miepython": importlib.metadata.version("miepython"),
        "convention": "miepython m = n - ik; d is the sphere diameter; x = pi*d*n_medium/wl",
        "cases": cases,
    }


# ---- sol-gel oracle: ODE integration, plan 02 Task 6 (H8) -------------------------------------------
SOLGEL_SEED = 20261121
SOLGEL_CASES = 20
SOLGEL_T_END = 2.592e6


def sol_ode(k_h: float, k_c: float, cap: float, p_c: float, t_end: float, t_eval: float):
    """Integrate dh/dt = k_h(1-h) until h = cap (then h is frozen), dc/dt = k_c h (1-c).

    Returns (h, c at t_eval, gel time by event detection or None). p = c h gels at p >= p_c.
    """
    opts = dict(method="DOP853", rtol=1e-11, atol=1e-14, dense_output=True)

    def rhs1(_t, y):
        return [k_h * (1.0 - y[0]), k_c * y[0] * (1.0 - y[1])]

    def hit_cap(_t, y):
        return y[0] - cap

    def hit_gel(_t, y):
        return y[0] * y[1] - p_c

    hit_cap.terminal = hit_gel.terminal = True
    hit_cap.direction = hit_gel.direction = 1
    # when does h reach the cap? (h alone, independent of the gel event which may stop phase 1 early)
    s0 = solve_ivp(lambda _t, y: [k_h * (1.0 - y[0])], (0.0, t_end), [0.0], events=[hit_cap], **opts)
    assert s0.success
    capped = len(s0.t_events[0]) > 0
    t_cap = float(s0.t_events[0][0]) if capped else t_end
    s1 = solve_ivp(rhs1, (0.0, t_cap), [0.0, 0.0], events=[hit_gel], **opts)
    assert s1.success
    gel = float(s1.t_events[0][0]) if len(s1.t_events[0]) else None
    if capped and gel is None:
        c_cap = float(s1.y[1, -1])

        def rhs2(_t, y):
            return [k_c * cap * (1.0 - y[0])]

        def gel2(_t, y):
            return cap * y[0] - p_c

        gel2.terminal = True
        gel2.direction = 1
        sol2 = solve_ivp(rhs2, (t_cap, t_end), [c_cap], events=[gel2], **opts)
        assert sol2.success
        if len(sol2.t_events[0]):
            gel = float(sol2.t_events[0][0])
    # state at t_eval (independent integration, no events)
    def at(t: float):
        if t <= t_cap:
            y = solve_ivp(rhs1, (0.0, max(t, 1e-300)), [0.0, 0.0], **opts).y[:, -1]
            return float(y[0]), float(y[1])
        y1 = solve_ivp(rhs1, (0.0, t_cap), [0.0, 0.0], **opts).y[:, -1]
        y2 = solve_ivp(
            lambda _t, y: [k_c * cap * (1.0 - y[0])], (t_cap, t), [float(y1[1])], **opts
        ).y[:, -1]
        return cap, float(y2[0])

    h, c = at(t_eval)
    return h, c, gel


def solgel_fixture() -> dict:
    rng = SplitMix64(SOLGEL_SEED)
    p_c_of = lambda x: 1.0 / ((16 * (1 - x) + 9 * x) / (4 * (1 - x) + 3 * x) - 1.0)
    cases = []
    for _ in range(SOLGEL_CASES):
        ph = 3.5 + 1.5 * rng.uniform()
        water = 0.3 + 4.7 * rng.uniform()
        x = 0.2 + 0.6 * rng.uniform()
        k_h_coeff = 10 ** (math.log10(0.03) + (math.log10(6.0) - math.log10(0.03)) * rng.uniform())
        k_c = 10 ** (-6.0 + 2.5 * rng.uniform())
        t_s = SOLGEL_T_END * rng.uniform()
        k_h = k_h_coeff * 10.0 ** (-ph)
        cap = min(1.0, water)
        h, c, gel = sol_ode(k_h, k_c, cap, p_c_of(x), SOLGEL_T_END, t_s)
        cases.append(
            {
                "ph": ph, "waterRatio": water, "x": x, "kHCoeff": k_h_coeff, "kC": k_c,
                "tEndS": SOLGEL_T_END, "tS": t_s, "kH": k_h, "h": h, "c": c,
                "gel_time_s": gel,  # null = no gel inside the window
            }
        )
    return {
        "seed": SOLGEL_SEED,
        "scipy": __import__("scipy").__version__,
        "method": "DOP853 rtol=1e-11, h capped at min(1, r_w) by event, gel by event p=c*h=p_c; null = never gels",
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
