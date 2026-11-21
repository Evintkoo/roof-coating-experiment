import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigError, DataError } from "../../src/core/errors"
import { validateSubstrate } from "../../src/core/indonesia/series"
import { loadMaterials } from "../../src/node/config"
import { configureLogging, newRunId } from "../../src/node/logging"
import { loadIndonesiaConfig, loadSites } from "../../src/node/siteConfig"
import { repoRoot } from "../helpers"

const sitesPath = join(repoRoot, "configs", "sites.yaml")
const indoPath = join(repoRoot, "configs", "indonesia.yaml")

afterEach(() => configureLogging({ runId: "x", level: "error" }))

const tmpFile = (name: string, text: string) => {
  const p = join(mkdtempSync(join(tmpdir(), "spandek-site-")), name)
  writeFileSync(p, text)
  return p
}

test("loadsFiveSitesInReportOrder", async () => {
  const sites = await loadSites(sitesPath)
  expect(sites.map((s) => s.id)).toEqual([
    "jakarta",
    "surabaya",
    "medan",
    "makassar",
    "bandung",
  ])
  const by = Object.fromEntries(sites.map((s) => [s.id, s]))
  expect(by.jakarta).toMatchObject({ lat: -6.2, lon: 106.85, utc_offset_h: 7 })
  expect(by.surabaya).toMatchObject({
    lat: -7.25,
    lon: 112.75,
    utc_offset_h: 7,
  })
  expect(by.medan).toMatchObject({ lat: 3.59, lon: 98.67, utc_offset_h: 7 })
  expect(by.makassar).toMatchObject({
    lat: -5.15,
    lon: 119.43,
    utc_offset_h: 8,
  })
  expect(by.bandung).toMatchObject({ lat: -6.91, lon: 107.61, utc_offset_h: 7 })
  // elevation is the one the NASA POWER API returned (spike Q1)
  expect(by.jakarta?.elevation_m).toBeCloseTo(12.32, 2)
  expect(by.bandung?.elevation_m).toBeCloseTo(921.68, 2)
})

test("everySiteFieldCarriesSourceAndStatus", () => {
  const raw = readFileSync(sitesPath, "utf8")
  expect(raw.match(/status: /g)?.length).toBe(5 * 4)
  expect(raw.match(/source: /g)?.length).toBe(5 * 4)
})

test("loadsIndonesiaConfig", async () => {
  const c = await loadIndonesiaConfig(indoPath)
  expect(c.wet_month_mm).toBe(150)
  expect([c.first_year, c.last_year]).toEqual([2015, 2024])
  expect([c.loss_lo, c.loss_hi]).toEqual([0.14, 0.26])
  expect([c.tow_rh_above_pct, c.tow_t_above_c]).toEqual([80, 0])
})

test("loadEmitsConfigLoaded", async () => {
  const runDir = mkdtempSync(join(tmpdir(), "spandek-site-"))
  configureLogging({ runId: newRunId(), level: "info", runDir })
  await loadSites(sitesPath)
  await loadIndonesiaConfig(indoPath)
  const lines = readFileSync(join(runDir, "run.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  const kinds = lines
    .filter((l) => l.event === "config.loaded")
    .map((l) => l.kind)
  expect(kinds).toEqual(["sites", "indonesia"])
})

test("siteWithoutLatIsExit2", async () => {
  const text = readFileSync(sitesPath, "utf8")
  // drop the whole lat block of the first site (F4)
  const cut = text.replace(/ {4}lat:\n(?: {6}.*\n)+/, "")
  expect(cut).not.toBe(text)
  const p = tmpFile("sites.yaml", cut)
  await expect(loadSites(p)).rejects.toMatchObject({
    code: 2,
    phase: "config",
    key: "sites.jakarta.lat",
  })
})

test("invertedLossIsExit2", async () => {
  const text = readFileSync(indoPath, "utf8")
  const swapped = text
    .replace("value: 0.14", "value: 0.99")
    .replace("value: 0.26", "value: 0.14")
  const p = tmpFile("indonesia.yaml", swapped)
  await expect(loadIndonesiaConfig(p)).rejects.toMatchObject({
    code: 2,
    key: "ageing.loss_lo",
  })
})

test("yamlSyntaxAndMissingFile", async () => {
  await expect(
    loadSites(tmpFile("bad.yaml", "a: [1, 2\nb: {")),
  ).rejects.toBeInstanceOf(ConfigError)
  const missing = join(tmpdir(), "spandek-no-such-sites.yaml")
  await expect(loadSites(missing)).rejects.toBeInstanceOf(DataError)
  await expect(loadIndonesiaConfig(missing)).rejects.toBeInstanceOf(DataError)
})

test("shippedAluminiumSubstrateConstantPassesGuard", async () => {
  const m = await loadMaterials(join(repoRoot, "configs", "materials.yaml"))
  expect(() => validateSubstrate(m.substrate.c_j_m2k.value)).not.toThrow()
})

test("blockedRegisterHasTenEntriesAfterPlan4", () => {
  const text = readFileSync(join(repoRoot, "docs", "BLOCKED.md"), "utf8")
  const ids = [...text.matchAll(/^## (BLOCKED-\d+):/gm)].map((m) => m[1])
  expect(new Set(ids).size).toBe(ids.length)
  for (let n = 1; n <= 10; n++) expect(ids).toContain(`BLOCKED-${n}`)
  for (const n of [9, 10]) {
    const section = text.split(`## BLOCKED-${n}:`)[1]?.split(/\n## /)[0] ?? ""
    expect(section).toMatch(/- Reason: \S/)
    expect(section).toMatch(/- Owner: Evint/)
    expect(section).toMatch(/- Unblock condition: \S/)
  }
  // register stays in id order
  const nums = ids.map((i) => Number(i?.slice(8)))
  expect(nums).toEqual([...nums].sort((a, b) => a - b))
})
