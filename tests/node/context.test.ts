import { expect, test } from "bun:test"
import { cpSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadContext } from "../../src/node/context"
import { repoRoot } from "../helpers"

const cfg = join(repoRoot, "configs")
const data = join(repoRoot, "data", "literature")

test("contextLoadsRealFiles", async () => {
  const c = await loadContext(cfg, data)
  expect(c.wlUm.length).toBe(221)
  expect(c.controls.c1_r_solar.value).toBe(0.9)
  expect(c.controls.c1_r_solar_aged.value).toBe(0.77)
  expect(c.ranges.cpvc.value).toBe(0.45)
  expect(c.mat.baso4.n.value).toBe(1.64)
  expect(c.baso4.k.every((k) => k === 0)).toBe(true)
  expect(c.baso4.n[0]).toBe(1.64)
  expect(c.tio2.wl_um.length).toBeGreaterThan(10)
  expect(c.g173.wl_um.length).toBeGreaterThan(1000)
  expect(c.weather.roof.t_inside_c.value).toBe(30)
})

test("tamperedDataIsDataError", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spandek-ctx-"))
  try {
    cpSync(data, dir, { recursive: true })
    await Bun.write(join(dir, "tio2_nk.csv"), "wl_um,n,k\n1,2,0\n")
    let code = 0
    try {
      await loadContext(cfg, dir)
    } catch (e) {
      code = (e as { code: number }).code
    }
    expect(code).toBe(5)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("missingControlsIsDataErrorAtContextLevel", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spandek-ctx-"))
  try {
    cpSync(cfg, dir, { recursive: true })
    rmSync(join(dir, "controls.yaml"))
    let code = 0
    try {
      await loadContext(dir, data)
    } catch (e) {
      code = (e as { code: number }).code
    }
    expect(code).toBe(5)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
