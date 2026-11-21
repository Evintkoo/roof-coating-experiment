import { expect, test } from "bun:test"
import { ConfigError, DataError } from "../../../src/core/errors"
import {
  type HourlySeries,
  parseIndonesiaConfig,
  parseSites,
  skyTempK,
  validateLossRange,
  validateSeries,
  validateSubstrate,
} from "../../../src/core/indonesia/series"

const day = (f: (h: number) => number) =>
  Float64Array.from({ length: 24 }, (_, h) => f(h))

const ok: HourlySeries = {
  g_w_m2: day((h) =>
    h >= 6 && h <= 18 ? 900 * Math.sin(((h - 6) * Math.PI) / 12) : 0,
  ),
  t_air_c: day((h) => 27 + 4 * Math.sin(((h - 9) * Math.PI) / 12)),
  rh_pct: day(() => 75),
  wind_m_s: day(() => 2),
  lw_down_w_m2: day(() => 420),
}

const withAt = (a: Float64Array, i: number, v: number) => {
  const c = Float64Array.from(a)
  c[i] = v
  return c
}

const sourced = (value: number, unit = "1") => ({
  value,
  unit,
  source: "test",
  status: "scenario",
})
const site = (extra: Record<string, unknown> = {}) => ({
  lat: sourced(-6.2, "deg"),
  lon: sourced(106.85, "deg"),
  utc_offset_h: sourced(7, "h"),
  elevation_m: sourced(12.32, "m"),
  ...extra,
})

test("validSeriesAccepted", () => {
  expect(() => validateSeries(ok, "jakarta")).not.toThrow()
})

test("fillValueRejected", () => {
  const bad = { ...ok, g_w_m2: withAt(ok.g_w_m2, 5, -999) }
  expect(() => validateSeries(bad, "jakarta")).toThrow(/g_w_m2/)
  try {
    validateSeries(bad, "jakarta")
  } catch (e) {
    expect(e).toBeInstanceOf(DataError)
    expect((e as DataError).code).toBe(5)
    expect((e as DataError).key).toBe("g_w_m2")
    expect((e as DataError).message).toMatch(/fill value/)
  }
})

test("fillValueInAnyColumnRejected", () => {
  for (const col of [
    "t_air_c",
    "rh_pct",
    "wind_m_s",
    "lw_down_w_m2",
  ] as const) {
    const bad = { ...ok, [col]: withAt(ok[col], 3, -999) }
    expect(() => validateSeries(bad, "medan")).toThrow(DataError)
    expect(() => validateSeries(bad, "medan")).toThrow(new RegExp(col))
  }
})

test("shortDayRejected", () => {
  const bad = { ...ok, t_air_c: ok.t_air_c.slice(0, 23) }
  expect(() => validateSeries(bad, "jakarta")).toThrow(/t_air_c/)
  expect(() => validateSeries(bad, "jakarta")).toThrow(DataError)
  const long = { ...ok, rh_pct: new Float64Array(25).fill(70) }
  expect(() => validateSeries(long, "jakarta")).toThrow(/rh_pct/)
})

test("rhOutOfRangeRejected", () => {
  const hi = { ...ok, rh_pct: withAt(ok.rh_pct, 7, 140) }
  expect(() => validateSeries(hi, "bandung")).toThrow(/rh_pct/)
  expect(() => validateSeries(hi, "bandung")).toThrow(DataError)
  const lo = { ...ok, rh_pct: withAt(ok.rh_pct, 7, -1) }
  expect(() => validateSeries(lo, "bandung")).toThrow(/rh_pct/)
  // the edges are legal
  const edge = { ...ok, rh_pct: withAt(withAt(ok.rh_pct, 0, 0), 1, 100) }
  expect(() => validateSeries(edge, "bandung")).not.toThrow()
})

test("nonFiniteAndNegativeRejected", () => {
  for (const v of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const bad = { ...ok, t_air_c: withAt(ok.t_air_c, 2, v) }
    expect(() => validateSeries(bad, "makassar")).toThrow(/t_air_c/)
  }
  const g = { ...ok, g_w_m2: withAt(ok.g_w_m2, 2, -0.5) }
  expect(() => validateSeries(g, "makassar")).toThrow(/g_w_m2/)
  const w = { ...ok, wind_m_s: withAt(ok.wind_m_s, 2, -0.1) }
  expect(() => validateSeries(w, "makassar")).toThrow(/wind_m_s/)
  const lw = { ...ok, lw_down_w_m2: withAt(ok.lw_down_w_m2, 2, 0) }
  expect(() => validateSeries(lw, "makassar")).toThrow(/lw_down_w_m2/)
})

test("errorNamesSiteAndHour", () => {
  const bad = { ...ok, rh_pct: withAt(ok.rh_pct, 11, 140) }
  try {
    validateSeries(bad, "surabaya")
    expect.unreachable()
  } catch (e) {
    expect((e as Error).message).toMatch(/surabaya/)
    expect((e as Error).message).toMatch(/hour 11/)
  }
})

