import { expect, test } from "bun:test"
import { join } from "node:path"
import type { Materials } from "../../../src/core/config"
import { PhysicsRangeError } from "../../../src/core/errors"
import {
  cassieBaxterAngleDeg,
  wenzelAngleDeg,
  wetting,
  wettingBinder,
  youngAngleDeg,
} from "../../../src/core/models/wetting"
import { loadMaterials } from "../../../src/node/config"
import { repoRoot } from "../../helpers"

const mat: Materials = await loadMaterials(
  join(repoRoot, "configs", "materials.yaml"),
)
const TOL = 1e-9

test("limits", () => {
  for (const th of [10, 60, 89, 100, 120, 170]) {
    expect(Math.abs(wenzelAngleDeg(th, 1) - th)).toBeLessThan(TOL)
    expect(Math.abs(cassieBaxterAngleDeg(th, 1) - th)).toBeLessThan(TOL)
    expect(cassieBaxterAngleDeg(th, 0)).toBe(180)
  }
})

test("intervalContainsNominal", () => {
  for (const y of [0, 0.2, 0.5, 0.8, 1]) {
    const w = wetting(y, mat)
    expect(w.theta_lo).toBeLessThanOrEqual(w.theta_pred)
    expect(w.theta_pred).toBeLessThanOrEqual(w.theta_hi)
    expect(w.score_lo).toBeLessThanOrEqual(w.score)
    expect(w.score).toBeLessThanOrEqual(w.score_hi)
  }
})

test("scoreBoundsAndDirection", () => {
  let prev = -1
  for (let i = 0; i <= 20; i++) {
    const w = wetting(i / 20, mat)
    for (const s of [w.score, w.score_lo, w.score_hi]) {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
    expect(w.score).toBeGreaterThanOrEqual(prev)
    prev = w.score
  }
  expect(wetting(1, mat).score).toBeGreaterThan(wetting(0, mat).score)
})

test("wenzelAmplifiesBothSides", () => {
  expect(wenzelAngleDeg(60, 1.5)).toBeLessThan(60)
  expect(wenzelAngleDeg(120, 1.5)).toBeGreaterThan(120)
  expect(wenzelAngleDeg(90, 1.5)).toBeCloseTo(90, 9)
  expect(wenzelAngleDeg(170, 1.5)).toBe(180) // cos clamp
  expect(wenzelAngleDeg(10, 1.5)).toBe(0)
})

test("yEdgesValid", () => {
  const { theta_silica_deg: s, theta_mtes_deg: m } = mat.wetting
  expect(youngAngleDeg(0, s.value, m.value)).toBe(s.value)
  expect(youngAngleDeg(1, s.value, m.value)).toBe(m.value)
  expect(wetting(0, mat).theta_pred).toBe(s.value)
  expect(wetting(1, mat).theta_pred).toBe(m.value)
  for (const bad of [-0.01, 1.01, Number.NaN]) {
    expect(() => wetting(bad, mat)).toThrow(PhysicsRangeError)
  }
  expect(() => wetting(2, mat)).toThrow(
    expect.objectContaining({ code: 4 }) as never,
  )
})

test("binderOnlyUsesBinderAngle", () => {
  const b = wettingBinder(mat)
  expect(b.theta_pred).toBe(mat.wetting.theta_binder_deg.value)
  expect(b.theta_lo).toBeLessThanOrEqual(b.theta_pred)
  expect(b.theta_hi).toBeGreaterThanOrEqual(b.theta_pred)
  expect(b.score).toBeCloseTo(Math.min(1, Math.max(0, (75 - 90) / 60)), 12)
})

test("cassieBaxterFractionInterior", () => {
  // cos = f(cos t + 1) - 1 ; t = 100, f = 0.5
  const c = 0.5 * (Math.cos((100 * Math.PI) / 180) + 1) - 1
  expect(cassieBaxterAngleDeg(100, 0.5)).toBeCloseTo(
    (Math.acos(c) * 180) / Math.PI,
    9,
  )
  expect(() => cassieBaxterAngleDeg(100, 1.1)).toThrow(PhysicsRangeError)
  expect(() => wenzelAngleDeg(100, 0.9)).toThrow(PhysicsRangeError)
})
