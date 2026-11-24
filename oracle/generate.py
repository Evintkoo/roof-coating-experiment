"""Oracle fixture generator (test-only). Shares no code with src/.

Usage: uv run --project oracle oracle/generate.py [--check | --out DIR]
  (no flag)  write the fixtures and SHA256SUMS
  --check    regenerate in memory and compare byte for byte with the committed files (reference platform only)
  --out DIR  regenerate into DIR (tests/oracle.fixtures.test.ts compares numerically, see tests/support/oracleCompare.ts)
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
import mpmath
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
        "thermalSeries.json": json.dumps(thermal_series_fixture(), separators=(",", ":")) + "\n",
        "thermalSeriesReal.json": json.dumps(thermal_series_real_fixture(), separators=(",", ":")) + "\n",
        "mie.json": json.dumps(mie_fixture(), separators=(",", ":")) + "\n",
        "solgel.json": json.dumps(solgel_fixture(), separators=(",", ":")) + "\n",
        "sobol.json": json.dumps(sobol_fixture(), separators=(",", ":")) + "\n",
        "gradient.json": json.dumps(gradient_fixture(), separators=(",", ":")) + "\n",
        "benchmarks.json": json.dumps(gradient_benchmarks(), separators=(",", ":")) + "\n",
        "optimisation.json": json.dumps(optimisation_fixture(), separators=(",", ":")) + "\n",
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


# ---- hourly-driven thermal oracle: plan 04 Task 3 (H4) ---------------------------------------------
SERIES_SEED = 20261122
SERIES_DAYS = 20
SERIES_H_A = 5.7  # McAdams h = a + b V (plan 01 D3)
SERIES_H_B = 3.8


def draw_series_day(rng: SplitMix64) -> dict:
    """One physically plausible tropical day: 24 hourly points, a cloud factor per hour (own splitmix64)."""
    peak = 650.0 + 450.0 * rng.uniform()
    t_mean = 25.0 + 6.0 * rng.uniform()
    t_amp = 2.5 + 2.5 * rng.uniform()
    wind_base = 0.3 + 3.0 * rng.uniform()
    lw_base = 380.0 + 50.0 * rng.uniform()
    g, t_air, rh, wind, lw = [], [], [], [], []
    for h in range(24):
        cloud = 0.15 + 0.85 * rng.uniform()
        g.append(peak * max(0.0, math.sin(math.pi * (h - 6) / 12)) * cloud)
        t_air.append(t_mean + t_amp * math.sin(math.pi * (h - 9) / 12) + 0.8 * (rng.uniform() - 0.5))
        rh.append(55.0 + 40.0 * rng.uniform())
        wind.append(max(0.0, wind_base + 2.0 * (rng.uniform() - 0.5)))
        lw.append(lw_base + 20.0 * (rng.uniform() - 0.5))
    params = {
        "r_solar": 0.1 + 0.8 * rng.uniform(),
        "emissivity": 0.1 + 0.85 * rng.uniform(),
        "t_inside_k": 298.0 + 10.0 * rng.uniform(),
        "r_total_m2k_w": 0.1 + 0.5 * rng.uniform(),
        "c_a_j_m2k": 1.5e3 + 1.0e3 * rng.uniform(),
    }
    return {
        "params": params,
        "series": {"g_w_m2": g, "t_air_c": t_air, "rh_pct": rh, "wind_m_s": wind, "lw_down_w_m2": lw},
    }


def solve_series_two_days(day: dict):
    """DOP853 rtol = atol = 1e-11, one segment per hour of the 48 h (hourly inputs are piecewise linear, so every
    kink is a segment boundary). Interpolated inputs: G, T_air, wind, and T_sky = (LW/sigma)^(1/4) from the hourly LW."""
    p, s = day["params"], day["series"]
    t_sky = [(lw / SIGMA) ** 0.25 for lw in s["lw_down_w_m2"]]
    t_air_k = [t + 273.15 for t in s["t_air_c"]]
    alpha = 1.0 - p["r_solar"]

    def lerp(a: list[float], seg: int, t: float) -> float:
        i, j = seg % 24, (seg + 1) % 24
        f = (t - seg * H) / H
        return a[i] + (a[j] - a[i]) * f

    def rhs(t: float, y, seg: int) -> list[float]:
        T = y[0]
        wind = lerp(s["wind_m_s"], seg, t)
        flux = (
            alpha * lerp(s["g_w_m2"], seg, t)
            - p["emissivity"] * SIGMA * (T**4 - lerp(t_sky, seg, t) ** 4)
            - (SERIES_H_A + SERIES_H_B * wind) * (T - lerp(t_air_k, seg, t))
            - (T - p["t_inside_k"]) / p["r_total_m2k_w"]
        )
        return [flux / p["c_a_j_m2k"]]

    y = [t_air_k[0]]
    sols = []
    for seg in range(48):
        sol = solve_ivp(
            rhs, (seg * H, (seg + 1) * H), y, method="DOP853", rtol=1e-11, atol=1e-11,
            dense_output=True, args=(seg,),
        )
        assert sol.success
        sols.append(sol.sol)
        y = [float(sol.y[0, -1])]
    return lambda t: float(sols[min(int(t // H), 47)](t)[0])


def thermal_series_fixture() -> dict:
    rng = SplitMix64(SERIES_SEED)
    cases = []
    for _ in range(SERIES_DAYS):
        day = draw_series_day(rng)
        temp = solve_series_two_days(day)
        nodes = [temp(24 * H + 60.0 * k) for k in range(1440)]  # day-2 step nodes, dt = 60 s
        p = day["params"]
        cases.append(
            {
                **day,
                "t_max_c": max(nodes) - 273.15,
                "q_in_mean_w_m2": float(np.mean([(t - p["t_inside_k"]) / p["r_total_m2k_w"] for t in nodes])),
                "t_surface_k": nodes[::10],
            }
        )
    return {
        "seed": SERIES_SEED,
        "scipy": __import__("scipy").__version__,
        "method": "DOP853 rtol=atol=1e-11, one segment per hour; linear interpolation of G, T_air, wind and T_sky",
        "h_a": SERIES_H_A,
        "h_b": SERIES_H_B,
        "cases": cases,
    }


# ---- plan 04 Task 5 (H4 on real data): the first 20 representative days of the real NASA POWER cache ----
REAL_SEED = 20261123
REAL_INPUT = HERE / "real_days_input.json"  # frozen export, made once by oracle/exportRealDays.ts


def thermal_series_real_fixture() -> dict:
    """Real hourly days (committed input, not the weather cache) with seeded stack parameters, solved with the same
    scipy DOP853 solver as thermalSeries.json (one segment per hour)."""
    src = json.loads(REAL_INPUT.read_text())
    rng = SplitMix64(REAL_SEED)
    cases = []
    for d in src["days"]:
        params = {
            "r_solar": 0.1 + 0.8 * rng.uniform(),
            "emissivity": 0.1 + 0.85 * rng.uniform(),
            "t_inside_k": 298.0 + 10.0 * rng.uniform(),
            "r_total_m2k_w": 0.1 + 0.5 * rng.uniform(),
            "c_a_j_m2k": 1.5e3 + 1.0e3 * rng.uniform(),
        }
        day = {"params": params, "series": d["series"]}
        temp = solve_series_two_days(day)
        nodes = [temp(24 * H + 60.0 * k) for k in range(1440)]
        cases.append(
            {
                "site": d["site"],
                "season": d["season"],
                "bin": d["bin"],
                "date": d["date"],
                **day,
                "t_max_c": max(nodes) - 273.15,
                "q_in_mean_w_m2": float(np.mean([(t - params["t_inside_k"]) / params["r_total_m2k_w"] for t in nodes])),
                "t_surface_k": nodes[::10],
            }
        )
    return {
        "seed": REAL_SEED,
        "scipy": __import__("scipy").__version__,
        "source": src["source"],
        "method": "DOP853 rtol=atol=1e-11, one segment per hour; linear interpolation of G, T_air, wind and T_sky",
        "h_a": SERIES_H_A,
        "h_b": SERIES_H_B,
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
MIE_LOWX_ABSORBING = (2.7, 0.5, 0.02, 1.49)  # appended after the seeded cases: strongly absorbing, |m| x < 0.1 at 2.5 um
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
    chosen = list(MIE_FORCED) + pool[: MIE_CASES - len(MIE_FORCED)] + [MIE_LOWX_ABSORBING]
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
    return h, c, gel, (t_cap if capped else None)


def solgel_fixture() -> dict:
    rng = SplitMix64(SOLGEL_SEED)
    p_c_of = lambda x: 1.0 / ((16 * (1 - x) + 9 * x) / (4 * (1 - x) + 3 * x) - 1.0)
    cases = []
    # kinds: free (9), cap < 1 with gel strictly after t* (8), never gels (3); rejection sampling
    kinds = ["free"] * 9 + ["cap_after"] * 8 + ["never"] * 3
    for kind in kinds:
        while True:
            ph = 3.5 + 1.5 * rng.uniform()
            water = 0.3 + 4.7 * rng.uniform()
            x = 0.2 + 0.6 * rng.uniform()
            k_h_coeff = 10 ** (math.log10(0.03) + (math.log10(6.0) - math.log10(0.03)) * rng.uniform())
            k_c = 10 ** (-6.0 + 2.5 * rng.uniform())
            t_s = SOLGEL_T_END * rng.uniform()
            if kind == "cap_after":
                water = 0.3 + 0.65 * rng.uniform()
            if kind == "never":
                k_c = 10 ** (-9.0 + rng.uniform())
            k_h = k_h_coeff * 10.0 ** (-ph)
            cap = min(1.0, water)
            h, c, gel, t_cap = sol_ode(k_h, k_c, cap, p_c_of(x), SOLGEL_T_END, t_s)
            if kind == "cap_after" and not (gel is not None and t_cap is not None and gel > t_cap):
                continue
            if kind == "never" and gel is not None:
                continue
            break
        cases.append(
            {
                "kind": kind, "ph": ph, "waterRatio": water, "x": x, "kHCoeff": k_h_coeff, "kC": k_c,
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


# ---- Sobol oracle: Ishigami with scipy.stats.sobol_indices and SALib, plan 03 Task 6 (H2) ----------
SOBOL_SEED = 20261121
SOBOL_N = 2**14
ISHI_A = 7.0
ISHI_B = 0.1


def ishigami(x):
    """x is (3, n) or (n, 3)-transposed by the caller; columns are x1, x2, x3 on [-pi, pi]."""
    return np.sin(x[0]) + ISHI_A * np.sin(x[1]) ** 2 + ISHI_B * x[2] ** 4 * np.sin(x[0])


def sobol_fixture() -> dict:
    from SALib.analyze import sobol as salib_sobol
    from SALib.sample import sobol as salib_sample
    from scipy import stats

    dists = [stats.uniform(loc=-math.pi, scale=2 * math.pi)] * 3
    res = stats.sobol_indices(
        func=ishigami, n=SOBOL_N, dists=dists, random_state=np.random.default_rng(SOBOL_SEED)
    )
    problem = {"num_vars": 3, "names": ["x1", "x2", "x3"], "bounds": [[-math.pi, math.pi]] * 3}
    pts = salib_sample.sample(problem, SOBOL_N, calc_second_order=False, scramble=True, seed=SOBOL_SEED)
    y = ishigami(pts.T)
    sa = salib_sobol.analyze(
        problem, y, calc_second_order=False, num_resamples=100, conf_level=0.95, seed=SOBOL_SEED
    )
    r = lambda v: [round(float(t), 6) for t in v]  # noqa: E731
    return {
        "function": f"Ishigami a={ISHI_A} b={ISHI_B} on [-pi, pi]^3",
        "n": SOBOL_N,
        "seed": SOBOL_SEED,
        "versions": {
            "scipy": __import__("scipy").__version__,
            "numpy": np.__version__,
            "SALib": importlib.metadata.version("SALib"),
        },
        "analytic": {"S1": [0.3139, 0.4424, 0.0], "ST": [0.5576, 0.4424, 0.2437]},
        "scipy": {
            "first_order": r(res.first_order),
            "total_order": r(res.total_order),
        },
        "salib": {"S1": r(sa["S1"]), "ST": r(sa["ST"]), "S1_conf": r(sa["S1_conf"]), "ST_conf": r(sa["ST_conf"])},
    }


# ---- gradient oracle (plan 05 Task 3, H1) -------------------------------------------------------
# (a) REAL model values on a stencil (written by oracle/gradient_stencil.ts from the TypeScript model, read here as
#     data) differenced at 60 digits with Richardson extrapolation in h^2. This checks the finite-difference
#     arithmetic and the step choice, not the model. (b) analytic functions with exact gradients (independent).
GRAD_INPUT = HERE / "gradient_stencil.input.json"
GRAD_LEVELS = 4  # Richardson levels k = 1..4 (central differences at k*h)
GRAD_DPS = 60


def richardson_h2(d: list, hs: list):
    """Neville extrapolation of central differences d(h_k) to h = 0 in powers of h^2 (exact at GRAD_DPS digits)."""
    x = [h * h for h in hs]
    t = list(d)
    n = len(d)
    for j in range(1, n):
        for k in range(n - 1, j - 1, -1):
            t[k] = (x[k - j] * t[k] - x[k] * t[k - 1]) / (x[k - j] - x[k])
    return t[n - 1]


def gradient_fixture() -> dict:
    mpmath.mp.dps = GRAD_DPS
    src = json.loads(GRAD_INPUT.read_text())
    h = src["h"]
    cases = []
    for c in src["cases"]:
        st = c["stencil"]
        ref, ref_lo, rich = [], [], []
        d_h, d_h2 = [], []
        for i in range(9):
            hi = mpmath.mpf(h[i])
            ds = []
            for k in range(1, GRAD_LEVELS + 1):
                a = mpmath.mpf(st[f"{i}:{2 * k}"])
                b = mpmath.mpf(st[f"{i}:{-2 * k}"])
                ds.append((a - b) / (2 * k * hi))
            hs = [k * hi for k in range(1, GRAD_LEVELS + 1)]
            ref.append(float(richardson_h2(ds, hs)))
            ref_lo.append(float(richardson_h2(ds[:3], hs[:3])))
            # D(h) and D(h/2) at 60 digits, for the Richardson-check reference
            d_h.append(ds[0])
            half = (mpmath.mpf(st[f"{i}:1"]) - mpmath.mpf(st[f"{i}:-1"])) / hi
            d_h2.append(half)
        floor = mpmath.mpf("1e-3") * max(abs(v) for v in d_h2)
        for i in range(9):
            denom = max(abs(d_h2[i]), floor)
            rich.append(float(abs(d_h[i] - d_h2[i]) / denom) if denom > 0 else 0.0)
        cases.append(
            {
                "u": c["u"],
                "center": c["center"],
                "stencil": st,
                "ref": ref,
                "ref_3level": ref_lo,
                "richardson_ref": rich,
            }
        )
    return {
        "description": "central differences of REAL model values (TypeScript model, oracle/gradient_stencil.ts) differenced "
        "with mpmath at 60 digits and Richardson-extrapolated in h^2 (levels k=1..4 of step k*h); verifies the "
        "finite-difference arithmetic and step choice, not the model",
        "versions": {"mpmath": importlib.metadata.version("mpmath")},
        "dps": GRAD_DPS,
        "levels": GRAD_LEVELS,
        "h": h,
        "offsets_in_half_h": src["offsets_in_half_h"],
        "weights": src["weights"],
        "norm": src["norm"],
        "cases": cases,
    }


def _lcg_points(n: int, dim: int, seed: int) -> list[list[float]]:
    state = seed & M32
    pts = []
    for _ in range(n):
        p = []
        for _ in range(dim):
            state = (1664525 * state + 1013904223) & M32
            p.append(round(0.1 + 0.8 * state / 2**32, 6))
        pts.append(p)
    return pts


def gradient_benchmarks() -> dict:
    """Six analytic functions on [0,1]^n; exact gradients and values from the closed forms, evaluated in mpmath."""
    mp = mpmath
    mp.mp.dps = GRAD_DPS
    A = [[4, 1, 0, 0], [1, 3, 0.5, 0], [0, 0.5, 2, 0.2], [0, 0, 0.2, 1]]
    b = [1.0, -0.5, 0.25, 2.0]
    lse_a = [[1.0, -2.0, 0.5], [0.3, 0.7, -1.1], [-0.8, 1.5, 2.0], [2.2, 0.1, -0.4]]
    out = []

    def add(name, params, dim, f, g, seed):
        pts = _lcg_points(5, dim, seed)
        out.append(
            {
                "name": name,
                "params": params,
                "points": pts,
                "f": [float(f([mp.mpf(v) for v in p])) for p in pts],
                "grad": [[float(v) for v in g([mp.mpf(v) for v in p])] for p in pts],
            }
        )

    def quad_f(u):
        return sum(u[i] * A[i][j] * u[j] for i in range(4) for j in range(4)) / 2 - sum(b[i] * u[i] for i in range(4))

    def quad_g(u):
        return [sum(mp.mpf(A[i][j]) * u[j] for j in range(4)) - b[i] for i in range(4)]

    add("quadratic", {"A": A, "b": b}, 4, quad_f, quad_g, 11)

    def rosen_f(u):
        x = [2 * v for v in u]
        return sum(100 * (x[i + 1] - x[i] ** 2) ** 2 + (1 - x[i]) ** 2 for i in range(3))

    def rosen_g(u):
        x = [2 * v for v in u]
        gx = [mp.mpf(0)] * 4
        for i in range(3):
            gx[i] += -400 * x[i] * (x[i + 1] - x[i] ** 2) - 2 * (1 - x[i])
            gx[i + 1] += 200 * (x[i + 1] - x[i] ** 2)
        return [2 * v for v in gx]

    add("rosenbrock4_x2u", {"scale": 2}, 4, rosen_f, rosen_g, 12)

    def lse_f(u):
        return mp.log(sum(mp.exp(sum(a[j] * u[j] for j in range(3))) for a in lse_a))

    def lse_g(u):
        e = [mp.exp(sum(a[j] * u[j] for j in range(3))) for a in lse_a]
        z = sum(e)
        return [sum(e[k] * lse_a[k][j] for k in range(4)) / z for j in range(3)]

    add("logsumexp", {"a": lse_a}, 3, lse_f, lse_g, 13)

    def trig_f(u):
        return sum(mp.sin(3 * u[i]) * mp.cos(2 * u[(i + 1) % 3]) for i in range(3))

    def trig_g(u):
        return [
            3 * mp.cos(3 * u[i]) * mp.cos(2 * u[(i + 1) % 3]) - 2 * mp.sin(3 * u[(i - 1) % 3]) * mp.sin(2 * u[i])
            for i in range(3)
        ]

    add("trig_ring", {}, 3, trig_f, trig_g, 14)

    def ras_f(u):
        return sum(v * v - mp.mpf("0.1") * mp.cos(5 * mp.pi * v) for v in u)

    def ras_g(u):
        return [2 * v + mp.mpf("0.5") * mp.pi * mp.sin(5 * mp.pi * v) for v in u]

    add("rastrigin5", {}, 5, ras_f, ras_g, 15)

    def prod_f(u):
        return mp.exp(u[0] * u[1]) + u[2] ** 4 + u[0] * u[2] / (1 + u[1] ** 2)

    def prod_g(u):
        e = mp.exp(u[0] * u[1])
        d = 1 + u[1] ** 2
        return [u[1] * e + u[2] / d, u[0] * e - 2 * u[0] * u[2] * u[1] / d**2, 4 * u[2] ** 3 + u[0] / d]

    add("exp_product", {}, 3, prod_f, prod_g, 16)
    return {"versions": {"mpmath": importlib.metadata.version("mpmath")}, "dps": GRAD_DPS, "functions": out}


# ---- optimiser oracle (plan 05 Task 4, H3) ------------------------------------------------------
# Six problems on the scaled box [0,1]^n. The known optimum comes from a closed form or from a KKT-verified active-set
# solve in mpmath (never from scipy); scipy L-BFGS-B / SLSQP at tight tolerances is the second, independent witness.
def _spd(n: int, cond: float, seed: int) -> list[list[float]]:
    """Fixed SPD matrix with eigenvalues log-spaced in [1, cond]: Q diag Q^T with Q from a Householder product."""
    rng = np.random.default_rng(seed)
    q = np.eye(n)
    for _ in range(3):
        v = rng.standard_normal(n)
        v /= np.linalg.norm(v)
        q = q @ (np.eye(n) - 2 * np.outer(v, v))
    lam = np.logspace(0, math.log10(cond), n)
    a = q @ np.diag(lam) @ q.T
    a = np.round((a + a.T) / 2, 6)
    assert np.linalg.eigvalsh(a).min() > 0.5
    return a.tolist()


def _kkt_box_quadratic(a: list[list[float]], c: list[float]) -> tuple[list[float], list[int]]:
    """min 0.5 (u-c)^T A (u-c) on [0,1]^n: active set from scipy, then an exact 60-digit solve and a KKT check."""
    from scipy.optimize import minimize

    n = len(c)
    an = np.array(a)
    cn = np.array(c)
    res = minimize(
        lambda u: 0.5 * (u - cn) @ an @ (u - cn),
        np.full(n, 0.5),
        jac=lambda u: an @ (u - cn),
        bounds=[(0, 1)] * n,
        method="L-BFGS-B",
        options={"ftol": 1e-16, "gtol": 1e-13, "maxiter": 10000},
    )
    mpmath.mp.dps = GRAD_DPS
    at = [i for i in range(n) if res.x[i] < 1e-7 or res.x[i] > 1 - 1e-7]
    free = [i for i in range(n) if i not in at]
    u = [mpmath.mpf(0)] * n
    for i in at:
        u[i] = mpmath.mpf(1 if res.x[i] > 0.5 else 0)
    if free:
        am = mpmath.matrix(a)
        rhs = mpmath.matrix(
            [sum(am[i, j] * mpmath.mpf(c[j]) for j in range(n)) - sum(am[i, j] * u[j] for j in at) for i in free]
        )
        sub = mpmath.matrix([[am[i, j] for j in free] for i in free])
        sol = mpmath.lu_solve(sub, rhs)
        for k, i in enumerate(free):
            u[i] = sol[k]
    g = [sum(mpmath.mpf(a[i][j]) * (u[j] - mpmath.mpf(c[j])) for j in range(n)) for i in range(n)]
    for i in range(n):
        if i in free:
            assert 0 < u[i] < 1 and abs(g[i]) < mpmath.mpf("1e-40")
        elif u[i] == 0:
            assert g[i] >= 0
        else:
            assert g[i] <= 0
    return [float(v) for v in u], at


def optimisation_fixture() -> dict:
    from scipy.optimize import minimize

    probs = []

    def finish(pid, kind, params, cons, u0, ustar, fval, scipy_res, method):
        us = np.array(ustar)
        probs.append(
            {
                "id": pid,
                "kind": kind,
                "params": params,
                "cons": cons,
                "u0": u0,
                "ustar": ustar,
                "fstar": float(fval),
                "scipy": {
                    "method": method,
                    "u": [float(v) for v in scipy_res.x],
                    "f": float(scipy_res.fun),
                    "dist_to_known": float(np.linalg.norm(scipy_res.x - us)),
                },
            }
        )
        assert np.linalg.norm(scipy_res.x - us) < 1e-5, (pid, scipy_res.x, ustar)

    def quad_problem(pid, a, c, u0):
        an, cn = np.array(a), np.array(c)
        ustar, at = _kkt_box_quadratic(a, c)
        r = minimize(
            lambda u: 0.5 * (u - cn) @ an @ (u - cn),
            np.array(u0),
            jac=lambda u: an @ (u - cn),
            bounds=[(0, 1)] * len(c),
            method="L-BFGS-B",
            options={"ftol": 1e-16, "gtol": 1e-13, "maxiter": 10000},
        )
        us = np.array(ustar)
        finish(pid, "quad", {"A": a, "c": c}, [], u0, ustar, 0.5 * (us - cn) @ an @ (us - cn), r, "L-BFGS-B")
        probs[-1]["active_bounds"] = at

    # P1: diagonal box quadratic, four of five bounds or interior points known in closed form (clip(c))
    diag = [1.0, 2.0, 5.0, 10.0, 50.0]
    a1 = [[diag[i] if i == j else 0.0 for j in range(5)] for i in range(5)]
    c1 = [1.4, -0.3, 0.5, 0.2, 0.9]
    quad_problem("box_quad_diag_active", a1, c1, [0.5] * 5)
    assert probs[-1]["ustar"] == [1.0, 0.0, 0.5, 0.2, 0.9]

    # P2: dense ill-conditioned (cond 300) 9-d quadratic with several active bounds
    a2 = _spd(9, 3e2, 7)
    c2 = [1.3, 0.4, -0.25, 0.7, 0.55, 1.2, 0.1, -0.05, 0.8]
    quad_problem("box_quad_dense_cond3e2", a2, c2, [0.5] * 9)

    # P3, P4: Rosenbrock, x_i = lo_i + (hi_i - lo_i) u_i
    def rosen_problem(pid, lo, hi, xstar_scaled, u0, method="L-BFGS-B"):
        lo_n, hi_n = np.array(lo), np.array(hi)

        def x_of(u):
            return lo_n + (hi_n - lo_n) * u

        def f(u):
            x = x_of(u)
            return 100 * (x[1] - x[0] ** 2) ** 2 + (1 - x[0]) ** 2

        def g(u):
            x = x_of(u)
            gx = np.array([-400 * x[0] * (x[1] - x[0] ** 2) - 2 * (1 - x[0]), 200 * (x[1] - x[0] ** 2)])
            return gx * (hi_n - lo_n)

        r = minimize(f, np.array(u0), jac=g, bounds=[(0, 1)] * 2, method=method,
                     options={"ftol": 1e-16, "gtol": 1e-13, "maxiter": 10000})
        xs = np.array(xstar_scaled)
        ustar = [float(v) for v in (xs - lo_n) / (hi_n - lo_n)]
        finish(pid, "rosenbrock", {"lo": lo, "hi": hi}, [], u0, ustar, f(np.array(ustar)), r, method)

    rosen_problem("rosenbrock_box_interior", [-2.0, -2.0], [2.0, 2.0], [1.0, 1.0], [0.2, 0.75])
    # active bound: x1 <= 0.5 forces x1 = 0.5, x2 = x1^2 = 0.25 (closed form, f = 0.25)
    rosen_problem("rosenbrock_box_active", [-2.0, -1.0], [0.5, 3.0], [0.5, 0.25], [0.32, 0.5])
    assert abs(probs[-1]["fstar"] - 0.25) < 1e-12

    # P5: nearest point to c in the half-space u0+u1+u2 <= 1 inside the box; closed form (0.55, 0.45, 0)
    c5 = [0.9, 0.8, 0.2]
    u0_5 = [0.1, 0.1, 0.1]
    r5 = minimize(
        lambda u: float(np.sum((u - np.array(c5)) ** 2)),
        np.array(u0_5),
        jac=lambda u: 2 * (u - np.array(c5)),
        bounds=[(0, 1)] * 3,
        constraints=[{"type": "ineq", "fun": lambda u: 1 - np.sum(u), "jac": lambda u: -np.ones(3)}],
        method="SLSQP",
        options={"ftol": 1e-16, "maxiter": 500},
    )
    us5 = [0.55, 0.45, 0.0]
    finish("linear_constraint_with_bound", "sqdist", {"c": c5}, [{"kind": "linear", "a": [1, 1, 1], "b": 1.0}],
           u0_5, us5, sum((us5[i] - c5[i]) ** 2 for i in range(3)), r5, "SLSQP")

    # P6: maximise u0 + u1 inside the disc u0^2 + u1^2 <= 1/2; closed form (1/2, 1/2), f = -1
    r6 = minimize(
        lambda u: -(u[0] + u[1]),
        np.array([0.1, 0.2]),
        jac=lambda u: np.array([-1.0, -1.0]),
        bounds=[(0, 1)] * 2,
        constraints=[{"type": "ineq", "fun": lambda u: 0.5 - u[0] ** 2 - u[1] ** 2,
                      "jac": lambda u: np.array([-2 * u[0], -2 * u[1]])}],
        method="SLSQP",
        options={"ftol": 1e-16, "maxiter": 500},
    )
    finish("nonlinear_disc_constraint", "neg_sum", {}, [{"kind": "ball", "r2": 0.5}], [0.1, 0.2], [0.5, 0.5], -1.0, r6, "SLSQP")
    return {
        "description": "optimiser benchmarks on the scaled box [0,1]^n; ustar is a closed form or a KKT-verified 60-digit "
        "active-set solve, scipy the independent second witness",
        "versions": {"scipy": __import__("scipy").__version__, "numpy": np.__version__,
                     "mpmath": importlib.metadata.version("mpmath")},
        "problems": probs,
    }


def sums_text(files: dict[str, str]) -> str:
    return "".join(
        f"{hashlib.sha256(text.encode()).hexdigest()}  {name}\n"
        for name, text in sorted(files.items())
    )


def main() -> int:
    files = build_fixtures()
    sums = sums_text(files)
    if "--out" in sys.argv[1:]:
        # regenerate into DIR without touching the committed fixtures (the cross-platform freshness test compares them numerically)
        dest = Path(sys.argv[sys.argv.index("--out") + 1])
        dest.mkdir(parents=True, exist_ok=True)
        for name, text in files.items():
            (dest / name).write_text(text)
        print(f"regenerated {', '.join(files)} into {dest}")
        return 0
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
