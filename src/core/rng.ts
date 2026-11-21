import { ConfigError } from "./errors"

const WEYL = 0x9e3779b9

/** murmur3 32-bit finaliser (a bijection on uint32 that maps 0 to 0). */
export function fmix32(x: number): number {
  let z = x >>> 0
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
  return (z ^ (z >>> 16)) >>> 0
}

/** Per-stream seed (plan decision D10); stream ids follow D13. */
export function deriveSeed(seed: number, stream: number): number {
  return fmix32((seed + Math.imul(stream + 1, WEYL)) >>> 0)
}

const rotl = (x: number, k: number): number =>
  ((x << k) | (x >>> (32 - k))) >>> 0

/** xoshiro128** 1.1 with a stateful splitmix32 seed expansion (D10). */
export class Xoshiro128 {
  private s0: number
  private s1: number
  private s2: number
  private s3: number

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new ConfigError("seed", "seed must be an integer in [0, 2^32-1]")
    }
    let state = seed >>> 0
    const word = (): number => {
      state = (state + WEYL) >>> 0
      return fmix32(state)
    }
    this.s0 = word()
    this.s1 = word()
    this.s2 = word()
    this.s3 = word()
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0
    const t = (this.s1 << 9) >>> 0
    this.s2 = (this.s2 ^ this.s0) >>> 0
    this.s3 = (this.s3 ^ this.s1) >>> 0
    this.s1 = (this.s1 ^ this.s2) >>> 0
    this.s0 = (this.s0 ^ this.s3) >>> 0
    this.s2 = (this.s2 ^ t) >>> 0
    this.s3 = rotl(this.s3, 11)
    return result
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296
  }
}

/** Fisher-Yates, j = floor(next() * (i + 1)). */
export function shuffleInPlace<T>(rng: Xoshiro128, a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const tmp = a[i] as T
    a[i] = a[j] as T
    a[j] = tmp
  }
}
