import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"
import { parseMaterialRanges, parseWeather } from "../../src/core/config"
import { ConfigError } from "../../src/core/errors"
import { listFiles, repoRoot } from "../helpers"

const load = (name: string) =>
  parse(readFileSync(join(repoRoot, "configs", name), "utf8")) as Record<
    string,
    Record<string, unknown>
  >
const ranges = () => load("material_ranges.yaml")
const weather = () => load("weather_scenarios.yaml")

function keyOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError)
    return (e as ConfigError).key
  }
  throw new Error("expected ConfigError")
}

test("defaultFilesLoad", () => {
  expect(() => parseMaterialRanges(ranges())).not.toThrow()
  expect(() => parseWeather(weather())).not.toThrow()
})

test("emptySourceRejected", () => {
  const r = ranges()
  ;(r.cpvc as Record<string, unknown>).source = ""
  expect(keyOf(() => parseMaterialRanges(r))).toBe("cpvc.source")
  const w = weather()
  ;(w.wind_m_s as Record<string, unknown>).source = ""
  expect(keyOf(() => parseWeather(w))).toBe("wind_m_s.source")
})

test("yamlNoIsRejectedNotFalse", () => {
  const r = parse(
    readFileSync(
      join(repoRoot, "configs", "material_ranges.yaml"),
      "utf8",
    ).replace(/(cpvc:[\s\S]*?status: )scenario/, "$1no"),
  )
  expect(r.cpvc.status).toBe("no") // YAML 1.2: a string, never boolean false
  expect(keyOf(() => parseMaterialRanges(r))).toBe("cpvc.status")
})

test("minGeMaxRejected", () => {
  const r = ranges()
  const p = r.primer_dft_um as Record<string, unknown>
  p.min = 12
  expect(keyOf(() => parseMaterialRanges(r))).toBe("primer_dft_um.min")
})

test("unknownKeyRejected", () => {
  const r = ranges()
  r.bogus = {}
  expect(keyOf(() => parseMaterialRanges(r))).toBe("bogus")
})

test("unknownKeyErrorNamesTheKey", () => {
  const r = ranges()
  r.midcoat_pcv = r.midcoat_pvc as Record<string, unknown>
  expect(keyOf(() => parseMaterialRanges(r))).toBe("midcoat_pcv")
})

test("rootLevelErrorUsesRootKey", () => {
  expect(keyOf(() => parseMaterialRanges(5))).toBe("(root)")
  expect(keyOf(() => parseWeather([]))).toBe("(root)")
})

test("flatListRangeGivesNamedKeyError", () => {
  const r = ranges() as Record<string, unknown>
  r.midcoat_pvc = [0.1, 0.35]
  expect(keyOf(() => parseMaterialRanges(r))).toBe("midcoat_pvc")
})

test("nonPositiveRoofConstantRejected", () => {
  for (const k of [
    "c_substrate_j_m2k",
    "rho_c_coating_j_m3k",
    "r_total_m2k_w",
    "t_inside_c",
  ]) {
    for (const bad of [0, -1]) {
      const w = weather()
      const roof = w.roof as Record<string, Record<string, unknown>>
      ;(roof[k] as Record<string, unknown>).value = bad
      expect(keyOf(() => parseWeather(w))).toBe(`roof.${k}.value`)
    }
  }
})

test("nonAscendingLevelsRejected", () => {
  const w = weather()
  ;(w.t_air_c as Record<string, unknown>).values = [32, 28, 36]
  expect(keyOf(() => parseWeather(w))).toBe("t_air_c.values")
})

test("blueprintValuesExact", () => {
  const r = parseMaterialRanges(ranges())
  const mm = (x: { min: number; max: number }) => [x.min, x.max]
  expect(mm(r.primer_gptes_molfrac)).toEqual([0.2, 0.8])
  expect(mm(r.primer_dft_um)).toEqual([2, 12])
  expect(mm(r.midcoat_pvc)).toEqual([0.1, 0.35])
  expect(mm(r.midcoat_tio2_fraction)).toEqual([0.2, 0.8])
  expect(mm(r.midcoat_dft_um)).toEqual([100, 300])
  expect(mm(r.topcoat_mtes_molfrac)).toEqual([0.2, 0.8])
  expect(mm(r.topcoat_dft_um)).toEqual([3, 20])
  expect(mm(r.sol_gel_ph)).toEqual([3.5, 5.0])
  expect(mm(r.sol_gel_water_ratio)).toEqual([1, 5])
  expect(r.cpvc.value).toBe(0.45)
  expect(r.max_total_dft_um.value).toBe(332)
  const w = parseWeather(weather())
  expect(w.irradiance_w_m2.values).toEqual([600, 800, 1000])
  expect(w.t_air_c.values).toEqual([28, 32, 36])
  expect(w.wind_m_s.values).toEqual([1, 3, 6])
  expect([w.h_conv_a.value, w.h_conv_b.value]).toEqual([5.7, 3.8])
  expect(w.roof.c_substrate_j_m2k.value).toBeCloseTo(2730 * 893 * 0.0005, 1)
  expect(w.roof.rho_c_coating_j_m3k.value).toBe(1.8e6)
  expect(w.roof.r_total_m2k_w.value).toBe(0.3)
  expect(w.roof.t_inside_c.value).toBe(30)
})

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

test("noNodeImportsInCore", () => {
  const dir = join(repoRoot, "src", "core")
  const files = listFiles(dir).filter((f) => f.endsWith(".ts"))
  expect(files.length).toBeGreaterThan(0)
  for (const f of files) {
    const code = stripComments(readFileSync(join(dir, f), "utf8"))
    const importLines = code
      .split("\n")
      .filter((l) => /\bimport\b.*["']|from\s+["']|import\(/.test(l))
    for (const l of importLines) {
      expect(l, `${f}: ${l}`).not.toMatch(/["']node:/)
      expect(l, `${f}: ${l}`).not.toMatch(/["']bun(:|["'])/)
    }
    expect(code, f).not.toMatch(/\bprocess\./)
    expect(code, f).not.toMatch(/\bBun\./)
    expect(code, f).not.toMatch(/\bwindow\b/)
    expect(code, f).not.toMatch(/\bdocument\b/)
    expect(code, f).not.toMatch(/\bfetch\(/)
  }
})
