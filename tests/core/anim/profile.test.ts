import { expect, test } from "bun:test"
import { conductionDrop } from "../../../src/core/anim/profile"

test("dropHasTwoTemperaturesH8", () => {
  const d = conductionDrop(330, 300, 0.5)
  expect(Object.keys(d).sort()).toEqual(["qWM2", "tInsideK", "tSurfaceK"])
  expect(d.tSurfaceK).toBe(330)
  expect(d.tInsideK).toBe(300)
})

test("dropFluxEqualsConductedTermH7", () => {
  // the model's conduction law (T_s - T_in) / R_total, same as the stepper's conducted term
  expect(conductionDrop(330, 300, 0.5).qWM2).toBe(60)
  expect(conductionDrop(290, 300, 0.5).qWM2).toBe(-20)
})

test("dropRefusesNonModelInputsF3", () => {
  expect(() => conductionDrop(Number.NaN, 300, 1)).toThrow()
  expect(() => conductionDrop(300, 300, 0)).toThrow()
})
