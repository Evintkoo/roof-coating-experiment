/**
 * Sobol low-discrepancy points (Joe-Kuo 2008 direction numbers for the first nine dimensions), used for the plan 05
 * FR-3 Sobol starts and the H5 baseline of 4096 points. Dimension 1 is the van der Corput sequence; dimensions 2-9
 * come from the primitive polynomials (s, a, m) below. An optional digital shift (XOR with one random word per
 * dimension, from the seeded stream) randomises the set and keeps its net structure.
 */
import { Xoshiro128 } from "../rng"

/** Joe-Kuo: degree s, coefficient word a, initial direction numbers m (dimensions 2..9). */
const JOE_KUO: readonly { s: number; a: number; m: readonly number[] }[] = [
  { s: 1, a: 0, m: [1] },
  { s: 2, a: 1, m: [1, 3] },
  { s: 3, a: 1, m: [1, 3, 1] },
  { s: 3, a: 2, m: [1, 1, 1] },
  { s: 4, a: 1, m: [1, 1, 3, 3] },
  { s: 4, a: 4, m: [1, 3, 5, 13] },
  { s: 5, a: 2, m: [1, 1, 5, 5, 17] },
  { s: 5, a: 4, m: [1, 1, 5, 5, 5] },
]

export const SOBOL_MAX_DIM = JOE_KUO.length + 1
const BITS = 32

/** Direction words V[1..32] (index 0 unused) of dimension `d` (0-based). */
function directions(d: number): Uint32Array {
  const v = new Uint32Array(BITS + 1)
  if (d === 0) {
    for (let i = 1; i <= BITS; i++) v[i] = (2 ** (BITS - i)) >>> 0
    return v
  }
  const { s, a, m } = JOE_KUO[d - 1] as (typeof JOE_KUO)[number]
  for (let i = 1; i <= s; i++)
    v[i] = ((m[i - 1] as number) * 2 ** (BITS - i)) >>> 0
  for (let k = s + 1; k <= BITS; k++) {
    let x = ((v[k - s] as number) ^ ((v[k - s] as number) >>> s)) >>> 0
    for (let j = 1; j < s; j++)
      if ((a >>> (s - 1 - j)) & 1) x = (x ^ (v[k - j] as number)) >>> 0
    v[k] = x
  }
  return v
}

/**
 * The first `n` points (index 0 is the all-zero point unless shifted) of the `dim`-dimensional Sobol sequence, as n rows
 * of values in [0, 1). `shiftSeed` applies a digital shift drawn from that seed (undefined = unshifted).
 */
export function sobolPoints(
  n: number,
  dim: number,
  shiftSeed?: number,
): number[][] {
  if (!Number.isInteger(n) || n < 0 || n > 2 ** 24)
    throw new RangeError(`n must be an integer in [0, 2^24], got ${n}`)
  if (!Number.isInteger(dim) || dim < 1 || dim > SOBOL_MAX_DIM)
    throw new RangeError(`dim must be an integer in [1, ${SOBOL_MAX_DIM}]`)
  const dirs = Array.from({ length: dim }, (_, d) => directions(d))
  const shift = new Uint32Array(dim)
  if (shiftSeed !== undefined) {
    const rng = new Xoshiro128(shiftSeed)
    for (let d = 0; d < dim; d++) shift[d] = rng.nextU32()
  }
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    const gray = (i ^ (i >>> 1)) >>> 0
    const row = new Array<number>(dim)
    for (let d = 0; d < dim; d++) {
      let x = shift[d] as number
      for (let b = 0; b < 24; b++)
        if ((gray >>> b) & 1)
          x = (x ^ ((dirs[d] as Uint32Array)[b + 1] as number)) >>> 0
      row[d] = x / 4294967296
    }
    out.push(row)
  }
  return out
}
