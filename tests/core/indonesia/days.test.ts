import { afterEach, expect, test } from "bun:test"
import fc from "fast-check"
import { DataError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import {
  dailyGhiKwhM2,
  type LocalDay,
  localDays,
  monthlyPrecipMm,
  pickDays,
  selectSiteDays,
  timeOfWetnessHours,
} from "../../../src/core/indonesia/days"
import type { HourRecord } from "../../../src/core/indonesia/series"

afterEach(() => setEventSink(null))

const HOUR = 3_600_000
/** Records every hour from startMs for n hours; g encodes the running hour index so a cut can be located. */
const records = (startMs: number, n: number): HourRecord[] =>
  Array.from({ length: n }, (_, i) => ({
    utc_ms: startMs + i * HOUR,
    g_w_m2: i,
    lw_down_w_m2: 400,
    t_air_c: 27,
    rh_pct: 80,
    wind_m_s: 1,
    precip_mm: 0.5,
  }))

test("localDayCutUsesSiteOffset", () => {
  // UTC 17:00 of day D at +7 is local 00:00 of D+1; the series starts at UTC 2023-01-01 00:00.
  const t0 = Date.UTC(2023, 0, 1)
  const days7 = localDays(records(t0, 96), 7)
  expect(days7.map((d) => d.date)).toEqual([
    "2023-01-02",
    "2023-01-03",
    "2023-01-04",
  ])
  expect(days7[0]?.series.g_w_m2[0]).toBe(17) // the UTC 17:00 record opens local 2023-01-02
  expect(days7[0]?.series.g_w_m2[23]).toBe(40)
  const days8 = localDays(records(t0, 96), 8)
  expect(days8[0]?.series.g_w_m2[0]).toBe(16) // +8 (WITA): UTC 16:00
  expect(days8.length).toBe(3)
  // a UTC cut would start on 2023-01-01 with record 0; the local cut never does
  expect(days7.some((d) => d.series.g_w_m2[0] === 0)).toBe(false)
  expect(days7[0]?.precip_mm).toBeCloseTo(12, 12)
})

test("boundaryPartialDaysDroppedInteriorHoleIsError", () => {
  const t0 = Date.UTC(2023, 0, 1)
  expect(localDays(records(t0, 24 * 7), 7).length).toBe(6)
  const hole = records(t0, 96)
  hole.splice(40, 1)
  let err: unknown
  try {
    localDays(hole, 7)
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(DataError)
  expect((err as DataError).code).toBe(5)
  const dup = records(t0, 96)
  dup.splice(40, 0, dup[40] as HourRecord)
  expect(() => localDays(dup, 7)).toThrow(DataError)
  expect(() => localDays(records(t0 + 1800, 96), 7)).toThrow(DataError)
  expect(localDays([], 7)).toEqual([])
})

test("leapDayHandled", () => {
  const leap = localDays(records(Date.UTC(2016, 1, 27), 24 * 6), 7)
  expect(leap.map((d) => d.date)).toEqual([
    "2016-02-28",
    "2016-02-29",
    "2016-03-01",
    "2016-03-02",
    "2016-03-03",
  ])
  expect(leap.every((d) => d.series.g_w_m2.length === 24)).toBe(true)
  const plain = localDays(records(Date.UTC(2015, 1, 27), 24 * 6), 7)
  expect(plain.map((d) => d.date)).toEqual([
    "2015-02-28",
    "2015-03-01",
    "2015-03-02",
    "2015-03-03",
    "2015-03-04",
  ])
  // a full leap year of hours gives 366 local days less the dropped first partial day (7 h in, local Jan 1)
  const year = localDays(records(Date.UTC(2016, 0, 1), 24 * 366), 7)
  expect(year.length).toBe(365)
  expect(year.some((d) => d.date === "2016-02-29")).toBe(true)
})

const CAL = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const monthOfDay = CAL.flatMap((n, m) => Array.from({ length: n }, () => m + 1))

/** Brute force of FR-1: percentiles by linear interpolation of the sorted values, bins by value, lower median. */
function bruteForce(
  ghi: number[],
  months: number[],
  precip: number[],
  wetMm: number,
) {
  const out: {
    season: string
    bin: string
    ranks: number[]
    bins: Map<string, number[]>
  }[] = []
  for (const season of ["wet", "dry"]) {
    const idx = ghi
      .map((_, i) => i)
      .filter(
        (i) =>
          (precip[(months[i] as number) - 1] as number) > wetMm ===
          (season === "wet"),
      )
    if (idx.length === 0) continue
    const sorted = idx.map((i) => ghi[i] as number).sort((a, b) => a - b)
    const pct = (q: number) => {
      const pos = q * (sorted.length - 1)
      const lo = Math.floor(pos)
      const hi = Math.min(lo + 1, sorted.length - 1)
      return (
        (sorted[lo] as number) +
        ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo)
      )
    }
    const p20 = pct(0.2)
    const p80 = pct(0.8)
    const bins = new Map<string, number[]>()
    bins.set(
      "hot",
      idx.filter((i) => (ghi[i] as number) > p80),
    )
    bins.set(
      "overcast",
      idx.filter((i) => (ghi[i] as number) < p20),
    )
    bins.set(
      "typical",
      idx.filter((i) => (ghi[i] as number) >= p20 && (ghi[i] as number) <= p80),
    )
    out.push({ season, bin: "", ranks: [], bins })
  }
  return out
}

test("pickDaysMatchesBruteForce", () => {
  const dailySums = fc.uniqueArray(
    fc.double({ min: 0, max: 9, noNaN: true, noDefaultInfinity: true }),
    {
      minLength: 365,
      maxLength: 365,
    },
  )
  const precip = fc.array(
    fc.double({ min: 0, max: 400, noNaN: true, noDefaultInfinity: true }),
    {
      minLength: 12,
      maxLength: 12,
    },
  )
  fc.assert(
    fc.property(dailySums, precip, (ghi, pr) => {
      const picks = pickDays(ghi, monthOfDay, pr, 150)
      const brute = bruteForce(ghi, monthOfDay, pr, 150)
      let expected = 0
      for (const b of brute) {
        for (const [bin, members] of b.bins) {
          if (members.length === 0) continue
          expected++
          const pick = picks.find((p) => p.season === b.season && p.bin === bin)
          expect(pick).toBeDefined()
          const sorted = [...members].sort(
            (x, y) => (ghi[x] as number) - (ghi[y] as number),
          )
          const rank = sorted.indexOf((pick as { index: number }).index)
          expect(rank).toBeGreaterThanOrEqual(0) // the pick is a member of the bin
          const median = Math.floor((sorted.length - 1) / 2)
          // the plan allows rank +-1; the brute force uses the same lower median, so exact agreement is demanded
          expect(rank).toBe(median)
        }
      }
      expect(picks.length).toBe(expected)
    }),
    { numRuns: 200 },
  )
})

test("pickDaysDropsSeasonWithoutMonth", () => {
  const ghi = Array.from({ length: 365 }, (_, i) => (i * 37) % 101)
  const allWet = new Array<number>(12).fill(300)
  const picks = pickDays(ghi, monthOfDay, allWet, 150)
  expect(picks.map((p) => `${p.season}/${p.bin}`)).toEqual([
    "wet/hot",
    "wet/typical",
    "wet/overcast",
  ])
  const picksDry = pickDays(
    ghi,
    monthOfDay,
    new Array<number>(12).fill(10),
    150,
  )
  expect(picksDry.every((p) => p.season === "dry")).toBe(true)
  expect(() => pickDays(ghi, monthOfDay.slice(1), allWet)).toThrow(DataError)
})

test("towCountsOnlyWetAndWarmHours", () => {
  const rh = Float64Array.from([81, 80, 79.9, 100, 95, 85, 0, 90])
  const t = Float64Array.from([25, 25, 25, 0, 0.1, -1, 25, 30])
  // counts: (81,25) yes; (80,25) no (not above); (79.9) no; (100, 0) no (T not above 0); (95, 0.1) yes; (85, -1) no; (0,25) no; (90,30) yes
  expect(timeOfWetnessHours(rh, t)).toBe(3)
  expect(timeOfWetnessHours(rh, t, 80, -5)).toBe(5)
  expect(() => timeOfWetnessHours(rh, new Float64Array(3))).toThrow(DataError)
})

const synthDays = (years: number): LocalDay[] => {
  const out: LocalDay[] = []
  for (let y = 2020; y < 2020 + years; y++) {
    for (let m = 0; m < 12; m++) {
      const n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      for (let d = 1; d <= n; d++) {
        const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
        const ghi = 1 + ((m * 31 + d * 7 + y) % 50) / 10 // 1.0 .. 5.9 kWh/m2
        const g = new Float64Array(24)
        g[12] = ghi * 1000
        out.push({
          date,
          series: {
            g_w_m2: g,
            t_air_c: new Float64Array(24),
            rh_pct: new Float64Array(24),
            wind_m_s: new Float64Array(24),
            lw_down_w_m2: new Float64Array(24),
          },
          precip_mm: m < 4 || m > 9 ? 10 : 1, // wet months: Jan-Apr, Nov, Dec (about 300 mm), others about 31 mm
        })
      }
    }
  }
  return out
}

test("monthlyPrecipIsMeanOfCompleteMonths", () => {
  const days = synthDays(3)
  days.splice(0, 1) // lose 2020-01-01: January 2020 is incomplete and left out of the mean
  const m = monthlyPrecipMm(days)
  expect(m.length).toBe(12)
  expect(m[0]).toBeCloseTo(310, 9)
  expect(m[1]).toBeCloseTo((10 * (29 + 28 + 28)) / 3, 9) // 2020 is a leap year
  expect(m[6]).toBeCloseTo(31, 9)
  expect(() => monthlyPrecipMm(days.slice(0, 20))).toThrow(DataError)
})

test("daysSelectedEventPerPick", () => {
  const seen: {
    event: string
    level: string
    fields: Record<string, unknown>
  }[] = []
  setEventSink((event, level, fields) => seen.push({ event, level, fields }))
  const days = synthDays(3)
  const sel = selectSiteDays("jakarta", days)
  expect(sel.length).toBe(6)
  const ev = seen.filter((e) => e.event === "indonesia.days.selected")
  expect(ev.length).toBe(6)
  expect(ev[0]?.level).toBe("info")
  expect(Object.keys(ev[0]?.fields ?? {}).sort()).toEqual([
    "bin",
    "daily_ghi_kwh_m2",
    "local_date",
    "season",
    "site",
  ])
  for (const [i, s] of sel.entries()) {
    expect(ev[i]?.fields.local_date).toBe(s.date)
    expect(s.ghi_kwh_m2).toBeCloseTo(
      dailyGhiKwhM2((days[s.index] as LocalDay).series),
      12,
    )
  }
  // the hot pick of a season is above its typical pick, which is above its overcast pick
  const wet = sel.filter((s) => s.season === "wet")
  expect(wet[0]?.ghi_kwh_m2).toBeGreaterThanOrEqual(
    wet[1]?.ghi_kwh_m2 as number,
  )
  expect(wet[1]?.ghi_kwh_m2).toBeGreaterThanOrEqual(
    wet[2]?.ghi_kwh_m2 as number,
  )
})
