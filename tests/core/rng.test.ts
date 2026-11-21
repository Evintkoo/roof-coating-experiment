import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import fc from "fast-check"
import { ConfigError } from "../../src/core/errors"
import {
  deriveSeed,
  fmix32,
  shuffleInPlace,
  Xoshiro128,
} from "../../src/core/rng"
import { repoRoot } from "../helpers"

type Fixture = { seed: number; first1000: number[] }
const fixture: Fixture[] = JSON.parse(
  readFileSync(join(repoRoot, "tests/fixtures/oracle/xoshiro.json"), "utf8"),
)

test("matchesCReferenceBitExact", () => {
  expect(fixture.map((f) => f.seed)).toEqual([1, 20261121, 4294967295])
  for (const f of fixture) {
    const rng = new Xoshiro128(f.seed)
    const got = Array.from({ length: 1000 }, () => rng.nextU32())
    expect(got).toEqual(f.first1000)
  }
})

test("sameSeedSameSequence", () => {
  const a = new Xoshiro128(42)
  const b = new Xoshiro128(42)
  for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32())
})

test("differentSeedsDiffer", () => {
  const a = new Xoshiro128(1)
  const b = new Xoshiro128(2)
  const sa = Array.from({ length: 8 }, () => a.nextU32())
  const sb = Array.from({ length: 8 }, () => b.nextU32())
  expect(sa).not.toEqual(sb)
})

test("next01IsInHalfOpenUnitInterval", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), (seed) => {
      const rng = new Xoshiro128(seed)
      for (let i = 0; i < 50; i++) {
        const x = rng.next()
        if (!(x >= 0 && x < 1)) return false
      }
      return true
    }),
  )
})

test("seedZeroIsValid", () => {
  const rng = new Xoshiro128(0)
  expect(
    Array.from({ length: 4 }, () => rng.nextU32()).some((v) => v !== 0),
  ).toBe(true)
})

test("invalidSeedsRejected", () => {
  for (const bad of [-1, 1.5, 2 ** 32, Number.NaN, Number.POSITIVE_INFINITY]) {
    let err: unknown
    try {
      new Xoshiro128(bad)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ConfigError)
    expect((err as ConfigError).key).toBe("seed")
  }
})

test("fmix32AndDeriveSeedAreUint32AndDistinctPerStream", () => {
  expect(fmix32(0)).toBe(0)
  const ids = [
    0, 1, 2, 3, 4, 5, 6, 100, 200, 201, 202, 203, 300, 301, 302, 303, 400,
  ]
  for (const base of [20261121, 1, 4294967295]) {
    const seeds = ids.map((j) => deriveSeed(base, j))
    for (const s of seeds) {
      expect(Number.isInteger(s) && s >= 0 && s <= 2 ** 32 - 1).toBe(true)
    }
    expect(new Set(seeds).size).toBe(ids.length)
  }
  expect(deriveSeed(7, 3)).toBe(fmix32((7 + Math.imul(4, 0x9e3779b9)) >>> 0))
})

test("shuffleIsPermutation", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 2 ** 32 - 1 }),
      fc.integer({ min: 0, max: 60 }),
      (seed, n) => {
        const a = Array.from({ length: n }, (_, i) => i)
        shuffleInPlace(new Xoshiro128(seed), a)
        expect([...a].sort((x, y) => x - y)).toEqual(
          Array.from({ length: n }, (_, i) => i),
        )
      },
    ),
  )
})
