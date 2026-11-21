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
        "mie.json": json.dumps(mie_fixture(), separators=(",", ":")) + "\n",
        "solgel.json": json.dumps(solgel_fixture(), separators=(",", ":")) + "\n",
        "sobol.json": json.dumps(sobol_fixture(), separators=(",", ":")) + "\n",
        "gradient.json": json.dumps(gradient_fixture(), separators=(",", ":")) + "\n",
        "benchmarks.json": json.dumps(gradient_benchmarks(), separators=(",", ":")) + "\n",
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
