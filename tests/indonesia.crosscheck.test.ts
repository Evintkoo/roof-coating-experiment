import { expect, test } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { dailyGhiKwhM2, localDays } from "../src/core/indonesia/days"
import { siteCrossCheck } from "../src/node/indonesia"
import { readSiteYear } from "../src/node/power"
import { loadIndonesiaConfig, loadSites } from "../src/node/siteConfig"
import {
  indonesiaConfigCopy,
  repoRoot,
  requireWeatherCache,
  WEATHER_DIR,
  weatherSubset,
} from "./helpers"

// H2 (wording amended, ruling R10): NASA POWER (MERRA-2 / CERES reanalysis and satellite) against the free TMYx typical year of
// climate.onebuilding.org (ERA5 based, airport station location). Both are modelled products: this is a consistency check
// between two models, not a validation against ground observations. T_ghi_hard is the plan's 0.35; T_ghi is the working
// value frozen ONCE from the first real run (largest monthly |relative difference| 0.201, Makassar) and never edited.
const T_GHI_HARD = 0.35
const T_GHI = Number(
  readFileSync(join(repoRoot, "tests/fixtures/frozen_t_ghi.txt"), "utf8"),
)

requireWeatherCache()
const cdir = indonesiaConfigCopy(2015, 2024)
const sites = await loadSites(join(cdir, "sites.yaml"))
const cfg = await loadIndonesiaConfig(join(cdir, "indonesia.yaml"))

test("crossCheckAgainstTmyx", () => {
  expect(T_GHI).toBeLessThanOrEqual(T_GHI_HARD)
  let worst = 0
  let n = 0
  for (const s of sites) {
    const rows = siteCrossCheck(s, WEATHER_DIR, cfg)
    expect(rows.length).toBe(12)
    for (const r of rows) {
      n++
      worst = Math.max(worst, Math.abs(r.rel))
      expect(Math.abs(r.rel)).toBeLessThanOrEqual(T_GHI)
      // plausible magnitudes of a tropical monthly mean (kWh/m2/day): the check compares real numbers
      expect(r.nasa).toBeGreaterThan(2.5)
      expect(r.nasa).toBeLessThan(7)
    }
  }
  expect(n).toBe(60)
  console.log(
    `crosscheck: ${n} site-months, largest |relative difference| ${worst}`,
  )
  expect(worst).toBeGreaterThan(0.05) // the two products do differ: a check that always reads 0 would prove nothing
})

test("crossCheckCanFail", async () => {
  // the same files with one input edited: the TMYx irradiance of Jakarta scaled by 1.6 must exceed the hard threshold
  const wx = await weatherSubset(["jakarta"], 2015, 2024)
  const p = join(wx, "tmyx", "jakarta.epw")
  const lines = readFileSync(p, "utf8").split(/\r?\n/)
  const scaled = lines.map((l, i) => {
    if (i < 8 || l === "") return l
    const f = l.split(",")
    f[13] = String(Number(f[13]) * 1.6)
    return f.join(",")
  })
  writeFileSync(p, scaled.join("\n"))
  const { writeSums } = await import("../src/node/power")
  writeSums(wx)
  const rows = siteCrossCheck(sites[0] as (typeof sites)[0], wx, cfg)
  expect(Math.max(...rows.map((r) => Math.abs(r.rel)))).toBeGreaterThan(
    T_GHI_HARD,
  )
})

// H1 on one real site-year: 24 points per local day, no fill value, RH in range, and the GHI peak of clear days near solar noon.
test("realSiteYearIsCleanAndPeaksNearSolarNoon", () => {
  const s = sites.find((x) => x.id === "jakarta") as (typeof sites)[0]
  const days = localDays(
    [
      ...readSiteYear(WEATHER_DIR, "jakarta", 2022),
      ...readSiteYear(WEATHER_DIR, "jakarta", 2023),
    ],
    s.utc_offset_h,
  )
  expect(days.length).toBeGreaterThan(700)
  const ghi = days.map((d) => dailyGhiKwhM2(d.series))
  const sorted = [...ghi].sort((a, b) => a - b)
  const p80 = sorted[Math.floor(0.8 * (sorted.length - 1))] as number
  // local solar noon in civil hours: 12 + (15 x offset - lon) / 15
  const noon = 12 + (15 * s.utc_offset_h - s.lon) / 15
  let clear = 0
  let off = 0
  days.forEach((d, i) => {
    expect(d.series.g_w_m2.length).toBe(24)
    for (const v of d.series.rh_pct) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    for (const v of d.series.g_w_m2) expect(v).not.toBe(-999)
    if ((ghi[i] as number) <= p80) return
    clear++
    let k = 0
    d.series.g_w_m2.forEach((v, h) => {
      if (v > (d.series.g_w_m2[k] as number)) k = h
    })
    if (Math.abs(k + 0.5 - noon) > 3) off++
  })
  expect(clear).toBeGreaterThan(100)
  expect(off / clear).toBeLessThan(0.05)
})
