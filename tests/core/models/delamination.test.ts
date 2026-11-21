import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Materials } from "../../../src/core/config"
import { PhysicsRangeError } from "../../../src/core/errors"
import { delaminationProxy } from "../../../src/core/models/delamination"
import { loadMaterials } from "../../../src/node/config"
import { repoRoot } from "../../helpers"

const mat: Materials = await loadMaterials(
  join(repoRoot, "configs", "materials.yaml"),
)

const withHc = (hc: number): Materials => {
  const m = structuredClone(mat)
  m.barrier.h_c0_top_um.value = hc
  return m
}

test("delamIncreasesWithMtes", () => {
  // Blueprint H3 direction. With the spike h_c0_top = 0.3 um, crack_top saturates at 1 over the whole
  // 3-20 um range, so delam is ~1 and flat (reported as a concern); the direction is asserted
  // where crack_top is unsaturated (h_c0_top = 300 um).
  const m = withHc(300)
  for (const dft of [3, 10, 20]) {
    let prev = -1
    for (let i = 0; i <= 12; i++) {
      const d = delaminationProxy(0.2 + (0.6 * i) / 12, dft, m)
      expect(d).toBeGreaterThan(prev)
      prev = d
    }
  }
  for (const dft of [3, 10, 20]) {
    expect(delaminationProxy(0.5, dft, mat)).toBeGreaterThan(0.99)
  }
})

test("delamBounds", () => {
  for (const y of [0, 0.2, 0.5, 0.8, 1]) {
    for (const dft of [0, 3, 12, 20]) {
      const d = delaminationProxy(y, dft, mat)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(1)
      expect(d).toBeGreaterThanOrEqual(y * y - 1e-15)
    }
  }
  expect(delaminationProxy(0, 0, mat)).toBe(0)
  expect(delaminationProxy(1, 10, mat)).toBe(1)
  const y = 0.5
  const L = 10
  const ratio = L / (300 / (1 - y))
  const crack = 1 - Math.exp(-(ratio * ratio))
  expect(delaminationProxy(y, L, withHc(300))).toBeCloseTo(
    1 - (1 - y * y) * (1 - crack),
    12,
  )
  const src = readFileSync(
    join(repoRoot, "src/core/models/delamination.ts"),
    "utf8",
  )
  expect(src).toMatch(
    /\/\*\*\s*\*?\s*PROXY:[\s\S]*?\*\/\s*export function delaminationProxy/,
  )
})

test("domainGuardsCode4", () => {
  for (const [y, d] of [
    [-0.1, 5],
    [1.1, 5],
    [0.5, -1],
    [0.5, 20.1],
    [Number.NaN, 5],
  ] as const) {
    expect(() => delaminationProxy(y, d, mat)).toThrow(PhysicsRangeError)
  }
})
