import type { Materials } from "../config"
import { lhsUnit } from "../design"
import { ConfigError } from "../errors"

type Sourced = { value: number }
type Domain = { lo: number; hi: number }

/** Plan 02 D9 domains; open bounds are approximated by a tiny margin so a clamped draw still parses. */
const EPS = 1e-9
const POS: Domain = { lo: EPS, hi: Number.POSITIVE_INFINITY }
const UNIT: Domain = { lo: 0, hi: 1 }
const OPEN_UNIT: Domain = { lo: EPS, hi: 1 - EPS }
const ANGLE: Domain = { lo: 0, hi: 180 }
const DIAM: Domain = { lo: EPS, hi: 50 }

/**
 * D4: the 11 perturbed parameters. rel = half-width is unc[key] x nominal; abs = half-width is unc[key].
 * Dimension of the Latin hypercube is this list's length.
 */
const PARAMS: readonly {
  group: keyof Materials
  field: string
  unc: keyof Materials["unc"]
  abs: boolean
  dom: Domain
}[] = [
  {
    group: "tio2",
    field: "diameter_um",
    unc: "diameter_rel",
    abs: false,
    dom: DIAM,
  },
  {
    group: "baso4",
    field: "diameter_um",
    unc: "diameter_rel",
    abs: false,
    dom: DIAM,
  },
  {
    group: "binder",
    field: "n",
    unc: "n_rel",
    abs: false,
    dom: { lo: 1, hi: Number.POSITIVE_INFINITY },
  },
  {
    group: "substrate",
    field: "r_solar",
    unc: "substrate_r_abs",
    abs: true,
    dom: UNIT,
  },
  {
    group: "topcoat",
    field: "mu_per_um",
    unc: "mu_rel",
    abs: false,
    dom: { lo: 0, hi: Number.POSITIVE_INFINITY },
  },
  {
    group: "barrier",
    field: "eps_lo",
    unc: "eps_rel",
    abs: false,
    dom: OPEN_UNIT,
  },
  {
    group: "barrier",
    field: "eps_hi",
    unc: "eps_rel",
    abs: false,
    dom: OPEN_UNIT,
  },
  {
    group: "barrier",
    field: "h_c0_primer_um",
    unc: "h_c0_rel",
    abs: false,
    dom: POS,
  },
  {
    group: "barrier",
    field: "h_c0_top_um",
    unc: "h_c0_rel",
    abs: false,
    dom: POS,
  },
  {
    group: "wetting",
    field: "theta_silica_deg",
    unc: "theta_deg",
    abs: true,
    dom: ANGLE,
  },
  {
    group: "wetting",
    field: "theta_mtes_deg",
    unc: "theta_deg",
    abs: true,
    dom: ANGLE,
  },
]

const cell = (m: Materials, group: string, field: string): Sourced =>
  (m as unknown as Record<string, Record<string, Sourced>>)[group]![field]!

/**
 * `n` Latin-hypercube draws of the material parameters (D4). Each parameter is perturbed uniformly within
 * its band (+-unc x nominal, or +-unc absolute), then clamped to its plan 02 D9 domain; eps_lo is kept
 * strictly below eps_hi. The caller passes the final seed (plan 1 D13: deriveSeed(seed, 100)); the input is not mutated.
 */
export function drawMaterials(
  mat: Materials,
  n: number,
  seed: number,
): Materials[] {
  if (!Number.isInteger(n) || n <= 0)
    throw new ConfigError(
      "n",
      `draw count must be a positive integer, got ${n}`,
    )
  const u = lhsUnit(n, PARAMS.length, seed)
  return u.map((row) => {
    const m = structuredClone(mat)
    PARAMS.forEach((p, j) => {
      const nominal = cell(mat, p.group, p.field).value
      const unc = (mat.unc[p.unc] as Sourced).value
      const half = p.abs ? unc : unc * nominal
      const v = nominal + (2 * (row[j] as number) - 1) * half
      cell(m, p.group, p.field).value = Math.min(
        p.dom.hi,
        Math.max(p.dom.lo, v),
      )
    })
    const lo = cell(m, "barrier", "eps_lo")
    const hi = cell(m, "barrier", "eps_hi")
    if (lo.value >= hi.value) {
      const [a, b] = [lo.value, hi.value].sort((x, y) => x - y) as [
        number,
        number,
      ]
      lo.value = Math.max(EPS, Math.min(a, b - EPS))
      hi.value = Math.max(b, lo.value + EPS)
    }
    return m
  })
}

/** An empty or NaN-containing sample has no quantile: fail loudly rather than return NaN. */
function requireDraws(d: Float64Array): void {
  if (d.length === 0) throw new ConfigError("draws", "no draws to summarise")
  for (let i = 0; i < d.length; i++)
    if (Number.isNaN(d[i])) throw new ConfigError("draws", "draws contain NaN")
}

/** Type-7 quantile (R default): h = (n-1)p, linear interpolation between order statistics. `sorted` ascending. */
export function quantile7(sorted: Float64Array, p: number): number {
  const n = sorted.length
  requireDraws(sorted)
  const h = (n - 1) * p
  const i = Math.floor(h)
  const a = sorted[i] as number
  if (i + 1 >= n) return a
  return a + (h - i) * ((sorted[i + 1] as number) - a)
}

/** D4/D5: p5-p95 over the draws (not mutated), widened to include the nominal prediction. */
export function widenInterval(
  pred: number,
  draws: Float64Array,
): { lo: number; hi: number } {
  const s = Float64Array.from(draws).sort()
  return {
    lo: Math.min(pred, quantile7(s, 0.05)),
    hi: Math.max(pred, quantile7(s, 0.95)),
  }
}