test("skyTempFromLwMatchesHandValue", () => {
  // sigma = 5.670374419e-8: LW = sigma * 300^4 gives exactly 300 K
  expect(skyTempK(5.670374419e-8 * 300 ** 4)).toBeCloseTo(300, 9)
  // hand value for 420 W/m2: (420 / 5.670374419e-8)^0.25 = 293.35 K
  expect(skyTempK(420)).toBeCloseTo(293.35, 1)
  expect(() => skyTempK(0)).toThrow(DataError)
  expect(() => skyTempK(-999)).toThrow(DataError)
})

test("lossRangeInvertedRejected", () => {
  expect(() => validateLossRange(0.26, 0.14)).toThrow(ConfigError)
  expect(() => validateLossRange(0.26, 0.14)).toThrow(/loss_lo/)
  expect(() => validateLossRange(-0.01, 0.2)).toThrow(ConfigError)
  expect(() => validateLossRange(0.1, 1)).toThrow(ConfigError)
  expect(() => validateLossRange(Number.NaN, 0.2)).toThrow(ConfigError)
  expect(() => validateLossRange(0.14, 0.26)).not.toThrow()
  expect(() => validateLossRange(0.2, 0.2)).not.toThrow()
})

test("steelConstantRejected", () => {
  // 1540 J/(m2 K) is the steel figure of the blueprint; ConfigError key substrate.c_j_m2k
  expect(() => validateSubstrate(1540)).toThrow(ConfigError)
  try {
    validateSubstrate(1540)
  } catch (e) {
    expect((e as ConfigError).code).toBe(2)
    expect((e as ConfigError).key).toBe("substrate.c_j_m2k")
  }
})

test("anyWrongSubstrateConstantRejected", () => {
  // rho c_p t for 0.5 mm and 0.7 mm aluminium: 2730 * 893 * t
  const t05 = 2730 * 893 * 0.0005
  const t07 = 2730 * 893 * 0.0007
  expect(() => validateSubstrate(t05)).not.toThrow()
  expect(() => validateSubstrate(t07)).not.toThrow()
  // the shipped, rounded configs/materials.yaml value (1218.9) is accepted
  expect(() => validateSubstrate(1218.9)).not.toThrow()
  for (const bad of [
    t05 * 1.001,
    t05 * 0.999,
    t07 * 1.0005,
    1000,
    1400,
    0,
    -1218.9,
    Number.NaN,
  ]) {
    expect(() => validateSubstrate(bad)).toThrow(ConfigError)
  }
})

test("parseSitesKeepsOrderAndShape", () => {
  const sites = parseSites({
    sites: { jakarta: site(), surabaya: site(), medan: site() },
  })
  expect(sites.map((s) => s.id)).toEqual(["jakarta", "surabaya", "medan"])
  expect(sites[0]).toEqual({
    id: "jakarta",
    lat: -6.2,
    lon: 106.85,
    utc_offset_h: 7,
    elevation_m: 12.32,
  })
})

test("siteWithoutLatRejected", () => {
  const { lat: _lat, ...noLat } = site()
  try {
    parseSites({ sites: { atlantis: noLat } })
    expect.unreachable()
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError)
    expect((e as ConfigError).code).toBe(2)
    expect((e as ConfigError).key).toBe("sites.atlantis.lat")
  }
})

test("siteRangesRejected", () => {
  const lat = site({ lat: sourced(95, "deg") })
  expect(() => parseSites({ sites: { x: lat } })).toThrow(ConfigError)
  const lon = site({ lon: sourced(200, "deg") })
  expect(() => parseSites({ sites: { x: lon } })).toThrow(ConfigError)
  const off = site({ utc_offset_h: sourced(25, "h") })
  expect(() => parseSites({ sites: { x: off } })).toThrow(ConfigError)
  expect(() => parseSites({ sites: {} })).toThrow(ConfigError)
  expect(() => parseSites({ sites: { x: site({ extra: 1 }) } })).toThrow(
    ConfigError,
  )
})

const indo = (lo = 0.14, hi = 0.26) => ({
  scenario: { wet_month_mm: sourced(150, "mm") },
  years: { first: sourced(2015, "year"), last: sourced(2024, "year") },
  ageing: { loss_lo: sourced(lo), loss_hi: sourced(hi) },
  time_of_wetness: {
    rh_above_pct: sourced(80, "%"),
    t_above_c: sourced(0, "C"),
  },
})

test("parseIndonesiaConfigAcceptsValid", () => {
  const c = parseIndonesiaConfig(indo())
  expect(c.wet_month_mm).toBe(150)
  expect(c.first_year).toBe(2015)
  expect(c.last_year).toBe(2024)
  expect([c.loss_lo, c.loss_hi]).toEqual([0.14, 0.26])
  expect([c.tow_rh_above_pct, c.tow_t_above_c]).toEqual([80, 0])
})

test("invertedLossInConfigRejected", () => {
  try {
    parseIndonesiaConfig(indo(0.3, 0.1))
    expect.unreachable()
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError)
    expect((e as ConfigError).code).toBe(2)
    expect((e as ConfigError).key).toBe("ageing.loss_lo")
  }
})

test("invalidYearsRejected", () => {
  const bad = indo()
  bad.years = { first: sourced(2024, "year"), last: sourced(2015, "year") }
  expect(() => parseIndonesiaConfig(bad)).toThrow(ConfigError)
})
