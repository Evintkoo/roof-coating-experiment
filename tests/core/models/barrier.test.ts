import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import fc from "fast-check"
import type { Materials } from "../../../src/core/config"
import { PhysicsRangeError } from "../../../src/core/errors"
import { barrier } from "../../../src/core/models/barrier"
import { delaminationProxy } from "../../../src/core/models/delamination"
import { loadMaterials } from "../../../src/node/config"
import { repoRoot } from "../../helpers"

const mat: Materials = await loadMaterials(
  join(repoRoot, "configs", "materials.yaml"),
)
const inUnit = (v: number) => v >= 0 && v <= 1

test("allOutputsInUnitIntervalOverPlan1Ranges", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0.2, max: 0.8, noNaN: true }),
      fc.double({ min: 2, max: 12, noNaN: true }),
      (x, dft) => {
        const b = barrier(x, dft, mat)
        return (
          inUnit(b.perm_index) &&
          inUnit(b.crack_index) &&
          inUnit(b.corrosion_risk) &&
          b.proxy === true
        )
      },
    ),
    { numRuns: 500 },
  )
  for (const x of [0, 1]) {
    for (const dft of [2, 12]) {
      const b = barrier(x, dft, mat)
      expect(inUnit(b.perm_index) && inUnit(b.crack_index)).toBe(true)
      expect(inUnit(b.corrosion_risk)).toBe(true)
    }
  }
})

test("permIncreasesWithGptes", () => {
  for (const dft of [2, 6, 12]) {
    let prev = -1
    for (let i = 0; i <= 20; i++) {
      const p = barrier(0.2 + (0.6 * i) / 20, dft, mat).perm_index
      expect(p).toBeGreaterThan(prev)
      prev = p
    }
  }
})

test("crackIncreasesWithDft", () => {
  for (const x of [0.2, 0.5, 0.8]) {
    let prev = -1
    for (let d = 2; d <= 12; d++) {
      const c = barrier(x, d, mat).crack_index
      expect(c).toBeGreaterThan(prev)
      prev = c
    }
  }
})

const argminX = (dft: number): number => {
  const r = Array.from(
    { length: 61 },
    (_, i) => barrier(0.2 + (0.6 * i) / 60, dft, mat).corrosion_risk,
  )
  return r.indexOf(Math.min(...r))
}

test("interiorOptimumExistsInX", () => {
  // By construction (D5, Ruling R4): perm rises and crack falls with x, constants tuned so the
  // minimum is interior. Assumed blueprint-H1 shape, not evidence for it.
  const k = argminX(6)
  const x = 0.2 + (0.6 * k) / 60
  expect(k).toBeGreaterThan(0)
  expect(k).toBeLessThan(60)
  expect(x).toBeGreaterThanOrEqual(0.35)
  expect(x).toBeLessThanOrEqual(0.65)
  expect(barrier(0.5, 6, mat).proxy).toBe(true)
  const src = readFileSync(join(repoRoot, "src/core/models/barrier.ts"), "utf8")
  expect(src).toMatch(
    /\/\*\*\s*\*?\s*PROXY:[\s\S]*?\*\/\s*export function barrier/,
  )
})

test("shapeConstantsKeepProxiesInformative", () => {
  // (a) crack unsaturated over primer DFT 2-12 x GPTES 0.2-0.8
  const c: number[] = []
  for (let i = 0; i <= 12; i++)
    for (let d = 2; d <= 12; d++)
      c.push(barrier(0.2 + (0.6 * i) / 12, d, mat).crack_index)
  expect(c.filter((v) => v < 0.9).length / c.length).toBeGreaterThanOrEqual(0.3)
  expect(c.filter((v) => v > 0.1).length / c.length).toBeGreaterThanOrEqual(0.3)
  // (c) delam spans 0.5, non-decreasing in MTES and in topcoat DFT
  const all: number[] = []
  for (let L = 3; L <= 20; L++) {
    let prevY = -1
    for (let i = 0; i <= 12; i++) {
      const y = 0.2 + (0.6 * i) / 12
      const v = delaminationProxy(y, L, mat)
      expect(v).toBeGreaterThanOrEqual(prevY)
      if (L > 3) {
        expect(v).toBeGreaterThanOrEqual(delaminationProxy(y, L - 1, mat))
      }
      prevY = v
      all.push(v)
    }
  }
  expect(Math.min(...all)).toBeLessThan(0.5)
  expect(Math.max(...all)).toBeGreaterThan(0.5)
})

test("closedFormPinned", () => {
  const x = 0.5
  const L = 6
  const eps = 0.05 + 0.35 * x
  const tIng = (L * L) / (6 * eps ** 1.5)
  const perm = 1 / (1 + tIng / 100)
  const ratio = L / (5 / (1 - x))
  const crack = 1 - Math.exp(-(ratio * ratio))
  const b = barrier(x, L, mat)
  expect(b.perm_index).toBeCloseTo(perm, 12)
  expect(b.crack_index).toBeCloseTo(crack, 12)
  expect(b.corrosion_risk).toBeCloseTo(1 - (1 - perm) * (1 - crack), 12)
})

test("domainGuardsCode4", () => {
  for (const [x, d] of [
    [-0.1, 5],
    [1.1, 5],
    [0.5, 1.9],
    [0.5, 12.1],
    [Number.NaN, 5],
  ] as const) {
    expect(() => barrier(x, d, mat)).toThrow(PhysicsRangeError)
  }
})
