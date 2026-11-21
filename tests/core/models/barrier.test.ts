import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import fc from "fast-check"
import type { Materials } from "../../../src/core/config"
import { PhysicsRangeError } from "../../../src/core/errors"
import { barrier } from "../../../src/core/models/barrier"
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
  // Spike constants saturate crack at 1.0 (see report); non-decreasing everywhere,
  // strictly increasing while unsaturated.
  for (const x of [0.2, 0.5, 0.8]) {
    let prev = -1
    for (let d = 2; d <= 12; d++) {
      const c = barrier(x, d, mat).crack_index
      expect(c).toBeGreaterThanOrEqual(prev)
      if (prev > 0 && prev < 0.999) expect(c).toBeGreaterThan(prev)
      prev = c
    }
  }
  expect(barrier(0.8, 6, mat).crack_index).toBeGreaterThan(
    barrier(0.8, 2, mat).crack_index,
  )
  expect(barrier(0.8, 12, mat).crack_index).toBeGreaterThan(
    barrier(0.8, 6, mat).crack_index,
  )
})

const withHc = (hc: number): Materials => {
  const m = structuredClone(mat)
  m.barrier.h_c0_primer_um.value = hc
  return m
}

const argminX = (m: Materials, dft: number): number => {
  const r = Array.from(
    { length: 61 },
    (_, i) => barrier(0.2 + (0.6 * i) / 60, dft, m).corrosion_risk,
  )
  return r.indexOf(Math.min(...r))
}

test("interiorOptimumExistsInX", () => {
  // Documents the by-construction shape (D5): perm rises and crack falls with x,
  // so corrosion_risk CAN have an interior minimum. Not evidence for blueprint H1.
  // With the spike h_c0 = 1 um the crack term dominates and the minimum sits on the x = 0.8 edge
  // (reported as a concern); the interior optimum appears only for a narrow window of constants (h_c0 = 3 um at 2 um DFT: minimum near x = 0.62).
  for (const dft of [2, 6, 12]) expect(argminX(mat, dft)).toBe(60)
  const k = argminX(withHc(3), 2)
  expect(k).toBeGreaterThan(0)
  expect(k).toBeLessThan(60)
  expect(barrier(0.5, 6, mat).proxy).toBe(true)
  const src = readFileSync(join(repoRoot, "src/core/models/barrier.ts"), "utf8")
  expect(src).toMatch(
    /\/\*\*\s*\*?\s*PROXY:[\s\S]*?\*\/\s*export function barrier/,
  )
})

test("closedFormPinned", () => {
  const x = 0.5
  const L = 6
  const eps = 0.05 + 0.35 * x
  const tIng = (L * L) / (6 * eps ** 1.5)
  const perm = 1 / (1 + tIng / 1)
  const ratio = L / (1 / (1 - x))
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
