import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigError, DataError } from "../../src/core/errors"
import {
  configSha256,
  loadMaterialRanges,
  loadWeather,
} from "../../src/node/config"
import { configureLogging, newRunId } from "../../src/node/logging"
import { repoRoot } from "../helpers"

const rangesPath = join(repoRoot, "configs", "material_ranges.yaml")
const weatherPath = join(repoRoot, "configs", "weather_scenarios.yaml")

afterEach(() => configureLogging({ runId: "x", level: "error" }))

test("loadsRealFilesAndEmitsConfigLoaded", async () => {
  const runDir = mkdtempSync(join(tmpdir(), "spandek-cfg-"))
  configureLogging({ runId: newRunId(), level: "info", runDir })
  const r = await loadMaterialRanges(rangesPath)
  const w = await loadWeather(weatherPath)
  expect(r.cpvc.value).toBe(0.45)
  expect(w.roof.t_inside_c.value).toBe(30)
  const lines = readFileSync(join(runDir, "events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  expect(lines.filter((l) => l.event === "config.loaded").length).toBe(2)
})

test("missingFileIsDataError", async () => {
  const p = join(tmpdir(), "spandek-does-not-exist.yaml")
  await expect(loadMaterialRanges(p)).rejects.toBeInstanceOf(DataError)
  await expect(loadWeather(p)).rejects.toBeInstanceOf(DataError)
  await expect(configSha256([p])).rejects.toBeInstanceOf(DataError)
})

test("yamlSyntaxErrorIsConfigError", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spandek-cfg-"))
  const p = join(dir, "bad.yaml")
  writeFileSync(p, "a: [1, 2\nb: {")
  await expect(loadWeather(p)).rejects.toBeInstanceOf(ConfigError)
})

test("schemaErrorSurfacesAsConfigError", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spandek-cfg-"))
  const p = join(dir, "x.yaml")
  writeFileSync(p, "midcoat_pvc: [0.1, 0.35]\n")
  await expect(loadMaterialRanges(p)).rejects.toMatchObject({ code: 2 })
})

test("configSha256IsStableAndOrderSensitive", async () => {
  const a = await configSha256([rangesPath, weatherPath])
  expect(a).toMatch(/^[0-9a-f]{64}$/)
  expect(await configSha256([rangesPath, weatherPath])).toBe(a)
  expect(await configSha256([weatherPath, rangesPath])).not.toBe(a)
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(readFileSync(rangesPath))
  hasher.update(readFileSync(weatherPath))
  expect(a).toBe(hasher.digest("hex"))
})
